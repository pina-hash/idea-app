/**
 * DEPLOY SAFETY: WHEN AN OPEN PAGE MAY PICK UP A NEW VERSION OF THE SITE.
 *
 * Every push to `main` is a production deploy, and the classroom export pushes
 * one each time a teacher saves an item, so a new version lands under open tabs
 * many times a day while students are in class. An open tab keeps running the
 * build it loaded. That is harmless until it asks the server for a piece of
 * code the new deployment no longer has, and then the page breaks at the worst
 * moment: mid-assignment, mid-post, mid-upload.
 *
 * THE ANSWER IS TO UPGRADE ONLY WHEN THE PERSON NAVIGATES, AND ONLY WHEN
 * NOTHING IS LOST BY IT. A full page load at the target of a link somebody just
 * clicked looks like an ordinary navigation; a reload of a page somebody is
 * looking at, typing into or projecting is a disruption. So there is exactly
 * ONE trigger (a navigation) and a list of reasons to refuse it, and this
 * module is the one place both are written down. `DeployWatch.svelte` is the
 * one caller: it reads SvelteKit's `updated` flag, the navigation, the
 * fullscreen state and the holds below, asks `deployReloadVerdict`, and
 * reloads only on `reload: true`.
 *
 * PURE AND CLIENT-SAFE. No runes, no `$app/*`, no DOM reads: every fact the
 * verdict needs is handed in, which is what makes each rule assertable in both
 * directions with no browser (`tests/deploy-safety.test.ts`). The hold registry
 * is module state, and module state on the SERVER is shared across requests,
 * so nothing may call `holdDeployReload` during SSR. Nothing does: every caller
 * is an `$effect` (which never runs on the server) or a browser upload path.
 *
 * WHAT IS SAFE WITH VERCEL SKEW PROTECTION ON OR OFF. On, the old deployment
 * keeps answering the old tab's chunk and data requests, and this upgrades at
 * the next safe navigation. Off, a navigation into a route whose chunk the
 * old tab never loaded can 404; SvelteKit then checks the version itself and
 * reloads the target natively, which nothing here can veto -- so the holds
 * that guard work nobody can re-create (an unsaved post, a file in flight) also
 * ask before the page unloads (`deployHoldsWarnOnUnload`), and that native
 * reload stops at a question instead of discarding the work.
 */

/** SvelteKit's navigation types, spelled as `Navigation['type']` spells them. */
export type DeployNavType = 'enter' | 'form' | 'leave' | 'link' | 'goto' | 'popstate';

/** Why a navigation did or did not reload. Every refusal names its rule. */
export type DeployVerdictReason =
	| 'not-updated'
	| 'navigation-type'
	| 'same-path'
	| 'fullscreen'
	| 'projector'
	| 'held'
	| 'reload';

export interface DeployVerdictInput {
	/** SvelteKit's `updated.current`: a newer deployment than this tab's exists. */
	updated: boolean;
	/** The navigation's own `type`. */
	type: DeployNavType | string | null;
	/** `from.url.pathname`, or null. */
	fromPath: string | null;
	/** `to.url.pathname`, or null. */
	toPath: string | null;
	/** `from.route.id`, exactly as SvelteKit spells it. */
	fromRouteId: string | null;
	/** Whether any element is in native fullscreen right now. */
	fullscreen: boolean;
	/** The reasons currently holding (`activeDeployHolds()`). */
	holds: readonly string[];
	/**
	 * A `goto` the save guard RE-ISSUED after flushing, for a navigation the
	 * person made with a link or the back button (`resumedNavigation`). The
	 * guard has to cancel a navigation to flush it, so the one it lets through
	 * arrives as a programmatic `goto` -- and a rule that refused every `goto`
	 * would mean a page with unsaved work could never upgrade.
	 */
	resumed: boolean;
}

export interface DeployVerdict {
	reload: boolean;
	reason: DeployVerdictReason;
}

