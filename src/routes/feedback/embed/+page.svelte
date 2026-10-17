<script lang="ts">
	import { onMount } from 'svelte';
	import { dev } from '$app/environment';
	import { page } from '$app/state';
	import SiteFeedback from '$lib/feedback/SiteFeedback.svelte';
	import { feedbackIsAnonymous, feedbackWriter } from '$lib/feedback/feedback';
	import {
		FEEDBACK_EMBED_MARKER,
		FEEDBACK_EMBED_MESSAGES as MSG,
		parseEmbedMessage,
		parseEmbedParams,
		type FeedbackEmbedMessageType
	} from '$lib/feedback/embed';
	import { SITE_PLATE } from '$lib/shell/site-plate';
	import { embedDevTransports } from '$lib/feedback/embed-dev-sink';
	import {
		FEEDBACK_EMBED_TYPESET_WAIT_MS,
		boxFamilies,
		settleWithin,
		warmFaces,
		type EmbedTypeset
	} from '$lib/feedback/embed-typeset';

	/**
	 * THE OFFICIAL FEEDBACK WINDOW, ALONE (ledger 0396, reports 0fe82a80 and
	 * 80bb4d23).
	 *
	 * A legacy page that renders no layout -- the IDEA Coin Ledger, an
	 * assignment handout -- carries the real `FeedbackTrigger`, server-rendered
	 * into its bytes, and opens THIS page in a transparent, same-origin frame
	 * covering its viewport. This page draws nothing but `SiteFeedback` in its
	 * `embed` place, so what opens is the home page's box -- the same fields,
	 * the same voice input, the same screenshot paste, drop and picker, the same
	 * horizon chips, "What did you try?", the same submit path and the same
	 * refusals -- because it IS the home page's box. Nothing here builds a form.
	 *
	 * IT KNOWS WHO IS SIGNED IN THE WAY EVERY PAGE DOES: from the root layout's
	 * own session, never from anything the opener sent. A signed-in visitor's
	 * report goes through the direct RLS-scoped insert, a signed-out one through
	 * the anonymous route, exactly as on the home page -- which is what lets the
	 * page that framed it stay session-blind, and an assignment handout stay one
	 * shared cache entry for a whole class.
	 *
	 * IT REPORTS THE OPENER, NEVER ITSELF. The route id, the build and the
	 * room's colours arrive in the query string (`parseEmbedParams` checks every
	 * field and drops what it does not recognise); the live path and the Ledger's
	 * tab arrive with each open. A report filed here records the page the person
	 * was looking at.
	 *
	 * THE FRAME IS DRIVEN BY MESSAGES, each origin-checked and source-checked
	 * (`$lib/feedback/embed.ts` names them): `ready` when this page can open,
	 * `opened` once the box is up, `closed` whenever it closes (the frame hides
	 * and the opener's button takes focus back), `failed` if the box's code could
	 * not load; and from the opener, `room` whenever its theme moved, so the box
	 * never keeps one theme's ground under another theme's ink.
	 */
	let { data } = $props();

	/** Read once: the opener does not change under an open frame. */
	const opener = parseEmbedParams(page.url.searchParams);

	/**
	 * THE HARNESS SINK, AND ONLY IN DEV. `/dev/coins` and `/dev/feedback/assignment`
	 * frame this page with `sink=memory`, so a report lands in an in-memory list
	 * on the framing page instead of the database, built by the REAL writer the
	 * window would use: `submitFeedback`'s row signed in, and the body
	 * `submitAnonymousFeedback` would post to the anonymous route signed out.
	 * `dev` is a build-time constant, so a production build carries no branch
	 * that reads the parameter. A signed-out harness gets no screenshot
	 * transport, as a signed-out visitor gets none: the box then says why,
	 * exactly as it does in production, and is the height it is there.
	 */
	const devSink =
		dev && page.url.searchParams.get('sink') === 'memory'
			? embedDevTransports({ anonymous: () => !data.claims })
			: null;

	const submit = $derived(devSink ? devSink.submit : feedbackWriter(data.supabase, data.claims?.sub));
	const anonymous = $derived(
		devSink ? !data.claims : feedbackIsAnonymous(data.supabase, data.claims?.sub)
	);

	let fb = $state<ReturnType<typeof SiteFeedback> | null>(null);
	let roomEl = $state<HTMLDivElement | null>(null);
	/** Whether the box is up, so an Escape before it mounts still closes the frame. */
	let boxUp = $state(false);

	/**
	 * THE BOX OPENS IN ITS OWN FACES (review polish round). This document is
	 * fresh over a page that is not one of ours, so nothing has loaded Rajdhani
	 * or Share Tech Mono yet; the first open used to lay the box out in the
	 * fallback stack and then reflow, SEND sitting below the box's edge for up
	 * to half a second. The faces start loading when this page mounts -- on the
	 * way to the press -- and an open waits for them, capped
	 * (`$lib/feedback/embed-typeset.ts`).
	 */
	let faces: Promise<boolean> = Promise.resolve(true);
	/**
	 * How the last open went, on the page's root for the browser pass: `set`
	 * when the box's faces were there before it drew, `missing` when one failed
	 * to load, `capped` when the wait ran out. Empty until the first open.
	 */
	let typeset = $state<EmbedTypeset | ''>('');
	/**
	 * Each open request, so one that is closed while it waits for its faces --
	 * an Escape, the page's own close -- never opens the box afterwards.
	 */
	let openSeq = 0;

	function openWhenSet(context: { pathname?: string | null; tab?: string | null } = {}) {
		const seq = ++openSeq;
		void settleWithin(faces, FEEDBACK_EMBED_TYPESET_WAIT_MS).then((how) => {
			if (seq !== openSeq) return;
			typeset = how;
			fb?.openWindow(context);
		});
	}

	/** Is this page inside a frame of this site? A direct visit is not. */
	function framed(): boolean {
		try {
			return window.parent !== window && window.parent.location.origin === location.origin;
		} catch {
			return false;
		}
	}

	function post(type: FeedbackEmbedMessageType) {
		if (!framed()) return;
		window.parent.postMessage({ type }, location.origin);
	}

	/** Set while `closed` runs, so the box's own close calling back into it is absorbed. */
	let closing = false;

	function closed() {
		if (closing) return;
		closing = true;
		try {
			boxUp = false;
			/*
			 * A CLOSE BEFORE THE BOX IS UP WITHDRAWS THE OPEN, at either stage it
			 * can be waiting in: for its faces (`openSeq`), or for its code, when
			 * `SiteFeedback` has already said open and the box would otherwise
			 * mount a moment later inside a hidden frame. `closeWindow` calls back
			 * here through `onClose`, which the flag absorbs; after an ordinary
			 * close it finds nothing open and does nothing.
			 */
			openSeq++;
			fb?.closeWindow();
			if (framed()) {
				post(MSG.closed);
				return;
			}
			// A direct visit has no page to go back to inside a frame: go where the
			// person came from, or home.
			if (history.length > 1) history.back();
			else location.assign('/');
		} finally {
			closing = false;
		}
	}

	function onKeydown(e: KeyboardEvent) {
		// While the box is up it owns Escape (dictation first, then close). Before
		// it has mounted -- its code still arriving -- Escape closes the frame.
		if (e.key === 'Escape' && !boxUp) {
			e.preventDefault();
			closed();
		}
	}

	/** The room properties this page has set, so a newer set can take back what it drops. */
	let applied: string[] = [];

	/**
	 * THE ROOM'S COLOURS, applied one checked property at a time. Never as a
	 * style string: a value cannot escape a property set this way. Called with
	 * the query string's set at mount and again with each `room` message (the
	 * opener's theme moved, review round 2), and a name the newer set leaves
	 * out is removed, so the window falls back to its own theme's value for it
	 * rather than keeping the old theme's.
	 */
	function applyRoom(tokens: Record<string, string>) {
		if (!roomEl) return;
		for (const name of applied) if (!(name in tokens)) roomEl.style.removeProperty(name);
		for (const [name, value] of Object.entries(tokens)) roomEl.style.setProperty(name, value);
		applied = Object.keys(tokens);
	}

	onMount(() => {
		applyRoom(opener.tokens);
		faces = warmFaces(document.fonts, boxFamilies(document.documentElement));

		const onMessage = (e: MessageEvent) => {
			if (e.origin !== location.origin || e.source !== window.parent) return;
			const msg = parseEmbedMessage(e.data);
			if (!msg) return;
			if (msg.type === MSG.room) applyRoom(msg.tokens ?? {});
			else if (msg.type === MSG.open) openWhenSet({ pathname: msg.path, tab: msg.tab });
			else if (msg.type === MSG.close) {
				if (boxUp) fb?.closeWindow();
				else closed();
			}
		};
		window.addEventListener('message', onMessage);
		if (framed()) post(MSG.ready);
		// A direct visit opens the window on its own; there is no button to press.
		else openWhenSet();
		return () => window.removeEventListener('message', onMessage);
	});
