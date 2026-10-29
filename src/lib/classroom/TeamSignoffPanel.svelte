<script lang="ts">
	import StatusChip from '$lib/ui/StatusChip.svelte';
	/**
	 * THE TEAMS PANEL ON A TEAM POST (ledger 0456; gap 87b6bd95, report
	 * d23bc63d.1). One screen per class, for its instructor: every team, who
	 * owns each part and how far it is, who checked in today, what is blocked,
	 * and each sign-off with its checklist and Approve, Send back and Approve
	 * anyway right there, on the one sign-off card the queue uses
	 * (`SignoffCard`). A checkpoint nobody requested can be decided too: the
	 * database opens the request in the instructor's name.
	 *
	 * Read through `classroom_item_signoff_board` (0323), which answers only the
	 * classes the caller manages; every decision is re-checked there.
	 */
	import { untrack } from 'svelte';
	import SignoffCard from './SignoffCard.svelte';
	import { parseSignoffBoard, signoffBoardHeadline, type SignoffBoard, type SignoffBoardTeam } from './signoffs';
	import { TEAM_CHECKPOINT_WORDS, teamCheckpointTone, teamDayWords } from './team-plan';
	import { startPoller } from './poll';

	type Out = { ok: boolean; reason?: string } | null;
	let {
		itemId,
		read,
		decide,
		shifts = null,
		setShift = null
	}: {
		itemId: string;
		read: (itemId: string) => Promise<unknown>;
		decide: (teamId: string, key: string, results: Record<string, boolean>, approve: boolean, note: string | null) => Promise<Out>;
		/** The classes that run this post late (0324); null hides the control. */
		shifts?: ((itemId: string) => Promise<unknown>) | null;
		setShift?: ((itemId: string, sectionId: string, days: number) => Promise<Out>) | null;
	} = $props();

	/** School days each class runs this post late (report d23bc63d.2). */
	let late = $state<Record<string, number>>({});
	let lateSaid = $state<Record<string, string>>({});
	async function readShifts() {
		if (!shifts) return;
		const raw = (await shifts(itemId).catch(() => null)) as { ok?: boolean; shifts?: { section_id: string; days: number }[] } | null;
		if (raw?.ok && Array.isArray(raw.shifts)) late = Object.fromEntries(raw.shifts.map((x) => [String(x.section_id), Number(x.days) || 0]));
	}
	async function saveShift(sectionId: string, days: number) {
		if (!setShift) return;
		const n = Math.max(0, Math.min(30, Math.round(days) || 0));
		const out = await setShift(itemId, sectionId, n).catch(() => null);
		lateSaid = { ...lateSaid, [sectionId]: out?.ok ? (n ? `Moved ${n} school ${n === 1 ? 'day' : 'days'} later for this class.` : 'On the post’s own dates.') : 'That did not save.' };
		await readShifts();
		await load();
	}

	let board = $state<SignoffBoard | null>(null);
	let failed = $state(false);
	let open = $state<string | null>(null);
	let said = $state<string | null>(null);

	async function load(): Promise<'failed' | void> {
		const parsed = parseSignoffBoard(await read(itemId).catch(() => null));
		if (!parsed) {
			failed = true;
			return 'failed';
		}
		failed = false;
		board = parsed;
	}
	$effect(() => {
		const poller = untrack(() => startPoller({ intervalMs: 60_000, immediate: true, run: load }));
		untrack(() => void readShifts());
		return () => poller.stop();
	});

	const waiting = $derived(
		(board?.sections ?? []).reduce((n, s) => n + s.teams.filter((t) => t.checkpoints.some((c) => c.state === 'requested')).length, 0)
	);

	async function run(team: SignoffBoardTeam, key: string, results: Record<string, boolean>, approve: boolean, note: string | null): Promise<Out> {
		const out = await decide(team.id, key, results, approve, note).catch(() => null);
		await load();
		return out;
	}
	function pct(done: number, total: number): number {
		return total > 0 ? Math.round((done / total) * 100) : 0;
	}
</script>

