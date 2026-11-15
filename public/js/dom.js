// Small DOM and browser-storage helpers shared by every view.

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// localStorage can be missing or blocked (private windows), so every access is guarded.
export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage not available */ } },
  getJSON(k, fallback) { try { return JSON.parse(store.get(k)) ?? fallback; } catch { return fallback; } },
  setJSON(k, v) { store.set(k, JSON.stringify(v)); },
};

// A set of keys remembered in localStorage (used for collapsed cards and income months).
export function storedSet(key, valid = () => true) {
  const saved = store.getJSON(key, []);
  const set = new Set(Array.isArray(saved) ? saved.filter(valid) : []);
  return {
    has: (k) => set.has(k),
    toggle(k) { if (set.has(k)) set.delete(k); else set.add(k); store.setJSON(key, [...set]); return set.has(k); },
  };
}

// Run handler when an element matching selector is clicked, or focused and Enter / Space is pressed.
// Clicks that land inside `skip` (for example a button within a clickable header) are ignored.
export function onActivate(root, selector, handler, skip = null) {
  root.addEventListener('click', (e) => {
    const el = e.target.closest(selector);
    if (el && !(skip && e.target.closest(skip))) handler(el, e);
  });
  root.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.(selector)) { e.preventDefault(); handler(e.target, e); }
  });
}

// A dialog form submitted with its Cancel button just closes.
export const cancelled = (e) => e.submitter?.value === 'cancel';
