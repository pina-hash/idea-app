<script lang="ts">
	/**
	 * THE ONE FRAME A PORTED HTML ASSIGNMENT IS EVER SHOWN IN.
	 *
	 * There is exactly one place in the repository where this `sandbox`
	 * attribute is written down, and it is `HX_SANDBOX_FLAGS` in `bridge.ts`,
	 * imported here. The failure mode of a second copy is a frame that looks
	 * identical and isolates nothing -- it renders the same, it behaves the
	 * same, and the only difference is that a student's uploaded document is now
	 * running with the rights of the page around it.
	 *
	 * `allow-scripts` WITHOUT `allow-same-origin`. That pair gives the document a
	 * unique OPAQUE ORIGIN: no parent DOM, no cookies, no credentialed fetch,
	 * none of `ideabosco.com`'s `localStorage`. NEVER add `allow-same-origin`
	 * beside `allow-scripts` -- together they let the frame reach
	 * `parent.document`, remove its own `sandbox` attribute from the `<iframe>`
	 * element and reload unsandboxed. If a change appears to need it, the change
	 * is wrong.
	 *
	 * WHAT THAT COSTS, SO NOBODY DISCOVERS IT: `localStorage` THROWS in an opaque
	 * origin, so a ported document's autosave has to go through the bridge;
	 * downloads do not fire without `allow-downloads`; and the document cannot
	 * upload a file itself, so image bytes come up as `idea:image` and the PARENT
	 * uploads them.
	 *
	 * THIS COMPONENT OWNS THE ELEMENT AND THE LISTENER. IT OWNS NO RULES. Every
	 * decision about whether a message counts is `hxReceive` in `bridge.ts`,
	 * where it can be put to a hostile input with no browser in the room. What is
	 * left here is genuinely only the DOM: mount a frame, listen, hand each
	 * message to the gate, and call the caller back with what came out.
	 *
	 * IT FETCHES NOTHING AND WRITES NOTHING. The parent owns every database
	 * write, per the contract, so this component takes state via props and emits
	 * intent via callbacks -- the route above it decides what a change means.
	 * SUBMIT IS A PARENT CONTROL IN PARENT CHROME and is deliberately not here:
	 * a Submit inside the document would be a button whose handler the document
	 * itself wrote.
	 */
	import { onMount } from 'svelte';
	import {
		HX_SANDBOX_FLAGS,
		hxPostTarget,
		hxReceive,
		hxSavedMessage,
		hxStateMessage,
		type HxAccepted,
		type HxImageState,
		type HxDropReason,
		type HxVerdict
	} from './bridge.ts';

	let {
		/** The document's URL on the sandbox origin: `<sandbox origin>/hx/<docId>`. */
		src,
		title,
		/**
		 * THE FIELD-TO-BLOCK MAP THE PARENT BUILT FROM THE MANIFEST IT STORED AT
		 * IMPORT, and the reason a frame naming a `block_id` gets nowhere. It is a
		 * PROP rather than something this component derives, because the parsed
		 * manifest is the route's -- and because a map the frame cannot influence
		 * is the whole mechanism. Nothing the document sends may add a key to it.
		 */
		fieldToBlockId,
		/** Values to seed the document with, keyed by FIELD (the document's own
		    names). The route translates from block ids, which is the direction the
		    manifest already runs. */
		values = {},
		/**
		 * THE PICTURES ALREADY STORED, KEYED BY FIELD, AS URLS AND NEVER AS
		 * BYTES. See `HxImageState` in `bridge.ts` for why the return trip is a
		 * URL: bytes go frame-to-parent only. Required in the message and
		 * defaulted here, so a caller with no images sends `{}` rather than
		 * omitting the key -- an absent key would leave a reloaded worksheet
		 * showing no photographs, which reads as an upload that never worked.
		 */
		images = {},
		readOnly = false,
		/** The last save acknowledgement to hand down, or null for none yet. A
		    failed one carries WHY: a document can show a student a sentence and
		    cannot ask a follow-up question. */
		saved = null,
		/** Height before the document has reported one, and the floor thereafter. */
		minHeight = 320,
		onready,
		onchange,
		onimage,
		onimageremove,
		onimagecaption,
		onheight,
		/**
		 * EVERY DROPPED MESSAGE IS REPORTED. Silence would make a renamed field
		 * indistinguishable from a working one -- which is precisely the failure
		 * the contract calls out for a renamed block id: the answer simply stops
		 * rendering and nothing anywhere says why. An OPTIONAL callback, so a
		 * production surface may ignore drops while the harness counts them.
		 */
		ondropped
	}: {
		src: string;
		title: string;
		fieldToBlockId: Readonly<Record<string, string>>;
		values?: Record<string, string | boolean>;
		images?: Record<string, HxImageState>;
		readOnly?: boolean;
		saved?: { at: string; ok: boolean; reason?: string | null } | null;
		minHeight?: number;
		onready?: (schemaVersion: number) => void;
		onchange?: (change: { blockId: string; field: string; value: string | boolean }) => void;
		onimage?: (image: { blockId: string; field: string; name: string; bytes: string }) => void;
		onimageremove?: (image: { blockId: string; field: string }) => void;
		onimagecaption?: (image: { blockId: string; field: string; caption: string }) => void;
		onheight?: (px: number) => void;
		ondropped?: (drop: { reason: HxDropReason; detail: string }) => void;
	} = $props();

	let frame = $state<HTMLIFrameElement | null>(null);
	let ready = $state(false);

	/**
	 * THE HEIGHT IS DERIVED, NOT SEEDED, AND THAT IS NOT ONLY ABOUT A WARNING.
	 * `$state(minHeight)` reads the prop once at construction, so a caller that
	 * later raised the floor would be ignored -- and it earns
	 * `state_referenced_locally`, which is the compiler saying exactly that. What
	 * the document reported and what the caller will accept are two separate
	 * facts; keeping them separate means the floor stays live.
	 */
	let reportedPx = $state(0);
	const height = $derived(Math.max(minHeight, reportedPx));

	/** The origin the document is served from, read off `src` -- the URL this
	    frame is actually about to load, rather than a second read of a variable
	    somebody else already used to build it. An unparseable `src` yields '',
	    which fails closed: no origin can ever equal the expected one. */
	const documentOrigin = $derived.by(() => {
		try {
			return new URL(src, typeof location === 'undefined' ? undefined : location.href).origin;
		} catch {
			return '';
		}
	});

	function receive(event: MessageEvent): HxVerdict {
		return hxReceive(
			{ origin: event.origin, source: event.source, data: event.data },
			{
				documentOrigin,
				frameWindow: frame?.contentWindow ?? null,
				sandboxFlags: HX_SANDBOX_FLAGS,
				fieldToBlockId
			}
		);
	}

	function dispatch(message: HxAccepted) {
		switch (message.kind) {
			case 'ready':
				ready = true;
				onready?.(message.schemaVersion);
				// The document is listening now, so the state it should open on goes
				// down immediately. Sent BEFORE the callback could change anything, so
				// a document always receives a state message and never has to ask.
				postState(values, images, readOnly);
				break;
			case 'change':
				onchange?.({ blockId: message.blockId, field: message.field, value: message.value });
				break;
			case 'image':
				onimage?.({
					blockId: message.blockId,
					field: message.field,
					name: message.name,
					bytes: message.bytes
				});
				break;
			case 'image-remove':
				onimageremove?.({ blockId: message.blockId, field: message.field });
				break;
			case 'image-caption':
				onimagecaption?.({
					blockId: message.blockId,
					field: message.field,
					caption: message.caption
				});
				break;
			case 'height':
				reportedPx = Math.ceil(message.px);
				onheight?.(message.px);
				break;
		}
	}

	/**
	 * THE FRAME IS NOT RENDERED UNTIL THE PARENT IS LISTENING, AND THAT IS A
	 * RACE THIS LANE MEASURED RATHER THAN REASONED ABOUT.
	 *
	 * WHAT HAPPENS WITHOUT IT. The `<iframe>` and its `src` are in the
	 * SERVER-RENDERED HTML, so the browser begins fetching the document as soon
	 * as it parses that tag -- long before the client bundle has loaded, let
	 * alone hydrated and attached a `message` listener. The document loads, runs,
	 * sends `idea:ready` and every `idea:change` it has, and nothing is listening
	 * for any of them. Measured on the real harness against the real route: 0 of
	 * 7 messages arrived, `readySchema` was null and the reported height was 0,
	 * with the frame plainly loaded and running (its own CSP refusals were in the
	 * console). It fails SILENTLY and it fails as an EMPTY WORKSHEET -- a student
	 * whose answers never save and whose seeded state never appears.
	 *
	 * AND IT CANNOT BE FIXED FROM THE DOCUMENT SIDE. The contract has the frame
	 * announce itself ONCE, with `idea:ready`; there is no re-announcement and no
	 * parent-initiated hello, so a missed `ready` is missed for the life of the
	 * page. Nor is it a matter of attaching the listener earlier: no listener can
	 * be attached before the JavaScript that would attach it has been fetched.
	 *
	 * SO THE ORDER IS MADE STRUCTURAL. `listening` is false until the listener is
	 * attached, and the `{#if}` below means the element -- and therefore the
	 * request -- does not exist until then. There is no window in which a
	 * document can speak to nobody, rather than a window that is usually short
	 * enough.
	 *
	 * `onMount` RATHER THAN AN `$effect`, on purpose: this is a one-shot
	 * subscription with a teardown, it must run exactly once, and it writes
	 * state. An effect writing the state its own template reads is the shape that
	 * lands mid-render as `state_unsafe_mutation`; `onMount` runs after the first
	 * render, on the client only, and returns its own cleanup.
	 *
	 * THE COST, STATED: with JavaScript off there is no frame at all. That is the
	 * honest outcome either way -- the document is a scripted bridge, so with no
	 * script it could neither load its state nor save an answer -- and an empty
	 * box is a better failure than a worksheet that silently discards everything
	 * typed into it.
	 */
	let listening = $state(false);

	onMount(() => {
		const onMessage = (event: MessageEvent) => {
			const verdict = receive(event);
			if (verdict.ok) dispatch(verdict.message);
			else ondropped?.({ reason: verdict.reason, detail: verdict.detail });
		};
		window.addEventListener('message', onMessage);
		listening = true;
		return () => window.removeEventListener('message', onMessage);
	});

	/**
	 * `hxPostTarget` IS `'*'` AND THAT IS FORCED, NOT LAZY. `postMessage`'s
	 * `targetOrigin` is a refusal: the browser delivers only if the receiving
	 * document's origin matches it. The receiving document is in an OPAQUE
	 * origin, which matches no origin string that can be written down, so any
	 * concrete target silently drops every message the parent sends. The full
	 * argument, including why it costs nothing here, is in `bridge.ts`.
	 */
	function post(message: unknown) {
		frame?.contentWindow?.postMessage(message, hxPostTarget);
	}

	/**
	 * `$state.snapshot` BEFORE POSTING, AND IT IS NOT DEFENSIVE TIDYING.
	 *
	 * `postMessage` structured-clones its payload, and structured clone REFUSES A
	 * PROXY -- which is exactly what Svelte 5 wraps a `$state` object in.
	 * Measured in this container's Chromium against the real frame: a plain
	 * object posts fine, and a proxy over the identical object throws
	 * `DataCloneError: Failed to execute 'postMessage' on 'Window'`.
	 *
	 * `values` is a PROP, so whether it is proxied is the CALLER's decision, not
	 * this component's -- and the natural way to write the surface above this one
	 * is to hold a student's answers in `$state`. Without the snapshot that
	 * caller gets a throw from inside a component they did not write, on a line
	 * that looks like it is just sending a message. The snapshot is a no-op on a
	 * plain object, so it costs nothing in the case that already worked.
	 */
	function postState(
		nextValues: Record<string, string | boolean>,
		nextImages: Record<string, HxImageState>,
		nextReadOnly: boolean
	) {
		post(hxStateMessage($state.snapshot(nextValues), $state.snapshot(nextImages), nextReadOnly));
	}

	/** State down, whenever it moves and the document is listening. A document
	    that has not said `idea:ready` has no listener yet, so a send would go
	    nowhere and the `ready` branch above covers the first one. */
	$effect(() => {
		const snapshot = { values, images, readOnly, ready };
		if (!snapshot.ready) return;
		postState(snapshot.values, snapshot.images, snapshot.readOnly);
	});

	$effect(() => {
		const ack = saved;
		if (!ready || !ack) return;
		post(hxSavedMessage(ack.at, ack.ok, ack.reason ?? null));
	});
