import type { App } from "../app";
import { boundsOf, type Point } from "../geometry";
import type { PointerInfo } from "../view";
import { linePixels, type Tool } from "./tool";

/**
 * Lápis (pixels sem suavização) e borracha (que pinta com a cor secundária,
 * como no Paint). Os dois carimbam quadrados ao longo do traço.
 */
export class PencilTool implements Tool {
  cursor = "crosshair";
  private last: Point | null = null;
  private points: Point[] = [];

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
    const ctx = this.app.view.scratchCtx;
    ctx.fillStyle = this.eraser ? this.app.secondary : this.app.colorFor(p.button);
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
    this.app.commitScratch(boundsOf(this.points, this.size + 2));
    this.last = null;
  }

  cancel() {
    this.last = null;
    this.app.view.clearScratch();
  }

  private stamp(x: number, y: number) {
    const s = this.size;
    const offset = Math.floor((s - 1) / 2);
    this.app.view.scratchCtx.fillRect(Math.floor(x) - offset, Math.floor(y) - offset, s, s);
  }
}
