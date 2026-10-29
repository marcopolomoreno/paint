import type { App } from "../app";
import { boundsOf, createCanvas, parseHex, type Point } from "../geometry";
import type { PointerInfo } from "../view";
import type { Tool } from "./tool";

export type BrushKind = "round" | "calligraphy" | "airbrush" | "marker" | "crayon";

export const BRUSHES: { id: BrushKind; label: string }[] = [
  { id: "round", label: "Pincel" },
  { id: "calligraphy", label: "Caneta caligráfica" },
  { id: "airbrush", label: "Aerógrafo" },
  { id: "marker", label: "Marca-texto" },
  { id: "crayon", label: "Giz de cera" },
];

/** Opacidade do marca-texto. O traço é desenhado opaco no rascunho e aplicado translúcido. */
const MARKER_ALPHA = 0.45;

export class BrushTool implements Tool {
  cursor = "crosshair";
  private last: Point | null = null;
  private points: Point[] = [];
  private color = "#000000";
  private sprayTimer = 0;

  constructor(private app: App) {}

  private get kind() {
    return this.app.opts.brush;
  }

  private get size() {
    return this.app.opts.sizes.brush;
  }

  private get sprayRadius() {
    return this.size * 2 + 4;
  }

  outline() {
    if (this.kind === "airbrush") return { size: this.sprayRadius * 2, round: true };
    return this.size > 3 ? { size: this.size, round: this.kind !== "marker" } : null;
  }

  down(p: PointerInfo) {
    const view = this.app.view;
    const ctx = view.scratchCtx;
    this.color = this.app.colorFor(p.button);
    this.last = p;
    this.points = [p];
    ctx.lineCap = this.kind === "marker" ? "square" : "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = this.size;
    ctx.fillStyle = ctx.strokeStyle = this.kind === "crayon" ? this.crayonPattern() : this.color;
    if (this.kind === "marker") view.scratch.style.opacity = String(MARKER_ALPHA);
    if (this.kind === "airbrush") {
      this.spray(p);
      // O aerógrafo continua soltando tinta com o mouse parado.
      this.sprayTimer = window.setInterval(() => this.last && this.spray(this.last), 30);
    } else {
      this.segment(p, p);
    }
  }

  move(p: PointerInfo) {
    if (!this.last) return;
    if (this.kind === "airbrush") this.spray(p);
    else this.segment(this.last, p);
    this.last = p;
    this.points.push(p);
  }

  up() {
    if (!this.last) return;
    this.stopSpray();
    const margin = (this.kind === "airbrush" ? this.sprayRadius : this.size) + 2;
    this.app.commitScratch(boundsOf(this.points, margin), this.kind === "marker" ? MARKER_ALPHA : 1);
    this.last = null;
  }

  cancel() {
    this.stopSpray();
    this.last = null;
    this.app.view.clearScratch();
  }

  private stopSpray() {
    window.clearInterval(this.sprayTimer);
    this.sprayTimer = 0;
  }

  private segment(a: Point, b: Point) {
    const ctx = this.app.view.scratchCtx;
    if (this.kind === "calligraphy") {
      // Ponta chata a 45°: cada trecho vira um paralelogramo.
      const r = Math.max(1, this.size / 2);
      const nx = r * Math.SQRT1_2;
      const ny = -r * Math.SQRT1_2;
      ctx.beginPath();
      ctx.moveTo(a.x + nx, a.y + ny);
      ctx.lineTo(b.x + nx, b.y + ny);
      ctx.lineTo(b.x - nx, b.y - ny);
      ctx.lineTo(a.x - nx, a.y - ny);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  private spray(p: Point) {
    const ctx = this.app.view.scratchCtx;
    const r = this.sprayRadius;
    const count = Math.ceil(r * 0.8);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.sqrt(Math.random()) * r;
      ctx.fillRect(Math.floor(p.x + Math.cos(angle) * dist), Math.floor(p.y + Math.sin(angle) * dist), 1, 1);
    }
  }

  /**
   * Textura de giz: pixels da cor ou vazios, ao acaso. Como cada pixel é
   * totalmente opaco ou transparente e o padrão é preso à imagem, trechos que
   * se sobrepõem não ficam mais escuros.
   */
  private crayonPattern(): CanvasPattern {
    const tile = createCanvas(48, 48);
    const ctx = tile.getContext("2d")!;
    const img = ctx.createImageData(48, 48);
    const [r, g, b] = parseHex(this.color);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = Math.random() < 0.4 ? 0 : 255;
    }
    ctx.putImageData(img, 0, 0);
    return this.app.view.scratchCtx.createPattern(tile, "repeat")!;
  }
}
