<script lang="ts">
	import BracketView from '$lib/tournaments/BracketView.svelte';
	import PoolsView from '$lib/tournaments/PoolsView.svelte';
	import RewardRulesEditor from '$lib/tournaments/RewardRulesEditor.svelte';
	import RewardsPanel from '$lib/tournaments/RewardsPanel.svelte';
	import TournamentQr from '$lib/tournaments/TournamentQr.svelte';
	import EntryBanner from '$lib/tournaments/EntryBanner.svelte';
	import EntryStyleEditor from '$lib/tournaments/EntryStyleEditor.svelte';
	import TvStage from '$lib/tournaments/TvStage.svelte';
	import { entryMap, type Tournament } from '$lib/tournaments/tournaments';
	import { hasStyle, type EntryStyle, type EntryStyleDraft } from '$lib/tournaments/entry-styles';
	import {
		buildSim,
		buildQualSample,
		playNext,
		setSimRewardRules,
		startNext,
		type Sim
	} from './sim';

	let fieldSize = $state(6);
	let sim = $state<Sim>(buildSim(6));
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
			across the wheel); the rest carry none, so the default treatment sits beside them.
		</p>
		<BracketView
			matches={sim.matches}
			{entries}
			styles={sim.styles}
			games={sim.games}
			championId={sim.championId}
		/>
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
