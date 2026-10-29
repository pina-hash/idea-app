<script lang="ts">
	/**
	 * LINK A PROJECT TO A CLASS (ledger 0463, migration 0319). One key links the
	 * whole roster: students as student, the teacher as instructor, and a
	 * Last_First folder for each student. Two presses, with the cost said before
	 * the second, because there is no reverse that takes a roster back off.
	 * Every transport the page leaves out removes its control.
	 */
	import { untrack } from 'svelte';
	import { classLinkErrorWords, linkResultWords, teamFoldersWords, type ArmoryClassInfo, type ArmoryClassFolder, type ArmorySectionChoice, type ClassAnswer } from './class-link';

	let {
		loadClass,
		loadSections = null,
		link = null,
		unlink = null,
		makeTeamFolders = null,
		loadFolders = null
	}: {
		loadClass: () => Promise<ArmoryClassInfo | null>;
		loadSections?: (() => Promise<ArmorySectionChoice[]>) | null;
		link?: ((sectionId: string) => Promise<ClassAnswer>) | null;
		unlink?: (() => Promise<ClassAnswer>) | null;
		makeTeamFolders?: (() => Promise<ClassAnswer>) | null;
		loadFolders?: (() => Promise<ArmoryClassFolder[] | null>) | null;
	} = $props();

	let info = $state<ArmoryClassInfo | null>(null);
	let read = $state(false);
	let sections = $state<ArmorySectionChoice[]>([]);
	let folders = $state<ArmoryClassFolder[] | null>(null);
	let chosen = $state('');
	let armed = $state<'link' | 'unlink' | null>(null);
	let busy = $state(false);
	let message = $state('');
	let bad = $state(false);

	async function reload() {
		info = await loadClass();
		read = true;
		folders = loadFolders ? await loadFolders() : null;
	}

	$effect(() => {
		untrack(() => {
			reload().catch(() => (read = true));
			loadSections?.().then((s) => (sections = s), () => (sections = []));
		});
	});

	const chosenSection = $derived(sections.find((s) => s.id === chosen) ?? null);

	async function run(kind: 'link' | 'unlink' | 'teams') {
		if (busy) return;
		if ((kind === 'link' || kind === 'unlink') && armed !== kind) {
			armed = kind;
			message = '';
			return;
		}
		busy = true;
		try {
			const r =
				kind === 'link' ? await link!(chosen) : kind === 'unlink' ? await unlink!() : await makeTeamFolders!();
			bad = !r.ok;
			message = r.ok ? (kind === 'teams' ? teamFoldersWords(r.result) : kind === 'link' ? linkResultWords(r.result) : 'Unlinked. Nobody was added or removed, and every folder stays.') : classLinkErrorWords(r);
			armed = null;
			await reload();
		} finally {
			busy = false;
		}
	}
</script>

<div class="ar-panel ar-setting" data-testid="armory-class">
	<h3 class="section-label">Class</h3>
	{#if !read}
		<p class="ar-message">Reading the class…</p>
	{:else if info}
		<p class="ar-big" data-testid="armory-class-now">{info.course_code} {info.label}</p>
		<p class="ar-message">
			Follows the class roster: {info.roster} {info.roster === 1 ? 'student' : 'students'}, {info.folders} class {info.folders === 1 ? 'folder' : 'folders'}.
			A student who joins the class joins here with their own folder. A student who leaves loses access and their files stay.
		</p>
		<div class="ar-row-actions">
			{#if makeTeamFolders}
				<button class="btn secondary ar-btn" type="button" aria-disabled={busy} data-testid="armory-class-teams" onclick={() => run('teams')}>
					Make team folders from class teams
				</button>
			{/if}
			{#if unlink}
				<button class={`btn ar-btn ${armed === 'unlink' ? 'danger' : 'secondary'}`} type="button" aria-disabled={busy} data-testid="armory-class-unlink" onclick={() => run('unlink')}>
					{armed === 'unlink' ? 'Unlink? Press again' : 'Unlink from class'}
				</button>
			{/if}
		</div>
		{#if armed === 'unlink'}<p class="ar-message bad" role="alert">The project stops following the roster. Nobody is removed and every folder stays.</p>{/if}
	{:else if link && loadSections}
		<p class="ar-message">Link a class and its roster becomes this project's team: students as Student, the teacher as Instructor, and each student gets a folder of their own named Last_First that only they can save into.</p>
		<label class="ar-field">
			<span>Class</span>
			<select class="plate-well" bind:value={chosen} onchange={() => (armed = null)} data-testid="armory-class-pick">
				<option value="">Choose a class</option>
				{#each sections as s (s.id)}
					<option value={s.id}>{s.course_code} {s.label}</option>
				{/each}
			</select>
		</label>
		<div class="ar-row-actions">
			<button class={`btn ar-btn ${armed === 'link' ? 'danger' : ''}`} type="button" aria-disabled={busy || !chosenSection} data-testid="armory-class-link" onclick={() => chosenSection && run('link')}>
				{armed === 'link' && chosenSection ? `Link ${chosenSection.course_code} ${chosenSection.label}? Press again` : 'Link to a class'}
			</button>
		</div>
		{#if armed === 'link' && chosenSection}
			<p class="ar-message bad" role="alert">Everyone on that roster is added at once and gets a folder. Anyone already on this project keeps their role.</p>
		{/if}
	{:else}
		<p class="ar-message">Not linked to a class. A site admin, or the class's teacher who is a mentor here, can link one.</p>
	{/if}
	{#if message}<p class={`ar-message ${bad ? 'bad' : ''}`} role="status" data-testid="armory-class-message">{message}</p>{/if}
	{#if folders && folders.length > 0}
		<details class="ar-class-folders" data-testid="armory-class-folders">
			<summary>{folders.length} class {folders.length === 1 ? 'folder' : 'folders'} and who can save in each</summary>
			<ul>
				{#each folders as f (f.folder)}
					<li><span class="ar-mono">{f.folder}</span> <span class="ar-dim">{f.kind === 'team' ? `${f.writers.length} on the team` : 'its student'}, {f.files} {f.files === 1 ? 'file' : 'files'}</span></li>
				{/each}
			</ul>
		</details>
	{/if}
</div>

<style>
	.ar-class-folders {
		margin-top: 0.75rem;
	}
	.ar-class-folders summary {
		cursor: pointer;
		min-height: 44px;
		display: flex;
		align-items: center;
		font-family: var(--font-mono);
		color: var(--cyan);
	}
	.ar-class-folders ul {
		list-style: none;
		padding: 0;
		margin: 0.25rem 0 0;
		display: grid;
		gap: 0.25rem;
		max-height: 18rem;
		overflow: auto;
	}
	.ar-class-folders li {
		overflow-wrap: anywhere;
	}
	.ar-mono {
		font-family: var(--font-mono);
		color: var(--white);
	}
	.ar-dim {
		color: var(--dim);
	}
</style>
