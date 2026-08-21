<script lang="ts">
	import {
		attachmentSrc,
		fileKindLabel,
		figureReference,
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
	 * drive.
	 *
	 * IT NO LONGER TAKES A `viewAs`. That prop appended `?as=<email>` so an
	 * impersonated page was answered as that student; the classroom view-as
	 * class and item previews are gone and the proxy no longer reads the
	 * parameter, so every list here is the caller's own read.
	 */
	let {
		attachments,
		onremove = null,
		removing = null,
		resolveSrc = null,
		figureRefs = false
	}: {
		attachments: ClassroomAttachment[];
		/** Teacher-only; omitted entirely on the student-facing views. */
		onremove?: ((a: ClassroomAttachment) => void) | null;
		removing?: string | null;
		/**
		 * Overrides how a source URL is built -- for the instructor-only list,
		 * which goes through its OWN proxy rather than
		 * the student-facing one attachmentSrc builds.
		 */
		resolveSrc?: ((a: ClassroomAttachment) => string) | null;
		/**
		 * THE AUTHORING AFFORDANCE FOR FIGURES, and it is off by default.
		 *
		 * An author writing `![alt](attachment:<filename>)` has to get the
		 * filename exactly right, and the only place it is written down is the
		 * row they are looking at. Making them retype it -- or worse, hunt for it
		 * in a Drive folder -- is how the reference ends up pointing at
		 * `Photo (1).JPG` when the file is `photo (1).jpg`.
		 *
		 * TURNED ON ONLY WHERE THE VIEWER MANAGES THE ITEM, and only on the
		 * STUDENT-FACING list. It is deliberately not offered on the
		 * instructor-only list (0090): those files resolve through their own proxy
		 * which `resolveFigureSrc` never calls, so a reference to one could not
		 * work -- and if it ever did, it would be embedding an instructor-only
		 * file into prose every student in the class reads.
		 */
		figureRefs?: boolean;
	} = $props();

	const srcOf = (a: ClassroomAttachment) => resolveSrc?.(a) ?? attachmentSrc(a.id);

	/** Which row is showing its "copied" confirmation, and the timer clearing it. */
	let copied = $state<string | null>(null);
	let copyTimer: ReturnType<typeof setTimeout> | null = null;

	async function copyRef(a: ClassroomAttachment) {
		// ONE SPELLING OF THE REFERENCE, shared with the resolver (classroom.ts),
		// so what an author is handed is by construction what the parser reads.
		const ref = figureReference(a.filename);
		try {
			await navigator.clipboard.writeText(ref);
		} catch {
			// A denied or unavailable clipboard is ordinary (an insecure origin, a
			// permission prompt dismissed). Falling back to a selected textarea
			// keeps the string reachable rather than reporting a failure the
			// author can do nothing with.
			const scratch = document.createElement('textarea');
			scratch.value = ref;
			scratch.setAttribute('readonly', '');
			scratch.style.position = 'fixed';
			scratch.style.opacity = '0';
			document.body.appendChild(scratch);
			scratch.select();
			try {
				document.execCommand('copy');
			} catch {
				/* Nothing further to offer; the confirmation below is not shown. */
			}
			document.body.removeChild(scratch);
		}
		copied = a.id;
		if (copyTimer) clearTimeout(copyTimer);
		copyTimer = setTimeout(() => (copied = null), 2000);
	}

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
						{#if !isImageAttachment(a)}
							<span class="attach-glyph" aria-hidden="true">{fileKindLabel(a.filename, a.mime_type)}</span>
						{/if}
						{a.filename}
					</a>
					{#if a.size_bytes}<span class="attach-size">{formatBytes(a.size_bytes)}</span>{/if}
					<!-- Images only: a figure is an image, and offering the reference
					     beside a PDF would hand an author a string that resolves to a
					     refusal. `isImageAttachment` already excludes SVG, which the
					     resolver refuses outright, so the two agree without a second
					     rule here. A visible WORD, not a glyph: a phone cannot hover
					     and a tooltip is not discoverable. -->
					{#if figureRefs && isImageAttachment(a)}
						<button
							type="button"
							class="attach-ref"
							data-testid="attach-figure-ref"
							onclick={() => copyRef(a)}
						>
							{copied === a.id ? 'Reference copied' : 'Copy figure reference'}
						</button>
					{/if}
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
	.attach-size {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		color: var(--text-2);
		white-space: nowrap;
	}
	/* 44px MINIMUM, PER IDEA_INTERFACE_STANDARDS 10. Measured at 131x16 when
	   this first shipped, which is under even the absolute 24px floor. A teacher
	   authoring on a phone can reach this control, so it takes the touch target
	   rather than the console floor. The pill keeps its type scale; only the box
	   grows, so the row's reading weight is unchanged. */
	.attach-ref {
		appearance: none;
		background: none;
		border: 1px solid var(--hairline);
		border-radius: 999px;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		padding: 0.1rem 0.75rem;
		min-height: 44px;
		cursor: pointer;
	}
	.attach-ref:hover {
		color: var(--gold);
		border-color: var(--gold);
	}
	/* PRE-EXISTING, and raised in the same pass for the same reason: it is the
	   adjacent sibling in this row and also measured 16px. One compliant control
	   beside one non-compliant one reads as a broken row rather than a fixed one,
	   so the two move together. */
	.attach-remove {
		appearance: none;
		background: none;
		border: 1px solid var(--hairline);
		border-radius: 999px;
		color: var(--crimson);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		padding: 0.1rem 0.75rem;
		min-height: 44px;
		cursor: pointer;
	}
	.attach-remove:disabled {
		color: var(--text-3);
		cursor: default;
	}

	/* AUTHORING CHROME NEVER PRINTS. The reference string is a thing you paste
	   into a spec, so on paper it is a button nobody can press beside a filename
	   that is already there. */
	@media print {
		.attach-ref {
			display: none;
		}
	}
</style>
