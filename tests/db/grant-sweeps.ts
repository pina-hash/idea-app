// tests/db/grant-sweeps.ts
//
// THE TWO CATALOG SWEEPS SECTION D AND SECTION E OF tests/grant-surface.test.ts
// RECONCILE AGAINST, AND THE ONE IMPLEMENTATION OF EACH.
//
// They live here rather than inside that file because a second caller needs
// them: tests/db/grant-sequence-sweep-control.test.ts is the positive control
// that proves the sequence sweep BITES -- it grants `anon` a privilege on a
// real sequence and asserts the sweep names it. A control that ran its own copy
// of the query would prove that the copy works, which is the one thing nobody
// is worried about. CLAUDE.md: "A second implementation of a check ... is the
// thing that quietly stops matching."
//
// Neither function declares what is ALLOWED. That belongs to the allowlists in
// grant-surface.test.ts, next to the reasons somebody wrote; these two answer
// only "what does the catalog actually say", which is deliberately the half
// with no judgement in it.

import type { TestDb } from './harness';

/**
 * The three privileges a sequence can carry. USAGE is `nextval`, SELECT is
 * `currval` and reading `last_value`, UPDATE is `setval`.
 */
export const SEQUENCE_PRIVILEGES = ['usage', 'select', 'update'] as const;
export type SequencePrivilege = (typeof SEQUENCE_PRIVILEGES)[number];

export interface SeqHeld {
	readonly name: string;
	readonly role: string;
	readonly privilege: SequencePrivilege;
}

/** Every sequence privilege `role` actually holds in `public`, straight off the catalog. */
export async function sequencesHeldBy(db: TestDb, role: string): Promise<SeqHeld[]> {
	const { rows } = await db.sql<{ relname: string; privilege: string }>(
		`select c.relname, p.privilege
		   from pg_class c
		   join pg_namespace n on n.oid = c.relnamespace
		   cross join unnest($2::text[]) as p(privilege)
		  where n.nspname = 'public'
		    and c.relkind = 'S'
		    and has_sequence_privilege($1, c.oid, p.privilege)
		  order by c.relname, p.privilege`,
		[role, [...SEQUENCE_PRIVILEGES]]
	);
	return rows.map((r) => ({
		name: r.relname,
		role,
		privilege: r.privilege as SequencePrivilege
	}));
}

export const describeSeq = (h: SeqHeld) => `${h.privilege} on sequence ${h.name} (${h.role})`;

/** How many sequences exist in `public` at all -- the sweep's own denominator. */
export async function sequenceCount(db: TestDb): Promise<number> {
	const { rows } = await db.sql<{ n: number }>(
		`select count(*)::int as n
		   from pg_class c
		   join pg_namespace n on n.oid = c.relnamespace
		  where n.nspname = 'public' and c.relkind = 'S'`
	);
	return rows[0].n;
}

export interface ViewFact {
	readonly name: string;
	/** True when the view carries NO `security_invoker` reloption. */
	readonly ownerPrivileged: boolean;
}

/**
 * Every view and materialized view in `public`, with the security model read
 * off `reloptions` rather than taken from the entry that claims it.
 */
export async function viewFacts(db: TestDb): Promise<ViewFact[]> {
	const { rows } = await db.sql<{ relname: string; invoker: boolean }>(
		`select c.relname,
		        coalesce(
		          (select o = 'security_invoker=true'
		             from unnest(c.reloptions) as o
		            where o like 'security_invoker=%'
		            limit 1),
		          false) as invoker
		   from pg_class c
		   join pg_namespace n on n.oid = c.relnamespace
		  where n.nspname = 'public'
		    and c.relkind in ('v', 'm')
		  order by c.relname`
	);
	return rows.map((r) => ({ name: r.relname, ownerPrivileged: !r.invoker }));
}
