<script lang="ts">
	import { fileKindLabel, formatBytes } from '$lib/classroom/classroom';
	import {
		isSubmissionFileImage,
		submissionFileSrc,
		type SubmissionFileRow
	} from '$lib/classroom/assignment-spec';

	/**
	 * The plain (non-block) hand-in files on a submission: image thumbnail with
	 * expand-to-full-view on click, a clear type badge for anything else. The
	 * AttachmentList convention applied to SubmissionFileRow -- ONE renderer, so
	 * a student's own "Extra files" list and a teacher's "Files handed in" list
	 * in the grading console can never drift into showing different things.
	 */
	let {
		files,
		onremove = null,
		removing = null,
		emptyText = 'Nothing attached yet.'
	}: {
		files: SubmissionFileRow[];
		/** Teacher/student-editable only; omitted entirely on read-only views. */
		onremove?: ((f: SubmissionFileRow) => void) | null;
		removing?: string | null;
		emptyText?: string;
	} = $props();

	// A broken fetch is an ordinary outcome (an expired session, a Drive
	// hiccup), so a failed image falls back to the file row rather than a
	// broken-image glyph.
	let broken = $state<Record<string, boolean>>({});
</script>

{#if files.length}
	<ul class="file-list">
		{#each files as f (f.id)}
			<li class="file-row" class:image={isSubmissionFileImage(f) && !broken[f.id]}>
				{#if isSubmissionFileImage(f) && !broken[f.id]}
					<a class="file-preview" href={submissionFileSrc(f.id)} target="_blank" rel="noopener noreferrer">
						<img
							src={submissionFileSrc(f.id)}
							alt={f.caption ?? f.filename}
							loading="lazy"
							onerror={() => (broken = { ...broken, [f.id]: true })}
						/>
					</a>
				{/if}
				<span class="file-meta">
					<a class="file-name" href={submissionFileSrc(f.id)} target="_blank" rel="noopener noreferrer">
						{#if !isSubmissionFileImage(f) || broken[f.id]}
							<span class="file-glyph" aria-hidden="true">{fileKindLabel(f.filename, f.mime_type)}</span>
						{/if}
						{f.filename}
					</a>
					{#if f.size_bytes}<span class="file-size">{formatBytes(f.size_bytes)}</span>{/if}
					{#if onremove}
						<button
							type="button"
							class="file-remove"
							disabled={removing === f.id}
							onclick={() => onremove?.(f)}
						>
							{removing === f.id ? 'Removing...' : 'Remove'}
						</button>
					{/if}
				</span>
			</li>
		{/each}
	</ul>
{:else}
	<p class="note">{emptyText}</p>
{/if}

<style>
	.file-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.file-row {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 0;
	}
	.file-preview {
		display: block;
		max-width: 100%;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		overflow: hidden;
		background: var(--surface-2);
		line-height: 0;
	}
	.file-preview img {
		display: block;
		max-width: 100%;
		max-height: 22rem;
		width: auto;
		height: auto;
		object-fit: contain;
	}
	.file-meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		min-width: 0;
	}
	.file-name {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--text-1);
		text-decoration: none;
		font-size: 0.88rem;
		overflow-wrap: anywhere;
		min-width: 0;
	}
	.file-name:hover {
		color: var(--gold);
	}
	.file-glyph {
		flex: none;
		display: inline-flex;
		align-items: center;
		height: 1.3rem;
		padding: 0 0.35rem;
		font-family: var(--font-mono);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.03em;
		color: var(--gold);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
	}
	.file-size {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		color: var(--text-2);
		white-space: nowrap;
	}
	.file-remove {
		appearance: none;
		background: none;
		border: 1px solid var(--hairline);
		border-radius: 999px;
		color: var(--crimson);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		padding: 0.1rem 0.5rem;
		cursor: pointer;
	}
	.file-remove:disabled {
		color: var(--text-3);
		cursor: default;
	}
	.note {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-2);
	}
</style>
