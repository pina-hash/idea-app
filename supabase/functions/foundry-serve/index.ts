/**
 * FOUNDRY SERVE: the one place a published student bundle's bytes reach a
 * browser.
 *
 *   GET /functions/v1/foundry-serve/<app id>/<version id>/            -> index.html
 *   GET /functions/v1/foundry-serve/<app id>/<version id>/<path>      -> that file
 *
 * WHY THIS EXISTS HERE AND NOT ON VERCEL, WHICH IS THE WHOLE POINT OF THE
 * LANE. There was a proxy on `apps.ideabosco.com`, a second host on the same
 * Vercel project, reached through a signed token and a host branch in
 * `hooks.server.ts`, with a build step that rewrote the generated route table
 * so every request on that host reached the function. It never served a bundle
 * in production across five lanes of diagnosis, and every part of it is gone.
 *
 * None of those parts exists here. There is no host to match, no
 * `event.url.host` to trust, no Build Output config to edit, no SvelteKit hook,
 * and no token to sign, mint, expire or verify. There is a Deno function on a
 * URL, which is the same deployment path `foundry-ingest` already uses and
 * which demonstrably works in this project.
 *
 * THE ORIGIN SPLIT SURVIVES, AND IT IS FREE HERE RATHER THAN ENGINEERED. This
 * function answers on `<ref>.supabase.co`, which is not `ideabosco.com` -- so a
 * bundle containing `<img src="/api/whatever">` reaches a host that holds no
 * session of the portal's, because the portal's cookies are not set on this
 * domain and never were. That was the argument for the second host; the
 * argument is unchanged and the mechanism is now somebody else's problem.
 *
 * WHY NOT SERVE THE BUCKET DIRECTLY. That was the plan, and it is measurably
 * impossible: Supabase Storage's own renderer rewrites every `text/html`
 * response to `text/plain`, on the public, authenticated and signed-URL paths
 * alike, with no configuration flag. A framed bundle would show its own source
 * as text. Measured against a real object on a real Storage instance, so
 * `foundry-bundles` STAYS PRIVATE -- 0130's "no policy at all" is still the
 * mechanism, and this function's service-role client is still its only reader.
 * That is strictly better than the public bucket the plan called for: no draft,
 * rejected, superseded or hidden build is world-readable.
 *
 * SO THE TOKEN'S CHECKS ARE STILL ENFORCED, JUST NOT SIGNED. A service-role
 * read bypasses RLS, which means every rule RLS would have enforced is
 * enforced here, explicitly, on every request:
 *
 *   1. the version named in the URL belongs to the app named in the URL;
 *   2. the app is not hidden;
 *   3. the version is either the app's `published_version_id` OR it is
 *      SUBMITTED and therefore in front of a reviewer right now.
 *
 * (3) IS WHAT REPLACED THE REVIEW-KIND TOKEN, and it is a deliberate trade.
 * The review queue has to RUN the build it is deciding about, and a submitted
 * version is by definition not the published one. The old design signed an
 * admin's licence into the token bytes; there is no token now, so the licence
 * comes from the VERSION'S OWN STATUS instead. What that costs: a student who
 * knows their own version uuid can hand somebody a link to a build that is
 * submitted but not yet approved. What it does not cost: a DRAFT and a
 * REJECTED version both stop serving, immediately and for everyone, and so
 * does a rolled-back one and a hidden app. Rejecting a build takes it off the
 * web in the same statement that records the rejection, which the
 * thirty-minute token could not do.
 *
 * THE FILE LIST IS THE ALLOWLIST, which is what makes path traversal a
 * non-event. A served path must have a ROW in `student_app_files` for that
 * exact version and that exact string; there is no directory to walk, no
 * prefix to escape from, and nothing is ever resolved against a filesystem.
 * The path predicate runs first anyway, as an independent second refusal.
 *
 * EVERY REFUSAL IS THE SAME BODYLESS 404. A malformed URL, an unknown app, an
 * unpublished version, another app's file, a hidden app and a missing row are
 * indistinguishable from outside.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

import { bundlePathOk } from '../../../src/lib/bundle-path.ts';
import { FOUNDRY_ENTRY_FILE, servableFoundryType } from '../../../src/lib/foundry/preflight.ts';
import { injectStorageShim } from '../../../src/lib/foundry/storage-shim.ts';

const BUNDLE_BUCKET = 'foundry-bundles';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ONE REFUSAL, USED EVERYWHERE. `no-store` so a 404 for a build that is about
 * to be approved is not cached into the next reviewer's browser.
 */
