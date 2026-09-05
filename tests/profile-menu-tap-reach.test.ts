// tests/profile-menu-tap-reach.test.ts
//
// THE PROFILE MENU TRIGGER'S 44px TOUCH TARGET, WHICH IS A REACH AND THEREFORE
// INVISIBLE.
//
// WHY THIS ONE IS WORTH A TEST, in a repo whose rule is that automated tests
// are the exception and a visible failure belongs in a harness. The regression
// here is SILENT IN BOTH DIRECTIONS AT ONCE. `.tap-reach-44` grows the HIT AREA
// with a `::after` pseudo-element and deliberately leaves the painted box at
// 34.0px, because this button is a flex item of a masthead row that 69 product
// pages size around -- so a session that deletes the class from the markup, or
// drops the `--tap-reach-w` declaration beside it, changes NOTHING on screen.
// The page renders pixel-for-pixel as it did, review sees no diff worth
// questioning, and the control is back under the floor on every one of those
// pages with nothing anywhere reporting it.
//
// AND THE INSTRUMENT THAT WOULD CATCH IT DOES NOT RUN ON EVERY CHANGE.
// `npm run verify:browser` measures the reach properly (it hit-tests five
// points across it, which is the only way to see a neighbour stealing a tap)
// and its `/dev/profile-menu` and `/dev/pathways` rows are the real
// verification. But that harness is deliberately outside `npm test` and outside
// CI, so it bites only when a session chooses to spend six minutes and a
// browser. This file is the half that bites on every run.
//
// WHAT IT DOES NOT CLAIM, and the boundary matters. It asserts NO GEOMETRY. It
// cannot: this is the `node` project on svelte's server build, and the `dom`
// project next door is happy-dom, which has no layout engine at all --
// `getBoundingClientRect()` answers 0x0 there and a 44px assertion written
// against it would pass vacuously, which is the exact instrument defect
// CLAUDE.md records for that project. So this asserts the MECHANISM is wired to
// the element (the class the global sheet's rule matches, and the width knob
// the same rule reads) and leaves every pixel to the browser harness.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { render } from 'svelte/server';

import ProfileMenu from '$lib/ProfileMenu.svelte';
// BY PATH, not through the `$app/state` alias: the alias is a vitest resolution
// and `svelte-check` type-checks against SvelteKit's real module, which exports no
// `withPageData`. This is the shape `foundry-gallery.test.ts` already uses.
import { withPageData } from './stubs/app-state.ts';

const COMPONENT = fileURLToPath(new URL('../src/lib/ProfileMenu.svelte', import.meta.url));
const APP_CSS = fileURLToPath(new URL('../src/app.css', import.meta.url));

/** Enough page data for the `{#if claims}` gate to open. */
const SIGNED_IN = {
	claims: { sub: 'u-1', email: 'student@boscotech.net' },
	supabase: null,
	userProfile: {
		id: 'u-1',
		display_name: 'Ana Reyes',
		full_name: 'Ana Reyes',
		avatar: null,
		avatar_url: null,
		pathway: 'IDEA',
		role: 'student'
	}
};

const html = () => withPageData(SIGNED_IN, () => render(ProfileMenu).body);

describe('the ProfileMenu trigger carries the reach mechanism', () => {
	it('renders a trigger at all (the positive control for every absence below)', () => {
		const body = html();
		// Without this, "the trigger carries .tap-reach-44" could be satisfied by
		// a component that rendered nothing, which is precisely what this one
		// does when `claims` is absent.
		expect(body).toContain('pm-trigger');
		expect(body.match(/class="[^"]*pm-trigger[^"]*"/g)).toHaveLength(1);
	});

	it('renders NOTHING when signed out, which is why the control above is needed', () => {
		const body = withPageData({ claims: null, userProfile: null }, () => render(ProfileMenu).body);
		expect(body).not.toContain('pm-trigger');
	});

	it('puts .tap-reach-44 on the trigger button itself', () => {
		// On the BUTTON and not on `.pm-root`: the reach rule is `position:
		// relative` plus an `::after`, and a pseudo-element is hit-tested as its
		// own element -- so a reach declared on the wrapper grows the wrapper's
		// hit area, which is not a control and does not open the menu.
		const [cls] = html().match(/class="[^"]*pm-trigger[^"]*"/g) ?? [];
		expect(cls).toBeDefined();
		expect(/\btap-reach-44\b/.test(cls!)).toBe(true);
	});

	it('declares the height-only width knob, so the reach cannot grow sideways', () => {
		// `--tap-reach-w: 0px` makes the rule's `max(100%, var(--tap-reach-w))`
		// resolve to the control's own width. Without it the default is
		// `max(100%, 44px)`, which on the 44.0px-wide trigger a header with no
		// pathway chip renders would push the pseudo-element out over whatever
		// sits beside it in the masthead and steal that control's taps.
		const source = readFileSync(COMPONENT, 'utf8');
		expect(source).toMatch(/--tap-reach-w:\s*0px;/);
	});

	it('does not set a min-height on the trigger, because the painted box must not grow', () => {
		// The rejected alternative, and the one a later session is most likely to
		// reach for: `min-height: 44px` satisfies a tap-target check just as well
		// and silently makes the header of 69 pages 10px taller.
		//
		// COMMENTS ARE STRIPPED BEFORE THIS IS ASKED, and the first draft of this
		// test did not strip them: the rule's own comment explains why a
		// min-height was refused, so a plain text search matched the explanation
		// and failed on the correct code. What is being asserted is a
		// DECLARATION, not the absence of a word.
		const source = readFileSync(COMPONENT, 'utf8');
		const rule = source.slice(source.indexOf('\t.pm-trigger {'));
		const body = rule.slice(0, rule.indexOf('\n\t}')).replace(/\/\*[\s\S]*?\*\//g, '');
		expect(body).toContain('--tap-reach-w: 0px');
		expect(body).not.toMatch(/min-height/);
		expect(body).not.toMatch(/(^|[^-])height\s*:/);
	});
});

describe('the rule the trigger depends on', () => {
	it('lives in the global sheet, where Svelte cannot prune it', () => {
		// NOT A STYLE PREFERENCE. Svelte's CSS analyser drops a scoped `::after`
		// it cannot match against the template -- silently, with no svelte-check
		// warning -- which is how `.swatch::after` was removed from
		// FolderManager's compiled output while `.swatch` beside it survived. A
		// reach written inside ProfileMenu's own <style> would be pruned the same
		// way, and the only symptom would be a tap that does not land.
		const css = readFileSync(APP_CSS, 'utf8');
		expect(css).toMatch(/\.tap-reach-44::after\s*\{/);
		expect(css).toMatch(/width:\s*max\(100%,\s*var\(--tap-reach-w,\s*44px\)\)/);
		expect(css).toMatch(/height:\s*max\(100%,\s*44px\)/);

		const source = readFileSync(COMPONENT, 'utf8');
		const style = source.slice(source.indexOf('<style>'));
		expect(style).not.toContain('.tap-reach-44::after');
	});
});
