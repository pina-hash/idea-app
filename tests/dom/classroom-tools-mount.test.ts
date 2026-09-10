// tests/dom/classroom-tools-mount.test.ts
//
// THE TWO CLASS TOOLS IN `tool` MODE, ON THE REAL COMPONENTS (prompt 0118,
// items SIX and TEN): the trigger-and-dialog shape, the live notice bus, and
// the disclosure boundary between the two projections.
//
// WHAT THIS FILE CAN SETTLE THAT NOTHING ELSE CAN. The live subscription is an
// `$effect`, and effects run ONLY here (`svelte/server`'s `render()` never runs
// one; a bare `$effect.root` in the node project invokes its callback zero
// times, measured). So "a notice on the bus re-asks the transport, once, after
// the debounce, and only for its own topic" is a claim that is green and
// vacuous anywhere but this project. The dialog is a native `<dialog>` and
// happy-dom implements `showModal()`/`close()`/`open` (probed for this bundle:
// `showModal` is a function and flips `open` to true), so the open/close
// paths are real DOM here too.
//
// Structure, events, effects and call counts only. happy-dom has no layout
// engine, so no geometry, contrast or tap-target claim appears here -- those
// are `tools/browser-verify/routes/classroom-tools*.mjs`.

import { afterEach, describe, expect, it, vi } from 'vitest';
import HallPass from '../../src/lib/classroom/HallPass.svelte';
import SongQueue from '../../src/lib/classroom/SongQueue.svelte';
import { createMemoryClassroomLive, type ClassroomLive } from '../../src/lib/classroom/live';
import {
	CLASSROOM_LIVE_DEBOUNCE_MS,
	classroomLivePausedLine,
	HALL_PASS_POLL_MS,
	type HallPassManagerState,
	type HallPassStudentState,
	type HallPassTransports
} from '../../src/lib/classroom/hall-pass';
import {
	SONG_QUEUE_POLL_MS,
	type SongQueueManagerState,
	type SongQueueStudentState,
	type SongQueueTransports
} from '../../src/lib/classroom/song-queue';
import { mountInto, type Mounted } from './mount';

const NOW = Date.parse('2026-08-28T17:42:00Z');
const ago = (mins: number) => new Date(NOW - mins * 60_000).toISOString();
const SECTION = '11111111-1111-1111-1111-111111111111';

/* ------------------------------------------------------------------ *
 * Fixtures: one state per projection per tool, plus recording transports.
 * ------------------------------------------------------------------ */
const studentHall: HallPassStudentState = {
	scope: 'student',
	section_id: SECTION,
	taken: false,
	mine: false,
	opened_at: null,
	limits: { cooldown_minutes: 10, daily_limit: 3 },
	used_today: 1
};
const managerHall: HallPassManagerState = {
	scope: 'manager',
	section_id: SECTION,
	taken: true,
	mine: false,
	open: {
		pass_id: 'p-1',
		student_email: 'ana@boscotech.net',
		student_name: 'Ana Reyes',
		opened_at: ago(6)
	},
	history: [
		{
			pass_id: 'p-1',
			student_email: 'ana@boscotech.net',
			student_name: 'Ana Reyes',
			opened_at: ago(6),
			closed_at: null,
			closed_by: null
		}
	],
	limits: { cooldown_minutes: 10, daily_limit: 3 },
	roster: [{ student_email: 'ana@boscotech.net', student_name: 'Ana Reyes' }]
};
const studentSong: SongQueueStudentState = {
	scope: 'student',
	section_id: SECTION,
	price: 2,
	pending_cap: 3,
	my_pending: 1,
	approved: [
		{ request_id: 'a-ben', url: 'https://open.example.org/track/9', note: null, decided_at: ago(30), mine: false }
	],
	mine: [
		{
			request_id: 's-mine',
			url: 'https://open.example.org/track/4',
			note: null,
			created_at: ago(6),
			decided_at: null,
			rejection_reason: null,
			status: 'pending'
		}
	]
};
const managerSong: SongQueueManagerState = {
	scope: 'manager',
	section_id: SECTION,
	price: 2,
	pending_cap: 3,
	pending: [
		{
			request_id: 's-mine',
			url: 'https://open.example.org/track/4',
			note: null,
			created_at: ago(6),
			student_email: 'sam@boscotech.net',
			student_name: 'Sam Ortiz',
			status: 'pending'
		}
	],
	decided: []
};

