/**
 * THE FEEDBACK WINDOW FOR A PAGE THAT CANNOT MOUNT IT (ledger 0396, reports
 * 0fe82a80 and 80bb4d23).
 *
 * Every Svelte page carries the official window because `SiteFeedback` is
 * mounted in the root layout. A carried-over legacy page -- the IDEA Coin
 * Ledger, an assignment handout -- is HTML served from a `+server.ts`, renders
 * no layout and has no component tree to mount anything into. It used to get
 * a hand-built imitation injected into its bytes, and Mr. Pina called that
 * what it was: "an inferior design", a second implementation imitating the
 * first. So such a page now gets the REAL window, rendered by the site itself
 * at `/feedback/embed`, in a same-origin overlay frame placed exactly where
 * the home box opens. Its button is the real `FeedbackTrigger`, server-rendered
 * into the page by `$lib/server/feedback-launch.ts`.
 *
 * Pure data and pure helpers, no Svelte and no DOM (the `context.ts`
 * convention), so every rule here is assertable without a browser, and the
 * same constants are handed to the injected launcher as its config, so the
 * two ends of the frame cannot spell a message differently.
 *
 * WHAT CROSSES THE FRAME, AND WHAT NEVER DOES:
 *   - the query string carries the OPENER: its route id, its build stamp, its
 *     room's resolved colours and whether it wears the plate. The window
 *     files the report against the page the person was looking at, never
 *     against `/feedback/embed` itself;
 *   - the open message carries what can change while the page is open: its
 *     path and, on the Ledger, which tab is showing;
 *   - NOTHING carries a session. The window is a page of this site, so it
 *     knows who is signed in exactly the way the home box does, and the
 *     legacy page that opens it stays session-blind -- which is what lets an
 *     assignment handout stay one shared cache entry for a whole class.
 */
import {
	BUILD_MEANS,
	FEEDBACK_EMBED_PATH,
	type BuildStamp,
	type BuildStampSource
} from './context';

/*
 * The address, the route id and the one "is this the window" predicate live in
 * `context.ts` beside the exclusion registry that asks it, so the two modules
 * import in one direction only; they are re-exported here for the embed's own
 * callers.
 */
export { FEEDBACK_EMBED_PATH, FEEDBACK_EMBED_ROUTE_ID, isFeedbackEmbedRoute } from './context';

/**
 * THE MESSAGES, spelled once. Each is a plain object `{ type, ... }` posted to
 * the OTHER window with `targetOrigin` set to this origin, and each receiver
 * checks both `event.origin` and `event.source` before reading a field, so a
 * frame or a tab on any other origin cannot drive the window or close it.
 *
 *   ready   window -> page   the window has loaded and can open
 *   open    page -> window   open the box (carries the page's live path and tab)
 *   opened  window -> page   the box is on screen
 *   closed  window -> page   the box closed: hide the frame, give focus back
 *   failed  window -> page   the window's code did not load: say so beside the button
 *   close   page -> window   close the box (the page heard Escape itself)
 *   room    page -> window   the page's theme moved: its room colours as they are now
 *
 * WHY `room` EXISTS (review round 2). The frame is built once and kept, so the
 * room colours in its query string are the page's colours AT THAT MOMENT. A
 * theme switched in another tab moves both documents (the page follows its
 * storage listener, the window follows `ThemeRoot`'s), but the window's handed-in
 * colours stayed where they were: on the Ledger the box kept Space White's light
 * field under IDEA's light ink, 1.0:1, nothing typed visible. The opener now
 * re-reads its room whenever its theme attribute moves, and again at every open,
 * and posts the new set whenever it differs from the last one sent.
 */
export const FEEDBACK_EMBED_MESSAGES = {
	ready: 'idea-feedback:ready',
	open: 'idea-feedback:open',
	opened: 'idea-feedback:opened',
	closed: 'idea-feedback:closed',
	failed: 'idea-feedback:failed',
	close: 'idea-feedback:close',
	room: 'idea-feedback:room'
} as const;

