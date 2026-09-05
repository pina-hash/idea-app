<script lang="ts">
	/**
	 * Dev harness for every app mark in `$lib/marks` and the FRC icon beside
	 * them (404 in production, no auth, no Supabase).
	 *
	 * WHY IT EXISTS. Every one of these glyphs sits on a launcher card on the
	 * portal home page, which is the first screen a student sees, and until this
	 * route none of them was mounted in any dev route at all -- so the one rule
	 * they all have to satisfy had never been measured on any of them. That rule
	 * is CLAUDE.md's, under the launcher-card section: "Every other app mark is a
	 * component in `$lib/marks` with a 3-4.6s loop gated behind
	 * `prefers-reduced-motion: no-preference`, and nothing is hidden in a base
	 * state: with the animation cancelled every animated element is at full
	 * opacity and no transform, so a reduced-motion reader sees the whole glyph."
	 * Two further passages say the looser half of it ("Everything animated is
	 * gated behind `prefers-reduced-motion`") and the FRC exception ("THE FRC
	 * MARK IS NEVER ANIMATED ... FIRST's brand guidelines prohibit altering the
	 * mark, and motion is an alteration").
	 *
	 * THE ROSTER IS GLOBBED, NEVER LISTED, AND THAT IS THIS ROUTE'S OWN BUG
	 * FIXED. It carried a hand-written array of ELEVEN marks while `$lib/marks`
	 * held twelve: `MapsMark` landed in `ca5d950`, which touched neither this
	 * file nor the spec, so the twelfth glyph was mounted by nothing and swept by
	 * nothing while the spec went on reporting success. See `mark-roster.js` for
	 * the full argument and for the one implementation of a mark's id. A mark
	 * added tomorrow appears here because the glob found its FILE, not because
	 * somebody remembered this line.
	 *
	 * THE REAL COMPONENTS, NEVER A COPY. Each cell mounts the shipping component
	 * -- the same module `AppLauncher` imports -- so a keyframe added there is
	 * measured here without anyone remembering to mirror it. The FRC cell is the
	 * same `<img>` off the same asset, because the rule about it is a rule about
	 * that image, and it is the one cell still written by hand: it is not a
	 * component in `$lib/marks` and must never become one.
	 *
	 * ONE ROUTE, NOT TWELVE, AND THAT IS A RUNTIME DECISION. The browser pass is
	 * around fifty route/width runs and a pass nobody waits for is a pass nobody
	 * runs; a route per mark would cost two more runs each for measurements that
	 * share one page load. `data-mark` is what keeps the reporting per-mark
	 * anyway: the spec derives one selector per glyph, so a failure says WHICH
	 * mark, and the check's own rows say which ELEMENT inside it.
	 *
	 * NO ROOM WRAPPER, DELIBERATELY. `AppLauncher` mounts on the portal home
	 * page, which carries no scoped theme, so this harness carries none either
	 * -- the marks read `currentColor` and `var(--gold)`, and both resolve
	 * differently inside `.gt-root` or `.nb-root`. A harness in the wrong room
	 * measures the wrong plate (see `/dev/pathways` for the mirror of this).
	 */
	import type { Component } from 'svelte';
	import { markRoster } from './mark-roster.js';
	import frcIcon from '$lib/frc/assets/frc-icon.png';

	/*
	 * EAGER, because the cells are mounted synchronously and a lazy glob hands
	 * back loader functions instead of modules. The pattern is RELATIVE rather
	 * than `$lib/...`: `import.meta.glob` resolves its pattern against this
	 * file, and a relative one cannot depend on an alias staying configured.
	 */
	const modules = import.meta.glob('../../../lib/marks/*Mark.svelte', {
		eager: true
	}) as Record<string, { default: Component }>;

	/**
	 * Every mark in `$lib/marks`, sorted by filename, with the module beside the
	 * id `mark-roster.js` derived for it. The lookup is keyed on the BASENAME so
	 * the roster helper (which both this page and the Node spec call) never has
	 * to know how Vite spells a glob key.
	 */
	const byFile = new Map(
		Object.entries(modules).map(([path, mod]) => [path.split('/').pop() as string, mod])
	);
	const MARKS = markRoster([...byFile.keys()]).map((m) => ({
		...m,
		Mark: (byFile.get(m.file) as { default: Component }).default
	}));
