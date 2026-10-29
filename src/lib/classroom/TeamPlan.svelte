<script lang="ts">
	import StatusChip from '$lib/ui/StatusChip.svelte';
	import { toneStyle } from '$lib/ui/status-tone';
	/**
	 * ONE TEAM'S PLAN AND TRACKER (ledger 0436, 0303; decision 71).
	 *
	 * Four parts, top to bottom, every one reading the same `TeamPlan`:
	 *   1. the head: done, Behind, Slipping, Uneven, and each member's share of
	 *      the planned points against an even share;
	 *   2. roles: who owns each subsystem (fixed once sign-off 1 is approved);
	 *   3. today's check-in: tap the tasks you are on, no typing;
	 *   4. the timeline: a row per member, tasks as blocks on their due day,
	 *      sign-off dates as lines and a today line, and under it every task
	 *      with what can change about it (owner of a team task, due date,
	 *      Blocked with a one-line reason, "needs task X first").
	 *
	 * Every write is one RPC that re-checks the caller; this component holds no
	 * rule the database does not also hold. A write that lands asks the page to
	 * read again (`onchanged`), and the team's live notice reaches teammates.
	 */
	import {
		TEAM_CHECKPOINT_WORDS,
		TEAM_STATUS_TONES,
		TEAM_STATUS_WORDS,
		teamCheckpointTone,
		teamCheckpointReady,
		teamDayWords,
		teamDueChoices,
		teamPlanSummary,
		teamBalanceHints,
		teamShares,
		teamTaskColumn,
		teamTaskStatus,
		teamTimelineDays,
		type TeamPlan,
		type TeamPlanTask,
		type TeamPlanWrites
	} from './team-plan';
	import { signoffMissingLines } from './signoffs';


	let {
		plan,
		writes,
		onchanged,
		itemHref
	}: {
		plan: TeamPlan;
		writes: TeamPlanWrites;
		onchanged: () => void;
		itemHref: (itemId: string) => string;
	} = $props();

	const summary = $derived(teamPlanSummary(plan));
	const shares = $derived(teamShares(plan));
	const days = $derived(teamTimelineDays(plan));
	const nameOf = (key: string | null) => plan.members.find((m) => m.key === key)?.name ?? null;
	const statusOf = (t: TeamPlanTask) => teamTaskStatus(t, plan.today);
	const me = $derived(plan.members.find((m) => m.me) ?? null);

	/** Rows: every member, then the work nobody owns yet. */
	const rows = $derived([
		...plan.members.map((m) => ({ key: m.key as string | null, name: m.me ? `${m.name} (you)` : m.name })),
		{ key: null as string | null, name: 'No owner yet' }
	]);
	const cells = $derived.by(() => {
		const map = new Map<string, TeamPlanTask[]>();
		for (const t of plan.tasks) {
			if (!t.dueOn) continue;
			const col = teamTaskColumn(t.dueOn, days);
			if (col < 0) continue;
			const k = `${t.owner ?? ''}|${col}`;
			map.set(k, [...(map.get(k) ?? []), t]);
		}
		return map;
	});
	const todayCol = $derived(days.indexOf(plan.today));
	const lines = $derived(
		plan.checkpoints
			.filter((c) => c.date)
			.map((c) => ({ ...c, col: teamTaskColumn(c.date!, days) }))
			.filter((c) => c.col >= 0)
	);

	let busy = $state(false);
	let note = $state<string | null>(null);
	async function run(write: () => Promise<unknown>) {
		busy = true;
		note = null;
		try {
			const out = (await write()) as { ok?: boolean; reason?: string } | null;
			if (out && out.ok === false) note = refusal(out.reason);
		} catch (e) {
			note = (e as Error).message || 'That change did not save. Try again.';
		} finally {
			busy = false;
			onchanged();
		}
	}
	function refusal(reason?: string): string {
		switch (reason) {
			case 'past_post_due':
				return "That date is after the post's due date. Pick an earlier day.";
			case 'not_school_day':
				return 'That day is not a school day.';
			case 'fixed_owner':
				return "This task's owner is fixed by its role or its block.";
			case 'owners_fixed':
				return 'Your plan is approved, so owners are fixed. Ask your teacher to change one.';
			case 'not_owner':
				return 'Only the task owner can mark it blocked.';
			case 'not_member':
				return 'That person is not on your team.';
			case 'auto_failed':
				return 'Some checks the site makes do not pass yet. Finish those, then ask again.';
			case 'already_requested':
				return 'Your team already asked. It is in the queue.';
			default:
				return 'That change did not save.';
		}
	}

	// Today's check-in: the student's own open tasks, tapped.
	const myOpen = $derived(plan.tasks.filter((t) => t.owner === plan.me && statusOf(t) !== 'done'));
	// Starts from the tasks already checked in today and resets on every re-read;
	// a tap overrides it until then (a writable derived, no effect).
	let picked = $derived(new Set(plan.tasks.filter((t) => t.onIt.includes(plan.me)).map((t) => t.id)));
	const checkedIn = $derived(plan.checkedIn.includes(plan.me));
	function toggle(id: string) {
		const next = new Set(picked);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		picked = next;
	}

	let open = $state<string | null>(null);
	let blockText = $state('');
	let newTitle = $state('');
	let newOwner = $state<string>('');
	let newDue = $state<string>('');
	const dueChoices = (t: TeamPlanTask) => teamDueChoices(t, plan);
	const lastDay = $derived(days.at(-1) ?? plan.today);
	const addDays = $derived(days.filter((d) => d >= plan.today));
