import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	FOUNDRY_BUNDLE_BUCKET,
	foundryBundleUrl
} from '../src/lib/foundry/bundle-url.ts';
import { FOUNDRY_ENTRY_FILE } from '../src/lib/foundry/preflight.ts';

/**
 * WHERE A BUNDLE IS SERVED FROM, AND THE PROOF THAT THE OLD ANSWER IS GONE.
 *
 * The token proxy never once served a bundle in production. It is removed
 * rather than fixed, and `foundry-bundles` is a public bucket (0135) whose
 * object URL is the frame src. Two things are worth a test here and neither
 * fails visibly:
 *
 *   1. THE URL SHAPE, because it is assembled in one place and consumed by an
 *      `iframe src`. A wrong segment order or a missing bucket name produces a
 *      404 from Supabase, which is indistinguishable from an app that was
 *      never ingested.
 *
 *   2. THE REMOVAL, because a dormant copy of the proxy is exactly the failure
 *      the repo's own rule about retired paths names -- a second way in is a
 *      second thing to keep authorized. A file left behind here would not
 *      break anything today and would be found by nobody.
 */

const REPO = path.resolve(import.meta.dirname, '..');
const ORIGIN = 'https://example-ref.supabase.co';
const APP = '11111111-1111-4111-8111-111111111111';
const VERSION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

describe('the frame src is the Storage object URL', () => {
	it('assembles origin, bucket, app, version and entry in that order', () => {
		expect(foundryBundleUrl(ORIGIN, APP, VERSION)).toBe(
			`${ORIGIN}/storage/v1/object/public/${FOUNDRY_BUNDLE_BUCKET}/${APP}/${VERSION}/${FOUNDRY_ENTRY_FILE}`
		);
	});

	/**
	 * THE PREFIX HAS TO MATCH WHAT INGEST WROTE, and ingest writes
	 * `<app id>/<version id>/<path>` into this bucket. Asserted against the
	 * FUNCTION'S OWN SOURCE rather than against a second copy of the rule
	 * here, because the two live in different runtimes and nothing type-checks
	 * across that boundary.
	 */
	it('uses the prefix the ingest function actually writes', () => {
		const src = fs.readFileSync(
			path.join(REPO, 'supabase/functions/foundry-ingest/index.ts'),
			'utf8'
		);
		expect(src).toContain("const BUNDLE_BUCKET = '" + FOUNDRY_BUNDLE_BUCKET + "'");
		expect(src).toContain('const prefix = `${app.id}/${version.id}`');
		expect(src).toContain('.upload(`${prefix}/${file.path}`');
	});

	it('trims a trailing slash on the origin rather than doubling it', () => {
		expect(foundryBundleUrl(`${ORIGIN}/`, APP, VERSION)).toBe(
			foundryBundleUrl(ORIGIN, APP, VERSION)
		);
		expect(foundryBundleUrl(ORIGIN, APP, VERSION)).not.toContain('//storage');
	});

	it('carries a nested entry through with its slashes intact', () => {
		expect(foundryBundleUrl(ORIGIN, APP, VERSION, 'sub/dir/page.html')).toBe(
			`${ORIGIN}/storage/v1/object/public/${FOUNDRY_BUNDLE_BUCKET}/${APP}/${VERSION}/sub/dir/page.html`
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
		expect(foundryBundleUrl(ORIGIN, APP, VERSION, '')).toBeNull();
		// POSITIVE CONTROL: the same arguments with everything present do
		// answer, so the five nulls above are the guards and not a broken call.
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
			'foundry-serve',
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
