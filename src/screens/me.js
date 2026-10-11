// the me tab and the pages it opens. port of feature/me/{MeScreen,MePages,About}.kt
// and feature/settings/SettingsScreen.kt (minus the android-only bits).
import { h, render } from '../ui/dom.js';
import { icon, header, sheet, ring } from '../ui/components.js';
import { api } from '../core/api.js';
import { cached, prefs } from '../core/store.js';
import { session, signOut } from '../core/session.js';
import {
  KIT_CSS, group, entry, sectionH, infoRow, infoGroup, initials, nameCase, titleCase, rupees, blank,
  loadPage, emptyState, staleBanner,
} from './me/kit.js';
import { choices, mooc, registrationRows } from './me/registration.js';

export { choices, mooc };

const CSS = `
.jm-hero { display: flex; align-items: center; gap: 16px; padding: 20px; border-radius: var(--r-lg); background: var(--secondary-container); color: var(--on-secondary-container); cursor: pointer; transition: filter .12s; }
.jm-hero:active { filter: brightness(.96); }
.jm-hn { font-size: 22px; line-height: 28px; font-weight: 600; font-variation-settings: 'ROND' 100; }
.jm-hl { font-size: 14px; line-height: 20px; font-weight: 600; opacity: .8; }
.jm-energy { text-align: center; font-size: 12px; line-height: 16px; color: var(--on-surface-variant); padding: 20px 8px 0; }
.jm-energy a { color: var(--primary); text-decoration: none; }
.jm-phead { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 0 16px 8px; }
.jm-hostel { border-radius: var(--r-lg); padding: 20px; background: var(--primary-container); color: var(--on-primary-container); margin-bottom: 12px; }
.jm-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.jm-chips span { padding: 6px 12px; border-radius: 999px; font-size: 14px; font-weight: 600; background: color-mix(in srgb, var(--surface) 55%, transparent); }
.jm-fee { display: flex; align-items: center; gap: 12px; padding: 14px 20px; }
.jm-choice-row { padding: 14px 20px; }
.jm-seg { display: flex; height: 40px; border: 1px solid var(--outline); border-radius: 999px; overflow: hidden; }
.jm-seg button { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 14px; font-weight: 600; border-left: 1px solid var(--outline); }
.jm-seg button:first-child { border-left: 0; }
.jm-seg button[aria-checked=true] { background: var(--secondary-container); color: var(--on-secondary-container); }
.jm-switch { width: 52px; height: 32px; border-radius: 16px; flex: none; position: relative; background: var(--sc-highest); border: 2px solid var(--outline); transition: background .2s, border-color .2s; }
.jm-switch::after { content: ''; position: absolute; top: 6px; left: 6px; width: 16px; height: 16px; border-radius: 50%; background: var(--outline); transition: all .2s; }
.jm-switch.on { background: var(--primary); border-color: var(--primary); }
.jm-switch.on::after { top: 2px; left: 22px; width: 24px; height: 24px; background: var(--on-primary); }
.jm-sheet-t { font-size: 24px; line-height: 32px; font-weight: 600; text-align: center; font-variation-settings: 'ROND' 100; }
.jm-range { width: 100%; accent-color: var(--primary); height: 32px; }
.jm-about { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 0 16px 8px; }
.jm-mark { width: 96px; height: 96px; border-radius: 30px; display: grid; place-items: center; background: var(--primary); color: var(--on-primary); margin-bottom: 12px; }
`;

const styled = (...kids) => h('div', null, h('style', null, KIT_CSS + CSS), ...kids);
const general = (p) => p?.generalinformation || {};

// ---------------------------------------------------------------- me tab

