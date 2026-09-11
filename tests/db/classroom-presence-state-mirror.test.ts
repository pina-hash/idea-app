// tests/db/classroom-presence-state-mirror.test.ts
//
// 0200: THE TYPESCRIPT `presenceState` IS A MIRROR OF
// `_classroom_presence_state_of`, AND THIS IS WHAT MAKES THAT CLAIM CHECKABLE.
//
// The repo's rule is "do not duplicate a rule", and its one sanctioned
// exception is a MIRROR -- a client-side copy of a database projection that is
// ASSERTED against the original over a corpus rather than argued to agree with
// it. `docText` against `_classroom_doc_text` is the precedent and this is the
// same arrangement.
//
// WHY A MIRROR IS NEEDED AT ALL, given the server sends a `state` in the
// payload. Because AWAY is a function of the CLOCK, not of a write: a student
// who closes the tab writes nothing, so nothing arrives to make the console
// re-read, and a console that printed the server's word would keep saying
// "Working" for a whole poll interval after they left. The browser has to be
// able to re-ask the same question at a later instant.
//
// THE CORPUS IS BUILT FROM THE WINDOWS THE DATABASE ITSELF REPORTS, and every
// case is placed relative to a boundary rather than at a round number: one
// tick inside, exactly on, one tick outside. The comparisons differ at exactly
// those points -- the SQL is strict `>` for away and non-strict `<=` for
// working -- and a corpus of comfortable middles would agree with a mirror that
// had both of them backwards.
//
// AND THE FALLBACK CONSTANTS ARE PINNED HERE TOO. `PRESENCE_LIMITS_FALLBACK` is
// what a client uses when it has not been told -- a deployment sitting before
// 0200, or a payload it could not parse -- so "not told" and "told" must be the
// same numbers wherever 0200 is applied. Nothing else in the tree can notice if
// they drift.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { startTestDb, type TestDb } from './harness';
import {
	PRESENCE_LIMITS_FALLBACK,
	PRESENCE_DISPLAY,
	PRESENCE_STATES,
	presenceState,
	type PresenceLimits,
	type PresenceState
} from '../../src/lib/classroom/presence/state';

// THE NARROWEST CHAIN THAT CAN HOLD THE FUNCTION. `_classroom_presence_state_of`
// is pure -- four arguments, no reads, no tables -- so nothing in this file
// needs a roster, an item or a student. A wider chain here would be slower and
// would prove nothing extra.
const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0086_classroom_assignment_engine.sql',
	'0095_classroom_leveled_rubrics.sql',
	'0133_classroom_storage_attachments.sql',
	'0134_classroom_submission_open_race.sql',
	'0137_anon_execute_sweep.sql'
] as const;

const read = (f: string) => readFileSync(join(process.cwd(), 'supabase', 'migrations', f), 'utf8');

let db: TestDb;
let limits: PresenceLimits;

/** The instant every case in the corpus is measured at. Pinned, never `now()`. */
const AT = Date.parse('2026-09-11T15:00:00.000Z');

interface Case {
	label: string;
	lastSeenMs: number | null;
	lastInputMs: number | null;
	pageVisible: boolean;
}

function iso(ms: number | null): string | null {
	return ms === null ? null : new Date(ms).toISOString();
}

beforeAll(async () => {
	db = await startTestDb(CHAIN);
	await db.sql(read('0200_classroom_presence.sql'));
	const { rows } = await db.sql<{
		input_window_seconds: number;
		away_window_seconds: number;
		heartbeat_seconds: number;
		min_gap_seconds: number;
		retention_days: number;
	}>(
		`select
			extract(epoch from public._classroom_presence_input_window())::integer as input_window_seconds,
			extract(epoch from public._classroom_presence_away_window())::integer as away_window_seconds,
			extract(epoch from public._classroom_presence_heartbeat())::integer as heartbeat_seconds,
			extract(epoch from public._classroom_presence_min_gap())::integer as min_gap_seconds,
			extract(day from public._classroom_presence_retention())::integer as retention_days`
	);
	limits = {
		inputWindowSeconds: rows[0].input_window_seconds,
		awayWindowSeconds: rows[0].away_window_seconds,
		heartbeatSeconds: rows[0].heartbeat_seconds,
		minGapSeconds: rows[0].min_gap_seconds,
		retentionDays: rows[0].retention_days
	};
});

