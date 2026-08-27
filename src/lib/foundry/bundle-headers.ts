import { FOUNDRY_PLATFORM_ORIGIN } from './preflight.ts';

/**
 * WHAT GOES ON A SERVED BUNDLE'S RESPONSE, as one pure module both the serving
 * routes and the framing component read.
 *
 * THE SANDBOX FLAGS ARE WRITTEN DOWN ONCE, HERE. They used to live in
 * `AppFrame.svelte`, which was right while the frame attribute was the only
 * place they appeared -- but the SERVING side has to send the SAME flags as a
 * CSP `sandbox` directive, and the Edge Function that used to do that carried
 * its own second spelling of them in a different runtime where nothing could
 * compare the two. One implementation, two readers, is the only arrangement in
 * which "the attribute and the directive agree" is a fact rather than a hope.
 *
 * THEY ARE NOW A FUNCTION OF THE TWO ORIGINS RATHER THAN A CONSTANT, AND THAT
 * IS THE CHANGE. What used to be written here was:
 *
 *   "`allow-same-origin` MUST NEVER JOIN THIS LIST. With `allow-scripts` it
 *    cancels the sandbox outright: a document given both reaches its own
 *    origin, strips the sandbox attribute off itself in the parent and reloads
 *    unsandboxed."
 *
 * THE MECHANISM IS REAL AND THE RULE WAS TOO BROAD. Reaching into the parent
 * document to remove an attribute from the `<iframe>` element requires the
 * child to be SAME-ORIGIN WITH THE PARENT; `window.parent.document` throws a
 * `SecurityError` otherwise. So the pairing is unsafe when the framed document
 * shares an origin with the page framing it, and safe when it does not. It is
 * one sentence with a condition in it, and the old rule dropped the condition.
 *
 * SO THE CONDITION IS ASSERTED AT RUNTIME instead of assumed at authoring
 * time. `foundrySandboxFlags` grants `allow-same-origin` only when it is handed
 * two non-empty origins that DIFFER, and every other case -- either one
 * missing, or the two equal -- withholds it. That is fail-closed in the
 * direction that matters: a deployment that has not been told where its bundles
 * and its portal live gets the strict set.
 *
 * AND THE CONDITION COMPOSES WITH `frame-ancestors`, WHICH IS WHAT MAKES IT
 * AIRTIGHT RATHER THAN MERELY LIKELY. The grant depends on the portal origin
 * being non-empty and different -- and a non-empty portal origin is exactly
 * when `foundryBundleCsp` below emits `frame-ancestors <portal origin>`, which
 * applies to the WHOLE ancestor chain. So in every configuration where the flag
 * is granted, the browser itself refuses to let any document other than one on
 * the portal origin embed the bundle, and the portal origin is by construction
 * not the bundle origin. The parent a bundle could reach into cannot exist.
 * Conversely, the configuration where anyone may frame a bundle (no portal
 * origin, so no `frame-ancestors`) is precisely the configuration where the
 * flag is withheld.
 *
 * WHAT THE GRANT BUYS is the thing the opaque origin was costing: `localStorage`
 * and `sessionStorage` that survive a reload, IndexedDB, cookies, and a real
 * origin for anything that asks. An opaque origin has no storage area at all
 * and the `localStorage` GETTER THROWS there, which is why the shim beside this
 * file exists -- and an in-memory shim still loses every save slot and every
 * high score the moment the page reloads.
 *
 * WHAT IT COSTS, STATED PLAINLY: every bundle on the apps origin now shares ONE
 * storage area, because they share one origin. Two published apps can read each
 * other's saved state. That is inherent in having a real origin at all -- the
 * only way to separate them is a subdomain per app -- and what is stored there
 * is a student's own save data on a host that holds no session and no
 * credential of ours.
 *
 * WHAT IS GRANTED AND WHY:
 *   allow-scripts            a bundle is a program. Without it there is nothing
 *                            to show.
 *   allow-modals             alert / confirm / prompt, which generated apps use
 *                            constantly and which are silent no-ops without it.
 *   allow-pointer-lock       a first-person or drag-heavy canvas needs it.
 *   allow-forms              a form submission inside the bundle. Granted with
 *                            `form-action` below rather than against it: a
 *                            policy that grants the flag and forbids the action
 *                            refuses the thing it just permitted.
 *   allow-downloads          an app that lets a student save what they made.
 *                            Without it the download is silently discarded.
 *   allow-popups             `window.open`. The popup INHERITS this sandbox,
 *                            because the flag that would free it is refused
 *                            below.
 *   allow-orientation-lock   a phone-oriented game asking to stay landscape.
 *
 * TWO FLAGS ARE REFUSED OUTRIGHT AND MUST STAY REFUSED, whatever the origins
 * are, because neither is about what a bundle can do to ITSELF:
 *   allow-top-navigation             lets a bundle replace the page the viewer
 *                                    is actually on. That is a redirect out of
 *                                    a student project onto anywhere.
 *   allow-popups-to-escape-sandbox   hands a popup FULL rights -- an unsandboxed
 *                                    document opened from a student's app, on
 *                                    whatever origin it likes.
 */

