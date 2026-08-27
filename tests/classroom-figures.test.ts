// tests/classroom-figures.test.ts
//
// FIGURES IN AUTHORED PROSE: the allow list, and the rendered proof that it is
// the thing deciding what loads.
//
// WHY THIS FILE REPLACES A PROSE CLAIM. docs/HISTORY.md recorded, from a browser
// pass over a hostile fixture, that the reference renderer produced "0 script,
// 0 img, 0 b elements". That was true, and it was true because NOTHING in this
// app could render an `img` from authored prose -- the parser had no image
// construct at all. Adding figures makes that sentence true for a completely
// different reason, and a claim whose justification has silently changed
// underneath it is worse than no claim: it reads as coverage of the exact case
// that is now reachable.
//
// So the assertion is rewritten as a POSITIVE CONTROL. Zero `img` from every
// hostile shape, AND a stated non-zero count from a control fixture using an
// allowed source, both counted by the same function in the same run. A parser
// that stopped recognising figures entirely would satisfy the first half and
// fail the second, which is precisely what the first half alone could never
// detect.
//
// THE HARNESS IS PROVEN BEFORE ANY CLEAN RESULT IS TRUSTED (part 0). An
// all-clean sweep is a reason to check the instrument, not a reason to relax:
// this repo has already shipped a scan that read the wrong property and came
// back vacuously clean, and clean is what nobody investigates.
//
// NO DOM. `environment: 'node'` with `svelte/server`'s `render()`, the
// convention classroom-spec-instructions-markdown.test.ts established: the
// assertion is on the REAL SSR markup a browser would receive, from the REAL
// shipped components, not on a data structure a renderer was handed.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import MarkdownText from '$lib/classroom/MarkdownText.svelte';
import ReferenceBlock from '$lib/classroom/ReferenceBlock.svelte';
import SpecRenderer from '$lib/classroom/SpecRenderer.svelte';
import {
	attachmentIsFigure,
	FIGURE_STATIC_PREFIXES,
	figureAttachmentFilenames,
	figureReference,
	resolveFigureSrc,
	type ClassroomAttachment
} from '$lib/classroom/classroom';
import { parseMarkdown } from '$lib/classroom/reference-spec';
import type { AssignmentSpec } from '$lib/classroom/assignment-spec';
import type { ReferenceBlock as RefBlock } from '$lib/classroom/reference-spec';
import { withDev } from './stubs/app-environment';
import {
	CONTROL_FIGURES,
	EXPECTED_ROUND_TRIP,
	FIXTURE_ATTACHMENTS,
	HOSTILE_FIGURES,
	ROUND_TRIP_PROSE
} from './fixtures/authored-prose';

const ATTACHMENTS = FIXTURE_ATTACHMENTS as ClassroomAttachment[];

/**
 * Count `img` elements in an SSR string. Deliberately a permissive regex rather
 * than a parse: it counts `<img`, `<IMG` and `< img` alike, so a renderer that
 * emitted an image in a shape a strict parser missed still shows up here. An
 * undercounting instrument is the failure this whole file exists to avoid.
 */
function countImgs(html: string): number {
	return (html.match(/<\s*img\b/gi) ?? []).length;
}

/** Render one prose string through MarkdownText exactly as a page would. */
function renderProse(body: string, opts: { public?: boolean } = {}): string {
	return render(MarkdownText, {
		props: { body, attachments: ATTACHMENTS, publicAttachments: opts.public ?? false }
	}).body;
}

function referenceInstructions(content: string): RefBlock {
	return { type: 'instructions', content } as RefBlock;
}

function assignmentSpec(content: string): AssignmentSpec {
	return {
		schemaVersion: 1,
		meta: { assignmentId: 'test-1', title: 'Test', totalPoints: 0 },
		modules: [
			{
				id: 'm1',
				title: 'Module one',
				points: 0,
				blocks: [{ type: 'instructions', content }]
			}
		]
	} as unknown as AssignmentSpec;
}

/** A spec carrying a block type no renderer knows: the state where a stored
 *  document outlives the code that read it. */
function unknownBlockSpec(): AssignmentSpec {
	return {
		schemaVersion: 1,
		meta: { assignmentId: 'test-2', title: 'Test', totalPoints: 0 },
		modules: [
			{
				id: 'm1',
				title: 'Module one',
				points: 0,
				blocks: [{ type: 'retiredBlockType', id: 'x1' }]
			}
		]
	} as unknown as AssignmentSpec;
}

