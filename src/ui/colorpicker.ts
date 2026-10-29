import { clamp, parseHex, toHex } from "../geometry";
import { formDialog, h } from "./dialogs";

function hsvToRgb(hue: number, s: number, v: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + hue / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let hue = 0;
  if (d) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
  }
  return [(hue * 60 + 360) % 360, max ? d / max : 0, max];
}

/** Arrasto com o ponteiro capturado (pointer events, sem drag-and-drop HTML5). */
function draggable(el: HTMLElement, onMove: (fx: number, fy: number) => void) {
  const update = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    onMove(clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1));
  };
  el.addEventListener("pointerdown", (e) => {
    el.setPointerCapture(e.pointerId);
    update(e);
  });
  el.addEventListener("pointermove", (e) => {
    if (el.hasPointerCapture(e.pointerId)) update(e);
  });
}

/** Caixa "Editar cores": quadrado de saturação/brilho, faixa de matiz e campos. */
export async function pickColor(initial: string): Promise<string | null> {
  let [hue, sat, val] = rgbToHsv(...parseHex(initial));

  const field = h("div", { className: "cp-field" }, h("div", { className: "cp-thumb" }));
  const hueBar = h("div", { className: "cp-hue" }, h("div", { className: "cp-thumb" }));
  const preview = h("div", { className: "cp-preview" });
  const hex = h("input", { type: "text", maxLength: 7, spellcheck: false, className: "cp-hex" });
  const channels = ["R", "G", "B"].map(() => h("input", { type: "number", min: "0", max: "255" }));
  const fields = h(
    "div",
    { className: "cp-inputs" },
    h("label", {}, "Hex", hex),
    ...channels.map((input, i) => h("label", {}, "RGB"[i], input)),
  );
  const body = h("div", { className: "colorpicker" }, field, hueBar, h("div", { className: "cp-side" }, preview, fields));

  const current = () => toHex(...hsvToRgb(hue, sat, val));
  const render = (skip?: HTMLInputElement) => {
    const color = current();
    field.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hue}, 100%, 50%))`;
    (field.firstChild as HTMLElement).style.cssText = `left:${sat * 100}%;top:${(1 - val) * 100}%`;
    (hueBar.firstChild as HTMLElement).style.cssText = `top:${(hue / 360) * 100}%`;
    preview.style.background = color;
    if (skip !== hex) hex.value = color.toUpperCase();
    parseHex(color).forEach((c, i) => {
      if (skip !== channels[i]) channels[i].value = String(c);
    });
  };

  draggable(field, (fx, fy) => {
    sat = fx;
    val = 1 - fy;
    render();
  });
  draggable(hueBar, (_, fy) => {
    hue = Math.min(fy * 360, 359.9);
    render();
  });
  hex.addEventListener("input", () => {
    const text = hex.value.trim().replace(/^#?/, "#");
    if (/^#[0-9a-f]{6}$/i.test(text)) {
      [hue, sat, val] = rgbToHsv(...parseHex(text));
      render(hex);
    }
  });
  channels.forEach((input) =>
    input.addEventListener("input", () => {
      const rgb = channels.map((c) => clamp(Number(c.value) || 0, 0, 255)) as [number, number, number];
      [hue, sat, val] = rgbToHsv(...rgb);
      render(input);
    }),
  );
  render();

  const ok = await formDialog("Editar cores", body, () => true);
  return ok ? current() : null;
}