function notFound(): Response {
	return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
}

/**
 * THE CSP, AND THE TWO THINGS ABOUT IT THAT ARE NOT OBVIOUS.
 *
 * `sandbox` AS A DIRECTIVE IS NOT REDUNDANT WITH THE IFRAME ATTRIBUTE. The
 * attribute covers a document the portal frames; the directive covers the
 * document however it was reached, so a student who navigates straight to a
 * bundle URL lands in the same opaque origin rather than running a page with
 * full rights on the Supabase project's domain. Neither replaces the other.
 *
 * `'self'` IS NOT A USABLE SOURCE FOR A SANDBOXED DOCUMENT. It is the only
 * origin-relative source expression, and an opaque origin is same-origin with
 * nothing -- so a source list has to NAME the bundle origin literally, taken
 * from the request's own URL. And `default-src` alone forbids inline script,
 * which kills essentially every generated app, so `script-src` and `style-src`
 * are stated explicitly with `'unsafe-inline'`. The isolation here is the
 * opaque origin and `frame-ancestors`, never a restriction on how a student's
 * own script runs.
 *
 * THE NETWORK IS DELIBERATELY OPEN. `connect-src`, `script-src`, `style-src`,
 * `img-src` and `font-src` all admit `https:`, because the build contract now
 * tells students a CDN works and refusing here would make the contract lie.
 *
 * `frame-ancestors` IS OMITTED WHEN NOTHING IS CONFIGURED, AND THAT REVERSES
 * THE OLD RULE ON PURPOSE. The proxy defaulted an unset app origin to
 * `frame-ancestors 'none'` -- fail-closed, "costing the gallery its embed
 * rather than letting any site on the internet frame a bundle". After five
 * lanes spent on a Foundry that silently served nothing, that trade is the
 * wrong way round: an unset variable would take the gallery down with a blank
 * frame and a console line, which is indistinguishable from the bug this lane
 * exists to end. And the thing being protected is small -- a framed bundle is
 * sandboxed, holds no session, has no storage and can reach nothing of ours,
 * so another site embedding one gains a copy of a student's app and nothing
 * else. So: unset means UNRESTRICTED, loudly rather than quietly, and
 * production pins it with the `FOUNDRY_APP_ORIGIN` function secret.
 */
function csp(bundleOrigin: string, appOrigin: string): string {
	const web = `${bundleOrigin} https: data: blob:`;
	const directives = [
		'sandbox allow-scripts allow-modals allow-pointer-lock',
		`default-src ${web}`,
		`script-src ${web} 'unsafe-inline' 'unsafe-eval'`,
		`style-src ${web} 'unsafe-inline'`,
		`img-src ${web}`,
		`font-src ${web}`,
		`media-src ${web}`,
		`connect-src ${web}`,
		"base-uri 'none'",
		"form-action 'none'"
	];
	if (appOrigin) directives.push(`frame-ancestors ${appOrigin}`);
	return directives.join('; ');
}

/**
 * THE ORIGIN A BROWSER ACTUALLY ASKED FOR, which is not the one this function
 * sees, and the difference has already cost this lane once.
 *
 * `url.origin` inside the isolate is the runtime's own internal address --
 * measured locally as `http://127.0.0.1:8081` while the browser was talking to
 * `http://127.0.0.1:54421`. `SUPABASE_URL` is no better: it is the INTERNAL
 * gateway (`http://kong:8000` locally), because that is what server-side code
 * inside the project is meant to call. Either one, put into a CSP source list,
 * names an origin no browser will ever load from -- so the bundle's own
 * stylesheet and script get blocked, in a way that looks exactly like a CSP
 * that was written wrong.
 *
 * The proxy that came before read `event.url.host` on Vercel and had a whole
 * measured argument for why that was safe. The same question, asked of a
 * different platform, has a different answer, which is the general lesson: the
 * request's own forwarding headers are what carry the public origin here, and
 * they were read off a real request rather than assumed.
 *
 * IT DEGRADES RATHER THAN FAILS. With no forwarding headers this falls back to
 * `url.origin`, and every production source list also carries the `https:`
 * scheme source, which matches the real origin whatever this returns. The
 * derived value earns its place on http deployments -- local and preview --
 * where `https:` matches nothing.
 */
