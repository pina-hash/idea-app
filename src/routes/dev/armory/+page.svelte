<script lang="ts">
	/**
	 * /dev/armory: every Armory state, through the REAL components. With
	 * `?state=<name>` one state fills the page in its real frame (what the
	 * screenshots in docs/armory/screens/ are taken of); with no query every
	 * state is stacked under `[data-view]` for tools/browser-verify/routes/armory.mjs.
	 * The transports are in memory, so Add (by search and by email), role
	 * changes, Remove, Force check in, Rename, Archive and Delete forever all
	 * work here.
	 *
	 * THE PROJECT PAGE'S VIEWS: in single-state mode the view is read off the
	 * address (`?view=`), exactly as the real route reads it, so the tabs are
	 * real links. Stacked, each state keeps its own view in memory and the tabs
	 * hand their press to it (`onview`), because one address cannot hold twenty
	 * views at once.
	 *
	 * `?theme=space-white|matrix` forces the site theme the way
	 * /dev/foundry-room does: a harness holds no session, so the theme root
	 * decides "none" here and the attribute is the only way to measure a twin.
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import ArmoryConnect from '$lib/armory/ArmoryConnect.svelte';
	import ArmoryDevices from '$lib/armory/ArmoryDevices.svelte';
	import ArmoryDownload from '$lib/armory/ArmoryDownload.svelte';
	import ArmoryFileView from '$lib/armory/ArmoryFileView.svelte';
	import ArmoryFrame from '$lib/armory/ArmoryFrame.svelte';
	import ArmoryHowItWorks from '$lib/armory/ArmoryHowItWorks.svelte';
	import ArmoryNotice from '$lib/armory/ArmoryNotice.svelte';
	import ArmoryProjects from '$lib/armory/ArmoryProjects.svelte';
	import ArmoryProjectView from '$lib/armory/ArmoryProjectView.svelte';
	import ArmorySetup from '$lib/armory/ArmorySetup.svelte';
	import { isProjectView, type ProjectView } from '$lib/armory/nav';
	import {
		PEOPLE_SEARCH_LIMIT,
		peopleSearchOffered,
		purgeCanSend,
		type ArmoryPersonResult,
		type PeopleSearchAnswer,
		type PurgeAnswer
	} from '$lib/armory/team';
	import type { ArmoryFile, ArmoryMember, ArmoryProjectSummary, ArmoryRole, FileFilter } from '$lib/armory/view';
	import {
		ACTIVITY,
		ARCHIVED_PROJECT,
		checkoutsOf,
		CONNECT,
		DEVICES,
		DIRECTORY,
		EDITING_FILES,
		EDITING_SEEN,
		MANY_ACTIVITY,
		MANY_FILES,
		MANY_PROJECT,
		MANY_SEEN,
		MANY_STORAGE,
		manyCheckouts,
		MEMBERS_LINKED,
		NOW,
		PROJECT,
		PROJECTS,
		PURGE_PREVIEW,
		PURGE_PREVIEW_BLOCKED,
		QUIET_FILES,
		QUIET_SEEN,
		RELEASE,
		SIDE_COUNTS,
		SIDE_FILE,
		SIDE_FILES,
		SIDE_HISTORY,
		START_RELEASE,
		STORAGE,
		SUMMARIES,
		SYNCED_FILES,
		TEAM
	} from './fixtures';

	let { data }: { data: { only: string | null } } = $props();

	let small = $state<ArmoryMember[]>(MEMBERS_LINKED.map((m) => ({ ...m })));
	let big = $state<ArmoryMember[]>(TEAM.map((m) => ({ ...m })));
	let editing = $state<ArmoryFile[]>(EDITING_FILES.map((f) => ({ ...f })));
	let many = $state<ArmoryFile[]>(MANY_FILES.map((f) => ({ ...f })));
	let projectName = $state(PROJECT.name);
	let projectArchived = $state(false);
	let purged = $state<{ name: string; storageProblem: string | null } | null>(null);
	let hydrated = $state(false);
	onMount(() => (hydrated = true));

	const themeParam = page.url.searchParams.get('theme');
	$effect(() => {
		if (themeParam !== 'space-white' && themeParam !== 'matrix') return;
		const el = document.documentElement;
		const apply = () => el.setAttribute('data-theme', themeParam);
		apply();
		const t = setTimeout(apply, 0);
		return () => {
			clearTimeout(t);
			el.removeAttribute('data-theme');
		};
	});

	type Team = 'small' | 'big';
	const listOf = (team: Team) => (team === 'big' ? big : small);
	function setList(team: Team, next: ArmoryMember[]) {
		if (team === 'big') big = next;
		else small = next;
	}

	function addMemberTo(team: Team) {
		return async (email: string, role: ArmoryRole) => {
			if (!/^[^@\s]+@[^@\s]+$/.test(email)) return { ok: false as const, message: 'a valid email is required' };
			if (email.startsWith('nobody')) return { ok: false as const, message: 'only a mentor may grant mentor or cad_lead' };
			const members = listOf(team);
			const old = members.find((m) => m.email === email);
			if (old?.role === 'mentor' && role !== 'mentor' && members.filter((m) => m.role === 'mentor').length <= 1) {
				return { ok: false as const, message: 'A project always keeps at least one mentor.' };
			}
			if (old?.role === role) return { ok: false as const, message: 'nothing changed' };
			const person = DIRECTORY.find((p) => p.email === email);
			const added: ArmoryMember = old
				? { ...old, role }
				: person
					? { email, role, name: person.name, avatar: person.avatar, avatar_url: null, pathway: person.pathway, has_account: true, devices: [], devices_total: 0, checkouts: [] }
					: { email, role, has_account: false, devices: [], checkouts: [] };
			setList(team, [...members.filter((m) => m.email !== email), added]);
			return { ok: true as const };
		};
	}
	function removeMemberFrom(team: Team) {
		return async (email: string) => {
			const members = listOf(team);
			const mentors = members.filter((m) => m.role === 'mentor');
			if (mentors.length === 1 && mentors[0].email === email) {
				return { ok: false as const, message: 'A project always keeps at least one mentor.' };
			}
			setList(team, members.filter((m) => m.email !== email));
			return { ok: true as const };
		};
	}

	/** The in-memory people search: the shown name and the address's first part, every word, at most a dozen. */
	function searchIn(team: Team) {
		return async (query: string): Promise<PeopleSearchAnswer> => {
			await new Promise((r) => setTimeout(r, 80));
			const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
			const rows: ArmoryPersonResult[] = DIRECTORY.filter((p) => {
				const hay = `${p.name} ${p.email.split('@')[0].replace(/[._-]/g, ' ')}`.toLowerCase();
				return words.every((w) => hay.includes(w));
			})
				.slice(0, PEOPLE_SEARCH_LIMIT)
				.map((p) => ({
					email: p.email,
					name: p.name,
					avatar: p.avatar,
					avatar_url: null,
					pathway: p.pathway,
					member_role: listOf(team).find((m) => m.email === p.email)?.role ?? null
				}));
			return { ok: true, rows };
		};
	}

	async function takeBack(fileId: string) {
		editing = editing.map((f) => (f.id === fileId ? { ...f, lock: null } : f));
		many = many.map((f) => (f.id === fileId ? { ...f, lock: null } : f));
		return { ok: true as const };
	}
	async function rename(name: string) {
		projectName = name;
		return { ok: true as const };
	}
	async function setArchived(archived: boolean) {
		projectArchived = archived;
		return { ok: true as const };
	}
	async function purge(confirmName: string): Promise<PurgeAnswer> {
		await new Promise((r) => setTimeout(r, 150));
		return purgeCanSend(confirmName, ARCHIVED_PROJECT.name)
			? { ok: true, storageProblem: '3 stored files could not be confirmed removed and wait for the next cleanup.' }
			: { ok: false, message: 'The name you typed does not match the project name exactly, so nothing was deleted.' };
	}

	/** `student-mentor`: a mentor on a student's address, whom 0233's people search refuses. */
	type Viewer = 'mentor' | 'student' | 'student-mentor' | 'admin-viewer' | 'admin-mentor';
	interface ProjectState {
		key: string;
		label: string;
		view: ProjectView;
		files: () => ArmoryFile[];
		seen?: Record<string, number>;
		sides?: Record<string, number>;
		storageOff?: boolean;
		viewer?: Viewer;
		archived?: boolean;
		many?: boolean;
		team?: Team;
		/** A database before 0233: Force check in needs a computer, no names or presence. */
		pre033?: boolean;
		filter?: FileFilter;
		query?: string;
	}
	const PROJECT_STATES: ProjectState[] = [
		{ key: 'empty', label: 'A new project with no files yet', view: 'files', files: () => [] },
		{ key: 'editing', label: 'Two files checked out; a mentor can force a check in', view: 'files', files: () => editing, seen: EDITING_SEEN },
		{ key: 'editing-out', label: 'The Checked out view of the same two', view: 'checked-out', files: () => editing, seen: EDITING_SEEN },
		{ key: 'synced', label: 'Every file available (a student view)', view: 'files', files: () => SYNCED_FILES, viewer: 'student' },
		{ key: 'offline', label: 'A computer holding a file has gone quiet; a file with nothing saved yet', view: 'files', files: () => QUIET_FILES, seen: QUIET_SEEN },
		{ key: 'side', label: 'Files with side versions', view: 'files', files: () => SIDE_FILES, seen: EDITING_SEEN, sides: SIDE_COUNTS },
		{ key: 'storage-off', label: 'File storage not configured', view: 'files', files: () => SYNCED_FILES, storageOff: true },
		{ key: 'filter-out', label: 'The Checked out filter', view: 'files', files: () => EDITING_FILES, seen: EDITING_SEEN, filter: 'checked-out' },
		{ key: 'filter-mine', label: 'The Mine filter, for Ana', view: 'files', files: () => EDITING_FILES, seen: EDITING_SEEN, filter: 'mine', viewer: 'student' },
		{ key: 'search', label: 'A search across folders', view: 'files', files: () => SYNCED_FILES, query: 'drive' },
		{ key: 'archived', label: 'An archived project, for its mentor', view: 'files', files: () => SYNCED_FILES, archived: true },
		{ key: 'no-computer', label: 'A server before 0.3: Force check in needs a computer, and says so', view: 'checked-out', files: () => EDITING_FILES, seen: EDITING_SEEN, pre033: true },
		{ key: 'people', label: 'The small team, for its mentor: roles, the last mentor, adding', view: 'team', files: () => editing, seen: EDITING_SEEN },
		{ key: 'people-pre033', label: 'The team on a server before 0.3: addresses only, the paste box', view: 'team', files: () => editing, seen: EDITING_SEEN, pre033: true },
		{ key: 'people-student-mentor', label: 'A mentor on a student address: no search (0233 refuses it), the paste box and why', view: 'team', files: () => editing, seen: EDITING_SEEN, viewer: 'student-mentor' },
		{ key: 'activity', label: 'What happened lately', view: 'activity', files: () => editing, seen: EDITING_SEEN },
		{ key: 'settings', label: 'The Project view, for a mentor', view: 'project', files: () => SYNCED_FILES },
		{ key: 'many', label: '240 files in 12 folders, 60 checked out: the Files view arrives folded', view: 'files', files: () => many, seen: MANY_SEEN, many: true, team: 'big' },
		{ key: 'many-out', label: 'The same 60 checkouts as a table, 25 at a time', view: 'checked-out', files: () => many, seen: MANY_SEEN, many: true, team: 'big' },
		{ key: 'many-activity', label: 'Forty changes, fifteen at first', view: 'activity', files: () => many, seen: MANY_SEEN, many: true, team: 'big' },
		{ key: 'team', label: 'Eighteen people with every presence, for the mentor: find people by name', view: 'team', files: () => many, seen: MANY_SEEN, many: true, team: 'big' },
		{ key: 'team-student', label: 'The same team, for a student: no addresses, no adding', view: 'team', files: () => many, seen: MANY_SEEN, many: true, team: 'big', viewer: 'student' },
		{ key: 'purge', label: 'An archived project, for a site admin: Delete forever', view: 'project', files: () => SYNCED_FILES, archived: true, viewer: 'admin-mentor' },
		{ key: 'purge-live', label: 'A live project, for a site admin: Delete forever waits for an archive', view: 'project', files: () => SYNCED_FILES, viewer: 'admin-mentor' },
		{ key: 'purge-blocked', label: 'Another project\'s history names a version here: the key is held, with the reason', view: 'project', files: () => SYNCED_FILES, archived: true, viewer: 'admin-mentor' },
		{ key: 'admin-viewer', label: 'A site admin who is not a member: reads every view, can force a check in', view: 'checked-out', files: () => editing, seen: EDITING_SEEN, viewer: 'admin-viewer' },
		{ key: 'admin-viewer-team', label: 'The same admin on the Team view: finds and adds people, as a mentor would', view: 'team', files: () => editing, seen: EDITING_SEEN, viewer: 'admin-viewer' }
	];
	const OTHER = [
		'projects',
		'projects-connected',
		'projects-admin',
		'projects-empty',
		'start',
		'start-connected',
		'start-mentor',
		'start-flash',
		'devices',
		'how',
		'file-side',
		'file-no-storage',
		'connect',
		'connect-bad',
		'download',
		'download-none'
	];
	const only = $derived(data.only);
	const single = $derived(PROJECT_STATES.find((s) => s.key === only) ?? null);

	/** Stacked: each state's view in memory. */
	let views = $state<Record<string, ProjectView>>(Object.fromEntries(PROJECT_STATES.map((s) => [s.key, s.view])));
	const urlView = $derived(page.url.searchParams.get('view'));
	const viewOf = (s: ProjectState): string => (single ? (isProjectView(urlView) ? urlView : s.view) : views[s.key]);
	const hrefOf = (s: ProjectState) => (v: ProjectView) =>
		`?state=${s.key}&view=${v}${themeParam ? `&theme=${themeParam}` : ''}${page.url.searchParams.get('signed') === '1' ? '&signed=1' : ''}`;

	const roleOf = (s: ProjectState): ArmoryRole | null =>
		s.viewer === 'student' ? 'student' : s.viewer === 'admin-viewer' ? null : 'mentor';
	const MENTOR_ON_STUDENT_ADDRESS = 'ben.okafor@boscotech.net';
	const projectOf = (s: ProjectState): ArmoryProjectSummary =>
		s.archived
			? { ...ARCHIVED_PROJECT, role: roleOf(s) }
			: s.many
				? { ...MANY_PROJECT, role: roleOf(s) }
				: { ...PROJECT, name: projectName, archived: projectArchived, role: roleOf(s) };
	const meOf = (s: ProjectState) =>
		s.viewer === 'student'
			? 'ana.reyes@boscotech.net'
			: s.viewer === 'student-mentor'
				? MENTOR_ON_STUDENT_ADDRESS
				: s.viewer === 'admin-viewer'
					? 'mila.santos@boscotech.edu'
					: 'apina@boscotech.edu';
	const membersOf = (s: ProjectState): ArmoryMember[] => {
		const list = listOf(s.team ?? 'small');
		return s.pre033 ? list.map((m) => ({ email: m.email, role: m.role })) : list;
	};
