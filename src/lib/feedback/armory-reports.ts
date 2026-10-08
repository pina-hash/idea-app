/**
 * THE ARMORY APP'S TWO FEEDBACK STREAMS, AS ARITHMETIC (website requests v0.3,
 * items 4 and 4b; decisions D3-D6 of the 2026-10-07 round).
 *
 * The IDEA Armory Windows app sends two things the website's own queue cannot
 * hold: a person's NOTE (a bug, an idea, anything else, up to 8000 characters,
 * with the app version, the device and a context object) and an INCIDENT (a
 * report the app writes itself when something goes wrong, up to 1 MiB). Each
 * lands in its own table (`armory_app_feedback`, `armory_app_incidents`) and is
 * read on its own tab of the feedback page. Everything here is pure, so what a
 * filter admits and what an export says are assertable with no browser and no
 * database; the two consoles own only the controls.
 *
 * NOTHING HERE IS TRUSTED. Every row is text any signed-in Armory user wrote,
 * read into an admin's screen; the consoles interpolate it as plain text, and
 * the parse below drops a row whose shape it does not recognise rather than
 * guessing at one.
 */
import { buildZip, type ZipEntry } from '$lib/foundry/zip-write';
import { laCalendarDay, schoolDayOf, schoolDayPlus } from '$lib/classroom/school-calendar';
import { quoteMessage } from './console';
import type { FeedbackStatus } from './feedback';

// ---------------------------------------------------------------------------
// The three sources, one strip
// ---------------------------------------------------------------------------

export type FeedbackSourceId = 'site' | 'armory' | 'incidents';

/** Where feedback arrives from, in the order the strip lists them. */
export const FEEDBACK_SOURCES: { id: FeedbackSourceId; label: string; href: string }[] = [
	{ id: 'site', label: 'Site', href: '/admin/feedback' },
	{ id: 'armory', label: 'Armory app', href: '/admin/feedback/armory' },
	{ id: 'incidents', label: 'Armory incidents', href: '/admin/feedback/incidents' }
];

/** Which source a path is, so the strip lights exactly one key. */
export function feedbackSourceFor(pathname: string): FeedbackSourceId {
	const p = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
	if (p.endsWith('/admin/feedback/armory')) return 'armory';
	if (p.endsWith('/admin/feedback/incidents')) return 'incidents';
	return 'site';
}

/**
 * WHAT A PAGE SAYS WHEN THE DATABASE HAS NOT BEEN UPDATED YET: the tables and
 * functions arrive in one migration, applied separately from a deploy, so a
 * page between the two is a real state and says so in words.
 */
/**
 * HOW A NOTE AND AN INCIDENT ARE LINKED, said on both Armory tabs (Armory
 * 0.3.0): the app's "Send feedback" sends a note alone, and "Report a
 * problem" sends a note with an incident that points at it.
 */
export const ARMORY_REPORT_LINK_HELP =
	'Notes from the app\'s "Send feedback" arrive with no incident linked. A "Report a problem" arrives with one: a note here and its incident on the Armory incidents tab.';

/**
 * Why the incidents tab may fill up at once: a 0.2.1 computer kept its
 * reports on disk, and 0.3.0 uploads them about one a minute after it updates.
 */
export const ARMORY_INCIDENT_WAVE_NOTE =
	'Expect a first wave as computers update: reports saved on computers running Armory 0.2.1 upload once they update to 0.3.0, about one a minute per computer.';

export const ARMORY_REPORTS_NOT_READY =
	'Armory reports need a database update that has not been applied yet. This tab fills in once it is.';

/**
 * WHETHER A READ FAILED BECAUSE THE DATABASE IS NOT UPDATED YET, read off the
 * CODE alone: a missing function (PGRST202, 42883) or a missing relation
 * (42P01, PGRST205). Anything else is a real failure and is reported as one.
 */
