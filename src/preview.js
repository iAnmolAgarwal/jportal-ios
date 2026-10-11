// desktop preview: the real app on fixture data, no portal needed.
// open dist/preview.html?theme=dark&tab=academics&push=subject&params={...}&now=2026-09-24
import { decrypt } from './core/crypto.js';
import f_att_detail_2026ODDSEM from '../fixtures/att_detail_2026ODDSEM.json';
import f_att_meta from '../fixtures/att_meta.json';
import f_bank from '../fixtures/bank.json';
import f_choice_sems from '../fixtures/choice_sems.json';
import f_choices from '../fixtures/choices.json';
import f_config from '../fixtures/config.json';
import f_credits from '../fixtures/credits.json';
import f_daily_20B13HS311 from '../fixtures/daily_20B13HS311.json';
import f_daily_26B16CS315 from '../fixtures/daily_26B16CS315.json';
import f_exam_events from '../fixtures/exam_events.json';
import f_exam_schedule from '../fixtures/exam_schedule.json';
import f_exam_sems from '../fixtures/exam_sems.json';
import f_faculties from '../fixtures/faculties.json';
import f_fb_events from '../fixtures/fb_events.json';
import f_fb_grid from '../fixtures/fb_grid.json';
import f_fb_questions from '../fixtures/fb_questions.json';
import f_fb_save from '../fixtures/fb_save.json';
import f_fees from '../fixtures/fees.json';
import f_gc_info from '../fixtures/gc_info.json';
import f_gc_regs from '../fixtures/gc_regs.json';
import f_gradecard_2026EVESEM from '../fixtures/gradecard_2026EVESEM.json';
import f_hostel from '../fixtures/hostel.json';
import f_marks_sems from '../fixtures/marks_sems.json';
import f_mooc_sems from '../fixtures/mooc_sems.json';
import f_mooc_status from '../fixtures/mooc_status.json';
import f_pending from '../fixtures/pending.json';
import f_personal from '../fixtures/personal.json';
import f_sgpa_all from '../fixtures/sgpa_all.json';

const q = new URLSearchParams(location.search);
const pinned = q.get('now') ? Date.parse(q.get('now') + 'T10:00:00+05:30') : null;

globalThis.__JP_PREVIEW__ = {
  now: pinned ?? undefined,
  session: {
    token: 'preview', username: 'TEST NAME', instituteId: 'FAKEINST', instituteName: 'JIIT', clientId: 'XEEB',
    memberId: 'FAKEMEMBER', userId: 'FAKEUSER', enrollmentNo: '99103000', name: 'TEST NAME', memberType: 'S',
  },
};

const daily = { '26B16CS315': f_daily_26B16CS315, '20B13HS311': f_daily_20B13HS311 };

// path fragment -> fixture envelope (or fn(payload) -> envelope)
const ROUTES = [
  ['getstudentInforegistrationforattendence', f_att_meta],
  ['getstudentattendancedetail', f_att_detail_2026ODDSEM],
  ['getstudentsubjectpersentage', (p) => daily[p?.subjectcode] || f_daily_26B16CS315],
  ['reqsubfaculty/getregistrationList', f_gc_regs],
  ['reqsubfaculty/getfaculties', f_faculties],
  ['getCreadits', f_credits],
  ['getsemestercode-withstudentexamevents', f_exam_sems],
  ['getstudentexamevents', f_exam_events],
  ['getstudent-examschedule', f_exam_schedule],
  ['getsemestercode-exammarks', f_marks_sems],
  ['studentgradecard/getregistrationList', f_gc_regs],
  ['studentgradecard/getstudentinfo', f_gc_info],
  ['showstudentgradecard', f_gradecard_2026EVESEM],
  ['getallsemesterdata', f_sgpa_all],
  ['getstudent-personalinformation', f_personal],
  ['getstudentbankinfo', f_bank],
  ['gethostelallocationdetail', f_hostel],
  ['loadfeesummary', f_fees],
  ['studentchoiceprint/getsemestercodelist', f_choice_sems],
  ['getsubjectpreference', f_choices],
  ['moocsubjectstatus/getsemestercodelist', f_mooc_sems],
  ['getsubjectstatus', f_mooc_status],
];

const realFetch = window.fetch.bind(window);
const reply = (obj) => new Response(JSON.stringify(obj), { status: 200, headers: { 'Content-Type': 'application/json', Date: new Date().toUTCString() } });
window.fetch = async (url, init = {}) => {
  const u = String(url);
  if (!u.includes('StudentPortalAPI')) return realFetch(url, init);
  await new Promise((r) => setTimeout(r, 150 + Math.random() * 250));
  if (u.includes('printstudent-exammarks')) {
    const pdf = q.get('marks') || 'cse5-seven-events';
    return realFetch(`../fixtures/marks/${pdf}.pdf`);
  }
  let payload = null;
  if (typeof init.body === 'string') {
    try { payload = JSON.parse(init.body); } catch { try { payload = JSON.parse(await decrypt(init.body, Date.now())); } catch {} }
  }
  const hit = ROUTES.find(([k]) => u.includes(k));
  if (!hit) return reply({ status: { responseStatus: 'Failure', errors: ['NO RECORD FOUND (preview has no fixture)'] } });
  return reply(typeof hit[1] === 'function' ? hit[1](payload) : hit[1]);
};

try { localStorage.setItem('jp:pref:theme', JSON.stringify(q.get('theme') || 'light')); sessionStorage.clear(); } catch {}

const { mountApp } = await import('./app.js');
const push = q.get('push') ? { name: q.get('push'), params: JSON.parse(q.get('params') || '{}') } : undefined;
mountApp({ startTab: q.get('tab') || 'attendance', push });
