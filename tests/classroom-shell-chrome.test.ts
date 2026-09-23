/**
 * THE CLASSROOM MASTHEAD (ledger 0297, package F2): class icons in the banner
 * (report 26) and the Report and Voice controls docked into the room's own
 * chrome instead of floating over its content.
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
import { CLASSROOM_SHELL_HARNESSES, feedbackExclusion } from '../src/lib/feedback/context';

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

describe('Report and Voice are docked in the classroom chrome, never floating over it', () => {
	it('the shell mounts both, relocated, on the same component the root mounts', () => {
		const shell = read('src/lib/classroom/ClassroomShell.svelte');
		expect(shell).toMatch(/<SiteFeedback[\s\S]*?place="relocated"/);
		expect(shell).toMatch(/<VoiceNav[^>]*place="header"/);
		// And the root's floating VoiceNav stands down wherever feedback does.
		const layout = read('src/routes/+layout.svelte');
		expect(layout).toContain('feedbackExclusion(page.route.id) !== null');
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
});
