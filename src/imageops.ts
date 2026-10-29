import { context2d, createCanvas } from "./geometry";

/** Gira em múltiplos de 90° no sentido horário. */
export function rotate(src: HTMLCanvasElement, quarterTurns: 1 | 2 | 3): HTMLCanvasElement {
  const swap = quarterTurns % 2 === 1;
  const out = createCanvas(swap ? src.height : src.width, swap ? src.width : src.height);
  const ctx = context2d(out);
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((quarterTurns * Math.PI) / 2);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

export function flip(src: HTMLCanvasElement, horizontal: boolean): HTMLCanvasElement {
  const out = createCanvas(src.width, src.height);
  const ctx = context2d(out);
  if (horizontal) ctx.setTransform(-1, 0, 0, 1, src.width, 0);
  else ctx.setTransform(1, 0, 0, -1, 0, src.height);
  ctx.drawImage(src, 0, 0);
  return out;
}

/** Redimensiona com boa qualidade; reduções grandes são feitas pela metade, em etapas. */
export function resample(src: HTMLCanvasElement, width: number, height: number): HTMLCanvasElement {
  let current = src;
  while (current.width / 2 >= width && current.height / 2 >= height) {
    const half = createCanvas(Math.ceil(current.width / 2), Math.ceil(current.height / 2));
    const ctx = context2d(half);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(current, 0, 0, half.width, half.height);
    current = half;
  }
  const out = createCanvas(width, height);
  const ctx = context2d(out);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(current, 0, 0, width, height);
  return out;
}

/**
 * Inclina em graus (horizontal: desliza as linhas; vertical: as colunas).
 * A área nova é preenchida com `background` (ou fica transparente).
 */
export function skew(src: HTMLCanvasElement, degH: number, degV: number, background: string | null): HTMLCanvasElement {
  if (!degH && !degV) return src;
  const tx = Math.tan((degH * Math.PI) / 180);
  const ty = Math.tan((degV * Math.PI) / 180);
  const { width: w, height: h } = src;
  const corners = [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ].map(([x, y]) => [x + tx * y, ty * x + y]);
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const out = createCanvas(Math.ceil(Math.max(...xs) - minX), Math.ceil(Math.max(...ys) - minY));
  const ctx = context2d(out);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, out.width, out.height);
  }
  ctx.imageSmoothingQuality = "high";
  ctx.setTransform(1, ty, tx, 1, -minX, -minY);
  ctx.drawImage(src, 0, 0);
  return out;
}

export function invertColors(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = createCanvas(src.width, src.height);
  const ctx = context2d(out);
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255 - d[i];
    d[i + 1] = 255 - d[i + 1];
    d[i + 2] = 255 - d[i + 2];
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/** Nova tela de desenho com o conteúdo antigo no canto superior esquerdo. */
export function resizeCanvas(
  src: HTMLCanvasElement,
  width: number,
  height: number,
  background: string | null,
): HTMLCanvasElement {
  const out = createCanvas(width, height);
  const ctx = context2d(out);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    ctx.clearRect(0, 0, Math.min(width, src.width), Math.min(height, src.height));
  }
  ctx.drawImage(src, 0, 0);
  return out;
}

/** Cópia sem transparência (sobre branco), para JPEG e BMP. */
export function flatten(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = createCanvas(src.width, src.height);
  const ctx = context2d(out);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(src, 0, 0);
  return out;
}

export function canvasFromImageData(img: ImageData): HTMLCanvasElement {
  const out = createCanvas(img.width, img.height);
  context2d(out).putImageData(img, 0, 0);
  return out;
}
