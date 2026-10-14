/**
 * The build stamp: how a commit log becomes the `<app> v1.N · <sha> · <date>`
 * line every surface renders.
 *
 * PURE DATA IN, PURE DATA OUT. `vite.config.ts` shells out to git and hands the
 * raw output here; nothing in this file runs a command, reads a file or touches
 * the network, which is what lets the derivation be tested against histories
 * that would otherwise need a repo to reproduce. Same constraint as
 * site-manifest.ts, and for the same second reason: this module is imported by
 * the build config AND by client components, so it must stay dependency-free
 * and client-safe.
 *
 * WHY IT EXISTS AS ITS OWN FILE. The stamp used to be derived inline in
 * vite.config.ts and formatted independently in two places -- VersionBadge for
 * Svelte pages, versionLine() for the HTML injected into legacy endpoints. Two
 * formatters mean two stamps, and a stamp that can disagree with itself is
 * worse than no stamp, because it is believed. `stampParts` is now the only
 * place the line is assembled, and both surfaces call it.
 *
 * THE VERSION IS A COMMIT COUNT, SO IT IS ONLY MEANINGFUL OVER A COMPLETE
 * HISTORY. A count over a truncated log is a sliding window: it goes DOWN as
 * unrelated commits land, because older commits touching that app fall off the
 * back faster than new ones touching it arrive. Vercel shallow-clones by
 * default, so this is the ordinary production case, not an edge one -- and the
 * symptom is a version number that silently moves backwards while the code
 * moves forwards.
 *
 * WHAT IS DONE ABOUT IT: when the history is incomplete, `version` is NULL and
 * the stamp omits the version segment entirely. A number that can go backwards
 * is worse than no number, because it is trusted; the commit sha, which is
 * exact whatever the clone depth, still identifies the build. Set
 * `VERCEL_DEEP_CLONE=true` on the project to get the version back.
 */
import { appLabel, appsForCommit, classifyNote, isBookkeepingNote, APPS } from './site-manifest';

/**
 * Record and field separators. ASCII RS/US: neither can occur in a commit
 * subject, a date or a path, so the log parses with no quoting rules.
 */
export const REC = '\x1e';
export const FIELD = '\x1f';

/** The `--pretty=format:` string whose output `parseGitLog` reads. */
export const GIT_LOG_FORMAT = `${REC}%h${FIELD}%cd${FIELD}%cI${FIELD}%s`;

/**
 * The `--pretty=format:` string for the ONE-RECORD HEAD READ, whose output
 * `parseHeadCommit` reads.
 *
 * IT IS A SECOND COMMAND BECAUSE THE FIRST ONE CANNOT SEE A MERGE, AND THE
 * FIRST ONE MUST NOT LEARN TO. The changelog log runs `--no-merges` on purpose:
 * a merge subject is not user-facing changelog copy, and counting a merge would
 * count every commit under it twice. But the commit a deployment is BUILT FROM
 * is now routinely a merge -- `main` advances by `--no-ff` merges -- and the
 * build stamp has to be able to recognise one. So the changelog keeps its
 * filtered walk and the stamp gets an unfiltered one-line read beside it,
 * rather than one walk trying to answer two questions with opposite needs.
 */
export const GIT_HEAD_FORMAT = `%h${FIELD}%cd`;

/**
 * The `--pretty=format:` string for the LINE-COUNT walk (`git log --numstat`),
 * whose output `parseNumstat` reads: one record per commit, the short sha on
 * its own line and then git's own `added<TAB>removed<TAB>path` lines.
 *
 * A SEPARATE WALK RATHER THAN A CHANGE TO THE CHANGELOG ONE, and the reason
 * is the version numbers. The changelog walk reads `--name-only`, and the paths it
 * hands `appsForCommit` ARE the per-app commit counts; `--numstat` spells a
 * rename as `src/{old => new}/x.ts` where `--name-only` gives the new path, so
 * switching the one walk over would move the app attribution of every rename
 * in the history. The line counts ride beside it and change nothing it says.
 * It runs `--no-merges` exactly as the changelog does, so every entry has a
 * count and no merge is counted twice (report R10).
 */
export const GIT_NUMSTAT_FORMAT = `${REC}%h`;

