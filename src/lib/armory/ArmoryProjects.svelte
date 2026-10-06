<script lang="ts">
	/**
	 * `/armory`: the projects the signed-in person is a member of. A site admin
	 * also gets Create project (`armory_create_project` refuses anyone else);
	 * an omitted `create` transport removes the control.
	 */
	import { ROLE_WORDS, type ArmoryProject } from './view';

	let {
		projects,
		create = null,
		onCreated = null
	}: {
		projects: ArmoryProject[];
		create?: ((name: string, season: number) => Promise<{ ok: true; id: string } | { ok: false; message: string }>) | null;
		onCreated?: ((id: string) => void) | null;
	} = $props();

	let name = $state('');
	let season = $state<string | number>(new Date().getFullYear());
	let busy = $state(false);
	let message = $state('');

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!create || busy) return;
		const trimmed = name.trim();
		const year = Number(season);
		if (!trimmed) {
			message = 'Give the project a name.';
			return;
		}
		if (!Number.isInteger(year) || year < 2000 || year > 2100) {
			message = 'The season is a year, like 2026.';
			return;
		}
		busy = true;
		message = '';
		try {
			const result = await create(trimmed, year);
			if (result.ok) {
				name = '';
				onCreated?.(result.id);
			} else {
				message = result.message;
			}
		} finally {
			busy = false;
		}
	}
</script>

{#if projects.length === 0}
	<div class="ar-panel" data-testid="armory-no-projects">
		<p class="ar-lead">
			You are not in any Armory projects yet. A mentor or CAD lead adds you by your school email, and
			the project shows up here and in the Armory app on your computer.
		</p>
	</div>
{:else}
	<ul class="ar-projects" data-testid="armory-projects">
		{#each projects as project (project.id)}
			<li>
				<a class="ar-project" href={`/armory/${project.id}`}>
					<span class="ar-project-name">{project.name}</span>
					<span class="ar-project-meta">Season {project.season} · You are {ROLE_WORDS[project.role] ?? project.role}</span>
				</a>
			</li>
		{/each}
	</ul>
{/if}

<div class="ar-panel" style="margin-top: 1.25rem">
	<h2>On your computer</h2>
	<p class="ar-lead">
		Armory keeps the files in <code>C:\IDEA\Armory</code> on a Windows computer and saves your changes
		as you work. Install the app once, then connect it to your account.
	</p>
	<div class="ar-row-actions">
		<a class="ar-btn" href="/armory/download">Get the Windows app</a>
	</div>
</div>

{#if create}
	<form class="ar-panel" onsubmit={submit} data-testid="armory-create">
		<h2>Create a project</h2>
		<div class="ar-form">
			<label class="ar-field">
				<span>Project name</span>
				<input bind:value={name} maxlength="100" autocomplete="off" placeholder="Robot 2027" />
			</label>
			<label class="ar-field" style="flex: 0 1 9rem">
				<span>Season</span>
				<input bind:value={season} inputmode="numeric" maxlength="4" />
			</label>
			<button class="ar-btn" type="submit" aria-disabled={busy}>{busy ? 'Creating…' : 'Create project'}</button>
		</div>
		<p class="ar-message">You become its first mentor. The name is also its folder name on every computer.</p>
		{#if message}<p class="ar-message bad" role="alert">{message}</p>{/if}
	</form>
{/if}
