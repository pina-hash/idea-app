<script lang="ts" module>
	/**
	 * THE ADMIN AREA'S PLACES, ONE LIST (ledger 0468). Every page here answers
	 * 404 to anybody who is not an admin (probing must reveal nothing), and
	 * this strip is drawn only on those pages, so it discloses nothing a
	 * visitor could not already see. Order is the order drawn: the console
	 * first, then the queues, then the tools.
	 */
	export const ADMIN_PLACES: ReadonlyArray<{ id: string; label: string; href: string }> = [
		{ id: 'console', label: 'Console', href: '/dashboard' },
		{ id: 'feedback', label: 'Feedback', href: '/admin/feedback' },
		{ id: 'avatars', label: 'Profile pictures', href: '/admin/avatars' },
		{ id: 'links', label: 'Short links', href: '/admin/links' },
		{ id: 'test-accounts', label: 'Test accounts', href: '/admin/test-accounts' },
		{ id: 'view-as', label: 'View as', href: '/admin/view-as' },
		{ id: 'connector', label: 'Connector', href: '/admin/connector' },
		{ id: 'html-assignments', label: 'HTML assignments', href: '/admin/html-assignments' },
		{ id: 'ideacad-materials', label: 'IdeaCAD materials', href: '/admin/ideacad-materials' }
	];

	/** Which admin place an address is, or null (a harness address is none). */
	export function adminPlaceFor(pathname: string): string | null {
		const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
		let best: { id: string; len: number } | null = null;
		for (const p of ADMIN_PLACES) {
			if ((path === p.href || path.startsWith(`${p.href}/`)) && (!best || p.href.length > best.len)) best = { id: p.id, len: p.href.length };
		}
		return best?.id ?? null;
	}
</script>

<script lang="ts">
	import AppSubNav from './AppSubNav.svelte';

	/**
	 * The admin area's sub-nav: the site's one app sub-nav over `ADMIN_PLACES`,
	 * the current place lit. `current` is the caller's answer (a route passes
	 * `adminPlaceFor(page.url.pathname)`), so a harness with no router mounts
	 * it the same way.
	 */
	let { current = null }: { current?: string | null } = $props();
</script>

<div class="adm-subnav">
	<AppSubNav
		label="Admin"
		testid="admin-subnav"
		items={ADMIN_PLACES.map((p) => ({ id: p.id, label: p.label, href: p.href, current: current === p.id }))}
	/>
</div>

<style>
	.adm-subnav {
		box-sizing: border-box;
		max-width: 92rem;
		margin: 0 auto;
		padding: 0.85rem 1rem 0;
	}
	.adm-subnav :global(.app-subnav) {
		margin: 0;
	}
</style>
