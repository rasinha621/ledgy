// Draws the app icon (a three-segment gauge with a dollar sign) in the current theme's data colors,
// and applies it to the favicon and every .logo image.
const ARC = ['M8.22 23.78A11 11 0 0 1 7.45 9.08', 'M8.22 8.22A11 11 0 0 1 22.92 7.45', 'M23.78 8.22A11 11 0 0 1 24.55 22.92'];
const DOLLAR = 'M19 12.8c-.5-.9-1.6-1.4-3-1.4-1.7 0-2.9.8-2.9 2.1 0 3 6 1.5 6 4.6 0 1.3-1.3 2.2-3.1 2.2-1.5 0-2.6-.6-3.1-1.6M16 9.8v12.4';

// Custom properties stay unresolved (light-dark, calc), so let the browser resolve them through `color`.
function resolve(name) {
  const el = document.createElement('i');
  el.style.color = `var(${name})`;
  document.body.append(el);
  const c = getComputedStyle(el).color;
  el.remove();
  return c;
}

export function syncIcon() {
  const colors = ['--wants', '--needs', '--savings'].map(resolve);
  const arcs = ARC.map((d, i) => `<path d="${d}" stroke="${colors[i]}"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="7" fill="#1e293b"/><g stroke-width="3" stroke-linecap="round">${arcs}</g><path d="${DOLLAR}" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  document.querySelector('link[rel="icon"]').href = url;
  document.querySelectorAll('img.logo').forEach((img) => { img.src = url; });
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncIcon);
