// tools/connector/schema-query.mjs
//
// LAYER 2 OF THE CONNECTOR REGISTRY, the query half: what pg_proc says about a
// list of public functions. Shared by tools/connector/schema.mjs (which writes
// src/lib/server/connector/schema.generated.json from a freshly booted full
// chain) and tests/connector-coverage.test.ts (which reads the same answer off
// the test cluster and fails when the checked-in file differs). One query, so
// the file and the check cannot disagree about what a signature is.

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
			comment: r.comment
		});
	}
	return out;
}
