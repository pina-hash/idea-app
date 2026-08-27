/**
 * THE STRUCTURAL GUARD. The point of the in-place spec editor, and the reason
 * it is safe to put a published assignment in front of somebody who does not
 * read JSON.
 *
 * A pure function in its own module, driven by its own tests, and deliberately
 * NOT a property of the editor's rendering. Rendering only the safe fields is
 * not enforcement: a bug in the editor -- a mis-indexed path, a stale draft, a
 * clone that lost a key -- would then write a broken spec silently, and the
 * failure would surface as a changed point value in a class taught by somebody
 * with no way to debug a spec. So the outgoing document is compared against the
 * incoming one field by field and the save is REFUSED unless every difference
 * lands on a text surface.
 *
 * THE PARTITION COMES FROM ONE PLACE, `specTextSurfaces` in spec-text.ts. This
 * module names no field of its own -- it asks that enumeration which paths are
 * wording and requires deep equality everywhere else. A second list of "safe
 * fields" here is precisely the thing that would stop matching.
 *
 * IT IS COMPUTED AGAINST THE *BEFORE* DOCUMENT. The allowed set is a function
 * of the structure being edited, so a save that invented a new module or a new
 * block cannot also invent permission for the text inside it: the new module is
 * an array-length difference, which is refused before anything inside it is
 * looked at.
 *
 * A REFUSAL NAMES WHAT DIFFERED, with the path and both values, because the
 * person reading it is the person who has to decide whether the edit was worth
 * making by hand.
 */

import {
	applySpecTextEdits,
	specPathKey,
	specTextSurfaces,
	type EditableSpec,
	type EditableSpecKind,
	type SpecPathSegment,
	type SpecTextPath
} from '$lib/classroom/spec-text';

export interface SpecGuardViolation {
	/** `modules[1].blocks[0].points` */
	path: string;
	/** One sentence, naming the field and both sides. */
	message: string;
}

export type SpecGuardResult =
	| { ok: true; changed: string[] }
	| { ok: false; violations: SpecGuardViolation[] };

/** How many violations a refusal carries before it stops collecting. A spec
 *  rebuilt wholesale would otherwise produce a list nobody can read. */
const MAX_VIOLATIONS = 25;

function label(v: unknown): string {
	if (v === undefined) return 'nothing';
	if (v === null) return 'null';
	if (typeof v === 'string') return JSON.stringify(v.length > 60 ? v.slice(0, 57) + '...' : v);
	if (Array.isArray(v)) return `a list of ${v.length}`;
	if (typeof v === 'object') return 'an object';
	return String(v);
}

function typeName(v: unknown): string {
	if (v === undefined) return 'nothing';
	if (v === null) return 'null';
	if (Array.isArray(v)) return 'a list';
	return typeof v === 'object' ? 'an object' : typeof v;
}

interface Allowed {
	optional: boolean;
}

interface Walk {
	allowed: Map<string, Allowed>;
	violations: SpecGuardViolation[];
	changed: string[];
}