</script>

<div class="hx-frame-wrap" data-hx-ready={ready ? 'yes' : 'no'} data-hx-listening={listening ? 'yes' : 'no'}>
	<!--
		`referrerpolicy="no-referrer"`: the request for a document carries no record
		of which page of ours the viewer came from. It is a cross-site request
		either way in production, so the referrer would be the origin only, but the
		origin is still more than the sandbox host has any use for.

		`loading="eager"`: an assignment is the reason the page was opened, so
		there is nothing to defer. (It also matters for verification -- a lazy
		frame never loads in a pane that does not fire IntersectionObserver, and
		every assertion about it then passes vacuously.)
	-->
	{#if listening}
		<iframe
			bind:this={frame}
			{src}
			{title}
			class="hx-frame"
			style="height: {height}px;"
			sandbox={HX_SANDBOX_FLAGS}
			referrerpolicy="no-referrer"
			loading="eager"
			data-hx-frame
		></iframe>
	{:else}
		<!-- Not a pending state to dress up: it lasts one frame after hydration
		     and a spinner here would be a flash on every load. The box holds its
		     height so nothing below it moves when the frame arrives. -->
		<div class="hx-frame hx-frame-placeholder" style="height: {height}px;" aria-hidden="true"></div>
	{/if}
</div>

<style>
	.hx-frame-wrap {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.hx-frame-placeholder {
		/* The same box, so the frame arriving moves nothing. */
		background: var(--surface-1, var(--bg1));
	}

	.hx-frame {
		display: block;
		width: 100%;
		min-width: 0;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-md, 8px);
		/*
			A ported document draws its own page. Painting one here would show
			through wherever the document does not, and it would be OUR colour on
			somebody else's worksheet.
		*/
		background: var(--surface-1, var(--bg1));
	}
</style>
