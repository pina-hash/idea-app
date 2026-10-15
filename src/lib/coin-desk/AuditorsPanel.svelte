<script lang="ts">
	import { onMount } from 'svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { callV2, V2_UNAVAILABLE } from './v2';
	import type { AuditorRow } from './settings-session-two';

	/**
	 * STUDENT AUDITORS (0245): students who may approve or deny the coins on
	 * hand a classmate reports, never their own. coin_auditor_list reads who they are;
	 * coin_auditor_set adds or removes one. Removing is a stamp, not a delete,
	 * so it is one press and can be undone by adding them again. The same
	 * switch sits on one student's page in the Students area.
	 */
	let { supabase }: { supabase: SupabaseClient } = $props();

	let rows = $state<AuditorRow[]>([]);
	let phase = $state<'loading' | 'ready' | 'missing' | 'error'>('loading');
	let message = $state('');
	let email = $state('');
	let busy = $state(false);
	let said = $state<{ ok: boolean; text: string } | null>(null);

	async function load() {
		const r = await callV2<AuditorRow[]>(supabase, 'coin_auditor_list');
		if (r.kind !== 'ok') {
			if (phase !== 'ready') {
				phase = r.kind;
				message = r.kind === 'error' ? r.message : V2_UNAVAILABLE;
			}
			return;
		}
		rows = r.data ?? [];
		phase = 'ready';
	}

	onMount(() => {
		void load();
	});

	const emailOk = $derived(/^\S+@\S+$/.test(email.trim()));

	async function set(target: string, on: boolean, label: string) {
		busy = true;
		said = null;
		const r = await callV2<{ ok: boolean; reason?: string }>(supabase, 'coin_auditor_set', {
			p_email: target,
			p_on: on
		});
		busy = false;
		if (r.kind !== 'ok') {
			said = { ok: false, text: r.kind === 'error' ? r.message : V2_UNAVAILABLE };
			return;
		}
		if (!r.data?.ok) {
			said = { ok: false, text: 'That is not a student email.' };
			return;
		}
		said = { ok: true, text: on ? `${label} is a Student Auditor now.` : `${label} is no longer a Student Auditor.` };
		if (on) email = '';
		await load();
	}
</script>

<section class="card" id="cd-set-auditors" data-testid="cd-set-auditors">
	<h2>Student Auditors</h2>
	<p class="cdx-note">
		A Student Auditor may approve or deny the count of coins on hand a classmate reports, never their
		own. Their answer decides the report, as a teacher's would in the Queue.
	</p>
	{#if phase === 'loading'}
		<p class="cdx-note">Loading…</p>
	{:else if phase !== 'ready'}
		<p class="cdx-feedback error">{message}</p>
	{:else}
		{#if rows.length}
			<ul class="auditors">
				{#each rows as a (a.email)}
					<li data-testid="cd-auditor-row">
						<span class="who" title={a.email}>{a.name?.trim() || a.email}</span>
						<button
							type="button"
							class="btn secondary cdx-small"
							aria-disabled={busy}
							onclick={() => set(a.email, false, a.name?.trim() || a.email)}
						>
							Remove
						</button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="cdx-note">There are no Student Auditors.</p>
		{/if}
		<div class="cdx-row">
			<label class="cdx-field grow">
				<span>Student email</span>
				<input class="cdx-input" type="email" placeholder="student@boscotech.net" bind:value={email} />
			</label>
			<button
				type="button"
				class="btn"
				data-testid="cd-auditor-add"
				aria-disabled={!emailOk || busy}
				onclick={() => {
					if (emailOk) void set(email.trim().toLowerCase(), true, email.trim().toLowerCase());
				}}
			>
				Make a Student Auditor
			</button>
		</div>
	{/if}
	{#if said}<p class="cdx-feedback {said.ok ? 'notice' : 'error'}">{said.text}</p>{/if}
</section>

<style>
	h2 {
		margin-top: 0;
	}
	.auditors {
		list-style: none;
		margin: 0.4rem 0;
		padding: 0;
	}
	.auditors li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.2rem 0;
		border-bottom: 1px solid var(--line);
	}
	.who {
		color: var(--white);
		overflow-wrap: anywhere;
		min-width: 0;
	}
	.grow {
		flex: 1 1 14rem;
	}
</style>
