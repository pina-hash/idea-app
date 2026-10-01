<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import Disclosure from '$lib/Disclosure.svelte';
	import BadgeIcon from '$lib/tournaments/BadgeIcon.svelte';
	import {
		CLASS_THEME_PALETTES,
		CLASS_THEME_PATTERNS,
		classThemeBallot,
		classThemePollMs,
		classThemeWords,
		patternCss,
		resolveClassTheme,
		themeColourCss,
		type ClassThemeFeature,
		type ClassThemeTally,
		type ClassThemeTransports,
		type ClassThemeWinners
	} from '$lib/classroom/class-theme';
	import { startPoller, type Poller, type PollOutcome } from '$lib/classroom/poll';
	import { pollSignedOut } from '$lib/classroom/poll-session';

	/**
	 * THE CLASS THEME VOTE (decision 45, report R07), on the class page, under
	 * the banner it changes.
	 *
	 * WHAT A STUDENT SEES: each feature (palette, pattern, badge) with every
	 * option as a labelled key -- a word beside every colour, never a swatch
	 * alone -- the live COUNT on each, which option is leading, and theirs
	 * pressed. They vote, change a vote, or take it back. WHAT NOBODY SEES is
	 * who voted for what: the tally the database hands back is counts, a voter
	 * total and the caller's own choices, and nothing else reaches this file.
	 *
	 * WHAT A MANAGER SEES: the same counts and no vote keys, because the
	 * database refuses a manager's vote and a control whose only answer is a
	 * refusal is not offered. Opening, closing and resetting the vote live on
	 * the class's Settings tab (`manageHref`).
	 *
	 * ABSENCE IS THE MECHANISM, TWICE. A caller with no transports mounts none
	 * of this. A tally read that answers `unavailable` (the deployment has no
	 * 0225 yet) or "Not found." (the caller is neither a voter nor a manager)
	 * renders NOTHING, silently: neither is a failure somebody can act on.
	 *
	 * THE READ. Once on mount, which is what decides whether there is a panel
	 * at all; then, while the panel is OPEN and the tab is visible, every
	 * `classThemePollMs` and at once on focus or on the tab coming back. A
	 * closed panel asks nothing. Every call into the injected transport and the
	 * caller's callback is untracked, and a sequence number drops an answer
	 * that arrives after a newer one.
	 */
	let {
		courseId,
		transports,
		manageHref = null,
		onwinners = null
	}: {
		courseId: string;
		transports: ClassThemeTransports;
		/** Where a manager opens, closes and resets the vote: the class's Settings tab. */
		manageHref?: string | null;
		/**
		 * Told the winners whenever they change -- after the caller's own vote,
		 * at once, and after a re-read shows a classmate's -- so the banner above
		 * repaints without waiting for a page load. THE COURSE COMES WITH THEM,
		 * from this instance's own prop: a caller that stamped the answer with
		 * whatever course it is showing NOW would file a slow answer from the
		 * class just left under the class just opened (fresh-eyes review).
		 */
		onwinners?: ((winners: ClassThemeWinners, courseId: string) => void) | null;
	} = $props();

	type Phase = 'loading' | 'ready' | 'hidden' | 'error';
	let phase = $state<Phase>('loading');
	let tally = $state<ClassThemeTally | null>(null);
	let readError = $state<string | null>(null);
	let open = $state(false);
	let busy = $state(false);
	/** What the last vote did, in words, for the live region. */
	let said = $state('');
	/** A refusal of the caller's own action, in the database's own sentence. */
	let refusal = $state<string | null>(null);

	const ballot = $derived(classThemeBallot(tally));
	const canVote = $derived(!!tally?.can_vote && !tally.manages);
	const closed = $derived(tally !== null && !tally.voting_open);
	const words = $derived(classThemeWords(resolveClassTheme({ winners: tally?.winners ?? {} })));
	const pollMs = $derived(classThemePollMs(tally?.voting_open ?? true));

	let asked = 0;
	let lastWinners = '';
	/** False once unmounted: an answer that lands after that tells nobody. */
	let alive = true;

	function tell(winners: ClassThemeWinners) {
		if (!alive) return;
		const key = JSON.stringify(winners);
		if (key === lastWinners) return;
		lastWinners = key;
		const notify = onwinners;
		const course = courseId;
		if (notify) untrack(() => notify(winners, course));
	}

	/** One read of the tally; what it reports is the poller's outcome. */
	async function read(): Promise<PollOutcome> {
		const mine = ++asked;
		const t = transports;
		const course = courseId;
		const res = await untrack(() => t.tally(course));
		if (mine !== asked || !alive) return 'ok';
		if (res.ok) {
			tally = res.tally;
			phase = 'ready';
			readError = null;
			tell(res.tally.winners);
			return 'ok';
		}
		if (res.reason === 'unavailable' || res.message === 'Not found.') {
			phase = 'hidden';
			return 'ok';
		}
		if (phase === 'loading' || phase === 'error') {
			phase = 'error';
			readError = res.message;
		} else {
			// A failed re-read keeps what is on screen and says so once.
			readError = res.message;
		}
		return res.signedOut ? 'signed-out' : 'failed';
	}

	onMount(() => {
		void read();
		return () => {
			alive = false;
		};
	});

	/** Opening the panel starts the poll below, whose first read is at once. */
	function openChanged(next: boolean) {
		open = next;
	}

	/* THE POLL, ON THE SHARED POLLER (ledger 0357): only while open, only while
	   visible, and only while there is a panel to be open -- a read that answered
	   `unavailable` takes the panel away, and a poll that outlived it would go on
	   asking. IMMEDIATE, because opening the panel is the moment somebody wants
	   the count; every later read is jittered, waits while the tab is hidden,
	   backs off a failing database, and a signed-out answer stops it. The effect
	   depends on `open` and on whether there is a panel; the poller is started
	   untracked and every read runs untracked inside `read`. A signed-out panel
	   that is closed and opened again starts a fresh poll, whose first read is
	   refused the same way and stops it again: one call per opening, never a
	   loop. */
	const pollShown = $derived(phase === 'ready' || phase === 'error');
	let poller: Poller | null = null;
	$effect(() => {
		const isOpen = open;
		const shown = pollShown;
		if (!isOpen || !shown || typeof document === 'undefined') return;
		const p = untrack(() =>
			startPoller({ intervalMs: pollMs, immediate: true, run: () => read(), onSignedOut: pollSignedOut })
		);
		poller = p;
		return () => {
			p.stop();
			if (poller === p) poller = null;
		};
	});
	/* A vote opening or closing changes the cadence from the next wait on,
	   without restarting the poll (a restart would read again at once). */
	$effect(() => {
		const every = pollMs;
		untrack(() => poller?.setIntervalMs(every));
	});

	function optionLabel(feature: ClassThemeFeature, id: string): string {
		return ballot.find((f) => f.feature === feature)?.options.find((o) => o.id === id)?.label ?? id;
	}

	async function vote(feature: ClassThemeFeature, option: string | null) {
		if (!canVote || closed || busy || !tally) return;
		busy = true;
		refusal = null;
		said = '';
		try {
			const t = transports;
			const res = await untrack(() => t.vote(courseId, feature, option));
			if (res.ok) {
				said =
					option === null
						? `Took back your ${feature} vote.`
						: `Voted for ${optionLabel(feature, option)} ${feature}.`;
				if (!res.withdrawn) tell(res.winners);
				await read();
			} else if (res.reason === 'closed') {
				refusal = 'Voting is closed, so that vote was not counted.';
				await read();
			} else if (res.reason === 'unavailable') {
				phase = 'hidden';
			} else {
				refusal = res.message;
			}
		} finally {
			busy = false;
		}
	}

	/** Both twins of a colour as inline properties; the stylesheet picks one. */
	function swatchVars(id: string): string {
		const p = CLASS_THEME_PALETTES.find((x) => x.id === id);
		if (!p) return '';
		return [
			`--sw-wash:${themeColourCss(p.wash, 'dark')}`,
			`--sw-wash-light:${themeColourCss(p.wash, 'light')}`,
			`--sw-edge:${themeColourCss(p.edge, 'dark')}`,
			`--sw-edge-light:${themeColourCss(p.edge, 'light')}`
		].join(';');
	}

	function patternVars(id: string): string {
		const p = CLASS_THEME_PATTERNS.find((x) => x.id === id);
		return p ? `--sw-pattern:${patternCss(p, 'currentColor')}` : '';
	}

	const votesWord = (n: number) => `${n} vote${n === 1 ? '' : 's'}`;
