/**
 * Ícones de traço (20×20) que herdam a cor do texto, com detalhes coloridos
 * como no Paint (classes f-* e s-* em styles.css, ajustadas ao tema).
 */
const PATHS = {
  selectRect: '<rect x="3" y="4" width="14" height="12" rx="1" stroke-dasharray="2.5 2"/>',
  selectFree:
    '<path d="M6 4c4-2 10-1 10 3s-5 3-6 6-4 4-6 2-2-9 2-11z" stroke-dasharray="2.5 2"/>',
  crop: '<path d="M6 2v12h12M2 6h12v12"/>',
  resize: '<rect x="3" y="7" width="10" height="10" rx="1"/><path d="M10 3h7v7M17 3l-6 6" class="s-blue"/>',
  rotate: '<path d="M4 10a6 6 0 1 0 2-4.5" class="s-blue"/><path d="M3 3v4h4" class="s-blue"/>',
  rotateRight: '<path d="M16 10a6 6 0 1 1-2-4.5" class="s-blue"/><path d="M17 3v4h-4" class="s-blue"/>',
  rotateLeft: '<path d="M4 10a6 6 0 1 0 2-4.5" class="s-blue"/><path d="M3 3v4h4" class="s-blue"/>',
  flipH: '<path d="M10 2v16"/><path d="M7 5 2 15h5z"/><path d="M13 5l5 10h-5z" class="f-blue"/>',
  flipV: '<path d="M2 10h16"/><path d="M5 7 15 2v5z"/><path d="M5 13l10 5v-5z" class="f-blue"/>',
  pencil:
    '<path d="M13.5 3.5l3 3L7 16H4v-3z" class="f-yellow"/><path d="M13.5 3.5l3 3-1.6 1.6-3-3z" class="f-pink"/><path d="M4 13l3 3H4z" class="f-wood"/><path d="M4 14.6V16h1.4z" fill="currentColor"/>',
  fill:
    '<path d="M3.3 9H15l1 1-5.5 5.5a1.5 1.5 0 0 1-2 0l-5-5a1.5 1.5 0 0 1-.2-1.5z" class="f-blue" stroke="none"/><path d="M9 3 3.5 8.5a1.5 1.5 0 0 0 0 2l5 5a1.5 1.5 0 0 0 2 0L16 10z"/><path d="M4 9h11"/><path d="M17 13s1.5 2 1.5 3a1.5 1.5 0 0 1-3 0c0-1 1.5-3 1.5-3z" class="f-red s-red"/>',
  text: '<path d="M4 17 9.5 3h1L16 17M6.3 12h7.4"/>',
  eraser:
    '<path d="M11.5 3.5 17 9l-4 4-5.5-5.5z" class="f-pink" stroke="none"/><path d="M8 17h9"/><path d="M11.5 3.5 17 9l-7.5 7.5H6L3 13.5z"/><path d="M7.5 7.5 13 13"/>',
  picker:
    '<path d="m10 6-6.5 6.5L3 17l4.5-.5L14 10" class="f-blue-soft"/><path d="M14 2.5a2.1 2.1 0 0 1 3 3L15 7.5l1 1-1.5 1.5-5-5L11 3.5l1 1z" class="f-blue"/>',
  brush:
    '<path d="M17 3 9 11" stroke-width="2.2" class="s-gray"/><path d="M8.5 11.5c-2-1-4 0-4.5 2S3 17 2.5 17.5c2 .5 5 0 6-1.5s1-3 0-4.5z" class="f-brown"/>',
  shapes: '<rect x="2.5" y="8.5" width="9" height="9" rx="1"/><circle cx="13" cy="7" r="4.5" class="f-blue-soft s-blue"/>',
  outline: '<rect x="3" y="3" width="14" height="14" rx="2"/>',
  shapeFill: '<rect x="3" y="3" width="14" height="14" rx="2" class="f-blue-soft"/>',
  size: '<path d="M3 5h14" stroke-width="1"/><path d="M3 10h14" stroke-width="2.2"/><path d="M3 15.5h14" stroke-width="3.5"/>',
  undo: '<path d="M8 4 4 8l4 4"/><path d="M4 8h8a4 4 0 0 1 0 8H9"/>',
  redo: '<path d="m12 4 4 4-4 4"/><path d="M16 8H8a4 4 0 0 0 0 8h3"/>',
  save: '<path d="M4.5 3h9L17 6.5v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 15.5v-11A1.5 1.5 0 0 1 4.5 3z"/><path d="M6.5 3v3.5h6V3"/><path d="M6 17v-5.5h8V17"/>',
  zoomIn: '<path d="M5 10h10M10 5v10"/>',
  zoomOut: '<path d="M5 10h10"/>',
  fit: '<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/>',
  chevron: '<path d="m5 8 5 5 5-5"/>',
  palette:
    '<circle cx="10" cy="10" r="7.5"/><circle cx="7" cy="7.5" r="1.4" class="f-red" stroke="none"/><circle cx="11" cy="6" r="1.4" class="f-yellow" stroke="none"/><circle cx="14" cy="9" r="1.4" class="f-blue" stroke="none"/><path d="M10 17.5c-1.5 0-2-1.5-1-2.5s0-3 2-3h3"/>',
  imageSize: '<rect x="2.5" y="4.5" width="15" height="11" rx="1"/><path d="m2.5 13 4-4 3 3 2-2 6 5"/>',
  removeBg:
    '<path d="M7 17c0-3 1.5-4.5 3-4.5s3 1.5 3 4.5" class="f-blue-soft s-blue"/><circle cx="10" cy="8.5" r="2.5" class="f-blue-soft s-blue"/><path d="M3 6V4.5A1.5 1.5 0 0 1 4.5 3H6M14 3h1.5A1.5 1.5 0 0 1 17 4.5V6M17 14v1.5a1.5 1.5 0 0 1-1.5 1.5H14M6 17H4.5A1.5 1.5 0 0 1 3 15.5V14" stroke-dasharray="2 1.5"/>',
  layers:
    '<path d="m10 3 7 3.5-7 3.5-7-3.5z" class="f-blue-soft s-blue"/><path d="m3 10 7 3.5 7-3.5"/><path d="m3 13.5 7 3.5 7-3.5"/>',
  cursor: '<path d="M5 3v12l3.5-3.5L11 17l2-1-2.5-5H15z"/>',
  selection: '<rect x="3" y="4" width="14" height="12" rx="1" stroke-dasharray="2.5 2"/>',
};

export type IconName = keyof typeof PATHS;

export function icon(name: IconName, size = 20): string {
  return `<svg class="icon" viewBox="0 0 20 20" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
}
