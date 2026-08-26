<script lang="ts">
	import '$lib/classroom/classroom.css';
	import SpecRenderer from '$lib/classroom/SpecRenderer.svelte';
	import type { AssignmentSpec, ResponseValue } from '$lib/classroom/assignment-spec';
	import { page } from '$app/state';

	/**
	 * See +page.ts. Two mounts of the REAL renderer over ONE set of values:
	 * read-only (what a submitted hand-in shows) and editable.
	 */

	/** The control: `?dirty=1` prefixes every option-set value with a tab. */
	const dirty = $derived(page.url.searchParams.get('dirty') === '1');

	const MATERIALS = [
		'ASTM 1018 steel',
		'304 stainless',
		'ASTM B16 brass',
		'Ti-6Al-4V titanium'
	];

	const SPEC: AssignmentSpec = {
		schemaVersion: 1,
		meta: { assignmentId: 'harness-table', title: 'Density and material ID', totalPoints: 20 },
		modules: [
			{
				id: 'm1',
				title: 'Sample log',
				points: 10,
				blocks: [
					{
						type: 'table',
						id: 't1',
						points: 10,
						// Five columns, two of them the fixed-option kind a lab uses
						// for a material call. In this schema a column is
						// {key,label,tip} and NOTHING else, so these two are
						// declared exactly as the free-text three are.
						columns: [
							{ key: 'sample', label: 'Sample' },
							{ key: 'material', label: 'Material (candidate)', tip: 'One of the six candidates.' },
							{ key: 'confirm', label: 'Confirmed as', tip: 'One of the six candidates.' },
							{ key: 'mass', label: 'Mass (g)' },
							{ key: 'notes', label: 'Notes' }
						],
						minRows: 4
					}
				]
			},
			{
				id: 'm2',
				title: 'Conclusion',
				points: 10,
				blocks: [
					{
						type: 'textField',
						id: 'f1',
						prompt: 'Explain how your measured densities support each material call.',
						minSentences: 3,
						points: 10
					},
					{ type: 'checklist', id: 'c1', items: ['Bench cleared', 'Scale zeroed'] }
				]
			}
		]
	};

	const LONG = Array.from(
		{ length: 26 },
		(_, i) =>
			`Sentence ${i + 1}: the measured density for this sample sat close to the published value once the displacement reading was corrected for the meniscus, which is why the material call holds.`
	).join(' ');

	function seed(): Record<string, ResponseValue> {
		const pad = dirty ? '\t' : '';
		return {
			t1: {
				rows: MATERIALS.map((m, i) => ({
					sample: `B-${i + 1}`,
					material: pad + m,
					confirm: pad + m,
					mass: `${(18.24 + i * 3.1).toFixed(2)}`,
					notes: i === 0 ? 'Displacement reading repeated twice for this one.' : 'Dimensional.'
				}))
			},
			f1: { text: LONG },
			c1: { checked: [true, false] }
		};
	}

	const values = $derived(seed());
</script>

<svelte:head><title>dev / spec table</title></svelte:head>

<div class="cr-root harness">
	<h1>Spec table + textarea harness</h1>
	<p class="hint">
		dirty={String(dirty)} — add <code>?dirty=1</code> for the leading-whitespace control.
	</p>

	<h2>Read-only (submitted: locked, no transports)</h2>
	<div data-testid="ro">
		{#key dirty}
			<SpecRenderer spec={SPEC} initialValues={values} locked approved fileNotice="No files here." />
		{/key}
	</div>

	<h2>Editable</h2>
	<div data-testid="ed">
		{#key dirty}
			<SpecRenderer spec={SPEC} initialValues={values} approved fileNotice="No files here." />
		{/key}
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
</style>