</script>

<section class="tp" data-testid="team-plan" aria-label={`${plan.team.name} plan`}>
	<header class="card tp-head">
		<div class="tp-title">
			<span class="section-label">Team plan</span>
			<h1 class="tp-name">{plan.team.name}</h1>
		</div>
		<dl class="tp-stats">
			<div class="tp-stat">
				<dt>Done</dt>
				<dd>{summary.percent}%</dd>
			</div>
			<div class="tp-stat" class:warn={summary.behind > 0}>
				<dt>Behind</dt>
				<dd>{summary.behind}</dd>
			</div>
			<div class="tp-stat" class:warn={summary.slipping}>
				<dt>Pace</dt>
				<dd>{summary.slipping ? 'Slipping' : 'On pace'}</dd>
			</div>
			<div class="tp-stat" class:warn={summary.uneven}>
				<dt>Split</dt>
				<dd>{summary.uneven ? 'Uneven' : 'Even'}</dd>
			</div>
		</dl>
		<div class="tp-progress" role="progressbar" aria-label="Points done" aria-valuemin="0" aria-valuemax="100" aria-valuenow={summary.percent}>
			<span style={`width:${summary.percent}%`}></span>
		</div>
		<ul class="tp-shares" aria-label="Each member's share of the points">
			{#each shares as s (s.key)}
				<li class="tp-share" class:off={s.ratio < 0.75 || s.ratio > 1.25}>
					<span class="tp-share-name">{s.name}</span>
					<span class="tp-share-pts">{s.points} pts</span>
					<span class="tp-share-bar" aria-hidden="true"><span style={`width:${Math.min(100, Math.round(s.ratio * 50))}%`}></span></span>
				</li>
			{/each}
		</ul>
		{#if teamBalanceHints(plan).length}
			<!-- How to even out the split (report 653c3ff6.2), in points and names. -->
			<ul class="tp-hints" data-testid="team-balance-hints">
				{#each teamBalanceHints(plan) as line (line)}<li>{line}</li>{/each}
			</ul>
		{/if}
		{#if note}<p class="tp-note" role="status">{note}</p>{/if}
	</header>

	{#if plan.roles.length}
		<section class="card tp-roles" aria-label="Roles">
			<h2 class="section-label">Roles</h2>
			<ul class="tp-role-list">
				{#each plan.roles as r (r.id)}
					<li class="tp-role">
						<label class="tp-role-title" for={`role-${r.id}`}>{r.title}</label>
						<select
							id={`role-${r.id}`}
							class="cr-select"
							value={r.owner ?? ''}
							disabled={busy || plan.ownersFixed}
							onchange={(e) => run(() => writes.setRole(plan.team.id, r.id, (e.currentTarget as HTMLSelectElement).value || null))}
						>
							<option value="">No owner yet</option>
							{#each plan.members as m (m.key)}<option value={m.key}>{m.name}</option>{/each}
						</select>
					</li>
				{/each}
			</ul>
			{#if plan.ownersFixed}<p class="tp-hint">Sign-off 1 approved your plan, so owners are fixed.</p>{/if}
		</section>
	{/if}

	{#if me}
		<section class="card tp-checkin" aria-label="Today's check-in" data-testid="team-checkin">
			<h2 class="section-label">Today I am on</h2>
			{#if myOpen.length === 0}
				<p class="tp-hint">You have nothing open. Pick up a task with no owner below, or help a teammate.</p>
			{:else}
				<div class="tp-pick" role="group" aria-label="Your open tasks">
					{#each myOpen as t (t.id)}
						<button type="button" class="btn secondary tp-pick-key" aria-pressed={picked.has(t.id)} onclick={() => toggle(t.id)}>
							{t.title}
						</button>
					{/each}
				</div>
				<button
					type="button"
					class="btn tp-checkin-go"
					disabled={busy}
					data-testid="team-checkin-save"
					onclick={() => run(() => writes.checkin(plan.team.id, [...picked]))}
				>
					{checkedIn ? 'Update my check-in' : 'Check in'}
				</button>
			{/if}
		</section>
	{/if}

	{#if plan.checkpoints.length}
		<section class="card tp-signoffs" aria-label="Sign-offs" data-testid="team-signoffs">
			<h2 class="section-label">Sign-offs</h2>
			<ol class="tp-cps">
				{#each plan.checkpoints as cp (cp.key)}
					<li class="tp-cp" data-state={cp.state}>
						<div class="tp-cp-head">
							<strong class="tp-cp-title">{cp.title}</strong>
							{#if cp.date}<span class="tp-cp-date">{teamDayWords(cp.date)}</span>{/if}
							<StatusChip {...teamCheckpointTone(cp.state)} label={TEAM_CHECKPOINT_WORDS[cp.state] ?? cp.state} />
						</div>
						{#if cp.gate}<p class="tp-cp-gate">{cp.gate}</p>{/if}
						{#if cp.decision?.status === 'approved'}
							<p class="tp-cp-stamp">Approved by {cp.decision.by}{cp.decision.at ? `, ${new Date(cp.decision.at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}</p>
						{:else if cp.decision?.status === 'sent_back' && cp.state === 'sent-back'}
							<p class="tp-cp-back">Sent back: {cp.decision.note}</p>
						{/if}
						{#if cp.state !== 'approved'}
							<ul class="tp-cp-items">
								{#each cp.items as item (item.id)}
									<li class:ok={item.kind === 'auto' && cp.auto[item.id]} class:no={item.kind === 'auto' && !cp.auto[item.id]}>
										<span class="tp-cp-mark" aria-hidden="true">{item.kind === 'auto' ? (cp.auto[item.id] ? '✓' : '·') : '○'}</span>
										{item.text}
										<span class="tp-cp-kind">{item.kind === 'auto' ? (cp.auto[item.id] ? 'passes' : 'not yet') : 'your teacher checks'}</span>
										{#if item.kind === 'auto' && !cp.auto[item.id] && cp.missing[item.id]?.length}
											<span class="tp-cp-missing" data-testid="team-checkpoint-missing">
												Still empty: {signoffMissingLines(cp.missing[item.id]).join('. ')}
											</span>
										{/if}
									</li>
								{/each}
							</ul>
							{#if me && (cp.state === 'open' || cp.state === 'sent-back')}
								<button
									type="button"
									class="btn tp-request"
									data-testid={`request-${cp.key}`}
									disabled={busy || !teamCheckpointReady(cp)}
									onclick={() => run(() => writes.request(plan.team.id, cp.key))}>Request sign-off</button
								>
							{/if}
						{/if}
					</li>
				{/each}
			</ol>
		</section>
	{/if}

	<section class="card tp-time" aria-label="Timeline">
		<h2 class="section-label">Timeline to {teamDayWords(lastDay)}</h2>
		<div class="tp-scroll">
			<div class="tp-grid" style={`--cols:${days.length}`}>
				<div class="tp-corner"></div>
				{#each days as d, i (d)}
					<div class="tp-day" class:today={i === todayCol}>{teamDayWords(d)}</div>
				{/each}
				{#each rows as row (row.key ?? 'none')}
					<div class="tp-rowname">{row.name}</div>
					{#each days as d, i (d)}
						<div class="tp-cell" class:today={i === todayCol} class:line={lines.some((l) => l.col === i)}>
							{#each cells.get(`${row.key ?? ''}|${i}`) ?? [] as t (t.id)}
								<button
									type="button"
									class={`tp-block st-${statusOf(t)}`}
									style={toneStyle(TEAM_STATUS_TONES[statusOf(t)].tone)}
									title={`${t.title}: ${TEAM_STATUS_WORDS[statusOf(t)]}`}
									onclick={() => (open = t.id)}
								>
									{t.title}
								</button>
							{/each}
						</div>
					{/each}
				{/each}
			</div>
		</div>
		{#if lines.length}
			<ul class="tp-legend">
				{#each lines as l (l.key)}
					<li><span class="tp-line-mark" aria-hidden="true"></span>{l.title}, {teamDayWords(l.date!)}{l.gate ? `: ${l.gate}` : ''}</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="card tp-tasks" aria-label="Every task">
		<h2 class="section-label">Every task</h2>
		<ul class="tp-task-list">
			{#each plan.tasks as t (t.id)}
				{@const st = statusOf(t)}
				<li class="tp-task" class:open={open === t.id} data-task={t.id}>
					<button type="button" class="tp-task-row" aria-expanded={open === t.id} onclick={() => (open = open === t.id ? null : t.id)}>
						<StatusChip {...TEAM_STATUS_TONES[st]} class="tp-status" label={TEAM_STATUS_WORDS[st]} />
						<span class="tp-task-title">{t.title}</span>
						<span class="tp-task-meta">{nameOf(t.owner) ?? 'No owner'}{t.dueOn ? `, ${teamDayWords(t.dueOn)}` : ''}{t.points ? `, ${t.points} pts` : ''}</span>
					</button>
					{#if open === t.id}
						<div class="tp-task-edit">
							{#if t.itemId}<a class="btn ghost" href={itemHref(t.itemId)}>Open the post</a>{/if}
							{#if t.note}<p class="tp-hint">{t.note}</p>{/if}
							{#if t.blocked}<p class="tp-blocked">Blocked: {t.blocked}</p>{/if}
							<div class="tp-fields">
								<label>
									<span class="tp-k">Owner</span>
									<select
										class="cr-select"
										value={t.owner ?? ''}
										disabled={busy || t.fixedOwner || plan.ownersFixed}
										onchange={(e) => run(() => writes.setOwner(t.id, (e.currentTarget as HTMLSelectElement).value || null))}
									>
										<option value="">No owner yet</option>
										{#each plan.members as m (m.key)}<option value={m.key}>{m.name}</option>{/each}
									</select>
								</label>
								<label>
									<span class="tp-k">Due</span>
									<select
										class="cr-select"
										value={t.dueOn ?? ''}
										disabled={busy}
										onchange={(e) => run(() => writes.setDue(t.id, (e.currentTarget as HTMLSelectElement).value))}
									>
										{#if t.dueOn && !dueChoices(t).includes(t.dueOn)}<option value={t.dueOn}>{teamDayWords(t.dueOn)}</option>{/if}
										{#each dueChoices(t) as d (d)}<option value={d}>{teamDayWords(d)}</option>{/each}
									</select>
								</label>
								<label>
									<span class="tp-k">Needs first</span>
									<select
										class="cr-select"
										value={t.dependsOn ?? ''}
										disabled={busy}
										onchange={(e) => run(() => writes.depends(t.id, (e.currentTarget as HTMLSelectElement).value || null))}
									>
										<option value="">Nothing</option>
										{#each plan.tasks.filter((o) => o.id !== t.id) as o (o.id)}<option value={o.id}>{o.title}</option>{/each}
									</select>
								</label>
							</div>
							{#if t.owner === plan.me || plan.manager}
								<div class="tp-block-row">
									{#if t.blocked}
										<button type="button" class="btn secondary" disabled={busy} onclick={() => run(() => writes.block(t.id, null))}>Not blocked any more</button>
									{:else}
										<input class="tp-reason" maxlength="140" placeholder="What is in the way, in one line" bind:value={blockText} />
										<button type="button" class="btn secondary" disabled={busy || !blockText.trim()} onclick={() => run(() => writes.block(t.id, blockText)).then(() => (blockText = ''))}>Mark blocked</button>
									{/if}
								</div>
							{/if}
							{#if t.kind === 'team'}
								<button type="button" class="btn ghost danger" disabled={busy} onclick={() => run(() => writes.removeTask(t.id))}>Take off the plan</button>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
		<form
			class="tp-add"
			onsubmit={(e) => {
				e.preventDefault();
				const title = newTitle.trim();
				if (!title) return;
				void run(() => writes.addTask(plan.team.id, title, newOwner || null, newDue || null)).then(() => {
					newTitle = '';
				});
			}}
		>
			<span class="section-label">Add a team task (0 points)</span>
			<input class="tp-add-title" maxlength="120" placeholder="What needs doing" bind:value={newTitle} />
			<select class="cr-select" bind:value={newOwner} aria-label="Owner">
				<option value="">No owner yet</option>
				{#each plan.members as m (m.key)}<option value={m.key}>{m.name}</option>{/each}
			</select>
			<select class="cr-select" bind:value={newDue} aria-label="Due">
				<option value="">No date yet</option>
				{#each addDays as d (d)}<option value={d}>{teamDayWords(d)}</option>{/each}
			</select>
			<button type="submit" class="btn" disabled={busy || !newTitle.trim()}>Add</button>
		</form>
	</section>
</section>

<style>
	.tp {
		display: grid;
		gap: 0.9rem;
		min-width: 0;
	}
	.tp-head {
		display: grid;
		gap: 0.7rem;
		padding: 1rem;
	}
	.tp-title {
		display: flex;
		align-items: baseline;
		gap: 0.7rem;
		flex-wrap: wrap;
	}
	.tp-name {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--fs-xl);
		color: var(--text-1, var(--white));
	}
	.tp-stats {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.5rem;
		margin: 0;
	}
	.tp-stat {
		padding: 0.5rem 0.6rem;
		border-radius: 0.6rem;
		background: color-mix(in srgb, var(--bg0) 60%, transparent);
		border: 1px solid color-mix(in srgb, var(--dim) 28%, transparent);
	}
	.tp-stat dt {
		font-family: var(--font-mono);
		font-size: var(--fs-label);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2, var(--dim));
	}
	.tp-stat dd {
		margin: 0.15rem 0 0;
		font-family: var(--font-display);
		font-size: var(--fs-h3);
		font-weight: 600;
		color: var(--text-1, var(--white));
	}
	.tp-stat.warn {
		border-color: color-mix(in srgb, var(--amber) 70%, transparent);
	}
	.tp-stat.warn dd {
		color: var(--amber);
	}
	.tp-progress {
		height: 0.5rem;
		border-radius: 999px;
		background: color-mix(in srgb, var(--bg0) 70%, transparent);
		overflow: hidden;
	}
	.tp-progress span {
		display: block;
		height: 100%;
		background: var(--green);
	}
	.tp-shares {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
		gap: 0.4rem 0.8rem;
	}
	.tp-share {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.15rem 0.5rem;
		font-family: var(--font-display);
		color: var(--text-1, var(--white));
	}
	.tp-share-pts {
		font-family: var(--font-mono);
		font-size: var(--fs-meta);
		color: var(--text-2, var(--dim));
	}
	.tp-share-bar {
		grid-column: 1 / -1;
		height: 0.3rem;
		border-radius: 999px;
		background: color-mix(in srgb, var(--bg0) 70%, transparent);
		position: relative;
	}
	.tp-share-bar::after {
		content: '';
		position: absolute;
		left: 50%;
		top: -2px;
		bottom: -2px;
		width: 1px;
		background: var(--text-2, var(--dim));
	}
	.tp-share-bar span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: color-mix(in srgb, var(--text-1, var(--white)) 55%, transparent);
	}
	.tp-share.off .tp-share-bar span {
		background: var(--amber);
	}
	.tp-hint,
	.tp-note {
		margin: 0;
		font-family: var(--font-display);
		color: var(--text-2, var(--dim));
	}
	.tp-note {
		color: var(--amber);
	}
	.tp :global(h2.section-label),
	.tp :global(.tp-title .section-label) {
		margin: 0;
	}
	.tp-signoffs,
	.tp-roles,
	.tp-checkin,
	.tp-time,
	.tp-tasks {
		display: grid;
		gap: 0.6rem;
		padding: 1rem;
		min-width: 0;
	}
	.tp-role-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		gap: 0.5rem;
	}
	.tp-role {
		display: grid;
		gap: 0.25rem;
	}
	.tp-role-title,
	.tp-k {
		font-family: var(--font-mono);
		font-size: var(--fs-meta);
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-2, var(--dim));
	}
	.tp-role select,
	.tp-fields select {
		min-height: 44px;
		width: 100%;
	}
	.tp-pick {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}
	.tp-pick-key {
		min-height: 44px;
		text-transform: none;
		letter-spacing: 0;
		font-family: var(--font-display);
	}
	.tp-checkin-go {
		justify-self: start;
		min-height: 44px;
	}
	.tp-scroll {
		overflow-x: auto;
		max-width: 100%;
		border-radius: 0.5rem;
	}
	.tp-grid {
		display: grid;
		grid-template-columns: 7.5rem repeat(var(--cols), minmax(4.6rem, 1fr));
		min-width: max-content;
	}
	.tp-corner,
	.tp-rowname {
		position: sticky;
		left: 0;
		z-index: 1;
		background: var(--bg1, #1b2026);
	}
	.tp-day {
		font-family: var(--font-mono);
		font-size: var(--fs-label);
		padding: 0.3rem 0.25rem;
		color: var(--text-2, var(--dim));
		text-align: center;
		border-bottom: 1px solid color-mix(in srgb, var(--dim) 30%, transparent);
	}
	.tp-day.today {
		color: var(--green);
	}
	.tp-rowname {
		font-family: var(--font-display);
		font-weight: 600;
		padding: 0.4rem 0.4rem;
		color: var(--text-1, var(--white));
		border-bottom: 1px solid color-mix(in srgb, var(--dim) 18%, transparent);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tp-cell {
		display: grid;
		align-content: start;
		gap: 0.2rem;
		padding: 0.25rem;
		min-height: 2.6rem;
		border-bottom: 1px solid color-mix(in srgb, var(--dim) 18%, transparent);
		border-left: 1px solid color-mix(in srgb, var(--dim) 10%, transparent);
		position: relative;
	}
	.tp-cell.today {
		background: color-mix(in srgb, var(--green) 8%, transparent);
		box-shadow: inset 2px 0 0 color-mix(in srgb, var(--green) 70%, transparent);
	}
	.tp-cell.line {
		box-shadow: inset -2px 0 0 color-mix(in srgb, var(--cyan, var(--dim)) 75%, transparent);
	}
	.tp-block {
		font: inherit;
		font-family: var(--font-display);
		font-size: var(--fs-meta);
		line-height: 1.15;
		text-align: left;
		padding: 0.25rem 0.35rem;
		border-radius: 0.35rem;
		border: 1px solid color-mix(in srgb, var(--dim) 40%, transparent);
		background: color-mix(in srgb, var(--bg0) 75%, transparent);
		color: var(--text-1, var(--white));
		cursor: pointer;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}
	.tp-block:is(.st-done, .st-behind, .st-blocked, .st-on-it) {
		border-color: var(--st-edge);
	}
	.tp-legend {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 1rem;
		font-family: var(--font-display);
		color: var(--text-2, var(--dim));
	}
	.tp-line-mark {
		display: inline-block;
		width: 2px;
		height: 0.9rem;
		margin-right: 0.4rem;
		vertical-align: middle;
		background: var(--cyan, var(--dim));
	}
	.tp-task-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.3rem;
	}
	.tp-task-row {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.1rem 0.6rem;
		width: 100%;
		min-height: 44px;
		padding: 0.45rem 0.55rem;
		text-align: left;
		font: inherit;
		color: inherit;
		background: color-mix(in srgb, var(--bg0) 50%, transparent);
		border: 1px solid color-mix(in srgb, var(--dim) 22%, transparent);
		border-radius: 0.55rem;
		cursor: pointer;
	}
	.tp-task-title {
		font-family: var(--font-display);
		font-weight: 600;
		color: var(--text-1, var(--white));
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.tp-task-meta {
		grid-column: 2;
		font-family: var(--font-display);
		font-size: var(--fs-caption);
		color: var(--text-2, var(--dim));
	}
	.tp-task-row :global(.tp-status) {
		grid-row: span 2;
		align-self: center;
	}
	.tp-task-edit {
		display: grid;
		gap: 0.5rem;
		padding: 0.6rem 0.2rem 0.4rem;
	}
	.tp-fields {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
		gap: 0.5rem;
	}
	.tp-fields label {
		display: grid;
		gap: 0.2rem;
	}
	.tp-block-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.tp-reason {
		flex: 1 1 14rem;
		min-height: 44px;
	}
	.tp-blocked {
		margin: 0;
		color: var(--amber);
		font-family: var(--font-display);
	}
	.tp-add {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) auto;
		gap: 0.5rem;
		align-items: end;
		padding-top: 0.6rem;
		border-top: 1px solid color-mix(in srgb, var(--dim) 22%, transparent);
	}
	.tp-add .section-label {
		grid-column: 1 / -1;
	}
	.tp-add > * {
		min-height: 44px;
		min-width: 0;
	}
	.tp-cps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}
	.tp-cp {
		display: grid;
		gap: 0.35rem;
		padding: 0.6rem 0.7rem;
		border-radius: 0.6rem;
		border: 1px solid color-mix(in srgb, var(--dim) 25%, transparent);
	}
	.tp-cp[data-state='approved'] {
		border-color: color-mix(in srgb, var(--green) 55%, transparent);
	}
	.tp-cp-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.tp-cp-title {
		font-family: var(--font-display);
		font-size: var(--fs-body);
		color: var(--text-1, var(--white));
	}
	.tp-cp-date {
		font-family: var(--font-mono);
		font-size: var(--fs-meta);
		color: var(--text-2, var(--dim));
		margin-right: auto;
	}
	.tp-cp-gate,
	.tp-cp-stamp,
	.tp-cp-back {
		margin: 0;
		font-family: var(--font-display);
	}
	.tp-cp-gate {
		color: var(--amber);
	}
	.tp-cp-stamp {
		color: var(--green);
	}
	.tp-cp-back {
		color: var(--amber);
	}
	.tp-cp-items {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.2rem;
		font-family: var(--font-display);
		color: var(--text-1, var(--white));
	}
	.tp-cp-mark {
		display: inline-block;
		width: 1.1rem;
		color: var(--text-2, var(--dim));
	}
	.tp-cp-items li.ok .tp-cp-mark {
		color: var(--green);
	}
	.tp-hints {
		margin: 0;
		padding-left: 1.1rem;
		font-family: var(--font-display);
		font-size: var(--fs-ui);
		color: var(--amber);
	}
	.tp-cp-missing {
		display: block;
		margin-top: 0.2rem;
		font-family: var(--font-display);
		font-size: var(--fs-sm);
		color: var(--text-1, var(--white));
	}
	.tp-cp-kind {
		margin-left: 0.4rem;
		font-family: var(--font-mono);
		font-size: var(--fs-label);
		color: var(--text-2, var(--dim));
	}
	.tp-cp-items li.no .tp-cp-kind {
		color: var(--amber);
	}
	.tp-request {
		justify-self: start;
		min-height: 44px;
	}
	@media (max-width: 640px) {
		.tp-stats {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.tp-add {
			grid-template-columns: 1fr 1fr;
		}
		.tp-add-title {
			grid-column: 1 / -1;
		}
		.tp-grid {
			grid-template-columns: 5.5rem repeat(var(--cols), minmax(4.2rem, 1fr));
		}
	}
</style>
