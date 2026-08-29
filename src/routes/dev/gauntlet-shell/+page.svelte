<script lang="ts">
	import '$lib/gauntlet/viewport/viewport.css';
	import ViewportBackground from '$lib/gauntlet/viewport/ViewportBackground.svelte';
	import CursorLayer from '$lib/gauntlet/viewport/CursorLayer.svelte';
	import FeatureTreeNav from '$lib/gauntlet/viewport/FeatureTreeNav.svelte';
	import TrademarkFooter from '$lib/gauntlet/viewport/TrademarkFooter.svelte';
	import CountdownOverlay from '$lib/gauntlet/viewport/CountdownOverlay.svelte';

	/**
	 * Dev-only harness for the VIEWPORT chrome the GAUNTLET layout mounts on
	 * EVERY page: the trademark footer, the FeatureManager rail, the CAD cursor
	 * layer, and the room-start countdown. None of the four was reachable from
	 * any dev route, so none had ever been measured, and three of them are on
	 * screen for every student in every mode.
	 *
	 * THE WRAPPER IS THE REAL ONE, ARRANGED THE WAY THE REAL LAYOUT ARRANGES IT
	 * (`src/routes/gauntlet/+layout.svelte`): `.gt-root` > ViewportBackground,
	 * the vignette, CursorLayer, FeatureTreeNav, then `.gt-content` holding the
	 * page and TrademarkFooter. Every one of these components reads tokens off
	 * `.gt-root` and two of them position against it, so a harness that mounted
	 * them bare would measure colours and geometry that exist nowhere.
	 *
	 * WHAT IS DELIBERATELY NOT COPIED from the layout: SiteFeedback and
	 * VersionBadge, which are portal components already driven elsewhere and
	 * would need a session; and `entranceSweep`, whose staggered opacity would
	 * put every measurement below on a moving target for no gain here.
	 *
	 * The countdown starts INACTIVE, which is its state on every page that is
	 * not mid-room-start, and renders nothing at all in that state. The button
	 * arms it for the `?countdown=1` variant.
	 */
	let countdown = $state(false);
	let doneCount = $state(0);
</script>

<svelte:head><title>GAUNTLET viewport chrome harness</title></svelte:head>

<div class="gt-root">
	<ViewportBackground />
	<div class="gt-vignette" aria-hidden="true"></div>
	<CursorLayer />
	<FeatureTreeNav />
	<div class="gt-content">
		<main class="gauntlet harness">
			<h1>VIEWPORT chrome harness</h1>
			<p class="note">
				The four pieces the GAUNTLET layout mounts on every page. The FeatureManager rail must be
				COLLAPSED on arrival (GAUNTLET-DESIGN: hidden by default) and is display:none below 1440px,
				so its reveal tab is hidden there too. The cursor layer must never take a pointer event and
				must not hide the native cursor until its first real mousemove has seeded a position.
			</p>

			<div class="bar">
				<button
					type="button"
					data-drive="countdown"
					onclick={() => {
						doneCount = 0;
						countdown = true;
					}}>arm the countdown</button
				>
				<button type="button" data-drive="countdown-off" onclick={() => (countdown = false)}
					>clear it</button
				>
				<span class="readout" data-testid="countdown-done">onDone fired: {doneCount}</span>
			</div>

			<p class="note">
				A control below the countdown, here so the overlay's pointer-events can be hit-tested
				against something it covers rather than against empty page.
			</p>
			<button class="under" type="button" data-testid="under-overlay">covered control</button>
		</main>
		<TrademarkFooter />
	</div>
	<CountdownOverlay
		active={countdown}
		onDone={() => {
			doneCount += 1;
			countdown = false;
		}}
	/>
</div>

<style>
	.harness {
		max-width: 760px;
		margin: 0 auto;
		padding: 2rem 1.5rem 1rem;
	}
	h1 {
		font-family: var(--font-head, sans-serif);
		margin: 0 0 0.6rem;
	}
	.note {
		color: var(--ice);
		max-width: 60ch;
		line-height: 1.6;
	}
	.bar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		align-items: center;
		margin: 1.2rem 0;
	}
	.bar button,
	.under {
		font-family: var(--font-mono, monospace);
		min-height: 44px;
		padding: 0 1rem;
		background: var(--bg2);
		color: var(--white);
		border: 1px solid var(--line-strong);
		border-radius: 3px;
		cursor: pointer;
	}
	.readout {
		font-family: var(--font-mono, monospace);
		font-size: 0.8rem;
		color: var(--ice);
	}
</style>
