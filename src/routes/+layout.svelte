<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import { dev, version as buildId } from '$app/environment';
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
	import NavigationProgress from '$lib/NavigationProgress.svelte';
	import DeployWatch from '$lib/shell/DeployWatch.svelte';
	import ThemeRoot from '$lib/design-system/themes/ThemeRoot.svelte';
	import TabIcon from '$lib/tab-icon/TabIcon.svelte';
	import { feedbackIsAnonymous, feedbackWriter } from '$lib/feedback/feedback';
	import { describeBuild, feedbackWearsClassroomPlate, isFeedbackEmbedRoute } from '$lib/feedback/context';
	import { CLASSROOM_PLATE } from '$lib/classroom/plate';
	import { embedDevTransports } from '$lib/feedback/embed-dev-sink';
	import { sitePlateClass } from '$lib/shell/site-plate';
	import '$lib/classroom/plate.css';
	import '$lib/shell/site-plate.css';

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
	 * ITS BUTTON IS IN THE SAME CORNER ON EVERY PAGE (ledger 0396): the
	 * classroom, the notebook, Armory, GAUNTLET, an error page and the rest. The
	 * few rooms that keep their own control (GREENLINE, VANGUARD) are the
	 * component's own business, read from the registry in
	 * $lib/feedback/context.ts BY CATEGORY rather than by page.
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
	/**
	 * THE HARNESS SINK, AND ONLY IN DEV (ledger 0396). `?feedbackSink=memory` on
	 * a page's first load files the root window's reports through the same
	 * recorder `/feedback/embed?sink=memory` uses -- the REAL `submitFeedback`
	 * against a client that only records its insert, as a stand-in account, with
	 * a screenshot transport -- so a browser pass can put a report from the home
	 * page, from GAUNTLET and from the Coin Ledger's frame side by side and
	 * compare the rows rather than assert them. `dev` is a build-time constant,
	 * so a production build carries no branch that reads the parameter.
	 */
	const devSink =
		dev && page.url.searchParams.get('feedbackSink') === 'memory' ? embedDevTransports() : null;
	/**
	 * THE SITE PLATE (ledger 0346), decided from the path alone so the server
	 * renders the same answer the client does and nothing flashes. On an
	 * in-scope route the page and its root-mounted siblings sit inside one
	 * `display: contents` element carrying the class, which is the `@scope`
	 * root `$lib/classroom/plate.css` paints from; on every other route there
	 * is no wrapper at all, so a left-out product's DOM is unchanged. The
	 * stylesheet is imported here because the site's pages do not load the
	 * classroom's room; nothing in it matches without one of its two classes.
	 */
	const plate = $derived(sitePlateClass(page.url.pathname, !!page.error));
	/**
	 * A WINDOW INSIDE ANOTHER PAGE (ledger 0396). `/feedback/embed` is the
	 * official feedback window drawn in a transparent frame over a legacy page
	 * that renders no layout (the Coin Ledger, an assignment handout). Anything
	 * this layout floats over a page would be drawn over THAT page from inside
	 * the frame: the scan-line background, the pathway sheet, the install
	 * prompt. So the window's own route takes none of them. Its floating
	 * feedback button is the exclusion registry's business, like every other
	 * surface's (`$lib/feedback/context.ts`, the `embed` rule).
	 */
	const bare = $derived(isFeedbackEmbedRoute(page.route.id));
	/**
	 * THE CORNER BUTTON WEARS THE ROOM'S PLATE (ledger 0396). On a site-plate
	 * page it sits inside the plate wrapper above; a classroom page wears the
	 * plate on its own `.cr-root`, which the root mount is a sibling of, so the
	 * window is wrapped in the same class here and draws the same key and the
	 * same box the home page does, in the same theme. Production decides it
	 * from the route; a `/dev` harness that draws a `.cr-plate` room is
	 * recognised once it has mounted, so the harness measures what production
	 * draws.
	 */
	let devPlated = $state(false);
	const feedbackPlate = $derived(
		!!CLASSROOM_PLATE &&
			!plate &&
			(feedbackWearsClassroomPlate(page.route.id, !!page.error) || devPlated)
	);
	$effect(() => {
		if (!dev || !CLASSROOM_PLATE) return;
		// One tracked read: the path. The DOM is read after the page has mounted,
		// and watched for a moment, because a harness may draw its room only
		// once its fixture has loaded.
		const path = page.url.pathname;
		if (!path.startsWith('/dev/')) {
			devPlated = false;
			return;
		}
		const look = () =>
			!!document.querySelector(`.${CLASSROOM_PLATE}:not([data-feedback-plate])`);
		devPlated = look();
		if (devPlated) return;
		const watch = new MutationObserver(() => {
			if (!look()) return;
			devPlated = true;
			watch.disconnect();
		});
		watch.observe(document.body, { childList: true, subtree: true });
		const stop = setTimeout(() => watch.disconnect(), 5000);
		return () => {
			clearTimeout(stop);
			watch.disconnect();
		};
	});

	onMount(() => {
		const { data: authData } = supabase.auth.onAuthStateChange((_, newSession) => {
			if (newSession?.expires_at !== claims?.exp) {
				invalidate('supabase:auth');
			}
		});

		return () => authData.subscription.unsubscribe();
	});
