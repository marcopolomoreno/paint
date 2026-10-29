import type { App } from "../app";
import { boundsOf, rectFromPoints, type Point, type Rect } from "../geometry";
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

export class ShapeTool implements Tool {
  cursor = "crosshair";
  private start: Point | null = null;
  private button = 0;
  private lastBounds: Rect | null = null;

  constructor(private app: App) {}

  down(p: PointerInfo) {
    this.start = { x: Math.round(p.x), y: Math.round(p.y) };
    this.button = p.button;
    this.draw(p);
  }

  move(p: PointerInfo) {
    if (this.start) this.draw(p);
  }

  up(p: PointerInfo) {
    if (!this.start) return;
    this.draw(p);
    if (this.lastBounds) this.app.commitScratch(this.lastBounds);
    else this.app.view.clearScratch();
    this.start = null;
    this.lastBounds = null;
  }

  cancel() {
    this.start = null;
    this.lastBounds = null;
    this.app.view.clearScratch();
  }

  /** Redesenha a forma no rascunho, do ponto inicial até `p`. */
  private draw(p: PointerInfo) {
    const app = this.app;
    const { shape, outline, fill } = app.opts;
    const view = app.view;
    view.clearScratch();
    const a = this.start!;
    let b = { x: Math.round(p.x), y: Math.round(p.y) };
    const isLine = shape === "line" || shape === "arrow";

    // Shift: linhas a cada 45°, formas com largura igual à altura.
    if (p.shift) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (isLine) {
        const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
        const len = Math.hypot(dx, dy);
        b = { x: Math.round(a.x + Math.cos(angle) * len), y: Math.round(a.y + Math.sin(angle) * len) };
      } else {
        const side = Math.max(Math.abs(dx), Math.abs(dy));
        b = { x: a.x + Math.sign(dx || 1) * side, y: a.y + Math.sign(dy || 1) * side };
      }
    }
    if (a.x === b.x && a.y === b.y) {
      this.lastBounds = null;
      return;
    }

    // Botão direito troca as cores, como no Paint.
    const stroke = app.colorFor(this.button);
    const fillColor = app.colorFor(this.button === 2 ? 0 : 2);
    const width = app.opts.sizes.shape;
    const ctx = view.scratchCtx;
    ctx.lineWidth = width;
    ctx.strokeStyle = stroke;
    ctx.lineCap = "round";
    ctx.lineJoin = shape === "rect" || shape === "diamond" ? "miter" : "round";
    ctx.miterLimit = 4;
    ctx.beginPath();

    let margin = width * 2 + 2;
    if (isLine) {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      if (shape === "arrow") {
        ctx.beginPath();
        arrowHead(ctx, a, b, arrowLength(width));
        ctx.fillStyle = stroke;
        ctx.fill();
        ctx.stroke();
        margin += arrowLength(width);
      }
    } else {
      // Contorno ímpar fica nítido no meio do pixel.
      const offset = outline === "solid" && width % 2 === 1 ? 0.5 : 0;
      const r = rectFromPoints(a, b);
      closedShape(ctx, shape, { x: r.x + offset, y: r.y + offset, w: r.w, h: r.h });
      if (fill === "solid") {
        ctx.fillStyle = fillColor;
        ctx.fill();
      }
      if (outline === "solid") ctx.stroke();
    }
    this.lastBounds = boundsOf([a, b], margin);
  }
}
