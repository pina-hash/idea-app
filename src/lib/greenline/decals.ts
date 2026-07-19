/**
 * GREENLINE custom decals (Phase 6c): the client seam onto migration
 * 0051_greenline_decals.sql. Pure data-layer (no three.js, no Svelte), the
 * persistence.ts / frc gate-submissions.ts convention: each function takes a
 * Supabase client, does one thing, and fails soft when the migration is
 * unapplied or a read/write is blocked.
 *
 * Flow: a student uploads one PNG/JPG image (client-validated here, and again
 * server-side by the bucket's size/mime constraints) into their own folder of
 * the PRIVATE greenline-decals bucket, and upserts their single greenline_decals
 * row as 'pending'. The uploader can use the decal immediately in their own
 * context (storage RLS lets the owner read their own folder at any status);
 * OTHER players can read the image only once a teacher approves it. The teacher
 * decision is written ONLY by the greenline_decal_review SECURITY DEFINER RPC —
 * there is no direct client path that mutates another user's row.
 *
 * Every upload goes to a FRESH random path (the bucket has no update policy, so
 * objects are immutable); moving the row's path forces it back to pending, which
 * is what makes "replace an approved decal" re-enter moderation.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const GREENLINE_DECALS_TABLE = 'greenline_decals';
export const GREENLINE_DECALS_BUCKET = 'greenline-decals';

/** Client-side upload constraints. Size + mime are ALSO enforced server-side by
 * the bucket row (0051); pixel dimensions are client-only (the reviewer sees
 * the actual image, so moderation is the real content gate). */
export const DECAL_MAX_BYTES = 1024 * 1024; // 1 MiB, mirrors the bucket cap
export const DECAL_MAX_DIM = 1024; // px, either axis
export const DECAL_MIME_TYPES = ['image/png', 'image/jpeg'];

export type DecalStatus = 'pending' | 'approved' | 'needs_revision';

/** A user's own decal submission (one per user). */
export interface UserDecal {
	path: string;
	status: DecalStatus;
	feedback: string;
	submittedAt: string | null;
	reviewedAt: string | null;
}

/** A pending row for the teacher review queue. */
export interface PendingDecal {
	userId: string;
	path: string;
	submittedAt: string | null;
}

interface Row {
	user_id: string;
	path: string;
	status: DecalStatus;
	reviewer_feedback: string;
	submitted_at: string | null;
	reviewed_at: string | null;
}

/**
 * Validate a candidate file BEFORE uploading: PNG/JPG only, within the size
 * cap, and within the pixel-dimension cap (decoded to check). Returns a
 * human-readable rejection reason, or null when the file is acceptable.
 */
export async function validateDecalFile(file: File): Promise<string | null> {
	if (!DECAL_MIME_TYPES.includes(file.type)) {
		return 'Only PNG or JPG images are accepted.';
	}
	if (file.size > DECAL_MAX_BYTES) {
		const kb = Math.round(file.size / 1024);
		return `Image is too large (${kb} KB). The limit is ${Math.round(DECAL_MAX_BYTES / 1024)} KB.`;
	}
	const dims = await readImageDims(file);
	if (!dims) return 'That file could not be read as an image.';
	if (dims.w > DECAL_MAX_DIM || dims.h > DECAL_MAX_DIM) {
		return `Image is ${dims.w}x${dims.h}px. The limit is ${DECAL_MAX_DIM}px on either side.`;
	}
	return null;
}

/** Decode just enough of the file to learn its pixel size (null = not an image). */
async function readImageDims(file: File): Promise<{ w: number; h: number } | null> {
	try {
		if (typeof createImageBitmap === 'function') {
			const bmp = await createImageBitmap(file);
			const out = { w: bmp.width, h: bmp.height };
			bmp.close();
			return out;
		}
	} catch {
		return null;
	}
	return new Promise((resolve) => {
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve({ w: img.naturalWidth, h: img.naturalHeight });
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			resolve(null);
		};
		img.src = url;
	});
}

/**
 * Load the caller's own decal submission. `ready` is false when the read itself
 * fails (0051 unapplied), so callers can hide the feature rather than show a
 * broken panel; `decal` is null when the user has none.
 */
export async function loadOwnDecal(
	supabase: SupabaseClient,
	userId: string
): Promise<{ ready: boolean; decal: UserDecal | null }> {
	const { data, error } = await supabase
		.from(GREENLINE_DECALS_TABLE)
		.select('user_id, path, status, reviewer_feedback, submitted_at, reviewed_at')
		.eq('user_id', userId)
		.maybeSingle();
	if (error) return { ready: false, decal: null };
	if (!data) return { ready: true, decal: null };
	const r = data as Row;
	return {
		ready: true,
		decal: {
			path: r.path,
			status: r.status,
			feedback: r.reviewer_feedback ?? '',
			submittedAt: r.submitted_at,
			reviewedAt: r.reviewed_at
		}
	};
}