function publicOrigin(req: Request, url: URL): string {
	const host = req.headers.get('x-forwarded-host');
	if (!host) return url.origin;

	const proto = (req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')).split(
		','
	)[0].trim();
	const port = (req.headers.get('x-forwarded-port') ?? '').split(',')[0].trim();
	const isDefaultPort = (proto === 'https' && port === '443') || (proto === 'http' && port === '80');
	// A forwarded host may already carry its port; do not add a second one.
	const authority = port && !isDefaultPort && !host.includes(':') ? `${host}:${port}` : host;
	return `${proto}://${authority}`;
}

function headersFor(contentType: string, bundleOrigin: string, appOrigin: string): Headers {
	return new Headers({
		'content-type': contentType,
		'content-security-policy': csp(bundleOrigin, appOrigin),
		'x-content-type-options': 'nosniff',
		'referrer-policy': 'no-referrer',
		// The bytes are immutable; WHO may read them is not. A withdrawal has to
		// take effect in about a minute, not whenever a cache decides.
		'cache-control': 'private, max-age=60',
		'x-robots-tag': 'noindex, nofollow'
	});
}

/**
 * `<app>/<version>/<path>` out of a URL, WITHOUT KNOWING WHAT IT IS MOUNTED
 * UNDER, and that independence is the whole point of writing it this way.
 *
 * THE OBVIOUS VERSION WAS WRONG AND WAS WRONG SILENTLY. Anchoring on the
 * literal `/functions/v1/foundry-serve` looks right, reads right, and refused
 * every request on the local stack: the edge runtime strips its own mount
 * before the function sees the URL, so `url.pathname` is
 * `/foundry-serve/<app>/<version>/`. The symptom was a bodyless 404 -- exactly
 * the refusal every real failure produces -- from a function that was
 * otherwise entirely correct. Hosted Supabase, a custom domain and any future
 * rewrite are each free to present a different prefix again.
 *
 * SO THE RULE NAMES NO PREFIX. Walk the segments and take the FIRST place two
 * uuids sit next to each other; the app is the first, the version is the
 * second, and the bundle path is everything after. Nothing before that pair is
 * read at all, so it does not matter whether it is empty, `/functions/v1`,
 * `/functions/v1/foundry-serve`, or something a proxy invented.
 *
 * IT IS NOT A LOOSER CHECK THAN THE PREFIX WAS. Two uuids is 244 bits of
 * shape, and the pair is then put to the database, which decides whether they
 * name a version of an app that may be served. A URL that reaches this with
 * the right shape and the wrong ids gets the same 404 as one that reaches it
 * with no shape at all.
 */
function parse(
	pathname: string
): { appId: string; versionId: string; path: string; bare: boolean } | null {
	const segments = pathname.split('/').filter((seg) => seg.length > 0);
	for (let i = 0; i + 1 < segments.length; i++) {
		if (!UUID.test(segments[i]) || !UUID.test(segments[i + 1])) continue;
		const path = segments.slice(i + 2).join('/');
		return {
			appId: segments[i],
			versionId: segments[i + 1],
			// An empty tail is the bundle ROOT, which means the entry file.
			path: path === '' ? FOUNDRY_ENTRY_FILE : path,
			// `bare` says the entry was DERIVED rather than asked for, which is
			// the only case the trailing-slash redirect may fire on. Measured the
			// hard way: keying the redirect on `path === FOUNDRY_ENTRY_FILE`
			// instead sent an explicit request for `.../index.html` to
			// `.../index.html/`, so every bundle that links its own entry by name
			// bounced into a 404.
			bare: path === ''
		};
	}
	return null;
}

/**
 * THE TRAILING SLASH MATTERS MORE THAN IT LOOKS, AND THE `Location` IS
 * RELATIVE ON PURPOSE.
 *
 * `.../<version>` has `.../<app>/` as its base URL, so every relative asset in
 * every bundle resolves one level too high and 404s -- an app that renders
 * unstyled and scriptless, which reads as a bad upload rather than as a bad
 * URL. `foundryBundleUrl` only ever produces the slash form; this redirects the
 * other one rather than trusting that nothing ever generates it. There is no
 * token here whose validity a redirect could leak, which is why it is a 307
 * and not a refusal.
 *
 * A RELATIVE `Location` IS WHAT KEEPS IT CORRECT BEHIND A PROXY. `Response
 * .redirect` demands an absolute URL, and the only absolute URL this isolate
 * can build is its own internal one -- measured, it produced
 * `http://127.0.0.1:8081/...`, an address no browser can reach. `Location` may
 * be a relative reference, which the browser resolves against the URL it
 * actually asked for, so the answer is right without this function knowing
 * anything about where it is mounted.
 */
