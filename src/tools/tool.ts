import type { PointerInfo } from "../view";

export type ToolId = "select" | "pencil" | "brush" | "eraser" | "fill" | "picker" | "text" | "shape" | "zoom";

/** Ferramenta de desenho. As coordenadas já vêm em pixels da imagem. */
export interface Tool {
  cursor: string;
  down(p: PointerInfo): void;
  move(p: PointerInfo): void;
  up(p: PointerInfo): void;
  /** Movimento sem botão pressionado. */
  hover?(p: PointerInfo): void;
  /** Esc ou ponteiro cancelado: descarta o que estiver em andamento. */
  cancel?(): void;
  /** Conclui trabalho pendente (ex.: caixa de texto aberta). */
  commit?(): void;
  /** Contorno mostrado sob o cursor (borracha, pincel). */
  outline?(): { size: number; round: boolean } | null;
}

/** Pontos inteiros entre `a` e `b` (algoritmo de Bresenham). */
export function* linePixels(x0: number, y0: number, x1: number, y1: number): Generator<[number, number]> {
  x0 = Math.floor(x0);
  y0 = Math.floor(y0);
  x1 = Math.floor(x1);
  y1 = Math.floor(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    yield [x0, y0];
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}
