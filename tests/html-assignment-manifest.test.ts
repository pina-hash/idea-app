// tests/html-assignment-manifest.test.ts
//
// The import gate for a ported HTML assignment: reading the manifest out of a
// document, refusing a document rather than accepting part of one, and the
// staging rules in front of both.
//
// WHY THIS IS A TEST AND NOT A HARNESS PASS. Almost everything here fails
// SILENTLY. A block id that duplicates another writes two answers into one row
// and the student sees one of them. A `[data-field]` the manifest does not
// declare takes a student's typing and drops it, with no error anywhere -- the
// input works, the frame reports the change, and the parent has nothing to map
// it to. A staged document cleared after a failed write looks exactly like one
// that was never picked. None of that shows on screen the first time somebody
// looks, which is the bar `CLAUDE.md` sets for writing a test at all.
//
// WHERE THE EXPECTED VALUES COME FROM. The fixtures are built by hand from the
// contract and from IDEA_RUBRIC_STANDARDS, and each malformed one is a single
// edit away from a manifest already proven to be accepted, so a refusal is
// attributable to that edit and to nothing else. The legal fixture is asserted
// FIRST as the positive control: an all-refusing validator passes every negative
// case and is exactly as broken as an all-accepting one.
//
// THE SQL SIDE OF THE SAME CORPUS is `tests/db/html-assignment-manifest.test.ts`,
// which puts every fixture here to `_classroom_check_html_manifest` as well --
// a document the importer accepts and the boundary refuses is a teacher told
// the upload is fine and then told it is not.

import { describe, expect, it } from 'vitest';
import {
	documentFields,
	documentText,
	extractManifestScript,
	fieldBlockMap,
	manifestBlocks,
	validateHtmlManifest,
	type HtmlAssignmentManifest
} from '../src/lib/classroom/html-assignment/manifest';
import {
	HTML_DOCUMENT_MAX_BYTES,
	applyStagedHtmlAssignment,
	readStagedHtml,
	stageHtmlDocument,
	stagedHtmlIssue,
	stagedHtmlSummary,
	type StagedHtmlAssignment
} from '../src/lib/classroom/html-assignment/store';
import { validateSpec } from '../src/lib/classroom/assignment-spec';

type Json = Record<string, unknown>;

function legalManifest(): Json {
	return {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Tolerance stack',
		course: 'IDEA100',
		points: 6,
		modules: [
			{
				id: 'stack',
				title: 'Stack up the tolerances',
				points: 6,
				audience: 'individual',
				blocks: [
					{ id: 'stack-total', field: 'total', type: 'text' },
					{ id: 'stack-why', field: 'why', type: 'longText', minSentences: 2 }
				],
				criteria: [
					{
						id: 'arithmetic',
						text: 'The stack arithmetic is correct',
						points: 4,
						levels: [
							{ points: 4, label: 'Complete', short: 'All four correct', descriptor: 'All four dimensions summed correctly.' },
							{ points: 3, label: 'Proficient', short: 'Three correct', descriptor: 'Three of four dimensions summed correctly.' },
							{ points: 1, label: 'Developing', short: 'Two correct', descriptor: 'Two of four dimensions summed correctly.' },
							{ points: 0, label: 'Absent', short: 'Fewer than two', descriptor: 'Fewer than two correct, or not attempted.' }
						]
					},
					{
						id: 'reasoning',
						text: 'The worst case is named and justified',
						points: 2,
						levels: [
							{ points: 2, label: 'Complete', short: 'Named and justified', descriptor: 'Names the worst case and cites the measured value.' },
							{ points: 1, label: 'Developing', short: 'Named only', descriptor: 'Names the worst case with no value behind it.' },
							{ points: 0, label: 'Absent', short: 'Not named', descriptor: 'Does not name a worst case.' }
						]
					}
				]
			}
		]
	};
}

