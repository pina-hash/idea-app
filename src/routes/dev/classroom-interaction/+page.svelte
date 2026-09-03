<script lang="ts">
	import { page } from '$app/state';
	import ItemDetail from '$lib/classroom/ItemDetail.svelte';
	import type { ClassroomItem, ClassroomSection } from '$lib/classroom/classroom';
	import type {
		AssignmentEngineTransports,
		AssignmentSpec,
		ResponseRow,
		ResponseValue,
		StudentEngineData
	} from '$lib/classroom/assignment-spec';

	/**
	 * THE TYPING COLLAPSE, reproduced on the real components (prompt 0012).
	 *
	 * The reported sequence: an instructor is typing into an assignment, and a
	 * module or a panel folds itself away, the page jumps, and the caret is
	 * gone. The mechanism this harness exists to make visible is that a
	 * `Disclosure`'s `collapseWhen` is a LIVE signal read straight off the
	 * responses being typed, and the region it hides is hidden with
	 * `display: none` -- which blurs whatever inside it had focus and takes the
	 * page's height with it.
	 *
	 * The spec is shaped so the last keystroke is the one that trips it: two
	 * constrained blocks in one module, one of them already satisfied, so
	 * finishing the SECOND is what flips `complete` and closes `module-body`
	 * over the very textarea being typed into.
	 *
	 * `?tall=1` (the default) puts enough page above the module for `scrollY` to
	 * be non-zero, because "thrown to the bottom of the page" is a scroll clamp
	 * against a document that just got shorter, and a page with nothing to
	 * scroll cannot show it.
	 */

	const SECTION: ClassroomSection = {
		id: 's-1',
		course_id: 'c-1',
		label: 'A',
		block: '3',
		teacher_email: 'teacher@boscotech.edu',
		active: true,
		course: { id: 'c-1', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
	} as ClassroomSection;

	const LONG_TITLE =
		'Simulation Lab: Where Is This Going To Break, and What Would You Change About It';

	const ITEM: ClassroomItem = {
		id: 'i-1',
		kind: 'assignment',
		title: LONG_TITLE,
		body:
			'Read the whole brief before you touch the model. You are looking for the ' +
			'first place the assembly loses stiffness, not the prettiest render.',
		body_doc: null,
		points: 20,
		due_at: null,
		category: 'Labs',
		author_email: 'teacher@boscotech.edu',
		author_name: 'A. Pina',
		published: true,
		pinned: false,
		unit_id: null,
		sort_order: 0,
		first_published_at: '2026-08-01T15:00:00Z',
		edited_at: null,
		created_at: '2026-08-01T15:00:00Z',
		updated_at: '2026-08-01T15:00:00Z',
		links: [],
		attachments: [],
		postings: [{ id: 'p-1', item_id: 'i-1', section_id: 's-1' }]
	} as unknown as ClassroomItem;

	const SPEC: AssignmentSpec = {
		schemaVersion: 1,
		meta: { assignmentId: 'i-1', title: LONG_TITLE, totalPoints: 20 },
		modules: [
			{
				id: 'm1',
				title: 'Failure write-up',
				points: 20,
				blocks: [
					{
						type: 'instructions',
						content:
							'Measure every dimension twice with the caliper before you write anything down.'
					},
					{ type: 'textField', id: 'tf1', prompt: 'Where does it break first?', minSentences: 1 },
					{ type: 'textField', id: 'tf2', prompt: 'What would you change?', minSentences: 1 }
				]
			}
		]
	} as unknown as AssignmentSpec;

	/**
	 * TWO CASES, and the query parameter picks between them.
	 *
	 * `?case=typing` answers ONE of the two constrained blocks, so the module
	 * sits at 1/2 -- open, and one keystroke away from closing itself. That is
	 * the reported defect's exact state and the only one in which a single
	 * character can trip `complete`.
	 *
	 * The default (`?case=fresh`, and no parameter at all) answers nothing, so
	 * every panel is in its ARRIVAL state. It is the control: the standard's own
	 * rule -- reading is out of the way once the work has started
	 * (IDEA_INTERFACE_STANDARDS 1) -- is about how a panel arrives, and a fix for
	 * the typing collapse that also broke the arrival rule would pass the typing
	 * check on its own. Two cases is what makes each of them mean something.
	 */
	const ANSWERED: ResponseRow[] = [
		{
			id: 'r-1',
			item_id: 'i-1',
			block_id: 'tf1',
			student_email: 'student@boscotech.net',
			value: { text: 'The lower gusset lets go before anything else does.' },
			updated_at: '2026-08-02T15:00:00Z'
		} as unknown as ResponseRow
	];

	const started = $derived(page.url.searchParams.get('case') === 'typing');

	const engine: StudentEngineData = $derived({
		spec: SPEC,
		rubric: null,
		submission: null,
		responses: started ? ANSWERED : [],
		files: [],
		filesStorageReady: true,
		approvals: []
	});

	/** In memory, and deliberately instant: a save that took a round trip would
	 *  put a network delay between the keystroke and the collapse and make the
	 *  measurement about latency instead. */
	const engineTransports: AssignmentEngineTransports = {
		saveResponse: async (_i: string, _b: string, _v: ResponseValue) => ({
			ok: true,
			data: { ok: true }
		}),
		submitAssignment: async () => ({ ok: true, data: { ok: true } }),
		unsubmitAssignment: async () => ({ ok: true, data: { ok: true } }),
		uploadSubmissionFile: async () => ({ ok: true, data: {} }),
		deleteSubmissionFile: async () => ({ ok: true, data: { ok: true } }),
		setFileCaption: async () => ({ ok: true, data: { ok: true } }),
		reloadStudent: async () => ({ ok: true, data: engine })
	} as unknown as AssignmentEngineTransports;

	/**
	 * THE PROBES. Raw DOM facts, re-read on a timer rather than derived from any
	 * component's state -- the point is what the BROWSER ended up with, not what
	 * a component believes. Nothing here decides whether a value is correct;
	 * the browser spec does that.
	 */
	let focusId = $state('-');
	let scrollY = $state('-');
	let moduleOpen = $state('-');
	let instructionsOpen = $state('-');
	let itemBodyOpen = $state('-');

	function readProbes() {
		if (typeof document === 'undefined') return;
		const active = document.activeElement as HTMLElement | null;
		focusId =
			!active || active === document.body
				? 'none'
				: (active.getAttribute('data-probe-id') ??
					active.getAttribute('id') ??
					active.tagName.toLowerCase());
		scrollY = String(Math.round(window.scrollY));
		const expanded = (testId: string) => {
			const el = document.querySelector(`[data-testid="${testId}"]`);
			return el ? (el.getAttribute('aria-expanded') ?? '?') : 'absent';
		};
		moduleOpen = expanded('module-body');
		instructionsOpen = expanded('module-instructions');
		itemBodyOpen = expanded('item-body-disclosure');
	}

	$effect(() => {
		readProbes();
		const t = setInterval(readProbes, 100);
		return () => clearInterval(t);
	});
</script>

<svelte:head><title>Classroom interaction harness</title></svelte:head>

<div class="cr-root harness">
	<!-- The readout is FIRST in the body but must never be the element
	     `waitForApp` latches onto: it carries no `data-testid` for exactly the
	     reason tools/browser-verify/README.md gives about a zero-box testid
	     early in the body. It always has a box, but the rule is cheap to keep. -->
	<div class="probes" id="probe-panel">
		<span id="probe-focus">focus={focusId}</span>
		<span id="probe-scroll">scrollY={scrollY}</span>
		<span id="probe-module">module={moduleOpen}</span>
		<span id="probe-instructions">instructions={instructionsOpen}</span>
		<span id="probe-itembody">itembody={itemBodyOpen}</span>
	</div>

	<div class="filler" aria-hidden="true">
		<p>
			Page above the assignment, so the document is taller than the viewport and a
			collapse has a scroll position to throw away.
		</p>
	</div>

	<!-- Keyed on the case so switching between them is a clean mount rather than
	     an engine slice swapped under a running component -- the harness is here
	     to measure arrival states, and a half-updated one is not one. -->
	{#key started}
		<ItemDetail section={SECTION} item={ITEM} {engine} {engineTransports} />
	{/key}

	<div class="filler short" aria-hidden="true"><p>End of the harness page.</p></div>
</div>

<style>
	.harness {
		padding: var(--space-4);
	}
	.probes {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		padding: var(--space-2);
		border: 1px solid var(--boundary);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-1);
	}
	.filler {
		min-height: 900px;
		padding: var(--space-4) 0;
		color: var(--text-2);
	}
	.filler.short {
		min-height: 400px;
	}
</style>
