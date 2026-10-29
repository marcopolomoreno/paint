import type { App } from "../app";
import { boundsOf, cloneCanvas, context2d, type Point } from "../geometry";
import type { PointerInfo } from "../view";
import { linePixels, type Tool } from "./tool";

/**
 * Lápis (pixels sem suavização) e borracha. Os dois carimbam quadrados ao
 * longo do traço. O lápis desenha no rascunho; a borracha apaga direto na
 * camada (no fundo pinta com a cor secundária, como no Paint; nas outras
 * camadas deixa transparente) e guarda uma cópia do início para o desfazer.
 */
export class PencilTool implements Tool {
  cursor = "crosshair";
  private last: Point | null = null;
  private points: Point[] = [];
  private before: HTMLCanvasElement | null = null;
  private target: CanvasRenderingContext2D | null = null;

  constructor(
    private app: App,
    private eraser: boolean,
  ) {
    if (eraser) this.cursor = "none";
  }

  private get size() {
    return this.app.opts.sizes[this.eraser ? "eraser" : "pencil"];
  }

  outline() {
    return this.eraser ? { size: this.size, round: false } : null;
  }

  down(p: PointerInfo) {
    const doc = this.app.doc;
    if (this.eraser) {
      this.before = cloneCanvas(doc.canvas);
      this.target = doc.ctx;
      this.target.save();
      if (doc.onBackground) this.target.fillStyle = this.app.secondary;
      else this.target.globalCompositeOperation = "destination-out";
    } else {
      this.target = this.app.view.scratchCtx;
      this.target.fillStyle = this.app.colorFor(p.button);
    }
    this.last = p;
    this.points = [p];
    this.stamp(p.x, p.y);
  }

  move(p: PointerInfo) {
    if (!this.last) return;
    for (const [x, y] of linePixels(this.last.x, this.last.y, p.x, p.y)) this.stamp(x, y);
    this.last = p;
    this.points.push(p);
  }

  up() {
    if (!this.last) return;
    const bounds = boundsOf(this.points, this.size + 2);
    if (this.eraser) {
      this.target!.restore();
      const doc = this.app.doc;
      const area = doc.clip(bounds);
      if (area) {
        doc.history.pushRegion(area, context2d(this.before!).getImageData(area.x, area.y, area.w, area.h));
        doc.changed();
      }
      this.before = null;
    } else {
      this.app.commitScratch(bounds);
    }
    this.last = null;
    this.target = null;
  }

  cancel() {
    if (this.eraser && this.before && this.target) {
      // Desfaz o que já foi apagado neste traço.
      this.target.restore();
      this.target.save();
      this.target.globalCompositeOperation = "copy";
      this.target.drawImage(this.before, 0, 0);
      this.target.restore();
      this.app.doc.changed();
    }
    this.before = null;
    this.target = null;
    this.last = null;
    this.app.view.clearScratch();
  }

  private stamp(x: number, y: number) {
    const s = this.size;
    const offset = Math.floor((s - 1) / 2);
    this.target!.fillRect(Math.floor(x) - offset, Math.floor(y) - offset, s, s);
    if (this.eraser) this.app.doc.onChange(false);
  }
}
