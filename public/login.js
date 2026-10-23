import { Hct, SchemeTonalSpot, MaterialDynamicColors as DC, argbFromHex, hexFromArgb } from '/vendor-mcu.js';

// Use the theme and color chosen in the app (saved in this browser).
try {
  const p = JSON.parse(localStorage.getItem('ledgy.prefs') || '{}') || {};
  const root = document.documentElement;
  if (p.theme === 'light' || p.theme === 'dark') root.dataset.theme = p.theme;
  if (/^#[0-9a-f]{6}$/i.test(p.seed || '')) {
    const dark = p.theme === 'dark' || (p.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    const scheme = new SchemeTonalSpot(Hct.fromInt(argbFromHex(p.seed)), dark, 0);
    for (const r of ['primary', 'onPrimary', 'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer', 'error', 'errorContainer', 'onErrorContainer', 'surface', 'onSurface', 'onSurfaceVariant', 'surfaceContainerLow', 'surfaceContainerHigh', 'outline', 'outlineVariant']) {
      root.style.setProperty(`--md-sys-color-${r.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, hexFromArgb(DC[r].getArgb(scheme)));
    }
  }
} catch { /* keep the default theme */ }

const form = document.getElementById('loginForm');
const err = document.getElementById('loginErr');
const go = document.getElementById('loginGo');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  err.textContent = ''; go.disabled = true;
  try {
    const res = await fetch('/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Ledgy': '1' },
      body: JSON.stringify({ username: form.username.value, password: form.password.value }),
    });
    if (res.ok) { location.replace('/'); return; }
    err.textContent = (await res.json().catch(() => null))?.error || 'Could not sign in.';
    form.password.value = ''; form.password.focus();
  } catch { err.textContent = 'Could not reach the server.'; }
  go.disabled = false;
});
