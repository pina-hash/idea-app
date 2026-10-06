<script lang="ts">
	/**
	 * "How Armory works", in the words a student uses: the four verbs (the
	 * contract's C8 words, `VERBS`), versions and side versions. Short on
	 * purpose; it sits on the projects page and the setup page.
	 */
	import { VERBS } from './view';
</script>

<section class="ar-panel ar-how" aria-labelledby="ar-how-h" data-testid="armory-how">
	<h2 id="ar-how-h">How Armory works</h2>
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
				{VERBS.undo} gives a file back without saving. A mentor or CAD lead can {VERBS.takeBack.toLowerCase()} a file someone
				forgot to check in; their unsaved changes are kept as a side version.
			</dd>
		</div>
	</dl>
</section>