</script>

<svelte:head>
	<title>Send feedback | IDEA</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<svelte:window onkeydown={onKeydown} />

<!--
	PLATE OR NOT IS THE OPENER'S CALL. The Ledger wears the site plate's
	geometry in its own colours, so its box wears the plate's keys and housing
	with the Ledger's tokens handed in; an assignment handout is the classic
	neon page, so its box is the plain one GAUNTLET and FRC get. `SITE_PLATE` is
	read, never spelled, so the plate's one-line revert reaches this page too.
-->
<div
	class={['fbe-plate', opener.plate && SITE_PLATE]}
	data-testid={FEEDBACK_EMBED_MARKER}
	data-typeset={typeset || undefined}
>
	<div class="fbe-root" bind:this={roomEl}>
		<SiteFeedback
			bind:this={fb}
			place="embed"
			routeId={opener.route}
			pathname={opener.path}
			role={data.userProfile?.role ?? null}
			build={opener.build}
			{submit}
			{anonymous}
			uploadScreenshot={devSink && !anonymous ? devSink.uploadScreenshot : null}
			onClose={closed}
			onstate={(state) => {
				if (state === 'opened') {
					boxUp = true;
					post(MSG.opened);
				} else {
					post(MSG.failed);
				}
			}}
		/>
	</div>
</div>

<style>
	/* THE FRAME IS TRANSPARENT, so the page it covers shows through the box's
	   own shade exactly as the home page shows through it. The site's body and
	   the plate both paint a ground, at (0,1,1); this is heavier, and scoped to
	   the one document that carries `.fbe-root`. `color-scheme: normal` matches
	   the frame element the launcher draws: Chromium paints an OPAQUE backdrop
	   behind a frame whose document's colour scheme differs from its element's,
	   so the two are pinned to the same value rather than left to the page's
	   theme. */
	:global(:root:has(.fbe-root)) {
		color-scheme: normal;
		background: transparent;
	}
	:global(:root body:has(.fbe-root)) {
		background: transparent;
		min-height: 0;
	}
	.fbe-plate,
	.fbe-root {
		display: contents;
	}
</style>