<section class="card tsp" data-testid="team-signoff-panel" aria-label="Teams and sign-offs">
	<header class="tsp-head">
		<h2 class="section-label">Teams and sign-offs</h2>
		{#if waiting}<span class="tsp-waiting" data-testid="team-signoff-waiting">{waiting} waiting</span>{/if}
	</header>
	{#if said}<p class="tsp-said" role="status">{said}</p>{/if}
	{#if failed && !board}
		<p class="tsp-note">The teams could not be read. It tries again on its own.</p>
	{:else if !board}
		<p class="tsp-note">Reading the teams.</p>
	{:else if !board.sections.length}
		<p class="tsp-note">This post is in no class you teach.</p>
	{:else}
		{#each board.sections as s (s.id)}
			<div class="tsp-section">
				{#if board.sections.length > 1 || s.setLabel}
					<p class="tsp-section-head"><strong>{s.label}</strong>{#if s.setLabel}<span class="tsp-set">{s.setLabel}</span>{/if}</p>
				{/if}
				{#if setShift}
					<div class="tsp-late">
						<label>
							<span>This class runs it</span>
							<input
								type="number"
								min="0"
								max="30"
								step="1"
								value={late[s.id] ?? 0}
								onchange={(e) => saveShift(s.id, Number((e.currentTarget as HTMLInputElement).value))}
								aria-label={`School days ${s.label} runs this post late`}
							/>
							<span>school days late (plan steps and sign-off dates move for this class only)</span>
						</label>
						{#if lateSaid[s.id]}<span class="tsp-late-said" role="status">{lateSaid[s.id]}</span>{/if}
					</div>
				{/if}
				{#if !s.teams.length}
					<p class="tsp-note">No team draw is posted in this class. Draw and post teams on the People tab.</p>
				{/if}
				<ul class="tsp-teams">
					{#each s.teams as t (t.id)}
						{@const head = signoffBoardHeadline(t)}
						<li class="tsp-team" data-state={head?.state ?? 'approved'}>
							<button
								type="button"
								class="tsp-row"
								aria-expanded={open === t.id}
								data-testid="team-signoff-row"
								onclick={() => (open = open === t.id ? null : t.id)}
							>
								<span class="tsp-name">{t.name}</span>
								<span class="tsp-people">
									{#each t.members as m (m.name)}
										<span class="tsp-person" class:in={m.checkedIn} title={m.checkedIn ? 'Checked in today' : 'Not checked in today'}
											>{m.name}{#if m.checkedIn}<span class="tsp-in" aria-label=", checked in"> ●</span>{/if}</span
										>
									{/each}
								</span>
								<StatusChip
									{...teamCheckpointTone(head?.state ?? 'approved')}
									class="tsp-status"
									wrap
									label={head ? `${head.title}: ${TEAM_CHECKPOINT_WORDS[head.state] ?? head.state}` : 'All signed off'}
								/>
							</button>
							<ul class="tsp-parts" aria-label={`${t.name} progress`}>
								{#each t.parts as p (p.id)}
									<li class="tsp-part" class:later={p.opensAfter && t.phases[p.opensAfter] && !t.phases[p.opensAfter].open}>
										<span class="tsp-part-name">{p.title}{p.owner ? `, ${p.owner}` : p.audience === 'role' ? ', no owner' : ''}</span>
										<span class="tsp-bar" aria-hidden="true"><span style={`width:${pct(p.done, p.total)}%`}></span></span>
										<span class="tsp-part-n">{p.done}/{p.total}</span>
									</li>
								{/each}
								{#each t.members as m (m.name)}
									{#if m.total}
										<li class="tsp-part own">
											<span class="tsp-part-name">{m.name}'s own boxes</span>
											<span class="tsp-bar" aria-hidden="true"><span style={`width:${pct(m.done, m.total)}%`}></span></span>
											<span class="tsp-part-n">{m.done}/{m.total}</span>
										</li>
									{/if}
								{/each}
							</ul>
							{#if t.blocked.length}
								<ul class="tsp-blocked" aria-label="Blocked">
									{#each t.blocked as b (b.title + b.reason)}
										<li><strong>Blocked:</strong> {b.title}{b.owner ? ` (${b.owner})` : ''}. {b.reason}</li>
									{/each}
								</ul>
							{/if}
							{#if open === t.id}
								<div class="tsp-cps">
									{#each t.checkpoints as c (c.checkpoint.key)}
										{#if c.state === 'approved'}
											<p class="tsp-approved">
												<span class="tsp-tick" aria-hidden="true">✓</span>
												{c.checkpoint.title} approved{c.decision?.at ? `, ${new Date(c.decision.at).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric' })}` : ''}{c.decision?.note ? `. ${c.decision.note}` : ''}
											</p>
										{:else if c.ownerOnly && !board.isOwner}
											<p class="tsp-note">{c.checkpoint.title}{c.checkpoint.date ? `, ${teamDayWords(c.checkpoint.date)}` : ''}: Mr. Pina decides this one. {TEAM_CHECKPOINT_WORDS[c.state] ?? ''}</p>
										{:else}
											<SignoffCard
												req={c}
												showTeam={false}
												ondecide={(results, approve) => run(t, c.checkpoint.key, results, approve, null)}
												onoverride={(results, note) => run(t, c.checkpoint.key, results, true, note)}
												ondone={(words) => (said = words)}
											/>
										{/if}
									{/each}
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	{/if}
</section>

<style>
	.tsp {
		display: grid;
		gap: 0.7rem;
		padding: 0.9rem;
		min-width: 0;
	}
	.tsp-head {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.tsp-head .section-label {
		margin: 0;
	}
	.tsp-waiting {
		padding: 0.1rem 0.5rem;
		border: 1px solid var(--green);
		border-radius: 999px;
		color: var(--green);
		font-family: var(--font-mono);
		font-size: var(--fs-meta);
	}
	.tsp-said {
		margin: 0;
		font-family: var(--font-display);
		color: var(--green);
	}
	.tsp-note {
		margin: 0;
		font-family: var(--font-display);
		color: var(--text-2, var(--dim));
	}
	.tsp-section {
		display: grid;
		gap: 0.5rem;
	}
	.tsp-section-head {
		margin: 0;
		display: flex;
		gap: 0.6rem;
		align-items: baseline;
		font-family: var(--font-display);
		color: var(--text-1, var(--white));
	}
	.tsp-set {
		font-family: var(--font-mono);
		font-size: var(--fs-meta);
		color: var(--cyan);
	}
	.tsp-late {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.8rem;
		font-family: var(--font-display);
		font-size: var(--fs-sm);
		color: var(--text-2, var(--dim));
	}
	.tsp-late label {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
	}
	.tsp-late input {
		width: 4rem;
		min-height: 44px;
		font-family: var(--font-mono);
		text-align: right;
	}
	.tsp-late-said {
		color: var(--green);
	}
	.tsp-teams {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.6rem;
	}
	.tsp-team {
		display: grid;
		gap: 0.45rem;
		padding: 0.6rem;
		border: 1px solid var(--boundary, color-mix(in srgb, var(--dim) 30%, transparent));
		border-radius: var(--radius-card, 8px);
		background: color-mix(in srgb, var(--bg0) 45%, transparent);
	}
	.tsp-team[data-state='requested'] {
		border-color: var(--green);
	}
	.tsp-row {
		appearance: none;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.8rem;
		min-height: 44px;
		padding: 0;
		background: none;
		border: 0;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.tsp-name {
		font-family: var(--font-display);
		font-size: var(--fs-h4);
		color: var(--text-1, var(--white));
	}
	.tsp-people {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem 0.6rem;
		font-family: var(--font-display);
		color: var(--text-2, var(--dim));
	}
	.tsp-person.in {
		color: var(--text-1, var(--white));
	}
	/* Checked in today: present, the ok tone's ink. */
	.tsp-in {
		color: var(--status-ok);
	}
	.tsp-row :global(.tsp-status) {
		margin-left: auto;
	}
	.tsp-parts {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		gap: 0.3rem 1rem;
	}
	.tsp-part {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 4.5rem auto;
		gap: 0.5rem;
		align-items: center;
		font-family: var(--font-display);
		font-size: var(--fs-sm);
		color: var(--text-1, var(--white));
	}
	.tsp-part.own,
	.tsp-part.later {
		color: var(--text-2, var(--dim));
	}
	.tsp-part-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tsp-bar {
		height: 6px;
		border-radius: 3px;
		background: color-mix(in srgb, var(--dim) 25%, transparent);
		overflow: hidden;
	}
	/* Work under way: the info tone, which carries in progress. */
	.tsp-bar span {
		display: block;
		height: 100%;
		background: var(--status-info-solid);
	}
	.tsp-part-n {
		font-family: var(--font-mono);
		font-size: var(--fs-meta);
		color: var(--text-2, var(--dim));
	}
	.tsp-blocked {
		margin: 0;
		padding-left: 1.1rem;
		font-family: var(--font-display);
		color: var(--amber);
	}
	.tsp-cps {
		display: grid;
		gap: 0.6rem;
	}
	.tsp-approved {
		margin: 0;
		font-family: var(--font-display);
		color: var(--text-1, var(--white));
	}
	.tsp-tick {
		color: var(--green);
		margin-right: 0.3rem;
	}
</style>