// ---------------------------------------------------------------------------
// Part 0. PROVE THE HARNESS. Nothing below is worth reading if these fail.
// ---------------------------------------------------------------------------
describe('the harness itself', () => {
	it('countImgs detects an img when one is genuinely present', () => {
		expect(countImgs('<p>none here</p>')).toBe(0);
		expect(countImgs('<img src="/x.png">')).toBe(1);
		expect(countImgs('<IMG SRC="/x.png"><img src="/y.png">')).toBe(2);
		// The shape a naive includes('<img') would miss.
		expect(countImgs('< img src="/x.png">')).toBe(1);
		// And one it would falsely count.
		expect(countImgs('<p>the word image</p>')).toBe(0);
	});

	it('renderProse actually renders the component, and can produce an img at all', () => {
		// THE LOAD-BEARING CONTROL. If this is 0, every "0 img" result below is
		// meaningless, because the pipeline would be producing no images from any
		// input whatsoever.
		const html = renderProse('![The IDEA gear](/IDEA/idea-gear.png)');
		expect(countImgs(html)).toBe(1);
		expect(html).toContain('/IDEA/idea-gear.png');
	});

	it('the hostile fixture is populated and covers each refused shape', () => {
		// A sweep that generated nothing passes every assertion it makes.
		expect(HOSTILE_FIGURES.length).toBe(16);
		expect(CONTROL_FIGURES.length).toBe(3);
		const reasons = [...new Set(HOSTILE_FIGURES.map((f) => f.reason))].sort();
		expect(reasons).toEqual([
			'empty',
			'not-absolute',
			'off-prefix',
			'protocol-relative',
			'scheme',
			'svg',
			'unresolved'
		]);
		// Every hostile line really is figure SYNTAX -- otherwise it would render
		// as a paragraph and "0 img" would be about the parser, not the allow list.
		for (const f of HOSTILE_FIGURES) {
			const nodes = parseMarkdown(f.line);
			expect(nodes, `${f.case} must parse as a figure`).toHaveLength(1);
			expect(nodes[0].type, `${f.case} must parse as a figure`).toBe('figure');
		}
	});

	it('the dev toggle actually moves, so the two branches below are distinguishable', () => {
		// The unknown-block tests assert a DIFFERENCE between two branches. If the
		// stub's binding were frozen, both halves would read one value and one of
		// the two assertions would pass vacuously.
		const spec = unknownBlockSpec();
		const prod = render(SpecRenderer, { props: { spec, initialValues: {} } }).body;
		const inDev = withDev(
			true,
			() => render(SpecRenderer, { props: { spec, initialValues: {} } }).body
		);
		expect(prod).not.toEqual(inDev);
		// And it is restored afterwards, so nothing later in the run is affected.
		const after = render(SpecRenderer, { props: { spec, initialValues: {} } }).body;
		expect(after).toEqual(prod);
	});
});

