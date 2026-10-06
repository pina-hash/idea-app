<script lang="ts">
	/**
	 * /dev/armory: every Armory state, through the REAL components. With
	 * `?state=<name>` one state fills the page in its real frame (what the
	 * screenshots in docs/armory/screens/v2/ are taken of); with no query every
	 * state is stacked under `[data-view]` for tools/browser-verify/routes/armory.mjs.
	 * The transports are in memory, so Add, role changes, Remove, Take back,
	 * Rename and Archive all work here.
	 */
	import { onMount } from 'svelte';
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
	import type { ArmoryFile, ArmoryMember, ArmoryProject, ArmoryRole, FileFilter } from '$lib/armory/view';
	import {
		ACTIVITY,
		ARCHIVED_PROJECT,
		checkoutsOf,
		CONNECT,
		DEVICES,
		EDITING_FILES,
		EDITING_SEEN,
		MEMBERS,
		NOW,
		PROJECT,
		PROJECTS,
		QUIET_FILES,
		QUIET_SEEN,
		RELEASE,
		SIDE_COUNTS,
		SIDE_FILE,
		SIDE_FILES,
		SIDE_HISTORY,
		START_RELEASE,
		STORAGE,
		STUDENT_PROJECT,
		SYNCED_FILES
	} from './fixtures';

	let { data }: { data: { only: string | null } } = $props();

	let members = $state<ArmoryMember[]>([...MEMBERS]);
	let editing = $state<ArmoryFile[]>(EDITING_FILES.map((f) => ({ ...f })));
	let projectName = $state(PROJECT.name);
	let projectArchived = $state(false);
	let hydrated = $state(false);
	onMount(() => (hydrated = true));

	async function addMember(email: string, role: ArmoryRole) {
		if (!/^[^@\s]+@[^@\s]+$/.test(email)) return { ok: false as const, message: 'a valid email is required' };
		if (email.startsWith('nobody')) return { ok: false as const, message: 'only a mentor may grant mentor or cad_lead' };
		const old = members.find((m) => m.email === email);
		if (old?.role === 'mentor' && role !== 'mentor' && members.filter((m) => m.role === 'mentor').length <= 1) {
			return { ok: false as const, message: 'A project always keeps at least one mentor.' };
		}
		if (old?.role === role) return { ok: false as const, message: 'nothing changed' };
		members = [...members.filter((m) => m.email !== email), { email, role }].sort((a, b) => a.email.localeCompare(b.email));
		return { ok: true as const };
	}
	async function removeMember(email: string) {
		const mentors = members.filter((m) => m.role === 'mentor');
		if (mentors.length === 1 && mentors[0].email === email) {
			return { ok: false as const, message: 'A project always keeps at least one mentor.' };
		}
		members = members.filter((m) => m.email !== email);
		return { ok: true as const };
	}
	async function takeBack(fileId: string) {
		editing = editing.map((f) => (f.id === fileId ? { ...f, lock: null } : f));
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

	interface ProjectState {
		key: string;
		label: string;
		files: () => ArmoryFile[];
		seen?: Record<string, number>;
		sides?: Record<string, number>;
		storage?: boolean;
		student?: boolean;
		archived?: boolean;
		noComputer?: boolean;
		filter?: FileFilter;
		query?: string;
	}
	const PROJECT_STATES: ProjectState[] = [
		{ key: 'empty', label: 'A new project with no files yet', files: () => [] },
		{ key: 'editing', label: 'Two files checked out; a mentor can take them back', files: () => editing, seen: EDITING_SEEN },
		{ key: 'synced', label: 'Every file available (a student view)', files: () => SYNCED_FILES, student: true },
		{ key: 'offline', label: 'A computer holding a file has gone quiet; a file with nothing saved yet', files: () => QUIET_FILES, seen: QUIET_SEEN },
		{ key: 'side', label: 'Files with side versions', files: () => SIDE_FILES, seen: EDITING_SEEN, sides: SIDE_COUNTS },
		{ key: 'storage-off', label: 'File storage not configured', files: () => SYNCED_FILES, storage: false },
		{ key: 'filter-out', label: 'The Checked out filter', files: () => EDITING_FILES, seen: EDITING_SEEN, filter: 'checked-out' },
		{ key: 'filter-mine', label: 'The Mine filter, for Ana', files: () => EDITING_FILES, seen: EDITING_SEEN, filter: 'mine', student: true },
		{ key: 'search', label: 'A search across folders', files: () => SYNCED_FILES, query: 'drive' },
		{ key: 'archived', label: 'An archived project, for its mentor', files: () => SYNCED_FILES, archived: true },
		{ key: 'no-computer', label: 'A mentor with no connected computer: Take back says why it is absent', files: () => EDITING_FILES, seen: EDITING_SEEN, noComputer: true }
	];
	const OTHER = [
		'projects',
		'projects-connected',
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
	const projectOf = (s: ProjectState): ArmoryProject =>
		s.archived ? { ...ARCHIVED_PROJECT, role: 'mentor' } : s.student ? STUDENT_PROJECT : { ...PROJECT, name: projectName, archived: projectArchived };
</script>

{#snippet projectState(s: ProjectState)}
	{#if s.storage === false}
		<ArmoryNotice title="File storage is not switched on yet." testid="armory-storage-off">
			Computers can connect and you can see who has what checked out, but saved files will not upload until
			Mr. Pina finishes setting up storage. Your work stays on your computer until then.
		</ArmoryNotice>
	{/if}
	{@const project = projectOf(s)}
	<ArmoryProjectView
		{project}
		files={s.files()}
		{members}
		sideCounts={s.sides ?? {}}
		deviceSeen={s.seen ?? {}}
		checkouts={checkoutsOf(s.files())}
		activity={s.files().length ? ACTIVITY : []}
		storage={s.files().length ? STORAGE : { bytes: 0, files: 0 }}
		now={NOW}
		myEmail={s.student ? 'ana.reyes@boscotech.net' : 'apina@boscotech.edu'}
		live={s.key === 'offline' ? 'polling' : 'live'}
		{addMember}
		{removeMember}
		takeBack={!s.student && !s.noComputer ? takeBack : null}
		takeBackNeedsComputer={!!s.noComputer}
		rename={!s.student ? rename : null}
		setArchived={!s.student ? setArchived : null}
		initialFilter={s.filter ?? 'all'}
		initialQuery={s.query ?? ''}
	/>
{/snippet}

{#snippet other(key: string)}
	{#if key === 'projects'}
		<ArmoryProjects projects={PROJECTS} devices={[]} create={async () => ({ ok: true as const, id: PROJECT.id })} />
	{:else if key === 'projects-connected'}
		<ArmoryProjects projects={PROJECTS} devices={DEVICES} />
	{:else if key === 'projects-empty'}
		<ArmoryProjects projects={[]} />
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
		<ArmoryConnect request={CONNECT} problem={null} email="ana.reyes@boscotech.net" action="#" />
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
		<ArmoryFrame
			title={single.archived ? ARCHIVED_PROJECT.name : projectName}
			crumbs={[{ href: '/dev/armory', label: 'Armory' }]}
			lead={`These files are the ones in C:\\IDEA\\Armory\\${single.archived ? ARCHIVED_PROJECT.name : projectName} on every connected computer.`}
		>
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
