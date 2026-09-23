<script lang="ts">
	import { onMount } from 'svelte';
	import { dev } from '$app/environment';
	import { onNavigate } from '$app/navigation';
	import { updated } from '$app/state';
	import {
		DEPLOY_RELOAD_FALLBACK_MS,
		activeDeployHolds,
		deployHoldsWarnOnUnload,
		deployReloadVerdict,
		onDeployHoldsChange,
		registerVersionCheck,
		requestVersionCheck,
		resumedNavigation
	} from '$lib/shell/deploy-safety';

	/**
	 * TAKES A NEW VERSION OF THE SITE ONLY WHEN THE PERSON NAVIGATES, mounted
	 * ONCE in the root layout beside `NavigationProgress`, for the same reason:
	 * there are no layout resets in `src/routes`, so every route inherits it.
	 * It renders nothing. Every rule it applies is `deployReloadVerdict`'s, in
	 * `$lib/shell/deploy-safety`, which says why each one exists.
	 *
	 * WHY `onNavigate` AND NOT `beforeNavigate`. Measured in this repo's
	 * Chromium and read in kit 2.66's client: every `beforeNavigate` callback
	 * runs in insertion order, and the order between the root layout's and a
	 * page's FLIPS within one session, so nothing may depend on running first.
	 * Worse, the documented recipe -- assigning `location.href` from
	 * `beforeNavigate` -- fires `beforeunload` synchronously, which re-runs
	 * every guard as a `leave` and turns the save guard's flush-then-navigate
	 * into the browser's native Leave dialog. `onNavigate` runs only for a
	 * navigation NO guard cancelled (so after the save guard's flush and its
	 * re-issued `goto`), after the target's load, after the URL has already
	 * moved to the target, and while SvelteKit is mid-navigation, so its own
	 * `beforeunload` does not re-run the guards. So the upgrade is
	 * `location.reload()` -- the address is already the target -- and the
	 * returned promise holds the in-app navigation back while the page unloads,
	 * giving it back after `DEPLOY_RELOAD_FALLBACK_MS` if the unload is
	 * cancelled, so a click never hangs.
	 *
	 * WHAT MAKES `updated` TRUE. SvelteKit polls `version.json` on
	 * `kit.version.pollInterval` (svelte.config.js), and this asks again the
	 * moment a tab comes back into view or the network comes back, throttled,
	 * and unthrottled when Vite reports a chunk that failed to preload. None of
	 * those reloads anything; they only set the flag the next navigation reads.
	 * `vite:preloadError` is never `preventDefault`ed: that would make the
	 * failed `import()` resolve to `undefined` instead of throwing, which is a
	 * broken page that no longer says it is broken.
	 *
	 * IN DEV `updated.check()` IS HARD-WIRED FALSE (kit's own dev branch), so
	 * nothing here ever fires on a dev server by itself; `/dev/deploy-safety`
	 * flips the flag through the same state module the app reads.
	 */

	onNavigate((nav) => {
		const toPath = nav.to?.url.pathname ?? null;
		const verdict = deployReloadVerdict({
			updated: updated.current,
			type: nav.type,
			fromPath: nav.from?.url.pathname ?? null,
			toPath,
			fromRouteId: nav.from?.route.id ?? null,
			fullscreen: fullscreenElement() !== null,
			holds: activeDeployHolds(),
			resumed: nav.type === 'goto' && resumedNavigation(toPath)
		});
		if (dev) {
			// THE HARNESS'S WINDOW ONTO THE DECISION, dev builds only: which rule
			// answered, so a spec can assert WHY a navigation did or did not
			// reload rather than only that it did not.
			window.dispatchEvent(
				new CustomEvent('idea:deploy-verdict', {
					detail: { ...verdict, type: nav.type, from: nav.from?.url.pathname, to: toPath }
				})
			);
		}
		if (!verdict.reload) return;
		location.reload();
		return new Promise<void>((resolve) => setTimeout(resolve, DEPLOY_RELOAD_FALLBACK_MS));
	});

	/** Native fullscreen, including the prefixed spelling older iPad Safari uses. */
	function fullscreenElement(): Element | null {
		return (
			document.fullscreenElement ??
			(document as Document & { webkitFullscreenElement?: Element | null })
				.webkitFullscreenElement ??
			null
		);
	}

	onMount(() => {
		const unregister = registerVersionCheck(() => updated.check());

		const onVisibility = () => {
			if (document.visibilityState === 'visible') requestVersionCheck();
		};
		const onOnline = () => requestVersionCheck();
		const onPreloadError = () => requestVersionCheck({ force: true });

		/**
		 * THE LAST QUESTION BEFORE WORK NOBODY CAN RE-CREATE IS LOST. Attached
		 * only while a hold that asks for it exists, because a `beforeunload`
		 * listener costs a page its back/forward cache in some browsers and a
		 * question on every tab close is one nobody reads. It is what stops
		 * SvelteKit's own native reload after a failed chunk -- which nothing can
		 * veto -- from discarding an unsaved post or a file in flight without a
		 * word. `DeployWatch`'s own reload never meets it: that reload happens
		 * only when nothing is held.
		 */
		let guarding = false;
		const onBeforeUnload = (event: BeforeUnloadEvent) => {
			if (!deployHoldsWarnOnUnload()) return;
			event.preventDefault();
			event.returnValue = '';
		};
		const syncUnloadGuard = () => {
			const want = deployHoldsWarnOnUnload();
			if (want === guarding) return;
			guarding = want;
			if (want) window.addEventListener('beforeunload', onBeforeUnload);
			else window.removeEventListener('beforeunload', onBeforeUnload);
		};
		const unsubscribe = onDeployHoldsChange(syncUnloadGuard);
		syncUnloadGuard();

		document.addEventListener('visibilitychange', onVisibility);
		window.addEventListener('online', onOnline);
		window.addEventListener('vite:preloadError', onPreloadError);
		return () => {
			unregister();
			unsubscribe();
			document.removeEventListener('visibilitychange', onVisibility);
			window.removeEventListener('online', onOnline);
			window.removeEventListener('vite:preloadError', onPreloadError);
			window.removeEventListener('beforeunload', onBeforeUnload);
		};
	});
</script>
