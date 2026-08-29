// tests/db/postgrest-shim.ts
//
// A Supabase-client stand-in over the embedded-Postgres harness, faithful in
// the ONE respect that matters for the bug it exists to catch: it resolves an
// embedded resource by looking for a real FOREIGN KEY in the real catalog, and
// answers PGRST200 when there is none -- exactly as PostgREST does when it
// builds its schema cache.
//
// WHY THAT IS THE WHOLE POINT. A select string like
// `notebook_entries?select=...,notebook_sessions(...)` is not just a column
// list; it is an assertion about the shape of the schema, and nothing in
// TypeScript, svelte-check or an SQL-level test can see it go stale. 0098
// repointed the composite key `notebook_entries` carried to
// `notebook_sessions` at `notebook_session_postings` instead, which left no key
// between the first two tables at all. Every existing suite stayed green: they
// talk SQL, and SQL does not need a foreign key to join. Only something that
// resolves embeds the way PostgREST resolves them can notice.
//
// A shim that simply translated an embed into a JOIN would have stayed green
// too, and proved nothing. So the FK lookup below is deliberately the strict
// part, and everything else -- the SQL it builds, the filters it supports -- is
// only as much as the loads under test actually use. Anything else THROWS
// rather than guessing, so a query that grows past what this models fails
// loudly instead of quietly testing something other than what ships.
//
// RLS is real: every read runs through the harness's asUser, so the connection
// is `authenticated` with request.jwt.claims set, and an embedded resource's
// own policies apply inside its subquery just as PostgREST applies them.
//
// AN RPC IS THE SAME ARGUMENT ONE CALL SHAPE OVER. PostgREST answers a
// SET-RETURNING function with an ARRAY of row objects and a scalar one with the
// value; this file called every function the scalar way for its whole life,
// which collapsed a `returns table` result to its first row and handed that row
// back as a composite. `routineShape` below reads `proretset` from the catalog
// so the shape is the database's answer rather than a list anybody maintains.

import type { QueryFn, TestDb } from './harness';

interface ForeignKey {
	srcTable: string;
	srcCols: string[];
	tgtTable: string;
	tgtCols: string[];
}

export interface ShimError {
	code: string;
	message: string;
}

/** One parsed piece of a select string: a plain column, or an embedded resource. */
type SelectNode =
	| { kind: 'column'; name: string }
	| { kind: 'embed'; name: string; table: string; inner: SelectNode[]; inner_join: boolean };

/**
 * Splits at commas that are OUTSIDE parentheses, so an embed's own column list
 * stays with it.
 */
function splitTopLevel(select: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let current = '';
	for (const ch of select) {
		if (ch === '(') depth++;
		if (ch === ')') depth--;
		if (ch === ',' && depth === 0) {
			out.push(current);
			current = '';
			continue;
		}
		current += ch;
	}
	out.push(current);
	return out.map((s) => s.trim()).filter(Boolean);
}

export function parseSelect(select: string): SelectNode[] {
	return splitTopLevel(select).map((token) => {
		const open = token.indexOf('(');
		if (open === -1) return { kind: 'column', name: token.trim() } as const;
		const close = token.lastIndexOf(')');
		if (close < open) throw new Error(`Unbalanced parentheses in select: ${token}`);
		// `name`, `name!inner`, `name!fk_name` -- the hint after `!` is either the
		// inner-join marker or a disambiguating constraint name -- and
		// `alias:name`, which is how a select names the SAME table twice. The
		// classroom item read does exactly that (`posted_in:classroom_postings
		// !inner`, so the section filter can restrict the parent rows without
		// trimming the unaliased posting LIST beside it), so an alias that parsed
		// as part of the table name meant that read resolved to nothing at all.
		const head = token.slice(0, open).trim();
		const [named, ...hints] = head.split('!').map((s) => s.trim());
		const colon = named.indexOf(':');
		const alias = colon === -1 ? named : named.slice(0, colon).trim();
		const table = colon === -1 ? named : named.slice(colon + 1).trim();
		return {
			kind: 'embed',
			name: alias,
			table,
			inner: parseSelect(token.slice(open + 1, close)),
			inner_join: hints.includes('inner')
		} as const;
	});
}

/** Every embedded table named anywhere in a select string, in order. */
export function embeddedTables(select: string): string[] {
	const out: string[] = [];
	const walk = (nodes: SelectNode[]) => {
		for (const node of nodes) {
			if (node.kind !== 'embed') continue;
			out.push(node.table);
			walk(node.inner);
		}
	};
	walk(parseSelect(select));
	return out;
}

