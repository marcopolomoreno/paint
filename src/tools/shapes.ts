import type { App } from "../app";
import {
  boundsOf,
  centerOf,
  distanceToSegment,
  rectFromPoints,
  rotatedCorners,
  type Point,
  type Rect,
} from "../geometry";
import { dragAngle, resizeRotated, ROTATE, TransformBox, unrotate, type Handle } from "../transform";
import type { PointerInfo } from "../view";
import type { Tool } from "./tool";

export type ShapeKind =
  | "line"
  | "arrow"
  | "rect"
  | "roundrect"
  | "ellipse"
  | "triangle"
  | "righttri"
  | "diamond"
  | "pentagon"
  | "hexagon"
  | "star"
  | "heart";

export const SHAPES: { id: ShapeKind; label: string }[] = [
  { id: "line", label: "Linha" },
  { id: "arrow", label: "Seta" },
  { id: "rect", label: "Retângulo" },
  { id: "roundrect", label: "Retângulo arredondado" },
  { id: "ellipse", label: "Elipse" },
  { id: "triangle", label: "Triângulo" },
  { id: "righttri", label: "Triângulo retângulo" },
  { id: "diamond", label: "Losango" },
  { id: "pentagon", label: "Pentágono" },
  { id: "hexagon", label: "Hexágono" },
  { id: "star", label: "Estrela" },
  { id: "heart", label: "Coração" },
];

/** O que o canvas e o gerador de ícones SVG têm em comum. */
interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
  closePath(): void;
}

type Unit = [number, number][];

function regular(sides: number, inner?: number): Unit {
  const points: Unit = [];
  const count = inner ? sides * 2 : sides;
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / count;
    const r = inner && i % 2 ? inner : 1;
    points.push([Math.cos(angle) * r, Math.sin(angle) * r]);
  }
  return points;
}

const POLYGONS: Partial<Record<ShapeKind, Unit>> = {
  triangle: [
    [0.5, 0],
    [1, 1],
    [0, 1],
  ],
  righttri: [
    [0, 0],
    [1, 1],
    [0, 1],
  ],
  diamond: [
    [0.5, 0],
    [1, 0.5],
    [0.5, 1],
    [0, 0.5],
  ],
  pentagon: regular(5),
  hexagon: regular(6).map(([x, y]) => [y, x]),
  star: regular(5, 0.4),
};

/** Ajusta os pontos para ocuparem exatamente o retângulo. */
function fitPolygon(sink: PathSink, unit: Unit, r: Rect) {
  const xs = unit.map((p) => p[0]);
  const ys = unit.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const sx = r.w / (Math.max(...xs) - minX || 1);
  const sy = r.h / (Math.max(...ys) - minY || 1);
  unit.forEach(([x, y], i) => {
    const px = r.x + (x - minX) * sx;
    const py = r.y + (y - minY) * sy;
    if (i === 0) sink.moveTo(px, py);
    else sink.lineTo(px, py);
  });
  sink.closePath();
}

function ellipse(sink: PathSink, r: Rect) {
  const k = 0.5522848;
  const rx = r.w / 2;
  const ry = r.h / 2;
  const cx = r.x + rx;
  const cy = r.y + ry;
  sink.moveTo(cx + rx, cy);
  sink.bezierCurveTo(cx + rx, cy + ry * k, cx + rx * k, cy + ry, cx, cy + ry);
  sink.bezierCurveTo(cx - rx * k, cy + ry, cx - rx, cy + ry * k, cx - rx, cy);
  sink.bezierCurveTo(cx - rx, cy - ry * k, cx - rx * k, cy - ry, cx, cy - ry);
  sink.bezierCurveTo(cx + rx * k, cy - ry, cx + rx, cy - ry * k, cx + rx, cy);
  sink.closePath();
}

function roundRect(sink: PathSink, r: Rect) {
  const rad = Math.min(r.w, r.h) * 0.2;
  const k = rad * (1 - 0.5522848);
  const { x, y, w, h } = r;
  sink.moveTo(x + rad, y);
  sink.lineTo(x + w - rad, y);
  sink.bezierCurveTo(x + w - k, y, x + w, y + k, x + w, y + rad);
  sink.lineTo(x + w, y + h - rad);
  sink.bezierCurveTo(x + w, y + h - k, x + w - k, y + h, x + w - rad, y + h);
  sink.lineTo(x + rad, y + h);
  sink.bezierCurveTo(x + k, y + h, x, y + h - k, x, y + h - rad);
  sink.lineTo(x, y + rad);
  sink.bezierCurveTo(x, y + k, x + k, y, x + rad, y);
  sink.closePath();
}

