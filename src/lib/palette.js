// Cinematic colour sets for generated poster art and ambient glows.
export const PALETTES = [
  ["#ff6b3d", "#7a1fa2", "#120a24"],
  ["#2de2e6", "#0b3d91", "#050b1f"],
  ["#ffd23f", "#ee4266", "#1a0a12"],
  ["#c6ff3d", "#0f7b5f", "#04140f"],
  ["#ff4ecd", "#3a0ca3", "#0d0221"],
  ["#f7b267", "#a4161a", "#160304"],
];

export function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function paletteFor(seed = "") {
  return PALETTES[hash(seed) % PALETTES.length];
}
