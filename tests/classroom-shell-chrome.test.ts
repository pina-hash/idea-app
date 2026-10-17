/**
 * THE CLASSROOM MASTHEAD (ledger 0297, package F2): class icons in the banner
 * (report 26). The feedback control was docked into this header from ledger
 * 0297 until ledger 0396, which put it back in the page's bottom-right corner,
 * the same place on every page (Mr. Pina: "the location of its buttons are
 * identical everywhere"). Voice, docked beside it until ledger 0298, is the
 * command palette's Speak control.
 *
 * Two guarantees here would regress SILENTLY, which is why they are tests and
 * not only a browser spec:
 *
 *   - the icon's glyph is DERIVED (there is no per-section glyph in the data),
 *     and a derivation that quietly started printing the same glyph for every
 *     IDEA course would still render 44px squares with text in them;
 *   - every `/dev` harness that mounts the real ClassroomShell must be in
 *     `CLASSROOM_SHELL_HARNESSES`, or the quick note's predicate says no there
 *     and the harness measures a header production never has. The list is
 *     swept against the tree in BOTH directions, with the tree read as the
 *     positive control (a sweep that found nothing proves nothing).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { classGlyph, classGlyphCode, compactSectionField, CLASS_GLYPH_MAX } from '../src/lib/classroom/class-glyph';
import { feedbackExclusion, feedbackWearsClassroomPlate } from '../src/lib/feedback/context';
import { CLASSROOM_SHELL_HARNESSES, quickNoteOffered } from '../src/lib/notebook/quick-note';

const ROOT = new URL('../', import.meta.url).pathname;
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('a class glyph is derived from the course code and the section', () => {
	it('drops the letters every IDEA course shares, keeps a short code whole', () => {
		expect(classGlyphCode('IDEA209H')).toBe('209H');
		expect(classGlyphCode('IDEA 100')).toBe('100');
		expect(classGlyphCode('ENG1H')).toBe('ENG1H');
		expect(classGlyphCode('idea209h')).toBe('209H');
		expect(classGlyphCode(null)).toBe('CLASS');
		expect(classGlyphCode('ABCDEFGHIJ')).toBe('ABCDE');
	});

	it('compacts a section field, keeping the identifier a kind word names', () => {
		expect(compactSectionField('Period 2')).toBe('P2');
		expect(compactSectionField('Block B')).toBe('B');
		expect(compactSectionField('Section 3')).toBe('3');
		expect(compactSectionField('1')).toBe('1');
		expect(compactSectionField(null)).toBe('');
	});

	it('two sections of one course get two different glyphs', () => {
		const course = { id: 'c', code: 'IDEA209H', title: 'Engineering I Honors' } as never;
		const a = classGlyph({ label: 'Period 2', block: 'B', course });
		const b = classGlyph({ label: 'Period 4', block: 'D', course });
		expect(a).toEqual({ code: '209H', sub: 'P2·B' });
		expect(b.code).toBe(a.code);
		expect(b.sub).not.toBe(a.sub);
		for (const g of [a, b]) {
			expect(g.code.length).toBeLessThanOrEqual(CLASS_GLYPH_MAX);
			expect(g.sub.length).toBeLessThanOrEqual(CLASS_GLYPH_MAX);
		}
	});
});

describe('the feedback button is the corner button on every classroom page, and the header docks none', () => {
	/*
	 * REWRITTEN (ledger 0396) FROM "Report is docked in the classroom chrome".
	 * What stays true is that nothing floats over the class that the class has
	 * not reserved room for: no voice pill anywhere (the palette's microphone is
	 * the positive control that voice was moved rather than dropped), and the
	 * header mounts no second feedback window. The one window is the root
	 * layout's, and its corner is the same on every page.
	 */
	it('the shell mounts no feedback window and no voice pill; the root layout mounts the one window', () => {
		const shell = read('src/lib/classroom/ClassroomShell.svelte');
		expect(shell).not.toMatch(/<SiteFeedback/);
		expect(shell).not.toMatch(/data-testid="shell-report"/);
		expect(shell).not.toMatch(/VoiceNav/);
		const root = read('src/routes/+layout.svelte');
		expect(root).not.toMatch(/VoiceNav/);
		// POSITIVE CONTROLS: the root layout mounts the window, and the palette
		// the shell mounts carries the microphone.
		expect(root).toMatch(/<SiteFeedback/);
		expect(shell).toMatch(/<CommandPalette/);
		expect(read('src/lib/shell/CommandPalette.svelte')).toContain('data-testid="palette-mic"');
	});

	it('no classroom route takes the button off the corner, the deck and the projector included', () => {
		for (const r of [
			'/classroom',
			'/classroom/[sectionId]',
			'/classroom/[sectionId]/item/[itemId]',
			'/classroom/[sectionId]/item/[itemId]/grade',
			'/classroom/[sectionId]/item/[itemId]/deck',
			'/classroom/[sectionId]/live/projector',
			'/classroom/[sectionId]/people',
			'/classroom/[sectionId]/people/[studentEmail]/work/[itemId]',
			'/classroom/[sectionId]/notebook',
			'/classroom/notebook/review',
			'/classroom/todo'
		]) {
			expect(feedbackExclusion(r), r).toBeNull();
			// ...and the window there wears the classroom's own plate.
			expect(feedbackWearsClassroomPlate(r), r).toBe(true);
		}
		// Positive control on the other side: a product that keeps its own
		// feedback system is still excluded, so the predicate is not just null.
		expect(feedbackExclusion('/greenline')?.id).toBe('greenline');
		expect(feedbackWearsClassroomPlate('/classroomx')).toBe(false);
		expect(feedbackWearsClassroomPlate('/foundry')).toBe(false);
		// An error page draws no room, so the window there takes no plate.
		expect(feedbackWearsClassroomPlate('/classroom/[sectionId]', true)).toBe(false);
	});

	it('no relocated feedback window is mounted anywhere outside the feedback harness', () => {
		const offenders: string[] = [];
		const walk = (dir: string) => {
			for (const name of readdirSync(dir)) {
				const full = join(dir, name);
				if (statSync(full).isDirectory()) walk(full);
				else if (name.endsWith('.svelte') && /<SiteFeedback[\s\S]*?place="relocated"/.test(readFileSync(full, 'utf8')))
					offenders.push(full.slice(ROOT.length));
			}
		};
		walk(join(ROOT, 'src'));
		// The two harnesses that mount several inline windows side by side (the
		// corner cannot hold more than one) are the only callers left.
		expect(offenders.sort()).toEqual(['src/routes/dev/classroom/+page.svelte', 'src/routes/dev/feedback/+page.svelte']);
	});

	it('the harness list is exactly the /dev routes that mount the real shell', () => {
		const devRoot = join(ROOT, 'src/routes/dev');
		const found = new Set<string>();
		const walk = (dir: string) => {
			for (const name of readdirSync(dir)) {
				const full = join(dir, name);
				if (statSync(full).isDirectory()) walk(full);
				else if (name.endsWith('.svelte') && readFileSync(full, 'utf8').includes('ClassroomShell')) {
					const rel = full.slice(devRoot.length).split('/').filter(Boolean)[0];
					found.add(`/dev/${rel}`);
				}
			}
		};
		walk(devRoot);
		// Positive control: the sweep sees the harnesses it is about.
		expect(found.has('/dev/classroom-split')).toBe(true);
		expect(found.size).toBeGreaterThan(5);
		expect([...found].sort()).toEqual([...CLASSROOM_SHELL_HARNESSES].sort());
		for (const h of CLASSROOM_SHELL_HARNESSES) expect(quickNoteOffered(h), h).toBe(true);
	});
});

