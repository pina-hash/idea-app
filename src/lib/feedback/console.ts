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
import { sectionById } from '$lib/curriculum';
import { summarizeUserAgent } from './context';
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

/**
 * The path ONLY WHEN IT SAYS SOMETHING THE ROUTE ID DID NOT.
 *
 * On a route with no parameters the two are the same string, and showing both
 * trains the reader to skip the line on exactly the routes where they differ
 * (which student, which item, which section) -- so the field earns its place by
 * being absent most of the time.
 *
 * ONE IMPLEMENTATION, read by the export AND by the queue's own row list. Two
 * copies of this comparison is two answers to one question, and the day they
 * stop agreeing is the day nobody notices.
 */
export function rowDistinctPath(row: FeedbackRow): string | null {
	const path = rowPath(row);
	return path && path !== rowRoute(row) ? path : null;
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

/** The user agent VERBATIM, as it was captured. */
export function rowUserAgent(row: FeedbackRow): string | null {
	return metaString(row, 'userAgent');
}

/**
 * The same string reduced to browser and platform, through the ONE summariser
 * in context.ts. A row filed before the capture existed has no string and gets
 * null, which every surface renders as nothing rather than as "unknown".
 */
export function rowUserAgentSummary(row: FeedbackRow): string | null {
	return summarizeUserAgent(rowUserAgent(row));
}


/** The build value AND what it means, never the value on its own. */
export function rowBuild(
	row: FeedbackRow
): { value: string; source: string; means: string } | null {
	const raw = (row.meta ?? {}).build;
	if (!raw || typeof raw !== 'object') return null;
	const build = raw as Record<string, unknown>;
	const value = typeof build.value === 'string' ? build.value.trim() : '';
	const means = typeof build.means === 'string' ? build.means.trim() : '';
	const source = typeof build.source === 'string' ? build.source.trim() : '';
	if (!value) return null;
	return { value, source: source || 'unlabelled', means };
}

// ---------------------------------------------------------------------------
// A report with nobody behind it
// ---------------------------------------------------------------------------

/**
 * WHETHER THIS REPORT WAS SIGNED BY AN ACCOUNT.
 *
 * READ FROM THE PAYLOAD WHERE THE PAYLOAD SAYS SO. 0127 states it, because
 * "nobody signed this" and "we cannot find who signed this" are different
 * sentences to put in front of an admin, and a reader inferring one from two
 * empty fields cannot tell them apart.
 *
 * THE FALLBACK IS FOR A DEPLOYMENT SITTING BETWEEN TWO MIGRATIONS, which is a
 * real state here: 0085's version of the list returns neither `anonymous` nor
 * `contact`, and an authorless row comes back from it with an empty name and a
 * null address. Reading that as anonymous is right far more often than it is
 * wrong, and the alternative -- rendering an authorless row as a signed one
 * with a blank name -- is the failure this exists to prevent.
 */
export function rowIsAnonymous(row: FeedbackRow): boolean {
	if (typeof row.anonymous === 'boolean') return row.anonymous;
	return !(row.submitter_name ?? '').trim() && !(row.submitter_email ?? '').trim();
}

/**
 * The way to be reached an anonymous reporter chose to leave, or null.
 *
 * NOT AN IDENTITY, AND NOTHING HERE PRETENDS IT IS. Nobody signed in to type
 * it and nothing verified it, so every surface that shows it says as much, and
 * the export's identity toggle withholds it exactly the way it withholds a
 * name: it is the only thing in an anonymous row that can name a person.
 */
export function rowContact(row: FeedbackRow): string | null {
	// COLLAPSED TO ONE LINE, because that is what it is: a single-line field,
	// rendered on one line in the console and printed as ONE BULLET in the
	// markdown export. A newline inside it would end that bullet and let the
	// rest of the string become a document-level block -- the same defect
	// `quoteMessage` exists to stop in the message, arriving through a field
	// nothing quotes. The stored value is untouched; the JSON export carries the
	// row verbatim and is where the exact bytes live.
	const raw = (row.contact ?? '').replace(/\s+/g, ' ').trim();
	return raw ? raw : null;
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
// Resolving a section id
// ---------------------------------------------------------------------------

/**
 * What a section id MEANS, rather than what it is stored as.
 *
 * A report carries `profiles.section_id` because that is the value the page had
 * to hand; `eng1h-junior` is not what anybody reading a triage queue thinks in.
 * RESOLVED AT EXPORT TIME, NOT AT CAPTURE TIME, on purpose: the registry is the
 * live answer, so a course renamed after a report was filed exports under the
 * name it has today, and no stored copy can go stale.
 *
 * `period` is the scheduling slot. `curriculum.ts` spells that field `term`
 * (T1 / T2 / T3 / S1 / Summer); this is the same value under the word the
 * export uses, not a second source for it.
 */
export interface ResolvedSection {
	/** The id exactly as it was filed. */
	id: string;
	resolved: boolean;
	course: string | null;
	period: string | null;
	/** The one string an export prints. */
	label: string;
}

/**
 * AN ID THAT DOES NOT RESOLVE SAYS SO. Falling back to the raw id silently
 * would render a stored slug in the position a course name occupies, and the
 * next reader takes it for a course nobody has heard of rather than for a
 * section that has been retired, mistyped, or never added to the registry.
 */
export function resolveSectionId(id: string | null | undefined): ResolvedSection | null {
	const raw = (id ?? '').trim();
	if (!raw) return null;
	const section = sectionById(raw);
	if (!section) {
		return {
			id: raw,
			resolved: false,
			course: null,
			period: null,
			label: `${raw} (unresolved: not a known section id, shown as filed)`
		};
	}
	return {
		id: raw,
		resolved: true,
		course: section.course,
		period: section.term,
		label: `${section.course}, period ${section.term} (${raw})`
	};
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

/**
 * ABOVE THIS MANY REPORTS THE BUNDLE GROUPS BY ROUTE; at or below it, the list
 * is flat.
 *
 * A flat list of four reports is read straight through, and grouping it only
 * puts headings between single entries. Past that the useful question stops
 * being "what did each person say" and becomes "which page is generating
 * these", which a count per route answers and a flat list buries.
 */
export const FEEDBACK_GROUPING_THRESHOLD = 5;

export interface FeedbackExport {
	text: string;
	/** How many rows made it into `text`. */
	included: number;
	/** How many the budget cut. NEVER SILENT: named in the text as well. */
	dropped: number;
	/** Whether the bundle came out grouped by route id. */
	grouped: boolean;
}

export interface FeedbackExportOptions {
	filter?: FeedbackFilter;
	generatedAt?: string;
	budget?: number;
	/**
	 * Whether the submitter's name and address travel with the bundle.
	 *
	 * DEFAULTS TO INCLUDED, because knowing who to go and ask is most of what
	 * makes a report actionable. It is a CHOICE MADE AT EXPORT because a bundle
	 * pasted into a chat window does not always need student names attached, and
	 * that is a decision worth taking before the paste rather than noticing
	 * afterwards. Withholding is stated in the bundle's own header, so a reader
	 * cannot mistake a bundle with no names for a bundle from nobody.
	 */
	includeSubmitter?: boolean;
}

/**
 * The route buckets, count descending then route ascending.
 *
 * The tiebreak is not decoration: without it two exports of the same set can
 * order two equal groups differently, and a bundle stops being diffable against
 * the one taken an hour earlier.
 */
export function groupFeedbackByRoute(
	rows: FeedbackRow[]
): { route: string; rows: FeedbackRow[] }[] {
	const byRoute = new Map<string, FeedbackRow[]>();
	for (const row of rows) {
		const route = rowRoute(row);
		const bucket = byRoute.get(route);
		if (bucket) bucket.push(row);
		else byRoute.set(route, [row]);
	}
	return [...byRoute.entries()]
		.map(([route, group]) => ({ route, rows: group }))
		.sort((a, b) => b.rows.length - a.rows.length || a.route.localeCompare(b.route));
}

/**
 * A MESSAGE IS PROSE SOMEBODY TYPED, and prose contains whatever they typed. A
 * report that opens a line with `###`, or pastes a trace containing a rule of
 * dashes, would otherwise close the entry it sits inside and reparent
 * everything after it: the next report's fields would read as part of that
 * message, which is a bundle that lies rather than one that looks untidy.
 *
 * Every line goes inside ONE blockquote, so no line of it can be a
 * document-level block. A blank line becomes a bare `>`, which keeps the quote
 * contiguous instead of ending it and starting a second one.
 *
 * TWO KINDS OF LINE ARE ESCAPED ON TOP OF THAT, because a blockquote contains a
 * block but does not stop it being one:
 *
 * - a leading `#` or `>`, which would be a heading or a nested quote;
 * - a line that is NOTHING BUT a run of `-`, `=`, `_` or `*`, which is a
 *   thematic break, and after a line of prose is a SETEXT HEADING -- so a
 *   report that pastes a rule of dashes silently promotes the sentence above it
 *   to a heading. That is the whole reason this case is picked out: it changes
 *   what the person wrote while looking like ordinary formatting.
 *
 * A leading `-` or `*` on a line with words after it is left alone: that is a
 * bullet the person typed, and it renders as one.
 */
const MARKDOWN_RULE = /^[-=_*]+$/;

export function quoteMessage(message: string): string {
	return message
		.trim()
		.split(/\r?\n/)
		.map((line) => {
			const bare = line.trim();
			const isRule = bare.length > 1 && MARKDOWN_RULE.test(bare.replace(/ /g, ''));
			const text =
				isRule || /^\s*[#>]/.test(line) ? line.replace(/^(\s*)(.)/, '$1\\$2') : line;
			return text.trim() ? `> ${text}` : '>';
		})
		.join('\n');
}

function oneRow(row: FeedbackRow, index: number, includeSubmitter: boolean): string {
	const route = rowRoute(row);
	const lines: string[] = [`### ${index}. ${row.kind} at ${route}`];

	// THE CORRELATION ID GETS ITS OWN LINE, AT THE TOP. It is the only field
	// here that leads anywhere else: it is what joins this report to the server
	// log line handleError wrote. Set among a dozen bullets it reads as one more
	// attribute of the page, and the join never gets made.
	const errorId = rowErrorId(row);
	if (errorId) {
		lines.push('');
		lines.push(`**Error id \`${errorId}\`** -- joins this report to the server log line.`);
	}
	lines.push('');

	const facts: string[] = [`app: ${row.app}`, `status: ${row.status}`, `filed: ${row.created_at}`];
	const path = rowDistinctPath(row);
	if (path) facts.push(`path: ${path}`);
	const role = rowRole(row);
	if (role) facts.push(`role: ${role}`);
	const section = resolveSectionId(rowSection(row));
	if (section) facts.push(`section: ${section.label}`);
	const viewport = rowViewport(row);
	if (viewport) facts.push(`viewport: ${viewport}`);
	// The SUMMARY here; the full string is on the row and rides the JSON export.
	const browser = rowUserAgentSummary(row);
	if (browser) facts.push(`browser: ${browser}`);
	const httpStatus = rowStatusCode(row);
	if (httpStatus !== null) facts.push(`http status: ${httpStatus}`);
	if (includeSubmitter) {
		// AN ANONYMOUS ROW IS NOT A ROW WITH A MISSING FIELD, so it does not read
		// as one. It says what it is, and a contact string travels with the words
		// that describe what it is worth.
		if (rowIsAnonymous(row)) {
			const contact = rowContact(row);
			facts.push(
				contact
					? `from: anonymous, left this way to be reached (unverified, typed by the reporter): ${contact}`
					: 'from: anonymous, left no way to be reached'
			);
		} else {
			const who = row.submitter_name || row.submitter_email;
			if (who) facts.push(`from: ${who}`);
		}
	}
	// THE VALUE AND WHICH KIND OF IDENTIFIER IT IS. What that kind MEANS is
	// stated once in the header, because it is the same sentence every time and
	// repeating it under every report is most of the bundle's length.
	const build = rowBuild(row);
	if (build) facts.push(`build: ${build.value} (${build.source})`);

	lines.push(facts.map((f) => `- ${f}`).join('\n'));
	lines.push('');
	lines.push(quoteMessage(row.message));
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
	options: FeedbackExportOptions = {}
): FeedbackExport {
	const budget = options.budget ?? FEEDBACK_MARKDOWN_BUDGET;
	const filter = options.filter ?? EMPTY_FEEDBACK_FILTER;
	const includeSubmitter = options.includeSubmitter !== false;
	const grouped = rows.length > FEEDBACK_GROUPING_THRESHOLD;

	const facets: string[] = [`status: ${filter.status}`];
	if (filter.route) facets.push(`route contains "${filter.route}"`);
	if (filter.role) facets.push(`role: ${filter.role}`);
	if (filter.section) facets.push(`section: ${filter.section}`);
	if (filter.from) facets.push(`from ${filter.from}`);
	if (filter.to) facets.push(`to ${filter.to}`);

	const headLines: string[] = ['# IDEA feedback', '', `Filter: ${facets.join(', ')}`];
	if (options.generatedAt) headLines.push(`Exported: ${options.generatedAt}`);
	headLines.push(`Reports: ${rows.length}`);
	headLines.push(
		includeSubmitter
			? 'Submitter identity: included. An anonymous report says so, and carries the contact string its reporter typed, if any.'
			: 'Submitter identity: withheld at export. No name or address appears below, and no contact string from an anonymous report either.'
	);
	headLines.push(
		grouped
			? `Grouped by route id, largest group first (more than ${FEEDBACK_GROUPING_THRESHOLD} reports).`
			: `Listed flat, in queue order (${FEEDBACK_GROUPING_THRESHOLD} reports or fewer).`
	);

	// WHAT A BUILD IDENTIFIER MEANS, ONCE. Neither available identifier is a
	// hash of the built artifact, which is exactly what a bare hex string gets
	// mistaken for, so the words have to be somewhere. They do not have to be
	// under every report: one line per kind PRESENT is the whole claim.
	const meanings = new Map<string, string>();
	for (const row of rows) {
		const build = rowBuild(row);
		if (build && !meanings.has(build.source)) meanings.set(build.source, build.means);
	}
	if (meanings.size > 0) {
		headLines.push('');
		headLines.push('Build identifiers, stated once here rather than under every report:');
		for (const [source, means] of meanings) {
			headLines.push(`- ${source}: ${means || 'no description was captured with this value'}`);
		}
	}
	const head = headLines.join('\n');

	const groups = groupFeedbackByRoute(rows);
	const ordered = grouped ? groups.flatMap((g) => g.rows) : rows;
	const groupHeading = new Map<FeedbackRow, string>();
	if (grouped) {
		for (const g of groups) {
			const n = g.rows.length;
			groupHeading.set(g.rows[0], `## ${g.route} (${n} report${n === 1 ? '' : 's'})`);
		}
	}

	const body: string[] = [];
	let used = head.length;
	let included = 0;
	for (const row of ordered) {
		const heading = groupHeading.get(row);
		const block = (heading ? `${heading}\n\n` : '') + oneRow(row, included + 1, includeSubmitter);
		// Leave room for the truncation notice itself, so the thing that says
		// what was dropped can never be the thing that gets dropped.
		if (used + block.length > budget - 320 && included > 0) break;
		body.push(block);
		used += block.length;
		included += 1;
	}
	const dropped = rows.length - included;
	const parts = [head, '', ...body];
	if (dropped > 0) {
		parts.push(
			`_${dropped} more report${dropped === 1 ? '' : 's'} matched this filter and were left out of this bundle to keep it pasteable. A count in a group heading above is for the whole filtered set, not for what fitted. Narrow the filter to see them._`
		);
	}
	return {
		text:
			parts
				.join('\n')
				.replace(/\n{3,}/g, '\n\n')
				.trimEnd() + '\n',
		included,
		dropped,
		grouped
	};
}

/**
 * The submitter's name and address blanked, everything else untouched.
 *
 * AND THE CONTACT STRING WITH THEM. It is the one field on an anonymous row
 * that can name a person, so withholding names while leaving "text me,
 * 555-0134" in the file would be the toggle doing the opposite of what it
 * says. `anonymous` is deliberately KEPT: it is the absence of an identity, not
 * one, and it is what stops a blanked row reading as a name that went missing.
 */
function withoutSubmitter(row: FeedbackRow): FeedbackRow {
	return { ...row, submitter_name: null, submitter_email: null, contact: null };
}

/**
 * The filtered set as JSON. Rows are verbatim -- nothing is summarised away, so
 * the FULL user agent string travels here even though the markdown carries only
 * its summary.
 *
 * TWO DELIBERATE ADDITIONS BESIDE THE ROWS, neither of them a rewrite of one:
 * `sections` resolves every section id the set mentions, and `buildIdentifiers`
 * states what each kind of build value means. Both are lookups NEXT TO the rows
 * rather than fields spliced into them, so a row still reads exactly as it is
 * stored.
 *
 * The one thing that does edit a row is withholding the submitter, which is the
 * point of the toggle; `submitterIdentity` says so in the file.
 */
export function feedbackJson(rows: FeedbackRow[], options: FeedbackExportOptions = {}): string {
	const includeSubmitter = options.includeSubmitter !== false;
	const sections = new Map<string, ResolvedSection>();
	const buildIdentifiers = new Map<string, string>();
	for (const row of rows) {
		const section = resolveSectionId(rowSection(row));
		if (section && !sections.has(section.id)) sections.set(section.id, section);
		const build = rowBuild(row);
		if (build && !buildIdentifiers.has(build.source)) {
			buildIdentifiers.set(build.source, build.means);
		}
	}
	return JSON.stringify(
		{
			generatedAt: options.generatedAt ?? null,
			filter: options.filter ?? EMPTY_FEEDBACK_FILTER,
			count: rows.length,
			submitterIdentity: includeSubmitter ? 'included' : 'withheld',
			buildIdentifiers: [...buildIdentifiers.entries()].map(([source, means]) => ({
				source,
				means
			})),
			sections: [...sections.values()].sort((a, b) => a.id.localeCompare(b.id)),
			reports: includeSubmitter ? rows : rows.map(withoutSubmitter)
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
