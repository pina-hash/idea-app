/**
 * WHAT A REPORT CARRIES, AND WHERE THE AFFORDANCE IS ALLOWED TO SIT.
 *
 * Pure data + pure helpers, no Svelte and no Supabase (the pathways.ts /
 * site-manifest.ts convention), so every rule in here is assertable without a
 * browser and the same module is read by the shell, by the error boundary and
 * by the console.
 *
 * TWO JOBS, deliberately in one file because they are two halves of one claim:
 * a report is only useful if it says where it came from, and the affordance is
 * only usable if it is not floating over the thing being reported on.
 */

import { pendingLabel } from '$lib/pending';

// ---------------------------------------------------------------------------
// 1. WHERE THE AFFORDANCE SITS
// ---------------------------------------------------------------------------

/**
 * A surface that does NOT get the shell's floating button, and what carries a
 * feedback control instead.
 *
 * ONE WINDOW, ONE BUTTON, ONE PLACE (ledger 0396, Mr. Pina: "the functionality,
 * the interface and the location of its buttons are identical everywhere").
 * The button sits in the bottom-right corner of every page, drawn by the root
 * layout, and this registry is now SHORT on purpose. It used to relocate the
 * button into the classroom header, the Armory header, the deck bar, the
 * projector strip and the error card; every one of those is the corner button
 * again, and the room keeps it off its own controls by reserving the corner
 * (`--feedback-clear-block` and `--feedback-clear-inline`, declared beside the
 * button in `FeedbackTrigger.svelte`), never by moving it.
 *
 * WHAT IS LEFT: the two products that keep their own feedback systems by Mr.
 * Pina's decision (GREENLINE and VANGUARD), the IDEA Coin Ledger (served HTML
 * with no layout, which carries the SAME button server-rendered into its bytes
 * and opens the SAME window in a frame), and the window's own page. AN
 * EXCLUSION STILL RELOCATES, IT NEVER DELETES: each rule names what carries
 * the control instead.
 *
 * BY CATEGORY, NEVER BY PAGE. `match` reads a ROUTE ID, so a new page added
 * under an excluded section inherits the exclusion instead of having to
 * remember it, which is the same reason the button is mounted in the shell in
 * the first place.
 */
export type FeedbackExclusionId = 'greenline' | 'vanguard' | 'coins' | 'embed';

/**
 * THE FEEDBACK WINDOW'S OWN PAGE (ledger 0396), where a legacy page that
 * renders no layout opens the official window in a same-origin frame. The
 * address, its route id and the predicate live HERE, beside the registry that
 * asks it, and `$lib/feedback/embed.ts` re-exports them, so the two modules
 * import in one direction only.
 */
export const FEEDBACK_EMBED_PATH = '/feedback/embed';
export const FEEDBACK_EMBED_ROUTE_ID = '/feedback/embed';

/** Is this route the window itself? Read by the registry and by the root layout. */
export function isFeedbackEmbedRoute(routeId: string | null | undefined): boolean {
	return routeId === FEEDBACK_EMBED_ROUTE_ID;
}

export interface FeedbackExclusionRule {
	id: FeedbackExclusionId;
	/** What the category is, in the words the console shows. */
	label: string;
	/** Where the affordance lives instead. Empty is not a legal value. */
	relocatedTo: string;
	/** Route ids this rule claims. */
	match: (routeId: string) => boolean;
	/**
	 * Route ids this rule was written for. Carried HERE rather than in the test
	 * so a category added without a case cannot go quietly uncovered: the test
	 * drives this list and fails a rule that names none.
	 */
	samples: string[];
}

const under = (prefix: string) => (routeId: string) =>
	routeId === prefix || routeId.startsWith(prefix + '/');

