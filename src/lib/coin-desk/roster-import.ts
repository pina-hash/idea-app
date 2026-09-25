/**
 * Filling a coin section from a CLASS ROSTER (ledger 0298, feedback R12).
 *
 * A coin section (0073) is its own email-keyed roster, deliberately separate
 * from `classroom_enrollments`: a coin section can be a group no class has, and
 * the two do not follow each other. What this adds is a ONE-PRESS COPY from a
 * classroom section into a coin section, through the SAME write the paste box
 * already uses (`coin_admin_assign_section_students`), so no new authority and
 * no new rule about what a coin section is.
 *
 * FOUR THINGS IT WILL NOT DO, and each is a silent failure if it ever did:
 *
 *  - IMPORT SOMEBODY WHO MANAGES THE CLASS. A teacher enrolled in their own
 *    section is an ordinary row (0138), and in a coin section they would be
 *    paid Weekly Wage with every student. The exclusion is `splitRoster`, over
 *    the `manages` flag `loadSectionRoster` projects -- never re-derived here.
 *    A read that cannot answer that question (`managesReady` false, or a row
 *    with no flag) is REFUSED, never taken as "nobody manages it".
 *  - IMPORT AN INACTIVE ENROLLMENT. `active = false` is how a student who left
 *    a class is recorded (0082), so only `active === true` counts.
 *  - MOVE ANYBODY. `coin_section_students` is keyed on the email alone, so a
 *    student sits in at most one coin section and the assign RPC OVERWRITES:
 *    sending an address that is already in a different coin section takes it
 *    out of that one. So an address with a placement anywhere is never sent;
 *    one elsewhere is reported by name and left where it is, and moving it is
 *    still the paste box's deliberate job.
 *  - WRITE A COUNT NOBODY SAW. The number on the button is a plan; the press
 *    re-plans and writes only when the list to add is the one on screen.
 *
 * Addresses are normalized the way both tables store them
 * (`lower(btrim(x))`), deduped and sorted before anything is sent.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
	normalizeSectionRow,
	sortSections,
	splitRoster,
	type ClassroomSection,
	type TxResult
} from '$lib/classroom/classroom';
import { loadSectionRoster, SECTION_SELECT, type RosterRead } from '$lib/classroom/transports';

/**
 * The classroom half, injected. The real one reads through the classroom
 * module's own roster reader; the dev harness answers in memory. ABSENCE
 * REMOVES THE CONTROL: SectionManager renders no import without it.
 */
export interface ClassRosterTransports {
	/** Every classroom section the caller can see (RLS: every one, for an admin). */
	listClasses(): Promise<TxResult<ClassroomSection[]>>;
	/** ONE class's roster, through `loadSectionRoster` and nothing else. */
	loadRoster(sectionId: string): Promise<TxResult<RosterRead>>;
}

/** The real transports, on the caller's own client. */
export function classRosterTransports(supabase: SupabaseClient): ClassRosterTransports {
	return {
		async listClasses() {
			const { data, error } = await supabase.from('classroom_sections').select(SECTION_SELECT);
			if (error) return { ok: false, message: error.message };
			return {
				ok: true,
				data: sortSections(((data ?? []) as Record<string, unknown>[]).map(normalizeSectionRow))
			};
		},
		loadRoster: (sectionId) => loadSectionRoster(supabase, sectionId)
	};
}

/**
 * `lower(btrim(x))`, the key `coin_section_students` and `classroom_enrollments`
 * both enforce by CHECK. `btrim` with no second argument strips SPACES ONLY, so
 * this does too; JavaScript's `trim()` would also eat tabs and newlines and
 * produce a key the database never would.
 */
export function coinEmailKey(raw: string): string {
	return raw.replace(/^ +| +$/g, '').toLowerCase();
}

/** Who on a class roster could be imported at all, before the coin side is asked. */
export type RosterCandidates =
	| { ok: false; reason: 'cannot_tell_managers' }
	| {
			ok: true;
			/** Normalized, deduped, sorted. */
			emails: string[];
			/** The roster's own name for each address, for the report. */
			names: Map<string, string>;
			/** Addresses dropped because they manage the class. */
			managers: number;
			/** Enrollment rows not active. */
			inactive: number;
			/** Addresses with no `@` (the RPC would refuse them anyway). */
			invalid: number;
	  };

