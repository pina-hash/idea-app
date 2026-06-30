<script lang="ts">
	import { goto } from '$app/navigation';
	import Header from '$lib/gauntlet/Header.svelte';
	import { roomStateLabel } from '$lib/gauntlet';

	let { data } = $props();
	let { supabase, userName, userRole, isTeacher, hosted, joined } = $derived(data);

	let joinCode = $state('');
	let busy = $state(false);
	let error = $state('');

	const createRoom = async () => {
		busy = true;
		error = '';
		const { data: room, error: e } = await supabase.rpc('gauntlet_room_create');
		if (e) {
			error = e.message;
			busy = false;
			return;
		}
		await goto(`/gauntlet/rooms/${room.id}`);
	};

	const joinRoom = async () => {
		if (!joinCode.trim()) return;
		busy = true;
		error = '';
		const { data: room, error: e } = await supabase.rpc('gauntlet_room_join', {
			p_join_code: joinCode.trim().toUpperCase()
		});
		if (e) {
			error = e.message;
			busy = false;
			return;
		}
		await goto(`/gauntlet/rooms/${room.id}`);
	};
</script>

<svelte:head>
	<title>Live Rooms // GAUNTLET</title>
</svelte:head>

<Header {supabase} {userName} {userRole} crumbs={[{ label: 'Live Rooms' }]} />

<main class="gauntlet">
	<section class="mode-hero">
		<span class="eyebrow">Synchronized Play</span>
		<h1>Live Rooms</h1>
		<p class="lead">
			A host runs a synchronized Speedrun: everyone gets the drawing at the same instant and races
			one shared clock. Runs are machine verified by the macro, or supervised manual entry, and rank
			on the room board.
		</p>
	</section>

	<div class="card room-join">
		<label class="ff">
			<span class="ff-label">Join a room</span>
			<div class="join-row">
				<input
					class="ff-input code-input"
					type="text"
					bind:value={joinCode}
					placeholder="Join code"
					maxlength="8"
					onkeydown={(e) => e.key === 'Enter' && joinRoom()}
				/>
				<button class="btn" type="button" disabled={busy || !joinCode.trim()} onclick={joinRoom}>Join</button>
			</div>
		</label>
	</div>

	{#if error}<p class="warn">{error}</p>{/if}

	{#if isTeacher}
		<div class="btn-row">
			<button class="btn" type="button" disabled={busy} onclick={createRoom}>+ Host a new room</button>
		</div>
		{#if hosted.length}
			<h2>Rooms you host</h2>
			<ul class="author-list">
				{#each hosted as r (r.id)}
					<li class="author-row">
						<a class="author-main" href="/gauntlet/rooms/{r.id}">
							<span class="author-title">Room {r.join_code}</span>
							<span class="author-sub"><span class="status-badge status-{r.state}">{roomStateLabel(r.state)}</span></span>
						</a>
						<span class="author-actions"><a class="text-act" href="/gauntlet/rooms/{r.id}">Open</a></span>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}

	{#if joined.length}
		<h2>Rooms you joined</h2>
		<ul class="author-list">
			{#each joined as r (r.id)}
				<li class="author-row">
					<a class="author-main" href="/gauntlet/rooms/{r.id}">
						<span class="author-title">Room {r.join_code}</span>
						<span class="author-sub">
							<span class="status-badge status-{r.state}">{roomStateLabel(r.state)}</span>
							<span class="mono dim">{r.role}</span>
						</span>
					</a>
					<span class="author-actions"><a class="text-act" href="/gauntlet/rooms/{r.id}">Open</a></span>
				</li>
			{/each}
		</ul>
	{/if}

	<div class="btn-row">
		<a class="btn secondary" href="/gauntlet">&lsaquo; Back to dojo</a>
	</div>
</main>
