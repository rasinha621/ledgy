// Theme colors are light-dark()/oklch() values; resolve one to rgb() so canvas and Chart.js can use it.
const probe = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });

export function resolveColor(css) {
  const el = document.createElement('i'); el.style.color = css; document.body.append(el);
  const c = getComputedStyle(el).color; el.remove();
  probe.clearRect(0, 0, 1, 1); probe.fillStyle = c; probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data; return `rgb(${r}, ${g}, ${b})`;
}
export const cssVar = (name) => resolveColor(`var(${name})`);

// n shades of the savings color, fading toward the surface color.
export const savingsShades = (n) => shades('--savings', n);
export function shades(varName, n) {
  const base = cssVar(varName); const bg = cssVar('--surface');
  return Array.from({ length: n }, (_, i) => resolveColor(`color-mix(in oklch, ${base} ${Math.round(100 - (i * 55) / Math.max(n, 1))}%, ${bg})`));
}
