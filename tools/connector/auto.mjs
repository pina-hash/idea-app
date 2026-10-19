#!/usr/bin/env node
// tools/connector/auto.mjs
//
// LAYER 4 OF THE CONNECTOR REGISTRY: THE GENERATED TOOLS (ledger 0416).
//
// Mr. Pina, 2026-10-19: "The connector updates itself. Every time an update is
// pushed, the connector picks up every new admin action without him asking.
// Tools are generated automatically, not just guarded by a test."
//
// So every function the site calls and every server route that has NO
// hand-written overlay entry gets one made here, from what the code and the
// database already say about it:
//
//   - A function whose body calls a staff gate (tools/connector/gates.mjs) is
//     an admin action. It becomes a site_call entry at the level its body
//     earns: `read` when it writes nothing (pg_proc, transitively), and
//     `confirm` otherwise, which ALWAYS previews first and hands back a
//     confirm_token. No generated entry claims `undo`: a reverse is a
//     judgement nobody has made yet, and "asks first" is the level that needs
//     none. Its arguments come from pg_proc with the `p_` taken off; an
//     `p_operation uuid` (the Armory's repeat key) is filled by the server.
//   - A function whose body calls no staff gate acts as whoever calls it (a
//     student's or a visitor's own action) and is excluded, with that reason.
//   - A route whose handler checks admin (`isAdmin(` / `isOwner(`) becomes a
//     site_call entry that sends the JSON body the site's page sends, asking
//     first unless it is a GET. Any other route is excluded, with its reason.
//
// A hand-written entry in src/lib/server/connector/registry/*.yaml always
// wins: the overlay is where a tool gets its spoken names, its undo and its
// proof. The generated layer is what makes a new admin action reachable on the
// push that adds it, with nobody asked. `npm run connector:build` writes it,
// `.github/workflows/connector.yml` runs that build on every push to main and
// commits what changed, and tests/connector-coverage.test.ts fails on a stale
// file and on any admin action that has neither a tool nor an exclusion.
//
//   node tools/connector/auto.mjs           write both files
//   node tools/connector/auto.mjs --check   exit 1 when either is stale

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const AUTO_PATH = join(ROOT, 'src/lib/server/connector/auto.generated.json');
export const AUTO_ROUTES_PATH = join(ROOT, 'src/lib/server/connector/endpoints.generated.ts');
const INVENTORY = join(ROOT, 'src/lib/server/connector/inventory.generated.json');
const OVERLAY = join(ROOT, 'src/lib/server/connector/overlay.generated.json');
const SCHEMA = join(ROOT, 'src/lib/server/connector/schema.generated.json');

/** What part of the site a function belongs to, read off its name. Longest prefix first. */
const AREAS = [
	['coin_market_', 'IDEA Market'],
	['coin_banner', 'IDEA Market banner'],
	['coin_stock', 'IDEA Coin stocks'],
	['coin_transfer', 'IDEA Coin transfers'],
	['coin_role', 'IDEA Coin jobs'],
	['coin_payday', 'IDEA Coin payday'],
	['coin_settings', 'IDEA Coin settings'],
	['coin_', 'IDEA Coin Desk'],
	['cert_', 'IDEA Certifications'],
	['armory_', 'IDEA Armory'],
	['classroom_hall_pass', 'Classroom hall pass'],
	['classroom_', 'Classroom'],
	['notebook_', 'Notebook'],
	['ideacad_', 'IdeaCAD'],
	['foundry_', 'Foundry'],
	['gauntlet_', 'GAUNTLET'],
	['tournament_', 'Tournament'],
	['maps_', 'IDEA Maps'],
	['greenline_', 'GREENLINE'],
	['vanguard_', 'VANGUARD'],
	['frc_', 'FRC Training'],
	['profile_', 'Profile'],
	['app_', 'the site'],
	['admin_', 'site admin']
];

export const NOT_ADMIN_FUNCTION =
	"Generated: not an admin action. Its body checks no admin, staff or class-teacher gate, so it acts as whoever calls it (a student's or a visitor's own action on their own record).";
export const NO_SUCH_FUNCTION = "Generated: the site's code names this function but no migration defines it, so there is nothing to run.";
export const NOT_ADMIN_ROUTE =
	"Generated: not an admin action. The route's handler checks no site admin, so it serves or acts for whoever calls it.";

function areaOf(name) {
	for (const [prefix, area] of AREAS) if (name.startsWith(prefix)) return { prefix, area };
	return { prefix: '', area: 'the site' };
}

