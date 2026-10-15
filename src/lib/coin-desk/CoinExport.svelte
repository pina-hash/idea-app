<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { callV2, V2_UNAVAILABLE } from './v2';
	import {
		exportCsv,
		exportFileName,
		saveFile,
		type ExportPayload,
		type ExportScope
	} from './student-view';
	import type { CoinClass } from './log';

	/**
	 * THE EXPORT (coin_export, 0249): the raw ledger rows for one student, one
	 * class, or (a full coin admin only) the whole economy, as CSV or JSON.
	 * Nothing is summed or folded: a reversal and an amount correction are rows
	 * of their own, exactly as stored, so the file is the record and not a
	 * report about it. The CSV is built in the browser by `exportCsv`, the one
	 * spelling of it, and the JSON is the RPC's answer as it came.
	 *
	 * `economy` false removes the whole-economy row: absence is the mechanism,
	 * and the database refuses it for anyone else regardless.
	 */
	let {
		supabase,
		student = null,
		classes = [],
		economy = false
	}: {
		supabase: SupabaseClient;
		/** The student on screen, or null when nobody is picked. */
		student?: { email: string; label: string } | null;
		classes?: CoinClass[];
		economy?: boolean;
	} = $props();

	let classId = $state('');
	let busy = $state<string | null>(null);
	let error = $state('');
	let notice = $state('');

	function today(): string {
		return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
	}

	async function run(scope: ExportScope, format: 'csv' | 'json') {
		const key = `${scope}:${format}`;
		if (busy) return;
		const params: Record<string, unknown> = { p_scope: scope, p_email: null, p_section_id: null };
		let label = '';
		if (scope === 'student') {
			if (!student) return;
			params.p_email = student.email;
			label = student.label;
		} else if (scope === 'class') {
			const c = classes.find((x) => x.id === classId);
			if (!c) return;
			params.p_section_id = c.id;
			label = c.label;
		} else {
			label = 'economy';
		}
		busy = key;
		error = '';
		notice = '';
		const r = await callV2<ExportPayload>(supabase, 'coin_export', params);
		busy = null;
		if (r.kind === 'missing') {
			error = V2_UNAVAILABLE;
			return;
		}
		if (r.kind === 'error') {
			error = r.message;
			return;
		}
		const rows = r.data?.rows ?? [];
		const name = exportFileName(scope, scope === 'economy' ? '' : label, format, today());
		if (format === 'csv') saveFile(name, exportCsv(rows), 'text/csv;charset=utf-8');
		else saveFile(name, JSON.stringify(r.data, null, 2), 'application/json');
		notice = `Saved ${name}: ${rows.length} row${rows.length === 1 ? '' : 's'}.`;
	}

	const classReady = $derived(classes.some((c) => c.id === classId));
</script>

<div class="export" data-testid="cd-export">
	<p class="cdx-note">
		Every ledger row as stored, oldest first, to read yourself or to hand to Claude. A file names
		students; keep it where student records belong.
	</p>
	{#if error}<p class="cdx-feedback error" data-testid="cd-export-error">{error}</p>{/if}
	{#if notice}<p class="cdx-feedback notice" data-testid="cd-export-notice">{notice}</p>{/if}

	<div class="cdx-row">
		<span class="what">This student</span>
		<button
			type="button"
			class="btn secondary"
			data-testid="cd-export-student-csv"
			aria-disabled={!student || !!busy}
			onclick={() => run('student', 'csv')}
		>
			{busy === 'student:csv' ? 'Exporting…' : 'CSV'}
		</button>
		<button
			type="button"
			class="btn secondary"
			data-testid="cd-export-student-json"
			aria-disabled={!student || !!busy}
			onclick={() => run('student', 'json')}
		>
			{busy === 'student:json' ? 'Exporting…' : 'JSON'}
		</button>
		{#if !student}<span class="cdx-note">Pick a student first.</span>{/if}
	</div>

	<div class="cdx-row">
		<label class="cdx-field">
			<span>One class</span>
			<select class="cdx-select" data-testid="cd-export-class" bind:value={classId}>
				<option value="">Choose a class</option>
				{#each classes as c (c.id)}
					<option value={c.id}>{c.label}</option>
				{/each}
			</select>
		</label>
		<button
			type="button"
			class="btn secondary"
			data-testid="cd-export-class-csv"
			aria-disabled={!classReady || !!busy}
			onclick={() => run('class', 'csv')}
		>
			{busy === 'class:csv' ? 'Exporting…' : 'CSV'}
		</button>
		<button
			type="button"
			class="btn secondary"
			data-testid="cd-export-class-json"
			aria-disabled={!classReady || !!busy}
			onclick={() => run('class', 'json')}
		>
			{busy === 'class:json' ? 'Exporting…' : 'JSON'}
		</button>
	</div>

	{#if economy}
		<div class="cdx-row">
			<span class="what">The whole economy</span>
			<button
				type="button"
				class="btn secondary"
				data-testid="cd-export-economy-csv"
				aria-disabled={!!busy}
				onclick={() => run('economy', 'csv')}
			>
				{busy === 'economy:csv' ? 'Exporting…' : 'CSV'}
			</button>
			<button
				type="button"
				class="btn secondary"
				data-testid="cd-export-economy-json"
				aria-disabled={!!busy}
				onclick={() => run('economy', 'json')}
			>
				{busy === 'economy:json' ? 'Exporting…' : 'JSON'}
			</button>
		</div>
	{/if}
</div>

<style>
	.export {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.what {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.04em;
		color: var(--text-2, var(--dim));
		min-width: 9rem;
		align-self: center;
	}
</style>
