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

// ---------------------------------------------------------------------------
// 1. WHERE THE AFFORDANCE SITS
// ---------------------------------------------------------------------------

/**
 * A surface that does NOT get the shell's floating control, and what carries
 * it instead. AN EXCLUSION RELOCATES, IT NEVER DELETES: a projected deck and a
 * running challenge are exactly the surfaces where something goes wrong, so
 * losing the report affordance there would cost the reports worth having.
 *
 * BY CATEGORY, NEVER BY PAGE. `match` reads a ROUTE ID, so a new page added
 * under an excluded section inherits the exclusion instead of having to
 * remember it, which is the same reason the affordance is mounted in the shell
 * in the first place.
 */
export type FeedbackExclusionId =
	| 'deck'
	| 'projector'
	| 'classroom'
	| 'gauntlet'
	| 'greenline'
	| 'vanguard'
	| 'coins'
	| 'error';

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
 * The `/dev` harnesses that mount the REAL ClassroomShell, which carries the
 * relocated Report control in its header. Exported so a test can
 * sweep src/routes/dev for every harness that imports the shell and fail when
 * one is missing from this list (a harness showing both the floating pill and
 * the docked one measures an arrangement production never has).
 */
/**
 * THE REPORT CONTROL'S WORD, spelled once (ledger 0297, LEARN). The floating
 * pill reads the long form; the classroom header docks it with the short one.
 * A page that tells somebody where to report reads it from here, because the
 * update log's intro pointed at a "Feedback button" for months after the
 * control stopped being called that.
 */
export const REPORT_LABEL = 'Report a problem';
export const REPORT_LABEL_SHORT = 'Report';

export const CLASSROOM_SHELL_HARNESSES = [
	'/dev/animated-logo-room',
	'/dev/classroom',
	'/dev/classroom-live',
	'/dev/classroom-nav',
	'/dev/classroom-palette',
	'/dev/classroom-split',
	'/dev/classroom-stream',
	'/dev/classroom-todo',
	'/dev/classroom-tour',
	'/dev/classroom-view-as-notebook',
	'/dev/item-gallery',
	'/dev/item-returned',
	'/dev/notebook',
	'/dev/notebook-capture',
	'/dev/notebook-review',
	'/dev/notebook-review-student',
	'/dev/notebook-timeline',
	'/dev/theme-switch'
] as const;

/**
 * The `/dev` harnesses that mount a classroom SURFACE without the shell around
 * it (the grading console, People). In production those surfaces sit under
 * `/classroom`, where the controls are docked in the header and nothing
 * floats over them, so the harness takes the same exclusion: a floating pill
 * over the grading dock in a harness is an arrangement production never has.
 */
export const CLASSROOM_SURFACE_HARNESSES = [
	'/dev/grading',
	'/dev/grading-bulk',
	'/dev/grading-rubric',
	'/dev/presence',
	'/dev/instructor-tools'
] as const;

