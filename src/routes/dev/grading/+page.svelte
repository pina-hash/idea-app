<script lang="ts">
	import GradesPanel from '$lib/classroom/GradesPanel.svelte';
	import type { AssignmentStanding, ClassroomItem, ClassroomSection } from '$lib/classroom/classroom';
	import {
		GRADING_ORDER_OPTIONS,
		orderStandings,
		type GradingOrderKey
	} from '$lib/classroom/grading-order';

	/**
	 * The REAL `GradesPanel`, on a fixture built so the two order keys disagree.
	 * The argument for every row is in `+page.ts`; this file only builds them.
	 */

	const section: ClassroomSection = {
		id: 's-1',
		course_id: 'c-1',
		label: 'A',
		block: '3',
		teacher_email: 'teacher@boscotech.edu',
		active: true,
		course: { id: 'c-1', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
	};

	/** Fixed instants, never `new Date()`: a fixture that moves cannot be asserted. */
	const NOW = Date.parse('2026-09-06T17:00:00Z');
	const day = (n: number) => new Date(NOW + n * 86_400_000).toISOString();

	/**
	 * TWO ROWS SHARE `created_at` TO THE MILLISECOND. A roster import writes a
	 * whole file in one transaction and `now()` is transaction time, so this is
	 * the ordinary case rather than a contrived one -- and it is the only thing
	 * that exercises the id tiebreak.
	 */
	const TIED = day(-30);

	function item(over: Partial<ClassroomItem> & { id: string }): ClassroomItem {
		return {
			kind: 'assignment',
			title: over.id,
			body: '',
			points: 20,
			due_at: null,
			category: null,
			author_email: 'teacher@boscotech.edu',
			author_name: 'A. Pina',
			published: true,
			pinned: false,
			sort_order: 0,
			first_published_at: day(-40),
			edited_at: null,
			created_at: day(-40),
			updated_at: day(-40),
			...over
		} as ClassroomItem;
	}

	function standing(
		over: Partial<ClassroomItem> & { id: string },
		awaiting = 0,
		returned = 0,
		inProgress = 0
	): AssignmentStanding {
		return { item: item(over), awaiting, returned, inProgress, roster: 24 };
	}

	/**
	 * SUPPLIED SHUFFLED, ON PURPOSE. The input order is neither key's answer, so
	 * a comparator that returned 0 for every pair would leave this order on
	 * screen and be visibly wrong rather than accidentally right.
	 */
	const standings: AssignmentStanding[] = [
		// Long past, and carries the biggest marking queue -- so `queue` puts it
		// first and `due` puts it near the bottom of the dated group. The two
		// keys have to disagree at the top or the harness proves nothing.
		standing({ id: 'Chassis teardown', title: 'Chassis teardown', due_at: day(-21) }, 9, 2, 1),
		// No due date, posted OLDER of the two undated rows.
		standing({ id: 'Shop safety sign-off', title: 'Shop safety sign-off', created_at: day(-35) }, 0, 18, 2),
		// The most recently due dated row: the top of a `due` sort, with nothing
		// waiting, which is exactly the row the old sort pushed down the page.
		standing({ id: 'Section view drawing', title: 'Section view drawing', due_at: day(-1) }, 0, 21, 3),
		// Tied `created_at` with the row below. Undated, so it sits in the second
		// group and only the id separates the pair.
		standing({ id: 'Bearing press writeup', title: 'Bearing press writeup', created_at: TIED }, 3, 0, 5),
		// Due in the FUTURE. Newest due date on the page, so it leads a `due`
		// sort -- which is how "newest due first" is told apart from "nearest to
		// now", two rules that agree on every past-only fixture.
		standing({ id: 'Assembly mates lab', title: 'Assembly mates lab', due_at: day(6) }, 1, 0, 11),
		// The other half of the tie.
		standing({ id: 'Aluminium stock audit', title: 'Aluminium stock audit', created_at: TIED }, 0, 0, 0),
		// A middling dated row, so the dated group has an interior to get wrong.
		standing({ id: 'Fillet study', title: 'Fillet study', due_at: day(-9) }, 4, 6, 2)
	];

	let oracleKey = $state<GradingOrderKey>('due');
	const oracle = $derived(orderStandings(standings, oracleKey));
</script>

<div class="harness cr-root">
	<h1>Grades tab order</h1>
	<p class="lede">
		The real <code>GradesPanel</code>, on a fixture whose right answer differs per key and differs
		from the order it is handed in. The oracle below is <code>orderStandings</code> called directly,
		so a browser pass compares the list against the function rather than against a list typed here.
	</p>

	<GradesPanel {section} {standings} />

	<section class="oracle">
		<h2>What <code>orderStandings</code> answers</h2>
		<p class="lede">
			Switch the key here to read the expected list. This control drives the ORACLE only; the
			panel above has its own.
		</p>
		<div class="oracle-keys">
			{#each GRADING_ORDER_OPTIONS as opt (opt.key)}
				<button
					type="button"
					class="okey tap-44"
					class:is-on={oracleKey === opt.key}
					aria-pressed={oracleKey === opt.key}
					data-testid={`oracle-${opt.key}`}
					onclick={() => (oracleKey = opt.key)}
				>
					{opt.label}
				</button>
			{/each}
		</div>
		<ol class="oracle-list" data-testid="oracle-list">
			{#each oracle as s (s.item.id)}
				<li>
					<strong>{s.item.title}</strong>
					<span class="omuted">
						{s.item.due_at ? `due ${s.item.due_at.slice(0, 10)}` : 'no due date'} &middot; posted
						{s.item.created_at.slice(0, 10)} &middot; {s.awaiting} to mark
					</span>
				</li>
			{/each}
		</ol>
	</section>
</div>

<style>
	.harness {
		padding: 1rem 0 3rem;
	}
	h1 {
		padding: 0 var(--cr-gutter, 1.2rem);
	}
	.lede {
		max-width: 60ch;
		padding: 0 var(--cr-gutter, 1.2rem);
		color: var(--text-2);
		font-size: 0.85rem;
	}
	.oracle {
		margin-top: 2rem;
		padding: 0 var(--cr-gutter, 1.2rem);
	}
	.oracle-keys {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
		padding: 0 var(--cr-gutter, 1.2rem);
	}
	.okey {
		display: inline-flex;
		align-items: center;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		background: none;
		color: var(--text-2);
		border: 1px solid var(--boundary);
		border-radius: 999px;
		padding: 0 0.7rem;
		cursor: pointer;
	}
	.okey.is-on {
		color: var(--green);
		border-color: var(--green);
	}
	.oracle-list {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		padding-left: 2.4rem;
	}
	.oracle-list li {
		padding: 0.2rem 0;
	}
	.omuted {
		color: var(--text-2);
	}
</style>
