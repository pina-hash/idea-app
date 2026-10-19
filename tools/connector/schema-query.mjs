// tools/connector/schema-query.mjs
//
// LAYER 2 OF THE CONNECTOR REGISTRY, the query half: what pg_proc says about a
// list of public functions. Shared by tools/connector/schema.mjs (which writes
// src/lib/server/connector/schema.generated.json from a freshly booted full
// chain) and tests/connector-coverage.test.ts (which reads the same answer off
// the test cluster and fails when the checked-in file differs). One query, so
// the file and the check cannot disagree about what a signature is.
//
// 0416 ADDED THREE FACTS PER OVERLOAD, read off the body pg_proc holds, which
// the generated layer (tools/connector/auto.mjs) decides with: `volatility`,
// `gates` (the staff checks the body calls, tools/connector/gates.mjs) and
// `writes` (the body, or anything it calls, writes).

import { reachedGates, writers } from './gates.mjs';

/**
 * @param {(text: string, params?: unknown[]) => Promise<{ rows: any[] }>} query
 * @param {string[]} names
 */
export async function readSchema(query, names) {
	const { rows } = await query(
		`select p.proname as name,
		        p.oid::regprocedure::text as signature,
		        p.pronargs as nargs,
		        p.pronargdefaults as ndefaults,
		        p.proretset as retset,
		        pg_catalog.format_type(p.prorettype, null) as returns,
		        p.prosecdef as definer,
		        p.provolatile as volatility,
		        p.prosrc as body,
		        coalesce(pg_catalog.obj_description(p.oid, 'pg_proc'), '') as comment,
		        coalesce((
		          select json_agg(json_build_object('name', a.nm, 'type', pg_catalog.format_type(a.t, null)) order by a.ord)
		          from (
		            select u.nm, u.t, u.ord
		            from unnest(
		              coalesce(p.proallargtypes, p.proargtypes::oid[]),
		              coalesce(p.proargnames, array_fill(''::text, array[p.pronargs])),
		              coalesce(p.proargmodes, array_fill('i'::"char", array[p.pronargs]))
		            ) with ordinality as u(t, nm, md, ord)
		            where u.md in ('i', 'b', 'v')
		          ) a
		        ), '[]'::json) as args
		   from pg_catalog.pg_proc p
		   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
		  where n.nspname = 'public' and p.prokind = 'f' and p.proname = any($1::text[])
		  order by p.proname, p.oid::regprocedure::text`,
		[names]
	);
	const all = await query(
		`select p.proname as name, p.prosrc as body
		   from pg_catalog.pg_proc p
		   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
		  where n.nspname = 'public' and p.prokind = 'f'`
	);
	/** @type {Map<string, string[]>} */
	const bodies = new Map();
	for (const r of all.rows) bodies.set(r.name, [...(bodies.get(r.name) ?? []), r.body ?? '']);
	const writing = writers(bodies);
	const gated = reachedGates(bodies);
	const VOLATILITY = { i: 'immutable', s: 'stable', v: 'volatile' };
	/** @type {Record<string, any[]>} */
	const out = {};
	for (const name of [...names].sort()) out[name] = [];
	for (const r of rows) {
		const args = r.args.map((/** @type {{name: string, type: string}} */ a, /** @type {number} */ i) => ({
			name: a.name,
			type: a.type,
			has_default: i >= r.nargs - r.ndefaults
		}));
		out[r.name].push({
			signature: r.signature,
			args,
			returns: r.retset ? `setof ${r.returns}` : r.returns,
			definer: r.definer,
			comment: r.comment,
			volatility: VOLATILITY[r.volatility] ?? 'volatile',
			// Per NAME, like `writes`: what any form of it reaches.
			gates: gated.get(r.name) ?? [],
			// A function that writes nothing itself and calls nothing that does.
			// Per NAME, not per overload: the fixpoint is over names, so one
			// overload that writes makes every form of it a write.
			writes: writing.has(r.name)
		});
	}
	return out;
}