/**
 * The `--pretty=format:` string for the BODY walk, whose output `parseBodies`
 * reads: one record per commit, the short sha, a field separator and the
 * commit's body (`%b`, everything after the subject's blank line).
 *
 * A THIRD WALK, FOR THE LAZY MODULE ONLY, and for the numstat walk's reason:
 * the `--name-only` walk's file lines ARE the per-app version counts, and a
 * body interleaved with them is one more thing the parse could mistake for a
 * path. Run alone, it changes nothing any version number says.
 */
export const GIT_BODY_FORMAT = `${REC}%h${FIELD}%b`;

/**
 * HOW MUCH OF A BODY TRAVELS (Mr. Pina's report "Change log is not
 * comprehensive with the latest": show each update's own list of changes
 * under it). The lazy changelog is one payload for every commit in the
 * history, so a body is cut down to its bullet lines, at most this many of
 * them, each at most this many characters.
 */
export const CHANGELOG_DETAIL_LINES = 6;
export const CHANGELOG_DETAIL_CHARS = 200;

export interface VersionEntry {
	/** Short commit SHA. */
	sha: string;
	/** Human date, e.g. "Jun 30, 2026". */
	date: string;
	/** ISO date (YYYY-MM-DD) for range filtering. */
	iso: string;
	/** Commit subject (the user-facing changelog line). */
	note: string;
	/** Change type id (see CHANGE_TYPES in site-manifest.ts). */
	type: string;
	/** App ids this commit touched (see APPS in site-manifest.ts). */
	apps: string[];
	/**
	 * Lines of counted code this commit added and removed -- counted the way
	 * the home page's lines-of-code figure is, so a row moves that headline and
	 * nothing else does. BOTH PRESENT OR BOTH ABSENT, and absent is the answer
	 * on a shallow clone (a truncated history's oldest commit lists the whole
	 * tree as added) and in the eager module, which never runs the walk. Absent
	 * is never zero: zero is a commit that touched only prose or data.
	 */
	added?: number;
	removed?: number;
	/**
	 * Present, and true, only on a repository-bookkeeping commit (a ledger
	 * entry, a migration-applied record; `isBookkeepingNote`). It stays in the
	 * log because versions are commit counts and the feedback console measures
	 * build age in commits; the surfaces that LIST updates leave it out
	 * (`userFacingEntries`). Absent on every other entry.
	 */
	internal?: true;
	/**
	 * The bullet lines of the commit's body, in order, capped by
	 * `CHANGELOG_DETAIL_LINES` and `CHANGELOG_DETAIL_CHARS`. Only the lazy
	 * module's body walk attaches them, and only to an entry a reader is shown;
	 * absent, never empty, when there are none.
	 */
	details?: string[];
}

/** One commit's counted lines, as `parseNumstat` totals them. */
export interface LineDelta {
	added: number;
	removed: number;
}

/** A `VersionEntry` that carries its line counts. */
export type CountedEntry = VersionEntry & LineDelta;

export interface AppVersion {
	/**
	 * Auto-derived version, e.g. "v1.42" -- or NULL when the history this build
	 * saw was truncated and a commit count would be a number that can decrease.
	 */
	version: string | null;
	count: number;
	lastSha: string;
	lastDate: string;
}

export interface DeployStamp {
	sha: string;
	date: string;
	/** False when the build saw a shallow or unavailable history. */
	complete: boolean;
}

/**
 * The head of the history as git reports it with NOTHING filtered out -- so a
 * merge commit is a legal value here and is not one in `VersionEntry`.
 */
export interface HeadCommit {
	/** Short commit SHA, as `%h` gives it. */
	sha: string;
	/** Human date, e.g. "Sep 9, 2026". */
	date: string;
}

export interface SiteVersions {
	entries: VersionEntry[];
	apps: Record<string, AppVersion>;
	deploy: DeployStamp;
}

/**
 * Parse `git log --name-only` output in GIT_LOG_FORMAT.
 *
 * THE OLDEST RECORD OF A TRUNCATED LOG IS NOT A DIFF. In a shallow clone the
 * boundary commit is grafted to have no parent, so `--name-only` lists the
 * ENTIRE tree for it rather than what it changed -- which attributes that one
 * commit to every app at once, inflating every count by one and putting a false
 * row in the changelog's per-app filters. Its subject is still real, so the
 * entry stays; only its file attribution is dropped.
 */