export type FeedbackEmbedMessageType =
	(typeof FEEDBACK_EMBED_MESSAGES)[keyof typeof FEEDBACK_EMBED_MESSAGES];

/**
 * THE ROOM HOOKS A PAGE MAY HAND THE WINDOW: the `--fb-room-*` set
 * `SiteFeedback` already reads (see its scrim block), less the trigger's own
 * three, which style the page's button and never the box.
 */
export const FEEDBACK_ROOM_HOOKS = [
	'--fb-room-bg',
	'--fb-room-bg-deep',
	'--fb-room-field',
	'--fb-room-shade',
	'--fb-room-ink',
	'--fb-room-ink-muted',
	'--fb-room-edge',
	'--fb-room-accent',
	'--fb-room-focus',
	'--fb-room-danger',
	'--fb-room-live',
	'--fb-room-ok',
	'--fb-room-info',
	'--fb-room-warn',
	'--fb-room-error',
	'--fb-room-lift'
] as const;

/**
 * THE PLATE TOKENS THE BOX'S KEYS AND HOUSING READ (`$lib/classroom/plate.css`:
 * the key list, its hover, pressed, unlit and lit states, and the floating
 * panel housing `.fb-box` wears). `--plate-lit-ink` is the one the plate
 * itself never sets: the lit key's word falls back to `--plate-btn-ink`, and a
 * room whose lit keys take a word colour of their own (the Ledger's gold, its
 * near-white on Space White's green) hands it in here. A page that wears the plate in its own
 * colours -- the Coin Ledger, whose `--lp-*` tokens are the plate's under
 * other names -- hands these in, so the box's chips are the page's own keys.
 * A token a page does not hand in keeps the site plate's value for the theme
 * in force, which is the same theme the page is in.
 */
export const FEEDBACK_ROOM_PLATE_TOKENS = [
	'--plate-face-top',
	'--plate-face-bot',
	'--plate-face-ground',
	'--plate-hair',
	'--plate-hair-top',
	'--plate-bezel-mid',
	'--plate-bezel-hi',
	'--plate-foot',
	'--plate-rim-out',
	'--plate-drop',
	'--plate-drop-far',
	'--plate-btn-ink',
	'--plate-press-top',
	'--plate-press-bot',
	'--plate-press-shade',
	'--plate-disabled-face',
	'--plate-disabled-edge',
	'--plate-disabled',
	'--plate-lit-top',
	'--plate-lit-bot',
	'--plate-lit-ground',
	'--plate-lit-ink',
	'--plate-accent',
	'--plate-bloom',
	'--plate-panel-top',
	'--plate-panel-bot',
	'--plate-panel-ground',
	'--plate-panel-hi',
	'--plate-r-control',
	'--plate-r-panel',
	'--plate-r-small',
	/* THE FIELDS A PERSON TYPES INTO, AND THE INK THEY TYPE IN (review round
	   2). The box's text area takes the panel's face over the chip's top stop,
	   a single-line field takes the well, and both write in `--plate-ink`. A
	   room that hands in its panel without these left the field's ground the
	   room's and the words the window's own theme's: one source for the
	   ground and another for the ink is the pair that stopped agreeing. */
	'--plate-ink',
	'--plate-chip-top',
	'--plate-chip-shade',
	'--plate-well-top',
	'--plate-well-face',
	'--plate-well-ground',
	'--plate-well-shade',
	'--plate-well-lip',
	'--hover-ink'
] as const;

/** Every name the window will take from a query string, and nothing else. */
export const FEEDBACK_ROOM_TOKENS: readonly string[] = [
	...FEEDBACK_ROOM_HOOKS,
	...FEEDBACK_ROOM_PLATE_TOKENS
];

/** A value longer than this is not a colour, a length, a shadow or a font list. */
export const FEEDBACK_ROOM_VALUE_MAX = 200;

