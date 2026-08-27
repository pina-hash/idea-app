import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	FOUNDRY_BUNDLE_BUCKET,
	FOUNDRY_BUNDLE_PREFIX,
	foundryBundleUrl
} from '../src/lib/foundry/bundle-url.ts';
import {
	FOUNDRY_SANDBOX_BASE_FLAGS,
	foundryBundleCsp,
	foundryPortalOrigin,
	foundryPortalOriginIsFallback,
	foundrySandboxFlags
} from '../src/lib/foundry/bundle-headers.ts';
import {
	injectStorageShim,
	FOUNDRY_STORAGE_SHIM_JS,
	FOUNDRY_STORAGE_SHIM_TAG
} from '../src/lib/foundry/storage-shim.ts';
import {
	FOUNDRY_PLATFORM_ORIGIN,
	servableFoundryType
} from '../src/lib/foundry/preflight.ts';

/**
 * WHERE A BUNDLE IS SERVED FROM, AND THE PROOF THAT THE OLD ANSWERS ARE GONE.
 *
 * There have been three. A TOKEN PROXY on a second Vercel host never once
 * served a bundle in production, and its signed token, its `hooks.server.ts`
 * host branch and its build-step route rewriting are what failed. A SUPABASE
 * EDGE FUNCTION replaced it and deployed correctly, but the hosted gateway
 * rewrites `text/html` to `text/plain` and replaces the function's own CSP
 * with `default-src 'none'; sandbox`, so a bundle rendered as its own source
 * and would have rendered blank even with the type corrected. What serves a
 * bundle now is an ORDINARY SVELTEKIT ROUTE at `/b/<app>/<version>/<path>`, on
 * the apps origin, where we set the headers ourselves.
 *
 * Four things are worth a test here and none of them fails visibly:
 *
 *   1. THE URL SHAPE, because it is assembled in one place and consumed by an
 *      `iframe src`. A wrong segment order or a missing trailing slash
 *      produces a 404, or a bundle whose every relative asset resolves one
 *      level too high -- which looks like a broken app, not a broken URL.
 *
 *   2. THE REMOVAL, because a dormant copy of the proxy is exactly the failure
 *      the repo's own rule about retired paths names -- a second way in is a
 *      second thing to keep authorized. A file left behind here would not
 *      break anything today and would be found by nobody.
 *
 *   3. THE SHIM INJECTION, which is the one piece of the old proxy that came
 *      back, because an opaque origin still has no storage area and reading
 *      `localStorage` there still throws.
 *
 *   4. THE SANDBOX FLAGS BEING ONE STRING. The frame attribute and the CSP
 *      `sandbox` directive have to agree, and they are written in different
 *      files for different consumers -- which is exactly the shape that drifts.
 *      They are a FUNCTION of the two origins now rather than a constant, so
 *      "they agree" is no longer free: it is a claim about two call sites being
 *      handed the same arguments, and both directions of the condition need a
 *      control or the test cannot tell the cases apart.
 */

const REPO = path.resolve(import.meta.dirname, '..');
const ORIGIN = 'https://apps.ideabosco.com';
const MOUNT = `${ORIGIN}${FOUNDRY_BUNDLE_PREFIX}`.replace(/\/$/, '');
const ROUTE_FILE = 'src/routes/b/[appId]/[versionId]/[...path]/+server.ts';
/**
 * THE DIRECT PAGE IS A SECOND MOUNT WITH THE SAME SILENT FAILURE, so the
 * trailing-slash assertion below covers BOTH of them rather than the one that
 * happened to exist first. `/a/<app>` has `/a/` as its base URL exactly as
 * `/b/<app>/<version>` has `/b/<app>/`, and gets an app that loads and looks
 * broken in exactly the same way.
 */
const APP_ROUTE_FILE = 'src/routes/a/[appId]/[...path]/+server.ts';
const APP = '11111111-1111-4111-8111-111111111111';
const VERSION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

