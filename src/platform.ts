export const APP_NAME = "Pincel";

export const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Tamanho de uma imagem nova, como no Paint. */
export const DEFAULT_WIDTH = 1152;
export const DEFAULT_HEIGHT = 648;

/** Maior lado aceito para a imagem (limite prático dos canvas nos webviews). */
export const MAX_SIDE = 16384;
