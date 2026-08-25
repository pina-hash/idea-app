import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

import { FOUNDRY_ENTRY_FILE, foundryMime } from '$lib/foundry/preflight';

/**
 * A DELIBERATELY HOSTILE BUNDLE, plus the two apps and three versions around
 * it, held in memory so the REAL proxy can be driven end to end with no
 * database and no Storage.
 *
 * WHY THIS EXISTS AT ALL. The local `.env` points at a placeholder Supabase
 * project, so nothing here can read a real `student_app_files` row or download
 * a real object from `foundry-bundles`. Without a fixture the proxy's token
 * verification, its host branch, its headers, its MIME allowlist and its shim
 * injection could not be exercised locally at all, and every claim about them
 * would be a claim about code that had never run.
 *
 * IT IS A SOURCE OF BYTES AND ROWS, NOT A SECOND PROXY. `$lib/server/foundry-bundle`
 * consults this INSTEAD OF Supabase when `dev` is true and the app id is one of
 * these two -- and nothing else changes. The same route, the same token
 * verification, the same publication re-check, the same headers, the same
 * injection. A parallel dev serving route would have been a copy of the thing
 * under test, which is exactly what a harness must never be.
 *
 * THE SHAPE MODELS THE REFUSALS, not just the happy path:
 *
 *   APP_A  published version A_LIVE. Holds the hostile bundle.
 *          Also holds A_STALE, an approved-but-no-longer-published version --
 *          which is what a token whose `published_version_id` has MOVED looks
 *          like from the proxy's side.
 *   APP_B  published version B_LIVE, holding one file with a path that does
 *          NOT exist in A. A token for A asking for B's file is then a real
 *          cross-app request rather than a request for a missing file.
 *
 * The ids are fixed literals rather than generated, so a harness URL survives
 * a dev-server restart and a measurement can be repeated against the same
 * token.
 */

export const FIXTURE_APP_A = '11111111-1111-4111-8111-111111111111';
export const FIXTURE_APP_B = '22222222-2222-4222-8222-222222222222';
/**
 * THE SCRATCH APP: an empty bundle the submit harness FILLS IN at run time.
 *
 * A and B are fixed bytes, written here, standing for cases the proxy has to
 * refuse or serve. C holds nothing until a harness puts something in it, and
 * that is what it is for: the submit harness normalizes a real upload in the
 * browser, runs the real preflight over it, and posts the RESULTING files
 * here -- so what the frame then renders is the output of the pipeline in that
 * run, in that browser, rather than a second copy of it computed some other
 * way.
 *
 * That distinction is the whole value of the acceptance drive. A fixture built
 * from the same source file by a different code path would prove the rewrite
 * agrees with itself.
 */
export const FIXTURE_APP_C = '33333333-3333-4333-8333-333333333333';
export const FIXTURE_VERSION_A_LIVE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
export const FIXTURE_VERSION_A_STALE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
export const FIXTURE_VERSION_B_LIVE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
export const FIXTURE_VERSION_C_LIVE = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
export const FIXTURE_VIEWER = '99999999-9999-4999-8999-999999999999';

/**
 * THE HOSTILE PAGE. Every line of it is one of the things the origin split is
 * supposed to stop, and each one REPORTS ITS OWN RESULT into the page and to
 * the console rather than merely being present -- a bundle that silently does
 * nothing is indistinguishable from a bundle whose script never ran, which is
 * the failure mode this whole fixture exists to make impossible to miss.
 *
 * It also reports `window.origin`, which is how "did this land in an opaque
 * origin" is answered for a DIRECT navigation, where there is no parent to
 * ask.
 *
 * The inline `<script>` is the point, not an oversight: it is what a generated
 * app looks like, and it is what proves the CSP permits one.
 */
