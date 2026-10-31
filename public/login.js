import { applySeed } from '/seed.js';
import { syncIcon } from '/icon.js';

// Use the theme and seed color chosen in the app (saved in this browser).
try {
  const p = JSON.parse(localStorage.getItem('ledgy.prefs') || '{}') || {};
  const root = document.documentElement;
  if (p.theme === 'light' || p.theme === 'dark') root.dataset.theme = p.theme;
  applySeed(root, p.seed);
} catch { /* keep the default theme */ }
syncIcon();

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
