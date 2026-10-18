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
}

export interface UndoAlternative {
	when?: string;
	function: string;
	args: Record<string, unknown>;
}

export interface FunctionEntry {
	name: string;
	source: string;
	surface?: 'tool' | 'call';
	tool?: string;
	level?: Level;
	describe?: string;
	say?: string[];
	args?: Record<string, ArgSpec>;
	undo?: UndoAlternative[];
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
	level?: Level;
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

/** A function the connector may run: an entry with a level, neither pending nor excluded. */
export function liveFunction(fn: string): FunctionEntry | null {
	const e = FUNCTIONS[fn];
	if (!e || e.pending || e.exclude || !e.level) return null;
	return e;
}

/** The rows `connector_registry` holds, which `connector_call` refuses anything outside of. */
export function registryRows(): Array<{ function_name: string; tool: string; level: Level }> {
	return Object.values(FUNCTIONS)
		.filter((e) => liveFunction(e.name))
		.map((e) => ({ function_name: e.name, tool: e.tool ?? `site_call:${e.name}`, level: e.level as Level }))
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
	return {
		name: f.name,
		description: `${f.describe}${sayLine(f.say)}${levelNote(f.level)}`,
		inputSchema: { type: 'object', properties, ...(required.length ? { required } : {}), additionalProperties: false },
		annotations: {
			readOnlyHint: f.level === 'read',
			destructiveHint: f.level === 'confirm',
			idempotentHint: f.level === 'read',
			openWorldHint: false
		}
	};
}

/** A function entry's arguments, by spoken name where the overlay gives one. */
export function callArgs(e: FunctionEntry): Array<{ param: string; name: string; type: string; required: boolean; describe?: string; resolve?: ArgSpec['resolve'] }> {
	const overloads = schemaOf(e.name);
	// The widest overload: every parameter any form takes.
	const seen = new Map<string, { param: string; name: string; type: string; required: boolean; describe?: string; resolve?: ArgSpec['resolve'] }>();
	for (const o of overloads) {
		for (const a of o.args) {
			const spec = e.args?.[a.name];
			const prior = seen.get(a.name);
			const required = !a.has_default && overloads.every((ov) => ov.args.some((x) => x.name === a.name && !x.has_default));
			if (!prior) {
				seen.set(a.name, { param: a.name, name: spec?.name ?? a.name, type: a.type, required, describe: spec?.describe, resolve: spec?.resolve });
			}
		}
	}
	return [...seen.values()];
}

export function functionTool(e: FunctionEntry): McpTool {
	const properties: Record<string, unknown> = {};
	const required: string[] = [];
	for (const a of callArgs(e)) {
		properties[a.name] = { ...pgTypeSchema(a.type), ...(a.describe ? { description: a.describe } : {}) };
		if (a.required) required.push(a.name);
	}
	if (e.level !== 'read') Object.assign(properties, WRITE_PARAMS);
	return {
		name: e.tool ?? e.name,
		description: `${e.describe ?? e.name}${sayLine(e.say)}${levelNote(e.level ?? 'read')}`,
		inputSchema: { type: 'object', properties, ...(required.length ? { required } : {}), additionalProperties: false },
		annotations: { readOnlyHint: e.level === 'read', destructiveHint: e.level === 'confirm', openWorldHint: false }
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
		'Search everything else the site can do through site_call, by what he wants in his words, and get back the matching actions with their arguments and safety level.' +
		sayLine(['what else can you do in the classroom', 'can you show me a post\'s old versions', 'find the tool that pins a post']),
	inputSchema: {
		type: 'object',
		properties: { query: { type: 'string', description: 'What he wants to do, in his words.' } },
		required: ['query'],
		additionalProperties: false
	},
	annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
};

export function siteCallTool(): McpTool {
	const names = callEntries().map((e) => e.name);
	return {
		name: 'site_call',
		description:
			'Run one site action that has no tool of its own, found with site_find_tool, as him and with his permissions. ' +
			`Reads run at once; changes are logged and can be previewed with dry_run; anything that asks first returns a preview and a confirm_token. Actions available: ${names.join(', ')}.` +
			sayLine(['pin the syllabus post in Block 4', 'show me the old versions of Tolerance Check', 'what notices are up in Block 1']),
		inputSchema: {
			type: 'object',
			properties: {
				name: { type: 'string', description: 'The action, exactly as site_find_tool named it.' },
				args: { type: 'object', description: 'Its arguments, by the names site_find_tool gave.' },
				...WRITE_PARAMS
			},
			required: ['name'],
			additionalProperties: false
		},
		annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false }
	};
}

/** The whole MCP tool list, in a stable order. */
export function toolList(): McpTool[] {
	const facades = Object.values(FACADES).map(facadeTool);
	const direct = Object.values(FUNCTIONS)
		.filter((e) => liveFunction(e.name) && e.surface === 'tool')
		.map(functionTool);
	return [...facades, ...direct, SITE_FIND_TOOL, siteCallTool()];
}

/** The level a facade may claim: the highest of anything it writes. */
const RANK: Record<Level, number> = { read: 0, undo: 1, confirm: 2 };
export function maxLevel(levels: Level[]): Level {
	return levels.reduce<Level>((m, l) => (RANK[l] > RANK[m] ? l : m), 'read');
}

/** site_find_tool: a plain ranked search over the call entries' words. */
export function findTools(query: string, limit = 8): Array<{ name: string; level: Level; describe: string; say: string[]; args: ReturnType<typeof callArgs> }> {
	const words = query
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((w) => w.length > 2);
	const scored = callEntries().map((e) => {
		const hay = `${e.name.replace(/_/g, ' ')} ${e.describe ?? ''} ${(e.say ?? []).join(' ')}`.toLowerCase();
		const score = words.reduce((s, w) => s + (hay.includes(w) ? (e.name.includes(w) ? 2 : 1) : 0), 0);
		return { e, score };
	});
	return scored
		.filter((s) => s.score > 0 || words.length === 0)
		.sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name))
		.slice(0, limit)
		.map(({ e }) => ({ name: e.name, level: e.level as Level, describe: e.describe ?? '', say: e.say ?? [], args: callArgs(e) }));
}
