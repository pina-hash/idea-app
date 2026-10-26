import { error, json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { announce, control, listen, lock, read, save } from '../_fake';
import type { RequestHandler } from './$types';

/**
 * THE HARNESS'S ONLY BACKEND (ledger 0436): POST runs one team call against the
 * in-memory stand-in, GET is the stream of payload-free notices. Dev only.
 */
export const POST: RequestHandler = async ({ request }) => {
	if (!dev) error(404, 'Not found');
	const body = (await request.json()) as Record<string, unknown>;
	const as = String(body.as ?? '');
	switch (body.op) {
		case 'read':
			return json(read(as));
		case 'lock':
			return json(lock(as, String(body.block), body.take === true));
		case 'save':
			return json(save(as, String(body.block), body.value));
		case 'announce':
			announce(String(body.key), String(body.topic));
			return json({ ok: true });
		default:
			return json(control(String(body.op), (body.args ?? {}) as Record<string, string>));
	}
};

export const GET: RequestHandler = async () => {
	if (!dev) error(404, 'Not found');
	let stop: (() => void) | null = null;
	const stream = new ReadableStream({
		start(controller) {
			const enc = new TextEncoder();
			controller.enqueue(enc.encode(': open\n\n'));
			stop = listen((n) => controller.enqueue(enc.encode(`data: ${JSON.stringify(n)}\n\n`)));
		},
		cancel() {
			stop?.();
		}
	});
	return new Response(stream, {
		headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' }
	});
};