/**
 * Upload a new decal image and (re)submit it for review. The file goes to a
 * FRESH random path in the caller's own folder (objects are immutable — no
 * storage update policy), then the single row upserts to 'pending' with the
 * prior review cleared. Best-effort removes the previous object afterwards.
 * The caller should run validateDecalFile first; the bucket's own size/mime
 * constraints back it up server-side.
 */
export async function uploadDecal(
	supabase: SupabaseClient,
	userId: string,
	file: File,
	previousPath?: string | null
): Promise<{ decal: UserDecal | null; error: string | null }> {
	const ext = file.type === 'image/png' ? 'png' : 'jpg';
	const rand =
		typeof crypto !== 'undefined' && 'randomUUID' in crypto
			? crypto.randomUUID()
			: Math.random().toString(36).slice(2);
	const path = `${userId}/${rand}.${ext}`;

	const up = await supabase.storage
		.from(GREENLINE_DECALS_BUCKET)
		.upload(path, file, { contentType: file.type, upsert: false });
	if (up.error) return { decal: null, error: up.error.message };

	const nowIso = new Date().toISOString();
	const { error } = await supabase.from(GREENLINE_DECALS_TABLE).upsert(
		{
			user_id: userId,
			path,
			status: 'pending',
			reviewer_feedback: '',
			submitted_at: nowIso,
			reviewed_at: null
		},
		{ onConflict: 'user_id' }
	);
	if (error) {
		// Row write blocked (e.g. table missing): don't leave an orphan object.
		await supabase.storage.from(GREENLINE_DECALS_BUCKET).remove([path]);
		return { decal: null, error: error.message };
	}

	if (previousPath && previousPath !== path) {
		// Best-effort cleanup of the replaced image; a failure is harmless (the
		// abandoned object matches no approved row, so nobody else can read it).
		await supabase.storage.from(GREENLINE_DECALS_BUCKET).remove([previousPath]);
	}

	return {
		decal: { path, status: 'pending', feedback: '', submittedAt: nowIso, reviewedAt: null },
		error: null
	};
}

/** Remove the caller's decal entirely: row + best-effort storage cleanup. */
export async function removeDecal(
	supabase: SupabaseClient,
	userId: string,
	path?: string | null
): Promise<{ error: string | null }> {
	const { error } = await supabase
		.from(GREENLINE_DECALS_TABLE)
		.delete()
		.eq('user_id', userId);
	if (error) return { error: error.message };
	if (path) await supabase.storage.from(GREENLINE_DECALS_BUCKET).remove([path]);
	return { error: null };
}

/**
 * Resolve a decal storage path to a short-lived signed URL, or null when the
 * caller may not read it (storage RLS: owner always; teachers always; everyone
 * else only while the matching row is approved) or storage is unavailable.
 */
export async function decalImageUrl(
	supabase: SupabaseClient,
	path: string
): Promise<string | null> {
	const { data, error } = await supabase.storage
		.from(GREENLINE_DECALS_BUCKET)
		.createSignedUrl(path, 3600);
	if (error || !data?.signedUrl) return null;
	return data.signedUrl;
}

/**
 * Teacher: load every decal awaiting review, oldest first. `ready` is false if
 * the read fails (0051 unapplied), so the dashboard shows an apply-migration
 * note. Student display data is joined by the caller from the roster it has.
 */
export async function loadPendingDecals(
	supabase: SupabaseClient
): Promise<{ ready: boolean; rows: PendingDecal[] }> {
	const { data, error } = await supabase
		.from(GREENLINE_DECALS_TABLE)
		.select('user_id, path, submitted_at')
		.eq('status', 'pending')
		.order('submitted_at', { ascending: true });
	if (error) return { ready: false, rows: [] };
	const rows = (data ?? []).map((r) => ({
		userId: (r as Row).user_id,
		path: (r as Row).path,
		submittedAt: (r as Row).submitted_at
	}));
	return { ready: true, rows };
}

/**
 * Teacher: record a review decision through the greenline_decal_review
 * SECURITY DEFINER RPC — the ONLY write path onto another user's decal row
 * (is_teacher() is enforced inside the function). 'approve' makes the image
 * readable by every signed-in user; 'needs_revision' requires feedback the
 * student will see, and the student can re-upload to return to pending.
 */
export async function reviewDecal(
	supabase: SupabaseClient,
	userId: string,
	action: 'approve' | 'needs_revision',
	feedback = ''
): Promise<{ error: string | null }> {
	const { error } = await supabase.rpc('greenline_decal_review', {
		p_user_id: userId,
		p_action: action,
		p_feedback: feedback
	});
	return { error: error ? error.message : null };
}
