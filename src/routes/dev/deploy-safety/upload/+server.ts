import { dev } from '$app/environment';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * DEV ONLY. The stand-in for Supabase Storage's signed upload URL, so the REAL
 * `uploadClassroomFile` PUTs real bytes over a real request that stays in
 * flight for as long as the harness asks (`?ms=`). A reload kills this request
 * exactly as it would kill the real one, which is the whole point of having it.
 * An endpoint re-checks its own gate: a layout load does not run for it.
 */
export const PUT: RequestHandler = async ({ request, url }) => {
	if (!dev) error(404, 'Not found');
	const bytes = (await request.arrayBuffer()).byteLength;
	const ms = Math.min(20_000, Math.max(0, Number(url.searchParams.get('ms')) || 0));
	await new Promise((resolve) => setTimeout(resolve, ms));
	return json({ Key: url.searchParams.get('key') ?? 'deploy-safety', bytes, heldMs: ms });
};
