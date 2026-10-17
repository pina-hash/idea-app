import { render } from 'svelte/server';
import FeedbackTrigger from '$lib/feedback/FeedbackTrigger.svelte';
import {
	describeBuild,
	FEEDBACK_EMBED_PATH,
	FEEDBACK_LOAD_FAILED,
	FEEDBACK_OPENING,
	REPORT_LABEL,
	type BuildStamp
} from '$lib/feedback/context';
import { FEEDBACK_EMBED_MARKER, FEEDBACK_EMBED_MESSAGES, FEEDBACK_ROOM_TOKENS } from '$lib/feedback/embed';

/**
 * THE OFFICIAL FEEDBACK BUTTON AND WINDOW FOR A PAGE THAT RENDERS NO LAYOUT
 * (ledger 0396, reports 0fe82a80 and 80bb4d23).
 *
 * `SiteFeedback` is mounted once in the root layout, which is what makes the
 * feedback window something a new route INHERITS. A carried-over legacy page --
 * the IDEA Coin Ledger, an assignment handout -- is HTML served from a
 * `+server.ts`, inherits nothing, and has no component tree to mount anything
 * into. It used to get a hand-built imitation of the box injected into its
 * bytes (`legacy-report-panel.ts`, deleted by this bundle), and Mr. Pina called
 * it "an inferior design": a second implementation imitating the first. So:
 *
 *   THE BUTTON IS THE REAL ONE. `FeedbackTrigger` is server-rendered into the
 *   served string, its markup and its stylesheet both (`css="injected"` hands
 *   the scoped rules back from `render()`), in the official position at the
 *   bottom right. Nothing about it is restated here.
 *
 *   THE WINDOW IS THE REAL ONE. The button opens `/feedback/embed` -- this
 *   site's own page, rendering `SiteFeedback` alone -- in a transparent
 *   same-origin frame covering the viewport, so the box opens exactly where
 *   and how the home page's opens, with every field, the voice input, the
 *   screenshot paste, drop and picker, the horizon chips, "What did you try?",
 *   the same submit path and the same refusals.
 *
 *   THE ROOM RESTYLES BOTH THROUGH TOKENS ONLY. A room's hook block (below) is
 *   declared on the button's wrapper and maps the page's own tokens onto the
 *   `--fb-room-*` hooks the button and the box read, and -- for a page that
 *   wears the plate in its own colours, the Ledger -- onto the plate tokens the
 *   box's keys read. The button reads them where they are declared; the
 *   launcher reads their RESOLVED values off the wrapper and hands them to the
 *   window in its query string, so one declaration colours both and the page's
 *   live theme decides the values.
 *
 *   THE PAGE STAYS SESSION-BLIND. Nothing injected here depends on who is
 *   reading: the window is a page of this site and knows the session the way
 *   the home page does. That is what lets an assignment handout stay one shared
 *   cache entry for a whole class (no `Vary: Cookie`), and it is why the Ledger
 *   no longer reads the session for feedback at all.
 *
 * WHAT THE FILE ON DISK SEES: nothing. Every addition is to the served STRING,
 * the convention for anything added to legacy HTML, and the frozen Ledger is
 * not edited.
 */

/** The button's wrapper, which carries the room's hooks and which the script finds. */
export const FEEDBACK_LAUNCH_ID = 'idea-feedback-launch';
/** The overlay frame the window opens in. */
export const FEEDBACK_LAUNCH_FRAME_ID = 'idea-feedback-frame';
/** How long the window may take to say it is ready before the button says it did not load. */
export const FEEDBACK_LAUNCH_TIMEOUT_MS = 15000;

/** Which room's colours the button and the window wear. */
export type FeedbackLaunchRoom = 'ledger' | 'assignment';

export interface FeedbackLaunchOptions {
	/** The opener's route id, which names the app and the row's context. */
	route: string;
	room: FeedbackLaunchRoom;
	/** Build provenance, from the same `describeBuild` the root layout uses. */
	deploy: { sha?: string | null; complete?: boolean } | null | undefined;
	buildId: string | null | undefined;
	/** A selector whose text names the screen within the page (the Ledger's active tab). */
	tabSelector?: string | null;
	/**
	 * HARNESS ONLY: extra query parameters for the window (`sink=memory`,
	 * `signedIn=1`), which `/feedback/embed` honours only in dev. A production
	 * route never passes this.
	 */
	embedQuery?: Record<string, string>;
}

