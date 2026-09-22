// tests/identity-style-shared.test.ts
//
// THREE CLAIMS LEDGER 0289 MAKES THAT WOULD EACH FAIL SILENTLY.
//
//   1. THE LIFT CHANGED NO BEHAVIOUR. `$lib/identity-style.ts` is the
//      tournament layer's own helpers with the type widened off
//      `EntryStyle`; `entry-styles.ts` re-exports them. Nothing on a
//      tournament surface changed an import, so if the lift had quietly
//      dropped a validation arm the only symptom would be a banner rendering
//      slightly differently on a projector during a tournament.
//   2. THE REGISTRIES AND 0220's CHECK CONSTRAINTS AGREE. The database is the
//      authority on which badge and flourish ids exist; this repo carries the
//      label and the artwork. They are two lists in two languages and the
//      failure mode is a student picking a badge whose save is refused with a
//      raw constraint violation.
//   3. EVERY PRESET ID THAT EXISTED STILL RENDERS. `profiles.avatar` is free
//      text holding 'preset:<id>', so a dropped or renamed id turns somebody's
//      chosen picture into an initials tile with nothing saying why.
//
// THE "BEFORE" IS READ OFF GIT, NOT RETYPED. A retyped fixture characterizes
// what the author believed the old value was; `git show origin/main:<file>` is
// what was actually shipped. The prompt asks for all eight rendered before and
// after, and this is the only honest way to have a "before" at all.

import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { readFileSync } from 'node:fs';
import Avatar from '$lib/Avatar.svelte';
import {
	AVATAR_PRESETS,
	presetMarks,
	presetTier,
	markTransform,
	avatarSource,
	type AvatarPreset
} from '$lib/profile';
import {
	ACCENT_PRESETS,
	BADGES,
	FLOURISHES,
	PROFILE_FLOURISHES,
	accentOf,
	backgroundCss,
	bannerInk,
	hasStyle,
	INK_DARK,
	INK_LIGHT,
	NEUTRAL_ACCENT
} from '$lib/identity-style';
import * as entryStyles from '$lib/tournaments/entry-styles';

const MIGRATION = readFileSync('supabase/migrations/0220_profile_identity_style.sql', 'utf8');

// ---------------------------------------------------------------------------
// 1. The lift.
// ---------------------------------------------------------------------------