export function rosterImportCandidates(read: RosterRead): RosterCandidates {
	// "Cannot tell" must never read as "nobody manages this class": a teacher
	// imported here is a teacher paid a weekly wage.
	if (!read.managesReady || read.rows.some((r) => typeof r.manages !== 'boolean')) {
		return { ok: false, reason: 'cannot_tell_managers' };
	}
	const { students, managers } = splitRoster(read.rows);
	const names = new Map<string, string>();
	let inactive = 0;
	let invalid = 0;
	for (const row of students) {
		if (row.active !== true) {
			inactive++;
			continue;
		}
		const key = coinEmailKey(row.student_email);
		if (!key.includes('@')) {
			invalid++;
			continue;
		}
		if (!names.has(key)) names.set(key, row.display_name?.trim() || key);
	}
	return {
		ok: true,
		emails: [...names.keys()].sort(),
		names,
		managers: managers.length,
		inactive,
		invalid
	};
}

export interface RosterImportPlan {
	classId: string;
	targetSectionId: string;
	/** In no coin section today: these, and only these, are sent. */
	add: string[];
	/** Already in the target coin section. */
	already: string[];
	/** In a DIFFERENT coin section, and left there. */
	elsewhere: { email: string; sectionId: string }[];
	names: Map<string, string>;
	managers: number;
	inactive: number;
	invalid: number;
}

/**
 * Sorts the candidates by where each one sits today. `placement` maps an
 * address to the coin section it is in; an address missing from it is in none.
 */
export function planRosterImport(
	classId: string,
	candidates: Extract<RosterCandidates, { ok: true }>,
	placement: ReadonlyMap<string, string>,
	targetSectionId: string
): RosterImportPlan {
	const add: string[] = [];
	const already: string[] = [];
	const elsewhere: { email: string; sectionId: string }[] = [];
	for (const email of candidates.emails) {
		const current = placement.get(email);
		if (current === undefined) add.push(email);
		else if (current === targetSectionId) already.push(email);
		else elsewhere.push({ email, sectionId: current });
	}
	return {
		classId,
		targetSectionId,
		add,
		already,
		elsewhere,
		names: candidates.names,
		managers: candidates.managers,
		inactive: candidates.inactive,
		invalid: candidates.invalid
	};
}

/** Does the press write exactly what the button promised? */
export function samePlannedAdds(a: RosterImportPlan, b: RosterImportPlan): boolean {
	return (
		a.classId === b.classId &&
		a.targetSectionId === b.targetSectionId &&
		a.add.length === b.add.length &&
		a.add.every((email, i) => email === b.add[i])
	);
}

/**
 * Which coin section each address is in now. RLS answers it (admins read
 * `coin_section_students`, 0073); the keys are normalized again on the way
 * out so a comparison can never miss on spelling.
 */
export async function readCoinPlacement(
	supabase: SupabaseClient,
	emails: readonly string[]
): Promise<TxResult<Map<string, string>>> {
	const placement = new Map<string, string>();
	// Chunked so a very large roster can never build a request URL past a
	// proxy's limit; a class is far under one chunk.
	for (let i = 0; i < emails.length; i += 100) {
		const { data, error } = await supabase
			.from('coin_section_students')
			.select('student_email, section_id')
			.in('student_email', emails.slice(i, i + 100));
		if (error) return { ok: false, message: error.message };
		for (const row of (data ?? []) as { student_email: string; section_id: string }[]) {
			placement.set(coinEmailKey(row.student_email), row.section_id);
		}
	}
	return { ok: true, data: placement };
}

export const CANNOT_TELL_MANAGERS =
	'This class roster cannot say which people on it teach the class, so nothing can be imported from it. Add students with the box above instead.';

/** The whole plan, from one class into one coin section. Fails closed on every read. */
export async function buildRosterImportPlan(
	deps: {
		loadRoster: ClassRosterTransports['loadRoster'];
		readPlacement: (emails: readonly string[]) => Promise<TxResult<Map<string, string>>>;
	},
	classId: string,
	targetSectionId: string
): Promise<TxResult<RosterImportPlan>> {
	const read = await deps.loadRoster(classId);
	if (!read.ok) return { ok: false, message: `Could not read that class roster: ${read.message}` };
	const candidates = rosterImportCandidates(read.data);
	if (!candidates.ok) return { ok: false, message: CANNOT_TELL_MANAGERS };
	let placement = new Map<string, string>();
	if (candidates.emails.length) {
		// Without this, an address in another coin section would be MOVED out of
		// it by the assign RPC. Not knowing is a refusal, never "in none".
		const placed = await deps.readPlacement(candidates.emails);
		if (!placed.ok) {
			return {
				ok: false,
				message: `Could not check which coin section each student is in already: ${placed.message}`
			};
		}
		placement = placed.data;
	}
	return { ok: true, data: planRosterImport(classId, candidates, placement, targetSectionId) };
}

/** "27 students", "1 student". */
export function studentCount(n: number): string {
	return `${n} student${n === 1 ? '' : 's'}`;
}
