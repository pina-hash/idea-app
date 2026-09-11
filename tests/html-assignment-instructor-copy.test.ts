// tests/html-assignment-instructor-copy.test.ts
//
// THE INSTRUCTOR'S WRITABLE COPY OF A PORTED WORKSHEET (0199), and the two
// things about it whose regression would be SILENT.
//
// ===========================================================================
// ONE: WHERE THE ANSWERS GO
// ===========================================================================
//
// An instructor filling a ported worksheet in must write
// `classroom_instructor_responses` through `classroom_save_instructor_response`
// and never `classroom_responses` through `classroom_save_response`. Pointing
// the controller at the engine's own transports is a ONE-IDENTIFIER edit that
// throws nothing, type-checks perfectly and looks right on screen -- and the
// result is a teacher's answers sitting in the student table, where the grading
// console, the Grades tab, the FACTS export and every roster read treat a row
// as a hand-in by somebody on the roster. Nothing on screen would say so.
//
// ===========================================================================
// TWO: WHAT HAPPENS TO A PHOTOGRAPH
// ===========================================================================
//
// There is no instructor counterpart to `classroom_submission_files`, so the
// three file transports are ABSENT from the instructor projection. Absence is
// this codebase's mechanism for removing a write -- but a message the frame
// delivers and nothing answers is a camera control that silently does nothing,
// which is the failure this whole lane is written against and is worse here
// than for a student: the instructor is the person checking whether the
// worksheet works. So each absence must settle a REFUSAL that travels back into
// the document.
//
// ===========================================================================
// EVERY SWEEP HERE CARRIES A POSITIVE CONTROL
// ===========================================================================
//
// The transports assertions run the same fake against the FULL engine shape, so
// "the instructor path did not upload" cannot be a fake that never uploads. The
// source sweeps parse a file that legitimately DOES contain what the other is
// asserted not to, with the same parser, in the same run.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from 'svelte/server';
import HtmlInstructorCopy from '$lib/classroom/html-assignment/HtmlInstructorCopy.svelte';
import {
	HxAnswers,
	HX_REFUSALS,
	type HxAnswerTransports
} from '$lib/classroom/html-assignment/answers';
import {
	hxInstructorAnswerTransports,
	HTML_INSTRUCTOR_COPY_PURPOSE,
	HTML_INSTRUCTOR_COPY_UPLOAD_NOTE
} from '$lib/classroom/html-assignment/instructor';
import {
	INSTRUCTOR_COPY_HEADING,
	INSTRUCTOR_COPY_NOTE,
	INSTRUCTOR_KEY_DESIGNATE,
	INSTRUCTOR_KEY_UNDESIGNATE,
	type InstructorCopyData,
	type InstructorCopyTransports,
	type ResponseValue
} from '$lib/classroom/assignment-spec';
import type { HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';

const ROOT = resolve(__dirname, '..');

/** A manifest with one typed block and one image block, which is the smallest
    fixture that can tell the two halves above apart. */
const MANIFEST: HtmlAssignmentManifest = {
	schemaVersion: 3,
	kind: 'html-assignment',
	title: 'Bench setup',
	course: 'IDEA100',
	points: 2,
	header: [{ id: 'who', field: 'studentName', type: 'text' }],
	modules: [
		{
			id: 'm1',
			title: 'Bench',
			points: 2,
			blocks: [
				{ id: 'b-setup', field: 'setup', type: 'longText', minSentences: 1 },
				{ id: 'b-shot', field: 'shot', type: 'image' }
			],
			criteria: [
				{
					id: 'm1-c',
					text: 'The bench setup is recorded',
					points: 2,
					levels: [
						{ points: 2, label: 'Complete', short: 'Recorded', descriptor: 'Recorded.' },
						{ points: 1, label: 'Developing', short: 'Partial', descriptor: 'Partly.' },
						{ points: 0, label: 'Absent', short: 'None', descriptor: 'Not attempted.' }
					]
				}
			]
		}
	]
} as unknown as HtmlAssignmentManifest;

/** A recording stand-in for 0128's transports. `saveResponse` is the only
    member the projection is allowed to take. */
function instructorTransports() {
	const calls: Array<{ itemId: string; blockId: string; value: ResponseValue }> = [];
	const transports = {
		async saveResponse(itemId: string, blockId: string, value: ResponseValue) {
			calls.push({ itemId, blockId, value });
			return { ok: true as const, data: { ok: true } };
		},
		async designateKey() {
			return { ok: true as const, data: { ok: true } };
		},
		async undesignateKey() {
			return { ok: true as const, data: { ok: true } };
		},
		async reload() {
			return { ok: true as const, data: copyData() };
		}
	} as unknown as InstructorCopyTransports;
	return { transports, calls };
}

function copyData(): InstructorCopyData {
	return {
		myEmail: 'reyes@boscotech.edu',
		mine: [{ item_id: 'i1', instructor_email: 'reyes@boscotech.edu', block_id: 'b-setup', value: { text: 'Squared it.' } }],
		key: null,
		keyResponses: []
	};
}

describe('the instructor answer transports are 0128 save and nothing else', () => {
	it('projects saveResponse as the IDENTICAL function object', () => {
		const { transports } = instructorTransports();
		const projected = hxInstructorAnswerTransports(transports);
		// IDENTITY, not equivalence: a projection that wrapped or re-implemented
		// the call would be a second caller of
		// `classroom_save_instructor_response`, which is the thing this lane
		// promises there is exactly one of.
		expect(projected.saveResponse).toBe(transports.saveResponse);
	});

	it('carries NONE of the three file writes, and the control says the shape can hold them', () => {
		const { transports } = instructorTransports();
		const projected = hxInstructorAnswerTransports(transports);
		const absent = ['uploadSubmissionFile', 'deleteSubmissionFile', 'setFileCaption'].filter(
			(k) => (projected as Record<string, unknown>)[k] === undefined
		);
		console.log(`    [transports] absent file writes: ${absent.join(', ')}`);
		expect(absent).toHaveLength(3);
		expect(Object.keys(projected)).toEqual(['saveResponse']);
		// THE POSITIVE CONTROL: the same TYPE accepts all four, so the three
		// absences above are a decision by this function and not something the
		// shape could not have held.
		const full: HxAnswerTransports = {
			saveResponse: transports.saveResponse,
			uploadSubmissionFile: (async () => ({ ok: true, data: {} })) as never,
			deleteSubmissionFile: (async () => ({ ok: true, data: {} })) as never,
			setFileCaption: (async () => ({ ok: true, data: {} })) as never
		};
		expect(Object.keys(full).sort()).toEqual(
			['deleteSubmissionFile', 'saveResponse', 'setFileCaption', 'uploadSubmissionFile'].sort()
		);
	});
});

describe('a change is written and a photograph is refused out loud', () => {
	/** A controller wired the way the item route wires an instructor's. */
	function controller(transports: HxAnswerTransports) {
		const acks: Array<{ ok: boolean; reason?: string | null }> = [];
		const answers = new HxAnswers({
			itemId: 'i1',
			manifest: MANIFEST,
			transports,
			debounceMs: 0,
			onsaved: (ack) => acks.push(ack)
		});
		return { answers, acks };
	}

	it('a typed answer reaches 0128 save, with the block id the manifest resolved', async () => {
		const { transports, calls } = instructorTransports();
		const { answers } = controller(hxInstructorAnswerTransports(transports));
		answers.change({ blockId: 'b-setup', field: 'setup', value: 'The vise was square.' });
		await answers.flush();
		console.log(`    [write] ${calls.length} call(s): ${JSON.stringify(calls)}`);
		expect(calls).toHaveLength(1);
		expect(calls[0].blockId).toBe('b-setup');
		expect(calls[0].value).toEqual({ text: 'The vise was square.' });
		answers.destroy();
	});

	it('a picture settles a refusal naming the reason, and uploads nothing', async () => {
		const { transports } = instructorTransports();
		const { answers, acks } = controller(hxInstructorAnswerTransports(transports));
		await answers.image({ blockId: 'b-shot', field: 'shot', name: 'p.jpg', bytes: 'AAAA' });
		console.log(`    [picture] ack: ${JSON.stringify(acks.at(-1))}`);
		expect(acks).toHaveLength(1);
		expect(acks[0].ok).toBe(false);
		expect(acks[0].reason).toBe(HX_REFUSALS.noInstructorFiles);
		// NOT the read-only sentence: this worksheet IS taking typing, and
		// telling an instructor it is not open for editing would be false in the
		// one direction that matters to them.
		expect(acks[0].reason).not.toBe(HX_REFUSALS.readOnly);
		// And the state the document opens on is untouched -- no phantom picture.
		expect(answers.images).toEqual({});

		await answers.imageRemove({ blockId: 'b-shot', field: 'shot' });
		await answers.imageCaption({ blockId: 'b-shot', field: 'shot', caption: 'x' });
		const reasons = acks.map((a) => a.reason);
		console.log(`    [picture] three refusals: ${JSON.stringify(reasons)}`);
		expect(reasons).toEqual([
			HX_REFUSALS.noInstructorFiles,
			HX_REFUSALS.noInstructorFiles,
			HX_REFUSALS.noInstructorFiles
		]);
		answers.destroy();
	});

	it('THE POSITIVE CONTROL: the same controller with a full transport set DOES upload', async () => {
		// Without this, "nothing was uploaded" could be a controller that never
		// uploads anything, and the assertion above would be measuring the wrong
		// absence.
		const { transports } = instructorTransports();
		const uploads: string[] = [];
		const full: HxAnswerTransports = {
			saveResponse: transports.saveResponse,
			uploadSubmissionFile: (async (_item: string, file: File) => {
				uploads.push(file.name);
				return { ok: true, data: { file: { id: 'f1', filename: file.name, caption: null } } };
			}) as never,
			deleteSubmissionFile: (async () => ({ ok: true, data: {} })) as never,
			setFileCaption: (async () => ({ ok: true, data: {} })) as never
		};
		const { answers, acks } = controller(full);
		await answers.image({ blockId: 'b-shot', field: 'shot', name: 'p.jpg', bytes: 'AAAA' });
		console.log(`    [control] uploads: ${JSON.stringify(uploads)}, ack ${JSON.stringify(acks.at(-1))}`);
		expect(uploads).toEqual(['p.jpg']);
		expect(acks.at(-1)?.ok).toBe(true);
		answers.destroy();
	});
});

describe('the surface says what it is, in 0128 own words', () => {
	function renderCopy() {
		const { transports } = instructorTransports();
		return render(HtmlInstructorCopy, {
			props: {
				itemId: 'i1',
				src: '/hx/doc-1',
				title: 'Bench setup',
				fieldToBlockId: { setup: 'b-setup', shot: 'b-shot', studentName: 'who' },
				answers: {
					values: { setup: 'Squared it.' },
					images: {},
					saved: null,
					change: () => {},
					flush: async () => {}
				},
				data: copyData(),
				transports
			}
		}).body;
	}

	it('renders the shared instructor-copy vocabulary rather than a second wording', () => {
		const html = renderCopy();
		for (const phrase of [
			INSTRUCTOR_COPY_HEADING,
			INSTRUCTOR_COPY_NOTE,
			INSTRUCTOR_KEY_DESIGNATE,
			HTML_INSTRUCTOR_COPY_PURPOSE,
			HTML_INSTRUCTOR_COPY_UPLOAD_NOTE
		]) {
			expect(html, `missing: ${phrase}`).toContain(phrase.replace(/'/g, '&#39;'));
		}
		// Undesignate is the OTHER branch and must be absent while nothing is
		// designated -- the control offered is the one that can do something.
		expect(html).not.toContain(INSTRUCTOR_KEY_UNDESIGNATE);
		expect(html).toContain('No answer key designated yet');
		console.log('    [render] heading, note, purpose, upload note and Designate all present');
	});

	it('carries none of the submission vocabulary a hand-in surface would', () => {
		const html = renderCopy();
		// ABSENT, not hidden: there is no classroom_submissions row for an
		// instructor and nothing on this surface could create one.
		const forbidden = ['Turn in', 'Unsubmit', 'Submitted', 'Returned', 'Due ', 'declaration'];
		const found = forbidden.filter((w) => html.includes(w));
		console.log(`    [render] submission vocabulary found: ${found.length ? found.join(', ') : 'none'}`);
		expect(found).toEqual([]);
		// THE POSITIVE CONTROL for that sweep: a word that IS on the surface,
		// read by the same `includes`, so "found none" is not a broken haystack.
		expect(html).toContain(INSTRUCTOR_COPY_HEADING);
	});

	it('mounts the frame, with a lock of null because an instructor has nothing to lock', () => {
		const html = renderCopy();
		/*
			THE `src` IS NOT ASSERTED HERE AND CANNOT BE. `HtmlAssignmentFrame`
			renders a PLACEHOLDER box on the server and creates the `<iframe>`
			itself on mount -- measured, not assumed: the SSR output carries
			`hx-frame-placeholder` and no `iframe` at all. A test asserting the
			URL from this project would be asserting something that is not in the
			markup it is reading, and the honest structural claim is that the
			frame is mounted at all. The real `src` is driven in
			`tools/browser-verify/routes/html-instructor-copy.mjs`, which has a
			browser to mount it in.
		*/
		expect(html).toContain('hx-frame-wrap');
		expect(html).toContain('hx-frame-placeholder');
		// AND NO LOCK NOTICE. 0198's sentence is addressed to a student whose
		// work was shut; an instructor has no `classroom_submissions` row, so
		// there is nothing that could be closed and nothing to say about it.
		expect(html).not.toContain('hx-lock');
		expect(html).not.toContain('data-hx-lock');
		console.log('    [render] frame mounted (placeholder), no lock notice');
	});
});

describe('the write path is wired to the instructor RPC and not to the engine', () => {
	const ITEM_PAGE = 'src/routes/classroom/[sectionId]/item/[itemId]/+page.svelte';

	function source(file: string): string {
		return readFileSync(resolve(ROOT, file), 'utf8');
	}

	it('the item route builds the instructor controller from hxInstructorAnswerTransports', () => {
		const src = source(ITEM_PAGE);
		const block = src.slice(
			src.indexOf('const htmlInstructorAnswers'),
			src.indexOf('const htmlAnswers = $derived.by')
		);
		expect(block.length).toBeGreaterThan(200);
		expect(block).toContain('transports,');
		// THE ENGINE'S OWN TRANSPORTS MUST NOT APPEAR IN IT. That identifier in
		// this block is a teacher's answers landing in `classroom_responses`.
		expect(block).not.toContain('htmlAnswerTransports');
		expect(src).toContain('hxInstructorAnswerTransports(');
		console.log('    [wiring] the instructor controller reads hxInstructorAnswerTransports');
	});

	it('THE POSITIVE CONTROL: the STUDENT controller still reads the engine transports', () => {
		const src = source(ITEM_PAGE);
		const block = src.slice(
			src.indexOf('const htmlAnswers = $derived.by'),
			src.indexOf('// The last teardown.')
		);
		expect(block.length).toBeGreaterThan(200);
		expect(block).toContain('transports: htmlAnswerTransports');
		expect(block).not.toContain('hxInstructorAnswerTransports');
		console.log('    [wiring] the student controller reads createHtmlAnswerTransports');
	});

	it('and the two are seeded from different rows', () => {
		const src = source(ITEM_PAGE);
		// The student seeds from `engine.responses`; the instructor from
		// `copy.mine`, which `loadInstructorCopy` has already narrowed to the
		// caller's own. Neither may read the other's.
		expect(src).toContain('hxValuesFromResponses(manifest, engine.responses)');
		expect(src).toContain('hxValuesFromResponses(manifest, copy.mine)');
	});
});
