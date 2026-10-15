<script lang="ts">
	import { onMount } from 'svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { callV2, V2_UNAVAILABLE } from './v2';
	import { FULL_ADMIN_SENTENCE, fullAdminRefusal, type FullAdminList } from './settings-session-two';

	/**
	 * WHO HOLDS FULL COIN POWERS (decision 68, 0244): coin_full_admin_list and
	 * coin_full_admin_set. The owner is always full and is not on the list;
	 * anyone else on it is full only while they are also a site admin, and the
	 * list says so beside each name rather than letting a non-admin's row look
	 * like it works. Removing someone takes two presses.
	 */
	let { supabase }: { supabase: SupabaseClient } = $props();

	let list = $state<FullAdminList | null>(null);
	let phase = $state<'loading' | 'ready' | 'missing' | 'error'>('loading');
	let message = $state('');

	async function load() {
		const r = await callV2<FullAdminList>(supabase, 'coin_full_admin_list');
		if (r.kind === 'ok') {
			list = r.data;
			phase = 'ready';
		} else if (phase !== 'ready') {
			phase = r.kind;
			message = r.kind === 'error' ? r.message : V2_UNAVAILABLE;
		}
	}

	onMount(() => {
		void load();
	});

	let email = $state('');
	let note = $state('');
	let busy = $state(false);
	let said = $state<{ ok: boolean; text: string } | null>(null);
	let armed = $state<string | null>(null);

	const emailOk = $derived(/^[^@\s]+@boscotech\.edu$/i.test(email.trim()));

	async function set(target: string, on: boolean) {
		busy = true;
		said = null;
		const r = await callV2<{ ok: boolean; reason?: string; is_site_admin?: boolean }>(supabase, 'coin_full_admin_set', {
			p_email: target,
			p_on: on,
			p_note: on ? note.trim() || null : null
		});
		busy = false;
		armed = null;
		if (r.kind !== 'ok') {
			said = { ok: false, text: r.kind === 'error' ? r.message : V2_UNAVAILABLE };
			return;
		}
		if (!r.data?.ok) {
			said = { ok: false, text: fullAdminRefusal(r.data?.reason) };
			return;
		}
		if (on) {
			said = {
				ok: true,
				text: r.data.is_site_admin
					? `${target} now has full coin powers.`
					: `${target} is on the list, but is not a site admin, so they have no full coin powers until they are made one.`
			};
			email = '';
			note = '';
		} else {
			said = { ok: true, text: `${target} no longer has full coin powers.` };
		}
		await load();
	}
</script>

<section class="card" id="cd-set-full-admins" data-testid="cd-set-full-admins">
	<h2>Full coin admins</h2>
	<p class="cdx-note">{FULL_ADMIN_SENTENCE}</p>
	{#if phase === 'loading'}
		<p class="cdx-note">Loading…</p>
	{:else if phase !== 'ready' || !list}
		<p class="cdx-feedback error">{message}</p>
	{:else}
		<p class="owner">Owner: <strong>{list.owner}</strong></p>
		{#if list.full_admins.length}
			<ul class="admins">
				{#each list.full_admins as a (a.email)}
					<li data-testid="cd-full-admin">
						<span class="who">{a.email}</span>
						{#if a.is_site_admin}
							<span class="cdx-chip ok">Full coin powers</span>
						{:else}
							<span class="cdx-chip warn">Not a site admin, so not full</span>
						{/if}
						{#if a.note}<span class="cdx-note">{a.note}</span>{/if}
						{#if armed === a.email}
							<button
								type="button"
								class="btn cdx-small"
								data-testid="cd-full-admin-remove-confirm"
								aria-disabled={busy}
								onclick={() => set(a.email, false)}
							>
								Confirm: remove full coin powers
							</button>
							<button type="button" class="btn secondary cdx-small" onclick={() => (armed = null)}>Keep</button>
						{:else}
							<button
								type="button"
								class="btn secondary cdx-small"
								data-testid="cd-full-admin-remove"
								onclick={() => (armed = a.email)}
							>
								Remove
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="cdx-note">Nobody but the owner has full coin powers.</p>
		{/if}
		<div class="cdx-row">
			<label class="cdx-field grow">
				<span>Staff email</span>
				<input class="cdx-input" type="email" placeholder="name@boscotech.edu" data-testid="cd-full-admin-email" bind:value={email} />
			</label>
			<label class="cdx-field grow">
				<span>Note (optional)</span>
				<input class="cdx-input" type="text" maxlength="300" bind:value={note} />
			</label>
			<button
				type="button"
				class="btn"
				data-testid="cd-full-admin-add"
				aria-disabled={!emailOk || busy}
				onclick={() => {
					if (emailOk) void set(email.trim().toLowerCase(), true);
				}}
			>
				Give full coin powers
			</button>
		</div>
		{#if email.trim() && !emailOk}<p class="cdx-note">A staff address ending in @boscotech.edu.</p>{/if}
		{#if list.site_admins.length}
			<p class="cdx-note">Site admins now: {list.site_admins.join(', ')}.</p>
		{/if}
	{/if}
	{#if said}<p class="cdx-feedback {said.ok ? 'notice' : 'error'}">{said.text}</p>{/if}
</section>

<style>
	h2 {
		margin-top: 0;
	}
	.owner {
		color: var(--white);
	}
	.admins {
		list-style: none;
		margin: 0.4rem 0;
		padding: 0;
	}
	.admins li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		padding: 0.25rem 0;
		border-bottom: 1px solid var(--line);
	}
	.who {
		color: var(--white);
		overflow-wrap: anywhere;
	}
	.grow {
		flex: 1 1 14rem;
	}
</style>
