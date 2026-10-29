mod removebg;

use std::{
    fs,
    io::{Cursor, ErrorKind, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};

use image::{codecs::gif::GifEncoder, DynamicImage, ImageFormat, RgbaImage};
use tauri::{
    image::Image,
    ipc::{InvokeBody, Request, Response},
    AppHandle, Emitter, Manager, State,
};
use tauri_plugin_clipboard_manager::ClipboardExt;

/// Arquivos pedidos pelo sistema (Finder, "Abrir com", linha de comando)
/// que a interface ainda não abriu.
#[derive(Default)]
struct PendingFiles(Mutex<Vec<String>>);

const MAX_FILE_SIZE: u64 = 512 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Bytes crus entre a interface e o Rust: sem JSON, que multiplicaria o tamanho
// das imagens. O caminho e as dimensões vão nos cabeçalhos do `invoke`.
// ---------------------------------------------------------------------------

fn raw_body<'a>(request: &'a Request<'_>) -> Result<&'a [u8], String> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes),
        _ => Err("esperava dados binários".into()),
    }
}

fn header(request: &Request<'_>, name: &str) -> Result<String, String> {
    let value = request
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| format!("cabeçalho ausente: {name}"))?;
    // O caminho vem com encodeURIComponent, já que cabeçalhos só aceitam ASCII.
    percent_decode(value)
}

fn header_u32(request: &Request<'_>, name: &str) -> Result<u32, String> {
    header(request, name)?.parse().map_err(|_| format!("cabeçalho inválido: {name}"))
}

fn percent_decode(text: &str) -> Result<String, String> {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).map_err(|e| e.to_string())?;
            out.push(u8::from_str_radix(hex, 16).map_err(|e| e.to_string())?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|e| e.to_string())
}

/// Grava num arquivo temporário e renomeia, para que uma falha no meio da
/// gravação nunca destrua o arquivo original.
fn atomic_write(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".pincel-tmp");
    let tmp = PathBuf::from(tmp);
    let mut file = fs::File::create(&tmp)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    drop(file);
    fs::rename(&tmp, path).inspect_err(|_| {
        let _ = fs::remove_file(&tmp);
    })
}

/// Pixels RGBA precedidos de largura e altura (u32, little-endian).
fn rgba_response(width: u32, height: u32, rgba: &[u8]) -> Response {
    let mut out = Vec::with_capacity(8 + rgba.len());
    out.extend_from_slice(&width.to_le_bytes());
    out.extend_from_slice(&height.to_le_bytes());
    out.extend_from_slice(rgba);
    Response::new(out)
}

// ---------------------------------------------------------------------------
// Sessão: `session/session.json` guarda configurações e a lista de camadas;
// cada camada fica em `session/layers/<id>.png`.
// ---------------------------------------------------------------------------

fn session_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("session");
    fs::create_dir_all(dir.join("layers")).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn layer_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err("identificador de camada inválido".into());
    }
    Ok(session_dir(app)?.join("layers").join(format!("{id}.png")))
}

