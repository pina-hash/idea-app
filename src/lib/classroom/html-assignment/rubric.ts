/**
 * AN HTML ASSIGNMENT'S MANIFEST BECOMES THE RUBRIC THE GRADING CONSOLE ALREADY
 * GRADES.
 *
 * `manifestToRubric` produces exactly what `classroom_set_rubric` accepts, so
 * the grading console, extra credit, bulk grading, the rubric a student reads
 * before submitting and the FACTS export all need no change at all. There is no
 * HTML-assignment branch anywhere downstream of this file: what leaves here is a
 * `RubricCriterion[]`, indistinguishable from one a spec produced or one
 * somebody typed into the builder.
 *
 * IT DELEGATES TO `rubricFromSpec` RATHER THAN MIRRORING IT, AND THAT IS THE
 * WHOLE DESIGN. The output has to match a spec-derived rubric byte for byte --
 * the id namespacing, the `<module title>: <criterion>` join, `criterionMax`,
 * and the level map that keeps `short` and drops it when blank. A second
 * implementation of those four is exactly the thing this codebase keeps finding
 * has quietly stopped matching, and it would stop matching SILENTLY: a rubric
 * that stores fine and displays wrong is the defect class the manifest's
 * `short` field exists to end, so reproducing it in the translator would be
 * the same bug one level up. So the manifest is projected onto the
 * rubric-shaped slice of an `AssignmentSpec` and handed to the ONE translator
 * the composer (`stagedRubricAfterSpec`) and the builder ("Generate from spec")
 * already call. Byte-for-byte is then a property of construction, not a claim a
 * test has to keep re-proving.
 *
 * WHAT THE PROJECTION IS AND IS NOT. `rubricFromSpec` reads exactly five things
 * -- `spec.modules`, and per module `id`, `title` and `rubric`, and per row
 * `id`, `criterion`, `points` and `levels`. `specForRubric` below supplies
 * those and nothing meaningful else; its `meta` and its empty `blocks` are
 * there to satisfy the type, never to be read. It is NOT exported and must not
 * become a general manifest-to-spec conversion: an HTML assignment has no spec,
 * that is the point of it, and a half-real spec escaping this module is
 * something a later reader would reasonably pass to `validateSpec`.
 *
 * `short` IS WHY THE MANIFEST CARRIES BOTH FORMS. `levelShort` resolves the
 * stored level's own `short` first, then the SPEC's matching level paired on
 * the descriptor, then the descriptor itself. An HTML assignment has no spec to
 * be rung two, so without `short` on every level the grading console would fall
 * to rung three and render a wall of descriptor text on the one control a
 * grader has to read five criteria off at once. The contract makes `short`
 * required for that reason, which means a manifest-derived rubric answers at
 * rung one every time and NEVER needs rung two -- and the grading console may
 * therefore be handed `spec = null` for an HTML assignment with nothing lost.
 * `tests/html-assignment-rubric.test.ts` asserts that in both directions.
 *
 * THERE IS NO `previous` ARGUMENT, DELIBERATELY. `rubricFromSpec` takes one so
 * that a spec which GAINS authored criterion ids does not orphan scores keyed
 * under the positional `<module>-r<n>` it used to generate. A manifest has no
 * such state: `HtmlCriterion.id` is required and, by the contract, permanent --
 * the same rule and the same reason as `HtmlBlock.id`, which becomes
 * `block_id`. So the positional form is never generated here, `previous` could
 * only ever match itself, and passing one would be a no-op on every manifest
 * input while suggesting a stability mechanism that is really the contract's.
 * What DOES orphan scores is an author renaming a criterion id between
 * revisions, and nothing in this file can detect that -- the rubric simply
 * arrives with a criterion nobody has scored beside one nobody can reach. It is
 * the block-id rule, one table over.
 */

import {
	criterionIssues,
	criterionMax,
	rubricFromSpec,
	rubricTotal,
	type AssignmentSpec,
	type RubricCriterion
} from '$lib/classroom/assignment-spec';

// ---------------------------------------------------------------------------
// The manifest, as the contract states it.
// ---------------------------------------------------------------------------

// CONTRACT COPY, ledger 0127 owns the canonical file
export interface HtmlLevel {
	points: number;
	label: string;
	/** What the grading console renders on the level button. */
	short: string;
	/** The full description. */
	descriptor: string;
}

