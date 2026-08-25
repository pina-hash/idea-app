<script lang="ts">
	/**
	 * THE ROUTE OWNS THE TRANSPORTS; the component owns the arrangement.
	 *
	 * Every write here is one RPC with a handful of scalars, which is exactly
	 * the case the repo says goes straight from the browser client rather than
	 * through an API route: there is no credential to hold, no multipart parse
	 * and no server-side validation that the definer function is not already
	 * doing inside its own body.
	 *
	 * A REFUSAL IS A VALUE. Every transport catches and returns
	 * `{ ok: false, message }` so the surface can render it in the same problem
	 * list as everything else. The RPCs raise on genuine misuse, and a raised
	 * message here is already written for a student to read -- `foundry_*` was
	 * built that way, so it is passed through rather than replaced with a
	 * generic sentence that would tell them less.
	 */
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';

	import FoundryMine from '$lib/foundry/FoundryMine.svelte';
	import type { FoundryApp, FoundryMineTransports, FoundryOutcome } from '$lib/foundry/transports';
	import { FOUNDRY_COVER_BUCKET } from '$lib/foundry/bundle-url';

	let { data } = $props();

	/** The clock, threaded down rather than read inside the component. */
	const now = new Date();

	/** Only ever the refusal branch, so it composes with every widened outcome. */
	function fail(err: unknown): { ok: false; message: string } {
		const message =
			err && typeof err === 'object' && 'message' in err
				? String((err as { message: unknown }).message)
				: 'That did not work. Try again.';
		return { ok: false, message };
	}

	async function callRpc(fn: string, args: Record<string, unknown>): Promise<FoundryOutcome> {
		const { error } = await data.supabase.rpc(fn, args);
		if (error) return fail(error);
		await invalidateAll();
		return { ok: true };
	}

	/**
	 * DELETION IS THE ONE WRITE ON THIS SURFACE THAT IS NOT A DIRECT RPC, and
	 * the reason is Storage rather than authorization. `foundry-bundles` carries
	 * no storage policy at all, so this browser client cannot remove a single
	 * bundle byte no matter who is signed in; `foundry-uploads` and
	 * `foundry-covers` have own-folder policies, which an admin deleting a
	 * student's app could not satisfy either. `/api/foundry/delete` calls the
	 * same definer RPC as the CALLER -- so the database is still the boundary --
	 * and sweeps the objects with the service key afterwards.
	 *
	 * `storageProblem` RIDES A SUCCESS. The rows are gone before the sweep runs,
	 * so a partial sweep is a completed delete with bytes left behind, not a
	 * failure. It is passed straight through for the surface to say so.
	 */
	async function callDelete(
		body: { appId: string } | { versionId: string }
	): Promise<FoundryOutcome<{ storageProblem?: string | null }>> {
		try {
			const res = await fetch('/api/foundry/delete', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			const payload = (await res.json().catch(() => null)) as {
				ok?: boolean;
				message?: string;
				storageProblem?: string | null;
			} | null;
			if (!payload?.ok) {
				// The RPC's own sentence, written for the student who will read it.
				return { ok: false, message: payload?.message ?? 'That did not work. Try again.' };
			}
			await invalidateAll();
			return { ok: true, storageProblem: payload.storageProblem ?? null };
		} catch (err) {
			return fail(err);
		}
	}

	const transports: FoundryMineTransports = {
		submitVersion: (versionId) => callRpc('foundry_submit_version', { p_version_id: versionId }),
		withdrawVersion: (versionId) =>
			callRpc('foundry_withdraw_version', { p_version_id: versionId }),
		rollback: (appId, versionId) =>
			callRpc('foundry_set_published_version', { p_app_id: appId, p_version_id: versionId }),
		saveField: (appId, field, value) =>
			callRpc('foundry_update_app_metadata', {
				p_app_id: appId,
				p_field: field,
				p_value: value
			}),
		deleteApp: (appId) => callDelete({ appId }),
		deleteVersion: (versionId) => callDelete({ versionId }),

		async uploadCover(file) {
			// Own folder only, which is the whole of what the bucket's policy
			// permits. A uuid rather than the filename: two students uploading
			// `cover.png` is the normal case, and a name a person chose is a name
			// that can carry anything.
			const ext = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase() || 'png';
			const path = `${data.uid}/${crypto.randomUUID()}.${ext}`;
			const { error } = await data.supabase.storage
				.from(FOUNDRY_COVER_BUCKET)
				.upload(path, file, { contentType: file.type || undefined, upsert: false });
			if (error) return fail(error);
			return { ok: true, path };
		},

		async refresh(slug) {
			const { data: fresh } = await data.supabase.rpc('foundry_get_app', {
				p_slug: slug,
				p_include_unpublished: true
			});
			return (fresh as FoundryApp) ?? null;
		}
	};

	/**
	 * A public bucket, so the URL is built rather than signed. It is derived
	 * here and handed in, because a component that builds its own storage URL
	 * has taken a dependency on the bucket layout.
	 */
	function coverUrl(path: string): string {
		return data.supabase.storage.from(FOUNDRY_COVER_BUCKET).getPublicUrl(path).data.publicUrl;
	}

	function select(slug: string | null) {
		const url = new URL(page.url);
		if (slug) url.searchParams.set('app', slug);
		else url.searchParams.delete('app');
		void goto(`${url.pathname}${url.search}`, { keepFocus: true, noScroll: true });
	}
</script>

<svelte:head>
	<title>My apps // IDEA Foundry</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="fdy-page">
	<FoundryMine
		apps={data.apps}
		selected={data.selected}
		{transports}
		{coverUrl}
		{now}
		onSelect={select}
	/>
</div>

<style>
	/*
	 * The page width comes from the shared classroom gutter token rather than a
	 * literal, so this surface lines up with every other console in the portal
	 * and moves with them if that value ever does.
	 */
	.fdy-page {
		padding: var(--space-4, 1rem) var(--cr-gutter, 1rem);
	}
</style>
