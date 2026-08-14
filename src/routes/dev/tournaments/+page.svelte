<script lang="ts">
	import BracketView from '$lib/tournaments/BracketView.svelte';
	import PoolsView from '$lib/tournaments/PoolsView.svelte';
	import RewardRulesEditor from '$lib/tournaments/RewardRulesEditor.svelte';
	import RewardsPanel from '$lib/tournaments/RewardsPanel.svelte';
	import TournamentQr from '$lib/tournaments/TournamentQr.svelte';
	import EntryBanner from '$lib/tournaments/EntryBanner.svelte';
	import EntryStyleEditor from '$lib/tournaments/EntryStyleEditor.svelte';
	import TvStage from '$lib/tournaments/TvStage.svelte';
	import TournamentStats from '$lib/tournaments/TournamentStats.svelte';
	import MatchDetail from '$lib/tournaments/MatchDetail.svelte';
	import EntryDetail from '$lib/tournaments/EntryDetail.svelte';
	import ForfeitForm from '$lib/tournaments/ForfeitForm.svelte';
	import DeleteTournament from '$lib/tournaments/DeleteTournament.svelte';
	import {
		entryMap,
		entryBracketRecord,
		isByeMatch,
		isForfeitMatch,
		matchTimeline,
		tournamentStats,
		type BracketMatch,
		type Tournament
	} from '$lib/tournaments/tournaments';
	import { hasStyle, type EntryStyle, type EntryStyleDraft } from '$lib/tournaments/entry-styles';
	import {
		buildSim,
		buildQualSample,
		correctLast,
		eventsFor,
		forfeitNext,
		playNext,
		setSimRewardRules,
		startNext,
		type Sim
	} from './sim';

	let fieldSize = $state(6);
	let sim = $state<Sim>(buildSim(6));
	let linkMatches = $state(false);
	const qual = buildQualSample();

	const entries = $derived(entryMap(sim.entries));
	const qualEntries = entryMap(qual.entries);

	function rebuild(n: number) {
		fieldSize = n;
		const rules = sim.rewardRules;
		sim = buildSim(n);
		// Keep the configured reward rules across a rebuild so play-all can be
		// repeated against the same configuration.
		sim.rewardRules = rules;
	}

	// --- 2b: banner styles + TV mode ---
	/** In-memory mirror of tournament_set_entry_style's full-replacement +
	 * clear-when-empty behavior, so the REAL editor drives the REAL renderers
	 * with no Supabase. */
	function saveStyle(entryId: string, draft: EntryStyleDraft) {
		const empty =
			!draft.background_type &&
			!draft.accent_color &&
			!draft.badge &&
			!draft.flourish &&
			!draft.tagline;
		const next = { ...sim.styles };
		if (empty) delete next[entryId];
		else
			next[entryId] = {
				entry_id: entryId,
				tournament_id: 'sim',
				...draft
			} as EntryStyle;
		sim.styles = next;
	}

	let editId = $state<string | null>(null);
	const editEntry = $derived(sim.entries.find((e) => e.id === editId) ?? sim.entries[0]);

	let tvStatus = $state<Tournament['status']>('live');
	const tvTournament = $derived<Tournament>({
		id: 'sim',
		name: 'Harness Invitational',
		description: '',
		config: {},
		status: tvStatus,
		champion_entry_id: tvStatus === 'complete' ? (sim.championId ?? sim.entries[0].id) : null,
		created_by: null,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString()
	});
	function playAll() {
		let guard = 0;
		while (guard++ < 300 && playNext(sim)) {
			/* run to champion */
		}
	}

	// --- 3a: detail pages, stats, forfeits ---
	const simTournament = $derived<Tournament>({
		id: 'sim',
		name: 'Harness Invitational',
		description: '',
		config: {},
		status: sim.status,
		champion_entry_id: sim.championId,
		created_by: null,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString()
	});

	/** Every match worth opening a detail page on, newest activity first. */
	const inspectable = $derived(
		sim.matches.filter((m) => m.status !== 'pending' || m.entry_a_id || m.entry_b_id)
	);
	let detailId = $state<string | null>(null);
	const detailMatch = $derived(
		sim.matches.find((m) => m.id === detailId) ??
			sim.matches.find((m) => m.status === 'complete' && !isByeMatch(m)) ??
			sim.matches[0]
	);

	let qualDetail = $state(false);
	const qualDetailMatch = qual.matches[0];

	let entryDetailId = $state<string | null>(null);
	const entryDetailEntry = $derived(
		sim.entries.find((e) => e.id === entryDetailId) ?? sim.entries[0]
	);

	/** Cross-checks the record and reward total against the raw rows. */
	const entryAudit = $derived.by(() => {
		const e = entryDetailEntry;
		if (!e) return null;
		const rec = entryBracketRecord(e.id, sim.matches);
		const rows = sim.ledger.filter((r) => r.entry_id === e.id);
		return {
			rec,
			ledgerRows: rows.length,
			ledgerTotal: rows.reduce((s, r) => s + r.amount, 0),
			forfeitLedgerRows: sim.matches
				.filter((m) => isForfeitMatch(m))
				.reduce((s, m) => s + sim.ledger.filter((r) => r.match_id === m.id).length, 0)
		};
	});

	const stats = $derived(tournamentStats(sim.matches));
	const forfeited = $derived(sim.matches.filter((m) => isForfeitMatch(m)));

	/** Drives the REAL ForfeitForm against the sim's forfeit path: it always
	 * targets the next startable match, which is what forfeitNext picks too. */
	const readyMatch = $derived(
		sim.matches.find(
			(m) =>
				(m.status === 'pending' || m.status === 'in_progress') &&
				m.entry_a_id !== null &&
				m.entry_b_id !== null
		) ?? null
	);
	let lastForfeitPayload = $state<string>('');

	// --- 0066: delete, 0068: payout-loss ack. In-memory mirror of
	// tournament_delete's rules, so the REAL control is driven end to end: the
	// name is required exactly when the tournament has entries, acknowledgment
	// is required exactly when the tournament has reward ledger rows (checked
	// BEFORE the name, matching the RPC's order), the caller must be a host or
	// a teacher, and a success wipes every tournament-scoped row.
	let deleteAsRole = $state<'host' | 'teacher' | 'student'>('host');
	let deleteEntries = $state(true);
	let deleteBusy = $state(false);
	let deleteError = $state('');
	let deleteLog = $state<string[]>([]);
	const deletable = $derived<Tournament>({ ...simTournament, name: 'Harness Invitational' });
	const deleteRewardCount = $derived(sim.ledger.length);
	const deleteRewardCoins = $derived(sim.ledger.reduce((s, r) => s + r.amount, 0));
	const deleteRewardEntries = $derived(new Set(sim.ledger.map((r) => r.entry_id)).size);

	function fakeDelete(confirmName: string, acknowledgePayoutLoss: boolean) {
		deleteError = '';
		deleteBusy = true;
		const entries = deleteEntries ? sim.entries.length : 0;
		const rewards = deleteRewardCount;
		setTimeout(() => {
			deleteBusy = false;
			if (deleteAsRole === 'student') {
				deleteError = 'Only a host of this tournament, or a teacher, can delete it.';
				deleteLog = [...deleteLog, 'REFUSED (not a host, not a teacher)'];
				return;
			}
			if (rewards > 0 && !acknowledgePayoutLoss) {
				deleteError = `This tournament has paid out ${deleteRewardCoins} IDEA Coins to ${deleteRewardEntries} entries as reward payouts. Acknowledge the payout loss to continue.`;
				deleteLog = [...deleteLog, 'REFUSED (payout loss not acknowledged)'];
				return;
			}
			if (
				entries > 0 &&
				confirmName.trim().toLowerCase() !== deletable.name.trim().toLowerCase()
			) {
				deleteError = `Type the tournament name exactly to confirm deletion: "${deletable.name}".`;
				deleteLog = [...deleteLog, `REFUSED (name "${confirmName}")`];
				return;
			}
			deleteLog = [
				...deleteLog,
				`DELETED as ${deleteAsRole} · confirm="${confirmName}" · ack=${acknowledgePayoutLoss} · ${entries} entries · ${rewards} reward rows`
			];
		}, 120);
	}
	function forceReset() {
		// Play everything up to the grand final, then hand game one to the LB side.
		let guard = 0;
		while (guard++ < 300) {
			const gf = sim.matches.find((m) => m.bracket === 'grand_final');
			if (gf && gf.status !== 'complete' && gf.entry_a_id && gf.entry_b_id) break;
			if (!playNext(sim)) break;
		}
		playNext(sim, 'b');
	}
