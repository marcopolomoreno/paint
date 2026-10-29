import type { App } from "../app";
import { parseHex, type Rect } from "../geometry";
import type { PointerInfo } from "../view";
import type { Tool } from "./tool";

/**
 * Preenche a área contínua da mesma cor (por linhas, com pilha).
 * Devolve o retângulo alterado ou null se nada mudou.
 */
export function floodFill(img: ImageData, sx: number, sy: number, rgba: number): Rect | null {
  const { width, height } = img;
  const px = new Uint32Array(img.data.buffer, img.data.byteOffset, width * height);
  const target = px[sy * width + sx];
  if (target === rgba) return null;
  let minX = sx;
  let maxX = sx;
  let minY = sy;
  let maxY = sy;
  const stack = [sx, sy];
  while (stack.length) {
    const y = stack.pop()!;
    let x = stack.pop()!;
    const row = y * width;
    if (px[row + x] !== target) continue;
    while (x > 0 && px[row + x - 1] === target) x--;
    let spanAbove = false;
    let spanBelow = false;
    const start = x;
    for (; x < width && px[row + x] === target; x++) {
      px[row + x] = rgba;
      if (y > 0) {
        const above = px[row - width + x] === target;
        if (above && !spanAbove) stack.push(x, y - 1);
        spanAbove = above;
      }
      if (y < height - 1) {
        const below = px[row + width + x] === target;
        if (below && !spanBelow) stack.push(x, y + 1);
        spanBelow = below;
      }
    }
    minX = Math.min(minX, start);
    maxX = Math.max(maxX, x - 1);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Cor "#rrggbb" como um pixel de 32 bits na ordem de memória do ImageData. */
export function packColor(hex: string): number {
  const bytes = new Uint8ClampedArray([...parseHex(hex), 255]);
  return new Uint32Array(bytes.buffer)[0];
}

export class FillTool implements Tool {
  cursor = "crosshair";

  constructor(private app: App) {}

  down(p: PointerInfo) {
    const doc = this.app.doc;
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) return;
    const img = doc.ctx.getImageData(0, 0, doc.width, doc.height);
    const changed = floodFill(img, x, y, packColor(this.app.colorFor(p.button)));
    if (!changed) return;
    doc.edit(changed, (ctx, area) => ctx.putImageData(img, 0, 0, area.x, area.y, area.w, area.h));
  }

  move() {}
  up() {}
}

export class PickerTool implements Tool {
  cursor = "crosshair";

  constructor(private app: App) {}

  down(p: PointerInfo) {
    this.pick(p);
  }

  move(p: PointerInfo) {
    this.pick(p);
  }

  /** Como no Paint, depois de pegar a cor volta para a ferramenta anterior. */
  up() {
    this.app.restorePreviousTool();
  }

  private pick(p: PointerInfo) {
    const doc = this.app.doc;
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) return;
    const [r, g, b, a] = doc.compositePixel(x, y);
    // Pixel transparente conta como branco, que é como ele aparece ao salvar.
    const mix = (c: number) => Math.round((c * a + 255 * (255 - a)) / 255);
    const hex = "#" + [mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, "0")).join("");
    this.app.setColor(p.button === 2 ? 2 : 1, hex);
  }
}
