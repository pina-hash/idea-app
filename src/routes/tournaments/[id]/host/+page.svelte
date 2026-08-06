<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import EntryChip from '$lib/tournaments/EntryChip.svelte';
	import EntryStyleEditor from '$lib/tournaments/EntryStyleEditor.svelte';
	import ResultForm from '$lib/tournaments/ResultForm.svelte';
	import ForfeitForm from '$lib/tournaments/ForfeitForm.svelte';
	import RewardRulesEditor from '$lib/tournaments/RewardRulesEditor.svelte';
	import { styleMap, type EntryStyleDraft } from '$lib/tournaments/entry-styles';
	import {
		entryMap,
		matchHref,
		parseConfig,
		roundLabel,
		statusLabel,
		isByeMatch,
		isForfeitMatch,
		type BracketMatch
	} from '$lib/tournaments/tournaments';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const t = $derived(data.tournament);
	const config = $derived(parseConfig(t.config));
	const entries = $derived(entryMap(data.entries));
	const styles = $derived(styleMap(data.entryStyles));
	const preBracket = $derived(t.status !== 'live' && t.status !== 'complete');

	let busy = $state(false);
	let actionError = $state('');
	let notice = $state('');

	/** Runs an RPC, surfaces its error, refetches on success. (PromiseLike:
	 * supabase query builders are thenables, not real Promises.) */
	async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, done = '') {
		actionError = '';
		notice = '';
		busy = true;
		const { error } = await fn();
		busy = false;
		if (error) {
			actionError = error.message;
			return false;
		}
		notice = done;
		await invalidateAll();
		return true;
	}

	/**
	 * The three bracket mutations that can newly pair a match (generate,
	 * submit, correct) go through /api/tournament-push instead of a direct
	 * RPC: the server runs the SAME RPC under this session's cookie, then
	 * pushes "your next match is set" to both competitors of every
	 * newly-paired match in the same request. Adapted to run()'s
	 * { error } shape so all the existing feedback plumbing applies.
	 */
	const callPush =
		(payload: Record<string, unknown>) =>
		async (): Promise<{ error: { message: string } | null }> => {
			try {
				const res = await fetch('/api/tournament-push', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(payload)
				});
				const out = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
				if (!res.ok || !out.ok) {
					return { error: { message: out.error ?? `Request failed (${res.status}).` } };
				}
				return { error: null };
			} catch (e) {
				return { error: { message: e instanceof Error ? e.message : String(e) } };
			}
		};

	async function ping(matchId: string, entryId: string, entryName: string) {
		actionError = '';
		notice = '';
		busy = true;
		try {
			const res = await fetch('/api/tournament-push', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'ping', matchId, entryId })
			});
			const out = (await res.json().catch(() => ({}))) as {
				ok?: boolean;
				sent?: number;
				note?: string;
				error?: string;
			};
			if (!res.ok || !out.ok) {
				actionError = out.error ?? `Ping failed (${res.status}).`;
			} else if (!out.sent) {
				notice = out.note ?? `${entryName} has no subscribed devices.`;
			} else {
				notice = `Pinged ${entryName}.`;
			}
		} catch (e) {
			actionError = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	// Keep co-hosts in sync live.
	onMount(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const kick = () => {
			clearTimeout(timer);
			timer = setTimeout(() => invalidateAll(), 200);
		};
		let channel = data.supabase.channel(`tournament-host-${t.id}`);
		for (const table of [
			'tournament_entries',
			'tournament_qual_matches',
			'tournament_bracket_matches',
			'tournament_match_games',
			'tournament_reward_rules',
			'tournament_reward_ledger'
		]) {
			channel = channel.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table, filter: `tournament_id=eq.${t.id}` },
				kick
			);
		}
		channel = channel.on(
			'postgres_changes',
			{ event: '*', schema: 'public', table: 'tournaments', filter: `id=eq.${t.id}` },
			kick
		);
		channel.subscribe();
		return () => {
			clearTimeout(timer);
			data.supabase.removeChannel(channel);
		};
	});

	// --- entries ---
	let walkName = $state('');
	let walkDescription = $state('');
	let confirmRemoveId = $state<string | null>(null);

	/**
	 * Banner styling for WALK-UP entries only. A linked player's banner is
	 * their own identity and the RPC refuses a host edit to it; the console
	 * therefore only offers the editor on entries with no linked account.
	 */
	let stylingId = $state<string | null>(null);
	let styleBusy = $state(false);
	let styleError = $state('');

	async function saveStyle(entryId: string, draft: EntryStyleDraft) {
		styleError = '';
		styleBusy = true;
		const { error } = await data.supabase.rpc('tournament_set_entry_style', {
			p_entry_id: entryId,
			p_background_type: draft.background_type,
			p_background_value: draft.background_value,
			p_accent_color: draft.accent_color,
			p_badge: draft.badge,
			p_flourish: draft.flourish,
			p_tagline: draft.tagline
		});
		styleBusy = false;
		if (error) {
			styleError = error.message;
			return;
		}
		await invalidateAll();
	}

	// --- invites / hosts ---
	let inviteEmail = $state('');
	let cohostEmail = $state('');

	// --- quals ---
	let poolCount = $state(2);
	let qualA = $state<Record<string, string>>({});
	let qualB = $state<Record<string, string>>({});

	// --- match control ---
	let correctingId = $state<string | null>(null);
	/** Forfeit is a separate, explicitly opened panel: see ForfeitForm. */
	let forfeitingId = $state<string | null>(null);

	const setStatus = (status: string) =>
		run(
			() => data.supabase.rpc('tournament_set_status', { p_tournament_id: t.id, p_status: status }),
			`Status: ${statusLabel(status)}`
		);

	const bracketByState = $derived.by(() => {
		const rows = [...data.bracketMatches].sort(
			(a, b) =>
				['winners', 'losers', 'grand_final', 'grand_final_reset'].indexOf(a.bracket) -
					['winners', 'losers', 'grand_final', 'grand_final_reset'].indexOf(b.bracket) ||
				a.round - b.round ||
				a.slot - b.slot
		);
		return {
			ready: rows.filter(
				(m) => m.status === 'pending' && m.entry_a_id !== null && m.entry_b_id !== null
			),
			waiting: rows.filter(
				(m) => m.status === 'pending' && (m.entry_a_id === null || m.entry_b_id === null)
			),
			inProgress: rows.filter((m) => m.status === 'in_progress'),
			completed: rows.filter((m) => m.status === 'complete' && !isByeMatch(m))
		};
	});

	function maxRound(bracket: string): number {
		return Math.max(0, ...data.bracketMatches.filter((m) => m.bracket === bracket).map((m) => m.round));
	}
	const matchLabel = (m: BracketMatch) =>
		`${roundLabel(m.bracket, m.round, maxRound(m.bracket))} · M${m.slot}`;

	async function submitQualScore(matchId: string) {
		const a = Number.parseInt(qualA[matchId] ?? '', 10);
		const b = Number.parseInt(qualB[matchId] ?? '', 10);
		if (Number.isNaN(a) || Number.isNaN(b)) {
			actionError = 'Enter both scores.';
			return;
		}
		await run(
			() =>
				data.supabase.rpc('tournament_submit_qual_result', {
					p_qual_match_id: matchId,
					p_score_a: a,
					p_score_b: b
				}),
			'Result recorded'
		);
	}

	const submitQualWinner = (matchId: string, winnerId: string) =>
		run(
			() =>
				data.supabase.rpc('tournament_submit_qual_result', {
					p_qual_match_id: matchId,
					p_winner_id: winnerId
				}),
			'Result recorded'
		);

	const submitResult = (matchId: string) => (result: unknown) =>
		run(
			callPush({ action: 'submit-result', tournamentId: t.id, matchId, result }),
			'Result recorded'
		);

	/**
	 * A forfeit rides the SAME submit action as a normal result -- it is a
	 * match result, just one carrying a winner and a reason instead of games
	 * -- so it also goes through /api/tournament-push and the newly-paired
	 * competitors downstream still get their "your next match is set" alert.
	 */
	const submitForfeit = (matchId: string) => async (result: unknown) => {
		const okDone = await run(
			callPush({ action: 'submit-result', tournamentId: t.id, matchId, result }),
			'Forfeit recorded'
		);
		if (okDone) forfeitingId = null;
	};

	const correctResult = (matchId: string) => async (result: unknown, reason: string) => {
		const okDone = await run(
			callPush({ action: 'correct-result', tournamentId: t.id, matchId, result, reason }),
			'Correction applied'
		);
		if (okDone) correctingId = null;
	};