function heart(sink: PathSink, r: Rect) {
  const X = (u: number) => r.x + u * r.w;
  const Y = (v: number) => r.y + v * r.h;
  sink.moveTo(X(0.5), Y(1));
  sink.bezierCurveTo(X(0.2), Y(0.75), X(0), Y(0.52), X(0), Y(0.3));
  sink.bezierCurveTo(X(0), Y(0.12), X(0.14), Y(0), X(0.29), Y(0));
  sink.bezierCurveTo(X(0.41), Y(0), X(0.5), Y(0.09), X(0.5), Y(0.2));
  sink.bezierCurveTo(X(0.5), Y(0.09), X(0.59), Y(0), X(0.71), Y(0));
  sink.bezierCurveTo(X(0.86), Y(0), X(1), Y(0.12), X(1), Y(0.3));
  sink.bezierCurveTo(X(1), Y(0.52), X(0.8), Y(0.75), X(0.5), Y(1));
  sink.closePath();
}

/** Ponta da seta em `b`, vinda de `a`. */
function arrowHead(sink: PathSink, a: Point, b: Point, length: number) {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const spread = Math.PI / 7;
  sink.moveTo(b.x, b.y);
  sink.lineTo(b.x - length * Math.cos(angle - spread), b.y - length * Math.sin(angle - spread));
  sink.lineTo(b.x - length * Math.cos(angle + spread), b.y - length * Math.sin(angle + spread));
  sink.closePath();
}

const arrowLength = (lineWidth: number) => Math.max(10, lineWidth * 4);

/** Contorno de uma forma fechada no retângulo `r`. */
function closedShape(sink: PathSink, kind: ShapeKind, r: Rect) {
  if (kind === "rect") {
    sink.moveTo(r.x, r.y);
    sink.lineTo(r.x + r.w, r.y);
    sink.lineTo(r.x + r.w, r.y + r.h);
    sink.lineTo(r.x, r.y + r.h);
    sink.closePath();
  } else if (kind === "roundrect") roundRect(sink, r);
  else if (kind === "ellipse") ellipse(sink, r);
  else if (kind === "heart") heart(sink, r);
  else fitPolygon(sink, POLYGONS[kind]!, r);
}

/** Caminho SVG da forma num quadro de 0 a `size`, para os ícones da barra. */
export function shapeIconPath(kind: ShapeKind, size = 16): string {
  const parts: string[] = [];
  const f = (n: number) => +n.toFixed(2);
  const sink: PathSink = {
    moveTo: (x, y) => parts.push(`M${f(x)} ${f(y)}`),
    lineTo: (x, y) => parts.push(`L${f(x)} ${f(y)}`),
    bezierCurveTo: (a, b, c, d, x, y) => parts.push(`C${f(a)} ${f(b)} ${f(c)} ${f(d)} ${f(x)} ${f(y)}`),
    closePath: () => parts.push("Z"),
  };
  const m = 1.5;
  if (kind === "line" || kind === "arrow") {
    const a = { x: m, y: size - m };
    const b = { x: size - m, y: m };
    sink.moveTo(a.x, a.y);
    sink.lineTo(b.x, b.y);
    if (kind === "arrow") {
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const len = size * 0.4;
      sink.moveTo(b.x - len * Math.cos(angle - 0.5), b.y - len * Math.sin(angle - 0.5));
      sink.lineTo(b.x, b.y);
      sink.lineTo(b.x - len * Math.cos(angle + 0.5), b.y - len * Math.sin(angle + 0.5));
    }
  } else {
    closedShape(sink, kind, { x: m, y: m + (kind === "heart" ? 1 : 0), w: size - 2 * m, h: size - 2 * m - (kind === "heart" ? 1 : 0) });
  }
  return parts.join("");
}


/** Forma recém-desenhada, ainda editável. */
type Pending =
  | { type: "line"; shape: ShapeKind; a: Point; b: Point; button: number }
  | { type: "box"; shape: ShapeKind; rect: Rect; angle: number; button: number };

type Drag =
  | { kind: "draw"; start: Point; button: number }
  | { kind: "move"; start: Point; origin: Pending }
  | { kind: "resize"; handle: Handle; start: Point; origin: Rect }
  | { kind: "rotate"; start: Point; angle: number }
  | { kind: "end"; index: 0 | 1 };

