import type { App } from "../app";
import { createCanvas, type Point } from "../geometry";
import type { PointerInfo } from "../view";
import type { Tool } from "./tool";

export interface TextOptions {
  font: string;
  /** Tamanho em pontos, como no Paint (1 pt = 4/3 px). */
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  /** Fundo preenchido com a cor secundária. */
  opaque: boolean;
}

export const FONTS = [
  "Arial",
  "Helvetica",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Comic Sans MS",
  "Impact",
];

export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];

const LINE_HEIGHT = 1.25;
const PADDING = 2;

const ptToPx = (pt: number) => (pt * 4) / 3;

function fontString(o: TextOptions, px: number) {
  return `${o.italic ? "italic " : ""}${o.bold ? "bold " : ""}${px}px "${o.font}", sans-serif`;
}

/**
 * Texto: uma caixa de edição flutua sobre a imagem; ao clicar fora (ou trocar
 * de ferramenta) o texto é desenhado na imagem com as mesmas medidas.
 */
export class TextTool implements Tool {
  cursor = "text";
  private box: HTMLTextAreaElement | null = null;
  private at: Point = { x: 0, y: 0 };
  private measure = createCanvas(1, 1).getContext("2d")!;

  constructor(private app: App) {}

  get editing() {
    return this.box !== null;
  }

  down(p: PointerInfo) {
    if (this.box) {
      this.commit();
      return;
    }
    const doc = this.app.doc;
    this.at = {
      x: Math.min(Math.max(0, Math.round(p.x)), doc.width - 1),
      y: Math.min(Math.max(0, Math.round(p.y)), doc.height - 1),
    };
    this.open();
  }

  move() {}
  up() {}

  cancel() {
    this.box?.remove();
    this.box = null;
  }

  commit() {
    const box = this.box;
    if (!box) return;
    this.box = null;
    box.remove();
    const text = box.value.replace(/\s+$/, "");
    if (!text) return;
    const o = this.app.opts.text;
    const px = ptToPx(o.size);
    const { w, h, lines } = this.metrics(text, px);
    const rect = { x: this.at.x, y: this.at.y, w, h };
    const color = this.app.primary;
    const background = this.app.secondary;
    this.app.doc.edit(rect, (ctx) => {
      if (o.opaque) {
        ctx.fillStyle = background;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      }
      ctx.font = fontString(o, px);
      ctx.fillStyle = color;
      ctx.textBaseline = "alphabetic";
      const { ascent, descent } = this.fontMetrics(px);
      const lineHeight = px * LINE_HEIGHT;
      // Mesma posição da linha de base que o CSS usa dentro da caixa de texto.
      const baseline = (lineHeight - (ascent + descent)) / 2 + ascent;
      lines.forEach((line, i) => {
        const x = rect.x + PADDING;
        const y = rect.y + PADDING + i * lineHeight + baseline;
        ctx.fillText(line, x, y);
        if (o.underline && line) {
          const thickness = Math.max(1, Math.round(px / 14));
          ctx.fillRect(x, Math.round(y + px / 8), ctx.measureText(line).width, thickness);
        }
      });
    });
  }

  /** Atualiza a caixa depois de mudar zoom, fonte ou cor. */
  layout() {
    const box = this.box;
    if (!box) return;
    const o = this.app.opts.text;
    const zoom = this.app.view.zoom;
    const px = ptToPx(o.size);
    const { w, h } = this.metrics(box.value || " ", px);
    // A borda tracejada (1 px de cada lado) fica por fora da área do texto.
    Object.assign(box.style, {
      left: `${this.at.x * zoom - 1}px`,
      top: `${this.at.y * zoom - 1}px`,
      width: `${(w + px) * zoom + 2}px`,
      height: `${h * zoom + 2}px`,
      font: fontString(o, px * zoom),
      lineHeight: String(LINE_HEIGHT),
      padding: `${PADDING * zoom}px`,
      color: this.app.primary,
      background: o.opaque ? this.app.secondary : "transparent",
      textDecoration: o.underline ? "underline" : "none",
    });
  }

  private open() {
    const box = document.createElement("textarea");
    box.className = "text-box";
    box.spellcheck = false;
    box.wrap = "off";
    box.addEventListener("input", () => this.layout());
    box.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.cancel();
      }
    });
    this.box = box;
    this.app.view.overlay.append(box);
    this.layout();
    // Espera o clique terminar para o foco não ser roubado.
    requestAnimationFrame(() => box.focus());
  }

  private fontMetrics(px: number) {
    this.measure.font = fontString(this.app.opts.text, px);
    const m = this.measure.measureText("Hg");
    return {
      ascent: m.fontBoundingBoxAscent ?? px * 0.8,
      descent: m.fontBoundingBoxDescent ?? px * 0.2,
    };
  }

  private metrics(text: string, px: number) {
    this.measure.font = fontString(this.app.opts.text, px);
    const lines = text.split("\n");
    const width = Math.max(...lines.map((l) => this.measure.measureText(l).width));
    return {
      lines,
      w: Math.ceil(width + PADDING * 2 + 2),
      h: Math.ceil(lines.length * px * LINE_HEIGHT + PADDING * 2),
    };
  }
}
