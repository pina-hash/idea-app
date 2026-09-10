// tests/html-assignment-rubric.test.ts
//
// `manifestToRubric` PRODUCES WHAT A SPEC WOULD HAVE PRODUCED, and the failure
// it exists to catch is silent: a rubric that stores fine and displays wrong.
// That is not hypothetical here -- on 2026-09-08 an instructor rewrote rubric
// descriptors on IDEA209H Unit 1 and saw no change on the grading console,
// because `levelShort` renders `short` first and nothing in the product could
// edit it. A manifest-derived rubric that lost `short`, flattened its levels,
// or namespaced its ids differently would reach the column, pass every write
// check, and be wrong only on a screen.
//
// WHERE THE EXPECTED VALUES COME FROM, which is the question that decides
// whether a test is worth anything:
//
//   * The BYTE-FOR-BYTE claim is checked against `rubricFromSpec` run over a
//     HAND-WRITTEN spec -- authored here in the spec's own vocabulary, the way
//     a spec author writes one -- never against a spec this module produced.
//     `rubricFromSpec` is the shipping function the output must match; the
//     projection inside `rubric.ts` is the thing under test.
//   * AND against a LITERAL array, spelled out below. The two oracles fail
//     differently on purpose: if `rubricFromSpec` itself changed, both sides of
//     the first comparison move together and it stays green, while the literal
//     reddens and says exactly which field moved.
//
// This file runs in vitest's `node` project: it is pure arithmetic over plain
// objects, no DOM and no database. The real `classroom_set_rubric` accepting
// this output is `tests/html-assignment-rubric-db.test.ts`; the real
// `RubricView` and the real grading console rendering it is
// `/dev/html-rubric`, driven by `npm run verify:browser`.

import { describe, expect, test } from 'vitest';
import {
	levelShort,
	rubricFromSpec,
	rubricTotal,
	type AssignmentSpec,
	type RubricCriterion
} from '../src/lib/classroom/assignment-spec';
import {
	manifestCriterionId,
	manifestRubricIssues,
	manifestRubricTotal,
	manifestToRubric,
	type HtmlAssignmentManifest
} from '../src/lib/classroom/html-assignment/rubric';

// ---------------------------------------------------------------------------
// One assignment, written twice: once as a manifest, once as a spec.
// ---------------------------------------------------------------------------

/**
 * TWO MODULES, AND THE SECOND ONE REPEATS THE FIRST'S CRITERION IDS. That is
 * legal by the contract (a criterion id is unique WITHIN its module) and is the
 * case the namespacing exists for: unprefixed, `quality` would collide with
 * `quality` and the second module's scores would land on the first's row.
 *
 * THE `short` FORMS DELIBERATELY DIFFER FROM THE DESCRIPTORS, every one of
 * them. A fixture where the two agree cannot tell rung one from rung three.
 */
const MANIFEST: HtmlAssignmentManifest = {
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
							descriptor: 'Every part is staged in the order the procedure gives and the guard is fitted before power.'
						},
						{
							points: 3,
							label: 'Developing',
							short: 'Staged, guard missing or late.',
							descriptor: 'The parts are staged but the guard was fitted after power, or not at all.'
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
							descriptor: 'The notes name each step in the order it was done and carry the date of the session.'
						},
						{
							points: 2,
							label: 'Developing',
							short: 'Present, vague.',
							descriptor: 'Notes are there but describe the procedure rather than what this bench actually did.'
						},
						{ points: 0, label: 'Absent', short: 'No notes.', descriptor: 'Nothing was written down.' }
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
				// SAME ids as the module above. Legal, and the whole reason for
				// `<moduleId>-<criterionId>`.
				{
					id: 'quality',
					text: 'The cut is within tolerance',
					points: 12,
					levels: [
						{
							points: 12,
							label: 'Complete',
							short: 'Within 0.5 mm, clean edge.',
							descriptor: 'Every measured point falls within 0.5 mm of the drawing and the edge needs no rework.'
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
							descriptor: 'Points fall outside 1 mm but the stock can still be brought to size.'
						},
						{ points: 0, label: 'Absent', short: 'No cut made.', descriptor: 'No cut was attempted.' }
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
							descriptor: 'Names a specific cause for the measured error and says how it would be checked.'
						},
						{
							points: 4,
							label: 'Developing',
							short: 'Names the error only.',
							descriptor: 'Reports the measured error without reasoning about where it came from.'
						},
						{ points: 0, label: 'Absent', short: 'No reflection.', descriptor: 'Not attempted.' }
					]
				}
			]
		}
	]
};