function documentFor(manifest: Json | string, fields: string[] = ['total', 'why']): string {
	const inputs = fields.map((f) => `<input data-field="${f}">`).join('\n    ');
	const json = typeof manifest === 'string' ? manifest : JSON.stringify(manifest);
	return [
		'<html><head><title>Tolerance stack</title></head><body>',
		'  <h1>Tolerance stack</h1>',
		`  <form>\n    ${inputs}\n  </form>`,
		`  <script type="application/json" id="idea-manifest">${json}<\/script>`,
		/*
			THE HANDSHAKE, BECAUSE THIS FIXTURE STANDS FOR A DOCUMENT THAT WORKS.
			`validateHtmlManifest` refuses a document that never sends
			`idea:ready` -- without it the parent never posts `idea:state`, so
			nothing is seeded and every answer arrives before anything is
			listening. Until ledger 0141 nothing checked, and this builder emitted
			a document with no bridge code in it at all: every test below was
			therefore asserting the manifest rules against a worksheet that could
			not have stored a single answer. Adding it is not appeasing the new
			check, it is the fixture becoming what it always claimed to be.
		*/
		`  <script>parent.postMessage({ type: 'idea:ready', schemaVersion: 3 }, '*');<\/script>`,
		'</body></html>'
	].join('\n');
}

function htmlFile(name: string, body: string, type = 'text/html'): File {
	return new File([body], name, { type });
}

describe('reading the manifest out of a document', () => {
	it('finds it by BOTH its type and its id', () => {
		const doc = [
			'<script type="application/json" id="other">{"not":"it"}<\/script>',
			'<script id="idea-manifest">{"also":"not it"}<\/script>',
			'<script type="application/json" id="idea-manifest">{"yes":1}<\/script>'
		].join('\n');
		const found = extractManifestScript(doc);
		expect(found.count).toBe(1);
		expect(JSON.parse(found.json!)).toEqual({ yes: 1 });
	});

	it('refuses two manifests rather than taking the first', () => {
		const doc = documentFor(legalManifest()) + documentFor(legalManifest());
		expect(extractManifestScript(doc).count).toBe(2);
		const result = validateHtmlManifest(doc);
		expect(result.manifest).toBeNull();
		expect(result.errors.join(' ')).toMatch(/exactly one/);
	});

	it('says so when there is no manifest at all, and when it is not JSON', () => {
		expect(validateHtmlManifest('<html><body>Nothing here</body></html>').errors.join(' '))
			.toMatch(/carries no manifest/);
		expect(validateHtmlManifest(documentFor('{ not json')).errors.join(' '))
			.toMatch(/not valid JSON/);
	});
});

describe('which [data-field] attributes the document actually has', () => {
	it('reads them whatever the quoting, and dedupes', () => {
		const doc = `<input data-field="a"><input data-field='b'><textarea data-field=c></textarea><input data-field="a">`;
		expect(documentFields(doc)).toEqual(['a', 'b', 'c']);
	});

	it('IGNORES a data-field inside a comment or inside the document\'s own script', () => {
		// Both are shapes a ported document routinely carries: a commented-out
		// input, and an autosave routine that enumerates its own field names.
		// Counting either makes a sound manifest look incomplete.
		const doc = [
			'<!-- <input data-field="removed"> -->',
			'<input data-field="real">',
			'<script>const fields = [" data-field=\\"listed\\" "];<\/script>',
			'<style>/* <input data-field="styled"> */<\/style>'
		].join('\n');
		expect(documentFields(doc)).toEqual(['real']);
	});

	it('reads the document text without its markup, scripts or styles', () => {
		const text = documentText(
			'<h1>Title</h1><script>var weekday = 1;<\/script><p>Body&nbsp;text</p>'
		);
		expect(text).toBe('Title Body text');
	});
});

