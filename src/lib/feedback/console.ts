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

/**
 * WHAT THE REPORTER TRIED, from wherever this row happens to carry it.
 *
 * TWO PLACES, ONE ANSWER. 0170 gives it a column, and both write paths put it
 * there once that migration is applied -- but a row filed before it, and a row
 * written by a client sending through the anonymous route against a backend
 * that has not had it applied yet, carry the same sentence in `meta.tried`.
 * Reading the column first and falling back is what makes the queue show every
 * row's answer rather than only the ones filed after an apply.
 *
 * THE FALLBACK IS NOT DEAD CODE and does not become dead code when 0170 is
 * applied: it is what a deployment sitting between two migrations produces, and
 * that is a real state in this repo rather than a hypothetical one.
 */
export function rowTried(row: FeedbackRow): string | null {
	const column = (row.tried ?? '').trim();
	if (column) return column;
	return metaString(row, 'tried');
}

/**
 * The KEY of this row's screenshot, or null. NEVER A URL: the object lives in a
 * private bucket and a key resolves to nothing on its own. The console renders
 * it through a short-lived signed URL minted server-side as the admin, so the
 * storage policy stays the boundary and no key in an export is a way in.
 */
export function rowScreenshotPath(row: FeedbackRow): string | null {
	const raw = (row.screenshot_path ?? '').trim();
	return raw ? raw : null;
}

export function rowStatusCode(row: FeedbackRow): number | null {
	const raw = (row.meta ?? {}).status;
	return typeof raw === 'number' ? raw : null;
}

export function rowErrorId(row: FeedbackRow): string | null {
	return metaString(row, 'errorId');
}

/**
 * Every `meta` key a named accessor above already reads, matched key for key
 * against `route`/`path`/`role`/`section`/`viewport`/`userAgent`/`build`/
 * `status`/`errorId`. `at` is the same instant as `row.created_at`, already
 * printed as "filed", so it is excluded rather than left to fall through as a
 * second timestamp.
 *
 * `meta` IS FREE-FORM (feedback.ts says so): `captureMeta` is the shell's one
 * producer, but not the only one -- VANGUARD's in-game composer writes
 * `surface` and `initials` straight into the same column, and `captureMeta`
 * itself has emitted `error` for every error-boundary report since it
 * existed. A FIXED LIST OF NAMED FIELDS IS THE WRONG SHAPE for a free-form
 * blob on its own; {@link rowMetaExtras} is the generic pass that catches
 * whatever this set does not name.
 */
const KNOWN_META_KEYS = new Set([
	'route',
	'path',
	'role',
	'section',
	'viewport',
	'userAgent',
	'at',
	'build',
	'status',
	'errorId',
	// `tried` IS READ BY A NAMED ACCESSOR (`rowTried`) whenever it is in the
	// blob rather than the column, so leaving it out of this set would print the
	// same sentence twice -- once as the field and once as an anonymous extra.
	'tried'
]);

/** A meta value worth a line in the generic pass: a non-empty primitive. */
function metaExtraText(value: unknown): string | null {
	if (typeof value === 'string') return value.trim() || null;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	// An object or an array gets no generic rendering: `build` is the one
	// object shape this file understands by name and prints with its own
	// sentence, and serialising an unknown one inline would wedge a JSON blob
	// or "[object Object]" into a markdown bullet. Dropped rather than guessed
	// at -- the JSON export carries the row, and this key, verbatim.
	return null;
}

/**
 * Whatever else is in the row's `meta`, beyond a key a named accessor above
 * already reads. ADDITIVE ONLY: a key `rowRoute`, `rowBuild` and the rest
 * already claim can never reach here, so widening this set can only ever
 * surface a key nothing already prints -- it cannot change what a named field
 * says.
 *
 * SORTED BY KEY, not by insertion order into the blob, so the same set of
 * extra keys prints in the same order on every export of the same row. Two
 * exports taken an hour apart are then diffable by eye, which tracking object
 * insertion order could not promise -- a producer that writes its keys in a
 * different order between builds would otherwise reorder the bundle for no
 * reason a reader could see.
 *
 * ONE IMPLEMENTATION, read by the markdown export. Long values are capped at
 * 200 characters: this is a layout safety net, not a content rule, because
 * nothing here promises a future producer keeps its values as short as
 * VANGUARD's `initials` does.
 */