export function parseGitLog(raw: string, opts: { complete: boolean }): VersionEntry[] {
	const entries = raw
		.split(REC)
		.map((record) => {
			const lines = record.split('\n');
			const [sha, date, iso, note] = (lines[0] ?? '').split(FIELD);
			const files = lines
				.slice(1)
				.map((l) => l.trim())
				.filter(Boolean);
			const entry: VersionEntry = {
				sha: (sha ?? '').trim(),
				date: (date ?? '').trim().replace(/\s+/g, ' '),
				iso: (iso ?? '').trim().slice(0, 10),
				note: (note ?? '').trim(),
				type: classifyNote(note ?? ''),
				apps: appsForCommit(files)
			};
			// The flag is ADDED, never written false: every other entry keeps the
			// exact shape it always had.
			if (isBookkeepingNote(entry.note)) entry.internal = true;
			return entry;
		})
		.filter((e) => e.sha.length > 0 && e.note.length > 0);

	if (!opts.complete && entries.length > 0) {
		entries[entries.length - 1] = { ...entries[entries.length - 1], apps: [] };
	}
	return entries;
}

/**
 * Per-app version and last-touched commit, from the parsed log (newest first,
 * so the first hit per app is its latest commit).
 */
export function deriveApps(
	entries: VersionEntry[],
	opts: { complete: boolean }
): Record<string, AppVersion> {
	const blank = (): AppVersion => ({ version: null, count: 0, lastSha: '', lastDate: '' });
	const apps: Record<string, AppVersion> = {};
	for (const a of APPS) apps[a.id] = blank();
	for (const e of entries) {
		for (const id of e.apps) {
			const s = apps[id] ?? (apps[id] = blank());
			s.count += 1;
			if (!s.lastSha) {
				s.lastSha = e.sha;
				s.lastDate = e.date;
			}
		}
	}
	// A count is a version only when it was counted over everything there is.
	for (const id of Object.keys(apps)) {
		apps[id].version = opts.complete ? `v1.${apps[id].count}` : null;
	}
	return apps;
}

/**
 * Parse the one-record output of `GIT_HEAD_FORMAT`. Null when there was no
 * history to read, which is the same fail-soft the log parse takes.
 */
export function parseHeadCommit(raw: string): HeadCommit | null {
	const [sha, date] = (raw ?? '').trim().split(FIELD);
	const s = (sha ?? '').trim();
	if (!s) return null;
	return { sha: s, date: (date ?? '').trim().replace(/\s+/g, ' ') };
}

/**
 * Does `envSha` -- a full 40-character sha from the platform -- name the same
 * commit as `sha`, which is a SHORT sha of unspecified length?
 *
 * The test is symmetric because neither length is fixed: git lengthens `%h`
 * past seven whenever seven would be ambiguous (this repo's are eight today),
 * and the stamp itself renders seven. One prefix test in one direction is a
 * comparison that starts failing the day the repo grows enough to need a
 * longer abbreviation.
 */
function namesSameCommit(envSha: string, sha: string): boolean {
	if (!envSha || !sha) return false;
	return envSha.startsWith(sha) || sha.startsWith(envSha.slice(0, 7));
}

/**
 * Which commit this build IS.
 *
 * THE PLATFORM'S OWN SHA WINS. `VERCEL_GIT_COMMIT_SHA` names the commit the
 * deployment was created from and is exact whatever the clone depth turned out
 * to be, so it is preferred over the head of a log that may have been
 * truncated. The date comes from a commit whose sha CORROBORATES that one --
 * dating a build by a commit it was not built from is the same class of quiet
 * lie the version number was telling.
 *
 * THE CORROBORATION HAS TO BE ABLE TO SEE A MERGE COMMIT, AND FOR TWO MONTHS IT
 * COULD NOT. It compared the platform's sha against the head of the CHANGELOG
 * log, which runs `--no-merges`. Since 2026-09-09 `main` advances by `--no-ff`
 * merge commits, so the commit a production build is made from is routinely a
 * commit that log excludes by construction: nothing could ever corroborate it,
 * the date emptied, and every merged deploy stamped `local build` where its
 * date belongs. Measured on live production thirty seconds apart -- `d7dd04c`,
 * a plain export commit, rendered `Sep 9, 2026`; `786702d`, a merge, rendered
 * `local build`.
 *
 * WHAT IS NOT DONE ABOUT IT: the check is not removed, and the changelog log is
 * not taught to include merges. The refusal is the reason the date is worth
 * reading at all, and a merge subject is not changelog copy. Instead the
 * gatherer reads the head ONE more time with nothing filtered (`opts.head`),
 * and that reading is offered to the same unchanged test first. A build whose
 * sha matches NEITHER head still gets no date, exactly as before.
 *
 * `opts.head` IS OPTIONAL, SO THE FALLBACK IS THE OLD BEHAVIOUR EXACTLY. A
 * caller that supplies none corroborates against the log head alone, which is
 * what every caller did before this parameter existed.
 */