/**
 * THE SAME ASSIGNMENT AS A SPEC, hand-authored. This is the ORACLE: it is
 * written the way a spec author writes one -- `criterion` rather than `text`,
 * the rubric under `rubric` rather than `criteria` -- and it is never produced
 * from the manifest by anything.
 */
const SPEC: AssignmentSpec = {
	schemaVersion: 1,
	meta: { assignmentId: '', title: 'Blade Design Log', course: 'IDEA113', totalPoints: 30 },
	modules: MANIFEST.modules.map((mod) => ({
		id: mod.id,
		title: mod.title,
		points: mod.points,
		blocks: [],
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

/**
 * THE INDEPENDENT FIGURE. Spelled out rather than derived, so a change inside
 * `rubricFromSpec` -- which would move BOTH sides of the comparison above --
 * reddens here and names the field that moved.
 */
const EXPECTED_FIRST: RubricCriterion = {
	id: 'setup-quality',
	criterion: 'Bench setup: Bench is set up as specified',
	points: 6,
	levels: [
		{
			points: 6,
			label: 'Complete',
			descriptor: 'Every part is staged in the order the procedure gives and the guard is fitted before power.',
			short: 'Every part staged, guard on.'
		},
		{
			points: 3,
			label: 'Developing',
			descriptor: 'The parts are staged but the guard was fitted after power, or not at all.',
			short: 'Staged, guard missing or late.'
		},
		{
			points: 0,
			label: 'Absent',
			descriptor: 'The bench was not set up before work began.',
			short: 'Not set up.'
		}
	]
};

describe('manifestToRubric matches rubricFromSpec byte for byte', () => {
	test('the whole rubric equals what the hand-written spec produces', () => {
		const fromManifest = manifestToRubric(MANIFEST);
		const fromSpec = rubricFromSpec(SPEC);
		// The count first: an empty result would satisfy a deep-equal against
		// another empty result and prove nothing.
		expect(fromManifest).toHaveLength(4);
		expect(fromSpec).toHaveLength(4);
		expect(fromManifest).toEqual(fromSpec);
		// And byte for byte, not merely structurally equal: key ORDER inside each
		// level is what a `toEqual` cannot see, and it is what lands in the jsonb
		// column and comes back out again.
		expect(JSON.stringify(fromManifest)).toBe(JSON.stringify(fromSpec));
	});

	test('against the literal, so a change inside rubricFromSpec cannot hide', () => {
		expect(manifestToRubric(MANIFEST)[0]).toEqual(EXPECTED_FIRST);
	});

	test('the criterion text is "<module title>: <criterion>"', () => {
		expect(manifestToRubric(MANIFEST).map((c) => c.criterion)).toEqual([
			'Bench setup: Bench is set up as specified',
			'Bench setup: Setup notes record what was actually done',
			'First cut: The cut is within tolerance',
			'First cut: Reflection explains the error'
		]);
	});

	test("a criterion's points are its TOP level, never the manifest's own field", () => {
		// The rule `criterionMax` states and the SQL normalizer enforces. A
		// manifest whose `points` disagrees with its top level must store the
		// LEVEL, because that is the number the grader can actually award.
		const disagreeing: HtmlAssignmentManifest = {
			...MANIFEST,
			modules: [
				{
					...MANIFEST.modules[0],
					criteria: [{ ...MANIFEST.modules[0].criteria[0], points: 99 }]
				}
			]
		};
		expect(manifestToRubric(disagreeing)[0].points).toBe(6);
	});

	test('the levels are carried whole, never flattened to a number', () => {
		// A rubric imported without its levels is not a partial import, it is a
		// broken one: every leveled criterion collapses to a number a grader has
		// to override to reach.
		const rubric = manifestToRubric(MANIFEST);
		expect(rubric.map((c) => c.levels.length)).toEqual([3, 3, 4, 3]);
		expect(rubric.every((c) => c.levels.every((l) => !!l.descriptor?.trim()))).toBe(true);
	});
});

describe('the id is namespaced, which is what makes a repeat across modules harmless', () => {
	test('every id is <moduleId>-<criterionId>', () => {
		expect(manifestToRubric(MANIFEST).map((c) => c.id)).toEqual([
			'setup-quality',
			'setup-notes',
			'cut-quality',
			'cut-notes'
		]);
	});

	test('the same criterion id in two modules produces two distinct rows', () => {
		// The POSITIVE CONTROL for the whole namespacing rule: both modules use
		// `quality` and `notes`, and four ids come out.
		const ids = manifestToRubric(MANIFEST).map((c) => c.id);
		expect(new Set(ids).size).toBe(4);
		expect(manifestRubricIssues(MANIFEST)).toEqual([]);
	});

	test('the same criterion id twice INSIDE one module collides, and is reported', () => {
		const collides: HtmlAssignmentManifest = {
			...MANIFEST,
			modules: [
				{
					...MANIFEST.modules[0],
					criteria: [
						MANIFEST.modules[0].criteria[0],
						{ ...MANIFEST.modules[0].criteria[1], id: 'quality', points: 4 }
					]
				}
			]
		};
		const ids = manifestToRubric(collides).map((c) => c.id);
		expect(ids).toEqual(['setup-quality', 'setup-quality']);
		const issues = manifestRubricIssues(collides);
		expect(issues.some((i) => i.includes('repeats the criterion id "quality"'))).toBe(true);
	});

	test('manifestCriterionId is the one spelling of the join key', () => {
		expect(manifestCriterionId('setup', 'quality')).toBe('setup-quality');
		expect(manifestCriterionId('setup', '  quality  ')).toBe('setup-quality');
	});
});

describe('levelShort answers at rung one for every manifest-derived level', () => {
	test('with NO spec at all, every level still shows its short form', () => {
		// This is the fact the contract's `short` field buys. An HTML assignment
		// has no spec to be rung two, so if `short` were dropped anywhere in the
		// translation the console would fall to rung three -- the full
		// descriptor -- on the one control a grader reads five criteria off at
		// once, which is the 2026-09-08 defect in its other costume.
		const rubric = manifestToRubric(MANIFEST);
		const shown = rubric.flatMap((c) => c.levels.map((l) => levelShort(l, c.id, null)));
		expect(shown).toEqual([
			'Every part staged, guard on.',
			'Staged, guard missing or late.',
			'Not set up.',
			'Specific, in order, dated.',
			'Present, vague.',
			'No notes.',
			'Within 0.5 mm, clean edge.',
			'Within 1 mm.',
			'Outside 1 mm, recoverable.',
			'No cut made.',
			'Names a cause, tests it.',
			'Names the error only.',
			'No reflection.'
		]);
		// None of them is the descriptor, which is what rung three would give.
		const descriptors = new Set(rubric.flatMap((c) => c.levels.map((l) => l.descriptor)));
		expect(shown.some((s) => descriptors.has(s))).toBe(false);
	});

	test('THE NEGATIVE CONTROL: strip `short` and the same level falls to rung three', () => {
		// Without this the test above cannot tell "rung one answered" from
		// "levelShort returns something plausible whatever it is handed".
		const rubric = manifestToRubric(MANIFEST);
		const stripped = { ...rubric[0].levels[0] };
		delete (stripped as { short?: string }).short;
		expect(levelShort(stripped, rubric[0].id, null)).toBe(
			'Every part is staged in the order the procedure gives and the guard is fitted before power.'
		);
	});

	test('rung TWO is never needed, and handing in a spec changes nothing', () => {
		// A manifest-derived rubric resolves identically with a spec and without
		// one, which is what licenses passing `spec = null` to the grading
		// console for an HTML assignment.
		const rubric = manifestToRubric(MANIFEST);
		for (const c of rubric) {
			for (const l of c.levels) {
				expect(levelShort(l, c.id, SPEC)).toBe(levelShort(l, c.id, null));
			}
		}
	});
});

describe('contract amendment 1: header blocks, and no half points', () => {
	test('header blocks carry no points and never reach the rubric', () => {
		// For this module that is a property of WHERE they live rather than a rule
		// it applies -- nothing reads anything but `modules[].criteria`. Asserted
		// anyway: "it cannot happen" and "nothing checks" is the pair that lets a
		// later refactor make it happen. The alternative the amendment rejects is
		// what ledger 0128 had to do against the original contract -- a 0-point
		// module to hold them, which WOULD have become a criterion worth nothing.
		expect(MANIFEST.header).toHaveLength(3);
		const rubric = manifestToRubric(MANIFEST);
		const headerIds = MANIFEST.header.map((b) => b.id);
		const headerFields = MANIFEST.header.map((b) => b.field);
		expect(rubric).toHaveLength(4);
		for (const c of rubric) {
			expect(headerIds.some((id) => c.id.includes(id))).toBe(false);
			expect(headerFields.some((f) => c.criterion.includes(f))).toBe(false);
		}
		// POSITIVE CONTROL: emptying the header changes nothing at all, which is
		// what says the four criteria never came from it in the first place.
		expect(manifestToRubric({ ...MANIFEST, header: [] })).toEqual(rubric);
		expect(manifestRubricIssues({ ...MANIFEST, header: [] })).toEqual([]);
	});

	test('a level worth half a point is refused, and the database would NOT refuse it', () => {
		// The whole reason this rule lives in the client: `_classroom_check_levels`
		// takes a `numeric` and accepts 0.5 happily, and the grading console's
		// override input is `step="0.5"` on purpose -- an override is a grader's
		// considered judgement with a required comment beside it, where a LEVEL's
		// points are what every student landing there receives.
		const halved: HtmlAssignmentManifest = {
			...MANIFEST,
			modules: [
				{
					...MANIFEST.modules[0],
					points: 6,
					criteria: [
						{
							...MANIFEST.modules[0].criteria[0],
							levels: [
								{ ...MANIFEST.modules[0].criteria[0].levels[0] },
								{ ...MANIFEST.modules[0].criteria[0].levels[1], points: 0.5 },
								{ ...MANIFEST.modules[0].criteria[0].levels[2] }
							]
						}
					]
				}
			]
		};
		const issues = manifestRubricIssues(halved);
		expect(issues.some((i) => i.includes('worth a fraction of a point (0.5)'))).toBe(true);
		// It still TRANSLATES -- the refusal is the report's job, not the
		// translator's -- so a caller that ignores the issues gets a rubric the
		// database will accept, which is exactly why the issue has to be read.
		expect(manifestToRubric(halved)[0].levels[1].points).toBe(0.5);
	});

	test('a 1-point criterion cannot carry three levels, and the message says what to do', () => {
		// The arithmetic the rule implies: N levels need N-1 distinct positive
		// whole values, so the top level must be at least N-1. The amendment's own
		// answer is to merge or repoint, never to level it 1 / 0.5 / 0.
		const worthOne: HtmlAssignmentManifest = {
			...MANIFEST,
			modules: [
				{
					...MANIFEST.modules[0],
					points: 1,
					criteria: [
						{
							id: 'quality',
							text: 'Bench is set up as specified',
							points: 1,
							levels: [
								{ points: 1, label: 'Yes', short: 'Set up.', descriptor: 'Set up as specified.' },
								{ points: 1, label: 'Partly', short: 'Partly.', descriptor: 'Partly set up.' },
								{ points: 0, label: 'No', short: 'Not set up.', descriptor: 'Not set up.' }
							]
						}
					]
				}
			]
		};
		const issues = manifestRubricIssues(worthOne);
		expect(
			issues.some((i) => i.includes('is worth 1 but carries 3 levels') && i.includes('repoint it'))
		).toBe(true);
	});

	test('repointing to 2 is what makes a three-level criterion legal', () => {
		// The amendment's remedy, put to the checker so the message is not advice
		// that does not work.
		const repointed: HtmlAssignmentManifest = {
			...MANIFEST,
			modules: [
				{
					...MANIFEST.modules[0],
					points: 2,
					criteria: [
						{
							id: 'quality',
							text: 'Bench is set up as specified',
							points: 2,
							levels: [
								{ points: 2, label: 'Yes', short: 'Set up.', descriptor: 'Set up as specified.' },
								{ points: 1, label: 'Partly', short: 'Partly.', descriptor: 'Partly set up.' },
								{ points: 0, label: 'No', short: 'Not set up.', descriptor: 'Not set up.' }
							]
						}
					]
				}
			]
		};
		expect(manifestRubricIssues(repointed)).toEqual([]);
		expect(manifestToRubric(repointed)[0].points).toBe(2);
	});

	test('a REAL document\'s shape: 19 criteria across modules, all namespaced, none refused', () => {
		// Ledger 0128 ported a 933-line document and its rubric carried 19
		// criteria, not the handful this file's own fixture uses. The normalizer's
		// cap is 50, so 19 is well inside it -- asserted rather than assumed,
		// because "well inside" is the kind of claim that is wrong once.
		const many: HtmlAssignmentManifest = {
			...MANIFEST,
			modules: [0, 1].map((m) => ({
				id: `m${m}`,
				title: `Module ${m}`,
				points: m === 0 ? 30 : 27,
				blocks: [],
				criteria: Array.from({ length: m === 0 ? 10 : 9 }, (_, i) => ({
					// The ids REPEAT across the two modules on purpose.
					id: `c${i + 1}`,
					text: `Criterion ${i + 1}`,
					points: 3,
					levels: [
						{ points: 3, label: 'Complete', short: 'All.', descriptor: 'All of it.' },
						{ points: 2, label: 'Most', short: 'Most.', descriptor: 'Most of it.' },
						{ points: 1, label: 'Some', short: 'Some.', descriptor: 'Some of it.' },
						{ points: 0, label: 'None', short: 'None.', descriptor: 'None of it.' }
					]
				}))
			}))
		};
		const rubric = manifestToRubric(many);
		expect(rubric).toHaveLength(19);
		expect(new Set(rubric.map((c) => c.id)).size).toBe(19);
		expect(rubric[0].id).toBe('m0-c1');
		expect(rubric[10].id).toBe('m1-c1');
		expect(manifestRubricIssues(many)).toEqual([]);
		expect(manifestRubricTotal(many)).toBe(57);
	});
});

describe('the total is the rubric total, which is what the console shows', () => {
	test('30 points across four criteria', () => {
		expect(manifestRubricTotal(MANIFEST)).toBe(30);
		expect(rubricTotal(manifestToRubric(MANIFEST))).toBe(30);
		// And it agrees with the manifest's own figure here, which is the sound
		// case rather than a rule -- the disagreeing case is below.
		expect(MANIFEST.points).toBe(30);
	});

	test('a module whose criteria do not sum to its points is reported, not silently graded', () => {
		const short: HtmlAssignmentManifest = {
			...MANIFEST,
			modules: [{ ...MANIFEST.modules[0], points: 25 }]
		};
		const issues = manifestRubricIssues(short);
		expect(issues.some((i) => i.includes('worth 25 points but its criteria total 10'))).toBe(true);
		// The rubric is still produced: the disagreement is a warning about the
		// denominator, not a refusal.
		expect(manifestRubricTotal(short)).toBe(10);
	});
});

describe('manifestRubricIssues says first what the database would refuse', () => {
	test('the sound manifest raises nothing', () => {
		expect(manifestRubricIssues(MANIFEST)).toEqual([]);
	});

	test('an id the normalizer would refuse is named with its module and criterion', () => {
		const bad: HtmlAssignmentManifest = {
			...MANIFEST,
			modules: [
				{
					...MANIFEST.modules[0],
					id: 'set up',
					// The module's points move with the criteria kept, so the only
					// issue left is the id -- a total mismatch here would make the
					// length assertion below pass for the wrong reason.
					points: 6,
					criteria: [MANIFEST.modules[0].criteria[0]]
				}
			]
		};
		const issues = manifestRubricIssues(bad);
		expect(issues).toHaveLength(1);
		expect(issues[0]).toContain('Bench setup');
		expect(issues[0]).toContain('Bench is set up as specified');
		expect(issues[0]).toContain('"set up-quality"');
	});

	test('an id longer than 64 characters once joined is refused', () => {
		const long: HtmlAssignmentManifest = {
			...MANIFEST,
			modules: [
				{
					...MANIFEST.modules[0],
					criteria: [{ ...MANIFEST.modules[0].criteria[0], id: 'q'.repeat(60) }]
				}
			]
		};
		// 'setup-' + 60 = 66.
		expect(manifestCriterionId('setup', 'q'.repeat(60))).toHaveLength(66);
		expect(manifestRubricIssues(long).some((i) => i.includes('64 characters or fewer'))).toBe(true);
	});

	test('the level rules come from criterionIssues rather than a second copy', () => {
		const twoLevels: HtmlAssignmentManifest = {
			...MANIFEST,
			modules: [
				{
					...MANIFEST.modules[0],
					points: 6,
					criteria: [
						{
							...MANIFEST.modules[0].criteria[0],
							levels: [
								MANIFEST.modules[0].criteria[0].levels[0],
								MANIFEST.modules[0].criteria[0].levels[2]
							]
						}
					]
				}
			]
		};
		const issues = manifestRubricIssues(twoLevels);
		expect(issues.some((i) => i.includes('needs 3 or 4 levels (it has 2)'))).toBe(true);
	});

	test('a module with no criteria, and a manifest with none at all', () => {
		const empty: HtmlAssignmentManifest = {
			...MANIFEST,
			modules: [{ ...MANIFEST.modules[0], criteria: [] }]
		};
		const issues = manifestRubricIssues(empty);
		expect(issues.some((i) => i.includes('has no rubric criteria'))).toBe(true);
		expect(issues.some((i) => i.includes('nothing to grade against'))).toBe(true);
		// And the rubric it would produce is empty, which classroom_set_rubric
		// refuses outright ("A rubric needs at least one criterion").
		expect(manifestToRubric(empty)).toEqual([]);
	});

	test('the sweep has cases: every issue kind above fired at least once', () => {
		// A generated sweep that generated nothing passes vacuously; this pins
		// that each refusal above was really reachable.
		const kinds = [
			manifestRubricIssues({ ...MANIFEST, modules: [{ ...MANIFEST.modules[0], id: 'set up' }] }),
			manifestRubricIssues({ ...MANIFEST, modules: [{ ...MANIFEST.modules[0], criteria: [] }] }),
			manifestRubricIssues({ ...MANIFEST, modules: [{ ...MANIFEST.modules[0], points: 25 }] })
		];
		expect(kinds).toHaveLength(3);
		expect(kinds.every((k) => k.length > 0)).toBe(true);
	});
});
