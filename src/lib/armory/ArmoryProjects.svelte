<script lang="ts">
	/**
	 * `/armory`: the signed-in person's projects as cards in the classroom's own
	 * anatomy (Mr. Pina's report of 2026-10-07, "it could look a lot better ...
	 * the same design scheme that's used for IDEA Classroom"): the Armory mark,
	 * the name, a recessed role chip, the readouts the server counts ("412
	 * files", "37 out", "2 yours", "12 people", each a glyph and a word), when it
	 * last changed, and Open.
	 *
	 * Above them one row of keys (set up a computer, get the app, and for a site
	 * admin create a project) and one status line. Archived projects sit under a
	 * closed section of their own. A SITE ADMIN also gets every project they are
	 * not a member of (role null, 0233) under a closed "Other projects", and the
	 * Storage cleanup panel while stored files from deleted projects wait to be
	 * removed. Every omitted transport removes its control.
	 *
	 * THE "DELETED FOREVER" NOTE LIVES HERE, NOT ON THE PROJECT PAGE, because
	 * that page is what was deleted (CLAUDE.md, "AN ACKNOWLEDGEMENT MUST SURVIVE
	 * THE ACT IT REPORTS"). The route hands it in from `page.state`.
	 */
	import Disclosure from '$lib/Disclosure.svelte';
	import ArmoryMark from '$lib/marks/ArmoryMark.svelte';
	import { projectViewHref } from './nav';
	import { ROLE_WORDS, whenWords, type ArmoryDevice, type ArmoryProjectSummary } from './view';

	type SweepAnswer = { ok: true; swept: number; left: number | null; problem: string | null } | { ok: false; message: string };

	let {
		projects,
		devices = [],
		now = Date.now(),
		create = null,
		onCreated = null,
		orphans = null,
		sweep = null,
		deleted = null
	}: {
		projects: ArmoryProjectSummary[];
		devices?: ArmoryDevice[];
		now?: number;
		create?: ((name: string) => Promise<{ ok: true; id: string } | { ok: false; message: string }>) | null;
		onCreated?: ((id: string) => void) | null;
		/** Stored files from deleted projects waiting to be removed (site admins only; null otherwise). */
		orphans?: number | null;
		sweep?: (() => Promise<SweepAnswer>) | null;
		/** A project just deleted forever, and what storage could not finish. */
		deleted?: { name: string; storageProblem: string | null } | null;
	} = $props();

	const mine = $derived(projects.filter((p) => p.role !== null));
	const live = $derived(mine.filter((p) => !p.archived));
	const archived = $derived(mine.filter((p) => p.archived));
	const others = $derived(projects.filter((p) => p.role === null));
	const outMine = $derived(live.filter((p) => (p.mine ?? 0) > 0));
	const myOut = $derived(outMine.reduce((n, p) => n + (p.mine ?? 0), 0));
	const latest = $derived(devices[0] ?? null);

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

	// ---- Storage cleanup (site admins) ----
	let sweeping = $state(false);
	let sweepMessage = $state('');
	let sweepBad = $state(false);
	let left = $state<number | null>(null);
	const waiting = $derived(left ?? orphans ?? 0);

	async function runSweep() {
		if (!sweep || sweeping) return;
		sweeping = true;
		sweepMessage = '';
		try {
			const r = await sweep();
			if (r.ok) {
				left = r.left;
				sweepBad = !!r.problem;
				sweepMessage = [`Removed ${r.swept} stored ${r.swept === 1 ? 'file' : 'files'}.`, r.problem ?? ''].filter(Boolean).join(' ');
			} else {
				sweepBad = true;
				sweepMessage = r.message;
			}
		} finally {
			sweeping = false;
		}
	}

	function plural(n: number, one: string, many: string): string {
		return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
	}
</script>

