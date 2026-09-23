<script lang="ts">
	import { untrack } from 'svelte';
	import { anchored } from '$lib/shell/anchored';
	import {
		censusSummary,
		groupDigits,
		sharePercent,
		type CensusBucket,
		type CodeCensus
	} from '$lib/code-census';

	/**
	 * THE LINES-OF-CODE READOUT IN THE HOME BANNER, and the panel behind it.
	 *
	 * THE NUMBER IS BUILT, NEVER TYPED. Everything rendered here comes out of
	 * `virtual:site-code`, which `vite.config.ts` produces by running
	 * `git ls-files` and handing the result to `buildCodeCensus`. There is not a
	 * digit in this file. The rule that made this worth doing is the repo's own:
	 * a hand-written file never holds a computed value -- and the only such
	 * value this repository had was `35,000+ lines`, hardcoded in a slide deck
	 * whose speaker note asked whoever presented it to go and find the real one.
	 *
	 * THREE AXES, BECAUSE THE ASK WAS TWO QUESTIONS AND THE THIRD IS FREE.
	 * "What type of code it is" is the language table; "where all that code is"
	 * is genuinely two different questions -- which LAYER of the stack (pages,
	 * libraries, database, tests, tooling) and which APP -- and the app answer
	 * costs nothing because `appForPath` already exists to decide exactly that
	 * for the per-app version numbers. A second ownership table would be the
	 * thing that stops matching.
	 *
	 * BLANK / COMMENT / CODE IS THE NUANCE, AND IT IS THE HONEST COLUMN. A bare
	 * line count over a codebase whose house style is a paragraph of reasoning
	 * above every rule says the wrong thing about it in both directions. The
	 * split is what makes the figure checkable rather than impressive.
	 *
	 * NO PER-FILE LIST, DELIBERATELY. Three aggregate tables are a couple of
	 * kilobytes; a row per file would be thousands, on the signed-out landing
	 * page, to say something nobody reads to the end of.
	 *
	 * HOVER SHOWS THE BASIC DATA AND CLICK SHOWS THE BREAKDOWN, which is report
	 * 12's own shape -- but HOVER IS THE EXTRA, NEVER THE ONLY WAY IN. A phone
	 * cannot hover and a keyboard does not; the summary line the hover reveals
	 * is the first thing inside the panel too, so the pointer path is a
	 * shortcut to something every other input already reaches.
	 */

	let {
		census,
		/** Harness hook: open the panel without a press. */
		startOpen = false
	}: { census: CodeCensus; startOpen?: boolean } = $props();

	/* Seeded once, deliberately: `startOpen` is a harness hook rather than a
	   controlled prop, and `untrack` is how that is spelled. */
	let open = $state(untrack(() => startOpen));
	let hovered = $state(false);
	let trigger = $state<HTMLButtonElement | null>(null);
	/** Which of the three breakdowns is on screen. */
	let axis = $state<'languages' | 'layers' | 'areas'>('languages');

	const AXES = [
		{ id: 'languages' as const, label: 'By type', head: 'What kind of code' },
		{ id: 'layers' as const, label: 'By layer', head: 'Where it sits in the stack' },
		{ id: 'areas' as const, label: 'By app', head: 'Which part of the site' }
	];

	const rows = $derived<CensusBucket[]>(census[axis]);
	const axisHead = $derived(AXES.find((a) => a.id === axis)?.head ?? '');
	const summary = $derived(censusSummary(census));
	/** The widest row, so every bar is drawn against the same scale. */
	const widest = $derived(rows.reduce((m, r) => Math.max(m, r.total), 0));

	/**
	 * THE HOVER READOUT IS A PANEL SIBLING, NOT A `title` ATTRIBUTE. A `title`
	 * is not discoverable, a phone cannot show one, and a screen reader's
	 * treatment of it varies -- the repo's own rule. It is `aria-hidden` because
	 * the same sentence is the first line inside the panel and in the live
	 * region below, so announcing it on hover would say it twice.
	 */
	const showPeek = $derived(hovered && !open);
</script>

