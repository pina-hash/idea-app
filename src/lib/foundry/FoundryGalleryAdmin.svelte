<script lang="ts">
	/**
	 * THE ADMIN'S CURATION OF THE GALLERY (ledger 0380): the details a release's
	 * card shows (report c5f811e4), collections (report 762bb647) and the
	 * featured row (report 415af89e), on one page so the three ways of shaping
	 * what a student sees first sit together.
	 *
	 * THE ROUTE OWNS THE LOAD AND THE TRANSPORTS; this owns the arrangement.
	 * Every write is an admin-only RPC that re-checks `is_admin()` in its own
	 * body, so nothing here is the boundary. A section whose read is `null`
	 * (a database before 0237) says so in words and offers no control, and the
	 * page around it carries on.
	 */
	import FoundryCollectionEditor from './FoundryCollectionEditor.svelte';
	import FoundryOverrideRow from './FoundryOverrideRow.svelte';
	import FoundrySubjectList from './FoundrySubjectList.svelte';
	import {
		FOUNDRY_FEATURED_MAX_PICKS,
		FOUNDRY_GALLERY_ADMIN_NOT_READY,
		appSubject,
		houseSubject,
		type FoundryCollection,
		type FoundryGalleryAdminTransports,
		type FoundryOverrideMap
	} from './gallery-extras.ts';
	import type { FoundryHouseRelease } from './major.ts';

	let {
		apps,
		houses,
		overrides,
		collections,
		featured,
		coverUrl,
		transports,
		onChanged
	}: {
		/** Every published, visible app, with whether it is a major release. */
		apps: { id: string; title: string; tagline: string | null; cover_path: string | null; major: boolean }[];
		houses: FoundryHouseRelease[];
		/** Null on a database before 0237. */
		overrides: FoundryOverrideMap | null;
		collections: FoundryCollection[] | null;
		featured: string[] | null;
		coverUrl: (path: string) => string | null;
		transports: FoundryGalleryAdminTransports;
		onChanged: () => void;
	} = $props();

	const options = $derived([
		...houses.map((h) => ({ subject: houseSubject(h.id), label: `${h.title} (IDEA original)` })),
		...apps.map((a) => ({ subject: appSubject(a.id), label: a.title }))
	]);

	// Only a release has a gallery card an admin should restyle by hand: the
	// major releases and IDEA's own games. Any other app's card is its author's.
	const releaseRows = $derived([
		...houses.map((h) => ({
			subject: houseSubject(h.id),
			name: `${h.title} (IDEA original)`,
			defaults: { title: h.title, description: h.sub }
		})),
		...apps
			.filter((a) => a.major)
			.map((a) => ({
				subject: appSubject(a.id),
				name: a.title,
				defaults: { title: a.title, description: a.tagline }
			}))
	]);

	/* svelte-ignore state_referenced_locally */
	let picks = $state<string[]>(featured ?? []);
	let featuredBusy = $state(false);
	let featuredNote = $state<string | null>(null);
	let featuredProblem = $state(false);

	async function saveFeatured() {
		featuredBusy = true;
		featuredNote = null;
		try {
			const r = await transports.saveFeatured(picks);
			featuredProblem = !r.ok;
			featuredNote = r.ok ? 'Saved. The featured row shows these first.' : r.message;
			if (r.ok) onChanged();
		} catch {
			featuredProblem = true;
			featuredNote = 'Could not reach the server. Try again.';
		} finally {
			featuredBusy = false;
		}
	}

	async function moveCollection(index: number, by: -1 | 1) {
		if (!collections) return;
		const ids = collections.map((c) => c.id);
		const j = index + by;
		if (j < 0 || j >= ids.length) return;
		[ids[index], ids[j]] = [ids[j], ids[index]];
		const r = await transports.orderCollections(ids);
		if (r.ok) onChanged();
	}

	let addingCollection = $state(false);
</script>

