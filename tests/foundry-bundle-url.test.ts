import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	FOUNDRY_BUNDLE_BUCKET,
	FOUNDRY_SERVE_FUNCTION,
	foundryBundleUrl
} from '../src/lib/foundry/bundle-url.ts';
import { injectStorageShim, FOUNDRY_STORAGE_SHIM_TAG } from '../src/lib/foundry/storage-shim.ts';
import { servableFoundryType } from '../src/lib/foundry/preflight.ts';

/**
 * WHERE A BUNDLE IS SERVED FROM, AND THE PROOF THAT THE OLD ANSWER IS GONE.
 *
 * The token proxy on `apps.ideabosco.com` never once served a bundle in
 * production. It is removed rather than fixed, and a Supabase Edge Function
 * (`supabase/functions/foundry-serve`) serves the bytes instead. Three things
 * are worth a test here and none of them fails visibly:
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
 */

const REPO = path.resolve(import.meta.dirname, '..');
const ORIGIN = 'https://example-ref.supabase.co';
const MOUNT = `${ORIGIN}/functions/v1/${FOUNDRY_SERVE_FUNCTION}`;
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
	it('agrees with the prefix ingest writes and the one foundry-serve reads', () => {
		const ingest = fs.readFileSync(
			path.join(REPO, 'supabase/functions/foundry-ingest/index.ts'),
			'utf8'
		);
		expect(ingest).toContain("const BUNDLE_BUCKET = '" + FOUNDRY_BUNDLE_BUCKET + "'");
		expect(ingest).toContain('const prefix = `${app.id}/${version.id}`');
		expect(ingest).toContain('.upload(`${prefix}/${file.path}`');

		const serve = fs.readFileSync(
			path.join(REPO, `supabase/functions/${FOUNDRY_SERVE_FUNCTION}/index.ts`),
			'utf8'
		);
		expect(serve).toContain("const BUNDLE_BUCKET = '" + FOUNDRY_BUNDLE_BUCKET + "'");
		expect(serve).toContain('.download(`${appId}/${versionId}/${path}`)');
	});

	/**
	 * THE FUNCTION MUST NOT KNOW WHERE IT IS MOUNTED, and this is the assertion
	 * that keeps it that way.
	 *
	 * The first version anchored on the literal `/functions/v1/foundry-serve`
	 * and refused every single request: the edge runtime strips its own mount,
	 * so the isolate sees `/foundry-serve/<app>/<version>/`. It failed as the
	 * same bodyless 404 a real refusal produces, from a function that was
	 * otherwise entirely correct -- which is exactly the shape of bug that ate
	 * five lanes of this feature's life. Hosted Supabase, a custom domain and
	 * any future rewrite are each free to present a different prefix again, so
	 * the rule names no prefix and this refuses to let one back in.
	 */
	it('hardcodes no mount prefix anywhere in the serving function', () => {
		const serve = fs.readFileSync(
			path.join(REPO, `supabase/functions/${FOUNDRY_SERVE_FUNCTION}/index.ts`),
			'utf8'
		);
		// Only the explanation of why the prefix is not read may mention it, and
		// an explanation is a comment. Strip the comments and nothing is left.
		const code = serve.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
		expect(code).not.toContain('/functions/v1');
		// POSITIVE CONTROL: the comment stripper left the code behind. Without
		// this, a stripper that ate the file would report a clean result.
		expect(code).toContain('Deno.serve');
		expect(code).toContain('function parse(');
	});

	/**
	 * AND IT MUST BE CALLABLE WITHOUT A JWT, because an `iframe src` carries no
	 * Authorization header and no apikey. Removing this line would make every
	 * launch 401 with nothing in the app to explain it -- the function would be
	 * deployed, correct, and unreachable.
	 *
	 * `foundry-ingest` must NOT have it: its whole first act is establishing
	 * which student is calling. Both directions, so the config cannot be read
	 * as "Foundry functions are open".
	 */
	it('declares verify_jwt = false for the serving function and not for ingest', () => {
		const toml = fs.readFileSync(path.join(REPO, 'supabase/config.toml'), 'utf8');
		expect(toml).toContain(`[functions.${FOUNDRY_SERVE_FUNCTION}]`);

		const block = toml.slice(toml.indexOf(`[functions.${FOUNDRY_SERVE_FUNCTION}]`));
		const body = block.slice(0, block.indexOf('\n[', 1));
		expect(body).toMatch(/^verify_jwt\s*=\s*false$/m);

		expect(toml).not.toContain('[functions.foundry-ingest]');
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

	it('holds no token, no expiry and no second host', () => {
		const url = foundryBundleUrl(ORIGIN, APP, VERSION)!;
		expect(url.startsWith(ORIGIN + '/')).toBe(true);
		expect(url).not.toContain('/r/');
		expect(url).not.toContain('token');
		expect(url).not.toContain('ideabosco');
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
		'scripts/foundry-edge-routes.mjs'
	];

	it('has removed every file and directory the proxy owned', () => {
		const survivors = GONE.filter((rel) => fs.existsSync(path.join(REPO, rel)));
		expect(survivors).toEqual([]);
		// POSITIVE CONTROL: the sweep is looking in the right place. Without
		// this, a wrong REPO root would report a clean removal of everything.
		expect(fs.existsSync(path.join(REPO, 'src/lib/foundry/bundle-url.ts'))).toBe(true);
		expect(fs.existsSync(path.join(REPO, 'supabase/functions/foundry-serve/index.ts'))).toBe(true);
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
			'foundry-edge-routes'
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
