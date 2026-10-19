/**
 * IDEA ARMORY PART NUMBERS (ledger 0405, decision 41, scheme A): the ONE
 * spelling of the format on the website, its parser, its validator, and the
 * small arithmetic the Parts view and the COTS library draw from. Client-safe
 * plain data: no Svelte, no Supabase.
 *
 * A made part or assembly is `PREFIX-YY-SS-AAPP`: the team (`5669`) or the
 * course (`IDEA100`), a two-digit season, a two-letter subsystem code, a
 * two-digit assembly and a two-digit part. An assembly ends `00`. A revision
 * is a letter BESIDE the number, never in it. COTS parts get no team number:
 * `VENDOR-vendor's own number`, then a short description.
 *
 * THE DATABASE IS THE BOUNDARY AND THIS IS ITS MIRROR.
 * `armory_part_number_problem(text)` and `armory_cots_problem(text, text)` in
 * migration 0274 are the SQL statements of the same rules, and
 * `tests/armory-part-numbers-parity.test.ts` puts one corpus to both and
 * compares the sentences character for character. Change a sentence in both
 * places in one commit, or that test reddens. Trimming is SPACES ONLY at the
 * ends, because SQL's `btrim` trims spaces only (CLAUDE.md, the `btrim`
 * trap); a tab is malformed on both sides.
 */

/** The nine codes the decision named, in its order. The list itself is data in the database; this is only the seed, for the harness and the tests. */
export const SEED_SUBSYSTEMS: ReadonlyArray<{ code: string; name: string }> = [
	{ code: 'DT', name: 'Drivetrain' },
	{ code: 'SH', name: 'Shooter' },
	{ code: 'IN', name: 'Intake' },
	{ code: 'EL', name: 'Elevator' },
	{ code: 'AR', name: 'Arm' },
	{ code: 'CL', name: 'Climber' },
	{ code: 'FR', name: 'Frame' },
	{ code: 'EE', name: 'Electrical' },
	{ code: 'MS', name: 'Miscellaneous' }
];

export const PART_NUMBER_EXAMPLE = '5669-27-DT-0104';

/** The sentences, written out once. The SQL carries the identical text. */
export const PART_NUMBER_PROBLEMS = {
	empty: `Enter a part number, such as ${PART_NUMBER_EXAMPLE}.`,
	shape:
		'A part number is four groups joined by dashes: the team or course, the season, the subsystem, then the assembly and part, such as 5669-27-DT-0104.',
	revision: 'A revision letter goes beside the number, never in it: write 5669-27-DT-0104 and Rev B separately.',
	prefix: 'The first group is the team number or the course, two to ten letters or digits, such as 5669 or IDEA100.',
	season: 'The second group is the season in two digits, such as 27.',
	subsystem: 'The third group is the two-letter subsystem code, such as DT.',
	last: 'The last group is four digits, a two-digit assembly then a two-digit part, such as 0104.'
} as const;

export const COTS_PROBLEMS = {
	vendorEmpty: 'Enter the vendor prefix, such as WCP, REV, AM or HW.',
	vendor: 'The vendor prefix is one to eight letters or digits, starting with a letter, such as WCP or REV.',
	partEmpty: "Enter the vendor's own part number, such as 21-1650.",
	part: "The vendor's part number is up to 48 letters, digits, dots, dashes, slashes or #, with no spaces."
} as const;

/** SQL's `btrim(x)`: spaces only, at both ends. */
function btrim(s: string): string {
	return s.replace(/^ +| +$/g, '');
}

const PRINTABLE = /^[ -~]+$/;
const REVISION_INSIDE = /^[A-Z0-9]{2,10}-[0-9]{2}-[A-Z]{2}-[0-9]{4}[- ]?(REV\.? ?)?[A-Z]{1,2}$/;

/** A part number as the registry stores it: trimmed and in capitals. */
export function normalizePartNumber(value: string | null | undefined): string {
	return btrim(value ?? '').toUpperCase();
}

/**
 * Null for a well-formed part number, otherwise the sentence a person reads.
 * The mirror of `armory_part_number_problem`. It judges the SHAPE only:
 * whether the subsystem code exists is the registry's question.
 */
