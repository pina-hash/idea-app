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
	 * WITHOUT `allow-same-origin`, which is the half that matters. That gives the
	 * document a unique OPAQUE ORIGIN: no parent DOM, no cookies, no credentialed
	 * fetch, none of `ideabosco.com`'s `localStorage`. NEVER add
	 * `allow-same-origin` beside `allow-scripts` -- together they let the frame
	 * reach `parent.document`, remove its own `sandbox` attribute from the
	 * `<iframe>` element and reload unsandboxed. If a change appears to need it,
	 * the change is wrong.
	 *
	 * THE SET ALSO CARRIES THE TWO POPUP FLAGS, deliberately, so a document can
	 * open a link in a new tab, and since ledger 0368 `allow-downloads`, so a
	 * document's own Download button works -- `bridge.ts` carries both decisions,
	 * what each costs and what was measured. The opened tab is a separate
	 * browsing context at its own origin and reaches nothing of this one.
	 *
	 * WHAT THE SANDBOX STILL COSTS, SO NOBODY DISCOVERS IT: `localStorage` THROWS
	 * in an opaque origin, so a ported document's autosave has to go through the
	 * bridge; the document cannot upload a file itself, so image bytes come up as
	 * `idea:image` and the PARENT uploads them; and it cannot draw a stored
	 * picture, so the parent draws it, over the box the document reports
	 * (`idea:image-box`) or in the list under the frame.
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
	import { onMount, untrack } from 'svelte';
	import { fileKindLabel, isImageFilename } from '$lib/classroom/classroom';
	import Lightbox from '$lib/media/Lightbox.svelte';
	import EnlargeCue from '$lib/media/EnlargeCue.svelte';
	import type { LightboxImage } from '$lib/media/lightbox';
	import {
		HX_SANDBOX_FLAGS,
		hxImageBoxStateMessage,
		hxImagePlacement,
		hxPostTarget,
		hxReceive,
		hxSavedMessage,
		hxStateMessage,
		hxVideoEmbedUrl,
		hxVideoStateMessage,
		hxThemeMessage,
		hxThemeOf,
		type HxAccepted,
		type HxImageBox,
		type HxVideoRect,
		type HxImageState,
		type HxDropReason,
		type HxVerdict
	} from './bridge.ts';
	import {
		assignmentLockState,
		ASSIGNMENT_LOCK_NOTICE,
		type AssignmentLockState
	} from './lock.ts';

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
		/**
		 * WHY THE WORKSHEET IS SHUT, WHEN IT IS, AND IT IS TOLD BEFORE THE
		 * STUDENT TYPES RATHER THAN AFTER.
		 *
		 * `readOnly` alone is a document that quietly stops taking input, which a
		 * student reads as the page being broken and reports as a bug. This is
		 * the sentence beside it, from `assignmentLockState` -- the one predicate
		 * over the stored row that the database's own guard mirrors -- so the
		 * frame never decides for itself what a locked assignment is.
		 *
		 * `null` IS THE ORDINARY CASE and renders nothing. The notice is not a
		 * status bar that says "open" when it is open: a permanent line saying
		 * everything is fine is a line people stop reading, which costs the one
		 * time it says something else.
		 */
		lock = null,
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
		lock?: AssignmentLockState | null;
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
	 * THE DOCUMENT IS SHUT IF EITHER SAYS SO, AND THAT IS BELT AND BRACES ON
	 * PURPOSE RATHER THAN A SECOND RULE.
	 *
	 * Absence is still the mechanism: a surface that must not write hands down
	 * no `onchange`, and there is then no write to execute whatever this says.
	 * What `readOnly` adds is that the DOCUMENT stops accepting keystrokes, so a
	 * student is not typing into a box that will never save -- and a locked
	 * assignment is exactly that case. Folding the lock in here means a caller
	 * cannot pass `lock` and forget `readOnly` and leave a worksheet that takes
	 * typing and drops it.
	 */
	const shut = $derived(readOnly || lock === 'closed' || lock === 'turned-in');

	/** The sentence, or null when there is nothing to say. */
	const lockNotice = $derived(
		lock && lock !== 'open' ? ASSIGNMENT_LOCK_NOTICE[lock] : null
	);

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
				// A document that announces itself again has reloaded and knows
				// nothing: its boxes and its player are gone, and it re-reports
				// boxes after the state below (the authoring rule). Stale rects from
				// the previous load would otherwise be drawn over the new one.
				boxes = {};
				announced = new Set();
				video = null;
				onready?.(message.schemaVersion);
				// The document is listening now, so the state it should open on goes
				// down immediately. Sent BEFORE the callback could change anything, so
				// a document always receives a state message and never has to ask.
				postState(values, images, shut);
				postTheme();
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
			case 'video': {
				const opening = video?.videoId !== message.videoId;
				video = { videoId: message.videoId, rect: message.rect, clipTop: message.clipTop };
				if (opening) post(hxVideoStateMessage(message.videoId, true));
				break;
			}
			case 'video-close':
				if (video) post(hxVideoStateMessage(video.videoId, false));
				video = null;
				break;
			case 'image-box': {
				// Immutable, so the derived placement sees a new object. A null
				// rect withdraws the box and the picture returns to the list.
				const { [message.field]: _withdrawn, ...rest } = boxes;
				boxes = message.rect ? { ...rest, [message.field]: { rect: message.rect, clipTop: message.clipTop } } : rest;
				break;
			}
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

	/** The portal's theme, after the first state and whenever the site's own
	    `data-theme` changes (the theme picker writes it without a reload). */
	function postTheme() {
		post(hxThemeMessage(hxThemeOf(document.documentElement.getAttribute('data-theme'))));
	}
	$effect(() => {
		if (!ready) return;
		const watch = new MutationObserver(() => postTheme());
		watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
		return () => watch.disconnect();
	});

	/** State down, whenever it moves and the document is listening. A document
	    that has not said `idea:ready` has no listener yet, so a send would go
	    nowhere and the `ready` branch above covers the first one. */
	$effect(() => {
		const snapshot = { values, images, shut, ready };
		if (!snapshot.ready) return;
		postState(snapshot.values, snapshot.images, snapshot.shut);
	});

	$effect(() => {
		const ack = saved;
		if (!ready || !ack) return;
		post(hxSavedMessage(ack.at, ack.ok, ack.reason ?? null));
	});

	/**
	 * THE RESTORED PHOTOGRAPHS, AS PARENT CHROME, BECAUSE THE DOCUMENT CANNOT
	 * DRAW THEM -- AND SINCE LEDGER 0368, OVER THE BOX THE DOCUMENT HOLDS OPEN.
	 *
	 * `idea:state` carries an image's URL down to the document and the document
	 * CANNOT RENDER IT: the URL is a portal proxy the sandbox CSP admits no host
	 * for, and the request would arrive credential-free off an opaque origin
	 * anyway. Weakening the CSP to let it in is the rejected fix -- `img-src
	 * data:` would happily render a round-tripped data URI, which would quietly
	 * make a student's document the system of record for their photograph. So a
	 * restored picture is drawn in chrome we own: OVER the box a document reports
	 * with `idea:image-box` (Mr. Pina, 2026-10-06: "I need for images to show
	 * within html assignments not under them"), and in the list UNDER the frame
	 * for every picture with no box, which is every picture in a document that
	 * predates the message. `hxImagePlacement` is the one rule, and a picture is
	 * always in exactly one of the two.
	 *
	 * IT LIVES IN THIS COMPONENT AND NOT AT EITHER CALL SITE, and that is the
	 * repo's parity rule rather than convenience: an instructor's view of
	 * student-facing content is the student view plus edit affordances, THROUGH
	 * THE SAME RENDER PATH. A strip built in the grading console would be a
	 * second view of a student's evidence that the student cannot see, free to
	 * drift from theirs; built here, the item page and the grading console get
	 * one implementation because both mount this. The overlay, the Lightbox and
	 * every Download are READS, so the read-only grading mount gets them too and
	 * no write callback is involved.
	 */
	let boxes = $state<Record<string, HxImageBox>>({});
	const placement = $derived(hxImagePlacement(images, boxes));

	/**
	 * A THUMBNAIL THAT WILL NOT DECODE FALLS BACK TO ITS ROW, never to a broken
	 * image icon. The proxy answers `application/octet-stream` with an
	 * attachment disposition, which an `<img>` decodes perfectly (measured in
	 * Chromium, CLAUDE.md's classroom-files section) -- but bytes may never have
	 * landed, and the honest answer then is the name, a marker and a Download.
	 *
	 * KEYED ON THE URL, NOT THE FIELD. The file id changes on every upload, so a
	 * student who replaces a picture that would not decode gets the new one TRIED
	 * rather than inheriting the old one's failure.
	 */
	let undecodable = $state<Record<string, true>>({});
	function markUndecodable(url: string) {
		undecodable = { ...undecodable, [url]: true };
	}

	/**
	 * PICTURE OR FILE IS `isImageFilename`, THE ONE RULE (CLAUDE.md, classroom
	 * files), and never a decode attempt. An image block stores whatever it is
	 * sent -- the Dogtag takes a `.SLDPRT` -- and asking an `<img>` to find out
	 * fetched the whole part through the proxy only to fail. A name that says
	 * picture is tried; the `onerror` is the second rung, for bytes that lied.
	 */
	function isPicture(image: HxImageState): boolean {
		return isImageFilename(image.name) && !undecodable[image.url];
	}
	function imageLabel(image: HxImageState): string {
		return image.caption || image.name;
	}

	/**
	 * EVERY PICTURE OPENS IN THE CLASSROOM LIGHTBOX (CLAUDE.md), one viewer over
	 * every decodable picture, boxed and listed alike, in field order -- so the
	 * arrows walk a student's pictures in the order the grader reads them.
	 * Download inside it is an `<a href>` to the same proxy URL, which answers
	 * with an attachment disposition, so no serve route changed.
	 */
	const pictures = $derived(
		[...placement.over, ...placement.under]
			.filter((p) => isPicture(p.image))
			.sort((a, b) => a.field.localeCompare(b.field))
	);
	const lightboxImages = $derived<LightboxImage[]>(
		pictures.map((p) => ({
			key: p.field,
			src: p.image.url,
			alt: imageLabel(p.image),
			caption: p.image.caption ? `${p.image.caption} (${p.image.name})` : p.image.name,
			downloadHref: p.image.url,
			downloadName: p.image.name
		}))
	);
	let openAt = $state<number | null>(null);
	/* The viewer is mounted only while there is a picture, so an open index
	   left behind when the last one goes would reopen it unbidden on the next. */
	$effect(() => {
		if (!lightboxImages.length) openAt = null;
	});
	function openPicture(field: string) {
		const at = pictures.findIndex((p) => p.field === field);
		if (at >= 0) openAt = at;
	}
	/** The heading names what is in the list, so a list holding a part file is
	    not called Photos. */
	const listHeading = $derived(
		placement.under.every((u) => isImageFilename(u.image.name)) ? 'Photos' : 'Photos and files'
	);

	/**
	 * THE PARENT TELLS THE DOCUMENT WHICH BOXES IT IS DRAWING OVER
	 * (`idea:image-box-state`), advisory, posted on a change of the set and
	 * never on a re-render. `announced` is a PLAIN Set, not state, and the post
	 * happens inside `untrack`: the effect is about the set of shown fields and
	 * whether the document is listening, and nothing the post touches may join
	 * that. The string is derived outside the effect so the effect reads one
	 * value rather than walking prop data.
	 */
	let announced = new Set<string>();
	const shownFields = $derived(placement.over.map((o) => o.field).join('\n'));
	$effect(() => {
		const shown = shownFields;
		if (!ready) return;
		untrack(() => announceBoxes(shown === '' ? [] : shown.split('\n')));
	});
	function announceBoxes(shown: string[]) {
		const next = new Set(shown);
		for (const field of next) if (!announced.has(field)) post(hxImageBoxStateMessage(field, true));
		for (const field of announced) if (!next.has(field)) post(hxImageBoxStateMessage(field, false));
		announced = next;
	}

	/**
	 * THE ONE VIDEO THE DOCUMENT HAS ASKED FOR, DRAWN OVER THE FRAME AT THE BOX
	 * IT HOLDS OPEN. See `HX_VIDEO_TYPE` in `bridge.ts` for why it is the
	 * parent's: a player framed inside the sandbox renders nothing. Keyed on the
	 * id so a rect update moves the player and never reloads it.
	 */
	let video = $state<{ videoId: string; rect: HxVideoRect; clipTop: number } | null>(null);
