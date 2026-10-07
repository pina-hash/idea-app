<script lang="ts">
	/**
	 * `/armory/start`: setting Armory up with nobody's help (ledger 0366).
	 *
	 * Four steps for everyone, each a numbered panel with its own status said
	 * in words, and a tick only where the site can actually see the step done:
	 * a connected computer ticks the first three (it could not be connected
	 * without having been downloaded and installed), and a project ticks the
	 * fourth. The route polls the caller's computers while the third is open,
	 * so the page turns checked on its own the moment the app connects.
	 *
	 * A mentor (an admin, or a mentor of any project) also gets their own
	 * checklist: create a project, add people, share the project link.
	 */
	import { setupSteps, sizeWords, type ArmoryDevice, type ArmoryProject } from './view';

	let {
		release,
		devices,
		projects,
		mentor = null,
		flashOnly = false,
		watching = false
	}: {
		release: { tag: string; size: number | null; name: string } | null;
		devices: ArmoryDevice[];
		projects: ArmoryProject[];
		/** Present for a mentor: their first project, whether it has people besides them, and whether they may create one. */
		mentor?: { canCreate: boolean; project: ArmoryProject | null; peopleAdded: boolean; origin: string } | null;
		/** True when "Get the Windows app" found nothing to download. */
		flashOnly?: boolean;
		/** True while the route is checking for a newly connected computer. */
		watching?: boolean;
	} = $props();

	const steps = $derived(setupSteps({ release: flashOnly ? null : release, devices, projects }));
	const step = (id: string) => steps.find((s) => s.id === id)!;
	const shareUrl = $derived(mentor?.project ? `${mentor.origin}/armory/${mentor.project.id}` : null);

	let copied = $state(false);
	async function copy() {
		if (!shareUrl) return;
		try {
			await navigator.clipboard.writeText(shareUrl);
			copied = true;
		} catch {
			copied = false;
		}
	}
</script>

{#snippet mark(done: boolean, n: number)}
	<span class={`ar-step-mark ${done ? 'done' : ''}`} aria-hidden="true">{done ? '✓' : n}</span>
{/snippet}

<ol class="ar-steps" data-testid="armory-setup">
	<li class="ar-panel ar-step" id="step-download" data-step="download" data-done={step('download').done}>
		{@render mark(step('download').done, 1)}
		<div class="ar-step-body">
			<h2>1. {step('download').title}</h2>
			<p class="ar-step-status">{step('download').status}</p>
			{#if flashOnly || !release}
				<div class="ar-notice" role="status" data-testid="armory-flash-drive">
					<span class="ar-notice-glyph" aria-hidden="true">!</span>
					<div>
						<strong>Ask Mr. Pina for the Armory flash drive.</strong>
						The download is not available from this site right now.
					</div>
				</div>
			{:else}
				<div class="ar-row-actions">
					<a class="btn ar-btn" href="/armory/get" data-testid="armory-get-app">
						Get the Windows app
					</a>
					<span class="ar-message ar-inline">
						Version {release.tag}{release.size ? `, ${sizeWords(release.size)}` : ''}. It downloads straight away.
					</span>
				</div>
				<p class="ar-message">Setting up lab computers from a flash drive? <a href="/armory/download">Get the flash-drive version</a>.</p>
			{/if}
		</div>
	</li>

	<li class="ar-panel ar-step" data-step="install" data-done={step('install').done}>
		{@render mark(step('install').done, 2)}
		<div class="ar-step-body">
			<h2>2. {step('install').title}</h2>
			<p class="ar-step-status">{step('install').status}</p>
			<ol class="ar-howto" data-testid="armory-install-steps">
				<li>Open the file you downloaded{release ? ` (${release.name})` : ''}. It is in your Downloads folder.</li>
				<li>
					If a blue box says <strong>Windows protected your PC</strong>, press <strong>More info</strong>, then
					<strong>Run anyway</strong>. Windows says this because the installer is not signed yet; it is the real one.
				</li>
				<li>It installs for your own Windows account. It never asks for an administrator password.</li>
			</ol>
		</div>
	</li>

	<li class="ar-panel ar-step" data-step="connect" data-done={step('connect').done} data-testid="armory-step-connect">
		{@render mark(step('connect').done, 3)}
		<div class="ar-step-body">
			<h2>3. {step('connect').title}</h2>
			<p class="ar-step-status" role="status" aria-live="polite">
				{step('connect').status}{!step('connect').done && watching ? ' Checking every few seconds.' : ''}
			</p>
			{#if !step('connect').done}
				<ol class="ar-howto">
					<li>Open <strong>IDEA Armory</strong> from the Start menu.</li>
					<li>Press <strong>Connect</strong>. Your browser opens a page that asks to connect this computer to your account.</li>
					<li>Press <strong>Connect this computer</strong> on that page. Then come back here.</li>
				</ol>
			{/if}
		</div>
	</li>

	<li class="ar-panel ar-step" data-step="projects" data-done={step('projects').done}>
		{@render mark(step('projects').done, 4)}
		<div class="ar-step-body">
			<h2>4. {step('projects').title}</h2>
			<p class="ar-step-status">{step('projects').status}</p>
			{#if step('projects').done}
				<p class="ar-message">
					Your project folders are in <code>C:\IDEA\Armory</code> on every connected computer.
					<a href="/armory">See your projects</a>.
				</p>
			{/if}
		</div>
	</li>
</ol>

{#if mentor}
	<section class="ar-panel" aria-labelledby="ar-mentor-h" data-testid="armory-mentor-setup">
		<h2 id="ar-mentor-h">For a mentor</h2>
		<ol class="ar-checklist">
			<li data-done={!!mentor.project}>
				<span class={`ar-step-mark small ${mentor.project ? 'done' : ''}`} aria-hidden="true">{mentor.project ? '✓' : '1'}</span>
				<span>
					<strong>Create a project.</strong>
					{#if mentor.project}
						Done: {mentor.project.name}.
					{:else if mentor.canCreate}
						Name it on <a href="/armory#create">your projects page</a>. The name is also its folder on every computer.
					{:else}
						Ask Mr. Pina to create one; only a site admin can.
					{/if}
				</span>
			</li>
			<li data-done={mentor.peopleAdded}>
				<span class={`ar-step-mark small ${mentor.peopleAdded ? 'done' : ''}`} aria-hidden="true">{mentor.peopleAdded ? '✓' : '2'}</span>
				<span>
					<strong>Add people.</strong>
					{#if mentor.project}
						Find people by name, or paste a list of school emails, on <a href={`/armory/${mentor.project.id}?view=team`}>the project's Team view</a>, and choose their role.
					{:else}
						After the project exists.
					{/if}
				</span>
			</li>
			<li>
				<span class="ar-step-mark small" aria-hidden="true">3</span>
				<span>
					<strong>Share the project link.</strong>
					{#if shareUrl}
						Send the team this link. Anyone new sets up first at <code>{mentor.origin}/armory/start</code>.
						<span class="ar-share">
							<code data-testid="armory-share-url">{shareUrl}</code>
							<button class="btn secondary ar-btn" type="button" onclick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
						</span>
					{:else}
						After the project exists.
					{/if}
				</span>
			</li>
		</ol>
	</section>
{/if}
