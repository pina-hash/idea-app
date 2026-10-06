import type { PageServerLoad } from './$types';
import { latestArmoryRelease } from '$lib/server/armory/releases';
import { signedInEmail } from '$lib/server/armory/page-loads';

/** The release list, without the asset ids or anything that names the token. */
export const load: PageServerLoad = async ({ locals }) => {
	const email = signedInEmail(locals.claims);
	if (!email) return { email: null, release: null };
	const release = await latestArmoryRelease();
	return {
		email,
		release: release
			? { tag: release.tag, files: release.files.map(({ name, size, sha256, kind }) => ({ name, size, sha256, kind })) }
			: null
	};
};