{#snippet card(project: ArmoryProjectSummary)}
	<li>
		<a class="ar-project" href={`/armory/${project.id}`} data-testid="armory-project-card">
			<span class="ar-project-top">
				<span class="ar-project-icon" aria-hidden="true"><ArmoryMark once /></span>
				<span class="ar-project-name">{project.name}</span>
			</span>
			<span class="ar-project-chips">
				<span class="ar-readout" data-testid="armory-project-role">{project.role ? ROLE_WORDS[project.role] : 'Site admin'}</span>
				{#if project.archived}<span class="ar-readout">Archived</span>{/if}
			</span>
			{#if typeof project.files === 'number'}
				<span class="ar-project-readouts" data-testid="armory-project-readouts">
					<span class="ar-readout"><span aria-hidden="true">▤</span> {plural(project.files, 'file', 'files')}</span>
					<span class="ar-readout"><span aria-hidden="true">✎</span> {(project.checked_out ?? 0).toLocaleString('en-US')} out</span>
					{#if project.role}<span class="ar-readout"><span aria-hidden="true">★</span> {(project.mine ?? 0).toLocaleString('en-US')} yours</span>{/if}
					<span class="ar-readout"><span aria-hidden="true">☺</span> {plural(project.members ?? 0, 'person', 'people')}</span>
				</span>
			{/if}
			<span class="ar-project-meta">
				{project.last_change_at ? `Last change ${whenWords(project.last_change_at, now)}` : project.role ? `You are ${ROLE_WORDS[project.role]}` : ''}
			</span>
			<span class="ar-project-cta">Open &#9656;</span>
		</a>
	</li>
{/snippet}

{#if deleted}
	<div class="ar-notice" role="status" data-testid="armory-deleted">
		<span class="ar-notice-glyph" aria-hidden="true">✓</span>
		<div>
			<strong>{deleted.name} is deleted forever.</strong>
			Its files, versions and members are gone.{deleted.storageProblem ? ` ${deleted.storageProblem}` : ''}
		</div>
	</div>
{/if}

<div class="ar-keys" data-testid="armory-keys">
	{#if devices.length === 0}
		<a class="btn ar-btn" href="/armory/start">Set up a computer</a>
	{:else}
		<a class="btn secondary ar-btn" href="/armory/start" data-testid="armory-setup-line">Set up another computer</a>
	{/if}
	<a class="btn secondary ar-btn" href="/armory/get">Get the Windows app</a>
	{#if create}<a class="btn secondary ar-btn" href="#create" data-testid="armory-create-key">Create project</a>{/if}
</div>
<p class="ar-message ar-status-line" data-testid="armory-status-line">
	{#if latest}
		{plural(devices.length, 'computer', 'computers')} connected · {latest.name} last heard from {whenWords(new Date(latest.last_seen).toISOString(), now)}
	{:else}
		No computer of yours is connected yet.
	{/if}
	{#if myOut > 0 && outMine[0]}
		· <a href={`/armory/${outMine[0].id}${projectViewHref('checked-out')}&who=me`} data-testid="armory-mine-link">You have {plural(myOut, 'file', 'files')} checked out</a>
	{/if}
</p>

{#if devices.length === 0}
	<section class="ar-panel ar-setup-card" data-testid="armory-setup-card">
		<h2>Set up Armory on your computer</h2>
		<p class="ar-lead">
			Download the Windows app, install it, and connect it to your account. The setup page walks you through it and
			ticks each step as it sees it done.
		</p>
		<div class="ar-row-actions">
			<a class="btn ar-btn" href="/armory/start">Start setup</a>
			<a class="btn secondary ar-btn" href="/armory/get">Get the Windows app</a>
		</div>
	</section>
{/if}

{#if sweep && waiting > 0}
	<section class="ar-panel" aria-labelledby="ar-cleanup-h" data-testid="armory-cleanup">
		<h2 id="ar-cleanup-h">Storage cleanup</h2>
		<p class="ar-message">
			{plural(waiting, 'stored file', 'stored files')} from deleted projects {waiting === 1 ? 'is' : 'are'} waiting to be removed from
			file storage. Only files no project uses any more are removed.
		</p>
		<div class="ar-row-actions">
			<button class="btn ar-btn" type="button" aria-disabled={sweeping} data-testid="armory-cleanup-key" onclick={runSweep}>
				{sweeping ? 'Removing…' : 'Finish cleanup'}
			</button>
		</div>
		{#if sweepMessage}<p class={`ar-message ${sweepBad ? 'bad' : ''}`} role="status">{sweepMessage}</p>{/if}
	</section>
{/if}

<section aria-labelledby="ar-projects-h">
	<h2 class="section-label ar-section-h" id="ar-projects-h">Your projects</h2>
	{#if live.length === 0}
		<div class="ar-panel" data-testid="armory-no-projects">
			<p class="ar-lead">
				You are not in any Armory projects yet. A mentor adds you by your school email, and the project shows up here
				and in the Armory app on your computer.
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

{#if others.length > 0}
	<div class="ar-archived" data-testid="armory-other-projects">
		<Disclosure label={`Other projects (${others.length}), as a site admin`} collapseWhen={true} testId="armory-other-toggle">
			<p class="ar-message">Projects you are not a member of. You can open them here; their folders are not on your computers.</p>
			<ul class="ar-projects">
				{#each others as project (project.id)}{@render card(project)}{/each}
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
