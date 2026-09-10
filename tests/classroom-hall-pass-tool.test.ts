// tests/classroom-hall-pass-tool.test.ts
//
// THE TOOL SHAPE'S PURE HALF (prompt 0118, items SIX and TEN), and the source
// sweeps that keep the two tools one thing.
//
// Two kinds of assertion, deliberately in one file:
//
//   1. The pure helpers in `$lib/classroom/hall-pass` that the trigger reads:
//      the chip words at a pinned instant (no clock is read anywhere, so a
//      figure here is exact), the stalled sentence, and the debounce constant.
//   2. SOURCE SWEEPS over the two components, for what a type check cannot
//      see and a mount does not show: the live subscription is INJECTED CODE
//      and must be called under `untrack` with its inputs read outside; the
//      shared tool-shell stylesheet is a KNOWN DUPLICATION across the two files
//      and is pinned byte-identical so it cannot drift; and the closed-set
//      rules the contract states (no `canManage`, `aria-haspopup="dialog"`, the
//      override picker on `cr-select`, no player in the song queue).
//
// The behavioural half -- effects running, the dialog opening, a notice
// re-asking the transport -- is `tests/dom/classroom-tools-mount.test.ts`,
// which is the only project where an `$effect` runs at all.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
	CLASSROOM_LIVE_DEBOUNCE_MS,
	HALL_PASS_POLL_MS,
	classroomLivePausedLine,
	hallPassToolChip,
	type HallPassManagerState,
	type HallPassStudentState
} from '../src/lib/classroom/hall-pass';
import { SONG_QUEUE_POLL_MS } from '../src/lib/classroom/song-queue';

const REPO_ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(REPO_ROOT, p), 'utf8');
const HALL = read('src/lib/classroom/HallPass.svelte');
const SONG = read('src/lib/classroom/SongQueue.svelte');

const NOW = Date.parse('2026-08-28T17:42:00Z');
const ago = (mins: number) => new Date(NOW - mins * 60_000).toISOString();
const SECTION = '11111111-1111-1111-1111-111111111111';

const student = (over: Partial<HallPassStudentState> = {}): HallPassStudentState => ({
	scope: 'student',
	section_id: SECTION,
	taken: false,
	mine: false,
	opened_at: null,
	...over
});
const manager = (over: Partial<HallPassManagerState> = {}): HallPassManagerState => ({
	scope: 'manager',
	section_id: SECTION,
	taken: false,
	mine: false,
	open: null,
	history: [],
	...over
});

describe('hallPassToolChip: the trigger chip, one word per state, a name only for a manager', () => {
	test('a student sees Free, Taken, or their own elapsed time', () => {
		expect(hallPassToolChip(student(), NOW)).toEqual({ tone: 'free', word: 'Free' });
		expect(hallPassToolChip(student({ taken: true }), NOW)).toEqual({ tone: 'taken', word: 'Taken' });
		expect(hallPassToolChip(student({ taken: true, mine: true, opened_at: ago(6) }), NOW)).toEqual({
			tone: 'mine',
			word: 'Yours · 6 min'
		});
		// Floored, never rounded: 6m59s is still 6 min.
		expect(
			hallPassToolChip(student({ taken: true, mine: true, opened_at: new Date(NOW - 419_000).toISOString() }), NOW).word
		).toBe('Yours · 6 min');
		expect(hallPassToolChip(student({ taken: true, mine: true, opened_at: ago(0) }), NOW).word).toBe('Yours · just now');
	});

	test("a peer's pass carries no name and no duration, whatever the payload holds", () => {
		// The student TYPE cannot carry a name; the assertion is that the chip
		// does not manufacture a duration from `opened_at` either, which the
		// database withholds for a peer's pass anyway.
		const chip = hallPassToolChip(student({ taken: true, mine: false, opened_at: ago(30) }), NOW);
		expect(chip.word).toBe('Taken');
		expect(chip.word).not.toMatch(/min|hr/);
	});

	test('a manager sees Nobody out, or who is out', () => {
		expect(hallPassToolChip(manager(), NOW)).toEqual({ tone: 'idle', word: 'Nobody out' });
		expect(
			hallPassToolChip(
				manager({
					taken: true,
					open: { pass_id: 'p', student_email: 'ana@boscotech.net', student_name: 'Ana Reyes', opened_at: ago(6) }
				}),
				NOW
			)
		).toEqual({ tone: 'out', word: '1 out · Ana Reyes' });
	});

	test('no em dash in any chip word (copy convention); the separator is a middot', () => {
		const words = [
			hallPassToolChip(student(), NOW).word,
			hallPassToolChip(student({ taken: true, mine: true, opened_at: ago(6) }), NOW).word,
			hallPassToolChip(manager({ taken: true, open: { pass_id: 'p', student_email: 'a', student_name: 'A B', opened_at: ago(1) } }), NOW).word
		];
		for (const w of words) expect(w).not.toContain('—');
		expect(words[1]).toContain(' · ');
	});
});

