<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import { version as buildId } from '$app/environment';
	import { deploy } from 'virtual:site-versions';
	import { onMount } from 'svelte';
	import '@fontsource/rajdhani/300.css';
	import '@fontsource/rajdhani/400.css';
	import '@fontsource/rajdhani/500.css';
	import '@fontsource/rajdhani/600.css';
	import '@fontsource/rajdhani/700.css';
	import '@fontsource/share-tech-mono/400.css';
	// Orbitron powers the landing page's original IDEA aesthetic (display type) and
	// the GAUNTLET Speedrun race timer (500 for centiseconds, 700 for mm:ss).
	import '@fontsource/orbitron/400.css';
	import '@fontsource/orbitron/500.css';
	import '@fontsource/orbitron/600.css';
	import '@fontsource/orbitron/700.css';
	import '@fontsource/orbitron/900.css';
	import '../app.css';
	import InstallPrompt from '$lib/InstallPrompt.svelte';
	import PathwayPicker from '$lib/PathwayPicker.svelte';
	import SiteFeedback from '$lib/feedback/SiteFeedback.svelte';
	import { feedbackIsAnonymous, feedbackWriter } from '$lib/feedback/feedback';
	import { describeBuild } from '$lib/feedback/context';

	let { data, children } = $props();
	let { claims, supabase } = $derived(data);

	/**
	 * EVERY SURFACE REPORTS ITS OWN DEFECTS, and this is the only mount that
	 * makes that true. There are no layout resets anywhere in src/routes, so
	 * this layout wraps every page route: a route added next month INHERITS the
	 * affordance instead of having to remember it. Mounting it per page is the
	 * rejected alternative, and tests/feedback-coverage.test.ts reddens if it
	 * moves back to one.
	 *
	 * Exclusions are the component's own business (a projected deck, the
	 * GAUNTLET viewport, the GREENLINE race, an error page), read from the
	 * registry in $lib/feedback/context.ts BY CATEGORY rather than by page.
	 *
	 * THE BUILD IDENTIFIER IS THE HONEST PROBLEM. Both candidates go to
	 * `describeBuild`, which picks one and records WHAT IT IS: `deploy.sha` is
	 * the git commit this deployment was built FROM, and `version` is
	 * SvelteKit's build id, which is a timestamp. Neither is a function of the
	 * built artifact, so the row says so in words rather than presenting a
	 * plausible value as more than it is.
	 */
	const build = describeBuild(deploy, buildId);
	/**
	 * ONE WRITER, TWO PATHS, AND THE SHELL PICKS NEITHER. `feedbackWriter` hands
	 * a signed-in caller the direct RLS-scoped insert and a signed-out one the
	 * anonymous route; both come back as the same `(entry) => Promise<result>`,
	 * so nothing here branches. What the layout DOES say is which kind of report
	 * this will be, because that changes what the person is told and whether
	 * they are offered a way to be reached.
	 */
	const submitFeedback = $derived(feedbackWriter(supabase, claims?.sub));
	const anonymousReport = $derived(feedbackIsAnonymous(supabase, claims?.sub));

	onMount(() => {
		const { data: authData } = supabase.auth.onAuthStateChange((_, newSession) => {
			if (newSession?.expires_at !== claims?.exp) {
				invalidate('supabase:auth');
			}
		});

		return () => authData.subscription.unsubscribe();
	});
</script>

<div class="bg-fx" aria-hidden="true"></div>
{@render children()}
<!-- First-login pathway picker: renders only for a signed-in student with no
     pathway set (self-contained, reads page data like ProfileMenu). -->
<PathwayPicker />
<InstallPrompt />
<SiteFeedback
	routeId={page.route.id}
	pathname={page.url.pathname}
	role={data.userProfile?.role ?? null}
	sectionId={page.params.sectionId ?? null}
	{build}
	submit={submitFeedback}
	anonymous={anonymousReport}
	status={page.error ? page.status : null}
	errorMessage={page.error?.message ?? null}
/>
