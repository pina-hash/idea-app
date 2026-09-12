// tests/dom/foundry-card-mosaic.test.ts
//
// THE GALLERY CARD IS THE STUDENT'S THUMBNAIL NOW, AND THE CLAIMS THAT CAN GO
// SILENTLY WRONG ARE STRUCTURAL ONES.
//
// The card used to be a fixed 16:9 box with a panel of metadata under it; it is
// the picture itself, at the shape the student uploaded, with the name reachable
// four ways. Three of those four are things a component either renders or does
// not, and each of them fails INVISIBLY:
//
//   * a card that stops carrying `aria-label` still looks perfect and is an
//     unlabelled link to an image with an empty alt;
//   * a generated cover that stops painting its own title still looks like a
//     coloured plate, and the app's name is then nowhere at any width;
//   * a name plate that starts rendering on a generated cover repeats the name
//     twice, which nothing throws about;
//   * `loading="lazy"` creeping back onto the cover reflows the whole mosaic
//     mid-scroll, and looks completely correct in a static render.
//
// WHAT IS ASSERTED HERE AND WHAT IS NOT. Structure, attributes, element counts,
// which branch rendered, and the pure arithmetic behind the shape. NOT geometry,
// NOT contrast and NOT a tap target: happy-dom has no layout engine, so a box
// reads 0 and a colour reads '' and both pass vacuously (see
// `tests/dom/README.md`). That the mosaic is five columns at 1440 and one at
// 375, that the tallest card is 610px, and that the plate clears contrast are
// `verify:browser`'s claims and live in
// `tools/browser-verify/routes/foundry-mosaic.mjs`.
//
// EVERY EXCLUSION HERE IS PAIRED WITH A POSITIVE CONTROL ON THE SAME FIXTURE,
// because "0 name plates" is also what a component that rendered nothing at all
// reports.

import { afterEach, describe, expect, it } from 'vitest';
import FoundryCard from '../../src/lib/foundry/FoundryCard.svelte';
import FoundryGallery from '../../src/lib/foundry/FoundryGallery.svelte';
import {
	FOUNDRY_COVER_ASPECT,
	FOUNDRY_HEAT_HUE_BAND,
	clampCoverAspect,
	coverAspectIsClamped,
	foundryGeneratedHue,
	foundryMosaicColumns,
	hueIsHeat
} from '../../src/lib/foundry/mosaic';
import { mountInto, type Mounted } from './mount';

const OWNER = {
	owner_display_name: null,
	owner_full_name: 'Ana Reyes',
	owner_class: 'Engineering I Honors'
};

function app(over: Partial<Record<string, unknown>> & { id: string; slug: string; title: string }) {
	return { ...OWNER, cover_path: null, ...over } as never;
}

/** A cover path that `foundryCoverObjectKey` would accept, mapped by the caller. */
const KEY = '11111111-1111-4111-8111-111111111111/cover.png';

const WITH_COVER = app({
	id: '10000000-0000-4000-8000-000000000001',
	slug: 'orbit-lander',
	title: 'Orbit Lander',
	cover_path: KEY
});
const NO_COVER = app({
	id: '10000000-0000-4000-8000-000000000002',
	slug: 'signal-garden',
	title: 'Signal Garden'
});
const BAD_KEY = app({
	id: '10000000-0000-4000-8000-000000000003',
	slug: 'bad-key',
	title: 'Cover path is not a key',
	cover_path: 'not/a/key.png'
});

/** The real shape of the injected resolver: a key resolves, anything else is null. */
const coverUrl = (p: string) => (p === KEY ? `/api/foundry-cover/${p}` : null);

let live: Mounted | null = null;
afterEach(async () => {
	await live?.stop();
	live = null;
});

function card(props: Record<string, unknown>): HTMLElement {
	live = mountInto(FoundryCard as never, { href: '/foundry?app=x', coverUrl, ...props });
	return live.target;
}

