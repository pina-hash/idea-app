<script lang="ts">
	import { onMount } from 'svelte';
	import SaveIndicator from '$lib/SaveIndicator.svelte';
	import { SaveState } from '$lib/save-state.svelte';
	import {
		FEEDBACK_CONTACT_MAX,
		FEEDBACK_KINDS,
		FEEDBACK_MAX_LEN,
		feedbackContactIssue,
		feedbackIssue,
		type FeedbackEntry,
		type FeedbackResult,
		type FeedbackKind
	} from './feedback';

	/**
	 * Shared in-app feedback / suggestion box. App-AGNOSTIC by design: GREENLINE
	 * is the first consumer, VANGUARD is the intended second, and nothing in
	 * here knows anything about either. The host passes an `app` id, an optional
	 * `context` (which screen), optional `meta` (free-form debugging context),
	 * and a `submit` callback; the component owns the form, validation, the
	 * in-flight state, and the thank-you.
	 *
	 * Presentation contract (the Minimap / Garage convention): state in via
	 * props, intent out via callbacks. It never touches Supabase itself, so a
	 * dev harness can mount it against an in-memory store unchanged.
	 *
	 * Theming: a neutral dark modal driven entirely by `--fb-*` custom
	 * properties declared on the scrim with sensible defaults. A host with its
	 * own design system (GREENLINE's `.glb` tokens, VANGUARD's green-on-black)
	 * overrides those variables from outside instead of this component growing a
	 * per-app branch. No game-specific copy, color, or font is baked in.
	 *
	 * Escape steps back exactly like GreenlineSettings: it closes the modal, and
	 * keydowns are swallowed while open so a game underneath never sees the
	 * player typing.
	 *
	 * ONE VOCABULARY FOR SAVING. Sending is an explicit one-shot write, so it
	 * runs on the SHARED SaveState in `autosave: false` mode and reports itself
	 * through the SHARED SaveIndicator, rather than this box owning a sixth set
	 * of words for saving, saved and failed. What that buys beyond consistency:
	 * a network failure backs off and retries by itself, while a REFUSAL (an RLS
	 * denial, a CHECK violation, a message the database will not take) is
	 * reported once and never re-sent. `FeedbackResult.retryable` is what
	 * carries that distinction across the seam.
	 */
	const {
		app,
		context = null,
		meta,
		submit,
		onClose,
		askContact = false,
		title = 'Send feedback',
		note = 'Tell us what you noticed. It goes straight to the team.'
	}: {
		/** Which app this feedback is about ('greenline', 'vanguard', ...). */
		app: string;
		/** Which screen/surface within that app ('race', 'garage', ...). */
		context?: string | null;
		/** Free-form context attached to the row (build, track, screen state). */
		meta?: Record<string, unknown>;
		/** Performs the write. Says whether a failure is worth re-sending. */
		submit: (entry: FeedbackEntry) => Promise<FeedbackResult>;
		onClose: () => void;
		/**
		 * OFFER A WAY TO BE REACHED. True only where there is no account behind
		 * the report, because a signed-in one is attributable already and 0126
		 * cannot store a contact beside an author anyway.
		 *
		 * FALSE REMOVES THE FIELD, and with it the value: nothing renders, and
		 * `contact` is not on the entry at all. Absence is the mechanism here for
		 * the same reason it is for the whole control.
		 */
		askContact?: boolean;
		title?: string;
		note?: string;
	} = $props();

	let kind = $state<FeedbackKind>('bug');
	let message = $state('');
	let contact = $state('');

	/**
	 * `autosave: false` because a write MINTS A RECORD: a debounce here would
	 * file a report per pause in someone's typing. The machine still moves to
	 * `dirty`, which is what the indicator and the send control read; it just
	 * schedules nothing.
	 *
	 * `save()` reads `message` and `kind` FRESH rather than closing over a
	 * snapshot, so a retry after a network failure sends what is on screen now.
	 */
	const save = new SaveState({
		autosave: false,
		fallbackMessage: 'That did not send.',
		save: async () => {
			const issue = feedbackIssue(message) ?? (askContact ? feedbackContactIssue(contact) : null);
			if (issue) return { ok: false as const, retryable: false as const, message: issue };
			// `contact` is on the entry ONLY when the field was offered, so a
			// surface that never asked cannot send one by accident.
			const res = await submit({
				app,
				context,
				kind,
				message,
				meta,
				...(askContact ? { contact } : {})
			});
			if (!res.error) return { ok: true as const };
			return { ok: false as const, retryable: res.retryable, message: res.error };
		}
	});

	$effect(() => {
		// DELIBERATELY NOT `save.attach()`. That net exists so work in progress
		// survives a hidden tab; a half-written report is not work the server
		// should receive because somebody switched tabs, and nothing is lost by
		// not sending it -- the text is still in the box when they come back.
		return () => save.destroy();
	});

	const sent = $derived(save.phase === 'saved');
	const remaining = $derived(FEEDBACK_MAX_LEN - message.trim().length);
	const canSend = $derived(
		save.phase !== 'writing' &&
			feedbackIssue(message) === null &&
			(!askContact || feedbackContactIssue(contact) === null)
	);

	/** From the input event, never from an `$effect`: markDirty reads the phase
	 * it then writes, so a tracked call would turn `saved` straight back into
	 * `dirty` on every transition. */
	function typed() {
		save.markDirty();
	}

	function send() {
		// A `submit` that throws rather than resolving is handled inside the
		// SaveState, which treats a throw as a retryable failure; there is no
		// busy flag here left to strand.
		save.markDirty();
		void save.saveNow();
	}

	/** Reset back to an empty form so a player can send a second note without
	 * closing and reopening the box. */
	function again() {
		save.reset();
		message = '';
		contact = '';
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			onClose();
			return;
		}
		// Ctrl/Cmd+Enter sends from inside the textarea (the usual convention);
		// a bare Enter stays a newline, since this is prose.
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canSend) {
			e.preventDefault();
			e.stopPropagation();
			send();
			return;
		}
		// Swallow everything else so a running game underneath never sees the
		// player type (driving keys, Enter-to-start, weapon binds).
		e.stopPropagation();
	}

	let boxEl = $state<HTMLDivElement | null>(null);
	let areaEl = $state<HTMLTextAreaElement | null>(null);
	onMount(() => (areaEl ?? boxEl)?.focus());
