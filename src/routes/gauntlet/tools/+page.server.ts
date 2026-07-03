import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { TOOLS_MANIFEST_PATH, type ToolsManifest } from '$lib/gauntlet';

/**
 * GAUNTLET tools: the single page for both run tools (the SolidWorks add-in and
 * the VBA macros), plus the teacher-only author-capture macro. Auth-gated with
 * the rest of /gauntlet (hooks.server.ts). Every download is served straight
 * from static/tools; the manifest (also static) carries the versions, dates,
 * and changelog shown on the page so a stale local copy is obvious at a glance.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims }, fetch }) => {
	if (!claims) {
		redirect(303, '/');
	}

	const { data: profile } = await supabase
		.from('profiles')
		.select('full_name, role')
		.eq('id', claims.sub)
		.single();

	// Static manifest; fails soft to null so the page still renders its downloads.
	let manifest: ToolsManifest | null = null;
	try {
		const res = await fetch(TOOLS_MANIFEST_PATH);
		if (res.ok) manifest = (await res.json()) as ToolsManifest;
	} catch {
		manifest = null;
	}

	return {
		userName: profile?.full_name ?? claims.email ?? 'Signed in',
		userRole: profile?.role ?? 'student',
		isTeacher: profile?.role === 'teacher',
		manifest
	};
};
