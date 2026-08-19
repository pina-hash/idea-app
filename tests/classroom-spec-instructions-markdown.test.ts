// tests/classroom-spec-instructions-markdown.test.ts
//
// Three renderer defects on the assignment item page, all on the same
// component (SpecRenderer.svelte), pinned together because they were found
// and fixed together.
//
// 1. A MODULE'S `instructions` BLOCK USED TO RENDER AS LITERAL TEXT.
//    `{block.content}` interpolated the raw markdown string straight into the
//    DOM -- "###" and "**bold**" showed up on screen exactly as typed --
//    while the item-level instructions field on the SAME page (ItemBody, and
//    a reference document's own `instructions` block via MarkdownText) went
//    through a real parser. The fix reuses that SAME shared renderer
//    (MarkdownText / parseMarkdown) for the module block, since the two
//    block shapes are identical (`{ type: 'instructions'; content: string }`
//    on both the assignment and the reference side). `parseMarkdown` itself
//    gained pipe tables and indented (4-space) code blocks in the same
//    change, because neither existed before and both are needed to render
//    real authored content (see the IDEA209H unit 1 lab spec) correctly --
//    without them, reusing the renderer would have traded "shows raw
//    markdown" for "silently drops a table" or "collapses a worked-example
//    formula into a run-on paragraph", which is the same class of bug in a
//    quieter form.
//
// 2. TABLE COLUMN TIPS RENDERED AS AN UNLABELLED BULLET LIST above the table,
//    with no way to tell which tip belonged to which column. They now attach
//    to their own column header (InfoTip), reachable on hover AND on
//    keyboard focus (a real `tabindex`/`aria-describedby`/`id` wiring, not a
//    bare `title` attribute a keyboard user could not reach), and rendered
//    statically -- always visible, no interaction required -- in print.
//
// 3. THE AI-LEVEL BADGE NEVER SURFACED A MODULE'S `aiNote`. It showed only
//    the generic level rule (via a `title` attribute with the same
//    keyboard/print gaps as (2)). The fix threads `mod.aiNote` through to the
//    same InfoTip mechanism, falling back to the generic blurb when a module
//    carries none.
//
// THERE IS NO DOM/EVENT-DISPATCH HARNESS IN THIS REPO (`environment: 'node'`,
// `svelte/server`'s `render()` only -- see classroom-manager-spec-visibility
// .test.ts's note on this). So "reachable by keyboard focus" and "always
// visible in print" are proven the way they are provable without a browser:
// by asserting the REAL SSR markup carries the ARIA wiring a keyboard/print
// reader depends on (a focusable trigger, `aria-describedby` pointing at a
// real `id`, `role="tooltip"`) rather than a bare hover-only `title`.

import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SpecRenderer from '$lib/classroom/SpecRenderer.svelte';
import type { AssignmentSpec } from '$lib/classroom/assignment-spec';
import { parseMarkdown } from '$lib/classroom/reference-spec';

// ---------------------------------------------------------------------------
// Part 1: parseMarkdown itself -- pure, no rendering. Pins the two additions
// (pipe tables, indented code blocks) directly, independent of how the
// renderer happens to walk them.
// ---------------------------------------------------------------------------
describe('parseMarkdown: pipe tables and indented code blocks', () => {
	it('parses a pipe table into a table node with header and body cells', () => {
		const nodes = parseMarkdown(
			['| Status | Material |', '|---|---|', '| Required | ASTM 1018 steel |', '| Bonus | Ti-6Al-4V titanium |'].join(
				'\n'
			)
		);
		expect(nodes).toHaveLength(1);
		const table = nodes[0];
		if (table.type !== 'table') throw new Error('expected a table node');
		expect(table.headers.map((c) => c.map((r) => r.text).join(''))).toEqual(['Status', 'Material']);
		expect(table.rows.map((r) => r.map((c) => c.map((run) => run.text).join('')))).toEqual([
			['Required', 'ASTM 1018 steel'],
			['Bonus', 'Ti-6Al-4V titanium']
		]);
	});

	it('does not treat an ordinary line containing a pipe as a table without a delimiter row', () => {
		const nodes = parseMarkdown('This sentence has a | in it, but no table follows.');
		expect(nodes).toEqual([
			{
				type: 'paragraph',
				runs: [{ text: 'This sentence has a | in it, but no table follows.' }]
			}
		]);
	});

	it('parses a run of 4-space-indented lines as a code block, exactly like a fenced one', () => {
		const nodes = parseMarkdown(
			[
				'The scale reads 18.24 g.',
				'',
				'    V = pi x (1.270 / 2)^2 x 4.000',
				'    V = 5.067 cm3',
				'',
				'The next sentence.'
			].join('\n')
		);
		expect(nodes).toEqual([
			{ type: 'paragraph', runs: [{ text: 'The scale reads 18.24 g.' }] },
			{ type: 'code', text: 'V = pi x (1.270 / 2)^2 x 4.000\nV = 5.067 cm3' },
			{ type: 'paragraph', runs: [{ text: 'The next sentence.' }] }
		]);
	});

	it('does not start an indented code block mid-paragraph or mid-list (only after a blank line)', () => {
		const nodes = parseMarkdown(
			['A wrapped sentence that happens to', '    continue on an indented line.'].join('\n')
		);
		expect(nodes).toEqual([
			{
				type: 'paragraph',
				runs: [{ text: 'A wrapped sentence that happens to continue on an indented line.' }]
			}
		]);
	});
});

