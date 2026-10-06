<script lang="ts">
	/**
	 * `/armory/[project]`: what is checked out and by whom (contract C7), every
	 * file with its own line ("Checked out by <name> on <computer>, since
	 * <time>" or "Available"), search and the Checked out and Mine filters, the
	 * people, what happened lately, and the storage the project uses.
	 *
	 * Presentational: the route owns the load, the realtime subscription and
	 * the transports. EVERY OMITTED TRANSPORT REMOVES ITS CONTROL: no `takeBack`
	 * is no Take back (a student, or a mentor with no connected computer, which
	 * the RPC needs and the panel then says), no `rename` / `setArchived` is no
	 * project settings, no `addMember` / `removeMember` is a read-only list.
	 *
	 * Every irreversible-looking press is two presses: the first arms and says
	 * what it costs, the second does it.
	 */
	import { untrack } from 'svelte';
	import {
		activityWords,
		checkedInReleases,
		checkoutCounts,
		FILE_FILTERS,
		fileState,
		filterFiles,
		folderTree,
		holderName,
		holderNames,
		memberErrorWords,
		memberPowers,
		parseEmails,
		personName,
		projectErrorWords,
		ROLE_WORDS,
		sizeWords,
		STATE_WORDS,
		stateDetail,
		VERBS,
		whenWords,
		type ArmoryChange,
		type ArmoryCheckout,
		type ArmoryFile,
		type ArmoryMember,
		type ArmoryProject,
		type ArmoryRole,
		type FileFilter,
		type FolderNode
	} from './view';

	type Outcome = { ok: true } | { ok: false; message: string };

	let {
		project,
		files,
		members,
		sideCounts = {},
		deviceSeen = {},
		checkouts = [],
		activity = [],
		storage = null,
		now,
		myEmail,
		live = 'off',
		addMember = null,
		removeMember = null,
		takeBack = null,
		takeBackNeedsComputer = false,
		rename = null,
		setArchived = null,
		initialFilter = 'all',
		initialQuery = ''
	}: {
		project: ArmoryProject;
		files: ArmoryFile[];
		members: ArmoryMember[];
		sideCounts?: Record<string, number>;
		deviceSeen?: Record<string, number>;
		checkouts?: ArmoryCheckout[];
		activity?: ArmoryChange[];
		storage?: { bytes: number; files: number } | null;
		now: number;
		myEmail: string;
		live?: 'live' | 'polling' | 'off';
		/** Adds a person, or changes the role of one already in the project (the same RPC). */
		addMember?: ((email: string, role: ArmoryRole) => Promise<Outcome>) | null;
		removeMember?: ((email: string) => Promise<Outcome>) | null;
		takeBack?: ((fileId: string) => Promise<Outcome>) | null;
		/** True when the caller may take back but has no connected computer to do it from. */
		takeBackNeedsComputer?: boolean;
		rename?: ((name: string) => Promise<Outcome>) | null;
		setArchived?: ((archived: boolean) => Promise<Outcome>) | null;
		/** Where the filter and the search start (the harness opens a state on one). */
		initialFilter?: FileFilter;
		initialQuery?: string;
	} = $props();

	const me = $derived(myEmail.trim().toLowerCase());
	const seen = $derived(new Map(Object.entries(deviceSeen)));
	const names = $derived(holderNames(checkouts));
	const powers = $derived(memberPowers(project.role));
	const mentorCount = $derived(members.filter((m) => m.role === 'mentor').length);
	const counts = $derived(checkoutCounts(files.filter((f) => !f.deleted), me));
	const byId = $derived(new Map(files.map((f) => [f.id, f])));
	const fileName = (id: string) => byId.get(id)?.name ?? null;
	const checkedIn = $derived(checkedInReleases(activity));
	const shownActivity = $derived(
		activity
			.map((c) => ({ c, words: activityWords(c, fileName, checkedIn.has(c.cursor)) }))
			.filter((x): x is { c: ArmoryChange; words: string } => x.words !== null)
			.slice(0, 25)
	);

	let query = $state(untrack(() => initialQuery));
	let filter = $state<FileFilter>(untrack(() => initialFilter));
	const visible = $derived(filterFiles(files.filter((f) => !f.deleted), filter, query, me));
	const flat = $derived(filter !== 'all' || query.trim() !== '');
	const tree = $derived(folderTree(visible));
	const removedCount = $derived(files.filter((f) => f.deleted).length);

	const LIVE_WORDS = {
		live: 'Live: changes appear as they happen',
		polling: 'Checking for changes every few seconds',
		off: 'Showing the files as of when this page opened'
	};

	// ---- Take back ----
	let armedTake = $state<string | null>(null);
	let takeMessage = $state('');
	let takeBad = $state(false);
	let busy = $state(false);

	/** Armed per PLACE, so arming the panel's key does not also arm the row's. */
	async function take(fileId: string, place: string) {
		if (!takeBack || busy) return;
		if (armedTake !== `${place}:${fileId}`) {
			armedTake = `${place}:${fileId}`;
			takeMessage = '';
			return;
		}
		busy = true;
		try {
			const r = await takeBack(fileId);
			takeBad = !r.ok;
			takeMessage = r.ok
				? `Taken back. ${fileName(fileId) ?? 'The file'} is available again.`
				: /nothing changed/.test(r.message)
					? 'It was already checked in.'
					: /mentor or cad_lead/.test(r.message)
						? 'Only a mentor or CAD lead can take a file back.'
						: 'That did not work. Try again in a minute.';
			armedTake = null;
		} finally {
			busy = false;
		}
	}

	// ---- People ----
	let pasted = $state('');
	let newRole = $state<ArmoryRole>('student');
	let peopleMessage = $state('');
	let peopleBad = $state(false);
	let armedRemove = $state<string | null>(null);

	async function addAll(event: SubmitEvent) {
		event.preventDefault();
		if (!addMember || busy) return;
		const { emails, rejected } = parseEmails(pasted);
		if (emails.length === 0) {
			peopleBad = true;
			peopleMessage = rejected.length ? `None of that is an email address: ${rejected.slice(0, 5).join(', ')}.` : 'Paste or type at least one school email.';
			return;
		}
		busy = true;
		peopleMessage = '';
		const added: string[] = [];
		const already: string[] = [];
		const failed: Array<{ email: string; why: string }> = [];
		try {
			// One person at a time, so one refusal never hides whether the rest landed.
			for (const email of emails) {
				if (members.some((m) => m.email === email && m.role === newRole)) {
					already.push(email);
					continue;
				}
				const r = await addMember(email, newRole);
				if (r.ok) added.push(email);
				else if (r.message === 'nothing changed') already.push(email);
				else failed.push({ email, why: memberErrorWords(r.message) });
			}
		} finally {
			busy = false;
		}
		// What did not land stays in the box, so pressing Add again retries exactly that.
		pasted = failed.map((f) => f.email).join('\n');
		peopleBad = failed.length > 0 || rejected.length > 0;
		peopleMessage = [
			added.length ? `Added ${added.length} as ${ROLE_WORDS[newRole]}.` : '',
			already.length ? `${already.length} already had that role.` : '',
			failed.length ? `Not added: ${failed.map((f) => `${f.email} (${f.why})`).join('; ')}` : '',
			rejected.length ? `Skipped, not an email: ${rejected.slice(0, 5).join(', ')}${rejected.length > 5 ? ` and ${rejected.length - 5} more` : ''}.` : ''
		]
			.filter(Boolean)
			.join(' ');
	}

	/** Whether the caller may set this member's role, and to what. The RPC decides; this is what is offered. */
	function roleChoices(member: ArmoryMember): ArmoryRole[] {
		if (!addMember || member.email === me) return [];
		if (member.role === 'mentor' && mentorCount <= 1) return [];
		if (project.role === 'mentor') return ['student', 'instructor', 'cad_lead', 'mentor'];
		if (project.role === 'cad_lead' && (member.role === 'student' || member.role === 'instructor')) return ['student', 'instructor'];
		return [];
	}

	async function changeRole(member: ArmoryMember, role: ArmoryRole) {
		if (!addMember || busy || role === member.role) return;
		busy = true;
		try {
			const r = await addMember(member.email, role);
			peopleBad = !r.ok;
			peopleMessage = r.ok ? `${personName(member.email)} is now ${ROLE_WORDS[role]}.` : memberErrorWords(r.message);
		} finally {
			busy = false;
		}
	}

	async function remove(email: string) {
		if (!removeMember || busy) return;
		if (armedRemove !== email) {
			armedRemove = email;
			return;
		}
		busy = true;
		try {
			const r = await removeMember(email);
			peopleBad = !r.ok;
			peopleMessage = r.ok ? `Removed ${email}. Their saved files and history stay in the project.` : memberErrorWords(r.message);
			armedRemove = null;
		} finally {
			busy = false;
		}
	}

	// ---- Project settings (mentors) ----
	let newName = $state('');
	let armedRename = $state(false);
	let armedArchive = $state(false);
	let projectMessage = $state('');
	let projectBad = $state(false);

	async function doRename(event: SubmitEvent) {
		event.preventDefault();
		if (!rename || busy) return;
		const n = newName.trim();
		if (!n || n === project.name) {
			projectBad = true;
			projectMessage = 'Type the new name first.';
			return;
		}
		if (!armedRename) {
			armedRename = true;
			projectMessage = '';
			return;
		}
		busy = true;
		try {
			const r = await rename(n);
			projectBad = !r.ok;
			projectMessage = r.ok ? `Renamed. The folder on every computer becomes ${n} the next time it syncs.` : projectErrorWords(r.message);
			if (r.ok) newName = '';
			armedRename = false;
		} finally {
			busy = false;
		}
	}

	async function doArchive() {
		if (!setArchived || busy) return;
		const next = !project.archived;
		if (next && !armedArchive) {
			armedArchive = true;
			return;
		}
		busy = true;
		try {
			const r = await setArchived(next);
			projectBad = !r.ok;
			projectMessage = r.ok ? (next ? 'Archived. Computers stop syncing it; nothing was deleted.' : 'Restored. Computers sync it again.') : projectErrorWords(r.message);
			armedArchive = false;
		} finally {
			busy = false;
		}
	}
