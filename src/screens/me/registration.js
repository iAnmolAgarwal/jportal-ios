// subject choices and mooc status, read only. port of feature/registration/Registration.kt
import { h, render } from '../../ui/dom.js';
import { icon } from '../../ui/components.js';
import { api } from '../../core/api.js';
import {
  KIT_CSS, group, entry, sectionH, figure, fmt, rupees, nameCase, titleCase, semLabel,
  picked, semesterPicker, header, skeletons, errorState, staleBanner, emptyState,
} from './kit.js';

const CSS = `
.jm-choice { display: flex; align-items: center; gap: 14px; padding: 12px 16px; }
.jm-choice.off { opacity: .6; }
.jm-rank { width: 44px; height: 44px; border-radius: 12px; flex: none; display: grid; place-items: center; font-weight: 700; font-size: 14px; background: var(--sc-high); color: var(--on-surface-variant); }
.jm-rank.got { background: var(--primary-container); color: var(--on-primary-container); }
.jm-cn { font-size: 16px; line-height: 22px; font-weight: 600; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.jm-cc { font-size: 12px; line-height: 16px; color: var(--on-surface-variant); }
.jm-allot { font-size: 12px; font-weight: 600; color: var(--on-surface-variant); margin-right: 8px; }
.jm-dues { display: flex; align-items: center; gap: 12px; padding: 16px; border-radius: 12px; background: var(--tertiary-container); color: var(--on-tertiary-container); font-weight: 600; font-size: 14px; margin-bottom: 8px; }
.jm-mooc { background: var(--sc-low); border-radius: var(--r-lg); padding: 20px; }
.jm-mooc + .jm-mooc { margin-top: 12px; }
.jm-mt { font-size: 16px; line-height: 22px; font-weight: 600; }
.jm-badge { display: flex; align-items: center; gap: 4px; font-size: 14px; font-weight: 600; flex: none; }
.jm-instead { display: inline-block; margin-top: 10px; padding: 6px 10px; border-radius: 8px; background: var(--sc-high); color: var(--on-surface-variant); font-size: 12px; line-height: 16px; }
.jm-stages { margin-top: 16px; }
.jm-stage { display: flex; gap: 12px; }
.jm-rail { width: 20px; flex: none; display: flex; flex-direction: column; align-items: center; padding-top: 2px; }
.jm-dot { width: 18px; height: 18px; border-radius: 50%; flex: none; display: grid; place-items: center; }
.jm-dot.done { background: var(--primary); color: var(--on-primary); }
.jm-dot.wait { border: 2px solid var(--outline); }
.jm-line { width: 2px; flex: 1; margin: 3px 0; border-radius: 1px; background: var(--outline-variant); }
.jm-line.done { background: var(--primary); }
.jm-st { font-size: 14px; line-height: 20px; font-weight: 600; }
.jm-ss { font-size: 12px; line-height: 16px; color: var(--on-surface-variant); }
`;

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

// ---------------------------------------------------------------- data

export const choiceRows = (res) => (res?.subjectpreferencegrid || []).map((c) => ({
  code: String(c.subjectcode || '').trim(),
  name: c.subjectdesc || '',
  basket: c.basketcode || '',
  basketName: c.basketdesc || '',
  credits: Number(c.credits) || 0,
  preference: Number(c.preference) || 0,
  allotted: c.running === 'Y',
  audit: c.auditsubject === 'Y',
  elective: c.electivetype === 'Y',
  frozenAt: c.freezeddatetime || '',
}));

/** "24-07-2026 12:29 PM" -> "24 Jul 2026" */
function frozenDay(s) {
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})/.exec(String(s).trim());
  return m ? `${Number(m[1])} ${MON[Number(m[2]) - 1]} ${m[3]}` : null;
}

/**
 * "Submitted on 24-Jul-2026 12:29 PM@D" or
 * "1. Review  Date:- 30-Jul-2026 02:31 PM  by SOME  NAME (REVIEW BY MOOCD )@D"
 */
