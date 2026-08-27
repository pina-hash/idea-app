/**
 * WHAT GOES ON A SERVED BUNDLE'S RESPONSE, as one pure module both the serving
 * route and the framing component read.
 *
 * THE SANDBOX FLAGS ARE WRITTEN DOWN ONCE, HERE, AND THAT IS A CHANGE. They
 * used to live in `AppFrame.svelte` as the single copy, which was right while
 * the frame attribute was the only place they appeared -- but the serving side
 * has to send the SAME flags as a CSP `sandbox` directive, and the Edge
 * Function that used to do that carried its own second spelling of them in a
 * different runtime where nothing could compare the two. One constant, two
 * readers, is the only arrangement in which "the attribute and the directive
 * agree" is a fact rather than a hope.
 *
 * `allow-same-origin` MUST NEVER JOIN THIS LIST. With `allow-scripts` it
 * cancels the sandbox outright: a document given both reaches its own origin,
 * strips the sandbox attribute off itself in the parent and reloads
 * unsandboxed. Every other flag here is additive and arguable; that pair is
 * not.
 *
 * WHAT IS GRANTED AND WHY:
 *   allow-scripts        a bundle is a program. Without it there is nothing
 *                        to show.
 *   allow-modals         alert / confirm / prompt, which generated apps use
 *                        constantly and which are silent no-ops without it.
 *   allow-pointer-lock   a first-person or drag-heavy canvas needs it.
 *
 * NOT granted, deliberately: `allow-forms`, `allow-popups`,
 * `allow-top-navigation` and `allow-downloads`. None is needed by anything the
 * build contract describes, and each is a way out of the frame.
 */
export const FOUNDRY_SANDBOX_FLAGS = 'allow-scripts allow-modals allow-pointer-lock';

/**
 * THE CSP, AND THE THREE THINGS ABOUT IT THAT ARE NOT OBVIOUS.
 *
 * 1. `'self'` IS NOT A USABLE SOURCE FOR A SANDBOXED DOCUMENT. It is the only
 *    origin-relative source expression, and an opaque origin is same-origin
 *    with nothing -- so a source list has to NAME the bundle origin literally.
 *
 * 2. `default-src` ALONE FORBIDS INLINE SCRIPT, which kills the storage shim
 *    and essentially every generated app, so `script-src` and `style-src` are
 *    stated explicitly with `'unsafe-inline'`.
 *
 * 3. THE NETWORK IS DELIBERATELY OPEN. Every fetching directive admits
 *    `https:`, because the build contract tells students a CDN works and a
 *    policy that refused one would make the contract lie. The isolation here is
 *    the opaque origin and `frame-ancestors`, never a restriction on how a
 *    student's own script runs.
 *
 * THE `sandbox` DIRECTIVE IS NOT REDUNDANT WITH THE IFRAME ATTRIBUTE. The
 * attribute covers a document the portal frames; the directive covers the
 * document however it was reached, so a student who navigates straight to a
 * bundle URL lands in the same opaque origin instead of running a page with
 * full rights on a host of ours.
 *
 * `frame-ancestors` IS UNSET-MEANS-UNRESTRICTED, which reverses the rule the
 * deleted proxy had. On a feature whose history is silently serving nothing, a
 * variable whose absence blanks every frame is the worse failure -- and a
 * framed bundle is sandboxed, holds no session and reaches nothing of ours, so
 * another site embedding one gains a copy of a student's app and no more.
 */
export function foundryBundleCsp(
	bundleOrigin: string,
	portalOrigin: string,
): string {
	const web = `${bundleOrigin} https: data: blob:`;
	const directives = [
		`sandbox ${FOUNDRY_SANDBOX_FLAGS}`,
		`default-src ${web}`,
		`script-src ${web} 'unsafe-inline' 'unsafe-eval'`,
		`style-src ${web} 'unsafe-inline'`,
		`img-src ${web}`,
		`font-src ${web}`,
		`media-src ${web}`,
		`connect-src ${web}`,
		"base-uri 'none'",
		"form-action 'none'",
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
