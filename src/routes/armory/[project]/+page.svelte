<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import ArmoryFrame from '$lib/armory/ArmoryFrame.svelte';
	import ArmoryNotice from '$lib/armory/ArmoryNotice.svelte';
	import ArmoryProjectView from '$lib/armory/ArmoryProjectView.svelte';
	import ArmorySignIn from '$lib/armory/ArmorySignIn.svelte';
	import { armorySignIn } from '$lib/armory/sign-in';
	import { watchArmoryProject, type LiveMode } from '$lib/armory/live';
	import { projectViewFromHash, projectViewHref } from '$lib/armory/nav';
	import { PEOPLE_SEARCH_LIMIT, type ArmoryPersonResult, type ArmoryPurgePreview, type PeopleSearchAnswer, type PurgeAnswer } from '$lib/armory/team';
	import { armoryNotReady, type ArmoryMember, type ArmoryRole } from '$lib/armory/view';
	import { isSignedOutFailure, PollSignedOut } from '$lib/classroom/poll';
	import { trackInFlight } from '$lib/shell/deploy-safety';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let live = $state<LiveMode>('off');

	const view = $derived(data.view);
	const isAdmin = $derived(page.data.isAdmin === true);

	/*
	 * THE VIEW IS THE COMPONENT'S TO READ, NEVER THE LOAD'S: `?view=` is read
	 * here off `page.url`, so a tab is a query change that reruns no load. `who`
	 * may say `me` (it names nobody); a holder's address never goes in the URL.
	 */
	const shownView = $derived(page.url.searchParams.get('view'));
	const who = $derived(page.url.searchParams.get('who') === 'me' ? 'me' : 'all');

	/** One write. `refresh: false` holds the page's reload (a batch of adds reloads once, at the end). */
	async function rpc(name: string, args: Record<string, unknown>, opts: { refresh?: boolean } = {}) {
		const { data: answer, error } = await data.supabase.rpc(name, { ...args, p_operation: crypto.randomUUID() });
		if (error) return { ok: false as const, message: error.message };
		if (opts.refresh !== false) await invalidate('armory:project');
		return answer === false ? { ok: false as const, message: 'nothing changed' } : { ok: true as const };
	}

	const role = $derived(view?.project.role ?? null);
	const isMentor = $derived(role === 'mentor');
	const v033 = $derived(view?.v033Ready === true);
	/*
	 * FORCE CHECK IN IS `armory_break_lock` (contract C8 and Armory v0.3 item
	 * 2): mentors, CAD leads, and a site admin once 0233 admits one. 0233 also
	 * accepts a NULL computer from the website, and `v033Ready` (the summaries
	 * rung answering) is what licenses sending it, because the widening ships
	 * in the same file. On an older database the RPC still names one of the
	 * caller's own registered computers, so the site sends the one most recently
	 * heard from, and with none the control is absent and the view says why.
	 */
	const mayForce = $derived(role === 'mentor' || role === 'cad_lead' || (isAdmin && v033));
	const takeDevice = $derived(v033 ? null : (view?.devices[0]?.id ?? null));
	const forceNeedsComputer = $derived(mayForce && !v033 && !takeDevice);

	const searchPeople = $derived(
		view && v033 && (isAdmin || isMentor)
			? async (query: string): Promise<PeopleSearchAnswer> => {
					const { data: rows, error } = await data.supabase.rpc('armory_people_search', {
						p_project: view.project.id,
						p_query: query,
						p_limit: PEOPLE_SEARCH_LIMIT
					});
					if (error) {
						if (armoryNotReady(error)) return { ok: false, reason: 'unavailable' };
						if (error.code === '42501') return { ok: false, reason: 'refused' };
						return { ok: false, reason: 'failed' };
					}
					return { ok: true, rows: (Array.isArray(rows) ? rows : []) as ArmoryPersonResult[] };
				}
			: null
	);

	const loadTeam = $derived(
		view && v033
			? async (): Promise<ArmoryMember[] | null> => {
					const { data: rows, error } = await data.supabase.rpc('armory_team_status', { p_project: view.project.id });
					if (error) {
						if (isSignedOutFailure(error)) throw new PollSignedOut();
						return null;
					}
					return Array.isArray(rows) ? (rows as ArmoryMember[]) : null;
				}
			: null
	);

	const purge = $derived(
		view && isAdmin && v033
			? async (confirmName: string, operation: string): Promise<PurgeAnswer> => {
					try {
						const response = await trackInFlight(
							fetch('/api/armory/purge', {
								method: 'POST',
								headers: { 'content-type': 'application/json' },
								body: JSON.stringify({ projectId: view.project.id, confirmName, operation })
							}),
							'armory delete forever'
						);
						const body = (await response.json().catch(() => null)) as
							| { ok: true; storageProblem: string | null }
							| { ok: false; message: string }
							| null;
						if (response.ok && body?.ok) return { ok: true, storageProblem: body.storageProblem ?? null };
						if (body && !body.ok && body.message) return { ok: false, message: body.message };
						return { ok: false, message: 'That did not work, and nothing was deleted. Try again in a minute.' };
					} catch {
						return { ok: false, message: 'The request did not reach the server. Nothing was deleted; check the connection and try again.' };
					}
				}
			: null
	);

	const purgePreview = $derived(
		view && isAdmin && v033
			? async (): Promise<ArmoryPurgePreview | null> => {
					const { data: preview, error } = await data.supabase.rpc('armory_purge_preview', { p_project: view.project.id, p_folder: null });
					return error || !preview || typeof preview !== 'object' ? null : (preview as ArmoryPurgePreview);
				}
			: null
	);

	onMount(() => {
		// The address before this round sent people to `#people`; that is the Team view now.
		const legacy = projectViewFromHash(window.location.hash);
		if (legacy) void goto(projectViewHref(legacy), { replaceState: true, noScroll: true });
		const v = untrack(() => data.view);
		if (!v || !data.supabase) return;
		return watchArmoryProject(
			data.supabase,
			v.project.id,
			() => data.view?.cursor ?? 0,
			() => void invalidate('armory:project'),
			(mode) => (live = mode)
		);
	});