const HOSTILE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Foundry hostile probe</title>
<link rel="stylesheet" href="/_platform/fonts.css">
<link rel="stylesheet" href="style.css">
</head>
<body>
<h1>Foundry hostile probe</h1>
<p id="origin">origin: (script did not run)</p>
<ul id="results"></ul>
<img id="apiprobe" src="/api/notebook/upload" alt="">
<script src="https://cdn.jsdelivr.net/npm/left-pad@1.3.0/index.js"></script>
<script>
var out = document.getElementById('results');
var collected = {};
function report(name, verdict) {
  var li = document.createElement('li');
  li.setAttribute('data-probe', name);
  li.setAttribute('data-verdict', verdict);
  li.textContent = name + ': ' + verdict;
  out.appendChild(li);
  collected[name] = verdict;
  console.log('[probe] ' + name + ' = ' + verdict);
  // POSTMESSAGE IS THE ONE CHANNEL A SANDBOXED FRAME KEEPS, and it is how the
  // harness reads these results at all: the frame is cross-origin AND on an
  // opaque origin, so the parent cannot reach into it and its console is not
  // the parent's console. Nothing is granted by this -- a frame may always
  // message its parent, the parent chooses whether to listen, and the message
  // arrives with origin "null". The gallery must treat anything a bundle sends
  // as untrusted, which is why the harness only ever renders it as text.
  try { if (window.top !== window.self) window.parent.postMessage({ foundryProbe: collected }, '*'); } catch (e) {}
}
function attempt(name, fn) {
  try {
    var v = fn();
    report(name, 'REACHED ' + String(v));
  } catch (e) {
    report(name, 'BLOCKED ' + (e && e.name ? e.name : 'Error'));
  }
}
var framed = window.top !== window.self;
document.getElementById('origin').textContent = 'origin: ' + String(window.origin) + ' | framed: ' + framed;
report('window.origin', String(window.origin));
report('inline-script', 'RAN');
attempt('parent.location', function () { return window.parent.location.href; });
attempt('top.document', function () { return window.top.document.title; });
/*
 * TOP NAVIGATION IS ONLY A TEST WHEN THERE IS A TOP TO ESCAPE FROM.
 *
 * A top-level document setting top.location is navigating ITSELF, which the
 * HTML spec permits regardless of sandboxing -- the "allowed to navigate"
 * steps only refuse when source and target differ. Measured the hard way: the
 * first version of this probe ran it unconditionally, and the direct-navigation
 * drive went straight to example.com before a single result could be read,
 * which reads exactly like a sandbox escape and is not one.
 *
 * So it runs only when framed, where it IS the escape being tested, and says
 * so otherwise rather than quietly not running.
 */
if (framed) {
  attempt('set-top.location', function () { window.top.location = 'https://example.com/'; return 'set'; });
} else {
  report('set-top.location', 'n/a self-navigation, no parent to escape');
}
attempt('window.open', function () { var w = window.open('https://example.com/'); return w === null ? 'null' : 'window'; });
attempt('document.cookie', function () { return JSON.stringify(document.cookie); });
attempt('native-localStorage-would-have-thrown', function () {
  return typeof window.localStorage.setItem === 'function' ? 'shim present' : 'no shim';
});
attempt('localStorage-roundtrip', function () {
  window.localStorage.setItem('probe-count', String(Number(window.localStorage.getItem('probe-count') || 0) + 1));
  return 'count=' + window.localStorage.getItem('probe-count') +
    ' length=' + window.localStorage.length +
    ' key0=' + window.localStorage.key(0) +
    ' index=' + window.localStorage['probe-count'];
});
attempt('external-script-global', function () {
  return typeof window.leftPad === 'undefined' ? 'undefined (blocked)' : 'defined';
});
// SUBRESOURCES, REPORTED FROM INSIDE THE DOCUMENT.
// The verification pane's network log does not reliably record requests made
// by a sandboxed subframe, so "did the relative stylesheet load" and "what
// happened to the <img> pointing at an API path" are asked of the document
// itself, which cannot be blocked by an instrument.
report('own-relative-stylesheet', document.styleSheets.length + ' sheets, body font=' +
  String(getComputedStyle(document.body).fontFamily).slice(0, 40));
/*
 * DID THE FONT FILE ACTUALLY ARRIVE, as opposed to being asked for.
 *
 * NO BACKTICKS IN THIS COMMENT, and that is not a style note: this whole page
 * is a template literal in foundry-dev-fixture.ts, so one backtick here ends
 * the string early and the module stops parsing. It cost a broken harness once.
 *
 * The getComputedStyle reading above reports the DECLARED STACK and says
 * nothing about whether the face loaded -- it reads "Rajdhani, system-ui" just
 * as happily when the woff2 was refused and the text is being drawn in
 * system-ui. The two were being conflated, and the difference is the whole
 * question: a bundle runs in an OPAQUE ORIGIN, every @font-face fetch is made
 * in CORS mode with no way to opt out, and an opaque origin is same-origin with
 * nothing -- so the platform fonts load only if /_platform/ answers with an
 * Access-Control-Allow-Origin header. document.fonts.load resolves with the
 * faces it actually got, so an empty array is a refusal and a non-empty one is
 * bytes on the wire.
 */