export function parseStage(raw) {
  const s = String(raw || '');
  const at = s.lastIndexOf('@');
  const text = (at >= 0 ? s.slice(0, at) : s).replace(/\s+/g, ' ').trim().replace(/^\d+\.\s*/, '');
  if (!text) return null;
  const done = at >= 0 && s.slice(at + 1).trim() === 'D';
  const m = /^(.+?)\s+(?:on|Date:-)\s+(\d{1,2})-([A-Za-z]{3})-(\d{4}) (\d{1,2}):(\d{2}) ([AP]M)(?:\s+by\s+([^(]+))?/.exec(text);
  if (!m) return { title: text, at: null, by: null, done };
  // "d MMM yyyy, h:mm a"
  const when = `${Number(m[2])} ${m[3][0].toUpperCase()}${m[3].slice(1).toLowerCase()} ${m[4]}, ${Number(m[5])}:${m[6]} ${m[7]}`;
  return { title: m[1].trim(), at: when, by: (m[8] || '').trim() || null, done };
}

export function moocData(res) {
  const req = (r) => {
    const stages = (r.totalStages || []).map(parseStage).filter(Boolean);
    const rep = /\(([^-()]+)-(.+)\)/.exec(r.choicetype || '');
    return {
      code: r.subjectcode || '', name: r.subjectdesc || '', stages,
      replaces: rep ? [rep[1].trim(), rep[2].trim()] : null,
      approved: stages.some((s) => s.done && s.title.toLowerCase() === 'approved'),
    };
  };
  return {
    requests: (res?.totalsubjectDetailList || []).map(req),
    rejected: (res?.totalRejsubjectDetailList || []).map(req),
    dues: Number(res?.duesAmount) || 0,
  };
}

const choiceSems = () => api.choiceSemesters().then((r) => r?.registrationcodelist || []);
const moocSems = () => api.moocSemesters().then((r) => (Array.isArray(r) ? r : []));

// ---------------------------------------------------------------- registration rows

/** "Subject choices" and "MOOC status" rows with a one-line summary each, as on android's subjects tab */
export function registrationRows(ctx) {
  const choicesRow = h('div');
  const moocRow = h('div');
  const drawChoices = (sem, rows) => {
    const electives = rows ? new Set(rows.filter((c) => c.elective).map((c) => c.basket)).size : 0;
    const sub = sem ? [semLabel(sem.registrationcode), electives > 0 ? `${electives} ${electives === 1 ? 'elective' : 'electives'}` : null].filter(Boolean).join(' · ') : null;
    render(choicesRow, entry({ icon: 'checklist', title: 'Subject choices', subtitle: sub, onClick: () => ctx.nav.push('choices') }));
  };
  const drawMooc = (sem, m) => {
    let line = null;
    if (m) {
      const ok = m.requests.filter((r) => r.approved).length;
      const wait = m.requests.length - ok;
      line = [ok > 0 && `${ok} approved`, wait > 0 && `${wait} in review`, m.rejected.length > 0 && `${m.rejected.length} rejected`].filter(Boolean).join(' · ') || 'No requests';
    }
    const sub = sem ? [semLabel(sem.registrationcode), line].filter(Boolean).join(' · ') : null;
    render(moocRow, entry({ icon: 'cast_for_education', title: 'MOOC status', subtitle: sub, onClick: () => ctx.nav.push('mooc') }));
  };
  drawChoices(null, null);
  drawMooc(null, null);
  picked({ key: 'jm:choices', list: choiceSems, of: (s) => api.subjectChoices(s), onState: (s) => drawChoices(s.sem, s.data ? choiceRows(s.data) : null) });
  picked({ key: 'jm:mooc', list: moocSems, of: (s) => api.moocStatus(s), onState: (s) => drawMooc(s.sem, s.data !== undefined ? moocData(s.data) : null) });
  return group(choicesRow, moocRow);
}

// ---------------------------------------------------------------- shared page shell for picked pages

function pickedPage(ctx, { title, key, list, of, draw, isEmpty, emptyTitle, subtitleOf }) {
  const head = h('div');
  const body = h('div', null, skeletons(3, 72));
  const root = h('div', null, h('style', null, KIT_CSS + CSS), head, body);
  const drawHead = (sub) => render(head, header({ title, subtitle: sub || undefined, back: ctx.nav.back }));
  drawHead(null);
  const p = picked({
    key, list, of,
    onState: (s) => {
      drawHead(s.data ? subtitleOf?.(s.data) : null);
      const pick = semesterPicker(s.sems, s.sem, (sem) => p.pick(sem), s.data !== undefined ? s.at : 0);
      if (s.data === undefined) {
        if (s.error) render(body, pick, errorState(s.error, () => p.retry()));
        else render(body, pick, skeletons(3, 72));
        return;
      }
      const stale = s.error ? staleBanner(s.error) : null;
      if (!s.sem || isEmpty(s.data)) render(body, pick, stale, emptyState(emptyTitle));
      else render(body, pick, stale, draw(s.data));
    },
  });
  return root;
}

// ---------------------------------------------------------------- choices

function choiceRow(c, ranked) {
  const got = c.allotted;
  return h('div', { class: ['jm-choice', ranked && !got && 'off'] },
    ranked ? h('div', { class: ['jm-rank', got && 'got'] }, c.preference > 0 ? ordinal(c.preference) : '–') : h('span', { style: { width: '0' } }),
    h('div', { class: 'grow' },
      h('div', { class: 'jm-cn' }, titleCase(c.name)),
      h('div', { class: 'jm-cc' }, [c.code, c.audit && 'audit'].filter(Boolean).join(' · '))),
    ranked && got ? h('span', { style: { color: 'var(--primary)', display: 'flex' }, 'aria-label': 'Allotted' }, icon('check_circle', 18)) : null,
    figure(fmt(c.credits), 'credits'));
}

export function choices(ctx) {
  return pickedPage(ctx, {
    title: 'Subject choices',
    key: 'jm:choices',
    list: choiceSems,
    of: (s) => api.subjectChoices(s),
    isEmpty: (d) => choiceRows(d).length === 0,
    emptyTitle: 'No choices this semester',
    subtitleOf: (d) => { const day = choiceRows(d).map((c) => frozenDay(c.frozenAt)).find(Boolean); return day ? `Frozen on ${day}` : null; },
    draw: (d) => {
      // baskets in the portal's order, picks in yours
      const baskets = new Map();
      for (const c of choiceRows(d)) { if (!baskets.has(c.basket)) baskets.set(c.basket, []); baskets.get(c.basket).push(c); }
      const out = [];
      for (const [code, list] of baskets) {
        const ranked = list.some((c) => c.elective);
        const rows = ranked ? [...list].sort((a, b) => a.preference - b.preference) : list;
        out.push(sectionH(list[0].basketName || code, ranked ? h('span', { class: 'jm-allot' }, `${list.filter((c) => c.allotted).length} of ${list.length} allotted`) : null));
        out.push(group(...rows.map((c) => choiceRow(c, ranked))));
      }
      out.push(h('div', { class: 'jm-blank' }));
      return out;
    },
  });
}

// ---------------------------------------------------------------- mooc

function badge(ic, text, color) {
  return h('div', { class: 'jm-badge', style: { color } }, icon(ic, 18), text);
}

function moocCard(r, rejected) {
  const st = r.stages;
  return h('div', { class: 'jm-mooc' },
    h('div', { class: 'row', style: { alignItems: 'flex-start' } },
      h('div', { class: 'grow' },
        h('div', { class: 'jm-mt' }, titleCase(r.name)),
        h('div', { class: 'body-sm muted', style: { fontWeight: 600 } }, r.code)),
      rejected ? badge('cancel', 'Rejected', 'var(--error)')
        : r.approved ? badge('check_circle', 'Approved', 'var(--primary)')
          : badge('schedule', 'In review', 'var(--tertiary)')),
    r.replaces ? h('div', { class: 'jm-instead' }, `In place of ${titleCase(r.replaces[1])} · ${r.replaces[0]}`) : null,
    st.length ? h('div', { class: 'jm-stages' }, st.map((s, i) => {
      const last = i === st.length - 1;
      const line = [s.at, s.by && nameCase(s.by)].filter(Boolean).join(' · ');
      return h('div', { class: 'jm-stage' },
        h('div', { class: 'jm-rail' },
          h('div', { class: ['jm-dot', s.done ? 'done' : 'wait'] }, s.done ? icon('done', 12) : null),
          last ? null : h('div', { class: ['jm-line', s.done && st[i + 1]?.done && 'done'] })),
        h('div', { style: { paddingBottom: last ? '0' : '16px' } },
          h('div', { class: 'jm-st' }, s.title),
          h('div', { class: 'jm-ss' }, line || (s.done ? 'Done' : 'Waiting'))));
    })) : null);
}

export function mooc(ctx) {
  return pickedPage(ctx, {
    title: 'MOOC status',
    key: 'jm:mooc',
    list: moocSems,
    of: (s) => api.moocStatus(s),
    isEmpty: (d) => { const m = moocData(d); return !m.requests.length && !m.rejected.length; },
    emptyTitle: 'No MOOC requests',
    draw: (d) => {
      const m = moocData(d);
      return [
        m.dues > 0 ? h('div', { class: 'jm-dues' }, icon('payments', 18), `${rupees(m.dues)} due`) : null,
        m.requests.map((r) => moocCard(r, false)),
        m.rejected.map((r) => moocCard(r, true)),
        h('div', { class: 'jm-blank' }),
      ];
    },
  });
}

