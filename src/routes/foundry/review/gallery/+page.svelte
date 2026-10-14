<script lang="ts">
	/**
	 * /foundry/review/gallery. An ordinary document (`foundryIsApplication`
	 * answers false for it). The route owns the transports; every write is one
	 * admin-only RPC straight from the browser client, re-checking `is_admin()`
	 * in its own body.
	 */
	import { invalidateAll } from '$app/navigation';

	import { FOUNDRY_COVER_BUCKET } from '$lib/foundry/bundle-url';
	import { foundryCoverUrl } from '$lib/foundry/covers';
	import FoundryGalleryAdmin from '$lib/foundry/FoundryGalleryAdmin.svelte';
	import {
		adminRefusalSentence,
		type FoundryAdminOutcome,
		type FoundryGalleryAdminTransports
	} from '$lib/foundry/gallery-extras';
	import { foundryHouseReleases } from '$lib/foundry/major';
	import FoundryPage from '$lib/foundry/FoundryPage.svelte';
	import FoundryReviewNav from '$lib/foundry/FoundryReviewNav.svelte';

	let { data } = $props();

	/** One RPC call as an outcome: a missing function is "not available yet", a refusal is its reason in words. */
	async function call(fn: string, args: Record<string, unknown>): Promise<FoundryAdminOutcome> {
		try {
			const { data: r, error } = await data.supabase.rpc(fn, args);
			if (error) {
				return {
					ok: false,
					message:
						error.code === 'PGRST202'
							? 'This is not available yet. It arrives with the next database update.'
							: error.message
				};
			}
			const out = r as { ok?: boolean; reason?: string; id?: string } | null;
			if (out?.ok) return out.id ? { ok: true, id: out.id } : { ok: true };
			return { ok: false, message: adminRefusalSentence(out?.reason) };
		} catch {
			return { ok: false, message: 'Could not reach the server. Try again.' };
		}
	}

	const transports: FoundryGalleryAdminTransports = {
		saveOverride: (subject, f) =>
			call('foundry_gallery_override_set', {
				p_subject: subject,
				p_title: f.title,
				p_description: f.description,
				p_thumbnail_path: f.thumbnail_path
			}),
		async uploadThumb(file) {
			// Own folder only, which is all the bucket's policy permits; a uuid
			// for the name, because a name a person chose can carry anything.
			const ext = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase() || 'png';
			const path = `${data.uid}/${crypto.randomUUID()}.${ext}`;
			const { error } = await data.supabase.storage
				.from(FOUNDRY_COVER_BUCKET)
				.upload(path, file, { contentType: file.type || undefined, upsert: false });
			if (error) return { ok: false, message: error.message };
			return { ok: true, path };
		},
		saveCollection: (id, title, description, members) =>
			call('foundry_collection_save', {
				p_id: id,
				p_title: title,
				p_description: description,
				p_members: members
			}),
		setCollectionPublished: (id, published) =>
			call('foundry_collection_set_published', { p_id: id, p_published: published }),
		deleteCollection: (id) => call('foundry_collection_delete', { p_id: id }),
		orderCollections: (ids) => call('foundry_collections_order', { p_ids: ids }),
		saveFeatured: (subjects) => call('foundry_featured_set', { p_subjects: subjects })
	};

	const houses = foundryHouseReleases();
</script>

<svelte:head>
	<title>Foundry curation</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<FoundryPage
	heading="Curation"
	lead="Shape what students see first: release details, collections and the featured row. Nothing here changes a student's own app."
	testid="foundry-gallery-admin-page"
>
	{#snippet nav()}
		<FoundryReviewNav active="gallery" pendingApps={data.reviewPending ?? null} />
	{/snippet}

	<FoundryGalleryAdmin
		apps={data.apps}
		{houses}
		overrides={data.overrides}
		collections={data.collections}
		featured={data.featured}
		coverUrl={foundryCoverUrl}
		{transports}
		onChanged={() => invalidateAll()}
	/>
</FoundryPage>