<div class="fga" data-testid="foundry-gallery-admin">
	<section class="fga-sec" aria-labelledby="fga-rel-h">
		<h2 id="fga-rel-h">Release details</h2>
		<p class="fga-lead">
			The title, description and picture on the gallery card of IDEA's own games and of major
			releases. A box left empty uses the default. The student's own app is never changed.
		</p>
		{#if overrides === null}
			<p class="fga-nr">{FOUNDRY_GALLERY_ADMIN_NOT_READY}</p>
		{:else if releaseRows.length === 0}
			<p class="fga-nr">There are no releases to edit yet.</p>
		{:else}
			<ul class="fga-list">
				{#each releaseRows as row (row.subject + JSON.stringify(overrides[row.subject] ?? null))}
					<FoundryOverrideRow
						subject={row.subject}
						name={row.name}
						defaults={row.defaults}
						override={overrides[row.subject]}
						{coverUrl}
						save={async (s, f) => {
							const r = await transports.saveOverride(s, f);
							if (r.ok) onChanged();
							return r;
						}}
						{...(transports.uploadThumb ? { upload: transports.uploadThumb } : {})}
					/>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="fga-sec" aria-labelledby="fga-col-h">
		<h2 id="fga-col-h">Collections</h2>
		<p class="fga-lead">
			Named sets of games. A published collection is one card on the gallery that opens to its
			games, in the order set here.
		</p>
		{#if collections === null}
			<p class="fga-nr">{FOUNDRY_GALLERY_ADMIN_NOT_READY}</p>
		{:else}
			<ul class="fga-list">
				{#each collections as c, i (c.id + c.title + c.published + c.members.map((m) => m.subject).join())}
					<FoundryCollectionEditor
						collection={c}
						{options}
						save={transports.saveCollection}
						setPublished={transports.setCollectionPublished}
						remove={transports.deleteCollection}
						canMoveUp={i > 0}
						canMoveDown={i < collections.length - 1}
						onMove={(by) => moveCollection(i, by)}
						onDone={onChanged}
					/>
				{/each}
				{#if addingCollection}
					<FoundryCollectionEditor
						{options}
						save={transports.saveCollection}
						onDone={() => {
							addingCollection = false;
							onChanged();
						}}
					/>
				{/if}
			</ul>
			{#if !addingCollection}
				<button type="button" class="btn tap-44" data-testid="foundry-collection-new" onclick={() => (addingCollection = true)}>
					New collection
				</button>
			{/if}
		{/if}
	</section>

	<section class="fga-sec" aria-labelledby="fga-feat-h">
		<h2 id="fga-feat-h">Featured row</h2>
		<p class="fga-lead">
			Picked by hand, in this order, up to {FOUNDRY_FEATURED_MAX_PICKS}. The row sits directly
			under the major releases; any space it has left is filled from the top of Most played and
			Trending. With nothing picked the whole row comes from those two lists, and it is not shown
			until something has been played or voted on.
		</p>
		{#if featured === null}
			<p class="fga-nr">{FOUNDRY_GALLERY_ADMIN_NOT_READY}</p>
		{:else}
			<FoundrySubjectList
				subjects={picks}
				{options}
				max={FOUNDRY_FEATURED_MAX_PICKS}
				onchange={(next) => (picks = next)}
				testId="fga-featured"
			/>
			<div class="fga-actions">
				<button type="button" class="btn tap-44" disabled={featuredBusy} data-testid="foundry-featured-save" onclick={saveFeatured}>
					Save the featured row
				</button>
			</div>
			{#if featuredNote}
				<p class="fga-note" class:is-problem={featuredProblem} role="status">{featuredNote}</p>
			{/if}
		{/if}
	</section>
</div>

<style>
	.fga {
		display: flex;
		flex-direction: column;
		gap: var(--space-6, 2rem);
		min-width: 0;
	}
	.fga-sec {
		display: flex;
		flex-direction: column;
		gap: var(--space-3, 0.75rem);
		min-width: 0;
	}
	.fga-sec h2 {
		margin: 0;
	}
	.fga-lead,
	.fga-nr {
		margin: 0;
		color: var(--text-2);
		max-width: var(--measure-reading, 42rem);
		line-height: 1.45;
	}
	.fga-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3, 0.75rem);
	}
	.fga-actions {
		display: flex;
		gap: var(--space-2, 0.5rem);
	}
	.fga-note {
		margin: 0;
		color: var(--text-1);
	}
	.fga-note.is-problem {
		color: var(--amber);
	}
</style>
