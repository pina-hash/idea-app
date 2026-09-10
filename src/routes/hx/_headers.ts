import { HX_SANDBOX_FLAGS } from '$lib/classroom/html-assignment/bridge.ts';

/**
 * THE HEADER SET AND THE HOST GATE FOR A SERVED HTML-ASSIGNMENT DOCUMENT.
 *
 * WHY THIS IS A MODULE AND NOT PART OF THE ROUTE. SvelteKit throws on ANY
 * non-method export from a `+server.ts` -- `Invalid export '<name>' in <route>'`
 * -- and nothing local catches it: `svelte-check` reports 0 errors on a broken
 * file because the export is valid TypeScript and the rule is SvelteKit's, and
 * a vitest file that imports the module directly never goes through the router
 * that validates it. The first sign is production. CLAUDE.md records the whole
 * measurement; the escape hatch is a `_` prefix or a module beside the route,
 * and this is the second one, because these three functions are what the tests
 * put a hostile input to.
 */

/**
 * THE PORTAL ORIGIN THE CONTRACT NAMES. `frame-ancestors` resolves to exactly
 * this unless a deployment says otherwise, so the production policy with
 * nothing configured is byte-identical to the contract's.
 */
export const HX_PORTAL_ORIGIN = 'https://ideabosco.com';

/** Trailing slashes and stray whitespace off, so two spellings of one origin
    cannot read as two origins. */
function normalizeOrigin(origin: string | null | undefined): string {
	return (origin ?? '').trim().replace(/\/+$/, '');
}

/**
 * WHICH ORIGIN MAY EMBED A DOCUMENT: RESOLVED, NOT READ, AND PRODUCTION IS THE
 * CONTRACT'S LITERAL WITH NOTHING CONFIGURED.
 *
 * THE PROBLEM THIS EXISTS FOR. `frame-ancestors` is the browser refusing to let
 * anything but the named origin embed this document. Written out as
 * `https://ideabosco.com` and nothing else, it also refuses a dev server and a
 * Vercel preview -- so the frame, the bridge and every containment control in
 * this lane would be unverifiable anywhere but production, on the one feature in
 * the repository whose entire deliverable is a security boundary somebody has
 * actually measured. The directive has to name the origin that is genuinely
 * doing the framing, and on a one-host deployment that is not the production
 * portal.
 *
 * THE RULE, IN ORDER, AND IT IS `foundryPortalOrigin`'S SHAPE FOR THE SAME
 * DIRECTIVE ON THE BUNDLE ROUTES:
 *   1. `PUBLIC_HX_PORTAL_ORIGIN` when it is set. An operator who names an origin
 *      means it.
 *   2. Otherwise `HX_PORTAL_ORIGIN` -- `https://ideabosco.com`, the contract's
 *      own literal -- but ONLY when `PUBLIC_HX_SANDBOX_ORIGIN` is itself set.
 *   3. Otherwise the origin the request arrived on.
 *
 * WHY THE SANDBOX ORIGIN GATES RUNG 2, WHICH IS THE ONLY SUBTLE PART. A
 * configured sandbox origin is what makes this a SPLIT-ORIGIN deployment:
 * documents answer on their own host and this route 404s a `/hx/` path arriving
 * anywhere else, so the portal is by construction a different host and naming it
 * is the only answer that works. That is production, and rung 2 reproduces the
 * contract's policy BYTE FOR BYTE with nothing configured at all. With the
 * sandbox origin UNSET the route answers on any host -- dev and preview, where
 * one server is answering both roles -- and rung 2 would name a host that is not
 * the one framing anything, blanking every frame. Rung 3 names the server that
 * served the document, which on a one-host deployment IS the portal.
 *
 * RUNG 3 GRANTS NOTHING A SPLIT DEPLOYMENT WOULD NOT ALREADY HAVE. It is
 * reachable only where the two roles are one host, and there "the origin serving
 * this document may frame it" and "the portal may frame it" are the same
 * sentence. It can never widen production, because production sets the sandbox
 * origin and therefore never reaches it.
 */
