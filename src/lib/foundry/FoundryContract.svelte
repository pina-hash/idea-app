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
	import { FOUNDRY_STARTER_PATH } from './vendor.ts';

	let { contract }: { contract: string } = $props();

	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout> | null = null;

	async function copyAll() {
		try {
			await navigator.clipboard.writeText(contract);
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
</script>

<div class="fdy-contract-page">
	<header class="fdy-head">
		<div class="fdy-head-text">
			<h1>Build contract</h1>
			<p>
				These are the rules your app is checked against when you upload it. They are written
				as instructions for an AI tool, because that is usually what is reading them. Copy the
				whole thing and paste it in before you ask for an app.
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

	<pre class="fdy-contract" data-testid="contract-text">{contract}</pre>
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
</style>
