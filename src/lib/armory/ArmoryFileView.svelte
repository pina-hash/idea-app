<script lang="ts">
	/**
	 * `/armory/[project]/file/[file]`: whether the file is checked out (and by
	 * whom, on which computer, since when) or available, and every saved
	 * version and side version, newest first, each with who saved it and when.
	 * Since ledger 0366 every version and side version has a Download, through
	 * a signed fifteen-minute URL; an omitted `downloadHref` (file storage not
	 * switched on) removes the control and the panel says why.
	 */
	import {
		fileState,
		holderNames,
		personName,
		sideReasonWords,
		sizeWords,
		STATE_WORDS,
		stateDetail,
		whenWords,
		type ArmoryCheckout,
		type ArmoryFile,
		type ArmoryHistoryEntry
	} from './view';

	let {
		file,
		history,
		now,
		deviceSeen = {},
		checkouts = [],
		downloadHref = null
	}: {
		file: ArmoryFile;
		history: ArmoryHistoryEntry[];
		now: number;
		deviceSeen?: Record<string, number>;
		checkouts?: ArmoryCheckout[];
		downloadHref?: ((versionId: string) => string) | null;
	} = $props();

	const state = $derived(fileState(file, now, new Map(Object.entries(deviceSeen))));
	const words = $derived(STATE_WORDS[state]);
	const names = $derived(holderNames(checkouts));
	const versions = $derived(history.filter((h) => h.kind === 'version').length);
	const sides = $derived(history.filter((h) => h.kind === 'side_version').length);

	const KIND = {
		version: { label: 'Version', glyph: '●' },
		side_version: { label: 'Side version', glyph: '◇' },
		tombstone: { label: 'Removed', glyph: '−' }
	} as const;
</script>

<section class="ar-panel" aria-labelledby="ar-now-h" data-testid="armory-holder">
	<h2 id="ar-now-h">Right now</h2>
	<div class="ar-holder">
		<span class={`ar-file-glyph ar-tone-${words.tone}`} aria-hidden="true">{words.glyph}</span>
		<p class="ar-file-line ar-holder-line" data-testid="armory-holder-line">
			<span class={`ar-state ar-tone-${words.tone}`}>{words.label}</span>{stateDetail(file, state, now, names)}
		</p>
	</div>
	{#if file.folder}<p class="ar-message">In the folder <code>{file.folder}</code></p>{/if}
</section>

<section class="ar-panel" aria-labelledby="ar-history-h">
	<h2 id="ar-history-h">History</h2>
	<p class="ar-message" style="margin: 0 0 0.5rem">
		{versions} {versions === 1 ? 'version' : 'versions'}{sides > 0 ? `, ${sides} side ${sides === 1 ? 'version' : 'versions'}` : ''}.
		A side version is a save that could not become the main version, kept so no work is ever lost.
		{downloadHref ? 'Download any of them to open an older copy.' : 'Downloads start once file storage is switched on.'}
	</p>
	{#if history.length === 0}
		<p class="ar-lead" data-testid="armory-history-empty">Nothing has been saved to this file yet.</p>
	{:else}
		<ol class="ar-history" data-testid="armory-history">
			{#each history as entry (entry.kind + entry.id)}
				{@const kind = KIND[entry.kind]}
				<li class={`ar-entry ${entry.kind === 'side_version' ? 'side' : ''}`} data-kind={entry.kind}>
					<span class="ar-file-glyph" aria-hidden="true">{kind.glyph}</span>
					<span class="ar-entry-head">
						<span class="ar-entry-kind">{kind.label}{entry.id === file.current?.id ? ' (current)' : ''}</span>
						{#if downloadHref && entry.kind !== 'tombstone' && entry.hash}
							<a class="btn secondary ar-btn ar-entry-get" href={downloadHref(entry.id)} data-testid="armory-version-download">
								Download<span class="ar-visually-hidden"> {kind.label.toLowerCase()} from {whenWords(entry.created_at, now)}</span>
							</a>
						{/if}
					</span>
					<span class="ar-entry-meta">
						{personName(entry.author)}, {whenWords(entry.created_at, now)}{entry.kind !== 'tombstone' ? ` · ${sizeWords(entry.bytes)}` : ''}
					</span>
					{#if entry.kind === 'side_version'}
						<span></span><span class="ar-entry-why">{sideReasonWords(entry.reason)}</span>
					{/if}
					{#if entry.hash}
						<span></span><span class="ar-hash" title="The file's fingerprint (SHA-256)">{entry.hash.slice(0, 16)}…</span>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
</section>