describe('the validator refuses rather than repairing', () => {
	it('accepts a legal document, and returns the manifest [positive control]', () => {
		const manifest = legalManifest();
		const result = validateHtmlManifest(documentFor(manifest));
		expect(result.errors).toEqual([]);
		expect(result.manifest).toEqual(manifest);
	});

	/**
	 * ONE EDIT EACH, and the assertion is on the SUBSTANCE of the message rather
	 * than its wording: a case keyed on the exact sentence has to be rewritten
	 * every time the wording improves, which is how a suite starts recording
	 * behaviour instead of checking it.
	 */
	const cases: [string, (m: Json) => void, RegExp, string[]?][] = [
		[
			'two levels',
			(m) => {
				const c = ((m.modules as Json[])[0].criteria as Json[])[0];
				const levels = c.levels as Json[];
				c.levels = [levels[0], levels[3]];
			},
			/pass\/fail check|3 or 4 levels/i
		],
		[
			'one level',
			(m) => {
				const c = ((m.modules as Json[])[0].criteria as Json[])[0];
				c.levels = [(c.levels as Json[])[0]];
			},
			/3 or 4 levels/i
		],
		[
			'a criterion worth 1 carrying three levels',
			(m) => {
				m.points = 5;
				(m.modules as Json[])[0].points = 5;
				((m.modules as Json[])[0].criteria as Json[])[1] = {
					id: 'reasoning',
					text: 'The worst case is named',
					points: 1,
					levels: [
						{ points: 1, label: 'Complete', short: 'Named', descriptor: 'Names it.' },
						{ points: 1, label: 'Developing', short: 'Partly named', descriptor: 'Gestures at it.' },
						{ points: 0, label: 'Absent', short: 'Not named', descriptor: 'Does not name one.' }
					]
				};
			},
			/distinct values above zero/
		],
		[
			'a duplicated block id, across two modules',
			(m) => {
				const second = JSON.parse(JSON.stringify((m.modules as Json[])[0])) as Json;
				second.id = 'second';
				(second.blocks as Json[])[0].field = 'second-total';
				(second.blocks as Json[])[1].field = 'second-why';
				m.points = 12;
				(m.modules as Json[]).push(second);
			},
			/Duplicate block id/,
			['total', 'why', 'second-total', 'second-why']
		],
		[
			'a criterion id repeated inside one module',
			(m) => {
				((m.modules as Json[])[0].criteria as Json[])[1].id = 'arithmetic';
			},
			/repeats the criterion id/
		],
		[
			'modules not summing to the declared total',
			(m) => {
				m.points = 7;
			},
			/Modules sum to 6 points but the manifest declares 7/
		],
		[
			'criteria not summing to their module',
			(m) => {
				m.points = 7;
				(m.modules as Json[])[0].points = 7;
			},
			/criteria sum to 6 but the module is worth 7/
		],
		[
			'a criterion whose points disagree with its top level',
			(m) => {
				((m.modules as Json[])[0].criteria as Json[])[0].points = 3;
			},
			/declares 3 points but its top level is worth 4/
		],
		[
			'a level with no short form',
			(m) => {
				delete (((m.modules as Json[])[0].criteria as Json[])[0].levels as Json[])[0].short;
			},
			/needs a short form/
		],
		[
			'a short over six words',
			(m) => {
				(((m.modules as Json[])[0].criteria as Json[])[0].levels as Json[])[0].short =
					'Every single one of the four dimensions correct';
			},
			/is 8 words; the maximum is 6/
		],
		[
			'a short ending in punctuation',
			(m) => {
				(((m.modules as Json[])[0].criteria as Json[])[0].levels as Json[])[0].short =
					'All four correct.';
			},
			/ends in punctuation/
		],
		[
			'a block id outside the response-row pattern',
			(m) => {
				((m.modules as Json[])[0].blocks as Json[])[0].id = 'stack total!';
			},
			/needs an id/
		],
		[
			'two blocks claiming one field',
			(m) => {
				((m.modules as Json[])[0].blocks as Json[])[1].field = 'total';
			},
			/both claim the field/
		],
		[
			'an unknown block type',
			(m) => {
				((m.modules as Json[])[0].blocks as Json[])[0].type = 'signature';
			},
			/must be one of/
		],
		[
			'the wrong schema version',
			(m) => {
				m.schemaVersion = 2;
			},
			/needs schemaVersion 3/
		],
		[
			'the wrong kind',
			(m) => {
				m.kind = 'assignment';
			},
			/needs kind "html-assignment"/
		],
		[
			'a weekday in a criterion',
			(m) => {
				((m.modules as Json[])[0].criteria as Json[])[0].text =
					'The stack arithmetic is correct by Friday';
			},
			/names a weekday \("Friday"\)/
		],
		[
			'a British spelling in a descriptor',
			(m) => {
				(((m.modules as Json[])[0].criteria as Json[])[0].levels as Json[])[0].descriptor =
					'All four dimensions summed correctly, from the tolerance centre.';
			},
			/British spellings: centre/
		]
	];

	// A sweep that generated nothing passes vacuously.
	it('has a corpus', () => expect(cases.length).toBe(18));

	it.each(cases)('refuses %s', (_name, edit, pattern, fields) => {
		const manifest = legalManifest();
		edit(manifest);
		const result = validateHtmlManifest(documentFor(manifest, fields));
		expect(result.manifest).toBeNull();
		expect(result.errors.join('\n')).toMatch(pattern);
	});

	it('names the missing room BEFORE the descent, on a 1-point criterion', () => {
		// [1, 1, 0] is the only three-level shape a 1-point criterion can take,
		// so the descent rule fires on it too. An author who reads that first
		// rewrites levels that were never the problem.
		const manifest = legalManifest();
		cases.find(([n]) => n === 'a criterion worth 1 carrying three levels')![1](manifest);
		const errors = validateHtmlManifest(documentFor(manifest)).errors;
		const room = errors.findIndex((e) => /distinct values above zero/.test(e));
		const descent = errors.findIndex((e) => /must be worth less than the level above/.test(e));
		expect(room).toBeGreaterThanOrEqual(0);
		expect(descent).toBeGreaterThanOrEqual(0);
		expect(room).toBeLessThan(descent);
	});

	it('collects every problem at once rather than stopping at the first', () => {
		const manifest = legalManifest();
		manifest.points = 7;
		delete (((manifest.modules as Json[])[0].criteria as Json[])[0].levels as Json[])[0].short;
		((manifest.modules as Json[])[0].blocks as Json[])[0].id = 'not a legal id';
		const errors = validateHtmlManifest(documentFor(manifest)).errors;
		// An author fixing one refusal per upload round trip abandons the format.
		expect(errors.length).toBeGreaterThanOrEqual(3);
	});
});