/**
 * The one set of options every `/assignments/<slug>` response carries. The
 * `/dev` harness spreads it and adds only its sink, so what it measures is what
 * the route serves.
 */
export const ASSIGNMENT_FEEDBACK_LAUNCH = {
	route: '/assignments/[slug]',
	room: 'assignment',
	tabSelector: null
} as const satisfies Omit<FeedbackLaunchOptions, 'deploy' | 'buildId'>;

/*
 * THE ROOM HOOK BLOCKS. Each is declared on the button's wrapper, so the button
 * reads it by inheritance and the launcher reads its resolved values off the
 * same element for the window.
 *
 * THE LEDGER'S tokens are the plate's under other names (`--lp-*`, ledger 0384:
 * "the site plate's geometry in its own neon colours"), declared on its `:root`
 * for IDEA, Matrix and Space White alike, so this block names TOKENS, never
 * values: the Ledger's own measured palette decides every colour in every
 * theme, and a later change to the Ledger's palette reaches the window with no
 * edit here. The button wears the Ledger's own key: its face gradient, its
 * bevel, its 11px corner and its key ink, through the four trigger hooks. A
 * LIT key (a chosen kind, a chosen horizon) takes the Ledger's own lit word,
 * `--lp-lit-ink`, through `--plate-lit-ink`: the plate's lit face with the
 * plate's unlit ink measured 2.35:1 on Space White's green (review round 1);
 * the Ledger's own pair is #f7f9f9 on #00701d there, and gold on its dark lit
 * face in IDEA and Matrix, which is what its own tabs draw.
 *
 * THE FOCUS RING IS THE LEDGER'S OWN CYAN (review round 3), drawn round the
 * button over the page and round every key in the window over its panel:
 * #00F0FF at 13.8:1 or better on the dark pages and panels, and Space White's
 * #006a70 at 5.05:1 on its darkest page ground (#e1e6e4) and 6.03 on its panel.
 *
 * NO TYPEFACE IS HANDED IN, ONLY COLOURS (review round 1). The box keeps the
 * home box's own faces and metrics, so it is the same height with its keys in
 * the same place: handing it the Ledger's Share Tech Mono for its body text
 * made every line wider, the box 66px taller at 1440x900, and Cancel and Send
 * dropped below the visible box into a scroll the home box does not have.
 */
const LEDGER_HOOKS = `
#${FEEDBACK_LAUNCH_ID}[data-room='ledger'] {
	--fb-room-z: 250;
	--fb-room-bg: var(--lp-panel-top);
	--fb-room-bg-deep: var(--lp-panel-bot);
	--fb-room-field: var(--lp-well-face);
	--fb-room-shade: var(--lp-overlay);
	--fb-room-ink: var(--white);
	--fb-room-ink-muted: var(--dim);
	--fb-room-edge: var(--lp-hair);
	--fb-room-accent: var(--gold);
	--fb-room-focus: var(--cyan);
	--fb-room-danger: var(--amber);
	--fb-room-live: var(--red);
	--fb-room-ok: var(--green);
	--fb-room-info: var(--cyan);
	--fb-room-warn: var(--amber);
	--fb-room-error: var(--amber);
	--fb-room-trigger-face: linear-gradient(to bottom, var(--lp-face-top), var(--lp-face-bot));
	--fb-room-trigger-lift: inset 0 0 0 1px var(--lp-bezel-mid), inset 0 2px 0 0 var(--lp-bezel-hi), inset 0 -2px 2px -1px var(--lp-foot), 0 0 0 1px var(--lp-rim-out), 0 2px 3px 0 var(--lp-drop), 0 6px 10px -5px var(--lp-drop-far);
	--fb-room-trigger-ink: var(--lp-btn-ink);
	--fb-room-radius: var(--lp-r-control);
	--plate-face-top: var(--lp-face-top);
	--plate-face-bot: var(--lp-face-bot);
	--plate-face-ground: var(--lp-face-ground);
	--plate-hair: var(--lp-hair);
	--plate-hair-top: var(--lp-hair-top);
	--plate-bezel-mid: var(--lp-bezel-mid);
	--plate-bezel-hi: var(--lp-bezel-hi);
	--plate-foot: var(--lp-foot);
	--plate-rim-out: var(--lp-rim-out);
	--plate-drop: var(--lp-drop);
	--plate-drop-far: var(--lp-drop-far);
	--plate-btn-ink: var(--lp-btn-ink);
	--plate-press-top: var(--lp-press-top);
	--plate-press-bot: var(--lp-press-bot);
	--plate-press-shade: var(--lp-press-shade);
	--plate-disabled-face: var(--lp-disabled-face);
	--plate-disabled-edge: var(--lp-disabled-edge);
	--plate-disabled: var(--dim);
	--plate-lit-top: var(--lp-lit-top);
	--plate-lit-bot: var(--lp-lit-bot);
	--plate-lit-ground: var(--lp-lit-ground);
	--plate-lit-ink: var(--lp-lit-ink);
	--plate-accent: var(--lp-lit-ring);
	--plate-bloom: var(--lp-lit-bloom);
	--plate-panel-top: var(--lp-panel-top);
	--plate-panel-bot: var(--lp-panel-bot);
	--plate-panel-ground: var(--lp-panel-ground);
	--plate-panel-hi: var(--lp-panel-hi);
	--plate-r-control: var(--lp-r-control);
	--plate-r-panel: var(--lp-r-panel);
	--plate-r-small: var(--lp-r-small);
	--plate-ink: var(--white);
	--plate-chip-top: var(--lp-chip-top);
	--plate-chip-shade: var(--lp-chip-shade);
	--plate-well-top: var(--lp-well-top);
	--plate-well-face: var(--lp-well-face);
	--plate-well-ground: var(--lp-well-face);
	--plate-well-shade: var(--lp-well-shade);
	--plate-well-lip: var(--lp-well-lip);
	--hover-ink: var(--lp-hover-edge);
}`;

