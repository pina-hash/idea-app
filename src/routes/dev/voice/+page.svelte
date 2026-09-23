<script lang="ts">
	import VoiceNav from '$lib/voice/VoiceNav.svelte';
	import {
		VOICE_ACTIONS,
		VOICE_UNSUPPORTED_NOTE,
		voiceDestinations
	} from '$lib/voice/commands';
	import type {
		SpeechRecognitionCtor,
		SpeechRecognitionErrorLike,
		SpeechRecognitionEventLike,
		SpeechRecognitionLike
	} from '$lib/feedback/dictation';

	/**
	 * THE REAL COMPONENT, NEVER A COPY: `VoiceNav` here is the module the root
	 * layout mounts. What is replaced is only the thing that would open a
	 * microphone.
	 *
	 * THE CODE COUNTER IS NOT ON THIS PAGE, and it was for one draft. Its panel
	 * is `use:anchored`, which writes `position: fixed` and flips above the
	 * trigger when it will not fit below -- so an auto-opened counter on a
	 * harness page lands over the top of the whole document and hides the thing
	 * this route exists to measure. It belongs on `/dev/home-order`, in the
	 * sticky banner it actually ships in, which is also the room its own
	 * placement arithmetic has to work in.
	 */

	let { data } = $props();
	const h = $derived(data.harness);

	/**
	 * THE STUB RECOGNISER. Structural, which is the whole reason
	 * `$lib/feedback/dictation.ts` declares `SpeechRecognitionLike` as an
	 * interface rather than reaching for the browser global: `Dictation` cannot
	 * tell this from the real service, so everything downstream of it -- the
	 * result walk, the final/interim split, the `end` teardown -- is the
	 * shipping code path.
	 *
	 * IT OPENS NO MICROPHONE AND CANNOT. There is no `getUserMedia` here, no
	 * permission request and nothing that touches a device; `start()` simply
	 * calls the handler the driver registered.
	 */
	class HarnessRecognition implements SpeechRecognitionLike {
		lang = '';
		continuous = false;
		interimResults = false;
		onstart: ((ev: unknown) => void) | null = null;
		onresult: ((ev: SpeechRecognitionEventLike) => void) | null = null;
		onerror: ((ev: SpeechRecognitionErrorLike) => void) | null = null;
		onend: ((ev: unknown) => void) | null = null;
		constructor() {
			live = this;
		}
		start() {
			this.onstart?.({});
			// `?say=` drives one utterance the moment listening begins, which is
			// how a spec reaches the "acted on it" and "not a command" states
			// without a click sequence and without a microphone.
			if (h.say) queueMicrotask(() => this.commit(h.say));
		}
		stop() {
			this.onend?.({});
		}
		abort() {
			/* the driver has already dropped its handlers */
		}
		commit(text: string) {
			this.onresult?.({
				resultIndex: 0,
				results: [{ isFinal: true, length: 1, 0: { transcript: text } }]
			});
		}
		hear(text: string) {
			this.onresult?.({
				resultIndex: 0,
				results: [{ isFinal: false, length: 1, 0: { transcript: text } }]
			});
		}
	}

	let live: HarnessRecognition | null = null;
	const ctor = $derived(
		h.recognizer ? (HarnessRecognition as unknown as SpeechRecognitionCtor) : null
	);

	/** Where a matched command would have gone. Recorded, never navigated. */
	let went = $state<string[]>([]);

	let typed = $state('');
	const destinations = $derived(voiceDestinations({ signedIn: h.signedIn, isAdmin: h.admin }));
</script>

<svelte:head><title>dev // voice navigation</title></svelte:head>

<div class="harness-strip">
	recognizer=<strong>{h.recognizer ? 'stubbed' : 'ABSENT'}</strong>
	&middot; admin=<strong>{h.admin}</strong>
	&middot; signedIn=<strong>{h.signedIn}</strong>
	&middot; phrases=<strong>{destinations.length + VOICE_ACTIONS.length}</strong>
	&middot; <a href="?">listening, admin</a>
	&middot; <a href="?admin=0">student vocabulary</a>
	&middot; <a href="?recognizer=off">no support (nothing renders)</a>
	&middot; <a href="?say=maps">say "maps"</a>
	&middot; <a href="?say=gauntlets">say "gauntlets" (a miss)</a>
