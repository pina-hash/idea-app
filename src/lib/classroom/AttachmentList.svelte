<script lang="ts">
	import {
		attachmentSrc,
		formatBytes,
		isImageAttachment,
		type ClassroomAttachment
	} from '$lib/classroom/classroom';

	/**
	 * Attachments on a post or an assignment. ONE renderer, mounted by the
	 * stream, the classwork detail and the composer's existing-files list (the
	 * NotebookPhotos convention), so the student view and the teacher view can
	 * never drift into showing different things.
	 *
	 * Every src goes through attachmentSrc -> the app's own RLS-enforcing proxy;
	 * there is deliberately no drive.google.com link anywhere, since that only
	 * renders for a viewer who personally has access to the school's shared
	 * drive. `viewAs` rides through so an impersonated page is answered as that
	 * student would be.
	 */
	let {
		attachments,
		viewAs = null,
		onremove = null,
		removing = null,
		resolveSrc = null
	}: {
		attachments: ClassroomAttachment[];
		viewAs?: string | null;
		/** Teacher-only; omitted entirely on the student-facing views. */
		onremove?: ((a: ClassroomAttachment) => void) | null;
		removing?: string | null;
		/**
		 * Overrides how a source URL is built -- for the instructor-only list,
		 * which goes through its OWN proxy (no ?as= support at all) rather than
		 * the student-facing one attachmentSrc builds.
		 */
		resolveSrc?: ((a: ClassroomAttachment) => string) | null;
	} = $props();

	const srcOf = (a: ClassroomAttachment) => resolveSrc?.(a) ?? attachmentSrc(a.id, viewAs);

	// A broken fetch is an ordinary outcome (an expired session, a Drive
	// hiccup), so a failed image falls back to the file row rather than a
	// broken-image glyph.
	let broken = $state<Record<string, boolean>>({});
</script>

{#if attachments.length}
	<ul class="attach-list">
		{#each attachments as a (a.id)}
			<li class="attach-row" class:image={isImageAttachment(a) && !broken[a.id]}>
				{#if isImageAttachment(a) && !broken[a.id]}
					<a class="attach-preview" href={srcOf(a)} target="_blank" rel="noopener noreferrer">
						<img
							src={srcOf(a)}
							alt={a.filename}
							loading="lazy"
							onerror={() => (broken = { ...broken, [a.id]: true })}
						/>
					</a>
				{/if}
				<span class="attach-meta">
					<a class="attach-name" href={srcOf(a)} target="_blank" rel="noopener noreferrer">
						<span class="attach-glyph" aria-hidden="true">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
								<path d="M14 3v5h5" />
								<path d="M19 8v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2h7z" />
							</svg>
						</span>
						{a.filename}
					</a>
					{#if a.size_bytes}<span class="attach-size">{formatBytes(a.size_bytes)}</span>{/if}
					{#if onremove}
						<button
							type="button"
							class="attach-remove"
							disabled={removing === a.id}
							onclick={() => onremove?.(a)}
						>
							{removing === a.id ? 'Removing...' : 'Remove'}
						</button>
					{/if}
				</span>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.attach-list {
		list-style: none;
		margin: 0.6rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.attach-row {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 0;
	}
	.attach-preview {
		display: block;
		max-width: 100%;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		overflow: hidden;
		background: var(--surface-2);
		line-height: 0;
	}
	.attach-preview img {
		display: block;
		max-width: 100%;
		max-height: 22rem;
		width: auto;
		height: auto;
		object-fit: contain;
	}
	.attach-meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		min-width: 0;
	}
	.attach-name {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--text-1);
		text-decoration: none;
		font-size: 0.88rem;
		overflow-wrap: anywhere;
		min-width: 0;
	}
	.attach-name:hover {
		color: var(--gold);
	}
	.attach-glyph {
		flex: none;
		width: 1.4rem;
		height: 1.4rem;
		display: grid;
		place-items: center;
		color: var(--gold);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
	}
	.attach-glyph svg {
		width: 0.85rem;
		height: 0.85rem;
	}
	.attach-size {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.64rem;
		color: var(--text-2);
		white-space: nowrap;
	}
	.attach-remove {
		appearance: none;
		background: none;
		border: 1px solid var(--hairline);
		border-radius: 999px;
		color: var(--crimson);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		padding: 0.1rem 0.5rem;
		cursor: pointer;
	}
	.attach-remove:disabled {
		color: var(--text-3);
		cursor: default;
	}
</style>