/** "coin_banner_save" -> "banner save", the words a person would use. */
export function humanize(name) {
	const { prefix } = areaOf(name);
	const rest = name.slice(prefix.replace(/_$/, '').length).replace(/^_+/, '');
	const words = (rest || name).replace(/_+/g, ' ').trim();
	return words || name.replace(/_+/g, ' ');
}

/** Every snake_case word is a table, a column or an argument: none belongs in what a person reads. */
const IDENTIFIER = /\b[a-z][a-z0-9]*_[a-z0-9_]+\b/;

function firstSentence(comment) {
	const flat = String(comment ?? '').replace(/\s+/g, ' ').trim();
	if (!flat) return '';
	const cut = flat.match(/^(.{20,110}?[.!?])(\s|$)/);
	const sentence = (cut ? cut[1] : '').trim();
	// A comment that names a table or a function is written for whoever reads
	// the schema, not for a person asking: the name's own words are better.
	return sentence && !IDENTIFIER.test(sentence) && !/\b(profiles|tournaments)\b/i.test(sentence) ? sentence : '';
}

/** "p_section_id" -> "section", "p_starts_on" -> "startsOn": a spoken key, never a database name. */
export function spokenName(param) {
	const bare = param.replace(/^p_/, '').replace(/_id$/, '') || param.replace(/^p_/, '') || param;
	return bare.replace(/_+([a-z0-9])/g, (_, c) => c.toUpperCase());
}

/** One generated function entry. */
export function autoFunction(name, overloads) {
	if (!overloads || overloads.length === 0) return { auto: true, exclude: NO_SUCH_FUNCTION };
	const gated = overloads.some((o) => (o.gates ?? []).length > 0);
	if (!gated) return { auto: true, exclude: NOT_ADMIN_FUNCTION };
	const writes = overloads.some((o) => o.writes);
	const { area } = areaOf(name);
	const words = humanize(name);
	const comment = overloads.map((o) => firstSentence(o.comment)).find(Boolean);
	const describe =
		(comment ? `${area}: ${comment}` : `${area}: ${words}.`) +
		(writes ? ' A change the site makes by hand, reached automatically; it asks first.' : ' A read the site makes by hand, reached automatically.');
	const args = {};
	const taken = new Set();
	for (const o of overloads) {
		for (const a of o.args) {
			if (args[a.name]) continue;
			let spoken = spokenName(a.name);
			while (taken.has(spoken)) spoken = `${spoken}2`;
			taken.add(spoken);
			const plain = a.name.replace(/^p_/, '').replace(/_/g, ' ');
			const spec = { name: spoken, describe: `The ${plain}, as the site's own page sends it.` };
			if (a.name === 'p_operation' && a.type === 'uuid') {
				spec.fill = 'uuid';
				spec.describe = 'Leave it out; the server fills it.';
			}
			args[a.name] = spec;
		}
	}
	return {
		auto: true,
		proof: 'generic',
		surface: 'call',
		level: writes ? 'confirm' : 'read',
		describe,
		say: [`${words} in ${area}`, words, `${area} ${words}`],
		...(Object.keys(args).length ? { args } : {})
	};
}

