<script lang="ts">
	import { goto } from '$app/navigation';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import TournamentSettingsForm from '$lib/tournaments/TournamentSettingsForm.svelte';
	import { tournamentCreateArgs, type SettingsDraft } from '$lib/tournaments/settings';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The fields are `TournamentSettingsForm`, the SAME form the host console's
	// Settings card edits with (ledger 0298, R02), and the payload is built by
	// `tournamentCreateArgs`: the same name, description and config literal
	// this page always sent, keys and defaults unchanged.
	let busy = $state(false);
	let errorMsg = $state('');

	async function create(draft: SettingsDraft) {
		errorMsg = '';
		busy = true;
		const { data: id, error } = await data.supabase.rpc(
			'tournament_create',
			tournamentCreateArgs(draft)
		);
		busy = false;
		if (error) {
			errorMsg = error.message;
			return;
		}
		await goto(`/tournaments/${id}/host`);
	}
</script>

<svelte:head>
	<title>New Tournament // IDEA</title>
</svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/tournaments">&lsaquo; Tournaments</a>
		<ProfileMenu />
	</div>
</div>

<main class="new-page tnm-page">
	<section class="hero">
		<div class="eyebrow">IDEA // Tournaments</div>
		<h1>New tournament</h1>
		<p class="lead">
			You become the first host and can add co-hosts later from the host console. Every setting
			here can be changed there until the bracket is generated.
		</p>
	</section>

	<div class="card">
		<TournamentSettingsForm mode="create" {busy} error={errorMsg} onsubmit={create} />
	</div>
</main>

<style>
	/* A form, not a listing: the page measure narrowed to the form measure
	 * (design-system --measure-form, 48rem) so a select does not stretch
	 * across a listing width. */
	.new-page {
		max-width: var(--measure-form, 48rem);
	}
</style>