/**
 * A ROUTE THIS PAGE MUST NEVER BE RELOADED FROM, whatever else is true.
 *
 * `id` is a SvelteKit route id exactly as `page.route.id` spells it, and `tree`
 * also covers every route below it. `tests/deploy-safety.test.ts` asserts each
 * id names a real directory under `src/routes`, so a renamed route reddens
 * rather than silently dropping out of the registry.
 */
export interface ProjectorRoute {
	id: string;
	match: 'exact' | 'tree';
	/** What would be lost, in words, so the registry reads as a list of reasons. */
	why: string;
}

/**
 * THE PROJECTOR REGISTRY. Named for the wall, and it covers the other case the
 * wall is a special instance of: a surface whose state lives in memory and is
 * not worth a reload's flash to refresh. Checked against the route being LEFT,
 * because that is the surface a reload would take off the wall; arriving at a
 * deck by a reload is the deck loading fresh, which is fine.
 *
 * APPEND-ONLY IN SPIRIT, EXTENSIBLE IN FACT: a new projector or in-memory
 * surface adds one line here, the way the class projector view did (ledger
 * 0297, the live class). That page never navigates and loads nothing after its
 * first render, so this entry is the belt to its braces.
 */
export const PROJECTOR_ROUTES: readonly ProjectorRoute[] = [
	{
		id: '/classroom/[sectionId]/item/[itemId]/deck',
		match: 'exact',
		why: 'a lesson deck, full-bleed on the projector'
	},
	{ id: '/tournaments/[id]/tv', match: 'exact', why: 'the tournament TV stage on the wall' },
	{ id: '/fsp/live', match: 'tree', why: 'the FSP live question display' },
	{ id: '/greenline', match: 'tree', why: 'a GREENLINE race or build, held in memory' },
	{ id: '/gauntlet', match: 'tree', why: 'a GAUNTLET run or room, some of them timed' },
	{ id: '/ideacad', match: 'tree', why: "IdeaCAD's in-memory model" },
	{
		id: '/classroom/[sectionId]/live/projector',
		match: 'exact',
		why: "a class's projector view: agenda, clock and running timer on the wall"
	}
];

/** Is `routeId` one of the registered projector surfaces (or below one)? */
export function isProjectorRoute(
	routeId: string | null | undefined,
	routes: readonly ProjectorRoute[] = PROJECTOR_ROUTES
): boolean {
	if (!routeId) return false;
	return routes.some((r) =>
		r.match === 'exact' ? routeId === r.id : routeId === r.id || routeId.startsWith(`${r.id}/`)
	);
}

/**
 * THE ONE DECISION: may this navigation be served by a full page load at its
 * target instead of the ordinary in-app one?
 *
 * The rules, in the order they are asked (the first refusal wins, so the
 * `reason` always names one rule):
 *
 *   1. `not-updated`: there is no newer version. The negative control for
 *      everything below.
 *   2. `navigation-type`: only a LINK the person clicked, the BACK or FORWARD
 *      button (`popstate`), or a navigation the save guard re-issued for one of
 *      those after flushing. Never another programmatic `goto` (a projector
 *      page's own timer, voice navigation, a component writing its state into
 *      the query string), never a form, never the initial `enter`.
 *   3. `same-path`: the pathname must change. A query-only move keeps the SAME
 *      component instance and everything it holds in memory -- IdeaCAD's
 *      model, a notebook's staged photos, a class's filters -- so reloading
 *      there would destroy exactly what the in-app navigation was keeping.
 *   4. `fullscreen`: nothing is reloaded out of fullscreen. A deck, a timer or
 *      a hall pass blown up on the projector stays where the teacher put it.
 *   5. `projector`: the route being left is in `PROJECTOR_ROUTES`.
 *   6. `held`: something on the page holds work a full load would destroy and
 *      an in-app navigation keeps (`holdDeployReload`).
 *
 * AN IDLE PAGE CAN NEVER RELOAD, and that is structural rather than a rule:
 * the only caller is a navigation callback.
 */
