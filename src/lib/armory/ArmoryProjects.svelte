<script lang="ts">
	/**
	 * `/armory`: the projects the signed-in person is a member of, archived
	 * ones under a closed section of their own, and the setup card until they
	 * have a connected computer (then one line, "Set up another computer"). A
	 * site admin also gets Create project, by NAME ONLY since 0232 (contract
	 * C1): a season never fit a class or the offseason. An omitted `create`
	 * transport removes the control.
	 */
	import Disclosure from '$lib/Disclosure.svelte';
	import { ROLE_WORDS, type ArmoryDevice, type ArmoryProject } from './view';

	let {
		projects,
		devices = [],
		create = null,
		onCreated = null
	}: {
		projects: ArmoryProject[];
		devices?: ArmoryDevice[];
		create?: ((name: string) => Promise<{ ok: true; id: string } | { ok: false; message: string }>) | null;
		onCreated?: ((id: string) => void) | null;
	} = $props();

	const live = $derived(projects.filter((p) => !p.archived));
	const archived = $derived(projects.filter((p) => p.archived));

	let name = $state('');
	let busy = $state(false);
	let message = $state('');

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!create || busy) return;
		const trimmed = name.trim();
		if (!trimmed) {
			message = 'Give the project a name.';
			return;
		}
		busy = true;
		message = '';
		try {
			const result = await create(trimmed);
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

{#snippet card(project: ArmoryProject)}
	<li>
		<a class="ar-project" href={`/armory/${project.id}`} data-testid="armory-project-card">
			<span class="ar-project-name">{project.name}</span>
			<span class="ar-project-meta">You are {ROLE_WORDS[project.role] ?? project.role}{project.archived ? ' · Archived' : ''}</span>
		</a>
	</li>
{/snippet}

{#if devices.length === 0}
	<section class="ar-panel ar-setup-card" data-testid="armory-setup-card">
		<h2>Set up Armory on your computer</h2>
		<p class="ar-lead">
			Download the Windows app, install it, and connect it to your account. The setup page walks you through
			it and ticks each step as it sees it done.
		</p>
		<div class="ar-row-actions">
			<a class="btn ar-btn" href="/armory/start">Start setup</a>
			<a class="btn secondary ar-btn" href="/armory/get">Get the Windows app</a>
		</div>
	</section>
{:else}
	<p class="ar-message ar-setup-line" data-testid="armory-setup-line">
		<a href="/armory/start">Set up another computer</a>
	</p>
{/if}

<section aria-labelledby="ar-projects-h">
	<h2 class="ar-section-h" id="ar-projects-h">Your projects</h2>
	{#if live.length === 0}
		<div class="ar-panel" data-testid="armory-no-projects">
			<p class="ar-lead">
				You are not in any Armory projects yet. A mentor adds you by your school email, and the project
				shows up here and in the Armory app on your computer.
			</p>
		</div>
	{:else}
		<ul class="ar-projects" data-testid="armory-projects">
			{#each live as project (project.id)}{@render card(project)}{/each}
		</ul>
	{/if}
</section>

{#if archived.length > 0}
	<div class="ar-archived" data-testid="armory-archived">
		<Disclosure label={`Archived projects (${archived.length})`} collapseWhen={true} testId="armory-archived-toggle">
			<p class="ar-message">Computers stop syncing an archived project. Nothing in it is deleted, and a mentor can restore it.</p>
			<ul class="ar-projects">
				{#each archived as project (project.id)}{@render card(project)}{/each}
			</ul>
		</Disclosure>
	</div>
{/if}

{#if create}
	<form class="ar-panel" id="create" onsubmit={submit} data-testid="armory-create">
		<h2>Create a project</h2>
		<div class="ar-form">
			<label class="ar-field">
				<span>Project name</span>
				<input class="plate-well" bind:value={name} maxlength="100" autocomplete="off" placeholder="Robot, IDEA209H Blade Team 4, Offseason Swerve" />
			</label>
			<button class="btn ar-btn" type="submit" aria-disabled={busy}>{busy ? 'Creating…' : 'Create project'}</button>
		</div>
		<p class="ar-message">You become its first mentor. The name is also its folder name on every computer, and a mentor can rename it later.</p>
		{#if message}<p class="ar-message bad" role="alert">{message}</p>{/if}
	</form>
{/if}