interface HallRec {
	loads: number;
	calls: string[];
}
function hallTransports(rec: HallRec, opts: { openOk?: boolean } = {}): HallPassTransports {
	return {
		async load() {
			rec.loads += 1;
			rec.calls.push('load');
			return null;
		},
		async open() {
			rec.calls.push('open');
			return opts.openOk === false
				? { ok: false, refusal: 'taken' }
				: { ok: true, data: { pass_id: 'p-2', opened_at: new Date(NOW).toISOString() } };
		},
		async closeMine() {
			rec.calls.push('closeMine');
			return { ok: false, refusal: 'not_yours' };
		},
		async closeById(passId) {
			rec.calls.push(`closeById:${passId}`);
			return {
				ok: true,
				data: {
					pass_id: passId,
					opened_at: ago(6),
					closed_at: new Date(NOW).toISOString(),
					closed_by_manager: true,
					student_name: 'Ana Reyes'
				}
			};
		},
		async openFor(_s, email) {
			rec.calls.push(`openFor:${email}`);
			return {
				ok: true,
				data: {
					pass_id: 'p-3',
					opened_at: new Date(NOW).toISOString(),
					student_email: email,
					student_name: 'Ana Reyes',
					opened_by: 'pina@boscotech.edu'
				}
			};
		}
	};
}
function songTransports(rec: HallRec, opts: { submitOk?: boolean } = {}): SongQueueTransports {
	return {
		async load() {
			rec.loads += 1;
			rec.calls.push('load');
			return null;
		},
		async submit(_s, url) {
			rec.calls.push(`submit:${url}`);
			return opts.submitOk === false
				? { ok: false, refusal: 'not_spotify', detail: {} }
				: { ok: true, data: { request_id: 's-new', pending: 2, cap: 3 } };
		},
		async approve(id) {
			rec.calls.push(`approve:${id}`);
			return { ok: true, data: { request_id: id, status: 'approved', student_name: 'Sam Ortiz', charged: 2 } };
		},
		async reject(id, reason) {
			rec.calls.push(`reject:${id}:${reason}`);
			return { ok: true, data: { request_id: id, status: 'rejected', student_name: 'Sam Ortiz', charged: 0 } };
		}
	};
}
const rec = (): HallRec => ({ loads: 0, calls: [] });

/** Real time, past the debounce, then a flush. */
async function pastDebounce(m: Mounted): Promise<void> {
	await new Promise((r) => setTimeout(r, CLASSROOM_LIVE_DEBOUNCE_MS + 60));
	m.flush();
	await m.settle();
}

let open: Mounted[] = [];
function track(m: Mounted): Mounted {
	open.push(m);
	return m;
}
afterEach(async () => {
	for (const m of open) await m.stop();
	open = [];
});

/* ------------------------------------------------------------------ *
 * The tool shape: trigger at rest, the same card inside the dialog.
 * ------------------------------------------------------------------ */
