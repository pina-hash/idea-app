/**
 * THE HARNESS'S FOUR DOCUMENTS, built from ONE manifest generator so the only
 * thing that differs between them is the set of block ids -- which is the only
 * variable the re-upload diff has.
 *
 * IT IS A `.ts` MODULE BESIDE THE ROUTE AND NOT AN EXPORT FROM `+page.svelte`,
 * so a test can import it without mounting anything. (A `+server.ts` may only
 * export methods and `_`-prefixed names; this is neither, but the same instinct
 * applies -- a fixture a test has to mount a page to reach is one no test
 * reaches.)
 *
 * THE DOCUMENTS ARE REAL AND GO THROUGH THE REAL IMPORTER. Nothing here is a
 * pre-parsed manifest object: the harness hands the composer a `File` and
 * `validateHtmlManifest` reads the manifest out of the bytes, exactly as it
 * does for a document a teacher exported. A fixture that skipped that step
 * would prove nothing about the path a teacher actually walks.
 */

/** Which of the four the caller wants. `stored` is what is already on the item;
    the other three are what a teacher might upload over it. */
export type HxHarnessShape = 'stored' | 'kept' | 'renamed' | 'added';

/** The block ids each shape declares, which IS the fixture. Read these to know
    what the diff should say; nothing computes them from the diff. */
export const HX_HARNESS_BLOCKS: Record<HxHarnessShape, string[]> = {
	// What is on the assignment now: three answer blocks and a header field.
	stored: ['b-setup', 'b-reading', 'b-error'],
	// A corrected document: same three ids, different prose. Nothing orphans.
	kept: ['b-setup', 'b-reading', 'b-error'],
	// `b-reading` renamed to `b-passes`. Every answer under the old id orphans.
	renamed: ['b-setup', 'b-passes', 'b-error'],
	// A fourth block added. Nothing is stored under it yet.
	added: ['b-setup', 'b-reading', 'b-error', 'b-fix']
};

const TITLES: Record<HxHarnessShape, string> = {
	stored: 'Bench setup',
	kept: 'Bench setup, corrected',
	renamed: 'Bench setup, block renamed',
	added: 'Bench setup, extra step'
};

const PROMPTS = [
	'Set the vise square to the table and say how you checked it',
	'Record both micrometer readings',
	'Say where most of the error came from',
	'Say what you changed and what the next part measured'
];

interface Block {
	id: string;
	field: string;
	type: 'longText';
	minSentences: number;
}

function manifestFor(shape: HxHarnessShape) {
	const ids = HX_HARNESS_BLOCKS[shape];
	return {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: TITLES[shape],
		course: 'IDEA100',
		points: ids.length * 2,
		// THE HEADER IS IN EVERY SHAPE AND NEVER MOVES, so a diff that reported
		// it as changed would be reporting on its own walk rather than on the
		// documents. It is also the one block a modules-only walk would miss.
		header: [{ id: 'who', field: 'studentName', type: 'text' as const }],
		modules: ids.map((id, i) => ({
			id: `m${i + 1}`,
			title: PROMPTS[i] ?? `Step ${i + 1}`,
			points: 2,
			audience: 'individual' as const,
			blocks: [
				{ id, field: `f${i + 1}`, type: 'longText', minSentences: 1 } satisfies Block
			],
			criteria: [
				{
					id: `m${i + 1}-c`,
					text: `${PROMPTS[i] ?? `Step ${i + 1}`}, with the measurement behind it`,
					points: 2,
					levels: [
						{
							points: 2,
							label: 'Complete',
							short: 'Recorded and backed',
							descriptor: 'States what was done and the value behind it.'
						},
						{
							points: 1,
							label: 'Developing',
							short: 'Recorded only',
							descriptor: 'States what was done with no value behind it.'
						},
						{
							points: 0,
							label: 'Absent',
							short: 'Not recorded',
							descriptor: 'Not attempted.'
						}
					]
				}
			]
		}))
	};
}

export interface HxHarnessDocument {
	filename: string;
	html: string;
	/** The ids this document declares, header first. What the diff is measured
	    against, read off the fixture rather than computed by the code. */
	blockIds: string[];
}

/**
 * The whole document, with a `[data-field]` for every field the manifest
 * declares -- which is what the importer requires of a real one.
 */
export function hxHarnessDocument(shape: HxHarnessShape): HxHarnessDocument {
	const m = manifestFor(shape);
	const fields = [
		...m.header.map((b) => b.field),
		...m.modules.flatMap((mod) => mod.blocks.map((b) => b.field))
	];
	const inputs = m.modules
		.map(
			(mod, i) =>
				`    <section class="mod">\n` +
				`      <h2>${mod.title}</h2>\n` +
				`      <textarea data-field="${mod.blocks[0].field}" rows="3"></textarea>\n` +
				`    </section>`
		)
		.join('\n');
	const html = [
		'<!doctype html>',
		'<html lang="en">',
		'<head>',
		'  <meta charset="utf-8">',
		`  <title>${m.title}</title>`,
		'  <style>body{font-family:system-ui;margin:1rem}textarea{width:100%}</style>',
		'</head>',
		'<body>',
		`  <h1>${m.title}</h1>`,
		'  <p>Name: <input data-field="studentName"></p>',
		inputs,
		`  <script type="application/json" id="idea-manifest">${JSON.stringify(m)}<\/script>`,
		// A REAL BRIDGE, not a stub. The importer refuses a document that never
		// posts `idea:ready` -- correctly, because a worksheet the parent never
		// seeds is one that takes typing and saves nothing -- so a fixture
		// without one is a fixture that could never be posted. It is the
		// smallest honest implementation of the frozen contract: announce, seed
		// on `idea:state`, report every edit as `idea:change`.
		'  <script>',
		'    (function () {',
		'      var fields = function () { return document.querySelectorAll("[data-field]"); };',
		'      window.addEventListener("message", function (e) {',
		'        var m = e.data;',
		'        if (!m || m.type !== "idea:state") return;',
		'        var values = m.values || {};',
		'        fields().forEach(function (el) {',
		'          var name = el.getAttribute("data-field");',
		'          if (name in values) el.value = values[name];',
		'        });',
		'      });',
		'      document.addEventListener("input", function (e) {',
		'        var el = e.target;',
		'        if (!el || !el.getAttribute) return;',
		'        var name = el.getAttribute("data-field");',
		'        if (!name) return;',
		'        parent.postMessage(',
		'          { type: "idea:change", schemaVersion: 3, field: name, value: el.value },',
		'          "*"',
		'        );',
		'      });',
		'      parent.postMessage({ type: "idea:ready", schemaVersion: 3 }, "*");',
		'    })();',
		'  <\/script>',
		'</body>',
		'</html>'
	].join('\n');
	return {
		filename: `${shape}.html`,
		html,
		blockIds: [...m.header.map((b) => b.id), ...m.modules.flatMap((mod) => mod.blocks.map((b) => b.id))]
	};
}

/** The manifest the harness stores as "already on the item", as the page
    payload holds it: plain jsonb that nothing has re-validated. */
export function hxHarnessStoredManifest(): unknown {
	return manifestFor('stored');
}
