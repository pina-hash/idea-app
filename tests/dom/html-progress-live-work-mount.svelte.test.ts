// tests/dom/html-progress-live-work-mount.svelte.test.ts
//
// THE RAIL TELLS THE CLASS LIST, AND THE CLASS LIST LISTENS (ledger 0360,
// report d983e776). The real `Progress.svelte` is mounted under the real
// `LiveWork` context, driven by the real `HxAnswersStore`, and the class list's
// row is the real `overlayWork` + `studentWorkChip`. A rail that publishes
// nothing, or publishes "Complete" over unsaved work, renders exactly the same
// rail, which is why the published opinion is read off the context and paired
// with a control.

import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Progress from '$lib/classroom/html-assignment/Progress.svelte';
import { HxAnswersStore } from '$lib/classroom/html-assignment/answers-store.svelte';
import type { HxAnswerTransports } from '$lib/classroom/html-assignment/answers';
import type { HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';
import { LIVE_WORK_KEY, LiveWork } from '$lib/classroom/live-work.svelte';
import { overlayWork } from '$lib/classroom/live-work';
import { studentWorkChip } from '$lib/classroom/classroom';

const MANIFEST = {
	schemaVersion: 3,
	kind: 'html-assignment',
	title: 'Concepts',
	course: 'IDEA100',
	points: 2,
	header: [],
	modules: [
		{
			id: 'm1',
			title: 'Concepts',
			points: 2,
			blocks: [
				{ id: 'b-one', field: 'one', type: 'text' },
				{ id: 'b-extra', field: 'extra', type: 'image', optional: true }
			],
			criteria: []
		}
	]
} as unknown as HtmlAssignmentManifest;

const ITEM = { kind: 'assignment' as const, due_at: '2026-09-29T06:59:00.000Z', points: 2 };
const NOW = '2026-09-29T15:30:00.000Z';

function transports(fail: () => boolean) {
	return {
		saveResponse: async () =>
			fail()
				? { ok: false as const, message: 'busy', retryable: true, gate: 'server' as const }
				: { ok: true as const, data: { ok: true } }
	} as unknown as HxAnswerTransports;
}

const live: { app: ReturnType<typeof mount>; target: HTMLElement }[] = [];
afterEach(() => {
	for (const m of live.splice(0)) {
		unmount(m.app);
		m.target.remove();
	}
});

/** Mounts the rail the way ItemDetail will: `status` from the store, under the layout's context. */
function mountRail(store: HxAnswersStore, work: LiveWork) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const props = $state({ manifest: MANIFEST, values: store.values, images: store.images, status: store.status });
	const app = mount(Progress, { target, props, context: new Map([[LIVE_WORK_KEY, work]]) });
	live.push({ app, target });
	const refresh = () => {
		props.values = store.values;
		props.images = store.images;
		props.status = store.status;
		flushSync();
	};
	return { target, refresh };
}

const tick = () => new Promise((r) => setTimeout(r, 20));

describe('Progress publishes its row to the class list, with no read', () => {
	it('finished and stored: the row beside it turns from Missing to Complete, late', async () => {
		const work = new LiveWork();
		const store = new HxAnswersStore({
			itemId: 'item-1',
			manifest: MANIFEST,
			transports: transports(() => false),
			wait: async () => {}
		});
		const rail = mountRail(store, work);
		expect(studentWorkChip(ITEM, overlayWork({}, work.overrides)['item-1'], NOW).label).toBe('Missing');

		store.change({ blockId: 'b-one', field: 'one', value: 'A cam follower.' });
		rail.refresh();
		// While the write is owed the rail says 99 and publishes NOTHING.
		expect(rail.target.querySelector('[data-hx-progress]')?.getAttribute('data-percent')).toBe('99');
		await tick();
		expect(work.overrides.has('item-1')).toBe(false);

		await store.flush();
		rail.refresh();
		await tick();
		expect(rail.target.querySelector('[data-hx-progress]')?.getAttribute('data-percent')).toBe('100');
		expect(typeof work.overrides.get('item-1')).toBe('string');
		expect(studentWorkChip(ITEM, overlayWork({}, work.overrides)['item-1'], NOW).label).toBe('Complete, late');
		store.destroy();
	});

	it('THE CONTROL: the same rail over a save that keeps failing publishes nothing and shows Retry', async () => {
		const work = new LiveWork();
		const store = new HxAnswersStore({
			itemId: 'item-1',
			manifest: MANIFEST,
			transports: transports(() => true),
			wait: async () => {}
		});
		const rail = mountRail(store, work);
		store.change({ blockId: 'b-one', field: 'one', value: 'A cam follower.' });
		await store.flush();
		rail.refresh();
		await tick();
		expect(work.overrides.has('item-1')).toBe(false);
		expect(rail.target.querySelector('[data-hx-progress]')?.getAttribute('data-percent')).toBe('99');
		expect(rail.target.querySelector('[data-hxp-save-line]')?.getAttribute('data-hxp-save-line')).toBe('failed');
		const retry = [...rail.target.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Retry');
		expect(retry).toBeTruthy();
		store.destroy();
	});
});
