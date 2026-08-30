<script lang="ts">
	import { onMount } from 'svelte';
	import '$lib/classroom/classroom.css';
	import SpecRenderer from '$lib/classroom/SpecRenderer.svelte';
	import AttachmentList from '$lib/classroom/AttachmentList.svelte';
	import SubmissionFileList from '$lib/classroom/SubmissionFileList.svelte';
	import MarkdownText from '$lib/classroom/MarkdownText.svelte';
	import MyClasses from '$lib/classroom/MyClasses.svelte';
	import {
		registerLocalAttachmentUrl,
		type ClassroomAttachment,
		type ClassroomSection
	} from '$lib/classroom/classroom';
	import {
		registerLocalSubmissionFileUrl,
		type SubmissionFileRow
	} from '$lib/classroom/assignment-spec';
	import type { AssignmentSpec, ResponseValue } from '$lib/classroom/assignment-spec';
	import { PORTRAIT, LANDSCAPE, SQUARE, DIAGRAM, type Fixture } from './fixtures';

	/**
	 * See +page.ts for what this harness is and why it has to be a browser
	 * measurement. Every component below is the REAL one, mounted the way its
	 * shipping caller mounts it.
	 */

	const SHAPES: { key: string; fx: Fixture }[] = [
		{ key: 'portrait', fx: PORTRAIT },
		{ key: 'landscape', fx: LANDSCAPE },
		{ key: 'square', fx: SQUARE },
		{ key: 'diagram', fx: DIAGRAM }
	];

	/* THE SRC OVERRIDE IS THE COMPONENTS' OWN DEV-HARNESS SEAM, not a prop this
	   page invented: `registerLocalSubmissionFileUrl` / `registerLocalAttachmentUrl`
	   are what `submissionFileSrc` and `attachmentSrc` consult before building a
	   proxy URL. So the components run their real src builders and their real
	   `isImage*` predicates, and only the bytes are local. Registered at module
	   evaluation rather than in onMount so the FIRST server-rendered markup
	   already carries the data URI -- a src registered later would 404 through
	   the proxy path, fire `onerror`, and drop the thumbnail the harness exists
	   to measure. */
	for (const { key, fx } of SHAPES) {
		registerLocalSubmissionFileUrl(`file-${key}`, fx.src);
		registerLocalAttachmentUrl(`att-${key}`, fx.src);
	}

	const files: SubmissionFileRow[] = SHAPES.map(({ key, fx }, i) => ({
		id: `file-${key}`,
		submission_id: 'sub-1',
		block_id: 'z1',
		caption: `${key} ${fx.w}x${fx.h}`,
		filename: `${key}.png`,
		/* octet-stream is what the 0133 record route actually stores, so the
		   fixture puts `isSubmissionFileImage` on its storage_key branch -- the
		   branch every hand-in written since 0133 takes. */
		mime_type: 'application/octet-stream',
		storage_key: `sub-1/${key}.png`,
		size_bytes: 40_000 + i,
		sort_order: i
	}));

	/* The plain (non-block) hand-ins SubmissionFileList renders: the same four
	   shapes with no block_id, which is what makes them "extra files". */
	const plainFiles: SubmissionFileRow[] = files.map((f) => ({ ...f, block_id: null }));

	const attachments: ClassroomAttachment[] = SHAPES.map(({ key, fx }, i) => ({
		id: `att-${key}`,
		filename: `${key}.png`,
		mime_type: 'image/png',
		size_bytes: 40_000 + i,
		sort_order: i
	}));

	const SPEC: AssignmentSpec = {
		schemaVersion: 1,
		meta: { assignmentId: 'harness-images', title: 'Photo evidence', totalPoints: 10 },
		modules: [
			{
				id: 'm1',
				title: 'Bench photographs',
				points: 10,
				/* `minImages` is deliberately higher than any mount below hands in.
				   A module SpecRenderer considers COMPLETE collapses its own
				   Disclosure (`collapseWhen={complete}`), which puts the zone grid
				   at `display: none` and a zero box -- measured here first, and it
				   is the shape a vacuous pass takes: every width reads 0 and every
				   blank strip reads 0 with it. Keeping the module incomplete is
				   what keeps the grid laid out and measurable; it changes nothing
				   about how the grid itself is built. */
				blocks: [{ type: 'imageZone', id: 'z1', minImages: 6 }]
			}
		]
	};

	const values: Record<string, ResponseValue> = {};

	/* Authored prose. The `attachment:` form is the one figure reference the
	   spec format carries, and it resolves through `resolveFigureSrc` against
	   the attachments above -- so the refusal path is exercised by naming a
	   file that is not there, exactly as a typo does. */
	const PROSE = [
		'A figure at each of the four shapes, then the refusal.',
		'',
		'![portrait 600x900](attachment:portrait.png)',
		'',
		'![landscape 1200x675](attachment:landscape.png)',
		'',
		'![square 800x800](attachment:square.png)',
		'',
		'![diagram 200x150](attachment:diagram.png)',
		'',
		'![a figure whose file is not attached](attachment:missing.png)'
	].join('\n');

	const COURSE = { id: 'c-1', code: 'IDEA209H', title: 'Engineering I Honors', active: true };
	/* TWO sections in a grid whose track minimum is 16rem: at 1440 the measure
	   holds four or more, so `auto-fill` lays out two cards and the empty tracks
	   that are mechanism A. */
	const sections: ClassroomSection[] = [
		{ id: 's-1', course_id: 'c-1', label: 'P1', block: '1', teacher_email: 't@boscotech.edu', active: true, course: COURSE },
		{ id: 's-2', course_id: 'c-1', label: 'P3', block: '3', teacher_email: 't@boscotech.edu', active: true, course: COURSE }
	];

	/**
	 * THE INSTRUMENT. One page-side function, exposed on `window`, that the
	 * browser-verify route spec calls -- so no number the harness reports is
	 * ever retyped into a spec file.
	 *
	 * For every `[data-probe]` region it takes the first `img` and reports:
	 *
	 *   natural   -- the fixture's own intrinsic size, so a fitted size can be
	 *                derived rather than assumed.
	 *   img       -- the img element's rendered border box.
	 *   frame     -- the PAINTED box: the NEAREST ancestor (the img itself
	 *                included) that draws a border or a non-transparent
	 *                background. Found by computed style rather than by a
	 *                selector, because "which element paints the blank" is
	 *                exactly the thing under test and a hardcoded selector
	 *                would assume the answer.
	 *
	 *                NEAREST, NOT OUTERMOST, AND THAT WAS MEASURED THE WRONG WAY
	 *                FIRST. Walking all the way up and keeping the last match
	 *                found SpecRenderer's own module CARD -- a full-width panel
	 *                that legitimately holds a heading and a counter beside the
	 *                picture -- and charged its width to the image, reporting a
	 *                zone thumbnail at frame 340 against an img of 290. A card
	 *                wider than the picture inside it is not blank space; the box
	 *                drawn immediately around the picture is the only one whose
	 *                spare width is.
	 *   content   -- where the picture actually lands inside the img's CONTENT
	 *                box, from the img's own computed `object-fit`. `contain`
	 *                letterboxes (mechanism B), `fill` does not.
	 *   blankW    -- the frame's content-box width minus the content width. THIS
	 *                IS THE NUMBER: the painted-but-empty strip beside the
	 *                picture, whether it came from a pillarbox inside the box or
	 *                from a wrapper standing wider than the box.
	 *
	 *                CONTENT BOXES ON BOTH SIDES, never border boxes. A bordered
	 *                wrapper's border box is 2px wider than the picture that
	 *                exactly fills it, so a border-box comparison reports every
	 *                correct box as 2px of blank and forces a tolerance big
	 *                enough to be doing the work.
	 *   upscale   -- content width divided by intrinsic width. Over 1 means the
	 *                picture is being blown up past its own pixels (mechanism D).
	 */
	function readBoxes() {
		/* The box a picture is painted inside: the border box less this
		   element's own borders and padding. Correct for a replaced element
		   (where `clientWidth` is 0) and for an ordinary wrapper alike. */
		const innerBox = (el: Element) => {
			const r = el.getBoundingClientRect();
			const cs = getComputedStyle(el);
			const n = (v: string) => parseFloat(v) || 0;
			return {
				w: r.width - n(cs.borderLeftWidth) - n(cs.borderRightWidth) - n(cs.paddingLeft) - n(cs.paddingRight),
				h: r.height - n(cs.borderTopWidth) - n(cs.borderBottomWidth) - n(cs.paddingTop) - n(cs.paddingBottom)
			};
		};

		const out: Record<string, unknown>[] = [];
		for (const region of Array.from(document.querySelectorAll('[data-probe]'))) {
			const img = region.querySelector('img') as HTMLImageElement | null;
			if (!img) continue;
			const ib = img.getBoundingClientRect();
			const inner = innerBox(img);
			const nw = img.naturalWidth;
			const nh = img.naturalHeight;

			const paints = (el: Element) => {
				const cs = getComputedStyle(el);
				const bg = cs.backgroundColor;
				const transparent = bg === 'transparent' || /rgba\(0,\s*0,\s*0,\s*0\)/.test(bg);
				return parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0 || !transparent;
			};
			let frame: Element = img;
			for (let el: Element | null = img; el && region.contains(el); el = el.parentElement) {
				if (paints(el)) {
					frame = el;
					break;
				}
			}
			const fb = frame.getBoundingClientRect();
			const fi = innerBox(frame);

			/* The fitted content box, from the img's own object-fit. Only the two
			   values this codebase uses are modelled; anything else is reported
			   verbatim so a silent third case cannot pass as `fill`. */
			const fit = getComputedStyle(img).objectFit;
			let cw = inner.w;
			let ch = inner.h;
			if (fit === 'contain' && nw > 0 && nh > 0) {
				const scale = Math.min(inner.w / nw, inner.h / nh);
				cw = nw * scale;
				ch = nh * scale;
			}
			out.push({
				probe: region.getAttribute('data-probe'),
				fit,
				frameTag: frame === img ? 'img' : frame.className || frame.tagName.toLowerCase(),
				naturalW: nw,
				naturalH: nh,
				imgW: +ib.width.toFixed(1),
				imgH: +ib.height.toFixed(1),
				frameW: +fb.width.toFixed(1),
				frameInnerW: +fi.w.toFixed(1),
				contentW: +cw.toFixed(1),
				contentH: +ch.toFixed(1),
				blankW: +(fi.w - cw).toFixed(1),
				upscale: nw > 0 ? +(cw / nw).toFixed(3) : 0
			});
		}
		return out;
	}

	/**
	 * THE VOID TO THE RIGHT OF A GRID'S LAST CARD (mechanism A).
	 *
	 * MEASURED FROM WHERE THE CARDS LANDED, NOT FROM `grid-template-columns`.
	 * `auto-fit` collapses an unused track to zero and the computed template
	 * still lists it, so a track COUNT cannot tell a collapsed track from a
	 * standing one -- the check would read the same number before and after the
	 * fix and pass either way. What a reader actually sees is the distance from
	 * the last card on the first row to the right edge of the grid, so that is
	 * what this returns.
	 *
	 * `cols` is the number of distinct left edges on the first row, which is the
	 * real column count for the same reason.
	 */
	function readGrids() {
		return Array.from(document.querySelectorAll('[data-grid]')).map((region) => {
			const grid = region.querySelector('.zone-grid, .class-grid') as HTMLElement | null;
			if (!grid) return { grid: region.getAttribute('data-grid'), cols: -1, items: -1, voidW: -1, template: '' };
			const cs = getComputedStyle(grid);
			const gb = grid.getBoundingClientRect();
			const right = gb.right - (parseFloat(cs.borderRightWidth) || 0) - (parseFloat(cs.paddingRight) || 0);
			const kids = Array.from(grid.children).map((c) => c.getBoundingClientRect());
			const top = kids.length ? Math.min(...kids.map((r) => r.top)) : 0;
			const firstRow = kids.filter((r) => Math.abs(r.top - top) < 2);
			const lastRight = firstRow.length ? Math.max(...firstRow.map((r) => r.right)) : right;
			return {
				grid: region.getAttribute('data-grid'),
				cols: new Set(firstRow.map((r) => Math.round(r.left))).size,
				items: grid.childElementCount,
				voidW: +(right - lastRight).toFixed(1),
				template: cs.gridTemplateColumns
			};
		});
	}

	/**
	 * THE VERDICTS the route spec asserts against, computed here from the real
	 * measurements rather than retyped there. One string per claim.
	 *
	 * `blankW <= 1` rather than `=== 0` for sub-pixel layout rounding only --
	 * the border is already out of the comparison, since both sides are content
	 * boxes. A pillarbox or a stretched wrapper is measured in the hundreds of
	 * pixels here, so a 1px tolerance cannot hide one; the mutation proof is
	 * what says so rather than this sentence.
	 */
	function verdicts() {
		const v: string[] = [];
		for (const b of readBoxes() as { probe: string; blankW: number; upscale: number }[]) {
			v.push(`${b.probe} blank ${b.blankW <= 1 ? 'ok' : 'FAIL'}`);
		}
		/* Only the diagram can be upscaled: it is the one fixture narrower than
		   every column it lands in. */
		for (const b of readBoxes() as { probe: string; upscale: number }[]) {
			if (b.probe.endsWith('diagram')) v.push(`${b.probe} upscale ${b.upscale <= 1.001 ? 'ok' : 'FAIL'}`);
		}
		for (const g of readGrids()) {
			v.push(`${g.grid} void ${g.voidW <= 1 ? 'ok' : 'FAIL'}`);
		}
		return v;
	}

	onMount(() => {
		const w = window as unknown as Record<string, unknown>;
		w.__imgBoxes = readBoxes;
		w.__imgGrids = readGrids;
		w.__imgVerdicts = verdicts;
		/* Nothing here is measurable until every fixture has decoded -- a probe
		   run against an undecoded img reads naturalWidth 0 and reports a blank
		   of zero, which is a vacuous pass. The flag is what the route spec
		   waits on. */
		const imgs = Array.from(document.images);
		Promise.all(
			imgs.map((i) => (i.complete ? Promise.resolve() : new Promise((r) => { i.onload = r; i.onerror = r; })))
		).then(() => document.documentElement.setAttribute('data-fixtures-ready', String(imgs.length)));
	});