</script>

<svelte:head><title>dev // app marks</title></svelte:head>

<main class="harness">
	<h1>// App marks harness</h1>
	<p class="note">
		All {MARKS.length} glyphs in <code>$lib/marks</code> and the FRC icon beside them, at the launcher's own
		34px icon size and at 96px for reading. Each loop is gated behind
		<code>prefers-reduced-motion: no-preference</code>; with the animation cancelled every animated
		element must still be painted, at its resting opacity, and carry no transform. The FRC mark is
		never animated in either state.
	</p>

	<div class="grid">
		{#each MARKS as m (m.id)}
			<figure class="cell" data-mark={m.id}>
				<div class="stage">
					<span class="icon lg"><m.Mark /></span>
					<span class="icon sm"><m.Mark /></span>
				</div>
				<figcaption>{m.name}</figcaption>
			</figure>
		{/each}

		<!-- The official FIRST icon, unmodified, exactly as AppLauncher mounts it:
		     intrinsic dimensions set so width follows the aspect and nothing is
		     cropped or stretched. It is an <img> and not a component because the
		     mark may not be redrawn, and it does not move because motion is an
		     alteration under FIRST's guidelines. -->
		<figure class="cell frc" data-mark="frc">
			<div class="stage">
				<span class="icon lg"
					><img src={frcIcon} width="516" height="309" alt="FIRST Robotics Competition" /></span
				>
				<span class="icon sm"
					><img src={frcIcon} width="516" height="309" alt="FIRST Robotics Competition" /></span
				>
			</div>
			<figcaption>FRC <span class="never">never animated</span></figcaption>
		</figure>
	</div>
</main>

<style>
	.harness {
		max-width: 1100px;
		margin: 0 auto;
		padding: 2rem 1.2rem 3rem;
		font-family: var(--font-display, 'Rajdhani', sans-serif);
		color: var(--white);
	}
	h1 {
		color: var(--green);
	}
	.note {
		color: var(--text-2);
		max-width: 60ch;
		line-height: 1.5;
	}
	code {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		color: var(--cyan);
	}
	/* `auto-fit` with a `min()` floor, so two marks get two columns rather than
	   two and a void, and the same rule is the single narrow column at 375px
	   with no breakpoint of its own (CLAUDE.md). */
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(15rem, 100%), 1fr));
		gap: 1rem;
		margin-top: 2rem;
	}
	.cell {
		margin: 0;
		padding: 1rem;
		background: var(--bg1);
		border: 1px solid var(--boundary);
		border-radius: 6px;
		/* The launcher paints the glyph in the card's accent; this harness has no
		   per-app accent to quote, so every mark reads the portal green through
		   `currentColor` and the gold token stays whatever `:root` says. */
		color: var(--green);
	}
	.stage {
		display: flex;
		align-items: center;
		gap: 1rem;
		min-height: 96px;
	}
	.icon.lg {
		width: 96px;
		height: 96px;
		flex-shrink: 0;
	}
	/* The launcher's own icon slot, so anything that only breaks at the size it
	   actually ships at breaks here too. */
	.icon.sm {
		width: 34px;
		height: 34px;
		flex-shrink: 0;
	}
	.icon :global(svg) {
		width: 100%;
		height: 100%;
	}
	.cell.frc .icon {
		display: inline-flex;
		align-items: center;
		width: auto;
	}
	.cell.frc .icon img {
		height: 100%;
		width: auto;
		display: block;
	}
	figcaption {
		margin-top: 0.7rem;
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.78rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.never {
		color: var(--cyan);
	}
</style>