const isLineShape = (shape: ShapeKind) => shape === "line" || shape === "arrow";
const roundPoint = (p: Point): Point => ({ x: Math.round(p.x), y: Math.round(p.y) });

/** Shift: linhas a cada 45°, formas com largura igual à altura. */
function constrain(a: Point, b: Point, isLine: boolean, shift: boolean): Point {
  if (!shift) return b;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (isLine) {
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const len = Math.hypot(dx, dy);
    return { x: Math.round(a.x + Math.cos(angle) * len), y: Math.round(a.y + Math.sin(angle) * len) };
  }
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: a.x + Math.sign(dx || 1) * side, y: a.y + Math.sign(dy || 1) * side };
}

/**
 * Formas. Como no Paint, a forma recém-desenhada continua editável (alças
 * para mover, redimensionar e girar; nas linhas, para mover as pontas), e
 * mudanças de cor, espessura e preenchimento valem para ela, até um clique
 * fora, a troca de ferramenta ou outro comando, quando é aplicada à imagem.
 */
export class ShapeTool implements Tool {
  cursor = "crosshair";
  private pending: Pending | null = null;
  private drag: Drag | null = null;
  private readonly box: TransformBox;

  constructor(private app: App) {
    this.box = new TransformBox(app.view.overlay, true);
    app.onUi(() => this.refresh());
  }

  get isPending() {
    return this.pending !== null;
  }

  down(p: PointerInfo) {
    const pending = this.pending;
    if (pending) {
      const handle = p.handle;
      if (handle === ROTATE && pending.type === "box") {
        this.drag = { kind: "rotate", start: p, angle: pending.angle };
        return;
      }
      if (handle === "p0" || handle === "p1") {
        this.drag = { kind: "end", index: handle === "p0" ? 0 : 1 };
        return;
      }
      if (handle && pending.type === "box") {
        this.drag = { kind: "resize", handle: handle as Handle, start: p, origin: { ...pending.rect } };
        return;
      }
      if (this.hit(p)) {
        this.drag = { kind: "move", start: p, origin: structuredClone(pending) };
        return;
      }
      this.commit();
    }
    this.drag = { kind: "draw", start: roundPoint(p), button: p.button };
  }

  move(p: PointerInfo) {
    const drag = this.drag;
    if (!drag) return;
    if (drag.kind === "draw") {
      const shape = this.app.opts.shape;
      const a = drag.start;
      const b = constrain(a, roundPoint(p), isLineShape(shape), p.shift);
      const button = drag.button;
      if (a.x === b.x && a.y === b.y) this.pending = null;
      else if (isLineShape(shape)) this.pending = { type: "line", shape, a, b, button };
      else this.pending = { type: "box", shape, rect: rectFromPoints(a, b), angle: 0, button };
      return this.render();
    }
    const pending = this.pending;
    if (!pending) return;
    if (drag.kind === "move") {
      const dx = Math.round(p.x - drag.start.x);
      const dy = Math.round(p.y - drag.start.y);
      const o = drag.origin;
      if (pending.type === "line" && o.type === "line") {
        pending.a = { x: o.a.x + dx, y: o.a.y + dy };
        pending.b = { x: o.b.x + dx, y: o.b.y + dy };
      } else if (pending.type === "box" && o.type === "box") {
        pending.rect = { ...o.rect, x: o.rect.x + dx, y: o.rect.y + dy };
      }
    } else if (drag.kind === "end" && pending.type === "line") {
      const q = constrain(drag.index ? pending.a : pending.b, roundPoint(p), true, p.shift);
      if (drag.index) pending.b = q;
      else pending.a = q;
    } else if (drag.kind === "resize" && pending.type === "box") {
      const r = resizeRotated(drag.origin, pending.angle, drag.handle, drag.start, p, p.shift);
      // Sem giro, os cantos ficam em pixels inteiros (contorno nítido).
      pending.rect = pending.angle ? r : toPixels(r);
    } else if (drag.kind === "rotate" && pending.type === "box") {
      pending.angle = dragAngle(centerOf(pending.rect), drag.start, p, drag.angle, p.shift);
    }
    this.render();
  }

  up() {
    if (!this.drag) return;
    this.drag = null;
    this.layout();
    // O botão Desfazer passa a valer para a forma pendente.
    this.app.notify();
  }