document.fonts.load('16px Rajdhani', 'Ag').then(
  function (faces) { report('platform-font-loaded', faces.length > 0 ? 'YES ' + faces.length + ' face(s)' : 'NO faces resolved'); },
  function (e) { report('platform-font-loaded', 'FAILED ' + (e && e.name ? e.name : 'Error')); }
);
var img = document.getElementById('apiprobe');
report('img-api-src-resolved-to', img.src);
function imgVerdict() {
  report('img-api-outcome', img.complete && img.naturalWidth > 0 ? 'LOADED' : 'did not load');
}
if (img.complete) { imgVerdict(); } else {
  img.addEventListener('load', imgVerdict);
  img.addEventListener('error', imgVerdict);
}
try {
  fetch('https://example.com/').then(
    function () { report('fetch-external', 'REACHED'); },
    function (e) { report('fetch-external', 'BLOCKED ' + (e && e.name ? e.name : 'Error')); }
  );
} catch (e) { report('fetch-external', 'BLOCKED ' + (e && e.name ? e.name : 'Error')); }
try {
  fetch('/api/notebook/upload').then(
    function (r) { report('fetch-same-path', 'REACHED ' + r.status); },
    function (e) { report('fetch-same-path', 'BLOCKED ' + (e && e.name ? e.name : 'Error')); }
  );
} catch (e) { report('fetch-same-path', 'BLOCKED ' + (e && e.name ? e.name : 'Error')); }
</script>
</body>
</html>`;

/**
 * A BUNDLE THAT WEDGES ITS OWN TAB, on purpose.
 *
 * It is the SUBMITTED version of app A -- the one waiting for review -- because
 * that is where an unvetted build is actually met, and because it is the exact
 * case the stop control exists for: review catches an infinite loop unreliably
 * (a reviewer who approved a build did not necessarily reach the path that
 * spins), so a viewer needs a way out that does not cost them the tab.
 *
 * IT REPORTS AND THEN HANGS, in that order, with the spin deferred one turn of
 * the event loop. Without the defer the parse never finishes, nothing is
 * painted and nothing is posted, so what gets tested is a blank frame rather
 * than a running one that stopped responding -- and those two need different
 * fixes. The 1500ms delay is long enough that the harness can see it alive
 * first.
 *
 * NOTHING HERE IS A SECOND PROXY OR A SECOND FRAME: it is bytes, served by the
 * same route, framed by the same component. Only the bytes are hostile.
 */
const SPINNER_HTML = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Runaway build</title></head>
<body>
<h1>Runaway build</h1>
<p id="state">starting</p>
<script>
function say(s) {
  document.getElementById('state').textContent = s;
  try { if (window.top !== window.self) window.parent.postMessage({ foundrySpinner: s }, '*'); } catch (e) {}
}
say('alive');
/*
 * A HEARTBEAT, BECAUSE "IS THIS FRAME WEDGED" HAS TO BE MEASURABLE FROM
 * OUTSIDE. The parent cannot reach into a cross-origin, opaque-origin document
 * to ask, and a frame that has stopped responding looks exactly like one that
 * is idle. A beat every 200ms turns that into an observation: the beats stop,
 * and the number they stopped at says when.
 */
var beat = 0;
setInterval(function () { beat += 1; say('beat ' + beat); }, 200);
setTimeout(function () {
  say('spinning');
  // The whole point. This never returns, and the heartbeat above dies with it.
  while (true) { Math.sqrt(Math.random()); }
}, 1500);
<\/script>
</body>
</html>`;

const STYLE_CSS = `body { font-family: 'Rajdhani', system-ui, sans-serif; margin: 2rem; }
h1 { font-family: 'Orbitron', sans-serif; }
li { font-family: 'Share Tech Mono', monospace; }`;

const DATA_JSON = `{"note":"a bundle's own data file, fetched relatively"}`;

const encoder = new TextEncoder();

type FixtureFile = { bytes: Uint8Array; contentType: string };

function file(path: string, text: string): [string, FixtureFile] {
	return [path, { bytes: encoder.encode(text), contentType: foundryMime(path) }];
}

type FixtureVersion = {
	appId: string;
	entry: string;
	files: Map<string, FixtureFile>;
};