/** Trailing slashes and stray whitespace off, so two spellings of one origin
    cannot read as two origins. Matches `bundle-url.ts`'s own `trimOrigin` and
    the normalization the serving responder applies to the configured portal
    origin, which is what keeps the comparison below honest. */
function normalizeOrigin(origin: string | null | undefined): string {
	return (origin ?? '').trim().replace(/\/+$/, '');
}

/**
 * THE PORTAL ORIGIN, RESOLVED, AND IT NO LONGER DEPENDS ON A VERCEL VARIABLE
 * BEING SET.
 *
 * THE PROBLEM THIS EXISTS FOR. `allow-same-origin` is granted only when the
 * portal origin is non-empty and differs from the bundle origin, and the portal
 * origin used to be `PUBLIC_FOUNDRY_PORTAL_ORIGIN` and nothing else. That
 * variable's absence was tolerated DELIBERATELY -- `frame-ancestors` is
 * unset-means-unrestricted, and the comment below says why -- so a production
 * deployment that never set it was a supported configuration that nobody would
 * have investigated. The two rules composed badly: the grant would have been
 * silently withheld in production, every published app would have kept losing
 * its saved state on reload, and the whole bundle that fixed it would have
 * looked like a fix that did not work. Nobody with access to this repository
 * can read what that variable is set to on Vercel, so the resolution must not
 * depend on the answer.
 *
 * THE RULE, IN ORDER:
 *   1. `PUBLIC_FOUNDRY_PORTAL_ORIGIN` when it is set. An operator who names an
 *      origin means it, and a preview deployment on its own portal host has to
 *      be able to say so.
 *   2. Otherwise `FOUNDRY_PLATFORM_ORIGIN` -- `https://ideabosco.com`, the
 *      canonical portal host -- but ONLY when `PUBLIC_FOUNDRY_APPS_ORIGIN` is
 *      itself set.
 *   3. Otherwise the empty string, which is the strict flag set and no
 *      `frame-ancestors`.
 *
 * WHY THE APPS ORIGIN GATES THE FALLBACK, WHICH IS THE ONLY SUBTLE PART. A
 * configured apps origin is what makes this a SPLIT-ORIGIN deployment: bundles
 * answer on their own host, the serving routes 404 a bundle path arriving
 * anywhere else, and the portal is by construction somewhere else. Guessing the
 * canonical portal host is safe there because the guess cannot be the bundle
 * host. With the apps origin UNSET the routes answer on ANY host -- which is
 * dev and preview, where the portal and the bundle genuinely do share one
 * origin -- and there the old comment's escape is real: a framed document that
 * is same-origin with its parent, handed `allow-scripts` and
 * `allow-same-origin`, reaches `parent.document`, strips its own sandbox
 * attribute and reloads with full rights. So the fallback is withheld exactly
 * where applying it would manufacture the vulnerability, and the empty answer
 * flows through `foundrySandboxFlags` to the strict set.
 *
 * IT IS FAIL-CLOSED IN BOTH DIRECTIONS, which is the property to keep: the only
 * configuration that gains the flag is one that has already been told its
 * bundles live on a host of their own.
 *
 * THE CONSTANT IS IMPORTED RATHER THAN RETYPED. `preflight.ts` hardcodes
 * `https://ideabosco.com` for the same reason the OG tags and the sitemap do --
 * it is the canonical host and a runtime-read origin would put a preview URL in
 * a document students paste into a tool -- and a second literal here is the one
 * that stops matching when the domain moves.
 */
