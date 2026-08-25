// tests/foundry-vendor.test.ts
//
// THE HOSTED RUNTIME LIBRARIES, AND THE FOUR WAYS THIS GOES WRONG WITHOUT
// ANYONE SEEING IT.
//
// The rewrite is the only thing in this subsystem that EDITS a student's file.
// Everything else either refuses an upload or lets it through, and both of
// those are visible the moment somebody looks. A bad rewrite is not:
//
//   1. A library in the registry with no file behind it. The preflight
//      cheerfully repoints a script tag at a path that answers 404, the upload
//      PASSES, the note says we fixed it, and the app is blank -- which is the
//      exact failure this whole lane exists to end, reintroduced by the fix
//      for it.
//   2. The wrong library matched. `react-dom` recognised as `react` gives the
//      student a working page with ReactDOM undefined.
//   3. An `import ... from "https://esm.sh/react"` repointed at our UMD build.
//      UMD assigns a global and exports nothing, so the import binds
//      `undefined` and the failure surfaces hundreds of lines away.
//   4. The starter file, or the contract, drifting from the paths actually
//      served. Both are documents the platform HANDS OUT; a stale one is a
//      file we gave a student that we then refuse.
//
// None of the four reddens anything on its own, which is what puts them here
// rather than in a harness.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
	FOUNDRY_PLATFORM_LIBRARIES,
	FOUNDRY_STARTER_PATH,
	PLATFORM_LIB_PREFIX,
	classifyVendorReference,
	identifyCdnReference,
	isPlatformLibraryPath,
	platformLibraryFor,
	platformLibraryPath,
	versionSatisfied
} from '../src/lib/foundry/vendor.ts';
import {
	foundryBuildContract,
	foundryStarterFile,
	scanHtml,
	scanJs,
	type HtmlFacts,
	type HtmlReader
} from '../src/lib/foundry/preflight.ts';

const VENDOR_DIR = 'src/lib/foundry/vendor';
const ROUTE = 'src/routes/_platform/[...asset]/+server.ts';

/* ------------------------------------------------------------------ 1. bytes */