type FixtureApp = {
	id: string;
	slug: string;
	title: string;
	/**
	 * NULL IS A REAL FIXTURE STATE, not a placeholder. An app whose first build
	 * is still in review, one whose build was rejected, and one rolled back to
	 * nothing all look like this -- and on the DIRECT PAGE (`/a/<app>/`) it is
	 * the case that has to answer with the same bodyless 404 as an app id that
	 * does not exist. Without a fixture for it that refusal could only be
	 * asserted against an unknown id, which is a different code path.
	 */
	publishedVersionId: string | null;
	hiddenAt: string | null;
};

const versions = new Map<string, FixtureVersion>([
	[
		FIXTURE_VERSION_A_LIVE,
		{
			appId: FIXTURE_APP_A,
			entry: FOUNDRY_ENTRY_FILE,
			files: new Map([
				file(FOUNDRY_ENTRY_FILE, HOSTILE_HTML),
				file('style.css', STYLE_CSS),
				file('data.json', DATA_JSON)
			])
		}
	],
	[
		FIXTURE_VERSION_A_STALE,
		{
			appId: FIXTURE_APP_A,
			entry: FOUNDRY_ENTRY_FILE,
			files: new Map([
				file(FOUNDRY_ENTRY_FILE, SPINNER_HTML),
				file('notes.txt', 'The build the reviewer is deciding about.')
			])
		}
	],
	[
		FIXTURE_VERSION_B_LIVE,
		{
			appId: FIXTURE_APP_B,
			entry: FOUNDRY_ENTRY_FILE,
			files: new Map([
				file(FOUNDRY_ENTRY_FILE, "<!doctype html><title>app B</title><p>B's own page"),
				file('b-only.json', '{"owner":"app B"}')
			])
		}
	],
	[
		FIXTURE_VERSION_C_LIVE,
		{
			appId: FIXTURE_APP_C,
			entry: FOUNDRY_ENTRY_FILE,
			// Empty until a harness fills it. Until then every path under it is
			// the same bodyless 404 as any other missing file, which is the
			// correct answer for a version that genuinely has no files.
			files: new Map<string, FixtureFile>([
				file(
					FOUNDRY_ENTRY_FILE,
					'<!doctype html><title>Nothing loaded yet</title><p>Drive the submit harness to put a bundle here.'
				)
			])
		}
	]
]);

/**
 * Replaces the scratch app's file set with one the harness just produced.
 *
 * IN MEMORY, AND DEV ONLY. It is called from a `+server.ts` that returns 404
 * unless `dev`, and it reaches nothing but this module's own Map -- there is no
 * Storage write, no row, and nothing that survives a restart of the dev server.
 *
 * IT IS A SOURCE OF BYTES, NOT A SECOND PROXY, exactly like the two fixed
 * bundles above. The same route serves them, the same token verification lets
 * them through, the same publication re-check applies, the same headers and the
 * same CSP go out. Only where the bytes came from is different.
 */
export function setFixtureBundle(files: { path: string; text: string }[]): number {
	const next = new Map<string, FixtureFile>();
	for (const f of files) next.set(...file(f.path, f.text));
	versions.set(FIXTURE_VERSION_C_LIVE, {
		appId: FIXTURE_APP_C,
		entry: FOUNDRY_ENTRY_FILE,
		files: next
	});
	return next.size;
}

const apps = new Map<string, FixtureApp>([
	[
		FIXTURE_APP_A,
		{
			id: FIXTURE_APP_A,
			slug: 'hostile-probe',
			title: 'Foundry hostile probe',
			publishedVersionId: FIXTURE_VERSION_A_LIVE,
			hiddenAt: null
		}
	],
	[
		FIXTURE_APP_B,
		{
			id: FIXTURE_APP_B,
			slug: 'app-b',
			title: 'App B',
			publishedVersionId: FIXTURE_VERSION_B_LIVE,
			hiddenAt: null
		}
	],
	[
		FIXTURE_APP_C,
		{
			id: FIXTURE_APP_C,
			slug: 'harness-run',
			title: 'Harness run',
			publishedVersionId: FIXTURE_VERSION_C_LIVE,
			hiddenAt: null
		}
	]
]);