</script>

{#if phase === 'ready' || phase === 'error'}
	<div class="ctp" data-testid="class-theme-panel">
		<Disclosure
			label="Class theme"
			scope={`class-theme:${courseId}`}
			collapseWhen={true}
			testId="class-theme-toggle"
			onopenchange={openChanged}
		>
			{#snippet meta()}
				<span class="ctp-meta" data-testid="class-theme-words">
					{words || 'Not chosen yet'}{#if closed}&nbsp;· Voting closed{/if}
				</span>
			{/snippet}

			{#if phase === 'error'}
				<p class="note ctp-error" role="alert" data-testid="class-theme-error">{readError}</p>
			{:else if tally}
				<p class="note ctp-lead" data-testid="class-theme-lead">
					{#if tally.manages}
						Your students vote on this class's look. You see the counts; nobody sees who
						voted for what.
						{#if manageHref}
							<a class="tap-44" href={manageHref} data-testid="class-theme-manage">Open or close voting</a>
						{/if}
					{:else}
						Vote on your class's look. The choice with the most votes wins, for every block of
						this class. Only the totals are shown, never who voted for what.
					{/if}
				</p>
				<p class="note ctp-voters" data-testid="class-theme-voters">
					{tally.voters}
					{tally.voters === 1 ? 'person has' : 'people have'} voted so far.
				</p>
				{#if closed}
					<p class="note ctp-closed" id="ctp-closed-{courseId}" data-testid="class-theme-closed">
						Voting is closed. {tally.manages
							? 'You can open it again on the Settings tab.'
							: 'Your teacher can open it again.'}
					</p>
				{/if}
				{#if readError}
					<p class="note ctp-error" data-testid="class-theme-stale">
						The counts could not be refreshed just now: {readError}
					</p>
				{/if}

				{#each ballot as feature (feature.feature)}
					<fieldset class="ctp-feature" data-testid="class-theme-feature" data-feature={feature.feature}>
						<legend class="ctp-legend">
							{feature.label}
							<span class="ctp-hint">{feature.hint}</span>
						</legend>
						<ul class="ctp-options">
							{#each feature.options as opt (opt.id)}
								<li class="ctp-option" data-option={opt.id}>
									{#if canVote}
										<button
											type="button"
											class="btn tiny tap-44 ctp-key"
											class:on={opt.mine}
											aria-pressed={opt.mine}
											aria-disabled={closed || busy}
											aria-describedby={closed ? `ctp-closed-${courseId}` : undefined}
											data-testid="class-theme-vote"
											onclick={() => {
												if (!opt.mine) void vote(feature.feature, opt.id);
											}}
										>
											{@render swatch(feature.feature, opt.id)}
											<span class="ctp-word">{opt.label}</span>
											<span class="ctp-count" data-testid="class-theme-count">{votesWord(opt.votes)}</span>
											{#if opt.mine}<span class="ctp-mine" data-testid="class-theme-mine">Your vote</span>{/if}
											{#if opt.winning}<span class="ctp-leading">Leading</span>{/if}
										</button>
									{:else}
										<span class="ctp-row" data-testid="class-theme-row">
											{@render swatch(feature.feature, opt.id)}
											<span class="ctp-word">{opt.label}</span>
											<span class="ctp-count" data-testid="class-theme-count">{votesWord(opt.votes)}</span>
											{#if opt.winning}<span class="ctp-leading">Leading</span>{/if}
										</span>
									{/if}
								</li>
							{/each}
						</ul>
						{#if canVote && feature.options.some((o) => o.mine)}
							<button
								type="button"
								class="btn tiny tap-44 ctp-withdraw"
								aria-disabled={closed || busy}
								data-testid="class-theme-withdraw"
								onclick={() => void vote(feature.feature, null)}
							>
								Take back my {feature.label.toLowerCase()} vote
							</button>
						{/if}
					</fieldset>
				{/each}
				{#if refusal}
					<p class="note ctp-refusal" role="alert" data-testid="class-theme-refusal">{refusal}</p>
				{/if}
			{/if}
			<!-- Always mounted; only its text moves. -->
			<p class="sr-only" role="status" data-testid="class-theme-said">{said}</p>
		</Disclosure>
	</div>
{/if}

{#snippet swatch(feature: ClassThemeFeature, id: string)}
	{#if feature === 'palette'}
		<span class="ctp-swatch ctp-palette" style={swatchVars(id)} aria-hidden="true"></span>
	{:else if feature === 'pattern'}
		<span class="ctp-swatch ctp-pattern" style={patternVars(id)} aria-hidden="true"></span>
	{:else if id !== 'none'}
		<span class="ctp-glyph" aria-hidden="true"><BadgeIcon {id} size="1.2rem" /></span>
	{:else}
		<span class="ctp-glyph" aria-hidden="true"></span>
	{/if}
{/snippet}

<style>
	.ctp {
		margin: 0 0 var(--space-3, 0.75rem);
		min-width: 0;
	}
	.ctp-meta {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--text-2);
	}
	.ctp-lead,
	.ctp-voters,
	.ctp-closed {
		margin: 0.4rem 0 0;
	}
	.ctp-closed {
		color: var(--text-1);
	}
	.ctp-error,
	.ctp-refusal {
		margin: 0.4rem 0 0;
		padding-left: 0.5rem;
		border-left: 3px solid var(--amber);
		color: var(--text-1);
	}
	.ctp-feature {
		margin: var(--space-3, 0.75rem) 0 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}
	.ctp-legend {
		padding: 0;
		font-weight: 600;
		color: var(--text-1);
	}
	.ctp-hint {
		display: block;
		font-weight: 400;
		font-size: 0.85rem;
		color: var(--text-2);
	}
	.ctp-options {
		list-style: none;
		margin: 0.4rem 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.ctp-option {
		min-width: 0;
	}
	.ctp-key,
	.ctp-row {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem 0.45rem;
		min-height: 44px;
		max-width: 100%;
	}
	.ctp-row {
		padding: 0.25rem 0.6rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card, 6px);
	}
	.ctp-key[aria-disabled='true'] {
		cursor: not-allowed;
	}
	.ctp-word {
		color: inherit;
	}
	.ctp-count {
		font-family: var(--font-mono);
		font-size: 0.75rem;
	}
	.ctp-mine,
	.ctp-leading {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.ctp-withdraw {
		margin-top: 0.4rem;
	}
	/* THE SWATCH IS DECORATION BESIDE A WORD, never the only signal. Both twins
	   arrive inline; this picks one, and the Space White twin under that theme. */
	.ctp-swatch {
		flex: none;
		width: 1.6rem;
		height: 1.1rem;
		border-radius: 3px;
		border: 1px solid var(--boundary);
	}
	.ctp-palette {
		--sw-w: var(--sw-wash);
		--sw-e: var(--sw-edge);
		background: linear-gradient(135deg, var(--sw-w) 0 55%, var(--sw-e) 55% 100%);
	}
	:global(:root[data-theme='space-white']) .ctp-palette {
		--sw-w: var(--sw-wash-light);
		--sw-e: var(--sw-edge-light);
	}
	.ctp-pattern {
		background-image: var(--sw-pattern, none);
		color: var(--text-2);
	}
	.ctp-glyph {
		flex: none;
		display: inline-grid;
		place-items: center;
		width: 1.2rem;
		height: 1.2rem;
	}
	.sr-only {
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
</style>
