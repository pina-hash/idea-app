<script lang="ts">
	import '$lib/classroom/classroom.css';
	import SpecImporter from '$lib/classroom/SpecImporter.svelte';
	import type { AssignmentSpec, AssignmentTeacherTransports } from '$lib/classroom/assignment-spec';
	import type { ReferenceSpec, ReferenceTransports } from '$lib/classroom/reference-spec';
	import { page } from '$app/state';

	/**
	 * THE SPEC IMPORTER, MOUNTED FOR REAL, in the four shapes it ships in.
	 *
	 * WHY THIS EXISTS. Until this bundle nothing in this repo drove SpecImporter
	 * in a browser at all: every surface that mounts it sits behind a Google
	 * sign-in no automated run holds, so the JSON viewer, the copy control and
	 * the seeded editor had no way to be measured. The component here is the
	 * REAL one -- not a copy of its markup -- against in-memory transports, so
	 * every interaction is the shipping one and only the server is fake.
	 *
	 * THE FOUR CASES ARE THE FOUR MOUNTS THAT MATTER:
	 *   assignment  an item with an interactive spec attached
	 *   reference   a material with a reference document attached
	 *   none        an item with nothing attached (the import-from-nothing path)
	 *   staging     the composer's mount: `itemId` null, JSON handed back
	 *               through `onstage`, no transports at all
	 *
	 * `?case=` picks one; the default renders all four stacked. One case at a
	 * time is what a route spec wants (a global selector counts once rather than
	 * four times); all four at once is what a person comparing them wants.
	 *
	 * THE WRITE LOG IS THE INSTRUMENT, not decoration. The republish guard is an
	 * ABSENCE -- a press that must not reach the server -- and an absence
	 * verified by "nothing looked different" is not verified. Every transport
	 * call increments a counter that is on the page, so a guard that stopped
	 * guarding shows up as a number going to 1.
	 */

	type CaseId = 'assignment' | 'reference' | 'none' | 'staging';
	const ALL: CaseId[] = ['assignment', 'reference', 'none', 'staging'];

	const requested = $derived(page.url.searchParams.get('case'));
	const shownCases = $derived<CaseId[]>(
		ALL.includes(requested as CaseId) ? [requested as CaseId] : ALL
	);

	/**
	 * REAL SPECS: each one passes the shipping validator. A harness whose
	 * "attached" document does not actually validate would make the seeded
	 * editor report problems that have nothing to do with the seeding, and the
	 * one thing this harness exists to measure is that a seeded box comes up
	 * valid with no keystroke.
	 */
	const ASSIGNMENT_SPEC = {
		schemaVersion: 1,
		meta: {
			assignmentId: 'idea209h-bridge-stackup',
			title: 'Bridge stackup',
			totalPoints: 20
		},
		modules: [
			{
				id: 'measure',
				title: 'Measure the span',
				points: 12,
				aiLevel: 1,
				blocks: [
					{ type: 'instructions', content: 'Measure the span at three points and record each.' },
					{
						id: 'span-notes',
						type: 'textField',
						prompt: 'What did you measure, and where?',
						minSentences: 2,
						maxSentences: 5
					},
					{
						id: 'span-table',
						type: 'table',
						prompt: 'Readings',
						minRows: 3,
						columns: [
							{ key: 'point', label: 'Point' },
							{ key: 'mm', label: 'Reading (mm)' }
						]
					}
				],
				rubric: [
					{
						id: 'accuracy',
						criterion: 'Accuracy',
						levels: [
							{ label: 'Full', points: 12, descriptor: 'Every reading within tolerance.' },
							{ label: 'Partial', points: 7, descriptor: 'Most readings within tolerance.' },
							{ label: 'None', points: 0, descriptor: 'Not attempted.' }
						]
					}
				]
			},
			{
				id: 'conclude',
				title: 'Draw a conclusion',
				points: 8,
				blocks: [
					{ type: 'instructions', content: 'Say what the stackup means for the build.' },
					{
						id: 'conclusion',
						type: 'textField',
						prompt: 'What does the stackup mean?',
						minSentences: 3
					}
				],
				rubric: [
					{
						id: 'reasoning',
						criterion: 'Reasoning',
						levels: [
							{ label: 'Full', points: 8, descriptor: 'Conclusion follows from the data.' },
							{ label: 'Partial', points: 5, descriptor: 'Partly supported.' },
							{ label: 'None', points: 0, descriptor: 'Not attempted.' }
						]
					}
				]
			}
		]
	} as unknown as AssignmentSpec;

	const REFERENCE_SPEC = {
		schemaVersion: 2,
		kind: 'reference',
		meta: { referenceId: 'idea209h-syllabus', title: 'IDEA209H syllabus' },
		navigation: 'tabs',
		sections: [
			{
				slug: 'grading',
				title: 'Grading',
				blocks: [
					{
						type: 'instructions',
						content: 'Work is graded against the rubric on each assignment.'
					},
					{
						type: 'keyValue',
						items: [
							{ label: 'Labs', value: '40%' },
							{ label: 'Documentation', value: '25%' }
						]
					}
				]
			},
			{
				slug: 'materials',
				title: 'Materials',
				blocks: [
					{
						type: 'callout',
						variant: 'required',
						title: 'Bring these',
						content: 'A 150mm caliper and a bound notebook.'
					}
				]
			}
		]
	} as unknown as ReferenceSpec;

	/** Every transport call, so an absence can be measured rather than assumed. */
	let writes = $state<string[]>([]);
	const record = (what: string) => {
		writes = [...writes, `${writes.length + 1}. ${what}`];
	};

	let attachedAssignment = $state<AssignmentSpec | null>(ASSIGNMENT_SPEC);
	let attachedReference = $state<ReferenceSpec | null>(REFERENCE_SPEC);
	let stagedSpec = $state<AssignmentSpec | null>(null);

	const teacherTransports = {
		async setSpec(itemId: string, spec: AssignmentSpec | null) {
			record(`setSpec(${itemId}, ${spec ? `"${spec.meta?.title}"` : 'null'})`);
			attachedAssignment = spec;
			return { ok: true as const, data: undefined };
		},
		async setRubric() {
			record('setRubric');
			return { ok: true as const, data: undefined };
		}
	} as unknown as AssignmentTeacherTransports;

	const referenceTransports = {
		async setReferenceSpec(itemId: string, spec: ReferenceSpec | null) {
			record(`setReferenceSpec(${itemId}, ${spec ? `"${spec.meta?.title}"` : 'null'})`);
			attachedReference = spec;
			return { ok: true as const, data: undefined };
		},
		async setPublic(itemId: string, next: boolean) {
			record(`setPublic(${itemId}, ${next})`);
			return { ok: true as const, data: { is_public: next } };
		}
	} as unknown as ReferenceTransports;

	const emptyTransports = {
		async setSpec(itemId: string, spec: AssignmentSpec | null) {
			record(`setSpec(${itemId}, ${spec ? `"${spec.meta?.title}"` : 'null'})`);
			return { ok: true as const, data: undefined };
		}
	} as unknown as AssignmentTeacherTransports;
