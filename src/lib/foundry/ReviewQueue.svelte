<script lang="ts">
	/**
	 * THE REVIEW QUEUE. Admin only, and it is the student page plus an inspector.
	 *
	 * ROLE PARITY IS STRUCTURAL HERE, not a promise. The middle column mounts
	 * `FoundryDetail` -- the IDENTICAL component the gallery mounts, with no
	 * staff flag and no staff branch inside it -- and the inspector sits in the
	 * column beside it. So a reviewer is reading the student's page, and a change
	 * to how an app reads reaches both surfaces at once because there is only one
	 * of them. This is deliberately NOT a second gallery with extra columns.
	 *
	 * SOURCE AND RUNNING APP SIDE BY SIDE, NOT TWO TABS. Above 1024px the work
	 * area is two columns: the app (with its live sandboxed frame) and the
	 * inspector (tree, source, decision). Deciding whether a build does what its
	 * description claims means looking at both at once; a tabbed arrangement
	 * makes that a memory test.
	 *
	 * BELOW 1024px THERE IS NO SIDE-BY-SIDE AND PRETENDING OTHERWISE WOULD BE
	 * WORSE THAN SAYING SO. Two 187px columns is neither a readable app nor
	 * readable source. It becomes ONE COLUMN in review order: the running app,
	 * then the file tree, then the source, then the decision -- which is the
	 * sequence a reviewer works in anyway. The queue list swaps out entirely
	 * (`narrow="swap"`), so a phone shows the queue or one submission, never both.
	 *
	 * THE VERSION UNDER REVIEW IS WHAT RUNS, and it is by definition not the
	 * published one -- that is the whole reason `FoundryDetail` takes a
	 * `versionId` and the reason the mint issues a review-kind token.
	 */
	import ClassSplit from '$lib/shell/ClassSplit.svelte';
	import '$lib/shell/split.css';

	import ForgeStatus from './ForgeStatus.svelte';
	import FoundryDetail from './FoundryDetail.svelte';
	import FoundryInspector from './FoundryInspector.svelte';
	import MoltenSeam from './MoltenSeam.svelte';
	import { queueOrder, versionUnderReview } from './review.ts';
	import { foundryAuthorLine } from './surface.ts';
	import type {
		FoundryApp,
		FoundryAppSummary,
		FoundryReviewTransports
	} from './transports.ts';

	let {
		apps,
		selected = null,
		transports = {},
		coverUrl = (path: string) => path,
		onSelect,
		onDecided,
		onDeleted,
		now
	}: {
		apps: FoundryAppSummary[];
		selected?: FoundryApp | null;
		transports?: FoundryReviewTransports;
		coverUrl?: (path: string) => string;
		onSelect: (slug: string | null) => void;
		onDecided?: () => void;
		/** The app no longer exists, so nothing is selected. See FoundryInspector. */
		onDeleted?: () => void;
		/** Threaded from the caller: a component that reads its own clock
		    silently disagrees with the ranking it is rendering. */
		now: Date;
	} = $props();

	const queue = $derived(queueOrder(apps));
	/**
	 * THE SHELVED LIST, which exists because hiding without it is a one-way
	 * door. `foundry_set_app_hidden` is reversible by design, but a hidden app
	 * is not in the queue (it has nothing waiting) and is not on the gallery,
	 * so with no second list there is no surface anywhere from which an admin
	 * could reach one to restore it. The route asks for hidden apps for exactly
	 * this; `_foundry_app_in_population` gates that widening on `is_admin()`
	 * inside itself, so a student passing the same flag still sees nothing.
	 */
	const shelved = $derived(apps.filter((a) => a.hidden_at !== null));
	const underReview = $derived(selected ? versionUnderReview(selected) : null);
	/**
	 * The fallback the inspector is mounted on when nothing is submitted. The
	 * versions array is ordered newest first by `foundry_get_app`, so this is
	 * the most recent build -- which is the one a reviewer looking at a shelved
	 * or withdrawn app wants to read.
	 */
	const newestVersion = $derived(selected?.versions[0] ?? null);

	function waited(iso: string): string {
		const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
		if (days <= 0) return 'today';
		if (days === 1) return '1 day';
		return `${days} days`;
	}
</script>