export function foundryPortalOrigin(
	appsOrigin: string | null | undefined,
	portalVariable: string | null | undefined,
): string {
	const configured = normalizeOrigin(portalVariable);
	if (configured !== '') return configured;
	return normalizeOrigin(appsOrigin) !== '' ? FOUNDRY_PLATFORM_ORIGIN : '';
}

/**
 * WHETHER THE ANSWER ABOVE CAME FROM THE FALLBACK. Read by the admin
 * configuration line in `AppFrame.svelte`, which has to say WHICH of the two
 * sources produced the origin it is reporting -- "resolved to ideabosco.com"
 * and "resolved to ideabosco.com because nobody set the variable" are different
 * facts about a deployment, and only the second one is worth acting on.
 */
export function foundryPortalOriginIsFallback(
	appsOrigin: string | null | undefined,
	portalVariable: string | null | undefined,
): boolean {
	return (
		normalizeOrigin(portalVariable) === '' &&
		foundryPortalOrigin(appsOrigin, portalVariable) !== ''
	);
}

/**
 * The flags every bundle gets, in every configuration. `allow-same-origin` is
 * the only conditional one and is appended by `foundrySandboxFlags`.
 */
export const FOUNDRY_SANDBOX_BASE_FLAGS =
	'allow-scripts allow-modals allow-pointer-lock allow-forms allow-downloads allow-popups allow-orientation-lock';

/**
 * The sandbox flags for a bundle served from `bundleOrigin` and framed by
 * `portalOrigin`.
 *
 * THIS IS THE ONE IMPLEMENTATION AND IT HAS TWO CALLERS: `foundryBundleCsp`
 * below, which turns it into the CSP `sandbox` directive on every bundle
 * response, and `AppFrame.svelte`, which writes it into the iframe's `sandbox`
 * attribute. Given the same two origins they produce the same string, which is
 * the property that used to be guaranteed by there being a single constant and
 * is now guaranteed by there being a single function.
 *
 * BOTH ARGUMENTS EMPTY, OR EQUAL, IS THE STRICT SET. A missing origin is not a
 * reason to guess; two origins that are the same string are the case the escape
 * is actually reachable in.
 */
export function foundrySandboxFlags(
	bundleOrigin: string | null | undefined,
	portalOrigin: string | null | undefined,
): string {
	const bundle = normalizeOrigin(bundleOrigin);
	const portal = normalizeOrigin(portalOrigin);
	const crossOrigin = bundle !== '' && portal !== '' && bundle !== portal;
	return crossOrigin
		? `${FOUNDRY_SANDBOX_BASE_FLAGS} allow-same-origin`
		: FOUNDRY_SANDBOX_BASE_FLAGS;
}

