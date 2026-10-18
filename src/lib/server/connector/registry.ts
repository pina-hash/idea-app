/**
 * THE REGISTRY BUILDER: the one place the connector's tool list comes from.
 *
 * Three layers (docs/connector/DESIGN.md section 2), one builder:
 *   1. inventory.generated.json  every function the site calls, every endpoint
 *   2. schema.generated.json     what pg_proc says about each function
 *   3. overlay.generated.json    the hand-written YAML in ./registry, compiled
 *
 * The MCP tool list is: every facade in tools.yaml, every function entry marked
 * `surface: tool`, and two built-ins, `site_find_tool` and `site_call`, which
 * reach every `surface: call` entry. Nothing about a function's arguments is
 * typed by hand: a call entry's input schema is built from layer 2, with the
 * overlay supplying only the spoken names and the descriptions.
 */
import inventoryJson from './inventory.generated.json';
import overlayJson from './overlay.generated.json';
import schemaJson from './schema.generated.json';
import type { Level } from './types';

export interface ArgSpec {
	type?: string;
	items?: unknown;
	properties?: Record<string, ArgSpec>;
	enum?: string[];
	required?: boolean;
	resolve?: 'student' | 'class' | 'post' | 'due';
	describe?: string;
	/** On a function entry: the spoken name a `p_` argument goes by. */
	name?: string;
	/** On a function entry: the value sent when the argument is left out (null included). */
	default?: unknown;
	/** On a function entry: the server fills the argument when it is left out (`uuid`: a fresh id). */
	fill?: 'uuid';
}

export interface UndoAlternative {
	when?: string;
	/** One reverse call per value of this list, with `$each` naming the value. */
	each?: string;
	function: string;
	args: Record<string, unknown>;
}

/** One rule of `level_when`: `{if: "p_amount > 0", level: undo}` or `{else: confirm}`. */
export interface LevelRule {
	if?: string;
	level?: Level;
	else?: Level;
}

/**
 * What to read, as him, before a write, so its undo can set a value back:
 * a table read (`table`, `columns`, `eq`, `in`, `order`) or a read function
 * (`rpc`, `args`, optionally `find` to pick one element of a list it returns).
 */
export interface BeforeSpec {
	table?: string;
	columns?: string[];
	eq?: Record<string, unknown>;
	in?: Record<string, unknown>;
	order?: Array<[string, 'asc' | 'desc']>;
	rpc?: string;
	args?: Record<string, unknown>;
	find?: Record<string, unknown>;
}

export interface FunctionEntry {
	name: string;
	source: string;
	surface?: 'tool' | 'call';
	tool?: string;
	level?: Level;
	/** A level decided by the server from the resolved arguments (DESIGN.md section 7). */
	level_when?: LevelRule[];
	describe?: string;
	say?: string[];
	args?: Record<string, ArgSpec>;
	undo?: UndoAlternative[];
	before?: BeforeSpec;
	/** What to remove after a delete commits, as the site's own delete route does. */
	cleanup?: 'drive_orphans' | 'classroom_attachment' | 'classroom_instructor_attachment';
	idempotent?: string[];
	pending?: string;
	exclude?: string;
}

export interface FacadeEntry {
	name: string;
	source: string;
	facade: true;
	level: Level;
	uses: string[];
	describe: string;
	say: string[];
	args?: Record<string, ArgSpec>;
	idempotent?: string[];
}

export interface EndpointEntry {
	route: string;
	source: string;
	pending?: string;
	exclude?: string;
	surface?: 'call';
	/** The name site_call and site_find_tool know it by. */
	tool?: string;
	level?: Level;
	method?: 'POST' | 'GET';
	describe?: string;
	say?: string[];
	/** Keyed by spoken name; there is no database schema to read them from. */
	args?: Record<string, ArgSpec>;
	/** The JSON body, templated from `$args.<name>` and `$uuid`. */
	body?: Record<string, unknown>;
	/** A read function that shows what a change would do before he says yes. */
	preview?: { function: string; args: Record<string, unknown> };
}

export interface SchemaArg {
	name: string;
	type: string;
	has_default: boolean;
}
export interface SchemaOverload {
	signature: string;
	args: SchemaArg[];
	returns: string;
	definer: boolean;
	comment: string;
}