describe('the document and the manifest have to describe the same inputs', () => {
	it('refuses a manifest field the document has no [data-field] for', () => {
		const result = validateHtmlManifest(documentFor(legalManifest(), ['total']));
		expect(result.manifest).toBeNull();
		expect(result.errors.join(' ')).toMatch(/no \[data-field\] for: why/);
	});

	it('refuses a [data-field] the manifest does not declare', () => {
		const result = validateHtmlManifest(documentFor(legalManifest(), ['total', 'why', 'stray']));
		expect(result.manifest).toBeNull();
		expect(result.errors.join(' ')).toMatch(/does not declare: stray/);
	});

	it('refuses a weekday and a British spelling in the DOCUMENT, not only the manifest', () => {
		// Nearly all the prose in a ported assignment is in the document, so a
		// check that only read the manifest would essentially never fire.
		const doc = documentFor(legalManifest()).replace(
			'<h1>Tolerance stack</h1>',
			'<h1>Tolerance stack</h1><p>Due Friday. Measure from the centre of the hole.</p>'
		);
		const errors = validateHtmlManifest(doc).errors.join('\n');
		expect(errors).toMatch(/The document names a weekday \("Friday"\)/);
		expect(errors).toMatch(/The document uses British spellings: centre/);
	});
});

describe('header blocks: identity fields that carry no points', () => {
	/**
	 * They exist because ledger 0128's real port had to invent a 0-POINT MODULE
	 * to hold the student's name, and a 0-point module renders in the grading
	 * console as something to score.
	 */
	function withHeader(): Json {
		const m = legalManifest();
		m.header = [
			{ id: 'who', field: 'student-name', type: 'text' },
			{ id: 'team', field: 'team-name', type: 'text' }
		];
		return m;
	}
	const headerFields = ['student-name', 'team-name', 'total', 'why'];

	it('accepts them, and they change no point sum [positive control]', () => {
		const m = withHeader();
		const result = validateHtmlManifest(documentFor(m, headerFields));
		expect(result.errors).toEqual([]);
		// Still 6: an identity field is not worth marks and appears in no sum.
		expect(result.manifest!.points).toBe(6);
	});

	it('maps them like any other block, so a name is not dropped', () => {
		const manifest = validateHtmlManifest(documentFor(withHeader(), headerFields))
			.manifest as HtmlAssignmentManifest;
		// The failure this guards is quiet: the frame reports the name, the
		// parent has no entry for it, and the student's name is dropped.
		expect(fieldBlockMap(manifest).get('student-name')).toBe('who');
		expect(manifestBlocks(manifest).map((b) => b.id)).toEqual([
			'who',
			'team',
			'stack-total',
			'stack-why'
		]);
	});

	it('refuses a header id that collides with a module block id', () => {
		const m = withHeader();
		(m.header as Json[])[0].id = 'stack-total';
		const errors = validateHtmlManifest(documentFor(m, headerFields)).errors.join(' ');
		expect(errors).toMatch(/Duplicate block id "stack-total"/);
	});

	it('refuses a header field the document has no [data-field] for', () => {
		const errors = validateHtmlManifest(
			documentFor(withHeader(), ['student-name', 'total', 'why'])
		).errors.join(' ');
		expect(errors).toMatch(/no \[data-field\] for: team-name/);
	});

	it('refuses a header block that declares points', () => {
		const m = withHeader();
		(m.header as Json[])[0].points = 2;
		const errors = validateHtmlManifest(documentFor(m, headerFields)).errors.join(' ');
		// The 0-point module problem in a smaller costume.
		expect(errors).toMatch(/Identity fields carry none/);
	});

	it('refuses a header that is not an array', () => {
		const m = legalManifest();
		m.header = { who: 'me' };
		expect(validateHtmlManifest(documentFor(m)).errors.join(' ')).toMatch(
			/header must be an array/
		);
	});

	it('is optional: a manifest with no header is unchanged [positive control]', () => {
		expect(validateHtmlManifest(documentFor(legalManifest())).errors).toEqual([]);
	});
});

