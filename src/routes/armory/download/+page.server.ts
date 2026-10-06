import type { PageServerLoad } from './$types';
import { armoryRelease } from '$lib/server/armory/releases';
import { signedInEmail } from '$lib/server/armory/page-loads';

/**
 * Every file of the latest release, each with where the browser fetches it:
 * GitHub's own download when the release is public, this site's streaming
 * route when only the server's token can read it. No asset id and nothing that
 * names the token.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const email = signedInEmail(locals.claims);
	const found = await armoryRelease();
	if (!found) return { email, release: null };
	if (found.source === 'token' && !email) return { email, release: null };
	return {
		email,
		release: {
			tag: found.release.tag,
			files: found.release.files.map(({ name, size, sha256, kind }) => ({
				name,
				size,
				sha256,
				kind,
				href: found.source === 'public' ? (found.urls[name] ?? null) : `/armory/download/${encodeURIComponent(name)}`
			}))
		}
	};
};
