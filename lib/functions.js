export function hideTip() { clearTimeout(tipTimer); tipEl.classList.remove('on'); tipFor = null; }

export function showTip(el) {
  const text = el.getAttribute('title') || el.dataset.tip;
  if (el.hasAttribute('title')) { // Take over from the browser tooltip and keep the text for assistive tech
    el.dataset.tip = text; el.removeAttribute('title');
    if (!el.getAttribute('aria-label') && !el.textContent.trim()) el.setAttribute('aria-label', text); else el.setAttribute('aria-description', text);
  }
  if (!el.dataset.tip) return;
  tipEl.textContent = el.dataset.tip; tipFor = el;
  const r = el.getBoundingClientRect(); const t = tipEl.getBoundingClientRect();
  const below = r.bottom + 8 + t.height < innerHeight;
  tipEl.style.top = `${below ? r.bottom + 8 : r.top - 8 - t.height}px`;
  tipEl.style.left = `${Math.max(8, Math.min(innerWidth - t.width - 8, r.left + r.width / 2 - t.width / 2))}px`;
  tipEl.classList.add('on');
}