export function rowMetaExtras(row: FeedbackRow): { key: string; value: string }[] {
	const meta = row.meta ?? {};
	const extras: { key: string; value: string }[] = [];
	for (const key of Object.keys(meta)) {
		if (KNOWN_META_KEYS.has(key)) continue;
		const text = metaExtraText(meta[key]);
		if (!text) continue;
		extras.push({ key, value: text.length > 200 ? `${text.slice(0, 200)}…` : text });
	}
	return extras.sort((a, b) => a.key.localeCompare(b.key));
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
 * A `classroom_sections` row, projected to what an export needs to print. Keyed
 * by `classroom_sections.id` -- the value `page.params.sectionId` actually is on
 * `/classroom/[sectionId]`, and so what a report's `meta.section` carries from
 * that route. It is a DIFFERENT NAMESPACE from `curriculum.ts`'s `SECTIONS`
 * slugs (`profiles.section_id`), and the two ids can collide as strings with no
 * relation to each other, so this is looked up FIRST and `sectionById` is the
 * fallback for a report filed somewhere that only ever had the curriculum slug.
 */
export interface ClassroomSectionInfo {
	id: string;
	/** Course code, e.g. "IDEA 209H". */
	course: string;
	/** "Period 3", "A", ... */
	label: string;
	block: string | null;
}

/**
 * AN ID THAT DOES NOT RESOLVE SAYS SO. Falling back to the raw id silently
 * would render a stored slug in the position a course name occupies, and the
 * next reader takes it for a course nobody has heard of rather than for a
 * section that has been retired, mistyped, or never added to the registry.
 */
export function resolveSectionId(
	id: string | null | undefined,
	classroomSections?: ReadonlyMap<string, ClassroomSectionInfo>
): ResolvedSection | null {
	const raw = (id ?? '').trim();
	if (!raw) return null;
	const live = classroomSections?.get(raw);
	if (live) {
		return {
			id: raw,
			resolved: true,
			course: live.course,
			period: live.block,
			label: `${live.course} ${live.label}${live.block ? `, ${live.block}` : ''} (${raw})`
		};
	}
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
	/** The live `classroom_sections` lookup, see {@link resolveSectionId}. */
	classroomSections?: ReadonlyMap<string, ClassroomSectionInfo>;
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

function oneRow(
	row: FeedbackRow,
	index: number,
	includeSubmitter: boolean,
	classroomSections?: ReadonlyMap<string, ClassroomSectionInfo>
): string {
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
	const section = resolveSectionId(rowSection(row), classroomSections);
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
	// THE GENERIC PASS, LAST AND ALWAYS SORTED, so a producer nothing above
	// names by key still reaches the bundle instead of being dropped on the
	// floor -- see rowMetaExtras.
	for (const extra of rowMetaExtras(row)) facts.push(`${extra.key}: ${extra.value}`);

	lines.push(facts.map((f) => `- ${f}`).join('\n'));
	lines.push('');
	lines.push(quoteMessage(row.message));

	// WHAT THEY TRIED, AS ITS OWN LABELLED QUOTE. It is prose somebody typed, so
	// it goes through the SAME `quoteMessage` the message does -- a report that
	// pastes a rule of dashes into this field would otherwise promote the line
	// above it to a heading and reparent everything after it, which is the exact
	// defect that function exists to stop, arriving through a second field.
	const tried = rowTried(row);
	if (tried) {
		lines.push('');
		lines.push('**Tried first:**');
		lines.push('');
		lines.push(quoteMessage(tried));
	}
	// A SCREENSHOT IS NAMED, NEVER LINKED. The key resolves to nothing outside
	// the console -- the bucket is private and the URL the console renders is
	// signed and short-lived -- so printing one would be an address that always
	// 404s. Saying it exists is what lets a reader know to go and look.
	if (rowScreenshotPath(row)) {
		lines.push('');
		lines.push('_A screenshot is attached. Open this report in the feedback console to see it._');
	}
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
	const classroomSections = options.classroomSections;
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
		const block =
			(heading ? `${heading}\n\n` : '') +
			oneRow(row, included + 1, includeSubmitter, classroomSections);
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
	// `tried` AND `screenshot_path` ARE DELIBERATELY KEPT. This toggle withholds
	// IDENTITY -- a name, an address, the one free-form string on an anonymous
	// row that can name a person. What somebody tried is part of the report, and
	// a screenshot key is an opaque pointer into a private bucket that resolves
	// to nothing without a signed URL an admin has to mint. Stripping either
	// would be the toggle quietly deleting the report rather than the name.
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
		const section = resolveSectionId(rowSection(row), options.classroomSections);
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

// ---------------------------------------------------------------------------
// Bulk status changes
// ---------------------------------------------------------------------------

/**
 * HOW MANY NAMES A BULK RESULT SPELLS OUT before it starts counting.
 *
 * The queue exists to be worked through in batches, so a bulk result over
 * forty reports would otherwise be forty lines of quoted message where a
 * confirmation should be. The cap is stated in the sentence whenever it cut
 * anything, exactly as the markdown export states its own budget: a list that
 * silently stops reads as the whole list.
 */
export const FEEDBACK_BULK_NAME_LIMIT = 6;

/**
 * A REPORT AS A PERSON RECOGNISES IT: where it came from, then the opening of
 * what they wrote.
 *
 * A feedback row has no title -- nothing here is authored with a name on it --
 * so an id would be the only other thing to say, and an id names a row to the
 * database and to nobody else. The route is what places it and the first words
 * are what identify it among the four other reports from the same route.
 *
 * THE EXCERPT IS FLATTENED AND CAPPED. A report is free text a student typed,
 * routinely several lines of it, and a confirmation line that swallows a
 * paragraph is a confirmation nobody reads. It is interpolated as plain text by
 * every caller (this console raw-renders nothing), so there is no escaping
 * decision here beyond keeping it to one line.
 */
export function feedbackRowLabel(row: FeedbackRow): string {
	const flat = row.message.replace(/\s+/g, ' ').trim();
	const excerpt = flat.length > 48 ? `${flat.slice(0, 45)}...` : flat;
	return excerpt ? `${rowRoute(row)} "${excerpt}"` : rowRoute(row);
}

/** One report's outcome in a bulk status change. */
export interface FeedbackBulkOutcome {
	row: FeedbackRow;
	ok: boolean;
	message?: string | null;
}

function nameList(rows: FeedbackRow[]): string {
	const named = rows.slice(0, FEEDBACK_BULK_NAME_LIMIT).map(feedbackRowLabel);
	const rest = rows.length - named.length;
	return rest > 0 ? `${named.join('; ')} (and ${rest} more)` : named.join('; ');
}

/**
 * WHAT A BULK STATUS CHANGE SAYS AFTERWARDS, and it always says which reports
 * moved rather than only how many.
 *
 * There is no bulk RPC behind this: `app_feedback_set_status` takes one id, so
 * a batch is N independent writes and a partial result is an ORDINARY outcome
 * rather than an edge case. The dangerous version of that is a set left half
 * changed with nothing on screen saying which half, because the next thing
 * anybody does is press it again over the same selection.
 *
 * SO BOTH HALVES ARE NAMED, and the refusals carry the server's own first
 * message. Reporting "12 of 30 updated" and stopping is precisely the answer
 * that cannot be acted on.
 */
export function feedbackBulkSummary(
	status: FeedbackStatus,
	outcomes: FeedbackBulkOutcome[]
): string {
	const moved = outcomes.filter((o) => o.ok).map((o) => o.row);
	const failed = outcomes.filter((o) => !o.ok);
	const parts: string[] = [];
	if (moved.length) {
		parts.push(
			`Moved ${moved.length} report${moved.length === 1 ? '' : 's'} to ${status}: ${nameList(moved)}.`
		);
	} else {
		parts.push(`Nothing moved to ${status}.`);
	}
	if (failed.length) {
		const why = failed.find((f) => f.message)?.message;
		parts.push(
			`${failed.length} did not move${why ? ` (${why})` : ''}: ${nameList(failed.map((f) => f.row))}.`
		);
	}
	return parts.join(' ');
}