describe('the card is the thumbnail', () => {
	it('an uploaded cover renders as the picture itself, with no chrome panel', () => {
		const c = card({ app: WITH_COVER });
		const img = c.querySelector('img.fdy-card-shot') as HTMLImageElement;
		expect(img).not.toBeNull();
		expect(img.getAttribute('src')).toBe(`/api/foundry-cover/${KEY}`);
		// The alt is empty because the LINK carries the name; an alt here would
		// be the name announced twice.
		expect(img.getAttribute('alt')).toBe('');

		// THE PANEL IS GONE. Each of these was a real element on this card
		// before, and each is an exclusion whose positive control is the
		// picture and the plate that ARE present.
		for (const gone of [
			'.fdy-card-body',
			'.fdy-card-title',
			'.fdy-card-tagline',
			'.fdy-card-by',
			'.fdy-card-author',
			'.fdy-card-class',
			'.fdy-card-blank',
			'.fdy-card-cover'
		]) {
			expect(c.querySelectorAll(gone), `${gone} must be gone`).toHaveLength(0);
		}
		expect(c.querySelectorAll('img.fdy-card-shot')).toHaveLength(1);
		expect(c.querySelectorAll('[data-testid="fdy-card-name"]')).toHaveLength(1);
	});

	it('NO lazy loading on a cover: the mosaic re-balances when a card grows', () => {
		const img = card({ app: WITH_COVER }).querySelector('img.fdy-card-shot')!;
		expect(img.getAttribute('loading')).toBeNull();
		// The positive control for "the attribute sweep can see an attribute at
		// all" is the one this element does carry.
		expect(img.getAttribute('decoding')).toBe('async');
	});

	it('the card carries the hooks the measurement and the specs need', () => {
		const a = card({ app: WITH_COVER }).querySelector('a.fdy-card') as HTMLElement;
		// `foundryCoverMeasured` finds its card with `closest('[data-fdy-card]')`.
		expect(a.hasAttribute('data-fdy-card')).toBe(true);
		expect(a.dataset.appSlug).toBe('orbit-lander');
	});
});

describe('four routes to the name, and hover is only one of them', () => {
	it('route 4: the accessible name is on the LINK, so it never depends on a visual state', () => {
		const a = card({ app: WITH_COVER }).querySelector('a.fdy-card')!;
		expect(a.getAttribute('aria-label')).toBe('Orbit Lander, by Ana Reyes');
	});

	it('an app with no author still gets a name, without a dangling separator', () => {
		const anon = app({
			id: '10000000-0000-4000-8000-000000000009',
			slug: 'anon',
			title: 'Latch',
			owner_full_name: null,
			owner_display_name: null,
			owner_class: null
		});
		const a = card({ app: anon }).querySelector('a.fdy-card')!;
		expect(a.getAttribute('aria-label')).toBe('Latch');
	});

	it('route 1: a generated cover paints the name as its art and has NO plate', () => {
		const c = card({ app: NO_COVER });
		const made = c.querySelector('.fdy-card-made');
		expect(made).not.toBeNull();
		expect(made!.querySelector('.fdy-card-made-name')!.textContent!.trim()).toBe(
			'Signal Garden'
		);
		// The exclusion: no plate, because the art already states the name and
		// two copies of it is what a plate here would be.
		expect(c.querySelectorAll('[data-testid="fdy-card-name"]')).toHaveLength(0);
		// Its positive control is the previous test, where the SAME selector
		// finds exactly one on a card that has an uploaded cover.
		expect(c.querySelectorAll('img.fdy-card-shot')).toHaveLength(0);
	});

	it('a generated cover DOES get a plate when there is a count, and only the count', () => {
		// Without this branch a coverless app ranked by plays showed no number
		// at all, which is a ranking the reader cannot check. The name is not
		// repeated on it, because the art already is the name.
		const c = card({ app: NO_COVER, plays: '3 plays' });
		const plate = c.querySelector('[data-testid="fdy-card-name"]');
		expect(plate).not.toBeNull();
		expect(plate!.classList.contains('count-only')).toBe(true);
		expect(c.querySelectorAll('.fdy-card-name-title')).toHaveLength(0);
		expect(c.querySelector('[data-testid="fdy-card-plays"]')!.textContent).toContain('3 plays');
	});

	it('route 2/3: an uploaded cover carries the plate, and it holds the name', () => {
		const plate = card({ app: WITH_COVER }).querySelector('[data-testid="fdy-card-name"]')!;
		expect(plate.querySelector('.fdy-card-name-title')!.textContent!.trim()).toBe(
			'Orbit Lander'
		);
	});

	it('a cover path that is not a key is NOT a generated cover, and keeps its plate', () => {
		// The defect this pins: keying `made` on the src alone gave this card a
		// generated hue it never used AND withheld the plate, so the app's name
		// appeared nowhere on it at any width.
		const c = card({ app: BAD_KEY });
		expect(c.querySelectorAll('.fg-cover-bad')).toHaveLength(1);
		expect(c.querySelectorAll('.fdy-card-made')).toHaveLength(0);
		expect(c.querySelectorAll('[data-testid="fdy-card-name"]')).toHaveLength(1);
		const a = c.querySelector('a.fdy-card') as HTMLElement;
		expect(a.classList.contains('made')).toBe(false);
		expect(a.getAttribute('style')).toBeNull();
	});
});