describe('the live notice constants and the stalled sentence', () => {
	test('the debounce is one number, shorter than either poll by two orders of magnitude', () => {
		expect(CLASSROOM_LIVE_DEBOUNCE_MS).toBe(250);
		expect(CLASSROOM_LIVE_DEBOUNCE_MS * 100).toBeLessThan(HALL_PASS_POLL_MS);
		expect(CLASSROOM_LIVE_DEBOUNCE_MS * 100).toBeLessThan(SONG_QUEUE_POLL_MS);
	});

	test('the paused sentence names the poll in seconds, for each tool', () => {
		expect(classroomLivePausedLine(HALL_PASS_POLL_MS)).toBe('Live updates paused, still checking every 45 seconds.');
		expect(classroomLivePausedLine(SONG_QUEUE_POLL_MS)).toBe('Live updates paused, still checking every 90 seconds.');
		// Sub-1.5s is unreachable with either real poll; the sentence still agrees
		// with itself there (a person reads it, and "1 seconds" is a defect).
		expect(classroomLivePausedLine(1_400)).toBe('Live updates paused, still checking every 1 second.');
		expect(classroomLivePausedLine(2_000)).toBe('Live updates paused, still checking every 2 seconds.');
		// It names a number, never a table, an RPC or a socket.
		expect(classroomLivePausedLine(HALL_PASS_POLL_MS)).not.toMatch(/channel|socket|realtime|rpc|_/i);
	});
});

/* ------------------------------------------------------------------ *
 * Source sweeps over the two components.
 * ------------------------------------------------------------------ */
function strip(src: string): string {
	return src
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.split('\n')
		.map((line) => (line.trimStart().startsWith('//') ? '' : line))
		.join('\n');
}
const HALL_CODE = strip(HALL);
const SONG_CODE = strip(SONG);
const propsBlock = (src: string) => src.slice(src.indexOf('let {'), src.indexOf('} = $props()'));