/*
 * AN ASSIGNMENT HANDOUT is the classic IDEA neon page, with one exception: a
 * white, printable QR page. The launcher reads the page's own ground and puts
 * `data-tone="light"` on the wrapper for the light one, so the window opens in
 * the room it is in. The values are the palettes the deleted panel was
 * measured with on every handout (its /dev harness and route specs), now as
 * hooks, and re-measured against the box's grounds:
 *   dark   ink #e8ffe8 18.9 on #050f07, muted #9fb8a6 9.6, edge #4a7a52 3.6,
 *          accent #00ff41 14.6, refusal #ff8c00 8.4
 *   light  ink #111111 18.9 on #ffffff, muted #444444 9.7, edge #767676 4.5,
 *          accent #1d5f2c 7.7, refusal #b3261e 6.6
 * and the focus ring (review round 3), round the button and every key in the
 * window: cyan #00f0ff 13.5 or better on the dark grounds, the accent #1d5f2c
 * 7.0 or better on the light ones.
 * Its key is the plain one, like GAUNTLET's (the home key's 11px corner on a
 * flat face): the page has no keys of its own to borrow. Colours only, as on the Ledger: the box keeps the home box's own
 * typefaces and so its height and its keys' places. It sits above the page's decoration (the scan lines at 9998) and
 * under its custom cursor (99998); the button carries its own pointer cursor,
 * so the page's `cursor: none` never hides the way in.
 */
const ASSIGNMENT_HOOKS = `
#${FEEDBACK_LAUNCH_ID}[data-room='assignment'] {
	--fb-room-z: 9999;
	--fb-room-bg: #050f07;
	--fb-room-bg-deep: #020a04;
	--fb-room-field: #081209;
	--fb-room-shade: rgba(2, 10, 4, 0.82);
	--fb-room-ink: #e8ffe8;
	--fb-room-ink-muted: #9fb8a6;
	--fb-room-edge: #4a7a52;
	--fb-room-accent: #00ff41;
	--fb-room-focus: #00f0ff;
	--fb-room-danger: #ff8c00;
	--fb-room-live: #ff4444;
	--fb-room-ok: #00ff41;
	--fb-room-info: #00f0ff;
	--fb-room-warn: #ff8c00;
	--fb-room-error: #ff8c00;
	--fb-room-trigger-face: rgba(2, 10, 4, 0.92);
}
#${FEEDBACK_LAUNCH_ID}[data-room='assignment'][data-tone='light'] {
	--fb-room-bg: #ffffff;
	--fb-room-bg-deep: #f4f4f4;
	--fb-room-field: #f4f4f4;
	--fb-room-shade: rgba(17, 17, 17, 0.5);
	--fb-room-ink: #111111;
	--fb-room-ink-muted: #444444;
	--fb-room-edge: #767676;
	--fb-room-accent: #1d5f2c;
	--fb-room-focus: #1d5f2c;
	--fb-room-danger: #b3261e;
	--fb-room-live: #b3261e;
	--fb-room-ok: #1d5f2c;
	--fb-room-info: #1d5f2c;
	--fb-room-warn: #8a4b00;
	--fb-room-error: #b3261e;
	--fb-room-trigger-face: #ffffff;
	--fb-room-lift: 0 2px 8px rgba(17, 17, 17, 0.18);
}`;

