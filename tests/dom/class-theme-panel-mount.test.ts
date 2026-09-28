// tests/dom/class-theme-panel-mount.test.ts
//
// THE CLASS THEME VOTE (decision 45, report R07, ledger 0347), ON THE REAL
// COMPONENT.
//
// What would regress SILENTLY, which is why this is a test and not only a
// harness:
//
//   1. A vote is one transport call with the course, the feature and the
//      option, and the banner is told the winners the RPC returned at once.
//   2. A closed vote offers every key, marked and explaining itself, and a
//      press calls NOTHING.
//   3. A teacher is offered NO vote key (the database refuses a teacher's
//      vote), with a student's eighteen as the positive control.
//   4. The tally is re-read only while the panel is OPEN: the interval starts
//      on open and is cleared on close and on unmount. A poll that never
//      stopped reads exactly like one that works.
//   5. A database without the vote, and a caller who is neither in the class
//      nor teaching it, render NOTHING -- no error, no panel.
//
// Structure, events and call counts only (happy-dom has no layout engine).
// The colours, the 44px keys and the contrast on the washed banner are
// tools/browser-verify/routes/classroom-theme*.mjs.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ClassThemePanel from '../../src/lib/classroom/ClassThemePanel.svelte';
import {
	CLASS_THEME_POLL_MS,
	type ClassThemeFeature,
	type ClassThemeTally,
	type ClassThemeTallyResult,
	type ClassThemeTransports,
	type ClassThemeVoteResult,
	type ClassThemeWinners
} from '../../src/lib/classroom/class-theme';
import { mountInto, type Mounted } from './mount';

function tallyOf(over: Partial<ClassThemeTally> = {}): ClassThemeTally {
	return {
		course_id: 'c-1',
		voting_open: true,
		reset_at: null,
		manages: false,
		can_vote: true,
		voters: 3,
		counts: [
			{ feature: 'palette', option: 'ocean', votes: 2 },
			{ feature: 'palette', option: 'ember', votes: 1 },
			{ feature: 'badge', option: 'gear', votes: 2 }
		],
		winners: { palette: 'ocean', badge: 'gear' },
		mine: {},
		...over
	};
}

interface Fake {
	transports: ClassThemeTransports;
	tallies: number;
	votes: [string, ClassThemeFeature, string | null][];
}

function fake(
	opts: { tally?: ClassThemeTallyResult; vote?: ClassThemeVoteResult } = {}
): Fake {
	const f: Fake = { transports: {} as ClassThemeTransports, tallies: 0, votes: [] };
	f.transports = {
		async themes() {
			return { ok: true, themes: [] };
		},
		async tally() {
			f.tallies += 1;
			return opts.tally ?? { ok: true, tally: tallyOf() };
		},
		async vote(courseId, feature, option) {
			f.votes.push([courseId, feature, option]);
			return (
				opts.vote ?? {
					ok: true,
					withdrawn: false,
					option: option ?? '',
					winners: { palette: 'violet', badge: 'gear' }
				}
			);
		},
		async setVoting() {
			return { ok: true, voting_open: true, reset_at: null };
		},
		async reset() {
			return { ok: true, voting_open: true, reset_at: null };
		},
		async setAccent(_s, accent) {
			return { ok: true, accent };
		}
	};
	return f;
}

let mounted: Mounted | null = null;
beforeEach(() => {
	try {
		localStorage.clear();
	} catch {
		/* no storage: nothing remembered, which is the default anyway */
	}
});
afterEach(async () => {
	vi.useRealTimers();
	await mounted?.stop();
	mounted = null;
});

async function mountPanel(f: Fake, onwinners: ((w: ClassThemeWinners, courseId: string) => void) | null = null) {
	mounted = mountInto(ClassThemePanel as never, { courseId: 'c-1', transports: f.transports, onwinners });
	await mounted.settle();
	return mounted;
}

const keys = (m: Mounted) => m.all<HTMLButtonElement>('[data-testid="class-theme-vote"]');
const keyFor = (m: Mounted, feature: string, word: string) =>
	m
		.all<HTMLButtonElement>(`[data-feature="${feature}"] [data-testid="class-theme-vote"]`)
		.find((b) => b.textContent?.includes(word))!;

describe('a vote is one call, and the banner hears the winners at once', () => {
	it('calls vote with the course, the feature and the option, and hands the returned winners up', async () => {
		const f = fake();
		const heard: ClassThemeWinners[] = [];
		const courses: string[] = [];
		const m = await mountPanel(f, (w, c) => {
			heard.push(w);
			courses.push(c);
		});
		// The first read told the banner what is winning now, and for WHICH
		// course: the instance's own, never whatever the caller shows by then.
		expect(heard).toEqual([{ palette: 'ocean', badge: 'gear' }]);
		expect(courses).toEqual(['c-1']);
		expect(keys(m).length).toBe(18);
		keyFor(m, 'palette', 'Violet').click();
		await m.settle();
		await m.settle();
		expect(f.votes).toEqual([['c-1', 'palette', 'violet']]);
		// The RPC's own winners, before any re-read.
		expect(heard[1]).toEqual({ palette: 'violet', badge: 'gear' });
		expect(m.one('[data-testid="class-theme-said"]').textContent?.trim()).toBe('Voted for Violet palette.');
	});

	it('the key you voted for is pressed, and pressing it again calls nothing', async () => {
		const f = fake({ tally: { ok: true, tally: tallyOf({ mine: { palette: 'ember' } }) } });
		const m = await mountPanel(f);
		const ember = keyFor(m, 'palette', 'Ember');
		expect(ember.getAttribute('aria-pressed')).toBe('true');
		expect(ember.classList.contains('on')).toBe(true);
		// Said in a word as well as by the lit key: exactly one "Your vote", on it.
		const mine = m.all('[data-testid="class-theme-mine"]');
		expect(mine.length).toBe(1);
		expect(ember.contains(mine[0])).toBe(true);
		expect(mine[0].textContent?.trim()).toBe('Your vote');
		ember.click();
		await m.settle();
		expect(f.votes).toEqual([]);
		// Taking it back is its own worded key, and withdraws with a null option.
		m.one<HTMLButtonElement>('[data-testid="class-theme-withdraw"]').click();
		await m.settle();
		expect(f.votes).toEqual([['c-1', 'palette', null]]);
	});
});

