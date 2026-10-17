/**
 * THE DEV FIXTURES `/hx/<docId>` SERVES, WHICH ARE NOT AND NEVER WERE ROWS.
 *
 * A REAL DOCUMENT NOW COMES FROM THE DATABASE. `$lib/server/html-assignment-document`
 * reads the row a teacher's import wrote, with the service role, and re-checks
 * every rule RLS would have enforced; the route consults THIS module first and
 * only in development. What is left here is the harness's worksheet and the
 * containment probe -- fixtures, kept because the browser-verify route and the
 * sandbox proof drive them and neither can wait on an import.
 *
 * THE TWO NAMESPACES PROVABLY CANNOT COLLIDE. Every id here is a WORD
 * (`worksheet`, `probe`); a stored document is addressed by `document_id`, a
 * uuid column, and `hxStoredDocument` refuses anything that is not a uuid
 * before it asks the database. So a fixture cannot shadow a real document and a
 * real document cannot be reached by a fixture name. **Do not name a fixture
 * with a uuid**, which is the one edit that would end that.
 *
 * THE `_` PREFIX IS THE ROUTE-DIRECTORY ESCAPE HATCH, and it is deliberate
 * rather than decorative. SvelteKit routes are `+`-prefixed files; anything
 * else in a route directory is an ordinary colocated module. Naming it `_`
 * matches the convention CLAUDE.md already records for a non-method export
 * beside a `+server.ts`, so a reader sweeping `src/routes/` for things that
 * answer a URL can skip it on sight.
 *
 * THE PROBE DOCUMENT IS DEV-ONLY, AND THE ROUTE IS WHAT ENFORCES THAT. It is a
 * deliberately HOSTILE document -- it tries to read the parent's DOM, the
 * parent's cookies, the parent's `localStorage`, and to `fetch` the portal --
 * because the only honest way to show a sandbox holds is to attack it and
 * measure the refusals. Everything it tries is refused by the sandbox and the
 * CSP, so serving it would be safe; it is still withheld in production, because
 * a production surface that serves an attack document has to explain itself
 * every time somebody reads the route, and "it cannot do anything" is a worse
 * answer than "it is not there".
 */

/** The manifest schema this lane's fixtures are written against. */
const SCHEMA_VERSION = 3;

export interface HxDocument {
	/** The bytes, served unchanged. */
	html: string;
	/** True for a document the route must refuse outside development. */
	devOnly: boolean;
	/**
	 * The field-to-block map a parent would have built from this document's
	 * stored manifest at import. It lives beside the FIXTURE because a fixture
	 * has no import behind it to have stored one; a real document's map is read
	 * off `classroom_html_assignments.manifest` and never from here. Nothing on
	 * the serving side reads it -- the route never sends a manifest anywhere --
	 * so it cannot become a second source of truth by accident.
	 */
	fieldToBlockId: Record<string, string>;
}

/**
 * THE FIELD NAMES AND THE BLOCK IDS ARE DELIBERATELY DIFFERENT STRINGS.
 *
 * The contract says `field` is the document author's name for an input and may
 * be renamed, while `id` is the permanent join key for every answer ever stored.
 * If a fixture spelled them the same, every test of the mapping would pass
 * whether or not the mapping ran -- a lookup that is the identity function
 * cannot be observed. So `reflection` maps to `mod-1.b.reflection`, and a
 * message naming `mod-1.b.reflection` as its FIELD is refused, which is exactly
 * the "a frame naming a block_id gets nowhere" rule with the strings arranged so
 * that it can be seen.
 */
const WORKSHEET_FIELDS: Record<string, string> = {
	teamName: 'mod-1.a.team',
	reflection: 'mod-1.b.reflection',
	checkedOff: 'mod-1.c.done'
};

/** The photo fixture's map: the worksheet's three, plus the picture block. */
const PHOTO_FIELDS: Record<string, string> = {
	...WORKSHEET_FIELDS,
	photo: 'mod-1.d.photo'
};

const PROBE_FIELDS: Record<string, string> = {
	probeParent: 'hx-probe.parent',
	probeCookie: 'hx-probe.cookie',
	probeStorage: 'hx-probe.storage',
	probeFetch: 'hx-probe.fetch',
	probeCsp: 'hx-probe.csp',
	probeOrigin: 'hx-probe.origin',
	probeTopNav: 'hx-probe.topnav'
};

/**
 * The shared bridge client every fixture ships, written the way a PORTED
 * document would have to be written.
 *
 * `localStorage` IS NEVER TOUCHED, and that is the sandbox's own cost showing
 * up in the fixture rather than in a comment: the getter THROWS in an opaque
 * origin, so a ported document's autosave -- which is almost always
 * `localStorage` -- has to become an `idea:change` up the bridge. A fixture that
 * quietly kept a `localStorage` line would take the page down on load and look
 * like a broken route.
 */