// ---------------------------------------------------------------------------
// Part 2: the shipping SpecRenderer component, server-rendered.
// ---------------------------------------------------------------------------

/** Strip Svelte's own SSR hydration markers, the classroom-body-render.test.ts
 *  convention -- nothing in this render path can produce an HTML comment of
 *  its own, so this can never hide real markup. */
function renderSpec(spec: AssignmentSpec): string {
	return render(SpecRenderer, { props: { spec, initialValues: {}, uploadEnabled: false } }).body.replace(
		/<!--[\s\S]*?-->/g,
		''
	);
}

const M1_NOTE =
	'AI is off for this module. Every value here comes off an instrument you read yourself.';
const SAMPLE_TIP = 'Set letter and number as it appears on the tag, never a material name.';

const SPEC: AssignmentSpec = {
	schemaVersion: 1,
	meta: { assignmentId: 'a-1', title: 'Density lab', totalPoints: 20 },
	modules: [
		{
			id: 'm1',
			title: 'Measurement',
			points: 10,
			aiLevel: 0,
			aiNote: M1_NOTE,
			blocks: [
				{
					type: 'instructions',
					content: [
						'### The six candidates',
						'',
						'| Status | Material |',
						'|---|---|',
						'| Required | ASTM 1018 steel |',
						'| Bonus | Ti-6Al-4V titanium |',
						'',
						'**Work in grams and centimeters.**',
						'',
						'1. Choose your technique',
						'2. Record it',
						'',
						'### Worked example',
						'',
						'The scale reads 18.24 g.',
						'',
						'    V = pi x (1.270 / 2)^2 x 4.000',
						'    V = 5.067 cm3'
					].join('\n')
				},
				{
					type: 'table',
					id: 't1',
					columns: [
						{ key: 'sample', label: 'Sample', tip: SAMPLE_TIP },
						{ key: 'mass', label: 'Mass (g)' }
					]
				}
			]
		},
		{
			// No aiNote: the badge must fall back to the generic level rule.
			id: 'm2',
			title: 'Density',
			points: 10,
			aiLevel: 1,
			blocks: [{ type: 'instructions', content: 'Compute density from your own numbers.' }]
		}
	]
};

const html = renderSpec(SPEC);

describe('fix 1: module instructions render through the shared markdown renderer', () => {
	it('never leaves the raw markdown characters on the page', () => {
		expect(html).not.toContain('###');
		expect(html).not.toContain('**');
		// The raw pipe-table syntax must be gone too -- rendered as a real
		// <table>, not printed as literal "| Status | Material |" text.
		expect(html).not.toContain('| Status | Material |');
		expect(html).not.toContain('|---|---|');
	});

	it('renders the heading as a real heading element', () => {
		expect(html).toMatch(/<h[34][^>]*>The six candidates<\/h[34]>/);
		expect(html).toMatch(/<h[34][^>]*>Worked example<\/h[34]>/);
	});

	it('renders bold text as a real <strong>, not literal asterisks', () => {
		expect(html).toMatch(/<strong[^>]*>Work in grams and centimeters\.<\/strong>/);
	});

	it('renders the ordered list as a real <ol>/<li>, not literal "1." text', () => {
		const ol = html.match(/<ol[^>]*>([\s\S]*?)<\/ol>/);
		expect(ol).not.toBeNull();
		const items = [...ol![1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1].trim());
		expect(items).toEqual(['Choose your technique', 'Record it']);
	});

	it('renders the pipe table as a real <table> with header and data cells', () => {
		const table = html.match(/<table class="md-table[^"]*"[^>]*>([\s\S]*?)<\/table>/);
		expect(table).not.toBeNull();
		// `(?:\s[^>]*)?` after "th", not `[^>]*` alone -- a bare `[^>]*` also
		// matches the literal substring "<thead>" ("<th" + "ead" + ">"), which
		// would otherwise swallow the real first header cell into the match.
		const headers = [...table![1].matchAll(/<th(?:\s[^>]*)?>([\s\S]*?)<\/th>/g)].map((m) =>
			m[1].trim()
		);
		expect(headers).toEqual(['Status', 'Material']);
		expect(table![1]).toMatch(/<td[^>]*>Required<\/td>/);
		expect(table![1]).toMatch(/<td[^>]*>ASTM 1018 steel<\/td>/);
		expect(table![1]).toMatch(/<td[^>]*>Ti-6Al-4V titanium<\/td>/);
	});

	it('renders the indented worked-example formula as a code block, not folded into a paragraph', () => {
		expect(html).toMatch(
			/<pre><code>V = pi x \(1\.270 \/ 2\)\^2 x 4\.000\nV = 5\.067 cm3<\/code><\/pre>/
		);
	});

	it('renders the plain-text second module unchanged (no regression on ordinary content)', () => {
		expect(html).toMatch(/<p[^>]*>Compute density from your own numbers\.<\/p>/);
	});
});