export function deployReloadVerdict(input: DeployVerdictInput): DeployVerdict {
	if (!input.updated) return { reload: false, reason: 'not-updated' };
	const byPerson =
		input.type === 'link' || input.type === 'popstate' || (input.type === 'goto' && input.resumed);
	if (!byPerson) return { reload: false, reason: 'navigation-type' };
	if (!input.fromPath || !input.toPath || input.fromPath === input.toPath) {
		return { reload: false, reason: 'same-path' };
	}
	if (input.fullscreen) return { reload: false, reason: 'fullscreen' };
	if (isProjectorRoute(input.fromRouteId)) return { reload: false, reason: 'projector' };
	if (input.holds.length > 0) return { reload: false, reason: 'held' };
	return { reload: true, reason: 'reload' };
}

/**
 * How long `DeployWatch` lets a reload take before it gives the in-app
 * navigation back. `location.reload()` normally unloads the page well inside
 * this; the fallback is for the case where something cancels the unload, so a
 * click never ends in a navigation that hangs forever.
 */
export const DEPLOY_RELOAD_FALLBACK_MS = 4000;

// ---------------------------------------------------------------------------
// HOLDS: work an in-app navigation keeps and a full page load destroys.
// ---------------------------------------------------------------------------

interface Hold {
	reason: string;
	warnOnUnload: boolean;
}

const holds = new Map<symbol, Hold>();
const holdListeners = new Set<() => void>();

function holdsChanged(): void {
	for (const listener of holdListeners) {
		try {
			listener();
		} catch {
			// A listener that throws must not stop the others, or the release
			// that follows, from happening.
		}
	}
}

/**
 * HOLD OFF THE UPGRADE while something on the page cannot survive a reload,
 * and return the release. Idempotent: releasing twice is releasing once.
 *
 * `warnOnUnload` is for work nobody could re-create -- an unsaved post, a file
 * in flight -- and makes the browser ask before the page unloads for ANY
 * reason while it is held, which is what catches SvelteKit's own reload after
 * a failed chunk (see the header). It is off by default because a question on
 * every tab close is a question nobody reads.
 */
export function holdDeployReload(
	reason: string,
	options: { warnOnUnload?: boolean } = {}
): () => void {
	const token = Symbol(reason);
	holds.set(token, { reason, warnOnUnload: options.warnOnUnload ?? false });
	holdsChanged();
	let released = false;
	return () => {
		if (released) return;
		released = true;
		holds.delete(token);
		holdsChanged();
	};
}

/**
 * HOLD WHILE A REQUEST IS IN FLIGHT. Returns the SAME promise, so the caller's
 * own `await`, result and rejection are untouched; the hold ends when it
 * settles either way. An in-app navigation lets the request finish in the
 * background, and a reload would kill it silently, so it also warns on unload.
 */
export function trackInFlight<T>(promise: Promise<T>, reason: string): Promise<T> {
	const release = holdDeployReload(reason, { warnOnUnload: true });
	promise.then(release, release);
	return promise;
}

/** The reasons currently holding, oldest first. */
export function activeDeployHolds(): string[] {
	return [...holds.values()].map((h) => h.reason);
}

/** Whether any current hold asks the browser to warn before unloading. */
export function deployHoldsWarnOnUnload(): boolean {
	for (const h of holds.values()) if (h.warnOnUnload) return true;
	return false;
}

/** Hear every change to the hold set. Returns the unsubscribe. */
export function onDeployHoldsChange(listener: () => void): () => void {
	holdListeners.add(listener);
	return () => {
		holdListeners.delete(listener);
	};
}

// ---------------------------------------------------------------------------
// THE SAVE GUARD'S RE-ISSUED NAVIGATION
// ---------------------------------------------------------------------------

interface Resume {
	pathname: string;
	originalType: string;
}

const resumes = new Set<Resume>();

/**
 * Marks a navigation the save guard is about to re-issue after flushing, and
 * returns the end mark. `$lib/save-guard.svelte` is the one caller, around its
 * `goto`. The original navigation's TYPE travels with it, so a re-issued form
 * submission stays a form as far as the verdict is concerned.
 */
