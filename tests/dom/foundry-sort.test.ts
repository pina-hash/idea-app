// tests/dom/foundry-sort.test.ts
//
// WHICH ORDER THE GALLERY OPENS ON, AND WHAT HAPPENS WHEN TWO APPS TIE.
//
// This exists because the defect it pins was invisible for a day and was found
// by Mr. Pina opening the page. Decision 04 was answered MOST PLAYED FIRST on
// 2026-09-12 and recorded in ledger 0173 the same day; `FoundryGallery.svelte`
// went on initialising its sort state to `'recent'`, because a decision written
// in a document has nothing holding it to a line of code. Nothing threw,
// nothing type-checked wrong, and the only symptom was the wrong apps at the
// top of the page.
//
// SO THE ASSERTION IS THAT THE COMPONENT TAKES THE CONSTANT, NOT THAT IT
// EQUALS A STRING. A test spelling `'played'` at the mount site is a SECOND
// copy of the decision and would go stale in exactly the way the literal did --
// it would keep passing while the constant moved. `FOUNDRY_GALLERY_DEFAULT_SORT`
// is imported and its own value is checked once, in one place, against the
// decision entry; everything else compares the rendered state to the constant.
//
// THE TIEBREAK IS THE OTHER HALF AND IT IS LOAD-BEARING NOW. `sortGallery`
// relies on `Array.prototype.sort` being stable (required since ES2019) and has
// no index term in its comparator. Under the old `recent` default a tie was
// only seen by somebody who pressed a popularity tab; under `played` a gallery
// where nothing has been played IS every app tied at zero, so the tie order is
// the first thing every student sees and a comparator that shuffled equals
// would reorder the whole page between two loads.
//
// WHAT IS ASSERTED HERE AND WHAT IS NOT. Order, structure and pure arithmetic.
// NOT geometry, NOT contrast and NOT a tap target: happy-dom has no layout
// engine, so a box reads 0 and a colour reads '' and both pass vacuously (see
// `tests/dom/README.md`). Those are `verify:browser`'s claims and live in
// `tools/browser-verify/routes/foundry-gallery.mjs`.

import { afterEach, describe, expect, it } from 'vitest';
import FoundryGallery from '../../src/lib/foundry/FoundryGallery.svelte';
import {
	FOUNDRY_GALLERY_DEFAULT_SORT,
	FOUNDRY_GALLERY_SORTS,
	isGallerySort,
	sortGallery,
	type FoundryPlayCounts
} from '../../src/lib/foundry/telemetry';
import { mountInto, type Mounted } from './mount';

const OWNER = {
	owner_display_name: null,
	owner_full_name: 'Ana Reyes',
	owner_class: null
};

/**
 * THREE APPS IN `foundry_list_apps` ORDER (`updated_at desc, created_at
 * desc`), which is what the route hands in and therefore what a tie must
 * preserve. The ids are deliberately NOT in that order alphabetically, so a
 * comparator that fell back to sorting by id would be visible.
 */
function app(id: string, slug: string, title: string) {
	return {
		id,
		slug,
		title,
		tagline: null,
		cover_path: null,
		published_version_id: `v-${id}`,
		published_ordinal: 1,
		version_count: 1,
		submitted_version_id: null,
		metadata_flagged_at: null,
		hidden_at: null,
		updated_at: '2026-08-20T09:00:00Z',
		...OWNER
	};
}

const NEWEST = app('c-newest', 'newest', 'Newest');
const MIDDLE = app('a-middle', 'middle', 'Middle');
const OLDEST = app('b-oldest', 'oldest', 'Oldest');
const IN_ORDER = [NEWEST, MIDDLE, OLDEST];

/**
 * The apps as the mosaic actually rendered them, top to bottom, read off
 * `data-app-slug` -- the card's own stable hook. NOT `aria-label`, which the
 * card composes as "<title>, by <author>" and which would make this helper
 * quietly a test of the author line as well.
 */
function renderedSlugs(root: HTMLElement): string[] {
	return [...root.querySelectorAll('[data-testid="fdy-card"]')].map(
		(el) => el.getAttribute('data-app-slug') ?? ''
	);
}