export interface McpTool {
	name: string;
	description: string;
	inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
	annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean; title?: string };
}

type OverlayJson = {
	functions: Record<string, Omit<FunctionEntry, 'name' | 'source'>>;
	endpoints: Record<string, Omit<EndpointEntry, 'route' | 'source'>>;
	tools: Record<string, Omit<FacadeEntry, 'name' | 'source'>>;
	sources: Record<string, string>;
};

const overlay = overlayJson as unknown as OverlayJson;
const schema = (schemaJson as unknown as { functions: Record<string, SchemaOverload[]> }).functions;
export const inventory = inventoryJson as unknown as {
	measured: string;
	counts: Record<string, number>;
	functions: string[];
	endpoints: Array<{ route: string; file: string; methods: string[] }>;
};

export const FUNCTIONS: Record<string, FunctionEntry> = Object.fromEntries(
	Object.entries(overlay.functions).map(([name, e]) => [name, { ...e, name, source: overlay.sources[name] }])
);
export const FACADES: Record<string, FacadeEntry> = Object.fromEntries(
	Object.entries(overlay.tools).map(([name, e]) => [name, { ...e, name, source: overlay.sources[name], facade: true }])
);
export const ENDPOINTS: Record<string, EndpointEntry> = Object.fromEntries(
	Object.entries(overlay.endpoints).map(([route, e]) => [route, { ...e, route, source: overlay.sources[route] }])
);

export function schemaOf(fn: string): SchemaOverload[] {
	return schema[fn] ?? [];
}

/** A function the connector may run: an entry with a level (or levels by argument), neither pending nor excluded. */
export function liveFunction(fn: string): FunctionEntry | null {
	const e = FUNCTIONS[fn];
	if (!e || e.pending || e.exclude || (!e.level && !e.level_when?.length)) return null;
	return e;
}

/** An endpoint the connector may run: a call entry with a tool name and a level. */
export function liveEndpoint(name: string): EndpointEntry | null {
	const e = Object.values(ENDPOINTS).find((x) => x.surface === 'call' && x.tool === name);
	return e && e.level ? e : null;
}

export function endpointEntries(): EndpointEntry[] {
	return Object.values(ENDPOINTS)
		.filter((e) => e.surface === 'call' && e.tool && e.level)
		.sort((a, b) => (a.tool as string).localeCompare(b.tool as string));
}

// ---------------------------------------------------------------------------
// Levels: one per entry, or decided by the server from the arguments
// ---------------------------------------------------------------------------

const RANK_OF: Record<Level, number> = { read: 0, undo: 1, confirm: 2 };

/** Every level an entry can take: its `level`, or every branch of its `level_when`. */
export function levelsOf(e: FunctionEntry): Level[] {
	if (e.level_when?.length) return e.level_when.map((r) => (r.level ?? r.else) as Level).filter(Boolean);
	return e.level ? [e.level] : [];
}

/** The highest level an entry can take: what `connector_registry` records for it. */
export function ceilingLevel(e: FunctionEntry): Level {
	return levelsOf(e).reduce<Level>((m, l) => (RANK_OF[l] > RANK_OF[m] ? l : m), 'read');
}

