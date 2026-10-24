// tools/connector/gates.mjs
//
// WHAT MAKES A DATABASE FUNCTION AN ADMIN ACTION, for the connector's
// generated layer (tools/connector/auto.mjs, ledger 0416).
//
// A function is an admin action when its own body calls one of the helpers
// below: the checks that decide "is this caller staff over this thing" (a site
// admin, the owner, a class's teacher, coin staff, a certifier, a GAUNTLET
// author, a map editor, a notebook reviewer, a tournament manager). Read off
// the body pg_proc holds on the whole migration chain, never off a name.
//
// A helper that only asks "may this caller READ it" (classroom_can_read_item,
// armory_is_member) is deliberately NOT here: a student's own action calls
// those too, and listing one would make every student action look like staff
// work. A helper a STUDENT role passes (the coin auditor) is not here either.
//
// tests/connector-coverage.test.ts holds every name below to a real function,
// so a renamed helper reddens the suite instead of silently gating nothing.

export const STAFF_GATES = Object.freeze([
	'is_admin',
	'is_owner',
	'is_teacher',
	'_admin_is_email',
	'admin_owner_email',
	'classroom_manages_section',
	'_classroom_manages_section_email',
	'_classroom_manages_item',
	'_classroom_manages_course',
	'classroom_can_review_submission',
	'classroom_is_staff',
	'_classroom_theme_manager',
	'_classroom_quick_post_can_take_down',
	'_coin_full_staff',
	'_coin_staff',
	'_cert_can_certify',
	'_cert_is_certifier',
	'notebook_reviews_section',
	'notebook_manages_student',
	'_notebook_manages_session',
	'_notebook_manages_student_email',
	'_notebook_reviews_student_email',
	'gauntlet_can_author',
	'_tournament_can_manage',
	'frc_can_review',
	'maps_is_editor',
	'maps_can_edit_node',
	'_ideacad_direct_manager',
	'_ideacad_manages_document',
	'_connector_admin_or_refuse'
]);

const GATE_SET = new Set(STAFF_GATES);

/**
 * A CALLER SEAM IS WHERE A FUNCTION BECOMES THE CALLER'S OWN ACTION, and the
 * staff checks behind it are not gates (ledger 0432, gap 3f52bae9).
 * `_coin_student_seam` asks whether the CALLER is a coin member, and the
 * member list it reads excludes staff by calling `_admin_is_email`: followed
 * like any private helper, that made every student coin action (finish a
 * contract, buy a pass, send a transfer) look like an admin action, so one of
 * them was a connector tool that ran as Mr. Pina and answered
 * "not_in_economy". A function that reaches a seam acts as whoever calls it.
 * tests/connector-coverage.test.ts holds every name here to a real function
 * and every hand entry off a function that reaches one.
 */
export const CALLER_SEAMS = Object.freeze(['_coin_student_seam']);

const SEAM_SET = new Set(CALLER_SEAMS);

/** The staff gates a function body calls by name (schema-qualified or not). */
export function gatesIn(body) {
	const found = new Set();
	for (const m of String(body ?? '').matchAll(/(?:\bpublic\.|(?<![a-z0-9_.]))([a-z_][a-z0-9_]*)\s*\(/gi)) {
		const name = m[1].toLowerCase();
		if (GATE_SET.has(name)) found.add(name);
	}
	return [...found].sort();
}

/**
 * Whether a body writes on its own: a DML statement, or dynamic SQL (which is
 * counted as a write because nothing can say what it runs). Conservative on
 * purpose: a comment mentioning an insert makes a function a write, and a
 * write asks first, which is the safe side to be wrong on.
 */
export function bodyWrites(body) {
	return /\b(insert\s+into|update\s+(?:only\s+)?[a-z_."]+(?:\s+(?:as\s+)?[a-z_][a-z0-9_]*)?\s+set|delete\s+from|merge\s+into|truncate|execute)\b/i.test(String(body ?? ''));
}

/**
 * The staff gates a function reaches: the ones its body calls, and the ones a
 * PRIVATE helper it calls reaches (`_classroom_grade_undo_guard`,
 * `_tournament_require_host`), to any depth. Only through a private helper
 * (a name starting `_`): a public "may this caller read it" check such as
 * classroom_can_read_item lets an enrolled student through as well as staff,
 * and following it would make every student action look like staff work.
 *
 * @param {Map<string, string[]>} bodies every public function's bodies, by name
 * @returns {Map<string, string[]>} the gates each function reaches, by name
 */
export function reachedGates(bodies) {
	const direct = new Map();
	for (const [name, list] of bodies) direct.set(name, new Set(list.flatMap(gatesIn)));
	const memo = new Map();
	const visit = (name, seen) => {
		if (memo.has(name)) return memo.get(name);
		const out = new Set(direct.get(name) ?? []);
		for (const body of bodies.get(name) ?? []) {
			for (const c of callsIn(body)) {
				if (!c.startsWith('_') || seen.has(c) || !bodies.has(c) || GATE_SET.has(c) || SEAM_SET.has(c)) continue;
				for (const g of visit(c, new Set([...seen, c]))) out.add(g);
			}
		}
		if (seen.size === 1) memo.set(name, out);
		return out;
	};
	const result = new Map();
	for (const name of bodies.keys()) result.set(name, [...visit(name, new Set([name]))].sort());
	return result;
}

/**
 * The functions that act as their caller: a body that calls a caller seam, or
 * calls a function that does, to any depth.
 *
 * @param {Map<string, string[]>} bodies every public function's bodies, by name
 */
export function callerActions(bodies) {
	const acts = new Set();
	for (const [name, list] of bodies) if (list.some((b) => callsIn(b).some((c) => SEAM_SET.has(c)))) acts.add(name);
	let grew = true;
	while (grew) {
		grew = false;
		for (const [name, list] of bodies) {
			if (acts.has(name) || SEAM_SET.has(name)) continue;
			if (list.some((b) => callsIn(b).some((c) => acts.has(c)))) {
				acts.add(name);
				grew = true;
			}
		}
	}
	return acts;
}

/** Every public function a body calls, by name. */
export function callsIn(body) {
	return [...new Set([...String(body ?? '').matchAll(/\bpublic\.([a-z_][a-z0-9_]*)\s*\(/gi)].map((m) => m[1].toLowerCase()))];
}

/**
 * The functions that write, transitively: a function writes when its body
 * does, or when it calls a function that does. A fixpoint over every public
 * function's body, so a read that calls a logging helper is a write.
 *
 * @param {Map<string, string[]>} bodies every public function's bodies, by name (one per overload)
 */
export function writers(bodies) {
	const writes = new Set();
	for (const [name, list] of bodies) if (list.some(bodyWrites)) writes.add(name);
	let grew = true;
	while (grew) {
		grew = false;
		for (const [name, list] of bodies) {
			if (writes.has(name)) continue;
			if (list.some((b) => callsIn(b).some((c) => writes.has(c)))) {
				writes.add(name);
				grew = true;
			}
		}
	}
	return writes;
}
