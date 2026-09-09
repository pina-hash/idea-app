<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import BracketView from '$lib/tournaments/BracketView.svelte';
	import PoolsView from '$lib/tournaments/PoolsView.svelte';
	import EntryBanner from '$lib/tournaments/EntryBanner.svelte';
	import EntryStyleEditor from '$lib/tournaments/EntryStyleEditor.svelte';
	import EntryTeamPanel from '$lib/tournaments/EntryTeamPanel.svelte';
	import EventRail from '$lib/tournaments/EventRail.svelte';
	import MatchAlerts from '$lib/tournaments/MatchAlerts.svelte';
	import RegisterEntry from '$lib/tournaments/RegisterEntry.svelte';
	import RewardsPanel from '$lib/tournaments/RewardsPanel.svelte';
	import TournamentQr from '$lib/tournaments/TournamentQr.svelte';
	import TournamentStats from '$lib/tournaments/TournamentStats.svelte';
	import {
		entryHref,
		entryIsFull,
		entryMap,
		matchHref,
		memberMap,
		memberNames,
		parseConfig,
		roundLabel,
		statusLabel
	} from '$lib/tournaments/tournaments';
	import { styleMap, type EntryStyleDraft } from '$lib/tournaments/entry-styles';
	import { fullscreenActive, toggleFullscreen } from '$lib/tournaments/fullscreen';
	import { matchQueue } from '$lib/tournaments/live';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const t = $derived(data.tournament);
	const config = $derived(parseConfig(t.config));
	const teamSize = $derived(config.team_size);
	const entries = $derived(entryMap(data.entries));
	const members = $derived(memberMap(data.members));
	const styles = $derived(styleMap(data.entryStyles));
	const signedIn = $derived(!!data.claims);
	const viewerId = $derived(data.claims?.sub ?? null);
	const champion = $derived(
		t.champion_entry_id ? (entries[t.champion_entry_id] ?? null) : null
	);

	/**
	 * 0192 READINESS, READ OFF THE DATA RATHER THAN OFF A VERSION. After the
	 * migration's backfill EVERY entry has at least one member row, so a
	 * tournament with entries and no members is a deployment the migration
	 * has not reached yet -- and the team panel's transports name RPCs that
	 * do not exist there. The panel stays off the page in that state (the
	 * select-ladder rule: turn off exactly what is missing), and nothing else
	 * changes, because every other surface only READS members.
	 */
	const membersReady = $derived(data.entries.length === 0 || data.members.length > 0);

	/** ONE queue, shared with the host console and the projector (live.ts):
	 * what is on now, and what gets called next. */
	const queue = $derived(matchQueue(data.bracketMatches));
	const liveMatches = $derived(queue.inProgress);
	const upNext = $derived(queue.ready.slice(0, 3));

	// The event clock, threaded into the rail rather than read there. A
	// 30-second tick is plenty for a figure that reads "38m".
	let now = $state<number>(Date.now());
	onMount(() => {
		const id = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(id);
	});
	function maxRound(bracket: string): number {
		return Math.max(
			0,
			...data.bracketMatches.filter((m) => m.bracket === bracket).map((m) => m.round)
		);
	}

	// Live updates for everyone, signed-out spectators included: subscribe to
	// every tournament-scoped table and refetch (debounced) on any event.
	onMount(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const kick = () => {
			clearTimeout(timer);
			timer = setTimeout(() => invalidateAll(), 150);
		};
		const filtered = [
			'tournament_entries',
			'tournament_entry_members',
			'tournament_qual_pools',
			'tournament_qual_matches',
			'tournament_bracket_matches',
			'tournament_match_games',
			'tournament_reward_rules',
			'tournament_reward_ledger',
			'tournament_entry_styles'
		];
		let channel = data.supabase.channel(`tournament-${t.id}`);
		for (const table of filtered) {
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

	// Self-registration (also used for invite acceptance). The form is
	// `RegisterEntry`; this route does the upload and picks the RPC arity.
	let regBusy = $state(false);
	let regError = $state('');

	async function uploadThumb(file: File | null): Promise<string | null> {
		if (!file || !data.claims) return null;
		const ext = (file.name.split('.').pop() || 'png').toLowerCase();
		const path = `${data.claims.sub}/${crypto.randomUUID()}.${ext}`;
		const { error } = await data.supabase.storage.from('tournament-thumbs').upload(path, file);
		if (error) throw new Error(`Thumbnail upload failed: ${error.message}`);
		return data.supabase.storage.from('tournament-thumbs').getPublicUrl(path).data.publicUrl;
	}

	/**
	 * TWO ARITIES, NEVER BOTH BINDABLE (0192, the signature-trap exception).
	 * The wide form takes all six keys and declares no defaults; the narrow
	 * form is the 0062 signature verbatim. A team event, or any roster name
	 * typed, sends six keys; a plain solo registration sends the four it
	 * always did, which is also what keeps this client correct on a
	 * deployment the migration has not reached (a solo form never shows the
	 * roster fields, and team_size > 1 cannot be stored before 0192).
	 *
	 * AN INVITE HAS NO WIDE FORM, SO THE ROSTER LANDS IN A SECOND STEP.
	 * `tournament_respond_invite` takes the entry's name, description and
	 * picture and inserts the captain's member row named as the entry; it
	 * has no roster parameters and returns nothing. The form shows the
	 * roster fields on a team event whether or not it is an invite, so an
	 * invitee's own roster name and their teammates used to be read by
	 * nobody -- typed, submitted, and dropped without a word. Now the accept
	 * lands first (it is the entry; nothing below can exist without it), the
	 * refreshed load names the entry and the captain's own row, and the
	 * roster follows through the same two RPCs the team panel uses. A name
	 * that fails there is NOT a failed registration: the entry stands, the
	 * message says which names did not land and where to add them, and
	 * nothing is retried on the caller's behalf (a partial failure keeps what
	 * did not land and names it). The note goes to the TEAM PANEL's error
	 * slot, not the form's: once the entry exists the form is unmounted and
	 * the panel is what is on screen, so a note left in `regError` would be
	 * a sentence nobody sees (an acknowledgement must survive the act it
	 * reports).
	 */
	async function register(draft: {
		display_name: string;
		description: string;
		member_name: string;
		teammates: string[];
		file: File | null;
	}) {
		regError = '';
		regBusy = true;
		try {
			const thumb = await uploadThumb(draft.file);
			if (data.myInvite) {
				const { error } = await data.supabase.rpc('tournament_respond_invite', {
					p_invite_id: data.myInvite.id,
					p_accept: true,
					p_display_name: draft.display_name,
					p_description: draft.description,
					p_thumbnail_url: thumb
				});
				if (error) throw new Error(error.message);
				const rosterNote = await settleInviteRoster(draft);
				if (rosterNote) teamError = rosterNote;
				return;
			} else if (teamSize > 1 || draft.member_name || draft.teammates.length) {
				const { error } = await data.supabase.rpc('tournament_register_entry', {
					p_tournament_id: t.id,
					p_display_name: draft.display_name,
					p_description: draft.description,
					p_thumbnail_url: thumb,
					p_member_name: draft.member_name || null,
					p_teammates: draft.teammates
				});
				if (error) throw new Error(error.message);
			} else {
				const { error } = await data.supabase.rpc('tournament_register_entry', {
					p_tournament_id: t.id,
					p_display_name: draft.display_name,
					p_description: draft.description,
					p_thumbnail_url: thumb
				});
				if (error) throw new Error(error.message);
			}
			await invalidateAll();
		} catch (e) {
			regError = e instanceof Error ? e.message : String(e);
		} finally {
			regBusy = false;
		}
	}

	/**
	 * The invite's roster step. Runs only when the form carried something the
	 * accept could not: a roster name other than the entry's, or a teammate.
	 * Reads the entry and the captain's row off the REFRESHED load (`myEntry`
	 * and `myMember` are the server's one spelling of both), never off a
	 * client-side guess. Returns the sentence to show, or '' when every name
	 * landed.
	 */
	async function settleInviteRoster(draft: {
		display_name: string;
		member_name: string;
		teammates: string[];
	}): Promise<string> {
		const ownName = draft.member_name && draft.member_name !== draft.display_name;
		await invalidateAll();
		if (!ownName && draft.teammates.length === 0) return '';
		const mine = data.myEntry;
		const me = data.myMember;
		const failed: string[] = [];
		if (ownName) {
			const { error } = me
				? await data.supabase.rpc('tournament_rename_entry_member', {
						p_member_id: me.id,
						p_name: draft.member_name
					})
				: { error: { message: 'your own roster row was not found' } };
			if (error) failed.push(`${draft.member_name} (${error.message})`);
		}
		for (const name of draft.teammates) {
			const { error } = mine
				? await data.supabase.rpc('tournament_add_entry_member', {
						p_entry_id: mine.id,
						p_name: name,
						p_email: null
					})
				: { error: { message: 'your entry was not found' } };
			if (error) failed.push(`${name} (${error.message})`);
		}
		await invalidateAll();
		if (failed.length === 0) return '';
		return `Your entry is registered. These roster names did not land: ${failed.join('; ')}. Add them from your entry below.`;
	}

	async function declineInvite() {
		if (!data.myInvite) return;
		regBusy = true;
		await data.supabase.rpc('tournament_respond_invite', {
			p_invite_id: data.myInvite.id,
			p_accept: false
		});
		regBusy = false;
		await invalidateAll();
	}

	// --- the viewer's own roster (0192, items 6 and 7) ---
	// One busy flag and one error for the panel: every transport is a single
	// RPC, surfaces its message in the panel, and refetches on success. The
	// server owns every rule (the window, the lock, capacity, the captain).
	let teamBusy = $state(false);
	let teamError = $state('');

	async function runTeam(fn: () => PromiseLike<{ error: { message: string } | null }>) {
		teamError = '';
		teamBusy = true;
		try {
			const { error } = await fn();
			if (error) {
				teamError = error.message;
				return;
			}
			await invalidateAll();
		} finally {
			teamBusy = false;
		}
	}
	function renameEntry(name: string) {
		const mine = data.myEntry;
		if (!mine) return;
		void runTeam(() =>
			data.supabase.rpc('tournament_update_entry', { p_entry_id: mine.id, p_display_name: name })
		);
	}
	function addMember(name: string, email: string | null) {
		const mine = data.myEntry;
		if (!mine) return;
		void runTeam(() =>
			data.supabase.rpc('tournament_add_entry_member', {
				p_entry_id: mine.id,
				p_name: name,
				p_email: email
			})
		);
	}
	const removeMember = (memberId: string) =>
		runTeam(() => data.supabase.rpc('tournament_remove_entry_member', { p_member_id: memberId }));
	const renameMember = (memberId: string, name: string) =>
		runTeam(() =>
			data.supabase.rpc('tournament_rename_entry_member', { p_member_id: memberId, p_name: name })
		);

	// --- joining somebody else's entry (0192) ---
	// Offered per entry with room while registration is open, to a signed-in
	// viewer who is not in the tournament yet. Gated on team_size > 1 rather
	// than on capacity alone: a solo event's entries are full by definition
	// once they hold their one registrant, and team_size > 1 can only be
	// stored by the 0192 normaliser, so the RPC behind this control exists
	// whenever the control renders.
	let joinId = $state<string | null>(null);
	let joinName = $state('');
	let joinBusy = $state(false);
	let joinError = $state('');

	const canJoin = (entryId: string) =>
		regOpen &&
		signedIn &&
		!data.myEntry &&
		teamSize > 1 &&
		!entryIsFull(members[entryId]?.length ?? 0, teamSize);

	function openJoin(entryId: string) {
		joinId = entryId;
		joinName = '';
		joinError = '';
	}

	async function join(e: SubmitEvent, entryId: string) {
		e.preventDefault();
		const name = joinName.trim();
		if (!name || joinBusy) return;
		joinError = '';
		joinBusy = true;
		try {
			const { error } = await data.supabase.rpc('tournament_join_entry', {
				p_entry_id: entryId,
				p_name: name
			});
			if (error) {
				joinError = error.message;
				return;
			}
			joinId = null;
			await invalidateAll();
		} finally {
			joinBusy = false;
		}
	}

	// --- banner customization (own entry only; a host restyles walk-ups from
	// the host console) ---
	let styleBusy = $state(false);
	let styleError = $state('');
	let styleOpen = $state(false);

	async function saveStyle(draft: EntryStyleDraft) {
		if (!data.myEntry) return;
		styleError = '';
		styleBusy = true;
		const { error } = await data.supabase.rpc('tournament_set_entry_style', {
			p_entry_id: data.myEntry.id,
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

	/** Banner art reuses the entry-thumbnail bucket: same visibility, same
	 * own-folder ownership rule (0062), so no second bucket to keep in sync. */
	async function uploadBackground(file: File): Promise<string> {
		if (!data.claims) throw new Error('Sign in to upload an image.');
		const ext = (file.name.split('.').pop() || 'png').toLowerCase();
		const path = `${data.claims.sub}/bg-${crypto.randomUUID()}.${ext}`;
		const { error } = await data.supabase.storage.from('tournament-thumbs').upload(path, file);
		if (error) throw new Error(`Upload failed: ${error.message}`);
		return data.supabase.storage.from('tournament-thumbs').getPublicUrl(path).data.publicUrl;
	}

	/**
	 * THE BRACKET IN FULL SCREEN (item 2): the second caller of
	 * `$lib/tournaments/fullscreen.ts`, after the projector. The bracket
	 * section is the element that goes full screen, so the round columns
	 * take the whole display (2844px on Mr. Pina's screen) and the room's
	 * `.bracket-stage:fullscreen` rule paints the plate back under it. Only
	 * `fullscreenchange` decides what the control reads: the user can leave
	 * with Escape, and a flag flipped on the click would then lie. A button
	 * and no hotkey -- this page has forms on it, and the F key is the
	 * projector's alone.
	 */
	let bracketEl = $state<HTMLElement | null>(null);
	let bracketFull = $state(false);
	onMount(() => {
		const sync = () => (bracketFull = fullscreenActive(document));
		document.addEventListener('fullscreenchange', sync);
		document.addEventListener('webkitfullscreenchange', sync);
		return () => {
			document.removeEventListener('fullscreenchange', sync);
			document.removeEventListener('webkitfullscreenchange', sync);
		};
	});

	// The page's own canonical URL (origin + path, no query), for the QR.
	const shareUrl = $derived(`${page.url.origin}/tournaments/${t.id}`);

	const regOpen = $derived(t.status === 'registration_open');
	const canRegister = $derived(
		signedIn &&
			!data.myEntry &&
			(regOpen || (!!data.myInvite && (regOpen || t.status === 'seeding')))
	);
	const hasRewards = $derived(data.rewardRules.length > 0 || data.rewardLedger.length > 0);
	const seedShown = $derived(
		t.status === 'live' || t.status === 'complete' || t.status === 'seeding'
	);
</script>

<svelte:head>
	<title>{t.name} // Tournaments // IDEA</title>
</svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/tournaments">&lsaquo; Tournaments</a>
		<ProfileMenu />
	</div>
</div>

<!-- THE WORKING SURFACE TAKES THE WINDOW (D8): the console measure, less the
     gutter. The bracket is the widest thing in the app and was cut off in an
     880px column; prose inside it stays a reading measure via .tnm-prose. -->
<main class="tnm-page console">
	<section class="hero">
		<div class="eyebrow">IDEA // Tournaments</div>
		<div class="title-row">
			<h1>{t.name}</h1>
			{#if t.status === 'live'}
				<span class="tnm-live tnm-status live">Live</span>
			{:else}
				<span
					class="tnm-status"
					class:open={t.status === 'registration_open'}
					class:done={t.status === 'complete'}
				>
					{statusLabel(t.status)}
				</span>
			{/if}
		</div>
		{#if t.description}<p class="lead tnm-prose">{t.description}</p>{/if}
		{#if data.bracketMatches.length}
			<div class="rail-row">
				<EventRail matches={data.bracketMatches} {now} />
			</div>
		{/if}
		<!-- The masthead's action cluster: the projector for anyone, the
		     console for a host -- or for a site admin, who manages any
		     tournament (item 5) and is told so in the link's own word, since
		     the console will say the same at the top. -->
		<div class="tnm-actions masthead-actions">
			<a class="btn secondary" href="/tournaments/{t.id}/tv">TV mode</a>
			{#if data.canManage}
				<a class="btn" href="/tournaments/{t.id}/host" data-manage>
					{data.isAdmin && !data.isHost ? 'Manage (admin)' : 'Host console'}
				</a>
			{/if}
		</div>
	</section>

	{#if champion}
		<section class="champion-banner">
			<span class="champ-label">Champion</span>
			<EntryBanner
				entry={champion}
				style={styles[champion.id] ?? null}
				size="lg"
				winner
				event="win"
				members={memberNames(members[champion.id])}
			/>
		</section>
	{/if}

	<!-- Now playing beside Up next on a desktop (.tnm-two), stacked on a
	     phone; with only one of them present the grid is not applied and
	     that one takes the width. -->
	<div class="floor" class:tnm-two={liveMatches.length > 0 && upNext.length > 0}>
		{#if liveMatches.length}
			<section class="block">
				<h2 class="block-title">Now playing</h2>
				<div class="live-list">
					{#each liveMatches as m (m.id)}
						<div class="live-match">
							<div class="live-head">
								<span class="live-round">{roundLabel(m.bracket, m.round, maxRound(m.bracket))}</span>
								{#if m.best_of > 1}<span class="live-bo">Best of {m.best_of}</span>{/if}
								<a class="live-detail" href={matchHref(t.id, m.id)}>match detail</a>
							</div>
							<div class="live-pair">
								<EntryBanner
									entry={m.entry_a_id ? (entries[m.entry_a_id] ?? null) : null}
									style={m.entry_a_id ? (styles[m.entry_a_id] ?? null) : null}
									size="md"
									members={m.entry_a_id ? memberNames(members[m.entry_a_id]) : []}
								/>
								<span class="live-vs">vs</span>
								<EntryBanner
									entry={m.entry_b_id ? (entries[m.entry_b_id] ?? null) : null}
									style={m.entry_b_id ? (styles[m.entry_b_id] ?? null) : null}
									size="md"
									members={m.entry_b_id ? memberNames(members[m.entry_b_id]) : []}
								/>
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<!-- THE NAME ABOUT TO BE CALLED. The same queue the host's console starts
		     from and the projector shows, so a competitor reading this page knows
		     they are up before anybody says so. -->
		{#if t.status === 'live' && upNext.length}
			<section class="block">
				<h2 class="block-title">Up next</h2>
				<div class="upnext">
					{#each upNext as m (m.id)}
						<a class="upnext-row" href={matchHref(t.id, m.id)}>
							<span class="upnext-label">{roundLabel(m.bracket, m.round, maxRound(m.bracket))}</span>
							<span class="upnext-pair">
								<span class="upnext-name">{m.entry_a_id ? (entries[m.entry_a_id]?.display_name ?? '?') : 'TBD'}</span>
								<span class="live-vs">vs</span>
								<span class="upnext-name">{m.entry_b_id ? (entries[m.entry_b_id]?.display_name ?? '?') : 'TBD'}</span>
							</span>
						</a>
					{/each}
				</div>
			</section>
		{/if}
	</div>

	{#if regOpen}
		<section class="card qr-section">
			<TournamentQr url={shareUrl} name={t.name} />
		</section>
	{/if}

	{#if signedIn && data.myEntry && t.status !== 'complete'}
		<MatchAlerts supabase={data.supabase} />
	{/if}

	{#if canRegister}
		<div class="tnm-prose">
			<RegisterEntry
				{teamSize}
				invite={!!data.myInvite}
				busy={regBusy}
				error={regError}
				onregister={register}
				ondecline={data.myInvite ? declineInvite : undefined}
			/>
		</div>
	{:else if regOpen && !signedIn}
		<section class="card register tnm-prose">
			<h2>Registration is open</h2>
			<p class="note">Sign in from the <a href="/">home page</a> to register an entry.</p>
		</section>
	{:else if data.myEntry}
		<section class="card register tnm-prose" id="register">
			<div class="mine-head">
				<span class="note">Your entry</span>
				<button class="btn secondary" onclick={() => (styleOpen = !styleOpen)}>
					{styleOpen ? 'Done' : 'Customize banner'}
				</button>
			</div>
			<EntryBanner
				entry={data.myEntry}
				style={styles[data.myEntry.id] ?? null}
				size="md"
				members={memberNames(members[data.myEntry.id])}
			/>
			{#if membersReady}
				<div class="team-panel">
					<EntryTeamPanel
						entry={data.myEntry}
						members={members[data.myEntry.id] ?? []}
						{teamSize}
						status={t.status}
						{viewerId}
						busy={teamBusy}
						error={teamError}
						onrename={renameEntry}
						onaddmember={addMember}
						onremovemember={removeMember}
						onrenamemember={renameMember}
					/>
				</div>
			{/if}
			{#if styleOpen}
				<div class="style-panel">
					<EntryStyleEditor
						entry={data.myEntry}
						style={styles[data.myEntry.id] ?? null}
						busy={styleBusy}
						error={styleError}
						note="Your banner shows wherever you appear: the bracket, the live match view, and the big screen."
						onsave={saveStyle}
						onupload={uploadBackground}
					/>
				</div>
			{/if}
		</section>
	{/if}

	{#if data.bracketMatches.length}
		<section class="block bracket-stage" bind:this={bracketEl}>
			<div class="bracket-head">
				<h2 class="block-title">Bracket</h2>
				<button
					type="button"
					class="btn secondary"
					onclick={() => toggleFullscreen(bracketEl, document)}
					data-action="bracket-fullscreen"
				>
					{bracketFull ? 'Exit full screen' : 'Full screen'}
				</button>
			</div>
			<BracketView
				matches={data.bracketMatches}
				{entries}
				{styles}
				games={data.games}
				championId={t.champion_entry_id}
				tournamentId={t.id}
			/>
			<p class="bracket-hint">Open any match for its timeline and result history.</p>
		</section>

		<!-- Deliberately UNDER the bracket and deliberately quiet: the bracket
		     is what people come to this page for, and these are a footnote to
		     it, not a competing dashboard. -->
		<section class="block stats-block">
			<TournamentStats tournamentId={t.id} matches={data.bracketMatches} {entries} />
		</section>
	{/if}

	{#if config.quals_enabled && data.pools.length}
		<section class="block">
			<h2 class="block-title">Qualifying pools</h2>
			<PoolsView
				pools={data.pools}
				matches={data.qualMatches}
				{entries}
				scoreEntry={config.score_entry}
			/>
		</section>
	{/if}

	<!-- Rewards beside the entries on a desktop; entries alone take the
	     width when there is nothing to pay. -->
	<div class="lower" class:tnm-two={hasRewards}>
		{#if hasRewards}
			<section class="block">
				<h2 class="block-title">Rewards</h2>
				<RewardsPanel rules={data.rewardRules} ledger={data.rewardLedger} {entries} />
			</section>
		{/if}

		<section class="block">
			<h2 class="block-title">Entries ({data.entries.length})</h2>
			{#if teamSize > 1}
				<p class="note">Teams of up to {teamSize}.</p>
			{/if}
			{#if data.entries.length}
				<div class="entrants">
					{#each data.entries as e (e.id)}
						<div class="entrant">
							<a class="entrant-link" href={entryHref(t.id, e.id)}>
								<EntryBanner
									entry={e}
									style={styles[e.id] ?? null}
									size="sm"
									seed={seedShown ? e.seed : null}
									members={memberNames(members[e.id])}
								/>
							</a>
							{#if e.description}<p class="entrant-desc">{e.description}</p>{/if}
							{#if canJoin(e.id)}
								{#if joinId === e.id}
									<form class="join-form" onsubmit={(ev) => join(ev, e.id)} data-form="join-entry">
										<label class="field">
											<span class="f-label">Your name on the roster</span>
											<input type="text" maxlength="40" required bind:value={joinName} />
										</label>
										{#if joinError}<p class="error" role="alert">{joinError}</p>{/if}
										<div class="tnm-actions">
											<button
												type="submit"
												class="btn"
												disabled={joinBusy || !joinName.trim()}
												data-action="join-entry"
											>
												Join entry
											</button>
											<button type="button" class="btn secondary" onclick={() => (joinId = null)}>
												Cancel
											</button>
										</div>
									</form>
								{:else}
									<div class="tnm-actions">
										<button
											type="button"
											class="btn secondary"
											onclick={() => openJoin(e.id)}
											data-action="join"
										>
											Join
										</button>
									</div>
								{/if}
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<p class="note">No entries yet.</p>
			{/if}
		</section>
	</div>

	<footer class="page-footer">
		<VersionBadge app="tournaments" />
	</footer>
</main>

<style>
	.title-row {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		flex-wrap: wrap;
	}
	.title-row h1 {
		margin: 0;
	}
	.rail-row {
		margin: 1rem 0 0.2rem;
		max-width: 44rem;
	}
	.masthead-actions {
		margin-top: 1rem;
	}
	.upnext {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.upnext-row {
		display: flex;
		align-items: center;
		gap: 0.6rem 1rem;
		flex-wrap: wrap;
		padding: 0.7rem 0.9rem;
		min-height: 44px;
		border: 1px solid var(--tnm-line);
		border-radius: 10px;
		background: var(--tnm-panel);
		color: var(--tnm-ink);
		text-decoration: none;
	}
	.upnext-row:hover,
	.upnext-row:focus-visible {
		border-color: var(--tnm-line-strong);
	}
	.upnext-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--tnm-ink-dim);
		min-width: 9rem;
	}
	.upnext-pair {
		display: inline-flex;
		align-items: baseline;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.upnext-name {
		font-weight: 700;
		font-size: 1.15rem;
	}
	.qr-section {
		margin-bottom: 1.1rem;
	}
	.champion-banner {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-bottom: 1.1rem;
	}
	.champ-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--gold);
	}
	/* Live match view: the entries' own banners at reading size. */
	.live-list {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	.live-match {
		border: 1px solid var(--line, rgba(0, 255, 65, 0.14));
		border-radius: 10px;
		padding: 0.8rem;
	}
	.live-head {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		margin-bottom: 0.55rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--dim);
	}
	/* Gold is placement only in this room; a format label is metadata. */
	.live-bo {
		color: var(--tnm-ink-dim);
	}
	.live-detail {
		margin-left: auto;
		color: var(--dim);
		text-transform: none;
		letter-spacing: 0.04em;
	}
	/* The bracket's own heading row carries the full-screen control: a
	 * control beside the thing it acts on, 44px through .btn's room floor. */
	.bracket-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.8rem;
		flex-wrap: wrap;
		margin-bottom: 0.6rem;
	}
	.bracket-head .block-title {
		margin: 0;
	}
	.bracket-head .btn {
		min-height: 44px;
	}
	.bracket-hint {
		margin: 0.5rem 0 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--dim);
	}
	/* Sits closer to the bracket than a normal block: it belongs to it. */
	.stats-block {
		margin-top: 1rem;
	}
	.entrant-link {
		display: block;
		text-decoration: none;
		border-radius: 10px;
		min-width: 0;
	}
	.live-pair {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 0.8rem;
	}
	.live-vs {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		color: var(--dim);
		text-transform: uppercase;
	}
	@media (max-width: 46rem) {
		.live-pair {
			grid-template-columns: 1fr;
			justify-items: stretch;
		}
		.live-vs {
			justify-self: center;
		}
	}
	.mine-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.7rem;
		margin-bottom: 0.5rem;
	}
	.team-panel,
	.style-panel {
		margin-top: 0.9rem;
		padding-top: 0.9rem;
		border-top: 1px solid var(--line, rgba(0, 255, 65, 0.14));
	}
	.register {
		margin-bottom: 1.1rem;
	}
	.register h2 {
		margin-top: 0;
	}
	.note {
		color: var(--dim);
		font-size: 0.9rem;
	}
	.error {
		color: var(--amber);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
	}
	.block {
		margin-top: 1.6rem;
	}
	/* Neutral, the room's label: the page's one emerald is the LIVE chip. */
	.block-title {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--tnm-ink-dim);
	}
	.entrants {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
		gap: 0.8rem;
	}
	.entrant {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 0;
	}
	.entrant-desc {
		margin: 0 0 0 0.2rem;
		color: var(--dim);
		font-size: 0.85rem;
	}
	/* Joining an entry: one name, inline under the banner. Same input
	 * treatment as the room's other forms. */
	.join-form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 0.2rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.f-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--tnm-ink-dim);
	}
	.join-form input {
		background: var(--surface-input, var(--bg0));
		border: 1px solid var(--line, rgba(0, 255, 65, 0.25));
		border-radius: 4px;
		color: var(--tnm-ink);
		font-family: 'Rajdhani', sans-serif;
		font-size: 1rem;
		padding: 0.45rem 0.6rem;
		min-height: 44px;
		box-sizing: border-box;
	}
	.page-footer {
		margin-top: 2.5rem;
		display: flex;
		justify-content: center;
	}
</style>