describe('the play count is the caller’s decision, not the card’s', () => {
	it('renders exactly the string it was handed, and nothing for an empty one', async () => {
		expect(
			card({ app: WITH_COVER, plays: '42 plays this week' }).querySelector(
				'[data-testid="fdy-card-plays"]'
			)!.textContent
		).toContain('42 plays this week');
		await live!.stop();
		live = null;
		expect(
			card({ app: WITH_COVER, plays: '' }).querySelectorAll('[data-testid="fdy-card-plays"]')
		).toHaveLength(0);
	});
});

describe('the gallery mounts the card and owns the ranking', () => {
	function gallery(props: Record<string, unknown>) {
		live = mountInto(FoundryGallery as never, {
			apps: [WITH_COVER, NO_COVER, BAD_KEY],
			selected: null,
			coverUrl,
			onSelect: () => {},
			...props
		});
		return live.target;
	}

	it('one card per app, in a multicol mosaic whose column ceiling is the card count', () => {
		const c = gallery({});
		expect(c.querySelectorAll('[data-testid="fdy-card"]')).toHaveLength(3);
		const ul = c.querySelector('[data-testid="foundry-gallery-grid"]') as HTMLElement;
		expect(ul.classList.contains('fdy-gal-mosaic')).toBe(true);
		// Three apps, so three columns and never five: multicol has no
		// `auto-fit`, and the spare columns would be empty.
		expect(ul.getAttribute('style')).toContain('--fdy-cols: 3');
	});

	it('under Recent NO card shows a count; under a play ranking the ranked ones do', () => {
		const counts = {
			[WITH_COVER.id as string]: { plays: 42, plays7d: 5 },
			[NO_COVER.id as string]: { plays: 3, plays7d: 3 },
			[BAD_KEY.id as string]: { plays: 0, plays7d: 0 }
		};
		const c = gallery({ playCounts: counts });
		// Recent is the default, and a number on every card of a gallery nobody
		// ordered by plays reads as a verdict on the work.
		expect(c.querySelectorAll('[data-testid="fdy-card-plays"]')).toHaveLength(0);

		// THE POSITIVE CONTROL, on the same mount and the same fixture: press
		// Most played and the counts appear. Without it the assertion above is
		// also what a gallery that rendered no cards at all would report.
		const mostPlayed = [...c.querySelectorAll('.fdy-gal-sort-btn')].find(
			(b) => b.getAttribute('data-sort') === 'played'
		) as HTMLButtonElement;
		mostPlayed.click();
		live!.flush();
		// Two of three: the third app has zero plays and `playCountLabel`
		// renders nothing for zero, which is the assertion as much as the two.
		expect(c.querySelectorAll('[data-testid="fdy-card-plays"]')).toHaveLength(2);
	});
});

