import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { createRawSnippet } from 'svelte';
import MyClasses from '../src/lib/classroom/MyClasses.svelte';
import ClassThemeBanner from '../src/lib/classroom/ClassThemeBanner.svelte';
import { resolveClassTheme } from '../src/lib/classroom/class-theme';

/**
 * A CLASS NOBODY HAS VOTED ON RENDERS EXACTLY AS IT DID BEFORE THEMES
 * (decision 45, ledger 0347).
 *
 * That is the state every class is in on the day this ships, so it is the one
 * that has to be right, and its failure is silent: a stray wrapper, an empty
 * style attribute or a class name on every card changes nothing a person
 * notices until a rule keyed on it does. Asserted on the REAL components'
 * server render, in both directions: the markup with no theme is compared
 * against the markup with an EMPTY theme map (byte for byte), and the themed
 * render is the positive control that the selectors below find something.
 */

const course = { id: 'c-1', code: 'IDEA209H', title: 'Engineering Design Honors', active: true };
const SECTIONS = [
	{ id: 's-2', course_id: 'c-1', label: 'Period 2', block: '2', teacher_email: 'pina@boscotech.edu', active: true, course },
	{ id: 's-4', course_id: 'c-1', label: 'Period 4', block: '4', teacher_email: 'pina@boscotech.edu', active: true, course }
];

const THEME = resolveClassTheme({ winners: { palette: 'ocean', pattern: 'rings', badge: 'gear' }, accent: 'gold' })!;
const cards = (themes: Record<string, unknown> | undefined) =>
	render(MyClasses, {
		props: { sections: SECTIONS, ...(themes === undefined ? {} : { themes }) } as never
	}).body;

const title = createRawSnippet(() => ({ render: () => '<h1 class="pane-title">Engineering Design Honors</h1>' }));
const banner = (theme: unknown) => render(ClassThemeBanner, { props: { theme, children: title } as never }).body;

describe('My Classes with no themes is the card as it was', () => {
	it('an empty theme map renders byte for byte what no theme map renders', () => {
		expect(cards({})).toBe(cards(undefined));
	});

	it('carries no theme class, style, edge or badge, where a themed render carries all four', () => {
		const plain = cards({});
		const themed = cards({ 's-2': THEME });
		for (const needle of ['class-card themed', 'class-card-edge', 'class-card-badge', '--ct-wash']) {
			expect(plain, needle).not.toContain(needle);
		}
		// Positive control: one of the two cards is themed, and only one.
		expect(themed.split('class-card-edge').length - 1).toBe(1);
		expect(themed.split('class-card-badge').length - 1).toBe(1);
		expect(themed).toContain('--ct-wash');
		expect(themed).toContain('Class theme: Ocean palette, rings pattern, gear badge, gold section color.');
	});
});

describe('the banner with no theme is only the header it wraps', () => {
	it('renders the children and nothing else for a null theme', () => {
		const html = banner(null);
		expect(html).toContain('<h1 class="pane-title">Engineering Design Honors</h1>');
		expect(html).not.toContain('ct-banner');
		expect(html).not.toContain('style=');
		expect(html).not.toContain('Class theme');
	});

	it('a class with no known winner and no accent resolves to no theme at all', () => {
		expect(resolveClassTheme({ winners: {}, accent: null })).toBeNull();
		expect(resolveClassTheme({ winners: { palette: 'not-a-palette' }, accent: 'not-an-accent' })).toBeNull();
	});

	it('wraps the ONE title, with its words, for a theme (the positive control)', () => {
		const html = banner(THEME);
		expect(html).toContain('class="ct-banner');
		expect(html.split('pane-title').length - 1).toBe(1);
		expect(html).toContain('data-palette="ocean"');
		expect(html).toContain('data-accent="gold"');
		expect(html).toContain('Class theme: Ocean palette, rings pattern, gear badge, gold section color.');
	});
});
