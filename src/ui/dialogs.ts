import { APP_NAME } from "../platform";

let openModals = 0;

export const isModalOpen = () => openModals > 0;

interface DialogButton<T> {
  label: string;
  value: T;
  primary?: boolean;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

/** Caixa de diálogo modal; Esc devolve `cancel`. */
export function showDialog<T>(title: string, message: string, buttons: DialogButton<T>[], cancel: T): Promise<T> {
  return new Promise((resolve) => {
    openModals++;
    const previousFocus = document.activeElement as HTMLElement | null;
    const overlay = element("div", "overlay");
    const box = element("div", "dialog");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    const heading = element("h2");
    heading.textContent = title;
    const text = element("p");
    text.textContent = message;
    const row = element("div", "dialog-buttons");

    const finish = (value: T) => {
      openModals--;
      overlay.remove();
      previousFocus?.focus();
      resolve(value);
    };

    let primary: HTMLButtonElement | null = null;
    for (const b of buttons) {
      const button = element("button", b.primary ? "primary" : "");
      button.textContent = b.label;
      button.addEventListener("click", () => finish(b.value));
      if (b.primary) primary = button;
      row.append(button);
    }

    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(cancel);
      } else if (e.key === "Tab") {
        // Mantém o foco dentro da caixa.
        const all = [...row.querySelectorAll("button")];
        const index = all.indexOf(document.activeElement as HTMLButtonElement);
        e.preventDefault();
        all[(index + (e.shiftKey ? all.length - 1 : 1)) % all.length]?.focus();
      }
    });

    box.append(heading, text, row);
    overlay.append(box);
    document.body.append(overlay);
    (primary ?? row.querySelector("button"))?.focus();
  });
}

export type SaveChoice = "save" | "discard" | "cancel";

export function askToSave(name: string): Promise<SaveChoice> {
  return showDialog<SaveChoice>(
    APP_NAME,
    `Deseja salvar as alterações em "${name}"?`,
    [
      { label: "Salvar", value: "save", primary: true },
      { label: "Não salvar", value: "discard" },
      { label: "Cancelar", value: "cancel" },
    ],
    "cancel",
  );
}

export function showMessage(title: string, message: string): Promise<void> {
  return showDialog(title, message, [{ label: "OK", value: undefined, primary: true }], undefined);
}

export interface PopupOption<T> {
  label: string;
  value: T;
  checked?: boolean;
}

/**
 * Painel suspenso preso a `anchor` (acima ou abaixo). Fecha ao clicar fora,
 * com Esc ou quando a janela perde o foco. Devolve a função que o fecha.
 */
export function openPopover(
  anchor: HTMLElement,
  content: HTMLElement,
  placement: "above" | "below" = "below",
  onClose: () => void = () => {},
): () => void {
  content.classList.add("popover");
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener("pointerdown", onOutside, true);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("blur", close);
    content.remove();
    onClose();
  };
  const onOutside = (e: Event) => {
    const target = e.target as Node;
    if (!content.contains(target) && !anchor.contains(target)) close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  document.body.append(content);
  const rect = anchor.getBoundingClientRect();
  const left = Math.min(rect.left, window.innerWidth - content.offsetWidth - 8);
  content.style.left = `${Math.max(8, left)}px`;
  if (placement === "above") content.style.bottom = `${window.innerHeight - rect.top + 4}px`;
  else content.style.top = `${rect.bottom + 4}px`;

  document.addEventListener("pointerdown", onOutside, true);
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("blur", close);
  return close;
}

/** Item de menu com marca de seleção opcional e atalho. */
export function menuItem(label: string, onClick: () => void, checked?: boolean, keys?: string): HTMLButtonElement {
  const item = element("button", "menu-item");
  item.setAttribute("role", checked === undefined ? "menuitem" : "menuitemradio");
  if (checked !== undefined) item.setAttribute("aria-checked", String(checked));
  const check = element("span", "menu-check");
  check.textContent = checked ? "✓" : "";
  const text = element("span", "menu-label");
  text.textContent = label;
  const shortcut = element("span", "menu-keys");
  shortcut.textContent = keys ?? "";
  item.append(check, text, shortcut);
  item.addEventListener("mousedown", (e) => e.preventDefault());
  item.addEventListener("click", onClick);
  return item;
}

export function menuSeparator(): HTMLElement {
  return element("div", "menu-separator");
}

/** Menu suspenso de opções; devolve a escolhida ou null. */
export function popupMenu<T>(
  anchor: HTMLElement,
  options: PopupOption<T>[],
  placement: "above" | "below" = "above",
): Promise<T | null> {
  return new Promise((resolve) => {
    const menu = element("div", "popup-menu");
    menu.setAttribute("role", "menu");
    let chosen: T | null = null;
    const close = openPopover(anchor, menu, placement, () => resolve(chosen));
    for (const option of options) {
      menu.append(
        menuItem(option.label, () => {
          chosen = option.value;
          close();
        }, !!option.checked),
      );
    }
  });
}

/**
 * Caixa de diálogo com um formulário. `accept` valida e aplica; se devolver
 * false a caixa continua aberta. Enter confirma e Esc cancela.
 */
export function formDialog(title: string, body: HTMLElement, accept: () => boolean, okLabel = "OK"): Promise<boolean> {
  return new Promise((resolve) => {
    openModals++;
    const previousFocus = document.activeElement as HTMLElement | null;
    const overlay = element("div", "overlay");
    const box = element("form", "dialog form-dialog");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    const heading = element("h2");
    heading.textContent = title;
    const row = element("div", "dialog-buttons");
    const ok = element("button", "primary");
    ok.type = "submit";
    ok.textContent = okLabel;
    const cancel = element("button");
    cancel.type = "button";
    cancel.textContent = "Cancelar";
    row.append(ok, cancel);

    const finish = (value: boolean) => {
      openModals--;
      overlay.remove();
      previousFocus?.focus();
      resolve(value);
    };
    box.addEventListener("submit", (e) => {
      e.preventDefault();
      if (accept()) finish(true);
    });
    cancel.addEventListener("click", () => finish(false));
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        finish(false);
      }
    });

    box.append(heading, body, row);
    overlay.append(box);
    document.body.append(overlay);
    const first = body.querySelector<HTMLElement>("input, select, button") ?? ok;
    first.focus();
    if (first instanceof HTMLInputElement) first.select();
  });
}

/** Cria elementos com atributos e filhos, para montar formulários curtos. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  Object.assign(el, props);
  el.append(...children);
  return el;
}
