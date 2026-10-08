<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import SaveIndicator from '$lib/SaveIndicator.svelte';
	import { SaveState } from '$lib/save-state.svelte';
	import {
		FEEDBACK_CONTACT_MAX,
		FEEDBACK_HORIZONS,
		FEEDBACK_KINDS,
		FEEDBACK_MAX_LEN,
		FEEDBACK_TRIED_MAX,
		feedbackContactIssue,
		feedbackIssue,
		feedbackTriedIssue,
		type FeedbackEntry,
		type FeedbackResult,
		type FeedbackHorizon,
		type FeedbackKind
	} from './feedback';
	import { FEEDBACK_CONSOLE_LABEL } from './context';
	import { dropTarget } from '$lib/file-drop';
	import {
		FEEDBACK_SCREENSHOT_MAX_BYTES,
		FEEDBACK_SCREENSHOT_TYPE_WORDS,
		formatScreenshotBytes,
		type ScreenshotUpload
	} from './screenshot';
	import {
		DICTATION_LEVEL_NOTE,
		DICTATION_NOTE,
		DICTATION_STOP_GRACE_MS,
		Dictation,
		DictationJoin,
		coarsePointer,
		dictationConstructor,
		dictationEndNote,
		dictationLang,
		isDictationChord,
		type DictationEnd,
		type MicMeter,
		type SpeechRecognitionCtor
	} from './dictation';
	import { MicLevel } from './mic-level';
	import DictationGhost from './DictationGhost.svelte';
	import DictationLevel from './DictationLevel.svelte';
	import { modKeyLabel } from '$lib/shell/commands';
	import { pendingLabel } from '$lib/pending';

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
	 * player typing. EXCEPT WHILE DICTATING (report 5ab3adb6): then Escape, and
	 * a click on the shade, only stop listening and the box stays open, because
	 * Escape is the conventional "stop dictating" key and closing the box
	 * discards the report. A second Escape closes it.
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
		uploadScreenshot = null,
		screenshotNote = null,
		dictation = undefined,
		micLevel = undefined,
		offerHorizon = false,
		consoleHref = null,
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
		/**
		 * STAGE ONE SCREENSHOT. Handed in, so the box neither holds a Supabase
		 * client nor knows where a bucket is; the dev harness answers in memory.
		 *
		 * NULL REMOVES THE CONTROL ENTIRELY, which is the mechanism everywhere
		 * else in this component and in this repo: read-only is structural rather
		 * than a discipline, because there is no write to execute. A surface
		 * whose deployment cannot take a screenshot (no session, or a backend
		 * before 0170) passes null and a `screenshotNote` saying which.
		 *
		 * IT UPLOADS WHEN THE FILE IS PICKED, not when the report is sent -- see
		 * `uploadFeedbackScreenshot`. So a refusal lands beside this control while
		 * the person is still looking at it, and a picture that will not go never
		 * takes the report with it.
		 */
		uploadScreenshot?: ((file: File) => Promise<ScreenshotUpload>) | null;
		/**
		 * WHY THERE IS NO ATTACH CONTROL, in one sentence, when there is none. A
		 * control that is absent for a reason says the reason: a box that simply
		 * lacks one reads as a bug on a form every other surface offers it on.
		 */
		screenshotNote?: string | null;
		/**
		 * VOICE TO TEXT. `undefined` (the default, and what every real mount
		 * passes) asks the window for `SpeechRecognition` and renders the
		 * control only where one exists; `null` refuses it outright; a
		 * constructor hands in a stand-in, which is what the dev harness does
		 * so the control is drivable with no microphone. See `dictation.ts`
		 * for where the audio goes (the browser's own service, nowhere else)
		 * and the one rule about text (append, never replace).
		 */
		dictation?: SpeechRecognitionCtor | null;
		/**
		 * THE LOUDNESS METER BESIDE STOP. `undefined` (every real mount) builds
		 * the real one on a fine pointer and none on a phone; `null` refuses it;
		 * an object hands in a stand-in, which is how the dev harness shows the
		 * bars with no microphone. See `mic-level.ts`: measured on this device,
		 * opened only where the microphone is already allowed, never recorded.
		 */
		micLevel?: MicMeter | null;
		/**
		 * OFFER "FIX SOON" OR "LONG-TERM IDEA" (0230). False, the default, renders
		 * no control and puts no `horizon` on the entry at all, which is how
		 * GREENLINE's own direct mount stays exactly as it was. `SiteFeedback`
		 * passes true, so every surface the site's report control reaches offers
		 * it.
		 */
		offerHorizon?: boolean;
		/**
		 * WHERE THE REPORTS ARE READ, for an admin (report R15), or null. Null
		 * renders no link: absence is the mechanism, so a student's box carries
		 * nothing that could point them at a page that would answer them 404.
		 *
		 * IT OPENS IN A NEW TAB, ON PURPOSE. Following it in this tab would throw
		 * away whatever is half typed in this box, on the one surface that exists
		 * so nothing is lost.
		 */
		consoleHref?: string | null;
		title?: string;
		note?: string;
	} = $props();

	let kind = $state<FeedbackKind>('bug');
	/** 'now' unless somebody picks otherwise, and 'now' is never sent. */
	let horizon = $state<FeedbackHorizon>('now');
	let message = $state('');
	let contact = $state('');
	let tried = $state('');

	/**
	 * The staged screenshot: the stored KEY, plus a local object URL for the
	 * preview. THE PREVIEW IS THE LOCAL FILE, never a round trip back out of the
	 * bucket -- the bytes are already in this browser, and a private object would
	 * need a signed URL to come back.
	 */
	let shotPath = $state<string | null>(null);
	let shotPreview = $state<string | null>(null);
	let shotName = $state<string | null>(null);
	let shotError = $state<string | null>(null);
	let shotBusy = $state(false);
	/** Set when the browser could not decode what was uploaded. */
	let shotBroken = $state(false);

	/** Release the object URL we minted, whenever it stops being the one shown. */
	function clearPreview() {
		if (shotPreview && typeof URL !== 'undefined') URL.revokeObjectURL(shotPreview);
		shotPreview = null;
	}

	/**
	 * ONE FILE, FROM ANY OF THE THREE WAYS OF OFFERING IT -- a paste, a drop, or
	 * the picker. `file-drop` is the shared primitive the classroom upload
	 * surfaces already use, so the drag/leave counting and the image-only paste
	 * filter are not written a second time here.
	 *
	 * A SECOND FILE REPLACES THE FIRST rather than being refused: a report
	 * carries one screenshot (the row has one column), and somebody who pastes
	 * again has almost always taken a better picture.
	 */
	async function stageScreenshot(files: File[]) {
		const file = files[0];
		if (!file || !uploadScreenshot || shotBusy) return;
		shotBusy = true;
		shotError = null;
		shotBroken = false;
		try {
			const result = await uploadScreenshot(file);
			if (result.error || !result.path) {
				shotError = result.error ?? 'That screenshot did not attach.';
				return;
			}
			clearPreview();
			shotPath = result.path;
			shotName = file.name || 'screenshot';
			shotPreview = typeof URL === 'undefined' ? null : URL.createObjectURL(file);
		} finally {
			// In `finally`, so a throw cannot strand the control disabled for the
			// rest of the session on a form somebody is part-way through.
			shotBusy = false;
		}
	}

	/**
	 * Detach. IT DOES NOT DELETE THE OBJECT, and that is deliberate rather than
	 * an omission: the row is what makes an object reachable, so an object no row
	 * names is already unreachable to everyone but its uploader and an admin.
	 * Issuing a delete here would be a second write that can fail, on a path
	 * whose whole point is that a picture never gets in the way of a report.
	 */
	function removeScreenshot() {
		clearPreview();
		shotPath = null;
		shotName = null;
		shotError = null;
		shotBroken = false;
		if (fileEl) fileEl.value = '';
	}

	let fileEl = $state<HTMLInputElement | null>(null);
	let dragging = $state(false);

	/**
	 * DICTATION, resolved once at mount. On the server, and in a browser with
	 * no speech constructor (Firefox, every third-party iPad browser), `dict`
	 * is null and NOTHING RENDERS: the same absence-is-the-mechanism rule as
	 * the attach control, so an unsupported device sees the plain textarea
	 * rather than a microphone button that fails when pressed.
	 *
	 * A FINAL SENTENCE IS APPENDED TO WHAT IS IN THE FIELD NOW -- typed while
	 * the person was also speaking, pasted, or dictated earlier -- and the
	 * field is read fresh at that moment rather than snapshotted at start, so
	 * nothing anybody typed in between is lost. `join` decides whether the
	 * sentence before it is finished (report 5ab3adb6: a period at every pause
	 * put one in the middle of sentences) and closes the last one when the
	 * session ends. `typed()` then reports the edit to the save machine
	 * exactly as a keystroke would, gate included.
	 *
	 * ON A FINE POINTER THE SESSION KEEPS LISTENING through the service's own
	 * stops (`keepAlive`), with a loudness meter beside STOP; on a phone it
	 * ends at a pause and says so, because a restart there chimes (Android) or
	 * may be refused outside a tap (iOS). See `dictation.ts`.
	 */
	const speechCtor: SpeechRecognitionCtor | null = untrack(() =>
		dictation === undefined ? dictationConstructor() : dictation
	);
	const finePointer = !coarsePointer();
	const meter: MicMeter | null = untrack(() =>
		micLevel === undefined ? (speechCtor && finePointer ? new MicLevel() : null) : micLevel
	);
	const join = new DictationJoin(dictationLang());
	let listening = $state(false);
	/** What the service is hearing and has not committed yet. Drawn OVER the
	 * field by `DictationGhost`, never written into it. */
	let heard = $state('');
	let heardPause = $state<number | null>(null);
	let level = $state(0);
	let levelSeen = $state(false);
	/** Why the last session ended, in words, when it ended itself. */
	let endNote = $state('');
	let dictError = $state<string | null>(null);
	/** SEND was pressed mid-sentence: the box is waiting for that sentence. */
	let finishing = $state(false);
	let finishTimer: ReturnType<typeof setTimeout> | null = null;
	const dict = speechCtor
		? new Dictation(
				speechCtor,
				{
					onFinal: (text, pauseMs) => {
						message = join.append(message, text, pauseMs);
						typed();
					},
					onInterim: (text, pauseMs) => {
						heard = text;
						heardPause = pauseMs;
					},
					onListening: (on, why) => {
						if (on) listening = true;
						else ended(why);
					},
					onError: (text) => (dictError = text),
					onLevel: (l) => {
						level = l;
						if (l > 0) levelSeen = true;
					}
				},
				dictationLang(),
				{ keepAlive: finePointer, meter }
			)
		: null;
	/** Exactly what the next final would add, drawn grey where it will land. */
	const ghost = $derived(dict && listening && heard ? join.preview(message, heard, heardPause) : '');
	const listeningWords = finePointer
		? 'Listening. Keep talking, pauses are fine. Press STOP or Escape when you are done.'
		: 'Listening. It pauses when you stop talking.';
	/** The dictation key in this platform's words, and as assistive tech spells it. */
	const modKey = modKeyLabel(typeof navigator === 'undefined' ? '' : navigator.platform);
	const chordWords = `${modKey}+Shift+Space`;
	const chordAria = modKey === 'Ctrl' ? 'Control+Shift+Space' : 'Meta+Shift+Space';

	/** One session is over: close its sentence, say why, and send if SEND is waiting. */
	function ended(why: DictationEnd | undefined) {
		listening = false;
		heard = '';
		heardPause = null;
		level = 0;
		levelSeen = false;
		const closed = join.close(message);
		if (closed !== message) {
			message = closed;
			typed();
		}
		endNote = dictationEndNote(why);
		// Hand the caret back where the words landed, so a keyboard user can
		// carry on from the end of what was just heard -- except on a phone,
		// where focusing the field raises the on-screen keyboard over the box
		// (report R08).
		if (finePointer) areaEl?.focus();
		if (finishing) {
			finishing = false;
			if (finishTimer !== null) clearTimeout(finishTimer);
			finishTimer = null;
			sendNow();
		}
	}

	function toggleDictation() {
		if (!dict || sending || finishing) return;
		dictError = null;
		if (dict.listening) dict.stop();
		else {
			endNote = '';
			join.reset();
			dict.start();
			// The caret goes where the words are going, so typing carries on there.
			if (finePointer) areaEl?.focus();
		}
	}

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
			const issue =
				feedbackIssue(message) ??
				feedbackTriedIssue(tried) ??
				(askContact ? feedbackContactIssue(contact) : null);
			if (issue) return { ok: false as const, retryable: false as const, message: issue };
			// `contact` is on the entry ONLY when the field was offered, so a
			// surface that never asked cannot send one by accident.
			const res = await submit({
				app,
				context,
				kind,
				message,
				meta,
				tried,
				// The KEY of an object that already landed, or nothing at all. A
				// staged screenshot that failed to upload left `shotPath` null, so a
				// refused picture cannot reach the row.
				...(shotPath ? { screenshotPath: shotPath } : {}),
				// ONLY A CHOSEN LONG-TERM, and only where the choice was offered: an
				// entry from a box that never asked carries no `horizon` key at all.
				...(offerHorizon && horizon === 'long_term' ? { horizon: 'long_term' as const } : {}),
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
		return () => {
			save.destroy();
			// The object URL outlives this component unless it is revoked, and a
			// box opened and closed a dozen times is a dozen leaked blobs.
			clearPreview();
			// A microphone left open by a closed box is worse than a leaked blob.
			dict?.destroy();
			if (finishTimer !== null) clearTimeout(finishTimer);
		};
	});

	const sent = $derived(save.phase === 'saved');
	/**
	 * A REPORT IS ON ITS WAY, and the fields are `disabled` for exactly that
	 * long. A real `disabled` rather than `aria-disabled`, because nothing on a
	 * field has a reason to give while a send is in flight, and the box is
	 * replaced by the thank-you the moment it lands. A `failed` outcome leaves
	 * `writing`, which is what hands the fields back to the Retry control.
	 */
	const sending = $derived(save.phase === 'writing');
	const remaining = $derived(FEEDBACK_MAX_LEN - message.trim().length);
	const canSend = $derived(
		!sending &&
			!finishing &&
			// A screenshot still going up is work this report would leave behind.
			!shotBusy &&
			feedbackIssue(message) === null &&
			feedbackTriedIssue(tried) === null &&
			(!askContact || feedbackContactIssue(contact) === null)
	);

	/** From the input event, never from an `$effect`: markDirty reads the phase
	 * it then writes, so a tracked call would turn `saved` straight back into
	 * `dirty` on every transition.
	 *
	 * NOT WHILE A SEND IS IN FLIGHT. A report is sent as it was when SEND was
	 * pressed; an edit that lands mid-flight is not a newer version of the same
	 * report, it is a second report nobody asked for. `markDirty()` during a
	 * write is the machine's "an edit landed, send the newest value once this
	 * settles" -- right for an autosaving document, and here it was what
	 * inserted a SECOND `app_feedback` row carrying the newer text. The fields
	 * are also `disabled` for the flight, but `dispatchEvent` reaches a disabled
	 * control's listener regardless, so this gate is the half that holds the
	 * row count and the attribute is the half a person meets. */
	function typed() {
		if (save.phase === 'writing') return;
		save.markDirty();
	}

	function send() {
		// A scripted dispatch at the disabled control must not mint a row either.
		if (sending || finishing) return;
		// THE SENTENCE BEING SPOKEN IS PART OF THE REPORT (report 5ab3adb6). This
		// used to send what was on screen at the press and drop a sentence still
		// being heard; now the words being heard are drawn INSIDE the field,
		// where they read as part of the report, so SEND asks the service to
		// finish that sentence and sends when the session ends, or after
		// `DICTATION_STOP_GRACE_MS` without it.
		if (dict?.listening) {
			finishing = true;
			finishTimer = setTimeout(() => {
				finishTimer = null;
				if (!finishing) return;
				dict.destroy();
				ended('stopped');
			}, DICTATION_STOP_GRACE_MS);
			dict.stop();
			return;
		}
		sendNow();
	}

	function sendNow() {
		// A `submit` that throws rather than resolving is handled inside the
		// SaveState, which treats a throw as a retryable failure; there is no
		// busy flag here left to strand.
		save.markDirty();
		void save.saveNow();
	}

	/** Reset back to an empty form so a player can send a second note without
	 * closing and reopening the box. */
	function again() {
		dict?.stop();
		save.reset();
		message = '';
		contact = '';
		tried = '';
		horizon = 'now';
		removeScreenshot();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			if (finishing) return;
			// While dictating, Escape stops listening and keeps the box.
			if (dict?.listening) {
				dict.stop();
				return;
			}
			onClose();
			return;
		}
		if (dict && isDictationChord(e)) {
			e.preventDefault();
			e.stopPropagation();
			toggleDictation();
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
	/*
	 * FOCUS STARTS INSIDE THE BOX, and on the message field where a keyboard
	 * is the way in. On a phone the BOX takes it instead (it is `tabindex="-1"`,
	 * so Escape and the swallowed keys still work): focusing the field there
	 * raises the on-screen keyboard over the box before anybody has read it
	 * (report R08). A tap on the field brings the keyboard up when it is wanted.
	 */
	onMount(() => (coarsePointer() ? boxEl : (areaEl ?? boxEl))?.focus());
</script>

<svelte:window onkeydown={onKeydown} />

<div
	class="fb-scrim"
	role="presentation"
	onclick={(e) => {
		if (e.target !== e.currentTarget || finishing) return;
		// A click on the shade while dictating only stops listening.
		if (dict?.listening) dict.stop();
		else onClose();
	}}
>
	<!--
		THE WHOLE BOX IS THE DROP TARGET, and the paste target with it: somebody
		reporting a problem presses Ctrl+V, they do not aim. `dropTarget` is the
		shared primitive the classroom upload surfaces use, so the drag-depth
		counting and the image-only paste filter are not written a second time --
		and a paste carrying TEXT is left completely alone, so typing into the
		message field keeps working exactly as it did.
	-->
	<div
		class="fb-box"
		class:fb-dragging={dragging}
		role="dialog"
		aria-label={title}
		aria-modal="true"
		tabindex="-1"
		bind:this={boxEl}
		use:dropTarget={{
			onfiles: (files) => void stageScreenshot(files),
			onactive: (active) => (dragging = active),
			disabled: !uploadScreenshot
		}}
	>
		<div class="fb-head">
			<span class="fb-title">{title}</span>
			{#if consoleHref}
				<!-- IN THE HEADER, so it is on screen before a send and after one:
				     straight after a send is when an admin most wants it, because the
				     report just filed is the newest row on that page. -->
				<a
					class="fb-btn fb-console-link"
					href={consoleHref}
					target="_blank"
					rel="noopener"
					data-testid="fb-console-link"
				>
					{FEEDBACK_CONSOLE_LABEL}<span class="fb-sr"> (opens in a new tab)</span>
				</a>
			{/if}
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
						disabled={sending}
						onclick={() => (kind = k.id)}
					>
						{k.label}
					</button>
				{/each}
			</div>

			{#if offerHorizon}
				<!--
					WHEN IS THIS FOR. Its own group, after the kind, because it answers
					a different question: a long-term idea can be a bug, an idea or
					anything else. The same raised keys as the kind group above, lit by
					`aria-checked`, with the meaning in a sentence under them rather
					than in a `title` a phone cannot hover.
				-->
				<div
					class="fb-kinds fb-horizons"
					role="radiogroup"
					aria-label="When to act on this"
					aria-describedby="fb-horizon-hint"
				>
					{#each FEEDBACK_HORIZONS as h (h.id)}
						<button
							class="fb-kind fb-horizon"
							class:on={horizon === h.id}
							role="radio"
							aria-checked={horizon === h.id}
							data-testid="fb-horizon-{h.id}"
							disabled={sending}
							onclick={() => (horizon = h.id)}
						>
							{h.label}
						</button>
					{/each}
				</div>
				<p class="fb-horizon-hint" id="fb-horizon-hint">
					{FEEDBACK_HORIZONS.find((h) => h.id === horizon)?.hint}
				</p>
			{/if}

			<div class="fb-label-row">
				<label class="fb-label" for="fb-msg">
					{FEEDBACK_KINDS.find((k) => k.id === kind)?.hint ?? 'What happened?'}
				</label>
				{#if dict}
					<!--
						THE WORD CHANGES WITH THE STATE and the dot is never the only
						signal. `aria-pressed` makes it a toggle to assistive tech; the
						status line below says what listening means in this box.
					-->
					<button
						type="button"
						class="fb-btn fb-dictate"
						class:listening
						aria-pressed={listening}
						aria-keyshortcuts={chordAria}
						disabled={sending || finishing}
						onclick={toggleDictation}
					>
						{#if listening}
							<span class="fb-dictate-dot" aria-hidden="true"></span>
							{#if levelSeen}<DictationLevel {level} />{/if}
							STOP
						{:else}
							<svg
								class="fb-dictate-mic"
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
				{/if}
			</div>
			<!-- OFF WHILE A SEND IS IN FLIGHT, every field alike: what is on its way
			     is what was on screen at the press, and typing into that is how a
			     second report gets minted. See `typed()` for the half that holds
			     even when an event reaches the listener anyway. -->
			{#snippet messageField()}
				<textarea
					id="fb-msg"
					class="fb-area"
					bind:this={areaEl}
					bind:value={message}
					oninput={typed}
					disabled={sending}
					rows="5"
					maxlength={FEEDBACK_MAX_LEN}
					placeholder="What happened, and what were you doing at the time?"
				></textarea>
			{/snippet}
			{#if dict}
				<!-- THE WORDS STILL BEING HEARD ARE DRAWN OVER THE FIELD, in grey,
				     where they will land; the field itself is never written. -->
				<DictationGhost text={message} {ghost} active={listening}>
					{@render messageField()}
				</DictationGhost>
				<!-- ONE STATUS, ONE REFUSAL, each its own element. The status is a
				     live region so a screen reader hears the microphone open and
				     close, and why it closed when it closed itself; the grey
				     preview is not, because it changes several times a second and
				     the committed text reaches the field anyway. -->
				<p class="fb-dictate-status" role="status">
					{finishing
						? pendingLabel('Finishing the last sentence, then sending')
						: listening
							? listeningWords
							: endNote}
				</p>
				{#if dictError}
					<p class="fb-dictate-error" role="alert">{dictError}</p>
				{/if}
				{#if finePointer}
					<p class="fb-dictate-keys">
						<kbd>{chordWords}</kbd> starts and stops dictation; Escape stops it.
					</p>
				{/if}
				<p class="fb-dictate-note">
					{DICTATION_NOTE}{meter ? ` ${DICTATION_LEVEL_NOTE}` : ''}
				</p>
			{:else}
				{@render messageField()}
			{/if}

			<!--
				WHAT DID YOU TRY. Optional, and the label says so: the 2026-08-31
				triage produced several reports nobody could act on because the row
				said where somebody was and nothing about what they had already
				done about it.
			-->
			<label class="fb-label" for="fb-tried">What did you try? (optional)</label>
			<textarea
				id="fb-tried"
				class="fb-area fb-area-tried"
				bind:value={tried}
				oninput={typed}
				disabled={sending}
				rows="2"
				maxlength={FEEDBACK_TRIED_MAX}
				placeholder="Reloaded it, tried another browser, asked someone else to try..."
			></textarea>

			{#if uploadScreenshot}
				<div class="fb-shot">
					<span class="fb-label">A screenshot (optional)</span>
					{#if shotPath}
						<div class="fb-shot-staged">
							{#if shotPreview && !shotBroken}
								<!--
									THE LOCAL FILE, at `object-fit: contain`: a filename says
									nothing about whether the thing that went wrong is in the
									frame, and cropping to fill hides the cut-off edge the
									preview exists to catch. No animation, so there is nothing
									here for reduced motion to gate.
								-->
								<img
									class="fb-shot-thumb"
									src={shotPreview}
									alt="The screenshot you attached"
									onerror={() => (shotBroken = true)}
								/>
							{:else}
								<span class="fb-shot-fallback">Attached</span>
							{/if}
							<span class="fb-shot-name">{shotName}</span>
							<button type="button" class="fb-btn fb-shot-remove" onclick={removeScreenshot}>
								REMOVE
							</button>
						</div>
					{:else}
						<div class="fb-shot-pick">
							<!--
								NO `accept` ATTRIBUTE. An accept list HIDES files in the
								dialog rather than refusing them, so a person whose
								screenshot is filtered out is given no sentence at all;
								the refusal below states the reason and the limit.
							-->
							<input
								type="file"
								class="fb-shot-input"
								id="fb-shot-input"
								bind:this={fileEl}
								onchange={(e) => {
									const picked = Array.from(e.currentTarget.files ?? []);
									if (picked.length) void stageScreenshot(picked);
								}}
							/>
							<label class="fb-btn fb-shot-choose" for="fb-shot-input">
								{shotBusy ? 'ATTACHING' : 'CHOOSE AN IMAGE'}
							</label>
							<span class="fb-shot-hint">
								or drop one here, or press Ctrl+V to paste one
							</span>
						</div>
					{/if}
					{#if shotError}
						<!-- The refusal renders where the person was working, in the
						     words of the refusal, with the limit where there was one. -->
						<p class="fb-shot-error" aria-live="polite">{shotError}</p>
					{/if}
					<!-- THE CAP IS READ, NEVER RETYPED. A number written down twice is
					     the one that stops agreeing with the bucket enforcing it. -->
					<p class="fb-shot-note">
						{FEEDBACK_SCREENSHOT_TYPE_WORDS}, up to
						{formatScreenshotBytes(FEEDBACK_SCREENSHOT_MAX_BYTES)}. Only you and a site
						admin can open it.
					</p>
				</div>
			{:else if screenshotNote}
				<p class="fb-shot-note fb-shot-absent">{screenshotNote}</p>
			{/if}

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
					disabled={sending}
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
					{sending ? 'SENDING' : finishing ? 'FINISHING' : 'SEND'}
				</button>
			</div>
		{/if}
	</div>
</div>

<style>
	/* Neutral defaults; a host design system overrides these from outside
	   (e.g. `.glb .fb-scrim { --fb-accent: #2ae57e; }`) rather than this
	   component growing per-app branches.

	   THE OVERRIDE HAS TO LAND ON THE SCRIM ITSELF, NOT ON AN ANCESTOR. These
	   are declared HERE, so a host that sets `--fb-accent` on a wrapper
	   element is beaten by this block on the descendant and changes nothing
	   -- which is exactly how the portal's box stayed blue for months while
	   `SiteFeedback` believed it was handing its tokens down. A host writes
	   `.host :global(.fb-scrim) { ... }`, the way GREENLINE does.

	   EVERY PAINTED VALUE IS A HOOK. The fills used to be literals (a blue-black
	   field, a blue-black chip, a blue-black button gradient) beside a token set
	   whose comment said "driven entirely" by tokens -- so a host could recolour
	   the accent and still get blue controls. The defaults below are those exact
	   literals, so a host that sets nothing new renders byte-identically. */
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
		/* Chrome type: the title, the kind chips, the labels, the buttons and
		   the count. Defaults to the body face, so a host with one face sets
		   one token. */
		--fb-font-mono: var(--fb-font);
		/* The veil over the page behind the box. */
		--fb-shade: rgba(2, 3, 4, 0.82);
		/* The text fields, the kind chips and the buttons. A whole background
		   value each, so a host may hand in a flat token or a gradient. */
		--fb-field: rgba(5, 8, 11, 0.75);
		--fb-chip: rgba(10, 15, 21, 0.6);
		--fb-control: linear-gradient(180deg, rgba(23, 30, 37, 0.85), rgba(9, 13, 17, 0.9));
		/* The accent-tinted edges: the primary button's, and the selected kind
		   chip's. A host whose accent is darker than the neutral default's can
		   hand in the full accent here, because a 45% tint of a mid-lightness
		   green does not clear the 3:1 a control's outer edge owes. */
		--fb-accent-edge: color-mix(in srgb, var(--fb-accent) 45%, transparent);
		--fb-accent-edge-on: color-mix(in srgb, var(--fb-accent) 55%, transparent);
		/* An open microphone is a LIVE state. Defaults to the danger tone; the
		   portal points it at its reserved live/rec colour. */
		--fb-live: var(--fb-danger);
		/* The grey of words still being heard, drawn over the field. Read
		   through the room hook every host already re-points. */
		--dg-ink: var(--fb-ink-dim);

		position: fixed;
		inset: 0;
		z-index: 120;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		background: var(--fb-shade);
		font-family: var(--fb-font);
	}
	.fb-box {
		width: min(94vw, 30rem);
		max-height: 92vh;
		overflow-y: auto;
		padding: 0.9rem 1.05rem 1rem;
		background: linear-gradient(180deg, var(--fb-bg) 0%, var(--fb-bg-deep) 100%);
		/* Under the gradient, never seen: the gradient is opaque. It is here so a
		   contrast read that cannot see through a background-image lands on the
		   box's own deep plate rather than walking out to the veil behind it
		   (measured: on a light room that walk reported the title at 1.09:1 on
		   the dark scrim while it sat at 15:1 on its real ground). */
		background-color: var(--fb-bg-deep);
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
		font-family: var(--fb-font-mono);
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
		/* A bare <button> takes the UA face (Arial, measured) unless told
		   otherwise; the glyph rides on the chrome face like the title. */
		font-family: var(--fb-font-mono);
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
		background: var(--fb-chip);
		border: 1px solid var(--fb-line);
		border-radius: 2px;
		color: var(--fb-ink-dim);
		font: inherit;
		font-family: var(--fb-font-mono);
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
		border-color: var(--fb-accent-edge-on);
		box-shadow: 0 0 10px color-mix(in srgb, var(--fb-accent) 18%, transparent);
	}
	/* The horizon group sits directly under the kind group, so the hint takes
	   the gap the kinds would have left before the message label. */
	.fb-horizons {
		margin-bottom: 0.3rem;
	}
	.fb-horizon-hint {
		margin: 0 0 0.7rem;
		color: var(--fb-ink-faint);
		/* 11.2px, the label floor. */
		font-size: 0.7rem;
		line-height: 1.45;
	}
	/* THE CONSOLE LINK IS A KEY that owns its row slot, so it takes the 44px
	   floor from `.fb-btn`, and it never wraps its own two words: the title
	   beside it is what gives way on a phone. */
	.fb-console-link {
		display: inline-flex;
		align-items: center;
		flex: none;
		text-decoration: none;
		text-transform: uppercase;
		white-space: nowrap;
		/* The site's `a:hover` glow is a link's, and this is a key. */
		text-shadow: none;
	}
	.fb-head .fb-title {
		min-width: 0;
	}
	/* Visually hidden, read aloud: where the link opens is said, not implied. */
	.fb-sr {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.fb-label {
		display: block;
		margin-bottom: 0.28rem;
		color: var(--fb-ink-faint);
		font-family: var(--fb-font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.06em;
	}
	.fb-area {
		width: 100%;
		box-sizing: border-box;
		resize: vertical;
		padding: 0.5rem 0.6rem;
		background: var(--fb-field);
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
		background: var(--fb-field);
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

	.fb-area-tried {
		margin-bottom: 0.6rem;
	}

	/* The message label and the dictate control share a row; the label keeps
	   its `for`, the row takes the label's bottom margin. */
	.fb-label-row {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.28rem;
	}
	.fb-label-row .fb-label {
		margin-bottom: 0;
		min-width: 0;
	}
	.fb-dictate {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		flex: none;
		padding: 0.3rem 0.7rem;
		/* The loudness bars take the same reserved live colour as the dot. */
		--dl-ink: var(--fb-live);
	}
	.fb-dictate.listening {
		color: var(--fb-ink);
		border-color: var(--fb-live);
	}
	.fb-dictate-mic {
		width: 0.9rem;
		height: 0.9rem;
	}
	.fb-dictate-dot {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 50%;
		background: var(--fb-live);
	}
	/* The status line keeps its box while empty so the field below does not
	   jump when listening starts. */
	.fb-dictate-status,
	.fb-dictate-note,
	.fb-dictate-keys {
		margin: 0.3rem 0 0;
		font-size: 0.68rem;
		line-height: 1.45;
	}
	.fb-dictate-status {
		min-height: 1em;
		color: var(--fb-ink-dim);
	}
	.fb-dictate-note {
		color: var(--fb-ink-faint);
		margin-bottom: 0.6rem;
	}
	.fb-dictate-keys {
		color: var(--fb-ink-faint);
	}
	.fb-dictate-keys kbd {
		font-family: var(--fb-font-mono);
		font-size: 0.66rem;
		color: var(--fb-ink-dim);
	}
	.fb-dictate-error {
		margin: 0.3rem 0 0;
		color: var(--fb-danger);
		font-size: 0.7rem;
		line-height: 1.45;
	}
	@media (prefers-reduced-motion: no-preference) {
		.fb-dictate-dot {
			animation: fb-live-pulse 1.2s ease-in-out infinite;
		}
		@keyframes fb-live-pulse {
			0%,
			100% {
				opacity: 1;
			}
			50% {
				opacity: 0.35;
			}
		}
	}
	/* Off for exactly the length of a send. `.fb-btn:disabled` below is the
	   same reading on the buttons; the fields take it here so a box mid-send
	   reads as one surface waiting rather than a dead button over live text. */
	.fb-kind:disabled,
	.fb-area:disabled,
	.fb-contact:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* The screenshot block. Nothing here animates, so there is nothing for
	   `prefers-reduced-motion` to gate; the one transition is on the drag
	   outline below and it is gated. */
	.fb-shot {
		margin-bottom: 0.5rem;
	}
	.fb-shot-pick,
	.fb-shot-staged {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	/* Visually hidden, never `display: none`: a hidden input is not focusable
	   and its label would then reach nothing by keyboard. */
	.fb-shot-input {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	/* A <label> is what a finger hits, so the 44px floor is stated on it. */
	.fb-shot-choose {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		cursor: pointer;
	}
	.fb-shot-input:focus-visible + .fb-shot-choose {
		color: var(--fb-ink);
		border-color: var(--fb-line-strong);
		outline: 1px solid color-mix(in srgb, var(--fb-accent) 55%, transparent);
		outline-offset: 1px;
	}
	.fb-shot-remove {
		min-height: 44px;
	}
	.fb-shot-thumb {
		width: 4.5rem;
		height: 3rem;
		/* CONTAIN, never cover: a cropped preview hides the cut-off edge this
		   exists to let somebody catch before they send it. */
		object-fit: contain;
		background: var(--fb-bg-deep);
		border: 1px solid var(--fb-line);
		border-radius: 2px;
	}
	.fb-shot-fallback,
	.fb-shot-name {
		font-size: 0.72rem;
		color: var(--fb-ink-dim);
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.fb-shot-hint,
	.fb-shot-note {
		margin: 0.3rem 0 0;
		color: var(--fb-ink-faint);
		font-size: 0.68rem;
		line-height: 1.45;
	}
	.fb-shot-hint {
		margin: 0;
	}
	.fb-shot-error {
		margin: 0.35rem 0 0;
		color: var(--fb-danger);
		font-size: 0.7rem;
		line-height: 1.45;
	}
	.fb-shot-absent {
		margin-bottom: 0.5rem;
	}
	/* An OUTLINE, never a border: a border would reflow the whole box every
	   time a drag crossed it. */
	.fb-box.fb-dragging {
		outline: 2px dashed color-mix(in srgb, var(--fb-accent) 60%, transparent);
		outline-offset: -4px;
	}
	@media (prefers-reduced-motion: no-preference) {
		.fb-box {
			transition: outline-color 120ms ease;
		}
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
		font-family: var(--fb-font-mono);
		font-size: 0.66rem;
		letter-spacing: 0.06em;
	}
	.fb-count.low {
		color: var(--fb-danger);
	}
	.fb-btn {
		min-height: 44px;
		min-width: 44px;
		background: var(--fb-control);
		border: 1px solid var(--fb-line);
		border-radius: 2px;
		color: var(--fb-ink-dim);
		font: inherit;
		font-family: var(--fb-font-mono);
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
		border-color: var(--fb-accent-edge);
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
