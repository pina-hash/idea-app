<script lang="ts">
	/**
	 * The editor page: `EngineEditor` over `cert_admin_get`, with the save
	 * transport posting this page's own `save` action through fetch (the
	 * `x-sveltekit-action` header makes the server answer JSON, `deserialize`
	 * reads it), so the editor's `SaveState` learns the acknowledgement rather
	 * than the dispatch. A certifier gets no transport and reads.
	 */
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import EngineEditor from '$lib/certifications/desk/EngineEditor.svelte';
	import { formFor, type EngineSaveAnswer } from '$lib/certifications/desk/desk';
	import { PORTAL_NAME } from '$lib/certifications/copy';
	import type { CertPackage } from '$lib/certifications/types';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	async function save(pkg: CertPackage, note: string): Promise<EngineSaveAnswer> {
		const body = new FormData();
		body.set('package', JSON.stringify(pkg));
		body.set('note', note);
		let res: Response;
		try {
			res = await fetch('?/save', { method: 'POST', body, headers: { 'x-sveltekit-action': 'true', accept: 'application/json' } });
		} catch (e) {
			return { ok: false, retryable: true, message: (e as Error)?.message || 'The server could not be reached.' };
		}
		if (res.status >= 500) return { ok: false, retryable: true, message: `The server answered HTTP ${res.status}.` };
		const result = deserialize(await res.text());
		if (result.type === 'success') {
			const d = (result.data ?? {}) as { data?: { revision?: number | null; publish_problems?: string[] } };
			void invalidateAll();
			return { ok: true, revision: d.data?.revision ?? null, publish_problems: d.data?.publish_problems ?? [] };
		}
		if (result.type === 'failure') {
			const d = (result.data ?? {}) as { message?: string; data?: { problems?: string[] } };
			return { ok: false, retryable: false, message: d.message ?? 'The revision was refused.', problems: d.data?.problems };
		}
		return { ok: false, retryable: true, message: 'The server answered unexpectedly.' };
	}

	const results = $derived({
		publish: formFor(form, 'publish'),
		hide: formFor(form, 'hide'),
		retire: formFor(form, 'retire'),
		delete: formFor(form, 'delete'),
		savePool: formFor(form, 'savePool'),
		saveLesson: formFor(form, 'saveLesson'),
		deleteLesson: formFor(form, 'deleteLesson')
	});
</script>

<svelte:head><title>{data.title}, {PORTAL_NAME}</title></svelte:head>

{#if data.unavailable || !data.cert}
	<p class="cert-notice cert-notice-quiet" data-testid="cert-not-available">
		<span class="cert-notice-glyph" aria-hidden="true">i</span>
		<span>This part of IDEA Certifications is not available yet.</span>
	</p>
{:else}
	{#key data.cert.current_revision_id}
		<EngineEditor cert={data.cert} pool={data.pool} others={data.others} save={data.isAdmin ? save : null} {results} />
	{/key}
{/if}