describe('the frame src is the serving function URL', () => {
	it('assembles origin, mount, app and version, and ends in a slash', () => {
		expect(foundryBundleUrl(ORIGIN, APP, VERSION)).toBe(`${MOUNT}/${APP}/${VERSION}/`);
	});

	/**
	 * THE TRAILING SLASH IS THE ONE THAT BREAKS QUIETLY. Without it the base URL
	 * of the document is one level up, so `style.css` resolves under the APP
	 * rather than under the VERSION -- every asset 404s and the app renders
	 * unstyled and scriptless, which reads as a bad upload.
	 */
	it('never produces the slashless form', () => {
		const url = foundryBundleUrl(ORIGIN, APP, VERSION)!;
		expect(url.endsWith('/')).toBe(true);
		expect(url.endsWith(VERSION)).toBe(false);
	});

	/**
	 * THE PREFIX HAS TO MATCH WHAT INGEST WROTE, and ingest writes
	 * `<app id>/<version id>/<path>` into the bundle bucket. Asserted against
	 * BOTH FUNCTIONS' OWN SOURCE rather than against a second copy of the rule
	 * here, because the three live in different runtimes and nothing
	 * type-checks across those boundaries.
	 */
	it('agrees with the prefix ingest writes and the one the serving read uses', () => {
		const ingest = fs.readFileSync(
			path.join(REPO, 'supabase/functions/foundry-ingest/index.ts'),
			'utf8'
		);
		expect(ingest).toContain("const BUNDLE_BUCKET = '" + FOUNDRY_BUNDLE_BUCKET + "'");
		expect(ingest).toContain('const prefix = `${app.id}/${version.id}`');
		expect(ingest).toContain('.upload(`${prefix}/${file.path}`');

		const serve = fs.readFileSync(path.join(REPO, 'src/lib/server/foundry-bundle.ts'), 'utf8');
		expect(serve).toContain('.from(FOUNDRY_BUNDLE_BUCKET)');
		expect(serve).toContain('.download(`${appId}/${versionId}/${path}`)');
		// And the constant it names is the one ingest's literal has to match.
		expect(FOUNDRY_BUNDLE_BUCKET).toBe('foundry-bundles');
	});

	/**
	 * BOTH URL FORMS HAVE TO REACH THE HANDLER, AND NEITHER SVELTEKIT DEFAULT
	 * ALLOWS THAT.
	 *
	 * `'never'` (the default) 308s `/b/<app>/<version>/` to the SLASHLESS form,
	 * which is precisely the broken one: `.../<version>` has `.../<app>/` as its
	 * base URL, so every relative asset in every bundle resolves one level too
	 * high and the app renders unstyled and scriptless. `'always'` breaks the
	 * other direction, sending `.../style.css` to `.../style.css/`. Only
	 * `'ignore'` hands both forms to the route, which then issues the one
	 * redirect that is correct.
	 *
	 * This fails SILENTLY and cosmetically -- a bundle that loads and looks
	 * wrong -- so it is worth pinning in the file rather than in a comment.
	 */
	it.each([
		['the frame src', ROUTE_FILE],
		['the direct page', APP_ROUTE_FILE]
	])('opts %s out of SvelteKit trailing-slash normalization', (_label, file) => {
		const route = fs.readFileSync(path.join(REPO, file), 'utf8');
		expect(route).toMatch(/export const trailingSlash = 'ignore';/);
		// And it still issues the bare, slashless root redirect itself. Named by
		// the helper both mounts call rather than by one route's own local
		// function, which is what this asserted while there was only one route.
		expect(route).toContain('foundryRootRedirect');
	});

	/**
	 * THE SUPABASE EDGE FUNCTION IS GONE, CONFIG AND ALL.
	 *
	 * It was deployed and it ran; what defeated it was the hosted gateway, which
	 * no function code can reach. Leaving the directory or its `verify_jwt`
	 * block behind would leave a second, deployable way to serve the same bytes
	 * -- one that demonstrably cannot serve them.
	 */
	it('keeps no foundry-serve function, and ingest still verifies its JWT', () => {
		expect(fs.existsSync(path.join(REPO, 'supabase/functions/foundry-serve'))).toBe(false);
		const toml = fs.readFileSync(path.join(REPO, 'supabase/config.toml'), 'utf8');
		expect(toml).not.toContain('[functions.foundry-serve]');
		expect(toml).not.toContain('[functions.foundry-ingest]');
		// POSITIVE CONTROL: ingest itself is still here, so the sweep above is
		// reading a real config rather than reporting on an empty tree.
		expect(fs.existsSync(path.join(REPO, 'supabase/functions/foundry-ingest/index.ts'))).toBe(
			true
		);
	});

	it('trims a trailing slash on the origin rather than doubling it', () => {
		expect(foundryBundleUrl(`${ORIGIN}/`, APP, VERSION)).toBe(
			foundryBundleUrl(ORIGIN, APP, VERSION)
		);
		expect(foundryBundleUrl(ORIGIN, APP, VERSION)).not.toContain('//functions');
	});

	it('carries a nested path through with its slashes intact', () => {
		expect(foundryBundleUrl(ORIGIN, APP, VERSION, 'sub/dir/page.html')).toBe(
			`${MOUNT}/${APP}/${VERSION}/sub/dir/page.html`
		);
	});

	/**
	 * NULL IS THE MECHANISM. `AppStage` renders no launch control at all when
	 * this answers null, so each of these is a surface that says "this cannot
	 * be started from here" rather than a button that opens about:blank.
	 */
	it('answers null when it has nothing to point at', () => {
		expect(foundryBundleUrl('', APP, VERSION)).toBeNull();
		expect(foundryBundleUrl(undefined, APP, VERSION)).toBeNull();
		expect(foundryBundleUrl(ORIGIN, null, VERSION)).toBeNull();
		expect(foundryBundleUrl(ORIGIN, APP, null)).toBeNull();
		// POSITIVE CONTROL: the same arguments with everything present do
		// answer, so the four nulls above are the guards and not a broken call.
		expect(foundryBundleUrl(ORIGIN, APP, VERSION)).not.toBeNull();
	});

	/**
	 * THE URL CARRIES NO SECRET, WHICH IS WHAT MAKES IT PASTEABLE.
	 *
	 * It names the apps origin now, so "does not contain ideabosco" is no longer
	 * the right assertion and would fail on a correct URL. What still has to
	 * hold is that there is nothing in it a mint produced: no token segment, no
	 * signature, no expiry. That is the RULE the old spelling was standing in
	 * for.
	 */
	it('holds no token, no signature and no expiry', () => {
		const url = foundryBundleUrl(ORIGIN, APP, VERSION)!;
		expect(url.startsWith(ORIGIN + '/')).toBe(true);
		expect(url).toBe(`${ORIGIN}/b/${APP}/${VERSION}/`);
		expect(url).not.toContain('/r/');
		expect(url).not.toContain('token');
		expect(url).not.toContain('sig');
		expect(url).not.toContain('exp');
		expect(url).not.toContain('?');
	});
});

/**
 * THE MIME ALLOWLIST, which is the one header on that response that decides
 * whether a student's bytes are executed as script.
 */
describe('a served type comes from the table, or it is inert', () => {
	it('passes a type the ingest table produces and refuses anything else', () => {
		expect(servableFoundryType('text/html; charset=utf-8')).toBe('text/html; charset=utf-8');
		expect(servableFoundryType('text/javascript; charset=utf-8')).toBe(
			'text/javascript; charset=utf-8'
		);
		expect(servableFoundryType('image/png')).toBe('image/png');

		for (const bad of ['application/x-msdownload', 'text/html', '', null, undefined, 'TEXT/HTML']) {
			expect(servableFoundryType(bad), String(bad)).toBe('application/octet-stream');
		}
	});
});

/**
 * THE SHIM, which is the piece of the old proxy that had to come back.
 */
