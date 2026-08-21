/**
 * THE TRIAGE QUEUE'S ARITHMETIC: which rows a filter admits, and what leaves
 * when someone exports them.
 *
 * Pure, so the console can be asserted without a browser and without a
 * database. The console component owns only the controls and the layout.
 *
 * FILTERING HAPPENS BEFORE EXPORT, and the ordering is the feature. An export
 * of "everything" is a semester of notes nobody reads; an export of the ten
 * rows already narrowed to one route on one afternoon is a thing that can be
 * pasted into a conversation and acted on.
 */
import type { FeedbackRow, FeedbackStatus } from './feedback';

/** Read a string off the free-form meta blob without trusting its shape. */
function metaString(row: FeedbackRow, key: string): string | null {
	const raw = (row.meta ?? {})[key];
	if (typeof raw !== 'string') return null;
	const trimmed = raw.trim();
	return trimmed ? trimmed : null;
}

/**
 * The route a row came from. `meta.route` is what the shell captures; `context`
 * is the same value on the column, and is all an older row has. Falling back
 * rather than showing nothing keeps rows filed before the shell mount readable
 * in the same queue.
 */
export function rowRoute(row: FeedbackRow): string {
	return metaString(row, 'route') ?? row.context ?? row.app;
}

export function rowPath(row: FeedbackRow): string | null {
	return metaString(row, 'path');
}

export function rowRole(row: FeedbackRow): string | null {
	return metaString(row, 'role');
}

export function rowSection(row: FeedbackRow): string | null {
	return metaString(row, 'section');
}

export function rowViewport(row: FeedbackRow): string | null {
	return metaString(row, 'viewport');
}

/** The build value AND what it means, never the value on its own. */
export function rowBuild(row: FeedbackRow): { value: string; means: string } | null {
	const raw = (row.meta ?? {}).build;
	if (!raw || typeof raw !== 'object') return null;
	const build = raw as Record<string, unknown>;
	const value = typeof build.value === 'string' ? build.value.trim() : '';
	const means = typeof build.means === 'string' ? build.means.trim() : '';
	if (!value) return null;
	return { value, means };
}

export function rowStatusCode(row: FeedbackRow): number | null {
	const raw = (row.meta ?? {}).status;
	return typeof raw === 'number' ? raw : null;
}

export function rowErrorId(row: FeedbackRow): string | null {
	return metaString(row, 'errorId');
}

