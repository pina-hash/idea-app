<script lang="ts">
	import Home from '../../+page.svelte';
	import { browser } from '$app/environment';
	import { INSTALL_HARNESS_DEVICES, type InstallHarnessDevice } from './install-devices';

	/**
	 * THE REAL HOME PAGE, mounted with harness data (see +page.ts).
	 *
	 * There is deliberately nothing here but the mount and a strip saying which
	 * case is on screen: the whole point is that the component under measurement
	 * is `src/routes/+page.svelte` itself, including its `managesAnySection`
	 * derivation, its snippets and its ordering branch. Anything reconstructed
	 * here would be a second implementation whose agreement with the page proves
	 * nothing.
	 */
	let { data } = $props();

	/**
	 * The real page's `data` is typed against its own server load, whose
	 * `claims` is a full decoded JWT. A harness has no JWT and needs none: the
	 * page reads `sub` and `email` off it and nothing else. Cast at the one
	 * boundary rather than fabricating six claim fields that would then read as
	 * meaningful.
	 */
	const homeData = $derived(data as unknown as Parameters<typeof Home>[1]['data']);

	/**
	 * THE INSTALL APP KEY'S DEVICES (ledger 0396). `?ua=` names a device from
	 * ./install-devices.ts and `?display=standalone` says the site is running
	 * installed. Neither can be emulated by this container's Chromium (a CDP
	 * `display-mode` emulation is accepted and does nothing, measured), and a
	 * route spec cannot set a user agent, so the browser's own answers are
	 * overridden HERE, in the harness's script, which runs during hydration
	 * before any component under it mounts and reads them. Nothing in the app
	 * is told it is in a harness: `$lib/install-app` reads `navigator` and
	 * `matchMedia` exactly as it does on a real phone.
	 */
	const params = browser ? new URLSearchParams(location.search) : null;
	const device = (params?.get('ua') ?? '') as InstallHarnessDevice | '';
	const standalone = params?.get('display') === 'standalone';
	if (browser) {
		const d = device ? INSTALL_HARNESS_DEVICES[device] : undefined;
		if (d) {
			Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => d.userAgent });
			Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => d.maxTouchPoints });
		}
		if (standalone) {
			const real = window.matchMedia.bind(window);
			window.matchMedia = (query: string) => {
				if (!/display-mode:\s*standalone/.test(query)) return real(query);
				const mql = real('(min-width: 0px)');
				return Object.defineProperties(mql, {
					matches: { value: true },
					media: { value: query }
				});
			};
		}
	}
</script>

<div class="harness-strip">
	role=<strong>{data.harness.role}</strong> &middot; classes=<strong>{data.harness.classes}</strong>
	&middot; rows/card=<strong>{data.harness.rows}</strong>
	&middot; admin=<strong>{data.harness.admin}</strong>
	{#if data.harness.due?.length}&middot; due=<strong>{data.harness.due.join(',')}</strong>{/if}
	{#if device}&middot; ua=<strong>{device}</strong>{/if}
	{#if standalone}&middot; display=<strong>standalone</strong>{/if}
	&middot; <a href="?role=student&classes=1&rows=3">student x1</a>
	&middot; <a href="?role=teacher&classes=4&rows=3">teacher x4</a>
	&middot; <a href="?role=teacher&classes=1&rows=3">teacher x1</a>
	&middot; <a href="?role=teacher&classes=1&rows=3&admin=1">all 11 cards</a>
	&middot; <a href="?role=student&classes=1&rows=4&due=-1,0,1,5">all 4 urgency steps</a>
</div>

<Home data={homeData} />

<style>
	.harness-strip {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 9999;
		background: #000;
		color: var(--dim);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		padding: 0.3rem 0.6rem;
		border-bottom: 1px solid var(--line);
	}
	.harness-strip strong {
		color: var(--cyan);
	}
	.harness-strip a {
		color: var(--gold);
	}
</style>