describe('the gallery default order', () => {
	let live: Mounted | null = null;
	afterEach(async () => {
		await live?.stop();
		live = null;
	});

	function gallery(props: Record<string, unknown> = {}): HTMLElement {
		live = mountInto(FoundryGallery as never, {
			apps: IN_ORDER,
			selected: null,
			coverUrl: () => null,
			onSelect: () => {},
			...props
		});
		return live.target;
	}

	/**
	 * THE ONE PLACE THE DECISION'S ACTUAL ANSWER IS SPELLED OUT. Everything else
	 * in this file compares against the constant, so this is the single line a
	 * later reversal has to move -- and it names the entry, so the reader knows
	 * where the answer came from rather than inferring it from a string.
	 */
	it('decision 04: the default is most played, and it is one exported constant', () => {
		expect(FOUNDRY_GALLERY_DEFAULT_SORT).toBe('played');
		expect(isGallerySort(FOUNDRY_GALLERY_DEFAULT_SORT)).toBe(true);
	});

	/**
	 * THE DEFAULT AND THE BUTTON ORDER ARE SEPARATE VALUES AND MUST STAY ABLE TO
	 * DISAGREE. `recent` is deliberately still the FIRST control, because the row
	 * reads from the plainest ordering to the narrowest window; a reader who
	 * assumes "the default is whichever is first" would quietly reintroduce the
	 * defect the moment somebody reordered the array for layout reasons.
	 */
	it('the default is NOT the first entry of the picker, on purpose', () => {
		expect(FOUNDRY_GALLERY_SORTS[0].id).toBe('recent');
		expect(FOUNDRY_GALLERY_DEFAULT_SORT).not.toBe(FOUNDRY_GALLERY_SORTS[0].id);
		// And the default is still an id the picker offers, which is the half
		// that would break if somebody renamed one of them.
		expect(FOUNDRY_GALLERY_SORTS.map((s) => s.id)).toContain(FOUNDRY_GALLERY_DEFAULT_SORT);
	});

	it('the gallery opens with the default order pressed, and no other', () => {
		const c = gallery({
			playCounts: {
				[NEWEST.id]: { plays: 1, plays7d: 1 },
				[MIDDLE.id]: { plays: 9, plays7d: 0 },
				[OLDEST.id]: { plays: 4, plays7d: 2 }
			}
		});
		const pressed = [...c.querySelectorAll('.fdy-gal-sort-btn')].filter(
			(b) => b.getAttribute('aria-pressed') === 'true'
		);
		expect(pressed).toHaveLength(1);
		expect(pressed[0].getAttribute('data-sort')).toBe(FOUNDRY_GALLERY_DEFAULT_SORT);
	});

	/**
	 * THE BEHAVIOUR, NOT THE FLAG. `aria-pressed` could be right while the list
	 * was ordered by something else, so the cards themselves are read: the
	 * most-played app must be first on the FIRST render, with nothing clicked.
	 */
	it('the first render is ordered by plays, before anything is pressed', () => {
		const c = gallery({
			playCounts: {
				[NEWEST.id]: { plays: 1, plays7d: 1 },
				[MIDDLE.id]: { plays: 9, plays7d: 0 },
				[OLDEST.id]: { plays: 4, plays7d: 2 }
			}
		});
		expect(renderedSlugs(c)).toEqual(['middle', 'oldest', 'newest']);

		// THE POSITIVE CONTROL on the same mount: pressing Recent restores the
		// route's own order. Without it, "Middle first" is also what a gallery
		// that happened to receive the apps in that order would report.
		const recent = [...c.querySelectorAll('.fdy-gal-sort-btn')].find(
			(b) => b.getAttribute('data-sort') === 'recent'
		) as HTMLButtonElement;
		recent.click();
		live!.flush();
		expect(renderedSlugs(c)).toEqual(['newest', 'middle', 'oldest']);
	});

	/**
	 * THE CASE THE DEFAULT MADE VISIBLE. Decision 04 says so in as many words:
	 * "a gallery where nothing has been played yet is every app tied at zero and
	 * renders in exactly the order Recent shows. The change is invisible until
	 * there are plays." That sentence is only true if the sort is stable.
	 */
	it('with nothing played, the default renders exactly what Recent renders', () => {
		const c = gallery({ playCounts: {} });
		expect(renderedSlugs(c)).toEqual(['newest', 'middle', 'oldest']);
	});

	/**
	 * ABSENCE OF COUNTS IS NOT ABSENCE OF AN ORDER. A load that degraded (the
	 * count read fails on a deployment between 0138 and 0139 and the gallery
	 * still renders) mounts with no `playCounts` prop at all, and the default is
	 * now a play ranking -- so this is the path a degraded production page takes.
	 */
	it('mounted with no counts prop at all, the default still renders every card', () => {
		const c = gallery({});
		expect(renderedSlugs(c)).toEqual(['newest', 'middle', 'oldest']);
		expect(c.querySelectorAll('[data-testid="fdy-card"]')).toHaveLength(3);
	});
});

