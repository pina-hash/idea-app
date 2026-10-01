<script lang="ts">
	/**
	 * A STUDENT'S WORK ON A PORTED HTML WORKSHEET, AS A GRADER READS IT: the
	 * work column of the grading console for a schema-3 item (0195).
	 *
	 * ONE COMPONENT FOR BOTH CONSOLES (ledger 0298). It was the per-class grade
	 * route's `htmlWork` snippet; the cross-class console at
	 * `/classroom/grading/<item>` handed the console no snippet at all, so a
	 * student who had filled in every block and attached nothing read "Nothing
	 * handed in yet" there while the same console's roster said Complete. Both
	 * routes now mount THIS, so the read-only frame, the lock, the answers a
	 * grader reads when the document cannot be served and the sentence when
	 * there is no document at all are written once and cannot drift apart.
	 *
	 * WHICH ENGINE IS NOT THIS COMPONENT'S DECISION. A route hands the console
	 * this only when `htmlAssignmentMount` is not `spec` (the manifest decides
	 * over a leftover spec, 0134's Surface A); inside, `html` renders the
	 * document and anything else renders the unavailable sentence.
	 *
	 * READ-ONLY IS THE ABSENCE OF A WRITE PATH: no `onchange`, no `onimage`, no
	 * `onimageremove`, no `onimagecaption` is handed down, and `saved` is pinned
	 * null. `readOnly` is passed as well, which is what makes the DOCUMENT stop
	 * accepting input -- a worksheet a grader can type into is a grader editing
	 * a student's answers. `tests/html-assignment-instructor-readonly.test.ts`
	 * sweeps this file for it.
	 */
	import HtmlAssignmentFrame from './HtmlAssignmentFrame.svelte';
	import { hxFrameSeed } from './answers';
	import {
		htmlAnswerSheet,
		htmlAnswerText,
		htmlAssignmentMount,
		htmlAssignmentServed,
		htmlAssignmentSrc,
		htmlFieldToBlockId,
		HTML_ASSIGNMENT_NOT_LIVE,
		HTML_ASSIGNMENT_UNAVAILABLE,
		type HtmlAssignmentData
	} from './mount';
	import type { HtmlAssignmentManifest } from './manifest';
	import { assignmentLockState } from './lock';
	import { htmlManifestShaped } from '$lib/classroom/transports';
	import { itemTitle, type ClassroomItem } from '$lib/classroom/classroom';
	import type { StudentWork } from '$lib/classroom/assignment-spec';

	let {
		student,
		item,
		htmlAssignment,
		sandboxOrigin
	}: {
		student: StudentWork;
		item: ClassroomItem;
		/** What the route's load read through `loadHtmlAssignment`, or null. */
		htmlAssignment: HtmlAssignmentData | null | undefined;
		/** `PUBLIC_HX_SANDBOX_ORIGIN` as the route read it; unset means this host (dev and preview). */
		sandboxOrigin: string | null | undefined;
	} = $props();

	const htmlMount = $derived(htmlAssignmentMount(item, htmlAssignment));

	/**
	 * `manifest` ARRIVES AS `unknown` and is narrowed by the same structural
	 * check the student's item page uses. A blob this cannot map is one no field
	 * map can be built from, so there is nothing a stored answer could be keyed
	 * back to; null is the honest answer and the empty document is what renders.
	 */
	const manifest = $derived(
		htmlAssignment && htmlManifestShaped(htmlAssignment.manifest)
			? (htmlAssignment.manifest as HtmlAssignmentManifest)
			: null
	);

	const htmlSrc = $derived(htmlAssignment ? htmlAssignmentSrc(sandboxOrigin, htmlAssignment.documentId) : '');

	const htmlFields = $derived(htmlFieldToBlockId(htmlAssignment?.manifest ?? null));

	/**
	 * WHETHER `/hx/` WILL ANSWER AT ALL. Only a manager reaches a grading
	 * console, and a manager can open an item that is not live -- so this is
	 * the one surface where the frame is pointed at a document the serving gate
	 * refuses.
	 */
	const served = $derived(htmlAssignmentServed(item));

	/**
	 * A STUDENT'S STORED ROWS AS THE DOCUMENT'S OWN STATE.
	 *
	 * `hxFrameSeed` is the SAME pair of projections the student's item page seeds
	 * `HxAnswers` with, called here rather than re-derived: block id back to
	 * `field` THROUGH THE STORED MANIFEST, a row whose block the manifest no
	 * longer declares dropped rather than guessed at. A second mapping here
	 * would be a grader reading a different answer from the one the student
	 * wrote.
	 *
	 * `StudentWork.responses` is `ResponseRow[]`, which satisfies `HxResponseRow`
	 * structurally -- same `block_id`, a `value` the projection already accepts
	 * as nullable -- so nothing is reshaped on the way in.
	 */
	const seed = $derived(hxFrameSeed(manifest, student.responses, student.files));
</script>

<!--
	THE SAME VIEW WHETHER THE STUDENT IS STILL WORKING OR HAS STOPPED. There is
	no turn-in on a ported assignment -- finishing the work IS the hand-in
	(Mr. Pina, 2026-09-10) -- so there is no submitted state for this to branch
	on and nothing here asks.

	NO `{#key}` OF ITS OWN: `GradingConsole` already keys the work column on
	`selected.email`, which is exactly the move -- N and P to the next student
	tear the frame down and mount a new one, so the document reloads and is
	seeded with the new student's answers rather than keeping the last one's.

	A STUDENT WITH NO ANSWERS GETS THE EMPTY DOCUMENT, not a blank pane and not
	a placeholder. `hxValuesFromResponses` over zero rows is `{}`, which is what
	an untouched worksheet holds, so "has not started" and "started and cleared
	it" read the same because they ARE the same.