// CONTRACT COPY, ledger 0127 owns the canonical file
export interface HtmlCriterion {
	/** Unique WITHIN its module. Namespaced to `<moduleId>-<id>` on the way out. */
	id: string;
	text: string;
	points: number;
	/** Three or four, never two. */
	levels: HtmlLevel[];
}

// CONTRACT COPY, ledger 0127 owns the canonical file
export interface HtmlBlock {
	/** BECOMES block_id in classroom_responses. Permanent. */
	id: string;
	/** The document's own data-field attribute. */
	field: string;
	type: 'text' | 'longText' | 'checkbox' | 'radio' | 'image' | 'table';
	minSentences?: number;
}

// CONTRACT COPY, ledger 0127 owns the canonical file
export interface HtmlModule {
	/** Semantic and permanent, unique across the manifest. */
	id: string;
	title: string;
	points: number;
	audience?: 'team' | 'individual';
	blocks: HtmlBlock[];
	criteria: HtmlCriterion[];
}

// CONTRACT COPY, ledger 0127 owns the canonical file
export interface HtmlAssignmentManifest {
	schemaVersion: 3;
	kind: 'html-assignment';
	title: string;
	course: string;
	points: number;
	/**
	 * IDENTITY FIELDS -- student name, team, date (contract amendment 1). They
	 * carry no points and NEVER REACH THE RUBRIC, which for this module is a
	 * property of where they live rather than a rule it applies: nothing here
	 * reads anything but `modules[].criteria`, so a header block cannot become
	 * a criterion by any path. `tests/html-assignment-rubric.test.ts` asserts it
	 * anyway, because "it cannot happen" and "nothing checks" are the pair that
	 * lets a later refactor make it happen.
	 *
	 * The alternative the amendment rejects is what ledger 0128 had to do
	 * against the original contract: invent a 0-point module to hold them, which
	 * WOULD have rendered in the grading console as a criterion worth nothing.
	 */
	header: HtmlBlock[];
	modules: HtmlModule[];
}

// ---------------------------------------------------------------------------
// The translation.
// ---------------------------------------------------------------------------

/**
 * The manifest as the rubric-shaped slice of a spec. Internal, and everything
 * `rubricFromSpec` does not read is filler -- see the header for why this is
 * not exported and must not grow into a manifest-to-spec conversion.
 */
function specForRubric(manifest: HtmlAssignmentManifest): AssignmentSpec {
	return {
		schemaVersion: 1,
		meta: {
			assignmentId: '',
			title: manifest.title ?? '',
			course: manifest.course,
			totalPoints: Number(manifest.points) || 0
		},
		modules: (manifest.modules ?? []).map((mod) => ({
			id: mod.id,
			title: mod.title,
			points: Number(mod.points) || 0,
			blocks: [],
			rubric: (mod.criteria ?? []).map((c) => ({
				id: c.id,
				criterion: c.text,
				// v1.0's flat maximum, which `criterionMax` uses only when the
				// levels cannot answer. Carried so a criterion whose levels are
				// missing still reports the maximum its author intended, which is
				// what `manifestRubricIssues` then has something to refuse.
				points: Number(c.points),
				levels: (c.levels ?? []).map((l) => ({
					points: Number(l.points),
					label: l.label,
					descriptor: l.descriptor,
					short: l.short
				}))
			}))
		}))
	};
}

/**
 * THE ONE ENTRY POINT: a manifest's criteria as the stored rubric.
 *
 * Every criterion id is namespaced `<moduleId>-<criterionId>`, which is what
 * makes a criterion id repeated across two modules harmless and one repeated
 * INSIDE a module a collision -- `_classroom_normalize_rubric` refuses the
 * second by name ("Duplicate rubric criterion id"), and `manifestRubricIssues`
 * says so first, in the manifest's own vocabulary.
 */
export function manifestToRubric(manifest: HtmlAssignmentManifest): RubricCriterion[] {
	return rubricFromSpec(specForRubric(manifest));
}

/** The stored rubric's id for one manifest criterion. The join key, in one place. */
export function manifestCriterionId(moduleId: string, criterionId: string): string {
	return `${moduleId}-${String(criterionId ?? '').trim()}`;
}