{#if census.complete && census.total > 0}
	<div class="loc">
		<button
			type="button"
			class="loc-chip tap-reach-44"
			bind:this={trigger}
			aria-expanded={open}
			aria-controls="loc-panel"
			onclick={() => (open = !open)}
			onpointerenter={() => (hovered = true)}
			onpointerleave={() => (hovered = false)}
			onfocus={() => (hovered = true)}
			onblur={() => (hovered = false)}
		>
			<span class="loc-key" aria-hidden="true">LOC</span>
			<span class="loc-value">{groupDigits(census.total)}</span>
			<!-- The caret says this opens something. It is decoration beside the
			     two words above, never the only signal that the chip is a control. -->
			<span class="loc-caret" aria-hidden="true" class:loc-caret-open={open}>&#9662;</span>
			<span class="loc-sr">lines of code. Open the breakdown.</span>
		</button>

		{#if showPeek}
			<span class="loc-peek" aria-hidden="true">{summary}</span>
		{/if}

		{#if open}
			<!-- ANCHORED RATHER THAN ABSOLUTELY PLACED. The header is sticky and
			     carries a backdrop filter, and at 375px a panel laid out from the
			     chip's own box runs off the right edge; `anchored` writes
			     `position: fixed` plus two coordinates and clamps to the viewport,
			     which is the one mechanism in the repo that does not need a media
			     query per width somebody thought to look at. -->
			<div
				class="loc-panel"
				id="loc-panel"
				use:anchored={{ anchor: trigger, open, prefer: 'below', align: 'start', gap: 10 }}
			>
				<div class="loc-head">
					<strong class="loc-title">Lines of code</strong>
					<button type="button" class="loc-close tap-44" onclick={() => (open = false)}>
						Close
					</button>
				</div>

				<p class="loc-summary">{summary}</p>

				<div class="loc-totals">
					<div class="loc-total">
						<span class="loc-total-v">{groupDigits(census.code)}</span>
						<span class="loc-total-l">Code</span>
					</div>
					<div class="loc-total">
						<span class="loc-total-v loc-comment">{groupDigits(census.comment)}</span>
						<span class="loc-total-l">Comment</span>
					</div>
					<div class="loc-total">
						<span class="loc-total-v loc-blank">{groupDigits(census.blank)}</span>
						<span class="loc-total-l">Blank</span>
					</div>
					<div class="loc-total">
						<span class="loc-total-v loc-files">{groupDigits(census.files)}</span>
						<span class="loc-total-l">Files</span>
					</div>
				</div>

				<div class="loc-axes" role="group" aria-label="Break the count down by">
					{#each AXES as a (a.id)}
						<button
							type="button"
							class="loc-axis tap-44"
							class:loc-axis-on={axis === a.id}
							aria-pressed={axis === a.id}
							onclick={() => (axis = a.id)}
						>
							{a.label}
						</button>
					{/each}
				</div>

				<span class="loc-axis-head">{axisHead}</span>
				<ul class="loc-rows">
					{#each rows as row (row.id)}
						<li class="loc-row">
							<span class="loc-row-top">
								<span class="loc-row-label">{row.label}</span>
								<span class="loc-row-n">{groupDigits(row.total)}</span>
								<span class="loc-row-pct">{sharePercent(row.total, census.total)}%</span>
							</span>
							<!-- THE BAR IS A PICTURE OF THE NUMBER BESIDE IT, never the
							     number itself: the figure and the percentage are both
							     written out, so the bar can be decorative and is
							     `aria-hidden`. Its two segments are code then comment, in
							     that order, against the widest row in the table. -->
							<span class="loc-bar" aria-hidden="true">
								<span
									class="loc-bar-code"
									style:width="{widest > 0 ? (row.code / widest) * 100 : 0}%"
								></span>
								<span
									class="loc-bar-comment"
									style:width="{widest > 0 ? (row.comment / widest) * 100 : 0}%"
								></span>
							</span>
							<span class="loc-row-sub">
								{groupDigits(row.code)} code &middot; {groupDigits(row.comment)} comment &middot;
								{groupDigits(row.files)}
								{row.files === 1 ? 'file' : 'files'}
							</span>
						</li>
					{/each}
				</ul>

				{#if census.excluded.length}
					<!-- WHAT IS NOT IN THE NUMBER, WITH THE REASON. A total with no
					     stated boundary is a total nobody can check, and the first
					     question anybody asks a lines-of-code figure is whether it
					     counted the dependencies. -->
					<div class="loc-excluded">
						<span class="loc-axis-head">Not counted</span>
						<p class="loc-excluded-note">
							Only files tracked in git are counted at all, so installed dependencies and
							build output are outside this by construction. Prose and configuration
							(Markdown, JSON) are not code and are not counted either. On top of that:
						</p>
						<ul>
							{#each census.excluded as ex (ex.id)}
								<li>
									<span class="loc-ex-label">{ex.label}</span>
									<span class="loc-ex-n">{groupDigits(ex.total)} lines, {groupDigits(ex.files)}
										{ex.files === 1 ? 'file' : 'files'}</span>
									<span class="loc-ex-why">{ex.reason}</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				<p class="loc-foot">
					Counted at build time from this repository's own git file list. Nothing here is
					written by hand.
				</p>
			</div>
		{/if}
	</div>
{/if}

<style>
	.loc {
		position: relative;
		display: inline-flex;
		align-items: center;
	}

	/* THE CHIP MATCHES ITS NEIGHBOURS' BOX EXACTLY -- the same font, size,
	   padding, radius and border weight as `.class-chip` and `.auth-link` beside
	   it -- because the requirement is that a new header child must not grow the
	   header. It reaches 44px through `.tap-reach-44`, which grows the HIT AREA
	   with a pseudo-element and leaves the layout alone; growing the box would
	   push the banner taller on every page load. */
	/* THE TINTS READ THE LANDING PAGE'S ROOM HOOKS (`--li-*` on `.legacy-index`,
	   src/app.css), with the page's own values as the fallback for a mount
	   outside it (/dev/code-census), so a theme that repoints the page repoints
	   this chip with it. */
	.loc-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-family: var(--font-title, 'Orbitron', sans-serif);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--cyan);
		background: color-mix(in srgb, var(--li-patina, #93d6c8) 5%, transparent);
		border: 1px solid color-mix(in srgb, var(--li-patina, #93d6c8) 30%, transparent);
		padding: 0.3rem 0.7rem;
		border-radius: 2px;
		cursor: pointer;
		white-space: nowrap;
		/* HORIZONTAL REACH OFF. The tour link and the sign-in control sit closer
		   than 44px on this row, and two overlapping reaches hand the tap to the
		   wrong one. Height only, which is free -- nothing is stacked that close
		   vertically. */
		--tap-reach-w: 0px;
		transition:
			color 0.2s,
			border-color 0.2s;
	}
	.loc-chip:hover,
	.loc-chip:focus-visible {
		color: var(--green);
		border-color: color-mix(in srgb, var(--li-mint, #8fe08a) 50%, transparent);
	}
	/* `--text-2`, NOT `--dim`, AND THAT IS THE DOCUMENTED FIX RATHER THAN A
	   PREFERENCE. `--dim` clears 4.5:1 only on the DARKEST of the three portal
	   grounds: 5.31 on `--bg0`, 4.46 on `--bg1`, 4.24 on `--bg2`. The tile
	   labels below sit on `--bg2` and measured exactly 4.24:1 in the browser
	   pass. Lightening the token is the REFUSED repair -- five FRC components
	   read `--dim` on `.frc-root`'s paper where it already measures 2.95, so
	   raising it degrades a room this surface cannot see. The CALL SITE takes
	   the register's own token for secondary labels and meta instead:
	   `--text-2` is 6.91 / 5.88 / 5.51 on the same three grounds. */
	.loc-key {
		color: var(--text-2);
		font-size: 0.85em;
	}
	.loc-value {
		font-variant-numeric: tabular-nums;
	}
	.loc-caret {
		font-size: 0.7em;
		color: var(--text-2);
	}
	.loc-caret-open {
		color: var(--green);
	}
	/* The chip's own accessible name. Visually hidden, never `display: none` --
	   a hidden name is still a name. */
	.loc-sr {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;
	}

	/* THE HOVER READOUT. Absolutely placed so it cannot reflow the banner, and
	   `pointer-events: none` so it can never eat the click meant for the chip
	   underneath it. */
	.loc-peek {
		position: absolute;
		top: calc(100% + 0.45rem);
		left: 0;
		z-index: 2;
		pointer-events: none;
		max-width: min(24rem, calc(100vw - 2rem));
		background: var(--bg2, #16211a);
		border: 1px solid color-mix(in srgb, var(--li-patina, #93d6c8) 30%, transparent);
		border-radius: 2px;
		padding: 0.35rem 0.55rem;
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.65rem;
		line-height: 1.4;
		color: var(--white);
		white-space: normal;
	}

	.loc-panel {
		position: absolute;
		top: calc(100% + 0.6rem);
		left: 0;
		z-index: 3;
		width: min(30rem, calc(100vw - 1.5rem));
		max-height: min(72vh, 36rem);
		overflow: auto;
		background: var(--bg1, #121a12);
		border: 1px solid color-mix(in srgb, var(--li-mint, #8fe08a) 30%, transparent);
		border-radius: 3px;
		padding: 0.9rem;
		color: var(--white);
		font-family: var(--font-display, 'Rajdhani', sans-serif);
		font-size: 0.85rem;
		line-height: 1.45;
		text-align: left;
		text-transform: none;
		letter-spacing: normal;
		/* The landing page's popover shadow, through its room hook so Space
		   White can hand the lifted elevation in its place. */
		box-shadow: var(--li-pop-shadow, 0 18px 50px rgba(0, 0, 0, 0.55));
	}

	.loc-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.loc-title {
		font-family: var(--font-title, 'Orbitron', sans-serif);
		font-size: 0.72rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--green);
	}
	/* Same argument as `.loc-key` above: these sit on the panel's own `--bg1`
	   ground, where `--dim` measures 4.46. */
	.loc-close,
	.loc-axis {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		padding: 0 0.7rem;
		appearance: none;
		background: none;
		border: 1px solid var(--boundary, #4c5a4c);
		border-radius: 2px;
		color: var(--text-2);
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.65rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
	}
	.loc-close:hover,
	.loc-axis:hover {
		color: var(--green);
		border-color: color-mix(in srgb, var(--li-mint, #8fe08a) 50%, transparent);
	}
	/* PRESSED IS A BORDER, A GROUND AND AN INK -- three changes, so the active
	   axis is not distinguishable by hue alone. `aria-pressed` carries it for
	   anything that is not looking. */
	.loc-axis-on {
		color: var(--green);
		border-color: var(--green);
		background: color-mix(in srgb, var(--li-mint, #8fe08a) 10%, transparent);
	}

	.loc-summary {
		margin: 0.45rem 0 0.6rem;
		color: var(--white);
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.7rem;
		line-height: 1.5;
	}

	.loc-totals {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(5.5rem, 1fr));
		gap: 0.5rem;
		margin-bottom: 0.7rem;
	}
	.loc-total {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: 0.4rem 0.5rem;
		border: 1px solid var(--hairline, #2a332a);
		border-radius: 2px;
		background: var(--bg2, #16211a);
		min-width: 0;
	}
	.loc-total-v {
		font-family: var(--font-title, 'Orbitron', sans-serif);
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--green);
		font-variant-numeric: tabular-nums;
	}
	.loc-comment {
		color: var(--cyan);
	}
	.loc-blank {
		color: var(--ice);
	}
	.loc-files {
		color: var(--gold);
	}
	.loc-total-l {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.58rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-2);
	}

	.loc-axes {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin-bottom: 0.5rem;
	}
	.loc-axis-head {
		display: block;
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.6rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--cyan);
		margin-bottom: 0.3rem;
	}

	.loc-rows {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.loc-row {
		min-width: 0;
	}
	.loc-row-top {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		min-width: 0;
	}
	.loc-row-label {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--white);
		font-size: 0.8rem;
	}
	.loc-row-n,
	.loc-row-pct {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.7rem;
		font-variant-numeric: tabular-nums;
		color: var(--white);
	}
	.loc-row-pct {
		color: var(--text-2);
		min-width: 2.4rem;
		text-align: right;
	}
	.loc-bar {
		display: flex;
		height: 4px;
		margin: 0.2rem 0 0.15rem;
		background: var(--hairline, #2a332a);
		border-radius: 2px;
		overflow: hidden;
	}
	.loc-bar-code {
		background: var(--green);
	}
	.loc-bar-comment {
		background: var(--cyan);
	}
	.loc-row-sub {
		display: block;
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.6rem;
		color: var(--text-2);
	}

	.loc-excluded {
		margin-top: 0.8rem;
		padding-top: 0.6rem;
		border-top: 1px solid var(--hairline, #2a332a);
	}
	.loc-excluded-note {
		margin: 0 0 0.45rem;
		font-size: 0.75rem;
		color: var(--text-2);
	}
	.loc-excluded ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}
	.loc-ex-label {
		display: block;
		font-size: 0.78rem;
		color: var(--white);
	}
	.loc-ex-n {
		display: block;
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.62rem;
		color: var(--gold);
	}
	.loc-ex-why {
		display: block;
		font-size: 0.72rem;
		color: var(--text-2);
	}

	.loc-foot {
		margin: 0.7rem 0 0;
		font-size: 0.72rem;
		color: var(--text-2);
	}
</style>
