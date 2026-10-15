import { EXPORT_KINDS, type ExportKind } from '$lib/certifications/types';

/**
 * THE BULK EXPORT FOR A CLAUDE CHAT (ledger 0391; `docs/CERTIFICATIONS.md`
 * "Bulk export for Claude"): `cert_export(kind, from, to)` answers flat rows,
 * and the route zips them as `<kind>.json`, `<kind>.csv` and a `README.md`
 * that says what every field means, so Mr. Pina can hand the file to a chat
 * without reading it himself. This module is the pure half: the CSV writer and
 * the README text. The zip and the headers are the route's.
 *
 * `toCsv` is RFC 4180: CRLF between records, every field quoted that holds a
 * comma, a quote, a CR or an LF, quotes doubled, UTF-8 with no byte order mark.
 * Every object key is a column, the union of keys over every row in the order
 * first seen, so a row missing a key is an empty cell and never a shifted one.
 * A nested object or array is written as its JSON text in one cell.
 */

export function isExportKind(value: string | null | undefined): value is ExportKind {
	return !!value && (EXPORT_KINDS as readonly string[]).includes(value);
}

/** The union of keys over every row, in first-seen order. */
export function csvColumns(rows: Record<string, unknown>[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const row of rows) {
		for (const key of Object.keys(row)) {
			if (!seen.has(key)) {
				seen.add(key);
				out.push(key);
			}
		}
	}
	return out;
}

function cell(value: unknown): string {
	if (value === null || value === undefined) return '';
	let text: string;
	if (typeof value === 'string') text = value;
	else if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') text = String(value);
	else if (value instanceof Date) text = value.toISOString();
	else text = JSON.stringify(value);
	return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: Record<string, unknown>[], columns: string[] = csvColumns(rows)): string {
	const lines = [columns.map(cell).join(',')];
	for (const row of rows) lines.push(columns.map((c) => cell(row[c])).join(','));
	return lines.join('\r\n') + '\r\n';
}

/** `cert-<kind>-<YYYYMMDD>.zip`, the date in Los Angeles. */
export function exportZipName(kind: ExportKind, at: Date = new Date()): string {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: 'America/Los_Angeles',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(at);
	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
	return `cert-${kind}-${get('year')}${get('month')}${get('day')}.zip`;
}