/** Loads every public-schema foreign key, the way PostgREST loads its cache. */
export async function loadForeignKeys(db: TestDb): Promise<ForeignKey[]> {
	const { rows } = await db.sql<{
		src_table: string;
		tgt_table: string;
		src_cols: string[];
		tgt_cols: string[];
	}>(`
		select
			src.relname as src_table,
			tgt.relname as tgt_table,
			(select array_agg(a.attname order by k.ord)
			   from unnest(c.conkey) with ordinality k(attnum, ord)
			   join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)::text[] as src_cols,
			(select array_agg(a.attname order by k.ord)
			   from unnest(c.confkey) with ordinality k(attnum, ord)
			   join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum)::text[] as tgt_cols
		from pg_constraint c
		join pg_class src on src.oid = c.conrelid
		join pg_class tgt on tgt.oid = c.confrelid
		join pg_namespace n on n.oid = src.relnamespace
		where c.contype = 'f' and n.nspname = 'public'
	`);
	return rows.map((r) => ({
		srcTable: r.src_table,
		srcCols: r.src_cols,
		tgtTable: r.tgt_table,
		tgtCols: r.tgt_cols
	}));
}

/**
 * What SHAPE PostgREST answers a call to `name` with, read from the REAL
 * catalog rather than from a list somebody maintains.
 *
 * PostgREST issues `select * from f(...)` for a SET-RETURNING function and
 * answers with an ARRAY of row objects; for a scalar-returning one it issues
 * `select f(...)` and answers with the single value. Calling EVERY function
 * the scalar way -- which this shim did until this was fixed -- is wrong twice
 * over for a `returns table` function: it collapses the whole set to its first
 * row, AND it wraps that row in a COMPOSITE (node-postgres hands one back as
 * the raw `(a,b,c)` string) instead of the named columns a client receives. A
 * test built on that hands the code under test a shape production never
 * produces, and every assertion over it is an assertion about the fixture.
 *
 * The three answers:
 *
 *   - `proretset = false` -> a scalar. `select f(...) as result`.
 *   - `proretset = true` and the function has OUT/TABLE columns, or returns a
 *     composite type -> an array of row objects. `select * from f(...)`.
 *   - `proretset = true` and it returns a bare `setof <scalar>` -> PostgREST
 *     answers an array of VALUES, not of objects, and `select *` cannot
 *     produce that (it names the single column after the function). NO
 *     function in the migrations is this shape, so it THROWS rather than being
 *     modelled wrong -- the same choice every other unsupported query in this
 *     file makes, and the reason is the same: a shim more permissive than the
 *     real thing does not fail loudly, it certifies a bug.
 *
 * IT CANNOT GO STALE, because nothing here names a function. A `returns table`
 * migration written next week is covered the moment it applies; a function
 * whose return shape changes changes this answer in the same statement. A
 * pinned list is exactly the thing that would have to be remembered, and
 * `proretset` is a fact the database already keeps.
 *
 * OVERLOADS ARE READ TOGETHER AND A DISAGREEMENT THROWS. The signature trap
 * (see CLAUDE.md) leaves real overload PAIRS standing in this schema, so a
 * name can resolve to more than one row here. Every such pair today agrees
 * about its shape -- an overload is created by adding a PARAMETER, not by
 * changing what the function returns -- and if one ever does not, PostgREST
 * would resolve one of them by argument name and this shim has no way to tell
 * which. Guessing there would be the certified bug again.
 */
export interface RoutineShape {
	/** `proretset`: PostgREST answers an array. */
	set: boolean;
	/** The rows are objects with named columns rather than bare values. */
	rowObjects: boolean;
}

export async function routineShape(db: TestDb, name: string): Promise<RoutineShape | null> {
	const { rows } = await db.sql<{ is_set: boolean; row_objects: boolean }>(
		`select p.proretset as is_set,
		        (t.typtype = 'c' or coalesce(p.proargmodes, '{}'::"char"[]) && '{o,b,t}'::"char"[])
		          as row_objects
		   from pg_proc p
		   join pg_type t on t.oid = p.prorettype
		   join pg_namespace n on n.oid = p.pronamespace
		  where n.nspname = 'public' and p.prokind = 'f' and p.proname = $1`,
		[name]
	);
	if (rows.length === 0) return null;
	const sets = new Set(rows.map((r) => r.is_set));
	const objects = new Set(rows.map((r) => r.row_objects));
	if (sets.size > 1 || objects.size > 1) {
		throw new Error(
			`Overloads of public.${name} disagree about their result shape. PostgREST would ` +
				`resolve one of them by argument name; this shim cannot tell which, and will not guess.`
		);
	}
	return { set: rows[0].is_set, rowObjects: rows[0].row_objects };
}