describe('a table is one block', () => {
	it('takes ONE data-field for the whole table, and refuses a per-cell one', () => {
		// The real defect: `addMfgRow()` minted `mfg-06-p`, a field no manifest
		// names, so the parent could only drop it silently. That is the
		// orphaning the id/field split exists to prevent, through a door the
		// split did not cover.
		const m = legalManifest();
		((m.modules as Json[])[0].blocks as Json[])[1] = {
			id: 'mfg',
			field: 'mfg-table',
			type: 'table'
		};
		expect(validateHtmlManifest(documentFor(m, ['total', 'mfg-table'])).errors).toEqual([]);
		const perCell = validateHtmlManifest(
			documentFor(m, ['total', 'mfg-table', 'mfg-06-p'])
		).errors.join(' ');
		expect(perCell).toMatch(/does not declare: mfg-06-p/);
	});
});

describe('the mapping the parent does on every message', () => {
	it('maps field -> block id from the manifest and nothing else', () => {
		const manifest = validateHtmlManifest(documentFor(legalManifest()))
			.manifest as HtmlAssignmentManifest;
		const map = fieldBlockMap(manifest);
		expect([...map.entries()]).toEqual([
			['total', 'stack-total'],
			['why', 'stack-why']
		]);
		// A field the frame invents has no entry, so there is no row to write to.
		expect(map.get('block_id')).toBeUndefined();
		expect(map.get('stack-total')).toBeUndefined();
		expect(manifestBlocks(manifest).map((b) => b.id)).toEqual(['stack-total', 'stack-why']);
	});
});

describe('staging a picked file', () => {
	const legalDoc = documentFor(legalManifest());

	it('refuses by EXTENSION, so a renamed file cannot stage', () => {
		expect(stagedHtmlIssue(htmlFile('screenshot.png', 'x', 'image/png'))).toMatch(
			/is not an HTML file/
		);
	});

	it('accepts an EMPTY File.type rather than refusing it', () => {
		// `File.type` is a guess the platform makes and is legitimately empty.
		// Refusing an empty type would refuse a file the browser simply did not
		// recognise, which is the deck picker's mistake in the other direction.
		expect(stagedHtmlIssue(htmlFile('assignment.html', legalDoc, ''))).toBeNull();
	});

	it('refuses a .html whose declared type is something else', () => {
		expect(stagedHtmlIssue(htmlFile('assignment.html', 'x', 'image/png'))).toMatch(
			/reports it as image\/png/
		);
	});

	it('refuses an oversize file and STATES THE LIMIT beside the size', () => {
		const big = htmlFile('assignment.html', 'x'.repeat(HTML_DOCUMENT_MAX_BYTES + 1));
		const issue = stagedHtmlIssue(big)!;
		expect(issue).toMatch(/2\.0 MB/);
		// "too large" with no number is a guessing game.
		expect(issue).toMatch(/over the/);
	});

	it('refuses an empty file', () => {
		expect(stagedHtmlIssue(htmlFile('assignment.html', ''))).toMatch(/is empty/);
	});

	it('reads, validates and summarises a legal document in one step', async () => {
		const result = await readStagedHtml(htmlFile('tolerance.html', legalDoc));
		expect(result.errors).toEqual([]);
		expect(result.staged?.filename).toBe('tolerance.html');
		expect(result.staged?.manifest.title).toBe('Tolerance stack');
		// The document is kept VERBATIM: nothing rewrites a stored byte.
		expect(result.staged?.html).toBe(legalDoc);
		expect(stagedHtmlSummary(result.staged!)).toBe('1 module, 2 answer blocks, 6 points');
	});

	it('counts identity fields separately from answer blocks', async () => {
		// Folding them in would make the figure beside the points disagree with
		// what the grading console shows.
		const m = legalManifest();
		m.header = [{ id: 'who', field: 'student-name', type: 'text' }];
		const result = await readStagedHtml(
			htmlFile('t.html', documentFor(m, ['student-name', 'total', 'why']))
		);
		expect(result.errors).toEqual([]);
		expect(stagedHtmlSummary(result.staged!)).toBe(
			'1 module, 2 answer blocks, 1 identity field, 6 points'
		);
	});

	it('stages nothing at all when the document is refused', async () => {
		const broken = legalManifest();
		broken.points = 7;
		const result = await readStagedHtml(htmlFile('bad.html', documentFor(broken)));
		// There is no partial import: half a manifest would take real answers
		// into blocks it read and take the rest nowhere.
		expect(result.staged).toBeNull();
		expect(result.errors.length).toBeGreaterThan(0);
	});
});