function literal(text: string): unknown {
	const t = text.trim();
	if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
	if (t === 'true') return true;
	if (t === 'false') return false;
	if (t === 'null') return null;
	return t.replace(/^['"]|['"]$/g, '');
}

/**
 * One `level_when` condition, on the arguments as the database will receive
 * them: `<param> > 0`, `<param> <= 5`, `<param> = text`, `<param> != text`,
 * `<param> is null`, `<param> is not null`. An argument that is not a number
 * never satisfies a comparison, so a malformed amount falls to the `else`.
 *
 * A condition may also name what the site holds BEFORE the write, as
 * `$before.<column>` (read by the entry's own `before`, as him), so "replacing
 * an answer is reversible, writing the first one is not" is one rule: it is
 * read in `before`, never asserted by the model. With no `before` read, every
 * `$before` value is absent.
 */
function conditionValue(name: string, args: Record<string, unknown>): unknown {
	if (!name.startsWith('$before.')) return args[name];
	let v: unknown = args.$before;
	for (const part of name.slice('$before.'.length).split('.')) {
		if (v === null || typeof v !== 'object') return undefined;
		v = (v as Record<string, unknown>)[part];
	}
	return v;
}

export function conditionHolds(condition: string, args: Record<string, unknown>): boolean {
	const truthy = /^\s*(!?)(\$before\.[a-z0-9_.]+)\s*$/i.exec(condition);
	if (truthy) {
		const v = conditionValue(truthy[2], args);
		const yes = !!v && !(Array.isArray(v) && v.length === 0);
		return truthy[1] ? !yes : yes;
	}
	const nullCheck = /^\s*(\$before\.[a-z0-9_.]+|[a-z_][a-z0-9_]*)\s+is\s+(not\s+)?null\s*$/i.exec(condition);
	if (nullCheck) {
		const v = conditionValue(nullCheck[1], args);
		const isNull = v === undefined || v === null || v === '';
		return nullCheck[2] ? !isNull : isNull;
	}
	const cmp = /^\s*(\$before\.[a-z0-9_.]+|[a-z_][a-z0-9_]*)\s*(>=|<=|!=|=|>|<)\s*(.+?)\s*$/i.exec(condition);
	if (!cmp) throw new Error(`level_when cannot read "${condition}".`);
	const [, param, op, rhsText] = cmp;
	const lhs = conditionValue(param, args);
	const rhs = literal(rhsText);
	if (op === '=' || op === '!=') {
		const same = typeof rhs === 'number' ? Number(lhs) === rhs : String(lhs ?? 'null') === String(rhs);
		return op === '=' ? same : !same;
	}
	const n = typeof lhs === 'number' ? lhs : typeof lhs === 'string' && lhs.trim() !== '' ? Number(lhs) : NaN;
	if (!Number.isFinite(n) || typeof rhs !== 'number') return false;
	return op === '>' ? n > rhs : op === '<' ? n < rhs : op === '>=' ? n >= rhs : n <= rhs;
}

/**
 * The level a write runs at, decided here from the resolved arguments (and,
 * for a `$before` condition, what the entry's `before` read found) and never
 * by the model.
 */
export function levelFor(e: FunctionEntry, args: Record<string, unknown>, before?: Record<string, unknown>): Level {
	if (!e.level_when?.length) return (e.level ?? 'confirm') as Level;
	const scope = { ...args, $before: before };
	for (const rule of e.level_when) {
		if (rule.if !== undefined) {
			if (conditionHolds(rule.if, scope)) return (rule.level ?? 'confirm') as Level;
		} else if (rule.else) {
			return rule.else;
		}
	}
	return ceilingLevel(e);
}

/** The rows `connector_registry` holds, which `connector_call` refuses anything outside of. */
export function registryRows(): Array<{ function_name: string; tool: string; level: Level }> {
	return Object.values(FUNCTIONS)
		.filter((e) => liveFunction(e.name))
		.map((e) => ({ function_name: e.name, tool: e.tool ?? `site_call:${e.name}`, level: ceilingLevel(e) }))
		.sort((a, b) => a.function_name.localeCompare(b.function_name));
}

// ---------------------------------------------------------------------------
// JSON Schema
// ---------------------------------------------------------------------------

/** A Postgres type as a JSON Schema fragment. */
export function pgTypeSchema(type: string): Record<string, unknown> {
	if (type.endsWith('[]')) return { type: 'array', items: pgTypeSchema(type.slice(0, -2)) };
	switch (type) {
		case 'integer':
		case 'bigint':
		case 'smallint':
			return { type: 'integer' };
		case 'numeric':
		case 'real':
		case 'double precision':
			return { type: 'number' };
		case 'boolean':
			return { type: 'boolean' };
		case 'uuid':
			return { type: 'string', format: 'uuid' };
		case 'timestamp with time zone':
		case 'timestamp without time zone':
			return { type: 'string', format: 'date-time' };
		case 'date':
			return { type: 'string', format: 'date' };
		case 'jsonb':
		case 'json':
			return {};
		default:
			return { type: 'string' };
	}
}

function argSchema(spec: ArgSpec): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	if (spec.type) out.type = spec.type;
	if (spec.describe) out.description = spec.describe;
	if (spec.enum) out.enum = spec.enum;
	if (spec.type === 'array') {
		const items = spec.items;
		if (typeof items === 'string') out.items = { type: items };
		else if (items && typeof items === 'object') out.items = argSchema(items as ArgSpec);
		else out.items = {};
	}
	if (spec.type === 'object' && spec.properties) {
		out.properties = Object.fromEntries(Object.entries(spec.properties).map(([k, v]) => [k, argSchema(v)]));
	}
	return out;
}

/** Every tool takes his request in his own words (DESIGN.md section 9). */
export const SAID_PARAM: Record<string, unknown> = {
	type: 'string',
	description: 'What he asked for, in his own words, exactly as he said it. The same words for every call made for that one request.'
};

export const WRITE_PARAMS: Record<string, Record<string, unknown>> = {
	dry_run: { type: 'boolean', description: 'True to preview what would change without writing anything.' },
	request_id: {
		type: 'string',
		description:
			'A fresh random id for each thing he asks for, reused unchanged if you retry the same request. A repeat with the same id never writes twice.'
	},
	confirm_token: {
		type: 'string',
		description: 'Only for a change that asks first: the token the preview returned, sent after he says yes.'
	},
	again: {
		type: 'boolean',
		description: 'True only when he asked for the same change a second time on purpose.'
	}
};

function sayLine(say: string[] | undefined): string {
	return say?.length ? ` He might say: ${say.map((s) => `"${s}"`).join('; ')}.` : '';
}

const WRITE_NOTE =
	' It is recorded as his change, in the site\'s own records, and logged as made through Claude. Pass dry_run to preview.';
const CONFIRM_NOTE =
	' This asks first: the first call writes nothing and returns a preview and a confirm_token. Read the preview to him; call again with the same arguments and the confirm_token only after he says yes.';

function levelNote(level: Level): string {
	if (level === 'read') return '';
	return level === 'confirm' ? WRITE_NOTE + CONFIRM_NOTE : WRITE_NOTE;
}

export function facadeTool(f: FacadeEntry): McpTool {
	const properties: Record<string, unknown> = {};
	const required: string[] = [];
	for (const [k, spec] of Object.entries(f.args ?? {})) {
		properties[k] = argSchema(spec);
		if (spec.required) required.push(k);
	}
	if (f.level !== 'read') Object.assign(properties, WRITE_PARAMS);
	properties.said = SAID_PARAM;
	required.push('said');
	return {
		name: f.name,
		description: `${f.describe}${sayLine(f.say)}${levelNote(f.level)}`,
		inputSchema: { type: 'object', properties, required, additionalProperties: false },
		annotations: {
			readOnlyHint: f.level === 'read',
			destructiveHint: f.level === 'confirm',
			idempotentHint: f.level === 'read',
			openWorldHint: false
		}
	};
}

export interface CallArg {
	param: string;
	name: string;
	type: string;
	required: boolean;
	describe?: string;
	resolve?: ArgSpec['resolve'];
	enum?: string[];
	/** Present when the overlay gives a value for a left-out argument. */
	hasDefault?: boolean;
	default?: unknown;
	fill?: 'uuid';
}

/** A function entry's arguments, by spoken name where the overlay gives one. */
export function callArgs(e: FunctionEntry): CallArg[] {
	const overloads = schemaOf(e.name);
	// The widest overload: every parameter any form takes.
	const seen = new Map<string, CallArg>();
	for (const o of overloads) {
		for (const a of o.args) {
			const spec = e.args?.[a.name];
			const prior = seen.get(a.name);
			const filled = spec !== undefined && ('default' in spec || spec.fill !== undefined);
			const schemaRequired = !a.has_default && overloads.every((ov) => ov.args.some((x) => x.name === a.name && !x.has_default));
			const required = spec?.required === true || (schemaRequired && !filled);
			if (!prior) {
				seen.set(a.name, {
					param: a.name,
					name: spec?.name ?? a.name,
					type: a.type,
					required,
					describe: spec?.describe,
					resolve: spec?.resolve,
					enum: spec?.enum,
					...(spec && 'default' in spec ? { hasDefault: true, default: spec.default } : {}),
					...(spec?.fill ? { fill: spec.fill } : {})
				});
			}
		}
	}
	return [...seen.values()];
}

/** An endpoint entry's arguments, which the overlay states by spoken name. */
export function endpointArgs(e: EndpointEntry): CallArg[] {
	return Object.entries(e.args ?? {}).map(([name, spec]) => ({
		param: name,
		name,
		type: spec.type ?? 'string',
		required: spec.required === true,
		describe: spec.describe,
		resolve: spec.resolve,
		enum: spec.enum
	}));
}

export function functionTool(e: FunctionEntry): McpTool {
	const properties: Record<string, unknown> = {};
	const required: string[] = [];
	for (const a of callArgs(e)) {
		const schemaType = a.resolve ? { type: 'string' } : pgTypeSchema(a.type);
		properties[a.name] = { ...schemaType, ...(a.enum ? { enum: a.enum } : {}), ...(a.describe ? { description: a.describe } : {}) };
		if (a.required) required.push(a.name);
	}
	const level = ceilingLevel(e);
	if (level !== 'read') Object.assign(properties, WRITE_PARAMS);
	properties.said = SAID_PARAM;
	required.push('said');
	const byArgument = e.level_when?.length
		? ' Whether it asks first is decided by the server from what is asked, never by you: follow the answer it gives.'
		: '';
	return {
		name: e.tool ?? e.name,
		description: `${e.describe ?? e.name}${sayLine(e.say)}${levelNote(e.level_when?.length ? 'undo' : level)}${byArgument}`,
		inputSchema: { type: 'object', properties, required, additionalProperties: false },
		annotations: { readOnlyHint: level === 'read', destructiveHint: level === 'confirm', openWorldHint: false }
	};
}

/** Every `surface: call` entry: what site_call reaches. */
export function callEntries(): FunctionEntry[] {
	return Object.values(FUNCTIONS)
		.filter((e) => liveFunction(e.name) && (e.surface ?? 'call') === 'call')
		.sort((a, b) => a.name.localeCompare(b.name));
}

export const SITE_FIND_TOOL: McpTool = {
	name: 'site_find_tool',
	description:
		'Search everything else the site can do, by what he wants in his words. Answers at most five matches, best first, each with the exact site_call to make. If nothing matches, the site cannot do it yet: tell him so plainly and call report_gap.' +
		sayLine(['what else can you do in the classroom', 'can you show me a post\'s old versions', 'find the tool that pins a post']),
	inputSchema: {
		type: 'object',
		properties: { query: { type: 'string', description: 'What he wants to do, in his words.' }, said: SAID_PARAM },
		required: ['query', 'said'],
		additionalProperties: false
	},
	annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
};

export function siteCallTool(): McpTool {
	const count = callEntries().length + endpointEntries().length;
	return {
		name: 'site_call',
		description:
			`Run one of the site's ${count} other actions, as him and with his permissions, by the exact name and arguments site_find_tool gave. Always call site_find_tool first; never guess a name. ` +
			'Reads run at once; changes are logged and can be previewed with dry_run; anything that asks first returns a preview and a confirm_token.' +
			sayLine(['pin the syllabus post in Block 4', 'show me the old versions of Tolerance Check', 'what notices are up in Block 1']),
		inputSchema: {
			type: 'object',
			properties: {
				name: { type: 'string', description: 'The action, exactly as site_find_tool named it.' },
				args: { type: 'object', description: 'Its arguments, by the names site_find_tool gave.' },
				...WRITE_PARAMS,
				said: SAID_PARAM
			},
			required: ['name', 'said'],
			additionalProperties: false
		},
		annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false }
	};
}