describe('the storage shim goes in first, and only once per document', () => {
	it('inserts it as the first thing inside <head>', () => {
		const out = injectStorageShim('<!doctype html><html><head><title>x</title></head></html>');
		expect(out.indexOf(FOUNDRY_STORAGE_SHIM_TAG)).toBe(out.indexOf('<head>') + '<head>'.length);
		// The document either side of the insertion point is untouched, and the
		// doctype it already had is not doubled.
		expect(out.replace(FOUNDRY_STORAGE_SHIM_TAG, '')).toBe(
			'<!doctype html><html><head><title>x</title></head></html>'
		);
	});

	it('beats a script that is already the first child of head', () => {
		const out = injectStorageShim('<html><head data-x="1"><script>a()</script></head></html>');
		expect(out.indexOf(FOUNDRY_STORAGE_SHIM_TAG)).toBeLessThan(out.indexOf('<script>a()'));
	});

	it('falls back through <html>, the doctype, and the front of the file', () => {
		expect(injectStorageShim('<html><body>hi</body></html>')).toBe(
			'<!DOCTYPE html><html>' + FOUNDRY_STORAGE_SHIM_TAG + '<body>hi</body></html>'
		);
		expect(injectStorageShim('<!doctype html><p>hi').indexOf('<!doctype html>')).toBe(0);
		expect(injectStorageShim('<p>hi')).toBe(
			'<!DOCTYPE html>' + FOUNDRY_STORAGE_SHIM_TAG + '<p>hi'
		);
	});

	/**
	 * A DOCUMENT WITH NO DOCTYPE RENDERS IN QUIRKS MODE, which is a different
	 * box model and a different `line-height` inheritance -- so a ported page
	 * arrives visibly wrong in a way that reads as a bad upload. A single
	 * hand-written HTML file is exactly the shape that lacks one, and it is a
	 * shape the submit surface takes first-class.
	 *
	 * BOTH DIRECTIONS, because "prepends a doctype" and "never doubles one" are
	 * different failures and a test that only checks the first passes on an
	 * implementation that emits two.
	 */
	it('adds a doctype only to a document that has none', () => {
		// PRESENT: added at the very front, ahead of everything including a
		// shim that landed inside <head>.
		const bare = injectStorageShim('<html><head></head><body>hi</body></html>');
		expect(bare.startsWith('<!DOCTYPE html><html>')).toBe(true);
		expect(bare.match(/<!doctype/gi)).toHaveLength(1);

		// ABSENT: a document that already declares one is left alone -- in any
		// case, and after leading whitespace, which a browser tolerates too.
		// Stripping the shim has to give the input back UNCHANGED, which is a
		// stronger statement than counting doctypes: it also catches one added
		// somewhere other than the front.
		for (const already of [
			'<!doctype html><html><head></head></html>',
			'<!DOCTYPE HTML><html><head></head></html>',
			'\n  <!doctype html>\n<html><head></head></html>'
		]) {
			const out = injectStorageShim(already);
			expect(out.match(/<!doctype/gi), already).toHaveLength(1);
			expect(out.replace(FOUNDRY_STORAGE_SHIM_TAG, ''), already).toBe(already);
		}
	});

	/**
	 * THE INSERT-ONLY PROPERTY IS LOAD-BEARING and the doctype must not have
	 * cost it. Nothing in the document is rewritten, reordered or
	 * reserialized: removing the two inserted strings has to give back the
	 * original bytes exactly.
	 */
	it('inserts and never rewrites, doctype included', () => {
		for (const doc of [
			'<!doctype html><html><head><title>x</title></head><body>\r\n<p a=\'1\'>hi</body></html>',
			'<html><head></head><body>hi</body></html>',
			'<p>hi',
			'  \n<html><body>hi</body></html>'
		]) {
			const out = injectStorageShim(doc);
			const back = out.replace(FOUNDRY_STORAGE_SHIM_TAG, '').replace(/^<!DOCTYPE html>/, '');
			expect(back, doc).toBe(doc);
		}
	});

	/**
	 * THE CONTRACT CARRIES THE SAME STRING, so a student who pasted it and a
	 * student who did not end up with the same behaviour. One source, two
	 * deliveries -- a second copy of the shim text is the copy that drifts.
	 */
	it('is the same string the build contract hands out', async () => {
		const { foundryBuildContract } = await import('../src/lib/foundry/preflight.ts');
		expect(foundryBuildContract()).toContain(FOUNDRY_STORAGE_SHIM_TAG);
	});
});

/**
 * THE PROXY IS DELETED, NOT DORMANT.
 *
 * Every path below existed and served a live role a commit ago. A sweep is the
 * right shape for this rather than a note in a history file: the failure mode
 * of leaving one behind is silence, and someone re-adding a route under `/r`
 * later would have no reason to know it used to mean something.
 */
