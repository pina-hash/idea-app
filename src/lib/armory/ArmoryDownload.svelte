<script lang="ts">
	/**
	 * `/armory/download`: every file of the latest Windows app release. The
	 * one-click "Get the Windows app" is `/armory/get`; this page is for the
	 * flash-drive build and the SHA-256 fingerprints. A file whose `href` is
	 * null is not linked at all, and with no release there is only where to get
	 * the flash drive.
	 */
	import { sizeWords } from './view';

	interface DownloadFile {
		name: string;
		size: number;
		sha256: string | null;
		kind: 'laptop' | 'flash-drive' | 'other';
		href: string | null;
	}

	let { release }: { release: { tag: string; files: DownloadFile[] } | null } = $props();

	const WORDS = {
		laptop: { title: 'Your own computer', body: 'The normal installer. Double-click it, signed in to Windows as yourself.' },
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
		{#each release.files.filter((f) => f.kind !== 'other' && f.href) as file (file.name)}
			<div class="ar-panel ar-download">
				<h3>{WORDS[file.kind].title}</h3>
				<p>{WORDS[file.kind].body}</p>
				<a class="btn ar-btn" href={file.href} download={file.name} data-testid="armory-download-link">
					Download {file.name}
				</a>
				<p class="ar-message">{sizeWords(file.size)} · version {release.tag}</p>
				{#if file.sha256}
					<p class="ar-hash" data-testid="armory-sha">SHA-256 {file.sha256}</p>
				{/if}
			</div>
		{/each}
	</div>
{/if}