export function partNumberProblem(value: string | null | undefined): string | null {
	let s = btrim(value ?? '');
	if (s === '') return PART_NUMBER_PROBLEMS.empty;
	if (!PRINTABLE.test(s)) return PART_NUMBER_PROBLEMS.shape;
	s = s.toUpperCase();
	if (REVISION_INSIDE.test(s)) return PART_NUMBER_PROBLEMS.revision;
	const g = s.split('-');
	if (g.length !== 4) return PART_NUMBER_PROBLEMS.shape;
	if (!/^[A-Z0-9]{2,10}$/.test(g[0])) return PART_NUMBER_PROBLEMS.prefix;
	if (!/^[0-9]{2}$/.test(g[1])) return PART_NUMBER_PROBLEMS.season;
	if (!/^[A-Z]{2}$/.test(g[2])) return PART_NUMBER_PROBLEMS.subsystem;
	if (!/^[0-9]{4}$/.test(g[3])) return PART_NUMBER_PROBLEMS.last;
	return null;
}

export interface PartNumberParts {
	prefix: string;
	seasonYY: number;
	subsystem: string;
	assembly: number;
	part: number;
}

/** The groups of a well-formed number, or null. */
export function parsePartNumber(value: string | null | undefined): PartNumberParts | null {
	if (partNumberProblem(value) !== null) return null;
	const [prefix, yy, ss, last] = normalizePartNumber(value).split('-');
	return { prefix, seasonYY: Number(yy), subsystem: ss, assembly: Number(last.slice(0, 2)), part: Number(last.slice(2)) };
}

const two = (n: number): string => String(n).padStart(2, '0');

/** The one spelling of a number from its groups. */
export function formatPartNumber(p: PartNumberParts): string {
	return `${p.prefix}-${two(p.seasonYY)}-${p.subsystem}-${two(p.assembly)}${two(p.part)}`;
}

/** An assembly's number ends 00. */
export function isAssemblyNumber(p: Pick<PartNumberParts, 'part'>): boolean {
	return p.part === 0;
}

