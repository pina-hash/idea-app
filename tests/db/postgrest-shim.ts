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

import type { TestDb } from './harness';

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
	op: 'eq' | 'in' | 'is';
	value: unknown;
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
	private single = false;

	constructor(
		private readonly db: TestDb,
		private readonly fks: readonly ForeignKey[],
		private readonly userId: string,
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
		this.single = true;
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
				if (filter.op === 'is') {
					// No parameter: `is null` / `is true` / `is false` are operators
					// over a literal, not a comparison against a bound value.
					const operand =
						filter.value === null ? 'null' : filter.value === true ? 'true' : 'false';
					where.push(`t.${quote(filter.column)} is ${operand}`);
					continue;
				}
				params.push(filter.value);
				where.push(
					filter.op === 'eq'
						? `t.${quote(filter.column)} = $${params.length}`
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
			const rows = await this.db.asUser(this.userId, async (q) =>
				(await q<{ row: unknown }>(sql, params)).rows.map((r) => r.row)
			);
			if (this.single) return { data: rows[0] ?? null, error: null };
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
 * A client for one signed-in user. `fks` is a snapshot of the catalog taken
 * once, the same way PostgREST caches it -- reload it if a test changes the
 * schema mid-run.
 */
export function createPostgrestShim(db: TestDb, fks: readonly ForeignKey[], userId: string) {
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
			try {
				const rows = await db.asUser(
					userId,
					async (q) => (await q(`select ${call} as result`, entries.map(([, v]) => v))).rows
				);
				return { data: (rows[0] as { result: unknown } | undefined)?.result ?? null, error: null };
			} catch (error) {
				// PostgREST reports a function that does not exist -- including one
				// whose arguments do not match any overload -- as PGRST202, which
				// $lib/server/admin.ts matches on by code.
				return { data: null, error: { code: 'PGRST202', message: (error as Error).message } };
			}
		}
	};
}