</script>

<div class="hx-frame-wrap" data-hx-ready={ready ? 'yes' : 'no'} data-hx-listening={listening ? 'yes' : 'no'}>
	<!--
		ABOVE THE DOCUMENT, NOT BELOW IT. A student scrolling a worksheet reads
		downward from the top, and a sentence explaining why nothing is saving
		belongs before the thing that is not saving rather than after it.

		`role="status"` AND NOT AN ALERT. It is a standing fact about the
		assignment, present from the first frame, not an event that just
		happened -- an assertive live region would interrupt a reader on every
		render for something that is not urgent.
	-->
	{#if lockNotice}
		<p class="hx-lock" role="status" data-hx-lock={lock}>{lockNotice}</p>
	{/if}
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
	<!--
		THE BORDER IS ON THIS BOX AND NOT ON THE FRAME, AND THAT IS ARITHMETIC
		RATHER THAN TASTE. `box-sizing: border-box` is global, so a 1px border on
		the `<iframe>` made `height: {height}px` an OUTER height and left the
		content box 2px short of the height the document had just reported.
		Measured on the old geometry at 1440: applied 726px, `clientHeight` 724.
		A document LONG ENOUGH TO FILL ITS BOX answers that with a full-length
		inner scrollbar over a 2px overflow -- put to a 1000px document, the
		content box came out 998 against a `scrollHeight` of 1000, and 1000
		against 1000 once the border moved here. (The short dev worksheet does
		NOT show the symptom: `documentElement.scrollHeight` is never less than
		the viewport, so a document that does not fill its box cannot overflow in
		either geometry. The defect is in the box model either way.)

		A WRAPPER RATHER THAN ADDING 2 TO THE APPLIED HEIGHT. Both fix the
		scrollbar; only one of them has no second copy of the border width in it.
		`height + 2` puts the number in the template and the `1px` in the
		stylesheet, so the day somebody restyles the edge the arithmetic goes
		quietly wrong again and nothing on screen says so. With the border out
		here the frame has no border and no padding, so its border-box height IS
		its content height and there is nothing to keep in step.

		`overflow: hidden` is what makes the radius clip a frame that has none of
		its own; the box is `display: flex` in one column so it takes exactly the
		frame's height and adds nothing of its own.
	-->
	<div class="hx-frame-box">
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
			{#if video}
				{#key video.videoId}
					<div
						class="hx-video"
						data-hx-video={video.videoId}
						style="left: {video.rect.x}px; top: {video.rect.y}px; width: {video.rect.w}px; height: {video.rect.h}px; clip-path: inset({video.clipTop}px 0 0 0);"
					>
						<!-- `strict-origin-when-cross-origin` because the player refuses to
						     start without a referrer (YouTube error 153); the origin is all
						     it gets. -->
						<iframe
							class="hx-video-player"
							src={hxVideoEmbedUrl(video.videoId)}
							title="Video"
							allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
							allowfullscreen
							referrerpolicy="strict-origin-when-cross-origin"
						></iframe>
					</div>
				{/key}
			{/if}
			<!--
				A STORED PICTURE, OVER THE BOX THE DOCUMENT HOLDS OPEN (ledger 0368).
				The rect is in the document's own pixels and starts at this box's
				padding edge, where the frame starts, exactly as the video's does,
				so a page scroll moves the frame and the picture together. The
				ground is opaque, so the document's own fallback inside the box is
				covered rather than drawn twice. `data-hx-image-box` is the rect the
				document asked for, so a browser pass can compare it with where the
				picture was actually drawn.

				AFTER THE FRAME IN TAB ORDER, deliberately: a keyboard reaches the
				picture once it has been through the document, which is the order
				the work is read in. Putting it first would put a student's own
				photograph before the worksheet that asks for it.
			-->
			{#each placement.over as o (o.field)}
				<div
					class="hx-image-over"
					data-hx-image-box="{o.rect.x},{o.rect.y},{o.rect.w},{o.rect.h}"
					data-hx-image-field={o.field}
					style="left: {o.rect.x}px; top: {o.rect.y}px; width: {o.rect.w}px; height: {o.rect.h}px; clip-path: inset({o.clipTop}px 0 0 0);"
				>
					{#if isPicture(o.image)}
						<button
							type="button"
							class="hx-image-over-open"
							aria-label="Open {imageLabel(o.image)} larger"
							data-testid="hx-image-over"
							onclick={() => openPicture(o.field)}
						>
							<!-- `loading="eager"`: a lazy image never requests in a pane
							     that does not fire IntersectionObserver. -->
							<img
								class="hx-image-over-img"
								src={o.image.url}
								alt={imageLabel(o.image)}
								loading="eager"
								onerror={() => markUndecodable(o.image.url)}
							/>
							<EnlargeCue />
						</button>
					{:else}
						<!-- A FILE THAT IS NOT A PICTURE IS A TILE, never a doomed
						     `<img>`: its kind, its name and a worded Download. -->
						<div class="hx-image-over-file" data-testid="hx-image-over-file">
							<span class="hx-file-glyph" aria-hidden="true">{fileKindLabel(o.image.name, null)}</span>
							<span class="hx-image-over-name">{o.image.name}</span>
							{#if isImageFilename(o.image.name)}
								<span class="hx-image-over-note">This file could not be shown as a picture.</span>
							{/if}
							<a
								class="hx-image-download"
								href={o.image.url}
								download={o.image.name}
								data-testid="hx-image-over-download">Download</a
							>
						</div>
					{/if}
				</div>
			{/each}
		{:else}
			<!-- Not a pending state to dress up: it lasts one frame after hydration
			     and a spinner here would be a flash on every load. The box holds its
			     height so nothing below it moves when the frame arrives. -->
			<div class="hx-frame hx-frame-placeholder" style="height: {height}px;" aria-hidden="true"></div>
		{/if}
	</div>

	{#if placement.under.length}
		<section class="hx-images" aria-label="Photos and files attached to this worksheet">
			<h3 class="hx-images-head">{listHeading}</h3>
			<ul class="hx-image-list">
				{#each placement.under as entry (entry.field)}
					{@const image = entry.image}
					<li class="hx-image">
						{#if !isImageFilename(image.name)}
							<!-- NOT A PICTURE BY ITS NAME, so nothing is fetched to find
							     out: the file's kind in place of a thumbnail. -->
							<span class="hx-image-file" aria-hidden="true">{fileKindLabel(image.name, null)}</span>
						{:else if undecodable[image.url]}
							<!-- A control absent for a reason says the reason. -->
							<span class="hx-image-missing" aria-hidden="true">!</span>
						{:else}
							<button
								type="button"
								class="hx-image-open"
								aria-label="Open {imageLabel(image)} larger"
								data-testid="hx-image-open"
								onclick={() => openPicture(entry.field)}
							>
								<!-- `loading="eager"`: a lazy image never requests in a pane that
								     does not fire IntersectionObserver, and every assertion about
								     it then passes vacuously. -->
								<img
									class="hx-image-thumb"
									src={image.url}
									alt={imageLabel(image)}
									loading="eager"
									onerror={() => markUndecodable(image.url)}
								/>
								<EnlargeCue />
							</button>
						{/if}
						<div class="hx-image-meta">
							<span class="hx-image-field">{entry.field}</span>
							<span class="hx-image-name">{image.name}</span>
							{#if image.caption}
								<span class="hx-image-caption">{image.caption}</span>
							{/if}
							{#if isImageFilename(image.name) && undecodable[image.url]}
								<!-- ITS OWN LINE, NOT AN `{:else}` ON THE CAPTION, and that was
								     the first shape. A student who wrote a caption still gets a
								     file that will not decode, and folding the two together
								     meant the only row that needed the explanation -- the one
								     with a caption -- was the one that did not get it. A
								     control absent for a reason says the reason, whatever else
								     is on the row. -->
								<span class="hx-image-caption hx-image-undecodable"
									>This file could not be shown as a picture.</span
								>
							{/if}
							<!-- EVERY ROW CAN BE DOWNLOADED, picture or not, decoded or not:
							     the same proxy URL, which answers with an attachment
							     disposition. Before ledger 0368 a file handed in through a
							     block had no download anywhere in the frame. -->
							<a
								class="hx-image-download"
								href={image.url}
								download={image.name}
								data-testid="hx-image-download">Download</a
							>
						</div>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if lightboxImages.length}
		<Lightbox
			images={lightboxImages}
			index={openAt}
			label="Photos in this worksheet"
			onIndex={(n) => (openAt = n)}
			onClose={() => (openAt = null)}
			testId="hx-lightbox"
		/>
	{/if}
</div>

<style>
	.hx-video {
		position: absolute;
		z-index: 1;
		background: #000;
	}
	.hx-video-player {
		display: block;
		width: 100%;
		height: 100%;
		border: 0;
	}
	/*
		A STORED PICTURE OVER THE DOCUMENT'S BOX. Opaque, so the document's own
		fallback underneath is covered rather than read twice; `--surface-2` so a
		picture narrower than its box sits on the room's ground rather than on
		whatever the document painted. No animation: it appears where the box is.
	*/
	.hx-image-over {
		position: absolute;
		z-index: 1;
		display: flex;
		background: var(--surface-2, var(--bg2));
		overflow: hidden;
	}
	.hx-image-over-open {
		/* The anchor for EnlargeCue, which is absolutely placed in its corner. */
		position: relative;
		flex: 1;
		min-width: 0;
		display: block;
		margin: 0;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		cursor: zoom-in;
		line-height: 0;
	}
	.hx-image-over-open:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: -2px;
	}
	.hx-image-over-img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.hx-image-over-file {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		padding: 0.6rem;
		text-align: center;
		background: var(--surface-1, var(--bg1));
		border: 1px solid var(--boundary);
	}
	.hx-image-over-name {
		font-size: 0.9rem;
		color: var(--text-1);
		overflow-wrap: anywhere;
		max-width: 100%;
	}
	.hx-image-over-note {
		font-size: 0.8rem;
		color: var(--text-2);
	}
	.hx-file-glyph,
	.hx-image-file {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-mono);
		font-weight: 600;
		letter-spacing: 0.03em;
		color: var(--hover-ink, var(--text-1));
		border: 1px solid var(--boundary);
		border-radius: var(--radius-sm, 4px);
	}
	.hx-file-glyph {
		min-height: 1.6rem;
		padding: 0 0.5rem;
		font-size: 0.7rem;
	}
	/*
		A WORDED DOWNLOAD, 44px IN EVERY DENSITY. It is the frame's own rule and
		not `.btn tiny`, which drops to 24px in a compact instructor surface --
		and this component is the STUDENT's page too, so it takes the student
		floor everywhere (CLAUDE.md, 44px on every student-facing surface).
	*/
	.hx-image-download {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		align-self: flex-start;
		min-height: 44px;
		padding: 0 0.9rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-1);
		background: var(--surface-1, var(--bg1));
		border: 1px solid var(--boundary);
		border-radius: 999px;
		text-decoration: none;
	}
	.hx-image-over-file .hx-image-download {
		align-self: center;
	}
	.hx-image-download:hover {
		color: var(--hover-ink, var(--text-1));
		text-decoration: none;
	}
	.hx-image-download:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}
	/*
		A NOTICE, NOT A WARNING. Nothing has gone wrong -- an instructor closed an
		assignment at the end of a unit, which is the feature working -- so it
		takes the room's own boundary and secondary ink rather than `--amber` or
		`--crimson`, which mean warning and error and would tell a student their
		work is in trouble.
	*/
	.hx-lock {
		margin: 0 0 var(--space-2);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		background: var(--surface-2);
		color: var(--text-2);
		font-size: 0.9375rem;
		line-height: 1.45;
	}

	.hx-frame-wrap {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.hx-frame-placeholder {
		/* The same box, so the frame arriving moves nothing. */
		background: var(--surface-1, var(--bg1));
	}

	.hx-images {
		margin-top: var(--space-3, 0.9rem);
	}

	.hx-images-head {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2);
		margin: 0 0 var(--space-2, 0.6rem);
	}

	.hx-image-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		/* `auto-fit` so one photo takes the row rather than leaving a void beside
		   it, and `min()` so the same rule is the single narrow column at 375px
		   with no breakpoint of its own. */
		grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr));
		gap: var(--space-2, 0.6rem);
	}

	.hx-image {
		display: flex;
		gap: var(--space-2, 0.6rem);
		align-items: flex-start;
		/* An item's automatic minimum is its min-content, so a long filename
		   would otherwise push the whole grid wider than the viewport. */
		min-width: 0;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-md, 8px);
		padding: var(--space-2, 0.6rem);
		background: var(--surface-1, var(--bg1));
	}

	/* A real button now (it opens the Lightbox), wide enough for the Enlarge
	   word in its corner, and its own UA chrome goes. */
	.hx-image-open {
		position: relative;
		flex: none;
		width: 6rem;
		height: 6rem;
		margin: 0;
		padding: 0;
		border: 1px solid var(--hairline, var(--boundary));
		border-radius: var(--radius-sm, 4px);
		overflow: hidden;
		background: var(--surface-2, var(--bg2));
		color: inherit;
		font: inherit;
		line-height: 0;
		cursor: zoom-in;
	}
	.hx-image-open:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}

	.hx-image-thumb {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		background: var(--surface-2, var(--bg2));
	}

	.hx-image-file {
		width: 6rem;
		height: 6rem;
		flex: none;
		font-size: 0.85rem;
	}

	.hx-image-missing {
		width: 6rem;
		height: 6rem;
		flex: none;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-mono);
		font-size: 1.4rem;
		color: var(--amber);
		border: 1px dashed var(--boundary);
		border-radius: var(--radius-sm, 4px);
	}

	.hx-image-meta {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}

	.hx-image-field {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2);
		overflow-wrap: anywhere;
	}

	.hx-image-name {
		font-size: 0.85rem;
		color: var(--text-1);
		overflow-wrap: anywhere;
	}

	.hx-image-caption {
		font-size: 0.8rem;
		color: var(--text-2);
		overflow-wrap: anywhere;
	}

	/* The edge, the corners and the clip. See the comment on the element for
	   why they are not on the frame itself. */
	.hx-frame-box {
		/* The anchor for `.hx-video`, whose rect is in the document's own pixels
		   and so starts at this box's padding edge, where the frame starts. */
		position: relative;
		display: flex;
		flex-direction: column;
		min-width: 0;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-md, 8px);
		overflow: hidden;
	}

	.hx-frame {
		display: block;
		width: 100%;
		min-width: 0;
		/* NO BORDER AND NO PADDING, which is what makes the applied height the
		   content height under the global `box-sizing: border-box`. */
		border: 0;
		/*
			A ported document draws its own page. Painting one here would show
			through wherever the document does not, and it would be OUR colour on
			somebody else's worksheet.
		*/
		background: var(--surface-1, var(--bg1));
	}
</style>
