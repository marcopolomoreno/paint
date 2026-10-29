import { cloneCanvas, context2d, intersect, snapRect, type Rect } from "./geometry";
import { History } from "./history";

/**
 * A imagem sendo editada: um canvas com a resolução real da imagem. O mesmo
 * elemento é mostrado na tela (escalado por CSS pelo zoom).
 */
export class PaintDoc {
  readonly canvas = document.createElement("canvas");
  readonly ctx = context2d(this.canvas);
  readonly history = new History(this);
  path: string | null = null;
  dirty = false;
  /** Chamado quando o conteúdo muda; `resized` quando muda o tamanho. */
  onChange: (resized: boolean) => void = () => {};

  get width() {
    return this.canvas.width;
  }

  get height() {
    return this.canvas.height;
  }

  get bounds(): Rect {
    return { x: 0, y: 0, w: this.width, h: this.height };
  }

  /** Imagem nova, preenchida com uma cor. */
  reset(width: number, height: number, color: string) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, width, height);
    this.history.clear();
    this.path = null;
    this.dirty = false;
    this.onChange(true);
  }

  /** Troca todo o conteúdo (e talvez o tamanho) pelo de outro canvas. Não registra histórico. */
  replace(source: HTMLCanvasElement | ImageData) {
    const resized = source.width !== this.width || source.height !== this.height;
    if (resized) {
      this.canvas.width = source.width;
      this.canvas.height = source.height;
    } else {
      this.ctx.clearRect(0, 0, this.width, this.height);
    }
    if (source instanceof ImageData) this.ctx.putImageData(source, 0, 0);
    else this.ctx.drawImage(source, 0, 0);
    this.changed(resized);
  }

  /** Troca o conteúdo registrando um passo de desfazer. */
  replaceWithHistory(source: HTMLCanvasElement | ImageData) {
    this.history.pushFull(this.snapshot());
    this.replace(source);
  }

  /** Cópia da imagem atual. */
  snapshot(): HTMLCanvasElement {
    return cloneCanvas(this.canvas);
  }

  /** Parte de `rect` que fica dentro da imagem, com cantos inteiros. */
  clip(rect: Rect): Rect | null {
    return intersect(snapRect(rect), this.bounds);
  }

  /**
   * Faz uma alteração restrita a `rect` registrando o passo de desfazer.
   * `draw` recebe o contexto da imagem; nada fora de `rect` pode mudar.
   */
  edit(rect: Rect, draw: (ctx: CanvasRenderingContext2D, area: Rect) => void) {
    const area = this.clip(rect);
    if (!area) return;
    const before = this.ctx.getImageData(area.x, area.y, area.w, area.h);
    this.ctx.save();
    draw(this.ctx, area);
    this.ctx.restore();
    this.history.pushRegion(area, before);
    this.changed();
  }

  changed(resized = false) {
    this.dirty = true;
    this.onChange(resized);
  }
}