</script>

<svelte:head>
	<title>DEV · Tournaments harness</title>
</svelte:head>

<main class="harness">
	<h1>Tournaments harness (dev)</h1>
	<p class="note">
		In-memory simulator mirroring the 0062 double-elimination rules, driving the real
		components. No auth, no Supabase.
	</p>

	<div class="controls">
		<span>Field:</span>
		{#each [2, 5, 6, 8, 11, 16] as n (n)}
			<button class="ctl" class:on={fieldSize === n} onclick={() => rebuild(n)}>{n}</button>
		{/each}
		<span class="sep"></span>
		<button class="ctl" onclick={() => startNext(sim)}>start next (LIVE)</button>
		<button class="ctl" onclick={() => playNext(sim)}>play next</button>
		<button class="ctl" onclick={() => forfeitNext(sim)}>forfeit next</button>
		<button class="ctl" onclick={() => (detailId = correctLast(sim) ?? detailId)}>
			correct last
		</button>
		<button class="ctl" onclick={playAll}>play all</button>
		<button class="ctl" onclick={forceReset}>force GF reset</button>
		<button class="ctl" onclick={() => rebuild(fieldSize)}>rebuild</button>
		<span class="state">
			{sim.status === 'complete' ? 'COMPLETE' : 'LIVE'} ·
			{sim.matches.filter((m) => m.status === 'complete').length}/{sim.matches.length} matches
		</span>
	</div>

	<section>
		<h2>BracketView · {fieldSize} entries</h2>
		<p class="note">
			Entries 1-5 carry sample 0064 styles (all three background types, four flourishes, accents
			across the wheel); the rest carry none, so the default treatment sits beside them. A
			forfeited match shows a dashed gold frame and an FF chip; a bye stays dimmed.
		</p>
		<div class="controls">
			<label class="chk">
				<input type="checkbox" bind:checked={linkMatches} /> link nodes to match detail
			</label>
			<span class="state">forfeited: {forfeited.length}</span>
		</div>
		<BracketView
			matches={sim.matches}
			{entries}
			styles={sim.styles}
			games={sim.games}
			championId={sim.championId}
			tournamentId={linkMatches ? 'sim' : null}
		/>
	</section>

	<section>
		<h2>TournamentStats · the secondary strip on the public page</h2>
		<p class="note">
			Play some matches, then check these against the raw stamps below. Byes and forfeits are
			excluded from every duration figure by design.
		</p>
		<TournamentStats tournamentId="sim" matches={sim.matches} {entries} />
		<div class="audit">
			<strong>Raw check</strong>
			<div>timed matches: {stats.timedCount}</div>
			<div>
				durations (s):
				{sim.matches
					.filter((m) => m.status === 'complete' && !isByeMatch(m) && !isForfeitMatch(m) && m.started_at && m.completed_at)
					.map((m) => Math.round((Date.parse(m.completed_at!) - Date.parse(m.started_at!)) / 1000))
					.join(', ') || '(none)'}
			</div>
			<div>average (s): {stats.averageDurationMs === null ? '—' : Math.round(stats.averageDurationMs / 1000)}</div>
			<div>
				span (s):
				{stats.totalDurationMs === null ? '—' : Math.round(stats.totalDurationMs / 1000)}
				({stats.firstStartedAt ?? '—'} → {stats.lastCompletedAt ?? '—'})
			</div>
		</div>
	</section>

	<section>
		<h2>MatchDetail · the real page body</h2>
		<div class="controls">
			<label class="chk">
				<input type="checkbox" bind:checked={qualDetail} /> qualifying match instead
			</label>
			{#if !qualDetail}
				<span>Match:</span>
				{#each inspectable.slice(0, 14) as m (m.id)}
					<button
						class="ctl"
						class:on={detailMatch?.id === m.id}
						onclick={() => (detailId = m.id)}
					>
						{m.bracket === 'winners'
							? 'W'
							: m.bracket === 'losers'
								? 'L'
								: m.bracket === 'grand_final'
									? 'GF'
									: 'GFR'}{m.bracket === 'winners' || m.bracket === 'losers'
							? `${m.round}-${m.slot}`
							: ''}{isForfeitMatch(m) ? ' ff' : isByeMatch(m) ? ' bye' : ''}
					</button>
				{/each}
			{/if}
		</div>
		{#if qualDetail}
			<MatchDetail
				tournament={simTournament}
				kind="qual"
				qualMatch={qualDetailMatch}
				qualPool={qual.pools.find((p) => p.id === qualDetailMatch.pool_id) ?? null}
				entries={qual.entries}
				events={qual.events.filter((e) => e.match_id === qualDetailMatch.id)}
			/>
		{:else if detailMatch}
			{@const tl = matchTimeline(eventsFor(sim, detailMatch.id), detailMatch)}
			<MatchDetail
				tournament={simTournament}
				kind="bracket"
				match={detailMatch}
				entries={sim.entries}
				styles={Object.values(sim.styles)}
				events={eventsFor(sim, detailMatch.id)}
				games={sim.games.filter((g) => g.bracket_match_id === detailMatch.id)}
				siblings={sim.matches}
				ledger={sim.ledger.filter((r) => r.match_id === detailMatch.id)}
			/>
			<div class="audit">
				<strong>Raw check</strong>
				<div>created {tl.createdAt ?? '—'}</div>
				<div>started {tl.startedAt ?? '—'}</div>
				<div>completed {tl.completedAt ?? '—'}</div>
				<div>
					wait {tl.waitMs === null ? '—' : Math.round(tl.waitMs / 1000) + 's'} · duration
					{tl.durationMs === null ? '—' : Math.round(tl.durationMs / 1000) + 's'}
				</div>
				<div>events {tl.events.length} · corrections {tl.corrections.length}</div>
				<div>ledger rows for this match: {sim.ledger.filter((r) => r.match_id === detailMatch.id).length}</div>
			</div>
		{/if}
	</section>

	<section>
		<h2>EntryDetail · the real page body</h2>
		<div class="controls">
			<span>Entry:</span>
			{#each sim.entries as e (e.id)}
				<button
					class="ctl"
					class:on={entryDetailEntry?.id === e.id}
					onclick={() => (entryDetailId = e.id)}
				>
					{e.display_name}
				</button>
			{/each}
		</div>
		{#if entryDetailEntry}
			<EntryDetail
				tournament={simTournament}
				entry={entryDetailEntry}
				entries={sim.entries}
				styles={Object.values(sim.styles)}
				bracketMatches={sim.matches}
				games={sim.games}
				ledger={sim.ledger}
			/>
			{#if entryAudit}
				<div class="audit">
					<strong>Raw check</strong>
					<div>
						record from rows: {entryAudit.rec.wins}–{entryAudit.rec.losses} (byes
						{entryAudit.rec.byes}, by forfeit {entryAudit.rec.forfeitWins}–{entryAudit.rec
							.forfeitLosses})
					</div>
					<div>ledger rows {entryAudit.ledgerRows} · total +{entryAudit.ledgerTotal}</div>
					<div>ledger rows attached to ANY forfeited match: {entryAudit.forfeitLedgerRows}</div>
				</div>
			{/if}
		{/if}
	</section>

	<section>
		<h2>ForfeitForm · the host console action</h2>
		<p class="note">
			Pick a side and a reason, then confirm. The payload below is exactly what the host console
			sends to tournament_submit_match_result; applying it runs the sim's forfeit path (no games,
			no reward).
		</p>
		{#if readyMatch}
			<div class="card pad">
				<ForfeitForm
					match={readyMatch}
					{entries}
					onsubmit={(payload) => {
						lastForfeitPayload = JSON.stringify(payload);
						forfeitNext(sim, payload.reason);
					}}
				/>
			</div>
			{#if lastForfeitPayload}
				<div class="audit"><strong>Last payload</strong> <code>{lastForfeitPayload}</code></div>
			{/if}
		{:else}
			<p class="note">No startable match left — rebuild the field.</p>
		{/if}
	</section>

	<section>
		<h2>DeleteTournament · host console + list control</h2>
		<p class="note">
			Mirrors 0066 + 0068: the typed name is required exactly when the tournament has entries, a
			distinct payout-loss acknowledgment is required first whenever the tournament has any reward
			ledger rows, and only a host or a teacher gets through. The RPC enforces all of it
			server-side; this form only keeps the button off input the server would reject. This sim's
			ledger currently totals {deleteRewardCoins}i¢ across {deleteRewardEntries} entries ({deleteRewardCount}
			rows) -- play a bracket forward (below) to grow it.
		</p>
		<div class="controls">
			<span>Caller:</span>
			{#each ['host', 'teacher', 'student'] as r (r)}
				<button
					class="ctl"
					class:on={deleteAsRole === r}
					onclick={() => (deleteAsRole = r as typeof deleteAsRole)}
				>
					{r}
				</button>
			{/each}
			<span class="sep"></span>
			<label class="chk">
				<input type="checkbox" bind:checked={deleteEntries} /> has entries ({sim.entries.length})
			</label>
		</div>
		<div class="card pad">
			<DeleteTournament
				tournament={deletable}
				entryCount={deleteEntries ? sim.entries.length : 0}
				matchCount={sim.matches.length}
				rewardCount={deleteRewardCount}
				rewardCoins={deleteRewardCoins}
				rewardEntries={deleteRewardEntries}
				busy={deleteBusy}
				error={deleteError}
				ondelete={fakeDelete}
			/>
		</div>
		<div class="pad-top">
			<span class="cell-tag">compact variant (tournament list)</span>
			<DeleteTournament
				tournament={deletable}
				entryCount={deleteEntries ? sim.entries.length : 0}
				rewardCount={deleteRewardCount}
				rewardCoins={deleteRewardCoins}
				rewardEntries={deleteRewardEntries}
				compact
				busy={deleteBusy}
				error={deleteError}
				ondelete={fakeDelete}
			/>
		</div>
		{#if deleteLog.length}
			<div class="audit">
				<strong>Attempts</strong>
				{#each deleteLog as line, i (i)}<div>{line}</div>{/each}
			</div>
		{/if}
	</section>

	<section>
		<h2>EntryBanner · styled vs default</h2>
		<div class="banner-grid">
			{#each sim.entries.slice(0, 7) as e (e.id)}
				<div class="banner-cell">
					<span class="cell-tag">{hasStyle(sim.styles[e.id]) ? 'styled' : 'no style set'}</span>
					<EntryBanner entry={e} style={sim.styles[e.id] ?? null} size="md" seed={e.seed} />
				</div>
			{/each}
		</div>
	</section>

	<section>
		<h2>EntryStyleEditor · live save into the sim</h2>
		<div class="controls">
			<span>Entry:</span>
			{#each sim.entries.slice(0, 7) as e (e.id)}
				<button
					class="ctl"
					class:on={editEntry?.id === e.id}
					onclick={() => (editId = e.id)}
				>
					{e.display_name}
				</button>
			{/each}
		</div>
		{#if editEntry}
			<div class="card pad">
				<EntryStyleEditor
					entry={editEntry}
					style={sim.styles[editEntry.id] ?? null}
					note="Saves into the in-memory sim; the bracket and TV stage above/below update live."
					onsave={(draft) => saveStyle(editEntry.id, draft)}
				/>
			</div>
		{/if}
	</section>

	<section>
		<h2>TvStage · the real projector component</h2>
		<div class="controls">
			<span>Status:</span>
			{#each ['registration_open', 'seeding', 'live', 'complete'] as s (s)}
				<button
					class="ctl"
					class:on={tvStatus === s}
					onclick={() => (tvStatus = s as Tournament['status'])}
				>
					{s}
				</button>
			{/each}
			<span class="sep"></span>
			<span class="state">
				start a match for the live view · play one for the result beat (13s)
			</span>
		</div>
		<div class="tv-frame">
			<TvStage
				tournament={tvTournament}
				entries={sim.entries}
				styles={sim.styles}
				matches={sim.matches}
				games={sim.games}
				shareUrl="https://ideabosco.com/tournaments/sim-demo"
				showHint={false}
				fullscreen={false}
			/>
		</div>
	</section>

	<section>
		<h2>PoolsView · sample quals (score mode)</h2>
		<PoolsView pools={qual.pools} matches={qual.matches} entries={qualEntries} scoreEntry />
	</section>

	<section>
		<h2>Rewards · RewardRulesEditor + RewardsPanel (0063 mirror)</h2>
		<p class="note">
			Save rules, rebuild, then play matches: win + winners-round bonuses pay per entered
			result (byes pay nothing) and 1st/2nd/3rd settle when the grand final decides.
		</p>
		<div class="card pad">
			<RewardRulesEditor
				rules={sim.rewardRules}
				onsave={(rules) => setSimRewardRules(sim, rules)}
			/>
		</div>
		<div class="pad-top">
			<RewardsPanel rules={sim.rewardRules} ledger={sim.ledger} {entries} />
		</div>
	</section>

	<section>
		<h2>TournamentQr · registration_open card</h2>
		<div class="card pad">
			<TournamentQr url="https://ideabosco.com/tournaments/sim-demo" name="Harness Invitational" />
		</div>
	</section>
</main>

<style>
	.harness {
		max-width: 76rem;
		margin: 0 auto;
		padding: 1.5rem 1.2rem 4rem;
	}
	.note {
		color: var(--dim, #7a8a7a);
	}
	.controls {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		flex-wrap: wrap;
		margin: 1rem 0 1.4rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		color: var(--dim, #7a8a7a);
	}
	.ctl {
		background: var(--bg1, #0d120d);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.25));
		border-radius: 4px;
		color: var(--white, #e8ffe8);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		padding: 0.25rem 0.6rem;
		cursor: pointer;
	}
	.ctl.on {
		border-color: var(--green, #00ff41);
		color: var(--green, #00ff41);
	}
	.sep {
		width: 0.8rem;
	}
	.state {
		margin-left: auto;
	}
	section {
		margin-top: 2rem;
	}
	h2 {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--green, #00ff41);
	}
	.pad {
		padding: 1rem;
	}
	.chk {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		cursor: pointer;
	}
	.audit {
		margin-top: 0.8rem;
		padding: 0.6rem 0.8rem;
		border: 1px dashed var(--line, rgba(0, 255, 65, 0.25));
		border-radius: 5px;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		color: var(--dim, #7a8a7a);
		line-height: 1.7;
		overflow-x: auto;
	}
	.audit strong {
		color: var(--white, #e8ffe8);
	}
	.pad-top {
		margin-top: 1rem;
	}
	.banner-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(21rem, 1fr));
		gap: 0.8rem;
	}
	.banner-cell {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
	}
	.cell-tag {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--dim, #7a8a7a);
	}
	/* TvStage pins itself to its nearest positioned ancestor when
	 * fullscreen={false}, so the harness gives it a real projector-shaped box. */
	.tv-frame {
		position: relative;
		width: 100%;
		aspect-ratio: 16 / 9;
		max-height: 78vh;
		border: 1px solid var(--line, rgba(0, 255, 65, 0.25));
		border-radius: 8px;
		overflow: hidden;
	}
</style>
