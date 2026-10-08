<script lang="ts">
	/**
	 * "How Armory works", in the words a student uses: the four verbs (the
	 * contract's C8 words, `VERBS`), versions and side versions. Short on
	 * purpose; it sits on the projects page and the setup page.
	 *
	 * `folded` (the projects page): a `$lib/Disclosure` that arrives closed once
	 * a computer of theirs is connected, because by then they have read it. Left
	 * out, the panel is always open (the setup page, where it is the point).
	 */
	import Disclosure from '$lib/Disclosure.svelte';
	import { VERBS } from './view';

	let { folded = null }: { folded?: boolean | null } = $props();
</script>

{#snippet list()}
	<dl class="ar-how-list">
		<div>
			<dt>{VERBS.checkOut}</dt>
			<dd>Opening a part in SolidWorks checks it out to you. Everyone else sees who has it and can still open it to look.</dd>
		</div>
		<div>
			<dt>{VERBS.checkIn}</dt>
			<dd>Saving and closing checks it in. Your save becomes the newest version on every computer in the project.</dd>
		</div>
		<div>
			<dt>Versions</dt>
			<dd>Every check in is kept. Open a file here to see each version, who saved it and when, and download an old one.</dd>
		</div>
		<div>
			<dt>Side versions</dt>
			<dd>
				If you save a file someone else had checked out, or save from an older copy, your work is kept as a side
				version beside the main one. Nothing is ever thrown away.
			</dd>
		</div>
		<div>
			<dt>{VERBS.undo} and {VERBS.takeBack}</dt>
			<dd>
				{VERBS.undo} gives a file back without saving. A mentor, a CAD lead or a site admin can use {VERBS.takeBack} on a file
				someone forgot to check in; their unsaved changes are kept as a side version.
			</dd>
		</div>
	</dl>
{/snippet}

{#if folded === null}
	<section class="ar-panel ar-how" aria-labelledby="ar-how-h" data-testid="armory-how">
		<h2 id="ar-how-h">How Armory works</h2>
		{@render list()}
	</section>
{:else}
	<section class="ar-panel ar-how" data-testid="armory-how">
		<Disclosure label="How Armory works" collapseWhen={folded} testId="armory-how-toggle">
			{@render list()}
		</Disclosure>
	</section>
{/if}
