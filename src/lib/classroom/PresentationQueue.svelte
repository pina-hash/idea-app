<script lang="ts">
	import StatusChip from '$lib/ui/StatusChip.svelte';
	/**
	 * PRESENTATION CHECK-OFF FROM THE PHONE (ledger 0438, feedback 68d4780e):
	 * who is up, Presented / Absent / Redo, notes while they talk, and the
	 * rubric scored live. 375px is the primary width: one column, every key a
	 * 44px target, the person up now at the top.
	 *
	 * ABSENCE IS THE MECHANISM: no `feedback` transport, no notes box; no
	 * `scoring`, no rubric. A note is an instructor note on the student's work
	 * (progressive feedback), so it shows when he grades and the student can
	 * read it, which the box says. A score is HELD until he returns it.
	 *
	 * NO POLL AND NOTHING THE PROJECTOR READS: the list re-reads after each of
	 * his own taps and on Refresh.
	 */
	import type { ClassroomSection } from '$lib/classroom/classroom';
	import type { FeedbackTransports } from '$lib/classroom/feedback/transports';
	import {
		presentationLanes,
		STATUS_WORDS,
		type PresentationEntry,
		type PresentationOrder,
		type PresentationQueueData,
		type PresentationRubric,
		type PresentationScoring,
		type PresentationStatus,
		type PresentationTransports
	} from '$lib/classroom/presentations';
	import { onMount, untrack } from 'svelte';

	let {
		section,
		assignments = [],
		transports,
		feedback = null,
		scoring = null
	}: {
		section: ClassroomSection;
		assignments?: { id: string; title: string }[];
		transports: PresentationTransports;
		feedback?: FeedbackTransports | null;
		scoring?: PresentationScoring | null;
	} = $props();

	let queue = $state<PresentationQueueData | null>(null);
	let loaded = $state(false);
	let unavailable = $state<string | null>(null);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);

	// Starting a list
	let startItem = $state('');
	let startOrder = $state<PresentationOrder>('roster');

	// The person up: their note and their rubric
	let note = $state('');
	let rubric = $state<PresentationRubric | null>(null);
	// Bookkeeping only (whose rubric is loaded), so not reactive state the
	// effect below would both read and write.
	let rubricFor: string | null = null;
	let picked = $state<Record<string, number>>({});

	const lanes = $derived(presentationLanes(queue));
	const up = $derived(lanes.up);

	async function load() {
		const r = await transports.load(section.id);
		loaded = true;
		if (!r.ok) {
			if (r.missing) unavailable = r.message;
			else error = r.message;
			return;
		}
		queue = r.data;
	}
	onMount(() => {
		void load();
	});

	// The rubric follows whoever is up, read once per person.
	$effect(() => {
		const entry = up;
		const itemId = queue?.itemId ?? null;
		const key = entry && itemId ? `${itemId}:${entry.id}` : null;
		if (key === rubricFor) return;
		rubricFor = key;
		rubric = null;
		picked = {};
		note = '';
		if (!key || !scoring || !entry || !itemId) return;
		const sc = scoring;
		untrack(() =>
			void sc.rubric(itemId, entry.kind === 'team' ? entry.teamId : null).then((r) => {
				if (rubricFor === key && r.ok) rubric = r.data;
			})
		);
	});

	async function act(fn: () => Promise<{ ok: boolean; message?: string }>, said: string | null = null) {
		if (busy) return;
		busy = true;
		error = null;
		notice = null;
		try {
			const r = await fn();
			if (!r.ok) error = r.message ?? 'That did not save. Try again.';
			else {
				notice = said;
				await load();
			}
		} finally {
			busy = false;
		}
	}

	function mark(entry: PresentationEntry, status: PresentationStatus) {
		const words: Record<PresentationStatus, string> = {
			presented: `${entry.name} marked Presented.`,
			absent: `${entry.name} marked Absent.`,
			redo: `${entry.name} marked Redo.`,
			up: `${entry.name} is up.`,
			waiting: `${entry.name} is back in line.`
		};
		void act(() => transports.mark(entry.id, status), words[status]);
	}

	function start() {
		void act(
			() => transports.start(section.id, { itemId: startItem || null, title: null, order: startOrder }),
			'The list is ready.'
		);
	}

	async function saveNote() {
		const body = note.trim();
		if (!body || !up || !queue?.itemId || !feedback?.post) return;
		busy = true;
		error = null;
		notice = null;
		let saved = 0;
		for (const m of up.members) {
			const r = await feedback.post({ itemId: queue.itemId, studentEmail: m.email, blockId: null, fileId: null, body, marks: null });
			if (r.ok) saved++;
		}
		busy = false;
		if (saved === up.members.length) {
			notice = up.members.length > 1 ? `Note saved for all ${saved} on ${up.name}.` : `Note saved for ${up.name}.`;
			note = '';
		} else error = `The note was saved for ${saved} of ${up.members.length}. Try again.`;
	}

	function saveScore() {
		if (!up || !queue?.itemId || !scoring) return;
		const itemId = queue.itemId;
		const entry = up;
		void act(
			() => scoring!.score(itemId, entry.kind === 'team' && entry.teamId ? { teamId: entry.teamId } : { email: entry.members[0].email }, picked),
			`Score saved for ${entry.name}, held until you return it.`
		);
	}

	const scoreTotal = $derived(Object.values(picked).reduce((a, b) => a + b, 0));
	const scoreOutOf = $derived((rubric?.criteria ?? []).reduce((a, c) => a + Number(c.levels?.[0]?.points ?? c.points ?? 0), 0));
