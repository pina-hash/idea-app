/**
 * THE CLASSROOM MASTHEAD (ledger 0297, package F2): class icons in the banner
 * (report 26) and the Report control docked into the room's own chrome
 * instead of floating over its content (Voice, docked beside it until ledger
 * 0298, is the command palette's Speak control now).
 *
 * Two guarantees here would regress SILENTLY, which is why they are tests and
 * not only a browser spec:
 *
 *   - the icon's glyph is DERIVED (there is no per-section glyph in the data),
 *     and a derivation that quietly started printing the same glyph for every
 *     IDEA course would still render 44px squares with text in them;
 *   - every `/dev` harness that mounts the real ClassroomShell must be in the
 *     `classroom` exclusion, or it shows the floating pill AND the docked one
 *     and measures an arrangement production never has. The list is swept
 *     against the tree in BOTH directions, with the tree read as the positive
 *     control (a sweep that found nothing proves nothing).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { classGlyph, classGlyphCode, compactSectionField, CLASS_GLYPH_MAX } from '../src/lib/classroom/class-glyph';
import { CLASSROOM_SHELL_HARNESSES, CLASSROOM_SURFACE_HARNESSES, feedbackExclusion } from '../src/lib/feedback/context';

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

describe('Report is docked in the classroom chrome, and nothing floats over it', () => {
	/*
	 * GENERALIZED (ledger 0298, report 31) FROM "the shell mounts both". Voice
	 * has no control of its own any more, docked or floating: it is the command
	 * palette's Speak button. What stays true is that nothing floats over the
	 * class -- so the assertion is now that no voice pill is mounted anywhere,
	 * with the palette's microphone as the positive control that voice was
	 * moved rather than dropped.
	 */
	it('the shell mounts Report relocated, and neither the shell nor the root mounts a voice pill', () => {
		const shell = read('src/lib/classroom/ClassroomShell.svelte');
		expect(shell).toMatch(/<SiteFeedback[\s\S]*?place="relocated"/);
		expect(shell).not.toMatch(/VoiceNav/);
		expect(read('src/routes/+layout.svelte')).not.toMatch(/VoiceNav/);
		// POSITIVE CONTROL: the palette the shell mounts carries the microphone.
		expect(shell).toMatch(/<CommandPalette/);
		expect(read('src/lib/shell/CommandPalette.svelte')).toContain('data-testid="palette-mic"');
	});

	it('every classroom route is claimed, except the deck, which has its own bar', () => {
		for (const r of [
			'/classroom',
			'/classroom/[sectionId]',
			'/classroom/[sectionId]/item/[itemId]',
			'/classroom/[sectionId]/item/[itemId]/grade',
			'/classroom/[sectionId]/people',
			'/classroom/[sectionId]/notebook',
			'/classroom/notebook/review',
			'/classroom/todo'
		]) {
			expect(feedbackExclusion(r)?.id, r).toBe('classroom');
		}
		expect(feedbackExclusion('/classroom/[sectionId]/item/[itemId]/deck')?.id).toBe('deck');
		// Positive control on the other side: ordinary rooms keep the pill.
		expect(feedbackExclusion('/foundry')).toBeNull();
		expect(feedbackExclusion('/classroomx')).toBeNull();
		expect(feedbackExclusion('/reference/[itemId]')).toBeNull();
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
		for (const h of CLASSROOM_SHELL_HARNESSES) expect(feedbackExclusion(h)?.id, h).toBe('classroom');
	});

	it('the shell-less classroom harnesses exist and are claimed too', () => {
		const devRoot = join(ROOT, 'src/routes/dev');
		for (const h of CLASSROOM_SURFACE_HARNESSES) {
			expect(statSync(join(devRoot, h.slice('/dev/'.length), '+page.svelte')).isFile(), h).toBe(true);
			expect(feedbackExclusion(h)?.id, h).toBe('classroom');
			// None of them is a shell harness: the two lists do not overlap.
			expect((CLASSROOM_SHELL_HARNESSES as readonly string[]).includes(h), h).toBe(false);
		}
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
