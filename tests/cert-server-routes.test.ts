// tests/cert-server-routes.test.ts
//
// EVERY `+server.ts` UNDER /api/certifications EXPORTS ONLY HTTP METHODS
// (ledger 0391). SvelteKit throws `Invalid export` for anything else, and
// CLAUDE.md records that BOTH local checks pass such a file: the first sign is
// production. This sweep reads the source and reddens on the day somebody
// exports a helper for a test. It also pins that every route re-checks its
// caller itself (a gate, a claims check or the scheduler check), because a
// layout guard never runs for an endpoint.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('../src/routes/api/certifications', import.meta.url).pathname;
const ALLOWED = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'fallback', 'prerender', 'trailingSlash', 'config', 'entries']);

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, out);
		else if (name === '+server.ts') out.push(p);
	}
	return out;
}

const EXPECTED = ['award', 'correct', 'evidence/sign', 'evidence/[...path]', 'jobs/[job]', 'export', 'package/export/[id]', 'package/import'];

describe('/api/certifications routes', () => {
	const files = walk(ROOT);

	it('are exactly the eight the contract names', () => {
		const rel = files.map((f) => f.slice(ROOT.length + 1).replace(/\/\+server\.ts$/, '')).sort();
		expect(rel).toEqual([...EXPECTED].sort());
	});

	it('export only HTTP methods', () => {
		let checked = 0;
		for (const file of files) {
			const src = readFileSync(file, 'utf8');
			const names = [...src.matchAll(/^export\s+(?:const|let|var|function|async function|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
			expect(names.length, file).toBeGreaterThan(0);
			for (const n of names) expect(ALLOWED.has(n) || n.startsWith('_'), `${file} exports ${n}`).toBe(true);
			expect(src).not.toMatch(/^export\s+\{/m);
			checked += 1;
		}
		expect(checked).toBe(EXPECTED.length);
	});

	it('each re-checks its caller before working, and reads no secret at import time', () => {
		for (const file of files) {
			const src = readFileSync(file, 'utf8');
			const gated = /requireCertifier\(|requireCertAdmin\(|if \(!claims\)|schedulerAuthorized\(/.test(src);
			expect(gated, file).toBe(true);
			// Secrets are read inside $lib/server/certifications at call time; a route never touches `env` itself.
			expect(src, file).not.toMatch(/\$env\/dynamic\/private/);
			expect(src, file).not.toMatch(/\$env\/static\/private/);
			expect(src, file).not.toMatch(/console\.log/);
		}
	});
});