function bridgeClient(): string {
	return `
		var READY_SENT = false;
		function send(msg) { parent.postMessage(msg, '*'); }
		function announce() { if (READY_SENT) return; READY_SENT = true; send({ type: 'idea:ready', schemaVersion: ${SCHEMA_VERSION} }); }
		function reportHeight() { send({ type: 'idea:height', px: Math.ceil(document.documentElement.scrollHeight) }); }
		addEventListener('message', function (e) {
			var d = e.data;
			if (!d || typeof d !== 'object') return;
			if (d.type === 'idea:state') {
				var values = d.values || {};
				Object.keys(values).forEach(function (field) {
					var el = document.querySelector('[data-field="' + CSS.escape(field) + '"]');
					if (!el) return;
					if (el.type === 'checkbox') el.checked = values[field] === true;
					else el.value = String(values[field]);
				});
				document.body.classList.toggle('is-readonly', d.readOnly === true);
				Array.prototype.forEach.call(document.querySelectorAll('[data-field]'), function (el) {
					el.disabled = d.readOnly === true;
				});
				// GUARDED, because this client ships in BOTH fixtures and only one of
				// them has these notes. Unguarded, the probe document threw
				// "Cannot set properties of null" on every state message -- inside a
				// frame, where nothing the parent renders would ever have shown it.
				var stateNote = document.getElementById('state-note');
				if (stateNote) stateNote.textContent =
					'state applied, ' + Object.keys(values).length + ' value(s), readOnly=' + (d.readOnly === true);
			}
			if (d.type === 'idea:saved') {
				var savedNote = document.getElementById('saved-note');
				if (savedNote) savedNote.textContent = (d.ok ? 'saved ' : 'save failed ') + d.at;
			}
		});
		addEventListener('input', function (e) {
			var el = e.target;
			if (!el || !el.dataset || !el.dataset.field) return;
			send({ type: 'idea:change', field: el.dataset.field, value: el.type === 'checkbox' ? el.checked : el.value });
		});
		addEventListener('change', function (e) {
			var el = e.target;
			if (!el || !el.dataset || !el.dataset.field || el.type !== 'checkbox') return;
			send({ type: 'idea:change', field: el.dataset.field, value: el.checked });
		});
	`;
}

function manifestJson(payload: unknown): string {
	// `</script>` inside a JSON string would end the block early. Escaping the
	// solidus is the standard defence and is valid JSON, so the parse on the
	// other side is unaffected.
	return JSON.stringify(payload, null, '\t').replace(/</g, '\\u003c');
}

const WORKSHEET_MANIFEST = {
	schemaVersion: SCHEMA_VERSION,
	kind: 'html-assignment',
	title: 'Bridge fixture worksheet',
	course: 'IDEA209H',
	points: 10,
	modules: [
		{
			id: 'mod-1',
			title: 'One module, three block types',
			points: 10,
			audience: 'team',
			blocks: [
				{ id: 'mod-1.a.team', field: 'teamName', type: 'text' },
				{ id: 'mod-1.b.reflection', field: 'reflection', type: 'longText', minSentences: 2 },
				{ id: 'mod-1.c.done', field: 'checkedOff', type: 'checkbox' }
			],
			criteria: [
				{
					id: 'c1',
					text: 'The reflection answers the prompt',
					points: 10,
					levels: [
						{ points: 10, label: 'Proficient', short: 'Full', descriptor: 'Answers the prompt in at least two sentences.' },
						{ points: 6, label: 'Developing', short: 'Partial', descriptor: 'Answers the prompt in one sentence.' },
						{ points: 0, label: 'Not yet', short: 'None', descriptor: 'No reflection.' }
					]
				}
			]
		}
	]
};