describe('a closed vote says so and counts nothing', () => {
	it('marks every key, describes why, and a press calls no transport', async () => {
		const f = fake({ tally: { ok: true, tally: tallyOf({ voting_open: false }) } });
		const m = await mountPanel(f);
		expect(m.one('[data-testid="class-theme-closed"]').textContent).toContain('Voting is closed.');
		const all = keys(m);
		expect(all.length).toBe(18);
		expect(all.every((k) => k.getAttribute('aria-disabled') === 'true')).toBe(true);
		expect(all.every((k) => !k.hasAttribute('disabled'))).toBe(true);
		expect(all.every((k) => document.getElementById(k.getAttribute('aria-describedby') ?? '-'))).toBe(true);
		keyFor(m, 'palette', 'Steel').click();
		await m.settle();
		expect(f.votes).toEqual([]);
	});
});

describe('a teacher sees the counts and no vote keys', () => {
	it('draws count rows and no keys for a manager, eighteen keys for a student (the control)', async () => {
		const teacher = await mountPanel(fake({ tally: { ok: true, tally: tallyOf({ manages: true, can_vote: false }) } }));
		expect(keys(teacher).length).toBe(0);
		expect(teacher.all('[data-testid="class-theme-withdraw"]').length).toBe(0);
		expect(teacher.all('[data-testid="class-theme-row"]').length).toBe(18);
		await teacher.stop();
		mounted = null;
		const student = await mountPanel(fake());
		expect(keys(student).length).toBe(18);
		expect(student.all('[data-testid="class-theme-row"]').length).toBe(0);
	});
});

describe('the tally is re-read only while the panel is open', () => {
	it('starts the poll on open, and a close and an unmount both stop it', async () => {
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
		const f = fake();
		const m = await mountPanel(f);
		expect(f.tallies).toBe(1);
		// Closed by default: time passes and nothing is read.
		vi.advanceTimersByTime(CLASS_THEME_POLL_MS * 3);
		await m.settle();
		expect(f.tallies).toBe(1);
		const toggle = m.one<HTMLButtonElement>('[data-testid="class-theme-toggle"]');
		toggle.click();
		m.flush();
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		// Opening reads at once, rather than showing counts up to a poll old.
		await m.settle();
		expect(f.tallies).toBe(2);
		vi.advanceTimersByTime(CLASS_THEME_POLL_MS);
		await m.settle();
		expect(f.tallies).toBe(3);
		// Focus re-reads at once while open.
		window.dispatchEvent(new Event('focus'));
		await m.settle();
		expect(f.tallies).toBe(4);
		toggle.click();
		m.flush();
		vi.advanceTimersByTime(CLASS_THEME_POLL_MS * 3);
		window.dispatchEvent(new Event('focus'));
		await m.settle();
		expect(f.tallies).toBe(4);
		// Open again (one read), then unmount: the interval goes with the component.
		toggle.click();
		m.flush();
		await m.settle();
		expect(f.tallies).toBe(5);
		await m.stop();
		mounted = null;
		vi.advanceTimersByTime(CLASS_THEME_POLL_MS * 3);
		window.dispatchEvent(new Event('focus'));
		expect(f.tallies).toBe(5);
	});

	it('a panel the database takes away mid-session stops asking', async () => {
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
		const f = fake();
		const m = await mountPanel(f);
		m.one<HTMLButtonElement>('[data-testid="class-theme-toggle"]').click();
		m.flush();
		await m.settle();
		expect(f.tallies).toBe(2);
		// The vote comes back `unavailable` (0225 rolled back under the page):
		// the panel goes, and so must its poll.
		f.transports.vote = async () => ({ ok: false, reason: 'unavailable' });
		keyFor(m, 'palette', 'Violet').click();
		await m.settle();
		expect(m.all('[data-testid="class-theme-panel"]').length).toBe(0);
		vi.advanceTimersByTime(CLASS_THEME_POLL_MS * 3);
		window.dispatchEvent(new Event('focus'));
		await m.settle();
		expect(f.tallies).toBe(2);
	});
});

describe('no vote to offer renders nothing', () => {
	it('a database without the vote renders no panel and no error', async () => {
		const m = await mountPanel(fake({ tally: { ok: false, reason: 'unavailable' } }));
		expect(m.all('[data-testid="class-theme-panel"]').length).toBe(0);
		expect(m.all('[data-testid="class-theme-error"]').length).toBe(0);
	});

	it('a caller who is neither in the class nor teaching it renders nothing', async () => {
		const m = await mountPanel(fake({ tally: { ok: false, reason: 'error', message: 'Not found.' } }));
		expect(m.all('[data-testid="class-theme-panel"]').length).toBe(0);
	});

	it('any other failure keeps the panel and says so, in the database’s own words', async () => {
		const m = await mountPanel(fake({ tally: { ok: false, reason: 'error', message: 'The class theme could not be reached. Try again in a moment.' } }));
		expect(m.all('[data-testid="class-theme-panel"]').length).toBe(1);
		expect(m.one('[data-testid="class-theme-error"]').textContent).toContain('could not be reached');
	});
});