export type Relationship =
	| { kind: 'many-to-one'; fk: ForeignKey }
	| { kind: 'one-to-many'; fk: ForeignKey }
	| null;

/**
 * How PostgREST would embed `child` inside `parent`, or null when it could not.
 *
 * A key FROM the parent is a many-to-one (one embedded object); a key TO the
 * parent is a one-to-many (an array). Nothing else counts -- notably, two
 * tables that merely both point at a third are NOT related for embedding
 * purposes, which is exactly the state 0098 left notebook_entries and
 * notebook_sessions in.
 */
export function relationshipBetween(
	fks: readonly ForeignKey[],
	parent: string,
	child: string
): Relationship {
	const outgoing = fks.find((f) => f.srcTable === parent && f.tgtTable === child);
	if (outgoing) return { kind: 'many-to-one', fk: outgoing };
	const incoming = fks.find((f) => f.srcTable === child && f.tgtTable === parent);
	if (incoming) return { kind: 'one-to-many', fk: incoming };
	return null;
}

class UnresolvableEmbed extends Error {
	constructor(
		readonly parent: string,
		readonly child: string
	) {
		super(
			`Could not find a relationship between '${parent}' and '${child}' in the schema cache`
		);
	}
}

/** Renders one level of a select into a list of `expr as "alias"` fragments. */
function projection(
	fks: readonly ForeignKey[],
	table: string,
	alias: string,
	nodes: SelectNode[],
	depth: number,
	/**
	 * Filters written against an EMBEDDED resource (`.eq('posted_in.section_id',
	 * x)`), keyed by the embed's own alias. PostgREST applies these to the
	 * embedded rows, and -- because the embed is `!inner` -- that restricts the
	 * parent rows too. Both halves are applied below, so a parent with no
	 * matching child drops out exactly as it does in production.
	 */
	embedFilters: Record<string, Filter[]> = {},
	/** ONE shared, mutable list, so placeholder numbers stay sequential. */
	params: unknown[] = []
): { fields: string[]; jsonArgs: string[]; innerJoins: string[] } {
	const fields: string[] = [];
	const jsonArgs: string[] = [];
	const innerJoins: string[] = [];

	for (const node of nodes) {
		if (node.kind === 'column') {
			// PostgREST's json-arrow projection (`prompt->>material`,
			// `prompt->demo`): the result flattens onto the row under the KEY's
			// own name, per the Speedrun list loader's own doc comment. `->>`
			// extracts text, `->` extracts jsonb; only the operator differs.
			const arrow = node.name.match(/^([a-z_][a-z0-9_]*)(->>?)([a-z_][a-z0-9_]*)$/i);
			if (arrow) {
				const [, column, op, key] = arrow;
				const expr = `${alias}.${quote(column)} ${op} '${key}'`;
				fields.push(`${expr} as ${quote(key)}`);
				jsonArgs.push(`'${key}', ${expr}`);
				continue;
			}
			fields.push(`${alias}.${quote(node.name)} as ${quote(node.name)}`);
			jsonArgs.push(`'${node.name}', ${alias}.${quote(node.name)}`);
			continue;
		}

		const rel = relationshipBetween(fks, table, node.table);
		if (!rel) throw new UnresolvableEmbed(table, node.name);

		const childAlias = `e${depth}_${fields.length}`;
		const child = projection(fks, node.table, childAlias, node.inner, depth + 1, embedFilters, params);
		const on =
			rel.kind === 'many-to-one'
				? rel.fk.srcCols
						.map((c, i) => `${childAlias}.${quote(rel.fk.tgtCols[i])} = ${alias}.${quote(c)}`)
						.join(' and ')
				: rel.fk.srcCols
						.map((c, i) => `${childAlias}.${quote(c)} = ${alias}.${quote(rel.fk.tgtCols[i])}`)
						.join(' and ');
		// A filter written against this embed narrows the embedded rows AND, via
		// the inner join below, the parent rows.
		const own = embedFilters[node.name] ?? [];
		const extra = own.map((f) => {
			params.push(f.value);
			return f.op === 'in'
				? `${childAlias}.${quote(f.column)} = any($${params.length})`
				: f.op === 'lte'
					? `${childAlias}.${quote(f.column)} <= $${params.length}`
					: `${childAlias}.${quote(f.column)} = $${params.length}`;
		});
		const where = [on, ...extra].join(' and ');

		const object = `json_build_object(${child.jsonArgs.join(', ')})`;
		const expr =
			rel.kind === 'many-to-one'
				? `(select ${object} from public.${quote(node.table)} ${childAlias} where ${where} limit 1)`
				: `(select coalesce(json_agg(${object}), '[]'::json)
				      from public.${quote(node.table)} ${childAlias} where ${where})`;

		fields.push(`${expr} as ${quote(node.name)}`);
		jsonArgs.push(`'${node.name}', ${expr}`);
		if (node.inner_join) {
			innerJoins.push(
				`exists (select 1 from public.${quote(node.table)} ${childAlias}_x where ${where.replaceAll(
					`${childAlias}.`,
					`${childAlias}_x.`
				)})`
			);
		}
		innerJoins.push(...child.innerJoins);
	}

	return { fields, jsonArgs, innerJoins };
}

