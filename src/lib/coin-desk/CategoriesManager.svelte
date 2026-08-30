<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { KIND_LABELS, KIND_ORDER, priceHint, type CoinCategory, type CoinKind } from '$lib/coin-desk';
	import { COIN_SYMBOL } from '$lib/coin-format';
	import {
		CREATABLE_PRICING_MODELS,
		KIND_LABELS_SHORT,
		PRICE_BAND_GUIDANCE,
		PRICING_MODEL_LABELS,
		slugifyCategoryId,
		type CreatablePricingModel
	} from './category-admin';

	/**
	 * Create a new coin category (flat / range / per_unit / variable only --
	 * see category-admin.ts for why 'formula' is a hard boundary, not a
	 * missing feature), or retire/reactivate an existing one. Its own
	 * component, the SectionManager / RolesManager / ContractsManager
	 * convention, so /coin-desk/economy and the dev harness mount the
	 * identical thing.
	 *
	 * `categories` is bindable: the mounting page owns it, and every mutation
	 * here writes it back so this card's own list stays current with no
	 * separate refresh wiring. (The Log area loads its own copy on its own
	 * route since the route-group split, so a create/retire here shows up
	 * there on that route's next load, not through shared state.)
	 */
	let {
		supabase,
		categories = $bindable<CoinCategory[]>([]),
		configured = true
	}: {
		supabase: SupabaseClient;
		categories?: CoinCategory[];
		configured?: boolean;
	} = $props();

	const grouped = $derived(
		KIND_ORDER.map((kind) => ({
			kind,
			rows: categories.filter((c) => c.kind === kind).sort((a, b) => a.name.localeCompare(b.name))
		})).filter((g) => g.rows.length)
	);

	async function refreshCategories() {
		const resp = await supabase
			.from('coin_categories')
			.select(
				'id, name, kind, scope, pricing_model, amount, min_amount, max_amount, unit_label, formula_key, semester_point_cap, cap_period, cap_count, notes, active'
			)
			.eq('loggable', true)
			.order('sort_order');
		if (!resp.error) categories = (resp.data ?? []) as CoinCategory[];
	}

	// ---------------------------------------------------------------------
	// Retire / reactivate -- reversible, so no two-step confirm (unlike a
	// real delete, which this feature deliberately never offers).
	// ---------------------------------------------------------------------
	let toggleBusy = $state<Record<string, boolean>>({});
	let toggleError = $state('');

	async function toggleActive(c: CoinCategory) {
		toggleError = '';
		toggleBusy = { ...toggleBusy, [c.id]: true };
		const resp = await supabase.rpc('coin_admin_set_category_active', {
			p_id: c.id,
			p_active: c.active === false
		});
		toggleBusy = { ...toggleBusy, [c.id]: false };
		if (resp.error) {
			toggleError = resp.error.message;
			return;
		}
		await refreshCategories();
	}

	// ---------------------------------------------------------------------
	// Create a category
	// ---------------------------------------------------------------------
	let newName = $state('');
	let newId = $state('');
	let idTouched = $state(false);
	let newKind = $state<CoinKind>('fine');
	let newScope = $state<'core' | '209h'>('core');
	let newPricingModel = $state<CreatablePricingModel>('flat');
	let newAmount = $state('');
	let newMinAmount = $state('');
	let newMaxAmount = $state('');
	let newUnitLabel = $state('');
	let newNotes = $state('');
	let createBusy = $state(false);
	let createError = $state('');
	let createNotice = $state('');

	function onNameInput() {
		if (!idTouched) newId = slugifyCategoryId(newName);
	}

	function onIdInput() {
		idTouched = true;
	}

	function resetCreateForm() {
		newName = '';
		newId = '';
		idTouched = false;
		newKind = 'fine';
		newScope = 'core';
		newPricingModel = 'flat';
		newAmount = '';
		newMinAmount = '';
		newMaxAmount = '';
		newUnitLabel = '';
		newNotes = '';
	}

	function num(v: string): number {
		return Number(v);
	}

	const canCreate = $derived.by(() => {
		if (createBusy || !newName.trim() || !newId.trim()) return false;
		if (newPricingModel === 'flat') return Number.isFinite(num(newAmount)) && num(newAmount) >= 0;
		if (newPricingModel === 'range') {
			const min = num(newMinAmount);
			const max = num(newMaxAmount);
			return Number.isFinite(min) && Number.isFinite(max) && min >= 0 && min <= max;
		}
		if (newPricingModel === 'per_unit') {
			return Number.isFinite(num(newAmount)) && num(newAmount) >= 0 && !!newUnitLabel.trim();
		}
		return true; // variable -- nothing to validate up front
	});

	async function createCategory() {
		if (!canCreate) return;
		createError = '';
		createNotice = '';
		createBusy = true;
		const resp = await supabase.rpc('coin_admin_create_category', {
			p_id: newId.trim(),
			p_name: newName.trim(),
			p_kind: newKind,
			p_scope: newScope,
			p_pricing_model: newPricingModel,
			p_amount: newPricingModel === 'flat' || newPricingModel === 'per_unit' ? Math.round(num(newAmount)) : null,
			p_min_amount: newPricingModel === 'range' ? Math.round(num(newMinAmount)) : null,
			p_max_amount: newPricingModel === 'range' ? Math.round(num(newMaxAmount)) : null,
			p_unit_label: newPricingModel === 'per_unit' ? newUnitLabel.trim() : null,
			p_notes: newNotes.trim() || null
		});
		createBusy = false;
		if (resp.error) {
			createError = resp.error.message;
			return;
		}
		createNotice = `Created "${newName.trim()}" -- it's live in the logging dropdown now.`;
		resetCreateForm();
		await refreshCategories();
	}
