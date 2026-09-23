<script lang="ts">
	/**
	 * `Pending` INSIDE THE NOTEBOOK ROOM (404 in production, no auth, no
	 * Supabase), on the site theme `?site=` names -- idea, matrix or
	 * space-white.
	 *
	 * WHY THE NOTEBOOK GETS ITS OWN ROUTE. This is the room with the record:
	 * `SaveIndicator`'s failed message arrived here at 3.65:1 and `VersionBadge`'s
	 * stamp at 3.20:1, both on plates they had never been measured on, and both
	 * had passed review in the room they were written for. `Pending` was written
	 * on the portal plate and mounted into three notebook surfaces in the same
	 * change, which is precisely the shape of those two.
	 *
	 * ONE ROOM PER PAGE NOW, AND THE THEME IS THE VARIABLE (ledger 0297,
	 * package F4a). This page used to render three `.nb-root` wrappers side by
	 * side, one per notebook PLATE, because a plate was an attribute on the
	 * wrapper. There are no plates any more: the room follows the SITE theme,
	 * which lives on `<html>` and cannot differ between two wrappers on one
	 * page, so the three readings are three loads (`?site=`), each the room
	 * inside a `.cr-root` exactly as the classroom mounts it. Every `Pending`
	 * sits on its own `--nb-surface` card, the ground it lands on in
	 * `ReviewConsole`, `DocumentationCheck` and `AdminLogPanel`.
	 */
	import { page } from '$app/state';
	import Pending from '$lib/Pending.svelte';
	import '$lib/classroom/classroom.css';
	import '$lib/notebook/notebook-theme.css';
	import { setSiteTheme } from '$lib/theme.svelte';
	import { SITE_THEMES, siteThemeAttr, type SiteTheme } from '$lib/theme';

	const siteParam = page.url.searchParams.get('site');
	const site: SiteTheme = SITE_THEMES.includes(siteParam as SiteTheme)
		? (siteParam as SiteTheme)
		: 'idea';
	$effect(() => {
		const el = document.documentElement;
		setSiteTheme(site);
		const attr = siteThemeAttr(site);
		if (!attr) {
			el.removeAttribute('data-theme');
			return;
		}
		const apply = () => el.setAttribute('data-theme', attr);
		apply();
		const t = setTimeout(apply, 0);
		return () => {
			clearTimeout(t);
			setSiteTheme('idea');
			el.removeAttribute('data-theme');
		};
	});
</script>

<svelte:head><title>dev · Pending in .nb-root</title></svelte:head>

<div class="cr-root">
	<div class="nb-root" data-testid="nb-room" data-site={site}>
		<div class="stage">
			<h2>{site}</h2>
			<section class="card">
				<Pending label="Loading the entry" />
			</section>
			<section class="card">
				<div class="narrow">
					<Pending label="Loading every earlier revision of this document" />
				</div>
			</section>
		</div>
	</div>
</div>

<style>
	.stage {
		padding: 1rem;
		display: grid;
		gap: 0.75rem;
		max-width: 70ch;
		margin: 0 auto;
	}
	h2 {
		font-size: 0.9rem;
		margin: 0;
	}
	.card {
		background: var(--nb-surface);
		border: 1px solid var(--nb-boundary);
		border-radius: var(--radius-md, 6px);
		padding: 1rem;
	}
	.narrow {
		width: 140px;
		border: 1px dashed var(--nb-hairline);
		padding: 0.4rem;
	}
</style>
