<script lang="ts">
	/**
	 * `/armory/download`: the Windows app. The files come from a private GitHub
	 * release through the site (`/armory/download/<file>`); without the server's
	 * token there is no link at all, only where to get the flash drive.
	 */
	import { sizeWords } from './view';

	interface DownloadFile {
		name: string;
		size: number;
		sha256: string | null;
		kind: 'laptop' | 'flash-drive' | 'other';
	}

	let { release }: { release: { tag: string; files: DownloadFile[] } | null } = $props();

	const WORDS = {
		laptop: { title: 'Your own laptop', body: 'The normal installer. Double-click it, signed in as yourself.' },
		'flash-drive': {
			title: 'Lab computers (flash drive)',
			body: 'Extract All onto a flash drive, then on each computer double-click "Install IDEA Armory.cmd".'
		},
		other: { title: 'Other file', body: '' }
	} as const;
</script>

<p class="ar-lead" data-testid="armory-webview">
	The app needs Microsoft Edge WebView2, which Windows 11 already includes. It never asks for an
	administrator password, and uninstalling it never deletes your files.
</p>

{#if !release}
	<div class="ar-notice" role="status" data-testid="armory-flash-drive">
		<span class="ar-notice-glyph" aria-hidden="true">!</span>
		<div>
			<strong>Ask Mr. Pina for the Armory flash drive.</strong>
			The download is not available from this page yet.
		</div>
	</div>
{:else}
	<div class="ar-downloads" data-testid="armory-downloads">
		{#each release.files.filter((f) => f.kind !== 'other') as file (file.name)}
			<div class="ar-panel ar-download">
				<h3>{WORDS[file.kind].title}</h3>
				<p>{WORDS[file.kind].body}</p>
				<a class="ar-btn" href={`/armory/download/${encodeURIComponent(file.name)}`} download={file.name}>
					Download {file.name}
				</a>
				<p class="ar-message">{sizeWords(file.size)} · {release.tag}</p>
				{#if file.sha256}
					<p class="ar-hash" data-testid="armory-sha">SHA-256 {file.sha256}</p>
				{/if}
			</div>
		{/each}
	</div>
{/if}