#[tauri::command]
async fn load_session(app: AppHandle) -> Result<Option<String>, String> {
    match fs::read_to_string(session_dir(&app)?.join("session.json")) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn save_session(app: AppHandle, json: String) -> Result<(), String> {
    atomic_write(&session_dir(&app)?.join("session.json"), json.as_bytes()).map_err(|e| e.to_string())
}

/// PNG de uma camada, recebido como bytes crus; o id vai no cabeçalho.
#[tauri::command]
async fn save_layer(app: AppHandle, request: Request<'_>) -> Result<(), String> {
    let path = layer_path(&app, &header(&request, "id")?)?;
    atomic_write(&path, raw_body(&request)?).map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_layer(app: AppHandle, id: String) -> Result<Response, String> {
    fs::read(layer_path(&app, &id)?).map(Response::new).map_err(|e| e.to_string())
}

/// Apaga arquivos de camadas que não fazem mais parte da sessão.
#[tauri::command]
async fn prune_layers(app: AppHandle, keep: Vec<String>) -> Result<(), String> {
    for entry in fs::read_dir(session_dir(&app)?.join("layers")).map_err(|e| e.to_string())?.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let id = name.strip_suffix(".png").unwrap_or("");
        if !keep.iter().any(|k| k == id) {
            let _ = fs::remove_file(entry.path());
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Arquivos de imagem.
// ---------------------------------------------------------------------------

#[tauri::command]
async fn read_file(path: String) -> Result<Response, String> {
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.is_dir() {
        return Err("O caminho é uma pasta, não um arquivo.".into());
    }
    if meta.len() > MAX_FILE_SIZE {
        return Err("O arquivo é grande demais para abrir.".into());
    }
    fs::read(&path).map(Response::new).map_err(|e| e.to_string())
}

/// Plano B para formatos que o navegador embutido não decodifica.
#[tauri::command]
async fn decode_image(path: String) -> Result<Response, String> {
    let img = image::ImageReader::open(&path)
        .map_err(|e| e.to_string())?
        .with_guessed_format()
        .map_err(|e| e.to_string())?
        .decode()
        .map_err(|_| "O arquivo não é uma imagem num formato suportado.".to_string())?
        .into_rgba8();
    Ok(rgba_response(img.width(), img.height(), img.as_raw()))
}

/// Grava bytes já codificados (PNG e JPEG saem do próprio canvas).
#[tauri::command]
async fn write_file(request: Request<'_>) -> Result<(), String> {
    let path = header(&request, "path")?;
    atomic_write(Path::new(&path), raw_body(&request)?).map_err(|e| e.to_string())
}

/// Codifica pixels RGBA em BMP ou GIF e grava.
#[tauri::command]
async fn write_encoded(request: Request<'_>) -> Result<(), String> {
    let path = header(&request, "path")?;
    let format = header(&request, "format")?;
    let width = header_u32(&request, "width")?;
    let height = header_u32(&request, "height")?;
    let rgba = RgbaImage::from_raw(width, height, raw_body(&request)?.to_vec())
        .ok_or("tamanho de imagem inconsistente")?;

    let mut bytes = Vec::new();
    match format.as_str() {
        // BMP sem transparência, que é o que os outros programas esperam.
        "bmp" => DynamicImage::ImageRgba8(rgba)
            .to_rgb8()
            .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Bmp)
            .map_err(|e| e.to_string())?,
        "gif" => {
            let mut encoder = GifEncoder::new_with_speed(&mut bytes, 10);
            encoder
                .encode(rgba.as_raw(), width, height, image::ExtendedColorType::Rgba8)
                .map_err(|e| e.to_string())?;
        }
        other => return Err(format!("formato desconhecido: {other}")),
    }
    atomic_write(Path::new(&path), &bytes).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Área de transferência com imagens (o webview só lida bem com texto).
// Comandos síncronos rodam na thread principal: no Windows a área de
// transferência é aberta por thread, e duas operações em threads diferentes
// falham com "o thread não tem uma área de transferência aberta" (erro 1418).
// ---------------------------------------------------------------------------

/// Resposta vazia quando a área de transferência não tem imagem.
#[tauri::command]
fn clipboard_read_image(app: AppHandle) -> Response {
    match app.clipboard().read_image() {
        Ok(img) => rgba_response(img.width(), img.height(), img.rgba()),
        Err(_) => Response::new(Vec::new()),
    }
}

#[tauri::command]
fn clipboard_write_image(app: AppHandle, request: Request<'_>) -> Result<(), String> {
    let width = header_u32(&request, "width")?;
    let height = header_u32(&request, "height")?;
    let rgba = raw_body(&request)?;
    if rgba.len() != (width as usize) * (height as usize) * 4 {
        return Err("tamanho de imagem inconsistente".into());
    }
    app.clipboard()
        .write_image(&Image::new(rgba, width, height))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn clipboard_read_text(app: AppHandle) -> Option<String> {
    app.clipboard().read_text().ok()
}

#[tauri::command]
fn clipboard_write_text(app: AppHandle, text: String) -> Result<(), String> {
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}

/// Máscara de "remover fundo" (um byte por pixel) para pixels RGBA.
#[tauri::command]
async fn remove_background(request: Request<'_>) -> Result<Response, String> {
    let width = header_u32(&request, "width")?;
    let height = header_u32(&request, "height")?;
    let rgba = RgbaImage::from_raw(width, height, raw_body(&request)?.to_vec())
        .ok_or("tamanho de imagem inconsistente")?;
    removebg::mask(rgba).map(Response::new)
}

// ---------------------------------------------------------------------------
// Arquivos pedidos pelo sistema.
// ---------------------------------------------------------------------------

#[tauri::command]
fn take_pending_files(pending: State<PendingFiles>) -> Vec<String> {
    std::mem::take(&mut *pending.0.lock().unwrap())
}

#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

/// Caminhos de arquivo passados na linha de comando (ex.: dois cliques num .png no Windows).
fn paths_from_args(args: impl IntoIterator<Item = String>, cwd: &Path) -> Vec<String> {
    args.into_iter()
        .skip(1)
        .filter(|arg| !arg.starts_with('-'))
        .map(|arg| cwd.join(arg).to_string_lossy().into_owned())
        .collect()
}

/// Entrega arquivos à interface, que os busca com `take_pending_files`.
/// O evento pode chegar antes de a interface carregar; por isso a fila.
fn queue_files(app: &AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    app.state::<PendingFiles>().0.lock().unwrap().extend(paths);
    let _ = app.emit("open-files", ());
}

pub fn run() {
    let cwd = std::env::current_dir().unwrap_or_default();
    let from_args = paths_from_args(std::env::args(), &cwd);

    let app = tauri::Builder::default()
        // Precisa ser o primeiro plugin. Abrir o app de novo (ou uma imagem
        // pelo Explorer) manda os arquivos para a janela que já está aberta.
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            queue_files(app, paths_from_args(args, Path::new(&cwd)));
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(PendingFiles(Mutex::new(from_args)))
        .invoke_handler(tauri::generate_handler![
            read_file,
            decode_image,
            write_file,
            write_encoded,
            clipboard_read_image,
            clipboard_write_image,
            clipboard_read_text,
            clipboard_write_text,
            remove_background,
            load_session,
            save_session,
            save_layer,
            load_layer,
            prune_layers,
            take_pending_files,
            quit,
        ])
        .build(tauri::generate_context!())
        .expect("falha ao iniciar o aplicativo");

    app.run(|_app, _event| {
        // No macOS, arquivos abertos pelo Finder chegam por este evento,
        // inclusive com o app já aberto.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = _event {
            let paths = urls
                .into_iter()
                .filter_map(|url| url.to_file_path().ok())
                .map(|path| path.to_string_lossy().into_owned())
                .collect();
            queue_files(_app, paths);
        }
    });
}