function quote(identifier: string): string {
	if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
		throw new Error(`Refusing to quote an unexpected identifier: ${identifier}`);
	}
	return `"${identifier}"`;
}

interface Filter {
	column: string;
	op: 'eq' | 'in' | 'is' | 'not.is' | 'lte';
	value: unknown;
}

/**
 * WHO THE CALL RUNS AS, and `null` is a real answer rather than a missing one.
 *
 * A signed-in caller is `db.asUser` -- role `authenticated`, `request.jwt.claims`
 * set -- which is what every load in this repo is driven as and what this file
 * modelled for its whole life. But a SIGNED-OUT visitor is not that caller with
 * a field left blank: PostgREST hands an unauthenticated request to the `anon`
 * role, which holds a strictly different set of EXECUTE grants (0137 is the
 * migration whose entire subject is that difference), and `auth.uid()` is null
 * inside every definer function it reaches.
 *
 * So a public surface cannot be driven faithfully by passing some student's id
 * and hoping the body does not look: the grant is checked before the body runs,
 * and it is the grant that a public read's exposure actually turns on. `null`
 * routes through `db.asAnon`, which is `set role anon` with no claims at all.
 *
 * ONE helper rather than a branch at each of the three call sites, for the
 * ordinary reason: three spellings of "who is this" is what stops agreeing.
 */
function runAs<T>(db: TestDb, userId: string | null, fn: (q: QueryFn) => Promise<T>): Promise<T> {
	return userId === null ? db.asAnon(fn) : db.asUser(userId, fn);
}

/**
 * The builder. Supports exactly what the loads under test call and throws on
 * anything else, so this can never drift into modelling a query that does not
 * ship.
 */
class Query implements PromiseLike<{ data: unknown; error: ShimError | null }> {
	private filters: Filter[] = [];
	private orderBy: { column: string; ascending: boolean } | null = null;
	private limitTo: number | null = null;
	private singleRow = false;

	constructor(
		private readonly db: TestDb,
		private readonly fks: readonly ForeignKey[],
		private readonly userId: string | null,
		private readonly table: string,
		private readonly select: string
	) {}

	eq(column: string, value: unknown) {
		this.filters.push({ column, op: 'eq', value });
		return this;
	}

	in(column: string, values: unknown[]) {
		this.filters.push({ column, op: 'in', value: values });
		return this;
	}

	/**
	 * PostgREST's `lte`, a plain `<=` bound. Added for the classroom check-in
	 * date bound (`notebook_sessions.session_date`), which used to be a row
	 * filter applied AFTER the fetch specifically because this shim had no
	 * `.lte()` to prove a query-level bound through -- see the doc comment at
	 * `sectionCheckIns` in `+layout.server.ts`. A bare comparison operator
	 * needs no `IS`-style operand narrowing the way `.is()` does; the column
	 * and value are typed by whatever the caller sends, exactly like `.eq()`.
	 */
	lte(column: string, value: unknown) {
		this.filters.push({ column, op: 'lte', value });
		return this;
	}

