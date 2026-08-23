<script lang="ts">
	/**
	 * THE ROUTE'S HALF OF THE SUBMIT SURFACE: the real transports.
	 *
	 * `FoundrySubmit` orchestrates create -> cover -> upload -> version ->
	 * ingest and knows nothing about Supabase. The dev harness at
	 * /dev/foundry-submit mounts the IDENTICAL component with these five
	 * methods answered in memory, which is what makes a five-step flow
	 * verifiable with no network and no project.
	 */
	import FoundrySubmit from '$lib/foundry/FoundrySubmit.svelte';
	import type { FoundrySubmitTransports, IngestOutcome } from '$lib/foundry/transports';

	let { data } = $props();

	/** Only ever the refusal branch, so it composes with every widened outcome. */
	function fail(err: unknown): { ok: false; message: string } {
		const message =
			err && typeof err === 'object' && 'message' in err
				? String((err as { message: unknown }).message)
				: 'That did not work. Try again.';
		return { ok: false, message };
	}

	/*
	 * DERIVED, so `uid` and the existing-apps list follow the route's data
	 * instead of freezing at whatever the first render saw. A plain object
	 * literal here captures `data` once, which is correct until the first
	 * `invalidateAll` and silently wrong after it.
	 */
	const transports: FoundrySubmitTransports = $derived({
		uid: data.uid,
		existingApps: data.apps.map((a) => ({ id: a.id, slug: a.slug, title: a.title })),

		async createApp(input) {
			const { data: result, error } = await data.supabase.rpc('foundry_create_app', {
				p_slug: input.slug,
				p_title: input.title,
				p_build_notes: input.buildNotes,
				p_tagline: input.tagline || null,
				p_description: input.description || null
			});
			if (error) return fail(error);
			const row = result as { ok: boolean; app_id: string; slug: string };
			if (!row?.ok) return { ok: false, message: 'The app could not be created.' };
			return { ok: true, appId: row.app_id, slug: row.slug };
		},

		async uploadZip(zip, path) {
			const { error } = await data.supabase.storage
				.from('foundry-uploads')
				.upload(path, zip, { contentType: 'application/zip', upsert: false });
			if (error) return fail(error);
			return { ok: true };
		},

		async createVersion({ appId, zipPath, byteSize, fileCount }) {
			const { data: result, error } = await data.supabase.rpc('foundry_create_version', {
				p_app_id: appId,
				p_zip_path: zipPath,
				p_byte_size: byteSize,
				p_file_count: fileCount
			});
			if (error) return fail(error);
			const row = result as { ok: boolean; version_id: string; ordinal: number };
			if (!row?.ok) return { ok: false, message: 'The version could not be recorded.' };
			return { ok: true, versionId: row.version_id, ordinal: row.ordinal };
		},

		/**
		 * A REFUSAL FROM INGEST IS A 200 WITH `ok: false`, and it is not
		 * retried. The function considered the upload and answered; treating
		 * that as a transport failure is how a considered refusal turns into
		 * five identical uploads. Only a genuinely broken call throws, and that
		 * lands in `message`.
		 */
		async ingest(versionId): Promise<IngestOutcome> {
			const empty: IngestOutcome = {
				ok: false,
				failures: [],
				warnings: [],
				notes: [],
				fileCount: 0,
				totalBytes: 0,
				strippedWrapper: null,
				files: [],
				message: null
			};
			try {
				const { data: result, error } = await data.supabase.functions.invoke('foundry-ingest', {
					body: { version_id: versionId }
				});
				if (error) {
					return {
						...empty,
						message: `The server could not unpack your upload: ${error.message}`
					};
				}
				const body = result as Record<string, unknown>;
				return {
					ok: body.ok === true,
					failures: (body.failures as IngestOutcome['failures']) ?? [],
					warnings: (body.warnings as IngestOutcome['warnings']) ?? [],
					notes: (body.notes as string[]) ?? [],
					fileCount: Number(body.fileCount ?? 0),
					totalBytes: Number(body.totalBytes ?? 0),
					strippedWrapper: (body.strippedWrapper as string | null) ?? null,
					files: (body.files as IngestOutcome['files']) ?? [],
					message: null
				};
			} catch (err) {
				return { ...empty, message: fail(err).message };
			}
		},

		async uploadCover(file) {
			const ext = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase() || 'png';
			const path = `${data.uid}/${crypto.randomUUID()}.${ext}`;
			const { error } = await data.supabase.storage
				.from('foundry-covers')
				.upload(path, file, { contentType: file.type || undefined, upsert: false });
			if (error) return fail(error);
			return { ok: true, path };
		},

		async saveField(appId, field, value) {
			const { error } = await data.supabase.rpc('foundry_update_app_metadata', {
				p_app_id: appId,
				p_field: field,
				p_value: value
			});
			if (error) return fail(error);
			return { ok: true };
		}
	});
</script>

<svelte:head>
	<title>Publish an app // IDEA Foundry</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="fdy-page">
	<header class="fdy-page-head">
		<h1>Publish an app</h1>
		<a class="btn tap-44" href="/foundry/mine">My apps</a>
	</header>

	<FoundrySubmit {transports} initialAppId={data.initialAppId} />
</div>

<style>
	.fdy-page {
		padding: var(--space-4, 1rem) var(--cr-gutter, 1rem);
	}

	.fdy-page-head {
		display: flex;
		align-items: center;
		gap: var(--space-3, 0.75rem);
		flex-wrap: wrap;
		margin-bottom: var(--space-4, 1rem);
	}

	.fdy-page-head h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.7rem;
	}

	.fdy-page-head a {
		margin-left: auto;
	}
</style>
