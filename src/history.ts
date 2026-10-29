import type { Rect } from "./geometry";
import type { PaintDoc } from "./doc";

/**
 * Cada passo guarda só UM estado: o "outro lado" da mudança. Desfazer troca o
 * conteúdo guardado pelo que está na imagem, e refazer troca de volta. Assim a
 * região alterada ocupa memória uma vez só, em vez de antes + depois.
 */
type Entry =
  | { kind: "region"; x: number; y: number; data: ImageData }
  | { kind: "full"; canvas: HTMLCanvasElement };

const bytesOf = (e: Entry) => (e.kind === "region" ? e.data.data.byteLength : e.canvas.width * e.canvas.height * 4);

/** Memória máxima do histórico; os passos mais antigos são descartados. */
const MAX_BYTES = 768 * 1024 * 1024;
const MAX_ENTRIES = 1000;

export class History {
  private undoStack: Entry[] = [];
  private redoStack: Entry[] = [];
  private bytes = 0;
  onChange: () => void = () => {};

  constructor(private doc: PaintDoc) {}

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  /** Registra uma mudança já feita em `rect`; `before` é o conteúdo anterior. */
  pushRegion(rect: Rect, before: ImageData) {
    this.push({ kind: "region", x: rect.x, y: rect.y, data: before });
  }

  /** Registra uma mudança da imagem inteira (tamanho, giro…); `before` é a imagem anterior. */
  pushFull(before: HTMLCanvasElement) {
    this.push({ kind: "full", canvas: before });
  }

  undo(): boolean {
    return this.move(this.undoStack, this.redoStack);
  }

  redo(): boolean {
    return this.move(this.redoStack, this.undoStack);
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.bytes = 0;
    this.onChange();
  }

  private push(entry: Entry) {
    for (const e of this.redoStack) this.bytes -= bytesOf(e);
    this.redoStack = [];
    this.undoStack.push(entry);
    this.bytes += bytesOf(entry);
    while (this.undoStack.length > 1 && (this.bytes > MAX_BYTES || this.undoStack.length > MAX_ENTRIES)) {
      this.bytes -= bytesOf(this.undoStack.shift()!);
    }
    this.onChange();
  }

  private move(from: Entry[], to: Entry[]): boolean {
    const entry = from.pop();
    if (!entry) return false;
    this.bytes -= bytesOf(entry);
    this.swap(entry);
    this.bytes += bytesOf(entry);
    to.push(entry);
    this.onChange();
    return true;
  }

  private swap(entry: Entry) {
    const doc = this.doc;
    if (entry.kind === "region") {
      const { width, height } = entry.data;
      const current = doc.ctx.getImageData(entry.x, entry.y, width, height);
      doc.ctx.putImageData(entry.data, entry.x, entry.y);
      entry.data = current;
      doc.changed();
    } else {
      const current = doc.snapshot();
      doc.replace(entry.canvas);
      entry.canvas = current;
    }
  }
}
