<script lang="ts">
	import { env as publicEnv } from '$env/dynamic/public';
	import GradingConsole from '$lib/classroom/GradingConsole.svelte';
	import HtmlAssignmentFrame from '$lib/classroom/html-assignment/HtmlAssignmentFrame.svelte';
	import { hxFrameSeed } from '$lib/classroom/html-assignment/answers';
	import {
		htmlAssignmentMount,
		htmlAssignmentServed,
		htmlAssignmentSrc,
		htmlFieldToBlockId,
		HTML_ASSIGNMENT_NOT_LIVE,
		HTML_ASSIGNMENT_UNAVAILABLE
	} from '$lib/classroom/html-assignment/mount';
	import type { HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';
	import { createTeacherEngineTransports, htmlManifestShaped } from '$lib/classroom/transports';
	import { itemTitle } from '$lib/classroom/classroom';
	import type { StudentWork } from '$lib/classroom/assignment-spec';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// One stable client for the session (the item page's convention).
	// svelte-ignore state_referenced_locally
	const transports = createTeacherEngineTransports(data.supabase);

	/**
	 * WHICH ENGINE THIS ITEM IS, asked with `htmlAssignmentMount` and not with
	 * `spec === null`. Two spellings of "is this a ported document" is how a
	 * student gets a worksheet and an instructor gets a blank panel -- which is
	 * the defect this page HAD, from the other end: the load never asked, so the
	 * work column fell through every branch and rendered nothing at all.
	 */
	const htmlMount = $derived(htmlAssignmentMount(data.item, data.htmlAssignment));

	/**
	 * `manifest` ARRIVES AS `unknown` and is narrowed by the same structural
	 * check the student's item page uses. A blob this cannot map is one no field
	 * map can be built from, so there is nothing a stored answer could be keyed
	 * back to; null is the honest answer and the empty document is what renders.
	 */
	const manifest = $derived(
		data.htmlAssignment && htmlManifestShaped(data.htmlAssignment.manifest)
			? (data.htmlAssignment.manifest as HtmlAssignmentManifest)
			: null
	);

	const htmlSrc = $derived(
		data.htmlAssignment
			? htmlAssignmentSrc(publicEnv.PUBLIC_HX_SANDBOX_ORIGIN, data.htmlAssignment.documentId)
			: ''
	);

	const htmlFields = $derived(htmlFieldToBlockId(data.htmlAssignment?.manifest ?? null));

	/**
	 * WHETHER `/hx/` WILL ANSWER AT ALL. Only a manager reaches this page, and a
	 * manager can open an item that is not live -- so this is the one surface
	 * where the frame is pointed at a document the serving gate refuses.
	 */
	const served = $derived(htmlAssignmentServed(data.item));

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
	function seedFor(student: StudentWork) {
		return hxFrameSeed(manifest, student.responses, student.files);
	}
</script>

<GradingConsole
	section={data.section}
	item={data.item}
	spec={htmlMount === 'spec' ? data.spec : null}
	rubric={data.rubric}
	{transports}
	htmlWork={htmlMount === 'spec' ? null : htmlWork}
/>

<!--
	THE TWO PROPS ARE ONE DECISION, READ OFF ONE EXPRESSION, AND THAT IS 0134'S
	SURFACE A BUG ANSWERED.

	A schema-3 item may carry a leftover `classroom_assignment_specs` row from
	before its conversion -- carrying BOTH is a legal state, and CLAUDE.md's rule
	is that the MANIFEST decides, which is the order every rendering surface
	already takes. `GradingConsole`'s work column branches `{#if spec}` FIRST, so
	handing it a stale spec beside the document would render the superseded
	engine HERE while the student's own item page renders the document: an item
	that renders one thing and is graded against another.

	`spec = null` IS A PORTED ASSIGNMENT'S NORMAL STATE, not a degraded one --
	`levelShort` answers from the manifest level's own `short`, the unmet list is
	empty because there is no spec to check against, and the approval gate does
	not render. That is what the console was built for in 0195.
-->

{#snippet htmlWork(student: StudentWork)}
	<!--
		THE STUDENT'S WORK, IN THE DOCUMENT THEY DID IT IN.

		THE SAME COMPONENT THE STUDENT MOUNTED, READ-ONLY, and read-only is the
		ABSENCE of a write path rather than a flag: no `onchange`, no `onimage`,
		no `onimageremove`, no `onimagecaption` is handed down, so there is no
		write to execute. `readOnly` is passed as well, which is what makes the
		DOCUMENT itself stop accepting input -- a worksheet a grader can type
		into is a grader editing a student's answers.

		THE SAME VIEW WHETHER THE STUDENT IS STILL WORKING OR HAS STOPPED. There
		is no turn-in on a ported assignment -- finishing the work IS the hand-in
		(Mr. Pina, 2026-09-10) -- so there is no submitted state for this to
		branch on and nothing here asks.

		NO `{#key}` OF ITS OWN: `GradingConsole` already keys this snippet on
		`selected.email`, which is exactly the move -- N and P to the next student
		tear the frame down and mount a new one, so the document reloads and is
		seeded with the new student's answers rather than keeping the last one's.

		A STUDENT WITH NO ANSWERS GETS THE EMPTY DOCUMENT, not a blank pane and
		not a placeholder. `hxValuesFromResponses` over zero rows is `{}`, which
		is what an untouched worksheet holds, so "has not started" and "started
		and cleared it" read the same because they ARE the same.
	-->
	{#if htmlMount === 'html' && data.htmlAssignment && !served}
		<!-- THE FRAME WOULD 404 AND THE GATE IS NOT LOOSENED. `/hx/<docId>`
		     refuses a document whose item is not live, so mounting the frame here
		     would draw an empty box on the one surface where a teacher is
		     deciding whether to publish. -->
		<p class="note card">{HTML_ASSIGNMENT_NOT_LIVE}</p>
	{:else if htmlMount === 'html' && data.htmlAssignment}
		{@const seed = seedFor(student)}
		<HtmlAssignmentFrame
			src={htmlSrc}
			title={itemTitle(data.item)}
			fieldToBlockId={htmlFields}
			values={seed.values}
			images={seed.images}
			saved={null}
			readOnly
		/>
	{:else}
		<!-- THE THIRD ANSWER, and it is the manager's version of the student's.
		     This item IS a ported document and there is nothing to point the
		     frame at. Saying so is the difference between a rule and a defect:
		     an empty pane where a hand-in belongs reads as lost work. -->
		<p class="note card">{HTML_ASSIGNMENT_UNAVAILABLE}</p>
	{/if}
{/snippet}

<style>
	.note {
		color: var(--text-2);
		margin: 0;
	}
</style>