</script>

<svelte:head>
	<title>Host · {t.name} // Tournaments // IDEA</title>
</svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/tournaments/{t.id}/tv">TV mode</a>
		<a class="btn secondary" href="/tournaments/{t.id}">&lsaquo; Live view</a>
		<ProfileMenu />
	</div>
</div>

<main class="host-page">
	<section class="hero">
		<div class="eyebrow">Host console · {data.hostCount} host{data.hostCount === 1 ? '' : 's'}</div>
		<h1>{t.name}</h1>
		<p class="lead">
			Status: <strong>{statusLabel(t.status)}</strong>
			· {config.quals_enabled ? 'Qualifying pools on' : 'No qualifying'}
			· {config.score_entry ? 'Score entry' : 'Win/loss entry'}
		</p>
	</section>

	{#if actionError}<p class="feedback error">{actionError}</p>{/if}
	{#if notice}<p class="feedback notice">{notice}</p>{/if}

	{#snippet pingButtons(m: BracketMatch)}
		{#each [m.entry_a_id, m.entry_b_id] as eid (eid)}
			{#if eid && entries[eid]?.user_id}
				<button
					class="mini"
					disabled={busy}
					title="Send this player a push notification now"
					onclick={() => ping(m.id, eid, entries[eid]?.display_name ?? '')}
				>
					ping {entries[eid].display_name}
				</button>
			{/if}
		{/each}
	{/snippet}

	<section class="card">
		<h2>Phase</h2>
		<div class="btn-row">
			{#if t.status === 'draft'}
				<button class="btn" disabled={busy} onclick={() => setStatus('registration_open')}>
					Open registration
				</button>
			{:else if t.status === 'registration_open'}
				<button class="btn" disabled={busy} onclick={() => setStatus('seeding')}>
					Close registration (seeding)
				</button>
			{:else if t.status === 'seeding'}
				<button class="btn secondary" disabled={busy} onclick={() => setStatus('registration_open')}>
					Reopen registration
				</button>
				{#if config.quals_enabled}
					<label class="pool-count">
						Pools
						<input type="number" min="1" max="8" bind:value={poolCount} />
					</label>
					<button
						class="btn"
						disabled={busy}
						onclick={() =>
							run(
								() =>
									data.supabase.rpc('tournament_generate_qual_pools', {
										p_tournament_id: t.id,
										p_pool_count: poolCount
									}),
								'Pools generated'
							)}
					>
						Generate pools
					</button>
				{/if}
				<button
					class="btn"
					disabled={busy}
					onclick={() =>
						run(
							callPush({ action: 'generate-bracket', tournamentId: t.id }),
							'Bracket generated'
						)}
				>
					Generate bracket
				</button>
			{:else if t.status === 'live'}
				<span class="phase-note">Bracket is live. Run matches below.</span>
			{:else}
				<span class="phase-note">Tournament complete.</span>
			{/if}
		</div>
	</section>

	<section class="card">
		<h2>Entries ({data.entries.length})</h2>
		{#if preBracket}
			<div class="add-row">
				<input type="text" maxlength="40" placeholder="Walk-up display name" bind:value={walkName} />
				<input
					type="text"
					maxlength="200"
					placeholder="Description (optional)"
					bind:value={walkDescription}
				/>
				<button
					class="btn"
					disabled={busy || !walkName.trim()}
					onclick={async () => {
						const okDone = await run(
							() =>
								data.supabase.rpc('tournament_host_add_entry', {
									p_tournament_id: t.id,
									p_display_name: walkName.trim(),
									p_description: walkDescription.trim()
								}),
							'Entry added'
						);
						if (okDone) {
							walkName = '';
							walkDescription = '';
						}
					}}
				>
					Add entry
				</button>
				<button
					class="btn secondary"
					disabled={busy || data.entries.length < 2}
					onclick={() =>
						run(
							() => data.supabase.rpc('tournament_shuffle_seeds', { p_tournament_id: t.id }),
							'Seeds shuffled'
						)}
				>
					Shuffle seeds
				</button>
			</div>
		{/if}
		<div class="entry-list">
			{#each data.entries as e, i (e.id)}
				<div class="entry-row">
					<span class="seed-cell">{e.seed ?? '·'}</span>
					<EntryChip entry={e} style={styles[e.id] ?? null} />
					{#if e.user_id}
						<span class="linked-tag">linked account</span>
					{:else}
						<button
							class="mini"
							disabled={busy}
							title="Set this walk-up entry's banner"
							onclick={() => (stylingId = stylingId === e.id ? null : e.id)}
						>
							{stylingId === e.id ? 'close banner' : 'banner'}
						</button>
					{/if}
					{#if preBracket}
						<span class="row-actions">
							<button
								class="mini"
								title="Move up"
								disabled={busy || i === 0}
								onclick={() =>
									run(() =>
										data.supabase.rpc('tournament_reorder_seed', {
											p_tournament_id: t.id,
											p_entry_id: e.id,
											p_new_position: (e.seed ?? i + 1) - 1
										})
									)}
							>
								↑
							</button>
							<button
								class="mini"
								title="Move down"
								disabled={busy || i === data.entries.length - 1}
								onclick={() =>
									run(() =>
										data.supabase.rpc('tournament_reorder_seed', {
											p_tournament_id: t.id,
											p_entry_id: e.id,
											p_new_position: (e.seed ?? i + 1) + 1
										})
									)}
							>
								↓
							</button>
							{#if confirmRemoveId === e.id}
								<button
									class="mini danger"
									disabled={busy}
									onclick={async () => {
										confirmRemoveId = null;
										await run(
											() => data.supabase.rpc('tournament_remove_entry', { p_entry_id: e.id }),
											'Entry removed'
										);
									}}
								>
									confirm
								</button>
								<button class="mini" onclick={() => (confirmRemoveId = null)}>cancel</button>
							{:else}
								<button class="mini" disabled={busy} onclick={() => (confirmRemoveId = e.id)}>
									remove
								</button>
							{/if}
						</span>
					{/if}
				</div>
				{#if stylingId === e.id}
					<div class="style-row">
						<EntryStyleEditor
							entry={e}
							style={styles[e.id] ?? null}
							busy={styleBusy}
							error={styleError}
							note="Walk-up banner. A player with a linked account sets their own from the live view."
							onsave={(draft) => saveStyle(e.id, draft)}
						/>
					</div>
				{/if}
			{/each}
		</div>
		<p class="note">
			You can style walk-up entries added by hand. A player with a linked account owns their own
			banner and sets it from the live view.
		</p>
	</section>

	<section class="card">
		<h2>Invites & co-hosts</h2>
		<div class="add-row">
			<input type="email" placeholder="Invite by account email" bind:value={inviteEmail} />
			<button
				class="btn"
				disabled={busy || !inviteEmail.trim()}
				onclick={async () => {
					const okDone = await run(
						() =>
							data.supabase.rpc('tournament_send_invite', {
								p_tournament_id: t.id,
								p_email: inviteEmail.trim()
							}),
						'Invite sent'
					);
					if (okDone) inviteEmail = '';
				}}
			>
				Send invite
			</button>
		</div>
		{#if data.invites.length}
			<div class="invite-list">
				{#each data.invites as inv (inv.id)}
					<div class="invite-row">
						<span class="mono">…{inv.invited_user_id.slice(-6)}</span>
						<span class="inv-status {inv.status}">{inv.status}</span>
					</div>
				{/each}
			</div>
		{/if}
		<div class="add-row">
			<input type="email" placeholder="Add co-host by account email" bind:value={cohostEmail} />
			<button
				class="btn secondary"
				disabled={busy || !cohostEmail.trim()}
				onclick={async () => {
					const okDone = await run(
						() =>
							data.supabase.rpc('tournament_add_host', {
								p_tournament_id: t.id,
								p_email: cohostEmail.trim()
							}),
						'Co-host added'
					);
					if (okDone) cohostEmail = '';
				}}
			>
				Add co-host
			</button>
		</div>
		<p class="note">
			Invitees and co-hosts appear by opaque id only; participants are always shown by their
			chosen display name, never an account name.
		</p>
	</section>

	{#if config.quals_enabled && data.qualMatches.length}
		<section class="card">
			<h2>Qualifying results</h2>
			<p class="note">
				{config.score_entry
					? 'Enter both scores; the winner is derived.'
					: 'Pick each match winner.'}
				Results can be re-entered until the bracket is generated.
			</p>
			<div class="qual-grid">
				{#each data.qualMatches as m (m.id)}
					<div class="qual-row" class:decided={m.winner_id !== null}>
						<span class="qual-vs">
							{entries[m.entry_a_id]?.display_name ?? '?'}
							<span class="vs-sep">vs</span>
							{entries[m.entry_b_id]?.display_name ?? '?'}
						</span>
						{#if m.winner_id}
							<span class="qual-result">
								{#if m.score_a !== null && m.score_b !== null}{m.score_a}–{m.score_b} ·{/if}
								{entries[m.winner_id]?.display_name} won
							</span>
						{/if}
						{#if t.status === 'seeding'}
							{#if config.score_entry}
								<span class="qual-entry">
									<input type="number" min="0" placeholder="A" bind:value={qualA[m.id]} />
									<input type="number" min="0" placeholder="B" bind:value={qualB[m.id]} />
									<button class="mini" disabled={busy} onclick={() => submitQualScore(m.id)}>
										save
									</button>
								</span>
							{:else}
								<span class="qual-entry">
									<button
										class="mini"
										disabled={busy}
										onclick={() => submitQualWinner(m.id, m.entry_a_id)}
									>
										{entries[m.entry_a_id]?.display_name} won
									</button>
									<button
										class="mini"
										disabled={busy}
										onclick={() => submitQualWinner(m.id, m.entry_b_id)}
									>
										{entries[m.entry_b_id]?.display_name} won
									</button>
								</span>
							{/if}
						{/if}
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<section class="card">
		<h2>Rewards</h2>
		<RewardRulesEditor
			rules={data.rewardRules}
			{busy}
			locked={t.status === 'complete'}
			onsave={(rules) =>
				run(
					() =>
						data.supabase.rpc('tournament_set_reward_rules', {
							p_tournament_id: t.id,
							p_rules: rules
						}),
					'Reward rules saved'
				)}
		/>
	</section>

	{#if data.bracketMatches.length}
		<section class="card">
			<h2>Match control</h2>

			{#if bracketByState.inProgress.length}
				<h3 class="mc-sub live-sub">In progress</h3>
				{#each bracketByState.inProgress as m (m.id)}
					<div class="mc-block">
						<div class="mc-row slim">
							<span class="mc-label">{matchLabel(m)}</span>
							{@render pingButtons(m)}
							<button
								class="mini gold"
								disabled={busy}
								title="Award this match without it being played"
								onclick={() => (forfeitingId = forfeitingId === m.id ? null : m.id)}
							>
								{forfeitingId === m.id ? 'cancel forfeit' : 'forfeit'}
							</button>
						</div>
						{#if forfeitingId === m.id}
							<ForfeitForm
								match={m}
								{entries}
								{busy}
								onsubmit={submitForfeit(m.id)}
								oncancel={() => (forfeitingId = null)}
							/>
						{:else}
							<ResultForm
								match={m}
								{entries}
								scoreEntry={config.score_entry}
								{busy}
								onsubmit={submitResult(m.id)}
							/>
						{/if}
					</div>
				{/each}
			{/if}

			{#if bracketByState.ready.length}
				<h3 class="mc-sub">Ready to start</h3>
				{#each bracketByState.ready as m (m.id)}
					<div class="mc-row">
						<span class="mc-label">{matchLabel(m)}</span>
						<span class="mc-vs">
							{entries[m.entry_a_id ?? '']?.display_name}
							<span class="vs-sep">vs</span>
							{entries[m.entry_b_id ?? '']?.display_name}
						</span>
						<span class="row-actions">
							{@render pingButtons(m)}
							<button
								class="mini gold"
								disabled={busy}
								title="Nobody turned up: award it without starting the clock"
								onclick={() => (forfeitingId = forfeitingId === m.id ? null : m.id)}
							>
								{forfeitingId === m.id ? 'cancel forfeit' : 'forfeit'}
							</button>
							<button
								class="btn"
								disabled={busy}
								onclick={() =>
									run(
										() => data.supabase.rpc('tournament_start_match', { p_match_id: m.id }),
										'Match started'
									)}
							>
								Start
							</button>
						</span>
					</div>
					{#if forfeitingId === m.id}
						<div class="mc-block">
							<ForfeitForm
								match={m}
								{entries}
								{busy}
								onsubmit={submitForfeit(m.id)}
								oncancel={() => (forfeitingId = null)}
							/>
						</div>
					{/if}
				{/each}
			{/if}

			{#if bracketByState.waiting.length}
				<h3 class="mc-sub">Waiting on earlier results</h3>
				<p class="note">
					{bracketByState.waiting.length} match{bracketByState.waiting.length === 1 ? '' : 'es'}
					still missing a participant.
				</p>
			{/if}

			{#if bracketByState.completed.length}
				<h3 class="mc-sub">Completed</h3>
				{#each bracketByState.completed as m (m.id)}
					<div class="mc-row done">
						<span class="mc-label">
							<a class="mc-link" href={matchHref(t.id, m.id)}>{matchLabel(m)}</a>
						</span>
						<span class="mc-vs">
							{entries[m.entry_a_id ?? '']?.display_name}
							<span class="vs-sep">vs</span>
							{entries[m.entry_b_id ?? '']?.display_name}
							<span class="mc-winner">→ {entries[m.winner_id ?? '']?.display_name}</span>
							{#if isForfeitMatch(m)}
								<span class="ff-tag" title={m.forfeit_reason ?? ''}>by forfeit</span>
							{/if}
						</span>
						<button
							class="mini"
							onclick={() => (correctingId = correctingId === m.id ? null : m.id)}
						>
							{correctingId === m.id ? 'cancel' : 'correct'}
						</button>
					</div>
					{#if correctingId === m.id}
						<div class="mc-block">
							<ResultForm
								match={m}
								{entries}
								scoreEntry={config.score_entry}
								mode="correct"
								{busy}
								onsubmit={correctResult(m.id)}
							/>
						</div>
					{/if}
				{/each}
			{/if}
		</section>
	{/if}
</main>

<style>
	.host-page {
		max-width: 60rem;
		margin: 0 auto;
		padding: 0 1.2rem 3rem;
	}
	.host-page > .card {
		margin-bottom: 1.1rem;
	}
	.host-page h2 {
		margin-top: 0;
	}
	.feedback {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
		padding: 0.45rem 0.7rem;
		border-radius: 5px;
	}
	.feedback.error {
		color: var(--amber);
		border: 1px solid var(--amber);
	}
	.feedback.notice {
		color: var(--green);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.25));
	}
	.phase-note {
		color: var(--dim);
	}
	.pool-count {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--dim);
	}
	.pool-count input {
		width: 3.4rem;
	}
	input[type='text'],
	input[type='email'],
	input[type='number'] {
		background: var(--bg0);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.25));
		border-radius: 4px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		padding: 0.4rem 0.55rem;
	}
	.add-row {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-bottom: 0.8rem;
	}
	.add-row input {
		flex: 1;
		min-width: 11rem;
	}
	.entry-list {
		display: flex;
		flex-direction: column;
	}
	.entry-row {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 0.35rem 0;
		border-bottom: 1px solid var(--line, rgba(0, 255, 65, 0.08));
	}
	.seed-cell {
		width: 1.6rem;
		text-align: right;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--cyan);
		flex: none;
	}
	.style-row {
		padding: 0.8rem 0 1rem 2.3rem;
		border-bottom: 1px solid var(--line, rgba(0, 255, 65, 0.08));
	}
	.linked-tag {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		color: var(--dim);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.18));
		border-radius: 999px;
		padding: 0.05rem 0.45rem;
	}
	.row-actions {
		margin-left: auto;
		display: flex;
		gap: 0.3rem;
	}
	.mini {
		background: none;
		border: 1px solid var(--line, rgba(0, 255, 65, 0.25));
		border-radius: 4px;
		color: var(--dim);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		padding: 0.15rem 0.5rem;
		cursor: pointer;
	}
	.mini:hover:not(:disabled) {
		color: var(--white);
		border-color: var(--green);
	}
	.mini:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.mini.danger {
		color: var(--crimson);
		border-color: var(--crimson);
	}
	/* Forfeit is the exception path, in the exception colour everywhere: gold,
	 * never the primary action's green. */
	.mini.gold {
		color: var(--gold);
		border-color: rgba(200, 168, 72, 0.45);
	}
	.mini.gold:hover:not(:disabled) {
		color: var(--gold);
		border-color: var(--gold);
	}
	.ff-tag {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--gold);
		margin-left: 0.5rem;
	}
	.mc-link {
		color: var(--dim);
	}
	.invite-list {
		margin-bottom: 0.8rem;
	}
	.invite-row {
		display: flex;
		gap: 0.8rem;
		align-items: center;
		padding: 0.2rem 0;
	}
	.mono {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		color: var(--dim);
	}
	.inv-status {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.inv-status.pending {
		color: var(--gold);
	}
	.inv-status.accepted {
		color: var(--green);
	}
	.inv-status.declined {
		color: var(--dim);
	}
	.note {
		color: var(--dim);
		font-size: 0.85rem;
	}
	.qual-grid {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.qual-row {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		flex-wrap: wrap;
		padding: 0.3rem 0;
		border-bottom: 1px solid var(--line, rgba(0, 255, 65, 0.08));
	}
	.qual-vs {
		font-weight: 700;
	}
	.vs-sep {
		color: var(--dim);
		font-weight: 400;
	}
	.qual-result {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--gold);
	}
	.qual-entry {
		margin-left: auto;
		display: flex;
		gap: 0.35rem;
		align-items: center;
	}
	.qual-entry input {
		width: 4rem;
	}
	.mc-sub {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--cyan);
		margin: 1rem 0 0.4rem;
	}
	.mc-sub.live-sub {
		color: var(--crimson);
	}
	.mc-row {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		flex-wrap: wrap;
		padding: 0.3rem 0;
		border-bottom: 1px solid var(--line, rgba(0, 255, 65, 0.08));
	}
	.mc-row.done {
		opacity: 0.85;
	}
	.mc-row.slim {
		border-bottom: none;
		padding: 0 0 0.2rem;
	}
	.mc-row.slim .mini {
		margin-left: 0;
	}
	.mc-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--dim);
		min-width: 11rem;
	}
	.mc-vs {
		font-weight: 700;
	}
	.mc-winner {
		color: var(--green);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		margin-left: 0.4rem;
	}
	.mc-row .btn,
	.mc-row .mini {
		margin-left: auto;
	}
	.mc-block {
		margin: 0.4rem 0 0.8rem;
	}
	.mc-block .mc-label {
		margin-bottom: 0.3rem;
	}
</style>
