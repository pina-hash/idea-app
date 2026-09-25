<script lang="ts">
	/**
	 * THE TOURNAMENT SETTINGS FORM, IN BOTH MOUNTS (ledger 0298, R02).
	 *
	 * Mounts the REAL `TournamentSettingsForm` inside `.tnm-root`, wired the
	 * way the two routes wire it: the host console's Settings card builds its
	 * call with `tournamentUpdateArgs` and its locks with `settingsLocks`, and
	 * `/tournaments/new` builds its call with `tournamentCreateArgs`. The only
	 * thing that differs is the far end: an in-memory stand-in for the RPC,
	 * which applies 0192's own format lock and otherwise stores what it is
	 * sent. The last call's arguments are printed, so a browser pass can read
	 * that the WHOLE config went, per-round overrides included.
	 *
	 *   ?mode=create                       the new-tournament form
	 *   ?status=draft|registration_open|seeding|live|complete
	 *   &pools=N                           qualifying pools drawn (locks qualifying on/off)
	 *   &results=N                         qualifying results recorded (locks score entry)
	 *   &team=N                            the largest roster registered (the team-size floor)
	 *   &overrides=1                       the stored config carries per-round overrides
	 *   &refuse=host|team|<text>           the stand-in refuses every call, verbatim
	 */
	import { page } from '$app/state';
	import TournamentSettingsForm from '$lib/tournaments/TournamentSettingsForm.svelte';
	import '$lib/tournaments/tournaments-theme.css';
	import {
		settingsLocks,
		tournamentCreateArgs,
		tournamentUpdateArgs,
		type SettingsDraft
	} from '$lib/tournaments/settings';
	import { parseConfig, type TournamentStatus } from '$lib/tournaments/tournaments';

	const STATUSES: TournamentStatus[] = ['draft', 'registration_open', 'seeding', 'live', 'complete'];
	const q = page.url.searchParams;
	const int = (v: string | null) => {
		const n = Number.parseInt(v ?? '', 10);
		return Number.isFinite(n) && n > 0 ? n : 0;
	};
	const mode: 'create' | 'edit' = q.get('mode') === 'create' ? 'create' : 'edit';
	const status: TournamentStatus = STATUSES.includes(q.get('status') as TournamentStatus)
		? (q.get('status') as TournamentStatus)
		: 'draft';
	const pools = int(q.get('pools'));
	const results = int(q.get('results'));
	const team = int(q.get('team'));
	const overrides = q.get('overrides') === '1';
	/** Refusals the real RPCs raise, verbatim, by a short key so a browser
	 * spec's path stays readable; any other value is used as the text. */
	const REFUSALS: Record<string, string> = {
		host: 'Only a tournament host or a site admin can do that.',
		team: 'team_size cannot be lower than the largest entry (3 registrants).'
	};
	const refuseKey = q.get('refuse');
	const refuse = refuseKey ? (REFUSALS[refuseKey] ?? refuseKey) : null;

	// The stored row, as the load would hand it over.
	let stored = $state({
		name: 'Spring Rocket League Cup',
		description: 'Two-on-two, best of three. Bring a controller.',
		config: {
			quals_enabled: pools > 0,
			score_entry: true,
			best_of_default: 3,
			best_of: {
				...(overrides ? { 'winners:1': 1, 'losers:2': 3 } : {}),
				grand_final: 5
			},
			team_size: Math.max(2, team)
		} as Record<string, unknown>
	});

	const locks = $derived(settingsLocks({ status, pools, qualResults: results }));
	const minTeamSize = Math.max(1, team);

	let busy = $state(false);
	let error = $state('');
	let saved = $state('');
	let lastCall = $state<{ rpc: string; args: unknown } | null>(null);
	let calls = $state(0);

	const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

	/** The stand-in for 0192's `tournament_update`: the format lock and the
	 * whole-object write, and nothing else. */
	function simUpdate(args: ReturnType<typeof tournamentUpdateArgs>): string | null {
		if (refuse) return refuse;
		if (args.p_config && (status === 'live' || status === 'complete')) {
			return 'Format settings are locked once the bracket is generated.';
		}
		if (args.p_name !== null) stored.name = args.p_name;
		if (args.p_description !== null) stored.description = args.p_description;
		if (args.p_config) {
			const c = parseConfig(args.p_config);
			stored.config = { ...c };
		}
		return null;
	}

	async function save(draft: SettingsDraft) {
		error = '';
		saved = '';
		busy = true;
		try {
			await sleep(150);
			calls += 1;
			if (mode === 'create') {
				const args = tournamentCreateArgs(draft);
				lastCall = { rpc: 'tournament_create', args };
				if (refuse) error = refuse;
				else saved = 'Created (the real page opens the host console here).';
				return;
			}
			const args = tournamentUpdateArgs(
				'00000000-0000-4000-8000-00000000d0e1',
				{ name: stored.name, description: stored.description, config: stored.config },
				draft,
				locks
			);
			lastCall = { rpc: 'tournament_update', args };
			const refusal = simUpdate(args);
			if (refusal) {
				error = refusal;
				return;
			}
			saved = 'Settings saved at 9:41 AM.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Tournament settings harness // dev</title>
</svelte:head>

<div class="tnm-root tnm-shell" data-testid="harness-room">
	<main class="tnm-page {mode === 'create' ? 'ts-create' : 'wide'}">
		<section class="hero">
			<div class="eyebrow">dev // tournament settings // {mode} // {status}</div>
			<h1>{mode === 'create' ? 'New tournament' : stored.name}</h1>
		</section>

		{#if mode === 'create'}
			<div class="card">
				<TournamentSettingsForm mode="create" {busy} {error} onsubmit={save} />
			</div>
			{#if saved}<p class="harness-note" data-testid="harness-created">{saved}</p>{/if}
		{:else}
			<section class="card" data-testid="host-settings">
				<h2>Settings</h2>
				<TournamentSettingsForm
					mode="edit"
					name={stored.name}
					description={stored.description}
					config={stored.config}
					{locks}
					{minTeamSize}
					{busy}
					{error}
					{saved}
					onsubmit={save}
				/>
			</section>
		{/if}

		<section class="card harness-log">
			<h2>Last call ({calls})</h2>
			<pre data-testid="last-args">{lastCall ? JSON.stringify(lastCall, null, 1) : 'none yet'}</pre>
		</section>
	</main>
</div>

<style>
	.ts-create {
		max-width: var(--measure-form, 48rem);
	}
	.harness-log pre {
		white-space: pre-wrap;
		word-break: break-word;
		font-size: 0.75rem;
		color: var(--dim);
	}
	.harness-note {
		color: var(--dim);
	}
</style>
