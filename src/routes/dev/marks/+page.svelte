<script lang="ts">
	/**
	 * Dev harness for the eleven app marks in `$lib/marks` and the FRC icon
	 * beside them (404 in production, no auth, no Supabase).
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
	 * THE REAL COMPONENTS, NEVER A COPY. Each cell mounts the shipping component
	 * -- the same import `AppLauncher` uses -- so a keyframe added there is
	 * measured here without anyone remembering to mirror it. The FRC cell is the
	 * same `<img>` off the same asset, because the rule about it is a rule about
	 * that image.
	 *
	 * ONE ROUTE, NOT ELEVEN, AND THAT IS A RUNTIME DECISION. The browser pass is
	 * around fifty route/width runs and a pass nobody waits for is a pass nobody
	 * runs; eleven routes would have cost twenty-two more runs for eleven
	 * measurements that share one page load. `data-mark` is what keeps the
	 * reporting per-mark anyway: the spec names one selector per glyph, so a
	 * failure says WHICH mark, and the check's own rows say which ELEMENT inside
	 * it.
	 *
	 * NO ROOM WRAPPER, DELIBERATELY. `AppLauncher` mounts on the portal home
	 * page, which carries no scoped theme, so this harness carries none either
	 * -- the marks read `currentColor` and `var(--gold)`, and both resolve
	 * differently inside `.gt-root` or `.nb-root`. A harness in the wrong room
	 * measures the wrong plate (see `/dev/pathways` for the mirror of this).
	 */
	import AdminMark from '$lib/marks/AdminMark.svelte';
	import ClassroomMark from '$lib/marks/ClassroomMark.svelte';
	import CoinDeskMark from '$lib/marks/CoinDeskMark.svelte';
	import CoinMark from '$lib/marks/CoinMark.svelte';
	import DashboardMark from '$lib/marks/DashboardMark.svelte';
	import FoundryMark from '$lib/marks/FoundryMark.svelte';
	import GauntletMark from '$lib/marks/GauntletMark.svelte';
	import GreenlineMark from '$lib/marks/GreenlineMark.svelte';
	import NotebookMark from '$lib/marks/NotebookMark.svelte';
	import TournamentMark from '$lib/marks/TournamentMark.svelte';
	import VanguardMark from '$lib/marks/VanguardMark.svelte';
	import frcIcon from '$lib/frc/assets/frc-icon.png';

	/**
	 * The eleven, in the order `AppLauncher`'s own `appIcon` snippet branches on
	 * them, so a reader can put the two side by side. `id` is the `data-mark`
	 * value the route spec names.
	 */
	const MARKS = [
		{ id: 'vanguard', name: 'VANGUARD', Mark: VanguardMark },
		{ id: 'gauntlet', name: 'GAUNTLET', Mark: GauntletMark },
		{ id: 'greenline', name: 'GREENLINE', Mark: GreenlineMark },
		{ id: 'coins', name: 'Coin Ledger', Mark: CoinMark },
		{ id: 'classroom', name: 'Classroom', Mark: ClassroomMark },
		{ id: 'notebook', name: 'Notebook', Mark: NotebookMark },
		{ id: 'tournament', name: 'Tournaments', Mark: TournamentMark },
		{ id: 'coin-desk', name: 'Coin Desk', Mark: CoinDeskMark },
		{ id: 'dashboard', name: 'Dashboard', Mark: DashboardMark },
		{ id: 'admin', name: 'Admin', Mark: AdminMark },
		{ id: 'foundry', name: 'Foundry', Mark: FoundryMark }
	];
</script>

<svelte:head><title>dev // app marks</title></svelte:head>

<main class="harness">
	<h1>// App marks harness</h1>
	<p class="note">
		The eleven glyphs in <code>$lib/marks</code> and the FRC icon beside them, at the launcher's own
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
