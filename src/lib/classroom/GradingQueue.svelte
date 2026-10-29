<script lang="ts">
	import StatusChip from '$lib/ui/StatusChip.svelte';
	/**
	 * WHAT NEEDS GRADING, EVERY CLASS AT ONCE (ledger 0457, gap ba704a08).
	 *
	 * Mr. Pina: "I need to catch up on grading for all my classes, except for
	 * the idea 2 9H, block 4, section 3." Every past-due assignment with saved
	 * student work and no grade yet, by class, one read. A class can be left
	 * out with one press, remembered on this device; that is a view and never
	 * touches a grade. Each assignment opens the grading console for it.
	 *
	 * The read is handed in (`read`), so a harness mounts this exact component.
	 */
	import { untrack } from 'svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import { formatDue } from '$lib/classroom/classroom';
	import { formatSectionLabel } from '$lib/section-label';
	import {
		gradeHref,
		readExcluded,
		studentSaved,
		writeExcluded,
		type NeedsGrading,
		type QueueClass
	} from '$lib/classroom/grading-queue';

	let {
		read,
		classes = [],
		basePath = '/classroom'
	}: {
		/** One read of `classroom_needs_grading`, leaving out these classes. */
		read: (
			exclude: string[]
		) => Promise<{ ok: true; data: NeedsGrading } | { ok: false; missing: boolean; message: string }>;
		/** Every class the caller teaches, to offer the ones left out back. */
		classes?: Array<{ id: string; title: string }>;
		basePath?: string;
	} = $props();

	let excluded = $state<string[]>([]);
	let queue = $state<NeedsGrading | null>(null);
	let problem = $state<string | null>(null);
	let loading = $state(true);
	let open = $state<Record<string, boolean>>({});

	function storage(): Storage | null {
		try {
			return typeof localStorage === 'undefined' ? null : localStorage;
		} catch {
			return null;
		}
	}

	async function load() {
		loading = true;
		const res = await read(excluded);
		loading = false;
		if (!res.ok) {
			problem = res.missing
				? 'This view is still arriving: the site update that adds it has not reached the database yet. Try again in a few minutes.'
				: `The list could not be read: ${res.message}`;
			return;
		}
		problem = null;
		queue = res.data;
	}

	$effect(() => {
		untrack(() => {
			excluded = readExcluded(storage());
			queueMicrotask(() => void load());
		});
	});

	function leaveOut(id: string) {
		excluded = [...new Set([...excluded, id])];
		writeExcluded(storage(), excluded);
		void load();
	}
	function bringBack(id: string) {
		excluded = excluded.filter((x) => x !== id);
		writeExcluded(storage(), excluded);
		void load();
	}

	const titleOf = $derived(new Map(classes.map((c) => [c.id, c.title])));
	function classTitle(c: QueueClass | { sectionId: string; course: string; label: string; block: string | null }): string {
		return titleOf.get(c.sectionId) ?? `${c.course} · ${formatSectionLabel(c.label, c.block)}`;
	}
	const busyClasses = $derived((queue?.classes ?? []).filter((c) => c.waiting > 0));
	const quietClasses = $derived((queue?.classes ?? []).filter((c) => c.waiting === 0));
</script>

<svelte:head>
	<title>Needs grading · IDEA Classroom</title>
</svelte:head>

