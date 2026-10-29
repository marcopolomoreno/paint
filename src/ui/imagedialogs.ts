import { MAX_SIDE } from "../platform";
import { formDialog, h } from "./dialogs";

const numberInput = (value: number, min: number, max: number) =>
  h("input", { type: "number", value: String(value), min: String(min), max: String(max), step: "1" });

export interface ResizeResult {
  width: number;
  height: number;
  skewH: number;
  skewV: number;
}

/** "Redimensionar e inclinar", em porcentagem ou pixels, mantendo a proporção. */
export async function resizeDialog(width: number, height: number): Promise<ResizeResult | null> {
  let unit: "percent" | "pixels" = "percent";
  const percent = h("input", { type: "radio", name: "unit", checked: true });
  const pixels = h("input", { type: "radio", name: "unit" });
  const horizontal = numberInput(100, 1, MAX_SIDE);
  const vertical = numberInput(100, 1, MAX_SIDE);
  const keep = h("input", { type: "checkbox", checked: true });
  const skewH = numberInput(0, -89, 89);
  const skewV = numberInput(0, -89, 89);
  const error = h("p", { className: "form-error" });

  const valueFor = (axis: "h" | "v", n: number) => {
    const base = axis === "h" ? width : height;
    return unit === "percent" ? (n / 100) * base : n;
  };
  const display = (axis: "h" | "v", px: number) => {
    const base = axis === "h" ? width : height;
    return String(unit === "percent" ? Math.round((px / base) * 1000) / 10 : Math.round(px));
  };
  const switchUnit = (next: typeof unit) => {
    const pxH = valueFor("h", Number(horizontal.value) || 0);
    const pxV = valueFor("v", Number(vertical.value) || 0);
    unit = next;
    horizontal.value = display("h", pxH);
    vertical.value = display("v", pxV);
  };
  percent.addEventListener("change", () => switchUnit("percent"));
  pixels.addEventListener("change", () => switchUnit("pixels"));

  // Com a proporção travada, mudar um lado ajusta o outro.
  const link = (from: HTMLInputElement, to: HTMLInputElement, fromAxis: "h" | "v") =>
    from.addEventListener("input", () => {
      if (!keep.checked) return;
      const px = valueFor(fromAxis, Number(from.value) || 0);
      const ratio = fromAxis === "h" ? height / width : width / height;
      to.value = display(fromAxis === "h" ? "v" : "h", px * ratio);
    });
  link(horizontal, vertical, "h");
  link(vertical, horizontal, "v");

  const row = (label: string, input: HTMLInputElement, suffix: string) =>
    h("label", { className: "form-row" }, h("span", {}, label), input, h("span", { className: "form-suffix" }, suffix));

  const body = h(
    "div",
    { className: "form" },
    h("fieldset", {}, h("legend", {}, "Redimensionar"),
      h("div", { className: "form-radios" },
        h("label", {}, percent, " Porcentagem"),
        h("label", {}, pixels, " Pixels")),
      row("Horizontal", horizontal, ""),
      row("Vertical", vertical, ""),
      h("label", { className: "form-check" }, keep, " Manter proporção")),
    h("fieldset", {}, h("legend", {}, "Inclinar (graus)"),
      row("Horizontal", skewH, "°"),
      row("Vertical", skewV, "°")),
    error,
  );

  let result: ResizeResult | null = null;
  const ok = await formDialog("Redimensionar e inclinar", body, () => {
    const w = Math.round(valueFor("h", Number(horizontal.value)));
    const hgt = Math.round(valueFor("v", Number(vertical.value)));
    const sh = Number(skewH.value);
    const sv = Number(skewV.value);
    if (!(w >= 1 && hgt >= 1 && w <= MAX_SIDE && hgt <= MAX_SIDE)) {
      error.textContent = `O tamanho precisa ficar entre 1 e ${MAX_SIDE} pixels.`;
      return false;
    }
    if (!(Math.abs(sh) <= 89 && Math.abs(sv) <= 89)) {
      error.textContent = "A inclinação precisa ficar entre -89° e 89°.";
      return false;
    }
    result = { width: w, height: hgt, skewH: sh, skewV: sv };
    return true;
  });
  return ok ? result : null;
}

/** "Propriedades da imagem": tamanho da tela de desenho em pixels. */
export async function imageSizeDialog(width: number, height: number): Promise<{ width: number; height: number } | null> {
  const w = numberInput(width, 1, MAX_SIDE);
  const hgt = numberInput(height, 1, MAX_SIDE);
  const keep = h("input", { type: "checkbox", checked: false });
  const error = h("p", { className: "form-error" });
  w.addEventListener("input", () => {
    if (keep.checked) hgt.value = String(Math.round((Number(w.value) * height) / width));
  });
  hgt.addEventListener("input", () => {
    if (keep.checked) w.value = String(Math.round((Number(hgt.value) * width) / height));
  });
  const body = h(
    "div",
    { className: "form" },
    h("label", { className: "form-row" }, h("span", {}, "Largura"), w, h("span", { className: "form-suffix" }, "px")),
    h("label", { className: "form-row" }, h("span", {}, "Altura"), hgt, h("span", { className: "form-suffix" }, "px")),
    h("label", { className: "form-check" }, keep, " Manter proporção"),
    h("p", { className: "form-note" }, "Aumentar a tela preenche a área nova com a cor secundária."),
    error,
  );
  let result: { width: number; height: number } | null = null;
  const ok = await formDialog("Propriedades da imagem", body, () => {
    const nw = Math.round(Number(w.value));
    const nh = Math.round(Number(hgt.value));
    if (!(nw >= 1 && nh >= 1 && nw <= MAX_SIDE && nh <= MAX_SIDE)) {
      error.textContent = `O tamanho precisa ficar entre 1 e ${MAX_SIDE} pixels.`;
      return false;
    }
    result = { width: nw, height: nh };
    return true;
  });
  return ok ? result : null;
}