export function armoryReportsNotReady(code: string | null | undefined): boolean {
	const c = (code ?? '').trim();
	return c === 'PGRST202' || c === '42883' || c === '42P01' || c === 'PGRST205';
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export interface ArmoryFeedbackRow {
	id: string;
	created_at: string;
	email: string;
	device_name: string | null;
	app_version: string;
	kind: string;
	body: string;
	context: Record<string, unknown> | null;
	status: FeedbackStatus;
	reviewed_at: string | null;
	reviewed_by: string | null;
	submitter_name: string | null;
	/** 0235: what the person tried, the app area the note is about, and the screenshot's key. Absent before 0235. */
	tried?: string | null;
	area?: string | null;
	screenshot_path?: string | null;
}

export interface ArmoryIncidentRow {
	id: string;
	created_at: string;
	email: string;
	device_name: string | null;
	app_version: string;
	kind: string;
	summary: string;
	project_id: string | null;
	project_name: string | null;
	feedback_id: string | null;
	feedback_body: string | null;
	/** How big the full report is; the report itself never rides on the list. */
	report_bytes: number | null;
	status: FeedbackStatus;
	reviewed_at: string | null;
	reviewed_by: string | null;
	submitter_name: string | null;
}

const STATUSES: readonly FeedbackStatus[] = ['new', 'seen', 'resolved', 'spam'];

function str(v: unknown): string | null {
	return typeof v === 'string' ? v : null;
}
function status(v: unknown): FeedbackStatus {
	return STATUSES.includes(v as FeedbackStatus) ? (v as FeedbackStatus) : 'new';
}
function asObject(v: unknown): Record<string, unknown> | null {
	return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * THE LIST FUNCTION'S ANSWER, READ DEFENSIVELY: a jsonb array of objects. A
 * row missing its id, its time or its words is dropped, never half-rendered.
 */
export function parseArmoryFeedbackRows(data: unknown): ArmoryFeedbackRow[] {
	if (!Array.isArray(data)) return [];
	const out: ArmoryFeedbackRow[] = [];
	for (const raw of data) {
		const r = asObject(raw);
		if (!r) continue;
		const id = str(r.id);
		const created = str(r.created_at);
		const body = str(r.body);
		if (!id || !created || body === null) continue;
		out.push({
			id,
			created_at: created,
			email: str(r.email) ?? '',
			device_name: str(r.device_name),
			app_version: str(r.app_version) ?? '',
			kind: str(r.kind) ?? 'other',
			body,
			context: asObject(r.context),
			status: status(r.status),
			reviewed_at: str(r.reviewed_at),
			reviewed_by: str(r.reviewed_by),
			submitter_name: str(r.submitter_name),
			tried: str(r.tried),
			area: str(r.area),
			screenshot_path: str(r.screenshot_path)
		});
	}
	return out;
}

export function parseArmoryIncidentRows(data: unknown): ArmoryIncidentRow[] {
	if (!Array.isArray(data)) return [];
	const out: ArmoryIncidentRow[] = [];
	for (const raw of data) {
		const r = asObject(raw);
		if (!r) continue;
		const id = str(r.id);
		const created = str(r.created_at);
		const summary = str(r.summary);
		if (!id || !created || summary === null) continue;
		const bytes = r.report_bytes;
		out.push({
			id,
			created_at: created,
			email: str(r.email) ?? '',
			device_name: str(r.device_name),
			app_version: str(r.app_version) ?? '',
			kind: str(r.kind) ?? '',
			summary,
			project_id: str(r.project_id),
			project_name: str(r.project_name),
			feedback_id: str(r.feedback_id),
			feedback_body: str(r.feedback_body),
			report_bytes: typeof bytes === 'number' && Number.isFinite(bytes) ? bytes : null,
			status: status(r.status),
			reviewed_at: str(r.reviewed_at),
			reviewed_by: str(r.reviewed_by),
			submitter_name: str(r.submitter_name)
		});
	}
	return out;
}

/** Who sent it: the name a person chose, else the address. Never blank. */
export function armoryWho(row: { submitter_name: string | null; email: string }): string {
	return (row.submitter_name ?? '').trim() || row.email || 'unknown';
}

// ---------------------------------------------------------------------------
// Kinds
// ---------------------------------------------------------------------------

/** The three kinds of note the app offers, with the words a console shows. */
export const ARMORY_FEEDBACK_KINDS: { id: string; label: string }[] = [
	{ id: 'bug', label: 'Bug' },
	{ id: 'idea', label: 'Idea' },
	{ id: 'praise', label: 'Praise' },
	{ id: 'other', label: 'Other' }
];

export function armoryFeedbackKindWord(kind: string): string {
	return ARMORY_FEEDBACK_KINDS.find((k) => k.id === kind)?.label ?? kind;
}

/**
 * THE SEVEN INCIDENT KINDS THE APP NAMES TODAY, with readable words. The
 * database checks a kind's SHAPE and not its value (decision D6), because a
 * closed list there would refuse, and lose, an incident from the first app
 * version that adds a kind -- so a kind not listed here is shown exactly as
 * sent, never hidden and never renamed.
 */
export const ARMORY_INCIDENT_KIND_WORDS: Record<string, string> = {
	crash: 'Crash',
	slowAction: 'Slow action',
	slowPass: 'Slow sync pass',
	repeatedFailure: 'Repeated failure',
	repairedCheckout: 'Repaired checkout',
	readOnlyBroken: 'Read-only file broken',
	userReport: 'Reported by the user'
};

export function incidentKindWord(kind: string): string {
	return Object.hasOwn(ARMORY_INCIDENT_KIND_WORDS, kind) ? ARMORY_INCIDENT_KIND_WORDS[kind] : kind;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/** Every distinct non-empty value a reader finds, sorted, for a picker. */
export function distinctValues<T>(rows: T[], read: (row: T) => string | null): string[] {
	const seen = new Set<string>();
	for (const row of rows) {
		const v = read(row);
		if (v) seen.add(v);
	}
	return [...seen].sort((a, b) => a.localeCompare(b));
}

export interface ArmoryFeedbackFilter {
	status: 'all' | FeedbackStatus;
	kind: string;
	version: string;
	/** The submitter's address, exactly, or '' for anyone. */
	person: string;
}

export const EMPTY_ARMORY_FEEDBACK_FILTER: ArmoryFeedbackFilter = {
	status: 'all',
	kind: '',
	version: '',
	person: ''
};

export function filterArmoryFeedback(
	rows: ArmoryFeedbackRow[],
	filter: ArmoryFeedbackFilter,
	statusOf: (row: ArmoryFeedbackRow) => FeedbackStatus = (r) => r.status
): ArmoryFeedbackRow[] {
	return rows.filter((row) => {
		if (filter.status !== 'all' && statusOf(row) !== filter.status) return false;
		if (filter.kind && row.kind !== filter.kind) return false;
		if (filter.version && row.app_version !== filter.version) return false;
		if (filter.person && row.email !== filter.person) return false;
		return true;
	});
}

/** The project facet's value for "no project", which no uuid can collide with. */
export const ARMORY_NO_PROJECT = 'none';

export interface ArmoryIncidentFilter {
	status: 'all' | FeedbackStatus;
	kind: string;
	version: string;
	person: string;
	/** A project id, `ARMORY_NO_PROJECT`, or '' for any. */
	project: string;
}

export const EMPTY_ARMORY_INCIDENT_FILTER: ArmoryIncidentFilter = {
	status: 'all',
	kind: '',
	version: '',
	person: '',
	project: ''
};

export function filterArmoryIncidents(
	rows: ArmoryIncidentRow[],
	filter: ArmoryIncidentFilter,
	statusOf: (row: ArmoryIncidentRow) => FeedbackStatus = (r) => r.status
): ArmoryIncidentRow[] {
	return rows.filter((row) => {
		if (filter.status !== 'all' && statusOf(row) !== filter.status) return false;
		if (filter.kind && row.kind !== filter.kind) return false;
		if (filter.version && row.app_version !== filter.version) return false;
		if (filter.person && row.email !== filter.person) return false;
		if (filter.project === ARMORY_NO_PROJECT) {
			if (row.project_id) return false;
		} else if (filter.project && row.project_id !== filter.project) return false;
		return true;
	});
}

// ---------------------------------------------------------------------------
// Incident groups and the per-day counts
// ---------------------------------------------------------------------------

export interface IncidentGroup {
	key: string;
	kind: string;
	version: string;
	/** Newest first. */
	rows: ArmoryIncidentRow[];
}

const newestFirst = (a: { created_at: string }, b: { created_at: string }) =>
	a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;

/**
 * ONE GROUP PER KIND AND APP VERSION, ordered by each group's newest incident,
 * newest first inside. "Which build is crashing, and how" is the question an
 * incident list exists to answer; a flat list of forty repeats buries it.
 */
export function groupIncidents(rows: ArmoryIncidentRow[]): IncidentGroup[] {
	const groups = new Map<string, IncidentGroup>();
	for (const row of rows) {
		const key = `${row.kind}\u0000${row.app_version}`;
		let g = groups.get(key);
		if (!g) {
			g = { key, kind: row.kind, version: row.app_version, rows: [] };
			groups.set(key, g);
		}
		g.rows.push(row);
	}
	const list = [...groups.values()];
	for (const g of list) g.rows.sort(newestFirst);
	return list.sort(
		(a, b) => newestFirst(a.rows[0], b.rows[0]) || a.kind.localeCompare(b.kind) || a.version.localeCompare(b.version)
	);
}

/** How many school days the per-day table covers. */
export const INCIDENT_DAY_WINDOW = 14;

/**
 * THE LAST `days` SCHOOL DAYS, newest first, each with how many of these
 * incidents fell on it -- the Los Angeles calendar day, never the browser's,
 * because a 9pm crash belongs to the day the class had. Days with none are
 * listed as zero, so a quiet day reads as quiet rather than missing.
 */
export function incidentCountsByDay(
	rows: { created_at: string }[],
	today: string,
	days = INCIDENT_DAY_WINDOW
): { day: string; count: number }[] {
	const counts = new Map<string, number>();
	for (const row of rows) {
		const day = schoolDayOf(row.created_at);
		if (day) counts.set(day, (counts.get(day) ?? 0) + 1);
	}
	const out: { day: string; count: number }[] = [];
	for (let i = 0; i < days; i += 1) {
		const day = schoolDayPlus(today, -i);
		if (!day) break;
		out.push({ day, count: counts.get(day) ?? 0 });
	}
	return out;
}

/** Today in the school's calendar, from an injected clock. */
export function armoryExportDay(nowMs: number): string {
	return laCalendarDay(new Date(nowMs));
}

// ---------------------------------------------------------------------------
// The notes, as one Markdown file
// ---------------------------------------------------------------------------

/**
 * A FENCE LONGER THAN ANY RUN OF BACKTICKS INSIDE THE TEXT, at least three. A
 * context object is whatever the app put in it, and a value holding three
 * backticks would otherwise close the block early and turn the rest of the
 * file into somebody's JSON.
 */
export function fenceFor(text: string): string {
	let longest = 0;
	for (const run of text.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
	return '`'.repeat(Math.max(3, longest + 1));
}

export function armoryFeedbackExportName(day: string): string {
	return `armory-feedback-${day}.md`;
}

export interface ArmoryFeedbackExportOptions {
	generatedAt?: string;
	/** Whether names and addresses travel with the file. Included by default. */
	includeSubmitter?: boolean;
}

/**
 * THE SELECTED NOTES AS ONE MARKDOWN FILE (v0.3 item 4): for each, the date,
 * who, the version, the kind, the body, and the context in a fenced block. The
 * body goes through the site queue's own `quoteMessage`, so a note opening with
 * `###` stays inside its own entry. Withholding names is stated in the header,
 * so a file with none cannot be read as a file from nobody.
 */
export function armoryFeedbackMarkdown(
	rows: ArmoryFeedbackRow[],
	options: ArmoryFeedbackExportOptions = {}
): string {
	const includeSubmitter = options.includeSubmitter !== false;
	const lines: string[] = ['# IDEA Armory app feedback', ''];
	if (options.generatedAt) lines.push(`Exported: ${options.generatedAt}`);
	lines.push(`Notes: ${rows.length}`);
	lines.push(
		includeSubmitter
			? 'Submitter identity: included.'
			: 'Submitter identity: withheld at export. No name or address appears below.'
	);
	lines.push('');
	rows.forEach((row, i) => {
		lines.push(`## ${i + 1}. ${armoryFeedbackKindWord(row.kind)}, version ${row.app_version || 'unknown'}`);
		lines.push('');
		const facts = [`date: ${row.created_at}`];
		if (includeSubmitter) {
			const name = (row.submitter_name ?? '').trim();
			facts.push(`who: ${name && name !== row.email ? `${name} (${row.email})` : row.email || 'unknown'}`);
		}
		facts.push(`version: ${row.app_version || 'unknown'}`);
		facts.push(`kind: ${row.kind}`);
		if (row.device_name) facts.push(`device: ${row.device_name.replace(/\s+/g, ' ').trim()}`);
		if (row.area) facts.push(`area: ${row.area.replace(/\s+/g, ' ').trim()}`);
		if (row.screenshot_path) facts.push('screenshot: attached (read it on the console)');
		facts.push(`status: ${row.status}`);
		lines.push(facts.map((f) => `- ${f}`).join('\n'));
		lines.push('');
		lines.push(quoteMessage(row.body) || '>');
		lines.push('');
		if (row.tried) {
			lines.push('What they tried:');
			lines.push('');
			lines.push(quoteMessage(row.tried));
			lines.push('');
		}
		const context = JSON.stringify(row.context ?? {}, null, 2);
		const fence = fenceFor(context);
		lines.push('Context:');
		lines.push('');
		lines.push(`${fence}json`);
		lines.push(context);
		lines.push(fence);
		lines.push('');
	});
	return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

// ---------------------------------------------------------------------------
// Incidents, as one JSON file each and as one zip
// ---------------------------------------------------------------------------

/** The file format's own name, so `tools/read-incident` knows what it holds. */
export const ARMORY_INCIDENT_FORMAT = 'idea-armory-incident/1';

/**
 * HOW MANY BYTES OF INCIDENT FILES ONE ZIP CARRIES. The zip is built in the
 * browser tab and `buildZip` buffers, so an unbounded selection of 1 MiB
 * reports is hundreds of megabytes of input and output in memory; past this the
 * zip stops and the console says how many were left out.
 */
export const ARMORY_INCIDENT_ZIP_BUDGET = 64 * 1024 * 1024;

export interface IncidentExportOptions {
	/** Whether the address and the name travel with the file. Included by default. */
	includeSubmitter?: boolean;
}

/**
 * ONE INCIDENT AS A FILE: the row's fields, and the report VERBATIM under
 * `report`, in exactly the key set docs/ARMORY.md documents for
 * `tools/read-incident` (the v0.3 server contract). Withholding the submitter
 * leaves the address and the name OUT, as that paragraph says; nothing else
 * changes, so a reader never meets a key the contract does not name.
 */
export function incidentFileObject(
	row: ArmoryIncidentRow,
	report: unknown,
	options: IncidentExportOptions = {}
): Record<string, unknown> {
	const includeSubmitter = options.includeSubmitter !== false;
	const out: Record<string, unknown> = {
		format: ARMORY_INCIDENT_FORMAT,
		id: row.id,
		created_at: row.created_at,
		kind: row.kind,
		summary: row.summary,
		app_version: row.app_version,
		device_name: row.device_name
	};
	if (includeSubmitter) {
		out.email = row.email;
		out.submitter_name = row.submitter_name;
	}
	out.project_id = row.project_id;
	out.project_name = row.project_name;
	out.feedback_id = row.feedback_id;
	out.feedback_body = row.feedback_body;
	out.status = row.status;
	out.report = report;
	return out;
}

export function incidentFileJson(
	row: ArmoryIncidentRow,
	report: unknown,
	options: IncidentExportOptions = {}
): string {
	return JSON.stringify(incidentFileObject(row, report, options), null, 2) + '\n';
}

/** `armory-incident-<school day>-<kind>-<id first 8>.json`, safe on every disk. */
export function incidentFileName(row: ArmoryIncidentRow): string {
	const day = schoolDayOf(row.created_at) ?? 'undated';
	const kind = row.kind.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 40) || 'incident';
	const id = row.id.replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || 'unknown';
	return `armory-incident-${day}-${kind}-${id}.json`;
}

export function incidentZipName(day: string): string {
	return `armory-incidents-${day}.zip`;
}

export interface IncidentZip {
	name: string;
	bytes: Uint8Array;
	/** The archive-relative path of every file, in order. */
	paths: string[];
	included: number;
	/** What was left out, and why. NEVER SILENT: the console says each count. */
	notRead: string[];
	overBudget: string[];
}

/**
 * THE SELECTED INCIDENTS AS ONE ZIP, one JSON file each, under one folder named
 * for the day. A report that could not be read is left out rather than written
 * with a null in its place, and so is everything past the budget; both lists
 * come back so the console can say what the zip does not hold.
 */
export async function buildIncidentZip(
	rows: ArmoryIncidentRow[],
	reports: ReadonlyMap<string, unknown>,
	options: IncidentExportOptions & { day: string; budget?: number }
): Promise<IncidentZip> {
	const budget = options.budget ?? ARMORY_INCIDENT_ZIP_BUDGET;
	const root = `armory-incidents-${options.day}`;
	const encoder = new TextEncoder();
	const entries: ZipEntry[] = [];
	const paths: string[] = [];
	const used = new Set<string>();
	const notRead: string[] = [];
	const overBudget: string[] = [];
	let total = 0;
	for (const row of rows) {
		if (!reports.has(row.id)) {
			notRead.push(row.id);
			continue;
		}
		const bytes = encoder.encode(incidentFileJson(row, reports.get(row.id), options));
		if (total + bytes.byteLength > budget && entries.length > 0) {
			overBudget.push(row.id);
			continue;
		}
		let name = incidentFileName(row);
		for (let n = 2; used.has(name); n += 1) name = incidentFileName(row).replace(/\.json$/, `-${n}.json`);
		used.add(name);
		const path = `${root}/${name}`;
		entries.push({ path, bytes });
		paths.push(path);
		total += bytes.byteLength;
	}
	return {
		name: incidentZipName(options.day),
		bytes: await buildZip(entries),
		paths,
		included: entries.length,
		notRead,
		overBudget
	};
}

/** A byte count in the words a console prints: bytes, KB or MB. */
export function byteWords(n: number | null): string {
	if (n === null) return 'size unknown';
	if (n < 1024) return `${n} bytes`;
	if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
	return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Status moves
// ---------------------------------------------------------------------------

/**
 * WHAT A STATUS MOVE SAYS AFTERWARDS, over N independent writes: how many
 * moved, and how many did not with the first reason the database gave. The
 * site queue names its reports; a note or an incident has no title to name,
 * so the Armory consoles count, and leave the refused ones selected for the
 * retry.
 */
export function armoryMoveSummary(
	noun: { one: string; many: string },
	status: FeedbackStatus,
	moved: number,
	failed: number,
	firstFailure: string | null
): string {
	const parts: string[] = [];
	parts.push(
		moved > 0
			? `Moved ${moved} ${moved === 1 ? noun.one : noun.many} to ${status}.`
			: `Nothing moved to ${status}.`
	);
	if (failed > 0) {
		parts.push(
			`${failed} did not move${firstFailure ? ` (${firstFailure})` : ''} and ${failed === 1 ? 'is' : 'are'} still selected.`
		);
	}
	return parts.join(' ');
}

/** A timestamp in the reader's words, or '' when it does not parse. */
export function armoryWhen(iso: string | null): string {
	if (!iso) return '';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	return d.toLocaleString(undefined, {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});
}