export function deriveDeploy(
	entries: VersionEntry[],
	opts: { complete: boolean; envSha?: string | null; head?: HeadCommit | null }
): DeployStamp {
	const logHead = entries[0];
	/* Unfiltered head first: it is the only one that can name a merge, and
	   where the build is not a merge the two are the same commit anyway. */
	const candidates: HeadCommit[] = [];
	if (opts.head?.sha) candidates.push(opts.head);
	if (logHead) candidates.push({ sha: logHead.sha, date: logHead.date });

	const env = (opts.envSha ?? '').trim();
	if (env) {
		const named = candidates.find((c) => namesSameCommit(env, c.sha));
		return { sha: env.slice(0, 7), date: named?.date ?? '', complete: opts.complete };
	}
	/* No platform sha: this is a local or non-Vercel build, and the commit it
	   IS is whatever git's own head is -- including a merge, whose date the
	   changelog log would otherwise have swapped for an older commit's. */
	const head = candidates[0];
	return { sha: head?.sha ?? 'dev', date: head?.date ?? '', complete: opts.complete };
}

/**
 * The path a `--numstat` line names, AFTER a rename -- the one `--name-only`
 * reports. Git writes a rename as `old => new`, or with the shared parts
 * factored out as `src/{routes/a.svelte => lib/b.ts}` (either side of the
 * arrow may be empty: `src/{ => classroom}/x.ts`), and quotes a path it cannot
 * print plainly. The extension and the directory are all the census reads, so
 * this resolves to the new side and strips the quotes; it does not need to be
 * an exact unescaper.
 */
