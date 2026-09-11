#!/usr/bin/env node
/**
 * migration-claims: which migration numbers are LANDED, which are CLAIMED by a
 * lane still in flight, and which are FREE.
 *
 *   node tools/migration-claims.mjs            # the report
 *   node tools/migration-claims.mjs --json     # the same thing, machine readable
 *   node tools/migration-claims.mjs --next     # print one number and exit
 *
 * ---------------------------------------------------------------------------
 * THIS IS WHAT A SESSION CONSULTS INSTEAD OF `ls supabase/migrations/`, AND THE
 * DIFFERENCE IS THE WHOLE POINT OF THE FILE.
 *
 * `ls supabase/migrations/` answers truthfully about ONE working tree. So does
 * `git ls-tree` over one ref, and so does `git log --all --diff-filter=A`: every
 * one of them is a correct answer to "what has landed", and none of them is an
 * answer to "what is somebody else about to write". On 2026-09-06 three sessions
 * each fetched `origin/main`, each read `0185` as the highest, and each wrote
 * `0186` -- within four and a half minutes of one another, every one of them
 * having verified correctly. A number for a new migration is not a fact this
 * repository can answer. It is ALLOCATION, and allocation needs an allocator.
 *
 * So this tool reads the two things a landed-file sweep cannot:
 *
 *   1. MIGRATION FILES ON EVERY `claude/**` AND `codex/**` BRANCH, not just the landed refs.
 *      A file on an unmerged branch is a number somebody is already using.
 *   2. THE `Migration permitted` LINE OF EVERY LEDGER ENTRY, on every ref,
 *      whose `Status` is not terminal. That line is written in the session's
 *      FIRST commit, pushed alone before any work -- roughly half an hour
 *      before the migration file itself exists (measured across the five lanes
 *      that wrote one on 2026-09-06: 24m03s, 26m14s, 28m15s, 28m46s and
 *      41m25s). A claim recorded there is visible for that whole window; a
 *      claim recorded by the file is visible only after it.
 *
 * IT READS GIT AND NOTHING ELSE. No database, no browser, no network beyond
 * whatever `git fetch` the caller has already done. It cannot apply anything and
 * it cannot write anything.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT STILL DOES NOT FIX, stated here rather than discovered later:
 *
 *   * TWO SESSIONS STARTED INSIDE THE SAME FEW SECONDS STILL COLLIDE. The three
 *     branches that took `0186` pushed their first commits 07:17:42, 07:17:47
 *     and 07:17:58 -- sixteen seconds end to end. Nothing short of a lock
 *     catches that, and the claim only helps if one of them is reading after
 *     the other has pushed.
 *   * A CLAIM THAT NEVER LANDS BURNS A NUMBER. A lane that claims `0190` and is
 *     abandoned leaves `0190` reading as taken until somebody notices the branch
 *     is gone. That is why an abandoned entry gets a terminal `Status` rather
 *     than being deleted: a terminal entry stops claiming.
 *
 * Both are better than what happens now, which is two files with the same name
 * and a renumber after the work is written.
 *
 * ---------------------------------------------------------------------------
 * THE SPLIT: `collect()` runs git and returns a plain INVENTORY; `classify()`
 * is pure and takes one. Everything worth being wrong about is in `classify()`,
 * which means it is testable against fixtures rather than against whatever the
 * remote happens to hold this afternoon -- a test that read live branches would
 * be a ratchet recording what last happened.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

export const AGENT_BRANCH_PREFIXES = ['claude/', 'codex/']; // Mirrors integrate.yml AGENT_BRANCH_PREFIXES.

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '..');
export const MIGRATIONS_DIR = join('supabase', 'migrations');
export const LEDGER_DIR = join('docs', 'prompt-ledger', 'entries');

/**
 * @typedef {{ file: string, text: string }} LedgerBlob
 * @typedef {{ ref: string, branch: string, landed: boolean, migrations?: string[], entries?: LedgerBlob[] }} InventoryRef
 * @typedef {{ refs: InventoryRef[], refsVisible?: boolean }} Inventory
 * @typedef {{ raw: string, permits: boolean, numbers: number[], resolution: string }} Permitted
 * @typedef {{ ref: string, branch: string, sources: string[], entries: string[], files: string[] }} Holder
 * @typedef {{ number: number, holders: Holder[] }} ClaimRow
 * @typedef {{ number: number, files: string[], refs: string[] }} LandedRow
 * @typedef {{ ref: string, branch: string, entry: string, status: string, raw: string }} UnspecifiedRow
 * @typedef {{
 *   refsVisible: boolean,
 *   landed: LandedRow[],
 *   claimed: ClaimRow[],
 *   unspecified: UnspecifiedRow[],
 *   highestLanded: number,
 *   next: number,
 *   inFlightHoles: number[],
 *   unexplainedHoles: number[],
 *   contested: ClaimRow[]
 * }} Classification
 */