/**
 * THE 24px FLOOR IS DECLARED, NEVER ASSUMED (IDEA_INTERFACE_STANDARDS section
 * 10; ledger 0297). A chip in the room is 44px; it may sit at 24px only where
 * BOTH halves of the standard's condition hold, and both are in the selector:
 * the teacher chose compact density, and the control is inside a surface that
 * declares itself instructor-only. A rule that dropped the second half would
 * shrink every student surface the day a teacher picked compact, and nothing on
 * a teacher's own screen would show it -- which is why this is a test.
 */
describe('compact density is instructor-only and opt-in', () => {
	const css = () => read('src/lib/classroom/classroom.css').replace(/\/\*[\s\S]*?\*\//g, '');

	it('the chip floor in the room is 44px', () => {
		expect(css()).toMatch(
			/\.cr-root \.btn\.tiny,\s*\.cr-root \.btn\.secondary\.tiny \{[^}]*min-height: 44px;/
		);
	});

	it('every rule that takes a chip below 44px names both the density and the instructor surface', () => {
		const rules = [...css().matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(
			([, sel, body]) => /\.btn[^,{]*\.tiny/.test(sel) && /min-height:\s*(2[0-9]|3[0-9]|4[0-3])px/.test(body)
		);
		// Positive control: the compact rule itself is found.
		expect(rules.length).toBeGreaterThan(0);
		for (const [, sel] of rules) {
			for (const part of sel.split(',')) {
				expect(part, part).toContain("[data-density='compact']");
				expect(part, part).toContain('.cr-instructor-surface');
			}
		}
	});

	it('the preference module still names the attribute and the class this reads', async () => {
		const mod = await import('../src/lib/preferences/classroom');
		expect(mod.DENSITY_ATTRIBUTE).toBe('data-density');
		expect(mod.INSTRUCTOR_SURFACE_CLASS).toBe('cr-instructor-surface');
	});
});
