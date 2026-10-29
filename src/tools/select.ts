import type { App } from "../app";
import { centerOf, clamp, rectFromPoints, type Point, type Rect } from "../geometry";
import { dragAngle, resizeRotated, ROTATE, type Handle } from "../transform";
import type { PointerInfo } from "../view";
import type { Tool } from "./tool";

export type SelectMode = "rect" | "free";

type Drag =
  | { kind: "draw"; start: Point; points: Point[] }
  | { kind: "move"; start: Point; origin: Rect; copy: boolean; moved: boolean }
  | { kind: "resize"; handle: Handle; origin: Rect; start: Point }
  | { kind: "rotate"; start: Point; angle: number };

export class SelectTool implements Tool {
  cursor = "crosshair";
  private drag: Drag | null = null;

  constructor(private app: App) {}

  down(p: PointerInfo) {
    const sel = this.app.sel;
    if (sel.active && p.handle === ROTATE) {
      this.drag = { kind: "rotate", start: p, angle: sel.angle };
    } else if (sel.active && p.handle) {
      this.drag = { kind: "resize", handle: p.handle as Handle, origin: { ...sel.rect! }, start: p };
    } else if (sel.active && sel.contains(p)) {
      // Ctrl/Cmd (ou Option) + arrastar copia em vez de mover.
      this.drag = { kind: "move", start: p, origin: { ...sel.rect! }, copy: p.mod || p.alt, moved: false };
    } else {
      sel.drop();
      const start = this.clampToDoc(p);
      this.drag = { kind: "draw", start, points: [start] };
    }
  }

  move(p: PointerInfo) {
    const drag = this.drag;
    const sel = this.app.sel;
    if (!drag) return;
    if (drag.kind === "draw") {
      const q = this.clampToDoc(p);
      if (this.app.opts.selectMode === "free") {
        drag.points.push(q);
        sel.showDraft(drag.points);
      } else {
        drag.points = [drag.start, q];
        sel.showDraft(this.draftRect(drag.start, q));
      }
      this.app.status.showSize(...this.draftSize(drag));
    } else if (drag.kind === "move") {
      const dx = Math.round(p.x - drag.start.x);
      const dy = Math.round(p.y - drag.start.y);
      if (!drag.moved && dx === 0 && dy === 0) return;
      if (!drag.moved) {
        drag.moved = true;
        sel.lift(drag.copy);
      }
      sel.moveTo(drag.origin.x + dx, drag.origin.y + dy);
    } else if (drag.kind === "rotate") {
      sel.rotateTo(dragAngle(centerOf(sel.rect!), drag.start, p, drag.angle, p.shift));
    } else {
      sel.lift();
      sel.resizeTo(resizeRotated(drag.origin, sel.angle, drag.handle, drag.start, p, p.shift));
    }
  }

  up() {
    const drag = this.drag;
    this.drag = null;
    if (!drag || drag.kind !== "draw") return;
    const sel = this.app.sel;
    sel.showDraft(null);
    if (this.app.opts.selectMode === "free") {
      if (drag.points.length > 2) sel.set(drag.points);
    } else if (drag.points.length === 2) {
      const r = this.draftRect(drag.start, drag.points[1]);
      if (r.w >= 1 && r.h >= 1) sel.set(r);
    }
    this.app.status.update();
  }

  hover(p: PointerInfo) {
    const inside = this.app.sel.active && this.app.sel.contains(p);
    this.app.view.setCursor(inside ? "move" : "crosshair");
  }

  cancel() {
    if (this.drag?.kind === "draw") this.app.sel.showDraft(null);
    this.drag = null;
  }

  private clampToDoc(p: Point): Point {
    const doc = this.app.doc;
    return { x: clamp(Math.round(p.x), 0, doc.width), y: clamp(Math.round(p.y), 0, doc.height) };
  }

  private draftRect(a: Point, b: Point): Rect {
    return rectFromPoints(a, b);
  }

  private draftSize(drag: Extract<Drag, { kind: "draw" }>): [number, number] {
    if (drag.points.length < 2) return [0, 0];
    const xs = drag.points.map((q) => q.x);
    const ys = drag.points.map((q) => q.y);
    return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  }
}

