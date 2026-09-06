<script lang="ts">
	/**
	 * WHAT AN INSTRUCTOR SEES ON `/classroom/<section>/duplicates`, in a real
	 * browser, without a session.
	 *
	 * The real page needs a Bosco Tech Google session and a database holding
	 * duplicate drafts, so neither half of it is reachable from an automated
	 * run. This mounts the IDENTICAL `DuplicateDrafts` component the route
	 * mounts, with a fixture in the shape `classroom_duplicate_drafts` answers,
	 * and switches between the three states worth looking at: groups present,
	 * a class with nothing to clean up, and the read-only state a deployment
	 * without 0186 lands in.
	 *
	 * THE REMOVAL TRANSPORT IS A STAND-IN AND SAYS SO. It records the id and
	 * drops the row from the fixture, which is what `invalidateAll()` does on
	 * the real page. What it deliberately does NOT stand in for is the SERVER
	 * guard: the real removal re-asks 0186 and refuses a copy carrying student
	 * work, and that refusal is proven against real Postgres in
	 * `tests/db/duplicate-drafts-remove-guard.test.ts`, never here.
	 *
	 * Nothing here measures geometry: `npm run verify:browser` does that, and
	 * its route module is `tools/browser-verify/routes/duplicate-drafts.mjs`.
	 */
	import { page } from '$app/state';
	import DuplicateDrafts from '$lib/classroom/DuplicateDrafts.svelte';
	import type {
		AttachedCounts,
		DuplicateAnswer,
		DuplicateGroup
	} from '$lib/classroom/DuplicateDrafts.svelte';

	function counts(over: Partial<AttachedCounts> = {}): AttachedCounts {
		return {
			postings: 1,
			submissions: 0,
			responses: 0,
			approvals: 0,
			files: 0,
			resources: 0,
			specs: 0,
			reference_specs: 0,
			rubrics: 0,
			decks: 0,
			instructor_files: 0,
			instructor_resources: 0,
			instructor_responses: 0,
			instructor_keys: 0,
			...over
		};
	}

	/** Two groups: one wholly removable, one carrying a hand-in on one copy. */
	function fixture(): DuplicateGroup[] {
		return [
			{
				author_email: 'vargas@boscotech.edu',
				author_name: 'T. Vargas',
				kind: 'assignment',
				title: 'Bridge lab writeup',
				copies: 4,
				first_written: '2026-09-04T15:02:00.000Z',
				last_written: '2026-09-04T15:06:00.000Z',
				keep_id: 'keep-bridge',
				surplus_count: 3,
				removable_count: 3,
				blocked_count: 0,
				surplus: [
					{
						id: 'bridge-2',
						created_at: '2026-09-04T15:04:00.000Z',
						removable: true,
						student_work: 0,
						authored: 0,
						counts: counts()
					},
					{
						id: 'bridge-3',
						created_at: '2026-09-04T15:05:00.000Z',
						removable: true,
						student_work: 0,
						authored: 2,
						counts: counts({ files: 1, rubrics: 1 })
					},
					{
						id: 'bridge-4',
						created_at: '2026-09-04T15:06:00.000Z',
						removable: true,
						student_work: 0,
						authored: 0,
						counts: counts({ postings: 2 })
					}
				]
			},
			{
				author_email: 'vargas@boscotech.edu',
				author_name: 'T. Vargas',
				kind: 'assignment',
				title: 'Truss sketch',
				copies: 3,
				first_written: '2026-09-03T09:11:00.000Z',
				last_written: '2026-09-03T09:14:00.000Z',
				keep_id: 'keep-truss',
				surplus_count: 2,
				removable_count: 1,
				blocked_count: 1,
				surplus: [
					{
						id: 'truss-2',
						created_at: '2026-09-03T09:13:00.000Z',
						removable: true,
						student_work: 0,
						authored: 0,
						counts: counts()
					},
					{
						id: 'truss-3',
						created_at: '2026-09-03T09:14:00.000Z',
						removable: false,
						student_work: 2,
						authored: 0,
						counts: counts({ submissions: 1, responses: 1 })
					}
				]
			}
		];
	}

	type Mode = 'groups' | 'empty' | 'unready';

	/**
	 * THE STARTING STATE COMES FROM THE URL, so the browser harness can measure
	 * each one as its own spec rather than clicking between them. Read from
	 * `page.url` (never `window`), so the server render and the first client
	 * frame agree.
	 */
	function modeFromUrl(v: string | null): Mode {
		return v === 'empty' || v === 'unready' ? v : 'groups';
	}

	let mode = $state<Mode>(modeFromUrl(page.url.searchParams.get('state')));
	let groups = $state<DuplicateGroup[]>(fixture());
	let removed = $state<string[]>([]);

	/** Totals are RE-DERIVED from the rows, so the summary cannot drift. */
	const answer = $derived<DuplicateAnswer>({
		groups: mode === 'groups' ? groups : [],
		totals: {
			groups: mode === 'groups' ? groups.length : 0,
			surplus: mode === 'groups' ? groups.reduce((n, g) => n + g.surplus.length, 0) : 0,
			removable:
				mode === 'groups'
					? groups.reduce((n, g) => n + g.surplus.filter((s) => s.removable).length, 0)
					: 0,
			blocked:
				mode === 'groups'
					? groups.reduce((n, g) => n + g.surplus.filter((s) => !s.removable).length, 0)
					: 0
		}
	});

	async function remove(id: string): Promise<{ ok: boolean; error?: string }> {
		// The stand-in refuses exactly what the real route refuses, so a driver
		// that asks anyway sees the same sentence. It is NOT the proof of that
		// rule (see the header); it is here so the harness cannot silently
		// disagree with the server.
		const copy = groups.flatMap((g) => g.surplus).find((s) => s.id === id);
		if (!copy) return { ok: false, error: 'That is not a surplus copy of a draft in this class.' };
		if (!copy.removable) {
			return {
				ok: false,
				error:
					'A student has work on that copy, so it was not removed. Open the item and look at the work before deciding.'
			};
		}
		removed = [...removed, id];
		groups = groups
			.map((g) => ({ ...g, surplus: g.surplus.filter((s) => s.id !== id) }))
			.filter((g) => g.surplus.length > 0);
		return { ok: true };
	}

	function reset() {
		groups = fixture();
		removed = [];
	}