/** One paragraph per kind: what a row is and what its fields mean. */
export const EXPORT_FIELD_NOTES: Record<ExportKind, string> = {
	events:
		'One row per event in the portal\'s event log (`cert_events`), the one record every other figure is derived from. `id` is the row number; `at` is when it happened (UTC); `kind` is a dotted name such as `attempt.started`, `exam.failed` or `award.granted`; `actor_email` is who did it (`system` for automated steps) and `subject_email` whose record it is about; `certification_id` and `attempt_id` name what it touched; `reason` is the written reason where one was required (a suspension, a revocation, a correction); `payload` is the event\'s own details as JSON.',
	audit:
		'The audit view of the event log: only writes that changed a record and carried a reason, plus every award action. Same fields as `events`. Read `reason` to see why each change was made and `actor_email` to see who made it. This export is admin only.',
	sync: 'One row per call to the FRC app mirror (`cert_sync_log`). `at` is when the call was made; `trigger` is why (`award`, `catalog`, `daily`, `manual`); `ok` says whether the FRC app accepted the whole snapshot; `http_status` is the answer\'s HTTP status where known; `catalog_count` and `holder_count` are how many certifications and holder rows were sent; `source_revision` is the snapshot\'s own stamp; `error` is the FRC app\'s problem list or the transport error, never the request body; `duration_ms` is how long the call took; `remote_log_id` is the FRC app\'s own log row.',
	errors:
		'One row per server failure recorded by the portal (`cert_errors`): a failed email send, a failed push, a signature that did not verify, a job that refused. `at` is when; `where_` names the module or route; `message` is the failure in words; `detail` is JSON with the ids involved (never a secret, never a message body); `correlation_id` joins the row to a request log line when one exists. This export is admin only.',
	attempts:
		'One row per attempt (`cert_attempts`): one student working one certification once. `email` is the student; `certification_id` and `revision_id` say which certification and which saved version they started on; `state` is `active`, `withdrawn`, `dormant` or `complete`; `started_at`, `finished_at`, `withdrawn_at`, `dormant_at` and `last_activity_at` are the clock. Completion time is `finished_at` minus `started_at`.',
	awards:
		'One row per award (`cert_awards`): a signed certification record. `serial` is the certificate\'s serial; `email` and `holder_name` are the holder; `code`, `name`, `level` and `category` are the certification as awarded; `awarded_at` and `awarded_by_email` / `awarded_by_name` say when and by whom; `expires_at` is null for a certification that never expires; `status` is the stored status (`active`, `suspended`, `revoked`; an active award past `expires_at` is shown as expired); `key_id` names the signing key. The signature itself is checked on the verify page.',
	exams:
		'One row per exam sitting (`cert_exam_attempts`). `email` is the student and `proctor_email` who released it; `state` is `released`, `in_progress`, `submitted` or `expired`; `released_at`, `started_at`, `deadline` and `submitted_at` are the clock; `time_limit_minutes` is the limit in force; `passed` is true only at 100%; `score` is JSON with the correct count, the total, the per-topic counts and the missed topics; `flags` is JSON listing every focus event (`blur`, `hidden`, `fullscreen_exit`, `resize`, `copy`, `paste`, `contextmenu`) with its time. Answer keys are never in an export.',
	watch:
		'One row per training video watch session (`cert_watch_sessions`). `email` is the student; `certification_id` and `item_key` (`yt:<id>` or `lesson:<slug>`) say what was watched; `at` is when the session was reported; `played_seconds` is time the video actually played; `max_rate` is the fastest playback speed used (capped at 2); `checkins_missed` counts Continue check-ins left unanswered; `coverage` is the fraction of the video covered after this session (a video counts at 0.95).',
	practice:
		'One row per quick check or practice quiz answer (`cert_practice_results`). `email` is the student; `certification_id` the certification; `kind` is `quick` (a check inside the training) or `practice` (the practice quiz); `item_id` names the question in the certification\'s package; `correct` is whether the answer was right; `at` is when. These are ungraded and exist for telemetry only.',
	notifications:
		'One row per notification (`cert_notifications`). `email` is who it was for; `kind` is the type (`part_checked`, `review_returned`, `sitting_approved`, `sitting_declined`, `cooldown_ended`, `awarded`, `suspended`, `reinstated`, `revoked`, `expiring`, `queue_submission`, `queue_request`); `title`, `body` and `href` are what it said and where it linked; `created_at` is when it was raised; `read_at` is when it was opened in the portal; `emailed_at` and `pushed_at` say when each channel delivered it (null means not yet, or that channel is not configured).'
};

export interface ExportReadmeInput {
	kind: ExportKind;
	count: number;
	from: string | null;
	to: string | null;
	exportedAt: string;
	exportedBy?: string | null;
	truncated?: boolean;
}

/** The README that rides in every export zip. Says what the files are; no process. */
export function exportReadme(input: ExportReadmeInput): string {
	const range =
		input.from || input.to
			? `Rows from ${input.from ?? 'the beginning'} to ${input.to ?? 'now'}.`
			: 'Every row on record, with no date filter.';
	const lines = [
		`# IDEA Certifications export: ${input.kind}`,
		'',
		`Exported ${input.exportedAt} from the IDEA Certification Portal (ideabosco.com/certifications). ${range} ${input.count} row${input.count === 1 ? '' : 's'}.${input.truncated ? ' The export stopped at its 50,000 row cap; narrow the dates to see the rest.' : ''}`,
		'',
		'## Files',
		'',
		`- \`${input.kind}.json\`: the rows as a JSON array of flat objects. The authoritative copy.`,
		`- \`${input.kind}.csv\`: the same rows as RFC 4180 CSV, one column per field (the union of every row's keys), nested values written as JSON text in their cell.`,
		'- `README.md`: this file.',
		'',
		'## Fields',
		'',
		EXPORT_FIELD_NOTES[input.kind],
		'',
		'Timestamps are ISO 8601 in UTC. Emails are lowercase school addresses and identify a person; treat the file as a student record.',
		''
	];
	return lines.join('\n');
}
