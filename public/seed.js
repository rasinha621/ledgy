// One seed color drives the whole theme. The page only needs the seed's OKLCH hue and chroma:
// the stylesheet derives the accent, tinted surfaces and chart colors from --seed-h and --seed-c.
const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const gam = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

export function hexToOklch(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(a, bb), h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 };
}

// Reduce chroma until the color fits in sRGB.
export function oklchToHex(L, C, H) {
  for (let c = C; c >= 0; c -= 0.002) {
    const a = c * Math.cos((H * Math.PI) / 180); const b = c * Math.sin((H * Math.PI) / 180);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
    if (rgb.every((v) => v >= -0.0005 && v <= 1.0005)) return `#${rgb.map((v) => Math.round(gam(Math.min(1, Math.max(0, v))) * 255).toString(16).padStart(2, '0')).join('')}`;
  }
  return '#000000';
}

export const isHex = (s) => /^#[0-9a-f]{6}$/i.test(s || '');

// Point the page's theme at a seed color, or back to the default blue when seed is null.
export function applySeed(root, seed) {
  if (!isHex(seed)) { root.style.removeProperty('--seed-h'); root.style.removeProperty('--seed-c'); return; }
  const { h, c } = hexToOklch(seed);
  root.style.setProperty('--seed-h', h.toFixed(1));
  root.style.setProperty('--seed-c', Math.min(c, 0.2).toFixed(3));
}