</script>

<svelte:head><title>dev / classroom images</title></svelte:head>

<div class="cr-root harness">
	<h1>Classroom image box geometry</h1>
	<p class="hint">
		Four intrinsic shapes through five real renderers. Call
		<code>__imgBoxes()</code>, <code>__imgGrids()</code> or <code>__imgVerdicts()</code>.
	</p>

	<h2>SpecRenderer imageZone, editable (the student hand-in)</h2>
	<div data-grid="zone-edit">
		<SpecRenderer spec={SPEC} initialValues={values} {files} approved />
	</div>

	<h2>SpecRenderer imageZone, TWO hand-ins in a wide pane</h2>
	<!-- The discriminating case for mechanism A: a zone whose measure holds
	     several tracks with only two cards to put in them. -->
	<div data-grid="zone-two">
		<SpecRenderer
			spec={SPEC}
			initialValues={values}
			files={files.filter((f) => f.id === 'file-portrait' || f.id === 'file-landscape')}
			approved
			readonly
		/>
	</div>

	<h2>SpecRenderer imageZone, read-only (the grading console)</h2>
	<div data-grid="zone-readonly">
		<SpecRenderer spec={SPEC} initialValues={values} {files} approved readonly />
	</div>

	<h2>SpecRenderer imageZone, one file per mount (the painted box)</h2>
	<div class="probe-row">
		{#each SHAPES as s (s.key)}
			<div class="probe-cell" data-probe="zone-{s.key}">
				<SpecRenderer
					spec={SPEC}
					initialValues={values}
					files={files.filter((f) => f.id === `file-${s.key}`)}
					approved
					readonly
				/>
			</div>
		{/each}
	</div>

	<h2>AttachmentList (a handout on an item)</h2>
	{#each SHAPES as s (s.key)}
		<div data-probe="attach-{s.key}">
			<AttachmentList attachments={attachments.filter((a) => a.id === `att-${s.key}`)} />
		</div>
	{/each}

	<h2>SubmissionFileList (extra files handed in)</h2>
	{#each SHAPES as s (s.key)}
		<div data-probe="submission-{s.key}">
			<SubmissionFileList files={plainFiles.filter((f) => f.id === `file-${s.key}`)} />
		</div>
	{/each}

	<h2>MarkdownText figures (authored prose)</h2>
	{#each SHAPES as s (s.key)}
		<div class="prose" data-probe="figure-{s.key}">
			<MarkdownText body={`![${s.key} ${s.fx.w}x${s.fx.h}](attachment:${s.key}.png)`} {attachments} />
		</div>
	{/each}

	<h2>MarkdownText, the whole document including the refusal</h2>
	<div class="prose" data-refusal>
		<MarkdownText body={PROSE} {attachments} />
	</div>

	<h2>MyClasses (two sections)</h2>
	<div data-grid="my-classes">
		<MyClasses {sections} />
	</div>
</div>

<style>
	.harness {
		padding: 1rem;
	}
	.hint {
		color: var(--text-2);
		font-size: 0.8rem;
	}
	/* Four single-file mounts side by side, each in a box wide enough that a
	   full-width image genuinely has room to letterbox. Not a grid: this row is
	   the harness's own furniture and must not be mistaken for one of the two
	   grids under test. */
	.probe-row {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
	}
	.probe-cell {
		flex: 1 1 20rem;
		min-width: 0;
	}
	.prose {
		max-width: 46rem;
	}
</style>
