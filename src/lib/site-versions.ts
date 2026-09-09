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
import { appLabel, appsForCommit, classifyNote, APPS } from './site-manifest';

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
}

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
			return {
				sha: (sha ?? '').trim(),
				date: (date ?? '').trim().replace(/\s+/g, ' '),
				iso: (iso ?? '').trim().slice(0, 10),
				note: (note ?? '').trim(),
				type: classifyNote(note ?? ''),
				apps: appsForCommit(files)
			};
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
 * The whole substrate, from one raw log plus what the platform said.
 *
 * `headRaw` is the unfiltered one-line head read (`GIT_HEAD_FORMAT`), and is
 * what lets the stamp recognise a build made from a merge commit. Omitted, the
 * derivation is exactly what it was before that read existed.
 */
export function buildSiteVersions(
	raw: string,
	opts: { complete: boolean; envSha?: string | null; headRaw?: string | null }
): SiteVersions {
	const entries = parseGitLog(raw, opts);
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
 * there is no slice, no cap and no pagination here, because the panel has never
 * had any and `filteredLog.length` still counts the whole array.
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