export function me(ctx) {
  const s = session() || {};
  const heroBox = h('div');
  const moneyBox = h('div');
  const banner = h('div');
  let personal = null, fees, hostelInfo;

  const drawHero = () => {
    const g = general(personal);
    const name = g.studentname || s.name || '';
    const line = [g.programcode, g.branch, Number(g.semester) > 0 ? `Sem ${g.semester}` : null].filter((x) => !blank(x)).join(' · ');
    render(heroBox, h('div', { class: 'jm-hero', role: 'button', onclick: () => ctx.nav.push('profile') },
      initials(name, 64),
      h('div', { class: 'grow' },
        h('div', { class: 'jm-hn' }, nameCase(name)),
        h('div', { class: 'body-md' }, s.enrollmentNo || g.registrationno || ''),
        personal && line ? h('div', { class: 'jm-hl' }, line) : null),
      icon('chevron_right', 24)));
  };
  const drawMoney = () => {
    const due = (fees?.feeHeads || []).reduce((a, x) => a + (Number(x.dueamount) || 0), 0);
    const hd = hostelInfo?.presenthosteldetail;
    render(moneyBox, group(
      entry({ icon: 'payments', title: 'Fees', subtitle: fees === undefined ? null : due > 0 ? `${rupees(due)} due` : 'Nothing due', alert: due > 0, onClick: () => ctx.nav.push('fees') }),
      entry({ icon: 'account_balance', title: 'Bank details', onClick: () => ctx.nav.push('bank') }),
      entry({
        icon: 'bed', title: 'Hostel', onClick: () => ctx.nav.push('hostel'),
        subtitle: hd ? [titleCase(hd.hosteldescription), blank(hd.allotedroomno) ? null : `Room ${hd.allotedroomno}`].filter(Boolean).join(' · ') : null,
      })));
  };
  drawHero();
  drawMoney();

  const fail = (e) => { if (e?.stale && !banner.firstChild) render(banner, staleBanner(e)); };
  const refresh = () => {
    cached('jm:personal', () => api.personalInfo(), (d) => { personal = d; drawHero(); }).catch(fail);
    cached('jm:fees', () => api.fees(), (d) => { fees = d; drawMoney(); }).catch(fail);
    cached('jm:hostel', () => api.hostel(), (d) => { hostelInfo = d; drawMoney(); }).catch(fail);
  };
  refresh();

  return styled(
    header({ title: 'Me' }),
    banner,
    heroBox,
    sectionH('Money and stay'),
    moneyBox,
    sectionH('College'),
    registrationRows(ctx),
    sectionH('App'),
    group(
      entry({ icon: 'settings', title: 'Settings', subtitle: 'Theme, goal', onClick: () => ctx.nav.push('settings') }),
      entry({ icon: 'info', title: 'About JPortal', subtitle: 'Credits, licenses, the official portal', onClick: () => ctx.nav.push('about') })),
    h('div', { class: 'jm-energy' }, 'Big 🍆 Energy lives on in ',
      h('a', { href: 'https://github.com/codeblech', target: '_blank', rel: 'noopener' }, 'Yash Malik')));
}

// ---------------------------------------------------------------- profile

export function profile(ctx) {
  return loadPage(ctx, {
    title: 'Profile', css: CSS, key: 'jm:personal', load: () => api.personalInfo(),
    draw: (p) => {
      const g = general(p);
      const join = (arr, sep) => arr.filter((x) => !blank(x)).join(sep);
      const pct = (n) => (Number(n) || 0).toFixed(1) + '%';
      const quals = (p?.qualification || []).map((q) => [
        join([q.qualificationcode, q.boardname, q.yearofpassing], ' · '),
        Number(q.percentagemarks) > 0 ? pct(q.percentagemarks) : Number(q.cgpa) > 0 ? `CGPA ${q.cgpa}` : null,
      ]);
      const qg = infoGroup(quals);
      return [
        h('div', { class: 'jm-phead' },
          initials(g.studentname || session()?.name, 112),
          h('div', { class: 'headline-sm', style: { marginTop: '12px' } }, nameCase(g.studentname)),
          h('div', { class: 'body muted' }, g.registrationno),
          h('div', { class: 'body-sm muted', style: { fontWeight: 600, marginTop: '8px' } }, 'Tap to copy')),
        sectionH('Academics'),
        infoGroup([
          ['Program', join([g.programcode, g.branch], ' · ')],
          ['Semester', Number(g.semester) > 0 ? String(g.semester) : null],
          ['Batch', join([g.batch, g.sectioncode], ' · ')],
          ['Admitted', g.admissionyear],
          ['APAAR ID', g.apaarid],
        ]),
        sectionH('Contact'),
        infoGroup([
          ['College email', g.studentemailid],
          ['Personal email', g.studentpersonalemailid],
          ['Phone', g.studentcellno],
          ['Address', join([g.caddress1, g.caddress3, g.ccityname, g.cstatename, g.cpostalcode], ', ')],
        ]),
        sectionH('Family'),
        infoGroup([
          ['Father', nameCase(g.fathersname)],
          ['Mother', nameCase(g.mothername)],
          ['Parent phone', g.parentcellno],
          ['Parent email', g.parentemailid],
        ]),
        sectionH('Personal'),
        infoGroup([
          ['Date of birth', g.dateofbirth],
          ['Blood group', g.bloodgroup],
          ['Gender', g.gender],
          ['Category', g.category],
          ['Nationality', g.nationality],
        ]),
        qg ? [sectionH('Before JIIT'), qg] : null,
        h('div', { class: 'jm-blank' }),
      ];
    },
  });
}