function violate(w: Walk, path: SpecTextPath, message: string): void {
	if (w.violations.length >= MAX_VIOLATIONS) return;
	w.violations.push({ path: specPathKey(path) || '(root)', message });
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * The text leaf. Reached only for a path the enumeration named, so the ONLY
 * question left is whether both sides are strings (or, for an optional field,
 * a string and nothing).
 */
function compareText(w: Walk, path: SpecTextPath, key: string, a: unknown, b: unknown): void {
	// IDENTITY FIRST, and that ordering is a corpus finding rather than a
	// tidiness one. Seven reference documents in `materials/` carry a
	// `caption: null` on a dataTable, and with the type test ahead of this line
	// the guard refused every edit anywhere in those documents with "changed
	// from null to null" -- a field that had not moved at all.
	if (a === b) return;

	const allowed = w.allowed.get(key) as Allowed;
	if (!isTextish(a) || !isTextish(b)) {
		// A text surface that stopped being text. Not reachable from the editor,
		// which is exactly why it is worth refusing rather than assuming.
		violate(
			w,
			path,
			`${specPathKey(path)} is a text field, and it changed from ${typeName(a)} to ${typeName(b)}.`
		);
		return;
	}
	if (!allowed.optional && blank(a) !== blank(b)) {
		violate(
			w,
			path,
			blank(a)
				? `${specPathKey(path)} is a required field and was added.`
				: `${specPathKey(path)} is a required field and was removed.`
		);
		return;
	}
	w.changed.push(key);
}

/**
 * NULL COUNTS AS ABSENT for a text surface, because that is what every renderer
 * already makes of it: `{#if block.caption}` and `{link.label ?? ''}` cannot
 * tell a null from a missing key, and the corpus carries both spellings for the
 * same "nothing here". Anything that is NOT one of these three is a type
 * change and is refused.
 */
function isTextish(v: unknown): boolean {
	return v === undefined || v === null || typeof v === 'string';
}

function blank(v: unknown): boolean {
	return v === undefined || v === null;
}

function compare(w: Walk, path: SpecTextPath, a: unknown, b: unknown): void {
	const key = specPathKey(path);
	if (w.allowed.has(key)) {
		compareText(w, path, key, a, b);
		return;
	}
	if (a === b) return;

	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b)) {
			violate(w, path, `${key} changed from ${typeName(a)} to ${typeName(b)}.`);
			return;
		}
		if (a.length !== b.length) {
			violate(
				w,
				path,
				`${key} has ${a.length} ${a.length === 1 ? 'entry' : 'entries'} and the save has ${b.length}. Adding or removing one is a structural change.`
			);
			return;
		}
		for (let i = 0; i < a.length; i++) compare(w, [...path, i], a[i], b[i]);
		return;
	}

	if (isPlainObject(a) || isPlainObject(b)) {
		if (!isPlainObject(a) || !isPlainObject(b)) {
			violate(w, path, `${key} changed from ${typeName(a)} to ${typeName(b)}.`);
			return;
		}
		const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
		for (const k of [...keys].sort()) {
			const childPath: SpecTextPath = [...path, k as SpecPathSegment];
			const childKey = specPathKey(childPath);
			const inA = Object.prototype.hasOwnProperty.call(a, k);
			const inB = Object.prototype.hasOwnProperty.call(b, k);
			if (inA !== inB && !w.allowed.has(childKey)) {
				violate(
					w,
					childPath,
					inA
						? `${childKey} was removed. Only wording may change here.`
						: `${childKey} was added. Only wording may change here.`
				);
				continue;
			}
			compare(w, childPath, a[k], b[k]);
		}
		return;
	}

	violate(w, path, `${key} changed from ${label(a)} to ${label(b)}.`);
}

/**
 * Compare the outgoing spec against the incoming one.
 *
 * `ok` carries the keys of the text surfaces that actually moved -- an empty
 * list is a save with nothing in it, which the caller reports rather than
 * sending.
 */
export function guardSpecTextEdit(
	before: EditableSpec | null | undefined,
	after: EditableSpec | null | undefined,
	kind: EditableSpecKind
): SpecGuardResult {
	if (!before || !after || typeof before !== 'object' || typeof after !== 'object') {
		return {
			ok: false,
			violations: [
				{
					path: '(root)',
					message: 'The edit could not be compared against the stored document.'
				}
			]
		};
	}
	const allowed = new Map<string, Allowed>();
	for (const s of specTextSurfaces(before, kind)) {
		allowed.set(s.key, { optional: s.optional });
	}
	const w: Walk = { allowed, violations: [], changed: [] };
	compare(w, [], before, after);
	if (w.violations.length) return { ok: false, violations: w.violations };
	return { ok: true, changed: w.changed };
}

/**
 * Apply an edit set and guard the result, in one call, so no caller can do the
 * first without the second. The guard runs on the document that would actually
 * be sent -- not on the edits that were meant to produce it -- which is what
 * makes a bug in `applySpecTextEdits` a refusal rather than a bad write.
 */
export function prepareSpecTextSave<T extends EditableSpec>(
	original: T,
	kind: EditableSpecKind,
	edits: Map<string, string>
): { ok: true; spec: T; changed: string[] } | { ok: false; violations: SpecGuardViolation[] } {
	const next = applySpecTextEdits(original, kind, edits);
	const verdict = guardSpecTextEdit(original, next, kind);
	if (!verdict.ok) return verdict;
	return { ok: true, spec: next, changed: verdict.changed };
}