function trailingSlashRedirect(versionId: string, search: string): Response {
	return new Response(null, {
		status: 307,
		headers: { location: `${versionId}/${search}`, 'cache-control': 'no-store' }
	});
}

Deno.serve(async (req: Request): Promise<Response> => {
	if (req.method !== 'GET' && req.method !== 'HEAD') return notFound();

	const url = new URL(req.url);
	const bundleOrigin = publicOrigin(req, url);
	const appOrigin = Deno.env.get('FOUNDRY_APP_ORIGIN') ?? '';

	const parsed = parse(url.pathname);
	if (!parsed) return notFound();
	const { appId, versionId, path } = parsed;

	if (parsed.bare && !url.pathname.endsWith('/')) {
		return trailingSlashRedirect(versionId, url.search);
	}

	// Applied BEFORE the row lookup, so a traversal attempt never becomes a
	// query. It is a second independent refusal: the allowlist below would
	// catch it too, and this means the function does not depend on the ingest
	// function and the CHECK constraint both having been right.
	if (!bundlePathOk(path)) return notFound();

	const supabaseUrl = Deno.env.get('SUPABASE_URL');
	const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
	if (!supabaseUrl || !serviceKey) return notFound();
	const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

	const { data: version, error: versionErr } = await admin
		.from('student_app_versions')
		.select('id, app_id, status')
		.eq('id', versionId)
		.maybeSingle<{ id: string; app_id: string; status: string }>();
	if (versionErr || !version || version.app_id !== appId) return notFound();

	const { data: app, error: appErr } = await admin
		.from('student_apps')
		.select('id, published_version_id, hidden_at')
		.eq('id', appId)
		.maybeSingle<{ id: string; published_version_id: string | null; hidden_at: string | null }>();
	if (appErr || !app || app.hidden_at !== null) return notFound();

	// THE PUBLICATION GATE. See the header for why `submitted` is on it.
	const live = app.published_version_id === version.id || version.status === 'submitted';
	if (!live) return notFound();

	// THE ALLOWLIST. An object sitting in the bucket with no row here is
	// unreachable, and a path with no row is a 404 rather than a download.
	const { data: file, error: fileErr } = await admin
		.from('student_app_files')
		.select('path, content_type')
		.eq('version_id', versionId)
		.eq('path', path)
		.maybeSingle<{ path: string; content_type: string | null }>();
	if (fileErr || !file) return notFound();

	const contentType = servableFoundryType(file.content_type);

	const { data: blob, error: dlErr } = await admin.storage
		.from(BUNDLE_BUCKET)
		.download(`${appId}/${versionId}/${path}`);
	if (dlErr || !blob) return notFound();

	const headers = headersFor(contentType, bundleOrigin, appOrigin);

	/*
	 * THE STORAGE SHIM IS INJECTED INTO HTML, AND IT IS ALSO IN THE CONTRACT.
	 *
	 * A document on an opaque origin has no storage area and the
	 * `localStorage` GETTER THROWS, so the first line of a generated app that
	 * reads saved state takes the whole page down before anything renders.
	 * That shape -- read saved state at the top of the script -- is the single
	 * most common thing an AI tool writes.
	 *
	 * BOTH COPIES ARE DELIBERATE AND THEY ARE ONE STRING. The contract's copy
	 * is what makes the app behave the same when a student opens `index.html`
	 * off their own filesystem, which the contract tells them to do before
	 * uploading; this copy is what rescues every app that ignored it, which is
	 * most of them, and every app already published. Running twice is harmless
	 * -- both run before any student code and the second simply replaces an
	 * empty store with an empty store.
	 *
	 * IT IS INSERTED, NOT REWRITTEN IN. The tag goes in as the first element
	 * inside `<head>` and nothing else in the document is touched.
	 * Parse-and-reserialize would mangle bundles in ways nobody asked for.
	 */
	if (req.method === 'HEAD') return new Response(null, { headers });

	if (contentType.startsWith('text/html')) {
		const injected = injectStorageShim(await blob.text());
		const bytes = new TextEncoder().encode(injected);
		headers.set('content-length', String(bytes.byteLength));
		return new Response(bytes, { headers });
	}

	return new Response(blob.stream(), { headers });
});