// ---------------------------------------------------------------- fees

export function fees(ctx) {
  return loadPage(ctx, {
    title: 'Fees', css: CSS, key: 'jm:fees', load: () => api.fees(),
    draw: (f) => {
      const heads = (f?.feeHeads || []).slice().sort((a, b) => (Number(b.stynumber) || 0) - (Number(a.stynumber) || 0));
      if (!heads.length) return emptyState('No fee records');
      const adv = Number(f?.advanceamount?.[0]?.amount) || 0;
      return [
        h('div', { style: { height: '8px' } }),
        group(...heads.map((x) => {
          const fee = Number(x.feeamount) || 0, paid = Number(x.receiveamount) || 0, due = Number(x.dueamount) || 0;
          const waived = Number(x.waiveramount) || 0, refunded = Number(x.refundamount) || 0;
          // academicyear is the same stale value on every head, so it stays out
          const sub = [blank(x.stytypedesc) ? null : x.stytypedesc, waived > 0 && `${rupees(waived)} waived`, refunded > 0 && `${rupees(refunded)} refunded`].filter(Boolean).join(' · ');
          return h('div', { class: 'jm-fee' },
            h('div', { class: 'grow' },
              h('div', { class: 'jm-et' }, `Semester ${x.stynumber}`),
              sub ? h('div', { class: 'body-sm muted' }, sub) : null),
            h('div', { style: { textAlign: 'right' } },
              h('div', { class: 'title-sm tnum', style: { fontWeight: 700 } }, `${rupees(paid)} paid`),
              h('div', { class: 'body-sm muted tnum' }, `of ${rupees(fee)}`),
              due > 0 ? h('div', { class: 'body-sm tnum', style: { color: 'var(--error)', fontWeight: 600 } }, `${rupees(due)} due`) : null));
        })),
        adv > 0 ? h('div', { class: 'note', style: { margin: '16px 8px 0' } }, `${rupees(adv)} held as advance`) : null,
      ];
    },
  });
}

// ---------------------------------------------------------------- bank

/** "•••• 4821": enough to recognise it, not enough to read it off over a shoulder */
const masked = (a) => (a.length > 4 ? `•••• ${a.slice(-4)}` : a);

export function bank(ctx) {
  return loadPage(ctx, {
    title: 'Bank details', css: CSS, key: 'jm:bank', load: () => api.bankInfo(),
    draw: (r) => {
      const b = r?.bankinfo || {};
      const acct = String(b.bankaccountnumber || '');
      let shown = false, timer = 0;
      const slot = h('div');
      const drawAcct = () => {
        const row = infoRow('Account number', shown ? acct : masked(acct), {
          copyValue: acct,
          trailing: h('button', {
            class: 'iconbtn', 'aria-label': shown ? 'Hide' : 'Show',
            onclick: (e) => {
              e.stopPropagation();
              shown = !shown;
              clearTimeout(timer);
              if (shown) timer = setTimeout(() => { shown = false; if (slot.isConnected) drawAcct(); }, 30000);
              drawAcct();
            },
          }, icon(shown ? 'visibility_off' : 'visibility', 24)),
        });
        slot.replaceChildren(row || '');
      };
      drawAcct();
      const rest = [
        ['IFSC', b.ifsccode],
        ['Bank', titleCase(b.bankname)],
        ['Account holder', nameCase(b.accountholdername)],
        ['Branch', [b.bankaddress, b.bankcity, b.bankstate, b.bankcitypin].filter((x) => !blank(x)).join(', ')],
        ['Status', b.freezed === 'Y' ? 'Locked by the accounts office' : 'Editable on the portal'],
      ].map(([k, v]) => infoRow(k, v)).filter(Boolean);
      return [
        h('div', { style: { height: '8px' } }),
        group(...(acct ? [slot] : []), ...rest),
        h('div', { class: 'body-sm muted', style: { padding: '20px 20px 0' } }, 'Tap to copy'),
      ];
    },
  });
}