/**
 * THE REPORT CONTROL'S WORD, spelled once (ledger 0297, LEARN). The button
 * reads the long form everywhere; the short one is what a tour or a sentence
 * uses where the long one would not fit.
 * A page that tells somebody where to report reads it from here, because the
 * update log's intro pointed at the control by an old name for months after
 * the control stopped being called that.
 *
 * "SEND FEEDBACK" AND "FEEDBACK" SINCE 2026-10-07 (report e36c5437): the box
 * takes a bug, an idea, something somebody liked, or anything else, and "Report
 * a problem" told people it was only for the first. The IDENTIFIERS keep their
 * names, and so does every hook a tour or a spec names (`data-tour="report"`,
 * `shell-report`, `.sfb-*`, the legacy panels' ids), because those are
 * addresses, not words. The legacy panel and VANGUARD receive both words
 * through their config JSON, never as literals.
 */
export const REPORT_LABEL = 'Send feedback';
export const REPORT_LABEL_SHORT = 'Feedback';

/**
 * THE ONE LINE THAT OPENS THE BOX'S NOTE, on the site's box, the legacy panel
 * and VANGUARD's panel alike. It names all three kinds of thing the box is for,
 * which is the whole reason the control was renamed.
 */
export const FEEDBACK_PROMPT = 'A problem, an idea, or something you liked?';

/**
 * THE CONTROL'S GLYPH, as SVG path data on a 24-unit box (stroked, no fill):
 * a speech bubble, because the control is for saying something. The warning
 * triangle stays for the ONE place a report is a problem report by definition,
 * the error page, whose title says so ("Report this 500"). Both lists are read
 * by the Svelte control and by the legacy panel's injected script, so the two
 * cannot draw different marks for one control.
 */
export const FEEDBACK_GLYPH: readonly string[] = ['M4 5h16v10H10l-4.5 4v-4H4z'];
export const PROBLEM_GLYPH: readonly string[] = ['M12 3l9 16H3z', 'M12 9v4', 'M12 16.5v.01'];

/**
 * WHAT THE BUTTON SAYS WHEN THE WINDOW BEHIND IT DID NOT LOAD, spelled once
 * (ledger 0396). The Svelte control's lazy chunk and the legacy launcher's
 * frame fail for the same reasons (offline, a deploy that rotated the files
 * under an open tab), so they say the same sentence beside the same button,
 * with a key that reloads the page (`FEEDBACK_RELOAD`).
 *
 * RELOAD, NOT "PRESS IT AGAIN" (integration review 4). A browser keeps a
 * dynamic import that failed: measured in Chromium with the window's chunk
 * refused at the mount-time fetch, neither a press nor a second press once
 * the network was back made any request for it, so the sentence's old advice
 * did nothing on the one surface most people see. A reload asks for the code
 * afresh, and after a deploy it is also what fetches the new file names. The
 * legacy launcher's next press does load a fresh frame, so on the Ledger and
 * the handouts both work; the sentence names the one that works everywhere.
 */
export const FEEDBACK_LOAD_FAILED =
	'The feedback window did not load. Check the connection, then reload the page to try again.';

/** The key beside that sentence, which reloads the page. */
export const FEEDBACK_RELOAD = 'Reload page';

/**
 * WHAT THE BUTTON SAYS BETWEEN THE PRESS AND THE WINDOW (ledger 0396): a cold
 * tap on a phone, where nothing hovers first to load the window early, waits
 * for it, and the wait is said rather than silent. `$lib/pending`'s spelling.
 */
export const FEEDBACK_OPENING = pendingLabel('Opening');

/**
 * WHERE THE REPORTS GO, for an admin (report R15, 2026-09-30): the report box
 * links straight to the console from its own header. Spelled once, so the
 * link, the "already here" test in `SiteFeedback` and the harness cannot name
 * three different addresses for one page.
 */
export const FEEDBACK_CONSOLE_PATH = '/admin/feedback';
/** The link's word. It names a page, not an action, so it reads as one. */
export const FEEDBACK_CONSOLE_LABEL = 'Feedback page';

/**
 * WHETHER THE BOX OFFERS THE CONSOLE LINK, and to whom: an admin, anywhere but
 * the console itself, where the link would open the page already on screen.
 *
 * `isAdmin` IS THE ROOT LAYOUT'S OWN ANSWER (`page.data.isAdmin`), so nothing
 * here asks the database a second time -- and nothing here is a gate either:
 * the console's load answers a non-admin 404 whatever any link says, so a link
 * shown by mistake costs a 404, never a disclosure. TRUE ONLY ON `=== true`,
 * because "cannot tell" must never read as "yes".
 */
