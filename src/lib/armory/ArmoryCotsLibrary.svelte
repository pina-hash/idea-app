<script lang="ts">
	/**
	 * THE COTS LIBRARY (ledger 0405, decision 41): the bought parts every
	 * Armory project references, named by the vendor's prefix and the vendor's
	 * own number (`WCP-0388 Hex Bearing`, `HW-SHCS-10-32x0.75`). Searchable by
	 * vendor and by number. A mentor of any project or a site admin adds and
	 * corrects rows and retires one; nothing deletes a row, and the vendor and
	 * the number never change (retire it and add the right one).
	 *
	 * Presentation only. `add`, `correct` and `retire` are handed in only for a
	 * curator, and their absence removes every control they drive. The format
	 * check is `cotsProblem` from `$lib/armory/part-numbers`, the mirror of the
	 * database's own; the database still decides.
	 */
	import {
		cotsMatches,
		cotsNumber,
		cotsProblem,
		cotsVendors,
		type CotsAnswer,
		type CotsLibrary,
		type CotsPart
	} from '$lib/armory/part-numbers';

	let {
		library,
		add = null,
		correct = null,
		retire = null
	}: {
		library: CotsLibrary;
		add?: ((input: { vendor: string; vendorPart: string; description: string; link: string }) => Promise<CotsAnswer>) | null;
		correct?: ((id: string, input: { description: string; link: string }) => Promise<CotsAnswer>) | null;
		retire?: ((id: string, retired: boolean) => Promise<CotsAnswer>) | null;
	} = $props();

	let query = $state('');
	let vendor = $state<string | null>(null);
	let showRetired = $state(false);

	const vendors = $derived(cotsVendors(library.parts.filter((p) => !p.retired)));
	const retiredCount = $derived(library.parts.filter((p) => p.retired).length);
	const shown = $derived(
		library.parts.filter((p) => (showRetired || !p.retired) && (vendor === null || p.vendor === vendor) && cotsMatches(p, query))
	);

	/* Adding. */
	let vIn = $state('');
	let pIn = $state('');
	let dIn = $state('');
	let lIn = $state('');
	let touched = $state(false);
	let busy = $state(false);
	let addResult = $state<{ bad: boolean; text: string } | null>(null);
	const problem = $derived(cotsProblem(vIn, pIn) ?? (dIn.trim() === '' ? 'Describe the part in a few words, such as Hex Bearing.' : null));

	async function submitAdd(e: SubmitEvent) {
		e.preventDefault();
		touched = true;
		if (!add || busy || problem) return;
		busy = true;
		addResult = null;
		try {
			const name = cotsNumber(vIn, pIn);
			const answer = await add({ vendor: vIn, vendorPart: pIn, description: dIn.trim(), link: lIn.trim() });
			if (answer.ok) {
				addResult = { bad: false, text: `Added ${name} ${dIn.trim()}.` };
				vIn = pIn = dIn = lIn = '';
				touched = false;
			} else addResult = { bad: true, text: answer.message };
		} finally {
			busy = false;
		}
	}

	/* Correcting one row at a time. */
	let editing = $state<string | null>(null);
	let eDesc = $state('');
	let eLink = $state('');
	let rowResult = $state<{ id: string; bad: boolean; text: string } | null>(null);

	function openEdit(p: CotsPart) {
		editing = p.id;
		eDesc = p.description;
		eLink = p.link ?? '';
		rowResult = null;
	}
	async function saveEdit(p: CotsPart) {
		if (!correct) return;
		const answer = await correct(p.id, { description: eDesc.trim(), link: eLink.trim() });
		rowResult = answer.ok ? { id: p.id, bad: false, text: 'Saved.' } : { id: p.id, bad: true, text: answer.message };
		if (answer.ok) editing = null;
	}
	async function toggleRetired(p: CotsPart) {
		if (!retire) return;
		const answer = await retire(p.id, !p.retired);
		rowResult = answer.ok
			? { id: p.id, bad: false, text: p.retired ? 'Back in the library.' : 'Retired. Parts that name it keep it.' }
			: { id: p.id, bad: true, text: answer.message };
	}

	function host(link: string): string {
		try {
			return new URL(link).host.replace(/^www\./, '');
		} catch {
			return 'Vendor page';
		}
	}
</script>