export function hxPortalOrigin(
	configured: string | null | undefined,
	sandboxOrigin: string | null | undefined,
	requestOrigin: string
): string {
	const named = normalizeOrigin(configured);
	if (named !== '') return named;
	if (normalizeOrigin(sandboxOrigin) !== '') return HX_PORTAL_ORIGIN;
	return normalizeOrigin(requestOrigin);
}

/**
 * WHETHER THE ANSWER ABOVE CAME FROM RUNG 3. Read by the dev harness, which has
 * to say which of the three sources produced the origin it is reporting --
 * "frame-ancestors is the production portal" and "frame-ancestors is whatever
 * host you happen to be on" are different facts about a deployment.
 */
export function hxPortalOriginIsRequestHost(
	configured: string | null | undefined,
	sandboxOrigin: string | null | undefined
): boolean {
	return normalizeOrigin(configured) === '' && normalizeOrigin(sandboxOrigin) === '';
}

/**
 * THE CONTRACT'S CSP, WITH ONE RESOLVED DIRECTIVE.
 *
 *   default-src 'none'      nothing loads unless a directive below says so.
 *   script-src 'unsafe-inline'
 *   style-src 'unsafe-inline'
 *                           a ported document is one file with its script and
 *                           its style inline. No host is admitted on either:
 *                           there is no CDN reach here, deliberately, and that
 *                           is the difference between this and a Foundry
 *                           bundle, whose build contract promises one.
 *   img-src data: blob:     a pasted photograph, as bytes the document already
 *                           holds. No remote image, so no document can phone
 *                           home by setting an `<img src>` -- which is the
 *                           exfiltration channel a `connect-src` alone leaves
 *                           open.
 *   connect-src 'none'      THE ONE THAT STOPS AN UPLOADED DOCUMENT
 *                           EXFILTRATING STUDENT ANSWERS. `fetch`,
 *                           `XMLHttpRequest`, `WebSocket`, `EventSource` and
 *                           `sendBeacon` are all refused. It is an INDEPENDENT
 *                           lever from the sandbox: measured in this
 *                           container's Chromium, a fetch from inside the frame
 *                           is refused with this directive in force whether or
 *                           not `allow-same-origin` is granted. Do not read a
 *                           passing fetch control as evidence about the
 *                           sandbox, or the reverse.
 *   form-action 'none'      a form inside the document cannot submit anywhere,
 *                           which is the same exfiltration answered a second
 *                           way.
 *   frame-ancestors <portal>
 *                           only the portal may embed it.
 *
 *   sandbox <HX_SANDBOX_FLAGS>
 *                           THE ONE THAT COVERS A DIRECT NAVIGATION, AND IT
 *                           WAS ADDED AFTER 0126 MEASURED ITS ABSENCE. Read
 *                           the paragraph below before changing it.
 *
 * THE `sandbox` DIRECTIVE AND THE IFRAME `sandbox` ATTRIBUTE ARE NOT
 * REDUNDANT, AND THE DIRECTIVE IS THE HALF THAT COVERS PRODUCTION AS IT IS
 * ACTUALLY CONFIGURED.
 *
 * WHAT 0126 MEASURED AND LEFT OPEN. The attribute is on the `<iframe>`, so it
 * governs a document the PORTAL FRAMED and nothing else. A student who
 * navigates STRAIGHT to `/hx/<docId>` -- typed, pasted, or followed from a
 * link -- reaches the same bytes with no frame around them and therefore no
 * attribute, so the document is NOT placed in an opaque origin. With
 * `PUBLIC_HX_SANDBOX_ORIGIN` UNSET, which is production's configuration today,
 * `hxOnServingHost` below answers true for every host and the route answers on
 * `ideabosco.com` -- the host the portal's session cookies live on, and the
 * host `@supabase/ssr` writes them `httpOnly: false` so `document.cookie` can
 * read them. An uploaded document navigated to directly would then run in that
 * origin, with that session. That is the gap this directive closes.
 *
 * IT IS THE SAME STRING THE ATTRIBUTE CARRIES, IMPORTED, NEVER RETYPED.
 * `HX_SANDBOX_FLAGS` in `bridge.ts` is the one spelling; `HtmlAssignmentFrame`
 * writes it into the element and this writes it into the header, exactly as
 * `foundrySandboxFlags` has two readers for the identical reason. A second
 * literal here is a framed document and a navigated one that drift apart with
 * nothing able to compare them.
 *
 * `allow-scripts` ALONE, AND `allow-same-origin` MUST NEVER JOIN IT. The pair
 * cancels the sandbox: a document same-origin with its parent reaches
 * `parent.document`, strips the attribute off its own `<iframe>` and reloads
 * with full rights. Foundry grants the flag conditionally because its bundles
 * answer on a host that is by construction not the portal; this route has no
 * such guarantee -- with the sandbox origin unset it answers on the portal
 * host itself -- so the strict set is the only correct answer here and the
 * condition Foundry can assert is one this route cannot.
 *
 * WHAT IT DOES NOT REPLACE. `PUBLIC_HX_SANDBOX_ORIGIN` stays supported and
 * remains the stronger deployment: a second host carries no session cookie at
 * all, which is an ABSENCE rather than a browser honouring a directive. The
 * directive makes that configuration DEFENCE IN DEPTH rather than a
 * prerequisite. `connect-src 'none'` and `form-action 'none'` are independent
 * levers and neither is evidence about this one.
 */
