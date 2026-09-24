// tests/dom/classroom-tour-offer-mount.test.ts
//
// THE TOUR IS OFFERED ONCE, NEVER BLOCKS, AND GOES AWAY ON ESCAPE (ledger 0297,
// LEARN). Mounts the REAL `ClassroomTour` over a real preference store (the
// memory backing, so what it WROTE is readable back) and drives it the way a
// first visit, a second visit and a reader who says "Not now" would:
//
//   - an `unseen` tour shows the offer, and the store says `offered` at once --
//     before anybody answers it, which is what makes "once" true of a person
//     who walks away;
//   - a second mount over the same store (the next page load) shows nothing;
//   - "Not now" and Escape (with focus in the offer) put it away and record
//     `dismissed`, and focus goes to the caller's fallback;
//   - with no store at all (a surface outside the classroom) nothing is offered;
//   - the offer names which tour it is for, so a student's first visit is never
//     answered with the teacher's.
//
// Structure, events and storage only. No geometry is asserted here; happy-dom
// has no layout engine (see `mount.ts`).

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import ClassroomTour from '$lib/tour/ClassroomTour.svelte';
import { CLASSROOM_PREFERENCE_SCHEMA } from '$lib/preferences/classroom';
import { MemoryPreferenceStore } from '$lib/preferences/store';
import { liveCommandIds } from '$lib/shell/command-handlers';
import { mountInto, type Mounted } from './mount';

const Tour = ClassroomTour as unknown as Component<Record<string, unknown>>;

let mounted: Mounted[] = [];
afterEach(async () => {
	for (const m of mounted) await m.stop();
	mounted = [];
});

function open(props: Record<string, unknown>): Mounted {
	const m = mountInto(Tour, props);
	mounted.push(m);
	return m;
}

const microtasks = () => new Promise((r) => setTimeout(r, 0));
const offer = (m: Mounted) => m.target.querySelector('[data-testid="tour-offer"]');

describe('the one-time offer', () => {
	it('a first visit is offered the tour for its own role, and the store says offered before anybody answers', async () => {
		const store = new MemoryPreferenceStore(CLASSROOM_PREFERENCE_SCHEMA);
		const m = open({ tour: 'student', preferences: store });
		expect(offer(m)).not.toBeNull();
		expect(offer(m)!.getAttribute('data-tour-id')).toBe('student');
		await microtasks();
		m.flush();
		expect(store.current.guidance.tours).toEqual({ teacher: 'unseen', student: 'offered' });
		// Still on screen: the offer is latched, not derived from the state it just wrote.
		expect(offer(m)).not.toBeNull();
	});

	it('the next visit, over the same stored state, is offered nothing (positive control: a fresh store is)', async () => {
		const store = new MemoryPreferenceStore(CLASSROOM_PREFERENCE_SCHEMA);
		const first = open({ tour: 'teacher', preferences: store });
		expect(offer(first)).not.toBeNull();
		await microtasks();
		await first.stop();

		const second = open({ tour: 'teacher', preferences: store });
		await microtasks();
		second.flush();
		expect(offer(second)).toBeNull();
		expect(store.current.guidance.tours.teacher).toBe('offered');

		const fresh = open({ tour: 'teacher', preferences: new MemoryPreferenceStore(CLASSROOM_PREFERENCE_SCHEMA) });
		expect(offer(fresh)).not.toBeNull();
	});

	it('a tour finished or skipped on another computer is not offered here', () => {
		for (const state of ['finished', 'dismissed', 'offered']) {
			const store = new MemoryPreferenceStore(CLASSROOM_PREFERENCE_SCHEMA, {
				guidance: { tours: { teacher: state, student: state } }
			});
			const m = open({ tour: 'student', preferences: store });
			expect(offer(m), state).toBeNull();
		}
	});

	it('a student whose TEACHER tour is unseen is still offered only the student tour', async () => {
		const store = new MemoryPreferenceStore(CLASSROOM_PREFERENCE_SCHEMA, {
			guidance: { tours: { teacher: 'unseen', student: 'offered' } }
		});
		const m = open({ tour: 'student', preferences: store });
		await microtasks();
		m.flush();
		expect(offer(m)).toBeNull();
		expect(store.current.guidance.tours.teacher).toBe('unseen');
	});

	it('no store, or a place that must not offer, offers nothing', () => {
		expect(offer(open({ tour: 'student', preferences: null }))).toBeNull();
		const store = new MemoryPreferenceStore(CLASSROOM_PREFERENCE_SCHEMA);
		const m = open({ tour: 'student', preferences: store, canOffer: false });
		expect(offer(m)).toBeNull();
		expect(store.current.guidance.tours.student).toBe('unseen');
	});

	it('"Not now" puts it away, records dismissed, and hands focus to the fallback', async () => {
		const store = new MemoryPreferenceStore(CLASSROOM_PREFERENCE_SCHEMA);
		const fallback = document.createElement('button');
		document.body.appendChild(fallback);
		const m = open({ tour: 'student', preferences: store, returnFocus: () => fallback });
		const notNow = m.one<HTMLButtonElement>('[data-testid="tour-offer-dismiss"]');
		notNow.focus();
		notNow.click();
		m.flush();
		await microtasks();
		expect(offer(m)).toBeNull();
		expect(store.current.guidance.tours.student).toBe('dismissed');
		expect(document.activeElement).toBe(fallback);
		fallback.remove();
	});

	it('Escape with focus in the offer puts it away; Escape from a field elsewhere does not', async () => {
		const store = new MemoryPreferenceStore(CLASSROOM_PREFERENCE_SCHEMA);
		const m = open({ tour: 'student', preferences: store });
		const field = document.createElement('input');
		document.body.appendChild(field);
		field.focus();
		field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
		m.flush();
		expect(offer(m)).not.toBeNull();

		const start = m.one<HTMLButtonElement>('[data-testid="tour-offer-start"]');
		start.focus();
		const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
		start.dispatchEvent(esc);
		m.flush();
		expect(offer(m)).toBeNull();
		expect(esc.defaultPrevented).toBe(true);
		expect(store.current.guidance.tours.student).toBe('dismissed');
		field.remove();
	});

	it('nothing is paused behind the offer: it renders no backdrop and no dialog', () => {
		const m = open({ tour: 'teacher', preferences: new MemoryPreferenceStore(CLASSROOM_PREFERENCE_SCHEMA) });
		expect(offer(m)).not.toBeNull();
		expect(m.target.querySelector('.tour-backdrop, [role="dialog"], dialog')).toBeNull();
	});

	it('the palette can run it: "Take the tour" is registered while the walkthrough is mounted, and only then', async () => {
		const m = open({ tour: 'student', preferences: null });
		expect(liveCommandIds().has('tour.start')).toBe(true);
		await m.stop();
		expect(liveCommandIds().has('tour.start')).toBe(false);
	});
});
