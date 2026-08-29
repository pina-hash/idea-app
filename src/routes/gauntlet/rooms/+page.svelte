<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import Header from '$lib/gauntlet/Header.svelte';
	import { roomStateLabel } from '$lib/gauntlet';

	let { data } = $props();
	// 0155: hosting is the AUTHOR TIER, not admin. The flag is named after the
	// capability so nothing admin-only gets gated on it by mistake.
	let { supabase, userName, userRole, canHost, refusal, hosted, joined } = $derived(data);

	let joinCode = $state('');
	let busy = $state(false);
	let error = $state('');

	// Two-step teacher-only delete: the first click arms the confirm, the second
	// calls the host-enforced gauntlet_room_delete RPC (0025). Students never see
	// this (hosted rooms are teacher-only) and the RPC blocks non-host callers.
	let confirmDelete = $state('');
	let deleting = $state('');
	const armDelete = (id: string) => {
		confirmDelete = id;
		error = '';
	};
	const cancelDelete = () => (confirmDelete = '');
	const deleteRoom = async (id: string) => {
		deleting = id;
		error = '';
		const { error: e } = await supabase.rpc('gauntlet_room_delete', { p_room_id: id });
		deleting = '';
		confirmDelete = '';
		if (e) {
			error = e.message;
			return;
		}
		await invalidateAll();
	};

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
					placeholder="ABCD"
					maxlength="4"
					autocapitalize="characters"
					autocomplete="off"
					spellcheck="false"
					oninput={(e) => (joinCode = e.currentTarget.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))}
					onkeydown={(e) => e.key === 'Enter' && joinRoom()}
				/>
				<button class="btn" type="button" disabled={busy || !joinCode.trim()} onclick={joinRoom}>Join</button>
			</div>
		</label>
	</div>

	{#if error}<p class="warn">{error}</p>{/if}

	{#if canHost}
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
						<span class="author-actions">
							<a class="text-act" href="/gauntlet/rooms/{r.id}">Open</a>
							{#if confirmDelete === r.id}
								<span class="dim confirm-q">Delete room {r.join_code}?</span>
								<button class="text-act danger" type="button" disabled={deleting === r.id} onclick={() => deleteRoom(r.id)}>
									{deleting === r.id ? 'Deleting...' : 'Confirm'}
								</button>
								<button class="text-act" type="button" disabled={deleting === r.id} onclick={cancelDelete}>Cancel</button>
							{:else}
								<button class="text-act danger" type="button" onclick={() => armDelete(r.id)}>Delete</button>
							{/if}
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	{:else if refusal}
		<!--
			HOSTING IS REFUSED, AND SAID SO. Before 0155 this branch simply did not
			render and a teacher read a rooms page with no way to host and nothing
			explaining it, which is the same "refused reads as broken" finding the
			authoring route's redirect produced. JOINING is untouched: the join
			form above is outside this branch, because anyone may join a room by
			code and always could.
		-->
		<div class="card">
			<h2>{refusal.title}</h2>
			<p>{refusal.body}</p>
			<p>{refusal.ask}</p>
			<p class="dim">You can still join any room somebody gives you a code for.</p>
		</div>
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