</script>

{#snippet takeBackControl(file: ArmoryFile, place: string)}
	{#if takeBack && file.lock && !file.lock.broken_at && file.lock.holder_email !== me}
		<button
			class={`btn ar-btn ${armedTake === `${place}:${file.id}` ? 'danger' : 'secondary'}`}
			type="button"
			aria-disabled={busy}
			data-testid="armory-take-back"
			onclick={() => take(file.id, place)}
		>
			{armedTake === `${place}:${file.id}` ? `${VERBS.takeBack} from ${holderName(file.lock.holder_email, names)}?` : VERBS.takeBack}
		</button>
	{/if}
{/snippet}

{#snippet takeWarning(file: ArmoryFile, place: string)}
	{#if armedTake === `${place}:${file.id}` && file.lock}
		<p class="ar-message bad ar-warn" role="alert" data-testid="armory-take-back-warning">
			Press again to take it back. Anything {holderName(file.lock.holder_email, names)} has not saved on
			{file.lock.holder_device_name ?? 'their computer'} is kept as a side version when that computer next
			connects, and the file becomes available to everyone.
		</p>
	{/if}
{/snippet}

{#snippet fileRow(file: ArmoryFile, showFolder: boolean)}
	{@const state = fileState(file, now, seen)}
	{@const words = STATE_WORDS[state]}
	<li class="ar-file-item" data-testid="armory-file-row">
		<div class="ar-file-wrap">
			<a class="ar-file" href={`/armory/${project.id}/file/${file.id}`} data-testid="armory-file" data-state={state}>
				<span class={`ar-file-glyph ar-tone-${words.tone}`} aria-hidden="true">{words.glyph}</span>
				<span class="ar-file-name">
					{file.name}
					{#if sideCounts[file.id]}
						<span class="ar-chip" data-testid="armory-side-chip">{sideCounts[file.id]} side {sideCounts[file.id] === 1 ? 'version' : 'versions'}</span>
					{/if}
				</span>
				<span class="ar-file-line" data-testid="armory-file-line">
					{#if showFolder && file.folder}<span class="ar-folder-inline">{file.folder}/</span>{/if}
					<span class={`ar-state ar-tone-${words.tone}`}>{words.label}</span>{stateDetail(file, state, now, names)}
				</span>
			</a>
			{@render takeBackControl(file, 'row')}
		</div>
		{@render takeWarning(file, 'row')}
	</li>
{/snippet}

{#snippet folder(node: FolderNode)}
	{#each node.folders as child (child.path)}
		<li>
			<div class="ar-folder-name"><span aria-hidden="true">▸</span>{child.name}</div>
			<ul>{@render folder(child)}</ul>
		</li>
	{/each}
	{#each node.files as file (file.id)}
		{@render fileRow(file, false)}
	{/each}
{/snippet}

{#if project.archived}
	<div class="ar-notice" role="status" data-testid="armory-archived-notice">
		<span class="ar-notice-glyph" aria-hidden="true">!</span>
		<div>
			<strong>This project is archived.</strong>
			Computers do not sync it, and nothing in it was deleted.{setArchived ? ' Restore it below to sync it again.' : ' A mentor can restore it.'}
		</div>
	</div>
{/if}

<div class="ar-split">
	<div class="ar-col">
		<section class="ar-panel" aria-labelledby="ar-out-h" data-testid="armory-checkouts">
			<h2 id="ar-out-h">Checked out right now</h2>
			{#if checkouts.length === 0}
				<p class="ar-message" data-testid="armory-checkouts-none">Nothing is checked out. Every file is available.</p>
			{:else}
				<ul class="ar-list">
					{#each checkouts as c (c.file_id)}
						{@const f = byId.get(c.file_id)}
						<li class="ar-list-row ar-out-row" data-testid="armory-checkout">
							<span class="ar-file-glyph ar-tone-editing" aria-hidden="true">✎</span>
							<span class="ar-list-main">
								<a class="ar-list-title" href={`/armory/${project.id}/file/${c.file_id}`}>{c.folder ? `${c.folder}/` : ''}{c.name}</a>
								<span class="ar-list-sub">
									{c.holder_email === me ? 'You' : (c.holder_name?.trim() || personName(c.holder_email))}, on {c.device_name ?? 'a computer'}, since {whenWords(c.since, now)}
								</span>
							</span>
							{#if f}{@render takeBackControl(f, 'panel')}{/if}
							{#if f}{@render takeWarning(f, 'panel')}{/if}
						</li>
					{/each}
				</ul>
			{/if}
			{#if takeBackNeedsComputer}
				<p class="ar-message" data-testid="armory-take-back-needs-computer">
					{VERBS.takeBack} works once one of your computers is connected. <a href="/armory/start">Set one up</a>.
				</p>
			{/if}
			{#if takeMessage}<p class={`ar-message ${takeBad ? 'bad' : ''}`} role="status">{takeMessage}</p>{/if}
		</section>

		<section class="ar-panel" aria-labelledby="ar-files-h">
			<h2 id="ar-files-h">Files</h2>
			<p class="ar-live" data-live={live} data-testid="armory-live">
				<span class="ar-live-dot" aria-hidden="true"></span>{LIVE_WORDS[live]}
			</p>
			{#if files.length === 0}
				<p class="ar-lead" data-testid="armory-empty">
					No files yet. Save a part into <code>C:\IDEA\Armory\{project.name}</code> on a connected computer
					and it appears here.
				</p>
			{:else}
				<div class="ar-toolbar">
					<label class="ar-field ar-search">
						<span>Search this project</span>
						<input class="plate-well" type="search" bind:value={query} placeholder="Part name or folder" data-testid="armory-search" />
					</label>
					<div class="ar-filters" role="group" aria-label="Show">
						{#each FILE_FILTERS as f (f.id)}
							<button
								class="btn secondary ar-btn ar-filter"
								type="button"
								aria-pressed={filter === f.id}
								data-testid={`armory-filter-${f.id}`}
								onclick={() => (filter = f.id)}
							>
								{f.label} ({f.id === 'all' ? counts.all : f.id === 'checked-out' ? counts.checkedOut : counts.mine})
							</button>
						{/each}
					</div>
				</div>
				<p class="ar-message ar-count" role="status">
					{#if flat}
						{visible.length} {visible.length === 1 ? 'file' : 'files'} shown.
					{:else}
						{counts.all} {counts.all === 1 ? 'file' : 'files'}{counts.checkedOut > 0 ? `, ${counts.checkedOut} checked out` : ''}{removedCount > 0 ? `. ${removedCount} removed (history kept)` : ''}.
					{/if}
				</p>
				{#if visible.length === 0}
					<p class="ar-message" data-testid="armory-no-match">
						{filter === 'mine' ? 'You have nothing checked out.' : filter === 'checked-out' ? 'Nothing is checked out.' : 'No file matches that.'}
					</p>
				{:else if flat}
					<ul class="ar-tree" data-testid="armory-flat">
						{#each visible as file (file.id)}{@render fileRow(file, true)}{/each}
					</ul>
				{:else}
					<ul class="ar-tree" data-testid="armory-tree">{@render folder(tree)}</ul>
				{/if}
			{/if}
		</section>

		<section class="ar-panel" aria-labelledby="ar-activity-h" data-testid="armory-activity">
			<h2 id="ar-activity-h">What happened lately</h2>
			{#if shownActivity.length === 0}
				<p class="ar-message">Nothing yet.</p>
			{:else}
				<ol class="ar-activity">
					{#each shownActivity as { c, words } (c.cursor)}
						<li data-kind={c.kind}>
							<span class="ar-activity-when">{whenWords(c.created_at, now)}</span>
							<span>{words}</span>
						</li>
					{/each}
				</ol>
			{/if}
		</section>
	</div>

	<div class="ar-col ar-side">
		<section class="ar-panel" id="people" aria-labelledby="ar-people-h" data-testid="armory-members">
			<h2 id="ar-people-h">People</h2>
			<ul class="ar-members">
				{#each members as member (member.email)}
					{@const choices = roleChoices(member)}
					<li class="ar-member">
						<span class="ar-member-who">
							<span class="person-name" title={member.email}>{personName(member.email)}{member.email === me ? ' (you)' : ''}</span>
							<span class="ar-member-email">{member.email} · {ROLE_WORDS[member.role] ?? member.role}</span>
							{#if member.role === 'mentor' && mentorCount <= 1}
								<span class="ar-member-note" data-testid="armory-last-mentor">The only mentor. A project always keeps at least one, so this person cannot be removed or changed until another mentor is added.</span>
							{/if}
						</span>
						<span class="ar-member-actions">
							{#if choices.length > 0}
								<label class="ar-role">
									<span class="ar-visually-hidden">Role for {member.email}</span>
									<select
										class="plate-well"
										value={member.role}
										aria-disabled={busy}
										data-testid="armory-role-select"
										onchange={(e) => changeRole(member, (e.currentTarget as HTMLSelectElement).value as ArmoryRole)}
									>
										{#each choices as r (r)}<option value={r}>{ROLE_WORDS[r]}</option>{/each}
									</select>
								</label>
							{/if}
							{#if removeMember && powers.remove && member.email !== me && !(member.role === 'mentor' && mentorCount <= 1)}
								<button
									class={`btn ar-btn ${armedRemove === member.email ? 'danger' : 'secondary'}`}
									type="button"
									aria-disabled={busy}
									onclick={() => remove(member.email)}
								>
									{armedRemove === member.email ? `Remove ${personName(member.email)}?` : 'Remove'}
								</button>
							{/if}
						</span>
					</li>
				{/each}
			</ul>
			{#if armedRemove}
				<p class="ar-message">Press again to remove them. Their saved files and history stay in the project.</p>
			{/if}
			{#if addMember && powers.add}
				<form class="ar-bulk" onsubmit={addAll} data-testid="armory-add-member">
					<label class="ar-field">
						<span>Add people: paste school emails</span>
						<textarea
							class="plate-well"
							rows="4"
							bind:value={pasted}
							placeholder={'ana.reyes@boscotech.net\nben.okafor@boscotech.net, maria.lopez@boscotech.net'}
							data-testid="armory-add-emails"
						></textarea>
					</label>
					<div class="ar-form">
						<label class="ar-field" style="flex: 1 1 9rem">
							<span>As</span>
							<select class="plate-well" bind:value={newRole}>
								<option value="student">Student</option>
								<option value="instructor">Instructor</option>
								{#if powers.addLeads}
									<option value="cad_lead">CAD lead</option>
									<option value="mentor">Mentor</option>
								{/if}
							</select>
						</label>
						<button class="btn ar-btn" type="submit" aria-disabled={busy}>Add people</button>
					</div>
					<p class="ar-message">One per line, or separated by commas. A list copied from an email works too.</p>
				</form>
			{/if}
			{#if peopleMessage}<p class={`ar-message ${peopleBad ? 'bad' : ''}`} role="status" data-testid="armory-people-message">{peopleMessage}</p>{/if}
		</section>

		<section class="ar-panel" aria-labelledby="ar-storage-h" data-testid="armory-storage">
			<h2 id="ar-storage-h">Storage used</h2>
			{#if storage}
				<p class="ar-big">{sizeWords(storage.bytes)}</p>
				<p class="ar-message">{storage.files} stored {storage.files === 1 ? 'file' : 'files'}, counting every version and side version. Two versions with the same contents are stored once.</p>
			{:else}
				<p class="ar-message">Not known right now.</p>
			{/if}
		</section>

		{#if rename || setArchived}
			<section class="ar-panel" aria-labelledby="ar-project-h" data-testid="armory-project-settings">
				<h2 id="ar-project-h">Project</h2>
				{#if rename}
					<form class="ar-form" onsubmit={doRename} data-testid="armory-rename">
						<label class="ar-field">
							<span>New name</span>
							<input class="plate-well" bind:value={newName} maxlength="100" autocomplete="off" placeholder={project.name} oninput={() => (armedRename = false)} />
						</label>
						<button class={`btn ar-btn ${armedRename ? 'danger' : 'secondary'}`} type="submit" aria-disabled={busy}>
							{armedRename ? `Rename to ${newName.trim()}?` : 'Rename'}
						</button>
					</form>
					{#if armedRename}
						<p class="ar-message bad" role="alert">Press again to rename it. The folder on every computer is renamed too.</p>
					{/if}
				{/if}
				{#if setArchived}
					<div class="ar-row-actions" style="margin-top: 0.75rem">
						<button
							class={`btn ar-btn ${armedArchive ? 'danger' : 'secondary'}`}
							type="button"
							aria-disabled={busy}
							data-testid="armory-archive"
							onclick={doArchive}
						>
							{project.archived ? 'Restore project' : armedArchive ? `Archive ${project.name}?` : 'Archive project'}
						</button>
					</div>
					{#if armedArchive}
						<p class="ar-message bad" role="alert">Press again to archive it. Computers stop syncing it. Nothing is deleted, and you can restore it here.</p>
					{/if}
				{/if}
				{#if projectMessage}<p class={`ar-message ${projectBad ? 'bad' : ''}`} role="status">{projectMessage}</p>{/if}
			</section>
		{/if}
	</div>
</div>
