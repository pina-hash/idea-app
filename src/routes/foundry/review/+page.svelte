<script lang="ts">
	/**
	 * THE ROUTE OWNS THE TRANSPORTS; the component owns the arrangement.
	 *
	 * Two of these go through API routes rather than straight to Supabase, and
	 * each for the reason the repo gives for having a route at all:
	 *
	 *   launch  mints a signed token, which needs a secret.
	 *   files / source  read `foundry-bundles`, which has no storage policy, so
	 *           only the service-role key reaches it.
	 *
	 * The decision itself is one RPC with a handful of scalars and goes straight
	 * from the browser client, because `foundry_review_version` re-checks
	 * `is_admin()` inside its own body and there is nothing a server would add.
	 */
	import { goto, invalidateAll } from '$app/navigation';

	import ReviewQueue from '$lib/foundry/ReviewQueue.svelte';
	import { rejectReasonLabel } from '$lib/foundry/review';
	import type { FoundryReviewTransports } from '$lib/foundry/transports';

	let { data } = $props();

	/** The clock, threaded down rather than read inside the component. */
	const now = new Date();

	function coverUrl(path: string): string {
		return data.supabase.storage.from('foundry-covers').getPublicUrl(path).data.publicUrl;
	}

	async function post(url: string, body: unknown): Promise<Record<string, unknown> | null> {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		return (await res.json().catch(() => null)) as Record<string, unknown> | null;
	}

	const transports: FoundryReviewTransports = {
		async launch({ appId, versionId }) {
			try {
				const body = await post('/api/foundry/token', { appId, versionId, purpose: 'review' });
				if (!body?.ok) {
					if (body?.reason === 'not_configured') {
						return { ok: false, message: 'Bundle tokens are not configured on this deployment.' };
					}
					return { ok: false, message: 'That build could not be opened.' };
				}
				return {
					ok: true,
					src: body.src as string,
					versionId: body.versionId as string,
					expiresInSeconds: body.expiresInSeconds as number
				};
			} catch {
				return { ok: false, message: 'That build could not be opened. Check your connection.' };
			}
		},

		async listFiles(versionId) {
			try {
				const body = await post('/api/foundry/source', { versionId });
				if (!body?.ok) {
					if (body?.reason === 'not_configured') {
						return { ok: false, message: 'Bundle storage is not configured on this deployment.' };
					}
					return { ok: false, message: 'The file list could not be read.' };
				}
				return { ok: true, files: body.files as never };
			} catch {
				return { ok: false, message: 'The file list could not be read.' };
			}
		},

		async readFile(versionId, path) {
			const appId = data.selected?.id ?? '';
			try {
				const body = await post('/api/foundry/source', { appId, versionId, path });
				if (!body?.ok) {
					// The two states that are facts about the BUILD rather than
					// failures get their own sentences, because a reviewer acts on
					// them differently from "that did not work".
					if (body?.reason === 'not_text') {
						return { ok: false, message: 'This file is not text. Open the running app to see it.' };
					}
					if (body?.reason === 'too_large') {
						const kb = Math.round(Number(body.maxBytes ?? 0) / 1024);
						return {
							ok: false,
							message: `This file is over ${kb}KB, which usually means it is minified or generated. It is not shown here.`
						};
					}
					return { ok: false, message: 'That file could not be read.' };
				}
				return {
					ok: true,
					text: body.text as string,
					path: body.path as string,
					byteSize: body.byteSize as number
				};
			} catch {
				return { ok: false, message: 'That file could not be read.' };
			}
		},

		async decide({ versionId, decision, note, reasonId }) {
			const { error } = await data.supabase.rpc('foundry_review_version', {
				p_version_id: versionId,
				p_decision: decision,
				p_review_note: note || null,
				// THE STORED REASON IS THE LABEL, not the id. `reject_reason` is
				// read back by the STUDENT on /foundry/mine, and a slug like
				// `not-your-work` is a sentence written for a database rather than
				// for the person it is about.
				p_reject_reason: decision === 'reject' ? rejectReasonLabel(reasonId) : null
			});
			if (error) return { ok: false, message: error.message };
			await invalidateAll();
			return { ok: true };
		},

		async clearMetadataFlag(appId) {
			const { error } = await data.supabase.rpc('foundry_clear_metadata_flag', {
				p_app_id: appId
			});
			if (error) return { ok: false, message: error.message };
			await invalidateAll();
			return { ok: true };
		}
	};

	function select(slug: string | null) {
		const target = slug ? `/foundry/review?app=${encodeURIComponent(slug)}` : '/foundry/review';
		goto(target, { keepFocus: true, noScroll: true });
	}
</script>

<svelte:head>
	<title>Foundry review</title>
</svelte:head>

<!-- The room wrapper (.fg-root) and the masthead live in the /foundry layout. -->
<div class="fdy-rev-page">
	<header class="fdy-rev-head">
		<h1>Review queue</h1>
		<p>
			Read the source beside the running build. Approving publishes it immediately; sending it
			back needs a reason and a note the student can act on.
		</p>
	</header>

	<ReviewQueue
		apps={data.apps}
		selected={data.selected}
		{transports}
		{coverUrl}
		onSelect={select}
		onDecided={() => invalidateAll()}
		{now}
	/>
</div>

<style>
	.fdy-rev-page {
		display: flex;
		flex-direction: column;
		gap: var(--space-5, 1.25rem);
		/* `--measure-split` (92rem), NOT `--measure-wide` (62rem): the wide
		   measure is the widest SINGLE column, and this page is a two-pane
		   master-detail shell. Measured at 1440px on the harness with the wrong
		   one, the split's detail pane came out 873px and the review surface's
		   side-by-side never engaged at all. `--measure-split` is the token that
		   exists for exactly this shape. */
		max-width: var(--measure-split);
		margin: 0 auto;
		padding: var(--space-5, 1.25rem) var(--cr-gutter, 1rem);
		min-width: 0;
	}

	.fdy-rev-head h1 {
		margin: 0 0 0.25rem;
		font-family: var(--font-title, var(--font-display));
	}

	.fdy-rev-head p {
		margin: 0;
		max-width: var(--measure-prose, 42rem);
		color: var(--text-2, var(--dim));
	}
</style>