/*
 * THE FRAME, AND WHAT THE PAGE'S OWN CORNER HAS TO MAKE ROOM FOR.
 *
 * The frame covers the viewport and stays mounted once it has loaded; closed it
 * is `visibility: hidden` (not painted, not focusable, no pointer) so the next
 * press opens instantly, as the home box does. `color-scheme: normal` matches
 * the window's own root: Chromium paints an OPAQUE backdrop behind a frame whose
 * document's colour scheme differs from its element's, and the Ledger's root is
 * `dark`.
 *
 * THE VERSION CHIP is fixed in the same corner (`$lib/version-badge.ts`), and
 * the Ledger's own Back to top key sits there too; each is lifted to sit above
 * the button rather than over it, with the button's own two sizes (44px at the
 * desktop, 48px and 1.5rem up on a phone).
 */
const FRAME_CSS = `
#${FEEDBACK_LAUNCH_FRAME_ID} {
	position: fixed;
	inset: 0;
	width: 100%;
	height: 100%;
	margin: 0;
	padding: 0;
	border: 0;
	background: transparent;
	color-scheme: normal;
	z-index: 2147483600;
	visibility: hidden;
	pointer-events: none;
}
#${FEEDBACK_LAUNCH_FRAME_ID}.is-open {
	visibility: visible;
	pointer-events: auto;
}
/* THE POINTER STAYS ON THE BUTTON. One handout (the Blade Rulebook) hides the
   mouse pointer with a universal cursor: none rule and draws its own
   dot; the universal rule matches the button's word and glyph directly, so
   without this the pointer vanished over most of the button. Inside the frame
   the window's own document decides its cursors. */
#${FEEDBACK_LAUNCH_ID} .sfb-trigger,
#${FEEDBACK_LAUNCH_ID} .sfb-trigger * {
	cursor: pointer;
}
body:has(#${FEEDBACK_LAUNCH_ID}) {
	--idea-version-badge-bottom: calc(0.75rem + 44px + 6px + env(safe-area-inset-bottom, 0px));
}
body:has(#${FEEDBACK_LAUNCH_ID}) #back-to-top {
	bottom: calc(0.75rem + 44px + 2rem + env(safe-area-inset-bottom, 0px));
}
/* A LEGACY PAGE'S LAST LINES SCROLL CLEAR OF THE WHOLE CORNER (review round
   3). The corner holds a stack on these pages: the button, the version chip
   lifted just above it, and on the Ledger Back to top 2rem above the button
   (its own 44px floor, the Ledger's rule). The Ledger's footer is centred text
   that wraps on a phone, and at 375 its school line ended under the button
   with nothing left to scroll; clearing the button alone then moved its second
   line under Back to top, and a handout's last line ("50 Points Total") sat
   under the lifted chip. So the page's foot takes the button's own clearance
   (\`--feedback-clear-block\`, set beside it by FeedbackTrigger's stylesheet: its
   offset and height plus a gap, larger on a phone) plus what is stacked above
   it in that room. Every body here is border-box with a 100vh floor (the
   Ledger's and every handout's, read off their own rules), so a page
   shorter than the window gains no scroll. Screen only: on paper there is no
   corner, and the extra foot would be a blank band or a blank page. */
@media screen {
	body:has(#${FEEDBACK_LAUNCH_ID}[data-room='ledger']) {
		padding-bottom: calc(var(--feedback-clear-block, 0px) + 2rem + 44px);
	}
	body:has(#${FEEDBACK_LAUNCH_ID}[data-room='assignment']) {
		padding-bottom: calc(var(--feedback-clear-block, 0px) + 1.5rem);
	}
}
/* WHILE THE BUTTON SAYS THE WINDOW DID NOT LOAD, THE CHIP STANDS ASIDE (review
   round 1): the sentence sits above the button, exactly where the chip was
   lifted to, and the chip's line ran through its last words. The chip is
   decoration (aria-hidden); the sentence is the one thing on screen that says
   what to do next. It comes back with the next press, which clears the note. */
body:has(#${FEEDBACK_LAUNCH_ID} .sfb-load-failed) [data-idea-version-badge] {
	visibility: hidden;
}
@media (max-width: 30rem) {
	body:has(#${FEEDBACK_LAUNCH_ID}) {
		--idea-version-badge-bottom: calc(1.5rem + 48px + 6px + env(safe-area-inset-bottom, 0px));
	}
	body:has(#${FEEDBACK_LAUNCH_ID}) #back-to-top {
		bottom: calc(1.5rem + 48px + 2rem + env(safe-area-inset-bottom, 0px));
	}
}
@media print {
	#${FEEDBACK_LAUNCH_FRAME_ID} { display: none !important; }
}`;