afterAll(async () => {
	await db?.stop();
});

function corpus(): Case[] {
	const away = limits.awayWindowSeconds * 1000;
	const input = limits.inputWindowSeconds * 1000;
	const cases: Case[] = [];

	// THE AWAY BOUNDARY, three cases around it, at both visibilities, with input
	// both fresh and stale -- so the ordering ("away outranks everything") is
	// exercised rather than assumed.
	for (const [name, delta] of [
		['one second inside the away window', away - 1000],
		['exactly on the away window', away],
		['one second past the away window', away + 1000]
	] as const) {
		for (const visible of [true, false]) {
			for (const [inputName, inputDelta] of [
				['fresh input', 1000],
				['stale input', input + 60_000],
				['no input at all', null]
			] as const) {
				cases.push({
					label: `${name}, ${visible ? 'visible' : 'hidden'}, ${inputName}`,
					lastSeenMs: AT - delta,
					lastInputMs: inputDelta === null ? null : AT - inputDelta,
					pageVisible: visible
				});
			}
		}
	}

	// THE INPUT BOUNDARY, three cases around it, inside the away window so the
	// working/viewing split is what decides.
	for (const [name, delta] of [
		['one second inside the input window', input - 1000],
		['exactly on the input window', input],
		['one second past the input window', input + 1000]
	] as const) {
		for (const visible of [true, false]) {
			cases.push({
				label: `${name}, ${visible ? 'visible' : 'hidden'}`,
				lastSeenMs: AT - 1000,
				lastInputMs: AT - delta,
				pageVisible: visible
			});
		}
	}

	// THE CORNERS. A row with no stamps at all, and input stamped AFTER the
	// instant being asked about (which a clock skew between a student's browser
	// and the database can genuinely produce).
	cases.push({
		label: 'no last_seen at all',
		lastSeenMs: null,
		lastInputMs: null,
		pageVisible: true
	});
	cases.push({
		label: 'input stamped in the future (clock skew)',
		lastSeenMs: AT - 1000,
		lastInputMs: AT + 5000,
		pageVisible: true
	});
	cases.push({
		label: 'seen in the future (clock skew)',
		lastSeenMs: AT + 5000,
		lastInputMs: AT + 5000,
		pageVisible: true
	});
	return cases;
}