  hover(p: PointerInfo) {
    this.app.view.setCursor(this.pending && this.hit(p) ? "move" : "crosshair");
  }

  cancel() {
    if (this.drag?.kind === "draw") this.pending = null;
    this.drag = null;
    this.render();
  }

  /** Aplica a forma pendente na imagem (um passo de desfazer). */
  commit() {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    this.drag = null;
    this.box.hide();
    this.paint(pending);
    this.app.commitScratch(this.bounds(pending));
  }

  /** Esquece a forma pendente (outra imagem foi aberta). */
  discard() {
    this.pending = null;
    this.drag = null;
    this.render();
  }

  /** Reposiciona as alças (o zoom mudou). */
  layout() {
    const pending = this.pending;
    const zoom = this.app.view.zoom;
    if (!pending || this.drag?.kind === "draw") this.box.hide();
    else if (pending.type === "line") this.box.showEnds([pending.a, pending.b], zoom);
    else this.box.showBox(pending.rect, pending.angle, zoom);
  }

  /** Cor, espessura, contorno ou preenchimento mudaram: redesenha. Outra forma escolhida: aplica esta. */
  private refresh() {
    const pending = this.pending;
    if (!pending || this.drag || this.app.toolId !== "shape") return;
    if (this.app.opts.shape !== pending.shape) this.commit();
    else this.render();
  }

  private render() {
    if (this.pending) this.paint(this.pending);
    else this.app.view.clearScratch();
    this.layout();
  }

  /** O ponto está sobre a forma (ou perto o bastante para arrastá-la)? */
  private hit(p: Point): boolean {
    const pending = this.pending!;
    const tol = Math.max(this.app.opts.sizes.shape / 2, 4 / this.app.view.zoom);
    if (pending.type === "line") return distanceToSegment(p, pending.a, pending.b) <= tol;
    const r = pending.rect;
    const q = unrotate(p, r, pending.angle);
    return q.x >= r.x - tol && q.y >= r.y - tol && q.x <= r.x + r.w + tol && q.y <= r.y + r.h + tol;
  }

  private bounds(pending: Pending): Rect {
    const width = this.app.opts.sizes.shape;
    const margin = width * 2 + 2;
    if (pending.type === "line") {
      return boundsOf([pending.a, pending.b], margin + (pending.shape === "arrow" ? arrowLength(width) : 0));
    }
    return boundsOf(rotatedCorners(pending.rect, pending.angle), margin);
  }

  /** Desenha a forma no rascunho. */
  private paint(pending: Pending) {
    const app = this.app;
    const { outline, fill } = app.opts;
    const view = app.view;
    view.clearScratch();
    // Botão direito troca as cores, como no Paint.
    const stroke = app.colorFor(pending.button);
    const fillColor = app.colorFor(pending.button === 2 ? 0 : 2);
    const width = app.opts.sizes.shape;
    const ctx = view.scratchCtx;
    ctx.save();
    ctx.lineWidth = width;
    ctx.strokeStyle = stroke;
    ctx.lineCap = "round";
    ctx.lineJoin = pending.shape === "rect" || pending.shape === "diamond" ? "miter" : "round";
    ctx.miterLimit = 4;
    ctx.beginPath();

    if (pending.type === "line") {
      const { a, b } = pending;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      if (pending.shape === "arrow") {
        ctx.beginPath();
        arrowHead(ctx, a, b, arrowLength(width));
        ctx.fillStyle = stroke;
        ctx.fill();
        ctx.stroke();
      }
    } else {
      const r = pending.rect;
      if (pending.angle) {
        const c = centerOf(r);
        ctx.translate(c.x, c.y);
        ctx.rotate(pending.angle);
        ctx.translate(-c.x, -c.y);
      }
      // Contorno ímpar fica nítido no meio do pixel.
      const offset = outline === "solid" && width % 2 === 1 && !pending.angle ? 0.5 : 0;
      closedShape(ctx, pending.shape, { x: r.x + offset, y: r.y + offset, w: r.w, h: r.h });
      if (fill === "solid") {
        ctx.fillStyle = fillColor;
        ctx.fill();
      }
      if (outline === "solid") ctx.stroke();
    }
    ctx.restore();
  }
}

const toPixels = (r: Rect): Rect => ({
  x: Math.round(r.x),
  y: Math.round(r.y),
  w: Math.max(1, Math.round(r.w)),
  h: Math.max(1, Math.round(r.h)),
});
