#!/usr/bin/env node
// tools/connector/inventory.mjs
//
// LAYER 1 OF THE CONNECTOR REGISTRY (docs/connector/DESIGN.md section 2): every
// distinct database function the site's code calls by name, and every server
// endpoint with its methods. Written to
// src/lib/server/connector/inventory.generated.json and checked in;
// tests/connector-coverage.test.ts regenerates it in memory and fails on any
// difference, so a new `.rpc('name')` or a new `+server.ts` reddens the suite
// until the overlay says what the connector does with it.
//
// WHAT COUNTS AS A CALL. A string literal as the first argument of `.rpc(`,
// across line breaks, anywhere under src/. A call whose name is a VARIABLE
// (a wrapper passing a name through) is invisible to any scanner; the number
// of such call sites is recorded beside the counts rather than guessed at.
//
// THROUGH A WRAPPER (ledger 0416). Most of the Coin Desk, the IDEA Market,
// the certifications desk and the Armory reach the database through a helper
// that passes the name along (`callV2(supabase, 'coin_banner_save', ...)`),
// which a `.rpc('name')` scan never sees: on 2026-10-19 that was 253 functions,
// the market banner among them, and none of them reached the connector. So a
// function also counts as called when its exact name appears as a quoted
// string in the site's code (comments stripped, the connector's own files and
// the /dev harnesses aside) AND a migration creates a public function by that
// name. Both halves are needed: the name alone would take in every string
// that happens to look like an identifier.
//
// THE DATE. `measured` moves only when the functions or endpoints change, so
// regenerating an unchanged tree rewrites nothing and the staleness check does
// not redden on a calendar day. The page count is recorded with the date it was
// measured and is NOT part of the staleness check (a new page is not a new
// connector surface).
//
//   node tools/connector/inventory.mjs           write the file
//   node tools/connector/inventory.mjs --check   exit 1 when the file is stale

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const INVENTORY_PATH = join(ROOT, 'src/lib/server/connector/inventory.generated.json');

function walk(dir, out = []) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, entry.name);
		if (entry.isDirectory()) walk(p, out);
		else out.push(p);
	}
	return out;
}

const RPC_LITERAL = /\.rpc\(\s*(['"`])([A-Za-z0-9_]+)\1/g;
const RPC_ANY = /\.rpc\(\s*([A-Za-z_$][\w$.]*)\s*[,)]/g;
const MIGRATIONS = join(ROOT, 'supabase/migrations');
const CREATE_FUNCTION = /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z_][a-z0-9_]*)\s*\(/gi;
const QUOTED = /(['"`])([a-z_][a-z0-9_]*)\1/g;

/** Every public function any migration creates, by name. */
export function migrationFunctionNames() {
	const names = new Set();
	for (const f of readdirSync(MIGRATIONS).filter((x) => /^\d{4}_.*\.sql$/.test(x))) {
		for (const m of readFileSync(join(MIGRATIONS, f), 'utf8').matchAll(CREATE_FUNCTION)) names.add(m[1].toLowerCase());
	}
	return names;
}

/** Code with its comments taken out: whole-line `//`, `/* ... *\/` blocks and HTML comments. */
export function stripComments(text) {
	return text
		.replace(/\/\*[\s\S]*?\*\//g, ' ')
		.replace(/<!--[\s\S]*?-->/g, ' ')
		.replace(/^\s*\/\/.*$/gm, ' ');
}

/** Files whose quoted names are not the site calling the database. */
function wrapperScanSkips(file) {
	const rel = relative(ROOT, file).split(sep).join('/');
	return rel.startsWith('src/lib/server/connector/') || rel.startsWith('src/routes/dev/') || /\.generated\./.test(rel);
}

const METHOD = /export\s+(?:const|async\s+function|function)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|fallback)\b/g;

/** `src/routes/a/[x]/(group)/+server.ts` -> `/a/[x]`. */
function routeOf(file) {
	const rel = relative(join(ROOT, 'src/routes'), file).split(sep).slice(0, -1);
	const parts = rel.filter((seg) => !/^\(.*\)$/.test(seg));
	return '/' + parts.join('/');
}

export function buildInventory() {
	const files = walk(join(ROOT, 'src')).filter((f) => /\.(ts|js|svelte)$/.test(f));
	const functions = new Set();
	let singleLine = new Set();
	let dynamicSites = 0;
	const known = migrationFunctionNames();
	const wrapped = new Set();
	for (const file of files) {
		const text = readFileSync(file, 'utf8');
		if (!wrapperScanSkips(file)) {
			for (const m of stripComments(text).matchAll(QUOTED)) if (known.has(m[2])) wrapped.add(m[2]);
		}
		for (const m of text.matchAll(RPC_LITERAL)) functions.add(m[2]);
		for (const line of text.split('\n')) {
			for (const m of line.matchAll(RPC_LITERAL)) singleLine.add(m[2]);
		}
		for (const m of text.matchAll(RPC_ANY)) {
			if (m[1] !== 'undefined') dynamicSites += 1;
		}
	}
	for (const name of functions) wrapped.delete(name);
	for (const name of wrapped) functions.add(name);
	const servers = walk(join(ROOT, 'src/routes')).filter((f) => f.endsWith(`${sep}+server.ts`));
	const endpoints = servers
		.map((file) => {
			const text = readFileSync(file, 'utf8');
			const methods = [...new Set([...text.matchAll(METHOD)].map((m) => m[1]))].sort();
			return { route: routeOf(file), file: relative(ROOT, file).split(sep).join('/'), methods };
		})
		.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
	const pages = walk(join(ROOT, 'src/routes')).filter((f) => f.endsWith(`${sep}+page.svelte`)).length;
	return {
		functions: [...functions].sort(),
		endpoints,
		counts: {
			functions: functions.size,
			functions_single_line_grep: singleLine.size,
			functions_through_wrappers: wrapped.size,
			dynamic_rpc_call_sites: dynamicSites,
			endpoints: endpoints.length,
			pages
		}
	};
}

/** The comparable part: what a stale file is stale about. */
export function inventoryKey(inv) {
	return JSON.stringify({ functions: inv.functions, endpoints: inv.endpoints });
}

export function renderInventory(today = new Date()) {
	const built = buildInventory();
	let measured = today.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
	if (existsSync(INVENTORY_PATH)) {
		const prior = JSON.parse(readFileSync(INVENTORY_PATH, 'utf8'));
		if (inventoryKey(prior) === inventoryKey(built)) {
			measured = prior.measured;
			built.counts.pages = prior.counts?.pages ?? built.counts.pages;
		}
	}
	return {
		note: 'Generated by tools/connector/inventory.mjs (npm run connector:build). Do not edit by hand.',
		measured,
		counts: built.counts,
		functions: built.functions,
		endpoints: built.endpoints
	};
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const next = renderInventory();
	const text = JSON.stringify(next, null, '\t') + '\n';
	if (process.argv.includes('--check')) {
		const prior = existsSync(INVENTORY_PATH) ? JSON.parse(readFileSync(INVENTORY_PATH, 'utf8')) : null;
		if (!prior || inventoryKey(prior) !== inventoryKey(next)) {
			console.error('inventory.generated.json is stale: run npm run connector:build');
			process.exit(1);
		}
		console.log('inventory is current');
	} else {
		writeFileSync(INVENTORY_PATH, text);
		console.log(`inventory: ${next.counts.functions} functions, ${next.counts.endpoints} endpoints, ${next.counts.pages} pages (measured ${next.measured})`);
	}
}