describe('the lift re-exports the tournament layer unchanged', () => {
	/* EVERY NAME A TOURNAMENT SURFACE IMPORTS, asserted to resolve to the SAME
	   function object. Identity rather than equality: a re-export that had been
	   rewritten as a wrapper would pass a behavioural check on the cases
	   somebody thought of and is exactly the second implementation this lift
	   exists to prevent. */
	it('hands back the identical function objects, not copies', () => {
		expect(entryStyles.accentOf).toBe(accentOf);
		expect(entryStyles.backgroundCss).toBe(backgroundCss);
		expect(entryStyles.bannerInk).toBe(bannerInk);
		expect(entryStyles.hasStyle).toBe(hasStyle);
		expect(entryStyles.BADGES).toBe(BADGES);
		expect(entryStyles.ACCENT_PRESETS).toBe(ACCENT_PRESETS);
		expect(entryStyles.FLOURISHES).toBe(FLOURISHES);
		expect(entryStyles.NEUTRAL_ACCENT).toBe(NEUTRAL_ACCENT);
		expect(entryStyles.INK_DARK).toBe(INK_DARK);
		expect(entryStyles.INK_LIGHT).toBe(INK_LIGHT);
	});

	/* A CORPUS THROUGH THE REAL FUNCTIONS, including the corners the CSS
	   derivation is there for: this is what interpolates into a style
	   attribute, so its refusals are a boundary and not a preference. */
	const cases: [string, unknown, string | null][] = [
		['a solid hex', { background_type: 'solid', background_value: '#3e7bfa' }, '#3e7bfa'],
		[
			'a gradient pair',
			{ background_type: 'gradient', background_value: ['#3e7bfa', '#8e5bf0'] },
			'linear-gradient(135deg, #3e7bfa 0%, #8e5bf0 100%)'
		],
		[
			'an https image',
			{ background_type: 'image', background_value: 'https://x.test/a.png' },
			'url("https://x.test/a.png") center / cover no-repeat'
		],
		['no background at all', { background_type: null, background_value: null }, null],
		['a solid that is a colour name', { background_type: 'solid', background_value: 'red' }, null],
		[
			'a solid smuggling css',
			{ background_type: 'solid', background_value: '#3e7bfa;background:url(//evil)' },
			null
		],
		['a gradient of one', { background_type: 'gradient', background_value: ['#3e7bfa'] }, null],
		[
			'a gradient holding a number',
			{ background_type: 'gradient', background_value: ['#3e7bfa', 5] },
			null
		],
		['an http image', { background_type: 'image', background_value: 'http://x.test/a.png' }, null],
		[
			'an image url breaking out of url()',
			{ background_type: 'image', background_value: 'https://x.test/a.png")whatever' },
			null
		],
		['a type with no value', { background_type: 'solid', background_value: null }, null]
	];

	it('asserts a corpus of both kinds, so an all-refuse run cannot pass', () => {
		expect(cases.length).toBe(11);
		expect(cases.filter(([, , out]) => out !== null).length).toBe(3);
		expect(cases.filter(([, , out]) => out === null).length).toBe(8);
	});

	for (const [label, style, expected] of cases) {
		it(`backgroundCss: ${label}`, () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect(backgroundCss(style as any)).toBe(expected);
			// The re-export answers identically, on the same input.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect(entryStyles.backgroundCss(style as any)).toBe(expected);
		});
	}

	it('bannerInk still picks dark ink for a light ground and light for a dark one', () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const ink = (s: any) => bannerInk(s);
		expect(ink({ background_type: 'solid', background_value: '#efb539' })).toBe(INK_DARK);
		expect(ink({ background_type: 'solid', background_value: '#1a2a1a' })).toBe(INK_LIGHT);
		expect(
			ink({ background_type: 'gradient', background_value: ['#ffffff', '#eeeeee'] })
		).toBe(INK_DARK);
		/* An IMAGE is always light ink: the art is unknown and the render pairs
		   it with a scrim. */
		expect(ink({ background_type: 'image', background_value: 'https://x.test/a.png' })).toBe(
			INK_LIGHT
		);
		expect(ink(null)).toBe(INK_LIGHT);
	});

	it('accentOf still falls back to neutral, never to emerald', () => {
		expect(accentOf(null)).toBe(NEUTRAL_ACCENT);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect(accentOf({ accent_color: null } as any)).toBe(NEUTRAL_ACCENT);
		expect(NEUTRAL_ACCENT).not.toBe(ACCENT_PRESETS.find((a) => a.id === 'emerald')?.hex);
	});
});

// ---------------------------------------------------------------------------
// 2. The registries and the database agree.
// ---------------------------------------------------------------------------