</script>

{#snippet projectState(s: ProjectState)}
	{#if s.storageOff}
		<ArmoryNotice title="File storage is not switched on yet." testid="armory-storage-off">
			Computers can connect and you can see who has what checked out, but saved files will not upload until
			Mr. Pina finishes setting up storage. Your work stays on your computer until then.
		</ArmoryNotice>
	{/if}
	{@const project = projectOf(s)}
	{@const role = project.role}
	{@const admin = s.viewer === 'admin-viewer' || s.viewer === 'admin-mentor'}
	{@const mayForce = role === 'mentor' || role === 'cad_lead' || admin}
	{@const files = s.files()}
	{@const team = s.team ?? 'small'}
	<ArmoryProjectView
		{project}
		{files}
		members={membersOf(s)}
		sideCounts={s.sides ?? {}}
		deviceSeen={s.seen ?? {}}
		checkouts={s.many ? manyCheckouts(files) : checkoutsOf(files)}
		activity={s.many ? MANY_ACTIVITY : files.length ? ACTIVITY : []}
		storage={s.many ? MANY_STORAGE : files.length ? STORAGE : { bytes: 0, files: 0 }}
		now={NOW}
		myEmail={meOf(s)}
		live={s.key === 'offline' ? 'polling' : 'live'}
		view={viewOf(s)}
		viewHref={hrefOf(s)}
		onview={single ? null : (v) => (views[s.key] = v)}
		isAdmin={admin}
		adminReach={admin && !s.pre033}
		teamReady={!s.pre033}
		addMember={addMemberTo(team)}
		removeMember={removeMemberFrom(team)}
		takeBack={mayForce && !s.pre033 ? takeBack : null}
		takeBackNeedsComputer={mayForce && !!s.pre033}
		rename={role === 'mentor' ? rename : null}
		setArchived={role === 'mentor' || admin ? setArchived : null}
		searchPeople={!s.pre033 && peopleSearchOffered({ isAdmin: admin, role, email: meOf(s) }) ? searchIn(team) : null}
		loadTeam={s.pre033 ? null : async () => listOf(team)}
		refresh={async () => {}}
		purge={admin && !s.pre033 ? (name) => purge(name) : null}
		purgePreview={admin && !s.pre033 ? async () => (s.key === 'purge-blocked' ? PURGE_PREVIEW_BLOCKED : PURGE_PREVIEW) : null}
		onpurged={(name, storageProblem) => (purged = { name, storageProblem })}
		initialFilter={s.filter ?? 'all'}
		initialQuery={s.query ?? ''}
	/>
	{#if purged && (s.key === 'purge' || single)}
		<p class="ar-message" data-testid="harness-purged">The route would now open /armory, saying: {purged.name} is deleted forever. {purged.storageProblem ?? ''}</p>
	{/if}
{/snippet}

{#snippet other(key: string)}
	{#if key === 'projects'}
		<ArmoryProjects projects={SUMMARIES.filter((p) => p.role !== null)} devices={[]} now={NOW} create={async () => ({ ok: true as const, id: PROJECT.id })} />
	{:else if key === 'projects-connected'}
		<ArmoryProjects projects={SUMMARIES.filter((p) => p.role !== null)} devices={DEVICES} now={NOW} />
		<div class="ar-two">
			<ArmoryDevices devices={DEVICES} now={NOW} />
			<ArmoryHowItWorks folded={true} />
		</div>
	{:else if key === 'projects-admin'}
		<ArmoryProjects
			projects={SUMMARIES}
			devices={DEVICES}
			now={NOW}
			create={async () => ({ ok: true as const, id: PROJECT.id })}
			orphans={1390}
			sweep={async () => ({ ok: true as const, swept: 400, left: 990, problem: null })}
			deleted={{ name: 'Robot 2024', storageProblem: '3 stored files could not be confirmed removed and wait for the next cleanup.' }}
		/>
	{:else if key === 'projects-empty'}
		<ArmoryProjects projects={[]} now={NOW} />
	{:else if key === 'start'}
		<ArmorySetup release={START_RELEASE} devices={[]} projects={[]} watching={true} />
	{:else if key === 'start-connected'}
		<ArmorySetup release={START_RELEASE} devices={DEVICES} projects={PROJECTS.filter((p) => p.role === 'student')} />
	{:else if key === 'start-mentor'}
		<ArmorySetup
			release={START_RELEASE}
			devices={DEVICES.slice(0, 1)}
			projects={PROJECTS}
			mentor={{ canCreate: true, project: PROJECT, peopleAdded: false, origin: 'https://ideabosco.com' }}
		/>
	{:else if key === 'start-flash'}
		<ArmorySetup release={null} devices={[]} projects={[]} flashOnly={true} mentor={{ canCreate: true, project: null, peopleAdded: false, origin: 'https://ideabosco.com' }} />
	{:else if key === 'devices'}
		<ArmoryDevices devices={DEVICES} now={NOW} />
		<ArmoryDevices devices={[]} now={NOW} />
	{:else if key === 'how'}
		<ArmoryHowItWorks />
	{:else if key === 'file-side'}
		<ArmoryFileView
			file={SIDE_FILE}
			history={SIDE_HISTORY}
			now={NOW}
			deviceSeen={EDITING_SEEN}
			checkouts={checkoutsOf(EDITING_FILES)}
			downloadHref={(v) => `/dev/armory?download=${v}`}
		/>
	{:else if key === 'file-no-storage'}
		<ArmoryFileView file={SIDE_FILE} history={SIDE_HISTORY} now={NOW} deviceSeen={EDITING_SEEN} />
	{:else if key === 'connect'}
		<ArmoryConnect request={CONNECT} problem={null} email="ana.reyes@boscotech.net" name="Ana Reyes" action="#" onSwitch={() => {}} />
	{:else if key === 'connect-bad'}
		<ArmoryConnect request={null} problem="port must be an integer from 1024 to 65535." email="ana.reyes@boscotech.net" />
	{:else if key === 'download'}
		<ArmoryDownload release={RELEASE} />
	{:else if key === 'download-none'}
		<ArmoryDownload release={null} />
	{/if}
{/snippet}

<div data-armory-hydrated={hydrated ? 'yes' : undefined}>
	{#if single}
		{@const project = projectOf(single)}
		<ArmoryFrame title={project.name} crumbs={[{ href: '/dev/armory', label: 'Armory' }]}>
			{@render projectState(single)}
		</ArmoryFrame>
	{:else if only && OTHER.includes(only)}
		<ArmoryFrame
			title={only.startsWith('file')
				? SIDE_FILE.name
				: only.startsWith('connect')
					? 'Connect a computer'
					: only.startsWith('download')
						? 'Get the Armory app'
						: only.startsWith('start')
							? 'Set up Armory'
							: 'IDEA Armory'}
			crumbs={[{ href: '/dev/armory', label: 'Armory' }]}
			lead={only.startsWith('projects') ? "Your team's CAD files on every computer, checked out and checked in, with every version kept." : null}
		>
			{@render other(only)}
		</ArmoryFrame>
	{:else}
		<ArmoryFrame title="Armory harness" lead="Every state, stacked. Add ?state=<name> for one state in its real frame.">
			{#each PROJECT_STATES as s (s.key)}
				<section data-view={s.key} style="margin-bottom: 3rem">
					<p class="ar-crumbs">State: {s.key} · {s.label}</p>
					{@render projectState(s)}
				</section>
			{/each}
			{#each OTHER as key (key)}
				<section data-view={key} style="margin-bottom: 3rem">
					<p class="ar-crumbs">State: {key}</p>
					{@render other(key)}
				</section>
			{/each}
		</ArmoryFrame>
	{/if}
</div>
