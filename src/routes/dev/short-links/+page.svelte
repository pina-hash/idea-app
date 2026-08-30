<script lang="ts">
	/**
	 * Dev harness for `/admin/links` (404 in production, no auth, no Supabase).
	 * Mounts the REAL `ShortLinkManager` against in-memory transports mirroring
	 * 0093's own rules, so the form, the existing-slug warning, the two-step
	 * delete and the not-configured state can be driven without an admin
	 * session.
	 *
	 * WHY IT IS ITS OWN ROUTE, AND WHY THE PAGE CARRIES NO ROOM. This component
	 * used to be a tab on `/dev/classroom-reference`, which deliberately wraps
	 * its whole page in `.cr-root` -- correctly, for the reference components it
	 * exists for, and wrongly for this one. `ShortLinkManager` is mounted by
	 * exactly one route in the app, `/admin/links`, which is the portal shell:
	 * no room, no scoped stylesheet, `--dim` and `--white` and `--line` resolving
	 * to their `:root` values rather than the classroom's aliases. A harness in
	 * the wrong room is a harness whose every contrast and geometry reading was
	 * taken against the wrong plate, so the tab is gone from there and the mount
	 * is here.
	 *
	 * The chrome around it is `/admin/links`'s own -- `.app-header`, `.hero`,
	 * `main.admin-page` at 48rem -- because the component sits inside that
	 * measure and a harness that gave it the full viewport would report widths
	 * the real route never renders.
	 */
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import ShortLinkManager from '$lib/ShortLinkManager.svelte';
	import type { ShortLinkRow, ShortLinkTransports } from '$lib/short-links';

	let links = $state<ShortLinkRow[]>([
		{
			slug: '209h',
			target: '/reference/00000000-0000-0000-0000-0000000209ab',
			label: 'IDEA209H syllabus',
			active: true,
			created_by: 'apina@boscotech.edu',
			created_at: '2026-08-13T00:00:00Z',
			updated_at: '2026-08-13T00:00:00Z'
		},
		{
			slug: 'shop-safety',
			target: '/reference/00000000-0000-0000-0000-00000000safe',
			label: 'Shop safety card',
			active: false,
			created_by: 'apina@boscotech.edu',
			created_at: '2026-08-13T00:00:00Z',
			updated_at: '2026-08-20T00:00:00Z'
		}
	]);

	const transports: ShortLinkTransports = {
		async upsert(slug, target, label, active) {
			const existing = links.find((r) => r.slug === slug);
			if (existing) {
				links = links.map((r) =>
					r.slug === slug ? { ...r, target, label, active, updated_at: '2026-08-13T00:00:00Z' } : r
				);
			} else {
				links = [
					...links,
					{
						slug,
						target,
						label,
						active,
						created_by: 'apina@boscotech.edu',
						created_at: '2026-08-13T00:00:00Z',
						updated_at: '2026-08-13T00:00:00Z'
					}
				];
			}
			return { ok: true };
		},
		async remove(slug) {
			links = links.filter((r) => r.slug !== slug);
			return { ok: true };
		},
		async reload() {
			return [...links].sort((a, b) => a.slug.localeCompare(b.slug));
		}
	};
</script>

<svelte:head><title>dev // short links</title></svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<span class="dev-tag">dev harness // short links</span>
</div>

<main class="admin-page">
	<section class="hero">
		<div class="eyebrow">Admin</div>
		<h1>Short links</h1>
		<p class="lede">Printed QR codes point here; the targets move, the paper does not.</p>
	</section>

	<ShortLinkManager {links} {transports} />
</main>

<style>
	/* `/admin/links`'s own measure, copied because a harness cannot import a
	   route's scoped styles. The rest of this page's paint comes from
	   `src/app.css`, which is the whole point: the portal shell is the room
	   this component ships in. */
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
	.app-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.6rem 1.2rem;
	}
	.dev-tag {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.75rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--cyan);
	}
</style>