export function feedbackConsoleHref(isAdmin: unknown, pathname: string): string | null {
	if (isAdmin !== true) return null;
	const p = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
	if (p === FEEDBACK_CONSOLE_PATH || p.startsWith(FEEDBACK_CONSOLE_PATH + '/')) return null;
	return FEEDBACK_CONSOLE_PATH;
}

export const FEEDBACK_EXCLUSIONS: FeedbackExclusionRule[] = [
	{
		id: 'greenline',
		label: 'GREENLINE',
		relocatedTo: 'the GREENLINE title, garage, race and results menus',
		// The race route ONLY. The track and piece builders are ordinary pages
		// with ordinary chrome and keep the shell control; the game is the one
		// that is a live 3D surface with menus of its own to put this in.
		//
		// AND ITS HARNESS (review round 2 of ledger 0396): `/dev/greenline-portal`
		// mounts the REAL GREENLINE portal, its own Send feedback included, so
		// with the corner button floating over it too the harness showed two
		// controls where the race shows one -- a harness must mirror the whole
		// mechanism it stands in for. The builder harnesses are the builders'
		// stand-ins and keep the corner button, as the builders do.
		match: (routeId) => routeId === '/greenline' || routeId === '/dev/greenline-portal',
		samples: ['/greenline', '/dev/greenline-portal']
	},
	{
		id: 'vanguard',
		label: 'VANGUARD',
		relocatedTo: "VANGUARD's own Feedback button, beside the IDEA link at the top right",
		// VANGUARD is served as legacy HTML from a +server.ts endpoint and
		// renders no layout at all, so this rule excludes nothing the shell
		// mount could ever have reached. It stands so that a VANGUARD surface
		// which DOES render the shell inherits the exclusion rather than
		// discovering it in front of a class. The game now carries a real
		// report control -- injected into the served HTML by
		// src/routes/vanguard/+server.ts, opening a "SEND FEEDBACK" panel --
		// that reaches the SAME feedback system as everything else: signed in
		// posts through /api/vanguard-feedback (the RLS-scoped insert, as the
		// caller), signed out through the shared anonymous route. It is not the
		// game's older in-game "Bug or idea?" composer
		// (`buildFeedbackComposer`, mounted on the title/pause/game-over
		// screens), which still exists and is still a second control -- but it
		// no longer files anywhere else. Its send used to be an <img> GET at
		// VANGUARD's own Apps Script backend, which nobody reads and which
		// cannot report a failure, so it painted "THANKS!" whether the message
		// landed or vanished; the `/vanguard` endpoint now rewrites that one
		// call, for every visitor, to reach the SAME endpoint resolved above.
		// Both controls therefore land in app_feedback, carry the same capture,
		// and can both say so when a send fails. Whether two controls offering
		// one thing is one too many is still open; where they wrote was not.
		match: under('/vanguard'),
		samples: ['/vanguard']
	},
	{
		id: 'coins',
		label: 'IDEA Coin Ledger',
		relocatedTo:
			'the same Send feedback button, server-rendered into the Ledger at the bottom right, opening the same window in a frame (/feedback/embed)',
		// The Ledger is carried-over legacy HTML served from a `+server.ts`
		// (`src/routes/coins/[...path]/+server.ts`) and renders no layout at all,
		// so this rule excludes nothing the shell mount could ever have reached
		// -- the same standing VANGUARD's rule has, and for the same reason it
		// stands: a coin surface that DOES render the shell inherits the
		// exclusion rather than discovering it in front of a class.
		//
		// LEDGER 0396 (reports 0fe82a80 and 80bb4d23): the page used to carry a
		// hand-built imitation of the box, injected by a module of its own, and
		// Mr. Pina called it "an inferior design". It now carries the REAL
		// `FeedbackTrigger`, server-rendered into its bytes in the official
		// position by `$lib/server/feedback-launch.ts`, and the button opens the
		// REAL window -- this site's own `/feedback/embed` page -- in a frame
		// placed exactly where the home box opens. The report records the Ledger
		// (its route, path, tab and build), never the frame.
		//
		// `/coin-desk` and `/coin-balance` are NOT claimed by this rule.
		// `appForRouteId` folds all three onto the app id 'coins', but those two
		// are ordinary Svelte pages under the root layout and keep the shell's
		// own floating control; only the served-HTML surface is excluded.
		match: (routeId) => routeId === '/coins' || routeId === '/coins/[...path]',
		samples: ['/coins', '/coins/[...path]']
	},
	{
		id: 'embed',
		label: 'The feedback window itself',
		relocatedTo: 'nowhere: this page IS the window, and its button is on the page that framed it',
		// `/feedback/embed` renders the official box alone, inside a frame a
		// legacy page opened (ledger 0396). A floating button over it would be a
		// second button drawn inside the window it opens -- the frame covers the
		// whole viewport while it is up -- so the shell draws none here. The
		// relocation is real all the same: the framing page carries the same
		// `FeedbackTrigger`, server-rendered into its bytes.
		match: isFeedbackEmbedRoute,
		samples: [FEEDBACK_EMBED_ROUTE_ID]
	}
];

