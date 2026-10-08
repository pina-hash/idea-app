/**
 * WHAT THE TEACHER PUTS ON THE WALL FROM THE CONTROL VIEW (reports R12, R13):
 * Coming up (on by default), Student activity (OFF by default), Names too, a
 * second, separate step (OFF, and refused until activity is on), and since
 * idea 26033e4b the Clock face (OFF by default: the wall keeps its digits).
 *
 * The control view writes every frame it sends to this device's projector
 * slot (`idea_live_projector:<viewer>:<class>`), which is what a projector
 * opened later reads first. So the slot IS the wall's input, and this spec
 * reads it at three moments, recorded by the prepare steps:
 *
 *   0. at load: activity off, names off and refused, and the frame carries no
 *      activity at all (the default is the absence);
 *   1. after pressing Student activity: the frame carries counts, NO names,
 *      and none of the roster's names in any spelling (full, or "First L.");
 *   2. after pressing Names too: names for the groups that may carry them,
 *      none for the students who are working, no address anywhere. This is
 *      the positive control for step 1's absence: the same frame slot, the
 *      same class, and now the names are there.
 *   3. after pressing Clock face: the frame carries `clockFace: 'dial'`
 *      (step 0 is the absence: `digits`), the choice is in this computer's
 *      classroom preference slot (the harness provides the store the real
 *      route provides), and no timer is up, so no "why nothing changed" line.
 *
 * Both counts are reported. The four toggles are 44px keys and the state
 * line and the help line clear 4.5:1.
 */
import { LIVE_READY } from './_classroom-live.mjs';

const SLOT = 'idea_live_projector:harness-teacher:s-live';
/** The harness's classroom preference slot on this device (`createClassroomPreferences({ viewer: 'harness-live' })`). */
const PREFS = 'idea:classroom-prefs:1:harness-live';
const ROSTER = ['Ana Reyes', 'Ben Okafor', 'Cruz Delgado', 'Dee Marsh', 'Eli Nakamura', 'Fay Obi', 'Gus Varga', 'Hana Ito', 'Ivan Petrov', 'Jo Lindqvist', 'Kim Soto', 'Lee Amari'];

/** One moment, written to `window.__wall[n]`: the toggles' state and what the stored frame carries. */
const RECORD = (n) => `() => {
	const q = (id) => document.querySelector('[data-testid="' + id + '"]');
	const raw = localStorage.getItem(${JSON.stringify(SLOT)}) || '{}';
	const frame = JSON.parse(raw);
	const roster = ${JSON.stringify(ROSTER)};
	const short = roster.map((n) => n.split(' ')[0] + ' ' + n.split(' ')[1][0] + '.');
	const names = frame.activity && frame.activity.names ? Object.values(frame.activity.names).flat() : [];
	const rec = {
		activity: q('live-wall-activity').getAttribute('aria-pressed'),
		names: q('live-wall-names').getAttribute('aria-pressed'),
		namesRefused: q('live-wall-names').getAttribute('aria-disabled'),
		next: q('live-wall-next').getAttribute('aria-pressed'),
		frameActivity: frame.activity === null ? 'none' : frame.activity ? 'counts' : 'missing key',
		total: frame.activity ? frame.activity.total : 0,
		frameNames: frame.activity && frame.activity.names ? 'names' : 'no names',
		rosterInFrame: roster.filter((n) => raw.includes(n)).length + short.filter((n) => raw.includes(n)).length,
		namesInFrame: names.length,
		workingNamed: frame.activity && frame.activity.names && frame.activity.names.working ? frame.activity.names.working.length : 0,
		address: raw.includes('@') ? 'an address' : 'no address',
		next_lines: (frame.next || []).length,
		clock: q('live-wall-clock').getAttribute('aria-pressed'),
		frameClockFace: frame.clockFace || 'missing key',
		storedClock: (JSON.parse(localStorage.getItem(${JSON.stringify(PREFS)}) || '{}').display || {}).wallClock || 'not stored',
		clockNote: q('live-wall-clock-note') ? 'a note' : 'no note'
	};
	(window.__wall = window.__wall || [])[${n}] = rec;
	return JSON.stringify(rec);
}`;

const AT = (n, keys) => `() => { const r = (window.__wall || [])[${n}]; return r ? ${JSON.stringify(keys)}.map((k) => k + ' ' + r[k]) : ['not recorded']; }`;

