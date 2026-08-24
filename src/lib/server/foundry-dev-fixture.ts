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
export const FIXTURE_VERSION_A_LIVE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
export const FIXTURE_VERSION_A_STALE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
export const FIXTURE_VERSION_B_LIVE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
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
	publishedVersionId: string;
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
	]
]);

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
	]
]);

export function isFixtureApp(appId: string): boolean {
	return apps.has(appId);
}

export function fixtureApp(appId: string): FixtureApp | null {
	return apps.get(appId) ?? null;
}

export function fixtureVersion(versionId: string): FixtureVersion | null {
	return versions.get(versionId) ?? null;
}