/**
 * Which category (if any) takes the button off the shell for this route.
 * Null means the shell shows it, which is the default every new route gets.
 *
 * AN ERROR PAGE IS NEVER EXCLUDED (ledger 0396). The error boundary replaces
 * the page, so a room's own control (GREENLINE's menus, VANGUARD's button) is
 * not on screen to relocate to; the corner button is, with the status, the
 * route and the reference already captured, and the error card's own "Tell us
 * what happened" opens that same window (`openSiteFeedback`).
 */
export function feedbackExclusion(
	routeId: string | null | undefined,
	opts: { hasError?: boolean } = {}
): FeedbackExclusionRule | null {
	if (opts.hasError) return null;
	if (!routeId) return null;
	for (const rule of FEEDBACK_EXCLUSIONS) {
		if (rule.match(routeId)) return rule;
	}
	return null;
}

/**
 * DOES THE CORNER BUTTON WEAR THE CLASSROOM'S PLATE HERE? (ledger 0396)
 *
 * The button and its window are mounted by the root layout, a SIBLING of every
 * page, so a room's plate (`.cr-root` carrying `CLASSROOM_PLATE`) never reaches
 * them by ancestry. The site-plate pages wrap their siblings in the plate
 * already; every `/classroom` route is the other production room that draws a
 * plate, and the root layout wraps the window in the same class there, so the
 * classroom's button is the home page's key and its window the home page's
 * box, in the site theme. An error page draws no room, so it gets no plate.
 */
export function feedbackWearsClassroomPlate(
	routeId: string | null | undefined,
	hasError = false
): boolean {
	if (hasError || !routeId) return false;
	return under('/classroom')(routeId);
}

/**
 * Which subsystem a route belongs to, for the `app` discriminator on the row.
 *
 * DERIVED FROM THE ROUTE ID, not from site-manifest.ts: that manifest maps REPO
 * PATHS for the version substrate, and pointing it at URLs would be a second
 * mapping that can stop agreeing with the first. The two answer different
 * questions over different inputs and are deliberately separate.
 */
export function appForRouteId(routeId: string | null | undefined, pathname = ''): string {
	const source = routeId || pathname || '/';
	const first = source.split('/').filter(Boolean)[0] ?? '';
	switch (first) {
		case 'classroom':
		case 'notebook':
		case 'gauntlet':
		case 'greenline':
		case 'vanguard':
		case 'tournaments':
		case 'frc':
		case 'admin':
		case 'dashboard':
		case 'reference':
		case 'archive':
		case 'assignments':
		case 'contracts':
			return first;
		case 'coin-desk':
		case 'coin-balance':
		case 'coins':
			return 'coins';
		case 'fsp':
		case 'fsp-pulse':
		case 'fsp-tech-selection':
			return 'fsp';
		case 'dev':
			return 'dev';
		default:
			return 'portal';
	}
}

// ---------------------------------------------------------------------------
// 2. THE BUILD IDENTIFIER, LABELLED AS WHAT IT IS
// ---------------------------------------------------------------------------

