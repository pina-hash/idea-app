<script lang="ts">
	import { cleanName, hasVisibleText } from '$lib/tournaments/names';
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import EntryChip from '$lib/tournaments/EntryChip.svelte';
	import EntryStyleEditor from '$lib/tournaments/EntryStyleEditor.svelte';
	import EntryTeamPanel from '$lib/tournaments/EntryTeamPanel.svelte';
	import HostMatchControl from '$lib/tournaments/HostMatchControl.svelte';
	import DeleteTournament from '$lib/tournaments/DeleteTournament.svelte';
	import RewardRulesEditor from '$lib/tournaments/RewardRulesEditor.svelte';
	import TournamentSettingsForm from '$lib/tournaments/TournamentSettingsForm.svelte';
	import LiveSettingsConfirm from '$lib/tournaments/LiveSettingsConfirm.svelte';
	import PersonPicker from '$lib/tournaments/PersonPicker.svelte';
	import { peopleAnswerFrom, type PeopleAnswer } from '$lib/tournaments/people';
	import {
		LIVE_EDIT_NOTE,
		liveRefusalSentence,
		normalizeLivePlan,
		type LivePlan
	} from '$lib/tournaments/live-settings';
	import {
		bracketHasResult,
		largestRoster,
		settingsLocks,
		tournamentUpdateArgs,
		type SettingsDraft
	} from '$lib/tournaments/settings';
	import { styleMap, type EntryStyleDraft } from '$lib/tournaments/entry-styles';
	import { hostSectionOrder } from '$lib/tournaments/live';
	import { entryMap, memberMap, parseConfig, statusLabel } from '$lib/tournaments/tournaments';
	import { takeTeamSetSentence, teamSetBlocker, type TakeTeamSetResult } from '$lib/tournaments/class-teams';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const t = $derived(data.tournament);
	const config = $derived(parseConfig(t.config));
	const entries = $derived(entryMap(data.entries));
	const styles = $derived(styleMap(data.entryStyles));
	const members = $derived(memberMap(data.members));
	const teamSize = $derived(config.team_size);
	const preBracket = $derived(t.status !== 'live' && t.status !== 'complete');
	/**
	 * 0192 READINESS, READ OFF THE DATA (the event page's rule): after the
	 * backfill every entry has a member row, so entries with no members at
	 * all is a deployment the migration has not reached, where the rename
	 * and roster RPCs do not exist. Those controls stay off until it has.
	 */
	const membersReady = $derived(data.entries.length === 0 || data.members.length > 0);
	/** Entries that follow a class team (0297): their look and roster come from the class. */
	const linked = $derived(new Set(data.linkedEntries));

	/** Takes one class team set's teams as entries (0297). The answer is worded, not just acknowledged. */
	async function takeTeamSet(setId: string) {
		actionError = '';
		notice = '';
		busy = true;
		const { data: res, error } = await data.supabase.rpc('tournament_take_team_set', {
			p_tournament_id: t.id,
			p_team_set_id: setId
		});
		busy = false;
		if (error) {
			actionError = error.message;
			return;
		}
		notice = takeTeamSetSentence(res as TakeTeamSetResult);
		await invalidateAll();
	}

	/** A site admin managing an event they do not host (item 5). */
	const adminOnly = $derived(data.isAdmin && !data.isHost);

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
			'tournament_entry_members',
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

	// --- entry names and rosters (0192, items 6 and 7) ---
	// A host renames an entry inline while the bracket does not exist yet
	// (`tournament_update_entry` refuses after, for a host and an admin too,
	// so the control is only offered pre-bracket). The roster of a team
	// event opens per entry behind a `team` toggle and is `EntryTeamPanel`
	// with the console's transports: the same component the competitor sees
	// on the event page, pointed at the same RPCs, which re-check that the
	// caller is a host or an admin.
	let renameId = $state<string | null>(null);
	let renameName = $state('');
	let teamOpenId = $state<string | null>(null);

	function toggleRename(entryId: string, current: string) {
		if (renameId === entryId) {
			renameId = null;
			return;
		}
		renameId = entryId;
		renameName = current;
	}
	async function saveRename(entryId: string) {
		const name = cleanName(renameName);
		if (!name) return;
		const okDone = await run(
			() =>
				data.supabase.rpc('tournament_update_entry', {
					p_entry_id: entryId,
					p_display_name: name
				}),
			'Entry renamed'
		);
		if (okDone) renameId = null;
	}
	const hostAddMember = (entryId: string) => (name: string, email: string | null) =>
		run(
			() =>
				data.supabase.rpc('tournament_add_entry_member', {
					p_entry_id: entryId,
					p_name: name,
					p_email: email
				}),
			'Teammate added'
		);
	const hostRemoveMember = (memberId: string) =>
		run(
			() => data.supabase.rpc('tournament_remove_entry_member', { p_member_id: memberId }),
			'Teammate removed'
		);
	const hostRenameMember = (memberId: string, name: string) =>
		run(
			() =>
				data.supabase.rpc('tournament_rename_entry_member', {
					p_member_id: memberId,
					p_name: name
				}),
			'Teammate renamed'
		);

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

	// --- settings (ledger 0298, R02) ---
	// `tournament_update` has existed since 0062 with no caller, so a
	// tournament's name, description and format could never change after
	// creation. The card is `TournamentSettingsForm`, the form
	// `/tournaments/new` creates with; `settings.ts` builds the WHOLE config
	// from the stored one (the RPC replaces it wholesale) and holds the locks:
	// the format once the bracket exists (the RPC's own rule), qualifying
	// on/off once pools are drawn, and score entry once a qualifying result
	// is recorded. Its refusals render in the card, not at the top of the page.
	// A SITE ADMIN MAY CHANGE A LIVE EVENT'S FORMAT (0266, report d1d40a60),
	// through a preview that says what happens to played matches and an apply
	// that refuses a stale preview. A host keeps the lock.
	// UNTIL THE FIRST RESULT ANY HOST MAY CHANGE THE MATCH LENGTHS (0317, ledger
	// 0455, report 544604c9): the ordinary save re-stamps every unplayed match.
	// After it, an admin keeps 0266's previewed change and a host the lock.
	const hasResult = $derived(bracketHasResult(data.bracketMatches, data.games.length));
	const liveAdmin = $derived(t.status === 'live' && data.isAdmin === true && hasResult);
	const settingsLock = $derived(
		settingsLocks({
			status: t.status,
			pools: data.pools.length,
			qualResults: data.qualMatches.filter((m) => m.winner_id !== null).length,
			liveAdmin,
			hasResult: t.status === 'live' ? hasResult : undefined
		})
	);
	const minTeamSize = $derived(
		Math.max(1, largestRoster(data.entries.map((e) => (members[e.id] ?? []).length)))
	);
	let settingsBusy = $state(false);
	let settingsError = $state('');
	let settingsSaved = $state('');

	async function saveSettings(draft: SettingsDraft) {
		settingsError = '';
		settingsSaved = '';
		settingsBusy = true;
		try {
			const args = tournamentUpdateArgs(
				t.id,
				{ name: t.name, description: t.description, config: t.config },
				draft,
				settingsLock
			);
			// A DATABASE WITHOUT 0317 still locks a drawn bracket's format. For an
			// admin that is 0266's previewed change, so the save takes that path
			// when the ordinary one answers with the old lock; anyone else reads it.
			let viaPreview = liveAdmin;
			if (!viaPreview && args.p_config && t.status === 'live') {
				const { error } = await data.supabase.rpc('tournament_update', args);
				if (!error) {
					settingsSaved = `Match lengths changed at ${new Date().toLocaleTimeString([], {
						hour: 'numeric',
						minute: '2-digit'
					})}. Every match not yet played uses them.`;
					await invalidateAll();
					return;
				}
				if (!(data.isAdmin === true && /locked once the bracket/.test(error.message))) {
					settingsError = error.message;
					return;
				}
				viaPreview = true;
			}
			if (viaPreview && args.p_config) {
				// PREVIEW FIRST: nothing is written until the confirm is pressed.
				const { data: res, error } = await data.supabase.rpc('tournament_live_config_preview', {
					p_tournament_id: t.id,
					p_config: args.p_config
				});
				if (error) {
					settingsError =
						(error as { code?: string }).code === 'PGRST202'
							? liveRefusalSentence({ reason: 'unavailable' })
							: error.message;
					return;
				}
				const plan = normalizeLivePlan(res);
				if (!plan.ok) {
					settingsError = liveRefusalSentence(plan);
					return;
				}
				liveError = '';
				livePending = args;
				livePlan = plan;
				return;
			}
			const { error } = await data.supabase.rpc('tournament_update', args);
			if (error) {
				settingsError = error.message;
				return;
			}
			settingsSaved = `Settings saved at ${new Date().toLocaleTimeString([], {
				hour: 'numeric',
				minute: '2-digit'
			})}.`;
			await invalidateAll();
		} finally {
			settingsBusy = false;
		}
	}

	let livePlan = $state<LivePlan | null>(null);
	let livePending: ReturnType<typeof tournamentUpdateArgs> | null = null;
	let liveBusy = $state(false);
	let liveError = $state('');

	async function applyLive() {
		const plan = livePlan;
		const args = livePending;
		if (!plan || !args?.p_config) return;
		liveBusy = true;
		liveError = '';
		try {
			const { data: res, error } = await data.supabase.rpc('tournament_live_config_apply', {
				p_tournament_id: t.id,
				p_config: args.p_config,
				p_expected_config: plan.stored
			});
			if (error) {
				liveError = error.message;
				return;
			}
			const answer = normalizeLivePlan(res);
			if (!answer.ok) {
				liveError = liveRefusalSentence(answer);
				return;
			}
			// The name and the description ride the ordinary write, with no config.
			if (args.p_name !== null || args.p_description !== null) {
				const { error: e2 } = await data.supabase.rpc('tournament_update', { ...args, p_config: null });
				if (e2) {
					liveError = `The format changed, but the name or description did not save: ${e2.message}`;
					return;
				}
			}
			livePlan = null;
			livePending = null;
			settingsSaved = `Live settings changed at ${new Date().toLocaleTimeString([], {
				hour: 'numeric',
				minute: '2-digit'
			})}. ${answer.matchesRestamped === 1 ? '1 upcoming match was' : `${answer.matchesRestamped} upcoming matches were`} updated.`;
			await invalidateAll();
		} finally {
			liveBusy = false;
		}
	}

	function cancelLive() {
		livePlan = null;
		livePending = null;
		liveError = '';
	}

	// --- invites / hosts ---
	let inviteEmail = $state('');
	let cohostEmail = $state('');
	/**
	 * THE DIRECTORY BEHIND EVERY PERSON FIELD ON THIS PAGE (0317, ledger 0455,
	 * report c6830880). A deployment without it answers `unavailable` and each
	 * field is the plain address box it was.
	 */
	async function searchPeople(q: string): Promise<PeopleAnswer> {
		const { data: rows, error } = await data.supabase.rpc('tournament_people_search', {
			p_tournament_id: t.id,
			p_query: q,
			p_limit: 12
		});
		return peopleAnswerFrom(rows, error);
	}

	// --- quals ---
	let poolCount = $state(2);
	let qualA = $state<Record<string, string>>({});
	let qualB = $state<Record<string, string>>({});

	// --- match control ---
	// The controls themselves live in HostMatchControl (prompt 0077), which
	// the dev harness mounts identically; this route only points its
	// callbacks at the RPCs. Each answers whether the write landed so the
	// component can close a forfeit or correction panel on success only.
	const setStatus = (status: string) =>
		run(
			() => data.supabase.rpc('tournament_set_status', { p_tournament_id: t.id, p_status: status }),
			`Status: ${statusLabel(status)}`
		);

	const startMatch = (matchId: string) =>
		run(() => data.supabase.rpc('tournament_start_match', { p_match_id: matchId }), 'Match started');

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

	const submitResult = (matchId: string, result: unknown) =>
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
	const submitForfeit = (matchId: string, result: unknown) =>
		run(
			callPush({ action: 'submit-result', tournamentId: t.id, matchId, result }),
			'Forfeit recorded'
		);

	/**
	 * Deleting leaves nothing to come back to, so this navigates away rather
	 * than invalidating a page whose own load would then 404. The RPC is the
	 * authorization boundary; reaching this console at all is only a
	 * convenience gate.
	 */
	let deleteBusy = $state(false);
	let deleteError = $state('');

	async function deleteTournament(confirmName: string, acknowledgePayoutLoss: boolean) {
		deleteError = '';
		deleteBusy = true;
		const { error } = await data.supabase.rpc('tournament_delete', {
			p_tournament_id: t.id,
			p_confirm_name: confirmName || null,
			p_acknowledge_payout_loss: acknowledgePayoutLoss
		});
		deleteBusy = false;
		if (error) {
			deleteError = error.message;
			return;
		}
		await goto('/tournaments', { invalidateAll: true });
	}

	const correctResult = (matchId: string, result: unknown, reason: string) =>
		run(
			callPush({ action: 'correct-result', tournamentId: t.id, matchId, result, reason }),
			'Correction applied'
		);
