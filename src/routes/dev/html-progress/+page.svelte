<script lang="ts">
	import { CLASSROOM_PLATE } from '$lib/classroom/plate';
	/**
	 * THE PROGRESS RAIL HARNESS. See `+page.ts` for why it exists.
	 *
	 * TWO KINDS OF MOUNT ON ONE PAGE. The first eight cards mount the REAL
	 * `Progress` over a hand-written manifest and a hand-written set of stored
	 * values, one card per state the brief names, so a single page load measures
	 * every state at both widths. The last card mounts the REAL `ItemDetail`
	 * over a real `HxAnswersStore` whose transports write into a Map, pointed at
	 * the real `/hx/worksheet` document; typing into the frame moves the rail
	 * through exactly the path a student's typing takes.
	 *
	 * `window.__hxp` IS THE ORACLE the browser spec compares the screen against:
	 * the pure module's answer for every card, computed here from the same
	 * fixtures. The spec reads the RENDERED percent off the DOM and asserts it
	 * matches, so a rail that drew the wrong number over the right computation
	 * (or the right number over a wrong one) reddens either way.
	 */
	import { onDestroy } from 'svelte';
	import { page } from '$app/state';
	import ItemDetail from '$lib/classroom/ItemDetail.svelte';
	import Progress from '$lib/classroom/html-assignment/Progress.svelte';
	import { HxAnswersStore } from '$lib/classroom/html-assignment/answers-store.svelte';
	import type { HxAnswerTransports } from '$lib/classroom/html-assignment/answers';
	import { HX_SANDBOX_FLAGS, hxExpectedOrigin } from '$lib/classroom/html-assignment/bridge';
	import type { HxImageState } from '$lib/classroom/html-assignment/bridge';
	import type { HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';
	import { hxCompletion, hxProgress, hxProgressSummary } from '$lib/classroom/html-assignment/progress';
	import { createHtmlAnswerTransports } from '$lib/classroom/transports';
	import type { SubmissionFileRow } from '$lib/classroom/assignment-spec';
	import type { ClassroomItem, ClassroomSection } from '$lib/classroom/classroom';
	// THE ROOM'S OWN STYLESHEET, not just its class. `.cr-root` with no rules
	// behind it paints the portal plate while claiming to be the classroom.
	import '$lib/classroom/classroom.css';

	type Values = Record<string, string | boolean>;
	type Images = Record<string, HxImageState>;

	/**
	 * THE FIXTURE MANIFEST. Three modules with DIFFERENT point values, which is
	 * the whole point: 5, 1 and 4, so a count-weighted bar and a point-weighted
	 * bar disagree on every partial card. Six counted blocks, one per type the
	 * contract knows, plus a header field the bar does not count.
	 *
	 * Fields and ids are different strings, for the reason every fixture in this
	 * subsystem gives: a mapping that is the identity function cannot be seen.
	 */
	const BENCH: HtmlAssignmentManifest = {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Bench setup and first cut',
		course: 'IDEA100',
		points: 10,
		header: [{ id: 'hb-name', field: 'studentName', type: 'text' }],
		modules: [
			{
				id: 'setup',
				title: 'Bench setup',
				points: 5,
				blocks: [
					{ id: 's-staged', field: 'staged', type: 'text' },
					{ id: 's-notes', field: 'setupNotes', type: 'longText', minSentences: 2 }
				],
				criteria: []
			},
			{
				id: 'cut',
				title: 'First cut',
				points: 1,
				blocks: [{ id: 'c-photo', field: 'cutPhoto', type: 'image' }],
				criteria: []
			},
			{
				id: 'reflect',
				title: 'Reflection',
				points: 4,
				blocks: [
					{ id: 'r-why', field: 'why', type: 'longText', minSentences: 3 },
					{ id: 'r-table', field: 'measurements', type: 'table' },
					{ id: 'r-safe', field: 'safetyChecked', type: 'checkbox' }
				],
				criteria: []
			}
		]
	};

	/** One module, two blocks. The one-module case the brief names. */
	const SINGLE: HtmlAssignmentManifest = {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'One reflection',
		course: 'IDEA100',
		points: 4,
		modules: [
			{
				id: 'only',
				title: 'Reflection',
				points: 4,
				blocks: [
					{ id: 'o-why', field: 'why', type: 'longText', minSentences: 1 },
					{ id: 'o-safe', field: 'safetyChecked', type: 'checkbox' }
				],
				criteria: []
			}
		]
	};

	const PHOTO: HxImageState = { url: '/dev/html-progress/fixture.png', name: 'cut.jpg', caption: '' };

	/** Every counted block of BENCH met. Built once and taken apart per card. */
	const ALL_VALUES: Values = {
		studentName: 'Ana Reyes',
		staged: 'Vise, square, and the blank, all on the mat.',
		setupNotes: 'Bolted the vise down first. Squared the blank to the fence.',
		why: 'The cut drifted. The blank was not square. I re-squared it and cut again.',
		measurements: JSON.stringify([
			['pass', 'mm'],
			['1', '0.4']
		]),
		safetyChecked: true
	};
	const ALL_IMAGES: Images = { cutPhoto: PHOTO };

	interface Card {
		id: string;
		title: string;
		why: string;
		manifest: HtmlAssignmentManifest;
		values: Values;
		images: Images;
	}

	/**
	 * LEDGER 0360 (report 8f78d5bd): Assembly with one required photo, one
	 * OPTIONAL photo slot, and a required answer. 4 points over the two
	 * required blocks.
	 */
	const ASSEMBLY: HtmlAssignmentManifest = {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Portfolio capture',
		course: 'IDEA209H',
		points: 4,
		modules: [
			{
				id: 'assembly',
				title: 'Assembly',
				points: 4,
				blocks: [
					{ id: 'as-photo-1', field: 'assemblyPhoto1', type: 'image' },
					{ id: 'as-photo-2', field: 'assemblyPhoto2', type: 'image', optional: true },
					{ id: 'as-why', field: 'assemblyWhy', type: 'longText', minSentences: 2 }
				],
				criteria: []
			}
		]
	};

	const CARDS: Card[] = [
		{
			id: 'zero',
			title: 'Nothing filled in',
			why: 'Zero. Every segment empty, the stage reads Not started, and the note is still there.',
			manifest: BENCH,
			values: {},
			images: {}
		},
		{
			id: 'weighted-light',
			title: 'Only the one-point module done',
			why: 'One of six blocks, but one of ten points: 10%. A count-weighted bar would say 17%.',
			manifest: BENCH,
			values: {},
			images: ALL_IMAGES
		},
		{
			id: 'weighted-heavy',
			title: 'Only the five-point module done',
			why: 'Two of six blocks, five of ten points: 50%. A count-weighted bar would say 33%.',
			manifest: BENCH,
			values: { staged: ALL_VALUES.staged, setupNotes: ALL_VALUES.setupNotes },
			images: {}
		},
		{
			id: 'short',
			title: 'An answer short of its sentences',
			why: 'Setup notes carry one sentence of the two asked for, so that block is NOT met: 25%, and the next line names the module and the count.',
			manifest: BENCH,
			values: { staged: ALL_VALUES.staged, setupNotes: 'Bolted the vise down first.' },
			images: {}
		},
		{
			id: 'image-only',
			title: 'The only unmet block is a photo',
			why: 'Everything answered but the picture: 90%, Almost there, and the next line says a photo is what is waiting.',
			manifest: BENCH,
			values: ALL_VALUES,
			images: {}
		},
		{
			id: 'full',
			title: 'Everything filled in',
			why: 'One hundred. The stage reads All filled in, the completion note replaces the next line, and the note underneath still says it is not a grade.',
			manifest: BENCH,
			values: ALL_VALUES,
			images: ALL_IMAGES
		},
		{
			id: 'single',
			title: 'A one-module document, half done',
			why: 'One segment, one chip, 50%.',
			manifest: SINGLE,
			values: { safetyChecked: false },
			images: {}
		},
		{
			id: 'single-full',
			title: 'A one-module document, complete',
			why: 'One segment, full.',
			manifest: SINGLE,
			values: { why: 'The blank was not square.', safetyChecked: true },
			images: {}
		},
		{
			id: 'optional-empty',
			title: 'An optional photo slot left empty (ledger 0360)',
			why: 'One required photo, one optional slot, one answer. The slot is empty and the bar is 100: an optional block is judged and never counted.',
			manifest: ASSEMBLY,
			values: { assemblyWhy: 'I glued the base first. Then I clamped the arm.' },
			images: { assemblyPhoto1: PHOTO }
		},
		{
			id: 'checkbox-string',
			title: 'A checkbox the document stored as a string (ledger 0360)',
			why: 'The box posted its value ("on") instead of a boolean. It is stored, so it counts: 100.',
			manifest: SINGLE,
			values: { why: 'The blank was not square.', safetyChecked: 'on' },
			images: {}
		}
	];

	// ---------------------------------------------------------------------------
	// THE INTERACTIVE CARD. Fill the next unmet block, one press at a time, so
	// the fill can be watched easing and the completion gloss can be watched
	// firing. Both controls are real buttons at the 44px floor.
	// ---------------------------------------------------------------------------

	let liveValues = $state<Values>({});
	let liveImages = $state<Images>({});
	const liveProgress = $derived(hxProgress(BENCH, liveValues, liveImages));

	function fillNext() {
		const next = liveProgress.next;
		if (!next) return;
		if (next.type === 'image') {
			liveImages = { ...liveImages, [next.field]: PHOTO };
			return;
		}
		const v = ALL_VALUES[next.field];
		if (v === undefined) return;
		liveValues = { ...liveValues, [next.field]: v };
	}
	function reset() {
		liveValues = {};
		liveImages = {};
	}

	// ---------------------------------------------------------------------------
	// THE REAL ITEM PAGE COMPONENT OVER THE REAL CONTROLLER AND THE REAL ROUTE.
	// ---------------------------------------------------------------------------

	/**
	 * The `/hx/worksheet` fixture's own fields (`teamName`, `reflection`,
	 * `checkedOff`); the block ids are this harness's own, and different strings.
	 * Ten points in one module, so its two counted blocks are 5 each.
	 */
	const WORKSHEET: HtmlAssignmentManifest = {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Bridge fixture worksheet',
		course: 'IDEA209H',
		points: 10,
		header: [{ id: 'hxw-team', field: 'teamName', type: 'text' }],
		modules: [
			{
				id: 'hxw-mod',
				title: 'One module, three block types',
				points: 10,
				blocks: [
					{ id: 'hxw-reflection', field: 'reflection', type: 'longText', minSentences: 2 },
					{ id: 'hxw-done', field: 'checkedOff', type: 'checkbox' }
				],
				criteria: []
			}
		]
	};

	const NOW = Date.parse('2026-09-10T17:00:00Z');
	const iso = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString();

	const SECTION: ClassroomSection = {
		id: 's-hxp',
		course_id: 'c-1',
		label: 'Block 4',
		block: '4',
		teacher_email: 'teacher@boscotech.edu',
		active: true,
		course: { id: 'c-1', code: 'IDEA209H', title: 'Engineering II Honors', active: true }
	};

	/** Published, not scheduled, schema 3: the frame and the rail both mount. */
	const ITEM: ClassroomItem = {
		id: 'i-hxp',
		kind: 'assignment',
		title: 'Bridge fixture worksheet',
		body: '',
		points: 10,
		due_at: null,
		category: null,
		author_email: 'teacher@boscotech.edu',
		author_name: 'A. Pina',
		published: true,
		pinned: false,
		sort_order: 0,
		first_published_at: iso(4),
		edited_at: null,
		created_at: iso(4),
		updated_at: iso(4),
		attachments: [],
		links: [],
		publish_at: null,
		assignment_schema_version: 3
	} as unknown as ClassroomItem;

	/** In-memory transports: every write lands in this Map and answers ok.
	    `savedCount` is the reactive shadow of the Map, so the `__hxp` snapshot
	    below re-runs when a debounced write LANDS and not only when a value
	    moves -- measured: without it the second save was still in its debounce
	    when the page last wrote the snapshot, and the spec read one row. */
	const saved = new Map<string, string | boolean>();
	let savedCount = $state(0);
	let uploads = 0;
	const transports: HxAnswerTransports = {
		async saveResponse(_itemId, blockId, value) {
			saved.set(blockId, value as string | boolean);
			savedCount += 1;
			return { ok: true, data: { ok: true } };
		},
		async uploadSubmissionFile(_itemId, file, blockId = null, caption = null) {
			uploads += 1;
			return {
				ok: true,
				data: {
					file: {
						id: `file-${uploads}`,
						submission_id: 'sub-1',
						block_id: blockId,
						caption,
						filename: file.name,
						mime_type: 'application/octet-stream',
						sort_order: uploads
					} as SubmissionFileRow
				}
			};
		},
		async deleteSubmissionFile() {
			return { ok: true, data: { ok: true } };
		},
		async setFileCaption() {
			return { ok: true, data: { ok: true } };
		}
	};

	const store = new HxAnswersStore({
		itemId: ITEM.id,
		manifest: WORKSHEET,
		transports,
		values: {},
		images: {},
		debounceMs: 50
	});
	onDestroy(() => store.destroy());

	/**
	 * TYPING INTO THE WORKSHEET, SYNTHESISED. The sandboxed document is an
	 * opaque origin, so nothing on this page can reach into it and type; what a
	 * browser spec CAN do is what the boundary harness's positive control does:
	 * construct the exact `MessageEvent` the document would post -- right
	 * origin, right source, well formed -- and hand it to the window. It then
	 * passes through the real `hxReceive` gate, the real controller, the real
	 * store and the real `ItemDetail` mount, which is every layer between a
	 * keystroke and the rail. Two presses: the checkbox (one of two counted
	 * blocks, 50%), then a two-sentence reflection (100%).
	 */
	let typed = $state(0);
	const TYPED: { field: string; value: string | boolean }[] = [
		{ field: 'checkedOff', value: true },
		{ field: 'reflection', value: 'We moved the vise back. The blank cleared the fence after that.' }
	];
	function typeInWorksheet() {
		const frameEl = document.querySelector('[data-sc="real"] iframe[data-hx-frame]') as HTMLIFrameElement | null;
		const source = frameEl?.contentWindow ?? null;
		const origin = hxExpectedOrigin(location.origin, HX_SANDBOX_FLAGS);
		const next = TYPED[Math.min(typed, TYPED.length - 1)];
		window.dispatchEvent(
			new MessageEvent('message', { origin, source, data: { type: 'idea:change', ...next } })
		);
		typed += 1;
	}

	// ---------------------------------------------------------------------------
	// THE STALLED DATABASE (ledger 0360, reports d983e776 and 2d83c063).
	//
	// The REAL `createHtmlAnswerTransports` over a tiny client whose `rpc`
	// either stores the answer in a Map or answers the way production did on
	// 2026-09-29: a statement timeout (57014, status 500) or, after the
	// restart, a lost session (42501, status 403). So the transport, the
	// controller, the store and the rail are all the shipping ones, and only the
	// database is fake. `window.__hxp.stalled` carries the server's own
	// judgment (`hxCompletion` over the Map's rows) beside the attempt counts,
	// so the spec can put the rail and the server side by side.
	// ---------------------------------------------------------------------------

	/** Two required answers, 2 points each. */
	const STALL: HtmlAssignmentManifest = {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Concept sketches',
		course: 'IDEA100',
		points: 4,
		modules: [
			{
				id: 'concepts',
				title: 'Sketches',
				points: 4,
				blocks: [
					{ id: 'st-one', field: 'conceptOne', type: 'longText' },
					{ id: 'st-two', field: 'conceptTwo', type: 'longText' }
				],
				criteria: []
			}
		]
	};
	type StallMode = 'none' | 'timeout' | 'signed-out';
	let stallMode = $state<StallMode>('none');
	const stallRows = new Map<string, unknown>();
	const stallAttempts = new Map<string, number>();
	let stallCalls = $state(0);
	const stallClient = {
		rpc(_fn: string, args: { p_block_id: string; p_value: unknown }) {
			stallCalls += 1;
			stallAttempts.set(args.p_block_id, (stallAttempts.get(args.p_block_id) ?? 0) + 1);
			if (stallMode === 'timeout') {
				return Promise.resolve({
					data: null,
					error: { code: '57014', message: 'canceling statement due to statement timeout' },
					status: 500
				});
			}
			if (stallMode === 'signed-out') {
				return Promise.resolve({
					data: null,
					error: { code: '42501', message: 'permission denied for function classroom_save_response' },
					status: 403
				});
			}
			stallRows.set(args.p_block_id, args.p_value);
			return Promise.resolve({ data: { ok: true }, error: null, status: 200 });
		}
	};
	function makeStallStore() {
		return new HxAnswersStore({
			itemId: 'i-stall',
			manifest: STALL,
			transports: createHtmlAnswerTransports(stallClient as never),
			values: {},
			images: {},
			// A short debounce so the backoff (which scales from it) settles in
			// well under a second; the attempt COUNT is the shipping one.
			debounceMs: 40
		});
	}
	let stallStore = $state(makeStallStore());
	onDestroy(() => stallStore.destroy());
	function stallFill() {
		stallStore.change({ blockId: 'st-one', field: 'conceptOne', value: 'A cam follower that lifts the arm.' });
		stallStore.change({ blockId: 'st-two', field: 'conceptTwo', value: 'A rack and pinion under the base.' });
	}
	function stallReset() {
		stallStore.destroy();
		stallRows.clear();
		stallAttempts.clear();
		stallCalls = 0;
		stallMode = 'none';
		stallStore = makeStallStore();
	}

	/* FORCED THEME ATTRIBUTE (ledger 0360), `/dev/classroom-live`'s shape: a
	   harness holds no session, so ThemeRoot decides "none" here; `?theme=`
	   writes the attribute and re-writes it once after ThemeRoot's first effect,
	   so the stalled card's not-saved line and Retry are measured on every
	   ground the classroom has. */
	const themeParam = page.url.searchParams.get('theme');
	$effect(() => {
		if (themeParam !== 'space-white' && themeParam !== 'matrix') return;
		const el = document.documentElement;
		const apply = () => {
			if (el.getAttribute('data-theme') !== themeParam) el.setAttribute('data-theme', themeParam);
		};
		apply();
		// ThemeRoot re-decides after hydration (measured: a one-shot re-write
		// after a zero timeout was taken off again here), so the harness holds
		// the attribute while it is mounted. Harness-only; nothing ships this.
		const watch = new MutationObserver(apply);
		watch.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
		return () => {
			watch.disconnect();
			el.removeAttribute('data-theme');
		};
	});

	// The oracle: the pure module's answer for every card, keyed by card id.
	$effect(() => {
		const oracle: Record<string, { percent: number; stage: string; basis: string; summary: string }> = {};
		for (const c of CARDS) {
			const p = hxProgress(c.manifest, c.values, c.images);
			oracle[c.id] = { percent: p.percent, stage: p.stage, basis: p.basis, summary: hxProgressSummary(p) };
		}
		const live = hxProgress(BENCH, liveValues, liveImages);
		oracle.interactive = { percent: live.percent, stage: live.stage, basis: live.basis, summary: hxProgressSummary(live) };
		const real = hxProgress(WORKSHEET, store.values, store.images);
		oracle.real = { percent: real.percent, stage: real.stage, basis: real.basis, summary: hxProgressSummary(real) };
		const status = stallStore.status;
		const stall = hxProgress(STALL, stallStore.values, stallStore.images, { unsaved: status.unsaved });
		oracle.stalled = { percent: stall.percent, stage: stall.stage, basis: stall.basis, summary: hxProgressSummary(stall) };
		// THE SERVER'S OWN JUDGMENT, from the rows the fake database holds.
		void stallCalls;
		const server = hxCompletion(
			STALL,
			[...stallRows].map(([block_id, value]) => ({ block_id, value: value as never, updated_at: null }))
		);
		(window as unknown as { __hxp: unknown }).__hxp = {
			oracle,
			savedRows: [...saved.keys()],
			savedCount,
			typed,
			stalled: {
				mode: stallMode,
				calls: stallCalls,
				attempts: Object.fromEntries(stallAttempts),
				serverComplete: server.complete,
				unsaved: [...status.unsaved].sort(),
				phase: status.save?.phase ?? 'none'
			}
		};
	});
</script>

<svelte:head><title>HTML assignment progress rail harness</title></svelte:head>

<div class="cr-root {CLASSROOM_PLATE} harness">
	<header class="intro">
		<h1>HTML assignment progress rail</h1>
		<p class="note">
			The REAL <code>Progress</code> over hand-written manifests, one card per state, then the REAL
			<code>ItemDetail</code> over a real answer store and the real <code>/hx/worksheet</code>
			document. The fixture's three modules are worth 5, 1 and 4 points, so a bar weighted by count
			and one weighted by points disagree on every partial card.
		</p>
	</header>

	{#each CARDS as card (card.id)}
		<section class="card sc" data-testid="sc-{card.id}" data-sc={card.id}>
			<h2 class="sc-title">{card.title}</h2>
			<p class="sc-why">{card.why}</p>
			<Progress manifest={card.manifest} values={card.values} images={card.images} />
		</section>
	{/each}

	<section class="card sc" data-testid="sc-interactive" data-sc="interactive">
		<h2 class="sc-title">Filled one answer at a time</h2>
		<p class="sc-why">
			Fill next answers the first unmet block in manifest order. The fill eases and the stage word
			moves; at the end the gloss sweeps once. Under reduced motion none of that animates and the
			same rail is on screen.
		</p>
		<div class="h-buttons">
			<button type="button" class="btn" data-drive="fill" onclick={fillNext} disabled={liveProgress.complete}>
				Fill next answer
			</button>
			<button type="button" class="btn" data-drive="reset" onclick={reset}>Reset</button>
		</div>
		<Progress manifest={BENCH} values={liveValues} images={liveImages} />
	</section>

	<section class="card sc" data-testid="sc-stalled" data-sc="stalled">
		<h2 class="sc-title">The database stalled (ledger 0360)</h2>
		<p class="sc-why">
			The REAL answer transport over a fake database that stores the answer, times out the way it
			did on 2026-09-29, or refuses a lost session. With the stall on, the rail stops at 99, says the
			answers are not saved, and offers Retry; it reaches 100 only once the server holds them.
		</p>
		<div class="h-buttons" role="group" aria-label="What the database does">
			<button type="button" class="btn" data-drive="stall-none" aria-pressed={stallMode === 'none'} onclick={() => (stallMode = 'none')}>
				Database working
			</button>
			<button type="button" class="btn" data-drive="stall-timeout" aria-pressed={stallMode === 'timeout'} onclick={() => (stallMode = 'timeout')}>
				Database stalled
			</button>
			<button type="button" class="btn" data-drive="stall-signed-out" aria-pressed={stallMode === 'signed-out'} onclick={() => (stallMode = 'signed-out')}>
				Session lost
			</button>
		</div>
		<div class="h-buttons">
			<button type="button" class="btn" data-drive="stall-fill" onclick={stallFill}>Fill every answer</button>
			<button type="button" class="btn" data-drive="stall-reset" onclick={stallReset}>Start over</button>
		</div>
		<Progress manifest={STALL} values={stallStore.values} images={stallStore.images} status={stallStore.status} />
	</section>

	<section class="card sc" data-testid="sc-real" data-sc="real">
		<h2 class="sc-title">The real item component over the real document</h2>
		<p class="sc-why">
			<code>ItemDetail</code> with a real <code>HxAnswersStore</code> whose transports write into a
			Map. Type in the worksheet below and the rail above it moves through the ordinary bridge; the
			checkbox is one of the two counted blocks and the reflection wants two sentences.
		</p>
		<div class="h-buttons">
			<button type="button" class="btn" data-drive="type" onclick={typeInWorksheet}>
				Type in the worksheet (synthetic message)
			</button>
		</div>
		<ItemDetail
			section={SECTION}
			item={ITEM}
			htmlAssignment={{ documentId: 'worksheet', manifest: WORKSHEET, filename: 'worksheet.html', updatedAt: null }}
			htmlAnswers={store}
		/>
	</section>
</div>

<style>
	.harness {
		padding: var(--space-4);
		max-width: 72rem;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.intro h1 {
		margin: 0 0 var(--space-2);
	}
	.note,
	.sc-why {
		color: var(--text-2);
		margin: 0 0 var(--space-3);
		font-size: 0.9rem;
	}
	.sc {
		padding: var(--space-3);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		background: var(--surface-1);
	}
	.sc-title {
		margin: 0 0 var(--space-1);
		font-size: 1.1rem;
	}
	.h-buttons {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		margin-bottom: var(--space-3);
	}
	.h-buttons .btn {
		min-height: 44px;
		min-width: 44px;
	}
	code {
		font-family: var(--font-mono);
	}
</style>
