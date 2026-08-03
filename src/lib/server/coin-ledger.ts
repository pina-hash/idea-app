import { env } from '$env/dynamic/private';

/**
 * IDEA Coin ledger: the ONLY place in this repository that knows how to talk to
 * the coin ledger Apps Script.
 *
 * This module lives under `$lib/server` deliberately. SvelteKit refuses to
 * bundle anything under that path into client code, so neither the endpoint URL
 * nor the API key can leak into a browser by accident, the way they did before:
 * the `/exec` URL used to be a plain string literal in BOTH the teacher entry
 * tool and the fully public `static/coins/index.html`, so any visitor could read
 * it with view-source (audit finding F3).
 *
 * Every ledger call now originates on the SvelteKit server, which attaches
 * `COIN_API_KEY`. Browsers talk only to same-origin `/api/coin-ledger/*` routes,
 * which decide who is allowed to ask for what.
 *
 * ---------------------------------------------------------------------------
 * INTEGRATION CONTRACT WITH Code.gs
 * ---------------------------------------------------------------------------
 * The key is sent as a query parameter named by `COIN_API_KEY_PARAM` below,
 * because an Apps Script `doGet(e)` can only ever see `e.parameter` — it cannot
 * read custom request headers at all, so a header-based key is not an option.
 * If the deployed Code.gs reads the key under a different parameter name,
 * change `COIN_API_KEY_PARAM` (one line) to match it.
 */

/**
 * The deployed ledger `/exec` URL. Overridable at runtime with `COIN_LEDGER_URL`
 * so the deployment can be rotated without a commit; the literal is the current
 * deployment and is retained so nothing needs configuring beyond the key.
 *
 * With `COIN_API_KEY` required by Code.gs, this URL is no longer a credential:
 * knowing it buys nothing without the key.
 */
const DEFAULT_LEDGER_URL =
	'https://script.google.com/macros/s/AKfycby_p-lI7I5i4Rl1KZKgtWEhePnUmyrC9HBrS485JBWvcwWfpIWC_397P7yrcrmvIql9/exec';

/** Query-parameter name Code.gs reads the shared key from. See the note above. */
const COIN_API_KEY_PARAM = 'key';

/** Upstream calls are aborted after this long rather than hanging a function. */
const LEDGER_TIMEOUT_MS = 15_000;

export function ledgerUrl(): string {
	return env.COIN_LEDGER_URL?.trim() || DEFAULT_LEDGER_URL;
}

export function ledgerKey(): string {
	return env.COIN_API_KEY?.trim() ?? '';
}

/**
 * False until `COIN_API_KEY` is set in the environment. Every route degrades to
 * a clear "not configured" response rather than a build break or a silent
 * failure, matching how `SUPABASE_SERVICE_ROLE_KEY` is handled by the GREENLINE
 * publish endpoint.
 */
export function ledgerConfigured(): boolean {
	return ledgerKey().length > 0;
}

/**
 * Read-only actions the fully public coin leaderboard is allowed to reach with
 * no session at all. Everything here is already visible on that page today, and
 * none of it moves a balance. `getRoleQuestions` returns the application
 * questions; Code.gs withholds the answer key from that response.
 *
 * The allowlist is what stops `/api/coin-ledger/public` from being a general
 * unauthenticated proxy onto the whole ledger — which is the shape of the bug
 * this change exists to remove.
 */
export const PUBLIC_LEDGER_ACTIONS: ReadonlySet<string> = new Set([
	'contracts',
	'contractHistory',
	'getReasons',
	'getRoles',
	'getRoleQuestions'
]);

/**
 * Parameters a client may never set, whatever route it came in on: the key is
 * attached server-side, and `action` is chosen explicitly by the caller of
 * `callLedger` so a client cannot smuggle a second one in.
 */
const RESERVED_PARAMS: ReadonlySet<string> = new Set([COIN_API_KEY_PARAM, 'action']);

export type LedgerResult =
	| { ok: true; body: string }
	| { ok: false; status: number; error: string };

/**
 * Calls the ledger with `action` plus `params`, attaching the server-only key.
 *
 * Returns the upstream body verbatim as text. Callers that proxy to a browser
 * pass it straight through, so the legacy pages' `res.json()` parsing keeps
 * working unchanged; callers that need to read it parse it themselves.
 */
