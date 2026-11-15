// Settings > Customize: the seed color picker. Preset chips, plus a custom color from OKLCH hue and chroma sliders.
import { hexToOklch, oklchToHex, isHex } from '/seed.js';
import { $, $$ } from './dom.js';
import { SEED_PRESETS, DEFAULT_SEED } from './prefs.js';

let draft = null; let panelOpen = false; let onChange = () => {};
export const draftSeed = () => draft;

const hueTrack = () => `linear-gradient(90deg, ${Array.from({ length: 13 }, (_, i) => `oklch(.7 .15 ${i * 30})`).join(', ')})`;
const chromaTrack = (h) => `linear-gradient(90deg, oklch(.6 0 ${h}), oklch(.6 .2 ${h}))`;
const form = () => $('#settingsForm');

function renderChips() {
  const chip = (seed, label) => `<button type="button" class="seed${draft === seed ? ' on' : ''}" data-seed="${seed || ''}" aria-label="${label}" aria-pressed="${draft === seed}" style="--c:${seed || DEFAULT_SEED}">${seed ? '' : '<span>A</span>'}</button>`;
  const custom = draft && !SEED_PRESETS.includes(draft);
  $('#seedChips').innerHTML = chip(null, 'Default') + SEED_PRESETS.map((c) => chip(c, c)).join('')
    + `<button type="button" class="seed custom${custom ? ' on' : ''}" data-seed="custom" aria-label="Custom color" aria-pressed="${!!custom}" style="--c:${custom ? draft : 'transparent'}">+</button>`;
  $('#seedCustom').hidden = !panelOpen;
}

function syncSliders() {
  const f = form(); const { h, c } = hexToOklch(draft || DEFAULT_SEED);
  f.seedHue.value = Math.round(h); f.seedChroma.value = Math.min(c, 0.2).toFixed(3); f.seedHex.value = draft || DEFAULT_SEED;
  f.seedHue.style.setProperty('--track', hueTrack()); f.seedChroma.style.setProperty('--track', chromaTrack(Math.round(h)));
}

// Start editing from the saved seed (null = default) when the settings dialog opens.
export function resetSeedPicker(seed) { draft = seed; panelOpen = false; renderChips(); }

export function initSeedPicker(changed) {
  onChange = changed;
  $('#seedChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-seed]'); if (!b) return;
    if (b.dataset.seed === 'custom') { panelOpen = !panelOpen; if (!draft) draft = DEFAULT_SEED; syncSliders(); } else { draft = b.dataset.seed || null; panelOpen = false; }
    renderChips(); onChange();
  });
  $('#seedCustom').addEventListener('input', (e) => {
    const f = form();
    if (e.target === f.seedHex) {
      if (!isHex(f.seedHex.value)) return;
      draft = f.seedHex.value.toLowerCase();
    } else {
      draft = oklchToHex(0.55, Number(f.seedChroma.value), Number(f.seedHue.value));
      f.seedHex.value = draft;
    }
    f.seedChroma.style.setProperty('--track', chromaTrack(Math.round(hexToOklch(draft).h)));
    const chip = $('#seedChips .custom'); chip.style.setProperty('--c', draft); chip.classList.add('on');
    $$('#seedChips .seed:not(.custom)').forEach((b) => b.classList.remove('on'));
    onChange();
  });
}