<main class="classroom-page cr-instructor-surface" data-testid="grading-queue">
	<section class="hero">
		<div class="eyebrow">IDEA · Classroom</div>
		<h1>Needs grading</h1>
		<p class="section-line">
			{#if loading && !queue}
				Reading every class...
			{:else if queue}
				<strong class="waiting-total" data-testid="queue-total"
					>{queue.total} {queue.total === 1 ? 'student' : 'students'} waiting</strong
				>
				&nbsp;&middot; past due, work saved, no grade yet
			{/if}
		</p>
	</section>

	{#if problem}
		<section class="card"><p class="note" role="alert">{problem}</p></section>
	{/if}

	{#if excluded.length}
		<section class="card left-out" data-testid="queue-left-out">
			<span class="left-out-label">Left out</span>
			{#each excluded as id (id)}
				<button type="button" class="chip-key tap-44" onclick={() => bringBack(id)} data-testid="queue-bring-back">
					{titleOf.get(id) ?? queue?.excluded.find((e) => e.sectionId === id)?.course ?? 'A class'}
					<span class="chip-action">Show again</span>
				</button>
			{/each}
		</section>
	{/if}

	{#if queue && busyClasses.length === 0 && !problem}
		<section class="card">
			<p class="note empty-state" data-testid="queue-empty">
				Nothing past due is waiting for a grade{excluded.length ? ' in the classes shown' : ''}.
			</p>
		</section>
	{/if}

	{#each busyClasses as c (c.sectionId)}
		<section class="card class-card" data-testid="queue-class">
			<header class="class-head">
				<h2 class="class-title">{classTitle(c)}</h2>
				<StatusChip tone="warn" label="{c.waiting} waiting" />
				<button type="button" class="btn secondary tiny tap-44 leave-out" onclick={() => leaveOut(c.sectionId)} data-testid="queue-leave-out">
					Leave out
				</button>
			</header>
			<ul class="queue-rows">
				{#each c.items as it (it.itemId)}
					{@const key = `${c.sectionId}:${it.itemId}`}
					<li class="queue-row" data-testid="queue-item">
						<div class="queue-main">
							<span class="queue-title">{it.title}</span>
							<span class="queue-meta">
								{#if it.dueAt}Due {formatDue(it.dueAt)}{/if}
								{#if it.points != null}&nbsp;&middot; {it.points} pts{/if}
								{#if it.team}&nbsp;&middot; team{/if}
							</span>
						</div>
						<span class="queue-keys">
							<button
								type="button"
								class="chip-key tap-44"
								aria-expanded={!!open[key]}
								onclick={() => (open = { ...open, [key]: !open[key] })}
							>
								{it.waiting} to grade
							</button>
							<a class="btn tiny tap-44 grade-open" href={gradeHref(it, c.sectionId, basePath)} data-testid="queue-grade">Grade</a>
						</span>
						{#if open[key]}
							<ul class="who">
								{#each it.students as s (s.email)}
									<li>
										<span class="who-name">{s.name}</span>
										<span class="who-saved" class:late={s.savedAfterDue}>{studentSaved(s, it.html)}</span>
									</li>
								{/each}
							</ul>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/each}

	{#if quietClasses.length}
		<p class="note quiet" data-testid="queue-quiet">
			Nothing waiting in {quietClasses.map((c) => classTitle(c)).join(', ')}.
		</p>
	{/if}

	<footer class="page-footer">
		<VersionBadge app="classroom" />
	</footer>
</main>

<style>
	.classroom-page {
		max-width: var(--cr-measure, var(--measure-split));
		margin: 0 auto;
		padding: 0 var(--cr-gutter, 1.2rem) 3rem;
	}
	.section-line {
		font-family: var(--font-mono);
		font-size: var(--fs-meta);
		color: var(--text-2);
	}
	.waiting-total {
		color: var(--amber);
	}
	.note {
		color: var(--text-2);
		font-size: var(--fs-sm);
	}
	.quiet {
		margin: 0.4rem 0.2rem;
	}
	.left-out {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.4rem;
		padding: 0.6rem 1rem;
	}
	.left-out-label {
		font-family: var(--font-mono);
		font-size: var(--fs-micro);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.chip-key {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-family: var(--font-mono);
		font-size: var(--fs-micro);
		background: none;
		color: var(--text-1);
		border: 1px solid var(--boundary);
		border-radius: 999px;
		padding: 0 0.7rem;
		cursor: pointer;
	}
	.chip-key[aria-expanded='true'] {
		border-color: var(--green);
	}
	.chip-action {
		color: var(--text-2);
	}
	.class-card {
		padding: 1rem 1.1rem;
	}
	.class-head {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		padding-bottom: 0.4rem;
		border-bottom: 1px solid var(--boundary);
	}
	.class-title {
		font-size: var(--fs-body);
		margin: 0;
		flex: 1 1 12rem;
		min-width: 0;
	}
	.leave-out {
		display: inline-flex;
		align-items: center;
	}
	.queue-rows {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.queue-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding: 0.45rem 0.2rem;
		border-top: 1px solid var(--hairline);
	}
	.queue-row:first-child {
		border-top: none;
	}
	.queue-main {
		display: flex;
		flex-direction: column;
		gap: 0.08rem;
		flex: 1 1 10rem;
		min-width: 0;
	}
	.queue-title {
		font-weight: 700;
		font-size: var(--fs-ui);
		overflow-wrap: anywhere;
	}
	.queue-meta {
		font-family: var(--font-mono);
		font-size: var(--fs-micro);
		color: var(--text-2);
	}
	.queue-keys {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		flex: none;
		margin-left: auto;
	}
	.grade-open {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
	}
	.who {
		list-style: none;
		margin: 0.2rem 0 0.3rem;
		padding: 0 0 0 0.6rem;
		flex: 1 1 100%;
		border-left: 2px solid var(--hairline);
	}
	.who li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem 0.6rem;
		padding: 0.15rem 0;
		font-size: var(--fs-caption);
	}
	.who-name {
		color: var(--text-1);
		min-width: 9rem;
	}
	.who-saved {
		font-family: var(--font-mono);
		font-size: var(--fs-micro);
		color: var(--text-2);
		align-self: center;
	}
	.who-saved.late {
		color: var(--amber);
	}
	.page-footer {
		margin-top: 1.4rem;
		display: flex;
		justify-content: center;
	}
</style>