/** The whole MCP tool list, in a stable order. */
export function toolList(): McpTool[] {
	const facades = Object.values(FACADES).map(facadeTool);
	const direct = directEntries().map(functionTool);
	return [...facades, ...direct, SITE_FIND_TOOL, siteCallTool()];
}

/** Every function entry promoted to a tool of its own. */
export function directEntries(): FunctionEntry[] {
	return Object.values(FUNCTIONS)
		.filter((e) => liveFunction(e.name) && e.surface === 'tool')
		.sort((a, b) => (a.tool ?? a.name).localeCompare(b.tool ?? b.name));
}

/** The level a facade may claim: the highest of anything it writes. */
const RANK: Record<Level, number> = { read: 0, undo: 1, confirm: 2 };
export function maxLevel(levels: Level[]): Level {
	return levels.reduce<Level>((m, l) => (RANK[l] > RANK[m] ? l : m), 'read');
}

/** A placeholder value that tells the model what goes in an argument. */
function placeholder(a: CallArg): unknown {
	if (a.resolve === 'student') return '<the student, as he said the name>';
	if (a.resolve === 'class') return '<the class, like 209H Block 2>';
	if (a.resolve === 'post') return '<the post\'s title, as he said it>';
	if (a.resolve === 'due') return '<a time, like Friday 3pm>';
	if (a.enum?.length) return `<one of: ${a.enum.join(', ')}>`;
	return `<${a.describe ?? a.name}>`;
}