function escapeForScript(jsonStr: string): string {
	return jsonStr
		.replace(/</g, '\\u003c')
		.split(String.fromCharCode(0x2028))
		.join('\\u2028')
		.split(String.fromCharCode(0x2029))
		.join('\\u2029');
}

let triggerCache: { head: string; body: string } | null = null;

/** The real button, server-rendered: its stylesheet and its markup. */
function renderTrigger(): { head: string; body: string } {
	if (triggerCache === null) {
		const { head, body } = render(FeedbackTrigger, {
			props: { place: 'shell', label: REPORT_LABEL, id: FEEDBACK_LAUNCH_ID }
		});
		triggerCache = { head, body };
	}
	return triggerCache;
}

/** The stylesheet to put in the page's head: the button's own rules, the rooms and the frame. */
export function feedbackLaunchStyle(): string {
	return `${renderTrigger().head}\n<style id="${FEEDBACK_LAUNCH_ID}-css">${LEDGER_HOOKS}\n${ASSIGNMENT_HOOKS}\n${FRAME_CSS}\n</style>`;
}

/**
 * THE WRAPPER CARRIES A TEST HOOK, AND IT IS THE INJECTED BUTTON'S, NEVER THE
 * COMPONENT'S. A carried-over page often has no `main`, `h1` or
 * `[data-testid]` of its own, so the browser harness's render probe (which
 * takes the first of those, or else the body's first child) fell to a handout's
 * zero-width scroll bar and read the page as never rendered once the look-alike
 * panel, whose button carried `data-testid="legacy-report"`, was gone. The
 * wrapper always has the button's box. `FeedbackTrigger` itself takes no hook:
 * the root mount is in the shell of every page (CLAUDE.md, the navigation
 * indicator's `data-nav-progress`).
 */
export const FEEDBACK_LAUNCH_HOOK = 'feedback-launch';

/** The button's markup with its room named on the wrapper. */
export function feedbackLaunchMarkup(room: FeedbackLaunchRoom): string {
	const body = renderTrigger().body;
	const marked = body.replace(
		`id="${FEEDBACK_LAUNCH_ID}"`,
		`id="${FEEDBACK_LAUNCH_ID}" data-room="${room}" data-testid="${FEEDBACK_LAUNCH_HOOK}"`
	);
	if (marked === body) throw new Error('feedbackLaunchMarkup: the trigger did not render its id');
	return marked;
}