// ---------------------------------------------------------------- hostel

export function hostel(ctx) {
  return loadPage(ctx, {
    title: 'Hostel', css: CSS, key: 'jm:hostel', load: () => api.hostel(),
    draw: (r) => {
      const x = r?.presenthosteldetail;
      if (!x) return emptyState('No hostel allotted', "Day scholar, or the allotment isn't in yet.");
      const chips = [
        blank(x.floor) ? null : `Floor ${x.floor}`,
        blank(x.beddesc) ? null : x.beddesc,
        blank(x.roomtype) ? null : titleCase(x.roomtype),
        blank(x.hosteltypedesc) ? null : titleCase(x.hosteltypedesc),
      ].filter(Boolean);
      return [
        h('div', { style: { height: '8px' } }),
        h('div', { class: 'jm-hostel' },
          h('div', { class: 'title-lg' }, titleCase(x.hosteldescription)),
          h('div', { class: 'label', style: { marginTop: '8px' } }, 'Room'),
          h('div', { class: 'number' }, blank(x.allotedroomno) ? '–' : x.allotedroomno),
          chips.length ? h('div', { class: 'jm-chips' }, chips.map((c) => h('span', null, c))) : null),
        infoGroup([
          ['Allotted', [x.allotedfromdate, x.allotedtilldate].filter((v) => !blank(v)).join(' to ')],
          ['Left on', x.hostellefton],
        ]),
      ];
    },
  });
}

// ---------------------------------------------------------------- settings

function confirmSignOut() {
  const close = sheet(
    h('div', { class: 'jm-sheet-t', style: { textAlign: 'left' } }, 'Sign out?'),
    h('div', { class: 'body-md muted', style: { margin: '8px 0 24px' } }, 'Your cached attendance and marks go too.'),
    h('div', { class: 'row', style: { justifyContent: 'flex-end', gap: '8px' } },
      h('button', { class: 'btn text', onclick: () => close() }, 'Cancel'),
      h('button', { class: 'btn', 'data-signout': '', onclick: () => { close(); signOut(); } }, 'Sign out')));
}

function targetSheet() {
  let value = Number(prefs.get('target')) || 75;
  const ringBox = h('div');
  const drawRing = () => render(ringBox, ring({ percent: value, target: 75, size: 120, stroke: 12, animate: false },
    h('div', { class: 'number', style: { fontSize: '33px', lineHeight: '36px' } }, `${value}%`)));
  drawRing();
  const done = () => { prefs.set('target', value); close(); };
  const close = sheet(
    h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' } },
      h('div', { class: 'jm-sheet-t' }, 'Attendance goal'),
      h('div', { class: 'body-md muted' }, 'Subjects under this get flagged.'),
      ringBox,
      h('input', {
        class: 'jm-range', type: 'range', min: 50, max: 100, step: 1, value, 'aria-label': 'Attendance goal',
        oninput: (e) => { value = Number(e.target.value); drawRing(); },
      }),
      h('div', { style: { alignSelf: 'stretch', display: 'flex', justifyContent: 'flex-end' } },
        h('button', { class: 'btn', onclick: done }, 'Done'))));
}