<ClassSplit hasDetail={selected !== null} narrow="swap" scroll="page" detailWidth="roomy">
	{#snippet nav()}
		<div class="fdy-q-pane">
			<header class="fdy-q-head">
				<h2>Waiting for review</h2>
				<span class="fdy-q-count" data-hot={queue.length > 0 ? 'true' : undefined}>
					{queue.length}
				</span>
			</header>

			{#if queue.length === 0}
				<!-- No heat on an empty queue: the pour marks work in progress, and
				     a cold channel is the honest reading of "nothing is waiting". -->
				<p class="fdy-q-empty">Nothing is waiting. The forge is cold.</p>
			{:else}
				<!-- Heat means in progress: the channel pours exactly while
				     something is waiting to be judged. -->
				<MoltenSeam variant="channel" />
				<!--
					OLDEST FIRST. A newest-first queue is a queue whose bottom never
					gets read, and the days-waited figure beside each row is what makes
					that visible rather than merely true.
				-->
				<ul class="fdy-q-list" data-testid="foundry-queue">
					{#each queue as app (app.id)}
						<li>
							<a
								class="fdy-q-row tap-44"
								class:selected={selected?.slug === app.slug}
								href="/foundry/review?app={app.slug}"
								data-app-slug={app.slug}
								onclick={(e) => {
									if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
									e.preventDefault();
									onSelect(app.slug);
								}}
							>
								<span class="fdy-q-title">{app.title}</span>
								<span class="fdy-q-by">{foundryAuthorLine(app)}</span>
								{#if app.hidden_at}
									<!-- A hidden app CAN still have a submission waiting: hiding
									     does not move a version's status. Deciding about one
									     without knowing it is shelved is the trap this closes. -->
									<span class="fdy-q-chip"><ForgeStatus tone="shelved" word="Hidden" /></span>
								{/if}
								<span class="fdy-q-wait">
									waiting {waited(app.updated_at)}
									{#if app.metadata_flagged_at}
										<span class="fdy-q-flag">text changed</span>
									{/if}
								</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}

			{#if shelved.length > 0}
				<section class="fdy-q-shelf" aria-label="Shelved apps">
					<h3>Shelved</h3>
					<p class="fdy-q-empty">
						Hidden, files kept. Open one to read it and put it back.
					</p>
					<ul class="fdy-q-list" data-testid="foundry-shelved">
						{#each shelved as app (app.id)}
							<li>
								<a
									class="fdy-q-row tap-44"
									class:selected={selected?.slug === app.slug}
									href="/foundry/review?app={app.slug}"
									data-app-slug={app.slug}
									onclick={(e) => {
										if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
										e.preventDefault();
										onSelect(app.slug);
									}}
								>
									<span class="fdy-q-title">{app.title}</span>
									<span class="fdy-q-by">{foundryAuthorLine(app)}</span>
									<span class="fdy-q-chip"><ForgeStatus tone="shelved" word="Hidden" /></span>
								</a>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		</div>
	{/snippet}

	{#if selected}
		{#key selected.slug}
			<!--
				THE CONTAINER IS DECLARED ON A WRAPPER, because a container query
				cannot query the element that declares it -- and the element whose
				columns change IS `.fdy-q-work`.
			-->
			<div class="fdy-q-shell">
			<div class="fdy-q-work" data-testid="foundry-review-work">
				<div class="fdy-q-app">
					<!--
						THE STUDENT VIEW, UNMODIFIED. Same component, same props shape,
						same render path as /foundry. Only `versionId` differs, because
						the thing being decided about is not published yet.
					-->
					<FoundryDetail
						app={selected}
						versionId={underReview?.id ?? null}
						{transports}
						{coverUrl}
						frameHeight="52vh"
						runningLabel={underReview ? `Running build ${underReview.ordinal}` : ''}
					/>
				</div>
				<div class="fdy-q-insp">
					{#if underReview}
						<!-- `coverUrl` is handed down because the inspector's metadata
						     editor shows the current cover beside Replace. It is the SAME
						     injected builder the detail view uses, so the two panes cannot
						     end up resolving one stored path two different ways. -->
						<FoundryInspector
							app={selected}
							version={underReview}
							{transports}
							{coverUrl}
							onDecided={() => onDecided?.()}
							onDeleted={() => onDeleted?.()}
						/>
					{:else}
						<!--
							NOTHING SUBMITTED IS NOT NOTHING TO DO. A shelved app, or one
							whose submission was withdrawn, still needs Restore and Delete
							reachable -- so the inspector is mounted with no version to
							decide about rather than replaced by a sentence. `version` is
							required, so it is handed the app's own newest version; every
							control the inspector draws from it (the file tree, the source,
							the decision form) is transport-gated and the review transports
							for those are still present, which is correct: reading the
							bytes of a withdrawn build is exactly what a reviewer deciding
							whether to delete it needs.
						-->
						<p class="fdy-q-empty">
							Nothing is submitted for this app. It may have been withdrawn, already
							decided, or shelved.
						</p>
						{#if newestVersion}
							<FoundryInspector
								app={selected}
								version={newestVersion}
								{transports}
								{coverUrl}
								onDecided={() => onDecided?.()}
								onDeleted={() => onDeleted?.()}
							/>
						{/if}
					{/if}
				</div>
			</div>
			</div>
		{/key}
	{/if}
</ClassSplit>

<style>
	.fdy-q-pane {
		display: flex;
		flex-direction: column;
		gap: var(--space-3, 0.75rem);
		min-width: 0;
	}

	.fdy-q-head {
		display: flex;
		align-items: baseline;
		gap: var(--space-2, 0.5rem);
	}

	.fdy-q-head h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.25rem;
	}

	.fdy-q-count {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--fg-st-draft-ink, var(--dim));
	}

	/* The count heats while work waits: the submitted state's own ink
	   (measured in forge.css, 9.03:1 on the card), not a new colour. */
	.fdy-q-count[data-hot] {
		color: var(--fg-st-heat-ink, var(--amber));
	}

	.fdy-q-empty {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--text-2, var(--dim));
	}

	.fdy-q-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2, 0.5rem);
	}

	.fdy-q-row {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-height: 44px;
		padding: var(--space-3, 0.75rem);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-md, 8px);
		background: var(--surface-1, var(--bg1));
		text-decoration: none;
		color: inherit;
		min-width: 0;
	}

	.fdy-q-row:hover,
	.fdy-q-row:focus-visible,
	.fdy-q-row.selected {
		border-color: var(--green);
	}

	.fdy-q-title {
		font-family: var(--font-display);
		font-size: 1rem;
		color: var(--text-1, var(--white));
		overflow-wrap: anywhere;
	}

	.fdy-q-by {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--cyan);
	}

	.fdy-q-wait {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-2, var(--dim));
	}

	.fdy-q-chip {
		margin-top: 0.2rem;
	}

	.fdy-q-shelf {
		display: flex;
		flex-direction: column;
		gap: var(--space-2, 0.5rem);
		border-top: 1px solid var(--hairline);
		padding-top: var(--space-3, 0.75rem);
		min-width: 0;
	}

	.fdy-q-shelf h3 {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--fg-st-shelf-ink, var(--text-2));
	}

	.fdy-q-flag {
		margin-left: 0.4rem;
		color: var(--amber);
	}

	/*
	   ONE COLUMN BY DEFAULT, in review order: the app, then the inspector
	   (tree, source, decision). This is what a phone gets, and it is the honest
	   answer -- two 187px columns would be neither a readable app nor readable
	   source.
	*/
	.fdy-q-shell {
		container: fdy-work / inline-size;
		min-width: 0;
	}

	.fdy-q-work {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5, 1.25rem);
		min-width: 0;
	}

	.fdy-q-app,
	.fdy-q-insp {
		min-width: 0;
	}

	/*
	   SIDE BY SIDE ONLY WHERE THERE IS ROOM FOR BOTH, AND THE QUERY IS ON THE
	   WORK AREA RATHER THAN THE VIEWPORT. This grid sits inside the split's
	   detail pane, which is narrower than the window by the whole width of the
	   queue list -- measured at a 1440px viewport the pane is 857px, not 1440 --
	   so a viewport media query would promise two columns the pane cannot
	   deliver. That is not hypothetical: this rule was written at 58rem against
	   the viewport figure and the side-by-side never engaged at 1440 at all.

	   52rem (832px) IS MEASURED, from the source pane's own metrics rather than
	   chosen as a round number. Share Tech Mono at 0.78rem advances 6.74px per
	   character, and the pane costs 26px of padding and border, so:

	     work area   inspector col   characters of source
	     832px           410px            57
	     857px (1440)    438px            61
	     1032px (1920)   541px            76

	   Below 52rem the inspector is under 400px, which is narrower than the app
	   frame beside it is useful at, and stacking gives the source the full 857px
	   (121 characters) instead. LINES SCROLL RATHER THAN WRAP -- `.fdy-source`
	   is `white-space: pre` with its own `overflow: auto` -- so a narrow column
	   costs horizontal scrolling on long lines, never a re-flowed attribute.

	   THE INSPECTOR GETS THE LARGER SHARE (1.1fr against 1fr) because it is the
	   half whose width is load-bearing: the frame beside it is a preview whose
	   content reflows, and the source is text whose lines do not.
	*/
	@container fdy-work (min-width: 52rem) {
		.fdy-q-work {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
			align-items: start;
		}

		/* The inspector follows the app down a long page: a reviewer scrolling
		   the build notes must not lose the decision form off the top. */
		.fdy-q-insp {
			position: sticky;
			top: var(--space-4, 1rem);
			max-height: calc(100vh - 2rem);
			overflow: auto;
		}
	}
</style>
