import { error } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import { driveConfigured } from '$lib/server/notebook-drive';
import type { PageServerLoad } from './$types';

/**
 * Admin-only smoke test for the notebook Drive upload chain (0069): one real
 * file through the EXISTING /api/notebook/upload route, before Session 2
 * builds the student-facing flow on top of it. This page adds nothing to the
 * data layer; it only calls what already exists.
 *
 * Same gate as /admin/drive-connect: 404 to everyone else (signed out
 * included), never a redirect, and deliberately NOT in authedPrefixes, so
 * probing the URL reveals nothing.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) error(404, 'Not found');
	if (!(await isAdmin(supabase, claims.sub))) error(404, 'Not found');

	return {
		// Boolean only, never the credentials (they stay inside
		// src/lib/server/notebook-drive.ts).
		driveConfigured: driveConfigured()
	};
};