export interface FoundTool {
	name: string;
	level: Level | 'decided by what is asked';
	what: string;
	say: string[];
	/** The exact site_call to make: fill in the angle-bracketed values; leave out any optional argument he did not give. */
	call: { name: string; args: Record<string, unknown> };
	optional: string[];
}

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'what', 'who', 'how', 'can', 'you', 'show', 'please', 'from', 'into', 'all', 'his', 'her', 'their', 'make', 'get', 'one']);

function stem(w: string): string {
	return w.replace(/(ing|ed|es|s)$/, '');
}

/** site_find_tool: a ranked search over every call entry and endpoint entry, at most five, each with its exact call. */
export function findTools(query: string, limit = 5): FoundTool[] {
	const words = query
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((w) => w.length > 2 && !STOP.has(w))
		.map(stem);
	const pool: Array<{ name: string; hay: string; title: string; build: () => FoundTool }> = [
		...callEntries().map((e) => ({
			name: e.name,
			title: e.name.replace(/_/g, ' '),
			hay: `${e.name.replace(/_/g, ' ')} ${e.describe ?? ''} ${(e.say ?? []).join(' ')}`.toLowerCase(),
			build: (): FoundTool => {
				const args = callArgs(e);
				return {
					name: e.name,
					level: e.level_when?.length ? 'decided by what is asked' : (e.level as Level),
					what: e.describe ?? '',
					say: e.say ?? [],
					call: { name: e.name, args: Object.fromEntries(args.filter((a) => a.required).map((a) => [a.name, placeholder(a)])) },
					optional: args.filter((a) => !a.required && !a.fill).map((a) => `${a.name}: ${a.describe ?? ''}`)
				};
			}
		})),
		...endpointEntries().map((e) => ({
			name: e.tool as string,
			title: (e.tool as string).replace(/_/g, ' '),
			hay: `${(e.tool as string).replace(/_/g, ' ')} ${e.describe ?? ''} ${(e.say ?? []).join(' ')}`.toLowerCase(),
			build: (): FoundTool => {
				const args = endpointArgs(e);
				return {
					name: e.tool as string,
					level: e.level as Level,
					what: e.describe ?? '',
					say: e.say ?? [],
					call: { name: e.tool as string, args: Object.fromEntries(args.filter((a) => a.required).map((a) => [a.name, placeholder(a)])) },
					optional: args.filter((a) => !a.required).map((a) => `${a.name}: ${a.describe ?? ''}`)
				};
			}
		}))
	];
	const scored = pool.map((p) => {
		const tokens = p.hay.split(/[^a-z0-9]+/).map(stem);
		const titleTokens = p.title.split(' ').map(stem);
		let score = 0;
		for (const w of words) {
			if (titleTokens.includes(w)) score += 3;
			else if (tokens.includes(w)) score += 2;
			else if (p.hay.includes(w)) score += 1;
		}
		return { p, score };
	});
	return scored
		.filter((s) => s.score > 0)
		.sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name))
		.slice(0, limit)
		.map(({ p }) => p.build());
}
