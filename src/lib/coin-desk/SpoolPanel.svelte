<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { callV2, num, V2_UNAVAILABLE } from './v2';
	import { spoolRefusal } from './student-view';

	/**
	 * 3D PRINT SPOOLS (0250). A spool a student bought outright is a credit of
	 * grams; every print they buy draws from it before it costs a coin. This
	 * records one spool (coin_record_spool, 1000 g by default) and shows the
	 * grams left. A print paid in physical coins is recorded under the student
	 * tools' purchase, not here.
	 *
	 * `grams` undefined means the lookup came from a database without 0250,
	 * which cannot tell; the panel says so rather than reading it as zero.
	 */
	let {
		supabase,
		email,
		grams,
		onChanged
	}: {
		supabase: SupabaseClient;
		email: string;
		grams: number | string | undefined;
		onChanged: () => void | Promise<void>;
	} = $props();

	let input = $state<string | number>('1000');
	let note = $state('');
	let busy = $state(false);
	let error = $state('');
	let notice = $state('');

	const value = $derived(Number(input));
	const ready = $derived(String(input).trim() !== '' && Number.isFinite(value) && value > 0 && value <= 10000);

	async function record() {
		if (!ready || busy) return;
		busy = true;
		error = '';
		notice = '';
		const r = await callV2<{ ok: boolean; reason?: string; grams_left?: number | string }>(
			supabase,
			'coin_record_spool',
			{ p_email: email, p_grams: Math.round(value * 100) / 100, p_note: note.trim() || null }
		);
		busy = false;
		if (r.kind === 'missing') {
			error = V2_UNAVAILABLE;
			return;
		}
		if (r.kind === 'error') {
			error = r.message;
			return;
		}
		if (!r.data?.ok) {
			error = spoolRefusal(r.data?.reason);
			return;
		}
		notice = `Recorded a spool of ${value} g. Grams left: ${num(r.data.grams_left)} g.`;
		input = '1000';
		note = '';
		await onChanged();
	}
</script>

<div class="spool" data-testid="cd-spool">
	<p class="spool-left">
		<span class="cdx-field-label">Grams left on bought spools</span>
		{#if grams === undefined}
			<span class="cdx-note">{V2_UNAVAILABLE}</span>
		{:else}
			<span class="cdx-balance" data-testid="cd-spool-grams">{num(grams)} g</span>
		{/if}
	</p>
	<p class="cdx-note">
		A print the student buys uses these grams first and costs coins only past them.
	</p>
	{#if error}<p class="cdx-feedback error" data-testid="cd-spool-error">{error}</p>{/if}
	{#if notice}<p class="cdx-feedback notice">{notice}</p>{/if}
	<div class="cdx-row">
		<label class="cdx-field">
			<span>Grams on the spool</span>
			<input class="cdx-input" type="number" min="1" max="10000" step="1" bind:value={input} />
		</label>
		<label class="cdx-field grow">
			<span>Note (optional)</span>
			<input class="cdx-input" type="text" maxlength="300" bind:value={note} />
		</label>
		<button
			type="button"
			class="btn"
			data-testid="cd-spool-record"
			aria-disabled={!ready || busy}
			onclick={record}
		>
			{busy ? 'Recording…' : 'Record a spool bought outright'}
		</button>
	</div>
	{#if !ready}
		<p class="cdx-note">Enter the grams on the spool, from 1 to 10000.</p>
	{/if}
</div>

<style>
	.spool {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.spool-left {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin: 0;
	}
	.cdx-field-label {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.04em;
		color: var(--text-2, var(--dim));
	}
	.grow {
		flex: 1 1 12rem;
	}
</style>
