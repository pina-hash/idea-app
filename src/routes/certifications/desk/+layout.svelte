<script lang="ts">
	/**
	 * The desk's own strip under the portal's header: the desk tabs
	 * (`DESK_TABS`, the current one by `deskTabFor`, admin-only tabs hidden
	 * from a certifier) and the always-visible student search. The portal's
	 * layout (`CertShell`) supplies the header, the room and the sign-in; this
	 * renders no second shell.
	 */
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { DESK_TABS, deskTabFor } from '$lib/certifications/nav';
	import DeskSearch from '$lib/certifications/desk/DeskSearch.svelte';
	import type { DeskPerson } from '$lib/certifications/desk/desk';
	import '$lib/certifications/cert.css';
	import '$lib/certifications/desk/desk.css';

	let { data, children }: { data: { isAdmin: boolean; people: DeskPerson[] }; children: Snippet } = $props();

	const current = $derived(deskTabFor(page.url.pathname));
	const tabs = $derived(DESK_TABS.filter((t) => !t.adminOnly || data.isAdmin));
</script>

<div class="dk-root" data-testid="cert-desk-root">
	<div class="dk-bar">
		<nav class="cert-tabs" aria-label="Desk" data-testid="cert-desk-tabs">
			{#each tabs as tab (tab.id)}
				<a class="cert-tab" href={tab.href} aria-current={current === tab.id ? 'page' : undefined} data-testid="cert-desk-tab" data-tab={tab.id}>{tab.label}</a>
			{/each}
		</nav>
		<DeskSearch people={data.people} />
	</div>
	{@render children()}
</div>