describe('the clamp arithmetic', () => {
	it('passes every shape a student actually uploads through untouched', () => {
		for (const [w, h] of [
			[1920, 1080], // a browser window
			[1024, 768],
			[900, 900],
			[1080, 1920] // a portrait phone screenshot: exactly the tall bound
		]) {
			expect(clampCoverAspect(w, h), `${w}x${h}`).toBeCloseTo(w / h, 6);
			expect(coverAspectIsClamped(w, h), `${w}x${h}`).toBe(false);
		}
	});

	it('clamps both pathological ends, and a modern tall phone', () => {
		expect(clampCoverAspect(400, 3600)).toBe(FOUNDRY_COVER_ASPECT.min);
		expect(clampCoverAspect(3600, 400)).toBe(FOUNDRY_COVER_ASPECT.max);
		expect(clampCoverAspect(1179, 2556)).toBe(FOUNDRY_COVER_ASPECT.min);
		for (const [w, h] of [
			[400, 3600],
			[3600, 400],
			[1179, 2556]
		]) {
			expect(coverAspectIsClamped(w, h)).toBe(true);
		}
	});

	it('THE PROPERTY THE TALL BOUND BUYS: one upload cannot own a phone screen', () => {
		// 343px is the column the mosaic actually gets at a 375px viewport,
		// measured on the harness. 667px is the smallest phone viewport in
		// common use. A 1:9 upload must come out under it.
		const tallest = 343 / clampCoverAspect(400, 3600)!;
		expect(tallest).toBeLessThan(667);
		expect(Math.round(tallest)).toBe(610);
	});

	it('answers NULL rather than a fallback for an image that has not loaded', () => {
		// `naturalWidth` is 0 on an image that has not loaded and on one that
		// failed to decode, and "never measured" must not read as "measured as
		// 3:2" -- only one of the two should ever be corrected later.
		for (const [w, h] of [
			[0, 0],
			[0, 100],
			[100, 0],
			[-1, 5],
			[Number.NaN, 5],
			[Number.POSITIVE_INFINITY, 5]
		]) {
			expect(clampCoverAspect(w, h), `${w}x${h}`).toBeNull();
		}
	});

	it('the column ceiling never exceeds the number of cards, and is never zero', () => {
		expect(foundryMosaicColumns(3, 5)).toBe(3);
		expect(foundryMosaicColumns(12, 5)).toBe(5);
		expect(foundryMosaicColumns(1, 5)).toBe(1);
		expect(foundryMosaicColumns(0, 5)).toBe(1);
		expect(foundryMosaicColumns(-4, 5)).toBe(1);
	});
});

describe('a generated cover never wears the heat the room reserves', () => {
	it('no hue lands in the band, over a sweep, and the predicate can find one', () => {
		let inBand = 0;
		for (let i = 0; i < 5000; i++) {
			if (hueIsHeat(foundryGeneratedHue(`app-${i}`))) inBand++;
		}
		expect(inBand).toBe(0);
		// THE POSITIVE CONTROL: the sweep above is also what a predicate that
		// answers false for everything would report.
		expect(hueIsHeat(FOUNDRY_HEAT_HUE_BAND.from)).toBe(true);
		expect(hueIsHeat(31)).toBe(true); // --fg-heat itself, measured at 30.8deg
		expect(hueIsHeat(FOUNDRY_HEAT_HUE_BAND.to)).toBe(false);
	});

	it('is stable for one app and spread across apps', () => {
		const id = '10000000-0000-4000-8000-000000000001';
		expect(foundryGeneratedHue(id)).toBe(foundryGeneratedHue(id));
		// Adjacent uuids must not land adjacent, or a class's apps all come out
		// one colour. A character sum does exactly that; this is why it is FNV.
		const a = foundryGeneratedHue('10000000-0000-4000-8000-00000000000a');
		const b = foundryGeneratedHue('10000000-0000-4000-8000-00000000000b');
		expect(Math.abs(a - b)).toBeGreaterThan(10);
	});
});