</script>

<svelte:head><title>dev: spec importer</title></svelte:head>

<div class="cr-root harness">
	<header class="head">
		<h1>Spec importer</h1>
		<p class="note">
			The real component, four mounts, in-memory transports. Case:
			<code>{requested ?? 'all'}</code>. Add <code>?case=assignment</code>,
			<code>?case=reference</code>, <code>?case=none</code> or <code>?case=staging</code>.
		</p>
		<p class="writes" data-testid="write-count" data-writes={writes.length}>
			Transport calls: <strong>{writes.length}</strong>
		</p>
		{#if writes.length}
			<ul class="write-log" data-testid="write-log">
				{#each writes as w, i (i)}<li>{w}</li>{/each}
			</ul>
		{/if}
		<button type="button" class="btn secondary tiny" onclick={() => (writes = [])}>
			Reset log
		</button>
	</header>

	{#each shownCases as id (id)}
		<section class="case" data-case={id}>
			<h2>
				{#if id === 'assignment'}Assignment spec attached{/if}
				{#if id === 'reference'}Reference document attached{/if}
				{#if id === 'none'}Nothing attached{/if}
				{#if id === 'staging'}Staging mode (itemId null){/if}
			</h2>
			<div class="insp-block">
				{#if id === 'assignment'}
					<SpecImporter
						kind="assignment"
						itemId="i-assignment"
						spec={attachedAssignment}
						transports={teacherTransports}
						onchanged={() => record('onchanged')}
					/>
				{:else if id === 'reference'}
					<SpecImporter
						kind="reference"
						itemId="i-reference"
						spec={attachedReference}
						isPublic={false}
						attachmentCount={2}
						transports={referenceTransports}
						onchanged={() => record('onchanged')}
					/>
				{:else if id === 'none'}
					<SpecImporter
						kind="assignment"
						itemId="i-empty"
						spec={null}
						transports={emptyTransports}
						onchanged={() => record('onchanged')}
					/>
				{:else}
					<!-- The composer's own mount: no itemId, no transports, JSON back
					     through `onstage`. Nothing here may reach a server. -->
					<SpecImporter
						kind="assignment"
						itemId={null}
						staged={stagedSpec}
						onstage={(value) => {
							record(`onstage(${value ? 'spec' : 'null'})`);
							stagedSpec = value as AssignmentSpec | null;
						}}
					/>
				{/if}
			</div>
		</section>
	{/each}
</div>

<style>
	.harness {
		padding: 1rem;
		max-width: 60rem;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		align-items: flex-start;
	}
	h1 {
		margin: 0;
		font-size: 1.1rem;
	}
	h2 {
		margin: 0 0 0.5rem;
		font-size: 0.9rem;
	}
	.writes {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-2);
	}
	.write-log {
		margin: 0;
		padding-left: 1.1rem;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2);
	}
	.case {
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		padding: 0.75rem;
		min-width: 0;
	}
	.insp-block {
		min-width: 0;
	}
</style>
