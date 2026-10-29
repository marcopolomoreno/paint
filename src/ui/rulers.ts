import type { App } from "../app";

const SIZE = 20;
const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];

/** Menor passo (em pixels da imagem) que fica com pelo menos `min` pixels de tela. */
export function stepFor(zoom: number, min: number): number {
  return STEPS.find((s) => s * zoom >= min) ?? STEPS[STEPS.length - 1];
}

/**
 * Réguas em cima e à esquerda da área de desenho, em pixels da imagem, com
 * uma marca na posição do cursor. São canvas do tamanho da área visível,
 * redesenhados a cada rolagem ou zoom (nítidos em telas Retina).
 */
export class Rulers {
  private cursor: { x: number; y: number } | null = null;
  private frame = 0;

  constructor(
    private app: App,
    private area: HTMLElement,
    private top: HTMLCanvasElement,
    private left: HTMLCanvasElement,
  ) {
    const viewport = app.view.viewport;
    viewport.addEventListener("scroll", () => this.schedule());
    new ResizeObserver(() => this.schedule()).observe(viewport);
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => this.schedule());
  }

  get visible() {
    return this.app.settings.rulers;
  }

  setVisible(visible: boolean) {
    this.area.classList.toggle("with-rulers", visible);
    this.schedule();
  }

  setCursor(p: { x: number; y: number } | null) {
    this.cursor = p;
    this.schedule();
  }

  /** Redesenha no próximo quadro (vários avisos seguidos viram um desenho só). */
  schedule() {
    if (!this.visible || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  private draw() {
    const view = this.app.view;
    const vr = view.viewport.getBoundingClientRect();
    const sr = view.stage.getBoundingClientRect();
    const zoom = view.zoom;
    const style = getComputedStyle(document.documentElement);
    const colors = {
      bg: style.getPropertyValue("--bg-ribbon").trim(),
      fg: style.getPropertyValue("--fg-muted").trim(),
      line: style.getPropertyValue("--control-border").trim(),
      accent: style.getPropertyValue("--accent").trim(),
    };
    this.drawOne(this.top, vr.width, sr.left - vr.left, zoom, this.cursor?.x ?? null, false, colors);
    this.drawOne(this.left, vr.height, sr.top - vr.top, zoom, this.cursor?.y ?? null, true, colors);
  }

  private drawOne(
    canvas: HTMLCanvasElement,
    length: number,
    origin: number,
    zoom: number,
    cursor: number | null,
    vertical: boolean,
    colors: Record<"bg" | "fg" | "line" | "accent", string>,
  ) {
    const dpr = window.devicePixelRatio || 1;
    const w = vertical ? SIZE : length;
    const h = vertical ? length : SIZE;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, w, h);
    // `along` corre ao longo da régua; `across` vai de 0 (fora) até SIZE (junto da imagem).
    const at = (along: number, across: number): [number, number] => (vertical ? [across, along] : [along, across]);
    const line = (a1: number, c1: number, a2: number, c2: number) => {
      ctx.moveTo(...at(a1, c1));
      ctx.lineTo(...at(a2, c2));
    };

    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    line(0, SIZE - 0.5, length, SIZE - 0.5);
    ctx.stroke();

    const major = stepFor(zoom, 60);
    const minor = [10, 5, 2].map((d) => major / d).find((s) => Number.isInteger(s) && s * zoom >= 5) ?? major;
    const first = Math.floor(-origin / zoom / minor) * minor;
    const last = (length - origin) / zoom;

    ctx.strokeStyle = colors.fg;
    ctx.fillStyle = colors.fg;
    ctx.font = `10px ${uiFont()}`;
    ctx.textBaseline = "top";
    ctx.beginPath();
    for (let v = first; v <= last; v += minor) {
      const pos = Math.round(origin + v * zoom) + 0.5;
      const isMajor = Math.abs(v % major) < 1e-6;
      const isHalf = !isMajor && Math.abs(v % (major / 2)) < 1e-6;
      line(pos, SIZE, pos, SIZE - (isMajor ? SIZE : isHalf ? 7 : 4));
      if (!isMajor) continue;
      if (vertical) {
        // Na régua da esquerda o número é lido de baixo para cima, logo abaixo do traço.
        ctx.save();
        ctx.translate(2, pos + 3);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "right";
        ctx.fillText(String(v), 0, 0);
        ctx.restore();
      } else {
        ctx.fillText(String(v), pos + 3, 2);
      }
    }
    ctx.stroke();

    if (cursor !== null) {
      const pos = Math.round(origin + cursor * zoom) + 0.5;
      ctx.strokeStyle = colors.accent;
      ctx.beginPath();
      line(pos, 0, pos, SIZE);
      ctx.stroke();
    }
  }
}

const uiFont = () => getComputedStyle(document.body).fontFamily;