describe('both components: the two new props, and no role flag', () => {
	test.each([
		['HallPass', HALL],
		['SongQueue', SONG]
	])('%s declares `live` and `tool`, defaulting off, and no canManage', (_name, src) => {
		const props = propsBlock(src);
		expect(props.length).toBeGreaterThan(100);
		expect(props).toContain('live = null');
		expect(props).toContain('tool = false');
		expect(props).toContain('live?: ClassroomLive | null');
		expect(props).toContain('tool?: boolean');
		expect(props).not.toContain('canManage');
	});

	test.each([
		['HallPass', HALL_CODE, 'hall-pass'],
		['SongQueue', SONG_CODE, 'song-queue']
	])('%s subscribes under untrack with the inputs read outside, filters on its own topic, announces it', (_n, code, topic) => {
		/*
		 * THE SHAPE, NOT JUST THE WORD. `untrack(` appearing somewhere is not the
		 * fix; the fix is `const bus = live` and `const section = sectionId` read
		 * TRACKED before the untracked `bus.subscribe(section, ...)` call. A
		 * whole-body untrack would satisfy a bare `toContain('untrack')` and
		 * silently stop re-subscribing on a new section.
		 */
		const effect = code.slice(code.indexOf('const bus = live;'), code.indexOf('unsubscribe();'));
		expect(effect.length).toBeGreaterThan(200);
		expect(effect).toContain('const section = sectionId;');
		expect(effect).toMatch(/untrack\(\(\) =>\s*bus\.subscribe\(\s*section,/);
		expect(effect.indexOf('const bus = live;')).toBeLessThan(effect.indexOf('untrack('));
		expect(effect.indexOf('const section = sectionId;')).toBeLessThan(effect.indexOf('untrack('));
		expect(effect).toContain(`if (topic !== '${topic}') return;`);
		expect(effect).toContain('CLASSROOM_LIVE_DEBOUNCE_MS');
		// The announce names the same topic it listens for, and nothing else.
		expect(code).toContain(`live?.announce(sectionId, '${topic}');`);
		const other = topic === 'hall-pass' ? 'song-queue' : 'hall-pass';
		expect(code).not.toContain(`announce(sectionId, '${other}')`);
	});

	test.each([
		['HallPass', HALL_CODE, 'hall-pass', 'Hall pass'],
		['SongQueue', SONG_CODE, 'song-queue', 'Class music']
	])('%s: the trigger announces a dialog, carries a word, and the dialog is labelled', (_n, code, id, label) => {
		expect(code).toContain(`data-testid="${id}-tool"`);
		expect(code).toContain('aria-haspopup="dialog"');
		expect(code).toContain('aria-expanded={open}');
		expect(code).toContain('<dialog');
		expect(code).toContain(`aria-label="${label}"`);
		expect(code).toContain(`data-testid="${id}-tool-close"`);
		// The dialog is mounted only while open: the element sits inside the
		// `{#if open}` block, never rendered shut.
		expect(code.indexOf('{#if open}')).toBeGreaterThan(-1);
		expect(code.indexOf('{#if open}')).toBeLessThan(code.indexOf('<dialog'));
		// The card is a snippet rendered in both shapes: one copy of the markup.
		expect(code).toContain('{#snippet card()}');
		expect((code.match(/\{@render card\(\)\}/g) ?? []).length).toBe(2);
	});
});

describe('item TEN: the override picker is the shared cr-select, with its label', () => {
	test('HallPass puts cr-select on the select and keeps a <label for> beside it', () => {
		const select = HALL_CODE.slice(HALL_CODE.indexOf('<select'), HALL_CODE.indexOf('</select>'));
		expect(select).toContain('class="hp-override-select cr-select"');
		expect(select).toContain('data-testid="hall-pass-override-select"');
		expect(HALL_CODE).toContain('<label class="hp-override-label" for={`hp-send-${sectionId}`}>Send a student out</label>');
	});
});

describe('the tool shell stylesheet is one thing in two files, and pinned to stay so', () => {
	const block = (src: string) => {
		const start = src.indexOf('	.ctool {');
		const end = src.indexOf('</style>');
		expect(start).toBeGreaterThan(-1);
		return src.slice(start, end).trim();
	};

	test('the `.ctool-*` rules are byte-identical in HallPass and SongQueue', () => {
		const a = block(HALL);
		const b = block(SONG);
		expect(a.length).toBeGreaterThan(1500);
		expect(a).toBe(b);
	});

	test('and both files say the duplication is known and where its home is', () => {
		for (const src of [HALL, SONG]) {
			expect(src).toContain('KNOWN DUPLICATION');
			expect(src).toContain('class-tools.css');
		}
	});
});

describe('the harness mirrors the layout\'s `.class-tools` row, rule for rule', () => {
	/*
	 * A HARNESS MUST MIRROR THE WHOLE MECHANISM IT STANDS IN FOR. The browser
	 * spec measures `/dev/classroom-tools`, so the row it measures has to be
	 * the row `src/routes/classroom/[sectionId]/+layout.svelte` renders: same
	 * class, same testid, and the SAME rule bodies (the harness once carried a
	 * wider gap, no `align-items: stretch` and no child rule, which is a
	 * different row wearing the same name). The layout is read here and never
	 * written; when its rule moves, this reddens and the harness copy follows.
	 */
	const LAYOUT = read('src/routes/classroom/[sectionId]/+layout.svelte');
	const HARNESS = read('src/routes/dev/classroom-tools/+page.svelte');
	const rule = (src: string, selector: string) => {
		const at = src.indexOf(`\n\t${selector} {`);
		expect(at, `${selector} in source`).toBeGreaterThan(-1);
		const close = src.indexOf('\n\t}', at);
		return src.slice(at, close + 3);
	};

	test('the `.class-tools` rule and its child rule are byte-identical in the layout and the harness', () => {
		for (const selector of ['.class-tools', '.class-tools > :global(*)']) {
			const a = rule(LAYOUT, selector);
			const b = rule(HARNESS, selector);
			expect(a.length).toBeGreaterThan(40);
			expect(b).toBe(a);
		}
		// The rule is real: it carries the properties the row depends on.
		expect(rule(HARNESS, '.class-tools')).toContain('align-items: stretch;');
		expect(rule(HARNESS, '.class-tools > :global(*)')).toContain('flex: 1 1 12rem;');
	});

	test('both wrappers carry the layout\'s testid, one per projection', () => {
		expect(LAYOUT).toContain('<div class="class-tools" data-testid="class-tools">');
		expect((HARNESS.match(/<div class="class-tools" data-testid="class-tools">/g) ?? []).length).toBe(2);
	});
});

describe('SongQueue still plays nothing and names no host in a condition', () => {
	test('no player, no embed, no file input; Spotify only ever in copy', () => {
		for (const forbidden of ['<audio', '<video', '<iframe', '<embed', 'type="file"', 'accept=']) {
			expect(SONG_CODE).not.toContain(forbidden);
		}
		expect(SONG_CODE).not.toMatch(/\.(host|hostname|origin)\s*(===|==|!==|!=)/);
		expect(SONG_CODE).not.toMatch(/\bincludes\(\s*['"`][^'"`]*spotify/i);
		// POSITIVE CONTROL: the sweep is reading real markup.
		expect(SONG_CODE).toContain('<input');
		expect(SONG_CODE).toContain('data-testid="song-queue"');
	});
});