describe('fix 2: table column tips attach to their own column header', () => {
	// SCOPED TO THE ENTRY TABLE, DELIBERATELY: the instructions block above it
	// ALSO contains a <table> (the pipe table from fix 1), and its <thead> is
	// the first one in the document -- so "the first <thead> on the page" is
	// the wrong table entirely. Isolate the entry table by its own class first.
	const entryTable = html.match(/<table class="entry-table[^"]*"[^>]*>([\s\S]*?)<\/table>/)?.[1] ?? '';
	const thead = entryTable.match(/<thead>([\s\S]*?)<\/thead>/)?.[1] ?? '';
	// `(?:\s[^>]*)?` after "th", not `[^>]*` alone -- see the note in fix 1's
	// table test: a bare `[^>]*` also matches the literal "<thead>" tag itself.
	const cells = [...thead.matchAll(/<th(?:\s[^>]*)?>([\s\S]*?)<\/th>/g)].map((m) => m[1]);

	it('is no longer an unlabelled bullet list above the table', () => {
		expect(html).not.toMatch(/<ul class="tips/);
	});

	it('the tipped column carries its tip text inside its own header cell', () => {
		expect(cells[0]).toContain('Sample');
		expect(cells[0]).toContain(SAMPLE_TIP);
	});

	it('the untipped column header carries no tip wiring at all', () => {
		expect(cells[1].trim()).toBe('Mass (g)');
	});

	it('the tip is wired for keyboard focus, not hover-only: a focusable trigger describing a real tooltip element', () => {
		// A real <button>, which is keyboard-focusable with no tabindex needed --
		// not a <span tabindex="0"> (a non-interactive element with a tabindex),
		// which is its own accessibility trap.
		const trigger = cells[0].match(/<button type="button" class="info-tip-trigger[^"]*"[^>]*>/);
		expect(trigger).not.toBeNull();
		const describedBy = cells[0].match(/aria-describedby="([^"]+)"/)?.[1];
		expect(describedBy).toBeTruthy();
		expect(cells[0]).toContain(`id="${describedBy}"`);
		expect(cells[0]).toMatch(/role="tooltip"/);
	});
});

describe('fix 3: the AI badge surfaces a module\'s aiNote, and falls back when absent', () => {
	it('shows the module-specific aiNote for the module that has one', () => {
		expect(html).toContain(M1_NOTE);
	});

	it('does not show the generic level-0 blurb for the module whose aiNote overrides it', () => {
		expect(html).not.toContain('No AI use on this module.');
	});

	it('falls back to the generic level rule for the module with no aiNote', () => {
		expect(html).toContain('AI may explain and quiz you; it may not produce your work.');
	});

	it('every tooltip trigger in the page (badges and column tips alike) is genuinely wired for keyboard focus and print', () => {
		const describedBys = [...html.matchAll(/aria-describedby="([^"]+)"/g)].map((m) => m[1]);
		const tooltips = [...html.matchAll(/role="tooltip"/g)];
		expect(describedBys.length).toBeGreaterThanOrEqual(3); // 2 AI badges + 1 column tip
		expect(describedBys.length).toBe(tooltips.length);
		for (const id of describedBys) expect(html).toContain(`id="${id}"`);
	});
});