export function beginResumedNavigation(url: URL | string, originalType: string): () => void {
	let pathname: string;
	try {
		pathname = new URL(String(url), 'http://resume.invalid').pathname;
	} catch {
		return () => {};
	}
	const entry: Resume = { pathname, originalType };
	resumes.add(entry);
	return () => {
		resumes.delete(entry);
	};
}

/**
 * Is a navigation to `toPathname` the save guard re-issuing one the person
 * made with a link or the back button? Keyed on the target's pathname, so an
 * unrelated `goto` that happens to run while a resume is in flight is not
 * mistaken for it.
 */
export function resumedNavigation(toPathname: string | null | undefined): boolean {
	if (!toPathname) return false;
	for (const r of resumes) {
		if (r.pathname === toPathname && (r.originalType === 'link' || r.originalType === 'popstate')) {
			return true;
		}
	}
	return false;
}

// ---------------------------------------------------------------------------
// ASKING WHETHER A NEW VERSION EXISTS
// ---------------------------------------------------------------------------

/**
 * The shortest gap between two WAKE checks (a tab becoming visible, the
 * network coming back). Students switch tabs constantly; a check per switch is
 * a request per switch for a question the two-minute poll is already asking.
 * A failed chunk is not a wake check and is never throttled: it is the
 * strongest evidence there is that the answer changed.
 */
export const WAKE_CHECK_MIN_GAP_MS = 30_000;

let versionCheck: (() => Promise<boolean>) | null = null;
let lastCheckAt = Number.NEGATIVE_INFINITY;

/**
 * `DeployWatch` registers SvelteKit's `updated.check` here, once, so a module
 * that wants to ask -- an editor whose chunk failed, the client error hook --
 * does not import `$app/state` for one call and does not ask twice as often as
 * the throttle allows. Returns the unregister.
 */
export function registerVersionCheck(check: () => Promise<boolean>): () => void {
	versionCheck = check;
	return () => {
		if (versionCheck === check) versionCheck = null;
	};
}

/**
 * Ask whether a newer version exists. `force` skips the wake throttle (a
 * failed chunk). Never throws and never reloads: a positive answer only sets
 * the flag the next navigation reads.
 */
export function requestVersionCheck(
	options: { force?: boolean; now?: number } = {}
): boolean {
	const check = versionCheck;
	if (!check) return false;
	const now = options.now ?? Date.now();
	if (!options.force && now - lastCheckAt < WAKE_CHECK_MIN_GAP_MS) return false;
	lastCheckAt = now;
	try {
		void check().catch(() => false);
	} catch {
		return false;
	}
	return true;
}

// ---------------------------------------------------------------------------
// A PIECE OF CODE THAT FAILED TO DOWNLOAD
// ---------------------------------------------------------------------------

/**
 * The browsers' own sentences for a dynamic `import()` that could not fetch its
 * module, plus Vite's for a stylesheet its preload helper could not fetch. Only
 * the Chromium sentence has been measured in this repository; the Firefox and
 * Safari ones are their engines' documented messages.
 */
const CHUNK_LOAD_PATTERNS: readonly RegExp[] = [
	/Failed to fetch dynamically imported module/i, // Chromium
	/error loading dynamically imported module/i, // Firefox
	/Importing a module script failed/i, // Safari
	/Unable to preload CSS for/i // Vite's preload helper
];

/** Did this error come from a chunk of the site that failed to download? */
export function isChunkLoadError(err: unknown): boolean {
	let message = '';
	if (typeof err === 'string') message = err;
	else if (err && typeof err === 'object' && 'message' in err) {
		const m = (err as { message?: unknown }).message;
		if (typeof m === 'string') message = m;
	}
	return message !== '' && CHUNK_LOAD_PATTERNS.some((p) => p.test(message));
}

/**
 * What the error page says for one. A message, not an instruction: the page
 * offers Try again beside it, and a control that needs a sentence is the wrong
 * control.
 */
export const CHUNK_LOAD_MESSAGE = 'Part of this page could not be downloaded.';