// ---------------------------------------------------------------------------
// What the database would refuse, said first.
// ---------------------------------------------------------------------------

/** The normalizer's id shape: letters, digits, `-` and `_`, 1 to 64 characters. */
const RUBRIC_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** `_classroom_normalize_rubric`: at most 50 criteria, criterion text to 300. */
const MAX_CRITERIA = 50;
const MAX_CRITERION_TEXT = 300;
/** `_classroom_normalize_rubric`: the criterion maximum must be 0 to 1000. */
const MAX_CRITERION_POINTS = 1000;

/**
 * NO HALF POINTS, AND THIS IS THE ONE RULE HERE THE DATABASE DOES NOT HAVE
 * (contract amendment 1).
 *
 * `_classroom_check_levels` takes a `numeric` and is perfectly happy with 0.5;
 * the grading console's between-levels input is `step="0.5"` on purpose, because
 * an OVERRIDE is a grader's considered judgement with a required comment beside
 * it. A LEVEL is not that. A level's points are what every student who lands on
 * that level receives, so a half point in a level is a half point in the
 * gradebook for as long as the rubric stands, and that reaches FACTS -- a
 * decision nobody has made.
 *
 * SO IT IS AN AUTHORING RULE, ENFORCED HERE AND NOWHERE ELSE, and it must not be
 * described as a mirror of anything: nothing downstream will refuse it, which is
 * exactly why it has to be refused before the write.
 *
 * THE ARITHMETIC IT IMPLIES, which is the useful half. Points descend strictly
 * to zero, so N levels need N-1 distinct positive values; integers only, the
 * smallest such set is 1..N-1, so THE TOP LEVEL MUST BE AT LEAST N-1. A
 * criterion worth 1 therefore cannot carry three levels at all, and the
 * amendment's answer is to merge it into an adjacent criterion or repoint it to
 * 2 -- never to level it 1 / 0.5 / 0.
 */
const isWholePoints = (n: number): boolean => Number.isFinite(n) && Number.isInteger(n);

/**
 * EVERYTHING `classroom_set_rubric` WOULD REFUSE, IN THE MANIFEST'S OWN WORDS.
 *
 * A refusal that reaches an admin as "Rubric row 7 needs an id" names a row in
 * a payload they never wrote; this names the module and the criterion they DID
 * write. It is the same argument as the Foundry preflight's: refuse before the
 * request, with the location already inside the sentence.
 *
 * IT CALLS `criterionIssues` FOR THE LEVELS AND ADDS ONLY WHAT THAT DOES NOT
 * COVER. `criterionIssues` is already the mirror of `_classroom_check_levels`
 * -- three or four levels, top level equal to the maximum, bottom level 0,
 * strictly descending, every level carrying a label and a descriptor -- and a
 * second copy of those five is what would stop agreeing with the column. What
 * is genuinely uncovered is the NORMALIZER's own half, which operates on the
 * criterion rather than on its levels: the id's shape, id uniqueness, the
 * criterion text, the 50-criteria cap and the 0-to-1000 maximum.
 *
 * TWO ITEMS HERE ARE NOT MIRRORS OF ANYTHING, AND BOTH SAY SO WHERE THEY ARE
 * WRITTEN. The half-point rule is an AUTHORING rule the database does not have
 * (see `isWholePoints`); the module-total check below is a warning about a
 * denominator rather than a refusal at all.
 *
 * THE TOTAL, AND IT IS THE ONE ITEM HERE THAT IS NOT A REFUSAL.
 * A module whose criteria do not sum to its stated points stores perfectly
 * happily and then renders a denominator on the grading console that disagrees
 * with the points on the assignment. That is a display defect with no error
 * behind it, which is precisely the kind this whole lane exists to stop
 * shipping. Whether the manifest is otherwise well-formed is ledger 0127's
 * question, not this file's.
 */
