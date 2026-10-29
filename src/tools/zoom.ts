import type { App } from "../app";
import type { PointerInfo } from "../view";
import type { Tool } from "./tool";

/** Lupa: clique amplia, clique com o botão direito (ou Alt) reduz. */
export class ZoomTool implements Tool {
  cursor = "zoom-in";

  constructor(private app: App) {}

  down(p: PointerInfo) {
    const view = this.app.view;
    const out = p.button === 2 || p.alt;
    view.setZoom(view.zoom * (out ? 0.5 : 2), { x: p.event.clientX, y: p.event.clientY });
  }

  move() {}
  up() {}

  hover(p: PointerInfo) {
    this.app.view.setCursor(p.alt ? "zoom-out" : "zoom-in");
  }
}