const WORKSHEET_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bridge fixture worksheet</title>
<script type="application/json" id="idea-manifest">
${manifestJson(WORKSHEET_MANIFEST)}
</script>
<style>
	body { font: 16px/1.5 system-ui, sans-serif; margin: 0; padding: 1rem; background: #fff; color: #111; }
	h1 { font-size: 1.2rem; margin: 0 0 0.75rem; }
	label { display: block; margin: 0 0 0.75rem; }
	input[type="text"], textarea { width: 100%; box-sizing: border-box; font: inherit; padding: 0.4rem; min-height: 44px; }
	textarea { min-height: 6rem; }
	.note { font: 13px/1.5 ui-monospace, monospace; color: #444; margin: 0.25rem 0; }
	body.is-readonly { background: #f4f4f4; }
</style>
</head>
<body>
<h1>Bridge fixture worksheet</h1>
<label>Team name
	<input type="text" data-field="teamName" id="teamName">
</label>
<label>What did your team change, and why?
	<textarea data-field="reflection" id="reflection"></textarea>
</label>
<label><input type="checkbox" data-field="checkedOff" id="checkedOff"> Bench cleared</label>
<p class="note" id="state-note">no state yet</p>
<p class="note" id="saved-note">not saved yet</p>
<script>
${bridgeClient()}
	announce();
	reportHeight();
</script>
</body>
</html>
`;

/**
 * THE VIDEO FIXTURE: the worksheet's manifest and fields, plus a 16:9 box
 * placed well below the top, a Play control that asks the parent for a player
 * over it (`idea:video`) and a Close that asks for none. The box's own
 * coordinates are written into `#video-note`, so the harness can compare the
 * rectangle the document meant with where the parent actually drew the player.
 */
const VIDEO_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Video fixture</title>
<script type="application/json" id="idea-manifest">
${manifestJson(WORKSHEET_MANIFEST)}
</script>
<style>
	body { font: 16px/1.5 system-ui, sans-serif; margin: 0; padding: 1rem; background: #fff; color: #111; }
	.spacer { height: 420px; background: #eef1f4; margin: 0 0 1rem; }
	#box { width: min(100%, 560px); aspect-ratio: 16 / 9; background: #333; margin: 0 0 1rem 37px; }
	button { font: inherit; min-height: 44px; margin: 0 0.5rem 0.5rem 0; }
	.note { font: 13px/1.5 ui-monospace, monospace; color: #444; margin: 0.25rem 0; }
	.tall { height: 900px; }
</style>
</head>
<body>
<h1>Video fixture</h1>
<div class="spacer"></div>
<button type="button" id="play">Play</button><button type="button" id="close">Close</button>
<div id="box"></div>
<p class="note" id="video-note">no video</p>
<p class="note" id="video-state">no answer</p>
<input type="text" data-field="teamName" id="teamName">
<div class="tall"></div>
<script>
${bridgeClient()}
	var box = document.getElementById('box');
	function rect() { var r = box.getBoundingClientRect(); return { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) }; }
	document.getElementById('play').addEventListener('click', function () {
		var r = rect();
		document.getElementById('video-note').textContent = 'asked ' + JSON.stringify(r);
		send({ type: 'idea:video', videoId: 'Ctw7eI7A1IE', rect: r, clipTop: 0 });
	});
	document.getElementById('close').addEventListener('click', function () {
		document.getElementById('video-note').textContent = 'closed';
		send({ type: 'idea:video', videoId: null });
	});
	addEventListener('message', function (e) {
		var d = e.data;
		if (d && d.type === 'idea:video-state') document.getElementById('video-state').textContent = 'answer ' + d.videoId + ' open=' + d.open;
	});
	announce();
	reportHeight();
</script>
</body>
</html>
`;

const PHOTO_MANIFEST = {
	...WORKSHEET_MANIFEST,
	title: 'Photo box fixture',
	modules: [
		{
			...WORKSHEET_MANIFEST.modules[0],
			title: 'One module, with a picture block',
			blocks: [
				...WORKSHEET_MANIFEST.modules[0].blocks,
				{ id: 'mod-1.d.photo', field: 'photo', type: 'image' }
			]
		}
	]
};

/**
 * THE PHOTO FIXTURE (ledger 0368): the worksheet's manifest plus a picture
 * block, and a 4:3 box held open well below the top and off the left edge, so
 * a parent that drew at 0,0 or at the frame's own corner is visibly wrong. It
 * reports the box with `idea:image-box` after every `idea:state` and on a resize
 * (a timeout, never a ResizeObserver, which would post from inside a layout
 * callback), and withdraws it with a null rect while the Hide control has the
 * box hidden. It keeps its own fallback inside the box ("Saved: <name>"), which
 * the parent's opaque overlay covers, and it writes the parent's
 * `idea:image-box-state` answer into a note so a pass can read it.
 *
 * It also carries a Download button of the kind AUTHORING 9b prescribes, a
 * same-frame data: download, which fires only under `allow-downloads`.
 */
const PHOTO_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Photo box fixture</title>
<script type="application/json" id="idea-manifest">
${manifestJson(PHOTO_MANIFEST)}
</script>
<style>
	body { font: 16px/1.5 system-ui, sans-serif; margin: 0; padding: 1rem; background: #fff; color: #111; }
	h1 { font-size: 1.2rem; margin: 0 0 0.75rem; }
	label { display: block; margin: 0 0 0.75rem; }
	input[type="text"] { width: 100%; box-sizing: border-box; font: inherit; padding: 0.4rem; min-height: 44px; }
	.spacer { height: 240px; background: #eef1f4; margin: 0 0 1rem; }
	#box { width: min(calc(100% - 29px), 320px); aspect-ratio: 4 / 3; margin: 0 0 1rem 29px; border: 2px dashed #888; box-sizing: border-box; display: flex; align-items: center; justify-content: center; color: #444; }
	#box.is-hidden { display: none; }
	button, .dl { font: inherit; min-height: 44px; margin: 0 0.5rem 0.5rem 0; display: inline-flex; align-items: center; padding: 0 0.8rem; }
	.note { font: 13px/1.5 ui-monospace, monospace; color: #444; margin: 0.25rem 0; }
</style>
</head>
<body>
<h1>Photo box fixture</h1>
<label>Team name
	<input type="text" data-field="teamName" id="teamName">
</label>
<div class="spacer"></div>
<p>A photo of your part</p>
<div id="box" data-image-box="photo"><span id="box-fallback">No photo yet</span></div>
<button type="button" id="hide">Hide the box</button>
<a class="dl" id="download" href="data:text/plain;charset=utf-8,bridge%20fixture%20answers" download="answers.txt">Download my answers</a>
<p class="note" id="box-note">no box sent</p>
<p class="note" id="box-state">no answer</p>
<p class="note" id="state-note">no state yet</p>
<script>
${bridgeClient()}
	var box = document.getElementById('box');
	var fallback = document.getElementById('box-fallback');
	function sendBox() {
		var r = box.getBoundingClientRect();
		var rect = (r.width > 0 && r.height > 0)
			? { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) }
			: null;
		document.getElementById('box-note').textContent = 'sent ' + JSON.stringify(rect);
		send({ type: 'idea:image-box', field: 'photo', rect: rect, clipTop: 0 });
	}
	addEventListener('message', function (e) {
		var d = e.data;
		if (!d || typeof d !== 'object') return;
		if (d.type === 'idea:state') {
			var im = d.images && d.images.photo;
			fallback.textContent = im ? 'Saved: ' + im.name : 'No photo yet';
			sendBox();
		}
		if (d.type === 'idea:image-box-state') {
			document.getElementById('box-state').textContent = 'answer ' + d.field + ' shown=' + d.shown;
		}
	});
	var resizeTimer = 0;
	addEventListener('resize', function () {
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout(function () { sendBox(); reportHeight(); }, 100);
	});
	document.getElementById('hide').addEventListener('click', function () {
		var hidden = box.classList.toggle('is-hidden');
		this.textContent = hidden ? 'Show the box' : 'Hide the box';
		sendBox();
		reportHeight();
	});
	announce();
	reportHeight();
</script>
</body>
</html>
`;

const PROBE_MANIFEST = {
	schemaVersion: SCHEMA_VERSION,
	kind: 'html-assignment',
	title: 'Containment probe',
	course: 'IDEA209H',
	points: 0,
	modules: [
		{
			id: 'hx-probe',
			title: 'Every escape this document can attempt',
			points: 0,
			blocks: Object.entries(PROBE_FIELDS).map(([field, id]) => ({ id, field, type: 'text' })),
			criteria: [
				{
					id: 'c1',
					text: 'Nothing escaped',
					points: 0,
					levels: [
						{ points: 0, label: 'Contained', short: 'OK', descriptor: 'Every probe was refused.' },
						{ points: 0, label: 'Escaped', short: 'BAD', descriptor: 'A probe reached out of the frame.' },
						{ points: 0, label: 'Unknown', short: '?', descriptor: 'The probe did not report.' }
					]
				}
			]
		}
	]
};

/**
 * THE HOSTILE DOCUMENT. Every probe reports through the ORDINARY bridge -- an
 * `idea:change` on a field the manifest declares -- so the result travels the
 * exact path a student's answer travels, and a probe result appearing at all is
 * itself evidence the bridge works.
 *
 * EACH PROBE REPORTS `REFUSED: <error name>` OR `REACHED: <what it got>`, and
 * the distinction is the whole measurement. A control that asserted merely
 * "the probe did not crash the page" would pass in both directions.
 *
 * THE THREE MALFORMED MESSAGES AT THE END ARE THE OTHER HALF OF THE LANE. A
 * document naming a `block_id` directly, a document naming a block id in the
 * `field` slot, and a document naming a field nobody declared must all get
 * nowhere -- and "nowhere" is only observable if something tries.
 */
const PROBE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Containment probe</title>
<script type="application/json" id="idea-manifest">
${manifestJson(PROBE_MANIFEST)}
</script>
<style>
	body { font: 14px/1.6 ui-monospace, SFMono-Regular, monospace; margin: 0; padding: 1rem; background: #fff; color: #111; }
	h1 { font-size: 1rem; margin: 0 0 0.5rem; }
	li { margin: 0 0 0.25rem; }
	.reached { color: #a00; font-weight: 700; }
	.refused { color: #060; }
</style>
</head>
<body>
<h1>Containment probe</h1>
<ul id="results"></ul>
<script>
${bridgeClient()}
	function record(field, outcome) {
		send({ type: 'idea:change', field: field, value: outcome });
		var li = document.createElement('li');
		li.className = outcome.indexOf('REACHED') === 0 ? 'reached' : 'refused';
		li.textContent = field + ' -> ' + outcome;
		li.setAttribute('data-probe', field);
		document.getElementById('results').appendChild(li);
	}
	function attempt(field, fn) {
		var outcome;
		try {
			var v = fn();
			outcome = 'REACHED: ' + String(v).slice(0, 60);
		} catch (err) {
			outcome = 'REFUSED: ' + (err && err.name ? err.name : String(err));
		}
		record(field, outcome);
	}

	// 1. The parent's DOM. Throws unless the frame is same-origin with the page
	//    framing it, which is exactly what withholding allow-same-origin prevents.
	attempt('probeParent', function () { return window.parent.document.title; });

	// 2. The parent origin's cookies. An opaque origin has no cookie store and
	//    the getter throws; a same-origin frame reads ideabosco.com's, which are
	//    NOT httpOnly.
	attempt('probeCookie', function () { return 'cookie=' + document.cookie; });

	// 3. The parent origin's localStorage. The harness writes a sentinel into it
	//    before the frame loads, so a REACHED here does not merely say storage
	//    works -- it says this document read a value the PARENT put there.
	attempt('probeStorage', function () { return 'read ' + window.localStorage.getItem('hx-parent-sentinel'); });

	// 4. THIS DOCUMENT'S OWN ORIGIN. Not an escape attempt at all, which is why
	//    it does NOT go through attempt(): reading your own origin is ordinary,
	//    and reporting it as REACHED would count the sandbox WORKING as a leak.
	//    (It did, in the first measured run: the row read
	//    'REACHED: origin=null', which is the strongest possible evidence of
	//    containment, filed under the word for its opposite.) It reports the
	//    fact instead, and OPAQUE is the answer that means the sandbox held.
	record('probeOrigin', window.origin === 'null' ? 'OPAQUE: origin is null' : 'NAMED: ' + window.origin);

	// 5. Top-level navigation, refused by the absence of allow-top-navigation.
	//    MEASURED: Chrome THROWS SecurityError here, so this row reads
	//    'REFUSED: SecurityError' and the ordinary refusal path covers it.
	//    THE 'ATTEMPTED' BRANCH IS STILL HERE AND IS NOT DEAD WEIGHT. The
	//    console shows Chrome ALSO logging 'Unsafe attempt to initiate
	//    navigation', which is what a browser prints when it blocks a navigation
	//    without raising -- so blocking-without-throwing is a real behaviour of
	//    this refusal, and an engine that took only that path would return
	//    normally and look to the document exactly like success. The branch
	//    reports ATTEMPTED rather than guessing, and the PARENT decides: if the
	//    navigation had been honoured the harness page would BE example.com and
	//    there would be no report to read at all, so the harness asserts it is
	//    still on its own URL.
	//    NOTE: no backtick may appear anywhere inside these document strings --
	//    they ARE template literals, so one ends the literal and the parse error
	//    lands hundreds of lines away in whatever follows. One in a comment here
	//    cost exactly that.
	try {
		window.top.location.href = 'https://example.com/';
		record('probeTopNav', 'ATTEMPTED: set window.top.location.href');
	} catch (err) {
		record('probeTopNav', 'REFUSED: ' + (err && err.name ? err.name : String(err)));
	}

	// 6. EXFILTRATION, WHICH TAKES TWO PROBES BECAUSE TWO INDEPENDENT THINGS
	//    REFUSE IT AND ONLY ONE OF THEM IS THE CSP.
	//
	//    probeFetch reports the OUTCOME: did any bytes leave. It is the thing
	//    that actually matters and it is refused twice over -- by
	//    connect-src 'none', and, independently, by the opaque origin, which
	//    makes every request cross-origin so a response with no CORS headers is
	//    unreadable. MEASURED: relaxing connect-src to * changed this row NOT AT
	//    ALL (still 'REFUSED: TypeError'), because the second refusal was still
	//    standing. That is good news about the boundary and BAD news about the
	//    probe: an outcome that cannot move is not a control for that directive,
	//    and reporting it as one would have claimed coverage of connect-src that
	//    nothing had.
	//
	//    probeCsp is the control that IS sensitive to the directive. The document
	//    listens for its own securitypolicyviolation events and reports which
	//    effectiveDirective fired, so 'connect-src' appearing here is the policy
	//    doing the refusing, distinguishable from the origin doing it. A real CSP
	//    refusal fires this event and names its directive; the CORS failure does
	//    not fire anything.
	var cspSeen = [];
	addEventListener('securitypolicyviolation', function (e) {
		if (cspSeen.indexOf(e.effectiveDirective) === -1) cspSeen.push(e.effectiveDirective);
		record('probeCsp', 'ENFORCED: ' + cspSeen.join(','));
	});
	try {
		fetch('/hx-exfiltration-target', { method: 'POST', body: 'answers' })
			.then(function (r) { record('probeFetch', 'REACHED: status ' + r.status); })
			.catch(function (e) { record('probeFetch', 'REFUSED: ' + (e && e.name ? e.name : 'error')); });
	} catch (e) {
		record('probeFetch', 'REFUSED: ' + (e && e.name ? e.name : 'sync throw'));
	}
	// If nothing fired by the time the fetch has settled, the policy did not
	// refuse it -- which is the reading that must be visible rather than absent.
	setTimeout(function () { if (cspSeen.length === 0) record('probeCsp', 'NOT ENFORCED: no violation fired'); }, 1200);

	// THE THREE MESSAGES THAT MUST GET NOWHERE.
	// A frame naming a block_id directly is writing to an arbitrary row.
	send({ type: 'idea:change', block_id: 'mod-1.b.reflection', value: 'forged by block_id' });
	// The same attack wearing the field slot: a BLOCK ID is not a FIELD name.
	send({ type: 'idea:change', field: 'hx-probe.parent', value: 'forged by id-as-field' });
	// A field nobody declared has no block to land in.
	send({ type: 'idea:change', field: 'undeclaredField', value: 'forged by unknown field' });
	// A height past the ceiling is a page nobody can scroll.
	send({ type: 'idea:height', px: 99999999 });
	// A second ready at the wrong schema version.
	send({ type: 'idea:ready', schemaVersion: 2 });

	announce();
	reportHeight();
</script>
</body>
</html>
`;

/**
 * THE FIELD-BOX REPORTER (0238, AUTHORING 10c), the document's half of a note
 * pinned beside an answer. The parent names the fields that have a note with
 * `idea:feedback`; the document answers with `idea:field-box` for each one (the
 * picture box for a picture field, the input itself otherwise), withdraws a
 * field that left the list with a null rect, and sends again after anything
 * that moves a box (a state message, a resize). A document without it still
 * works: every note is in the list beside the worksheet.
 */
export function fieldBoxReporter(): string {
	return `
		var NOTE_FIELDS = [];
		var REPORTED = {};
		function fieldBoxOf(field) {
			var el = document.querySelector('[data-image-box="' + CSS.escape(field) + '"]') ||
				document.querySelector('[data-field="' + CSS.escape(field) + '"]');
			if (!el) return null;
			var r = el.getBoundingClientRect();
			if (!(r.width > 0 && r.height > 0)) return null;
			return { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) };
		}
		function reportFieldBoxes() {
			NOTE_FIELDS.forEach(function (field) {
				REPORTED[field] = true;
				send({ type: 'idea:field-box', field: field, rect: fieldBoxOf(field) });
			});
			Object.keys(REPORTED).forEach(function (field) {
				if (NOTE_FIELDS.indexOf(field) >= 0) return;
				delete REPORTED[field];
				send({ type: 'idea:field-box', field: field, rect: null });
			});
		}
		addEventListener('message', function (e) {
			var d = e.data;
			if (!d || typeof d !== 'object') return;
			if (d.type === 'idea:feedback' && Array.isArray(d.fields)) {
				NOTE_FIELDS = d.fields.filter(function (f) { return typeof f === 'string'; });
				reportFieldBoxes();
			}
			if (d.type === 'idea:state') setTimeout(reportFieldBoxes, 0);
		});
		var fieldBoxTimer = 0;
		addEventListener('resize', function () {
			clearTimeout(fieldBoxTimer);
			fieldBoxTimer = setTimeout(reportFieldBoxes, 100);
		});
	`;
}

/**
 * THE FEEDBACK FIXTURE (0238): the photo fixture's manifest with a written
 * answer and a picture box, both reported to the parent so its note pins can
 * be measured against where the boxes really are. It writes the fields the
 * parent named in a note so a pass can read the advisory message arrived.
 */
const FEEDBACK_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Feedback fixture</title>
<script type="application/json" id="idea-manifest">
${manifestJson({ ...PHOTO_MANIFEST, title: 'Feedback fixture' })}
</script>
<style>
	body { font: 16px/1.5 system-ui, sans-serif; margin: 0; padding: 1rem; background: #fff; color: #111; }
	h1 { font-size: 1.2rem; margin: 0 0 0.75rem; }
	label { display: block; margin: 0 0 0.75rem; max-width: 26rem; }
	input[type="text"], textarea { width: 100%; box-sizing: border-box; font: inherit; padding: 0.4rem; min-height: 44px; }
	textarea { min-height: 7rem; }
	#box { width: min(calc(100% - 29px), 320px); aspect-ratio: 4 / 3; margin: 0 0 1rem 29px; border: 2px dashed #888; box-sizing: border-box; display: flex; align-items: center; justify-content: center; color: #444; }
	.note { font: 13px/1.5 ui-monospace, monospace; color: #444; margin: 0.25rem 0; }
</style>
</head>
<body>
<h1>Feedback fixture</h1>
<label>Team name
	<input type="text" data-field="teamName" id="teamName">
</label>
<label>Reflection
	<textarea data-field="reflection" id="reflection"></textarea>
</label>
<p>A photo of your part</p>
<div id="box" data-image-box="photo"><span id="box-fallback">No photo yet</span></div>
<p class="note" id="feedback-note">no feedback fields yet</p>
<script>
${bridgeClient()}
${fieldBoxReporter()}
	var box = document.getElementById('box');
	function sendBox() {
		var r = box.getBoundingClientRect();
		var rect = (r.width > 0 && r.height > 0)
			? { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) }
			: null;
		send({ type: 'idea:image-box', field: 'photo', rect: rect, clipTop: 0 });
	}
	addEventListener('message', function (e) {
		var d = e.data;
		if (!d || typeof d !== 'object') return;
		if (d.type === 'idea:state') {
			var im = d.images && d.images.photo;
			document.getElementById('box-fallback').textContent = im ? 'Saved: ' + im.name : 'No photo yet';
			sendBox();
		}
		if (d.type === 'idea:feedback') {
			document.getElementById('feedback-note').textContent = 'notes on: ' + (d.fields || []).join(', ');
		}
	});
	addEventListener('resize', function () { setTimeout(function () { sendBox(); reportHeight(); }, 100); });
	announce();
	reportHeight();
</script>
</body>
</html>
`;

/**
 * THE LIVE THUMBNAIL FIXTURES (ledger 0396, report a6a037f3): the worksheet's
 * manifest and fields, plus a manifest `thumbnail` key and the
 * `<template id="idea-thumbnail">` it names, served by
 * `/hx/<id>/thumbnail` inside the thumbnail shell. Dev only.
 *
 *   thumb-gear         CSS animation, theme- and shape-aware, follows the
 *                      pointer the class page forwards over its overlay
 *   thumb-canvas       a requestAnimationFrame canvas loop, which the shim
 *                      holds while paused
 *   thumb-interactive  `"interactive": true`: its own buttons keep their
 *                      clicks, and a click anywhere else asks to open the post
 *   thumb-gear-quiet,  the first two with no reports, for frame timing
 *   thumb-canvas-quiet
 *   thumb-notemplate   a manifest naming `cam-thumbnail` over a document that
 *                      carries only `idea-thumbnail`, the typo an author
 *                      makes: its thumbnail route answers the 404, and 0268
 *                      records no live thumbnail for it
 *
 * EACH ONE REPORTS WHAT IT RECEIVED to the page with a `harness:` message (the
 * class page ignores any type it does not know), because the frame is an
 * opaque origin a test cannot read into: that report is how the browser pass
 * proves the bridge delivered a resize, a theme change and a pause.
 */
function thumbFixtureHtml(
	id: string,
	title: string,
	thumbnail: Record<string, unknown>,
	template: string,
	report = true
): string {
	const manifest = { ...WORKSHEET_MANIFEST, title, thumbnail };
	return [
		'<!doctype html>',
		'<html lang="en">',
		'<head>',
		'<meta charset="utf-8">',
		'<meta name="viewport" content="width=device-width, initial-scale=1">',
		'<title>' + title + '</title>',
		'<script type="application/json" id="idea-manifest">',
		manifestJson(manifest),
		'</script>',
		'<style>body { font: 16px/1.5 system-ui, sans-serif; margin: 0; padding: 1rem; background: #fff; color: #111; }</style>',
		'</head>',
		'<body>',
		'<h1>' + title + '</h1>',
		'<label>Team name <input type="text" data-field="teamName"></label>',
		'<label>What did your team change, and why? <textarea data-field="reflection"></textarea></label>',
		'<label><input type="checkbox" data-field="checkedOff"> Bench cleared</label>',
		'<template id="idea-thumbnail">',
		template,
		report ? thumbReporter(id) : '',
		'</template>',
		'<script>',
		bridgeClient(),
		'	announce();',
		'	reportHeight();',
		'</script>',
		'</body>',
		'</html>',
		''
	].join('\n');
}

/** The `harness:` report a thumbnail fixture sends on every state it is told. */
function thumbReporter(id: string): string {
	return [
		'<script>',
		'(function () {',
		"	var DOC = '" + id + "';",
		/* `layout` is what the thumbnail actually drew after it was told, read
		   off its own boxes (the gear's laid-out height, which its spin does not
		   move, and whether its label shows), so a pass can prove it re-laid
		   itself out rather than merely heard. */
		"	function layout() { var g = document.querySelector('.tg svg'), w = document.querySelector('.tg .w'); return g ? { gearH: Math.round(parseFloat(getComputedStyle(g).height)), label: !!(w && w.getClientRects().length) } : null; }",
		"	function tell(kind, extra) { try { parent.postMessage({ type: 'harness:thumb', doc: DOC, kind: kind, state: window.ideaThumbnail || null, extra: extra || null, layout: layout() }, '*'); } catch (e) {} }",
		"	addEventListener('idea:thumbnail', function () { tell('state'); });",
		"	addEventListener('idea:pointer', function (e) { if (e.detail && e.detail.inside) tell('pointer', e.detail); });",
		'})();',
		'</script>'
	].join('\n');
}

const THUMB_GEAR_TEMPLATE = [
	'<style>',
	'	:root { --tg-a: #1c4a2a; --tg-b: #0b1d12; --tg-ink: #9ff0a8; --tg-ink2: #e8c86a; }',
	'	:root[data-idea-scheme="light"] { --tg-a: #f2fbf3; --tg-b: #cfead5; --tg-ink: #1d6b2c; --tg-ink2: #7a5208; }',
	'	.tg { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 4%; overflow: hidden;',
	'		background: radial-gradient(circle at calc(var(--idea-pointer-x, 0.5) * 100%) calc(var(--idea-pointer-y, 0.5) * 100%), var(--tg-a), var(--tg-b) 75%);',
	'		color: var(--tg-ink); font: 700 15px/1.15 system-ui, sans-serif; }',
	'	:root[data-idea-shape="banner"] .tg { justify-content: flex-start; padding-left: 4%; }',
	'	.tg svg { height: 74%; aspect-ratio: 1; flex: none; animation: tg-spin 6s linear infinite; }',
	'	.tg svg.small { height: 46%; margin-left: calc(-0.12 * var(--idea-thumb-h, 48px)); color: var(--tg-ink2); animation-duration: 3.6s; animation-direction: reverse; }',
	'	:root[data-idea-pointer] .tg svg { animation-duration: 2s; }',
	'	:root[data-idea-pointer] .tg svg.small { animation-duration: 1.2s; }',
	'	.tg .w { display: none; margin-left: 3%; }',
	'	:root[data-idea-shape="wide"] .tg .w, :root[data-idea-shape="banner"] .tg .w { display: block; }',
	'	:root[data-idea-shape="wide"] .tg { flex-direction: column; }',
	'	:root[data-idea-shape="wide"] .tg svg { height: 52%; }',
	'	:root[data-idea-shape="wide"] .tg svg.small { display: none; }',
	'	@keyframes tg-spin { to { transform: rotate(360deg); } }',
	'</style>',
	'<div class="tg">',
	'	<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" stroke-width="14" stroke-dasharray="11 8.9"/><circle cx="50" cy="50" r="26" fill="none" stroke="currentColor" stroke-width="7"/><circle cx="50" cy="50" r="7" fill="currentColor"/></svg>',
	'	<svg class="small" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" stroke-width="16" stroke-dasharray="13.3 10.6"/><circle cx="50" cy="50" r="10" fill="currentColor"/></svg>',
	'	<span class="w">Gear ratios</span>',
	'</div>'
].join('\n');

const thumbCanvasTemplate = (report: boolean): string => [
	'<style> .tc { position: absolute; inset: 0; display: block; width: 100%; height: 100%; } </style>',
	'<canvas class="tc" id="tc" aria-hidden="true"></canvas>',
	'<script>',
	'(function () {',
	"	var c = document.getElementById('tc');",
	"	var ctx = c.getContext('2d');",
	'	var frames = 0, windowStart = 0, last = 0, longest = 0;',
	// Only a real change of size reallocates the canvas: every state message
	// (a pause, a theme) fires `idea:thumbnail`, and a reallocation per pause
	// is work a scrolling page would pay for in every frame on screen.
	'	function size() {',
	'		var d = Math.min(2, window.devicePixelRatio || 1);',
	'		var w = Math.max(1, Math.round(window.innerWidth * d)), h = Math.max(1, Math.round(window.innerHeight * d));',
	'		if (c.width !== w) c.width = w;',
	'		if (c.height !== h) c.height = h;',
	'	}',
	"	addEventListener('resize', size);",
	"	addEventListener('idea:thumbnail', size);",
	'	size();',
	'	function draw(now) {',
	'		if (!windowStart) windowStart = now;',
	'		if (last) longest = Math.max(longest, now - last);',
	'		last = now;',
	'		frames++;',
	"		var light = document.documentElement.getAttribute('data-idea-scheme') === 'light';",
	'		var w = c.width, h = c.height, r = Math.min(w, h) * 0.38, a = now / 900;',
	"		ctx.fillStyle = light ? '#eef3fb' : '#0e1726';",
	'		ctx.fillRect(0, 0, w, h);',
	'		ctx.save();',
	'		ctx.translate(w / 2, h / 2);',
	'		ctx.lineCap = "round";',
	'		for (var i = 0; i < 12; i++) {',
	'			var t = a + (i * Math.PI) / 6;',
	"			ctx.strokeStyle = 'hsla(' + (200 + i * 6) + ', 80%, ' + (light ? 38 : 66) + '%, ' + (0.35 + 0.65 * ((i + 1) / 12)) + ')';",
	'			ctx.lineWidth = Math.max(1.5, r * 0.12);',
	'			ctx.beginPath();',
	'			ctx.moveTo(Math.cos(t) * r * 0.35, Math.sin(t) * r * 0.35);',
	'			ctx.lineTo(Math.cos(t) * r, Math.sin(t) * r);',
	'			ctx.stroke();',
	'		}',
	'		ctx.restore();',
	'		if (now - windowStart >= 1000) {',
	report
		? "			try { parent.postMessage({ type: 'harness:fps', doc: 'thumb-canvas', fps: Math.round((frames * 1000) / (now - windowStart)), longest: Math.round(longest) }, '*'); } catch (e) {}"
		: '',
	'			frames = 0; windowStart = now; longest = 0;',
	'		}',
	'		requestAnimationFrame(draw);',
	'	}',
	'	requestAnimationFrame(draw);',
	'})();',
	'</script>'
].join('\n');

const THUMB_INTERACTIVE_TEMPLATE = [
	'<style>',
	'	:root { --ti-bg: #241a3a; --ti-ink: #d9ccff; --ti-key: #3a2d5c; }',
	'	:root[data-idea-scheme="light"] { --ti-bg: #f1ecff; --ti-ink: #3d2a7a; --ti-key: #ffffff; }',
	'	.ti { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 6px; background: var(--ti-bg); color: var(--ti-ink); font: 700 14px/1 system-ui, sans-serif; }',
	'	.ti button { min-width: 32px; min-height: 32px; border-radius: 6px; border: 1px solid currentColor; background: var(--ti-key); color: inherit; font: inherit; cursor: pointer; }',
	'	.ti output { min-width: 2ch; text-align: center; }',
	'	.ti .unit { font-size: 0.8em; font-weight: 600; }',
	/* AUTHORING 10d: a control too small to press in a Tile is shown only in
	   Wide and Banner. In a Tile the count is drawn and no control is, so a
	   press there is on nothing the thumbnail handles and opens the post. */
	'	:root[data-idea-shape="tile"] .ti { flex-direction: column; gap: 0; font-size: 13px; line-height: 1.05; }',
	'	:root[data-idea-shape="tile"] .ti button { display: none; }',
	'	:root[data-idea-shape="tile"] .ti .unit { font-size: 9px; }',
	'</style>',
	'<div class="ti" id="ti">',
	'	<button type="button" id="ti-down" aria-label="Fewer teeth">-</button>',
	'	<output id="ti-n">12</output>',
	'	<span class="unit">teeth</span>',
	'	<button type="button" id="ti-up" aria-label="More teeth">+</button>',
	'</div>',
	'<script>',
	'(function () {',
	'	var n = 12;',
	"	function show() { document.getElementById('ti-n').textContent = String(n); try { parent.postMessage({ type: 'harness:interactive', doc: 'thumb-interactive', n: n }, '*'); } catch (e) {} }",
	"	document.getElementById('ti-up').addEventListener('click', function () { n++; show(); });",
	"	document.getElementById('ti-down').addEventListener('click', function () { n = Math.max(1, n - 1); show(); });",
	'})();',
	'</script>'
].join('\n');

const THUMB_GEAR_HTML = thumbFixtureHtml('thumb-gear', 'Gear ratios (live thumbnail)', { kind: 'html', template: 'idea-thumbnail' }, THUMB_GEAR_TEMPLATE);
const THUMB_CANVAS_HTML = thumbFixtureHtml('thumb-canvas', 'Spokes (canvas thumbnail)', { kind: 'html', template: 'idea-thumbnail' }, thumbCanvasTemplate(true));
/* The same two thumbnails with no `harness:` reports, for frame timing: a
   report per state change is the harness measuring itself, and a real
   thumbnail sends nothing back but its one `idea:thumb-ready`. */
const THUMB_GEAR_QUIET_HTML = thumbFixtureHtml('thumb-gear-quiet', 'Gear ratios (live thumbnail)', { kind: 'html', template: 'idea-thumbnail' }, THUMB_GEAR_TEMPLATE, false);
const THUMB_CANVAS_QUIET_HTML = thumbFixtureHtml('thumb-canvas-quiet', 'Spokes (canvas thumbnail)', { kind: 'html', template: 'idea-thumbnail' }, thumbCanvasTemplate(false), false);
const THUMB_NOTEMPLATE_HTML = thumbFixtureHtml(
	'thumb-notemplate',
	'Cam profiles (its manifest names a template it lacks)',
	{ kind: 'html', template: 'cam-thumbnail' },
	THUMB_GEAR_TEMPLATE
);
const THUMB_INTERACTIVE_HTML = thumbFixtureHtml(
	'thumb-interactive',
	'Tooth counter (interactive thumbnail)',
	{ kind: 'html', template: 'idea-thumbnail', interactive: true },
	THUMB_INTERACTIVE_TEMPLATE
);

const DOCUMENTS: Record<string, HxDocument> = {
	worksheet: { html: WORKSHEET_HTML, devOnly: false, fieldToBlockId: WORKSHEET_FIELDS },
	probe: { html: PROBE_HTML, devOnly: true, fieldToBlockId: PROBE_FIELDS },
	video: { html: VIDEO_HTML, devOnly: true, fieldToBlockId: WORKSHEET_FIELDS },
	photo: { html: PHOTO_HTML, devOnly: true, fieldToBlockId: PHOTO_FIELDS },
	feedback: { html: FEEDBACK_HTML, devOnly: true, fieldToBlockId: PHOTO_FIELDS },
	'thumb-gear': { html: THUMB_GEAR_HTML, devOnly: true, fieldToBlockId: WORKSHEET_FIELDS },
	'thumb-canvas': { html: THUMB_CANVAS_HTML, devOnly: true, fieldToBlockId: WORKSHEET_FIELDS },
	'thumb-interactive': { html: THUMB_INTERACTIVE_HTML, devOnly: true, fieldToBlockId: WORKSHEET_FIELDS },
	'thumb-gear-quiet': { html: THUMB_GEAR_QUIET_HTML, devOnly: true, fieldToBlockId: WORKSHEET_FIELDS },
	'thumb-canvas-quiet': { html: THUMB_CANVAS_QUIET_HTML, devOnly: true, fieldToBlockId: WORKSHEET_FIELDS },
	'thumb-notemplate': { html: THUMB_NOTEMPLATE_HTML, devOnly: true, fieldToBlockId: WORKSHEET_FIELDS }
};

/** Every document id this module can answer for, in a stable order. */
export const HX_DOCUMENT_IDS = Object.keys(DOCUMENTS).sort();

/**
 * One document by id, or null.
 *
 * `Object.hasOwn` for the same reason `bridge.ts` uses it: `docId` comes
 * straight off the URL, and a bare lookup on a plain object resolves
 * `constructor` and `toString` through the prototype chain.
 */
export function hxDocument(docId: string, isDev: boolean): HxDocument | null {
	if (!Object.hasOwn(DOCUMENTS, docId)) return null;
	const doc = DOCUMENTS[docId];
	if (doc.devOnly && !isDev) return null;
	return doc;
}

/**
 * The field map a parent would hold for a document, or an empty map. Read by
 * the dev harness, which has no import path to have stored one from; the real
 * surface reads what it stored and never calls this.
 */
export function hxFieldMap(docId: string, isDev: boolean): Record<string, string> {
	return hxDocument(docId, isDev)?.fieldToBlockId ?? {};
}