/**
 * NEITHER AVAILABLE IDENTIFIER IS A FUNCTION OF THE BUILT ARTIFACT, and that is
 * the honest problem this type exists to state rather than paper over.
 *
 * - `deploy.sha` (virtual:site-versions) is the git commit the deployment was
 *   created FROM. It is exact about the input and says nothing about the
 *   output: two builds of the same commit, with different dependency
 *   resolutions, carry the same sha.
 * - `$app/environment`'s `version` is SvelteKit's build id, which by default is
 *   a build TIMESTAMP. It changes on every build of identical code, so it
 *   distinguishes builds without identifying any of them.
 *
 * A report therefore records WHICH one it carried and what that value means, in
 * words, next to the value. A plausible-looking hex string with no provenance
 * is read as a content hash by the next person to open the queue, and the wrong
 * build gets bisected.
 */
export type BuildStampSource = 'git-commit' | 'build-id' | 'none';

export interface BuildStamp {
	value: string;
	source: BuildStampSource;
	/** What the value IS, in plain words. Stored on the row beside the value. */
	means: string;
	/** False when the build saw a truncated git history (no version number). */
	complete: boolean;
}

export const BUILD_MEANS: Record<BuildStampSource, string> = {
	'git-commit':
		'The git commit this deployment was built from. Identifies the input, not the built artifact.',
	'build-id':
		'A SvelteKit build id, which is a build timestamp. It changes on every build of identical code.',
	none: 'No build identifier reached this page.'
};

/**
 * Pick one and say which. The git commit wins when there is one, because it is
 * the only value that can be looked up; the build id is the fallback that at
 * least separates two deploys.
 */
export function describeBuild(
	deploy: { sha?: string | null; complete?: boolean } | null | undefined,
	buildId: string | null | undefined
): BuildStamp {
	const sha = (deploy?.sha ?? '').trim();
	// 'dev' is what deriveDeploy returns when there was no history at all: a
	// placeholder, not a commit, so it does not get a commit's label.
	if (sha && sha !== 'dev') {
		return {
			value: sha,
			source: 'git-commit',
			means: BUILD_MEANS['git-commit'],
			complete: deploy?.complete === true
		};
	}
	const id = (buildId ?? '').trim();
	if (id) {
		return { value: id, source: 'build-id', means: BUILD_MEANS['build-id'], complete: false };
	}
	return { value: '', source: 'none', means: BUILD_MEANS.none, complete: false };
}

/** The one-line provenance the UI shows beside the value. */
export function buildStampLine(build: BuildStamp): string {
	if (build.source === 'none') return build.means;
	return `${build.value} (${build.means})`;
}

// ---------------------------------------------------------------------------
// 3. WHAT THE ROW CARRIES
// ---------------------------------------------------------------------------

/**
 * A FIELD SOMEBODY HAS TO FILL IN IS A FIELD THAT ARRIVES EMPTY. Everything
 * here is read off the page at the moment the box opens; the person writes
 * prose and nothing else.
 */
export interface FeedbackContextInput {
	routeId: string | null;
	pathname: string;
	role: string | null;
	sectionId?: string | null;
	viewport?: { w: number; h: number } | null;
	/**
	 * `navigator.userAgent`, threaded in from the caller for the same reason the
	 * viewport is: it describes the machine the person was looking at, and it is
	 * read once at OPEN rather than reconstructed afterwards from anything.
	 */
	userAgent?: string | null;
	/** ISO 8601, threaded in from the caller rather than read here. */
	at: string;
	build: BuildStamp;
	/** Set by the error boundary. */
	status?: number | null;
	errorMessage?: string | null;
	/** The id handleError logged, so a server log and a report can be joined. */
	errorId?: string | null;
	/**
	 * WHICH SCREEN OF THE PAGE, where one address carries several: the Coin
	 * Ledger answers five tabs on one URL, so its tab is the only thing that
	 * says which screen a report is about (ledger 0396 carries it across the
	 * feedback window's frame, as the injected panel it replaced did).
	 */
	tab?: string | null;
}

/** A path with every email-shaped segment (raw `@` or encoded `%40`) replaced by `:student`. */
export function scrubAddressSegments(pathname: string): string {
	return pathname.replace(/[^/]*(?:@|%40)[^/]*/gi, ':student');
}