/**
 * IS THIS A VALUE A COLOUR TOKEN MAY HOLD? A colour, a length, a shadow or a
 * font list, and nothing that could make a request or break out of a
 * declaration.
 *
 * WHY IT IS STRICT. The window is a page of this site that anybody can link
 * to with any query string. The values are applied with `style.setProperty`
 * on one element, which cannot escape the property, but a custom property
 * holding `url(...)` makes the browser FETCH that address the moment a rule
 * reads it -- the reader's IP and Referer handed to whatever host the link
 * named, the same reason `resolveFigureSrc` is same-origin only. So: a short
 * alphabet of the characters colours, lengths, shadows and quoted font names
 * are spelled in, no `url(`, no `var(` (the opener sends RESOLVED values, so a
 * reference here could only point at something the opener did not mean), no
 * backslash escapes, and none of `; { } < > @ !`.
 */
export function roomTokenValueOk(value: unknown): value is string {
	if (typeof value !== 'string') return false;
	const v = value.trim();
	if (!v || v.length > FEEDBACK_ROOM_VALUE_MAX) return false;
	if (!/^[A-Za-z0-9#.,%()\s/'"_+-]+$/.test(v)) return false;
	if (/url\s*\(|var\s*\(|image-set|image\s*\(|element\s*\(|attr\s*\(|expression|src\s*\(/i.test(v)) return false;
	// Balanced parentheses, never closing one that was not opened.
	let depth = 0;
	for (const ch of v) {
		if (ch === '(') depth++;
		else if (ch === ')') {
			depth--;
			if (depth < 0) return false;
		}
	}
	return depth === 0;
}

/**
 * The room tokens out of a query value: a JSON object of name to value. Every
 * pair whose name is not on the list, or whose value fails the grammar above,
 * is DROPPED rather than coerced, so a drifted opener loses a colour and keeps
 * the window. Anything that is not an object of strings is no tokens at all.
 */
export function parseRoomTokens(raw: string | null | undefined): Record<string, string> {
	if (!raw || raw.length > 12000) return {};
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return {};
	}
	return filterRoomTokens(parsed);
}

/**
 * The room tokens out of an already-parsed value: the query string's blob, or
 * the `room` message's `tokens`. One filter for both doors, so a message can
 * never hand the window a token the query string would have refused.
 */
export function filterRoomTokens(parsed: unknown): Record<string, string> {
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
	const out: Record<string, string> = {};
	for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
		if (!FEEDBACK_ROOM_TOKENS.includes(name)) continue;
		if (!roomTokenValueOk(value)) continue;
		out[name] = (value as string).trim();
	}
	return out;
}

/** A route id an opener may claim: a path-shaped string, `[param]` segments allowed. */
const ROUTE_RE = /^\/(?!\/)[A-Za-z0-9._~[\]/-]{0,160}$/;
/** A path an opener may report: the same, before `captureMeta` scrubs any address out of it. */
const PATH_RE = /^\/(?!\/)[A-Za-z0-9._~%@+[\]/-]{0,300}$/;
const BUILD_VALUE_RE = /^[A-Za-z0-9._:-]{0,64}$/;
const BUILD_SOURCES: readonly BuildStampSource[] = ['git-commit', 'build-id', 'none'];

/** What the window knows about the page that opened it. */
export interface FeedbackEmbedOpener {
	/** The opener's route id, which names the app and the row's `context`. */
	route: string | null;
	/** The opener's path at load; the open message may replace it. */
	path: string;
	/** The opener's build, labelled as what it is (`describeBuild`'s shape). */
	build: BuildStamp;
	/** Whether the box wears the site plate's keys and housing. */
	plate: boolean;
	/** The room's resolved colours, every one checked. */
	tokens: Record<string, string>;
}

/**
 * THE OPENER OUT OF THE WINDOW'S QUERY STRING, every field checked.
 *
 * `means` IS NEVER READ FROM THE QUERY: it is derived from the source here,
 * from the same `BUILD_MEANS` the root layout's stamp reads, so a link cannot
 * put its own words beside a build value on a stored row.
 */
export function parseEmbedParams(params: URLSearchParams): FeedbackEmbedOpener {
	const route = params.get('route');
	const path = params.get('path');
	const source = params.get('buildSource') as BuildStampSource | null;
	const value = params.get('build') ?? '';
	const okSource = source && BUILD_SOURCES.includes(source) ? source : 'none';
	const okValue = okSource !== 'none' && BUILD_VALUE_RE.test(value) ? value : '';
	const build: BuildStamp =
		okSource === 'none' || !okValue
			? { value: '', source: 'none', means: BUILD_MEANS.none, complete: false }
			: {
					value: okValue,
					source: okSource,
					means: BUILD_MEANS[okSource],
					complete: okSource === 'git-commit' && params.get('buildComplete') === '1'
				};
	const okRoute = route && ROUTE_RE.test(route) ? route : null;
	return {
		route: okRoute,
		path: path && PATH_RE.test(path) ? path : (okRoute ?? FEEDBACK_EMBED_PATH),
		build,
		plate: params.get('plate') === '1',
		tokens: parseRoomTokens(params.get('room'))
	};
}

/** What the page says about itself when it asks the window to open. */
export interface FeedbackEmbedOpen {
	type: typeof FEEDBACK_EMBED_MESSAGES.open;
	path: string | null;
	tab: string | null;
}

/**
 * READ A MESSAGE, or nothing. The caller has already checked the origin and
 * the source; this checks the shape, so a well-placed sender with a malformed
 * body still changes nothing.
 */
export function parseEmbedMessage(data: unknown): {
	type: FeedbackEmbedMessageType;
	path: string | null;
	tab: string | null;
	/** Only on a `room` message: the checked colours, or none. */
	tokens: Record<string, string> | null;
} | null {
	if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
	const d = data as Record<string, unknown>;
	const types = Object.values(FEEDBACK_EMBED_MESSAGES) as string[];
	if (typeof d.type !== 'string' || !types.includes(d.type)) return null;
	const path = typeof d.path === 'string' && PATH_RE.test(d.path) ? d.path : null;
	const tab =
		typeof d.tab === 'string' && d.tab.trim() ? d.tab.trim().replace(/\s+/g, ' ').slice(0, 60) : null;
	const tokens = d.type === FEEDBACK_EMBED_MESSAGES.room ? filterRoomTokens(d.tokens) : null;
	return { type: d.type as FeedbackEmbedMessageType, path, tab, tokens };
}

/**
 * THE MARK THE WINDOW'S OWN PAGE CARRIES IN ITS SERVER-RENDERED MARKUP (its
 * `data-testid`). The launcher reads it when the frame's document loads: a
 * document without it is not this page -- the browser's own error page for a
 * request that never arrived, or the site's error page -- so the button says
 * the window did not load at once rather than after the full wait for `ready`.
 */
export const FEEDBACK_EMBED_MARKER = 'feedback-embed';

/**
 * THE WINDOW'S ADDRESS FOR AN OPENER, built in one place. The launcher's script
 * builds the same string in the page (it cannot import this), and
 * `tests/feedback-launch.test.ts` holds the two to the same parameter names.
 */
export function feedbackEmbedSrc(opener: {
	route: string;
	path?: string;
	build: BuildStamp;
	plate?: boolean;
	tokens?: Record<string, string>;
	extra?: Record<string, string>;
}): string {
	const q = new URLSearchParams();
	q.set('route', opener.route);
	if (opener.path) q.set('path', opener.path);
	q.set('build', opener.build.value);
	q.set('buildSource', opener.build.source);
	if (opener.build.complete) q.set('buildComplete', '1');
	if (opener.plate) q.set('plate', '1');
	if (opener.tokens && Object.keys(opener.tokens).length) q.set('room', JSON.stringify(opener.tokens));
	for (const [k, v] of Object.entries(opener.extra ?? {})) q.set(k, v);
	return `${FEEDBACK_EMBED_PATH}?${q.toString()}`;
}
