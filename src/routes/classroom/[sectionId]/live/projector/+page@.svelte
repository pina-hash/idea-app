<script lang="ts">
	import ProjectorView from '$lib/classroom/live-class/ProjectorView.svelte';
	import type { PageData } from './$types';

	/**
	 * THE CLASS PROJECTOR VIEW, RESET TO THE ROOT LAYOUT.
	 *
	 * `@` is the one layout reset in the app, and it resets to ROOT on purpose:
	 * the root layout still wraps this page, so the theme (Space White applies
	 * under /classroom), deploy safety and the navigation indicator are all
	 * inherited exactly as every other page inherits them. What it drops is the
	 * classroom's masthead, trail and tabs -- chrome the class should not see on
	 * the wall -- and, as important, the two classroom layout LOADS, which carry a
	 * manager's private payload this page must never hold.
	 *
	 * THE FEEDBACK BUTTON IS THE ROOT LAYOUT'S CORNER BUTTON, as on every page
	 * (ledger 0396). The view keeps it at the right end of its own strip, fades
	 * it with the strip, and in full screen it is not drawn: the full-screen
	 * element is the wall (see ProjectorView).
	 */
	let { data }: { data: PageData } = $props();
</script>

<ProjectorView classLabel={data.classLabel} viewer={data.claims?.sub ?? 'signed-out'} sectionId={data.sectionId} />
