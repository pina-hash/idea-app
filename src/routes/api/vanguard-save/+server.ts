import { json } from '@sveltejs/kit';
import { mergeIntoStored, normalizeStored, type DeviceClass, type StoredSave } from '$lib/vanguard-save';
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

	// Compare-and-set merge loop: read the row with its updated_at, merge the
	// incoming snapshot, then write only if updated_at still matches. A racing
	// write bumps updated_at, the CAS misses, and we re-read and re-merge, so a
	// concurrent device can never silently clobber progression. (Assumes the
	// existing updated_at column, which the prior upsert already wrote.)
	let lastMerged: StoredSave | null = null;
	for (let attempt = 0; attempt < 3; attempt++) {
		const { data: existing, error: readErr } = await supabase
			.from('vanguard_saves')
			.select('data, updated_at')
			.eq('user_id', claims.sub)
			.maybeSingle();
		if (readErr) {
			return json({ error: readErr.message }, { status: 500 });
		}

		const nowIso = new Date().toISOString();
		const merged = mergeIntoStored(existing?.data, snapshot as Record<string, string>, deviceClass, nowIso);
		lastMerged = merged;

		if (existing) {
			const { data: updated, error: updErr } = await supabase
				.from('vanguard_saves')
				.update({ data: merged, updated_at: nowIso })
				.eq('user_id', claims.sub)
				.eq('updated_at', (existing as { updated_at: string }).updated_at)
				.select('user_id');
			if (updErr) {
				return json({ error: updErr.message }, { status: 500 });
			}
			if (updated && updated.length > 0) {
				return json({ ok: true, data: merged });
			}
			continue; // CAS miss: another write landed first, re-read and retry.
		}

		const { error: insErr } = await supabase
			.from('vanguard_saves')
			.insert({ user_id: claims.sub, data: merged, updated_at: nowIso });
		if (!insErr) {
			return json({ ok: true, data: merged });
		}
		// Insert conflict: the row was created concurrently, retry as an update.
	}

	// Contended past the retry budget: fall back to an unconditional upsert. The
	// merge is union/max, so a stale base loses at most a preference, not progress.
	const { error } = await supabase.from('vanguard_saves').upsert(
		{ user_id: claims.sub, data: lastMerged, updated_at: new Date().toISOString() },
		{ onConflict: 'user_id' }
	);
	if (error) {
		return json({ error: error.message }, { status: 500 });
	}
	return json({ ok: true, data: lastMerged });
};
