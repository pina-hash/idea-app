<script lang="ts">
	/**
	 * THE STREAM'S OWN GEOMETRY HARNESS -- the unit-group grid, at a class shape
	 * the two-pane harness's three even units cannot produce.
	 *
	 * /dev/classroom-split's fixture is three units of roughly comparable
	 * height, which is the shape the grid was measured against and the shape it
	 * has always handled. A REAL class is not that: one unit carries a term's
	 * worth of posts and the next carries two, "Documents and References" is a
	 * unit of four handouts, and "Not in a unit" is whatever has not been filed
	 * yet. That difference is the whole of the defect this route exists to
	 * measure, so it mounts the IDENTICAL ClassView inside the IDENTICAL
	 * ClassSplit and only the data differs.
	 *
	 * `?units=` and `?sizes=` drive it, so one route covers every arrangement
	 * rather than a fixture per shape. Default is the reported class: a short
	 * first unit, a very tall second, then two more panels.
	 */
	import { page } from '$app/state';
	import '$lib/classroom/classroom.css';
	import ClassSplit from '$lib/shell/ClassSplit.svelte';
	import ClassView from '$lib/classroom/ClassView.svelte';
	import ClassroomShell from '$lib/classroom/ClassroomShell.svelte';
	import type { ClassroomItem, ClassroomSection, ClassroomUnit } from '$lib/classroom/classroom';

	const SECTION: ClassroomSection = {
		id: 's-1',
		course_id: 'c-1',
		label: 'Period 2',
		block: 'B',
		teacher_email: 'vargas@boscotech.edu',
		active: true,
		course: { id: 'c-1', code: 'ENG1H', title: 'Engineering 1 Honors', active: true }
	};

	/** A fixed epoch, as the split fixture uses: a row whose date drifts with
	 *  the clock is a measurement that cannot be compared across runs. */
	function at(n: number): string {
		return new Date(Date.UTC(2026, 7, 16) + n * 86400000).toISOString();
	}

	/**
	 * THE REPORTED SHAPE, as `<label>:<row count>` pairs. Unit 2 is the tall one
	 * and Unit 1 is the short one BESIDE it, which is the pairing that puts the
	 * void in the left column at a two-column width.
	 */
	const DEFAULT_SIZES = '3,18,2,5,4';
	const DEFAULT_LABELS = [
		'Unit 1 · Sketching',
		'Unit 2 · Bridges',
		'Unit 3 · Materials and testing',
		'Documents and References'
	];

	const sizes = $derived(
		(page.url.searchParams.get('sizes') ?? DEFAULT_SIZES)
			.split(',')
			.map((n) => Math.max(0, Number.parseInt(n, 10) || 0))
	);

	/** The last size is the UNFILED group ("Not in a unit"); the rest are units. */
	const units = $derived<ClassroomUnit[]>(
		sizes.slice(0, -1).map((_, i) => ({
			id: `u-${i + 1}`,
			course_id: 'c-1',
			name: DEFAULT_LABELS[i] ?? `Unit ${i + 1}`,
			sort_order: i + 1
		}))
	);

	const KINDS = ['assignment', 'post', 'material'] as const;

	const items = $derived<ClassroomItem[]>(
		sizes.flatMap((count, g) =>
			Array.from({ length: count }, (_, i) => {
				const kind = KINDS[(g + i) % KINDS.length];
				return {
					id: `i-${g}-${i}`,
					kind,
					title: `${DEFAULT_LABELS[g] ?? 'Unfiled'} item ${i + 1}`,
					body: '',
					body_doc: null,
					points: kind === 'assignment' ? 20 : null,
					due_at: kind === 'assignment' ? at(i) : null,
					category: null,
					author_email: 'vargas@boscotech.edu',
					author_name: 'T. Vargas',
					published: true,
					pinned: false,
					unit_id: g < sizes.length - 1 ? `u-${g + 1}` : null,
					sort_order: i,
					first_published_at: at(-3),
					edited_at: null,
					created_at: at(-3),
					updated_at: at(-3),
					links: [],
					attachments: [],
					postings: [{ section_id: 's-1' }],
					viewed_at: null,
					instructorAttachments: [],
					instructorLinks: []
				} satisfies ClassroomItem;
			})
		)
	);

	const manage = $derived(page.url.searchParams.get('manage') === '1');
</script>

<div class="cr-root">
	<ClassroomShell
		basePath="/dev/classroom-stream"
		sections={[SECTION]}
		currentSectionId="s-1"
		crumbs={[{ label: 'My Classes', href: '/dev/classroom-stream' }]}
		tabs={[]}
		tab="class"
		canManage={manage}
	>
		<ClassSplit hasDetail={false} nav={classList}>{@render nothing()}</ClassSplit>
	</ClassroomShell>
</div>

{#snippet nothing()}{/snippet}

{#snippet classList()}
	<ClassView
		section={SECTION}
		{items}
		{units}
		canManage={manage}
		basePath="/dev/classroom-stream"
	/>
{/snippet}
