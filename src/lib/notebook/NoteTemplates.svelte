<script lang="ts">
	import { NOTE_TEMPLATES, type NoteTemplate } from '$lib/notebook/note-templates';

	/**
	 * THE THREE TEMPLATES, as one row of buttons under the box (ledger 0298,
	 * R32). Each one's word is its whole explanation; what it does is put its
	 * headings into the note, where the student can see and change them. The
	 * list and its wording are `NOTE_TEMPLATES`, the one place they are written.
	 */
	let {
		onInsert,
		disabled = false
	}: { onInsert: (template: NoteTemplate) => void; disabled?: boolean } = $props();
</script>

<div class="templates" role="group" aria-label="Start from a template" data-testid="nb-templates">
	{#each NOTE_TEMPLATES as t (t.id)}
		<button
			type="button"
			class="template"
			data-testid="nb-template-{t.id}"
			{disabled}
			onclick={() => onInsert(t)}
		>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
				<path d="M12 5v14M5 12h14" stroke-linecap="round" />
			</svg>
			{t.label}
		</button>
	{/each}
</div>

<style>
	.templates {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		min-width: 0;
	}
	.template {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		/* A student-facing control at every width (IDEA_INTERFACE_STANDARDS 10). */
		min-height: 44px;
		padding: 0 var(--space-3);
		/* --boundary, never a hairline: this edge is the outer edge of an
		   interactive control (CLAUDE.md, the boundary token). Dashed, because
		   what it adds is optional. */
		border: 1px dashed var(--boundary);
		border-radius: 999px;
		background: transparent;
		color: var(--text-2);
		font: inherit;
		font-size: 0.8rem;
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
	}
	.template svg {
		width: 0.9rem;
		height: 0.9rem;
		flex: none;
	}
	.template:hover:not(:disabled) {
		border-color: var(--nb-accent-ink);
		color: var(--nb-accent-ink);
		border-style: solid;
	}
	.template:disabled {
		opacity: 0.55;
		cursor: default;
	}
</style>