</script>

{#if !bare}<div class="bg-fx" aria-hidden="true"></div>{/if}
<!-- THE ONE ROUTE-TRANSITION INDICATOR. Mounted here for the reason SiteFeedback
     is: there are no layout resets in src/routes, so every page route inherits
     it rather than having to remember one. It reads `navigating` from
     `$app/state` and draws nothing until a navigation has been in flight for
     NAV_INDICATOR_DELAY_MS, so an instant click stays silent. -->
<NavigationProgress />
<!-- DEPLOY SAFETY, mounted once here beside the indicator and for the same
     reason: every page route inherits it. It renders nothing, and it takes a new
     version of the site only at a navigation the person made, never under an idle,
     fullscreen or projected page; see $lib/shell/deploy-safety. -->
<DeployWatch />
<!-- THE SITE THEME, written onto <html> and nowhere else. Mounted here for the
     reason the two above it are: there are no layout resets in src/routes, so
     every page route inherits it. It renders nothing; see the component. -->
<ThemeRoot />
<TabIcon />
{#snippet site()}
	{@render children()}
	{#if !bare}
		<!-- First-login pathway picker: renders only for a signed-in student with no
		     pathway set (self-contained, reads page data like ProfileMenu). -->
		<PathwayPicker />
		<InstallPrompt />
	{/if}
	<!-- VOICE HAS NO FLOATING CONTROL (ledger 0298, report 31). It is the Speak
	     button inside the classroom's command palette (Ctrl K), whose vocabulary is
	     the palette's own rows; see $lib/voice/commands.ts. -->
	{#if feedbackPlate}
		<div class={CLASSROOM_PLATE} style="display: contents" data-feedback-plate>
			{@render feedback()}
		</div>
	{:else}
		{@render feedback()}
	{/if}
{/snippet}
{#snippet feedback()}
	<SiteFeedback
		routeId={page.route.id}
		pathname={page.url.pathname}
		role={data.userProfile?.role ?? null}
		sectionId={page.params.sectionId ?? null}
		{build}
		submit={devSink ? devSink.submit : submitFeedback}
		anonymous={devSink ? false : anonymousReport}
		uploadScreenshot={devSink ? devSink.uploadScreenshot : null}
		status={page.error ? page.status : null}
		errorMessage={page.error?.message ?? null}
		errorId={page.error?.id ?? null}
	/>
{/snippet}
{#if plate}
	<div class={plate} style="display: contents">{@render site()}</div>
{:else}
	{@render site()}
{/if}