describe('nothing of the token proxy survives', () => {
	const GONE = [
		'src/routes/r',
		'src/routes/api/foundry/token',
		'src/routes/dev/foundry-proxy',
		'src/lib/foundry/host.ts',
		'src/lib/server/foundry-token.ts',
		'src/lib/server/foundry-serve.ts',
		'scripts/foundry-edge-routes.mjs',
		// AND THE EDGE FUNCTION THAT REPLACED THE PROXY. It deployed and it ran;
		// the hosted gateway rewrote its content type and overrode its CSP, which
		// is not reachable from function code. A dormant copy would be a second
		// deployable path that cannot work.
		'supabase/functions/foundry-serve'
	];

	it('has removed every file and directory the proxy owned', () => {
		const survivors = GONE.filter((rel) => fs.existsSync(path.join(REPO, rel)));
		expect(survivors).toEqual([]);
		// POSITIVE CONTROL: the sweep is looking in the right place. Without
		// this, a wrong REPO root would report a clean removal of everything.
		expect(fs.existsSync(path.join(REPO, 'src/lib/foundry/bundle-url.ts'))).toBe(true);
		expect(fs.existsSync(path.join(REPO, ROUTE_FILE))).toBe(true);
		expect(fs.existsSync(path.join(REPO, APP_ROUTE_FILE))).toBe(true);
	});

	/**
	 * AND NOTHING IMPORTS THEM. A file can be gone while a stale import name
	 * survives in a comment, a config or a build script, which is how a
	 * "removed" path comes back.
	 */
	it('names none of the retired modules or variables anywhere in src, tests or scripts', () => {
		const NAMES = [
			'foundry/host',
			'foundry-token',
			// The RETIRED server module, spelled with its directory: the
			// `foundry-serve` EDGE FUNCTION is live and shares the bare name, so
			// a bare-name sweep would redden on the replacement.
			'server/foundry-serve',
			'mintFoundryToken',
			'verifyFoundryToken',
			'PUBLIC_FOUNDRY_APPS_HOST',
			'PUBLIC_FOUNDRY_APP_ORIGIN',
			'FOUNDRY_TOKEN_SECRET',
			'foundry-edge-routes',
			// THE EDGE FUNCTION'S OWN NAME AND ITS ONE SECRET. `FOUNDRY_APP_ORIGIN`
			// was the Supabase function secret that became `frame-ancestors`; the
			// gateway was replacing that CSP wholesale, so it had never taken
			// effect. The route sets `frame-ancestors` from
			// PUBLIC_FOUNDRY_PORTAL_ORIGIN now, which is a different name on a
			// different platform and does not match this string.
			'FOUNDRY_APP_ORIGIN',
			'functions/v1/foundry-serve'
		];

		const files: string[] = [];
		const walk = (dir: string) => {
			if (!fs.existsSync(dir)) return;
			for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
				const full = path.join(dir, e.name);
				if (e.isDirectory()) {
					walk(full);
				} else if (/\.(ts|js|mjs|svelte|json)$/.test(e.name)) {
					files.push(full);
				}
			}
		};
		walk(path.join(REPO, 'src'));
		walk(path.join(REPO, 'scripts'));
		walk(path.join(REPO, 'supabase/functions'));
		for (const e of fs.readdirSync(path.join(REPO, 'tests'), { withFileTypes: true })) {
			if (e.isFile() && e.name.endsWith('.ts')) files.push(path.join(REPO, 'tests', e.name));
		}

		// POSITIVE CONTROL: the sweep found files at all. A walk that collected
		// nothing would report every name clean.
		expect(files.length).toBeGreaterThan(100);

		const hits: string[] = [];
		for (const file of files) {
			// This test file names all of them on purpose.
			if (path.basename(file) === 'foundry-bundle-url.test.ts') continue;
			const text = fs.readFileSync(file, 'utf8');
			for (const name of NAMES) {
				if (text.includes(name)) hits.push(`${path.relative(REPO, file)}: ${name}`);
			}
		}
		expect(hits).toEqual([]);
	});

	/**
	 * THE BUILD SCRIPT IS PLAIN AGAIN. The edge-routes step existed only to put
	 * every apps-host request through the SvelteKit function, and there is no
	 * apps host. A leftover `node scripts/...` here would fail the Vercel build
	 * rather than fail quietly, but it would fail it on a file nobody expects
	 * to be load-bearing.
	 */
	it('builds with vite alone', () => {
		const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')) as {
			scripts: Record<string, string>;
		};
		expect(pkg.scripts.build).toBe('vite build');
	});
});

/**
 * THE SANDBOX FLAGS AND THE CSP, which are the half of this that the Supabase
 * gateway was silently overriding and that nothing downstream touches now.
 */
/**
 * THE PORTAL ORIGIN IS RESOLVED, NOT READ, AND THAT IS WHAT KEEPS THE GRANT
 * FROM DEPENDING ON A VARIABLE NOBODY HERE CAN SEE.
 *
 * THE FAILURE THIS GUARDS AGAINST IS A SILENT ONE, which is why it is a test
 * rather than a harness pass. `allow-same-origin` is granted only when the
 * portal origin is non-empty, the portal origin used to be
 * `PUBLIC_FOUNDRY_PORTAL_ORIGIN` and nothing else, and that variable's absence
 * is a SUPPORTED configuration -- `frame-ancestors` is deliberately
 * unset-means-unrestricted. So a production deployment that never set it would
 * have withheld the flag, every published app would have kept losing its saved
 * state on reload, and the symptom would have been a feature that looked like
 * it had never worked rather than a variable that was never set.
 *
 * EVERY ASSERTION HERE HAS ITS OPPOSITE BESIDE IT. The two that matter are the
 * two the prompt for this bundle named, and each is a case an implementation
 * that ignored one of its arguments would get wrong in a different direction:
 *
 *   apps origin SET + portal variable UNSET   must GRANT   (the production case,
 *                                                           via the fallback)
 *   apps origin UNSET                         must WITHHOLD (dev and preview,
 *                                                           whatever the portal
 *                                                           variable says)
 *
 * The second is the one with teeth. Dev and preview are where the portal and
 * the bundle genuinely do share an origin, so a fallback applied there would
 * MANUFACTURE the escape the strict rule was written for: a same-origin child
 * with `allow-scripts` and `allow-same-origin` reaches `parent.document`,
 * strips its own sandbox attribute and reloads with full rights.
 */