describe('applying a staged document', () => {
	const staged: StagedHtmlAssignment = stageHtmlDocument(
		'tolerance.html',
		documentFor(legalManifest())
	).staged!;

	it('clears it only when the write actually landed', async () => {
		const seen: unknown[] = [];
		const res = await applyStagedHtmlAssignment('item-1', staged, {
			setHtmlAssignment: async (itemId, document, manifest, filename) => {
				seen.push({ itemId, filename, title: manifest.title, bytes: document.length });
				return { ok: true, revision: 2 };
			}
		});
		expect(res.failures).toEqual([]);
		expect(res.staged).toBeNull();
		expect(res.revision).toBe(2);
		expect(seen).toEqual([
			{ itemId: 'item-1', filename: 'tolerance.html', title: 'Tolerance stack', bytes: staged.html.length }
		]);
	});

	it('KEEPS it when the write is refused, and names it', async () => {
		// Saving again has to retry exactly this, rather than sending a teacher
		// to find the same file a second time.
		const res = await applyStagedHtmlAssignment('item-1', staged, {
			setHtmlAssignment: async () => ({
				ok: false,
				message: 'Uploading a ported HTML assignment is limited to site admins this season.'
			})
		});
		expect(res.staged).toBe(staged);
		expect(res.failures).toEqual([
			'HTML assignment "tolerance.html": Uploading a ported HTML assignment is limited to site admins this season.'
		]);
	});

	it('keeps it when the transport throws, rather than losing the document to an exception', async () => {
		const res = await applyStagedHtmlAssignment('item-1', staged, {
			setHtmlAssignment: async () => {
				throw new Error('Network is down.');
			}
		});
		expect(res.staged).toBe(staged);
		expect(res.failures.join(' ')).toMatch(/Network is down/);
	});

	it('reports the absent transport rather than silently doing nothing', async () => {
		const res = await applyStagedHtmlAssignment('item-1', staged, { setHtmlAssignment: null });
		expect(res.staged).toBe(staged);
		expect(res.failures.join(' ')).toMatch(/not available here/);
	});

	it('is a no-op with nothing staged', async () => {
		const res = await applyStagedHtmlAssignment('item-1', null, {
			setHtmlAssignment: async () => {
				throw new Error('should not be called');
			}
		});
		expect(res).toEqual({ failures: [], staged: null, revision: null });
	});
});

describe('the spec importer says which importer to use', () => {
	it('names schema 3 rather than answering "unsupported"', () => {
		// A teacher who pulls the manifest out of a document and pastes it into
		// the spec importer is doing the obvious wrong thing with the right file.
		const manifest = legalManifest();
		delete manifest.kind;
		const result = validateSpec(manifest);
		expect(result.spec).toBeNull();
		expect(result.errors.join(' ')).toMatch(/ported HTML assignment/);
		expect(result.errors.join(' ')).not.toMatch(/Unsupported schemaVersion/);
	});

	it('still answers "unsupported" for a version that is neither [positive control]', () => {
		const result = validateSpec({ schemaVersion: 9, meta: {}, modules: [] });
		expect(result.errors.join(' ')).toMatch(/Unsupported schemaVersion/);
	});
});

