<!--
  THE TRASH VIEW. Every row names the day it is removed for good, from the
  row's OWN purgeAt (never the mirrored constant), and offers Restore and a
  two-step Remove now whose confirm names the document. Refusals render on
  the row that was pressed.
-->
<script lang="ts">
	import type { LaunchApi } from './api';
	import type { TrashedDocument } from './library';
	import { EMPTY_TRASH, PURGE_SENTENCE, countsSentence, daysUntil, purgeConfirm, purgeSentence, purgedSentence, restoredSentence } from './wording';
	let { rows, api, onrefresh, now }: { rows: TrashedDocument[]; api: LaunchApi; onrefresh: (notice?: string) => Promise<void>; now: () => Date } = $props();
	let armed = $state(''), busy = $state(''), refusals: Record<string, string> = $state({});
	async function run(id: string, action: () => Promise<unknown>, notice: string) {
		busy = id; refusals = { ...refusals, [id]: '' };
		try { await action(); armed = ''; await onrefresh(notice); }
		catch (err) { refusals = { ...refusals, [id]: err instanceof Error ? err.message : String(err) }; }
		finally { busy = ''; }
	}
</script>

<section class="trash" aria-label="Trash">
	{#if rows.length === 0}
		<p class="empty" data-testid="trash-empty">{EMPTY_TRASH}</p>
	{:else}
		<ul class="rows">
			{#each rows as row (row.id)}
				{@const left = daysUntil(row.purgeAt, now())}
				<li class="row" data-testid="trash-row" data-id={row.id}>
					<div class="ident">
						<h3>{row.title}</h3>
						<p class="when"><span class="chip">{purgeSentence(row.purgeAt)}</span><span class="left">{left === 0 ? 'less than a day left' : `${left} ${left === 1 ? 'day' : 'days'} left`}</span></p>
						<p class="facts">{countsSentence(row.featureCount, row.bodyCount)}</p>
					</div>
					<div class="actions">
						{#if armed === row.id}
							<p class="ask">{purgeConfirm(row.title)}</p><p class="note">{PURGE_SENTENCE}</p>
							<div class="pair"><button class="danger" data-testid="purge-confirm" disabled={busy === row.id} onclick={() => void run(row.id, () => api.purge(row.id), purgedSentence(row.title))}>Confirm: remove for good</button><button class="cancel" onclick={() => (armed = '')}>Cancel</button></div>
						{:else}
							<div class="pair"><button class="accept" data-testid="restore" disabled={busy === row.id} onclick={() => void run(row.id, () => api.restore(row.id), restoredSentence(row.title))}>Restore</button><button class="danger" data-testid="purge" onclick={() => (armed = row.id)}>Remove now</button></div>
						{/if}
						{#if refusals[row.id]}<p class="refusal" role="alert">{refusals[row.id]}</p>{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }
	.row { display: grid; gap: 0.6rem; padding: 0.75rem; min-width: 0; background: var(--ic-panel); border: 1px dashed var(--ic-edge); border-radius: var(--ic-radius); }
	.ident { display: grid; gap: 0.3rem; min-width: 0; }
	h3 { font: 600 17px / 1.2 var(--font-display); overflow-wrap: anywhere; }
	.when { margin: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; }
	.when .chip { color: var(--ic-warn); min-height: 20px; }
	.left { font: var(--ic-fs-label) / 1.3 var(--font-mono); color: var(--ic-text-2); }
	.facts { margin: 0; font: var(--ic-fs-label) / 1.3 var(--font-mono); color: var(--ic-text-2); }
	.actions { display: grid; gap: 0.35rem; }
	.pair { display: flex; flex-wrap: wrap; gap: 0.5rem; }
	.ask { margin: 0; font: 600 var(--ic-fs-ui) / 1.3 var(--font-display); color: var(--ic-text-1); }
	.note { margin: 0; }
	.empty { margin: 0; padding: 1.5rem 0; }
	.refusal { margin: 0; padding-left: 0.5rem; border-left: var(--ic-rail) solid var(--ic-warn); }
</style>
