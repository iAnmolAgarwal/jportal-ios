// attendance goal picker, after TargetSheet.kt: a ring that follows a 50-100 slider
import { h, render } from '../../ui/dom.js';
import { sheet } from '../../ui/components.js';
import { prefs } from '../../core/store.js';
import { stillRing } from './common.js';

export const TARGET_CSS = `
.att-sheet { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 0 4px 8px; }
.att-sheet .headline-sm { text-align: center; }
.att-sheet .ringbox { width: 120px; height: 120px; }
.att-sheet .val { font-size: 33px; line-height: 36px; letter-spacing: -1.1px; }
.att-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 44px; background: transparent; margin: 0; touch-action: pan-x; }
.att-slider:focus { outline: none; }
.att-slider::-webkit-slider-runnable-track { height: 16px; border-radius: 8px; background: linear-gradient(to right, var(--primary) 0 var(--fill), var(--secondary-container) var(--fill) 100%); }
.att-slider::-moz-range-track { height: 16px; border-radius: 8px; background: linear-gradient(to right, var(--primary) 0 var(--fill), var(--secondary-container) var(--fill) 100%); }
.att-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 4px; height: 44px; margin-top: -14px; border-radius: 2px; background: var(--primary); box-shadow: 0 0 0 6px var(--sc-low); }
.att-slider::-moz-range-thumb { width: 4px; height: 44px; border: 0; border-radius: 2px; background: var(--primary); }
.att-sheet .actions { align-self: stretch; display: flex; justify-content: flex-end; }
`;

/** opens the sheet; every change is saved to prefs('target') as it lands */
export function openTargetSheet() {
  let value = Number(prefs.get('target')) || 75;
  const ringBox = h('div', { class: 'ringbox' });
  const drawRing = () => render(ringBox, stillRing({ percent: value, target: 75, size: 120, stroke: 12 },
    h('div', { class: 'att-num val' }, `${value}%`)));
  const fill = () => ((value - 50) / 50) * 100 + '%';
  const slider = h('input', {
    class: 'att-slider', type: 'range', min: 50, max: 100, step: 1, value,
    'aria-label': 'Attendance goal', '--fill': fill(),
    oninput: (e) => {
      const v = Math.round(Number(e.target.value));
      if (v === value) return;
      value = v;
      slider.style.setProperty('--fill', fill());
      slider.setAttribute('aria-valuetext', `${value} percent`);
      drawRing();
    },
    onchange: () => prefs.set('target', value),
  });
  drawRing();
  const close = sheet(h('div', { class: 'att-sheet' },
    h('div', { class: 'headline-sm' }, 'Attendance goal'),
    h('div', { class: 'body-md muted' }, 'Subjects under this get flagged.'),
    ringBox,
    slider,
    h('div', { class: 'actions' },
      h('button', { class: 'btn att-done', onclick: () => { if (Number(prefs.get('target')) !== value) prefs.set('target', value); close(); } }, 'Done'))));
  return close;
}
