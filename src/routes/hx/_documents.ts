/**
 * THE TWO DEV FIXTURES `/hx/<docId>` SERVES, WHICH ARE NOT AND NEVER WERE ROWS.
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

const DOCUMENTS: Record<string, HxDocument> = {
	worksheet: { html: WORKSHEET_HTML, devOnly: false, fieldToBlockId: WORKSHEET_FIELDS },
	probe: { html: PROBE_HTML, devOnly: true, fieldToBlockId: PROBE_FIELDS }
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
