import { updated } from '$app/state';

/**
 * THE PAGE-SIDE SEAMS OF `/dev/deploy-safety`, dev only (every page that
 * imports this sits under a layout that 404s in production).
 *
 * Everything here writes RAW facts to `sessionStorage`, which survives the
 * reload under test and belongs to one tab; the judgements live in the browser
 * specs. Each seam installs once per DOCUMENT (a `window` flag), which is what
 * makes "one `document` entry" mean "one full page load" and not "one mount".
 */

export const DS_LOG_KEY = 'deploy-safety:log';
export const DS_UPLOAD_MS_KEY = 'deploy-safety:upload-ms';

export type DsKind =
	| 'document'
	| 'verdict'
	| 'ack'
	| 'upload-start'
	| 'upload-recorded'
	| 'mark';

export interface DsEntry {
	kind: DsKind;
	/** Epoch ms. For a `document`, the navigation start of that document. */
	at: number;
	path?: string;
	reason?: string;
	reload?: boolean;
	type?: string;
	from?: string | null;
	to?: string | null;
	name?: string;
	label?: string;
}

type DsWindow = Window & {
	__dsDocumentSeen?: boolean;
	__dsVerdicts?: boolean;
	__dsShim?: boolean;
	__dsFlipUpdated?: () => Promise<string>;
	__dsMark?: (label: string) => number;
	__dsLog?: () => DsEntry[];
};

export function readLog(): DsEntry[] {
	try {
		const raw = sessionStorage.getItem(DS_LOG_KEY);
		const parsed: unknown = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? (parsed as DsEntry[]) : [];
	} catch {
		return [];
	}
}

export function appendLog(entry: DsEntry): void {
	try {
		sessionStorage.setItem(DS_LOG_KEY, JSON.stringify([...readLog(), entry]));
	} catch {
		// A harness that cannot write its log reports nothing, and the spec
		// reads that as a failure of the instrument rather than a pass.
	}
}

/** One `document` entry per full page load, never per mount. */
export function recordDocumentLoad(): void {
	const w = window as DsWindow;
	if (w.__dsDocumentSeen) return;
	w.__dsDocumentSeen = true;
	appendLog({ kind: 'document', at: performance.timeOrigin, path: location.pathname });
	w.__dsMark = (label: string) => {
		const at = Date.now();
		appendLog({ kind: 'mark', at, label, path: location.pathname });
		return at;
	};
	w.__dsLog = readLog;
	w.__dsFlipUpdated = flipUpdated;
}

/**
 * Every verdict `DeployWatch` reaches, with the rule that answered. The
 * listener is on `window` for the life of the document, so a navigation away
 * from the harness (to `/fsp/live`) is still recorded.
 */
export function recordVerdicts(): void {
	const w = window as DsWindow;
	if (w.__dsVerdicts) return;
	w.__dsVerdicts = true;
	window.addEventListener('idea:deploy-verdict', (event) => {
		const d = (event as CustomEvent).detail as {
			reload: boolean;
			reason: string;
			type: string;
			from?: string | null;
			to?: string | null;
		};
		appendLog({
			kind: 'verdict',
			at: Date.now(),
			reload: d.reload,
			reason: d.reason,
			type: d.type,
			from: d.from ?? null,
			to: d.to ?? null
		});
	});
}

/**
 * THE ONE WAY A DEV BUILD CAN SAY "A NEW VERSION IS LIVE". Kit's dev branch
 * hard-wires `updated.check()` to false, so the flag is written on the SAME
 * state module the app reads (`$app/state`'s `updated` is a getter over it),
 * found among this document's loaded resources. It relies on a kit-internal
 * path, so it THROWS when the module is not there rather than pretending: a
 * spec that flips nothing must fail, never pass.
 */
export async function flipUpdated(): Promise<string> {
	const url = performance
		.getEntriesByType('resource')
		.map((e) => e.name)
		.find((u) => /\/@sveltejs\/kit\/src\/runtime\/client\/state\.svelte\.js/.test(u));
	if (!url) throw new Error('kit state module not found among loaded resources');
	const mod = (await import(/* @vite-ignore */ url)) as { updated?: { current: boolean } };
	if (!mod.updated || typeof mod.updated !== 'object') {
		throw new Error(`kit state module at ${url} has no \`updated\``);
	}
	mod.updated.current = true;
	if (!updated.current) throw new Error('wrote the kit flag but $app/state still reads false');
	return `updated.current is true (via ${new URL(url).pathname})`;
}

/**
 * THE TWO CLASSROOM UPLOAD ENDPOINTS, ANSWERED IN MEMORY. The real
 * `uploadClassroomFile` runs unchanged: it asks the sign route (answered here
 * with a signed URL pointing at `/dev/deploy-safety/upload`, held open for the
 * "Slow uploads" delay), PUTs the bytes there over a real request, and records
 * them (answered here, and logged). Every other request passes straight
 * through.
 */
export function installUploadShim(): void {
	const w = window as DsWindow;
	if (w.__dsShim) return;
	w.__dsShim = true;
	const passthrough = window.fetch.bind(window);
	window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(
			typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
			location.href
		);
		const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
		if (method === 'POST' && url.pathname === '/api/classroom/submission-file/sign') {
			const body = JSON.parse(String(init?.body ?? '{}')) as { filename?: string };
			const ms = Number(sessionStorage.getItem(DS_UPLOAD_MS_KEY)) || 0;
			const key = `sub-deploy/${crypto.randomUUID()}.png`;
			appendLog({ kind: 'upload-start', at: Date.now(), name: body.filename ?? '' });
			return Response.json({
				ok: true,
				bucket: 'submission-files',
				key,
				signed_url: `/dev/deploy-safety/upload?ms=${ms}&key=${encodeURIComponent(key)}`
			});
		}
		if (method === 'POST' && url.pathname === '/api/classroom/submission-file') {
			const body = JSON.parse(String(init?.body ?? '{}')) as {
				filename?: string;
				block_id?: string | null;
				storage_key?: string;
				size_bytes?: number;
			};
			appendLog({ kind: 'upload-recorded', at: Date.now(), name: body.filename ?? '' });
			return Response.json({
				ok: true,
				file: {
					id: crypto.randomUUID(),
					submission_id: 'sub-deploy',
					block_id: body.block_id ?? null,
					caption: null,
					filename: body.filename ?? 'photo.png',
					mime_type: 'application/octet-stream',
					size_bytes: body.size_bytes ?? null,
					storage_key: body.storage_key ?? null
				}
			});
		}
		return passthrough(input, init);
	};
}
