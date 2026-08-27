<script lang="ts">
	/**
	 * THE BUILD CONTRACT, rendered as one selectable block with a copy button.
	 *
	 * IT IS NOT MARKED UP, and that is deliberate. The text's job is to be
	 * pasted whole into an AI tool, so what matters is that the copied string is
	 * byte-identical to what `foundryBuildContract()` produced -- headings,
	 * indentation and all. Rendering it as styled prose would mean the thing on
	 * screen and the thing on the clipboard were two different documents, and
	 * the one on the clipboard is the one that does the work.
	 *
	 * A COMPONENT RATHER THAN MARKUP IN THE ROUTE, so the dev harness mounts the
	 * identical thing. `/foundry/*` is behind the signed-in gate and the local
	 * project is a placeholder with no session in it, so without this the page
	 * could not be opened in a browser at all.
	 */
	import {
		FOUNDRY_STARTER_PATH,
		foundryContractProfiles,
		type FoundryContractProfileId
	} from './preflight.ts';

	let { contract }: { contract: string } = $props();

	/**
	 * SIX PROFILES, ONE SET OF RULES.
	 *
	 * Each profile is a situation-specific preamble followed by the SAME
	 * generated core, so what changes between tabs is the advice and never the
	 * rules. They are read from `preflight.ts` here rather than handed in as a
	 * prop, which keeps this component's signature exactly what it was -- the
	 * route and the dev harness both still mount it with one `contract` string
	 * and neither had to learn about profiles to keep working.
	 */
	const profiles = foundryContractProfiles();

	let selected = $state<FoundryContractProfileId>('new');

	const current = $derived(profiles.find((p) => p.id === selected) ?? profiles[0]);

	/**
	 * THE `new` PROFILE IS `foundryBuildContract()`, WHICH IS WHAT THE SERVER
	 * SENT, so the default tab renders the string that arrived in the first
	 * response rather than a second generation of it. That matters for one
	 * frame only and costs one branch, and the equality is pinned by a test
	 * rather than assumed here -- if the two ever diverge, the test says so
	 * instead of the page quietly showing one document and copying another.
	 */
	const shown = $derived(selected === 'new' ? contract : current.text);

	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout> | null = null;

	async function copyAll() {
		try {
			await navigator.clipboard.writeText(shown);
			copied = true;
		} catch {
			// A clipboard the browser refused is not worth a panel: the text is
			// on screen, selectable, and one Ctrl+A away.
			copied = false;
			return;
		}
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => (copied = false), 1800);
	}

	/** Selecting a profile replaces the document, so a stale "Copied" would be
	    reporting the previous one. */
	function pick(id: FoundryContractProfileId) {
		selected = id;
		copied = false;
	}
</script>