</script>

<svelte:head><title>{view ? `${view.project.name} // Armory` : 'Armory // IDEA'}</title></svelte:head>

{#if !data.email}
	<ArmoryFrame title="IDEA Armory" crumbs={[{ href: '/armory', label: 'Armory' }]}>
		<ArmorySignIn reason="Sign in to see this project." onSignIn={() => armorySignIn(data.supabase)} />
	</ArmoryFrame>
{:else if !view}
	<ArmoryFrame title="IDEA Armory" crumbs={[{ href: '/armory', label: 'Armory' }]}>
		<ArmoryNotice title="Armory is not switched on yet." testid="armory-not-ready">
			Mr. Pina is still setting it up. Check back soon.
		</ArmoryNotice>
	</ArmoryFrame>
{:else}
	<ArmoryFrame
		title={view.project.name}
		crumbs={[{ href: '/armory', label: 'Armory' }]}
		lead={`These files are the ones in C:\\IDEA\\Armory\\${view.project.name} on every connected computer.`}
	>
		{#if !view.storageReady}
			<ArmoryNotice title="File storage is not switched on yet." testid="armory-storage-off">
				Computers can connect and you can see who has what checked out, but saved files will not upload
				until Mr. Pina finishes setting up storage. Your work stays on your computer until then.
			</ArmoryNotice>
		{/if}
		<ArmoryProjectView
			project={view.project}
			files={view.files}
			members={view.members}
			sideCounts={view.sideCounts}
			deviceSeen={view.deviceSeen}
			checkouts={view.checkouts}
			activity={view.activity}
			storage={view.storage}
			now={view.now}
			myEmail={data.email}
			{live}
			view={shownView}
			{isAdmin}
			teamReady={view.teamReady}
			initialHolder={who}
			addMember={(email: string, r: ArmoryRole, opts?: { refresh?: boolean }) =>
				rpc('armory_add_member', { p_project: view.project.id, p_email: email, p_role: r }, opts)}
			removeMember={(email: string) => rpc('armory_remove_member', { p_project: view.project.id, p_email: email })}
			takeBack={mayForce && (v033 || takeDevice)
				? (fileId: string) => rpc('armory_break_lock', { p_file: fileId, p_device: takeDevice })
				: null}
			takeBackNeedsComputer={forceNeedsComputer}
			rename={isMentor ? (name: string) => rpc('armory_rename_project', { p_project: view.project.id, p_name: name }) : null}
			setArchived={isMentor || (isAdmin && v033)
				? (archived: boolean) => rpc('armory_set_project_archived', { p_project: view.project.id, p_archived: archived })
				: null}
			{searchPeople}
			{loadTeam}
			refresh={() => invalidate('armory:project')}
			{purge}
			{purgePreview}
			onpurged={(name: string, storageProblem: string | null) =>
				goto('/armory', { state: { armoryDeleted: name, armoryStorageProblem: storageProblem } })}
		/>
	</ArmoryFrame>
{/if}
