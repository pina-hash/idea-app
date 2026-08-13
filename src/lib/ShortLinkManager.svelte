<script lang="ts">
	import { shortLinkIssue, type ShortLinkRow, type ShortLinkTransports } from '$lib/short-links';

	/**
	 * The short-link admin screen (0093). Presentation + callbacks (the
	 * DecalReviewQueue / SectionManager convention), so /dev/short-links drives
	 * the identical component against an in-memory store.
	 *
	 * Every rule shown here is mirrored server-side; this only makes the form
	 * refuse up front what app_short_link_upsert would refuse anyway.
	 */
	let {
		links = [],
		ready = true,
		transports
	}: {
		links?: ShortLinkRow[];
		/** False = 0093 not applied. The list is empty and writes are hidden. */
		ready?: boolean;
		transports: ShortLinkTransports;
	} = $props();

	let rows = $state<ShortLinkRow[]>([...links]);
	let slug = $state('');
	let target = $state('');
	let label = $state('');
	let busy = $state(false);
	let notice = $state<string | null>(null);
	let serverError = $state<string | null>(null);
	let armDelete = $state<string | null>(null);

	const issue = $derived(slug.trim() || target.trim() ? shortLinkIssue(slug, target) : null);
	const canSave = $derived(!busy && !!slug.trim() && !!target.trim() && !issue);
	const existing = $derived(rows.find((r) => r.slug === slug.trim().toLowerCase()) ?? null);

	async function refresh() {
		rows = await transports.reload();
	}

	async function save() {
		if (!canSave) return;
		busy = true;
		serverError = null;
		notice = null;
		const res = await transports.upsert(
			slug.trim().toLowerCase(),
			target.trim(),
			label.trim() || null,
			true
		);
		busy = false;
		if (!res.ok) {
			serverError = res.message ?? 'Something went wrong.';
			return;
		}
		notice = `/${slug.trim().toLowerCase()} now points at ${target.trim()}.`;
		slug = '';
		target = '';
		label = '';
		await refresh();
	}

	async function setActive(row: ShortLinkRow, active: boolean) {
		busy = true;
		serverError = null;
		const res = await transports.upsert(row.slug, row.target, row.label, active);
		busy = false;
		if (!res.ok) {
			serverError = res.message ?? 'Something went wrong.';
			return;
		}
		await refresh();
	}

	async function remove(row: ShortLinkRow) {
		// Two-step confirm, the SectionManager convention.
		if (armDelete !== row.slug) {
			armDelete = row.slug;
			return;
		}
		armDelete = null;
		busy = true;
		serverError = null;
		const res = await transports.remove(row.slug);
		busy = false;
		if (!res.ok) {
			serverError = res.message ?? 'Something went wrong.';
			return;
		}
		notice = `/${row.slug} removed.`;
		await refresh();
	}

	function edit(row: ShortLinkRow) {
		slug = row.slug;
		target = row.target;
		label = row.label ?? '';
		notice = null;
		serverError = null;
	}
</script>