/**
 * THE CSP, AND THE THINGS ABOUT IT THAT ARE NOT OBVIOUS.
 *
 * 1. `'self'` IS NOT A USABLE SOURCE FOR A SANDBOXED DOCUMENT WHOSE ORIGIN IS
 *    OPAQUE. It is the only origin-relative source expression, and an opaque
 *    origin is same-origin with nothing -- so a source list has to NAME the
 *    bundle origin literally. The `allow-same-origin` grant above means the
 *    origin is often NOT opaque any more, but the literal is still what is
 *    written: it is correct in both cases, and a policy that changed shape with
 *    the flag would be two policies to reason about.
 *
 * 2. `default-src` ALONE FORBIDS INLINE SCRIPT, which kills the storage shim
 *    and essentially every generated app, so `script-src` and `style-src` are
 *    stated explicitly with `'unsafe-inline'`.
 *
 * 3. THE NETWORK IS DELIBERATELY OPEN. Every fetching directive admits
 *    `https:`, because the build contract tells students a CDN works and a
 *    policy that refused one would make the contract lie. `connect-src` admits
 *    `wss:` as well, because a socket is the one reach a student's app makes
 *    that `https:` does not cover and a multiplayer or live-data app is
 *    otherwise refused at the handshake. The isolation here is the origin split
 *    and `frame-ancestors`, never a restriction on how a student's own script
 *    runs.
 *
 * 4. `base-uri` NAMES THE BUNDLE ORIGIN AND `https:` RATHER THAN `'none'`, AND
 *    THAT IS A CHANGE. A game ported from elsewhere routinely ships as one HTML
 *    file with a `<base href>` pointing at the CDN its assets live on;
 *    `base-uri 'none'` makes the browser ignore that element outright, so every
 *    asset request resolves against the bundle and 404s, and the app renders
 *    empty. It grants nothing new: `default-src` already admits `https:`, so
 *    every URL a `<base>` could point at was already reachable by writing it
 *    out in full. What it changes is whether the student has to.
 *
 * 5. `form-action` NAMES THE SAME SET the other fetching directives do, because
 *    `allow-forms` is granted above and a policy that grants the flag and
 *    forbids the action is incoherent -- the form would submit into a refusal.
 *
 * 6. `worker-src` AND `frame-src` ARE STATED EXPLICITLY rather than left to
 *    `default-src`. They fall back to it today, but the fallback is a fact
 *    about the CSP level in front of them, not about this policy, and a reader
 *    checking whether a bundle may spawn a worker should find the answer here.
 *
 * THE `sandbox` DIRECTIVE IS NOT REDUNDANT WITH THE IFRAME ATTRIBUTE. The
 * attribute covers a document the portal frames; the directive covers the
 * document however it was reached, so a student who navigates straight to a
 * bundle URL gets the same treatment as one who opens it in the gallery.
 *
 * `frame-ancestors` IS UNSET-MEANS-UNRESTRICTED, which reverses the rule the
 * deleted proxy had. On a feature whose history is silently serving nothing, a
 * variable whose absence blanks every frame is the worse failure -- and a
 * framed bundle holds no session and reaches nothing of ours. Note that it is
 * load-bearing in a second way now: see `foundrySandboxFlags` above for why the
 * `allow-same-origin` grant and this directive are two halves of one argument.
 */
export function foundryBundleCsp(
	bundleOrigin: string,
	portalOrigin: string,
): string {
	const web = `${bundleOrigin} https: data: blob:`;
	const directives = [
		`sandbox ${foundrySandboxFlags(bundleOrigin, portalOrigin)}`,
		`default-src ${web}`,
		`script-src ${web} 'unsafe-inline' 'unsafe-eval'`,
		`style-src ${web} 'unsafe-inline'`,
		`img-src ${web}`,
		`font-src ${web}`,
		`media-src ${web}`,
		`connect-src ${web} wss:`,
		`worker-src ${web}`,
		`frame-src ${web}`,
		`base-uri ${bundleOrigin} https:`,
		`form-action ${web}`,
	];
	if (portalOrigin) directives.push(`frame-ancestors ${portalOrigin}`);
	return directives.join('; ');
}

/**
 * Every header a bundle byte response carries, built in one place so the route
 * cannot ship a body with half of them.
 *
 * `nosniff` IS LOAD-BEARING RATHER THAN HYGIENIC. The content type comes from
 * a fixed table over the extension allowlist, and anything outside that table
 * is served `application/octet-stream`; `nosniff` is what stops a browser
 * second-guessing that and executing a student's bytes as something else.
 */
export function foundryBundleHeaders(
	contentType: string,
	bundleOrigin: string,
	portalOrigin: string,
): Headers {
	return new Headers({
		'content-type': contentType,
		'content-security-policy': foundryBundleCsp(bundleOrigin, portalOrigin),
		'x-content-type-options': 'nosniff',
		'referrer-policy': 'no-referrer',
		// The bytes are immutable; WHO may read them is not. A withdrawal has to
		// take effect in about a minute, not whenever a cache decides.
		'cache-control': 'private, max-age=60',
		'x-robots-tag': 'noindex, nofollow',
	});
}
