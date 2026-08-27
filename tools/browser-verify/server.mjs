/**
 * Boots `vite dev` for the harness and tears it down again.
 *
 * The public Supabase variables are handed to the CHILD PROCESS rather than
 * written to a .env file: SvelteKit merges process.env into $env/static/public,
 * so the dev server boots with no file created and nothing to restore. The
 * values are placeholders and no dev route reaches Supabase with them.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

export const PLACEHOLDER_ENV = {
	PUBLIC_SUPABASE_URL: 'https://example-ref.supabase.co',
	PUBLIC_SUPABASE_ANON_KEY: 'browser-verify-placeholder-anon-key'
};

async function probe(url, { timeoutMs = 2000 } = {}) {
	const ac = new AbortController();
	const t = setTimeout(() => ac.abort(), timeoutMs);
	try {
		const res = await fetch(url, { signal: ac.signal });
		return res.status;
	} catch {
		return null;
	} finally {
		clearTimeout(t);
	}
}

export async function startDevServer({ port = 5199, host = '127.0.0.1', cwd, bootTimeoutMs = 180_000, quiet = true } = {}) {
	const origin = `http://${host}:${port}`;

	const already = await probe(origin);
	if (already !== null) {
		return { origin, port, alreadyRunning: true, stop: async () => {}, log: () => '(reused an already-running server)' };
	}

	if (!existsSync(new URL('../../node_modules/vite', import.meta.url))) {
		throw new Error('node_modules/vite is missing. Run `npm install` first.');
	}

	const lines = [];
	const child = spawn(
		process.execPath,
		[new URL('../../node_modules/vite/bin/vite.js', import.meta.url).pathname, 'dev', '--port', String(port), '--host', host, '--strictPort'],
		{ cwd, env: { ...process.env, ...PLACEHOLDER_ENV, FORCE_COLOR: '0' }, stdio: ['ignore', 'pipe', 'pipe'] }
	);
	const grab = (buf) => {
		const s = buf.toString();
		lines.push(s);
		if (!quiet) process.stderr.write(s);
	};
	child.stdout.on('data', grab);
	child.stderr.on('data', grab);

	let exited = null;
	child.on('exit', (code, signal) => {
		exited = { code, signal };
	});

	const started = Date.now();
	/* Poll a REAL route rather than trusting the banner: vite prints "ready"
	   before the SSR module graph can answer, and a route that 500s on boot
	   would otherwise be measured as a page. */
	while (Date.now() - started < bootTimeoutMs) {
		if (exited) throw new Error(`vite dev exited early (code=${exited.code} signal=${exited.signal}):\n${lines.join('')}`);
		const status = await probe(`${origin}/dev/pathways`, { timeoutMs: 5000 });
		if (status !== null) {
			return {
				origin,
				port,
				alreadyRunning: false,
				bootMs: Date.now() - started,
				firstProbeStatus: status,
				log: () => lines.join(''),
				stop: async () => {
					child.kill('SIGTERM');
					await new Promise((r) => setTimeout(r, 400));
					if (exited === null) child.kill('SIGKILL');
				}
			};
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	child.kill('SIGKILL');
	throw new Error(`vite dev did not answer within ${bootTimeoutMs}ms:\n${lines.join('')}`);
}
