// jportal's green/red month calendar (ui/components/Calendar.kt): green day,
// red day struck through, split disc for a mixed day. arrows step between the
// months that had classes. tapping a day calls onSelect(iso | null).
import { h, render } from '../../ui/dom.js';
import { icon } from '../../ui/components.js';
import { MONTHS } from '../../domain/attendance.js';

export const CALENDAR_CSS = `
.att-cal .mhead { display: flex; align-items: center; padding: 0 0 0 8px; }
.att-cal .mhead .title { flex: 1; }
.att-cal .mhead .iconbtn { width: 48px; height: 48px; color: var(--on-surface); }
.att-cal .mhead .iconbtn[disabled] { color: var(--on-surface-variant); opacity: .45; cursor: default; }
.att-cal .mhead .iconbtn[disabled]:active { background: none; }
.att-cal .prev svg { transform: rotate(180deg); }
.att-cal .wk, .att-cal .grid { display: grid; grid-template-columns: repeat(7, 1fr); }
.att-cal .wk div { text-align: center; font-size: 11px; line-height: 16px; font-weight: 600; color: var(--on-surface-variant); padding: 6px 0 4px; }
.att-cal .cell { aspect-ratio: 1 / 1; padding: 3px; display: block; width: 100%; }
.att-cal .cell .disc { width: 100%; height: 100%; border-radius: 50%; display: grid; place-items: center; transform: scale(.86); transition: transform .2s cubic-bezier(.2,.8,.2,1); font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--on-surface-variant); position: relative; }
.att-cal .cell .disc span { opacity: .6; }
.att-cal .cell.p .disc { background: var(--good-container); color: var(--on-tertiary-container); }
.att-cal .cell.a .disc { background: var(--error-container); color: var(--on-error-container); }
.att-cal .cell.m .disc { background: linear-gradient(to right, var(--good-container) 50%, var(--error-container) 50%); color: var(--on-surface); }
.att-cal .cell.p .disc span, .att-cal .cell.a .disc span, .att-cal .cell.m .disc span { opacity: 1; }
.att-cal .cell.a .disc span { text-decoration: line-through; }
.att-cal .cell.today .disc { box-shadow: inset 0 0 0 1.5px var(--outline-variant); }
.att-cal .cell.sel .disc { transform: scale(1); box-shadow: inset 0 0 0 2.5px var(--primary); }
`;

const pad = (n) => String(n).padStart(2, '0');

/**
 * marks: Map('YYYY-MM-DD' -> 'present'|'absent'|'mixed'), today: 'YYYY-MM-DD'
 * returns the calendar element; selection lives inside it
 */
export function monthCalendar(marks, today, onSelect) {
  const keys = [...marks.keys()].sort();
  if (!keys.length) return null;
  const ym = (iso) => { const [y, m] = iso.split('-').map(Number); return y * 12 + (m - 1); };
  const first = ym(keys[0]), last = ym(keys.at(-1));
  let page = last;
  let selected = null;
  const el = h('div', { class: 'att-cal' });

  function draw() {
    const y = Math.floor(page / 12), m = page % 12;
    const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const lead = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7; // monday first
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(h('div', { class: 'cell' }));
    for (let d = 1; d <= days; d++) {
      const iso = `${y}-${pad(m + 1)}-${pad(d)}`;
      const mark = marks.get(iso);
      const cls = mark === 'present' ? 'p' : mark === 'absent' ? 'a' : mark === 'mixed' ? 'm' : '';
      const spoken = mark === 'present' ? 'present' : mark === 'absent' ? 'absent' : mark === 'mixed' ? 'partly present' : 'no class';
      cells.push(h('button', {
        class: ['cell', cls, iso === today && !mark && 'today', iso === selected && 'sel'],
        'aria-label': `${d} ${MONTHS[m]}, ${spoken}`, 'aria-pressed': String(iso === selected),
        onclick: () => { selected = selected === iso ? null : iso; draw(); onSelect(selected); },
      }, h('div', { class: 'disc' }, h('span', null, String(d)))));
    }
    render(el,
      h('div', { class: 'mhead' },
        h('div', { class: 'title' }, `${MONTHS[m]} ${y}`),
        h('button', { class: 'iconbtn prev', 'aria-label': 'Previous month', disabled: page <= first, onclick: () => { if (page > first) { page--; draw(); } } }, icon('chevron_right')),
        h('button', { class: 'iconbtn next', 'aria-label': 'Next month', disabled: page >= last, onclick: () => { if (page < last) { page++; draw(); } } }, icon('chevron_right'))),
      h('div', { class: 'wk' }, ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => h('div', null, d))),
      h('div', { class: 'grid' }, cells));
  }
  draw();
  return el;
}