describe('the portal origin resolves without depending on a Vercel variable', () => {
	const APPS = 'https://apps.example.com';
	const PORTAL = 'https://portal.example.com';

	/**
	 * THE VARIABLE WINS WHEN IT IS SET. An operator who names an origin means
	 * it, and a preview on its own portal host has to be able to say so -- a
	 * resolver that preferred the constant would quietly ignore configuration
	 * somebody deliberately wrote.
	 */
	it('prefers the configured portal origin over the fallback', () => {
		expect(foundryPortalOrigin(APPS, PORTAL)).toBe(PORTAL);
		expect(foundryPortalOriginIsFallback(APPS, PORTAL)).toBe(false);
		// And with no apps origin either: the variable still wins, because the
		// apps origin gates only the FALLBACK and not the configured value.
		expect(foundryPortalOrigin('', PORTAL)).toBe(PORTAL);
		expect(foundryPortalOrigin(undefined, PORTAL)).toBe(PORTAL);
	});

	/**
	 * THE FALLBACK IS THE CANONICAL HOST, AND IT IS THE IMPORTED CONSTANT. A
	 * second literal spelling of `https://ideabosco.com` in this repo is the one
	 * that stops matching when the domain moves, so the assertion reads it from
	 * `preflight.ts` -- the same module the resolver imports -- rather than
	 * writing the string out again.
	 */
	it('falls back to the canonical portal host when the variable is unset', () => {
		for (const unset of ['', '   ', null, undefined]) {
			expect(foundryPortalOrigin(APPS, unset), String(unset)).toBe(FOUNDRY_PLATFORM_ORIGIN);
			expect(foundryPortalOriginIsFallback(APPS, unset), String(unset)).toBe(true);
		}
		// The constant is the real canonical host, not merely some non-empty
		// string the resolver happens to return.
		expect(FOUNDRY_PLATFORM_ORIGIN).toBe('https://ideabosco.com');
	});

	/**
	 * CONTROL ONE, THE PRODUCTION CASE: apps origin set, portal variable unset,
	 * and the flag must be GRANTED. This is the configuration the previous
	 * bundle would have been inert in, and it is asserted all the way through to
	 * the flags and the CSP rather than stopping at the resolver -- a resolver
	 * that returned the right string while nothing downstream used it would pass
	 * a narrower test and change nothing about what a browser receives.
	 */
	it('grants allow-same-origin when the apps origin is set and the portal variable is not', () => {
		const portal = foundryPortalOrigin(APPS, '');
		expect(portal).toBe(FOUNDRY_PLATFORM_ORIGIN);
		expect(foundrySandboxFlags(APPS, portal)).toContain('allow-same-origin');

		const csp = foundryBundleCsp(APPS, portal);
		expect(csp).toContain('allow-same-origin');
		// The other half of the argument: the grant is only safe because the
		// browser refuses any other embedder, and that refusal is emitted here.
		expect(csp).toContain(`frame-ancestors ${FOUNDRY_PLATFORM_ORIGIN}`);
	});

	/**
	 * CONTROL TWO, THE DEV AND PREVIEW CASE: no apps origin, so no fallback and
	 * no grant -- WHATEVER the portal variable says.
	 *
	 * The portal variable is varied across the loop on purpose. An
	 * implementation that gated the fallback on the wrong argument, or that
	 * ignored the apps origin entirely, would still pass a single-case version
	 * of this; the row where the variable IS set and the apps origin is not is
	 * the one that separates "the fallback is gated" from "the fallback does not
	 * exist".
	 */
	it('withholds the fallback entirely when the apps origin is unset', () => {
		for (const appsUnset of ['', '   ', null, undefined]) {
			// No portal variable either: nothing to fall back to and nothing
			// configured, so the strict set and no frame-ancestors.
			expect(foundryPortalOrigin(appsUnset, ''), String(appsUnset)).toBe('');
			expect(foundryPortalOriginIsFallback(appsUnset, ''), String(appsUnset)).toBe(false);
			expect(foundrySandboxFlags(APPS, foundryPortalOrigin(appsUnset, ''))).not.toContain(
				'allow-same-origin'
			);
			expect(foundryBundleCsp(APPS, foundryPortalOrigin(appsUnset, ''))).not.toContain(
				'frame-ancestors'
			);

			// A portal variable that IS set is still honoured -- the apps origin
			// gates the fallback, never the configured value -- and that is a
			// different sentence from "the apps origin is ignored".
			expect(foundryPortalOrigin(appsUnset, PORTAL), String(appsUnset)).toBe(PORTAL);
			expect(foundryPortalOriginIsFallback(appsUnset, PORTAL), String(appsUnset)).toBe(false);
		}
	});

	/**
	 * THE DEV DEFAULT, END TO END. With neither variable set -- which is exactly
	 * `npm run dev` and an unconfigured preview -- a bundle framed by a portal on
	 * the SAME origin gets the strict set, which is the case the escape is real
	 * in. Asserted on the origins a dev server actually produces rather than on
	 * the empty string, so it is a statement about the deployment and not about
	 * a sentinel.
	 */
	it('leaves a same-origin dev deployment on the strict set', () => {
		const LOCAL = 'http://localhost:5173';
		const portal = foundryPortalOrigin('', '');
		expect(portal).toBe('');
		expect(foundrySandboxFlags(LOCAL, portal)).toBe(FOUNDRY_SANDBOX_BASE_FLAGS);
		expect(foundryBundleCsp(LOCAL, portal)).not.toContain('allow-same-origin');
	});

	/**
	 * NORMALIZATION IS THE RESOLVER'S TOO, not just the flag function's. A
	 * trailing slash on either variable is a spelling, and a resolver that
	 * passed one through would hand `foundrySandboxFlags` two strings that
	 * differ only by that slash -- which the flag function normalizes anyway, so
	 * the bug would be invisible there and visible only in the admin line, where
	 * it would report an origin nobody configured.
	 */
	it('normalizes what it returns, so one origin has one spelling', () => {
		expect(foundryPortalOrigin(APPS, `${PORTAL}/`)).toBe(PORTAL);
		expect(foundryPortalOrigin(APPS, `  ${PORTAL}  `)).toBe(PORTAL);
		// A whitespace-only apps origin is unset, not a configured origin, so it
		// licenses no fallback.
		expect(foundryPortalOrigin('   ', '')).toBe('');
		// A trailing slash on the APPS origin still licenses the fallback: it is
		// a spelling of a configured origin, not the absence of one.
		expect(foundryPortalOrigin(`${APPS}/`, '')).toBe(FOUNDRY_PLATFORM_ORIGIN);
	});

	/**
	 * BOTH READERS CALL THE RESOLVER, which is what makes the frame attribute
	 * and the CSP directive one answer rather than two that happen to agree. The
	 * responder is asserted by source because its env read cannot be exercised
	 * from a unit test, and the frame likewise -- the point is that NEITHER of
	 * them reads `PUBLIC_FOUNDRY_PORTAL_ORIGIN` straight into the flags any more,
	 * which is precisely the shape that made the previous bundle inert.
	 */
	it('is reached by the responder and the frame, neither reading the variable raw', () => {
		const REPO = path.resolve(__dirname, '..');
		const responder = fs.readFileSync(
			path.join(REPO, 'src/lib/server/foundry-bundle-response.ts'),
			'utf8'
		);
		const frame = fs.readFileSync(path.join(REPO, 'src/lib/foundry/AppFrame.svelte'), 'utf8');

		for (const [name, source] of [
			['responder', responder],
			['frame', frame]
		] as const) {
			expect(source, name).toContain('foundryPortalOrigin(');
			// The apps origin is what gates the fallback, so both callers have to
			// be handing it over. A call with one argument would type-error, but
			// a call passing the WRONG variable twice would not.
			expect(source, name).toContain('env.PUBLIC_FOUNDRY_APPS_ORIGIN');
			expect(source, name).toContain('env.PUBLIC_FOUNDRY_PORTAL_ORIGIN');
		}

		// NEGATIVE: neither one still trims the portal variable into a local of
		// its own, which is what the raw read looked like in both files.
		for (const [name, source] of [
			['responder', responder],
			['frame', frame]
		] as const) {
			expect(source, name).not.toMatch(
				/PUBLIC_FOUNDRY_PORTAL_ORIGIN\s*\?\?\s*''\s*\)?\s*\n?\s*\.trim\(\)/
			);
			expect(source, name).not.toContain("foundrySandboxFlags(originOf(src), env.");
		}
	});
});