</script>

<svelte:window onkeydown={onKeydown} />

<div
	class="fb-scrim"
	role="presentation"
	onclick={(e) => {
		if (e.target === e.currentTarget) onClose();
	}}
>
	<div class="fb-box" role="dialog" aria-label={title} aria-modal="true" tabindex="-1" bind:this={boxEl}>
		<div class="fb-head">
			<span class="fb-title">{title}</span>
			<button class="fb-x" onclick={onClose} aria-label="Close">✕</button>
		</div>

		{#if sent}
			<div class="fb-done">
				<span class="fb-done-mark" aria-hidden="true">✓</span>
				<p class="fb-done-text">Thanks, that went through.</p>
				<div class="fb-actions">
					<button class="fb-btn" onclick={again}>SEND ANOTHER</button>
					<button class="fb-btn fb-btn-primary" onclick={onClose}>DONE</button>
				</div>
			</div>
		{:else}
			<p class="fb-note">{note}</p>

			<div class="fb-kinds" role="radiogroup" aria-label="Feedback type">
				{#each FEEDBACK_KINDS as k (k.id)}
					<button
						class="fb-kind"
						class:on={kind === k.id}
						role="radio"
						aria-checked={kind === k.id}
						title={k.hint}
						onclick={() => (kind = k.id)}
					>
						{k.label}
					</button>
				{/each}
			</div>

			<label class="fb-label" for="fb-msg">
				{FEEDBACK_KINDS.find((k) => k.id === kind)?.hint ?? 'What happened?'}
			</label>
			<textarea
				id="fb-msg"
				class="fb-area"
				bind:this={areaEl}
				bind:value={message}
				oninput={typed}
				rows="5"
				maxlength={FEEDBACK_MAX_LEN}
				placeholder="What happened, and what were you doing at the time?"
			></textarea>

			{#if askContact}
				<!--
					PLAINLY OPTIONAL, AND NOTHING IMPLIES A REPORT WITHOUT ONE IS WORTH
					LESS. The word "optional" is in the label rather than only in a
					placeholder, because a placeholder disappears the moment somebody
					types and is not read by a screen reader as part of the field.
				-->
				<label class="fb-label" for="fb-contact">
					A way to reach you, if you want one (optional)
				</label>
				<input
					id="fb-contact"
					class="fb-contact"
					type="text"
					bind:value={contact}
					oninput={typed}
					maxlength={FEEDBACK_CONTACT_MAX}
					autocomplete="off"
					placeholder="an email, a name, a class period, or nothing at all"
				/>
				<p class="fb-contact-note">
					Leave it empty and the report is still read. It is not signed in to
					anything, so nothing here is checked.
				</p>
			{/if}

			<div class="fb-state">
				<!-- THE SHARED INDICATOR, not a private one: the same five states,
				     the same words, and the same Retry control every other surface
				     in the portal offers. -->
				<SaveIndicator state={save} />
			</div>

			<div class="fb-actions">
				<span class="fb-count" class:low={remaining < 120}>{remaining} left</span>
				<button class="fb-btn" onclick={onClose}>CANCEL</button>
				<button class="fb-btn fb-btn-primary" disabled={!canSend} onclick={send}>
					{save.phase === 'writing' ? 'SENDING' : 'SEND'}
				</button>
			</div>
		{/if}
	</div>
</div>

<style>
	/* Neutral defaults; a host design system overrides these from outside
	   (e.g. `.glb .fb-scrim { --fb-accent: #2ae57e; }`) rather than this
	   component growing per-app branches. */
	.fb-scrim {
		--fb-bg: #0b1016;
		--fb-bg-deep: #05080b;
		--fb-line: rgba(147, 163, 176, 0.22);
		--fb-line-strong: rgba(147, 163, 176, 0.4);
		--fb-ink: #dfe8ee;
		--fb-ink-dim: #b3c1cc;
		--fb-ink-faint: #6b7b88;
		--fb-accent: #7fd0ff;
		--fb-danger: #ff8f6b;
		--fb-font: inherit;

		position: fixed;
		inset: 0;
		z-index: 120;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		background: rgba(2, 3, 4, 0.82);
		font-family: var(--fb-font);
	}
	.fb-box {
		width: min(94vw, 30rem);
		max-height: 92vh;
		overflow-y: auto;
		padding: 0.9rem 1.05rem 1rem;
		background: linear-gradient(180deg, var(--fb-bg) 0%, var(--fb-bg-deep) 100%);
		border: 1px solid var(--fb-line);
		border-top-color: var(--fb-line-strong);
		border-radius: 3px;
		box-shadow:
			inset 0 1px 0 rgba(247, 251, 254, 0.07),
			0 30px 80px rgba(0, 0, 0, 0.6);
		color: var(--fb-ink);
	}
	.fb-box:focus-visible {
		outline: none;
	}
	.fb-head {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding-bottom: 0.55rem;
		margin-bottom: 0.6rem;
		border-bottom: 1px solid var(--fb-line);
	}
	.fb-title {
		flex: 1;
		font-size: 0.94rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.fb-x {
		/* 44px, the tap-target floor. Nothing in this box is inside a locked
		   density contract, so there is nothing here to trade against. */
		min-width: 44px;
		min-height: 44px;
		background: none;
		border: 1px solid transparent;
		border-radius: 3px;
		color: var(--fb-ink-faint);
		font-size: 0.8rem;
		line-height: 1;
		padding: 0.2rem 0.35rem;
		cursor: pointer;
	}
	.fb-x:hover,
	.fb-x:focus-visible {
		color: var(--fb-ink);
		border-color: var(--fb-line);
		outline: none;
	}
	.fb-note {
		margin: 0 0 0.65rem;
		color: var(--fb-ink-faint);
		font-size: 0.74rem;
		line-height: 1.5;
	}
	.fb-kinds {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-bottom: 0.7rem;
	}
	.fb-kind {
		flex: 1 1 auto;
		min-height: 44px;
		padding: 0.32rem 0.6rem;
		background: rgba(10, 15, 21, 0.6);
		border: 1px solid var(--fb-line);
		border-radius: 2px;
		color: var(--fb-ink-dim);
		font: inherit;
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
		transition:
			color 140ms ease,
			border-color 140ms ease;
	}
	.fb-kind:hover,
	.fb-kind:focus-visible {
		border-color: var(--fb-line-strong);
		outline: none;
	}
	.fb-kind.on {
		color: var(--fb-accent);
		border-color: color-mix(in srgb, var(--fb-accent) 55%, transparent);
		box-shadow: 0 0 10px color-mix(in srgb, var(--fb-accent) 18%, transparent);
	}
	.fb-label {
		display: block;
		margin-bottom: 0.28rem;
		color: var(--fb-ink-faint);
		font-size: 0.68rem;
		letter-spacing: 0.06em;
	}
	.fb-area {
		width: 100%;
		box-sizing: border-box;
		resize: vertical;
		padding: 0.5rem 0.6rem;
		background: rgba(5, 8, 11, 0.75);
		border: 1px solid var(--fb-line-strong);
		border-radius: 2px;
		color: var(--fb-ink);
		font: inherit;
		font-size: 0.82rem;
		line-height: 1.5;
	}
	.fb-area::placeholder {
		color: var(--fb-ink-faint);
	}
	.fb-area:focus-visible {
		outline: 1px solid color-mix(in srgb, var(--fb-accent) 55%, transparent);
		outline-offset: 1px;
	}
	.fb-contact {
		width: 100%;
		box-sizing: border-box;
		/* 44px, the tap-target floor, as min-height so it can only round up. */
		min-height: 44px;
		margin-bottom: 0.3rem;
		padding: 0.5rem 0.6rem;
		background: rgba(5, 8, 11, 0.75);
		border: 1px solid var(--fb-line-strong);
		border-radius: 2px;
		color: var(--fb-ink);
		font: inherit;
		font-size: 0.82rem;
	}
	.fb-contact::placeholder {
		color: var(--fb-ink-faint);
	}
	.fb-contact:focus-visible {
		outline: 1px solid color-mix(in srgb, var(--fb-accent) 55%, transparent);
		outline-offset: 1px;
	}
	.fb-contact-note {
		margin: 0;
		color: var(--fb-ink-faint);
		font-size: 0.68rem;
		line-height: 1.45;
	}

	.fb-state {
		margin-top: 0.5rem;
		min-height: 1.2rem;
	}
	.fb-actions {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin-top: 0.7rem;
	}
	.fb-count {
		flex: 1;
		color: var(--fb-ink-faint);
		font-size: 0.66rem;
		letter-spacing: 0.06em;
	}
	.fb-count.low {
		color: var(--fb-danger);
	}
	.fb-btn {
		min-height: 44px;
		min-width: 44px;
		background: linear-gradient(180deg, rgba(23, 30, 37, 0.85), rgba(9, 13, 17, 0.9));
		border: 1px solid var(--fb-line);
		border-radius: 2px;
		color: var(--fb-ink-dim);
		font: inherit;
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.16em;
		padding: 0.34rem 0.8rem;
		cursor: pointer;
		transition:
			color 140ms ease,
			border-color 140ms ease;
	}
	.fb-btn:hover:not(:disabled),
	.fb-btn:focus-visible:not(:disabled) {
		color: var(--fb-ink);
		border-color: var(--fb-line-strong);
		outline: none;
	}
	.fb-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.fb-btn-primary {
		color: var(--fb-accent);
		border-color: color-mix(in srgb, var(--fb-accent) 45%, transparent);
	}
	.fb-btn-primary:hover:not(:disabled),
	.fb-btn-primary:focus-visible:not(:disabled) {
		box-shadow: 0 0 12px color-mix(in srgb, var(--fb-accent) 22%, transparent);
	}
	.fb-done {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		padding: 0.8rem 0 0.2rem;
		text-align: center;
	}
	.fb-done-mark {
		font-size: 1.5rem;
		line-height: 1;
		color: var(--fb-accent);
	}
	.fb-done-text {
		margin: 0;
		color: var(--fb-ink-dim);
		font-size: 0.84rem;
	}
	.fb-done .fb-actions {
		justify-content: center;
	}
</style>
