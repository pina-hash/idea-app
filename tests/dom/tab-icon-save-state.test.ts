// tests/dom/tab-icon-save-state.test.ts
//
// The one save state lights the tab icon (ledger 0396): saving while a write
// is in flight, done when it is acknowledged, error while it has stopped
// retrying -- and every one of those ends when the machine moves on or goes
// away. A machine that left its error raised after its surface unmounted
// would paint a warning on every page until a reload, which nothing on the
// page could explain, so the teardown half is asserted as hard as the raise.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { SaveState, type SaveOutcome } from '../../src/lib/save-state.svelte';
import {
	clearAllTabStatuses,
	currentTabStatus,
	frameFor,
	mountTabIcon,
	setTabPath,
	subscribeTabStatus,
	TAB_ICON_FRAME_MS
} from '../../src/lib/tab-icon/live';
import { url } from '../../src/lib/tab-icon/geometry';

const instant = { wait: async () => {}, debounceMs: 1 };

afterEach(() => clearAllTabStatuses());

/** A save whose answer the test hands over when it chooses. */
function deferredSave() {
	let resolve!: (o: SaveOutcome) => void;
	const calls: number[] = [];
	return {
		save: () => {
			calls.push(1);
			return new Promise<SaveOutcome>((r) => (resolve = r));
		},
		answer: (o: SaveOutcome) => resolve(o),
		calls
	};
}

describe('the save state raises and clears tab statuses', () => {
	it('saving while the write is in flight, then done on the acknowledgement', async () => {
		const d = deferredSave();
		const s = new SaveState({ save: d.save, ...instant });
		expect(currentTabStatus().kind).toBe('none');
		s.markDirty();
		const run = s.saveNow();
		expect(s.phase).toBe('writing');
		expect(currentTabStatus().kind).toBe('saving');
		d.answer({ ok: true });
		await run;
		expect(s.phase).toBe('saved');
		expect(currentTabStatus().kind).toBe('done');
		s.destroy();
	});

	it('a write that stops retrying shows error until a retry lands', async () => {
		let ok = false;
		const s = new SaveState({
			save: async () => (ok ? { ok: true } : { ok: false, retryable: false, message: 'Refused.' }),
			...instant
		});
		s.markDirty();
		await s.saveNow();
		expect(s.phase).toBe('failed');
		expect(currentTabStatus().kind).toBe('error');
		ok = true;
		await s.retry();
		expect(s.phase).toBe('saved');
		expect(currentTabStatus().kind).toBe('done');
		s.destroy();
	});

	it('destroying a failed machine clears its error', async () => {
		const s = new SaveState({ save: async () => ({ ok: false, retryable: false, message: 'No.' }), ...instant });
		s.markDirty();
		await s.saveNow();
		expect(currentTabStatus().kind).toBe('error');
		s.destroy();
		expect(currentTabStatus().kind).toBe('none');
	});

	it('re-editing or resetting a failed machine clears its error, and seeding a baseline raises nothing', async () => {
		const s = new SaveState({
			save: async () => ({ ok: false, retryable: false, message: 'No.' }),
			autosave: false,
			...instant
		});
		s.markSaved();
		expect(currentTabStatus().kind).toBe('none');
		s.markDirty();
		await s.saveNow();
		expect(currentTabStatus().kind).toBe('error');
		s.markDirty();
		expect(currentTabStatus().kind).toBe('none');
		await s.saveNow();
		expect(currentTabStatus().kind).toBe('error');
		s.reset();
		expect(currentTabStatus().kind).toBe('none');
		s.destroy();
	});

	it('a write that lands after the machine was destroyed raises nothing', async () => {
		const d = deferredSave();
		const s = new SaveState({ save: d.save, ...instant });
		s.markDirty();
		const run = s.saveNow();
		expect(currentTabStatus().kind).toBe('saving');
		s.destroy();
		expect(currentTabStatus().kind).toBe('none');
		d.answer({ ok: true });
		await run;
		expect(currentTabStatus().kind).toBe('none');
	});

	it('two machines: one failed outranks the other saving, and each clears only its own', async () => {
		const failing = new SaveState({ save: async () => ({ ok: false, retryable: false, message: 'No.' }), ...instant });
		const d = deferredSave();
		const saving = new SaveState({ save: d.save, ...instant });
		failing.markDirty();
		await failing.saveNow();
		saving.markDirty();
		const run = saving.saveNow();
		expect(currentTabStatus().kind).toBe('error');
		failing.destroy();
		expect(currentTabStatus().kind).toBe('saving');
		d.answer({ ok: true });
		await run;
		saving.destroy();
		expect(currentTabStatus().kind).toBe('done');
	});
});

