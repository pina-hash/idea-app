<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import TournamentBoard from '$lib/tournaments/TournamentBoard.svelte';
	import { styleMap } from '$lib/tournaments/entry-styles';
	import type { PageData } from './$types';

	/**
	 * The list route (prompt 0110, item 3): the load, the realtime
	 * subscription and the two RPC transports. Everything on screen below the
	 * masthead is `TournamentBoard`, which the dev harness mounts identically
	 * against a fixture -- the route owns no card markup of its own any more.
	 */
	let { data }: { data: PageData } = $props();

	const signedIn = $derived(!!data.claims);
	const styles = $derived(styleMap(data.entryStyles));

	// The event clock for the marquee's rail, threaded in rather than read
	// there. A 30-second tick is plenty for a figure that reads "38m".
	let now = $state<number>(Date.now());
	onMount(() => {
		const id = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(id);
	});

	// THE BOARD FOLLOWS THE FLOOR. The spectator list is public, so this
	// subscribes with NO filter to the two tables that move the marquee: a
	// status change on any tournament re-sorts the lanes, and a match
	// starting or finishing anywhere live swaps the pair on the floor.
	// Debounced, the same shape every other tournament surface uses.
	onMount(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const kick = () => {
			clearTimeout(timer);
			timer = setTimeout(() => invalidateAll(), 150);
		};
		let channel = data.supabase.channel('tournaments-board');
		for (const table of ['tournaments', 'tournament_bracket_matches']) {
			channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, kick);
		}
		channel.subscribe();
		return () => {
			clearTimeout(timer);
			data.supabase.removeChannel(channel);
		};
	});

	// Pending-invite responses (display name required to accept). The name
	// is typed inside the board and arrives with the call.
	let inviteBusy = $state<string | null>(null);
	let inviteError = $state('');

	async function respond(inviteId: string, accept: boolean, displayName: string | null) {
		inviteError = '';
		inviteBusy = inviteId;
		const { error } = await data.supabase.rpc('tournament_respond_invite', {
			p_invite_id: inviteId,
			p_accept: accept,
			p_display_name: displayName
		});
		inviteBusy = null;
		if (error) {
			inviteError = error.message;
			return;
		}
		await invalidateAll();
	}

	// Deletion (0066, payout warning 0068). Per-row busy/error so one card's
	// failure never blanks another's control. The transport is handed to the
	// board only for a signed-in viewer: absence is what removes the control
	// for everyone else, and the board's own hosted/admin check narrows it
	// to the cards this account may act on. tournament_delete re-checks.
	let deleteBusy = $state<string | null>(null);
	let deleteErrors = $state<Record<string, string>>({});

	async function remove(id: string, confirmName: string, acknowledgePayoutLoss: boolean) {
		deleteErrors = { ...deleteErrors, [id]: '' };
		deleteBusy = id;
		const { error } = await data.supabase.rpc('tournament_delete', {
			p_tournament_id: id,
			p_confirm_name: confirmName || null,
			p_acknowledge_payout_loss: acknowledgePayoutLoss
		});
		deleteBusy = null;
		if (error) {
			deleteErrors = { ...deleteErrors, [id]: error.message };
			return;
		}
		await invalidateAll();
	}
</script>

<svelte:head>
	<title>Tournaments // IDEA</title>
</svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/">&lsaquo; Home</a>
		<ProfileMenu />
	</div>
</div>

<!-- The board is a grid of cards, so the page takes the split measure (D8):
     the room's own class, no width of this route's own. -->
<main class="tnm-page wide">
	<section class="hero">
		<div class="eyebrow">IDEA // Tournaments</div>
		<h1>Tournaments</h1>
		<p class="lead tnm-prose">
			Live double-elimination brackets, open to watch by anyone. Sign in to enter or to host.
		</p>
		{#if signedIn}
			<div class="tnm-actions">
				<a class="btn" href="/tournaments/new">New tournament</a>
			</div>
		{/if}
	</section>

	<TournamentBoard
		tournaments={data.tournaments}
		entries={data.entries}
		matches={data.matches}
		{styles}
		hostedIds={data.hostedIds}
		isAdmin={data.isAdmin}
		{signedIn}
		{now}
		rewardCountById={data.rewardCountById}
		rewardCoinsById={data.rewardCoinsById}
		rewardEntriesById={data.rewardEntriesById}
		myInvites={data.myInvites}
		onrespond={signedIn ? respond : undefined}
		ondelete={signedIn ? remove : undefined}
		deleteBusyId={deleteBusy}
		{deleteErrors}
		inviteBusyId={inviteBusy}
		{inviteError}
	/>

	<footer class="page-footer">
		<VersionBadge app="tournaments" />
	</footer>
</main>

<style>
	.page-footer {
		margin-top: 2.5rem;
		display: flex;
		justify-content: center;
	}
</style>