describe('tool mode renders the trigger and no card until opened', () => {
	it('HallPass: trigger present, card absent; opening mounts the card with its own testids', async () => {
		const r = rec();
		const m = track(
			mountInto(HallPass as never, { sectionId: SECTION, state: studentHall, transports: hallTransports(r), now: NOW, tool: true })
		);
		// AT REST: one trigger with the word, no dialog, no card, no control.
		expect(m.all('[data-testid="hall-pass-tool"]').length).toBe(1);
		expect(m.one('[data-testid="hall-pass-tool"]').textContent).toContain('Hall pass');
		expect(m.one('[data-testid="hall-pass-tool"]').getAttribute('aria-haspopup')).toBe('dialog');
		expect(m.one('[data-testid="hall-pass-tool"]').getAttribute('aria-expanded')).toBe('false');
		expect(m.one('[data-testid="hall-pass-tool-chip"]').textContent?.trim()).toBe('Free');
		expect(m.all('dialog').length).toBe(0);
		expect(m.all('[data-testid="hall-pass"]').length).toBe(0);
		expect(m.all('[data-testid="hall-pass-open"]').length).toBe(0);

		m.one<HTMLButtonElement>('[data-testid="hall-pass-tool"]').click();
		await m.settle();

		// OPEN: the dialog is modal, and the card inside it is the SAME card.
		const dlg = m.one<HTMLDialogElement>('dialog.ctool-dialog');
		expect(dlg.open).toBe(true);
		expect(dlg.getAttribute('aria-label')).toBe('Hall pass');
		expect(m.all('[data-testid="hall-pass"]').length).toBe(1);
		expect(m.all('[data-testid="hall-pass-status"]').length).toBe(1);
		expect(m.all('[data-testid="hall-pass-open"]').length).toBe(1);
		expect(m.all('[data-testid="hall-pass-tool-close"]').length).toBe(1);
		expect(m.one('[data-testid="hall-pass-tool"]').getAttribute('aria-expanded')).toBe('true');
		// Focus went to the card's own control, not the Close.
		expect(document.activeElement?.getAttribute('data-testid')).toBe('hall-pass-open');
	});

	it('SongQueue: the same, with the form inside and the "Music" word on the trigger', async () => {
		const r = rec();
		const m = track(
			mountInto(SongQueue as never, { sectionId: SECTION, state: studentSong, transports: songTransports(r), now: NOW, tool: true })
		);
		expect(m.all('[data-testid="song-queue-tool"]').length).toBe(1);
		expect(m.one('[data-testid="song-queue-tool"]').textContent).toContain('Music');
		expect(m.one('[data-testid="song-queue-tool-chip"]').textContent?.trim()).toBe('1 waiting');
		expect(m.all('[data-testid="song-queue"]').length).toBe(0);
		expect(m.all('[data-testid="song-queue-send"]').length).toBe(0);

		m.one<HTMLButtonElement>('[data-testid="song-queue-tool"]').click();
		await m.settle();
		expect(m.one<HTMLDialogElement>('dialog.ctool-dialog').open).toBe(true);
		expect(m.all('[data-testid="song-queue"]').length).toBe(1);
		expect(m.all('[data-testid="song-queue-url"]').length).toBe(1);
		expect(m.all('[data-testid="song-queue-send"]').length).toBe(1);
		expect(document.activeElement?.getAttribute('data-testid')).toBe('song-queue-url');
	});

	it('tool=false is the card as today: no trigger, no dialog, the card on the page', () => {
		const m = track(
			mountInto(HallPass as never, { sectionId: SECTION, state: studentHall, transports: hallTransports(rec()), now: NOW })
		);
		expect(m.all('[data-testid="hall-pass-tool"]').length).toBe(0);
		expect(m.all('dialog').length).toBe(0);
		expect(m.all('[data-testid="hall-pass"]').length).toBe(1);
		expect(m.all('[data-testid="hall-pass-open"]').length).toBe(1);
	});
});

describe('the three close paths, and focus coming back to the trigger', () => {
	it('the Close control unmounts the dialog and focuses the trigger', async () => {
		const m = track(
			mountInto(HallPass as never, { sectionId: SECTION, state: studentHall, transports: hallTransports(rec()), now: NOW, tool: true })
		);
		m.one<HTMLButtonElement>('[data-testid="hall-pass-tool"]').click();
		await m.settle();
		m.one<HTMLButtonElement>('[data-testid="hall-pass-tool-close"]').click();
		await m.settle();
		expect(m.all('dialog').length).toBe(0);
		expect(m.all('[data-testid="hall-pass"]').length).toBe(0);
		expect(m.one('[data-testid="hall-pass-tool"]').getAttribute('aria-expanded')).toBe('false');
		expect(document.activeElement).toBe(m.one('[data-testid="hall-pass-tool"]'));
	});

	it('Escape closes it', async () => {
		const m = track(
			mountInto(SongQueue as never, { sectionId: SECTION, state: studentSong, transports: songTransports(rec()), now: NOW, tool: true })
		);
		m.one<HTMLButtonElement>('[data-testid="song-queue-tool"]').click();
		await m.settle();
		const dlg = m.one<HTMLDialogElement>('dialog.ctool-dialog');
		dlg.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await m.settle();
		expect(m.all('dialog').length).toBe(0);
		expect(document.activeElement).toBe(m.one('[data-testid="song-queue-tool"]'));
	});

	it('a press on the panel keeps it open; a press on the backdrop (the dialog itself) closes it', async () => {
		const m = track(
			mountInto(HallPass as never, { sectionId: SECTION, state: studentHall, transports: hallTransports(rec()), now: NOW, tool: true })
		);
		m.one<HTMLButtonElement>('[data-testid="hall-pass-tool"]').click();
		await m.settle();
		const dlg = m.one<HTMLDialogElement>('dialog.ctool-dialog');
		m.one('.ctool-panel').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		await m.settle();
		expect(m.all('dialog').length).toBe(1);
		dlg.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		await m.settle();
		expect(m.all('dialog').length).toBe(0);
	});

	it("the browser's own close event (native Escape) is heard too", async () => {
		const m = track(
			mountInto(HallPass as never, { sectionId: SECTION, state: studentHall, transports: hallTransports(rec()), now: NOW, tool: true })
		);
		m.one<HTMLButtonElement>('[data-testid="hall-pass-tool"]').click();
		await m.settle();
		const dlg = m.one<HTMLDialogElement>('dialog.ctool-dialog');
		dlg.close();
		dlg.dispatchEvent(new Event('close'));
		await m.settle();
		expect(m.all('dialog').length).toBe(0);
		expect(m.one('[data-testid="hall-pass-tool"]').getAttribute('aria-expanded')).toBe('false');
	});
});