/** Every status the tab is asked to show, in order, one entry per change. */
function recordShown(): { kinds: string[]; stop: () => void } {
	const kinds: string[] = [currentTabStatus().kind];
	const stop = subscribeTabStatus(() => {
		const k = currentTabStatus().kind;
		if (kinds[kinds.length - 1] !== k) kinds.push(k);
	});
	return { kinds, stop };
}

describe('the hand-off from saving never rests in between', () => {
	it('saving goes straight to done: the tab is never asked to show the resting icon between them', async () => {
		const d = deferredSave();
		const s = new SaveState({ save: d.save, ...instant });
		const shown = recordShown();
		s.markDirty();
		const run = s.saveNow();
		d.answer({ ok: true });
		await run;
		shown.stop();
		expect(shown.kinds).toEqual(['none', 'saving', 'done']);
		s.destroy();
	});

	it('saving goes straight to error on a refusal, and a retry goes straight from error to saving', async () => {
		let ok = false;
		const d = deferredSave();
		const s = new SaveState({
			save: () => (ok ? d.save() : Promise.resolve({ ok: false, retryable: false, message: 'Refused.' })),
			...instant
		});
		const shown = recordShown();
		s.markDirty();
		await s.saveNow();
		ok = true;
		const run = s.retry();
		d.answer({ ok: true });
		await run;
		shown.stop();
		expect(shown.kinds).toEqual(['none', 'saving', 'error', 'saving', 'done']);
		s.destroy();
	});

	it.each([
		['full motion', false],
		['reduced motion', true]
	])('the painter writes the lit saving frame and then the done frame, and no resting href between them (%s)', async (_, reduce) => {
		const realMatchMedia = window.matchMedia;
		window.matchMedia = ((q: string) => ({
			matches: reduce && q === '(prefers-reduced-motion: reduce)',
			media: q,
			onchange: null,
			addEventListener() {},
			removeEventListener() {},
			addListener() {},
			removeListener() {},
			dispatchEvent: () => false
		})) as unknown as typeof window.matchMedia;
		document.head.innerHTML =
			'<link rel="icon" href="/IDEA/favicon.ico" sizes="32x32">' +
			'<link rel="icon" type="image/svg+xml" href="/IDEA/favicon.svg">';
		const link = document.head.querySelector('link[type="image/svg+xml"]') as HTMLLinkElement;
		const writes: string[] = [];
		const original = link.setAttribute.bind(link);
		link.setAttribute = (name: string, value: string) => {
			if (name === 'href') writes.push(value);
			original(name, value);
		};
		vi.useFakeTimers();
		setTabPath('/classroom/notebook');
		const unmount = mountTabIcon();
		try {
			vi.advanceTimersByTime(TAB_ICON_FRAME_MS);
			writes.length = 0;
			const d = deferredSave();
			const s = new SaveState({ save: d.save, ...instant });
			s.markDirty();
			const run = s.saveNow();
			// A write slower than one frame: under reduced motion nothing has
			// painted since the saving frame, so a cleared saving would paint the
			// resting drawing at once and leave done waiting out the throttle.
			vi.advanceTimersByTime(TAB_ICON_FRAME_MS * 2 + 100);
			d.answer({ ok: true });
			await run;
			vi.advanceTimersByTime(TAB_ICON_FRAME_MS);
			const resting = url(frameFor('notebook', { kind: 'none' }, 0, false));
			const savingLit = url(frameFor('notebook', { kind: 'saving' }, 0, reduce));
			const done = url(frameFor('notebook', { kind: 'done' }, 0, false));
			// The first write is the LIT saving frame, the last is done, and the
			// resting drawing is never written in between.
			expect(writes[0]).toBe(savingLit);
			// Lit by the drawing's own colour, not only by agreeing with frameFor.
			expect(decodeURIComponent(writes[0])).toContain('cy="25" r="3.4" fill="#8FE08A"');
			expect(writes[writes.length - 1]).toBe(done);
			expect(writes).not.toContain(resting);
			s.destroy();
			if (reduce) expect(writes).toEqual([savingLit, done]);
		} finally {
			unmount();
			vi.useRealTimers();
			setTabPath('/');
			window.matchMedia = realMatchMedia;
		}
	});
});
