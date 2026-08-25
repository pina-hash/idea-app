import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	FOUNDRY_BUNDLE_BUCKET,
	FOUNDRY_BUNDLE_PREFIX,
	foundryBundleUrl
} from '../src/lib/foundry/bundle-url.ts';
import {
	FOUNDRY_SANDBOX_FLAGS,
	foundryBundleCsp
} from '../src/lib/foundry/bundle-headers.ts';
import { injectStorageShim, FOUNDRY_STORAGE_SHIM_TAG } from '../src/lib/foundry/storage-shim.ts';
import { servableFoundryType } from '../src/lib/foundry/preflight.ts';

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
 */

const REPO = path.resolve(import.meta.dirname, '..');
const ORIGIN = 'https://apps.ideabosco.com';
const MOUNT = `${ORIGIN}${FOUNDRY_BUNDLE_PREFIX}`.replace(/\/$/, '');
const ROUTE_FILE = 'src/routes/b/[appId]/[versionId]/[...path]/+server.ts';
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
	it('opts the serving route out of SvelteKit trailing-slash normalization', () => {
		const route = fs.readFileSync(path.join(REPO, ROUTE_FILE), 'utf8');
		expect(route).toMatch(/export const trailingSlash = 'ignore';/);
		// And it still redirects the bare, slashless root itself.
		expect(route).toContain('trailingSlashRedirect');
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
		// The document either side of the insertion point is untouched.
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
			'<html>' + FOUNDRY_STORAGE_SHIM_TAG + '<body>hi</body></html>'
		);
		expect(injectStorageShim('<!doctype html><p>hi').indexOf('<!doctype html>')).toBe(0);
		expect(injectStorageShim('<p>hi')).toBe(FOUNDRY_STORAGE_SHIM_TAG + '<p>hi');
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
describe('the sandbox is one string, and the CSP names the bundle origin', () => {
	/**
	 * THE FRAME ATTRIBUTE AND THE CSP DIRECTIVE MUST CARRY THE SAME FLAGS, and
	 * they are consumed in different files by different things -- an HTML
	 * attribute and a response header. That is the shape that drifts. It used to
	 * be two literals in two runtimes with nothing able to compare them.
	 */
	it('is read from one constant by the frame and by the policy', () => {
		const frame = fs.readFileSync(path.join(REPO, 'src/lib/foundry/AppFrame.svelte'), 'utf8');
		expect(frame).toContain('sandbox={FOUNDRY_SANDBOX_FLAGS}');
		expect(frame).toContain("from './bundle-headers.ts'");
		// The attribute is not spelled out a second time anywhere in that file.
		expect(frame).not.toContain('sandbox="allow-');

		expect(foundryBundleCsp('https://apps.example.com', '')).toContain(
			`sandbox ${FOUNDRY_SANDBOX_FLAGS}`
		);
	});

	/**
	 * `allow-same-origin` WITH `allow-scripts` CANCELS THE SANDBOX OUTRIGHT -- a
	 * document given both reaches its own origin, strips the attribute off
	 * itself in the parent and reloads unsandboxed. Asserted on the constant
	 * itself so it cannot be added in either consumer.
	 */
	it('never grants allow-same-origin', () => {
		expect(FOUNDRY_SANDBOX_FLAGS).not.toContain('allow-same-origin');
		expect(foundryBundleCsp('https://apps.example.com', 'https://example.com')).not.toContain(
			'allow-same-origin'
		);
		// POSITIVE CONTROL: the flags string is non-empty and does grant scripts,
		// so the two absences above are real rather than an empty comparison.
		expect(FOUNDRY_SANDBOX_FLAGS).toContain('allow-scripts');
	});

	/**
	 * `'self'` IS NOT A USABLE SOURCE FOR A SANDBOXED DOCUMENT. It is the only
	 * origin-relative source expression and an opaque origin is same-origin with
	 * nothing, so every source list has to NAME the bundle origin literally. A
	 * policy that used `'self'` would refuse the bundle's own stylesheet, which
	 * looks exactly like a bad upload.
	 */
	it('names the bundle origin literally and never uses self', () => {
		const csp = foundryBundleCsp('https://apps.example.com', '');
		expect(csp).not.toContain("'self'");
		for (const directive of ['default-src', 'script-src', 'style-src', 'img-src', 'font-src']) {
			const line = csp.split('; ').find((d) => d.startsWith(directive + ' '));
			expect(line, directive).toContain('https://apps.example.com');
		}
	});

	/**
	 * INLINE SCRIPT AND STYLE ARE PERMITTED ON PURPOSE. `default-src` alone
	 * forbids both, which kills the storage shim and essentially every generated
	 * app. And the NETWORK IS OPEN, because the build contract tells students a
	 * CDN works: a policy that refused one would make the contract lie.
	 */
	it('permits inline script and an https CDN', () => {
		const csp = foundryBundleCsp('https://apps.example.com', '');
		expect(csp).toMatch(/script-src [^;]*'unsafe-inline'/);
		expect(csp).toMatch(/style-src [^;]*'unsafe-inline'/);
		for (const directive of ['script-src', 'connect-src', 'img-src', 'font-src']) {
			const line = csp.split('; ').find((d) => d.startsWith(directive + ' '));
			expect(line, directive).toContain('https:');
		}
	});

	/**
	 * `frame-ancestors` IS UNSET-MEANS-UNRESTRICTED. On a feature whose history
	 * is silently serving nothing, a variable whose absence blanks every frame is
	 * the worse failure -- and a framed bundle is sandboxed, holds no session and
	 * reaches nothing of ours.
	 */
	it('omits frame-ancestors when no portal origin is configured', () => {
		expect(foundryBundleCsp('https://apps.example.com', '')).not.toContain('frame-ancestors');
		expect(foundryBundleCsp('https://apps.example.com', 'https://ideabosco.com')).toContain(
			'frame-ancestors https://ideabosco.com'
		);
	});
});
