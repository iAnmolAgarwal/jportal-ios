// every screen the app can show. tabs first, then pushed detail screens.
// each file is owned by one builder; keep this list as the only shared edit point.
import { attendance } from './attendance.js';
import { subject } from './subject.js';
import { academics } from './academics.js';
import { gradecard } from './gradecard.js';
import { marks } from './marks.js';
import { subjects } from './subjects.js';
import { me, profile, fees, bank, hostel, choices, mooc, settings, about } from './me.js';

export const TABS = ['attendance', 'academics', 'subjects', 'me'];

export const SCREENS = {
  attendance, academics, subjects, me, // tabs
  subject, // { semCode, subjectCode }
  gradecard, // { code }
  marks, // { code }
  profile, fees, bank, hostel, choices, mooc, settings, about,
};
