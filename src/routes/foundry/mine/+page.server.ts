import { error } from '@sveltejs/kit';
import { foundryPlayCountMap, type FoundryPlayCountRow } from '$lib/foundry/telemetry';
import type { FoundryApp, FoundryAppSummary } from '$lib/foundry/transports';
import type { PageServerLoad } from './$types';

/**
 * THE STUDENT'S OWN APPS.
 *
 * Both reads run as the CALLER through `locals.supabase`, and neither adds an
 * identity filter of its own beyond the one the RPC's signature already takes:
 * `foundry_list_apps` is a definer whose population predicate is
 * `_foundry_app_in_population`, and passing `p_owner` here is ATTRIBUTION ("my
 * rows"), not authorization. The gate is the function.
 *
 * `p_include_unpublished` is what makes this the owner's view rather than the
 * gallery's: an app with no approved version is invisible to everyone else and
 * is most of what a student has while they are still working.
 *
 * SELECTION COMES OFF THE URL so an app is linkable and a reload lands where
 * the student was. This is a `+page.server.ts` rather than a layout load for
 * exactly that reason -- a layout load must never read `url`.
 */
/**
 * A CLOSURE DOES NOT REACH THIS SURFACE, AND IT USED TO.
 *
 * This load short-circuited to an empty payload whenever any class the student
 * is enrolled in had closed the Foundry, which meant one teacher closing one
 * period took a student's OWN apps, their own versions, their own play
 * figures, their own share links and their own delete away from them in every
 * other class and at home. The site cannot tell which class somebody is
 * sitting in (there is no bell schedule in this schema and nothing records a
 * presence), so a closure that reaches here reaches everywhere and never
 * stops until somebody opens it.
 *
 * NOTHING ON THIS PAGE RUNS AN APP. `FoundryMine` mounts no `AppStage`; the
 * preview link beside a version goes to `/foundry/preview`, a `+server.ts`
 * that no layout gate ever covered and that has always answered a closed
 * student regardless. So blocking this bought nothing against the behaviour a
 * closure is for and cost the student their own record.
 *
 * `FOUNDRY_CLOSURE_BLOCKS` in `$lib/foundry/access` is the one statement of
 * which surfaces stand down, and the gallery is the only one. The layout still
 * renders the class and the note as a notice above this page, so a student
 * reading their shelf is told why the gallery tab is answering a refusal.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const uid = locals.claims?.sub ?? null;
	if (!uid) return { apps: [] as FoundryAppSummary[], selected: null, uid: '' };

	const { data: apps, error: listErr } = await locals.supabase.rpc('foundry_list_apps', {
		p_owner: uid,
		p_include_unpublished: true
	});
	if (listErr) error(500, listErr.message);

	const slug = url.searchParams.get('app');
	let selected: FoundryApp | null = null;

	if (slug) {
		const { data, error: getErr } = await locals.supabase.rpc('foundry_get_app', {
			p_slug: slug,
			p_include_unpublished: true
		});
		if (getErr) error(500, getErr.message);
		// "Not found" and "not yours" answer identically: the population
		// predicate returned nothing and there is nothing to tell apart.
		if (!data) error(404, 'Not found');
		selected = data as FoundryApp;
	}

	/**
	 * THE OWNER ROLL-UP'S INPUT (decision 07). `foundry_play_counts()` answers
	 * for the CALLER'S OWN population, which here is their own apps including
	 * the unpublished ones -- so the dashboard is arithmetic over this and
	 * needs no aggregate RPC of its own.
	 *
	 * A MISSING OR FAILED READ DEGRADES TO NO COUNTS, exactly as the gallery's
	 * does: the panel renders zeroes and its coverage sentence rather than
	 * taking a working page down for a figure nobody came for.
	 */
	const { data: countRows } = await locals.supabase.rpc('foundry_play_counts');

	return {
		apps: (apps ?? []) as FoundryAppSummary[],
		selected,
		uid,
		playCounts: foundryPlayCountMap((countRows ?? null) as FoundryPlayCountRow[] | null)
	};
};