export function settings(ctx) {
  const body = h('div');
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const draw = () => {
    const mode = prefs.get('theme');
    const dark = mode === 'dark' || (mode === 'system' && mq.matches);
    const amoled = !!prefs.get('amoled');
    const opts = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']];
    render(body,
      sectionH('Look'),
      group(
        h('div', { class: 'jm-choice-row' },
          h('div', { class: 'jm-et', style: { marginBottom: '10px' } }, 'Theme'),
          h('div', { class: 'jm-seg', role: 'radiogroup', 'aria-label': 'Theme' }, opts.map(([k, label]) =>
            h('button', { role: 'radio', 'aria-checked': String(k === mode), 'data-theme-opt': k, onclick: () => { if (k !== mode) prefs.set('theme', k); } },
              k === mode ? icon('done', 18) : null, label)))),
        // pure black only means something once it's dark
        dark ? h('div', {
          class: 'jm-entry jm-tap', role: 'switch', 'aria-checked': String(amoled), 'data-amoled': '',
          onclick: () => prefs.set('amoled', !amoled),
        },
          h('div', { class: 'grow' }, h('div', { class: 'jm-et' }, 'Pure black'), h('div', { class: 'jm-es' }, 'Fully black backgrounds')),
          h('div', { class: ['jm-switch', amoled && 'on'] })) : null),
      sectionH('Attendance'),
      group(entry({ icon: 'flag', title: 'Attendance goal', subtitle: `${prefs.get('target')}%`, onClick: targetSheet })),
      sectionH('Account'),
      group(entry({ icon: 'logout', title: 'Sign out', subtitle: 'Clears the session and everything cached on this phone', onClick: confirmSignOut })),
      h('div', { class: 'jm-blank' }));
  };
  draw();
  const off = prefs.onChange(() => { if (!body.isConnected && off) { off(); return; } draw(); });
  const onMq = () => { if (!body.isConnected) mq.removeEventListener?.('change', onMq); else draw(); };
  mq.addEventListener?.('change', onMq);
  return styled(header({ title: 'Settings', back: ctx.nav.back }), body);
}

// ---------------------------------------------------------------- about

const open = (url) => { try { window.open(url, '_blank', 'noopener'); } catch {} };

export function about(ctx) {
  return styled(
    header({ title: 'About', back: ctx.nav.back }),
    h('div', { class: 'jm-about' },
      h('div', { class: 'jm-mark' }, icon('school_filled', 56)),
      h('div', { class: 'title-lg' }, 'JPortal for iOS (unofficial)'),
      h('div', { class: 'body-md muted', style: { marginTop: '6px', maxWidth: '320px' } },
        'A faster face for the JIIT webportal: attendance, exams, marks, grades and the rest, on the portal itself in Safari.'),
      h('div', { class: 'body-sm muted', style: { marginTop: '12px' } }, 'Unofficial. Not affiliated with or endorsed by JIIT.')),
    sectionH('Portal'),
    group(
      entry({ icon: 'open_in_new', title: 'Open the official portal', subtitle: 'The webportal as JIIT made it', onClick: () => globalThis.__jpOpenPortal?.() }),
      entry({ icon: 'logout', title: 'Sign out', subtitle: 'Clears the session and everything cached on this phone', onClick: confirmSignOut })),
    sectionH('Made possible by'),
    group(
      entry({ icon: 'favorite', title: 'JPortal for Android', subtitle: 'By codelif. The design and code this is ported from', onClick: () => open('https://github.com/codelif/jportal-android') }),
      entry({ icon: 'code', title: 'ktjiit', subtitle: 'By codelif. How the portal is spoken to', onClick: () => open('https://github.com/codelif/ktjiit') }),
      entry({ icon: 'favorite', title: 'JPortal', subtitle: 'By Yash Malik (codeblech). The original design and spirit', onClick: () => open('https://github.com/codeblech/jportal') }),
      entry({ icon: 'code', title: 'jsjiit', subtitle: 'ISC, portal protocol groundwork', onClick: () => open('https://github.com/codeblech/jsjiit') }),
      entry({ icon: 'code', title: 'pyjiit', subtitle: 'MIT, where it all started', onClick: () => open('https://github.com/codelif/pyjiit') })),
    sectionH('Licenses'),
    group(
      infoRow('JPortal for iOS, JPortal for Android, ktjiit', 'GNU General Public License v3.0', { copyValue: null }),
      infoRow('Google Sans Flex', 'SIL Open Font License 1.1', { copyValue: null }),
      infoRow('Material Symbols', 'Apache License 2.0', { copyValue: null })),
    h('div', { class: 'jm-blank' }));
}