/** Null for a well-formed COTS number, otherwise the sentence. The mirror of `armory_cots_problem`. */
export function cotsProblem(vendor: string | null | undefined, vendorPart: string | null | undefined): string | null {
	const v = btrim(vendor ?? '');
	const p = btrim(vendorPart ?? '');
	if (v === '') return COTS_PROBLEMS.vendorEmpty;
	if (!/^[A-Z][A-Z0-9]{0,7}$/.test(v.toUpperCase()) || !PRINTABLE.test(v)) return COTS_PROBLEMS.vendor;
	if (p === '') return COTS_PROBLEMS.partEmpty;
	if (!/^[A-Za-z0-9][A-Za-z0-9./#-]{0,47}$/.test(p)) return COTS_PROBLEMS.part;
	return null;
}

/** How a COTS part is named: the vendor in capitals, a dash, the vendor's own number as written. */
export function cotsNumber(vendor: string, vendorPart: string): string {
	return `${btrim(vendor).toUpperCase()}-${btrim(vendorPart)}`;
}

/* ---- What the database answers (0274's two reads) ---------------------- */

export interface PartNumberRow {
	id: string;
	part_number: string;
	prefix: string;
	season_yy: number;
	subsystem: string;
	assembly: number;
	part: number;
	kind: 'assembly' | 'part';
	revision: string;
	description: string;
	made_from: string | null;
	project_id: string | null;
	file_id: string | null;
	file_name: string | null;
	file_folder: string | null;
	file_deleted: boolean;
	/** The chosen display name, else the full name; null when the address has no account or the project was deleted. */
	assigned_name: string | null;
	/** The address, only for a mentor or a site admin (the Team view's rule). */
	assigned_by?: string | null;
	assigned_at: string;
}

export interface PartSubsystem {
	code: string;
	name: string;
	retired: boolean;
}

export interface ProjectPartNumbers {
	project: {
		id: string;
		name: string;
		season: number | null;
		season_yy: number;
		prefix: string;
		archived: boolean;
		role: string | null;
	};
	can_take: boolean;
	can_set_prefix: boolean;
	can_curate: boolean;
	subsystems: PartSubsystem[];
	numbers: PartNumberRow[];
}

export interface CotsPart {
	id: string;
	vendor: string;
	vendor_part: string;
	cots_number: string;
	description: string;
	link: string | null;
	retired: boolean;
	file: { id: string; name: string; project_id: string } | null;
	added_at: string;
	corrected_at: string | null;
}

export interface CotsLibrary {
	can_curate: boolean;
	parts: CotsPart[];
}

/** What the website's transports answer. */
export type TakeAnswer = { ok: true; row: PartNumberRow } | { ok: false; message: string };
export type PrefixAnswer = { ok: true } | { ok: false; message: string };
export type CotsAnswer = { ok: true } | { ok: false; message: string };

/* ---- Grouping for the Parts view --------------------------------------- */

export interface AssemblyGroup {
	assembly: number;
	/** The assembly's own row (part 00), or null when only its parts are on this project. */
	head: PartNumberRow | null;
	parts: PartNumberRow[];
}

export interface SubsystemGroup {
	code: string;
	name: string;
	retired: boolean;
	assemblies: AssemblyGroup[];
	count: number;
}

/**
 * Numbers by subsystem (in the list's own order), then by assembly, parts in
 * order. A subsystem with no numbers is left out; a number whose code is not
 * in the list (cannot happen through 0274, which keys on it) still shows,
 * under its bare code, rather than vanishing.
 */
export function groupPartNumbers(numbers: readonly PartNumberRow[], subsystems: readonly PartSubsystem[]): SubsystemGroup[] {
	const order = new Map(subsystems.map((s, i) => [s.code, i]));
	const bySub = new Map<string, PartNumberRow[]>();
	for (const n of numbers) {
		const list = bySub.get(n.subsystem) ?? [];
		list.push(n);
		bySub.set(n.subsystem, list);
	}
	const codes = [...bySub.keys()].sort((a, b) => (order.get(a) ?? 1e6) - (order.get(b) ?? 1e6) || a.localeCompare(b));
	return codes.map((code) => {
		const meta = subsystems.find((s) => s.code === code);
		const rows = [...(bySub.get(code) ?? [])].sort((a, b) => a.assembly - b.assembly || a.part - b.part);
		const byAsm = new Map<number, AssemblyGroup>();
		for (const r of rows) {
			const g = byAsm.get(r.assembly) ?? { assembly: r.assembly, head: null, parts: [] };
			if (r.part === 0) g.head = r;
			else g.parts.push(r);
			byAsm.set(r.assembly, g);
		}
		return { code, name: meta?.name ?? code, retired: meta?.retired ?? false, assemblies: [...byAsm.values()], count: rows.length };
	});
}

/** Does a number row match a search? Number, description, file name or made-from, any case. */
export function partMatches(row: PartNumberRow, query: string): boolean {
	const q = query.trim().toLowerCase();
	if (q === '') return true;
	return [row.part_number, row.description, row.file_name ?? '', row.made_from ?? ''].some((s) => s.toLowerCase().includes(q));
}

/**
 * The COTS search: by vendor and by number, and by the words. Every token must
 * land somewhere, so "rev 1650" finds REV-21-1650 and "wcp bearing" finds the
 * WCP hex bearing. Dashes and spaces in the number are ignored, so "211650"
 * finds 21-1650.
 */
export function cotsMatches(part: CotsPart, query: string): boolean {
	const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return true;
	const loose = (s: string) => s.toLowerCase().replace(/[-\s]/g, '');
	const hay = [part.vendor, part.vendor_part, part.cots_number, part.description].map((s) => s.toLowerCase());
	const hayLoose = hay.map(loose);
	return tokens.every((t) => hay.some((h) => h.includes(t)) || hayLoose.some((h) => h.includes(loose(t))));
}

/** Vendors in the library, for the vendor filter, most parts first then by name. */
export function cotsVendors(parts: readonly CotsPart[]): Array<{ vendor: string; count: number }> {
	const m = new Map<string, number>();
	for (const p of parts) m.set(p.vendor, (m.get(p.vendor) ?? 0) + 1);
	return [...m.entries()].map(([vendor, count]) => ({ vendor, count })).sort((a, b) => b.count - a.count || a.vendor.localeCompare(b.vendor));
}

/**
 * A refusal from 0274 in words. Read from the SQLSTATE and the detail's
 * reason first (CLAUDE.md, "A REFUSAL IS READ FROM ITS SQLSTATE AND
 * DETAIL.reason, NEVER ITS HTTP STATUS"); every 0274 refusal already IS a
 * sentence, so the message is kept, except the two short ones.
 */
export function partsErrorWords(error: { code?: string | null; message?: string | null; details?: string | null } | null): string {
	if (!error) return 'Something went wrong. Try again.';
	if (error.code === 'PGRST202') return 'Part numbers are not switched on yet. Mr. Pina is still setting them up.';
	let reason: string | null = null;
	try {
		reason = error.details ? ((JSON.parse(error.details) as { reason?: string }).reason ?? null) : null;
	} catch {
		reason = null;
	}
	if (reason === 'not_member' || error.message === 'not a project member') return 'You are not on this project.';
	if (reason === 'not_curator') return 'Only a mentor or a site admin can change this.';
	if (error.code === '42501') return 'You do not have permission to do that.';
	return error.message || 'Something went wrong. Try again.';
}
