<script lang="ts">
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import ShortLinkManager from '$lib/ShortLinkManager.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import type { ShortLinkRow, ShortLinkTransports } from '$lib/short-links';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * The REAL transports: thin callers of 0093's RPCs on the browser client
	 * (the /notebook/review convention -- a short-link write is one RPC call
	 * with two strings and has none of the server-side work that justifies an
	 * API route). Each RPC re-checks is_admin() itself; the page's 404 is
	 * convenience.
	 */
	const transports: ShortLinkTransports = {
		async upsert(slug, target, label, active) {
			const { error } = await data.supabase.rpc('app_short_link_upsert', {
				p_slug: slug,
				p_target: target,
				p_label: label,
				p_active: active
			});
			return error ? { ok: false, message: error.message } : { ok: true };
		},
		async remove(slug) {
			const { error } = await data.supabase.rpc('app_short_link_delete', { p_slug: slug });
			return error ? { ok: false, message: error.message } : { ok: true };
		},
		async reload() {
			const { data: rows } = await data.supabase.rpc('app_short_link_list');
			return (rows ?? []) as ShortLinkRow[];
		}
	};
</script>

<svelte:head><title>Short links // IDEA</title></svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/admin">&lsaquo; Admin</a>
		<ProfileMenu />
	</div>
</div>

<main class="admin-page">
	<section class="hero">
		<div class="eyebrow">Admin</div>
		<h1>Short links</h1>
		<p class="lede">Printed QR codes point here; the targets move, the paper does not.</p>
	</section>

	<ShortLinkManager links={data.links} ready={data.ready} {transports} />

	<footer class="page-footer"><VersionBadge app="portal" /></footer>
</main>

<style>
	.admin-page {
		max-width: 48rem;
		margin: 0 auto;
		padding: 0 1.2rem 3rem;
	}
	.lede {
		color: var(--dim);
		margin: 0.3rem 0 0;
		font-size: 0.92rem;
	}
	.page-footer {
		margin-top: 1.4rem;
		display: flex;
		justify-content: center;
	}
</style>