/** The script that opens the window, as a string. */
export function feedbackLaunchScript(opts: FeedbackLaunchOptions): string {
	const build: BuildStamp = describeBuild(opts.deploy, opts.buildId);
	const config = escapeForScript(
		JSON.stringify({
			id: FEEDBACK_LAUNCH_ID,
			frameId: FEEDBACK_LAUNCH_FRAME_ID,
			embedPath: FEEDBACK_EMBED_PATH,
			route: opts.route,
			room: opts.room,
			plate: opts.room === 'ledger',
			build: { value: build.value, source: build.source, complete: build.complete },
			tokens: FEEDBACK_ROOM_TOKENS,
			tab: opts.tabSelector ?? null,
			extra: opts.embedQuery ?? {},
			msg: FEEDBACK_EMBED_MESSAGES,
			title: REPORT_LABEL,
			opening: FEEDBACK_OPENING,
			failed: FEEDBACK_LOAD_FAILED,
			timeoutMs: FEEDBACK_LAUNCH_TIMEOUT_MS,
			marker: FEEDBACK_EMBED_MARKER
		})
	);
	return `<script>
(function () {
	var CFG = ${config};
	var MSG = CFG.msg;
	var wrap = document.getElementById(CFG.id);
	if (!wrap) return;
	var btn = wrap.querySelector('button');
	if (!btn) return;
	var word = btn.querySelector('.sfb-word');
	var label = word ? word.textContent : '';
	var frame = null, ready = false, wantOpen = false, isOpen = false, timer = null, note = null;
	/* Whether this frame's box has been on screen once: its code and its faces
	   are then in the frame, and a later press opens it at once. */
	var seen = false;
	var inerted = [];

	/* PRESSED, AND THE WINDOW IS NOT UP YET: the button says so, in the
	   component's own words and attribute (FeedbackTrigger's pending state).
	   A cold tap on a phone loads the window only at the press, since nothing
	   hovers first, and the wait used to be a button that seemed to do nothing.
	   It stays until the box is on screen ('opened'), not until the frame is
	   shown: the first open in a tab also waits for the box's code and its
	   faces, and the frame is transparent, so the button under it is what says
	   the press was heard. The home button is pending exactly as long. */
	function busy(on) {
		if (on) {
			btn.setAttribute('aria-busy', 'true');
			if (word) word.textContent = CFG.opening;
		} else {
			btn.removeAttribute('aria-busy');
			if (word) word.textContent = label;
		}
	}

	/* THE PAGE BEHIND THE WINDOW IS INERT WHILE IT IS UP. The window's own
	   aria-modal and its Tab wrap stop at the frame's edge, so the opener takes
	   its other children out of the focus order and the accessibility tree
	   itself, and gives back exactly the ones it took (a page's own inert
	   element stays inert). */
	function inertPage(on) {
		if (on) {
			var kids = document.body.children;
			for (var i = 0; i < kids.length; i++) {
				var el = kids[i];
				if (el === frame || el.inert || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
				el.inert = true;
				inerted.push(el);
			}
		} else {
			for (var j = 0; j < inerted.length; j++) inerted[j].inert = false;
			inerted = [];
		}
	}

	/* A WHITE PAGE GETS THE LIGHT PALETTE: its own ground decides, read the way
	   a contrast check reads it (the first opaque background from body up). */
	function pageIsLight() {
		try {
			var els = [document.body, document.documentElement];
			for (var i = 0; i < els.length; i++) {
				var m = /rgba?\\(([^)]+)\\)/.exec(getComputedStyle(els[i]).backgroundColor || '');
				if (!m) continue;
				var p = m[1].split(',').map(function (x) { return parseFloat(x); });
				if (p.length === 4 && p[3] === 0) continue;
				return (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255 > 0.5;
			}
		} catch (e) {}
		return true;
	}
	if (CFG.room === 'assignment' && pageIsLight()) wrap.setAttribute('data-tone', 'light');

	/* THE ROOM'S RESOLVED COLOURS, read off the wrapper that declares them, so
	   the window wears exactly what the button wears in this page's theme. */
	function roomTokens() {
		var out = {};
		try {
			var cs = getComputedStyle(wrap);
			for (var i = 0; i < CFG.tokens.length; i++) {
				var v = cs.getPropertyValue(CFG.tokens[i]).trim();
				if (v) out[CFG.tokens[i]] = v;
			}
		} catch (e) {}
		return out;
	}

	/* What the window was last handed, as a string, so a set that has not
	   moved is never posted again. */
	var sent = null;

	function src() {
		var q = new URLSearchParams();
		q.set('route', CFG.route);
		q.set('path', location.pathname);
		q.set('build', CFG.build.value);
		q.set('buildSource', CFG.build.source);
		if (CFG.build.complete) q.set('buildComplete', '1');
		if (CFG.plate) q.set('plate', '1');
		var t = roomTokens();
		sent = JSON.stringify(t);
		if (Object.keys(t).length) q.set('room', sent);
		for (var k in CFG.extra) if (Object.prototype.hasOwnProperty.call(CFG.extra, k)) q.set(k, CFG.extra[k]);
		return CFG.embedPath + '?' + q.toString();
	}

	function tab() {
		if (!CFG.tab) return null;
		try {
			var el = document.querySelector(CFG.tab);
			return el ? (el.textContent || '').trim() || null : null;
		} catch (e) { return null; }
	}

	function clearNote() {
		if (note) { note.remove(); note = null; }
	}
	/* SAID BESIDE THE BUTTON, in the button's own words and its own scoped
	   class, so it is drawn by the same rule the Svelte control's is. */
	function showNote() {
		clearNote();
		note = document.createElement('p');
		var scoped = '';
		for (var i = 0; i < btn.classList.length; i++) if (btn.classList[i].indexOf('svelte-') === 0) scoped = btn.classList[i];
		note.className = 'sfb-load-failed' + (scoped ? ' ' + scoped : '');
		note.setAttribute('role', 'alert');
		note.textContent = CFG.failed;
		wrap.appendChild(note);
	}

	/* LOADED ON THE WAY TO A PRESS -- a hover, a focus, a finger going down --
	   so the window is usually ready by the click, as the home box's code is. */
	function ensureFrame() {
		if (frame) return;
		frame = document.createElement('iframe');
		frame.id = CFG.frameId;
		frame.title = CFG.title;
		/* A SPOKEN NOTE NEEDS THE MICROPHONE INSIDE THE FRAME: the permissions
		   policy for a frame defaults it off. A pasted, dropped or picked
		   screenshot needs nothing: it is an ordinary file event in the window. */
		frame.setAttribute('allow', 'microphone');
		frame.setAttribute('aria-hidden', 'true');
		frame.tabIndex = -1;
		frame.src = src();
		/* A DOCUMENT THAT IS NOT THE WINDOW'S PAGE FAILS AT ONCE. The browser's
		   error page for a request that never arrived is another origin (so its
		   document cannot be read) and the site's own error page lacks the
		   window's mark; either way no 'ready' is coming, and waiting the full
		   timeout for it leaves a press that seems to do nothing. */
		var f = frame;
		f.addEventListener('load', function () {
			if (ready || f !== frame) return;
			var ours = false;
			try {
				var d = f.contentDocument;
				if (d && d.location.href === 'about:blank') return;
				ours = !!(d && d.querySelector('[data-testid="' + CFG.marker + '"]'));
			} catch (e) {}
			if (!ours) fail();
		});
		document.body.appendChild(frame);
		clearTimeout(timer);
		timer = setTimeout(function () { if (!ready) fail(); }, CFG.timeoutMs);
	}

	function post(type, extra) {
		if (!frame || !frame.contentWindow) return;
		var m = { type: type };
		if (extra) for (var k in extra) m[k] = extra[k];
		frame.contentWindow.postMessage(m, location.origin);
	}

	/* THE WINDOW FOLLOWS THE PAGE'S THEME (review round 2). The frame is kept
	   once it has loaded, so the colours in its address are the page's as they
	   were then. A theme switched in another tab moves this page (its own
	   storage listener) and the window's document (ThemeRoot's) alike, but not
	   the colours handed in: the Ledger's box kept one theme's field under the
	   other theme's ink, 1.0:1. So the room is read again whenever the page's
	   theme attribute moves, and again at every open, and handed over whenever
	   it differs from the last set sent. */
	function syncRoom() {
		if (!frame || !ready) return;
		var t = roomTokens();
		var s = JSON.stringify(t);
		if (s === sent) return;
		sent = s;
		post(MSG.room, { tokens: t });
	}
	try {
		new MutationObserver(syncRoom).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
	} catch (e) {}

	function show() {
		frame.classList.add('is-open');
		frame.removeAttribute('aria-hidden');
		frame.tabIndex = 0;
		isOpen = true;
		inertPage(true);
		try { frame.focus(); } catch (e) {}
	}
	function hide() {
		if (!frame) return;
		inertPage(false);
		frame.classList.remove('is-open');
		frame.setAttribute('aria-hidden', 'true');
		frame.tabIndex = -1;
		isOpen = false;
	}

	function open() {
		clearNote();
		ensureFrame();
		if (!ready) { wantOpen = true; busy(true); return; }
		syncRoom();
		if (!seen) busy(true);
		show();
		post(MSG.open, { path: location.pathname, tab: tab() });
	}

	/* THE NEXT PRESS TRIES A FRESH LOAD: a frame that never said it was ready is
	   thrown away rather than waited on. */
	function fail() {
		wantOpen = false;
		busy(false);
		hide();
		if (frame) frame.remove();
		frame = null;
		ready = false;
		seen = false;
		sent = null;
		clearTimeout(timer);
		showNote();
		try { btn.focus({ preventScroll: true }); } catch (e) {}
	}

	window.addEventListener('message', function (e) {
		if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return;
		var d = e.data;
		if (!d || typeof d !== 'object' || typeof d.type !== 'string') return;
		if (d.type === MSG.ready) {
			ready = true;
			clearTimeout(timer);
			syncRoom();
			if (wantOpen) { wantOpen = false; open(); }
		} else if (d.type === MSG.opened) {
			seen = true;
			busy(false);
			/* A BOX THAT CAME UP AFTER THE PERSON SAID NO IS CLOSED AGAIN. The
			   frame takes focus as it is shown, so an Escape pressed at once
			   reaches the window BEFORE the open message queued behind it
			   (measured: the key 15ms ahead of the message). The window closes,
			   then opens on the stale message, into a frame that is hidden by
			   then. Every real open shows the frame before it asks, so a box up
			   in a hidden frame is always that stale one. */
			if (!isOpen) post(MSG.close);
		} else if (d.type === MSG.closed) {
			var wasOpen = isOpen;
			busy(false);
			hide();
			/* FOCUS GOES BACK TO THE BUTTON THAT OPENED THE WINDOW, without
			   scrolling: a person may be far down a long page. */
			if (wasOpen) { try { btn.focus({ preventScroll: true }); } catch (err) {} }
		} else if (d.type === MSG.failed) {
			fail();
		}
	});

	/* ESCAPE IS THE WINDOW'S while it has focus, which it takes when it opens.
	   Heard here, it means focus left the frame; the window is asked to close.
	   Before the frame has loaded at all, a press is only waiting, and Escape
	   withdraws it: the window must not open a moment later over a page the
	   person has just said no to. */
	document.addEventListener('keydown', function (e) {
		if (e.key !== 'Escape') return;
		if (isOpen) { e.preventDefault(); post(MSG.close); }
		else if (wantOpen) { e.preventDefault(); wantOpen = false; busy(false); }
	}, true);

	btn.addEventListener('click', open);
	btn.addEventListener('pointerenter', ensureFrame);
	btn.addEventListener('pointerdown', ensureFrame);
	btn.addEventListener('focus', ensureFrame);
})();
<\/script>`;
}