<section class="card">
	<h2 class="section-label">Short links</h2>
	<p class="note">
		A printed QR code points at a short path like <code>/209h</code>; the row here decides where
		that lands, so a document can move without reprinting anything. A <code>#section</code> a
		visitor scanned survives the redirect, which is why a target may not carry one of its own.
	</p>

	{#if !ready}
		<p class="feedback error">
			Short links are not available yet -- apply migration 0093 in the Supabase SQL editor.
		</p>
	{:else}
		{#if notice}<p class="feedback ok">{notice}</p>{/if}
		{#if serverError}<p class="feedback error">{serverError}</p>{/if}

		<div class="form">
			<label class="field-col">
				<span class="field-label">Slug</span>
				<span class="prefixed">
					<span class="prefix">/</span>
					<input type="text" bind:value={slug} placeholder="209h" autocomplete="off" />
				</span>
			</label>
			<label class="field-col">
				<span class="field-label">Target path</span>
				<input type="text" bind:value={target} placeholder="/reference/…" autocomplete="off" />
			</label>
			<label class="field-col">
				<span class="field-label">Label (optional)</span>
				<input type="text" bind:value={label} placeholder="IDEA209H syllabus" autocomplete="off" />
			</label>
			<button type="button" class="btn tiny" disabled={!canSave} onclick={save}>
				{existing ? 'Re-point' : 'Add link'}
			</button>
		</div>
		{#if issue}<p class="issue">{issue}</p>{/if}
		{#if existing && !issue}
			<p class="issue warn">
				/{existing.slug} already points at {existing.target} -- saving re-points it.
			</p>
		{/if}

		{#if rows.length}
			<div class="table-scroll">
				<table>
					<thead>
						<tr>
							<th scope="col">Slug</th>
							<th scope="col">Target</th>
							<th scope="col">Label</th>
							<th scope="col">State</th>
							<th scope="col" aria-label="Actions"></th>
						</tr>
					</thead>
					<tbody>
						{#each rows as row (row.slug)}
							<tr class:inactive={!row.active}>
								<td class="mono">/{row.slug}</td>
								<td class="mono target">{row.target}</td>
								<td>{row.label ?? ''}</td>
								<td class="mono">{row.active ? 'active' : 'off'}</td>
								<td class="ops">
									<button type="button" class="btn secondary tiny" onclick={() => edit(row)}>
										Edit
									</button>
									<button
										type="button"
										class="btn secondary tiny"
										disabled={busy}
										onclick={() => setActive(row, !row.active)}
									>
										{row.active ? 'Turn off' : 'Turn on'}
									</button>
									<button
										type="button"
										class="btn secondary tiny danger"
										disabled={busy}
										onclick={() => remove(row)}
									>
										{armDelete === row.slug ? 'Really delete?' : 'Delete'}
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<p class="note">No short links yet.</p>
		{/if}
	{/if}
</section>

<style>
	.section-label {
		margin: 0 0 0.5rem;
		font-size: 0.85rem;
		font-family: 'Share Tech Mono', monospace;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	.note {
		color: var(--dim);
		font-size: 0.85rem;
		line-height: 1.5;
		margin: 0 0 0.7rem;
	}
	code {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8em;
		color: var(--gold);
	}
	.form {
		display: flex;
		gap: 0.5rem;
		align-items: flex-end;
		flex-wrap: wrap;
		margin-bottom: 0.4rem;
	}
	.field-col {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		flex: 1 1 10rem;
		min-width: 0;
	}
	.field-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.6rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--dim);
	}
	.prefixed {
		display: flex;
		align-items: center;
		gap: 0.2rem;
	}
	.prefix {
		font-family: 'Share Tech Mono', monospace;
		color: var(--dim);
	}
	input {
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 5px;
		color: var(--white);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.82rem;
		padding: 0.42rem 0.55rem;
		min-height: 40px;
	}
	input:focus {
		outline: none;
		border-color: var(--line-strong);
	}
	.issue {
		margin: 0 0 0.6rem;
		font-size: 0.8rem;
		color: var(--amber);
	}
	.issue.warn {
		color: var(--gold);
	}
	.table-scroll {
		overflow-x: auto;
		margin-top: 0.5rem;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		min-width: 30rem;
	}
	th {
		text-align: left;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.6rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--cyan);
		border-bottom: 1px solid var(--line);
		padding: 0.3rem 0.4rem;
		font-weight: 400;
	}
	td {
		border-bottom: 1px solid var(--line);
		padding: 0.3rem 0.4rem;
		font-size: 0.85rem;
	}
	.mono {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.76rem;
	}
	.target {
		overflow-wrap: anywhere;
	}
	tr.inactive td {
		opacity: 0.55;
	}
	.ops {
		white-space: nowrap;
		display: flex;
		gap: 0.25rem;
		flex-wrap: wrap;
	}
	.btn.tiny,
	.btn.secondary.tiny {
		font-size: 0.65rem;
		padding: 0.28rem 0.6rem;
	}
	.btn.danger {
		color: var(--crimson);
		border-color: var(--crimson);
	}
	.feedback {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
		border-radius: 5px;
		padding: 0.4rem 0.65rem;
		margin: 0 0 0.7rem;
	}
	.feedback.error {
		color: var(--amber);
		border: 1px solid var(--amber);
	}
	.feedback.ok {
		color: var(--green);
		border: 1px solid var(--line-strong);
	}
</style>