/**
 * LEDGER 0360: `prompt` AND `link` WARN AND NEVER REFUSE (`optional` is the
 * exception, and has its own describe below).
 *
 * `prompt` and `link` change what a grader reads and nothing about who may
 * write. 0195's SQL check, which is the gate that
 * stores a manifest, does not look at them at all, so this validator must not
 * refuse a document for one -- an error here would be a re-upload that adds a
 * prompt and is refused while the database would have stored it. Both
 * directions are asserted: a well-formed key is silent, a malformed one is a
 * warning with ZERO errors, and the known-bad manifest still errors exactly as
 * it did.
 */
describe('display keys: optional, prompt and link', () => {
	function withKeys(keys: Record<string, unknown>, blockIndex = 0): Json {
		const m = legalManifest();
		const mod = (m.modules as Json[])[0];
		const blocks = mod.blocks as Json[];
		blocks[blockIndex] = { ...blocks[blockIndex], ...keys };
		return m;
	}
	const fieldsOk = ['total', 'why'];

	it('well-formed keys validate with no error and no warning [positive control]', () => {
		const m = withKeys({ prompt: 'Total of the stack, in mm', link: 'presentation', optional: true });
		const result = validateHtmlManifest(documentFor(m, fieldsOk));
		expect(result.errors).toEqual([]);
		expect(result.warnings).toEqual([]);
		// Stored verbatim: the keys survive into the manifest the import keeps.
		const block = result.manifest!.modules[0].blocks[0];
		expect(block.prompt).toBe('Total of the stack, in mm');
		expect(block.link).toBe('presentation');
		expect(block.optional).toBe(true);
	});

	it('malformed values WARN, with zero errors, and the manifest is still accepted', () => {
		const cases: [Record<string, unknown>, number, RegExp][] = [
			[{ prompt: 42 }, 0, /prompt must be text/],
			[{ prompt: '   ' }, 0, /prompt is empty/],
			[{ prompt: 'x'.repeat(501) }, 0, /prompt is 501 characters/],
			[{ link: 'video' }, 0, /link is "video"/],
			[{ link: 'presentation' }, 1, /on a longText block/]
		];
		for (const [keys, index, warning] of cases) {
			const result = validateHtmlManifest(documentFor(withKeys(keys, index), fieldsOk));
			expect(result.errors, JSON.stringify(keys)).toEqual([]);
			expect(result.manifest, JSON.stringify(keys)).not.toBeNull();
			expect(result.warnings.length, JSON.stringify(keys)).toBe(1);
			expect(result.warnings[0]).toMatch(warning);
		}
	});

	it('a display key never rescues a manifest that is wrong for another reason', () => {
		// THE OTHER DIRECTION: the same duplicate id refusal, with display keys on.
		const m = withKeys({ prompt: 'Total', link: 'presentation', optional: true });
		const blocks = (m.modules as Json[])[0].blocks as Json[];
		blocks[1] = { ...blocks[1], id: blocks[0].id };
		const result = validateHtmlManifest(documentFor(m, fieldsOk));
		expect(result.manifest).toBeNull();
		expect(result.errors.some((e) => /Duplicate block id/.test(e))).toBe(true);
	});
});

/**
 * `optional` IS THE ONE DISPLAY KEY THAT DECIDES SOMETHING: what counts toward
 * completion (progress.ts). So a value that is not a boolean is REFUSED, and the
 * validator says, before import, what the progress bar will do with a module:
 * two or more photo slots with none optional (a one-photo student never reaches
 * 100%), every block optional (the module weighs nothing), and `optional` on a
 * header block (redundant). Each warning is asserted beside the manifest that
 * does NOT draw it.
 */