</script>

<svelte:head>
	<title>Host · {t.name} · Tournaments · IDEA</title>
</svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/tournaments/{t.id}/tv">TV mode</a>
		<a class="btn secondary" href="/tournaments/{t.id}">&lsaquo; Live view</a>
		<ProfileMenu />
	</div>
</div>

<!-- A grid of cards: the split measure (D8). -->
<main class="host-page tnm-page wide">
	<section class="hero">
		<div class="eyebrow">Host console · {data.hostCount} host{data.hostCount === 1 ? '' : 's'}</div>
		<h1>{t.name}</h1>
		<p class="lead">
			Status: <strong>{statusLabel(t.status)}</strong>
			· {config.quals_enabled ? 'Qualifying pools on' : 'No qualifying'}
			· {config.score_entry ? 'Score entry' : 'Win/loss entry'}
			{#if teamSize > 1}· Teams of up to {teamSize}{/if}
		</p>
	</section>

	{#if adminOnly}
		<!-- Said in words at the top, because every control below works and
		     none of them was granted by this event's hosts (item 5). -->
		<section class="card admin-notice" data-testid="admin-notice">
			<p>You are managing this tournament as a site admin. You are not one of its hosts.</p>
		</section>
	{/if}

	{#if actionError}<p class="feedback error">{actionError}</p>{/if}
	{#if notice}<p class="feedback notice">{notice}</p>{/if}

	<!-- THE CARDS RENDER IN hostSectionOrder'S ORDER (live.ts): match control
	     first the moment there is a bracket, setup cards first before that. -->
	{#each hostSectionOrder(t.status) as section (section)}
		{#if section === 'phase'}{@render phaseCard()}
		{:else if section === 'settings'}{@render settingsCard()}
		{:else if section === 'matches'}{@render matchesCard()}
		{:else if section === 'entries'}{@render entriesCard()}
		{:else if section === 'invites'}{@render invitesCard()}
		{:else if section === 'quals'}{@render qualsCard()}
		{:else if section === 'rewards'}{@render rewardsCard()}
		{:else if section === 'danger'}{@render dangerCard()}
		{/if}
	{/each}
</main>

{#snippet phaseCard()}
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
{/snippet}

{#snippet settingsCard()}
	<section class="card" data-testid="host-settings">
		<h2>Settings</h2>
		<TournamentSettingsForm
			mode="edit"
			name={t.name}
			description={t.description}
			config={t.config}
			locks={settingsLock}
			{minTeamSize}
			busy={settingsBusy}
			error={settingsError}
			saved={settingsSaved}
			note={liveAdmin ? LIVE_EDIT_NOTE : ''}
			onsubmit={saveSettings}
		/>
		{#if livePlan}
			<LiveSettingsConfirm plan={livePlan} busy={liveBusy} error={liveError} onapply={applyLive} oncancel={cancelLive} />
		{/if}
	</section>
{/snippet}

{#snippet matchesCard()}
	{#if data.bracketMatches.length}
		<section class="card matches">
			<h2>Match control</h2>
			<HostMatchControl
				matches={data.bracketMatches}
				{entries}
				{members}
				scoreEntry={config.score_entry}
				{busy}
				tournamentId={t.id}
				onstart={startMatch}
				onsubmit={submitResult}
				onforfeit={submitForfeit}
				oncorrect={correctResult}
				onping={ping}
			/>
		</section>
	{/if}
{/snippet}

{#snippet entriesCard()}
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
					disabled={busy || !hasVisibleText(walkName)}
					onclick={async () => {
						const okDone = await run(
							() =>
								data.supabase.rpc('tournament_host_add_entry', {
									p_tournament_id: t.id,
									p_display_name: cleanName(walkName),
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
			{#if data.teamSetOptions.length}
				<div class="class-sets" data-testid="host-class-teams">
					<p class="class-sets-head">Teams from a class</p>
					<p class="note">
						Each team becomes an entry with its players, name, picture and look. When a student
						changes their team on the class page, it changes here too.
					</p>
					{#each data.teamSetOptions as o (o.id)}
						{@const blocker = teamSetBlocker(o, teamSize, t.status)}
						<div class="class-set-row" data-team-set={o.id}>
							<span class="class-set-name">
								{o.label}
								<span class="class-set-meta">
									{o.class ?? 'Class'} · {o.teams} team{o.teams === 1 ? '' : 's'}{o.linked_here
										? ` · ${o.linked_here} here`
										: ''}
								</span>
							</span>
							{#if blocker}
								<span class="class-set-why">{blocker}</span>
							{:else}
								<button
									class="btn secondary"
									disabled={busy}
									onclick={() => takeTeamSet(o.id)}
									data-action="take-team-set"
								>
									Use these teams
								</button>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		{/if}
		<div class="entry-list">
			{#each data.entries as e, i (e.id)}
				<div class="entry-row">
					<span class="seed-cell">{e.seed ?? '·'}</span>
					<EntryChip entry={e} style={styles[e.id] ?? null} />
					{#if e.user_id}
						<span class="linked-tag">linked account</span>
					{:else if linked.has(e.id)}
						<span class="linked-tag" data-testid="host-from-class">from class</span>
						{#if preBracket}
							<button
								class="mini"
								disabled={busy}
								title="Stop following the class team. The entry keeps what it shows now."
								onclick={() =>
									run(
										() => data.supabase.rpc('tournament_unlink_class_team', { p_entry_id: e.id }),
										'This entry no longer follows its class team'
									)}
							>
								stop following
							</button>
						{/if}
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
							{#if membersReady}
								<button
									class="mini"
									disabled={busy}
									onclick={() => toggleRename(e.id, e.display_name)}
									data-action="rename-entry"
								>
									{renameId === e.id ? 'close rename' : 'rename'}
								</button>
								{#if teamSize > 1}
									<button
										class="mini"
										disabled={busy}
										onclick={() => (teamOpenId = teamOpenId === e.id ? null : e.id)}
										data-action="team"
									>
										{teamOpenId === e.id ? 'close team' : 'team'}
									</button>
								{/if}
							{/if}
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
				{#if (members[e.id] ?? []).length}
					<!-- The roster under its entry, chosen names only, mono and
					     dim: a host calling a team reads every name on it. -->
					<p class="members-line" data-testid="host-members">
						{(members[e.id] ?? []).map((m) => m.name).join(' · ')}
					</p>
				{/if}
				{#if renameId === e.id}
					<form
						class="rename-row"
						data-form="host-rename"
						onsubmit={(ev) => {
							ev.preventDefault();
							saveRename(e.id);
						}}
					>
						<input
							type="text"
							maxlength="40"
							required
							aria-label="Entry name"
							bind:value={renameName}
						/>
						<button type="submit" class="btn" disabled={busy || !hasVisibleText(renameName)}>Save name</button>
						<button type="button" class="btn secondary" onclick={() => (renameId = null)}>Cancel</button>
					</form>
				{/if}
				{#if teamOpenId === e.id}
					<div class="team-row">
						<EntryTeamPanel
							entry={e}
							members={members[e.id] ?? []}
							{teamSize}
							status={t.status}
							viewerId={data.claims?.sub ?? null}
							manager={true}
							searchPeople={searchPeople}
							{busy}
							onaddmember={hostAddMember(e.id)}
							onremovemember={hostRemoveMember}
							onrenamemember={hostRenameMember}
						/>
					</div>
				{/if}
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
{/snippet}

{#snippet invitesCard()}
	<section class="card">
		<h2>Invites & co-hosts</h2>
		<div class="add-row">
			<PersonPicker
				bind:value={inviteEmail}
				search={searchPeople}
				label="Invite a person, by name or school email"
				placeholder="Invite by name or school email"
				testid="invite-person"
			/>
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
			<PersonPicker
				bind:value={cohostEmail}
				search={searchPeople}
				label="Add a co-host, by name or school email"
				placeholder="Add co-host by name or school email"
				testid="cohost-person"
			/>
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
{/snippet}

{#snippet qualsCard()}
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
{/snippet}

{#snippet rewardsCard()}
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
{/snippet}

{#snippet dangerCard()}
	<section class="card danger">
		<h2>Danger zone</h2>
		<DeleteTournament
			tournament={t}
			entryCount={data.entries.length}
			matchCount={data.bracketMatches.length}
			rewardCount={data.rewardLedgerCount}
			rewardCoins={data.rewardLedgerCoins}
			rewardEntries={data.rewardLedgerEntries}
			busy={deleteBusy}
			error={deleteError}
			ondelete={deleteTournament}
		/>
	</section>
{/snippet}

<style>
	.host-page .card {
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
	input[type='number'] {
		background: var(--bg0);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.25));
		border-radius: 4px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		padding: 0.4rem 0.6rem;
		min-height: 44px;
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
	.matches {
		border-color: var(--line-strong, var(--line));
	}
	.style-row,
	.team-row {
		padding: 0.8rem 0 1rem 2.3rem;
		border-bottom: 1px solid var(--line, rgba(0, 255, 65, 0.08));
	}
	/* The roster line under an entry: --tnm-ink-dim (#93a09a) on the card
	 * plate, 6.10:1 (EntryTeamPanel's own measurement of the same pair). */
	.members-line {
		margin: 0 0 0.3rem 2.3rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--tnm-ink-dim);
	}
	.rename-row {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		align-items: center;
		padding: 0.4rem 0 0.8rem 2.3rem;
	}
	.rename-row input {
		flex: 1;
		min-width: 11rem;
	}
	.rename-row .btn {
		min-height: 44px;
	}
	.admin-notice p {
		margin: 0;
		color: var(--tnm-ink);
	}
	.class-sets {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0.9rem 0 0.4rem;
		padding-top: 0.8rem;
		border-top: 1px solid var(--tnm-line);
	}
	.class-sets-head {
		margin: 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--tnm-ink-dim);
	}
	.class-set-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.4rem 1rem;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--tnm-line);
	}
	.class-set-name {
		display: flex;
		flex-direction: column;
		min-width: 0;
		font-weight: 700;
		color: var(--tnm-ink);
		overflow-wrap: anywhere;
	}
	.class-set-meta {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.74rem;
		font-weight: 400;
		color: var(--tnm-ink-dim);
	}
	.class-set-why {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.74rem;
		color: var(--amber);
	}
	.class-set-row .btn {
		min-height: 44px;
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
		padding: 0.15rem 0.8rem;
		/* A phone in a host's hand: 44px floor (prompt 0077), min-height never
		   a height. Measured about 20px before. */
		min-height: 44px;
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
	.danger h2 {
		color: var(--crimson);
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
</style>
