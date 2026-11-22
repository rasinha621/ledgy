// The Providers dialog: subscriptions and utility providers.
// Nothing here is saved or connected to the budget; entries live in memory until the page is reloaded.
import { $, $$, esc } from './dom.js';
import { usd } from './format.js';

// Payments per year for each cadence. Totals are summed in whole cents, then divided, so rounding never drifts.
const CADENCES = { weekly: ['Weekly', 52], monthly: ['Monthly', 12], quarterly: ['Quarterly', 4], yearly: ['Yearly', 1] };
const blankSub = () => ({ name: '', price: '', cadence: 'monthly' });
const subs = [blankSub()];
const cents = (s) => { const n = Number(s.price); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0; };
const yearlyCents = (s) => cents(s) * CADENCES[s.cadence][1];

const blank = () => ({ name: '', account: '' });
const utilities = [blank()];

const field = (attrs, val, label) => `<label class="tf"><input type="text" maxlength="60" autocomplete="off" ${attrs} value="${esc(val)}" placeholder=" "><span>${label}</span></label>`;

const opts = (cur) => Object.entries(CADENCES).map(([k, [l]]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${l}</option>`).join('');
const subsHtml = () => `<p class="muted">List each subscription with its price and how often you pay. Yearly and other cadences are converted to a monthly cost.</p>
  ${subs.map((x, i) => `<div class="grid3" style="grid-template-columns:2fr 1fr 1fr auto;align-items:center">
    ${field(`data-s="${i}" data-k="name"`, x.name, 'Service')}
    <label class="tf"><input type="number" min="0" step="0.01" inputmode="decimal" autocomplete="off" data-s="${i}" data-k="price" value="${esc(x.price)}" placeholder=" "><span>Price</span></label>
    <label class="tf sel"><select data-s="${i}" data-k="cadence" aria-label="Payment cadence">${opts(x.cadence)}</select><span>Cadence</span></label>
    <button type="button" class="btn ghost" data-rm-s="${i}" aria-label="Remove subscription">Remove</button>
  </div>`).join('')}
  <div><button type="button" class="btn tonal" id="addSub">Add subscription</button></div>
  <div id="subTotals"></div>`;
const totalsHtml = () => {
  const yr = subs.reduce((t, x) => t + yearlyCents(x), 0);
  return `<p><strong>Monthly total:</strong> ${usd(yr / 12 / 100)}</p><p><strong>Yearly total:</strong> ${usd(yr / 100)}</p>`;
};
const renderSubTotals = () => { $('#subTotals').innerHTML = totalsHtml(); };
const renderSubs = () => { $('#provPanelSubs').innerHTML = subsHtml(); renderSubTotals(); };

const utilsHtml = () => `<p class="muted">Add each utility provider and its account number.</p>
  ${utilities.map((u, i) => `<div class="grid3" style="grid-template-columns:1fr 1fr auto;align-items:center">
    ${field(`data-u="${i}" data-k="name"`, u.name, 'Provider name')}
    ${field(`data-u="${i}" data-k="account"`, u.account, 'Account number')}
    <button type="button" class="btn ghost" data-rm-u="${i}" aria-label="Remove provider">Remove</button>
  </div>`).join('')}
  <div><button type="button" class="btn tonal" id="addUtility">Add provider</button></div>`;

const renderUtils = () => { $('#provPanelUtils').innerHTML = utilsHtml(); };

const PANELS = { subs: '#provPanelSubs', utils: '#provPanelUtils' };
function showTab(name) {
  $$('#providersDlg .set-tab').forEach((t) => { const on = t.dataset.tab === name; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; });
  for (const [k, sel] of Object.entries(PANELS)) $(sel).hidden = k !== name;
}

function openProviders() {
  renderSubs();
  renderUtils();
  showTab('subs');
  $('#providersDlg').showModal();
}

export function initProviders() {
  $('#providersBtn').addEventListener('click', openProviders);
  $('#providersClose').addEventListener('click', () => $('#providersDlg').close());
  // Enter in a field should not submit the form.
  $('#providersForm').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) e.preventDefault(); });

  const tabs = $('#providersDlg .set-tabs');
  tabs.addEventListener('click', (e) => { const t = e.target.closest('.set-tab'); if (t) showTab(t.dataset.tab); });
  tabs.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const all = $$('#providersDlg .set-tab');
    const cur = all.findIndex((t) => t.getAttribute('aria-selected') === 'true');
    const next = all[(cur + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length]; showTab(next.dataset.tab); next.focus();
  });

  const sp = $('#provPanelSubs');
  const onSub = (e) => { const i = e.target.dataset.s; if (i === undefined) return; subs[i][e.target.dataset.k] = e.target.value; renderSubTotals(); };
  sp.addEventListener('input', onSub);
  sp.addEventListener('change', onSub);
  sp.addEventListener('click', (e) => {
    if (e.target.closest('#addSub')) { subs.push(blankSub()); renderSubs(); sp.querySelector(`[data-s="${subs.length - 1}"]`).focus(); return; }
    const rm = e.target.closest('[data-rm-s]');
    if (rm) { subs.splice(+rm.dataset.rmS, 1); if (!subs.length) subs.push(blankSub()); renderSubs(); }
  });

  const utils = $('#provPanelUtils');
  utils.addEventListener('input', (e) => { const i = e.target.dataset.u; if (i !== undefined) utilities[i][e.target.dataset.k] = e.target.value; });
  utils.addEventListener('click', (e) => {
    if (e.target.closest('#addUtility')) { utilities.push(blank()); renderUtils(); utils.querySelector(`[data-u="${utilities.length - 1}"]`).focus(); return; }
    const rm = e.target.closest('[data-rm-u]');
    if (rm) { utilities.splice(+rm.dataset.rmU, 1); if (!utilities.length) utilities.push(blank()); renderUtils(); }
  });
}
