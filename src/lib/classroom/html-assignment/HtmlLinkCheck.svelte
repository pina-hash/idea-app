<script lang="ts">
	/**
	 * A STUDENT'S OWN LINK HAND-IN, CHECKED WHERE THEY CAN FIX IT (ledger 0360).
	 *
	 * A worksheet block that declares `link: "presentation"` is a share link the
	 * teacher will open from the grading console and from presentation mode.
	 * This line, in parent chrome under the progress rail, tells the student
	 * whether what they pasted is a link that will open: "Your link: Google
	 * Slides" with a Test it key, or, in words, that it does not look like a link
	 * yet. Finding that out in front of the class is the failure it prevents.
	 *
	 * IT CHECKS AND NEVER GATES. Saving, the progress rail and completion are
	 * untouched: the answer is stored whatever it says (the write gates resolve a
	 * block by id and check its type, and `link` is a display key), so a student
	 * mid-paste is never refused anything. It reads the controller's own `values`
	 * -- what the document was seeded with and reports changes into -- so it moves
	 * as they type, and it renders nothing on a worksheet that declares no link
	 * field or while the field is empty.
	 *
	 * The address it offers comes from `$lib/classroom/answer-links`, the same
	 * reading the teacher's surfaces use, so "Your link works" here means the
	 * teacher gets an Open key.
	 */
	import { linkHostLabel, presentationUrl } from '$lib/classroom/answer-links';
	import { htmlAnswerSheet } from './mount';

	let {
		manifest,
		values
	}: {
		/** The stored manifest (`unknown`; a blob this cannot walk declares nothing). */
		manifest: unknown;
		/** The answers by FIELD, as the frame is seeded. */
		values: Record<string, string | boolean>;
	} = $props();

	const checks = $derived(
		htmlAnswerSheet(manifest, values, {})
			.flatMap((g) => g.cells)
			.filter((c) => c.link !== null && typeof c.value === 'string' && c.value.trim() !== '')
			.map((c) => {
				const url = presentationUrl(c.value as string);
				return {
					blockId: c.blockId,
					label: c.prompt ?? c.field,
					url,
					host: url ? linkHostLabel(url) : ''
				};
			})
	);
	/** More than one link field on a worksheet names each one; a single one needs no name. */
	const named = $derived(checks.length > 1);
</script>

{#if checks.length}
	<div class="hlc" data-testid="html-link-check">
		{#each checks as check (check.blockId)}
			{#if check.url}
				<p class="hlc-row hlc-ok" data-testid="html-link-ok">
					<span class="hlc-word">
						{#if named}{check.label}: {/if}Your link: <strong>{check.host}</strong>
					</span>
					<a
						class="btn secondary tiny hlc-test"
						href={check.url}
						target="_blank"
						rel="noopener noreferrer"
						data-testid="html-link-test"
					>
						Test it
					</a>
				</p>
			{:else}
				<p class="hlc-row hlc-bad" role="status" data-testid="html-link-bad">
					{#if named}{check.label}: {/if}This does not look like a link yet. Paste the share link; it
					starts with https://.
				</p>
			{/if}
		{/each}
	</div>
{/if}

<style>
	.hlc {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: var(--space-2) 0;
	}
	.hlc-row {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		font-size: 0.85rem;
		line-height: 1.45;
		color: var(--text-1);
	}
	.hlc-word {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	/* A STUDENT SURFACE: the Test it key clears 44px at every width, the
	   classroom's `.btn.tiny` floor (no instructor density reaches here). */
	.hlc-test {
		min-height: 44px;
		text-decoration: none;
	}
	/* NOT COLOUR ALONE: the sentence says what is wrong. The edge marks the line
	   as a note to act on, in the warning tier, never crimson (live and error). */
	.hlc-bad {
		padding: var(--space-1) var(--space-2);
		border-left: 3px solid var(--amber);
	}
</style>