export default {
	// `wall=toggles` is read by nothing: it only gives this spec a path of its
	// own beside `classroom-live` (the harness ignores parameters it does not know).
	path: '/dev/classroom-live?wall=toggles',
	label: 'Live control: On the wall toggles, activity off by default, names a second step (R12, R13)',
	prepare: [
		LIVE_READY,
		{ waitFor: `() => !!localStorage.getItem(${JSON.stringify(SLOT)}) && !!document.querySelector('[data-testid="live-wall"]')`, timeoutMs: 15000 },
		{ evaluate: RECORD(0) },
		{
			// A press on the refused key does nothing: names cannot come before counts.
			evaluate: `async () => {
				const b = document.querySelector('[data-testid="live-wall-names"]');
				b.click();
				await new Promise((r) => setTimeout(r, 400));
				const f = JSON.parse(localStorage.getItem(${JSON.stringify(SLOT)}) || '{}');
				window.__namesRefused = [b.getAttribute('aria-pressed'), f.activity === null ? 'none' : 'some'];
				return 'refused press: ' + window.__namesRefused.join(' / ');
			}`
		},
		{
			click: '[data-testid="live-wall-activity"]',
			until: `() => { const f = JSON.parse(localStorage.getItem(${JSON.stringify(SLOT)}) || '{}'); return document.querySelector('[data-testid="live-wall-activity"]').getAttribute('aria-pressed') === 'true' && !!f.activity; }`
		},
		{ evaluate: RECORD(1) },
		{
			click: '[data-testid="live-wall-names"]',
			until: `() => { const f = JSON.parse(localStorage.getItem(${JSON.stringify(SLOT)}) || '{}'); return !!(f.activity && f.activity.names); }`
		},
		{ evaluate: RECORD(2) },
		{
			click: '[data-testid="live-wall-clock"]',
			until: `() => { const f = JSON.parse(localStorage.getItem(${JSON.stringify(SLOT)}) || '{}'); return f.clockFace === 'dial'; }`
		},
		{ evaluate: RECORD(3) },
		{
			click: '[data-testid="live-preset-5"]',
			until: `() => !!document.querySelector('[data-testid="live-wall-clock-note"]')`
		},
		{ evaluate: RECORD(4) }
	],
	orderResult: [
		{
			label: 'at load: Coming up on, activity and names off, names refused, no activity in the frame',
			evaluate: AT(0, ['next', 'activity', 'names', 'namesRefused', 'frameActivity', 'rosterInFrame', 'address']),
			expected: ['next true', 'activity false', 'names false', 'namesRefused true', 'frameActivity none', 'rosterInFrame 0', 'address no address']
		},
		{
			label: 'at load the clock face is off: the frame carries the digits and nothing is stored',
			evaluate: AT(0, ['clock', 'frameClockFace', 'storedClock']),
			expected: ['clock false', 'frameClockFace digits', 'storedClock not stored']
		},
		{
			label: 'Clock face on: the frame carries the dial, the choice is kept on this computer, and with no timer there is nothing to explain',
			evaluate: AT(3, ['clock', 'frameClockFace', 'storedClock', 'clockNote', 'frameActivity', 'address']),
			expected: ['clock true', 'frameClockFace dial', 'storedClock dial', 'clockNote no note', 'frameActivity counts', 'address no address']
		},
		{
			label: 'a timer started with the face on: the face stays chosen, and the line says why the wall shows the timer',
			evaluate: AT(4, ['clock', 'frameClockFace', 'clockNote']),
			expected: ['clock true', 'frameClockFace dial', 'clockNote a note']
		},
		{
			label: 'pressing Names too before activity changes nothing: still off, still no activity on the wall',
			evaluate: `() => window.__namesRefused || ['not recorded']`,
			expected: ['false', 'none']
		},
		{
			label: 'activity on: counts for the twelve, no names, no roster name in any spelling',
			evaluate: AT(1, ['activity', 'names', 'namesRefused', 'frameActivity', 'total', 'frameNames', 'rosterInFrame', 'address']),
			expected: ['activity true', 'names false', 'namesRefused false', 'frameActivity counts', 'total 12', 'frameNames no names', 'rosterInFrame 0', 'address no address']
		},
		{
			label: 'names too: names reach the frame (the positive control), never for working, never an address',
			evaluate: `() => { const r = (window.__wall || [])[2]; return r ? ['names ' + r.names, r.namesInFrame > 0 ? 'names in the frame' : 'no names', 'workingNamed ' + r.workingNamed, r.address] : ['not recorded']; }`,
			expected: ['names true', 'names in the frame', 'workingNamed 0', 'no address']
		},
		{
			label: 'the state line says what the wall shows, in counts',
			evaluate: `() => [/^On the wall: \\d+ working, \\d+ not typing, \\d+ away, \\d+ not opened yet, \\d+ done\\.$/.test(document.querySelector('[data-testid="live-wall-activity-state"]').textContent.trim()) ? 'counts in words' : document.querySelector('[data-testid="live-wall-activity-state"]').textContent.trim()]`,
			expected: ['counts in words']
		}
	],
	presence: [
		{ selector: '[data-testid="live-wall"]', label: 'the On the wall panel', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="live-wall"] .lc-seg', label: 'its four toggles', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="live-wall-names-help"]', label: 'the help line that says names are a second step', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	tapTargets: [{ selector: '[data-testid="live-wall"] .lc-seg', label: 'the wall toggles' }],
	contrast: [
		{ selector: '[data-testid="live-wall-activity-state"]', label: 'the state line', min: 4.5 },
		{ selector: '[data-testid="live-wall-names-help"]', label: 'the help line', min: 4.5 },
		{ selector: '[data-testid="live-wall-clock-note"]', label: 'the clock face line', min: 4.5 },
		{ selector: '[data-testid="live-wall"] .lc-seg', label: 'toggle words', min: 4.5, all: true }
	],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
