import { invoke } from "@tauri-apps/api/core";

/** Pixels RGBA vindos do Rust: largura e altura (u32 LE) seguidas dos bytes. */
function parseRgba(buffer: ArrayBuffer): ImageData | null {
  if (buffer.byteLength < 8) return null;
  const view = new DataView(buffer);
  const width = view.getUint32(0, true);
  const height = view.getUint32(4, true);
  if (!width || !height) return null;
  return new ImageData(new Uint8ClampedArray(buffer, 8, width * height * 4), width, height);
}

const bytesOf = (image: ImageData) => new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength);

const sizeHeaders = (image: ImageData) => ({ width: String(image.width), height: String(image.height) });

/** Operações na área de transferência, uma de cada vez (colar logo depois de copiar espera a cópia). */
let clipboardQueue: Promise<unknown> = Promise.resolve();
function clipboard<T>(task: () => Promise<T>): Promise<T> {
  const result = clipboardQueue.then(task, task);
  clipboardQueue = result.catch(() => {});
  return result;
}

/**
 * Comandos implementados em `src-tauri/src/lib.rs`. Imagens trafegam como
 * bytes crus; o caminho vai num cabeçalho (com encodeURIComponent, pois
 * cabeçalhos só aceitam ASCII).
 */
export const backend = {
  readFile: (path: string) => invoke<ArrayBuffer>("read_file", { path }),
  decodeImage: async (path: string) => parseRgba(await invoke<ArrayBuffer>("decode_image", { path })),
  writeFile: (path: string, bytes: Uint8Array) =>
    invoke<void>("write_file", bytes, { headers: { path: encodeURIComponent(path) } }),
  writeEncoded: (path: string, format: "bmp" | "gif", image: ImageData) =>
    invoke<void>("write_encoded", bytesOf(image), {
      headers: { path: encodeURIComponent(path), format, ...sizeHeaders(image) },
    }),
  clipboardReadImage: () => clipboard(async () => parseRgba(await invoke<ArrayBuffer>("clipboard_read_image"))),
  clipboardWriteImage: (image: ImageData) =>
    clipboard(() => invoke<void>("clipboard_write_image", bytesOf(image), { headers: sizeHeaders(image) })),
  clipboardReadText: () => clipboard(() => invoke<string | null>("clipboard_read_text")),
  clipboardWriteText: (text: string) => clipboard(() => invoke<void>("clipboard_write_text", { text })),
  /** Máscara do "remover fundo": um byte por pixel (255 = objeto, 0 = fundo). */
  removeBackground: async (image: ImageData) =>
    new Uint8Array(await invoke<ArrayBuffer>("remove_background", bytesOf(image), { headers: sizeHeaders(image) })),
  loadSession: () => invoke<string | null>("load_session"),
  saveSession: (json: string) => invoke<void>("save_session", { json }),
  saveLayer: (id: string, png: Uint8Array) => invoke<void>("save_layer", png, { headers: { id } }),
  loadLayer: (id: string) => invoke<ArrayBuffer>("load_layer", { id }),
  pruneLayers: (keep: string[]) => invoke<void>("prune_layers", { keep }),
  takePendingFiles: () => invoke<string[]>("take_pending_files"),
  quit: () => invoke<void>("quit"),
  /** macOS: pedidos de encerrar do sistema (Dock, logout) passam a chegar como "quit-requested". */
  watchQuitRequests: () => invoke<void>("watch_quit_requests"),
  replyToQuit: (quit: boolean) => invoke<void>("reply_to_quit", { quit }),
};