/**
 * PUT THE BUTTON AND THE WINDOW INTO A SERVED PAGE.
 *
 * The stylesheet goes before `</head>`; the button and its script go before the
 * LAST `</body>`, not the first, because a page's own inline script may carry
 * the string `</body>` in a template. A page with neither is appended to.
 *
 * IT NEVER SHIPS A PAGE WITH NO FEEDBACK, AND IT NEVER THROWS FOR A MISSING
 * ANCHOR: a page with no `</head>` gets the stylesheet beside the button, and a
 * page with no `</body>` gets both appended to its end, so a drifted anchor
 * moves where the button lands and never takes it off the page. Whether the
 * anchors are where they should be is the test's question, not this
 * function's: `tests/feedback-launch.test.ts` drives the real routes' served
 * output, signed in and signed out, and reddens unless the stylesheet is inside
 * the head and the button inside the body.
 */
export function injectFeedbackLaunch(html: string, opts: FeedbackLaunchOptions): string {
	const style = feedbackLaunchStyle();
	const tail = `${feedbackLaunchMarkup(opts.room)}\n${feedbackLaunchScript(opts)}\n`;
	let out = html;
	const head = out.toLowerCase().indexOf('</head>');
	let styled = false;
	if (head !== -1) {
		out = `${out.slice(0, head)}${style}\n${out.slice(head)}`;
		styled = true;
	}
	const body = out.toLowerCase().lastIndexOf('</body>');
	const block = styled ? tail : `${style}\n${tail}`;
	return body === -1 ? out + block : `${out.slice(0, body)}${block}${out.slice(body)}`;
}