/* -------------------------------------------------------------------------
 * THE ACCEPTANCE FIXTURES, read from the files the repo already keeps.
 *
 * `tests/fixtures/foundry/*.html` are the bundles this feature is accepted
 * against: `deflect.html` (a canvas app with ZERO external references),
 * `approved-react-app.html` (React, ReactDOM and Babel from unpkg, JSX
 * transpiled in the browser) and `sandbox-probe.html` (the isolation probes).
 * They are READ OFF DISK rather than pasted in here, so the bytes the harness
 * runs are byte-identical to the bytes every other check uses. A second copy
 * inline is the one that quietly stops matching.
 *
 * DEV ONLY AND LAZY. Nothing reaches this unless `dev` is true and the app id
 * is one of these, so the read never happens on a deployment, where the
 * directory does not exist. A file that cannot be read registers NOTHING,
 * which makes its id an unknown app and therefore the same bodyless 404 as any
 * other -- never a broken dev server.
 * ---------------------------------------------------------------------- */

export const FIXTURE_APP_DEFLECT = '44444444-4444-4444-8444-444444444444';
export const FIXTURE_VERSION_DEFLECT = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
export const FIXTURE_APP_REACT = '55555555-5555-4555-8555-555555555555';
export const FIXTURE_VERSION_REACT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
export const FIXTURE_APP_PROBE = '66666666-6666-4666-8666-666666666666';
export const FIXTURE_VERSION_PROBE = 'ffffffff-ffff-4fff-8fff-fffffffffff1';

/**
 * ONE FILE PER SERVABLE EXTENSION, so the content type on every kind of
 * response can be read off a real fetch rather than off the table it came from.
 *
 * A STYLESHEET SERVED AS `text/plain` IS IGNORED SILENTLY AND A SCRIPT SERVED
 * AS `text/plain` DOES NOT EXECUTE, which is why this is not just about the
 * entry document: the bug that produced this route had more surfaces than the
 * one that was visible. The binary members carry a real 1x1 PNG and short
 * placeholder byte strings -- the served type is derived from the EXTENSION by
 * `foundryMime`, never sniffed from the bytes, so what matters here is that a
 * row exists for each name.
 */
export const FIXTURE_APP_TYPES = '77777777-7777-4777-8777-777777777777';
export const FIXTURE_VERSION_TYPES = '77777777-7777-4777-8777-777777777771';

/**
 * THE THREE FIXTURES THE DIRECT PAGE NEEDS, and each of them exists because
 * `/a/<app>/` has a refusal or a measurement that nothing else can produce.
 *
 *   PLAYFIELD  the acceptance case's SHAPE. `wide-playfield.html` is a fixed
 *              960x640 game that scales to fit and reports the scale it got, so
 *              "the app has more room" is a number read from the same bundle in
 *              the gallery frame, in full screen and on the direct page. It is
 *              a stand-in and says so: blockbast's own bytes are in the
 *              production bucket and nothing here can reach them.
 *   HIDDEN     an app that IS published and IS shelved. Every other fixture app
 *              is visible, so without this the "a hidden app 404s" claim could
 *              only be made about code, never measured. Its entry document says
 *              in words that serving it is the failure, because a fixture that
 *              proves a refusal has to be recognisable when the refusal stops
 *              happening.
 *   UNPUBLISHED  an app with a version and NO `published_version_id`, which is
 *              the one refusal `/a/` has that `/b/` does not: `/b/` is handed a
 *              version id and this app's build is reachable through it, while
 *              `/a/` has nothing to resolve and must answer 404.
 */
export const FIXTURE_APP_PLAYFIELD = '99999999-9999-4999-8999-999999999991';
export const FIXTURE_VERSION_PLAYFIELD = '99999999-9999-4999-8999-999999999992';
export const FIXTURE_APP_HIDDEN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaf1';
export const FIXTURE_VERSION_HIDDEN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaf2';
export const FIXTURE_APP_UNPUBLISHED = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbf1';
export const FIXTURE_VERSION_UNPUBLISHED = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbf2';

const PNG_1X1 = Uint8Array.from(
	atob(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
	),
	(c) => c.charCodeAt(0)
);

function binaryFile(path: string, bytes: Uint8Array): [string, FixtureFile] {
	return [path, { bytes, contentType: foundryMime(path) }];
}

const FILE_FIXTURES: { appId: string; versionId: string; name: string }[] = [
	{ appId: FIXTURE_APP_DEFLECT, versionId: FIXTURE_VERSION_DEFLECT, name: 'deflect.html' },
	{ appId: FIXTURE_APP_REACT, versionId: FIXTURE_VERSION_REACT, name: 'approved-react-app.html' },
	{ appId: FIXTURE_APP_PROBE, versionId: FIXTURE_VERSION_PROBE, name: 'sandbox-probe.html' },
	{ appId: FIXTURE_APP_PLAYFIELD, versionId: FIXTURE_VERSION_PLAYFIELD, name: 'wide-playfield.html' }
];