describe('the tiebreak', () => {
	/**
	 * EXPECTED VALUES THAT DO NOT COME FROM THE IMPLEMENTATION. The order
	 * asserted here is the INPUT order, which is a property of the fixture and
	 * not of `sortGallery`; a comparator that shuffled equal counts could not
	 * produce it.
	 */
	it('equal counts keep the incoming order, at every position', () => {
		const counts: FoundryPlayCounts = {
			[NEWEST.id]: { plays: 7, plays7d: 0 },
			[MIDDLE.id]: { plays: 7, plays7d: 0 },
			[OLDEST.id]: { plays: 7, plays7d: 0 }
		};
		expect(sortGallery(IN_ORDER, counts, 'played').map((a) => a.id)).toEqual([
			NEWEST.id,
			MIDDLE.id,
			OLDEST.id
		]);
	});

	/**
	 * A PARTIAL TIE, WHICH IS THE ORDINARY SHAPE AND NOT THE ALL-EQUAL ONE. Two
	 * apps tie above a third; the pair must keep their relative order while the
	 * third sorts below them, which an unstable comparator fails only sometimes.
	 */
	it('a tie among some apps keeps their relative order while the rest sort', () => {
		const counts: FoundryPlayCounts = {
			[NEWEST.id]: { plays: 5, plays7d: 0 },
			[MIDDLE.id]: { plays: 5, plays7d: 0 },
			[OLDEST.id]: { plays: 11, plays7d: 0 }
		};
		expect(sortGallery(IN_ORDER, counts, 'played').map((a) => a.id)).toEqual([
			OLDEST.id,
			NEWEST.id,
			MIDDLE.id
		]);
	});

	/**
	 * SCALE, BECAUSE A THREE-ELEMENT SORT IS NOT AN INSTRUMENT FOR STABILITY.
	 * Engines have historically used insertion sort under a length threshold
	 * (V8's was 10) and only the general algorithm above it, so a small fixture
	 * can be stable by accident on an unstable implementation. Sixty tied apps
	 * is well past any such threshold.
	 */
	it('sixty apps tied at zero come back in exactly the order they went in', () => {
		const many = Array.from({ length: 60 }, (_, i) => app(`id-${i}`, `s-${i}`, `T${i}`));
		const out = sortGallery(many, {}, 'played');
		expect(out.map((a) => a.id)).toEqual(many.map((a) => a.id));
		// And by the window sort too, which shares the comparator.
		expect(sortGallery(many, {}, 'played7d').map((a) => a.id)).toEqual(many.map((a) => a.id));
	});

	/** It never mutates the caller's array, which the route re-reads. */
	it('leaves the input untouched', () => {
		const input = [...IN_ORDER];
		sortGallery(input, { [MIDDLE.id]: { plays: 99, plays7d: 99 } }, 'played');
		expect(input.map((a) => a.id)).toEqual(IN_ORDER.map((a) => a.id));
	});

	/**
	 * A MISSING COUNT IS ZERO AND NOT A HOLE, asserted as an ORDER rather than
	 * as an absence of a throw: an app nobody has a row for must sort below one
	 * with plays and must not vanish.
	 */
	it('an app with no count row sorts as zero and is still in the list', () => {
		const out = sortGallery(IN_ORDER, { [OLDEST.id]: { plays: 2, plays7d: 2 } }, 'played');
		expect(out).toHaveLength(3);
		expect(out[0].id).toBe(OLDEST.id);
		expect(out.slice(1).map((a) => a.id)).toEqual([NEWEST.id, MIDDLE.id]);
	});
});