describe('the sandbox is one function, and the CSP names the bundle origin', () => {
	const APPS = 'https://apps.example.com';
	const PORTAL = 'https://portal.example.com';

	/**
	 * THE FLAG LIST IS WRITTEN OUT HERE, IN THE TEST, rather than read out of
	 * the module: a check derived from the implementation's own string cannot
	 * fail. Adding a flag to the shipped set is meant to redden this line, so
	 * that granting one is a decision somebody wrote down twice.
	 */
	const STRICT = [
		'allow-downloads',
		'allow-forms',
		'allow-modals',
		'allow-orientation-lock',
		'allow-pointer-lock',
		'allow-popups',
		'allow-scripts'
	];
	const CROSS = [...STRICT, 'allow-same-origin'].sort();

	const flagsOf = (s: string) => s.split(/\s+/).filter(Boolean).sort();
	const sandboxDirectiveOf = (csp: string) =>
		csp
			.split('; ')
			.find((d) => d.startsWith('sandbox '))!
			.slice('sandbox '.length);

	/**
	 * THE FRAME ATTRIBUTE AND THE CSP DIRECTIVE MUST CARRY THE SAME FLAGS, and
	 * they are consumed in different files by different things -- an HTML
	 * attribute and a response header. That is the shape that drifts. It used to
	 * be two literals in two runtimes with nothing able to compare them; it is
	 * one FUNCTION with two callers now, which is the same guarantee provided
	 * both callers hand it the same two origins.
	 *
	 * SO THE PROOF IS IN TWO HALVES. This asserts the frame reaches the shared
	 * function rather than spelling anything out, and that the directive is
	 * built from the same call. `tests/foundry-gallery.test.ts` asserts the
	 * other half -- that the string the REAL component renders equals the one
	 * the CSP carries, for the same origins.
	 */
	it('is read from one function by the frame and by the policy', () => {
		const frame = fs.readFileSync(path.join(REPO, 'src/lib/foundry/AppFrame.svelte'), 'utf8');
		expect(frame).toContain("from './bundle-headers.ts'");
		expect(frame).toContain('foundrySandboxFlags(originOf(src)');
		expect(frame).toContain('sandbox={sandboxFlags}');
		// The attribute is not spelled out a second time anywhere in that file.
		expect(frame).not.toContain('sandbox="allow-');

		// AND THE DIRECTIVE IS THE FUNCTION'S OWN ANSWER, in both directions of
		// the condition -- asserted on the pair rather than on one case, since a
		// policy that hardcoded the strict list would satisfy the second alone.
		for (const [bundle, portal] of [
			[APPS, PORTAL],
			[APPS, APPS],
			[APPS, ''],
			['', '']
		]) {
			expect(foundryBundleCsp(bundle, portal), `${bundle} / ${portal}`).toContain(
				`sandbox ${foundrySandboxFlags(bundle, portal)}`
			);
		}
	});

	/**
	 * `allow-same-origin` IS THE ONE CONDITIONAL FLAG, AND THE CONDITION IS THE
	 * WHOLE POINT.
	 *
	 * With `allow-scripts` it lets a framed document reach into the PARENT
	 * document, strip the sandbox attribute off its own `<iframe>` element and
	 * reload unsandboxed -- but only when the child is same-origin with that
	 * parent, because `parent.document` throws otherwise. A bundle is served
	 * from the apps origin and framed by the portal origin, which differ.
	 *
	 * THE NEGATIVE CONTROL IS WHAT MAKES THIS A TEST. The flag has to be ABSENT
	 * whenever the function cannot prove the two origins differ -- equal, or
	 * either one missing -- and PRESENT when they do. A single assertion in
	 * either direction passes on an implementation that ignores its arguments,
	 * which is exactly the bug worth catching.
	 */
	it('withholds allow-same-origin unless the two origins differ', () => {
		// NEGATIVE: equal, and either side empty.
		for (const [bundle, portal] of [
			[APPS, APPS],
			[APPS, ''],
			['', PORTAL],
			['', ''],
			// Normalized before comparing, so one trailing slash is not a second
			// origin -- the one shape that would silently grant the flag to a
			// deployment whose two variables name the same host.
			[APPS, `${APPS}/`],
			[`${APPS}/`, APPS]
		]) {
			expect(flagsOf(foundrySandboxFlags(bundle, portal)), `${bundle} / ${portal}`).toEqual(
				STRICT
			);
			expect(foundryBundleCsp(bundle, portal), `${bundle} / ${portal}`).not.toContain(
				'allow-same-origin'
			);
		}

		// POSITIVE: two real, different origins. Without this the absences above
		// would pass on a function that never grants the flag at all.
		expect(flagsOf(foundrySandboxFlags(APPS, PORTAL))).toEqual(CROSS);
		expect(sandboxDirectiveOf(foundryBundleCsp(APPS, PORTAL))).toContain('allow-same-origin');
		// And the trailing-slash normalization does not swallow a REAL pair.
		expect(flagsOf(foundrySandboxFlags(`${APPS}/`, `${PORTAL}/`))).toEqual(CROSS);
	});

	/**
	 * THE GRANT AND `frame-ancestors` ARE TWO HALVES OF ONE ARGUMENT, so the
	 * link between them is worth pinning rather than leaving in a comment.
	 *
	 * The flag is only safe because the browser refuses to let anything other
	 * than the portal origin embed a bundle -- and that refusal is
	 * `frame-ancestors`, which is emitted exactly when a portal origin is
	 * configured. A policy that granted the flag while leaving the frame
	 * ancestry unrestricted would be one where any site could frame a bundle
	 * and, by serving its own page on the apps origin, be same-origin with it.
	 */
	it('never grants allow-same-origin without pinning frame-ancestors', () => {
		for (const [bundle, portal] of [
			[APPS, PORTAL],
			[APPS, APPS],
			[APPS, ''],
			['', '']
		]) {
			const csp = foundryBundleCsp(bundle, portal);
			if (csp.includes('allow-same-origin')) {
				expect(csp, `${bundle} / ${portal}`).toContain(`frame-ancestors ${portal}`);
				expect(portal).not.toBe(bundle);
			}
		}
		// POSITIVE CONTROL: one of those cases really does grant it, so the
		// implication above is not vacuously true over four non-grants.
		expect(foundryBundleCsp(APPS, PORTAL)).toContain('allow-same-origin');
	});

	/**
	 * TWO FLAGS ARE REFUSED IN EVERY CONFIGURATION, because neither is about
	 * what a bundle may do to itself. `allow-top-navigation` lets a student's
	 * app replace the page the viewer is actually on;
	 * `allow-popups-to-escape-sandbox` hands a popup full rights on any origin
	 * it likes. `allow-popups` is granted, which is what makes the second one
	 * worth asserting separately rather than assuming.
	 */
	it('never grants top navigation or an escaping popup, in any configuration', () => {
		for (const [bundle, portal] of [
			[APPS, PORTAL],
			[APPS, APPS],
			[APPS, ''],
			['', PORTAL],
			['', '']
		]) {
			const flags = foundrySandboxFlags(bundle, portal);
			const csp = foundryBundleCsp(bundle, portal);
			for (const banned of ['allow-top-navigation', 'allow-popups-to-escape-sandbox']) {
				expect(flags, `${banned} in ${bundle} / ${portal}`).not.toContain(banned);
				expect(csp, `${banned} in ${bundle} / ${portal}`).not.toContain(banned);
			}
		}
		// POSITIVE CONTROL: `allow-popups` IS granted, so the two absences above
		// are not a substring accident of a set that grants no popup at all.
		expect(foundrySandboxFlags(APPS, PORTAL)).toContain('allow-popups');
	});

	/**
	 * `'self'` IS NOT A USABLE SOURCE FOR A SANDBOXED DOCUMENT whose origin is
	 * opaque. It is the only origin-relative source expression and an opaque
	 * origin is same-origin with nothing, so every source list has to NAME the
	 * bundle origin literally. A policy that used `'self'` would refuse the
	 * bundle's own stylesheet, which looks exactly like a bad upload.
	 */
	it('names the bundle origin literally and never uses self', () => {
		const csp = foundryBundleCsp(APPS, '');
		expect(csp).not.toContain("'self'");
		for (const directive of [
			'default-src',
			'script-src',
			'style-src',
			'img-src',
			'font-src',
			'worker-src',
			'frame-src',
			'base-uri',
			'form-action'
		]) {
			const line = csp.split('; ').find((d) => d.startsWith(directive + ' '));
			expect(line, directive).toBeTruthy();
			expect(line, directive).toContain(APPS);
		}
	});

	/**
	 * INLINE SCRIPT AND STYLE ARE PERMITTED ON PURPOSE. `default-src` alone
	 * forbids both, which kills the storage shim and essentially every generated
	 * app. And the NETWORK IS OPEN, because the build contract tells students a
	 * CDN works: a policy that refused one would make the contract lie. `wss:`
	 * joins `connect-src` for the same reason one directive over -- a socket is
	 * the one reach `https:` does not cover, and a live-data or multiplayer app
	 * is otherwise refused at the handshake.
	 */
	it('permits inline script, an https CDN and a websocket', () => {
		const csp = foundryBundleCsp(APPS, '');
		expect(csp).toMatch(/script-src [^;]*'unsafe-inline'/);
		expect(csp).toMatch(/style-src [^;]*'unsafe-inline'/);
		for (const directive of ['script-src', 'connect-src', 'img-src', 'font-src']) {
			const line = csp.split('; ').find((d) => d.startsWith(directive + ' '));
			expect(line, directive).toContain('https:');
		}
		const connect = csp.split('; ').find((d) => d.startsWith('connect-src '))!;
		expect(connect).toContain('wss:');
		// NEGATIVE CONTROL: `wss:` belongs to connect-src alone. A scheme swept
		// onto every directive would satisfy the line above and mean nothing.
		expect(csp.split('; ').find((d) => d.startsWith('img-src '))).not.toContain('wss:');
	});

	/**
	 * `base-uri` ADMITS A `<base href>` NOW, AND IT USED TO BE `'none'`.
	 *
	 * A game ported from elsewhere routinely ships as one HTML file with a
	 * `<base href>` pointing at the CDN its assets live on. `base-uri 'none'`
	 * makes the browser ignore that element outright, so every asset request
	 * resolves against the bundle instead and 404s -- the app renders empty,
	 * which reads as a bad upload.
	 *
	 * IT GRANTS NOTHING THE POLICY DID NOT ALREADY ALLOW: `default-src` admits
	 * `https:`, so every URL a `<base>` could point at was already reachable by
	 * writing it out in full. That equivalence is the argument, so it is what is
	 * asserted -- not merely that the directive changed.
	 */
	it('lets a bundle repoint its own relative URLs, within what default-src already allows', () => {
		const csp = foundryBundleCsp(APPS, '');
		expect(csp).not.toContain("base-uri 'none'");
		const base = csp.split('; ').find((d) => d.startsWith('base-uri '))!;
		expect(base).toBe(`base-uri ${APPS} https:`);

		// THE EQUIVALENCE: every source `base-uri` admits is already admitted by
		// `default-src`, so nothing became reachable that was not.
		const fetchable = csp.split('; ').find((d) => d.startsWith('default-src '))!;
		for (const source of base.slice('base-uri '.length).split(/\s+/).filter(Boolean)) {
			expect(fetchable, source).toContain(source);
		}
	});

	/**
	 * `form-action` NAMES THE SAME SET the fetching directives do, because
	 * `allow-forms` is granted and a policy that grants the flag and forbids the
	 * action refuses the thing it just permitted -- a form that submits into a
	 * CSP violation, which is a silent no-op with a console line.
	 */
	it('permits a form to submit, since allow-forms is granted', () => {
		const csp = foundryBundleCsp(APPS, '');
		expect(csp).not.toContain("form-action 'none'");
		expect(csp.split('; ').find((d) => d.startsWith('form-action '))).toBe(
			`form-action ${APPS} https: data: blob:`
		);
		expect(foundrySandboxFlags(APPS, '')).toContain('allow-forms');
	});

	/**
	 * `worker-src` AND `frame-src` ARE STATED rather than left to fall back to
	 * `default-src`. The fallback is a fact about the CSP level in front of
	 * them, not about this policy, and a reader asking whether a bundle may
	 * spawn a worker should find the answer written down.
	 */
	it('states worker-src and frame-src rather than leaving them to default-src', () => {
		const csp = foundryBundleCsp(APPS, '');
		const web = `${APPS} https: data: blob:`;
		expect(csp.split('; ').find((d) => d.startsWith('worker-src '))).toBe(`worker-src ${web}`);
		expect(csp.split('; ').find((d) => d.startsWith('frame-src '))).toBe(`frame-src ${web}`);
	});

	/**
	 * `frame-ancestors` IS UNSET-MEANS-UNRESTRICTED. On a feature whose history
	 * is silently serving nothing, a variable whose absence blanks every frame is
	 * the worse failure -- and a framed bundle holds no session and reaches
	 * nothing of ours. It is load-bearing in a second way now: see the grant
	 * assertion above.
	 */
	it('omits frame-ancestors when no portal origin is configured', () => {
		expect(foundryBundleCsp(APPS, '')).not.toContain('frame-ancestors');
		expect(foundryBundleCsp(APPS, 'https://ideabosco.com')).toContain(
			'frame-ancestors https://ideabosco.com'
		);
	});
});