describe('the browser mirror answers exactly what the database answers', () => {
	test('the deployment reports the windows the fallback constants carry', () => {
		// If these ever differ, every client that could not reach `limits` is
		// deriving states from the wrong numbers -- silently, because a wrong
		// window still produces one of the four valid answers.
		expect(limits).toEqual(PRESENCE_LIMITS_FALLBACK);
	});

	test('every case in the corpus agrees, and the corpus is not empty', async () => {
		const cases = corpus();
		// THE CASE COUNT IS ASSERTED, so a corpus that generated nothing cannot
		// pass as agreement.
		expect(cases.length).toBe(3 * 2 * 3 + 3 * 2 + 3);
		expect(cases.length).toBe(27);

		const { rows } = await db.sql<{ i: number; state: PresenceState }>(
			`select i, public._classroom_presence_state_of(
				case when a is null then null else a::timestamptz end,
				case when b is null then null else b::timestamptz end,
				c, $2::timestamptz
			) as state
			from unnest($1::jsonb[]) with ordinality as u(j, i),
			lateral (select j->>'a' as a, j->>'b' as b, (j->>'c')::boolean as c) v
			order by i`,
			[
				cases.map((c) =>
					JSON.stringify({
						a: iso(c.lastSeenMs),
						b: iso(c.lastInputMs),
						c: c.pageVisible
					})
				),
				new Date(AT).toISOString()
			]
		);
		expect(rows).toHaveLength(cases.length);

		const disagreements: string[] = [];
		rows.forEach((row, index) => {
			const c = cases[index];
			const mine = presenceState(
				{
					last_seen_at: iso(c.lastSeenMs),
					last_input_at: iso(c.lastInputMs),
					page_visible: c.pageVisible
				},
				AT,
				limits
			);
			if (mine !== row.state) {
				disagreements.push(`${c.label}: sql=${row.state} ts=${mine}`);
			}
		});
		expect(disagreements).toEqual([]);

		// AND THE CORPUS REACHES ALL FOUR ANSWERS. Twenty-seven cases that all
		// came back 'away' would agree perfectly and prove nothing.
		expect([...new Set(rows.map((r) => r.state))].sort()).toEqual([
			'away',
			'open-elsewhere',
			'viewing',
			'working'
		]);
	});

	test('a deliberately wrong mirror is caught -- the negative control', async () => {
		// If the corpus could not tell a broken mirror from a correct one, the
		// assertion above would be about nothing. Swapping the two comparisons is
		// the exact mistake a hand-written mirror makes.
		const broken = (c: Case): PresenceState => {
			const seen = c.lastSeenMs;
			if (seen === null) return 'away';
			// `>=` where the SQL is `>`.
			if (AT - seen >= limits.awayWindowSeconds * 1000) return 'away';
			if (!c.pageVisible) return 'open-elsewhere';
			const input = c.lastInputMs;
			// `<` where the SQL is `<=`.
			if (input !== null && AT - input < limits.inputWindowSeconds * 1000) return 'working';
			return 'viewing';
		};
		const cases = corpus();
		const { rows } = await db.sql<{ i: number; state: PresenceState }>(
			`select i, public._classroom_presence_state_of(
				case when a is null then null else a::timestamptz end,
				case when b is null then null else b::timestamptz end,
				c, $2::timestamptz
			) as state
			from unnest($1::jsonb[]) with ordinality as u(j, i),
			lateral (select j->>'a' as a, j->>'b' as b, (j->>'c')::boolean as c) v
			order by i`,
			[
				cases.map((c) =>
					JSON.stringify({
						a: iso(c.lastSeenMs),
						b: iso(c.lastInputMs),
						c: c.pageVisible
					})
				),
				new Date(AT).toISOString()
			]
		);
		const misses = rows.filter((row, index) => broken(cases[index]) !== row.state);
		expect(misses.length).toBeGreaterThan(0);
	});
});

describe('the vocabulary is complete', () => {
	test('every state the SQL can answer has a word, a glyph and a tone', () => {
		// A fifth state added to the SQL with no entry here renders an empty chip,
		// which throws nothing and type-checks. This is what notices.
		for (const state of PRESENCE_STATES) {
			const display = PRESENCE_DISPLAY[state];
			expect(display.label.length).toBeGreaterThan(0);
			expect(display.glyph.length).toBeGreaterThan(0);
			expect(display.hint.length).toBeGreaterThan(0);
		}
		expect(Object.keys(PRESENCE_DISPLAY).sort()).toEqual([...PRESENCE_STATES].sort());
	});

	test('no two states share a glyph or a word', () => {
		// Colour is never the only signal, which means the OTHER two signals have
		// to be signals: two states sharing a glyph is a mark that says nothing.
		const glyphs = PRESENCE_STATES.map((s) => PRESENCE_DISPLAY[s].glyph);
		const labels = PRESENCE_STATES.map((s) => PRESENCE_DISPLAY[s].label);
		expect(new Set(glyphs).size).toBe(PRESENCE_STATES.length);
		expect(new Set(labels).size).toBe(PRESENCE_STATES.length);
	});

	test('the SQL cannot answer anything outside the union', async () => {
		// Read off the function's own text rather than inferred from the corpus: a
		// branch the corpus happens not to reach would be invisible to it.
		const { rows } = await db.sql<{ src: string }>(
			`select p.prosrc as src from pg_proc p
			 join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public' and p.proname = '_classroom_presence_state_of'`
		);
		const quoted = [...rows[0].src.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
		expect([...new Set(quoted)].sort()).toEqual([...PRESENCE_STATES].sort());
	});
});
