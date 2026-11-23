// Plain tooltips that replace the browser's native title tooltips (shown on hover after a delay, or on keyboard focus).
const tipEl = Object.assign(document.createElement('div'), { id: 'tip', role: 'tooltip' });
let tipTimer = null; let tipFor = null;

function hideTip() { clearTimeout(tipTimer); tipEl.classList.remove('on'); tipFor = null; }

// Take over from the browser tooltip and keep the text for assistive tech.
function adopt(el) {
  const text = el.getAttribute('title');
  if (text === null) return;
  el.removeAttribute('title');
  if (!text) return;
  el.dataset.tip = text;
  if (!el.getAttribute('aria-label') && !el.textContent.trim()) el.setAttribute('aria-label', text); else el.setAttribute('aria-description', text);
}

function showTip(el) {
  adopt(el);
  if (!el.dataset.tip) return;
  tipEl.textContent = el.dataset.tip; tipFor = el;
  const r = el.getBoundingClientRect(); const t = tipEl.getBoundingClientRect();
  const below = r.bottom + 8 + t.height < innerHeight;
  tipEl.style.top = `${below ? r.bottom + 8 : r.top - 8 - t.height}px`;
  tipEl.style.left = `${Math.max(8, Math.min(innerWidth - t.width - 8, r.left + r.width / 2 - t.width / 2))}px`;
  tipEl.classList.add('on');
}

const tipTarget = (e) => e.target.closest?.('[title]:not([title=""]), [data-tip]');

export function initTooltips() {
  document.body.append(tipEl);
  document.addEventListener('pointerover', (e) => {
    const el = tipTarget(e); if (!el) return;
    // A title on a parent (like a card header's "Expand") would show natively once this element's title is taken over.
    for (let a = el.parentElement?.closest('[title]'); a; a = a.parentElement?.closest('[title]')) adopt(a);
    if (el === tipFor) return;
    hideTip();
    tipTimer = setTimeout(() => showTip(el), 500);
  });
  document.addEventListener('pointerout', (e) => { if (tipTarget(e)) hideTip(); });
  document.addEventListener('focusin', (e) => { const el = tipTarget(e); if (el && el.matches(':focus-visible') && el.tagName !== 'INPUT') { hideTip(); showTip(el); } });
  document.addEventListener('focusout', hideTip);
  document.addEventListener('pointerdown', hideTip);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); });
  addEventListener('scroll', hideTip, true);
}
