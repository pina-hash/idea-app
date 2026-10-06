<script lang="ts">
	/**
	 * /dev/armory: every Armory state, through the REAL components. With
	 * `?state=<name>` one state fills the page in its real frame (what the
	 * screenshots in docs/armory/screens/ are taken of); with no query every
	 * state is stacked under `[data-view]` for tools/browser-verify/routes/armory.mjs.
	 * The member transports are in memory, so Add and Remove work here.
	 */
	import { onMount } from 'svelte';
	import ArmoryConnect from '$lib/armory/ArmoryConnect.svelte';
	import ArmoryDownload from '$lib/armory/ArmoryDownload.svelte';
	import ArmoryFileView from '$lib/armory/ArmoryFileView.svelte';
	import ArmoryFrame from '$lib/armory/ArmoryFrame.svelte';
	import ArmoryNotice from '$lib/armory/ArmoryNotice.svelte';
	import ArmoryProjects from '$lib/armory/ArmoryProjects.svelte';
	import ArmoryProjectView from '$lib/armory/ArmoryProjectView.svelte';
	import type { ArmoryFile, ArmoryMember, ArmoryRole } from '$lib/armory/view';
	import {
		CONNECT,
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
		STUDENT_PROJECT,
		SYNCED_FILES
	} from './fixtures';

	let { data }: { data: { only: string | null } } = $props();

	let members = $state<ArmoryMember[]>([...MEMBERS]);
	let hydrated = $state(false);
	onMount(() => (hydrated = true));

	async function addMember(email: string, role: ArmoryRole) {
		if (!/^[^@\s]+@[^@\s]+$/.test(email)) return { ok: false as const, message: 'a valid email is required' };
		members = [...members.filter((m) => m.email !== email), { email, role }];
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

	interface ProjectState {
		key: string;
		label: string;
		files: ArmoryFile[];
		seen?: Record<string, number>;
		sides?: Record<string, number>;
		storage?: boolean;
		student?: boolean;
	}
	const PROJECT_STATES: ProjectState[] = [
		{ key: 'empty', label: 'A new project with no files yet', files: [] },
		{ key: 'editing', label: 'Two files being edited right now', files: EDITING_FILES, seen: EDITING_SEEN },
		{ key: 'synced', label: 'Every file saved, nobody editing (a student view)', files: SYNCED_FILES, student: true },
		{ key: 'offline', label: 'A computer holding a file has gone quiet; a file waiting for its first upload', files: QUIET_FILES, seen: QUIET_SEEN },
		{ key: 'side', label: 'Files with side versions', files: SIDE_FILES, seen: EDITING_SEEN, sides: SIDE_COUNTS },
		{ key: 'storage-off', label: 'File storage not configured', files: SYNCED_FILES, storage: false }
	];
	const OTHER = ['projects', 'projects-empty', 'file-side', 'connect', 'connect-bad', 'download', 'download-none'];
	const only = $derived(data.only);
	const single = $derived(PROJECT_STATES.find((s) => s.key === only) ?? null);
</script>

{#snippet projectState(s: ProjectState)}
	{#if s.storage === false}
		<ArmoryNotice title="File storage is not switched on yet." testid="armory-storage-off">
			Computers can connect and you can see who is editing what, but saved files will not upload until
			Mr. Pina finishes setting up storage. Your work stays on your computer until then.
		</ArmoryNotice>
	{/if}
	<ArmoryProjectView
		project={s.student ? STUDENT_PROJECT : PROJECT}
		files={s.files}
		{members}
		sideCounts={s.sides ?? {}}
		deviceSeen={s.seen ?? {}}
		now={NOW}
		myEmail={s.student ? 'ana.reyes@boscotech.net' : 'apina@boscotech.edu'}
		live={s.key === 'offline' ? 'polling' : 'live'}
		{addMember}
		{removeMember}
	/>
{/snippet}

{#snippet other(key: string)}
	{#if key === 'projects'}
		<ArmoryProjects projects={PROJECTS} create={async () => ({ ok: true as const, id: PROJECT.id })} />
	{:else if key === 'projects-empty'}
		<ArmoryProjects projects={[]} />
	{:else if key === 'file-side'}
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
		<ArmoryFrame title={PROJECT.name} crumbs={[{ href: '/dev/armory', label: 'Armory' }]} lead="Season 2026. The files below are the ones in C:\IDEA\Armory\Robot 2026 on every connected computer.">
			{@render projectState(single)}
		</ArmoryFrame>
	{:else if only && OTHER.includes(only)}
		<ArmoryFrame
			title={only.startsWith('file') ? SIDE_FILE.name : only.startsWith('connect') ? 'Connect a computer' : only.startsWith('download') ? 'Get the Armory app' : 'IDEA Armory'}
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
