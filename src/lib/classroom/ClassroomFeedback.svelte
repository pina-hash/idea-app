<script lang="ts">
	import FeedbackBox from '$lib/feedback/FeedbackBox.svelte';
	import type { FeedbackEntry } from '$lib/feedback/feedback';

	/**
	 * The classroom's feedback control: a quiet button in the page footer that
	 * opens the SHARED FeedbackBox with the page context already attached.
	 *
	 * Deliberately the shared component and the shared table rather than a
	 * classroom-only pair. A feedback note is a comment about YOURSELF -- there
	 * is nothing to forge -- so it is 0053's direct RLS-scoped insert whose WITH
	 * CHECK pins the row to the caller, and any signed-in user can send one. A
	 * second table would be a second copy of every one of those rules and would
	 * split "what are people telling us" into a union query.
	 *
	 * WHAT GETS ATTACHED, and why it is not typed by the student: the path and
	 * the class they were looking at ride along automatically, because the one
	 * thing someone reporting a problem reliably forgets is where they were.
	 */
	let {
		context,
		meta = {},
		submit,
		label = 'Feedback'
	}: {
		/** Which classroom surface ('class', 'item', 'home', 'manage', ...). */
		context: string;
		meta?: Record<string, unknown>;
		/** Null on a surface with no session to write with (the dev harness). */
		submit: ((entry: FeedbackEntry) => Promise<{ error: string | null }>) | null;
		label?: string;
	} = $props();

	let open = $state(false);
</script>

{#if submit}
	<div class="cf-wrap">
		<button type="button" class="cf-trigger" onclick={() => (open = true)}>
			<span class="cf-glyph" aria-hidden="true">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
					<path d="M21 11.5a8.4 8.4 0 01-9 8.4 9 9 0 01-3.9-.9L3 21l1.9-4.6A8.4 8.4 0 013 11.5a8.5 8.5 0 019-8.4 8.4 8.4 0 019 8.4z" />
				</svg>
			</span>
			{label}
		</button>
	</div>

	{#if open}
		<div class="cf-scrim-host">
			<FeedbackBox
				app="classroom"
				{context}
				{meta}
				{submit}
				onClose={() => (open = false)}
				title="Feedback on Classroom"
				note="Something confusing, broken, or missing? We attach which page you were on."
			/>
		</div>
	{/if}
{/if}

<style>
	.cf-wrap {
		display: flex;
		justify-content: center;
		margin-top: 1.2rem;
	}
	.cf-trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		appearance: none;
		background: none;
		border: 1px solid var(--line);
		border-radius: 999px;
		color: var(--dim);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.06em;
		padding: 0.3rem 0.85rem;
		cursor: pointer;
	}
	.cf-trigger:hover {
		color: var(--green);
		border-color: var(--line-strong);
	}
	.cf-glyph {
		display: grid;
		place-items: center;
		width: 0.85rem;
		height: 0.85rem;
	}
	.cf-glyph svg {
		width: 100%;
		height: 100%;
	}
	/* The shared box is theme-agnostic and reads --fb-* from its scrim's
	   ancestor, so the portal palette is handed to it here rather than the
	   component growing a per-app branch. */
	.cf-scrim-host {
		--fb-bg: var(--bg1);
		--fb-panel: var(--bg2);
		--fb-ink: var(--white);
		--fb-dim: var(--dim);
		--fb-line: var(--line);
		--fb-accent: var(--green);
	}
</style>
