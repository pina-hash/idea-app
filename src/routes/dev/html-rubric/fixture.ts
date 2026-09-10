/**
 * ONE ASSIGNMENT, WRITTEN TWICE.
 *
 * The manifest is what an uploaded HTML document carries; the spec is the same
 * assignment authored the way a spec author authors one. Both are hand-written
 * here, and NEITHER is produced from the other -- that is the whole point. The
 * page renders `manifestToRubric(MANIFEST)` beside `rubricFromSpec(SPEC)` and a
 * browser pass scrapes the two rendered regions, so what is being compared is
 * two screens rather than two objects.
 *
 * THE FIXTURE IS SHAPED FOR THE THREE THINGS THAT CAN GO WRONG SILENTLY:
 *
 *   1. `short` differs from `descriptor` on EVERY level. A fixture where they
 *      agree cannot tell rung one of `levelShort` from rung three, which is
 *      exactly the 2026-09-08 defect.
 *   2. Both modules use the criterion ids `quality` and `notes`. Unnamespaced,
 *      the second module's scores would land on the first module's row.
 *   3. One criterion has FOUR levels and the rest have three, so a translation
 *      that flattened or truncated levels shows up as a missing button rather
 *      than as nothing at all.
 */

import {
	rubricFromSpec,
	type AssignmentSpec,
	type RubricCriterion
} from '$lib/classroom/assignment-spec';
import { manifestToRubric, type HtmlAssignmentManifest } from '$lib/classroom/html-assignment/rubric';

export const ITEM_ID = 'i-html-rubric-1';
export const SECTION_ID = 's-html-rubric-1';
export const TEACHER = 'tvargas@boscotech.edu';

export const MANIFEST: HtmlAssignmentManifest = {
	schemaVersion: 3,
	kind: 'html-assignment',
	title: 'Blade Design Log',
	course: 'IDEA113',
	points: 30,
	// IDENTITY FIELDS, which carry no points and must never reach the rubric.
	header: [
		{ id: 'hdr-name', field: 'studentName', type: 'text' },
		{ id: 'hdr-team', field: 'teamName', type: 'text' },
		{ id: 'hdr-date', field: 'sessionDate', type: 'text' }
	],
	modules: [
		{
			id: 'setup',
			title: 'Bench setup',
			points: 10,
			audience: 'team',
			blocks: [
				{ id: 'setup-notes', field: 'benchNotes', type: 'longText', minSentences: 2 },
				{ id: 'setup-photo', field: 'benchPhoto', type: 'image' }
			],
			criteria: [
				{
					id: 'quality',
					text: 'Bench is set up as specified',
					points: 6,
					levels: [
						{
							points: 6,
							label: 'Complete',
							short: 'Every part staged, guard on.',
							descriptor:
								'Every part is staged in the order the procedure gives, and the guard is fitted before power reaches the machine.'
						},
						{
							points: 3,
							label: 'Developing',
							short: 'Staged, guard missing or late.',
							descriptor:
								'The parts are staged but the guard was fitted after power, or was not fitted at all.'
						},
						{
							points: 0,
							label: 'Absent',
							short: 'Not set up.',
							descriptor: 'The bench was not set up before work began.'
						}
					]
				},
				{
					id: 'notes',
					text: 'Setup notes record what was actually done',
					points: 4,
					levels: [
						{
							points: 4,
							label: 'Complete',
							short: 'Specific, in order, dated.',
							descriptor:
								'The notes name each step in the order it was done and carry the date of the session.'
						},
						{
							points: 2,
							label: 'Developing',
							short: 'Present, vague.',
							descriptor:
								'Notes are there, but they describe the procedure rather than what this bench actually did.'
						},
						{
							points: 0,
							label: 'Absent',
							short: 'No notes.',
							descriptor: 'Nothing was written down.'
						}
					]
				}
			]
		},
		{
			id: 'cut',
			title: 'First cut',
			points: 20,
			audience: 'individual',
			blocks: [{ id: 'cut-reflection', field: 'cutReflection', type: 'longText', minSentences: 3 }],
			criteria: [
				{
					id: 'quality',
					text: 'The cut is within tolerance',
					points: 12,
					// FOUR levels, where every other criterion has three.
					levels: [
						{
							points: 12,
							label: 'Complete',
							short: 'Within 0.5 mm, clean edge.',
							descriptor:
								'Every measured point falls within 0.5 mm of the drawing and the edge needs no rework.'
						},
						{
							points: 8,
							label: 'Proficient',
							short: 'Within 1 mm.',
							descriptor: 'Every measured point falls within 1 mm of the drawing.'
						},
						{
							points: 4,
							label: 'Developing',
							short: 'Outside 1 mm, recoverable.',
							descriptor:
								'Measured points fall outside 1 mm, but the stock can still be brought to size.'
						},
						{
							points: 0,
							label: 'Absent',
							short: 'No cut made.',
							descriptor: 'No cut was attempted.'
						}
					]
				},
				{
					id: 'notes',
					text: 'Reflection explains the error',
					points: 8,
					levels: [
						{
							points: 8,
							label: 'Complete',
							short: 'Names a cause, tests it.',
							descriptor:
								'Names a specific cause for the measured error and says how that cause would be checked.'
						},
						{
							points: 4,
							label: 'Developing',
							short: 'Names the error only.',
							descriptor: 'Reports the measured error without reasoning about where it came from.'
						},
						{
							points: 0,
							label: 'Absent',
							short: 'No reflection.',
							descriptor: 'Not attempted.'
						}
					]
				}
			]
		}
	]
};

/** The SAME assignment as a spec, authored by hand in the spec's own vocabulary. */
export const SPEC: AssignmentSpec = {
	schemaVersion: 1,
	meta: { assignmentId: '', title: 'Blade Design Log', course: 'IDEA113', totalPoints: 30 },
	modules: MANIFEST.modules.map((mod) => ({
		id: mod.id,
		title: mod.title,
		points: mod.points,
		blocks: mod.blocks.map((b) => ({
			type: 'textField' as const,
			id: b.id,
			prompt: b.field,
			minSentences: b.minSentences
		})),
		rubric: mod.criteria.map((c) => ({
			id: c.id,
			criterion: c.text,
			points: c.points,
			levels: c.levels.map((l) => ({
				points: l.points,
				label: l.label,
				descriptor: l.descriptor,
				short: l.short
			}))
		}))
	}))
};

export const MANIFEST_RUBRIC: RubricCriterion[] = manifestToRubric(MANIFEST);
export const SPEC_RUBRIC: RubricCriterion[] = rubricFromSpec(SPEC);

/** The scores a returned grade carries, keyed by the namespaced criterion ids. */
export const SCORES: Record<string, number> = {
	'setup-quality': 6,
	'setup-notes': 2,
	'cut-quality': 8,
	'cut-notes': 4
};

export const COMMENTS: Record<string, string> = {
	'setup-notes': 'The steps are here but I cannot tell which bench this was.'
};