	/**
	 * PostgREST's `is`, which is how a null test is expressed over the wire --
	 * `.is('deleted_at', null)` is the soft-delete exclusion every notebook read
	 * carries since 0116.
	 *
	 * It takes the `IS` operator's three real operands and refuses anything else,
	 * because a shim that quietly accepted `.is(col, 'something')` would be
	 * modelling a query PostgREST does not answer. A filter on a column that does
	 * not exist still falls through to the SQL error below, which is exactly what
	 * a project sitting between two hand-applied migrations produces -- and what
	 * the loads' degrade paths are written against.
	 */
	is(column: string, value: null | boolean) {
		if (value !== null && typeof value !== 'boolean') {
			throw new Error(`Unsupported .is() operand: ${String(value)}`);
		}
		this.filters.push({ column, op: 'is', value });
		return this;
	}

	/**
	 * PostgREST's negated filter, `.not(column, 'is', value)` -- the mirror of
	 * `.is()` above, and needed for exactly the case `.is()` was added for: a
	 * soft-deletion read that wants the OPPOSITE of the exclusion every other
	 * notebook query carries (0117's own "the caller's DELETED entries").
	 * `is`/`not.is` are the only two `.not()` shapes any load under test uses;
	 * anything else throws rather than being silently modelled wrong.
	 */
	not(column: string, operator: 'is', value: null | boolean) {
		if (operator !== 'is') {
			throw new Error(`Unsupported .not() operator: ${String(operator)}`);
		}
		if (value !== null && typeof value !== 'boolean') {
			throw new Error(`Unsupported .not() operand: ${String(value)}`);
		}
		this.filters.push({ column, op: 'not.is', value });
		return this;
	}

	order(column: string, opts?: { ascending?: boolean; referencedTable?: string }) {
		// An order scoped to an embedded resource orders rows INSIDE that
		// resource; every caller here re-sorts in JS afterwards, so it is
		// deliberately a no-op rather than a guess.
		if (opts?.referencedTable) return this;
		this.orderBy = { column, ascending: opts?.ascending !== false };
		return this;
	}

	limit(n: number) {
		this.limitTo = n;
		return this;
	}

	maybeSingle() {
		this.singleRow = true;
		return this;
	}

	/**
	 * PostgREST's `.single()`: identical to `.maybeSingle()` for this shim's
	 * purposes -- neither models the "exactly one row or PGRST116" distinction,
	 * because nothing under test reads the error code either call would set on
	 * a missing row. A caller wanting that distinction needs a shim change that
	 * actually models it, not a second alias.
	 */
	single() {
		this.singleRow = true;
		return this;
	}

	private async run(): Promise<{ data: unknown; error: ShimError | null }> {
		let sql: string;
		const params: unknown[] = [];
		try {
			// A filter naming `alias.column` belongs to that EMBED, not to this
			// table -- `.eq('posted_in.section_id', x)` is how the classroom item
			// read scopes itself to one class.
			const embedFilters: Record<string, Filter[]> = {};
			const ownFilters: Filter[] = [];
			for (const filter of this.filters) {
				const dot = filter.column.indexOf('.');
				if (dot === -1) {
					ownFilters.push(filter);
					continue;
				}
				const alias = filter.column.slice(0, dot);
				(embedFilters[alias] ??= []).push({
					...filter,
					column: filter.column.slice(dot + 1)
				});
			}
			const { jsonArgs, innerJoins } = projection(
				this.fks,
				this.table,
				't',
				parseSelect(this.select),
				0,
				embedFilters,
				params
			);
			const where: string[] = [...innerJoins];
			for (const filter of ownFilters) {
				if (filter.op === 'is' || filter.op === 'not.is') {
					// No parameter: `is null` / `is true` / `is false` (and their
					// negations) are operators over a literal, not a comparison
					// against a bound value.
					const operand =
						filter.value === null ? 'null' : filter.value === true ? 'true' : 'false';
					const verb = filter.op === 'not.is' ? 'is not' : 'is';
					where.push(`t.${quote(filter.column)} ${verb} ${operand}`);
					continue;
				}
				params.push(filter.value);
				where.push(
					filter.op === 'eq'
						? `t.${quote(filter.column)} = $${params.length}`
						: filter.op === 'lte'
							? `t.${quote(filter.column)} <= $${params.length}`
							: `t.${quote(filter.column)} = any($${params.length})`
				);
			}
			// ONE json object per row, not a column list: PostgREST answers JSON
			// over the wire, so a timestamptz reaches the load as an ISO STRING
			// (which is what NotebookEntry types it as), never a Date the driver
			// happened to parse. Selecting the row any other way would hand the
			// code under test values it will never see in production.
			sql =
				`select json_build_object(${jsonArgs.join(', ')}) as row` +
				` from public.${quote(this.table)} t` +
				(where.length ? ` where ${where.join(' and ')}` : '') +
				(this.orderBy
					? ` order by t.${quote(this.orderBy.column)} ${this.orderBy.ascending ? 'asc' : 'desc'}`
					: '') +
				(this.limitTo !== null ? ` limit ${this.limitTo}` : '');
		} catch (error) {
			if (error instanceof UnresolvableEmbed) {
				// PostgREST's own code for an embed it cannot resolve.
				return { data: null, error: { code: 'PGRST200', message: error.message } };
			}
			throw error;
		}

		try {
			const rows = await runAs(this.db, this.userId, async (q) =>
				(await q<{ row: unknown }>(sql, params)).rows.map((r) => r.row)
			);
			if (this.singleRow) return { data: rows[0] ?? null, error: null };
			return { data: rows, error: null };
		} catch (error) {
			const message = (error as Error).message;
			// A missing table or column is what a project sitting between two
			// hand-applied migrations actually produces.
			return { data: null, error: { code: '42P01', message } };
		}
	}

