<script lang="ts">
	/**
	 * The material library, admin side. Add, edit, retire and restore, with no
	 * deploy -- Mr. Pina's decision of 2026-09-12: a material is four numbers in
	 * a form, the engine already does the calculation from input values, and
	 * shipping a code change to add one is overkill.
	 *
	 * RETIRE IS NOT DELETE AND THE PAGE SAYS SO IN WORDS. There is no delete
	 * here, for anybody: `ideacad_concepts.features` names a material by id
	 * inside a jsonb blob of student work, so a deleted row is a saved concept
	 * that stops resolving, and there is no way to find every tree that names
	 * one. A retired material still resolves and still computes; it is simply
	 * not offered to a part that is not already on it.
	 *
	 * THE UNVERIFIED FLAG IS A REAL COLUMN, NOT A LABEL. Every density 0208
	 * seeded names the published standard that owns it and lands UNVERIFIED,
	 * because the session that wrote the seed had no network route to any of
	 * those documents and did not open one. Clearing the flag is the act of
	 * somebody who has the source in front of them.
	 */
	import {
		MATERIAL_THICKNESS_MAX_IN,
		formatThicknessIn,
		parseThicknessList,
		stockIdFor,
		type MaterialRow
	} from '$lib/ideacad/blade/materials';
	import { untrack } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/* `untrack`, deliberately: this is the SEED for a list the page then edits in
	   place, so reading `data` tracked would both warn and, on a re-load, throw
	   away every row the admin has just saved. */
	let rows = $state<MaterialRow[]>(untrack(() => [...data.materials]));
	let editing = $state<string | null>(null);
	let refusal = $state('');
	let done = $state('');
	let busy = $state(false);
	let armedRetire = $state('');

	/* The form, one set of fields for both add and edit. A second form for "new"
	   is a second set of validation rules that stops agreeing with this one. */
	let fId = $state<string | null>(null);
	let fSlug = $state('');
	let fName = $state('');
	let fDensity = $state('');
	let fThickness = $state('');
	let fNote = $state('');
	let fSource = $state('');
	let fVerified = $state(false);

	const live = $derived(rows.filter((r) => !r.retired_at));
	const retired = $derived(rows.filter((r) => r.retired_at));

	function startNew() {
		fId = null;
		fSlug = '';
		fName = '';
		fDensity = '';
		fThickness = '';
		fNote = '';
		fSource = '';
		fVerified = false;
		editing = 'new';
		refusal = '';
		done = '';
	}
	function startEdit(row: MaterialRow) {
		fId = row.id;
		fSlug = row.slug;
		fName = row.name;
		fDensity = String(row.density_g_cm3);
		fThickness = row.thicknesses_in.map(formatThicknessIn).join(', ');
		fNote = row.note ?? '';
		fSource = row.source;
		fVerified = row.source_verified;
		editing = row.id;
		refusal = '';
		done = '';
	}

	async function save(e: SubmitEvent) {
		e.preventDefault();
		if (busy) return;
		refusal = '';
		done = '';
		const slug = fSlug.trim().toLowerCase();
		if (!/^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/.test(slug) || slug.startsWith('custom-')) {
			refusal = 'An id is lower-case letters, digits and hyphens, and cannot start with custom-.';
			return;
		}
		if (!fName.trim()) {
			refusal = 'Give the material a name.';
			return;
		}
		if (!fSource.trim()) {
			refusal = 'Name the published source the density came from.';
			return;
		}
		const density = Number(fDensity);
		if (!Number.isFinite(density) || density <= 0 || density > 25) {
			refusal = 'Density must be more than 0 and no more than 25 g/cm3.';
			return;
		}
		const parsed = parseThicknessList(fThickness.trim() === '' ? '0.125' : fThickness);
		if (fThickness.trim() !== '' && parsed.refusal) {
			refusal = parsed.refusal;
			return;
		}
		const thicknesses = fThickness.trim() === '' ? [] : parsed.thicknesses;
		busy = true;
		try {
			const { data: saved, error } = await data.supabase.rpc('ideacad_material_save_global', {
				p_id: fId,
				p_slug: slug,
				p_name: fName.trim(),
				p_density_g_cm3: density,
				p_thicknesses_in: thicknesses,
				p_note: fNote.trim() || null,
				p_source: fSource.trim(),
				p_source_verified: fVerified
			});
			/* THE DATABASE'S OWN SENTENCE, VERBATIM. A refusal rewritten here is a
			   second statement of a rule the function already holds. */
			if (error) {
				refusal = error.message;
				return;
			}
			const row = saved as MaterialRow;
			rows = [...rows.filter((r) => r.id !== row.id), row].sort((a, b) => a.name.localeCompare(b.name));
			done = `${row.name} saved.`;
			editing = null;
		} finally {
			busy = false;
		}
	}

	async function setRetired(row: MaterialRow, retire: boolean) {
		if (busy) return;
		busy = true;
		refusal = '';
		done = '';
		try {
			const { data: saved, error } = await data.supabase.rpc('ideacad_material_set_retired', {
				p_id: row.id,
				p_retired: retire
			});
			if (error) {
				refusal = error.message;
				return;
			}
			const next = saved as MaterialRow;
			rows = rows.map((r) => (r.id === next.id ? next : r));
			done = retire
				? `${next.name} is retired. Every part already using it still computes exactly as it did.`
				: `${next.name} is back in the list.`;
			armedRetire = '';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>IdeaCAD materials</title></svelte:head>

<main class="wrap">
	<h1>IdeaCAD materials</h1>
	<p class="lede">
		The shared material list every student picks from. Adding one takes effect immediately, with no deploy. Each material
		carries the real stock thicknesses it is sold in, and a student picks a thickness from that list rather than typing a
		number.
	</p>

	{#if !data.ready}
		<p class="refusal" role="status">
			The material library is not available on this deployment yet. Apply
			<code>supabase/migrations/0208_ideacad_materials.sql</code> and reload.
		</p>
	{/if}

	{#if refusal}<p class="refusal" role="status">{refusal}</p>{/if}
	{#if done}<p class="done" role="status">{done}</p>{/if}

	<p class="rules">
		<strong>Retire is not delete, and there is no delete.</strong> A saved student concept names a material by id inside its
		own feature tree, and nothing can find every tree that names one. A retired material keeps resolving, so a part already
		using it keeps exactly the mass, inertia and rule verdicts it had; it is simply not offered to anyone who is not already
		on it, and they see it marked retired so they can move off it deliberately.
	</p>

	<button class="new" onclick={startNew}>Add a material</button>

	{#if editing}
		<form class="editor" onsubmit={save}>
			<h2>{fId ? 'Edit material' : 'Add a material'}</h2>
			<label class="field">
				<span>Id</span>
				<input bind:value={fSlug} maxlength="40" placeholder="stainless-steel" readonly={!!fId} />
			</label>
			<p class="hint">
				The id is written into every part that picks this material, so it is fixed once anybody uses it.
				{#if fSlug}Stock ids look like <code>{stockIdFor(fSlug.trim().toLowerCase() || 'slug', 0.125)}</code>.{/if}
			</p>
			<label class="field"><span>Name</span><input bind:value={fName} maxlength="60" /></label>
			<label class="field"
				><span>Density (g/cm³)</span><input type="number" bind:value={fDensity} min="0.01" max="25" step="0.01" /></label
			>
			<label class="field"
				><span>Stock thicknesses (in)</span><input bind:value={fThickness} placeholder="0.0625, 0.125, 0.1875, 0.25" /></label
			>
			<p class="hint">
				Separated by commas, up to {MATERIAL_THICKNESS_MAX_IN} in each. Leave empty for a material nobody cuts blades from.
			</p>
			<label class="field"><span>Density source</span><input bind:value={fSource} maxlength="300" /></label>
			<p class="hint">
				A named published work a student could go and check: a standard by its number, a datasheet by its part number, a
				textbook by its edition.
			</p>
			<label class="field"><span>Note shown to students</span><input bind:value={fNote} maxlength="400" /></label>
			<label class="check">
				<input type="checkbox" bind:checked={fVerified} />
				<span>I have checked this density against that source</span>
			</label>
			<div class="acts">
				<button type="submit" class="save" aria-disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
				<button type="button" onclick={() => (editing = null)}>Cancel</button>
			</div>
		</form>
	{/if}

	<h2>In the list ({live.length})</h2>
	<ul class="mats">
		{#each live as row (row.id)}
			<li>
				<div class="head">
					<strong>{row.name}</strong>
					<code>{row.slug}</code>
					{#if !row.source_verified}<b class="chip">UNVERIFIED</b>{/if}
				</div>
				<p class="nums">{row.density_g_cm3} g/cm³ &middot; {row.thicknesses_in.length
						? row.thicknesses_in.map(formatThicknessIn).join(', ') + ' in'
						: 'no stock thicknesses'}</p>
				<p class="src">Source: {row.source}</p>
				{#if row.note}<p class="note">{row.note}</p>{/if}
				<div class="acts">
					<button onclick={() => startEdit(row)}>Edit</button>
					{#if armedRetire === row.id}
						<button class="danger" aria-disabled={busy} onclick={() => setRetired(row, true)}>Confirm retire</button>
						<button onclick={() => (armedRetire = '')}>Keep it</button>
					{:else}
						<button onclick={() => (armedRetire = row.id)}>Retire</button>
					{/if}
				</div>
			</li>
		{/each}
	</ul>

	<h2>Retired ({retired.length})</h2>
	<p class="hint">
		Still resolving for every part already using them, and offered to nobody else. Restoring one puts it back in the picker.
	</p>
	<ul class="mats">
		{#each retired as row (row.id)}
			<li class="off">
				<div class="head"><strong>{row.name}</strong><code>{row.slug}</code></div>
				<p class="nums">{row.density_g_cm3} g/cm³</p>
				{#if row.note}<p class="note">{row.note}</p>{/if}
				<div class="acts">
					<button onclick={() => startEdit(row)}>Edit</button>
					<button aria-disabled={busy} onclick={() => setRetired(row, false)}>Restore</button>
				</div>
			</li>
		{/each}
	</ul>
</main>

<style>
	.wrap {
		max-width: 60rem;
		margin: 0 auto;
		padding-block: 1.5rem;
		padding-left: 1rem;
		padding-right: 1rem;
	}
	h1 {
		margin: 0 0 0.5rem;
	}
	h2 {
		margin: 1.6rem 0 0.6rem;
	}
	.lede,
	.rules,
	.hint,
	.note,
	.src,
	.nums {
		color: var(--text-2);
		line-height: 1.6;
	}
	.hint,
	.src,
	.note {
		font: 13px 'Share Tech Mono', monospace;
		margin: 0.2rem 0 0.6rem;
	}
	.rules {
		border-left: 3px solid var(--boundary);
		padding-left: 0.8rem;
		margin: 1rem 0;
	}
	.refusal {
		color: var(--crimson);
	}
	.done {
		color: var(--green);
	}
	button,
	input {
		min-height: 44px;
		color: var(--text-1);
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		font: inherit;
		padding: 0 0.7rem;
	}
	button:focus-visible,
	input:focus-visible {
		outline: 3px solid var(--focus-ring);
		outline-offset: 2px;
	}
	button[aria-disabled='true'] {
		color: var(--text-2);
		border-color: var(--hairline);
	}
	.new,
	.save {
		border-color: var(--green);
	}
	.danger {
		border-color: var(--crimson);
	}
	.editor {
		margin: 1rem 0;
		padding: 1rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		background: var(--surface-1);
	}
	.field {
		display: grid;
		grid-template-columns: minmax(0, 16rem) minmax(0, 1fr);
		gap: 0.6rem;
		align-items: center;
		margin: 0.5rem 0;
	}
	.field span {
		color: var(--text-2);
		font: 13px 'Share Tech Mono', monospace;
	}
	.check {
		display: flex;
		gap: 0.6rem;
		align-items: center;
		min-height: 44px;
		margin: 0.6rem 0;
		color: var(--text-2);
	}
	.check input {
		min-height: 24px;
		width: 24px;
	}
	.acts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.6rem;
	}
	.mats {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.8rem;
	}
	.mats li {
		padding: 0.8rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		background: var(--surface-1);
	}
	.mats li.off {
		opacity: 0.85;
		border-style: dashed;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		align-items: baseline;
	}
	.head code {
		color: var(--text-2);
		font: 13px 'Share Tech Mono', monospace;
	}
	.chip {
		color: var(--copper);
		font: 12px 'Share Tech Mono', monospace;
		letter-spacing: 0.08em;
	}
	@media (max-width: 40rem) {
		.field {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
