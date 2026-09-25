<script lang="ts">
	import { env as publicEnv } from '$env/dynamic/public';
	import GradingConsole from '$lib/classroom/GradingConsole.svelte';
	import HtmlGradingWork from '$lib/classroom/html-assignment/HtmlGradingWork.svelte';
	import { htmlAssignmentMount } from '$lib/classroom/html-assignment/mount';
	import type { HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';
	import {
		createBatchGradingTransports,
		createTeacherEngineTransports,
		htmlManifestShaped
	} from '$lib/classroom/transports';
	import { createClassroomLive } from '$lib/classroom/live';
	import { createPresenceTransports } from '$lib/classroom/presence/transports';
	import { createBulkFileSource } from '$lib/classroom/bulk-download-source';
	import { blockLabelsFromManifest, blockLabelsFromSpec } from '$lib/classroom/bulk-download';
	import type { StudentWork } from '$lib/classroom/assignment-spec';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// One stable client for the session (the item page's convention).
	// svelte-ignore state_referenced_locally
	const transports = createTeacherEngineTransports(data.supabase);
	/**
	 * BATCH GRADING ON THIS ROUTE (0288), AND DELIBERATELY NOT THE CROSS-CLASS
	 * READ.
	 *
	 * Mr. Pina: "I must be able to quick return a zero or incomplete
	 * assignments." Every piece of that already existed -- the tick boxes, the
	 * presets, the plan, the one-statement commit (0175) -- and none of it was
	 * reachable HERE, because the only prop that switched it on also swapped
	 * this page's one class for every class he teaches the assignment in.
	 *
	 * `createBatchGradingTransports` is `createBulkGradingTransports` without
	 * `loadAcross`, so this console keeps reading its own section through
	 * `transports.loadGrading(item.id, section.id)` and gains the batch bar over
	 * the roster it already had. The roster stays ungrouped, no section labels
	 * appear, presence stays scoped to this section, and the link to the
	 * cross-class console stays exactly where it was -- all four of those hang
	 * off the METHOD rather than the object, which is the point of the split.
	 */
	// svelte-ignore state_referenced_locally
	const batch = createBatchGradingTransports(data.supabase);

	/**
	 * THE LIVE BUS, BUILT ONCE BESIDE THE TRANSPORTS AND FOR THE SAME REASON.
	 *
	 * `createClassroomLive` holds one channel per section, reference counted, so
	 * it has to be the session's one instance rather than something a derived
	 * rebuilds -- a second bus would open a second socket channel and leave the
	 * first one joined with nobody listening.
	 *
	 * The console POLLS whether or not this exists; what the bus buys is that a
	 * student finishing a worksheet shows up here without a reload. Nothing is
	 * announced FROM this page: an instructor grading does not change a
	 * student's answers, and the one thing this page does write -- a close -- is
	 * something every open copy of this console learns from its own next read.
	 */
	// svelte-ignore state_referenced_locally
	const live = createClassroomLive(data.supabase);

	/**
	 * WHO IS ACTUALLY WORKING (0200), BUILT ONCE BESIDE THE OTHER TWO.
	 *
	 * The console's own read: one call per 30 seconds for the section on screen,
	 * answering the four states, when each student last worked and how long each
	 * has actually worked. It is handed UNCONDITIONALLY -- on a deployment where
	 * `0200` has not been applied the RPC does not exist, the transport's own
	 * `PGRST202` rung answers null, and the console renders no presence region
	 * rather than an empty one. That is the ladder rule, and the reason the
	 * degrade lives in the transport rather than in a flag here: two spellings of
	 * "does this deployment have presence" is how a surface comes to draw a
	 * region it cannot fill.
	 *
	 * NOTHING IS ANNOUNCED FROM THIS PAGE. An instructor reading a roster changes
	 * no student's presence, and the one thing presence cannot be told about --
	 * somebody closing the tab -- is precisely why the poll carries this feature
	 * rather than the notice.
	 */
	// svelte-ignore state_referenced_locally
	const presence = createPresenceTransports(data.supabase, data.item.id);

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

	/**
	 * "DOWNLOAD ALL FILES" (ledger 0298). The bytes come off the teacher's own
	 * browser client; the only thing this page adds is what each block is
	 * CALLED, from the same engine decision the work column takes -- the
	 * manifest for a ported document, the spec otherwise. A block neither names
	 * still exports, under its id.
	 */
	const fileDownload = $derived(
		createBulkFileSource(
			data.supabase,
			htmlMount === 'spec' ? blockLabelsFromSpec(data.spec) : blockLabelsFromManifest(manifest)
		)
	);
</script>

<GradingConsole
	section={data.section}
	item={data.item}
	spec={htmlMount === 'spec' ? data.spec : null}
	rubric={data.rubric}
	{transports}
	bulk={batch}
	{live}
	{presence}
	close={transports.closeAssignment}
	htmlWork={htmlMount === 'spec' ? null : htmlWork}
	manifest={htmlMount === 'html' ? manifest : null}
	{fileDownload}
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
		THE STUDENT'S WORK, IN THE DOCUMENT THEY DID IT IN: the read-only frame,
		or the answers when the item is not live, or the sentence when there is
		no document. ONE COMPONENT, mounted by the cross-class console at
		`/classroom/grading/<item>` too (ledger 0298), so the two cannot drift.
	-->
	<HtmlGradingWork
		{student}
		item={data.item}
		htmlAssignment={data.htmlAssignment}
		sandboxOrigin={publicEnv.PUBLIC_HX_SANDBOX_ORIGIN}
	/>
{/snippet}