function registerTypeFixture(): void {
	versions.set(FIXTURE_VERSION_TYPES, {
		appId: FIXTURE_APP_TYPES,
		entry: FOUNDRY_ENTRY_FILE,
		files: new Map([
			file(FOUNDRY_ENTRY_FILE, '<!doctype html><title>types</title><p>one file per extension'),
			file('style.css', 'body { color: #0f0; }'),
			file('app.js', 'export const ok = true;'),
			file('data.json', '{"ok":true}'),
			file('mark.svg', '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'),
			file('notes.txt', 'plain text'),
			binaryFile('pixel.png', PNG_1X1),
			binaryFile('face.woff2', new TextEncoder().encode('wOF2 placeholder, not a real font')),
			binaryFile('icon.ico', new TextEncoder().encode('ico placeholder'))
		])
	});
	apps.set(FIXTURE_APP_TYPES, {
		id: FIXTURE_APP_TYPES,
		slug: 'served-types',
		title: 'Served types',
		publishedVersionId: FIXTURE_VERSION_TYPES,
		hiddenAt: null
	});
}

/**
 * THE TWO REFUSAL FIXTURES FOR THE DIRECT PAGE.
 *
 * Both are registered rather than read off disk, because what is being fixtured
 * is a ROW STATE and not a bundle: the bytes exist only so that a refusal can be
 * told apart from an empty version.
 */
function registerRefusalFixtures(): void {
	versions.set(FIXTURE_VERSION_HIDDEN, {
		appId: FIXTURE_APP_HIDDEN,
		entry: FOUNDRY_ENTRY_FILE,
		files: new Map([
			file(
				FOUNDRY_ENTRY_FILE,
				'<!doctype html><title>shelved</title><p id="leak">A SHELVED APP SERVED ITS BYTES. This document is only reachable if the hidden check stopped running.'
			)
		])
	});
	apps.set(FIXTURE_APP_HIDDEN, {
		id: FIXTURE_APP_HIDDEN,
		slug: 'shelved-app',
		title: 'Shelved app',
		publishedVersionId: FIXTURE_VERSION_HIDDEN,
		hiddenAt: '2026-08-24T12:00:00Z'
	});

	versions.set(FIXTURE_VERSION_UNPUBLISHED, {
		appId: FIXTURE_APP_UNPUBLISHED,
		entry: FOUNDRY_ENTRY_FILE,
		files: new Map([
			file(
				FOUNDRY_ENTRY_FILE,
				'<!doctype html><title>in review</title><p id="leak">AN APP WITH NOTHING PUBLISHED SERVED ITS BYTES on the direct page.'
			)
		])
	});
	apps.set(FIXTURE_APP_UNPUBLISHED, {
		id: FIXTURE_APP_UNPUBLISHED,
		slug: 'nothing-published',
		title: 'Nothing published',
		publishedVersionId: null,
		hiddenAt: null
	});
}

let fileFixturesLoaded = false;

function loadFileFixtures(): void {
	if (fileFixturesLoaded) return;
	fileFixturesLoaded = true;
	registerTypeFixture();
	registerRefusalFixtures();
	for (const f of FILE_FIXTURES) {
		let html: string;
		try {
			html = readFileSync(resolvePath(process.cwd(), 'tests/fixtures/foundry', f.name), 'utf8');
		} catch {
			continue;
		}
		versions.set(f.versionId, {
			appId: f.appId,
			entry: FOUNDRY_ENTRY_FILE,
			files: new Map([file(FOUNDRY_ENTRY_FILE, html)])
		});
		apps.set(f.appId, {
			id: f.appId,
			slug: f.name.replace(/\.html$/, ''),
			title: f.name,
			publishedVersionId: f.versionId,
			hiddenAt: null
		});
	}
}

export function isFixtureApp(appId: string): boolean {
	loadFileFixtures();
	return apps.has(appId);
}

export function fixtureApp(appId: string): FixtureApp | null {
	loadFileFixtures();
	return apps.get(appId) ?? null;
}

export function fixtureVersion(versionId: string): FixtureVersion | null {
	loadFileFixtures();
	return versions.get(versionId) ?? null;
}
