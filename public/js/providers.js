// The Providers dialog: credit cards, bank accounts and utility providers.
// Cards and banks are static mock-ups for now. Nothing here is saved or connected to the budget.
// Utility providers can be typed in, but only live in memory until the page is reloaded.
import { $, $$, esc } from './dom.js';

const MOCK_CARDS = [
  { name: 'Everyday Rewards Visa', issuer: 'Chase', last4: '4821', due: '15th' },
  { name: 'Travel Mastercard', issuer: 'Capital One', last4: '9034', due: '2nd' },
];
const MOCK_BANKS = [
  { name: 'Primary Checking', bank: 'Ally Bank', type: 'Checking', last4: '1127' },
  { name: 'Emergency Fund', bank: 'Marcus', type: 'Savings', last4: '6650' },
];

const blank = () => ({ name: '', account: '' });
const utilities = [blank()];

const field = (attrs, val, label) => `<label class="tf"><input type="text" maxlength="60" autocomplete="off" ${attrs} value="${esc(val)}" placeholder=" "><span>${label}</span></label>`;
const mock = (val, label) => field('disabled', val, label);

const cardsHtml = () => `<p class="muted">Preview only. Credit cards are not connected to your budget yet.</p>
  ${MOCK_CARDS.map((c) => `<fieldset><legend>${esc(c.name)}</legend><div class="grid3">
    ${mock(c.issuer, 'Issuer')}${mock(`•••• ${c.last4}`, 'Card number')}${mock(c.due, 'Payment due day')}
  </div></fieldset>`).join('')}
  <div><button type="button" class="btn tonal" disabled>Add credit card</button></div>`;

const banksHtml = () => `<p class="muted">Preview only. Bank accounts are not connected to your budget yet.</p>
  ${MOCK_BANKS.map((b) => `<fieldset><legend>${esc(b.name)}</legend><div class="grid3">
    ${mock(b.bank, 'Bank')}${mock(b.type, 'Account type')}${mock(`•••• ${b.last4}`, 'Account number')}
  </div></fieldset>`).join('')}
  <div><button type="button" class="btn tonal" disabled>Add bank account</button></div>`;

const utilsHtml = () => `<p class="muted">Add each utility provider with your account number.</p>
  ${utilities.map((u, i) => `<div class="grid3" style="grid-template-columns:1fr 1fr auto;align-items:center">
    ${field(`data-u="${i}" data-k="name"`, u.name, 'Provider name')}
    ${field(`data-u="${i}" data-k="account"`, u.account, 'Account number')}
    <button type="button" class="btn ghost" data-rm-u="${i}" aria-label="Remove provider">Remove</button>
  </div>`).join('')}
  <div><button type="button" class="btn tonal" id="addUtility">Add provider</button></div>`;

const renderUtils = () => { $('#provPanelUtils').innerHTML = utilsHtml(); };

const PANELS = { cards: '#provPanelCards', banks: '#provPanelBanks', utils: '#provPanelUtils' };
function showTab(name) {
  $$('#providersDlg .set-tab').forEach((t) => { const on = t.dataset.tab === name; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; });
  for (const [k, sel] of Object.entries(PANELS)) $(sel).hidden = k !== name;
}

function openProviders() {
  $('#provPanelCards').innerHTML = cardsHtml();
  $('#provPanelBanks').innerHTML = banksHtml();
  renderUtils();
  showTab('cards');
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

  const utils = $('#provPanelUtils');
  utils.addEventListener('input', (e) => { const i = e.target.dataset.u; if (i !== undefined) utilities[i][e.target.dataset.k] = e.target.value; });
  utils.addEventListener('click', (e) => {
    if (e.target.closest('#addUtility')) { utilities.push(blank()); renderUtils(); utils.querySelector(`[data-u="${utilities.length - 1}"]`).focus(); return; }
    const rm = e.target.closest('[data-rm-u]');
    if (rm) { utilities.splice(+rm.dataset.rmU, 1); if (!utilities.length) utilities.push(blank()); renderUtils(); }
  });
}