	then<R1 = { data: unknown; error: ShimError | null }, R2 = never>(
		onfulfilled?:
			| ((value: { data: unknown; error: ShimError | null }) => R1 | PromiseLike<R1>)
			| null,
		onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
	): PromiseLike<R1 | R2> {
		return this.run().then(onfulfilled, onrejected);
	}
}

/**
 * PostgREST's answer for a function call that RAISED, which is two different
 * answers and used to be one.
 *
 * THE CONFLATION THIS REPLACES. Every throw out of an RPC call came back as
 * `PGRST202`, so a function that does not exist and a live function raising
 * `P0001` were indistinguishable through this fixture. That is not a cosmetic
 * gap: `PGRST202` is the one code this codebase DEGRADES on, deliberately and
 * on that code ALONE (`$lib/server/admin.ts`, `$lib/classroom/transports.ts`,
 * `$lib/gauntlet/knowledge-clock.ts`, the short-link and reference loads), and
 * the rule exists so a runtime error inside a function fails CLOSED instead of
 * falling through to a weaker path. A fixture that answers `PGRST202` for a
 * refusal makes that rule untestable in the one direction that matters: a
 * mutant degrading on ANY error passed all ten database-driven assertions of
 * the roster read, because through this shim there was no other error to have.
 *
 * WHAT POSTGREST ACTUALLY DOES. A call it cannot resolve against its schema
 * cache -- no such function, or no overload matching the named arguments --
 * is a 404 carrying `PGRST202`. A call that RESOLVED and then raised is
 * reported with the SQLSTATE as the code: `P0001` for a `raise exception`,
 * `42501` for a permission denial, class 23 for a constraint. Postgres itself
 * draws exactly that line, so the discriminator is the driver's own SQLSTATE
 * (`42883`, undefined_function) rather than anything this file decides.
 *
 * SO THE SHIM DOES NOT CLASSIFY, IT REPORTS. Passing the SQLSTATE through is
 * what makes `$lib/pg-errors`' transient/refusal partition -- which reads
 * `23505`, `40001`, `40P01` and friends off exactly this field -- reachable
 * from a database test at all; a whitelist here would be a second copy of that
 * partition, in the fixture, able to stop agreeing with the one that ships.
 *
 * A THROW WITH NO SQLSTATE IS NOT A DATABASE ANSWER and must not be dressed as
 * one. That is a driver or fixture failure, and it rethrows -- the same choice
 * `routineShape`'s two guards above make, and for the same reason.
 */
function rpcError(error: unknown): ShimError {
	const code = (error as { code?: unknown } | null)?.code;
	if (typeof code !== 'string') throw error;
	const message = (error as Error).message;
	// PostgREST resolves against a schema cache, so a name it does not hold and
	// a name whose arguments match no overload are ONE answer. Postgres raises
	// `42883` for both.
	return { code: code === '42883' ? 'PGRST202' : code, message };
}