export function hxDocumentCsp(portalOrigin: string): string {
	return [
		// FIRST, matching `foundryBundleCsp`'s ordering. Position is not
		// load-bearing to a browser; being read first by a person is.
		`sandbox ${HX_SANDBOX_FLAGS}`,
		"default-src 'none'",
		"script-src 'unsafe-inline'",
		"style-src 'unsafe-inline'",
		'img-src data: blob:',
		"connect-src 'none'",
		"form-action 'none'",
		`frame-ancestors ${portalOrigin}`
	].join('; ');
}

/**
 * WHETHER THIS REQUEST ARRIVED ON THE HOST PORTED DOCUMENTS ARE SERVED FROM.
 *
 * UNSET MEANS ANY HOST, which is what makes local development and a preview
 * deployment work with no configuration at all. In production it is pinned to
 * `https://sandbox.ideabosco.com`, and a `/hx/` path arriving on the MAIN host
 * then 404s -- which is the part that matters, because the main host is where
 * the session cookies live and serving the same bytes there would hand every
 * uploaded document the credentials the second origin exists to withhold.
 *
 * THIS IS A ROUTE DECLINING TO ANSWER, NOT A HOST BRANCH. The branch that cost
 * Foundry two lanes sat in `hooks.server.ts` ahead of routing and decided what
 * an entire host could serve, on every request to the site. This is one handler
 * declining an origin it is not for, inside itself, affecting nothing else.
 */
export function hxOnServingHost(
	requestOrigin: string,
	configured: string | null | undefined
): boolean {
	const trimmed = normalizeOrigin(configured);
	if (trimmed === '') return true;
	return normalizeOrigin(requestOrigin) === trimmed;
}

/** Every header a served document carries, in the one place all of them are
    written down. A second copy is a document served with a weaker policy that
    renders identically. */
export function hxDocumentHeaders(portalOrigin: string): Headers {
	return new Headers({
		'content-type': 'text/html; charset=utf-8',
		'content-security-policy': hxDocumentCsp(portalOrigin),
		// Load-bearing rather than hygienic: the type is decided here, and this is
		// what stops a browser second-guessing it.
		'x-content-type-options': 'nosniff',
		// The request carries no record of which page of ours the viewer came from.
		'referrer-policy': 'no-referrer',
		// A revision's bytes are immutable -- an instructor edit is a re-upload
		// producing a NEW revision -- but WHO may read them is not.
		'cache-control': 'private, max-age=60',
		'x-robots-tag': 'noindex, nofollow'
	});
}
