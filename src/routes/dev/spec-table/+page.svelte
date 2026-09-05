<script lang="ts">
	import '$lib/classroom/classroom.css';
	import SpecRenderer from '$lib/classroom/SpecRenderer.svelte';
	import type { AssignmentSpec, ResponseValue } from '$lib/classroom/assignment-spec';
	import { page } from '$app/state';

	/**
	 * See +page.ts. Two mounts of the REAL renderer over ONE set of values:
	 * read-only (what a submitted hand-in shows) and editable.
	 */

	/**
	 * The control. `?dirty=1` swaps in four distinct whitespace defects, one
	 * per row, so the leading-box vs stored-whitespace question from item 1
	 * and the trim-on-read/trim-on-write repair from item 2 can both be
	 * checked against the SAME four values: a leading tab, a leading space,
	 * a trailing space (all three of which trimCellEnds must repair to
	 * flush), and an interior newline (which it must NOT touch -- ends only,
	 * never interior, is the whole point of `.trim()` over a wider strip).
	 */
	const dirty = $derived(page.url.searchParams.get('dirty') === '1');

	/**
	 * `?empty=1` seeds NO rows for the table, which is the state the reported
	 * Add-row defect lives in and the one the seeded fixture above can never
	 * reach: `ensureRows` fires on first touch, so a table that arrives with
	 * rows already in it never runs the arithmetic that was wrong.
	 *
	 * It is a SEPARATE query flag from `?dirty=1` rather than a third value of
	 * one, because the two answer different questions of the same block and a
	 * reader picking one should not be silently choosing the other.
	 */
	const empty = $derived(page.url.searchParams.get('empty') === '1');

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

	/**
	 * Row 0: leading tab. Row 1: leading space. Row 2: trailing space. Row 3:
	 * an interior newline with BOTH ends already flush -- the case that must
	 * render unchanged, line break and all, proving the trim touches ends
	 * only.
	 */
	const DIRTY_MATERIALS = [
		'\tASTM 1018 steel',
		' 304 stainless',
		'ASTM B16 brass ',
		'Ti-6Al-4V\ntitanium'
	];

	function seed(): Record<string, ResponseValue> {
		const materials = dirty ? DIRTY_MATERIALS : MATERIALS;
		// NO `rows` KEY AT ALL, not an empty array: an untouched block is one the
		// student has never written to, which is a block with no stored value,
		// and that is the state the class page actually hands the renderer.
		if (empty) return { f1: { text: LONG }, c1: { checked: [true, false] } };
		return {
			t1: {
				rows: materials.map((m, i) => ({
					sample: `B-${i + 1}`,
					material: m,
					confirm: m,
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
	<p class="hint">
		empty={String(empty)} — add <code>?empty=1</code> for the untouched table, where the
		table block has never been written to and Add row is the first thing that touches it.
		The table declares <code>minRows: 4</code>, so the first press produces one row and
		the counter beneath it still reads unmet: a blank row is not a filled one.
	</p>

	<h2>Read-only (submitted: locked, no transports)</h2>
	<div data-testid="ro">
		{#key `${dirty}:${empty}`}
			<SpecRenderer spec={SPEC} initialValues={values} locked approved fileNotice="No files here." />
		{/key}
	</div>

	<h2>Editable</h2>
	<div data-testid="ed">
		{#key `${dirty}:${empty}`}
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
