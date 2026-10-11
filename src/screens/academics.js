// the academics tab: Overview | Marks | Exams (feature/academics/AcademicsScreen.kt)
import { h } from '../ui/dom.js';
import { header, segmented } from '../ui/components.js';
import { marksPane } from './marks.js';
import { overview } from './academics/overview.js';
import { exams } from './academics/exams.js';
import { style } from './academics/ui.js';

const VIEW = 'jp:acad:view';
const VIEWS = [['overview', 'Overview'], ['marks', 'Marks'], ['exams', 'Exams']];
const BUILD = { overview, marks: marksPane, exams };

export function academics(ctx) {
  let view = 'overview';
  try { view = sessionStorage.getItem(VIEW) || 'overview'; } catch {}
  if (!BUILD[view]) view = 'overview';

  // each view is built the first time it's shown and kept, so it holds its data and scroll
  const panes = {};
  const body = h('div');
  const segWrap = h('div', { class: 'seg-wrap' });

  function show(v) {
    view = v;
    try { sessionStorage.setItem(VIEW, v); } catch {}
    segWrap.replaceChildren(segmented({ options: VIEWS, value: v, onChange: show }));
    if (!panes[v]) {
      let el;
      try { el = BUILD[v](ctx); } catch (e) { console.error('[jportal] academics', v, e); el = h('div', { class: 'center' }, String(e?.message || e)); }
      panes[v] = h('div', { class: 'fade-in' }, el);
      body.append(panes[v]);
    }
    for (const [k, p] of Object.entries(panes)) p.style.display = k === v ? '' : 'none';
  }

  const root = h('div', { class: 'acad' }, style(), header({ title: 'Academics' }), segWrap, body);
  show(view);
  return root;
}
