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
	import AppSubNav from '$lib/shell/AppSubNav.svelte';
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
		<AppSubNav
			label="Desk"
			testid="cert-desk-tabs"
			items={tabs.map((tab) => ({ id: tab.id, label: tab.label, href: tab.href, current: current === tab.id, testid: 'cert-desk-tab' }))}
		/>
		<DeskSearch people={data.people} />
	</div>
	{@render children()}
</div>
