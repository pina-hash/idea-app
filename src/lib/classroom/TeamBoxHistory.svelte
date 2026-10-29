<script lang="ts">
	/**
	 * A TEAM BOX'S LAST VERSIONS, FOR THE TEAM (ledger 0456, report
	 * d23bc63d.4). Teammates can overwrite each other's shared boxes; here a
	 * student picks a box, reads its last ten saves with who made each, and
	 * puts one back. Putting one back is an ordinary save
	 * (`classroom_save_response`), so the box's lock and owner decide it like
	 * any other write, and the old words go into the history too.
	 */
	import { hxBridgeValue } from './html-assignment/answers';
	import type { ResponseValue } from './assignment-spec';

	type Out = { ok?: boolean; reason?: string } | null;
	let {
		boxes,
		read,
		restore
	}: {
		/** The post's team and role boxes, in document order. */
		boxes: { blockId: string; label: string }[];
		read: (blockId: string) => Promise<unknown>;
		restore: (blockId: string, value: unknown) => Promise<Out>;
	} = $props();

	let picked = $state('');
	let entries = $state<{ at: string; by: string | null; value: unknown }[] | null>(null);
	let said = $state<string | null>(null);
	let busy = $state(false);

	async function load(blockId: string) {
		picked = blockId;
		said = null;
		entries = null;
		if (!blockId) return;
		const raw = (await read(blockId).catch(() => null)) as { ok?: boolean; entries?: unknown } | null;
		entries = raw?.ok && Array.isArray(raw.entries)
			? (raw.entries as Record<string, unknown>[]).map((e) => ({
					at: String(e.at ?? ''),
					by: typeof e.by === 'string' ? e.by : null,
					value: e.value
				}))
			: [];
	}
	function words(v: unknown): string {
		const s = hxBridgeValue(v as ResponseValue | null);
		if (s === null) return '(empty)';
		if (typeof s === 'boolean') return s ? 'Checked' : 'Not checked';
		return s.trim() === '' ? '(empty)' : s;
	}
	function when(at: string): string {
		const d = new Date(at);
		return Number.isNaN(d.getTime())
			? at
			: d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
	}
	async function putBack(value: unknown) {
		busy = true;
		const out = await restore(picked, value).catch(() => null);
		busy = false;
		said = out?.ok
			? 'Put back. Your teammates see it within a few seconds.'
			: out?.reason === 'held'
				? 'A teammate is editing this box. Try again when they click away.'
				: out?.reason === 'not_owner'
					? 'This box belongs to a teammate, so only they can put a version back.'
					: 'That did not save. Try again.';
		if (out?.ok) await load(picked);
	}
</script>

<details class="card tbh" data-testid="team-box-history">
	<summary>Team box history</summary>
	<label class="tbh-pick">
		<span>Box</span>
		<select value={picked} onchange={(e) => load((e.currentTarget as HTMLSelectElement).value)}>
			<option value="">Choose a team box</option>
			{#each boxes as b (b.blockId)}<option value={b.blockId}>{b.label}</option>{/each}
		</select>
	</label>
	{#if said}<p class="tbh-said" role="status">{said}</p>{/if}
	{#if picked && entries === null}
		<p class="tbh-note">Reading the box.</p>
	{:else if entries && !entries.length}
		<p class="tbh-note">Nobody has saved this box yet.</p>
	{:else if entries}
		<ol class="tbh-list">
			{#each entries as e, i (e.at + i)}
				<li>
					<p class="tbh-meta">{when(e.at)}{e.by ? ` · ${e.by}` : ''}{i === 0 ? ' · now' : ''}</p>
					<p class="tbh-text">{words(e.value)}</p>
					{#if i > 0}
						<button type="button" class="btn secondary tbh-back" disabled={busy} onclick={() => putBack(e.value)}>Put this back</button>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
</details>

<style>
	.tbh {
		display: grid;
		gap: 0.5rem;
		padding: 0.6rem 0.9rem;
		min-width: 0;
	}
	.tbh summary {
		min-height: 44px;
		display: flex;
		align-items: center;
		font-family: var(--font-mono);
		font-size: var(--fs-caption);
		color: var(--text-2, var(--dim));
		cursor: pointer;
	}
	.tbh-pick {
		display: grid;
		gap: 0.25rem;
		font-family: var(--font-display);
		color: var(--text-2, var(--dim));
	}
	.tbh-pick select {
		min-height: 44px;
	}
	.tbh-said {
		margin: 0;
		font-family: var(--font-display);
		color: var(--green);
	}
	.tbh-note {
		margin: 0;
		font-family: var(--font-display);
		color: var(--text-2, var(--dim));
	}
	.tbh-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}
	.tbh-list li {
		display: grid;
		gap: 0.2rem;
		padding: 0.5rem 0.6rem;
		border: 1px solid var(--boundary, color-mix(in srgb, var(--dim) 30%, transparent));
		border-radius: var(--radius-card, 8px);
	}
	.tbh-meta {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--fs-meta);
		color: var(--cyan);
	}
	.tbh-text {
		margin: 0;
		font-family: var(--font-display);
		color: var(--text-1, var(--white));
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.tbh-back {
		justify-self: start;
		min-height: 44px;
	}
</style>