export async function callLedger(
	action: string,
	params: Record<string, string> = {}
): Promise<LedgerResult> {
	if (!ledgerConfigured()) {
		return {
			ok: false,
			status: 503,
			error: 'The coin ledger is not configured on this server (COIN_API_KEY is unset).'
		};
	}

	const url = new URL(ledgerUrl());
	url.searchParams.set('action', action);
	for (const [k, v] of Object.entries(params)) {
		if (RESERVED_PARAMS.has(k)) continue;
		url.searchParams.set(k, v);
	}
	url.searchParams.set(COIN_API_KEY_PARAM, ledgerKey());

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), LEDGER_TIMEOUT_MS);
	try {
		// Apps Script /exec answers with a 302 to googleusercontent.com; fetch
		// follows it by default, which is what actually returns the payload.
		const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
		const body = await res.text();
		if (!res.ok) {
			return { ok: false, status: 502, error: `The coin ledger returned ${res.status}.` };
		}
		return { ok: true, body };
	} catch {
		return { ok: false, status: 504, error: 'The coin ledger did not respond.' };
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Collects the query parameters a proxy route should forward: everything the
 * client sent except `action` (passed separately) and any attempt to set the
 * key itself. The legacy pages append cache-buster params, which ride along
 * harmlessly.
 */
export function forwardableParams(search: URLSearchParams): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [k, v] of search.entries()) {
		if (RESERVED_PARAMS.has(k)) continue;
		out[k] = v;
	}
	return out;
}

// ---------------------------------------------------------------------------
// Identity: authenticated user -> ledger roster name
// ---------------------------------------------------------------------------

/**
 * Reduces a name to comparable tokens: accents stripped, punctuation dropped,
 * lowercased, split on whitespace.
 *
 * Comparing SORTED TOKEN SETS rather than formatted strings is what makes the
 * ledger's "Last, First" roster convention line up with Google's "First Last"
 * without either side having to be reformatted, and it is insensitive to the
 * comma, to double spaces, and to which order a given sheet happens to use.
 */
export function nameTokens(name: string): string[] {
	return name
		.normalize('NFKD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, ' ')
		.split(/\s+/)
		.filter(Boolean);
}

const tokenKey = (tokens: string[]) => [...tokens].sort().join(' ');

/** Pulls a name out of a roster row whatever the sheet happens to call the column. */
export function rosterRowName(row: Record<string, unknown>): string {
	for (const k of ['Name', 'name', 'Student', 'student', 'Full Name', 'fullName', 'full_name']) {
		const v = row?.[k];
		if (typeof v === 'string' && v.trim()) return v.trim();
	}
	return '';
}

/** Pulls a section out of a roster row, same tolerance as `rosterRowName`. */
export function rosterRowSection(row: Record<string, unknown>): string {
	for (const k of ['Section', 'section', 'Class', 'class', 'Course', 'course']) {
		const v = row?.[k];
		if (typeof v === 'string' && v.trim()) return v.trim();
	}
	return '';
}

export type RosterMatch =
	| { ok: true; name: string; section: string }
	| { ok: false; reason: 'none' | 'ambiguous' };

/**
 * Resolves ONE roster entry from an authenticated user's name.
 *
 * Two passes, and no third: an exact token-set match, then a containment match
 * so a middle name present on one side and absent on the other still resolves.
 * Anything that matches zero rows or more than one row is REFUSED — the caller
 * turns that into an error the student can take to their teacher. It must never
 * fall back to a client-supplied name, because being unable to prove who is
 * applying is exactly the condition this function exists to detect.
 */
export function matchRoster(
	authenticatedName: string,
	roster: Record<string, unknown>[]
): RosterMatch {
	const mine = nameTokens(authenticatedName);
	if (mine.length < 2) return { ok: false, reason: 'none' };
	const mineKey = tokenKey(mine);
	const mineSet = new Set(mine);

	const rows = roster
		.map((row) => ({ row, name: rosterRowName(row) }))
		.filter((r) => r.name)
		.map((r) => ({ ...r, tokens: nameTokens(r.name) }));

	const exact = rows.filter((r) => tokenKey(r.tokens) === mineKey);
	const hits = exact.length
		? exact
		: rows.filter((r) => {
				if (r.tokens.length < 2) return false;
				const theirs = new Set(r.tokens);
				const subset =
					r.tokens.every((t) => mineSet.has(t)) || mine.every((t) => theirs.has(t));
				return subset;
			});

	if (hits.length === 0) return { ok: false, reason: 'none' };
	if (hits.length > 1) return { ok: false, reason: 'ambiguous' };
	return {
		ok: true,
		name: hits[0].name,
		section: rosterRowSection(hits[0].row as Record<string, unknown>)
	};
}

/** Normalizes the several shapes the ledger's roster actions answer with. */
function asRosterArray(parsed: unknown): Record<string, unknown>[] {
	if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
	if (parsed && typeof parsed === 'object') {
		const obj = parsed as Record<string, unknown>;
		for (const k of ['students', 'roster', 'data']) {
			if (Array.isArray(obj[k])) return obj[k] as Record<string, unknown>[];
		}
	}
	return [];
}

/**
 * Fetches the ledger roster server-side. `getStudents` is the management roster
 * (the sheet role applications are keyed against); `students` is the lighter
 * list the entry tool's pickers use, kept as a fallback in case a deployment
 * only exposes that one.
 */
export async function fetchRoster(): Promise<Record<string, unknown>[]> {
	for (const action of ['getStudents', 'students']) {
		const res = await callLedger(action);
		if (!res.ok) continue;
		try {
			const rows = asRosterArray(JSON.parse(res.body));
			if (rows.length) return rows;
		} catch {
			// Fall through to the next action.
		}
	}
	return [];
}
