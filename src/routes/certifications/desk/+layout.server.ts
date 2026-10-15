import { requireCertifier } from '$lib/server/certifications/gate';
import { peopleFromDesk } from '$lib/certifications/desk/desk';
import type { DeskJson } from '$lib/certifications/types';
import { dataOrNull, loadRpc } from './desk-server';
import type { LayoutServerLoad } from './$types';

/**
 * THE DESK'S GATE, STATED ONCE FOR THE AREA (ledger 0391; the
 * `/foundry/review` shape). Every page under `/certifications/desk` is behind
 * `requireCertifier`: admin, or any live row in `cert_authority`. A
 * non-certifier gets 404, never a 403 or a redirect, because the existence of
 * the desk is not public; an anonymous caller gets the same answer.
 *
 * EVERY PAGE STILL CALLS THE SAME GATE AS ITS OWN FIRST STATEMENT. SvelteKit
 * runs a layout's load and a page's load concurrently unless the page awaits
 * `parent()`, so this layout's 404 does not stop a page's reads from starting.
 *
 * The desk payload (`cert_desk`) is read here because two things need it on
 * every desk page: the student search box's list of names, and the queue the
 * desk page itself draws (which awaits `parent()` for it rather than reading
 * twice). `cert_my_authority` says whether the caller is an admin (the tabs
 * an admin alone sees) and which certifications they certify.
 *
 * A layout load never reads `url` (it would re-run on every navigation).
 */
interface MyAuthority {
	admin: boolean;
	certifications: { id: string; code: string; name: string }[];
}

export const load: LayoutServerLoad = async ({ locals, parent }) => {
	await requireCertifier(locals);
	const root = await parent();
	const [authority, desk] = await Promise.all([
		loadRpc<MyAuthority>(locals.supabase, 'cert_my_authority'),
		loadRpc<DeskJson>(locals.supabase, 'cert_desk')
	]);
	const myAuthority = dataOrNull(authority);
	const deskData = dataOrNull(desk);
	return {
		isAdmin: myAuthority?.admin ?? root.isAdmin ?? false,
		authority: myAuthority ?? { admin: root.isAdmin ?? false, certifications: [] },
		desk: deskData,
		deskUnavailable: !desk.ok,
		people: peopleFromDesk(deskData),
		callerEmail: (locals.claims?.email ?? '').toLowerCase() || null
	};
};
