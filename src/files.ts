import { open, save } from "@tauri-apps/plugin-dialog";
import { backend } from "./backend";
import { context2d, createCanvas } from "./geometry";
import { canvasFromImageData, flatten } from "./imageops";
import { MAX_SIDE } from "./platform";

export type ImageFormat = "png" | "jpeg" | "bmp" | "gif";

const FORMATS: { format: ImageFormat; name: string; extensions: string[] }[] = [
  { format: "png", name: "PNG", extensions: ["png"] },
  { format: "jpeg", name: "JPEG", extensions: ["jpg", "jpeg", "jpe", "jfif"] },
  { format: "bmp", name: "Bitmap (BMP)", extensions: ["bmp", "dib"] },
  { format: "gif", name: "GIF", extensions: ["gif"] },
];

const OPEN_EXTENSIONS = [...FORMATS.flatMap((f) => f.extensions), "webp", "tif", "tiff", "ico"];

export const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

export function formatOf(path: string): ImageFormat | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return FORMATS.find((f) => f.extensions.includes(ext))?.format ?? null;
}

export const isImagePath = (path: string) => OPEN_EXTENSIONS.includes(path.split(".").pop()?.toLowerCase() ?? "");

export async function askOpenPath(): Promise<string | null> {
  const result = await open({
    multiple: false,
    directory: false,
    filters: [
      { name: "Imagens", extensions: OPEN_EXTENSIONS },
      { name: "Todos os arquivos", extensions: ["*"] },
    ],
  });
  return typeof result === "string" ? result : null;
}

export async function askSavePath(currentPath: string | null): Promise<string | null> {
  const current = currentPath ? formatOf(currentPath) : null;
  // O formato atual vem primeiro na lista de tipos.
  const ordered = [...FORMATS].sort((a, b) => Number(b.format === current) - Number(a.format === current));
  const path = await save({
    defaultPath: currentPath ?? "Sem título.png",
    filters: ordered.map((f) => ({ name: f.name, extensions: f.extensions })),
  });
  if (!path) return null;
  return formatOf(path) ? path : `${path}.png`;
}

/** Decodifica pelo webview; se ele não entender o formato, pelo Rust. */
export async function loadImage(path: string): Promise<HTMLCanvasElement> {
  const bytes = await backend.readFile(path);
  let canvas: HTMLCanvasElement | null = null;
  try {
    canvas = await decodeInWebview(new Blob([bytes]));
  } catch {
    const rgba = await backend.decodeImage(path);
    if (rgba) canvas = canvasFromImageData(rgba);
  }
  if (!canvas) throw new Error("O arquivo não é uma imagem num formato suportado.");
  if (canvas.width > MAX_SIDE || canvas.height > MAX_SIDE) {
    throw new Error(`A imagem é grande demais (${canvas.width} × ${canvas.height}). O limite é ${MAX_SIDE} pixels de lado.`);
  }
  return canvas;
}

export async function decodeInWebview(blob: Blob): Promise<HTMLCanvasElement> {
  let source: CanvasImageSource;
  let width: number;
  let height: number;
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    [source, width, height] = [bitmap, bitmap.width, bitmap.height];
  } else {
    // Safari 14 (macOS 11) não tem createImageBitmap.
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      [source, width, height] = [img, img.naturalWidth, img.naturalHeight];
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const canvas = createCanvas(width, height);
  context2d(canvas).drawImage(source, 0, 0);
  if ("close" in source) source.close();
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Falha ao codificar a imagem."))), type, quality),
  );
}

export async function saveImage(path: string, canvas: HTMLCanvasElement) {
  const format = formatOf(path) ?? "png";
  if (format === "png" || format === "jpeg") {
    const source = format === "jpeg" ? flatten(canvas) : canvas;
    const blob = await toBlob(source, `image/${format}`, format === "jpeg" ? 0.92 : undefined);
    await backend.writeFile(path, new Uint8Array(await blob.arrayBuffer()));
  } else {
    const source = format === "bmp" ? flatten(canvas) : canvas;
    const img = context2d(source).getImageData(0, 0, source.width, source.height);
    await backend.writeEncoded(path, format, img);
  }
}