</script>

<svelte:head><title>dev: duplicate drafts</title></svelte:head>

<div class="harness">
	<h1>Duplicate drafts</h1>

	<div class="controls">
		<fieldset>
			<legend>State</legend>
			{#each [['groups', 'Groups present'], ['empty', 'Nothing to clean up'], ['unready', 'No 0186 on this deployment']] as [id, label] (id)}
				<label class="opt tap-44">
					<input type="radio" name="mode" value={id} checked={mode === id} onchange={() => (mode = id as Mode)} />
					<span>{label}</span>
				</label>
			{/each}
		</fieldset>
		<button type="button" class="btn tap-44" data-dd-reset onclick={reset}>Reset the fixture</button>
	</div>

	<p class="readout" data-dd-readout>
		removed {removed.length}: [{removed.join(', ')}] &middot; surplus {answer.totals.surplus} &middot;
		removable {answer.totals.removable} &middot; blocked {answer.totals.blocked}
	</p>

	<div class="mount cr-root">
		<DuplicateDrafts sectionName="Block 3" {answer} ready={mode !== 'unready'} {remove} />
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

	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		align-items: flex-end;
	}

	fieldset {
		border: 1px solid var(--boundary);
		border-radius: var(--radius-2, 8px);
		padding: 0.5rem 0.75rem;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	legend {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-2);
	}

	.opt {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 44px;
		padding: 0 0.4rem;
		color: var(--text-1);
		font-size: 0.9rem;
	}

	.readout {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.82rem;
		color: var(--cyan);
	}

	.mount {
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2, 8px);
		padding: 1rem;
	}
</style>
