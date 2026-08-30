<script lang="ts">
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
</script>

<svelte:head>
	<title>dev · AnimatedLogo</title>
</svelte:head>

<main>
	<h1>// AnimatedLogo harness</h1>
	<p class="note">
		The gear should turn slowly behind the text plate. Under
		<code>prefers-reduced-motion: reduce</code> it must be perfectly still; the browser pass
		asserts that by emulating the media feature (see <code>motionSweep</code> in
		<code>tools/browser-verify/checks.mjs</code>) rather than by asking anyone to toggle an OS
		setting.
	</p>
	<p class="note">
		THIS PAGE IS THE PORTAL PLATE, WITH NO SCOPED ROOM, which is what
		<code>/</code>, <code>/admin</code> and <code>/admin/links</code> give the emblem. The other
		rooms it ships in are a SEPARATE route,
		<a href="/dev/animated-logo-room">/dev/animated-logo-room</a> -- they cannot share a page,
		because <code>classroom.css</code> repaints the canvas through
		<code>body:has(.cr-root)</code> and a room section here would take the plate out from under
		this one. Measured: the note copy's ground moved from rgb(18, 26, 18) to rgb(10, 12, 11) and
		its ratio from 5.31:1 to 5.87:1 the moment a <code>.cr-root</code> wrapper was added to this
		page.
	</p>

	<section>
		<h2>Header scale (width 104, as wired into the portal headers)</h2>
		<div class="header-sim">
			<AnimatedLogo width={104} />
			<span class="fill"></span>
		</div>
	</section>

	<section>
		<h2>Hero scale (auth error page)</h2>
		<AnimatedLogo width="clamp(220px, 60vw, 420px)" />
	</section>

	<section>
		<h2>Spin off (static fallback)</h2>
		<AnimatedLogo width={260} spin={false} />
	</section>

	<section>
		<h2>Fast spin (duration 4s)</h2>
		<AnimatedLogo width={260} duration={4} />
	</section>
</main>

<style>
	main {
		max-width: 900px;
		margin: 0 auto;
		padding: 2rem;
		font-family: var(--font-body, 'Rajdhani', sans-serif);
		color: var(--white);
	}
	h1 {
		color: var(--green);
		text-shadow: var(--glow-green);
	}
	h2 {
		font-family: var(--font-data, 'Share Tech Mono', monospace);
		font-size: 0.85rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--dim);
		margin-bottom: 0.75rem;
	}
	.note {
		color: var(--dim);
	}
	section {
		margin: 2.5rem 0;
		padding-top: 1.5rem;
		border-top: 1px solid var(--line);
	}
	.header-sim {
		display: flex;
		align-items: center;
		min-height: 64px;
		padding: 0 2rem;
		background: rgba(19, 26, 19, 0.88);
		border: 1px solid rgba(143, 224, 138, 0.15);
		border-radius: 4px;
	}
	.header-sim .fill {
		flex: 1;
	}
	code {
		font-family: var(--font-data, 'Share Tech Mono', monospace);
		color: var(--cyan);
	}
</style>