describe('optional: refused when malformed, and what the progress bar will do', () => {
	function photosManifest(photoKeys: Record<string, unknown>[]): { m: Json; fields: string[] } {
		const m = legalManifest();
		const mod = (m.modules as Json[])[0];
		const photos = photoKeys.map((k, i) => ({ id: `stack-photo-${i}`, field: `photo${i}`, type: 'image', ...k }));
		mod.blocks = [...(mod.blocks as Json[]), ...photos];
		return { m, fields: ['total', 'why', ...photos.map((p) => p.field)] };
	}

	it('a non-boolean optional is an ERROR; true and false are silent [positive control]', () => {
		for (const bad of ['yes', 1, null]) {
			const m = legalManifest();
			((m.modules as Json[])[0].blocks as Json[])[0].optional = bad;
			const result = validateHtmlManifest(documentFor(m));
			expect(result.manifest, String(bad)).toBeNull();
			expect(result.errors.some((e) => /sets optional to .*; it must be true or false\./.test(e)), String(bad)).toBe(true);
		}
		for (const good of [true, false]) {
			const m = legalManifest();
			((m.modules as Json[])[0].blocks as Json[])[0].optional = good;
			const result = validateHtmlManifest(documentFor(m));
			expect(result.errors, String(good)).toEqual([]);
			expect(result.warnings, String(good)).toEqual([]);
		}
	});

	it('two photo blocks with none optional warn; one optional among them does not', () => {
		const none = photosManifest([{}, {}]);
		const r1 = validateHtmlManifest(documentFor(none.m, none.fields));
		expect(r1.errors).toEqual([]);
		expect(r1.warnings).toEqual([
			'Module "stack" has 2 photo blocks and none is optional: every one must hold a photo before the bar reaches 100%.'
		]);
		const one = photosManifest([{}, { optional: true }]);
		const r2 = validateHtmlManifest(documentFor(one.m, one.fields));
		expect(r2.errors).toEqual([]);
		expect(r2.warnings).toEqual([]);
		// A single photo slot is required work, not the trap: no warning.
		const single = photosManifest([{}]);
		expect(validateHtmlManifest(documentFor(single.m, single.fields)).warnings).toEqual([]);
	});

	it('a module whose every block is optional warns that it can never move the bar', () => {
		const m = legalManifest();
		for (const b of (m.modules as Json[])[0].blocks as Json[]) b.optional = true;
		const result = validateHtmlManifest(documentFor(m));
		expect(result.errors).toEqual([]);
		expect(result.warnings).toEqual(['Module "stack" marks every block optional, so it can never move the progress bar.']);
	});

	it('optional on a header block warns that it changes nothing; a plain header block is silent', () => {
		const m = legalManifest();
		m.header = [{ id: 'who', field: 'name', type: 'text', optional: true }];
		const flagged = validateHtmlManifest(documentFor(m, ['name', 'total', 'why']));
		expect(flagged.errors).toEqual([]);
		expect(flagged.warnings).toEqual([
			'Header block 1 is marked optional, which changes nothing: header blocks never count toward completion.'
		]);
		m.header = [{ id: 'who', field: 'name', type: 'text' }];
		expect(validateHtmlManifest(documentFor(m, ['name', 'total', 'why'])).warnings).toEqual([]);
	});
});

describe('the display-key readers', () => {
	it('read a malformed value as absent', async () => {
		const { hxBlockLinkKind, hxBlockPrompt, hxBlockIsOptional, HTML_PROMPT_MAX } = await import(
			'../src/lib/classroom/html-assignment/manifest'
		);
		expect(hxBlockLinkKind({ type: 'text', link: 'presentation' })).toBe('presentation');
		expect(hxBlockLinkKind({ type: 'image', link: 'presentation' })).toBeNull();
		expect(hxBlockLinkKind({ type: 'text', link: 'video' })).toBeNull();
		expect(hxBlockLinkKind({ type: 'text' })).toBeNull();
		expect(hxBlockPrompt({ prompt: '  Why?  ' })).toBe('Why?');
		expect(hxBlockPrompt({ prompt: '' })).toBeNull();
		expect(hxBlockPrompt({ prompt: 7 })).toBeNull();
		expect(hxBlockPrompt({ prompt: 'x'.repeat(HTML_PROMPT_MAX + 50) })?.length).toBe(HTML_PROMPT_MAX);
		expect(hxBlockIsOptional({ optional: true })).toBe(true);
		expect(hxBlockIsOptional({ optional: 'true' })).toBe(false);
		expect(hxBlockIsOptional(null)).toBe(false);
	});
});
