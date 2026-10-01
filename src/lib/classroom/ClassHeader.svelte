<script lang="ts">
	import type { Snippet } from 'svelte';
	import ClassThemeBanner from '$lib/classroom/ClassThemeBanner.svelte';
	import BadgeIcon from '$lib/tournaments/BadgeIcon.svelte';
	import type { ClassTheme } from '$lib/classroom/class-theme';
	import type { ClassroomSection } from '$lib/classroom/classroom';
	import { classHeaderMeta, type ClassHeaderTeams, type ClassNextDue } from '$lib/classroom/class-header';
	import { QUICK_POST_GLYPH } from '$lib/classroom/quick-posts';

	/**
	 * THE TOP OF A CLASS, AS ONE COMPACT HEADER (ledger 0360, report R19).
	 *
	 * Mr. Pina, on the class banner: it "has no function other than to say the
	 * title of a class ... it's just taking up space and I don't have a lot of
	 * space to work with", sitting "between teams and new post". The class page
	 * stacked five rows before its content: the tools, the teacher's teams strip,
	 * the banner, the theme vote's row, and the New post row. This is ONE block:
	 *
	 *   1. THE TITLE LINE: the class badge and the plate's own title bar (an
	 *      `h1.pane-title` when the class list is the page, an `h2` while an item
	 *      is open beside it).
	 *   2. ONE WRAPPING KEY ROW, in the order a person reads it: the class's
	 *      identity as a recessed chip; the hall pass, the music and the live
	 *      class (still the first CONTROLS in the pane, prompt 0118); the class
	 *      theme's trigger (its vote drops to a full-width band under the row);
	 *      the next thing due; a teacher's posted-teams key; and a teacher's
	 *      Quick post, New post and Units at the end.
	 *
	 * MEASURED, NOT ESTIMATED (ledger 0360's history entry has the table), with
	 * nothing posted, the class content starts higher at every width: a teacher
	 * 152px at 1440 and at 1278, where the report was filed, and 97px on a 375
	 * phone; a student 82px at 1440, 30px at 1278 and 32px at 375. On a phone
	 * that needs the tiles below: one key a line (the first version) put a
	 * student 52px LOWER than before, because Next due is a line the old rows
	 * never had.
	 *
	 * THE BANNER WRAPS ALL OF IT, so the class's voted look frames something
	 * useful, and a class nobody has voted on renders the header with no banner
	 * at all (`ClassThemeBanner` renders its children and nothing else).
	 *
	 * After the header come the class's notices (`bulletin`, the quick posts:
	 * directly under it, where a student cannot miss them) and then `below` (the
	 * posted teams). Everything that DOES something arrives as a snippet or a
	 * plain prop from the surface that owns it, so absence is the mechanism: no
	 * snippet, no control.
	 */
	let {
		section,
		theme = null,
		asPane = false,
		nextDue = null,
		teams = null,
		quickPost = null,
		tools = null,
		themePanel = null,
		actions = null,
		bulletin = null,
		below = null
	}: {
		section: ClassroomSection;
		/** The class's voted look. Null draws no banner. */
		theme?: ClassTheme | null;
		/** An item is open beside the list: the title is an `h2`, the item owns the `h1`. */
		asPane?: boolean;
		/** `nextDueFor`'s answer. Null draws no key. */
		nextDue?: ClassNextDue | null;
		/** A teacher's "Teams posted until ..." and its People link. Null for a student. */
		teams?: ClassHeaderTeams | null;
		/** A teacher's Quick post key: its open state and its toggle. Null draws no key. */
		quickPost?: { open: boolean; toggle: () => void } | null;
		/** The hall pass, music and live class triggers, as the section layout renders them. */
		tools?: Snippet | null;
		/** The class theme vote; its trigger joins the key row. */
		themePanel?: Snippet | null;
		/** The class view's own keys (New post, Units). */
		actions?: Snippet | null;
		/** The class's notices, rendered directly under the header. */
		bulletin?: Snippet | null;
		/** What follows the notices (the posted teams). */
		below?: Snippet | null;
	} = $props();

	const meta = $derived(classHeaderMeta(section));
	const title = $derived(section.course?.title ?? section.label);
</script>

