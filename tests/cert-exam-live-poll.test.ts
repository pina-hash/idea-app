// tests/cert-exam-live-poll.test.ts
//
// THE PROCTOR'S LIVE POLL RIDES `startPoller` (ledger 0391, surface e): the
// first read at once, then every `pollMs` (5 seconds by default), a failed read
// handed to the page as null and backed off, and `readExamLive` dropping what is
// not a row. The environment is a hand-driven clock, the poller's own shape.

import { describe, expect, it } from 'vitest';
import type { PollerEnv } from '$lib/classroom/poll';
import { EXAM_LIVE_POLL_MS, readExamLive, startExamLivePoller } from '$lib/certifications/exam/live-poll';
import type { ExamLiveRow } from '$lib/certifications/types';

function fakeEnv() {
	let now = 1_000_000;
	const timers: { at: number; fn: () => void }[] = [];
	const env: PollerEnv = {
		now: () => now,
		random: () => 0.5,
		setTimeout: (fn, ms) => {
			const h = { at: now + ms, fn };
			timers.push(h);
			return h;
		},
		clearTimeout: (h) => {
			const i = timers.indexOf(h as { at: number; fn: () => void });
			if (i >= 0) timers.splice(i, 1);
		},
		hidden: () => false,
		listen: () => () => undefined
	};
	const flush = async () => {
		for (let i = 0; i < 10; i++) await Promise.resolve();
	};
	const advance = async (ms: number) => {
		const target = now + ms;
		for (;;) {
			timers.sort((a, b) => a.at - b.at);
			const next = timers[0];
			if (!next || next.at > target) break;
			timers.shift();
			now = next.at;
			next.fn();
			await flush();
		}
		now = target;
	};
	return { env, advance, flush, pending: () => timers.map((t) => t.at - now) };
}

const ROW: ExamLiveRow = {
	exam_id: 'E1',
	student: { email: 'a@boscotech.net', name: 'Ana' },
	certification: { code: 'MILL-1', name: 'Mill' },
	state: 'in_progress',
	current_index: 3,
	total: 20,
	released_at: '2026-10-15T19:00:00Z',
	release_expires_at: '2026-10-15T19:10:00Z',
	started_at: '2026-10-15T19:02:00Z',
	deadline: '2026-10-15T19:32:00Z',
	flags: [{ at: '2026-10-15T19:05:00Z', kind: 'blur' }],
	passed: null,
	submitted_at: null
};

describe('startExamLivePoller', () => {
	it('reads at once, then every five seconds', async () => {
		expect(EXAM_LIVE_POLL_MS).toBe(5000);
		const f = fakeEnv();
		let loads = 0;
		const seen: (ExamLiveRow[] | null)[] = [];
		const p = startExamLivePoller({
			load: async () => {
				loads++;
				return [ROW];
			},
			onrows: (rows) => seen.push(rows),
			env: f.env
		});
		await f.flush();
		expect(loads).toBe(1);
		expect(seen).toEqual([[ROW]]);
		expect(f.pending()).toEqual([5000]);
		await f.advance(5000);
		expect(loads).toBe(2);
		await f.advance(5000);
		expect(loads).toBe(3);
		p.stop();
		await f.advance(20_000);
		expect(loads).toBe(3);
	});

	it('hands a failed read to the page as null and backs off', async () => {
		const f = fakeEnv();
		const seen: (ExamLiveRow[] | null)[] = [];
		startExamLivePoller({ load: async () => null, onrows: (rows) => seen.push(rows), pollMs: 2000, env: f.env });
		await f.flush();
		expect(seen).toEqual([null]);
		expect(f.pending()).toEqual([4000]);
	});

	it('takes a harness pollMs so the calls can be counted', async () => {
		const f = fakeEnv();
		let loads = 0;
		startExamLivePoller({ load: async () => (loads++, []), onrows: () => undefined, pollMs: 500, env: f.env });
		await f.flush();
		await f.advance(1500);
		expect(loads).toBe(4);
	});
});

describe('readExamLive', () => {
	it('returns null for anything but an array', () => {
		expect(readExamLive(null)).toBeNull();
		expect(readExamLive({ rows: [] })).toBeNull();
	});
	it('keeps a well-formed row and drops the rest', () => {
		const rows = readExamLive([ROW, { exam_id: 'E2' }, 'x', { ...ROW, exam_id: 'E3', flags: [{ at: 'x' }, { at: '2026-10-15T19:05:00Z', kind: 'hidden' }], student: null }]);
		expect(rows?.map((r) => r.exam_id)).toEqual(['E1', 'E3']);
		expect(rows?.[0]).toEqual(ROW);
		expect(rows?.[1].flags).toEqual([{ at: '2026-10-15T19:05:00Z', kind: 'hidden' }]);
		expect(rows?.[1].student).toEqual({ email: '', name: null });
	});
});