/** The YYYY-MM-DD the row was filed, in the reader's own zone. */
export function rowDay(row: FeedbackRow): string {
	const d = new Date(row.created_at);
	if (Number.isNaN(d.getTime())) return '';
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface FeedbackFilter {
	status: 'all' | FeedbackStatus;
	/** Substring, case-insensitive, against the route (and the path). */
	route: string;
	/** Exact role, or '' for any. */
	role: string;
	/** Exact section id, or '' for any. */
	section: string;
	/** Inclusive YYYY-MM-DD bounds, or '' for open. */
	from: string;
	to: string;
}

export const EMPTY_FEEDBACK_FILTER: FeedbackFilter = {
	status: 'all',
	route: '',
	role: '',
	section: '',
	from: '',
	to: ''
};

/**
 * Apply every facet. `statusOf` is handed in rather than read off the row so
 * the console's OPTIMISTIC status (a click that has landed but whose reload has
 * not) filters the same way the row's stored status does; without it a note
 * moved to Seen stays in the New list until the page reloads.
 */
export function filterFeedback(
	rows: FeedbackRow[],
	filter: FeedbackFilter,
	statusOf: (row: FeedbackRow) => FeedbackStatus = (row) => row.status
): FeedbackRow[] {
	const route = filter.route.trim().toLowerCase();
	const role = filter.role.trim();
	const section = filter.section.trim();
	return rows.filter((row) => {
		if (filter.status !== 'all' && statusOf(row) !== filter.status) return false;
		if (route) {
			const haystack = `${rowRoute(row)} ${rowPath(row) ?? ''}`.toLowerCase();
			if (!haystack.includes(route)) return false;
		}
		if (role && (rowRole(row) ?? '') !== role) return false;
		if (section && (rowSection(row) ?? '') !== section) return false;
		const day = rowDay(row);
		if (filter.from && (!day || day < filter.from)) return false;
		if (filter.to && (!day || day > filter.to)) return false;
		return true;
	});
}

/** Every distinct value of a facet in the loaded set, sorted, for its picker. */
export function facetValues(
	rows: FeedbackRow[],
	read: (row: FeedbackRow) => string | null
): string[] {
	const seen = new Set<string>();
	for (const row of rows) {
		const value = read(row);
		if (value) seen.add(value);
	}
	return [...seen].sort((a, b) => a.localeCompare(b));
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * A markdown bundle is meant to be PASTED, so it has a budget. 60k characters
 * is roughly what a chat window takes without complaint and is far more than a
 * useful narrowing produces; it exists so that "export" on an unfiltered
 * semester truncates honestly instead of producing something unusable.
 */
export const FEEDBACK_MARKDOWN_BUDGET = 60_000;

export interface FeedbackExport {
	text: string;
	/** How many rows made it into `text`. */
	included: number;
	/** How many the budget cut. NEVER SILENT: named in the text as well. */
	dropped: number;
}

function oneRow(row: FeedbackRow, index: number): string {
	const lines: string[] = [];
	lines.push(`### ${index}. ${row.kind} at ${rowRoute(row)}`);
	const facts: string[] = [`status: ${row.status}`, `filed: ${row.created_at}`];
	const role = rowRole(row);
	if (role) facts.push(`role: ${role}`);
	const section = rowSection(row);
	if (section) facts.push(`section: ${section}`);
	const viewport = rowViewport(row);
	if (viewport) facts.push(`viewport: ${viewport}`);
	const httpStatus = rowStatusCode(row);
	if (httpStatus !== null) facts.push(`http status: ${httpStatus}`);
	const errorId = rowErrorId(row);
	if (errorId) facts.push(`error id: ${errorId}`);
	const who = row.submitter_name || row.submitter_email;
	if (who) facts.push(`from: ${who}`);
	lines.push(facts.map((f) => `- ${f}`).join('\n'));
	const build = rowBuild(row);
	if (build) lines.push(`- build: ${build.value} (${build.means})`);
	lines.push('');
	lines.push(row.message.trim());
	lines.push('');
	return lines.join('\n');
}

/**
 * The filtered set as markdown. `filter` is described in the header so a pasted
 * bundle says what it is a bundle OF, which is the difference between ten
 * reports and ten reports about one page on one day.
 */
export function feedbackMarkdown(
	rows: FeedbackRow[],
	options: { filter?: FeedbackFilter; generatedAt?: string; budget?: number } = {}
): FeedbackExport {
	const budget = options.budget ?? FEEDBACK_MARKDOWN_BUDGET;
	const filter = options.filter ?? EMPTY_FEEDBACK_FILTER;
	const facets: string[] = [`status: ${filter.status}`];
	if (filter.route) facets.push(`route contains "${filter.route}"`);
	if (filter.role) facets.push(`role: ${filter.role}`);
	if (filter.section) facets.push(`section: ${filter.section}`);
	if (filter.from) facets.push(`from ${filter.from}`);
	if (filter.to) facets.push(`to ${filter.to}`);

	const head = [
		'# IDEA feedback',
		'',
		`Filter: ${facets.join(', ')}`,
		options.generatedAt ? `Exported: ${options.generatedAt}` : '',
		`Reports: ${rows.length}`,
		''
	]
		.filter((l) => l !== '')
		.join('\n');

	const body: string[] = [];
	let used = head.length;
	let included = 0;
	for (const row of rows) {
		const block = oneRow(row, included + 1);
		// Leave room for the truncation notice itself, so the thing that says
		// what was dropped can never be the thing that gets dropped.
		if (used + block.length > budget - 200 && included > 0) break;
		body.push(block);
		used += block.length;
		included += 1;
	}
	const dropped = rows.length - included;
	const parts = [head, '', ...body];
	if (dropped > 0) {
		parts.push(
			`_${dropped} more report${dropped === 1 ? '' : 's'} matched this filter and were left out of this bundle to keep it pasteable. Narrow the filter to see them._`
		);
	}
	return { text: parts.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n', included, dropped };
}

/** The filtered set as JSON. Verbatim rows: nothing is summarised away. */
export function feedbackJson(
	rows: FeedbackRow[],
	options: { filter?: FeedbackFilter; generatedAt?: string } = {}
): string {
	return JSON.stringify(
		{
			generatedAt: options.generatedAt ?? null,
			filter: options.filter ?? EMPTY_FEEDBACK_FILTER,
			count: rows.length,
			reports: rows
		},
		null,
		2
	);
}

/** A stable, sortable filename for a download. */
export function feedbackExportName(kind: 'md' | 'json', stamp: string): string {
	const safe = stamp.replace(/[^0-9A-Za-z-]/g, '-').replace(/-+/g, '-');
	return `idea-feedback-${safe}.${kind}`;
}