export const FEEDBACK_EXCLUSIONS: FeedbackExclusionRule[] = [
	{
		id: 'deck',
		label: 'Presentation deck',
		relocatedTo: 'the deck control bar',
		// The stage is projected onto a wall. A floating control over it is in
		// the photograph of the lesson.
		match: (routeId) =>
			// A `/classroom/view-as/.../deck` alternative used to sit here. It never
			// matched anything -- the view-as tree has never had a deck route -- and
			// the class and item previews it was written in anticipation of are now
			// deleted outright. Removing an alternative that matched no route is not
			// removing an exclusion: no surface loses or gains the control.
			/^\/classroom\/\[sectionId\]\/item\/\[itemId\]\/deck$/.test(routeId) ||
			under('/dev/classroom-deck')(routeId),
		samples: ['/classroom/[sectionId]/item/[itemId]/deck', '/dev/classroom-deck']
	},
	{
		id: 'projector',
		label: 'Class projector view',
		relocatedTo: "the projector view's own strip, beside Full screen",
		// The class's wall display (ledger 0297): the agenda, the clock and the
		// timer, projected. A floating control over it is on the wall in front of
		// the class, exactly as it would be over a deck.
		match: (routeId) =>
			routeId === '/classroom/[sectionId]/live/projector' || under('/dev/classroom-projector')(routeId),
		samples: ['/classroom/[sectionId]/live/projector', '/dev/classroom-projector']
	},
	{
		id: 'classroom',
		label: 'IDEA Classroom and the notebook inside it',
		relocatedTo: 'the classroom header, in its own slot before the profile menu, at every width',
		// LEDGER 0297, report 34's neighbour: the floating Report and Voice pills
		// sat over live classroom content on every class and notebook page -- a
		// row's checkbox and grip, a menu trigger, People's Deactivate and Remove,
		// the grading dock's Return button at 960, the photo corrector's buttons
		// -- and a hit test at the overlap answered the pill. The room has chrome
		// of its own on every one of those pages, so Report docks into it
		// (ClassroomShell mounts SiteFeedback at `place="relocated"`), and nothing
		// floats over the class any more. Voice has no pill at all since ledger
		// 0298 (report 31): it is the command palette's Speak control.
		//
		// REPORT NEVER FOLDS INTO THE MENU (report 30, 2026-09-25). Below 1180px
		// the header's tools fold behind one Menu button; Report used to fold with
		// them, so on a narrow window it was one press away and read as missing
		// ("the report button does not show up in the classroom app", report 20).
		// It has its own slot outside the fold now, visible at every width.
		//
		// AFTER THE DECK AND THE PROJECTOR, the two classroom routes with chrome
		// of their own (the deck's bar, the wall strip) and which this rule must
		// not claim: the first match wins.
		// The dev harnesses that mount the real ClassroomShell are listed so a
		// measurement there sees the production arrangement and not a pill over
		// the fixture with a second copy in the header.
		match: (routeId) =>
			under('/classroom')(routeId) ||
			CLASSROOM_SHELL_HARNESSES.some((p) => under(p)(routeId)) ||
			CLASSROOM_SURFACE_HARNESSES.some((p) => under(p)(routeId)),
		samples: [
			'/classroom',
			'/classroom/[sectionId]',
			'/classroom/[sectionId]/item/[itemId]',
			'/classroom/[sectionId]/people',
			'/classroom/[sectionId]/notebook',
			'/classroom/notebook',
			'/classroom/todo',
			'/dev/classroom-split/[sectionId]'
		]
	},
	{
		id: 'gauntlet',
		label: 'GAUNTLET',
		relocatedTo: 'the GAUNTLET viewport footer',
		// The whole section, not just the timed runs: the VIEWPORT owns its own
		// chrome and a portal-styled control floating in it is off-brand as well
		// as in the way. The footer renders on every /gauntlet page, so the
		// relocation covers the section the same way the exclusion does.
		match: under('/gauntlet'),
		samples: ['/gauntlet', '/gauntlet/speedrun/[id]', '/gauntlet/rooms/[id]']
	},
	{
		id: 'greenline',
		label: 'GREENLINE',
		relocatedTo: 'the GREENLINE title, garage, race and results menus',
		// The race route ONLY. The track and piece builders are ordinary pages
		// with ordinary chrome and keep the shell control; the game is the one
		// that is a live 3D surface with menus of its own to put this in.
		match: (routeId) => routeId === '/greenline',
		samples: ['/greenline']
	},
	{
		id: 'vanguard',
		label: 'VANGUARD',
		relocatedTo: "VANGUARD's own Report button, beside the IDEA link at the top right",
		// VANGUARD is served as legacy HTML from a +server.ts endpoint and
		// renders no layout at all, so this rule excludes nothing the shell
		// mount could ever have reached. It stands so that a VANGUARD surface
		// which DOES render the shell inherits the exclusion rather than
		// discovering it in front of a class. The game now carries a real
		// report control -- injected into the served HTML by
		// src/routes/vanguard/+server.ts, opening a "REPORT A PROBLEM" panel --
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
		relocatedTo: "the Ledger's own Report button, in the page header beside Share",
		// The Ledger is carried-over legacy HTML served from a `+server.ts`
		// (`src/routes/coins/[...path]/+server.ts`) and renders no layout at all,
		// so this rule excludes nothing the shell mount could ever have reached
		// -- the same standing VANGUARD's rule has, and for the same reason it
		// stands: a coin surface that DOES render the shell inherits the
		// exclusion rather than discovering it in front of a class.
		//
		// The page carries a real report control now, injected into the served
		// HTML by `$lib/server/legacy-report-panel.ts`, reaching the SAME
		// feedback system as everything else: signed in posts through
		// `/api/coin-feedback` (the RLS-scoped insert, as the caller), signed
		// out through the shared anonymous route. Both land in `app_feedback`
		// carrying the same capture. Unlike VANGUARD there is only ONE control
		// on this page.
		//
		// `/coin-desk` and `/coin-balance` are NOT claimed by this rule.
		// `appForRouteId` folds all three onto the app id 'coins', but those two
		// are ordinary Svelte pages under the root layout and keep the shell's
		// own floating control; only the served-HTML surface is excluded.
		match: (routeId) => routeId === '/coins' || routeId === '/coins/[...path]',
		samples: ['/coins', '/coins/[...path]']
	},
	{
		id: 'error',
		label: 'Error boundary',
		relocatedTo: 'the error page report panel, with the status filled in',
		// Not a route: `feedbackExclusion` is asked with the error flag set. The
		// error page mounts the affordance itself, prominently and prefilled, so
		// the floating copy beside it would be a second control offering less.
		match: () => false,
		samples: []
	}
];

const BY_ID = new Map(FEEDBACK_EXCLUSIONS.map((r) => [r.id, r]));

/**
 * Which category (if any) takes the affordance off the shell for this route.
 * Null means the shell shows it, which is the default every new route gets.
 */
export function feedbackExclusion(
	routeId: string | null | undefined,
	opts: { hasError?: boolean } = {}
): FeedbackExclusionRule | null {
	if (opts.hasError) return BY_ID.get('error') ?? null;
	if (!routeId) return null;
	for (const rule of FEEDBACK_EXCLUSIONS) {
		if (rule.match(routeId)) return rule;
	}
	return null;
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
}

/** The `meta` jsonb, assembled in exactly one place. */
export function captureMeta(input: FeedbackContextInput): Record<string, unknown> {
	const meta: Record<string, unknown> = {
		route: input.routeId ?? null,
		path: input.pathname,
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