</script>

<svelte:head>
	<title>Presentations · {section.course?.code ?? 'Class'} · IDEA Classroom</title>
</svelte:head>

<main class="pq" data-testid="presentation-queue">
	<header class="pq-head">
		<div>
			<p class="eyebrow">{section.course?.code ?? 'Class'} {section.label}</p>
			<h1 class="pq-title">{queue ? queue.title : 'Presentations'}</h1>
			{#if queue?.itemTitle}<p class="pq-sub">Notes and scores go on {queue.itemTitle}</p>{/if}
		</div>
		<button type="button" class="btn secondary tiny tap-44" disabled={busy} onclick={() => act(async () => ({ ok: true }))} data-testid="pq-refresh"
			>Refresh</button
		>
	</header>

	{#if error}<p class="pq-msg pq-error" role="alert">{error}</p>{/if}
	{#if notice}<p class="pq-msg pq-ok" role="status">{notice}</p>{/if}

	{#if !loaded}
		<p class="pq-note">Loading the list…</p>
	{:else if unavailable}
		<p class="pq-note">{unavailable}</p>
	{:else if !queue}
		<section class="card pq-start" data-testid="pq-start">
			<h2 class="section-label">Start a presentation list</h2>
			<label class="pq-field">
				<span>For the assignment</span>
				<select bind:value={startItem} data-testid="pq-start-item">
					<option value="">No assignment (check-off only)</option>
					{#each assignments as a (a.id)}<option value={a.id}>{a.title}</option>{/each}
				</select>
			</label>
			<fieldset class="pq-field">
				<legend>Order</legend>
				{#each [['roster', 'Roster order'], ['random', 'Random'], ['teams', 'Posted teams']] as [value, label] (value)}
					<label class="pq-radio"><input type="radio" bind:group={startOrder} {value} /> {label}</label>
				{/each}
			</fieldset>
			<button type="button" class="btn tap-44 pq-wide" disabled={busy} onclick={start} data-testid="pq-start-go">Start the list</button>
		</section>
	{:else}
		{#if up}
			<section class="card pq-up" data-testid="pq-up" aria-label="Up now">
				<p class="pq-kicker">Up now · {up.position} of {queue.entries.length}</p>
				<h2 class="pq-name">{up.name}</h2>
				{#if up.kind === 'team'}<p class="pq-members">{up.members.map((m) => m.name).join(', ')}</p>{/if}
				{#if up.status === 'redo'}<p class="pq-redo"><StatusChip tone="warn" glyph="undo" label="Redo" /></p>{/if}
				<div class="pq-marks">
					<button type="button" class="btn tap-44 pq-mark pq-presented" disabled={busy} onclick={() => mark(up, 'presented')} data-testid="pq-mark-presented">Presented</button>
					<button type="button" class="btn secondary tap-44 pq-mark" disabled={busy} onclick={() => mark(up, 'absent')} data-testid="pq-mark-absent">Absent</button>
					<button type="button" class="btn secondary tap-44 pq-mark" disabled={busy} onclick={() => mark(up, 'redo')} data-testid="pq-mark-redo">Redo</button>
				</div>

				{#if feedback?.post && queue.itemId}
					<label class="pq-field pq-notes">
						<span>Notes while they talk</span>
						<textarea rows="4" bind:value={note} placeholder="What you noticed" data-testid="pq-note"></textarea>
					</label>
					<p class="pq-hint">Saved as your note on their work: it shows when you grade, and they can read it.</p>
					<button type="button" class="btn secondary tap-44 pq-wide" disabled={busy || !note.trim()} onclick={saveNote} data-testid="pq-note-save">Save note</button>
				{:else if !queue.itemId}
					<p class="pq-hint">Start a list for an assignment to take notes and score it here.</p>
				{/if}

				{#if rubric && rubric.criteria.length}
					<details class="pq-rubric" data-testid="pq-rubric">
						<summary class="tap-44">Score the rubric{scoreOutOf ? ` (${scoreTotal} of ${scoreOutOf})` : ''}</summary>
						{#each rubric.criteria as c (c.id)}
							<div class="pq-crit">
								<p class="pq-crit-name">{c.criterion}</p>
								<div class="pq-levels" role="group" aria-label={c.criterion}>
									{#each c.levels ?? [] as l (l.label + l.points)}
										<button
											type="button"
											class="pq-level tap-44"
											aria-pressed={picked[c.id] === l.points}
											onclick={() => (picked = { ...picked, [c.id]: l.points })}>{l.label} {l.points}</button
										>
									{/each}
								</div>
							</div>
						{/each}
						<button type="button" class="btn tap-44 pq-wide" disabled={busy || Object.keys(picked).length === 0} onclick={saveScore} data-testid="pq-score-save">Save score (held)</button>
					</details>
				{/if}
			</section>
		{:else}
			<section class="card pq-up"><p class="pq-note">Everyone is done. Close the list when you are finished.</p></section>
		{/if}

		{#if lanes.next.length}
			<section class="pq-lane" data-testid="pq-next">
				<h2 class="section-label">Next ({lanes.next.length})</h2>
				<ol class="pq-list">
					{#each lanes.next as e, i (e.id)}
						<li class="pq-row">
							<span class="pq-row-name">{e.name}{#if e.status === 'redo'} <em class="pq-tag">Redo</em>{/if}</span>
							<span class="pq-row-keys">
								<button type="button" class="pq-key tap-44" disabled={busy || i === 0} aria-label={`Move ${e.name} earlier`} onclick={() => act(() => transports.move(e.id, Math.max(1, e.position - 1)))}>↑</button>
								<button type="button" class="pq-key tap-44" disabled={busy} onclick={() => mark(e, 'up')}>Start</button>
							</span>
						</li>
					{/each}
				</ol>
			</section>
		{/if}

		{#if lanes.done.length}
			<section class="pq-lane" data-testid="pq-done">
				<h2 class="section-label">Done ({lanes.done.length})</h2>
				<ul class="pq-list">
					{#each lanes.done as e (e.id)}
						<li class="pq-row">
							<span class="pq-row-name">{e.name} <em class="pq-tag">{STATUS_WORDS[e.status]}</em></span>
							<button type="button" class="pq-key tap-44" disabled={busy} onclick={() => mark(e, 'waiting')}>Undo</button>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<button type="button" class="btn secondary tap-44 pq-wide pq-close" disabled={busy} onclick={() => queue && act(() => transports.close(queue!.id), 'The list is closed.')} data-testid="pq-close"
			>Close the list</button
		>
	{/if}
</main>

<style>
	.pq {
		max-width: 40rem;
		margin: 0 auto;
		padding: var(--space-3, 0.75rem) 16px 3rem;
		display: grid;
		gap: 0.9rem;
	}
	.pq-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.pq-title {
		font-size: 1.5rem;
		margin: 0.15rem 0 0;
	}
	.pq-sub,
	.pq-hint,
	.pq-note,
	.pq-members {
		color: var(--text-2);
		font-size: 0.9rem;
		margin: 0.2rem 0 0;
	}
	.pq-msg {
		margin: 0;
		font-size: 0.9rem;
	}
	.pq-error {
		color: var(--amber);
	}
	.pq-ok {
		color: var(--green);
	}
	.pq-up {
		display: grid;
		gap: 0.6rem;
	}
	.pq-kicker {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--cyan);
		margin: 0;
	}
	.pq-name {
		font-size: 1.6rem;
		margin: 0;
		color: var(--text-1);
	}
	.pq-redo {
		margin: 0;
	}
	.pq-tag {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		font-style: normal;
		color: var(--amber);
		margin: 0;
	}
	.pq-marks {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.5rem;
	}
	.pq-mark {
		min-height: 52px;
		width: 100%;
	}
	.pq-field {
		display: grid;
		gap: 0.3rem;
		border: 0;
		padding: 0;
		margin: 0;
	}
	.pq-field > span,
	.pq-field > legend {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
	}
	.pq-field textarea,
	.pq-field select {
		width: 100%;
		box-sizing: border-box;
		min-height: 44px;
		font: inherit;
		color: var(--text-1);
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		padding: 0.55rem 0.7rem;
	}
	.pq-radio {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
	}
	.pq-wide {
		width: 100%;
	}
	.pq-rubric summary {
		cursor: pointer;
		display: flex;
		align-items: center;
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}
	.pq-crit {
		margin: 0.5rem 0;
	}
	.pq-crit-name {
		margin: 0 0 0.3rem;
		font-weight: 600;
	}
	.pq-levels {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.pq-level,
	.pq-key {
		min-height: 44px;
		min-width: 44px;
		padding: 0 0.8rem;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-1);
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		cursor: pointer;
	}
	.pq-level[aria-pressed='true'] {
		border-color: var(--green);
		color: var(--green);
	}
	.pq-lane .section-label {
		margin: 0 0 0.4rem;
	}
	.pq-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.35rem;
	}
	.pq-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.2rem 0;
		border-bottom: 1px solid var(--boundary);
	}
	.pq-row-name {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.pq-row-keys {
		display: flex;
		gap: 0.35rem;
		flex: none;
	}
	.pq-close {
		margin-top: 0.5rem;
	}
	@media (min-width: 900px) {
		.pq-mark {
			min-height: 56px;
		}
	}
</style>