/** Whether a route's handler is an admin action: it asks the site's admin helper. */
export function routeIsAdmin(text) {
	return /\bisAdmin\s*\(|\bisOwner\s*\(|['"]is_admin['"]/.test(text);
}

/** A generated route's tool name: `site_route_api_coin_role_apply` for `/api/coin/role-apply`. */
export function routeTool(route) {
	const slug = route
		.replace(/\[\.\.\.([a-z_]+)\]/gi, '$1')
		.replace(/\[([a-z_]+)\]/gi, '$1')
		.replace(/[^a-z0-9]+/gi, '_')
		.replace(/^_+|_+$/g, '')
		.toLowerCase();
	return `site_route_${slug || 'root'}`;
}

export function autoEndpoint(endpoint, text) {
	if (!routeIsAdmin(text)) return { auto: true, exclude: NOT_ADMIN_ROUTE };
	// A route with path parameters cannot be called without them, and nothing
	// here knows what they mean: excluded, with that said, rather than guessed.
	if (/\[/.test(endpoint.route)) {
		return { auto: true, exclude: 'Generated: an admin route whose address carries a parameter, which only its own page knows how to fill; the connector cannot call it blind.' };
	}
	const method = endpoint.methods.includes('POST') ? 'POST' : endpoint.methods.includes('GET') ? 'GET' : null;
	if (!method) return { auto: true, exclude: 'Generated: an admin route with no GET or POST handler, which the connector has no way to call.' };
	const words = endpoint.route.replace(/^\/(api\/)?/, '').replace(/[[\]/_-]+/g, ' ').trim();
	return {
		auto: true,
		proof: 'generic',
		surface: 'call',
		tool: routeTool(endpoint.route),
		level: method === 'GET' ? 'read' : 'confirm',
		method,
		describe: `The site's ${words} action (${endpoint.route}), reached automatically; it sends the same JSON body the site's own page sends${method === 'GET' ? '' : ', and asks first'}.`,
		say: [`run ${words}`, `use the ${words} action`, `${words} on the site`],
		args: { body: { type: 'object', describe: 'The body the site\'s own page sends to this route.' } },
		body: '$args.body'
	};
}

export function buildAuto(inventory, overlay, schema, readText = (file) => readFileSync(join(ROOT, file), 'utf8')) {
	const functions = {};
	for (const name of inventory.functions) {
		if (overlay.functions[name]) continue;
		functions[name] = autoFunction(name, schema.functions[name]);
	}
	const endpoints = {};
	for (const e of inventory.endpoints) {
		if (overlay.endpoints[e.route]) continue;
		endpoints[e.route] = { ...autoEndpoint(e, readText(e.file)), file: e.file };
	}
	const live = Object.values(functions).filter((f) => !f.exclude);
	return {
		note: 'Generated by tools/connector/auto.mjs (npm run connector:build) from the inventory, the hand overlay and pg_proc. Do not edit by hand: a hand-written entry in registry/*.yaml replaces a generated one.',
		counts: {
			functions: Object.keys(functions).length,
			tools: live.length,
			reads: live.filter((f) => f.level === 'read').length,
			asks_first: live.filter((f) => f.level === 'confirm').length,
			excluded: Object.keys(functions).length - live.length,
			endpoints: Object.keys(endpoints).length,
			endpoint_tools: Object.values(endpoints).filter((e) => !e.exclude).length
		},
		functions,
		endpoints
	};
}

/** The literal imports for every generated route tool, so a typo is a build error. */
export function renderRoutes(auto) {
	const routes = Object.entries(auto.endpoints)
		.filter(([, e]) => !e.exclude)
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	const lines = [
		'// Generated by tools/connector/auto.mjs (npm run connector:build). Do not edit by hand.',
		'//',
		'// The handler module of every admin route the generated layer made a tool for',
		'// (src/lib/server/connector/endpoints.ts merges these with its own).',
		'',
		'export const AUTO_ROUTES: Record<string, () => Promise<Record<string, unknown>>> = {'
	];
	for (const [route, e] of routes) {
		const file = e.file.replace(/^src\/routes\//, '../../../routes/').replace(/\.ts$/, '');
		lines.push(`\t'${route}': () => import('${file}'),`);
	}
	lines.push('};', '');
	return lines.join('\n').replace('= {\n};', '= {};');
}

export function renderAuto() {
	const inventory = JSON.parse(readFileSync(INVENTORY, 'utf8'));
	const overlay = JSON.parse(readFileSync(OVERLAY, 'utf8'));
	const schema = JSON.parse(readFileSync(SCHEMA, 'utf8'));
	const auto = buildAuto(inventory, overlay, schema);
	return { json: JSON.stringify(auto, null, '\t') + '\n', routes: renderRoutes(auto), auto };
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const { json, routes, auto } = renderAuto();
	if (process.argv.includes('--check')) {
		const stale =
			!existsSync(AUTO_PATH) || readFileSync(AUTO_PATH, 'utf8') !== json || !existsSync(AUTO_ROUTES_PATH) || readFileSync(AUTO_ROUTES_PATH, 'utf8') !== routes;
		if (stale) {
			console.error('auto.generated.json or endpoints.generated.ts is stale: run npm run connector:build');
			process.exit(1);
		}
		console.log('generated tools are current');
	} else {
		writeFileSync(AUTO_PATH, json);
		writeFileSync(AUTO_ROUTES_PATH, routes);
		const c = auto.counts;
		console.log(`auto: ${c.tools} generated tools (${c.reads} reads, ${c.asks_first} ask first), ${c.excluded} excluded; ${c.endpoint_tools} route tools of ${c.endpoints}`);
	}
}