/**
 * THE SHIM'S OWN DECISION: does it replace a storage that WORKS?
 *
 * WHY THIS IS A TEST AND NOT A HARNESS DRIVE. Getting it wrong is completely
 * invisible: the app runs, `localStorage.setItem` succeeds, `getItem` comes
 * back, and the only symptom is that nothing is there after a reload -- which
 * is exactly what the opaque origin did, so the fix one file over would look
 * like it had shipped while buying nothing at all. Nobody reloads a student
 * game twice while reviewing a diff.
 *
 * IT RUNS THE SHIPPED STRING, not a transcription of it. `new Function` gives
 * the IIFE its `window` and `Window` rather than a browser doing it, which is
 * the only way to hand it a storage that throws on purpose.
 */
describe('the storage shim replaces a broken storage and leaves a working one alone', () => {
	/** A storage that behaves, close enough to the real interface for a probe. */
	function workingStorage() {
		const d = new Map<string, string>();
		return {
			getItem: (k: string) => (d.has(String(k)) ? d.get(String(k))! : null),
			setItem: (k: string, v: string) => void d.set(String(k), String(v)),
			removeItem: (k: string) => void d.delete(String(k)),
			clear: () => d.clear(),
			key: (i: number) => [...d.keys()][i] ?? null,
			get length() {
				return d.size;
			},
			/** Not part of Storage; the test reads it to see what survived. */
			_keys: () => [...d.keys()]
		};
	}

	/** Run the REAL shim source against a window we control. */
	function runShim(win: Record<string, unknown>) {
		const WindowCtor = function () {} as unknown as { prototype: Record<string, unknown> };
		WindowCtor.prototype = {};
		new Function('window', 'Window', FOUNDRY_STORAGE_SHIM_JS)(win, WindowCtor);
		return win;
	}

	it('leaves a storage that round-trips exactly where it was', () => {
		const real = workingStorage();
		real.setItem('highScore', '900');
		const win: Record<string, unknown> = { localStorage: real, sessionStorage: workingStorage() };

		runShim(win);

		// IDENTITY is the assertion. A shim that copied the contents across would
		// satisfy a value check and still lose the next reload.
		expect(win.localStorage).toBe(real);
		expect(real.getItem('highScore')).toBe('900');
		// The probe cleans up after itself; a leftover key is a bundle finding a
		// value in its own storage that no app ever wrote.
		expect(real._keys()).toEqual(['highScore']);
	});

	it('replaces a storage whose getter throws, the way an opaque origin does', () => {
		const win: Record<string, unknown> = {};
		Object.defineProperty(win, 'localStorage', {
			get() {
				throw new Error('SecurityError');
			},
			configurable: true
		});
		Object.defineProperty(win, 'sessionStorage', {
			get() {
				throw new Error('SecurityError');
			},
			configurable: true
		});

		runShim(win);

		// It is now readable at all, which is the whole point -- the getter used
		// to take the document down before anything rendered.
		const shimmed = win.localStorage as Storage;
		expect(() => shimmed.getItem('x')).not.toThrow();
		shimmed.setItem('slot', '1');
		expect(shimmed.getItem('slot')).toBe('1');
		expect(shimmed.getItem('never-written')).toBeNull();
		expect(() => (win.sessionStorage as Storage).setItem('a', 'b')).not.toThrow();
	});

	/**
	 * A STORAGE PRESENT BUT REFUSING TO WRITE is the private-browsing shape:
	 * the API is there, the getter does not throw, and `setItem` raises a quota
	 * error. The probe has to catch that too, because "present" was never the
	 * question -- "works" is.
	 */
	it('replaces a storage that is present but refuses the write', () => {
		const refusing = {
			getItem: () => null,
			setItem: () => {
				throw new Error('QuotaExceededError');
			},
			removeItem: () => {},
			clear: () => {},
			key: () => null,
			length: 0
		};
		const win: Record<string, unknown> = { localStorage: refusing, sessionStorage: refusing };

		runShim(win);

		expect(win.localStorage).not.toBe(refusing);
		(win.localStorage as Storage).setItem('slot', '1');
		expect((win.localStorage as Storage).getItem('slot')).toBe('1');
	});

	it('installs over an API that is absent entirely', () => {
		const win: Record<string, unknown> = {};
		runShim(win);
		expect(win.localStorage).toBeTruthy();
		(win.localStorage as Storage).setItem('slot', '1');
		expect((win.localStorage as Storage).getItem('slot')).toBe('1');
	});

	/**
	 * THE SHIM MUST NEVER BE THE THING THAT THROWS. It is the first script in
	 * the head, so an exception there is a blank page for an app that would
	 * otherwise have run.
	 */
	it('throws nothing, whatever it is handed', () => {
		const hostile: Record<string, unknown>[] = [
			{},
			{ localStorage: null, sessionStorage: undefined },
			{ localStorage: 'not a storage', sessionStorage: 42 },
			{ localStorage: { setItem: 1 }, sessionStorage: Object.create(null) }
		];
		for (const win of hostile) {
			expect(() => runShim(win), JSON.stringify(Object.keys(win))).not.toThrow();
		}
	});
});