export function numstatPath(raw: string): string {
	let p = raw.trim();
	const brace = /\{([^{}]*) => ([^{}]*)\}/;
	if (brace.test(p)) {
		p = p.replace(brace, (_whole, _from: string, to: string) => to).replace(/\/{2,}/g, '/').replace(/^\//, '');
	} else if (p.includes(' => ')) {
		p = p.slice(p.lastIndexOf(' => ') + 4);
	}
	if (p.length >= 2 && p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1).replace(/\\(["\\])/g, '$1');
	return p;
}

/**
 * Total each commit's `--numstat` lines over the paths `counts` admits, keyed
 * by short sha. A BINARY file (`-` in both columns) has no line count and is
 * skipped rather than read as zero, and a commit whose every path was skipped
 * is still in the map, at zero: it is a commit git listed, which is what makes
 * "absent" mean "not counted" rather than "touched nothing that counts".
 */
export function parseNumstat(raw: string, counts: (path: string) => boolean): Map<string, LineDelta> {
	const out = new Map<string, LineDelta>();
	for (const record of (raw ?? '').split(REC)) {
		const lines = record.split('\n');
		const sha = (lines[0] ?? '').trim();
		if (!sha) continue;
		let added = 0;
		let removed = 0;
		for (const line of lines.slice(1)) {
			const m = /^(\d+)\t(\d+)\t(.+)$/.exec(line.replace(/\r$/, ''));
			if (!m) continue;
			if (!counts(numstatPath(m[3]))) continue;
			added += Number(m[1]);
			removed += Number(m[2]);
		}
		out.set(sha, { added, removed });
	}
	return out;
}

/** Hang each entry's counts on it; an entry the walk did not list stays absent. */
export function withLineCounts(entries: VersionEntry[], deltas: Map<string, LineDelta>): VersionEntry[] {
	return entries.map((e) => {
		const d = deltas.get(e.sha);
		return d ? { ...e, added: d.added, removed: d.removed } : e;
	});
}

/**
 * The entries a READER is shown: every commit but the bookkeeping ones, in the
 * order given. The one filter every surface that lists updates applies, so the
 * panel, the FRC footer and the code pop-up cannot disagree about what an
 * update is. Nothing that COUNTS commits may call it: the version numbers and
 * a report's build age are counts over every commit.
 */
export function userFacingEntries<T extends VersionEntry>(entries: readonly T[]): T[] {
	return entries.filter((e) => !e.internal);
}

/**
 * The eager module's two scalars, over what a reader is shown: how many
 * updates the panel will list, and the newest of them. `vite.config.ts` and the
 * test stub both build them here, so the stub cannot describe a different
 * export.
 */
export function changelogSummary(entries: readonly VersionEntry[]): {
	total: number;
	latest: VersionEntry | null;
} {
	const shown = userFacingEntries(entries);
	return { total: shown.length, latest: shown[0] ?? null };
}

/** Cut one detail line to the cap at a word boundary, marking the cut. */
function clipDetail(text: string, max: number): string {
	if (text.length <= max) return text;
	const cut = text.slice(0, max - 1);
	const space = cut.lastIndexOf(' ');
	return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, '')}\u2026`;
}

/**
 * The bullet lines of one commit body, as a reader is shown them.
 *
 * A BULLET IS A LINE OPENING `- ` OR `* `, at the margin or indented (a nested
 * point is listed as its own line). An indented line that is not a bullet
 * CONTINUES the one before it, which is how this repository's bodies wrap a
 * long point; a blank line or an unindented prose line ends it. Everything
 * else -- a paragraph of prose, the `Co-Authored-By` trailers -- is not a
 * bullet and is left out. Whitespace is collapsed and a code span's backticks
 * are dropped, because the panel renders text. Capped by `lines` and `chars`.
 */
export function bodyDetails(
	body: string,
	opts: { lines?: number; chars?: number } = {}
): string[] {
	const maxLines = opts.lines ?? CHANGELOG_DETAIL_LINES;
	const maxChars = opts.chars ?? CHANGELOG_DETAIL_CHARS;
	const items: string[] = [];
	let open: string[] | null = null;
	const close = () => {
		if (open) {
			const text = open.join(' ').replace(/`([^`]*)`/g, '$1').replace(/\s+/g, ' ').trim();
			if (text) items.push(text);
		}
		open = null;
	};
	for (const raw of (body ?? '').split('\n')) {
		const line = raw.replace(/\r$/, '');
		const bullet = /^\s*[-*]\s+(\S.*)$/.exec(line);
		if (bullet) {
			close();
			open = [bullet[1]];
		} else if (open && /^\s+\S/.test(line)) {
			open.push(line.trim());
		} else {
			close();
		}
	}
	close();
	return items.slice(0, Math.max(0, maxLines)).map((t) => clipDetail(t, maxChars));
}

/** Each commit's detail lines from the body walk, keyed by short sha; a commit with none is left out. */
export function parseBodies(raw: string): Map<string, string[]> {
	const out = new Map<string, string[]>();
	for (const record of (raw ?? '').split(REC)) {
		const at = record.indexOf(FIELD);
		if (at < 0) continue;
		const sha = record.slice(0, at).trim();
		if (!sha) continue;
		const details = bodyDetails(record.slice(at + FIELD.length));
		if (details.length) out.set(sha, details);
	}
	return out;
}

/** Hang each shown entry's detail lines on it; a bookkeeping entry, and one with none, is left as it was. */
export function withDetails(entries: VersionEntry[], bodies: Map<string, string[]>): VersionEntry[] {
	return entries.map((e) => {
		const d = e.internal ? undefined : bodies.get(e.sha);
		return d && d.length ? { ...e, details: d } : e;
	});
}

/** Whether an entry carries its line counts. */
export function hasLineCounts(e: VersionEntry): e is CountedEntry {
	return typeof e.added === 'number' && typeof e.removed === 'number';
}

/**
 * The newest `limit` updates that changed counted code, newest first, and
 * whether this log carries counts at all. `known: false` is a build that did
 * not count -- a shallow clone -- and a surface says so rather than showing a
 * list of zeros; an update that touched only prose or data is left out of the
 * list, because "+0 -0" beside a changelog line is noise, not a figure.
 */
export function recentCodeChanges(
	entries: VersionEntry[],
	limit: number
): { known: boolean; rows: CountedEntry[] } {
	const counted = userFacingEntries(entries).filter(hasLineCounts);
	return {
		known: counted.length > 0,
		rows: counted.filter((e) => e.added + e.removed > 0).slice(0, Math.max(0, limit))
	};
}

/**
 * The whole substrate, from one raw log plus what the platform said.
 *
 * `headRaw` is the unfiltered one-line head read (`GIT_HEAD_FORMAT`), and is
 * what lets the stamp recognise a build made from a merge commit. Omitted, the
 * derivation is exactly what it was before that read existed.
 *
 * `numstatRaw` is the line-count walk (`GIT_NUMSTAT_FORMAT`) and `countsLine`
 * the census's own test of which paths count (`countsAsCode` in
 * `$lib/code-census`, handed in rather than imported so this module stays the
 * dependency-free one every route loads). The counts are attached ONLY over a
 * complete history -- the same `complete` the version numbers are withheld on,
 * and for the same reason -- and are otherwise ABSENT, never a smaller number.
 */
export function buildSiteVersions(
	raw: string,
	opts: {
		complete: boolean;
		envSha?: string | null;
		headRaw?: string | null;
		numstatRaw?: string | null;
		countsLine?: (path: string) => boolean;
		bodyRaw?: string | null;
	}
): SiteVersions {
	const parsed = parseGitLog(raw, opts);
	const counted =
		opts.complete && opts.numstatRaw && opts.countsLine
			? withLineCounts(parsed, parseNumstat(opts.numstatRaw, opts.countsLine))
			: parsed;
	/* Detail lines ride on whatever the body walk said, shallow clone or not:
	   a body is the commit's own text and is exact at any clone depth, unlike a
	   count. Absent with no walk, which is the eager module. */
	const entries = opts.bodyRaw ? withDetails(counted, parseBodies(opts.bodyRaw)) : counted;
	return {
		entries,
		apps: deriveApps(entries, opts),
		deploy: deriveDeploy(entries, { ...opts, head: parseHeadCommit(opts.headRaw ?? '') })
	};
}

/**
 * The stamp, as its segments. THE ONE ASSEMBLER: VersionBadge joins these with
 * a styled separator and versionLine joins them with a plain one; neither
 * decides what goes in the line.
 *
 * The version segment is present only when there IS a version -- an omitted
 * segment reads as "not stated", which is true, where "v1.0" reads as a fact
 * and is wrong.
 */
export function stampParts(
	appId: string,
	apps: Record<string, AppVersion>,
	deploy: DeployStamp
): string[] {
	const version = apps[appId]?.version ?? null;
	const label = version ? `${appLabel(appId)} ${version}` : appLabel(appId);
	return [label, deploy.sha, deploy.date || 'local build'];
}

/** The stamp as one plain string, for surfaces that inject text. */
export function stampText(
	appId: string,
	apps: Record<string, AppVersion>,
	deploy: DeployStamp
): string {
	return stampParts(appId, apps, deploy).join(' · ');
}

/** Hover text: says where the number came from, or why there is not one. */
export function stampTitle(deploy: DeployStamp): string {
	return deploy.complete
		? 'Version auto-derived from git history'
		: 'Build stamp from the deployed commit. No version number: this build saw a truncated git history, and a commit count over one moves backwards.';
}

/** A month heading in the changelog panel, with the entries filed under it. */
export interface VersionMonth {
	/** "YYYY-MM", taken from the entries' own `iso`. */
	key: string;
	/** "September 2026", or "Undated" when the month is not 1 through 12. */
	label: string;
	entries: VersionEntry[];
}

/** Month names for the headings. No other caller: the panel is the only reader. */
const MONTH_NAMES = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

/**
 * The filtered log cut into month headings.
 *
 * A KEY MUST NEVER BE ABLE TO OPEN A SECOND GROUP, WHATEVER ORDER THE INPUT
 * ARRIVES IN, AND THAT IS WHY THIS IS A MAP RATHER THAN A SINGLE PASS. It used
 * to walk the log once and compare each entry's month only against the LAST
 * group opened, which is correct only while the log is monotonic by displayed
 * date. It is not, and the reason is timezones rather than ordering: `%cI`
 * carries each commit's own UTC offset, cloud commits are stamped `+00:00` and
 * commits made through the GitHub web UI are stamped in the author's local
 * zone, and git orders the log by ABSOLUTE INSTANT. So a commit made at 18:20
 * -07:00 sorts between two stamped 01:08 and 02:05 +00:00 while displaying a
 * date one day earlier -- and the month it interrupts is then opened a second
 * time below it.
 *
 * THAT WAS FATAL RATHER THAN UNTIDY. The panel keys its `{#each}` on
 * `month.key`, and Svelte 5 throws `each_key_duplicate` on a repeated key,
 * which took the whole homepage blank on hydration while its server HTML
 * rendered correctly. Committer timezones in history are immutable and
 * mixed-zone commits keep arriving, so the grouping is correct for a
 * non-monotonic log rather than the log being cleaned up.
 *
 * IT GROUPS, IT NEVER CAPS. Every entry handed in comes back out exactly once:
 * there is no slice and no cap here. The home page's panel WINDOWS the filtered
 * log before it groups (ledger 0360, `changelogWindow` below), and regrouping
 * the whole visible prefix every time a page is added -- rather than appending
 * a page's own groups -- is what keeps each month key unique as pages grow: a
 * page boundary can fall inside a month, and inside a non-monotonic run of one.
 */
export function groupEntriesByMonth(entries: VersionEntry[]): VersionMonth[] {
	const byKey = new Map<string, VersionMonth>();
	for (const entry of entries) {
		const key = entry.iso.slice(0, 7);
		let month = byKey.get(key);
		if (!month) {
			const n = Number(key.slice(5, 7));
			const name = n >= 1 && n <= 12 ? MONTH_NAMES[n - 1] : undefined;
			month = { key, label: name ? `${name} ${key.slice(0, 4)}` : 'Undated', entries: [] };
			byKey.set(key, month);
		}
		month.entries.push(entry);
	}
	// Plain string comparison, not localeCompare: these are fixed-width keys and
	// an ICU-dependent order would sort differently on different machines. Sort
	// is stable, so entries sharing an `iso` keep the order git listed them in.
	const months = [...byKey.values()];
	months.sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
	for (const month of months) {
		month.entries.sort((a, b) => (a.iso < b.iso ? 1 : a.iso > b.iso ? -1 : 0));
	}
	return months;
}

/**
 * HOW MUCH OF THE CHANGELOG IS ON SCREEN AT ONCE (ledger 0360, report R24).
 *
 * The Portal Updates panel used to render every commit the moment it opened --
 * 2,507 on the day it was reported, about seven DOM nodes each -- and opening
 * it lagged; a log that grows by about fifty entries a school day only gets
 * worse. 150 is about three days at September 2026's pace: a real run of
 * reading, and about a thousand nodes. The filters and the count still run
 * over the WHOLE log; only the rendering is windowed.
 */
export const CHANGELOG_PAGE_SIZE = 150;

export interface ChangelogWindow {
	/** The entries to render: a prefix of the input, in its order. */
	visible: VersionEntry[];
	/** `visible.length`. */
	shown: number;
	/** Every entry the window was cut from. */
	total: number;
	/** `total - shown`: what a "Show more" control has left to offer. */
	remaining: number;
	/** The `requested` value that shows one more page, never past `total`. */
	next: number;
}

/**
 * The first `requested` entries, clamped to at least one page and at most the
 * whole list. A request that is not a number reads as one page, so a bad value
 * can never render nothing or everything.
 */
export function changelogWindow(
	entries: readonly VersionEntry[],
	requested: number,
	page: number = CHANGELOG_PAGE_SIZE
): ChangelogWindow {
	const total = entries.length;
	const want = Math.floor(requested) || page;
	const shown = Math.min(total, Math.max(page, want));
	return {
		visible: entries.slice(0, shown),
		shown,
		total,
		remaining: total - shown,
		next: Math.min(total, shown + page)
	};
}