<ClassThemeBanner {theme} badgeInline>
	<header class="pane-head ch" data-testid="class-header">
		<!-- THE BADGE SITS BESIDE THE TITLE, NOT IN A COLUMN OF ITS OWN: a
		     column down the banner's whole height took 37px from every key row
		     under it, which on a phone is a key's worth of width. -->
		<div class="ch-title">
			{#if theme && theme.badge.paths.length > 0}
				<span class="ch-badge" data-testid="class-banner-badge" aria-hidden="true">
					<BadgeIcon id={theme.badge.id} size="1.7rem" motion="once" />
				</span>
			{/if}
			<svelte:element this={asPane ? 'h2' : 'h1'} class="pane-title">{title}</svelte:element>
		</div>
		<!-- ONE WRAPPING ROW OF KEYS, IN THE ORDER A PERSON READS THEM: who this
		     class is, the tools (the section layout's own row, made boxless here,
		     so the hall pass, the music and the live class are items of this row
		     and take up its slack), the class theme, the next thing due, the
		     teams, and a teacher's posting keys at the end. A desktop lays them in
		     one or two lines; a phone gives each its own. -->
		<div class="ch-row" data-testid="class-header-row">
			<!-- The identity, recessed: a tag, not a control. It truncates rather
			     than wrapping, and its full words are its title. -->
			<span class="chip pane-meta ch-meta" title={meta} data-testid="class-header-meta">{meta}</span>
			{#if section.active === false}<span class="draft-chip">Archived</span>{/if}
			{#if tools}
				<div class="ch-tools">{@render tools()}</div>
			{/if}
			{#if themePanel}
				<!-- `display: contents` down to the disclosure, so its trigger is a
				     key in this row and its vote, when open, a band under it (the
				     grading console's header shape, ledger 0347). -->
				<div class="ch-theme">{@render themePanel()}</div>
			{/if}
			{#if nextDue}
				<a
					class="btn secondary tiny ch-key ch-due"
					href={nextDue.href}
					title={`Next due: ${nextDue.title}, ${nextDue.when}`}
					data-testid="class-next-due"
				>
					<span class="ch-lead">Next due</span>
					<span class="ch-text">{nextDue.title}</span>
					<span class="ch-when">{nextDue.when}</span>
				</a>
			{/if}
			{#if teams}
				<a
					class="btn secondary tiny ch-key ch-teams"
					href={teams.href}
					title={`${teams.text}. Manage in ${teams.label}.`}
					data-testid="class-header-teams"
				>
					<span class="ch-text">{teams.text}</span>
					<!-- Where it goes, said to a screen reader in the words the strip
					     used; on screen the sentence takes the key's whole width. -->
					<span class="ch-sr">. Manage in {teams.label}</span>
				</a>
			{/if}
			{#if quickPost || actions}
				<div class="ch-actions">
					{#if quickPost}
						<button
							type="button"
							class="btn secondary tiny ch-key"
							class:on={quickPost.open}
							aria-expanded={quickPost.open}
							data-testid="quick-post-open"
							onclick={() => quickPost?.toggle()}
						>
							<svg class="ch-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d={QUICK_POST_GLYPH} /></svg>
							{quickPost.open ? 'Close quick post' : 'Quick post'}
						</button>
					{/if}
					{#if actions}{@render actions()}{/if}
				</div>
			{/if}
		</div>
	</header>
</ClassThemeBanner>
{#if bulletin}{@render bulletin()}{/if}
{#if below}{@render below()}{/if}

<style>
	/* --- The block ----------------------------------------------------------
	   Three parts with one gap between them, and NO padding above: the pane's
	   own inset is the air over the header. */
	.pane-head {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
		padding: 0 0 var(--space-3);
		container: class-header / inline-size;
	}
	.ch-title {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-width: 0;
	}
	.ch-badge {
		flex: none;
		display: grid;
		place-items: center;
		color: var(--text-1);
	}
	.pane-title {
		flex: 1 1 auto;
		min-width: 0;
		margin: 0;
		font-family: var(--font-display);
		font-weight: 600;
		font-size: 1.15rem;
		line-height: 1.25;
		letter-spacing: 0;
		color: var(--text-1);
		/* Two lines at most, then it stops: a long course title must not push
		   the class itself off the first screen. */
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	/* THE TOOLS ROW IS THE SECTION LAYOUT'S OWN `.class-tools`, rendered here
	   through a snippet, so its rules stay where they are pinned (each tool is
	   `flex: 1 1 12rem` there). Boxless, so each tool is an item of the
	   identity line and the line's gap spaces them. */
	.ch-tools,
	.ch-tools :global(.class-tools) {
		display: contents;
	}
	/* A wider basis than the tools row's own 12rem, measured: at 12rem the hall
	   pass trigger cut its status ("Nobody out") to an ellipsis on a desktop
	   line it shared, and 15rem is the word and the status side by side. On a
	   phone each tool still takes a whole line, as it did. */
	/* AND IT DOES NOT GROW (ledger 0360, the fresh-eyes review): growing, the
	   three tools spent 150 to 250px each between a word and its status while
	   the class theme and Next due beside them were cut to an ellipsis. */
	.ch-row :global(.class-tools > *) {
		flex: 0 1 auto;
	}

	/* --- The key row ---------------------------------------------------------
	   Wraps rather than scrolls, every key keeps its own width, and a key that
	   holds a title gives up its middle to an ellipsis before it pushes the
	   row wider than the pane. */
	.ch-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}
	.ch-meta {
		flex: 0 1 auto;
		min-width: 0;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.04em;
		/* --text-1 on the banner, whatever the plate does: the wash lightens the
		   ground under it, and --text-2 measured 3.13:1 there on IDEA. */
		color: var(--text-1);
	}
	/* Every key in the row, the class view's own included, reads at the 11px
	   label floor rather than the room's 10.4px chip size. */
	.pane-head .ch-row :global(.btn.tiny) {
		font-size: 0.6875rem;
	}
	.ch-key {
		max-width: 100%;
		min-width: 0;
		gap: 0.45rem;
	}
	.ch-lead {
		flex: none;
	}
	.ch-text {
		flex: 0 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-transform: none;
		letter-spacing: 0.02em;
		font-family: var(--font-display);
		font-size: 0.85rem;
		font-weight: 600;
	}
	.ch-when {
		flex: none;
		white-space: nowrap;
		text-transform: none;
		letter-spacing: 0.02em;
	}
	/* THE CAPS ARE MEASURED, NOT ROUND: at 1278px (where the report was filed)
	   a teacher's next due, teams, theme and posting keys share one line under
	   these, and a title or a sentence longer than its key gives up its middle
	   to an ellipsis, with the whole of it in the key's title. */
	/* The cap is the line-breaking BASIS, and the key then GROWS into whatever
	   its line has spare, up to a wider ceiling: the lines break exactly where
	   the measured caps put them, and the room a line does not use goes to the
	   words that were being cut, never to empty key face. */
	.ch-due {
		flex: 1 1 17rem;
		max-width: min(100%, 30rem);
	}
	.ch-teams {
		max-width: min(100%, 20rem);
	}
	.ch-sr {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}
	.ch-glyph {
		flex: none;
		width: 1.05rem;
		height: 1.05rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	/* The teacher's keys sit at the row's end, and wrap as one group. */
	.ch-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin-left: auto;
		min-width: 0;
	}

	/* --- The class theme, folded into the row --------------------------------
	   The panel and its disclosure become boxless, so the trigger is a key in
	   this row and the vote, when open, takes a full-width band under it.
	   The trigger is sized as a key here; plate.css paints it as one where its
	   key list names `.ch-row .disc-trigger`, and the edge below is the
	   fallback for a deployment with the plate switched off. */
	.ch-theme,
	.ch-theme :global(.ctp),
	.ch-theme :global(div.disc) {
		display: contents;
	}
	.ch-theme :global(.disc-trigger) {
		flex: 1 1 13rem;
		width: auto;
		/* Zero, so the 13rem basis and not the nowrap words decide where the
		   line breaks; the words then get whatever the line has spare. */
		min-width: 0;
		max-width: min(100%, 26rem);
		min-height: 44px;
		padding: 0 0.8rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card, 6px);
		background: var(--surface-1);
		font-size: 0.6875rem;
	}
	.ch-theme :global(.disc-body) {
		order: 99;
		flex: 1 0 100%;
		min-width: 0;
	}
	/* THE VOTE SITS ON AN OPAQUE CARD, never on the banner's wash: its hints
	   are --text-2, which measured 3.13:1 on the IDEA wash. */
	.ch-theme :global(.disc-body[data-open='true']) {
		box-sizing: border-box;
		padding: var(--space-3);
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card, 6px);
	}

	/* --- A narrow header: two tiles to a line -------------------------------
	   A container query, not a viewport one, because the header is narrow in
	   two places: a phone, and the 26rem list pane beside an open item at any
	   width (measured, CLAUDE.md's nested-pane rule: 278px inside the banner on
	   a 375 phone, about 335px in the open-item pane at 1440).
	   ONE KEY A LINE COST MORE THAN THE OLD STRIPS DID: a phone gained a Next
	   due line and freed nothing (measured +52px for a student, +55px for a
	   teacher). So here the tools, the class theme and Next due are TILES, two
	   to a line, each saying its word on one line and its status on the next;
	   the teams sentence and the posting keys keep whole lines. A tile with no
	   partner grows to the line, so a class with one tool loses nothing.
	   THIS BLOCK IS LAST ON PURPOSE: the theme trigger's own 13rem cap above
	   has the same specificity, and while this block sat before it the cap won
	   and the trigger sat alone at 208px on every phone. */
	@container class-header (max-width: 30rem) {
		.ch-row :global(.class-tools > *),
		.ch-theme :global(.disc-trigger),
		.ch-due {
			flex: 1 1 8rem;
			max-width: 100%;
			/* min-width 0 is what lets a tile share a line at all. A line is
			   broken on each item's size clamped by its minimum, and the theme
			   trigger's automatic minimum is its min-content -- which, because
			   the voted words are `nowrap`, is the whole sentence (measured
			   299px), so it took a line of its own and left the live class
			   tile alone on the line above it. */
			min-width: 0;
			align-self: stretch;
		}
		.ch-teams {
			flex: 1 1 100%;
			max-width: 100%;
		}
		/* The hall pass and the music: the status chip takes the tile's second
		   line rather than an ellipsis on the first. Their own rules (in
		   HallPass and SongQueue) stay as they are everywhere else. */
		.ch-row :global(.ctool-trigger) {
			flex: 1 1 auto;
			flex-wrap: wrap;
			align-content: center;
			column-gap: 0.5rem;
			row-gap: 0.15rem;
			padding: 0.35rem 0.6rem;
			letter-spacing: 0.06em;
		}
		.ch-row :global(.ld-door) {
			padding: 0.35rem 0.6rem;
			letter-spacing: 0.06em;
		}
		/* The class theme: its word on the first line, what was voted and Show
		   on the second. The basis is what moves the words down: 50% does not
		   fit beside the label in a tile, and does in a tile that has a whole
		   line to itself. */
		.ch-theme :global(.disc-trigger) {
			flex-wrap: wrap;
			align-content: center;
			column-gap: 0.4rem;
			row-gap: 0.15rem;
			padding: 0.35rem 0.6rem;
		}
		.ch-theme :global(.disc-meta) {
			flex: 1 1 50%;
		}
		/* Next due: "Next due" and when on the first line where they fit, the
		   title on a line of its own, and nothing ellipsized but the title.
		   Three classes deep because `.cr-root .btn.secondary.tiny` (0,4,0)
		   sets the key's block padding and would otherwise win the tie. */
		.ch-row .ch-key.ch-due {
			flex-wrap: wrap;
			align-content: center;
			justify-content: flex-start;
			column-gap: 0.45rem;
			row-gap: 0.15rem;
			padding-block: 0.35rem;
			text-align: left;
		}
		.ch-due > span {
			line-height: 1.2;
		}
		.ch-due .ch-lead {
			order: 1;
		}
		.ch-due .ch-when {
			order: 2;
		}
		.ch-due .ch-text {
			order: 3;
			flex: 1 1 100%;
		}
		/* The posting keys share a line: Quick post, New post and Units fit 278px
		   at this padding and did not at the room's own. */
		.ch-actions {
			flex: 1 1 100%;
			margin-left: 0;
		}
		.ch-row .ch-actions :global(.btn) {
			flex: 1 1 auto;
			padding-inline: 0.45rem;
			letter-spacing: 0.06em;
		}
	}
</style>