<div class="fdy-contract-page">
	<header class="fdy-head">
		<div class="fdy-head-text">
			<h1>Build contract</h1>
			<p>
				These are the rules your app is checked against when you upload it. They are written
				as instructions for an AI tool, because that is usually what is reading them. Pick the
				version that matches what you are doing, copy the whole thing, and paste it in before
				you ask for an app.
			</p>
		</div>
		<div class="fdy-head-actions">
			<button type="button" class="btn fdy-primary tap-44" onclick={copyAll}>
				{copied ? 'Copied' : 'Copy everything'}
			</button>
			<!--
				A DOWNLOAD, NOT A SECOND COPY BUTTON. The contract is pasted into
				a tool; the starter is saved and edited. Two different actions on
				two different things, so they read as two controls.
			-->
			<a class="btn tap-44" href={FOUNDRY_STARTER_PATH} download="index.html">
				Download starter file
			</a>
			<a class="btn tap-44" href="/foundry/submit">Upload an app</a>
		</div>
	</header>

	<!--
		THE PICKER IS A RADIO GROUP, NOT A ROW OF BUTTONS AND NOT A <select>.
		One of six is chosen and the choice persists on screen, which is what a
		radio group means; arrow-key navigation between the six comes free and a
		reader is told "3 of 6" rather than having to count. A <select> would
		hide the one-line description that is the whole reason a student can
		tell these apart.

		EACH OPTION CARRIES ITS OWN SENTENCE. A label alone ("Porting a game")
		is a guess; the sentence under it is the picker saying which to pick.
	-->
	<fieldset class="fdy-profiles" data-testid="contract-profiles">
		<legend>Which one are you doing?</legend>
		<div class="fdy-profile-grid">
			{#each profiles as p (p.id)}
				<label class="fdy-profile tap-44" class:fdy-profile-on={selected === p.id}>
					<input
						type="radio"
						name="contract-profile"
						value={p.id}
						checked={selected === p.id}
						onchange={() => pick(p.id)}
					/>
					<span class="fdy-profile-body">
						<span class="fdy-profile-label">{p.label}</span>
						<span class="fdy-profile-pick">{p.pick}</span>
					</span>
				</label>
			{/each}
		</div>
	</fieldset>

	<pre class="fdy-contract" data-testid="contract-text">{shown}</pre>
</div>

<style>
	/*
	 * Two regions side by side once there is room: the explanation reads at a
	 * measure, the actions sit where a reader who already knows what this is can
	 * reach them without scrolling past the prose.
	 */
	.fdy-head {
		display: flex;
		gap: var(--space-4, 1rem);
		align-items: flex-start;
		flex-wrap: wrap;
		margin-bottom: var(--space-4, 1rem);
	}

	.fdy-head-text {
		flex: 1;
		min-width: min(28rem, 100%);
	}

	.fdy-head h1 {
		margin: 0 0 0.35rem;
		font-family: var(--font-display);
		font-size: 1.7rem;
	}

	.fdy-head p {
		margin: 0;
		color: var(--text-2);
		line-height: 1.5;
		max-width: 62ch;
	}

	.fdy-head-actions {
		display: flex;
		gap: var(--space-2, 0.5rem);
		flex-wrap: wrap;
	}

	/*
	 * Monospace and preserved whitespace, because the copied string is the
	 * deliverable. `pre-wrap` rather than `pre`: the contract is already
	 * hard-wrapped at a readable width, and letting a long line push the
	 * document wider than the viewport would break the page at 375px to
	 * preserve a line break the text does not depend on.
	 */
	.fdy-contract {
		margin: 0;
		background: var(--bg1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-md, 8px);
		padding: var(--space-4, 1rem);
		font-family: var(--font-mono);
		font-size: 0.85rem;
		line-height: 1.55;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		overflow-x: auto;
		color: var(--white);
	}

	.fdy-primary {
		border-color: var(--green);
		color: var(--green);
	}

	.fdy-profiles {
		border: 1px solid var(--boundary);
		border-radius: var(--radius-md, 8px);
		padding: var(--space-3, 0.75rem);
		margin: 0 0 var(--space-3, 0.75rem);
	}

	.fdy-profiles legend {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
		padding: 0 0.4rem;
	}

	/*
	 * auto-fit rather than auto-fill, so three profiles would get three columns
	 * and not three plus a void; minmax(min(<col>, 100%), 1fr) so the same rule
	 * is the single narrow column at 375px with no breakpoint of its own.
	 */
	.fdy-profile-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(19rem, 100%), 1fr));
		gap: var(--space-2, 0.5rem);
	}

	/*
	 * The whole label is the target, which is what a finger hits. `tap-44` sets
	 * a min-height on it; the two lines inside already exceed that at every
	 * width, so the class is the floor rather than the size.
	 */
	.fdy-profile {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2, 0.5rem);
		padding: var(--space-2, 0.5rem);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-sm, 6px);
		background: var(--bg2);
		cursor: pointer;
		/* min-width: 0, or a long label's min-content widens the grid track
		   past the viewport. */
		min-width: 0;
	}

	.fdy-profile-on {
		border-color: var(--green);
	}

	.fdy-profile input {
		flex: none;
		margin-top: 0.25rem;
		accent-color: var(--green);
	}

	.fdy-profile-body {
		display: grid;
		gap: 0.15rem;
		min-width: 0;
	}

	.fdy-profile-label {
		font-family: var(--font-display);
		font-size: 1rem;
		color: var(--white);
	}

	/*
	 * `--text-2`, not `--dim`: this is real secondary copy on `--bg2`, where
	 * `--dim` measures 4.24:1 and does not clear the text threshold.
	 */
	.fdy-profile-pick {
		font-size: 0.85rem;
		line-height: 1.45;
		color: var(--text-2);
	}
</style>