/** The `meta` jsonb, assembled in exactly one place. */
export function captureMeta(input: FeedbackContextInput): Record<string, unknown> {
	const meta: Record<string, unknown> = {
		route: input.routeId ?? null,
		/*
		 * AN ADDRESS IN THE PATH IS NOT KEPT (the 2026-10-07 round). One student's
		 * page and their read-only notebook carry the student's email as a path
		 * segment, and a report filed from either would put that address into the
		 * feedback queue, its exports and a public triage. Any segment holding an
		 * `@`, raw or encoded, becomes `:student`; the route id already names the
		 * parameter, so nothing a reader needs is lost.
		 */
		path: scrubAddressSegments(input.pathname),
		role: input.role ?? null,
		section: input.sectionId ?? null,
		viewport: input.viewport ? `${input.viewport.w}x${input.viewport.h}` : null,
		// THE FULL STRING, STORED VERBATIM. Summarising at capture time throws
		// away the half that turns out to matter (an in-app webview, an OS build,
		// a locale-specific fork); a summary can be recomputed from the string
		// forever, and the string cannot be recovered from a summary.
		userAgent: (input.userAgent ?? '').trim() || null,
		at: input.at,
		build: {
			value: input.build.value,
			source: input.build.source,
			means: input.build.means,
			historyComplete: input.build.complete
		}
	};
	if (typeof input.status === 'number') meta.status = input.status;
	if (input.errorMessage) meta.error = input.errorMessage;
	if (input.errorId) meta.errorId = input.errorId;
	if (input.tab) meta.tab = input.tab;
	return meta;
}

/**
 * A user agent string, reduced to the two facts a triage read actually turns
 * on: which browser, and which platform.
 *
 * ONE IMPLEMENTATION, HERE, beside the capture that stores the string, because
 * the exports and any future UI want the same reduction and a second copy is
 * what stops agreeing. It is deliberately shallow: a UA string is not a
 * reliable structured record, so this reports what it can recognise and says
 * "unrecognised browser" rather than guessing. The FULL string stays on the
 * row, and is what a question this cannot answer is answered from.
 *
 * Order is load-bearing. Every Chromium fork carries "Chrome" and Chrome
 * carries "Safari", so the narrower token has to be tested first; iPadOS
 * reports itself as a Mac, so the iPad token is tested before Mac OS X.
 */
export function summarizeUserAgent(ua: string | null | undefined): string | null {
	const s = (ua ?? '').trim();
	if (!s) return null;

	const browsers: [RegExp, string][] = [
		[/\bEdg(?:e|A|iOS)?\/(\d+)/, 'Edge'],
		[/\bOPR\/(\d+)/, 'Opera'],
		[/\bSamsungBrowser\/(\d+)/, 'Samsung Internet'],
		[/\bFirefox\/(\d+)/, 'Firefox'],
		[/\bFxiOS\/(\d+)/, 'Firefox'],
		[/\bCriOS\/(\d+)/, 'Chrome'],
		[/\bChrome\/(\d+)/, 'Chrome'],
		[/\bVersion\/(\d+)[^)]*\bSafari\//, 'Safari']
	];
	let browser = 'unrecognised browser';
	for (const [re, name] of browsers) {
		const m = s.match(re);
		if (m) {
			browser = `${name} ${m[1]}`;
			break;
		}
	}

	const platforms: [RegExp, string][] = [
		[/\biPad\b/, 'iPad'],
		[/\biPhone\b/, 'iPhone'],
		[/\bAndroid\b/, 'Android'],
		[/\bWindows NT\b/, 'Windows'],
		[/\bCrOS\b/, 'ChromeOS'],
		[/\bMac OS X\b/, 'macOS'],
		[/\bLinux\b/, 'Linux']
	];
	const platform = platforms.find(([re]) => re.test(s))?.[1] ?? null;
	return platform ? `${browser} on ${platform}` : browser;
}

/** The `context` column: the route id, which is the stable name of a surface. */
export function contextOf(input: { routeId: string | null; pathname: string }): string {
	return input.routeId || input.pathname || '/';
}