</script>

<section class="card categories-manager">
	<h2>Categories</h2>
	<p class="note">
		Create a new fine, award, purchase, or adjustment category, or retire one that's no longer in
		use. A retired category disappears from the logging dropdowns above but stays exactly as valid
		on every past transaction that already used it -- retiring never deletes.
	</p>
	<p class="note boundary-note">
		This can define <strong>flat</strong>, <strong>range</strong>, <strong>per_unit</strong>, and
		<strong>variable</strong> pricing -- every shape that's just a number or a rule about a number.
		It cannot create a <strong>formula</strong> category (things like Perfect Score's rounding, Pay
		Raise's tier math, or Extra Credit's semester cap) -- those need real code, not a form, and
		still have to be added as a migration.
	</p>

	{#if !configured}
		<p class="feedback error">
			Migration 0070 does not appear to be applied yet -- categories are unavailable.
		</p>
	{:else}
		{#if toggleError}<p class="feedback error">{toggleError}</p>{/if}

		{#if !categories.length}
			<p class="note">No categories yet.</p>
		{:else}
			<!--
				GROUPED IN COLUMNS, NEVER A FLAT LIST IN COLUMNS. The price list is
				42 rows under four kind headings; poured into a multi-column grid
				as one flat sequence, "Awards" would land halfway down the second
				column with rows of the previous kind above it. So the GROUP is
				the grid item: each kind keeps its own heading directly above its
				own rows, and the four sit side by side. Measured on the harness's
				42 rows at 1440px: the card went from 3180px tall to 1160px, three
				columns, with no row narrower than the 380px its content stops
				gaining at.
			-->
			<div class="rows category-rows cd-cols">
				{#each grouped as g (g.kind)}
					<section class="kind-group">
					<h3 class="kind-heading">{KIND_LABELS[g.kind]}</h3>
					{#each g.rows as c (c.id)}
						<div class="row" class:retired={c.active === false}>
							<div class="who">
								<span class="email">{c.name}</span>
								{#if c.active === false}<span class="tag retired-tag">Retired</span>{/if}
							</div>
							<div class="meta">
								<span class="since">{priceHint(c)}{c.notes ? ` · ${c.notes}` : ''}</span>
							</div>
							<div class="actions">
								<button
									class="mini"
									disabled={toggleBusy[c.id]}
									onclick={() => toggleActive(c)}
								>
									{c.active === false ? 'reactivate' : 'retire'}
								</button>
							</div>
						</div>
					{/each}
					</section>
				{/each}
			</div>
		{/if}

		<div class="sub-panel add-panel">
			<h3>Create a category</h3>
			{#if createError}<p class="feedback error">{createError}</p>{/if}
			{#if createNotice}<p class="feedback notice">{createNotice}</p>{/if}

			<div class="field-row">
				<label for="new-cat-name">Name</label>
				<input id="new-cat-name" type="text" maxlength="120" bind:value={newName} oninput={onNameInput} />
			</div>
			<div class="field-row">
				<label for="new-cat-id">Category id</label>
				<input
					id="new-cat-id"
					type="text"
					maxlength="60"
					bind:value={newId}
					oninput={onIdInput}
					placeholder="auto-filled from the name"
				/>
				<p class="hint">Lowercase letters, numbers, and underscores only. Cannot be changed later.</p>
			</div>
			<div class="field-row-group">
				<div class="field-row">
					<label for="new-cat-kind">Kind</label>
					<select id="new-cat-kind" bind:value={newKind}>
						{#each KIND_ORDER as kind (kind)}
							<option value={kind}>{KIND_LABELS_SHORT[kind]}</option>
						{/each}
					</select>
				</div>
				<div class="field-row">
					<label for="new-cat-scope">Scope</label>
					<select id="new-cat-scope" bind:value={newScope}>
						<option value="core">Core -- every IDEA class</option>
						<option value="209h">209H only</option>
					</select>
				</div>
			</div>

			{#if PRICE_BAND_GUIDANCE[newKind]?.length}
				<div class="guidance">
					<p class="hint">
						Guideline only, never enforced -- roughly where {KIND_LABELS[newKind].toLowerCase()} pricing
						sits today:
					</p>
					<ul>
						{#each PRICE_BAND_GUIDANCE[newKind] as line (line)}
							<li>{line}</li>
						{/each}
					</ul>
				</div>
			{/if}

			<div class="field-row">
				<label for="new-cat-pricing">Pricing model</label>
				<select id="new-cat-pricing" bind:value={newPricingModel}>
					{#each CREATABLE_PRICING_MODELS as m (m)}
						<option value={m}>{PRICING_MODEL_LABELS[m]}</option>
					{/each}
				</select>
			</div>

			{#if newPricingModel === 'flat'}
				<div class="field-row">
					<label for="new-cat-amount">Amount ({COIN_SYMBOL})</label>
					<input id="new-cat-amount" type="number" min="0" step="1" bind:value={newAmount} />
				</div>
			{:else if newPricingModel === 'range'}
				<div class="field-row-group">
					<div class="field-row">
						<label for="new-cat-min">Min ({COIN_SYMBOL})</label>
						<input id="new-cat-min" type="number" min="0" step="1" bind:value={newMinAmount} />
					</div>
					<div class="field-row">
						<label for="new-cat-max">Max ({COIN_SYMBOL})</label>
						<input id="new-cat-max" type="number" min="0" step="1" bind:value={newMaxAmount} />
					</div>
				</div>
			{:else if newPricingModel === 'per_unit'}
				<div class="field-row-group">
					<div class="field-row">
						<label for="new-cat-rate">Rate ({COIN_SYMBOL} per unit)</label>
						<input id="new-cat-rate" type="number" min="0" step="1" bind:value={newAmount} />
					</div>
					<div class="field-row">
						<label for="new-cat-unit">Unit label</label>
						<input
							id="new-cat-unit"
							type="text"
							maxlength="40"
							placeholder='e.g. "point", "4 pages"'
							bind:value={newUnitLabel}
						/>
					</div>
				</div>
			{:else}
				<p class="note">
					No amount to set -- whoever logs this category enters the whole amount at that moment.
				</p>
			{/if}

			<div class="field-row">
				<label for="new-cat-notes">Notes (optional)</label>
				<input id="new-cat-notes" type="text" maxlength="300" bind:value={newNotes} />
			</div>

			<div class="btn-row">
				<button class="btn" disabled={!canCreate} onclick={createCategory}>
					{createBusy ? 'Creating…' : 'Create category'}
				</button>
			</div>
		</div>
	{/if}
</section>

<style>
	.note {
		color: var(--dim);
		font-size: 0.9rem;
	}
	.boundary-note strong {
		color: var(--white);
	}
	.feedback {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
		padding: 0.45rem 0.7rem;
		border-radius: 5px;
		margin-bottom: 0.8rem;
	}
	.feedback.error {
		color: var(--amber);
		border: 1px solid var(--amber);
	}
	.feedback.notice {
		color: var(--green);
		border: 1px solid var(--line);
	}
	.rows {
		display: flex;
		flex-direction: column;
	}
	.category-rows {
		margin-top: 0.6rem;
	}
	/* `.cd-cols` (in $lib/coin-desk/coin-desk.css) turns this into columns and
	   this restores what the flex column gave each group internally: the rows
	   stack, and the LAST row of each group loses its rule rather than only the
	   last row of the whole list. */
	.kind-group {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.kind-group .row:last-child {
		border-bottom: none;
	}
	.kind-heading {
		margin: 0.9rem 0 0.2rem;
		font-size: 0.78rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan);
		font-family: 'Share Tech Mono', monospace;
	}
	.kind-heading:first-child {
		margin-top: 0;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		flex-wrap: wrap;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--line);
	}
	.row:last-child {
		border-bottom: none;
	}
	.row.retired {
		opacity: 0.55;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 14rem;
	}
	.email {
		font-weight: 700;
		color: var(--white);
	}
	.tag {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.6rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		border-radius: 999px;
		padding: 0.05rem 0.5rem;
		border: 1px solid currentColor;
	}
	.retired-tag {
		color: var(--amber);
	}
	.meta {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}
	.since {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		/* `--text-2`, NOT `--dim`. CLAUDE.md names this exact case: --dim clears
		   only the darkest of the three portal grounds (5.31 on --bg0, 4.46 on
		   --bg1, 4.24 on --bg2) and this line sits on a card, which is --bg1.
		   Measured here at 4.52:1 -- a pass by two hundredths, on the line
		   carrying every category's price. The documented remedy is the CALL
		   SITE taking --text-2 (6.91 / 5.88 / 5.51 on the same three grounds),
		   never lightening --dim, which five FRC components read on paper where
		   it is already at 2.95. */
		color: var(--text-2);
	}
	.actions {
		margin-left: auto;
	}
	.mini {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: 1px solid var(--line);
		border-radius: var(--radius-control);
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.68rem;
		/* Measured at 53.3x19.8 -- under the 24px ABSOLUTE floor, not merely
		   under the 44px one, on 38 controls at once. This is a row control in
		   a dense list rather than a standalone action, so it takes the
		   absolute floor rather than 44: inflating every row of a 38-row price
		   list to 44px would add ~900px of height to the surface this bundle
		   exists to shorten. `min-height`, never `height`. */
		min-height: 24px;
		padding: 0.15rem 0.5rem;
		cursor: pointer;
	}
	.mini:hover:not(:disabled) {
		color: var(--white);
		border-color: var(--green);
	}
	.mini:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.sub-panel {
		margin: 0.4rem 0 0.9rem;
		padding: 0.7rem 0.85rem;
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 6px;
	}
	.sub-panel h3 {
		margin: 0 0 0.5rem;
		font-size: 0.95rem;
		color: var(--green);
	}
	.add-panel {
		margin-top: 1rem;
	}
	.field-row {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin-bottom: 0.8rem;
	}
	.field-row-group {
		display: flex;
		gap: 0.8rem;
		flex-wrap: wrap;
	}
	.field-row-group .field-row {
		flex: 1;
		min-width: 10rem;
	}
	.field-row label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--green);
	}
	.field-row input,
	.field-row select {
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		font-size: 1rem;
		padding: 0.45rem 0.6rem;
	}
	.field-row input:focus,
	.field-row select:focus {
		outline: 2px solid var(--cyan);
		outline-offset: 1px;
	}
	.hint {
		color: var(--dim);
		font-size: 0.75rem;
		margin: 0;
	}
	.guidance {
		background: var(--bg1);
		border: 1px solid var(--line);
		border-radius: 6px;
		padding: 0.5rem 0.7rem;
		margin-bottom: 0.8rem;
	}
	.guidance ul {
		margin: 0.3rem 0 0;
		padding-left: 1.1rem;
		font-size: 0.8rem;
		color: var(--white);
	}
	.guidance li {
		margin-bottom: 0.15rem;
	}
	.btn-row {
		display: flex;
		gap: 0.85rem;
		flex-wrap: wrap;
		margin-top: 0.4rem;
	}
</style>