<section class="ar-view ac-root" data-testid="armory-cots">
	<div class="ac-top">
		<div class="ar-panel ac-how">
			<h2>How a bought part is named</h2>
			<p class="ac-samples">
				<span>WCP-0388 Hex Bearing</span>
				<span>REV-21-1650 NEO Motor</span>
				<span>HW-SHCS-10-32x0.75</span>
			</p>
			<p class="ar-message">
				The vendor's prefix, then the vendor's own part number, then a few words. Hardware is named by its spec under
				HW. Bought parts never get a team number; a part the team cuts or drills becomes a made part, with this
				name as its Made from.
			</p>
		</div>
		{#if add}
			<form class="ar-panel ac-add" onsubmit={submitAdd} data-testid="armory-cots-add">
				<h2>Add a part</h2>
				<div class="ac-add-fields">
					<label class="ar-field ac-vendor">
						<span>Vendor prefix</span>
						<input class="plate-well" type="text" maxlength="8" bind:value={vIn} placeholder="WCP" autocapitalize="characters" data-testid="armory-cots-vendor" />
					</label>
					<label class="ar-field">
						<span>Vendor's part number</span>
						<input class="plate-well" type="text" maxlength="48" bind:value={pIn} placeholder="0388" data-testid="armory-cots-part" />
					</label>
					<label class="ar-field ac-wide">
						<span>Description</span>
						<input class="plate-well" type="text" maxlength="120" bind:value={dIn} placeholder="Hex Bearing" data-testid="armory-cots-description" />
					</label>
					<label class="ar-field ac-wide">
						<span>Vendor link (optional)</span>
						<input class="plate-well" type="url" maxlength="500" bind:value={lIn} placeholder="https://" />
					</label>
				</div>
				{#if touched && problem}<p class="ar-message bad" role="alert" data-testid="armory-cots-problem">{problem}</p>{/if}
				<div class="ac-add-go">
					<button class="btn ar-btn" type="submit" aria-disabled={busy} data-testid="armory-cots-add-key">Add to the library</button>
					{#if vIn.trim() && pIn.trim() && !cotsProblem(vIn, pIn)}<span class="ac-preview">{cotsNumber(vIn, pIn)}</span>{/if}
				</div>
				{#if addResult}<p class={`ar-message ${addResult.bad ? 'bad' : ''}`} role="status" data-testid="armory-cots-result">{addResult.text}</p>{/if}
			</form>
		{/if}
	</div>

	{#if library.parts.length === 0}
		<p class="ar-message" data-testid="armory-cots-empty">
			The library is empty. {add ? 'Add the first part above.' : 'A mentor adds parts here.'}
		</p>
	{:else}
		<div class="ar-toolbar">
			<label class="ar-field ar-search">
				<span>Search by vendor, number or name</span>
				<input class="plate-well" type="search" bind:value={query} placeholder="rev 1650, bearing, 10-32" data-testid="armory-cots-search" />
			</label>
		</div>
		<div class="ar-filters ac-vendors" role="group" aria-label="Vendor">
			<button class="btn secondary ar-btn ar-filter" type="button" aria-pressed={vendor === null} onclick={() => (vendor = null)}>
				All ({library.parts.length - retiredCount})
			</button>
			{#each vendors as v (v.vendor)}
				<button
					class="btn secondary ar-btn ar-filter"
					type="button"
					aria-pressed={vendor === v.vendor}
					data-testid="armory-cots-vendor-key"
					onclick={() => (vendor = vendor === v.vendor ? null : v.vendor)}
				>
					{v.vendor} ({v.count})
				</button>
			{/each}
			{#if retiredCount > 0}
				<button class="btn secondary ar-btn ar-filter" type="button" aria-pressed={showRetired} onclick={() => (showRetired = !showRetired)}>
					Retired ({retiredCount})
				</button>
			{/if}
		</div>
		<p class="ar-message ar-count" role="status">
			{shown.length} {shown.length === 1 ? 'part' : 'parts'}{query || vendor ? ' match' : ''}.
		</p>
		<ul class="ar-well ac-list" data-testid="armory-cots-list">
			{#each shown as p (p.id)}
				<li class="ac-row" data-testid="armory-cots-row" data-retired={p.retired}>
					<span class="ac-num">{p.cots_number}</span>
					<div class="ac-main">
						<span class="ac-desc">{p.description}</span>
						<span class="ac-meta">
							{#if p.retired}<span class="ar-readout">Retired</span>{/if}
							{#if p.link}<a class="ac-link" href={p.link} target="_blank" rel="noopener noreferrer">{host(p.link)}</a>{/if}
							{#if p.file}<a class="ac-link" href={`/armory/${p.file.project_id}/file/${p.file.id}`}>Model: {p.file.name}</a>{/if}
						</span>
					</div>
					{#if correct || retire}
						<div class="ac-keys">
							{#if correct && editing !== p.id}
								<button class="btn secondary ar-btn" type="button" data-testid="armory-cots-correct" onclick={() => openEdit(p)}>Correct</button>
							{/if}
							{#if retire}
								<button class="btn secondary ar-btn" type="button" data-testid="armory-cots-retire" onclick={() => toggleRetired(p)}>
									{p.retired ? 'Bring back' : 'Retire'}
								</button>
							{/if}
						</div>
					{/if}
					{#if editing === p.id}
						<form
							class="ac-edit"
							onsubmit={(e) => {
								e.preventDefault();
								void saveEdit(p);
							}}
						>
							<label class="ar-field">
								<span>Description</span>
								<input class="plate-well" type="text" maxlength="120" bind:value={eDesc} />
							</label>
							<label class="ar-field">
								<span>Vendor link (empty to remove)</span>
								<input class="plate-well" type="url" maxlength="500" bind:value={eLink} />
							</label>
							<div class="ac-edit-keys">
								<button class="btn ar-btn" type="submit">Save</button>
								<button class="btn secondary ar-btn" type="button" onclick={() => (editing = null)}>Cancel</button>
							</div>
							<p class="ar-message">The vendor and the number never change. If they are wrong, retire this one and add the right one.</p>
						</form>
					{/if}
					{#if rowResult?.id === p.id}
						<p class={`ar-message ac-row-msg ${rowResult.bad ? 'bad' : ''}`} role="status">{rowResult.text}</p>
					{/if}
				</li>
			{/each}
		</ul>
		{#if shown.length === 0}<p class="ar-message">Nothing in the library matches that.</p>{/if}
	{/if}
</section>

<style>
	.ac-top {
		display: grid;
		align-items: start;
		grid-template-columns: minmax(0, 1fr);
		gap: 0 1.25rem;
	}
	@container ar-view (min-width: 52rem) {
		.ac-top {
			grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
		}
	}
	.ac-samples {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		margin: 0 0 0.6rem;
		font-family: var(--font-mono);
		font-size: 1rem;
		letter-spacing: 0.04em;
		color: var(--text-1);
	}
	.ac-add-fields {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0.75rem;
	}
	@container ar-view (min-width: 30rem) {
		.ac-add-fields {
			grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
		}
		.ac-wide {
			grid-column: 1 / -1;
		}
	}
	.ac-add-go {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 1rem;
		margin-top: 0.9rem;
	}
	.ac-preview {
		font-family: var(--font-mono);
		color: var(--text-1);
		letter-spacing: 0.04em;
	}
	.ac-vendors {
		margin: 0.5rem 0;
	}
	.ac-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		grid-template-areas: 'num' 'main' 'keys' 'edit' 'msg';
		gap: 0.2rem 0.9rem;
		align-items: center;
		min-height: 44px;
		padding: 0.5rem 0;
	}
	@container ar-view (min-width: 44rem) {
		.ac-row {
			grid-template-columns: 14rem minmax(0, 1fr) auto;
			grid-template-areas: 'num main keys' 'edit edit edit' 'msg msg msg';
		}
	}
	.ac-row[data-retired='true'] .ac-num,
	.ac-row[data-retired='true'] .ac-desc {
		color: var(--text-2);
	}
	.ac-num {
		grid-area: num;
		font-family: var(--font-mono);
		font-size: 0.95rem;
		letter-spacing: 0.04em;
		color: var(--text-1);
		overflow-wrap: anywhere;
	}
	.ac-main {
		grid-area: main;
		display: flex;
		flex-direction: column;
	}
	.ac-desc {
		font-weight: 600;
		color: var(--text-1);
		overflow-wrap: anywhere;
	}
	.ac-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0 0.9rem;
		color: var(--text-2);
		font-size: 0.92rem;
	}
	.ac-link {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: var(--text-1);
		overflow-wrap: anywhere;
	}
	.ac-link:hover {
		color: var(--hover-ink, var(--gold));
	}
	.ac-keys {
		grid-area: keys;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.ac-edit {
		grid-area: edit;
		display: grid;
		gap: 0.6rem;
		padding: 0.5rem 0 0.25rem;
	}
	.ac-edit-keys {
		display: flex;
		gap: 0.5rem;
	}
	.ac-row-msg {
		grid-area: msg;
		margin: 0;
	}
</style>
