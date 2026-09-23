<script lang="ts">
	/**
	 * THE DICTATE CONTROL FOR ONE FIELD (0288).
	 *
	 * ONE COMPONENT, MOUNTED PER FIELD, OVER ONE SHARED CONTROLLER. The
	 * controller is what holds the single speech session (see
	 * `grading-dictation.svelte.ts` for why there is exactly one); this is only
	 * the button and the live sentence beside it. Written as a per-field
	 * component with its own `Dictation` inside, five of these on a rubric
	 * would be five recognisers racing for one microphone.
	 *
	 * ABSENCE IS THE MECHANISM, exactly as it is in the report box this borrows
	 * from: a browser with no speech constructor gets NO BUTTON, not a button
	 * that fails when pressed. Firefox and every third-party browser on an iPad
	 * are that case and they are ordinary, not degraded.
	 *
	 * THE WORD CHANGES WITH THE STATE AND THE DOT IS NEVER THE ONLY SIGNAL --
	 * colour is never the only signal on this site, and a grader glancing at a
	 * rubric of four criteria needs to see WHICH field is listening from the
	 * word. `aria-pressed` makes it a toggle to assistive tech.
	 *
	 * THE INTERIM SENTENCE IS RENDERED BESIDE THE FIELD AND NEVER INTO IT. Only
	 * text the service has committed reaches the textarea, through
	 * `appendDictation`, which never removes a character.
	 */
	import type { GradingDictation } from '$lib/classroom/grading-dictation.svelte';

	let {
		dictation,
		field,
		label,
		append,
		disabled = false
	}: {
		dictation: GradingDictation;
		/** Identifies this field to the shared controller. */
		field: string;
		/** Names the field in the accessible name: "Dictate the comment to the student". */
		label: string;
		/** Reads the field FRESH and appends. See the controller's `Target`. */
		append: (transcript: string) => void;
		disabled?: boolean;
	} = $props();

	const listening = $derived(dictation.listeningKey === field);
</script>

{#if dictation.available}
	<span class="dictate-wrap">
		<button
			type="button"
			class="btn secondary tiny dictate"
			class:listening
			aria-pressed={listening}
			aria-label={listening ? `Stop dictating ${label}` : `Dictate ${label}`}
			data-testid="dictate-{field}"
			data-dictate-field={field}
			{disabled}
			onclick={() => dictation.toggle(field, append)}
		>
			{#if listening}
				<span class="dictate-dot" aria-hidden="true"></span>
				STOP
			{:else}
				<svg
					class="dictate-mic"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.8"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<rect x="9" y="3" width="6" height="11" rx="3" />
					<path d="M5 11a7 7 0 0 0 14 0" />
					<path d="M12 18v3" />
				</svg>
				DICTATE
			{/if}
		</button>
		<!--
			ONE LIVE REGION PER FIELD, ALWAYS MOUNTED AND ONLY ITS TEXT MOVING.
			Several screen readers announce only a `role="status"` they were
			already observing, so the element exists from the first frame and the
			`{#if}` is INSIDE it. An empty region correctly holds no box.
		-->
		<span class="dictate-heard" role="status" aria-live="polite">
			{#if listening && dictation.heard}<em>{dictation.heard}</em>{/if}
		</span>
	</span>
	<!--
		THE REFUSAL OUTLIVES THE SESSION. It is keyed on the field that produced
		it, NOT on whether that field is still listening: a denied microphone
		ends the session, so a sentence gated on `listening` is a sentence
		nobody ever sees. Measured exactly that way before this -- the button
		flicked back to DICTATE and explained nothing.
	-->
	{#if dictation.errorKey === field && dictation.error}
		<p class="dictate-error" role="alert" data-testid="dictate-error-{field}">
			{dictation.error}
		</p>
	{/if}
{/if}

<style>
	.dictate-wrap {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-width: 0;
	}
	/* The 44px floor comes from `.cr-console .btn` in classroom.css, which this
	   sits inside on every mount. Nothing here sets a height: rounding to reach
	   a floor rounds both ways. */
	.dictate {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.dictate-mic {
		width: 0.95rem;
		height: 0.95rem;
	}
	/* The listening state carries the WORD (STOP) and the dot; the hue is the
	   third signal, never the only one. `--crimson` is this site's reserved
	   live/rec colour and this is a recording indicator, which is the one thing
	   it is reserved FOR. */
	.dictate.listening {
		border-color: var(--crimson);
		color: var(--crimson);
	}
	.dictate-dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--crimson);
	}
	@media (prefers-reduced-motion: no-preference) {
		.dictate.listening .dictate-dot {
			animation: dictate-pulse 1.4s ease-in-out infinite;
		}
	}
	/* NOTHING IS HIDDEN IN A BASE STATE: with the animation cancelled the dot
	   is painted at full opacity, so a reduced-motion reader sees the same
	   indicator without the motion. */
	@keyframes dictate-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.45;
		}
	}
	.dictate-heard {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.dictate-error {
		margin: var(--space-1) 0 0;
		font-size: 0.8rem;
		color: var(--nb-error, var(--crimson));
	}
</style>
