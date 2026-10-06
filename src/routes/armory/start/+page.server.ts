import type { PageServerLoad } from './$types';
import { armoryRelease } from '$lib/server/armory/releases';
import { loadMyDevices, loadMyProjects, signedInEmail } from '$lib/server/armory/page-loads';
import type { ArmoryProject } from '$lib/armory/view';

/**
 * The guided setup (ledger 0366). The download step needs no session (a
 * public release is anybody's); the computers, the projects and the mentor's
 * checklist are the signed-in caller's own reads.
 */
export const load: PageServerLoad = async ({ locals, url, parent, depends }) => {
	depends('armory:start');
	const email = signedInEmail(locals.claims);
	const found = await armoryRelease();
	const installer = found?.release.files.find((f) => f.kind === 'laptop') ?? null;
	const release =
		found && installer && (found.source === 'public' || email)
			? { tag: found.release.tag, size: installer.size, name: installer.name }
			: null;
	const flashOnly = url.searchParams.get('download') === 'none';
	if (!email) return { email: null, release, flashOnly, notReady: false, devices: [], projects: [] as ArmoryProject[], mentor: null };

	const [mine, devices, { isAdmin }] = await Promise.all([loadMyProjects(locals.supabase), loadMyDevices(locals.supabase), parent()]);
	const mentorProject = mine.projects.find((p) => p.role === 'mentor' && !p.archived) ?? null;
	let peopleAdded = false;
	if (mentorProject) {
		const { count } = await locals.supabase
			.from('armory_members')
			.select('email', { count: 'exact', head: true })
			.eq('project_id', mentorProject.id);
		peopleAdded = (count ?? 0) > 1;
	}
	const isMentor = isAdmin === true || mine.projects.some((p) => p.role === 'mentor');
	return {
		email,
		release,
		flashOnly,
		notReady: mine.notReady,
		devices,
		projects: mine.projects,
		mentor: isMentor
			? { canCreate: isAdmin === true, project: mentorProject, peopleAdded, origin: url.origin }
			: null
	};
};
