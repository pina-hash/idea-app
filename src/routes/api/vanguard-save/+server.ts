import { json } from '@sveltejs/kit';
import { mergeIntoStored, normalizeStored, type DeviceClass } from '$lib/vanguard-save';
import type { RequestHandler } from './$types';

/**
 * Per-user VANGUARD cloud-save API. Auth is via the cookie-based server
 * Supabase client (`locals.supabase`); requests without a session are rejected.
 *
 * The save is a structured v2 blob (see `$lib/vanguard-save`): shared
 * `progression` plus per-device-class `prefs`. POST merges an incoming device
 * snapshot into the stored blob so concurrent devices never clobber each other.
 */

function asDeviceClass(v: unknown): DeviceClass {
	return v === 'mobile' ? 'mobile' : 'desktop';
}

/** GET: return the current user's normalized v2 save blob. */
export const GET: RequestHandler = async ({ locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const { data, error } = await supabase
		.from('vanguard_saves')
		.select('data')
		.eq('user_id', claims.sub)
		.maybeSingle();

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ data: normalizeStored(data?.data) });
};

/**
 * POST: merge an incoming device snapshot into the stored blob and persist.
 * Body: `{ deviceClass: 'mobile'|'desktop', snapshot: { vanguard_*: string } }`.
 */
export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	let payload: { deviceClass?: unknown; snapshot?: unknown };
	try {
		payload = await request.json();
	} catch {
		return json({ error: 'invalid json' }, { status: 400 });
	}

	const snapshot = payload?.snapshot;
	if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
		return json({ error: 'expected { deviceClass, snapshot }' }, { status: 400 });
	}
	const deviceClass = asDeviceClass(payload?.deviceClass);

	// Load current row, merge, upsert. (A rare lost-update under truly
	// simultaneous writes is acceptable; progression merge is idempotent-ish.)
	const { data: existing } = await supabase
		.from('vanguard_saves')
		.select('data')
		.eq('user_id', claims.sub)
		.maybeSingle();

	const merged = mergeIntoStored(
		existing?.data,
		snapshot as Record<string, string>,
		deviceClass,
		new Date().toISOString()
	);

	const { error } = await supabase.from('vanguard_saves').upsert(
		{
			user_id: claims.sub,
			data: merged,
			updated_at: new Date().toISOString()
		},
		{ onConflict: 'user_id' }
	);

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ ok: true, data: merged });
};