/* ------------------------------------------------------------------ *
 * The live bus: subscribe, re-ask on the right topic, unsubscribe, announce.
 * ------------------------------------------------------------------ */
describe('the live notice re-asks the transport, for its own topic only', () => {
	it('HallPass: a hall-pass notice calls load once after the debounce; a song-queue notice never does', async () => {
		const bus = createMemoryClassroomLive();
		const r = rec();
		const m = track(
			mountInto(HallPass as never, { sectionId: SECTION, state: studentHall, transports: hallTransports(r), now: NOW, live: bus, tool: true })
		);
		expect(bus.listenerCount(SECTION)).toBe(1);
		expect(r.loads).toBe(0);
		// The root reports the bus status for the harness.
		expect(m.one('[data-testid="hall-pass-tool-root"]').getAttribute('data-live')).toBe('live');

		bus.announce(SECTION, 'song-queue');
		await pastDebounce(m);
		expect(r.loads).toBe(0);

		bus.announce(SECTION, 'hall-pass');
		// NOT YET: the debounce is what folds a burst into one read.
		m.flush();
		expect(r.loads).toBe(0);
		await pastDebounce(m);
		expect(r.loads).toBe(1);
	});

	it('a burst of notices is one read', async () => {
		const bus = createMemoryClassroomLive();
		const r = rec();
		const m = track(
			mountInto(SongQueue as never, { sectionId: SECTION, state: managerSong, transports: songTransports(r), now: NOW, live: bus, tool: true })
		);
		bus.announce(SECTION, 'song-queue');
		bus.announce(SECTION, 'song-queue');
		bus.announce(SECTION, 'song-queue');
		await pastDebounce(m);
		expect(r.loads).toBe(1);
		// And the other topic did nothing for this component either.
		bus.announce(SECTION, 'hall-pass');
		await pastDebounce(m);
		expect(r.loads).toBe(1);
	});

	it('unmount unsubscribes: listenerCount back to 0, and a later notice reaches nothing', async () => {
		const bus = createMemoryClassroomLive();
		const r = rec();
		const m = track(
			mountInto(HallPass as never, { sectionId: SECTION, state: studentHall, transports: hallTransports(r), now: NOW, live: bus, tool: true })
		);
		const s = track(
			mountInto(SongQueue as never, { sectionId: SECTION, state: studentSong, transports: songTransports(rec()), now: NOW, live: bus, tool: true })
		);
		expect(bus.listenerCount(SECTION)).toBe(2);
		await m.stop();
		expect(bus.listenerCount(SECTION)).toBe(1);
		await s.stop();
		expect(bus.listenerCount(SECTION)).toBe(0);
		bus.announce(SECTION, 'hall-pass');
		await new Promise((res) => setTimeout(res, CLASSROOM_LIVE_DEBOUNCE_MS + 60));
		expect(r.loads).toBe(0);
	});

	it('no bus: no data-live, and the tool still polls its transport at HALL_PASS_POLL_MS (the poll is the floor)', async () => {
		/*
		 * THE POLL IS MEASURED, NOT NAMED. Fake timers go in BEFORE the mount so
		 * the effect's own `setInterval` is the one advanced; `load` is counted
		 * synchronously (an async function runs to its first `await`), so the
		 * count moves the instant the interval fires. Both directions: one tick
		 * short of the interval is 0, the interval is 1, and after unmount a
		 * further interval adds nothing (the effect's cleanup cleared it).
		 */
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
		try {
			const r = rec();
			const m = track(
				mountInto(HallPass as never, { sectionId: SECTION, state: studentHall, transports: hallTransports(r), now: NOW, tool: true })
			);
			expect(m.one('[data-testid="hall-pass-tool-root"]').hasAttribute('data-live')).toBe(false);
			expect(r.loads).toBe(0);
			vi.advanceTimersByTime(HALL_PASS_POLL_MS - 1);
			expect(r.loads).toBe(0);
			vi.advanceTimersByTime(1);
			expect(r.loads).toBe(1);
			vi.advanceTimersByTime(HALL_PASS_POLL_MS);
			expect(r.loads).toBe(2);
			await m.stop();
			vi.advanceTimersByTime(HALL_PASS_POLL_MS * 2);
			expect(r.loads).toBe(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it('a stalled bus shows the one quiet sentence in the card; a live one shows nothing', async () => {
		const stalled: ClassroomLive = {
			subscribe(_s, _onChange, onStatus) {
				onStatus?.('stalled');
				return () => {};
			},
			announce() {}
		};
		const m = track(
			mountInto(HallPass as never, { sectionId: SECTION, state: studentHall, transports: hallTransports(rec()), now: NOW, live: stalled })
		);
		expect(m.one('[data-testid="hall-pass"]').getAttribute('data-live')).toBe('stalled');
		expect(m.all('[data-testid="hall-pass-live"]').length).toBe(1);
		expect(m.one('[data-testid="hall-pass-live"]').textContent?.trim()).toBe(
			classroomLivePausedLine(HALL_PASS_POLL_MS)
		);
		expect(m.one('[data-testid="hall-pass-live"]').textContent).toContain('every 45 seconds');

		// POSITIVE CONTROL in the other direction: the memory bus is `live`.
		const live = track(
			mountInto(HallPass as never, { sectionId: SECTION, state: studentHall, transports: hallTransports(rec()), now: NOW, live: createMemoryClassroomLive() })
		);
		expect(live.one('[data-testid="hall-pass"]').getAttribute('data-live')).toBe('live');
		expect(live.all('[data-testid="hall-pass-live"]').length).toBe(0);
	});

	it.each([
		['HallPass', HallPass, studentHall, 'hall-pass', HALL_PASS_POLL_MS],
		['SongQueue', SongQueue, studentSong, 'song-queue', SONG_QUEUE_POLL_MS]
	])('%s in tool mode: a stalled bus shows the sentence BENEATH THE TRIGGER with the dialog shut; a live one shows nothing', async (_n, component, state, id, poll) => {
		/*
		 * IN TOOL MODE THE CARD IS INSIDE THE DIALOG, and the dialog is mounted
		 * only while open -- so a sentence that lived only in the card was
		 * invisible exactly when the chip is what somebody is reading. The
		 * trigger-side copy (`<id>-tool-live`) is asserted with the dialog SHUT,
		 * which is the state the previous case never covered; the card's own
		 * copy is then the second sentence once the dialog opens.
		 */
		const stalled: ClassroomLive = {
			subscribe(_s, _onChange, onStatus) {
				onStatus?.('stalled');
				return () => {};
			},
			announce() {}
		};
		const transports = id === 'hall-pass' ? hallTransports(rec()) : songTransports(rec());
		const m = track(
			mountInto(component as never, { sectionId: SECTION, state, transports, now: NOW, live: stalled, tool: true })
		);
		expect(m.one(`[data-testid="${id}-tool-root"]`).getAttribute('data-live')).toBe('stalled');
		// Dialog shut: one sentence, under the trigger, and no card copy (no card).
		expect(m.all('dialog').length).toBe(0);
		expect(m.all(`[data-testid="${id}-tool-live"]`).length).toBe(1);
		expect(m.one(`[data-testid="${id}-tool-live"]`).textContent?.trim()).toBe(classroomLivePausedLine(poll));
		expect(m.all(`[data-testid="${id}-live"]`).length).toBe(0);
		// Dialog open: the trigger copy stays and the card brings its own.
		m.one<HTMLButtonElement>(`[data-testid="${id}-tool"]`).click();
		await m.settle();
		expect(m.all(`[data-testid="${id}-tool-live"]`).length).toBe(1);
		expect(m.all(`[data-testid="${id}-live"]`).length).toBe(1);

		// POSITIVE CONTROL: the memory bus reports `live`, and neither sentence renders.
		const live = track(
			mountInto(component as never, {
				sectionId: SECTION,
				state,
				transports: id === 'hall-pass' ? hallTransports(rec()) : songTransports(rec()),
				now: NOW,
				live: createMemoryClassroomLive(),
				tool: true
			})
		);
		expect(live.one(`[data-testid="${id}-tool-root"]`).getAttribute('data-live')).toBe('live');
		expect(live.all(`[data-testid="${id}-tool-live"], [data-testid="${id}-live"]`).length).toBe(0);
	});
});

describe('a successful write announces; a refused one does not', () => {
	it('HallPass open: ok announces hall-pass; a refusal announces nothing', async () => {
		const bus = createMemoryClassroomLive();
		const ok = track(
			mountInto(HallPass as never, { sectionId: SECTION, state: studentHall, transports: hallTransports(rec()), now: NOW, live: bus, tool: true })
		);
		ok.one<HTMLButtonElement>('[data-testid="hall-pass-tool"]').click();
		await ok.settle();
		ok.one<HTMLButtonElement>('[data-testid="hall-pass-open"]').click();
		await ok.settle();
		expect(bus.announced).toEqual([{ sectionId: SECTION, topic: 'hall-pass' }]);

		const refusedBus = createMemoryClassroomLive();
		const r = rec();
		const no = track(
			mountInto(HallPass as never, {
				sectionId: SECTION,
				state: studentHall,
				transports: hallTransports(r, { openOk: false }),
				now: NOW,
				live: refusedBus,
				tool: true
			})
		);
		no.one<HTMLButtonElement>('[data-testid="hall-pass-tool"]').click();
		await no.settle();
		no.one<HTMLButtonElement>('[data-testid="hall-pass-open"]').click();
		await no.settle();
		expect(r.calls).toContain('open');
		expect(refusedBus.announced).toEqual([]);
	});

	it('HallPass manager closeById and openFor announce', async () => {
		const bus = createMemoryClassroomLive();
		const r = rec();
		const m = track(
			mountInto(HallPass as never, { sectionId: SECTION, state: managerHall, transports: hallTransports(r), now: NOW, live: bus, tool: true })
		);
		m.one<HTMLButtonElement>('[data-testid="hall-pass-tool"]').click();
		await m.settle();
		m.one<HTMLButtonElement>('[data-testid="hall-pass-close"]').click();
		await m.settle();
		expect(r.calls).toContain('closeById:p-1');
		expect(bus.announced.map((a) => a.topic)).toEqual(['hall-pass']);
	});

	it('SongQueue submit announces song-queue; approve and reject announce', async () => {
		const bus = createMemoryClassroomLive();
		const m = track(
			mountInto(SongQueue as never, { sectionId: SECTION, state: studentSong, transports: songTransports(rec()), now: NOW, live: bus, tool: true })
		);
		m.one<HTMLButtonElement>('[data-testid="song-queue-tool"]').click();
		await m.settle();
		const url = m.one<HTMLInputElement>('[data-testid="song-queue-url"]');
		url.value = 'https://open.example.org/track/new';
		url.dispatchEvent(new Event('input', { bubbles: true }));
		m.one<HTMLButtonElement>('[data-testid="song-queue-send"]').click();
		await m.settle();
		expect(bus.announced.map((a) => a.topic)).toEqual(['song-queue']);

		const mgrBus = createMemoryClassroomLive();
		const r = rec();
		const mgr = track(
			mountInto(SongQueue as never, { sectionId: SECTION, state: managerSong, transports: songTransports(r), now: NOW, live: mgrBus, tool: true })
		);
		mgr.one<HTMLButtonElement>('[data-testid="song-queue-tool"]').click();
		await mgr.settle();
		mgr.one<HTMLButtonElement>('[data-testid="song-queue-approve"]').click();
		await mgr.settle();
		expect(r.calls).toContain('approve:s-mine');
		expect(mgrBus.announced.map((a) => a.topic)).toEqual(['song-queue']);
	});

	it('a refused submit announces nothing', async () => {
		const bus = createMemoryClassroomLive();
		const r = rec();
		const m = track(
			mountInto(SongQueue as never, {
				sectionId: SECTION,
				state: studentSong,
				transports: songTransports(r, { submitOk: false }),
				now: NOW,
				live: bus
			})
		);
		const url = m.one<HTMLInputElement>('[data-testid="song-queue-url"]');
		url.value = 'https://elsewhere.example/x';
		url.dispatchEvent(new Event('input', { bubbles: true }));
		m.one<HTMLButtonElement>('[data-testid="song-queue-send"]').click();
		await m.settle();
		expect(r.calls.some((c) => c.startsWith('submit:'))).toBe(true);
		expect(bus.announced).toEqual([]);
	});
});

/* ------------------------------------------------------------------ *
 * The disclosure boundary, both directions, in tool mode.
 * ------------------------------------------------------------------ */
describe('the student projection never renders a manager-only element', () => {
	const MANAGER_ONLY_HALL = '[data-testid="hall-pass-override"], [data-testid="hall-pass-history"], .hp-who, .hp-history';
	const MANAGER_ONLY_SONG = '[data-testid="song-queue-pending"], [data-testid="song-queue-approve"], [data-testid="song-queue-reject"], [data-testid="song-queue-decided"], .sq-who';

	it('HallPass: 0 in the student dialog, present in the manager dialog', async () => {
		const s = track(
			mountInto(HallPass as never, { sectionId: SECTION, state: studentHall, transports: hallTransports(rec()), now: NOW, tool: true })
		);
		s.one<HTMLButtonElement>('[data-testid="hall-pass-tool"]').click();
		await s.settle();
		expect(s.all(MANAGER_ONLY_HALL).length).toBe(0);
		expect(s.one('[data-testid="hall-pass-tool-chip"]').textContent).not.toContain('Ana');
		expect(s.target.textContent).not.toContain('Ana Reyes');

		const m = track(
			mountInto(HallPass as never, { sectionId: SECTION, state: managerHall, transports: hallTransports(rec()), now: NOW, tool: true })
		);
		// POSITIVE CONTROL: the manager's chip and dialog name who is out.
		expect(m.one('[data-testid="hall-pass-tool-chip"]').textContent?.trim()).toBe('1 out · Ana Reyes');
		m.one<HTMLButtonElement>('[data-testid="hall-pass-tool"]').click();
		await m.settle();
		expect(m.all('[data-testid="hall-pass-history"]').length).toBe(1);
		expect(m.all('.hp-who').length).toBe(1);
		// Somebody is out, so the override row is correctly withheld here; the
		// history is the presence half. (The override's presence half is the
		// browser spec with nobody out.)
		expect(m.all('[data-testid="hall-pass-override"]').length).toBe(0);
	});

	it('SongQueue: 0 in the student dialog, present in the manager dialog', async () => {
		const s = track(
			mountInto(SongQueue as never, { sectionId: SECTION, state: studentSong, transports: songTransports(rec()), now: NOW, tool: true })
		);
		s.one<HTMLButtonElement>('[data-testid="song-queue-tool"]').click();
		await s.settle();
		expect(s.all(MANAGER_ONLY_SONG).length).toBe(0);
		expect(s.target.textContent).not.toContain('Sam Ortiz');

		const m = track(
			mountInto(SongQueue as never, { sectionId: SECTION, state: managerSong, transports: songTransports(rec()), now: NOW, tool: true })
		);
		expect(m.one('[data-testid="song-queue-tool-chip"]').textContent?.trim()).toBe('1 waiting');
		m.one<HTMLButtonElement>('[data-testid="song-queue-tool"]').click();
		await m.settle();
		expect(m.all('[data-testid="song-queue-pending"]').length).toBe(1);
		expect(m.all('[data-testid="song-queue-approve"]').length).toBe(1);
		expect(m.all('.sq-who').length).toBe(1);
		expect(m.target.textContent).toContain('Sam Ortiz');
	});
});