// ---------------------------------------------------------------------------
// Part 1. The predicate, one case per refused shape.
// ---------------------------------------------------------------------------
describe('resolveFigureSrc refuses each shape by name', () => {
	for (const f of HOSTILE_FIGURES) {
		it(`refuses ${f.case} with reason "${f.reason}"`, () => {
			const nodes = parseMarkdown(f.line);
			const node = nodes[0];
			if (node.type !== 'figure') throw new Error('fixture is not a figure');
			const result = resolveFigureSrc(node.src, ATTACHMENTS);
			expect(result.ok).toBe(false);
			if (result.ok) throw new Error('unreachable');
			expect(result.reason).toBe(f.reason);
		});
	}

	it('resolves an attachment alias through the signed-in proxy, never Drive', () => {
		const r = resolveFigureSrc('attachment:teardown-03.jpg', ATTACHMENTS);
		expect(r.ok).toBe(true);
		if (!r.ok) throw new Error('unreachable');
		expect(r.src).toBe('/api/classroom/attachment/att-1');
		expect(r.src).not.toContain('drive.google.com');
	});

	it('resolves through the ?public=1 branch for the signed-out viewer', () => {
		const r = resolveFigureSrc('attachment:teardown-03.jpg', ATTACHMENTS, { public: true });
		expect(r.ok).toBe(true);
		if (!r.ok) throw new Error('unreachable');
		expect(r.src).toBe('/api/classroom/attachment/att-1?public=1');
	});

	it('builds the bare proxy path on the signed-in branch, with no impersonation query', () => {
		// There used to be a `viewAs` option here that appended `?as=<email>` so
		// the classroom view-as preview was answered as the impersonated student.
		// That preview is deleted and the proxy no longer reads the parameter, so
		// the signed-in branch is now the caller's own read and nothing else. The
		// assertion is written as "no query at all" rather than dropped, because
		// the thing worth pinning is that a figure src can no longer carry an
		// identity.
		const r = resolveFigureSrc('attachment:teardown-03.jpg', ATTACHMENTS);
		expect(r.ok).toBe(true);
		if (!r.ok) throw new Error('unreachable');
		expect(r.src).toBe('/api/classroom/attachment/att-1');
		expect(r.src).not.toContain('?');
	});

	it('matches a filename case-insensitively', () => {
		const r = resolveFigureSrc('attachment:TEARDOWN-03.JPG', ATTACHMENTS);
		expect(r.ok).toBe(true);
		if (!r.ok) throw new Error('unreachable');
		expect(r.attachmentId).toBe('att-1');
	});

	it('treats no attachments as unresolved rather than as an error', () => {
		const r = resolveFigureSrc('attachment:teardown-03.jpg', []);
		expect(r.ok).toBe(false);
		if (r.ok) throw new Error('unreachable');
		expect(r.reason).toBe('unresolved');
	});

	it('accepts every named static prefix, and the exported constant is what names them', () => {
		expect(FIGURE_STATIC_PREFIXES.length).toBeGreaterThan(0);
		for (const prefix of FIGURE_STATIC_PREFIXES) {
			const r = resolveFigureSrc(`${prefix}some-image.png`, ATTACHMENTS);
			expect(r.ok, `${prefix} must be allowed`).toBe(true);
		}
	});

	it('figureReference produces a string the parser reads back as that figure', () => {
		// The author-facing string and the parser are ONE contract. If the copy
		// affordance and FIGURE_RE ever disagree, this is what says so.
		const ref = figureReference('teardown-03.jpg');
		expect(ref).toBe('![teardown-03](attachment:teardown-03.jpg)');
		const nodes = parseMarkdown(ref);
		expect(nodes).toHaveLength(1);
		const node = nodes[0];
		if (node.type !== 'figure') throw new Error('expected a figure');
		expect(node.alt).toBe('teardown-03');
		expect(resolveFigureSrc(node.src, ATTACHMENTS).ok).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Part 2. THE RENDERED CLAIM, with its positive control. Both counts reported.
// ---------------------------------------------------------------------------
describe('rendered img elements: hostile zero, control non-zero', () => {
	it('renders 0 img from every hostile shape, and a non-zero count from the control', () => {
		const hostileBody = HOSTILE_FIGURES.map((f) => f.line).join('\n\n');
		const controlBody = CONTROL_FIGURES.map((f) => f.line).join('\n\n');

		const hostileImgs = countImgs(renderProse(hostileBody));
		const controlImgs = countImgs(renderProse(controlBody));

		// BOTH NUMBERS ARE THE RESULT. Reported together so a reader of the output
		// can see the instrument was live when it returned zero.
		console.log(
			`[figures] hostile cases=${HOSTILE_FIGURES.length} img=${hostileImgs} | ` +
				`control cases=${CONTROL_FIGURES.length} img=${controlImgs}`
		);

		expect(hostileImgs).toBe(0);
		expect(controlImgs).toBe(CONTROL_FIGURES.length);
	});

	it('never leaks a refused src into the markup at all, in any attribute', () => {
		for (const f of HOSTILE_FIGURES) {
			const html = renderProse(f.line);
			expect(countImgs(html), f.case).toBe(0);
			// Not merely "no img": the refused target must not appear anywhere,
			// including as a sanitized-looking leftover.
			expect(html, f.case).not.toContain('evil.example');
			expect(html, f.case).not.toContain('javascript:');
			expect(html, f.case).not.toContain('data:image');
			expect(html, f.case).not.toContain('/etc/passwd');
		}
	});

	it('renders the caption plus a visible marker for every refusal, never silence', () => {
		for (const f of HOSTILE_FIGURES) {
			const html = renderProse(f.line);
			const node = parseMarkdown(f.line)[0];
			if (node.type !== 'figure') throw new Error('fixture is not a figure');
			expect(html, `${f.case} keeps its caption`).toContain(node.alt);
			expect(html, `${f.case} shows a marker`).toContain('Image unavailable');
			expect(html, `${f.case} is still a figure`).toContain('md-figure');
		}
	});

	it('a resolved figure carries alt AND figcaption from the one authored string', () => {
		const html = renderProse('![Bearing teardown, step 3](attachment:teardown-03.jpg)');
		expect(html).toContain('alt="Bearing teardown, step 3"');
		expect(html).toContain('<figcaption>Bearing teardown, step 3</figcaption>');
		expect(html).toContain('loading="lazy"');
	});

	it('the public viewer resolves through ?public=1 in the rendered markup', () => {
		const html = renderProse('![Bearing teardown, step 3](attachment:teardown-03.jpg)', {
			public: true
		});
		expect(html).toContain('/api/classroom/attachment/att-1?public=1');
	});
});

// ---------------------------------------------------------------------------
// Part 3. Round trip: one instance of every construct, figures included.
// ---------------------------------------------------------------------------
describe('round trip: every construct parseMarkdown can produce', () => {
	it('parses the fixture into exactly the expected node sequence', () => {
		const nodes = parseMarkdown(ROUND_TRIP_PROSE);
		expect(nodes.map((n) => n.type)).toEqual([...EXPECTED_ROUND_TRIP]);
	});

	it('an image inside a sentence is NOT a figure and keeps its old behaviour', () => {
		// The measured pre-existing behaviour: a literal `!` followed by an
		// ordinary link. Adding block figures must not have changed it.
		const nodes = parseMarkdown('Not a figure: ![inline](https://example.com/x.png) here.');
		expect(nodes).toHaveLength(1);
		const node = nodes[0];
		if (node.type !== 'paragraph') throw new Error('expected a paragraph');
		expect(node.runs.map((r) => r.text).join('')).toContain('!');
		const link = node.runs.find((r) => r.href);
		expect(link?.text).toBe('inline');
		expect(link?.href).toBe('https://example.com/x.png');
	});

	it('a blank or whitespace-only alt is not a figure and stays literal', () => {
		for (const line of ['![](attachment:teardown-03.jpg)', '![   ](attachment:teardown-03.jpg)']) {
			const nodes = parseMarkdown(line);
			expect(nodes, line).toHaveLength(1);
			expect(nodes[0].type, line).toBe('paragraph');
			expect(countImgs(renderProse(line)), line).toBe(0);
		}
	});

	it('a figure line inside a code fence is code, not a figure', () => {
		const fenced = ['```', '![Not a figure](/IDEA/idea-gear.png)', '```'].join('\n');
		const nodes = parseMarkdown(fenced);
		expect(nodes).toHaveLength(1);
		expect(nodes[0].type).toBe('code');
		expect(countImgs(renderProse(fenced))).toBe(0);
	});

	it('a javascript: url carrying parens never even parses as figure syntax', () => {
		// The second layer under the allow list, pinned so nobody "fixes" the src
		// pattern to swallow parens without knowing what it currently buys.
		const nodes = parseMarkdown('![Script](javascript:alert(1))');
		expect(nodes).toHaveLength(1);
		expect(nodes[0].type).toBe('paragraph');
		const html = renderProse('![Script](javascript:alert(1))');
		expect(countImgs(html)).toBe(0);
		expect(html).not.toContain('javascript:');
	});

	it('a figure with leading or trailing text on the line is not a figure', () => {
		for (const line of [
			'![Alt](/IDEA/idea-gear.png) trailing words',
			'leading words ![Alt](/IDEA/idea-gear.png)'
		]) {
			expect(parseMarkdown(line)[0].type, line).toBe('paragraph');
		}
	});

	it('the whole fixture renders with the right img count and loses no construct', () => {
		const html = renderProse(ROUND_TRIP_PROSE);
		// Exactly one img: the single resolvable figure. The refused one, the
		// inline one and the two blank-alt ones must all be absent.
		expect(countImgs(html)).toBe(1);
		// Every construct survived to the DOM.
		for (const marker of [
			'<h3',
			'<h4',
			'<ul',
			'<ol',
			'<blockquote',
			'<pre',
			'<table',
			'<figure'
		]) {
			expect(html, marker).toContain(marker);
		}
	});
});

// ---------------------------------------------------------------------------
// Part 4. BOTH KINDS, through their own real renderers.
// ---------------------------------------------------------------------------
describe('both material kinds render figures through the one resolver', () => {
	const control = '![The IDEA gear](/IDEA/idea-gear.png)';
	const hostile = '![Beacon](https://evil.example/beacon.png)';

	it('reference document: instructions block, control renders, hostile does not', () => {
		const ok = render(ReferenceBlock, {
			props: { block: referenceInstructions(control), attachments: ATTACHMENTS }
		}).body;
		const bad = render(ReferenceBlock, {
			props: { block: referenceInstructions(hostile), attachments: ATTACHMENTS }
		}).body;
		expect(countImgs(ok)).toBe(1);
		expect(countImgs(bad)).toBe(0);
		expect(bad).toContain('Image unavailable');
	});

	it('reference document: a callout goes through the same renderer', () => {
		const block = { type: 'callout', variant: 'info', content: control } as unknown as RefBlock;
		const html = render(ReferenceBlock, { props: { block, attachments: ATTACHMENTS } }).body;
		expect(countImgs(html)).toBe(1);
	});

	it('reference document: an attachment alias resolves publicly when asked to', () => {
		const block = referenceInstructions('![Teardown](attachment:teardown-03.jpg)');
		const signedIn = render(ReferenceBlock, { props: { block, attachments: ATTACHMENTS } }).body;
		const publicly = render(ReferenceBlock, {
			props: { block, attachments: ATTACHMENTS, publicAttachments: true }
		}).body;
		expect(signedIn).toContain('/api/classroom/attachment/att-1');
		expect(signedIn).not.toContain('?public=1');
		expect(publicly).toContain('/api/classroom/attachment/att-1?public=1');
	});

	it('assignment spec: instructions block, control renders, hostile does not', () => {
		const ok = render(SpecRenderer, {
			props: { spec: assignmentSpec(control), initialValues: {}, attachments: ATTACHMENTS }
		}).body;
		const bad = render(SpecRenderer, {
			props: { spec: assignmentSpec(hostile), initialValues: {}, attachments: ATTACHMENTS }
		}).body;
		expect(countImgs(ok)).toBe(1);
		expect(countImgs(bad)).toBe(0);
		expect(bad).toContain('Image unavailable');
	});

	it('assignment spec: with no attachments passed, an alias is unresolved not an error', () => {
		const html = render(SpecRenderer, {
			props: { spec: assignmentSpec('![Teardown](attachment:teardown-03.jpg)'), initialValues: {} }
		}).body;
		expect(countImgs(html)).toBe(0);
		expect(html).toContain('Image unavailable');
		expect(html).toContain('Teardown');
	});
});

// ---------------------------------------------------------------------------
// Part 5. The dev-only marker for a block type the code no longer knows.
// ---------------------------------------------------------------------------
describe('an unrecognised block type', () => {
	it('renders nothing in production, exactly as before', () => {
		const html = render(SpecRenderer, {
			props: { spec: unknownBlockSpec(), initialValues: {} }
		}).body;
		expect(html).not.toContain('Unsupported block type');
	});

	it('renders a visible marker naming the type in dev', () => {
		const html = withDev(
			true,
			() => render(SpecRenderer, { props: { spec: unknownBlockSpec(), initialValues: {} } }).body
		);
		expect(html).toContain('Unsupported block type');
		expect(html).toContain('retiredBlockType');
	});

	it('reference blocks behave the same way', () => {
		const block = { type: 'retiredRefBlock' } as unknown as RefBlock;
		const prod = render(ReferenceBlock, { props: { block } }).body;
		const inDev = withDev(true, () => render(ReferenceBlock, { props: { block } }).body);
		expect(prod).not.toContain('Unsupported block type');
		expect(inDev).toContain('Unsupported block type');
		expect(inDev).toContain('retiredRefBlock');
	});
});

// ---------------------------------------------------------------------------
// Part 6. AN IMAGE A FIGURE USES IS NOT ALSO A ROW IN THE ATTACHMENT LIST.
//
// `figureAttachmentFilenames` / `attachmentIsFigure` are the DERIVED distinction
// ItemDetail filters the "Files" list with: an attachment named by an
// `attachment:` figure anywhere in the item's spec is excluded, so the same
// image is not on the page twice. Nothing is stored -- the same spec content
// this file already renders figures from is what decides it.
// ---------------------------------------------------------------------------
describe('figureAttachmentFilenames / attachmentIsFigure: the attachment-list exclusion', () => {
	it('names the filename a figure references, lowercased', () => {
		const names = figureAttachmentFilenames(['![Teardown](attachment:Teardown-03.JPG)']);
		expect(names.has('teardown-03.jpg')).toBe(true);
		expect(names.size).toBe(1);
	});

	it('collects references across every block handed to it, not only the first', () => {
		const names = figureAttachmentFilenames([
			'Some prose with no figure at all.',
			'![Teardown](attachment:teardown-03.jpg)',
			'![Second](attachment:diagram.png)'
		]);
		expect(names).toEqual(new Set(['teardown-03.jpg', 'diagram.png']));
	});

	it('ignores a figure pointing at a static path or an external source', () => {
		const names = figureAttachmentFilenames([
			'![Gear](/IDEA/idea-gear.png)',
			'![Beacon](https://evil.example/beacon.png)'
		]);
		expect(names.size).toBe(0);
	});

	it('an attachment a figure references is excluded from the plain list', () => {
		const names = figureAttachmentFilenames(['![Teardown](attachment:teardown-03.jpg)']);
		const figureAttachment = ATTACHMENTS.find((a) => a.filename === 'teardown-03.jpg')!;
		expect(attachmentIsFigure(figureAttachment, names)).toBe(true);
	});

	it('an attachment no figure references still lists, unaffected', () => {
		const names = figureAttachmentFilenames(['![Teardown](attachment:teardown-03.jpg)']);
		const unreferenced = ATTACHMENTS.find((a) => a.filename === 'notes.pdf')!;
		expect(attachmentIsFigure(unreferenced, names)).toBe(false);
	});

	it('a figure naming a file that is not attached changes nothing about the list', () => {
		// The filename lands in the set (it is a real reference), but since no
		// attachment named `missing.jpg` exists, filtering the real attachments
		// against it drops nothing -- exactly the pre-existing behaviour, where
		// the figure itself renders unresolved (see resolveFigureSrc above) and
		// the attachment list is not consulted at all for that name.
		const names = figureAttachmentFilenames(['![Ghost](attachment:missing.jpg)']);
		expect(names.has('missing.jpg')).toBe(true);
		for (const a of ATTACHMENTS) {
			expect(attachmentIsFigure(a, names)).toBe(false);
		}
	});

	it('filtering a real attachment list keeps everything except the figure', () => {
		const names = figureAttachmentFilenames(['![Teardown](attachment:teardown-03.jpg)']);
		const listed = ATTACHMENTS.filter((a) => !attachmentIsFigure(a, names));
		expect(listed.map((a) => a.filename)).toEqual(['diagram.png', 'notes.pdf']);
	});
});

describe("ItemDetail's Files list excludes what a figure already renders", () => {
	const src = readFileSync(new URL('../src/lib/classroom/ItemDetail.svelte', import.meta.url), 'utf8');

	it('imports the one implementation rather than re-deriving the rule', () => {
		expect(src).toContain('figureAttachmentFilenames');
		expect(src).toContain('attachmentIsFigure');
	});

	it('the Files section reads the filtered list, not the raw attachments, in both the guard and the component', () => {
		const filesSection = src.match(
			/\{#if listedAttachments\.length\}[\s\S]*?<\/section>/
		);
		expect(filesSection, 'no Files section keyed on listedAttachments').not.toBeNull();
		expect(filesSection![0]).toContain('<h2 class="section-label">Files</h2>');
		expect(filesSection![0]).toContain('attachments={listedAttachments}');
		// The raw, unfiltered prop must not reach AttachmentList directly any more.
		expect(filesSection![0]).not.toContain('attachments={item.attachments}');
	});

	it('scans both the assignment spec and the reference spec for figures, with no role term', () => {
		const derived = src.match(/const specProse = \$derived\.by\(\(\) => \{[\s\S]*?\n\t\}\);/);
		expect(derived, '`specProse` is not a single derived expression').not.toBeNull();
		const body = derived![0];
		expect(body).toContain('engine?.spec');
		expect(body).toContain('referenceSpec');
		expect(body).not.toContain('canManage');
		expect(body).not.toContain('viewAs');
	});
});