export function manifestRubricIssues(manifest: HtmlAssignmentManifest): string[] {
	const issues: string[] = [];
	const modules = manifest.modules ?? [];
	const seen = new Set<string>();
	let count = 0;

	for (const mod of modules) {
		const where = mod.title?.trim() || mod.id || 'a module';
		const criteria = mod.criteria ?? [];
		if (!criteria.length) {
			issues.push(`${where} has no rubric criteria, so nothing in it can be graded.`);
		}
		for (const c of criteria) {
			count += 1;
			const id = manifestCriterionId(mod.id, c.id);
			const named = c.text?.trim() || c.id || 'an unnamed criterion';
			if (!RUBRIC_ID_RE.test(id)) {
				issues.push(
					`${where}: "${named}" becomes the rubric id "${id}", which is not allowed. A module id and a criterion id may use letters, digits, - and _ only, and the two joined must be 64 characters or fewer.`
				);
			} else if (seen.has(id)) {
				issues.push(
					`${where}: "${named}" repeats the criterion id "${c.id}" inside its own module. Repeating one across two modules is fine, because the stored id carries the module; repeating it inside one collides.`
				);
			}
			seen.add(id);

			const text = c.text?.trim() ?? '';
			if (!text) {
				issues.push(`${where}: a criterion has no text.`);
			} else if (text.length > MAX_CRITERION_TEXT) {
				issues.push(
					`${where}: "${text.slice(0, 40)}..." is ${text.length} characters; a criterion may be at most ${MAX_CRITERION_TEXT}.`
				);
			}

			const max = criterionMax({ points: Number(c.points), levels: c.levels });
			if (!Number.isFinite(max) || max < 0 || max > MAX_CRITERION_POINTS) {
				issues.push(
					`${where}: "${named}" has a maximum of ${max}; a criterion maximum must be between 0 and ${MAX_CRITERION_POINTS}.`
				);
			}
			// NO HALF POINTS, per level and then as the arithmetic the rule
			// implies. Named separately from the level sweep below because this
			// one has no counterpart in SQL -- see `isWholePoints`.
			const half = (c.levels ?? []).filter((l) => !isWholePoints(Number(l.points)));
			if (half.length) {
				issues.push(
					`${where}: "${named}" has ${half.length === 1 ? 'a level' : `${half.length} levels`} worth a fraction of a point (${half.map((l) => l.points).join(', ')}). Rubric levels are whole points: a half point here is a half point in every gradebook this criterion ever reaches. Repoint the criterion or merge it into the one beside it.`
				);
			} else if ((c.levels ?? []).length && max < (c.levels ?? []).length - 1) {
				issues.push(
					`${where}: "${named}" is worth ${max} but carries ${(c.levels ?? []).length} levels, which cannot descend to zero in whole points. A criterion needs at least ${(c.levels ?? []).length - 1} points to carry ${(c.levels ?? []).length} levels; repoint it or merge it into the one beside it.`
				);
			}

			// The level rules, from the one mirror of them. Prefixed rather than
			// rewritten, so widening _classroom_check_levels widens this too.
			for (const issue of criterionIssues({
				id,
				criterion: text,
				points: max,
				levels: (c.levels ?? []) as RubricCriterion['levels']
			})) {
				issues.push(`${where}: "${named}" ${issue.charAt(0).toLowerCase()}${issue.slice(1)}`);
			}
		}

		const summed = criteria.reduce(
			(sum, c) => sum + (criterionMax({ points: Number(c.points), levels: c.levels }) || 0),
			0
		);
		const claimed = Number(mod.points);
		if (criteria.length && Number.isFinite(claimed) && summed !== claimed) {
			issues.push(
				`${where} is worth ${claimed} points but its criteria total ${summed}. The grading console scores out of the rubric, so this module would be graded out of ${summed}.`
			);
		}
	}

	if (!count) {
		issues.push(
			'This assignment has no rubric criteria at all, so there is nothing to grade against. A rubric needs at least one criterion.'
		);
	} else if (count > MAX_CRITERIA) {
		issues.push(
			`This assignment has ${count} rubric criteria across all its modules; at most ${MAX_CRITERIA} may be stored.`
		);
	}

	return issues;
}

/**
 * What the grading console will show as the denominator, from the manifest.
 *
 * `rubricTotal` over the DERIVED criteria rather than a sum of `module.points`:
 * the console's out-of comes from the rubric, so anywhere the two disagree the
 * rubric is the number on screen. `manifestRubricIssues` reports the
 * disagreement; this reports what a grader will actually see.
 */
export function manifestRubricTotal(manifest: HtmlAssignmentManifest): number {
	return rubricTotal(manifestToRubric(manifest));
}
