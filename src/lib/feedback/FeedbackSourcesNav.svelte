<script lang="ts">
	import { FEEDBACK_SOURCES, feedbackSourceFor } from './armory-reports';

	/**
	 * THE THREE PLACES FEEDBACK ARRIVES FROM, as one strip of keys: the site's
	 * own queue, the Armory app's notes, and the Armory app's incidents. Mounted
	 * by the feedback area's layout and by `/dev/feedback`, so the harness draws
	 * the strip the page has.
	 *
	 * A KEY IS LIT WITH `.on` AS WELL AS `aria-current`, because the site plate
	 * lights a key only for its seven state spellings and `aria-current` is not
	 * one of them (plate.css); with the attribute alone the current page would
	 * read unlit.
	 */
	let { pathname }: { pathname: string } = $props();

	const current = $derived(feedbackSourceFor(pathname));
</script>

<nav class="fsn" aria-label="Feedback sources" data-testid="feedback-sources">
	{#each FEEDBACK_SOURCES as source (source.id)}
		<a
			class="btn secondary fsn-key"
			class:on={current === source.id}
			href={source.href}
			aria-current={current === source.id ? 'page' : undefined}
			data-testid="feedback-source-{source.id}"
		>
			{source.label}
		</a>
	{/each}
</nav>

<style>
	.fsn {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		max-width: var(--cr-measure, var(--measure-form));
		margin: 0 auto var(--space-3, 0.75rem);
		padding: 0 var(--cr-gutter, 1.2rem);
		box-sizing: border-box;
	}
	/* 44px, the floor every key on these pages holds. */
	.fsn-key {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		min-width: 44px;
		box-sizing: border-box;
	}
</style>