</div>

<main class="voice-harness">
	<h1>Voice navigation harness</h1>
	<p class="lead">
		No microphone is opened on this page and none can be: the recogniser is a stub in this
		route's own source. The control in the bottom left is the shipping component.
	</p>

	<section class="panel" data-testid="drive">
		<h2>Drive an utterance</h2>
		<p>
			Press <strong>Start listening</strong> in the control first, then send a phrase. This is
			exactly what the browser's speech service delivers: one final transcript.
		</p>
		<div class="row">
			<input
				type="text"
				bind:value={typed}
				placeholder="go to my notebook"
				aria-label="Utterance to send"
				data-testid="utterance"
			/>
			<button
				type="button"
				class="tap-44"
				data-testid="commit"
				onclick={() => live?.commit(typed)}
			>
				Send as final
			</button>
			<button type="button" class="tap-44" data-testid="interim" onclick={() => live?.hear(typed)}>
				Send as interim
			</button>
		</div>
		<p class="went" data-testid="went">
			Navigated: {went.length ? went.join(', ') : '(nothing yet)'}
		</p>
	</section>

	{#if !h.recognizer}
		<section class="panel" data-testid="unsupported">
			<h2>What a browser without the API gets</h2>
			<!-- THE SENTENCE IS RENDERED HERE AND ONLY HERE. On a real page the
			     control is simply absent; this is the one surface that
			     deliberately asks what the answer was. -->
			<p>{VOICE_UNSUPPORTED_NOTE}</p>
		</section>
	{/if}

	<!--
		THE SHIPPING COMPONENT, with the stub handed in and navigation CAPTURED
		rather than performed.

		`place="inline"` is the one thing that differs from the real mount, and
		it is forced: this component is ALREADY on this page through the root
		layout, docked to the bottom-left corner, and that copy holds the REAL
		browser recogniser. Two docked copies would sit exactly on top of each
		other with the real one on top, so a press meant for the stub would ask
		this machine for a microphone. Inline, the two cannot be confused -- by
		a person or by a spec. Everything but the positioning is identical.
	-->
	<section class="panel" data-testid="control-stage">
		<h2>The control</h2>
		<p>
			Press Start here, then send an utterance above. Nothing on this page can open a
			microphone: the recogniser is a stub in this route's own source.
		</p>
		<VoiceNav
			signedIn={h.signedIn}
			isAdmin={h.admin}
			suppressed={false}
			recognizer={ctor}
			place="inline"
			navigate={(href: string) => (went = [...went, href])}
		/>
	</section>
</main>

<style>
	.harness-strip {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 9999;
		background: #000;
		color: var(--dim);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		padding: 0.3rem 0.6rem;
		border-bottom: 1px solid var(--line);
	}
	.harness-strip strong {
		color: var(--cyan);
	}
	.harness-strip a {
		color: var(--gold);
	}

	.voice-harness {
		max-width: 60rem;
		margin: 0 auto;
		padding: 3rem 1rem 22rem;
	}
	h1 {
		font-family: var(--font-title, 'Orbitron', sans-serif);
		font-size: 1.2rem;
		color: var(--green);
	}
	.lead {
		color: var(--text-2);
		max-width: 46rem;
	}
	.panel {
		margin-top: 1.5rem;
		padding: 1rem;
		border: 1px solid var(--boundary);
		border-radius: 3px;
		background: var(--surface-1, #121a12);
	}
	h2 {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--cyan);
		margin: 0 0 0.5rem;
	}
	.row {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		align-items: center;
	}
	input {
		flex: 1 1 14rem;
		min-width: 0;
		min-height: 44px;
		padding: 0 0.6rem;
		background: var(--bg2, #16211a);
		border: 1px solid var(--boundary);
		border-radius: 2px;
		color: var(--white);
		font-family: var(--font-display);
	}
	button {
		background: none;
		border: 1px solid var(--boundary);
		border-radius: 2px;
		color: var(--text-2);
		padding: 0 0.8rem;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
	}
	.went {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--gold);
	}
</style>