describe('every library in the registry has bytes behind it', () => {
	it('is a real, non-trivial file on disk', () => {
		expect(FOUNDRY_PLATFORM_LIBRARIES.length, 'the registry is not empty').toBeGreaterThan(0);
		for (const lib of FOUNDRY_PLATFORM_LIBRARIES) {
			const file = path.join(VENDOR_DIR, lib.file);
			expect(fs.existsSync(file), `${lib.label} -> ${file}`).toBe(true);
			// A truncated or placeholder file is the same blank app as a missing
			// one. The smallest thing here (React) is 10 KB.
			expect(fs.statSync(file).size, `${lib.file} bytes`).toBeGreaterThan(4096);
		}
	});

	it('is wired into the route that serves it', () => {
		// The route cannot be imported here -- it pulls in `$app/server` and
		// `$env/dynamic/public`, neither of which exists outside SvelteKit. So
		// the agreement is read off the source, which is the fact in question:
		// a library added to the registry and not to `LIB_FILES` is a 404.
		const src = fs.readFileSync(ROUTE, 'utf8');
		for (const lib of FOUNDRY_PLATFORM_LIBRARIES) {
			expect(src, `${lib.file} is a LIB_FILES key`).toContain(`'${lib.file}':`);
			expect(src, `${lib.file} is imported`).toContain(`vendor/${lib.file}?url`);
		}
	});

	it('answers CORS on every platform asset, or none of them load in a bundle', () => {
		/*
		 * MEASURED IN A REAL CHROME, and it is the least obvious thing in this
		 * lane. A bundle runs in an OPAQUE ORIGIN, which is same-origin with
		 * nothing, so a request it makes to its own host is CROSS-origin. Two
		 * very ordinary things are made in CORS mode and so need a header back:
		 * a `<script src>` carrying `crossorigin` -- which React's own published
		 * CDN snippet has, so the generated apps all carry it -- and EVERY
		 * `@font-face` fetch, which has no attribute to leave off.
		 *
		 * Without the header, `react.js` and `react-dom.js` were discarded while
		 * `babel.js` and `lucide.js` (same route, same origin, no `crossorigin`
		 * attribute) loaded fine, and the console read
		 * `ReferenceError: React is not defined`. The platform FONTS were in the
		 * same position and had never worked in a bundle at all.
		 *
		 * A regression here is silent in the worst way -- the upload passes, the
		 * rewrite note says we fixed it, and the app is blank -- and it is one
		 * deleted call away, so it is asserted on the route's source.
		 */
		const src = fs.readFileSync(ROUTE, 'utf8');
		const bodies = src.slice(src.indexOf('const handler'));
		// Three branches serve bytes: lib, fonts.css and the woff2 files.
		expect((bodies.match(/allowCrossOrigin\(/g) ?? []).length, 'every serving branch').toBe(3);
		expect(src, 'and the header it sets').toContain("'access-control-allow-origin', '*'");
		// It must NOT have spread to the bundle proxy: the apps host answering no
		// CORS headers for a student's own bytes is the origin split working.
		const proxy = fs.readFileSync('src/lib/server/foundry-serve.ts', 'utf8');
		expect(proxy.toLowerCase(), 'never on the bundle path').not.toContain(
			'access-control-allow-origin'
		);
	});

	it('has no file in the directory the registry does not claim', () => {
		// The other direction. An orphan is dead weight in the repo and, more
		// to the point, a library somebody meant to publish and did not.
		const claimed = new Set(FOUNDRY_PLATFORM_LIBRARIES.map((l) => l.file));
		const present = fs.readdirSync(VENDOR_DIR).filter((f) => f.endsWith('.js'));
		expect(present.length, 'positive control: the directory is not empty').toBeGreaterThan(0);
		for (const f of present) expect(claimed.has(f), `${f} is in the registry`).toBe(true);
	});

	it('serves each one from its own path, and nothing else from that prefix', () => {
		for (const lib of FOUNDRY_PLATFORM_LIBRARIES) {
			expect(platformLibraryPath(lib)).toBe(`${PLATFORM_LIB_PREFIX}${lib.file}`);
			expect(isPlatformLibraryPath(platformLibraryPath(lib)), lib.file).toBe(true);
		}
		// The negative half, or `isPlatformLibraryPath` could be `startsWith`
		// and every assertion above would still pass.
		for (const nope of [
			`${PLATFORM_LIB_PREFIX}jquery.js`,
			`${PLATFORM_LIB_PREFIX}../fonts.css`,
			'/_platform/fonts.css',
			'/lib/react.js',
			'react.js'
		]) {
			expect(isPlatformLibraryPath(nope), nope).toBe(false);
		}
	});
});

/* ------------------------------------------------- 2. recognising a reference */

describe('a CDN URL is matched on the library, not on the URL', () => {
	/**
	 * Real shapes, from the five CDNs named in the contract. The point of the
	 * table is that no two of these strings are alike and all of them have to
	 * land on the same five files.
	 */
	const HITS: [string, string][] = [
		// unpkg, the shape the fixture that started this lane actually used
		['https://unpkg.com/react@18/umd/react.production.min.js', 'react.js'],
		['https://unpkg.com/react-dom@18/umd/react-dom.production.min.js', 'react-dom.js'],
		['https://unpkg.com/@babel/standalone/babel.min.js', 'babel.js'],
		['https://unpkg.com/lucide@latest', 'lucide.js'],
		// jsdelivr, which buries the package one segment deeper
		['https://cdn.jsdelivr.net/npm/react@18.2.0/umd/react.production.min.js', 'react.js'],
		['https://cdn.jsdelivr.net/npm/@babel/standalone@7/babel.min.js', 'babel.js'],
		['https://fastly.jsdelivr.net/npm/lucide@0.400.0/dist/umd/lucide.min.js', 'lucide.js'],
		// cdnjs, whose library names are its own
		['https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js', 'react.js'],
		['https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.2/babel.min.js', 'babel.js'],
		// esm.sh, including its build-pinned prefix
		['https://esm.sh/react@18', 'react.js'],
		['https://esm.sh/v135/react-dom@18.3.1/es2022/react-dom.mjs', 'react-dom.js'],
		// the Tailwind CDN, where the host IS the library
		['https://cdn.tailwindcss.com', 'tailwind.js'],
		['https://cdn.tailwindcss.com/3.4.1?plugins=forms', 'tailwind.js'],
		// protocol-relative, and a www the resolver has to strip
		['//unpkg.com/react@18/umd/react.production.min.js', 'react.js'],
		['https://www.unpkg.com/react@18/umd/react.production.min.js', 'react.js']
	];

	it('lands every one of them on the right file', () => {
		expect(HITS.length, 'the sweep generated cases').toBeGreaterThan(10);
		for (const [url, file] of HITS) {
			const ref = identifyCdnReference(url);
			expect(ref, url).not.toBeNull();
			const lib = platformLibraryFor(ref!);
			expect(lib, url).not.toBeNull();
			expect(lib!.file, url).toBe(file);
		}
	});

	it('does not confuse react-dom with react in either direction', () => {
		// The specific way a scoped/hyphenated name gets mangled. Asserted on
		// its own because a prefix match passes every other case in the table.
		expect(platformLibraryFor(identifyCdnReference('https://esm.sh/react-dom@18')!)!.file).toBe(
			'react-dom.js'
		);
		expect(platformLibraryFor(identifyCdnReference('https://esm.sh/react@18')!)!.file).toBe(
			'react.js'
		);
		// And the scope is not read as a version.
		expect(identifyCdnReference('https://unpkg.com/@babel/standalone/babel.min.js')).toEqual({
			pkg: '@babel/standalone',
			version: null
		});
	});

	const MISSES = [
		// A CDN we understand, carrying a library we do not host.
		'https://cdn.jsdelivr.net/npm/chart.js',
		'https://unpkg.com/three@0.160.0/build/three.min.js',
		'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js',
		// Not a CDN at all.
		'https://api.example.com/data.json',
		'https://fonts.googleapis.com/css2?family=Inter',
		// Not a URL at all.
		'./app.js',
		'art/logo.png',
		''
	];

	it('claims nothing it does not host', () => {
		for (const url of MISSES) {
			const ref = identifyCdnReference(url);
			const lib = ref ? platformLibraryFor(ref) : null;
			expect(lib, url).toBeNull();
		}
	});
});

describe('a version that does not match is reported, never swallowed', () => {
	it('accepts a dot-boundary prefix and a tag, and only those', () => {
		const cases: [string | null, string, boolean][] = [
			[null, '18.3.1', true],
			['18', '18.3.1', true],
			['18.3', '18.3.1', true],
			['18.3.1', '18.3.1', true],
			['^18.2.0', '18.3.1', true],
			['~18.3.0', '18.3.1', true],
			// A caret is a RANGE, so its ceiling still bites.
			['^17.0.0', '18.3.1', false],
			// And its floor: we host 18.3.1, which is below 18.9.
			['^18.9.0', '18.3.1', false],
			['latest', '18.3.1', true],
			// The one that must NOT be fooled: 1 is a prefix of 18 as a string.
			['1', '18.3.1', false],
			['17', '18.3.1', false],
			['19', '18.3.1', false],
			['3', '4.3.3', false]
		];
		for (const [asked, hosted, want] of cases) {
			expect(versionSatisfied(asked, hosted), `${asked} vs ${hosted}`).toBe(want);
		}
	});

	it('says so in the note when the Tailwind CDN is repointed at v4', () => {
		// The live case: `cdn.tailwindcss.com` IS the v3 Play CDN, so a bare
		// reference to it is a request for 3 and we serve 4. A student whose
		// `tailwind.config` object stops working has to be able to find out why.
		const r = classifyVendorReference('script', 'src', 'https://cdn.tailwindcss.com');
		expect(r, 'recognised').not.toBeNull();
		expect(r!.versionAsked, 'the mismatch is recorded').toBe('3');
	});

	it('stays quiet when the version asked for is the version served', () => {
		const r = classifyVendorReference(
			'script',
			'src',
			'https://unpkg.com/react@18/umd/react.production.min.js'
		);
		expect(r!.versionAsked, 'no mismatch to report').toBeNull();
	});
});

/* --------------------------------------------- 3. what may and may not be cut */

describe('only a script reference is rewritten', () => {
	it('rewrites a script src', () => {
		expect(
			classifyVendorReference('script', 'src', 'https://unpkg.com/react@18/umd/react.js')
		).not.toBeNull();
	});

	it('refuses to repoint a stylesheet at a JavaScript file', () => {
		// A prebuilt tailwind.min.css off a CDN is a real thing students write.
		// Handing the browser our v4 browser BUILD in its place would parse as
		// nothing and fail silently -- strictly worse than the refusal, which
		// at least names the browser build and how to use it.
		expect(
			classifyVendorReference(
				'link',
				'href',
				'https://cdn.jsdelivr.net/npm/tailwindcss@3/dist/tailwind.min.css'
			)
		).toBeNull();
		expect(classifyVendorReference('', 'url', 'https://unpkg.com/react@18/umd/react.js')).toBeNull();
		expect(classifyVendorReference('img', 'src', 'https://unpkg.com/react@18/x.png')).toBeNull();
	});

	it('leaves an ES module import alone, and tells it what to write instead', () => {
		const r = scanJs('app.js', 'import React from "https://esm.sh/react@18";\n');
		expect(r.failures, 'still a hard failure').toHaveLength(1);
		const m = r.failures[0].message;
		// It has to name the script-tag form, or the student is told only "no".
		expect(m, 'names the hosted path').toContain(`${PLATFORM_LIB_PREFIX}react.js`);
		expect(m, 'names the script tag shape').toContain('<script src=');
		expect(m, 'names the global to use').toContain('React');
	});
});

/* ------------------------------------------------ the refusal that still bites */

describe('a CDN library we do not host is still refused, and says what is', () => {
	const readerFor = (refs: HtmlFacts['refs']): HtmlReader => () => ({
		refs,
		title: 'x',
		inlineScripts: []
	});

	it('refuses it and lists what IS hosted', () => {
		const url = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js';
		const src = `<!doctype html>\n<html><head>\n<script src="${url}"></script>\n</head></html>`;
		const scan = scanHtml('index.html', src, readerFor([{ tag: 'script', attr: 'src', value: url }]));

		expect(scan.failures, 'refused').toHaveLength(1);
		expect(scan.rewriteNotes, 'not repaired').toHaveLength(0);
		expect(scan.rewritten, 'bytes untouched').toBeNull();

		const m = scan.failures[0].message;
		expect(m, 'names the file and line').toContain('index.html line 3');
		expect(m, 'names what they wrote').toContain(url);
		for (const lib of FOUNDRY_PLATFORM_LIBRARIES) {
			expect(m, `names ${lib.label}`).toContain(platformLibraryPath(lib));
		}
	});

	it('refuses a tag whose integrity hash is for the copy we are replacing', () => {
		/*
		 * MEASURED, AND IT WOULD HAVE BEEN SILENT. cdnjs puts `integrity` in the
		 * snippet it tells people to copy. Repointing the src and leaving the
		 * hash hands the browser our bytes with a digest of somebody else's, so
		 * the script is refused at runtime -- a blank app, under a note claiming
		 * we fixed it, which is the exact failure this lane exists to end.
		 */
		const url = 'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js';
		const src = `<html><head>\n<script src="${url}" integrity="sha512-abc" crossorigin="anonymous"></script>\n</head></html>`;
		const scan = scanHtml('index.html', src, readerFor([{ tag: 'script', attr: 'src', value: url }]));

		expect(scan.rewriteNotes, 'not repaired').toHaveLength(0);
		expect(scan.rewritten, 'bytes untouched').toBeNull();
		expect(scan.failures, 'refused instead').toHaveLength(1);
		expect(scan.failures[0].message, 'names the checksum').toContain('integrity');
		expect(scan.failures[0].message, 'says what to delete').toContain('Delete the integrity');

		// THE POSITIVE CONTROL. The identical tag WITHOUT the hash is repaired,
		// so the refusal above is the hash and not the cdnjs URL shape.
		const clean = `<html><head>\n<script src="${url}"></script>\n</head></html>`;
		const ok = scanHtml('index.html', clean, readerFor([{ tag: 'script', attr: 'src', value: url }]));
		expect(ok.failures, 'no hash, no problem').toHaveLength(0);
		expect(ok.rewriteNotes, 'repaired').toHaveLength(1);
	});

	it('no longer tells a script tag to point at file.css', () => {
		/*
		 * THE MEASURED DEFECT. `https://unpkg.com/lucide@latest` has no
		 * extension anywhere in it, so the example fell back to a hardcoded
		 * `file.css` -- a stylesheet name, offered inside a script tag, for an
		 * icon library. Lucide is hosted now, so the refusal has to be provoked
		 * with a library that is not.
		 */
		const url = 'https://unpkg.com/some-icons@latest';
		const src = `<html><head>\n<script src="${url}"></script>\n</head></html>`;
		const scan = scanHtml('index.html', src, readerFor([{ tag: 'script', attr: 'src', value: url }]));
		expect(scan.failures).toHaveLength(1);
		expect(scan.failures[0].message, 'no stylesheet name in a script tag').not.toContain(
			'file.css'
		);
		expect(scan.failures[0].message, 'a script-shaped example').toContain('src="library.js"');
	});
});

/* --------------------------------------------------- 4. the documents we hand out */

describe('the starter file is the file we actually serve', () => {
	const starter = foundryStarterFile();

	const readerFromSource: HtmlReader = (html: string): HtmlFacts => {
		/*
		 * A reader over the starter's own text. There is no DOM in Node, and
		 * the real parsers are exercised where they exist -- what is pinned
		 * here is the RULE downstream of the parse, which is the half that can
		 * make us hand out a file we would refuse.
		 *
		 * It is deliberately GREEDY: it reports every src and href in the file,
		 * so a path that would be refused cannot hide by not being collected.
		 */
		const refs: HtmlFacts['refs'] = [];
		const re = /<(\w+)[^>]*?\s(src|href)="([^"]*)"/g;
		for (let m = re.exec(html); m !== null; m = re.exec(html)) {
			refs.push({ tag: m[1], attr: m[2], value: m[3] });
		}
		const title = /<title>([^<]*)<\/title>/.exec(html);
		const scripts: string[] = [];
		const sre = /<script type="text\/babel">([\s\S]*?)<\/script>/g;
		for (let m = sre.exec(html); m !== null; m = sre.exec(html)) scripts.push(m[1]);
		return { refs, title: title ? title[1] : null, inlineScripts: scripts };
	};

	it('passes its own preflight with nothing to repair', () => {
		const scan = scanHtml('index.html', starter, readerFromSource);
		expect(scan.failures.map((f) => f.message), 'no refusals').toEqual([]);
		expect(scan.warnings.map((w) => w.message), 'no warnings').toEqual([]);
		/*
		 * ZERO REWRITES IS THE POINT, not zero failures. A starter that had to
		 * be repaired on the way in would mean the paths we wrote into the file
		 * we hand out are not the paths we serve -- which passes, silently, and
		 * teaches the student that the tags they were given were wrong.
		 */
		expect(scan.rewriteNotes, 'nothing to repair').toEqual([]);
		expect(scan.rewritten, 'bytes as written').toBeNull();
	});

	it('carries the real hosted paths, and a spot to paste into', () => {
		// Positive control for the assertion above: a file with no references
		// at all would also pass it.
		const refs = readerFromSource(starter).refs;
		expect(refs.length, 'the greedy reader found references').toBeGreaterThanOrEqual(4);

		for (const pkg of ['react', 'react-dom', '@babel/standalone']) {
			const lib = FOUNDRY_PLATFORM_LIBRARIES.find((l) => l.pkg === pkg)!;
			expect(starter, `${lib.label} tag`).toContain(
				`<script src="${platformLibraryPath(lib)}"></script>`
			);
		}
		expect(starter, 'the fonts').toContain('/_platform/fonts.css');
		expect(starter, 'somewhere to render').toContain('id="root"');
		expect(starter, 'JSX compiles').toContain('type="text/babel"');
		expect(starter, 'a marked spot').toContain('PASTE YOUR COMPONENT HERE');
	});

	it('is regenerated rather than stored, so a version bump moves it', () => {
		// Every hosted version appears in the document that describes them.
		for (const lib of FOUNDRY_PLATFORM_LIBRARIES) {
			if (lib.pkg === 'react' || lib.pkg === 'react-dom' || lib.pkg === '@babel/standalone') {
				continue;
			}
			expect(starter, `${lib.label} is offered`).toContain(lib.version);
		}
	});
});

describe('the build contract states what the code does', () => {
	const contract = foundryBuildContract();

	it('no longer tells a student to write plain JavaScript', () => {
		// The sentence this lane makes false. It read: "you cannot download one,
		// so in practice write plain JavaScript."
		expect(contract, 'the retracted advice').not.toContain('in practice write plain JavaScript');
		expect(contract, 'React is supported').toContain('React with JSX also works');
		expect(contract, 'and how').toContain('text/babel');
	});

	it('prints every hosted library, its path and its pinned version', () => {
		for (const lib of FOUNDRY_PLATFORM_LIBRARIES) {
			expect(contract, `${lib.label} path`).toContain(platformLibraryPath(lib));
			expect(contract, `${lib.label} version`).toContain(`${lib.label} ${lib.version}`);
		}
	});

	it('points at the starter and at the rewrite', () => {
		expect(contract, 'the starter').toContain(FOUNDRY_STARTER_PATH);
		expect(contract, 'the CDNs that are repointed').toContain('cdn.tailwindcss.com');
	});
});