-->
{#if htmlMount === 'html' && htmlAssignment && !served}
	<!--
		THE FRAME WOULD 404 AND THE GATE IS NOT LOOSENED. `/hx/<docId>` refuses a
		document whose item is not live, so mounting the frame here would draw an
		empty box rather than a worksheet -- and that gate is not loosenable from
		any side: the route answers on a host holding no session, so publication
		status IS its whole authorization.

		BUT THE SENTENCE IS NO LONGER THE ONLY THING HERE, AND THAT WAS THE
		DEFECT. Mr. Pina graded an unpublished item and got a paragraph about
		publishing where a student's answers belong -- answers that were in
		`classroom_responses` the whole time, and are already here in `seed`. So
		the notice keeps its place and the WORK is printed under it: same seed,
		same field map, same manifest, grouped the way the manifest groups its
		blocks.

		IT IS THE ANSWERS AND NOT THE DOCUMENT, and it says so. A grader who needs
		the page as the student saw it publishes the item, which is exactly what
		the notice above tells them to do.
	-->
	{@const sheet = htmlAnswerSheet(htmlAssignment.manifest, seed.values, seed.images)}
	<p class="note card" data-testid="html-work-not-live">{HTML_ASSIGNMENT_NOT_LIVE}</p>
	{#if sheet.length}
		<div class="answers card" data-testid="answers-without-document">
			<p class="answers-label">
				What {student.displayName} has written, read straight from their saved work
			</p>
			{#each sheet as group (group.moduleId ?? 'header')}
				<section class="answers-group">
					<h3 class="answers-group-head">{group.title}</h3>
					<dl class="answers-list">
						{#each group.cells as cell (cell.blockId)}
							{@const text = htmlAnswerText(cell.value)}
							<dt class="answers-field">{cell.field}</dt>
							<dd class="answers-value" class:empty={text === null || text === ''}>
								<!-- A BLOCK THE STUDENT LEFT ALONE SAYS SO, and it is a
								     different sentence from one they opened and cleared:
								     "skipped question 4" and "question 4 is not on this
								     worksheet" are what a grader is telling apart here, so
								     an empty block is reported rather than dropped. -->
								{#if text === null}
									<span class="answers-none">No answer saved</span>
								{:else if text === ''}
									<span class="answers-none">Left blank</span>
								{:else}
									{text}
								{/if}
								{#if cell.image}
									<span class="answers-image" data-testid="answers-image">
										Photo: {cell.image.name}{cell.image.caption ? ` -- ${cell.image.caption}` : ''}
									</span>
								{/if}
							</dd>
						{/each}
					</dl>
				</section>
			{/each}
		</div>
	{/if}
{:else if htmlMount === 'html' && htmlAssignment}
	<!--
		THE LOCK IS SHOWN HERE TOO, and it is not decoration on a pane that is
		already read-only. A grader looking at a worksheet needs to know whether
		the student could still be editing it: "this is what they have so far" and
		"this is final, I closed it" are different things to be reading, and the
		frame is where the work is.
	-->
	<HtmlAssignmentFrame
		src={htmlSrc}
		title={itemTitle(item)}
		fieldToBlockId={htmlFields}
		values={seed.values}
		images={seed.images}
		saved={null}
		lock={assignmentLockState(student.submission)}
		readOnly
	/>
{:else}
	<!-- THE THIRD ANSWER, and it is the manager's version of the student's.
	     This item IS a ported document and there is nothing to point the frame
	     at. Saying so is the difference between a rule and a defect: an empty
	     pane where a hand-in belongs reads as lost work. -->
	<p class="note card" data-testid="html-work-unavailable">{HTML_ASSIGNMENT_UNAVAILABLE}</p>
{/if}

<style>
	.note {
		color: var(--text-2);
		margin: 0;
	}
	.answers {
		margin: var(--space-2) 0 0;
	}
	.answers-label {
		margin: 0 0 var(--space-2);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-2);
	}
	.answers-group + .answers-group {
		margin-top: var(--space-3);
	}
	.answers-group-head {
		margin: 0 0 var(--space-2);
		font-size: 0.8rem;
		font-family: var(--font-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	/* TWO COLUMNS ABOVE A NARROW PANE AND ONE BELOW IT, from the content rather
	   than from a round number: a `field` is one hyphenated token and the answer
	   beside it is a sentence or a paragraph, so the label column is sized to the
	   longest token and the value takes the rest. `minmax(0, 1fr)` on the value so
	   a long unbroken string cannot push the pane wider than the column. */
	.answers-list {
		display: grid;
		grid-template-columns: minmax(0, max-content) minmax(0, 1fr);
		gap: var(--space-1) var(--space-2);
		margin: 0;
	}
	@media (max-width: 40rem) {
		.answers-list {
			grid-template-columns: minmax(0, 1fr);
			gap: 0 0;
		}
		.answers-field {
			margin-top: var(--space-2);
		}
	}
	.answers-field {
		margin: 0;
		min-width: 0;
		overflow-wrap: anywhere;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2);
	}
	.answers-value {
		margin: 0;
		min-width: 0;
		/* THE STUDENT'S OWN LINE BREAKS SURVIVE. A long-answer block is stored as
		   typed, and collapsing it to one paragraph is a grader reading something
		   the student did not write. */
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font-size: 0.82rem;
		line-height: 1.5;
		color: var(--text-1);
	}
	/* NOT COLOUR ALONE and not below the text threshold: an unanswered block is a
	   WORD ("No answer saved"), and this only tilts the tier it is read at. */
	.answers-none {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2);
	}
	.answers-image {
		display: block;
		margin-top: var(--space-1);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2);
	}
</style>