describe('the registries reconcile with 0220s CHECK constraints', () => {
	/** The ids inside a `... in ('a', 'b')` list following a marker. */
	function idsAfter(marker: string): string[] {
		const at = MIGRATION.indexOf(marker);
		expect(at, `0220 no longer carries ${marker}`).toBeGreaterThan(-1);
		const open = MIGRATION.indexOf(' in (', at);
		const close = MIGRATION.indexOf(')', open);
		return [...MIGRATION.slice(open, close).matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
	}

	it('every badge in the registry is accepted by the database, and no more', () => {
		expect(idsAfter('profiles_style_badge_ck')).toEqual(BADGES.map((b) => b.id).sort());
	});

	/* THE PROFILE FLOURISH SUBSET, BOTH DIRECTIONS. `PROFILE_FLOURISHES` is
	   DERIVED by filtering on kind rather than typed out, so this reconciles
	   the derivation against the migration -- and the second assertion is the
	   one that matters: an EVENT flourish must be refused, because a profile
	   has no decisive moment to play one at. */
	it('accepts exactly the ambient flourishes, and refuses the event ones', () => {
		const accepted = idsAfter('profiles_style_flourish_ck');
		expect(accepted).toEqual(PROFILE_FLOURISHES.map((f) => f.id).sort());
		for (const f of FLOURISHES.filter((f) => f.kind === 'event')) {
			expect(accepted, `${f.id} is an event flourish and must not be storable`).not.toContain(
				f.id
			);
		}
		/* POSITIVE CONTROL: there ARE event flourishes to have refused, so the
		   loop above is not passing over an empty list. */
		expect(FLOURISHES.filter((f) => f.kind === 'event').length).toBeGreaterThan(0);
		expect(PROFILE_FLOURISHES.length).toBeGreaterThan(0);
	});

	it('refuses an image background, which is 0220s narrowing against 0064', () => {
		const accepted = idsAfter('profiles_style_bg_type_ck');
		expect(accepted).toEqual(['gradient', 'solid']);
		expect(accepted).not.toContain('image');
	});

	it('caps the tagline where 0064 caps it', () => {
		expect(MIGRATION).toContain('between 1 and 48');
	});
});

// ---------------------------------------------------------------------------
// 3. Every preset id still renders.
// ---------------------------------------------------------------------------

/** The preset array as it stood on origin/main, parsed out of the shipped file. */
function presetsOnMain(): { id: string; fg: string; d: string }[] {
	const src = execFileSync('git', ['show', 'origin/main:src/lib/profile.ts'], {
		encoding: 'utf8'
	});
	const block = src.slice(
		src.indexOf('export const AVATAR_PRESETS'),
		src.indexOf('export function presetById')
	);
	return [...block.matchAll(/\{\s*id: '([^']+)', label: '[^']*', fg: '([^']+)', d: '([^']+)'/g)].map(
		(m) => ({ id: m[1], fg: m[2], d: m[3] })
	);
}

describe('every preset that shipped still renders', () => {
	const before = presetsOnMain();

	it('read the eight off origin/main, so the before is real and not retyped', () => {
		expect(before.length, 'parsed nothing out of origin/main: the sweep is vacuous').toBe(8);
		expect(before.map((p) => p.id)).toEqual([
			'hex',
			'cube',
			'triad',
			'reticle',
			'bolt',
			'gear',
			'wave',
			'delta'
		]);
	});

	it('keeps every id, and adds rather than replaces', () => {
		const now = AVATAR_PRESETS.map((p) => p.id);
		for (const p of before) expect(now, `${p.id} was dropped or renamed`).toContain(p.id);
		expect(now.length).toBeGreaterThan(before.length);
		/* No duplicate ids: two entries under one id is a picker with an
		   unreachable option and a stored value that resolves to whichever
		   comes first. */
		expect(new Set(now).size).toBe(now.length);
	});

	it('keeps every original ARTWORK byte-identical', () => {
		for (const p of before) {
			const now = AVATAR_PRESETS.find((x) => x.id === p.id) as AvatarPreset;
			expect(now.d, `${p.id}'s path changed`).toBe(p.d);
			/* And the original marks stay single-path, which is what makes the
			   widening free for them. */
			expect(presetMarks(now).length, `${p.id} gained a mark`).toBe(1);
			expect(presetTier(now)).toBe('geometric');
		}
	});

	/* THE TWO COLOUR REPAIRS, ASSERTED AS A DELIBERATE CHANGE RATHER THAN LEFT
	   TO LOOK LIKE DRIFT. `gear` and `wave` measured 2.57:1 and 1.33:1 as glyph
	   strokes on the portal grounds, against the 3:1 floor a graphical object
	   carries. Everything else is untouched. */
	it('moved exactly two colours, and both upward in contrast', () => {
		const moved = before.filter(
			(p) => AVATAR_PRESETS.find((x) => x.id === p.id)?.fg !== p.fg
		);
		expect(moved.map((p) => p.id).sort()).toEqual(['gear', 'wave']);
		const lum = (hex: string) => {
			const n = Number.parseInt(hex.slice(1), 16);
			const ch = (v: number) => {
				const c = v / 255;
				return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
			};
			return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
		};
		const ratio = (a: string, b: string) => {
			const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
			return (x + 0.05) / (y + 0.05);
		};
		/* The tile's ground is `--bg2`; the default palette's is the harder of
		   the two themes for a light stroke. */
		const GROUND = '#222e22';
		for (const p of moved) {
			const now = AVATAR_PRESETS.find((x) => x.id === p.id) as AvatarPreset;
			expect(ratio(p.fg, GROUND), `${p.id} did not actually fail before`).toBeLessThan(3);
			expect(ratio(now.fg, GROUND), `${p.id} still fails the 3:1 floor`).toBeGreaterThanOrEqual(3);
		}
	});

	/* EVERY PRESET IS RENDERED THROUGH THE REAL COMPONENT, old and new alike,
	   and has to put its own path on screen. This is the "rendering all eight
	   before and after" the prompt asks for, done on the shipping renderer
	   rather than on the data. */
	it('renders every preset through Avatar, with all of its marks', () => {
		for (const p of AVATAR_PRESETS) {
			const html = render(Avatar, {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				props: { profile: { id: 'u1', avatar: `preset:${p.id}` } as any, size: 40 }
			}).body;
			expect(html, `${p.id} did not resolve to a preset`).toContain(p.fg);
			for (const mark of presetMarks(p)) {
				expect(html, `${p.id} dropped a mark`).toContain(mark.d);
				if (markTransform(mark)) {
					expect(html, `${p.id} dropped a rotation`).toContain(markTransform(mark) as string);
				}
			}
		}
	});

	it('resolves every id through avatarSource, which is what a stored row hits', () => {
		for (const p of AVATAR_PRESETS) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const src = avatarSource({ id: 'u1', avatar: `preset:${p.id}` } as any);
			expect(src.kind, `preset:${p.id} no longer resolves`).toBe('preset');
		}
		/* POSITIVE CONTROL: an id that does not exist falls through to the tile
		   rather than resolving, so the assertions above are not trivially
		   true of any string. */
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect(avatarSource({ id: 'u1', avatar: 'preset:phone-cat' } as any).kind).toBe('initials');
	});

	/* A FILLED MARK SAYS `currentColor` RATHER THAN A HEX. The renderer sets
	   `color` to the preset's own `fg`, so a fill that named a colour would be
	   a second place a preset's colour is written down -- and the one that does
	   not move when the other is corrected, which is exactly what just happened
	   to `gear` and `wave`. */
	it('never writes a presets colour down twice', () => {
		for (const p of AVATAR_PRESETS) {
			for (const mark of presetMarks(p)) {
				if (mark.fill) expect(mark.fill, `${p.id} pins a fill colour`).toBe('currentColor');
				if (mark.stroke) expect(mark.stroke, `${p.id} pins a stroke colour`).toBe('currentColor');
			}
		}
	});

	it('gives every tier at least one member, so no tier heading renders empty', () => {
		for (const tier of ['geometric', 'creature', 'instrument'] as const) {
			expect(
				AVATAR_PRESETS.filter((p) => presetTier(p) === tier).length,
				`the ${tier} tier is empty`
			).toBeGreaterThan(0);
		}
	});

	/* REPORT 24's ANSWER, PINNED. The student asked to add to a "mascot pack"
	   that did not exist; it does now and it has a cat. If a later bundle
	   removes the creature tier, that is a decision somebody should have to
	   make deliberately rather than discover from a student. */
	it('has a mascot pack, and there is a cat in it', () => {
		const creatures = AVATAR_PRESETS.filter((p) => presetTier(p) === 'creature');
		expect(creatures.length).toBeGreaterThanOrEqual(5);
		expect(creatures.map((p) => p.id)).toContain('cat');
	});
});