/** Refs whose migration files count as LANDED rather than claimed. */
export const LANDED_REFS = ['origin/main', 'origin/integration'];

/**
 * A ledger entry stops claiming when its Status is terminal. Same vocabulary
 * `tools/idea-status.py` uses, and the same normalisation: first whitespace
 * token, lowercased, surrounding punctuation stripped. An unrecognised status
 * is NOT terminal -- a status a tool cannot read must never silently release a
 * number somebody is holding.
 */
export const TERMINAL_STATUS = new Set(['deployed', 'superseded', 'withdrawn']);

export const STATUS_RANK = { issued: 0, pushed: 1, 'in-integration': 2, deployed: 3, superseded: 3, withdrawn: 3 };

/**
 * @param {string} status
 * @returns {number}
 */
export function statusRank(status) {
	return /** @type {Record<string, number>} */ (STATUS_RANK)[status] ?? -1;
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function normaliseStatus(raw) {
	const first = String(raw ?? '').trim().split(/\s+/)[0] ?? '';
	return first.replace(/^[^\w-]+|[^\w-]+$/g, '').toLowerCase();
}

/** `0186_maps_media_no_anon_listing.sql` -> 186. Anything else -> null. */
/**
 * @param {unknown} filename
 * @returns {number | null}
 */
export function migrationNumber(filename) {
	const base = String(filename ?? '').split('/').pop() ?? '';
	const m = /^(\d{4})_.*\.sql$/.exec(base);
	return m ? Number(m[1]) : null;
}

/**
 * Parse ONE `Migration permitted:` value.
 *
 * The corpus this has to read is 81 entries written by hand over a month, in a
 * dozen shapes, so the order of the rules below is the whole of the design:
 *
 *   1. `Highest on origin/main at issue: NNNN` is stripped FIRST. It is the
 *      number the lane read, never the number it takes, and leaving it in makes
 *      every refusing entry claim the top of the series.
 *   2. `Claims: <n|none>` wins outright where it is present. That is the shape
 *      this repository moved to; everything below it is how the shapes written
 *      before it are read.
 *   3. A recorded OUTCOME (`TAKEN`, `TOOK`, `NONE TAKEN`, `NONE WRITTEN`) beats
 *      a stated intent, because it is what the session actually did.
 *   4. `exactly one, NNNN` / `at most one, NNNN` is an intent naming a number,
 *      and the digits must follow the comma IMMEDIATELY -- entry 0073 reads
 *      "exactly one, the file 0072 wrote", where 0072 is a PROMPT number, and a
 *      looser regex claims a migration nobody mentioned. That is not
 *      hypothetical and it is not an old bug: `ledgerPermission` in
 *      `tools/apply-migration.mjs` read exactly that line as migration `0072`
 *      until it was made a caller of this function, which is the one measured
 *      case where the two parsers disagreed about a NUMBER NEITHER SIDE HAD
 *      ANY REASON TO NAME. (This paragraph named "entry 0083" and "0069" until
 *      2026-09-06. 0083's line reads `no.` and names nothing at all, so the
 *      example the rule was written from pointed at the wrong entry, which is
 *      the same class of staleness the rule itself is about.)
 *   5. Anything else that permits a migration permits it WITHOUT saying which
 *      number, which is the state that produced every collision this tool
 *      exists for. It is reported as `unspecified` and never silently as none.
 */
/**
 * @param {unknown} rawLine
 * @returns {Permitted}
 */
export function parsePermitted(rawLine) {
	const raw = String(rawLine ?? '');
	const value = raw.replace(/^\s*[-*]?\s*Migration permitted:\s*/i, '');
	const body = value.replace(/Highest on origin\/main at issue:\s*\d{4}/gi, ' ');

	/**
	 * @param {number[]} numbers
	 * @param {string} resolution
	 * @returns {Permitted}
	 */
	const claims = (numbers, resolution) => ({
		raw: value.trim(),
		permits: numbers.length > 0 || resolution === 'unspecified',
		numbers,
		resolution
	});

	const explicit = /\bClaims:\s*(none|\d{4}(?:\s*,\s*\d{4})*)/i.exec(body);
	if (explicit) {
		if (/^none$/i.test(explicit[1])) return claims([], 'declared-none');
		return claims(uniqueNumbers(explicit[1].match(/\d{4}/g)), 'declared');
	}

	if (/\bNONE\s+(TAKEN|WRITTEN|was taken)\b/i.test(body)) return claims([], 'none-taken');

	const took = /\b(?:TAKEN|TOOK)\b:?\s*`?(\d{4})/i.exec(body);
	if (took) return claims([Number(took[1])], 'taken');

	const intent = /\b(?:exactly|at most)\s+one,\s*(\d{4})\b/i.exec(body);
	if (intent) return claims([Number(intent[1])], 'intent');

	if (/^\s*no\b/i.test(body)) return claims([], 'refused');

	return claims([], 'unspecified');
}

/**
 * @param {string[] | null | undefined} list
 * @returns {number[]}
 */
function uniqueNumbers(list) {
	return [...new Set((list ?? []).map(Number))].sort((a, b) => a - b);
}

/**
 * Pull `# <id> <title>` and the `- Key: value` bullets out of a ledger entry.
 * Deliberately tolerant in the same direction `idea-status.py` is: a value
 * folded onto a continuation line still belongs to its key.
 */
/**
 * @param {unknown} text
 * @returns {{ id: string, title: string, fields: Record<string, string> }}
 */
export function parseEntry(text) {
	const lines = String(text ?? '').split(/\r?\n/);
	/** @type {Record<string, string>} */
	const fields = {};
	let key = null;
	let title = '';
	let id = '';
	for (const line of lines) {
		const heading = /^#\s+(\S+)\s*(.*)$/.exec(line);
		if (heading && !id) {
			id = heading[1];
			title = heading[2].trim();
			continue;
		}
		const bullet = /^\s*[-*]\s+([A-Za-z][A-Za-z /]*?):\s*(.*)$/.exec(line);
		if (bullet) {
			key = bullet[1].trim();
			fields[key] = bullet[2];
			continue;
		}
		if (key && /^\s+\S/.test(line)) fields[key] += ` ${line.trim()}`;
		else if (!line.trim()) key = null;
	}
	return { id, title, fields };
}

/**
 * PURE. Takes an inventory and answers who holds what.
 *
 * inventory = {
 *   refs: [{ ref, landed: bool, branch: string, migrations: [filename],
 *            entries: [{ file, text }] }],
 *   refsVisible: bool
 * }
 */
/**
 * @param {Inventory | null | undefined} inventory
 * @returns {Classification}
 */
export function classify(inventory) {
	const refs = inventory?.refs ?? [];
	const landed = new Map();
	for (const r of refs) {
		if (!r.landed) continue;
		for (const f of r.migrations ?? []) {
			const n = migrationNumber(f);
			if (n === null) continue;
			const row = landed.get(n) ?? { number: n, files: new Set(), refs: new Set() };
			row.files.add(String(f).split('/').pop());
			row.refs.add(r.ref);
			landed.set(n, row);
		}
	}

	/** @type {Map<number, ClaimRow>} */
	const claims = new Map();
	/** @type {UnspecifiedRow[]} */
	const unspecified = [];
	/**
	 * @param {number} n
	 * @param {{ ref: string, branch: string, source: string, entry?: string, file?: string }} holder
	 */
	const addClaim = (n, holder) => {
		// A number both claimed and landed IS landed, and is reported once.
		// The lane that wrote it is not still holding it -- it let go the
		// moment the file reached a landed ref.
		if (landed.has(n)) return;
		const row = claims.get(n) ?? /** @type {ClaimRow} */ ({ number: n, holders: [] });
		const same = row.holders.find((h) => h.ref === holder.ref);
		if (same) {
			if (!same.sources.includes(holder.source)) same.sources.push(holder.source);
			if (holder.entry && !same.entries.includes(holder.entry)) same.entries.push(holder.entry);
			if (holder.file && !same.files.includes(holder.file)) same.files.push(holder.file);
		} else {
			row.holders.push({
				ref: holder.ref,
				branch: holder.branch,
				sources: [holder.source],
				entries: holder.entry ? [holder.entry] : [],
				files: holder.file ? [holder.file] : []
			});
		}
		claims.set(n, row);
	};

	for (const r of refs) {
		if (r.landed) continue;
		for (const f of r.migrations ?? []) {
			const n = migrationNumber(f);
			if (n === null) continue;
			addClaim(n, { ref: r.ref, branch: r.branch, source: 'file', file: String(f).split('/').pop() });
		}
	}

	// Ledger claims are read from EVERY ref, landed ones included: an entry
	// that has reached `main` while its migration has not is exactly the state
	// a lane is in between its first commit and its merge.
	//
	// DEDUPED BY ENTRY ID, PREFERRING THE MOST ADVANCED STATUS, the way
	// `tools/idea-status.py` does. One entry copied onto twenty branches is one
	// entry, and reporting it twenty times is how a report stops being read --
	// the first draft of this listed 168 rows for 10 distinct entries.
	const seen = new Map();
	for (const r of refs) {
		for (const e of r.entries ?? []) {
			const parsed = parseEntry(e.text);
			const status = normaliseStatus(parsed.fields.Status);
			const row = {
				id: parsed.id || e.file,
				entry: e.file,
				ref: r.ref,
				branch: r.branch,
				status,
				permitted: parsePermitted(parsed.fields['Migration permitted'])
			};
			const cur = seen.get(row.id);
			if (!cur || statusRank(status) > statusRank(cur.status)) seen.set(row.id, row);
		}
	}
	for (const row of seen.values()) {
		if (TERMINAL_STATUS.has(row.status)) continue;
		for (const n of row.permitted.numbers) {
			addClaim(n, { ref: row.ref, branch: row.branch, source: 'ledger', entry: row.entry });
		}
		if (row.permitted.resolution === 'unspecified') {
			unspecified.push({
				ref: row.ref,
				branch: row.branch,
				entry: row.entry,
				status: row.status,
				raw: row.permitted.raw
			});
		}
	}
	unspecified.sort((a, b) => a.entry.localeCompare(b.entry));

	const landedNums = [...landed.keys()].sort((a, b) => a - b);
	const claimedNums = [...claims.keys()].sort((a, b) => a - b);
	const highestLanded = landedNums.length ? landedNums[landedNums.length - 1] : 0;
	const highestKnown = Math.max(highestLanded, claimedNums.length ? claimedNums[claimedNums.length - 1] : 0);

	let next = highestLanded + 1;
	while (claims.has(next) || landed.has(next)) next += 1;

	// A hole below the highest number anybody holds is either explained by a
	// lane in flight or it is not, and only the second kind is a defect.
	const inFlightHoles = [];
	const unexplainedHoles = [];
	for (let n = landedNums.length ? landedNums[0] : 1; n <= highestKnown; n += 1) {
		if (landed.has(n)) continue;
		if (claims.has(n)) inFlightHoles.push(n);
		else unexplainedHoles.push(n);
	}

	return {
		refsVisible: Boolean(inventory?.refsVisible),
		landed: landedNums.map((n) => ({
			number: n,
			files: [...landed.get(n).files].sort(),
			refs: [...landed.get(n).refs].sort()
		})),
		claimed: [...claims.values()].sort((a, b) => a.number - b.number),
		unspecified,
		highestLanded,
		next,
		inFlightHoles,
		unexplainedHoles,
		// A number held by two different refs at once. This is the collision
		// itself, reported before either one is a file on main.
		contested: [...claims.values()]
			.filter((row) => row.holders.length > 1)
			.sort((a, b) => a.number - b.number)
	};
}

/**
 * THE BRANCHES A SWEEP MUST LEAVE ALONE: every `claude/**` or `codex/**` branch holding a
 * migration number that ANOTHER agent branch also holds.
 *
 * This is the half of the collision problem no branch can see for itself.
 * `integrate.yml` is the first moment in the system where two branches are in
 * one process at the same time, so it is the only place the question can be
 * asked -- and it asks it through this function so the rule has one
 * implementation rather than a copy embedded in a workflow's shell.
 *
 * TWO FILTERS, AND BOTH ARE LOAD-BEARING RATHER THAN TIDINESS:
 *
 *   * ONLY `claude/**` AND `codex/**` HOLDERS COUNT. `collect()` deliberately treats the
 *     WORKING TREE as a holder, because the person running the tool by hand is
 *     usually the session that is holding the number. On the sweep runner the
 *     working tree is `integration` mid-merge, so every number `integration`
 *     carries would otherwise read as a second holder and contest with the
 *     very branch that wrote it. Measured against nothing -- it is arithmetic:
 *     one agent branch plus one working tree is `holders.length === 2`, which
 *     is `contested`, which would skip a branch nobody is contesting.
 *   * TWO DISTINCT AGENT BRANCHES, not two holders. A row whose only claude
 *     holder appears twice (an entry AND a file, which is the ordinary shape
 *     for a session that has written its migration) is one branch, not two.
 *
 * Returns a sorted array of branch names, and an EMPTY array is the ordinary
 * answer. A caller that cannot run this at all must merge everything: see the
 * gate in `.github/workflows/integrate.yml`, which fails toward merging on
 * purpose and in the opposite direction from `ledger_gate`.
 */
/**
 * @param {Classification | null | undefined} result
 * @returns {string[]}
 */
export function contestedBranches(result) {
	/** @type {Set<string>} */
	const out = new Set();
	for (const row of result?.contested ?? []) {
		const branches = [
			...new Set((row?.holders ?? []).map((h) => String(h?.branch ?? '')).filter((b) => AGENT_BRANCH_PREFIXES.some((p) => b.startsWith(p))))
		];
		if (branches.length < 2) continue;
		for (const b of branches) out.add(b);
	}
	return [...out].sort();
}

/**
 * The claim map the contiguity assertion consumes: `{ [number]: [branch, ...] }`.
 * A plain object of plain strings, so a test can build one by hand and a caller
 * cannot accidentally depend on the shape of a holder record.
 */
/**
 * @param {Classification | null | undefined} result
 * @returns {Record<number, string[]>}
 */
export function claimMap(result) {
	/** @type {Record<number, string[]>} */
	const out = {};
	for (const row of result?.claimed ?? []) {
		out[row.number] = row.holders.map((h) => h.branch || h.ref);
	}
	return out;
}

/**
 * Holes in `nums` that NOTHING in `claims` accounts for. `nums` is a sorted
 * list of migration numbers; `claims` is a `claimMap`. Exported because the
 * contiguity assertion in `tests/db/migration-0177-tombstone.test.ts` is the
 * caller that matters, and two implementations of "is this hole explained" is
 * the pair that stops agreeing.
 */
/**
 * @param {number[]} nums
 * @param {Record<number, string[]>} [claims]
 * @returns {number[]}
 */
export function unexplainedHoles(nums, claims = {}) {
	return holesIn(nums).filter((n) => !(claims && claims[n]));
}

/** The other half: holes a lane in flight accounts for, with who holds each. */
/**
 * @param {number[]} nums
 * @param {Record<number, string[]>} [claims]
 * @returns {{ number: number, branches: string[] }[]}
 */
export function inFlightHoles(nums, claims = {}) {
	return holesIn(nums)
		.filter((n) => claims && claims[n])
		.map((n) => ({ number: n, branches: [...claims[n]] }));
}

/**
 * @param {number[] | null | undefined} nums
 * @returns {number[]}
 */
function holesIn(nums) {
	const sorted = [...new Set((nums ?? []).map(Number))].sort((a, b) => a - b);
	if (sorted.length === 0) return [];
	const have = new Set(sorted);
	const out = [];
	for (let n = sorted[0]; n <= sorted[sorted.length - 1]; n += 1) if (!have.has(n)) out.push(n);
	return out;
}

// ---------------------------------------------------------------------------
// The git shell. Everything below here is IO.
// ---------------------------------------------------------------------------

/**
 * @param {string} root
 * @param {string[]} args
 * @returns {string}
 */
function git(root, args) {
	return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/**
 * @param {string} root
 * @param {string[]} args
 * @returns {boolean}
 */
function gitOk(root, args) {
	try {
		git(root, args);
		return true;
	} catch {
		return false;
	}
}

/**
 * @param {string} root
 * @param {string} ref
 * @param {string} dir
 * @returns {string[]}
 */
function lsTree(root, ref, dir) {
	try {
		return git(root, ['ls-tree', '-r', '--name-only', ref, `${dir}/`])
			.split('\n')
			.filter(Boolean);
	} catch {
		return [];
	}
}

/**
 * Every blob under `dir` on `ref`, in TWO git invocations rather than one per
 * file. The first draft used `git show <ref>:<path>` per entry -- 22 refs times
 * 70 ledger entries is roughly 1,500 process spawns, measured at 5.4 seconds,
 * which is too slow to sit inside a test that also boots Postgres. `ls-tree`
 * long-format gives the blob shas and one `cat-file --batch` streams every body.
 *
 * @param {string} root
 * @param {string} ref
 * @param {string} dir
 * @returns {LedgerBlob[]}
 */
function readDirBlobs(root, ref, dir) {
	let listing;
	try {
		listing = git(root, ['ls-tree', '-r', ref, `${dir}/`]);
	} catch {
		return [];
	}
	const wanted = [];
	for (const line of listing.split('\n')) {
		const m = /^\d+ blob ([0-9a-f]+)\t(.+)$/.exec(line);
		if (!m) continue;
		const file = m[2].split('/').pop() ?? '';
		if (!file.endsWith('.md')) continue;
		wanted.push({ sha: m[1], file });
	}
	if (wanted.length === 0) return [];

	// NOT wrapped in a try/catch that returns []. A missing REF is an ordinary
	// answer and `ls-tree` above returns nothing for it; a `cat-file` that
	// fails on blobs `ls-tree` just listed is a broken read, and swallowing it
	// silently under-reports claims -- which is the dangerous direction, since
	// a claim this tool cannot see reads as a free number. `encoding: null`
	// and not `'buffer'`: this Node rejects the latter outright, and the first
	// draft caught that rejection and reported zero ledger entries on every
	// ref, quietly, for a full run.
	const batch = execFileSync('git', ['cat-file', '--batch'], {
		cwd: root,
		input: `${wanted.map((w) => w.sha).join('\n')}\n`,
		encoding: null,
		maxBuffer: 256 * 1024 * 1024
	});

	// `<sha> <type> <size>\n<size bytes>\n`, once per requested object, in order.
	const out = [];
	let at = 0;
	for (const w of wanted) {
		const nl = batch.indexOf(10, at);
		if (nl < 0) break;
		const header = batch.toString('utf8', at, nl).split(' ');
		if (header.length < 3) break;
		const size = Number(header[2]);
		const start = nl + 1;
		out.push({ file: w.file, text: batch.toString('utf8', start, start + size) });
		at = start + size + 1;
	}
	return out;
}

/**
 * @param {string} [root]
 * @returns {Inventory}
 */
export function collect(root = REPO_ROOT) {
	const refs = [];

	// The WORKING TREE first, and it is a claim like any other: a session that
	// has written its file but not pushed it is holding that number, and the
	// person running this tool is usually that session.
	const treeMigrations = safeListDir(join(root, MIGRATIONS_DIR));
	const treeEntries = safeListDir(join(root, LEDGER_DIR))
		.filter((f) => f.endsWith('.md'))
		.map((f) => ({ file: f, text: safeRead(join(root, LEDGER_DIR, f)) }));
	refs.push({
		ref: '(working tree)',
		branch: currentBranch(root),
		landed: false,
		migrations: treeMigrations.filter((f) => f.endsWith('.sql')),
		entries: treeEntries
	});

	for (const ref of LANDED_REFS) {
		if (!gitOk(root, ['rev-parse', '--verify', '--quiet', ref])) continue;
		refs.push({
			ref,
			branch: ref,
			landed: true,
			migrations: lsTree(root, ref, MIGRATIONS_DIR),
			entries: readDirBlobs(root, ref, LEDGER_DIR)
		});
	}

	/** @type {string[]} */
	let branchRefs = [];
	try {
		branchRefs = git(root, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin/claude'])
			.split('\n')
			.filter(Boolean);
	} catch {
		branchRefs = [];
	}
	for (const ref of branchRefs) {
		refs.push({
			ref,
			branch: ref.replace(/^origin\//, ''),
			landed: false,
			migrations: lsTree(root, ref, MIGRATIONS_DIR),
			entries: readDirBlobs(root, ref, LEDGER_DIR)
		});
	}

	return { refs, refsVisible: branchRefs.length > 0 };
}

/**
 * @param {string} root
 * @returns {string}
 */
function currentBranch(root) {
	try {
		return git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
	} catch {
		return '(detached)';
	}
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
function safeListDir(dir) {
	try {
		return readdirSync(dir);
	} catch {
		return [];
	}
}

/**
 * @param {string} path
 * @returns {string}
 */
function safeRead(path) {
	try {
		return readFileSync(path, 'utf8');
	} catch {
		return '';
	}
}

/**
 * @param {Classification} result
 * @returns {string}
 */
export function formatReport(result) {
	const out = [];
	/** @param {number} n */
	const pad = (n) => String(n).padStart(4, '0');
	out.push('MIGRATION NUMBERS');
	out.push('');
	out.push(`  highest landed      ${pad(result.highestLanded)}`);
	out.push(`  next free           ${pad(result.next)}`);
	out.push('');
	if (!result.refsVisible) {
		out.push('  NO `origin/claude/**` OR `origin/codex/**` REFS ARE VISIBLE FROM THIS CHECKOUT, so no branch');
		out.push('  claim could be read and this answer is INCOMPLETE. On a shallow clone:');
		out.push("    git fetch --depth=1 origin '+refs/heads/claude/*:refs/remotes/origin/claude/*' '+refs/heads/codex/*:refs/remotes/origin/codex/*'");
		out.push('');
	}

	out.push(`CLAIMED, NOT LANDED (${result.claimed.length})`);
	if (result.claimed.length === 0) out.push('  none');
	for (const row of result.claimed) {
		for (const h of row.holders) {
			const how = h.sources
				.map((s) => (s === 'file' ? h.files.join(', ') : h.entries.join(', ')))
				.join(' + ');
			out.push(`  ${pad(row.number)}  ${h.branch}  [${h.sources.join('+')}] ${how}`);
		}
	}
	out.push('');

	if (result.contested.length) {
		out.push(`CONTESTED -- TWO LANES HOLD ONE NUMBER (${result.contested.length})`);
		for (const row of result.contested) {
			out.push(`  ${pad(row.number)}  ${row.holders.map((h) => h.branch).join('  vs  ')}`);
		}
		out.push('');
	}

	if (result.unexplainedHoles.length) {
		out.push(`HOLES NOTHING ACCOUNTS FOR (${result.unexplainedHoles.length})`);
		out.push(`  ${result.unexplainedHoles.map(pad).join(' ')}`);
		out.push('');
	}
	if (result.inFlightHoles.length) {
		out.push(`HOLES A LANE IN FLIGHT ACCOUNTS FOR (${result.inFlightHoles.length})`);
		out.push(`  ${result.inFlightHoles.map(pad).join(' ')}`);
		out.push('');
	}

	if (result.unspecified.length) {
		// An entry at `issued` is a session that is STILL RUNNING and may take a
		// number nobody can see coming. One at `pushed` is finished: whatever it
		// took is already a file the sweep above found, and whatever it did not
		// take it never will. Both are counted; only the live ones are listed,
		// because a list nobody reads is the same as no list.
		const live = result.unspecified.filter((u) => u.status === 'issued');
		const done = result.unspecified.length - live.length;
		out.push(`PERMITTED BUT NAMING NO NUMBER (${result.unspecified.length})`);
		out.push('  This is the shape every collision to date was written in: a lane');
		out.push('  allowed a migration, with the number chosen after the work.');
		if (live.length === 0) out.push('  none still running');
		for (const u of live) out.push(`  ${u.entry}  ${u.branch}  (issued -- STILL RUNNING)`);
		if (done) out.push(`  ...and ${done} finished entr${done === 1 ? 'y' : 'ies'} of the same shape, not listed.`);
		out.push('');
	}

	out.push('A number is free only if it is absent from BOTH lists above.');
	return out.join('\n');
}

/**
 * @param {string[]} [argv]
 * @returns {number}
 */
export function main(argv = process.argv.slice(2)) {
	const result = classify(collect(REPO_ROOT));
	if (argv.includes('--next')) {
		console.log(String(result.next).padStart(4, '0'));
		return 0;
	}
	if (argv.includes('--json')) {
		console.log(JSON.stringify(result, null, 2));
		return 0;
	}
	// ONE BRANCH PER LINE AND NOTHING ELSE, because the caller is a shell loop
	// in `integrate.yml` and a shell loop that has to parse JSON is a second
	// parser. No branches is EMPTY OUTPUT and exit 0 -- which is the ordinary
	// answer and must never be confused with the tool failing, since those two
	// take the sweep in opposite directions.
	if (argv.includes('--contested-branches')) {
		for (const b of contestedBranches(result)) console.log(b);
		return 0;
	}
	console.log(formatReport(result));
	return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	process.exit(main());
}
