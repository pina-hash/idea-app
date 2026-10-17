import type { SupabaseClient } from '@supabase/supabase-js';
import {
	submitAnonymousFeedback,
	submitFeedback,
	type FeedbackEntry,
	type FeedbackResult
} from './feedback';
import type { ScreenshotUpload } from './screenshot';

/**
 * THE FEEDBACK WINDOW'S HARNESS SINK, READ ONLY IN DEV (ledger 0396).
 *
 * `/feedback/embed?sink=memory` (which only `/dev/coins` and
 * `/dev/feedback/assignment` ask for, and which a production build cannot
 * reach because `dev` is a build-time constant) files a report here instead of
 * the database, so a harness can drive the Ledger's and an assignment's real
 * window end to end with no session and no Supabase.
 *
 * THE ROW IS BUILT BY THE REAL WRITER. `submit` hands the entry to the same
 * `submitFeedback` every signed-in report on the site goes through, against a
 * client whose only method records what it was asked to insert. So what lands
 * on the framing page's `__ideaFeedbackSink` is the exact row the database would
 * have been sent, which is what lets a browser spec prove a report from the
 * Ledger carries the same fields as one from the home page's box rather than
 * asserting it.
 *
 * A SIGNED-OUT WINDOW FILES THROUGH THE REAL ANONYMOUS WRITER (review round 3).
 * When `anonymous()` answers true the entry goes to `submitAnonymousFeedback`, the same
 * function `feedbackWriter` hands every signed-out visitor, over a `fetch` that
 * records the request instead of sending it: the record is kind `anonymous`
 * and its value is the endpoint and the parsed body `/api/feedback` would have
 * received (the contact, no account, `tried` and the horizon folded into
 * `meta`). It used to file a signed-out report through the signed-in writer,
 * so the harness's row carried an account and no contact and could not show a
 * signed-out row's shape at all.
 *
 * The sink lives on the FRAMING page (same origin), so it survives the frame
 * and a spec reads it where it is looking. A screenshot is recorded by name,
 * size and type and answered with a key shaped like a real one.
 */
export interface EmbedDevSinkRecord {
	kind: 'entry' | 'row' | 'anonymous' | 'screenshot';
	value: unknown;
}

function sinkHost(): { __ideaFeedbackSink?: EmbedDevSinkRecord[] } {
	try {
		return window.parent as unknown as { __ideaFeedbackSink?: EmbedDevSinkRecord[] };
	} catch {
		return window as unknown as { __ideaFeedbackSink?: EmbedDevSinkRecord[] };
	}
}

function record(kind: EmbedDevSinkRecord['kind'], value: unknown): void {
	const host = sinkHost();
	(host.__ideaFeedbackSink ??= []).push({ kind, value: JSON.parse(JSON.stringify(value)) });
}

/** The harness's stand-in account: the shape of a uuid, so the key shape below is real. */
export const EMBED_DEV_USER = '00000000-0000-4000-8000-0000000000dd';

export function embedDevTransports(
	options: {
		/** Whether the window is signed out, asked at each send (the page's session can arrive late). */
		anonymous?: () => boolean;
	} = {}
): {
	submit: (entry: FeedbackEntry) => Promise<FeedbackResult>;
	uploadScreenshot: (file: File) => Promise<ScreenshotUpload>;
} {
	const recorder = {
		from: () => ({
			insert: async (row: Record<string, unknown>) => {
				record('row', row);
				return { error: null };
			}
		})
	} as unknown as SupabaseClient;
	/* What the anonymous route answers when it took a report. */
	const recordingFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		let body: unknown = null;
		try {
			body = JSON.parse(String(init?.body ?? 'null'));
		} catch {
			body = String(init?.body ?? '');
		}
		record('anonymous', { endpoint: String(input), method: init?.method ?? 'GET', body });
		return new Response(JSON.stringify({ ok: true }), {
			status: 200,
			headers: { 'content-type': 'application/json' }
		});
	}) as typeof fetch;
	let seq = 0;
	return {
		submit: async (entry) => {
			record('entry', entry);
			return options.anonymous?.()
				? submitAnonymousFeedback(entry, recordingFetch)
				: submitFeedback(recorder, EMBED_DEV_USER, entry);
		},
		uploadScreenshot: async (file) => {
			seq += 1;
			record('screenshot', { name: file.name, size: file.size, type: file.type });
			return {
				path: `${EMBED_DEV_USER}/00000000-0000-4000-8000-${String(seq).padStart(12, '0')}.png`,
				error: null,
				retryable: false,
				type: 'image/png'
			};
		}
	};
}
