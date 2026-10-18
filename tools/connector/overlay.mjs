#!/usr/bin/env node
// tools/connector/overlay.mjs
//
// LAYER 3 OF THE CONNECTOR REGISTRY, compiled: the hand-written YAML files in
// src/lib/server/connector/registry/ become one JSON file,
// src/lib/server/connector/overlay.generated.json, which is what the server
// reads. The YAML stays the only thing anybody edits; the JSON exists because a
// runtime YAML parser in the serverless bundle buys nothing a build step does
// not, and `vite build` has no YAML loader of its own.
//
// Each file holds top-level keys of three kinds, and the file decides which:
//   tools.yaml       facade tools, keyed by the tool name
//   endpoints.yaml   server endpoints, keyed "<route>" (every method of it)
//   anything else    database functions, keyed by the function name

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const REGISTRY_DIR = join(ROOT, 'src/lib/server/connector/registry');
export const OVERLAY_PATH = join(ROOT, 'src/lib/server/connector/overlay.generated.json');

export function compileOverlay() {
	const files = readdirSync(REGISTRY_DIR).filter((f) => f.endsWith('.yaml')).sort();
	/** @type {{ functions: Record<string, any>, endpoints: Record<string, any>, tools: Record<string, any>, sources: Record<string, string> }} */
	const out = { functions: {}, endpoints: {}, tools: {}, sources: {} };
	const problems = [];
	for (const file of files) {
		const parsed = parse(readFileSync(join(REGISTRY_DIR, file), 'utf8')) ?? {};
		if (typeof parsed !== 'object' || Array.isArray(parsed)) {
			problems.push(`${file}: the top level must be a mapping`);
			continue;
		}
		const bucket = file === 'tools.yaml' ? out.tools : file === 'endpoints.yaml' ? out.endpoints : out.functions;
		for (const [key, entry] of Object.entries(parsed)) {
			const where = `${file}: ${key}`;
			if (bucket[key]) problems.push(`${where} is also in ${out.sources[key]}`);
			if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
				problems.push(`${where} must be a mapping`);
				continue;
			}
			bucket[key] = entry;
			out.sources[key] = file;
		}
	}
	return { overlay: out, problems };
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const { overlay, problems } = compileOverlay();
	if (problems.length) {
		console.error(problems.join('\n'));
		process.exit(1);
	}
	writeFileSync(OVERLAY_PATH, JSON.stringify(overlay, null, '\t') + '\n');
	console.log(
		`overlay: ${Object.keys(overlay.functions).length} functions, ${Object.keys(overlay.endpoints).length} endpoints, ${Object.keys(overlay.tools).length} tools`
	);
}