/**
 * A client for one caller. `userId` is a signed-in user's id, or NULL for a
 * signed-out visitor -- see `runAs` above for why that is a different role and
 * not merely a missing claim. `fks` is a snapshot of the catalog taken once,
 * the same way PostgREST caches it -- reload it if a test changes the schema
 * mid-run.
 */
export function createPostgrestShim(
	db: TestDb,
	fks: readonly ForeignKey[],
	userId: string | null
) {
	return {
		from(table: string) {
			return {
				select(select: string) {
					return new Query(db, fks, userId, table, select);
				}
			};
		},
		/**
		 * A function call in NAMED notation, which is what PostgREST does: it
		 * matches the JSON body's keys to the function's parameter names rather
		 * than to their positions. Building it the same way is what lets a test
		 * catch a caller that named a parameter the shipped function does not
		 * have -- exactly the failure the 0096 signature trap describes, where a
		 * defaulted trailing parameter leaves two overloads and the call stops
		 * resolving.
		 */
		async rpc(name: string, args?: Record<string, unknown>) {
			const entries = Object.entries(args ?? {});
			const call = entries.length
				? `public.${quote(name)}(${entries
						.map(([key], i) => `${quote(key)} => $${i + 1}`)
						.join(', ')})`
				: `public.${quote(name)}()`;
			const values = entries.map(([, v]) => v);

			// OUTSIDE the try: an overload disagreement and an unmodelled
			// set-of-scalars are defects in this fixture, not answers PostgREST
			// gives, and reporting either as an error at all would put a test on
			// the degrade path of whatever load it is driving.
			const shape = await routineShape(db, name);
			if (shape?.set && !shape.rowObjects) {
				throw new Error(
					`public.${name} returns a set of bare scalars. PostgREST answers an array of ` +
						`VALUES for that, which this shim does not model -- see routineShape().`
				);
			}

			try {
				if (shape?.set) {
					// ONE json array, not the driver's own row objects, for exactly
					// the reason the `from()` path builds json_build_object: PostgREST
					// answers JSON over the wire, so a timestamptz reaches the load as
					// an ISO STRING and a bigint as a NUMBER. node-postgres would hand
					// back a Date and a string respectively, which is not what the
					// code under test will ever see in production.
					// The `coalesce` is what makes an EMPTY set an empty ARRAY rather
					// than null -- and null is what a MISSING function looks like, so
					// without it a load could not tell "nobody is on this roster" from
					// "this RPC is not applied yet". There is no JS fallback beside it
					// on purpose: an aggregate over zero rows still returns exactly one
					// row, so a `?? []` here would be a branch nothing can ever reach
					// and no mutation could ever kill.
					// THE AGGREGATE IS TAKEN OVER `select * from f(...)`, NEVER OVER
					// `from f(...) r` DIRECTLY, and the difference is invisible until
					// exactly one function in the schema meets it. A `returns table`
					// with TWO OR MORE columns compiles to `prorettype = record`, so
					// the alias `r` is a COMPOSITE and `json_agg(r)` yields objects.
					// A `returns table` with ONE column compiles to `prorettype =
					// <that base type>` -- measured: `returns table (contract_id
					// uuid)` gives typname `uuid`, typtype `b`, proargmodes `{t}` --
					// so `r` is a bare SCALAR and `json_agg(r)` yields an array of
					// VALUES. PostgREST answers objects for both, because it selects
					// the function's OUT column names, and `select *` recovers them
					// (measured: the field really is named `contract_id`).
					//
					// `coin_my_contract_claims` (0089) is the ONE function in the
					// migrations of that shape, and it is the one nothing had ever
					// driven through this shim, which is why the gap never showed.
					// Its shipped reader, `src/routes/api/coin/claim/+server.ts`,
					// does `rows.map((r) => r.contract_id)` -- so production receives
					// objects, and the old form here would have handed a test an
					// array of strings and certified a route that cannot work.
					const rows = await runAs(
						db,
						userId,
						async (q) =>
							(
								await q<{ result: unknown }>(
									`select coalesce(json_agg(row_to_json(r)), '[]'::json) as result
									   from (select * from ${call}) r`,
									values
								)
							).rows
					);
					return { data: rows[0].result, error: null };
				}
				const rows = await runAs(
					db,
					userId,
					async (q) => (await q(`select ${call} as result`, values)).rows
				);
				return { data: (rows[0] as { result: unknown } | undefined)?.result ?? null, error: null };
			} catch (error) {
				return { data: null, error: rpcError(error) };
			}
		}
	};
}
