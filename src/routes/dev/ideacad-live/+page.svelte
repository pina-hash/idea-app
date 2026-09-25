<!--
  LIVE SYNC WITHOUT A REFRESH, TWO WINDOWS ON ONE PAGE (feedback R34). Dev only.

  Two REAL `SolidWorkspace`s, each with its own kernel worker, open one document
  held by an in-memory server (`fixture.ts`) that applies the save RPC's own
  rules, and share one in-memory broadcast bus. Ana is window A, Ben is window
  B. An edit saved in A reaches B without a reload; an edit made in B while A
  saves something newer is kept, and B is told in words.

  `?refused=1` refuses B's channel, so B runs on the database poll alone and
  says "Live unavailable". `?hold=1` starts with B's saves failing on the wire,
  which keeps B dirty on purpose. Both are also switchable from the page.
  `?side=1` puts the two windows side by side above 1024px; by default they
  stack, each as wide as the page, which is the real route's geometry.

  Each workspace's dev hook is captured as it mounts (`window.__icA`,
  `window.__icB`): the hook is one global name, so B is mounted only once A's
  is safely copied. `window.__icLive` is the server's log and switches.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import SolidWorkspace from '$lib/ideacad/solid/SolidWorkspace.svelte';
	import type { SolidDocument } from '$lib/ideacad/solid/types';
	import { createLiveServer } from './fixture';

	const ANA = 'ana.reyes@boscotech.net', BEN = 'ben.ortiz@boscotech.net';
	const params = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
	const server = createLiveServer();
	let hold = $state(params.get('hold') === '1');
	const refused = params.get('refused') === '1', side = params.get('side') === '1';
	const transportA = server.transportFor(ANA, () => false), transportB = server.transportFor(BEN, () => hold);
	const liveA = server.liveFor(ANA), liveB = server.liveFor(BEN, { refused });
	let docA = $state.raw<SolidDocument | null>(null), docB = $state.raw<SolidDocument | null>(null);

	type Hook = Record<string, unknown>;
	const hooks = () => window as unknown as { ideaCadSolid?: Hook; __icA?: Hook; __icB?: Hook; __icLive?: unknown };
	function capture(name: '__icA' | '__icB', then?: () => void) {
		const w = hooks();
		if (w.ideaCadSolid) { w[name] = w.ideaCadSolid; delete w.ideaCadSolid; then?.(); return; }
		setTimeout(() => capture(name, then), 30);
	}
	onMount(() => {
		hooks().__icLive = { log: server.log, get revision() { return server.revision; }, setHold: (v: boolean) => { hold = v; } };
		void transportA.open(server.snapshotDocument().id).then((d) => {
			docA = d;
			capture('__icA', () => void transportB.open(d.id).then((b) => { docB = b; capture('__icB'); }));
		});
	});
</script>

<svelte:head><title>IdeaCAD live sync · Development</title></svelte:head>
<div class="live-harness" data-testid="live-harness">
	<header class="lh-bar">
		<h1>Live sync: two windows, one model</h1>
		<label class="lh-hold"><input type="checkbox" bind:checked={hold} data-testid="live-hold" /> Hold Ben's saves (keeps window B unsaved)</label>
		{#if refused}<span class="lh-flag">Window B's live channel is refused</span>{/if}
	</header>
	<div class="lh-panes" class:side>
		<section class="lh-pane" aria-label="Window A, Ana Reyes" data-testid="live-pane-a">
			<p class="lh-who">A · Ana Reyes</p>
			<div class="lh-frame">{#if docA}<SolidWorkspace document={docA} transport={transportA} live={liveA} dev onback={() => {}} />{/if}</div>
		</section>
		<section class="lh-pane" aria-label="Window B, Ben Ortiz" data-testid="live-pane-b">
			<p class="lh-who">B · Ben Ortiz</p>
			<div class="lh-frame">{#if docB}<SolidWorkspace document={docB} transport={transportB} live={liveB} dev onback={() => {}} />{/if}</div>
		</section>
	</div>
</div>

<style>
	:global(body:has(.live-harness)) { margin: 0; background: #15191d; }
	.live-harness { position: relative; z-index: 1; min-height: 100vh; background: #15191d; color: #e6e9ec; font-family: Rajdhani, sans-serif; }
	.lh-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 20px; padding: 8px 16px; border-bottom: 1px solid #3a444c; }
	.lh-bar h1 { margin: 0; font-size: 20px; }
	.lh-hold { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; font-size: 16px; cursor: pointer; }
	.lh-hold input { width: 22px; height: 22px; }
	.lh-flag { font: 13px 'Share Tech Mono', monospace; color: #e8b04b; }
	.lh-panes { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; padding: 8px; }
	.lh-pane { min-width: 0; display: flex; flex-direction: column; }
	.lh-who { margin: 0 0 4px; font: 14px 'Share Tech Mono', monospace; color: #b8c2ca; }
	/* EACH WINDOW TAKES THE PAGE'S WIDTH AND THE PAGE SCROLLS BETWEEN THEM, at every width, because that is the geometry of
	   the real route (the workspace fills the window). Side by side at 1440 each window was 712px wide, so every desktop
	   reading was a reading of a 712px window, where the top bar has no room for the save indicator at all. `?side=1`
	   puts them side by side for a person watching the loop; the specs never use it. */
	.lh-frame { position: relative; height: 88vh; min-height: 520px; border: 1px solid #3a444c; }
	@media (min-width: 1024px) {
		.lh-panes.side { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.lh-panes.side .lh-frame { height: calc(100vh - 110px); }
	}
</style>
