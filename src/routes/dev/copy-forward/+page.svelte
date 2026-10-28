<script lang="ts">
	import '$lib/classroom/classroom.css';
	import { CLASSROOM_PLATE } from '$lib/classroom/plate';
	/**
	 * COPY POSTS TO ANOTHER CLASS, in a real browser, without a session (ledger
	 * 0455). Mounts the IDENTICAL `CopyForwardPanel` the class page mounts, over
	 * stand-in transports that answer in exactly the shape 0318's
	 * `classroom_copy_forward_preview` and `classroom_copy_forward` answer: the
	 * IDEA100 Section 2 rotation as it stood on 2026-10-28, copied into Section 3
	 * starting Thu 2026-10-29. The new dates in the stand-in are ILLUSTRATIVE,
	 * typed by hand to fill the table the way a real plan does; the date rule
	 * itself is proven against real Postgres in
	 * `tests/db/rotation-copy-forward-0318.test.ts`, never here.
	 *
	 *   ?refuse=unavailable|refused        the preview refuses, as a deployment
	 *                                      without 0318 or a non-teacher would
	 */
	import { page } from '$app/state';
	import CopyForwardPanel from '$lib/classroom/CopyForwardPanel.svelte';
	import { copyRefusal, parseCopyPlan, type CopyForwardTransports } from '$lib/classroom/copy-forward';
	import type { ClassroomSection } from '$lib/classroom/classroom';

	const course = { id: 'c-idea100', code: 'IDEA 100', title: 'Engineering Foundations', active: true };
	const section: ClassroomSection = {
		id: 's2', course_id: course.id, label: 'Section 2', block: 'Block 1', teacher_email: 'apina@boscotech.edu', active: true, course
	};
	const sections: ClassroomSection[] = [
		section,
		{ id: 's3', course_id: course.id, label: 'Section 3', block: 'Block 1', teacher_email: 'apina@boscotech.edu', active: true, course },
		{ id: 's1', course_id: course.id, label: 'Section 1', block: 'Block 1', teacher_email: 'apina@boscotech.edu', active: false, course }
	];

	const PLAN = {
		ok: true,
		from: { id: 's2', label: 'Section 2', first_day: '2026-09-24' },
		to: { id: 's3', label: 'Section 3', first_day: '2026-10-29' },
		counts: { copy: 10, share: 1, skip: 1 },
		posts: [
			{ id: 'p1', title: 'IDEA 100 Syllabus', kind: 'material', action: 'already_there', draft: false, live: true, classes: ['Section 2', 'Section 3'], old_due: null, new_due: null, pacing_steps: 0, checkpoints: 0 },
			{ id: 'p2', title: 'IDEA Mascot Pack', kind: 'material', action: 'share', draft: false, live: true, classes: ['Section 2', 'Block 2', 'Block 3'], old_due: null, new_due: null, pacing_steps: 0, checkpoints: 0 },
			{ id: 'p3', title: 'Links', kind: 'material', action: 'copy', draft: false, live: true, classes: ['Section 2'], old_due: null, new_due: null, pacing_steps: 0, checkpoints: 0 },
			{ id: 'p4', title: 'DOGTAG', kind: 'assignment', action: 'copy', draft: false, live: true, classes: ['Section 2'], old_due: '2026-09-26T06:59:00+00:00', new_due: '2026-10-31T06:59:00+00:00', pacing_steps: 1, checkpoints: 0 },
			{ id: 'p5', title: 'Hook 01 - Research and Concepts', kind: 'assignment', action: 'copy', draft: false, live: true, classes: ['Section 2'], old_due: '2026-09-29T06:59:00+00:00', new_due: '2026-11-04T07:59:00+00:00', pacing_steps: 2, checkpoints: 0 },
			{ id: 'p6', title: 'Solidworks Day', kind: 'assignment', action: 'copy', draft: false, live: true, classes: ['Section 2'], old_due: '2026-10-01T06:59:00+00:00', new_due: '2026-11-06T07:59:00+00:00', pacing_steps: 1, checkpoints: 0 },
			{ id: 'p7', title: 'Hook 02 - V1, Print and Pull', kind: 'assignment', action: 'copy', draft: false, live: true, classes: ['Section 2'], old_due: '2026-10-03T06:59:00+00:00', new_due: '2026-11-07T07:59:00+00:00', pacing_steps: 3, checkpoints: 0 },
			{ id: 'p8', title: 'Hook 03 - V2 to the Tournament', kind: 'assignment', action: 'copy', draft: false, live: true, classes: ['Section 2'], old_due: '2026-10-15T06:59:00+00:00', new_due: '2026-11-19T07:59:00+00:00', pacing_steps: 4, checkpoints: 0 },
			{ id: 'p9', title: 'IDEA-Blade 01 - Design', kind: 'assignment', action: 'copy', draft: false, live: true, classes: ['Section 2'], old_due: '2026-10-23T06:59:00+00:00', new_due: '2026-12-02T07:59:00+00:00', pacing_steps: 4, checkpoints: 2 },
			{ id: 'p10', title: 'IDEA-Blade 02 - Build and Fight', kind: 'assignment', action: 'copy', draft: false, live: true, classes: ['Section 2'], old_due: '2026-10-29T06:59:00+00:00', new_due: '2026-12-08T07:59:00+00:00', pacing_steps: 5, checkpoints: 1 },
			{ id: 'p11', title: 'ROTATION 2 | SURVEY', kind: 'assignment', action: 'copy', draft: false, live: true, classes: ['Section 2'], old_due: '2026-10-29T06:59:00+00:00', new_due: '2026-12-08T07:59:00+00:00', pacing_steps: 0, checkpoints: 0 },
			{ id: 'p12', title: 'Rotation 3 notes', kind: 'post', action: 'copy', draft: true, live: false, classes: ['Section 2'], old_due: null, new_due: null, pacing_steps: 0, checkpoints: 0 }
		]
	};

	const refuse = page.url.searchParams.get('refuse');
	let calls = $state<string[]>([]);

	const transports: CopyForwardTransports = {
		async preview(toSection, firstDay, fromFirstDay) {
			calls = [...calls, `preview ${toSection} ${firstDay} ${fromFirstDay ?? 'null'}`];
			if (refuse) return { ok: false, reason: refuse, message: copyRefusal(refuse) };
			return parseCopyPlan(PLAN);
		},
		async copy(toSection, firstDay, fromFirstDay, itemIds, publish) {
			calls = [...calls, `copy ${toSection} ${firstDay} ${fromFirstDay ?? 'null'} ${itemIds ? itemIds.length : 'all'} publish=${publish}`];
			return { ok: true, copied: PLAN.counts.copy, shared: PLAN.counts.share, skipped: PLAN.counts.skip };
		}
	};
</script>

<svelte:head><title>Copy forward harness</title></svelte:head>

<div class="harness">
	<h1>Copy posts to another class</h1>
	<p class="readout" data-testid="harness-calls">{calls.join(' | ') || 'no calls'}</p>
	<div class="mount cr-root {CLASSROOM_PLATE}">
		<section class="card">
			<CopyForwardPanel {section} {sections} {transports} onclose={() => {}} />
		</section>
	</div>
</div>

<style>
	.harness {
		padding: 1rem;
		max-width: 92rem;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	h1 {
		font-family: var(--font-display);
		color: var(--text-1);
		margin: 0;
		font-size: 1.5rem;
	}
	.readout {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-2);
		margin: 0;
		overflow-wrap: anywhere;
	}
</style>
