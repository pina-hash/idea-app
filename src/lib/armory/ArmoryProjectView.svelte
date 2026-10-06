<script lang="ts">
	/**
	 * `/armory/[project]`: every file in its folder, each with a live mark (who
	 * is editing it and since when, or when it was last saved), and the people
	 * in the project. Presentational: the route owns the load, the realtime
	 * subscription and the poll, and hands down `live` to say which is working.
	 * An omitted `addMember` or `removeMember` transport removes its control.
	 */
	import {
		folderTree,
		fileState,
		memberErrorWords,
		memberPowers,
		personName,
		ROLE_WORDS,
		STATE_WORDS,
		stateDetail,
		type ArmoryFile,
		type ArmoryMember,
		type ArmoryProject,
		type ArmoryRole,
		type FolderNode
	} from './view';

	type Outcome = { ok: true } | { ok: false; message: string };

	let {
		project,
		files,
		members,
		sideCounts = {},
		deviceSeen = {},
		now,
		myEmail,
		live = 'off',
		addMember = null,
		removeMember = null
	}: {
		project: ArmoryProject;
		files: ArmoryFile[];
		members: ArmoryMember[];
		sideCounts?: Record<string, number>;
		deviceSeen?: Record<string, number>;
		now: number;
		myEmail: string;
		live?: 'live' | 'polling' | 'off';
		addMember?: ((email: string, role: ArmoryRole) => Promise<Outcome>) | null;
		removeMember?: ((email: string) => Promise<Outcome>) | null;
	} = $props();

	const tree = $derived(folderTree(files));
	const seen = $derived(new Map(Object.entries(deviceSeen)));
	const powers = $derived(memberPowers(project.role));
	// The last mentor is never removable (004's rule), so no Remove is offered whose only answer is a refusal.
	const mentorCount = $derived(members.filter((m) => m.role === 'mentor').length);
	const editing = $derived(files.filter((f) => f.lock && !f.lock.broken_at && !f.deleted).length);

	let newEmail = $state('');
	let newRole = $state<ArmoryRole>('student');
	let busy = $state(false);
	let message = $state('');
	let bad = $state(false);
	let armed = $state<string | null>(null);

	const LIVE_WORDS = {
		live: 'Live: changes appear as they happen',
		polling: 'Checking for changes every few seconds',
		off: 'Showing the files as of when this page opened'
	};

	async function add(event: SubmitEvent) {
		event.preventDefault();
		if (!addMember || busy) return;
		busy = true;
		message = '';
		try {
			const r = await addMember(newEmail.trim().toLowerCase(), newRole);
			bad = !r.ok;
			message = r.ok ? `Added ${newEmail.trim()}.` : memberErrorWords(r.message);
			if (r.ok) newEmail = '';
		} finally {
			busy = false;
		}
	}

	async function remove(email: string) {
		if (!removeMember || busy) return;
		if (armed !== email) {
			armed = email;
			return;
		}
		busy = true;
		message = '';
		try {
			const r = await removeMember(email);
			bad = !r.ok;
			message = r.ok ? `Removed ${email}. Their files and history stay in the project.` : memberErrorWords(r.message);
			armed = null;
		} finally {
			busy = false;
		}
	}
</script>

{#snippet fileRow(file: ArmoryFile)}
	{@const state = fileState(file, now, seen)}
	{@const words = STATE_WORDS[state]}
	<li>
		<a class="ar-file" href={`/armory/${project.id}/file/${file.id}`} data-testid="armory-file" data-state={state}>
			<span class={`ar-file-glyph ar-tone-${words.tone}`} aria-hidden="true">{words.glyph}</span>
			<span class="ar-file-name">
				{file.name}
				{#if sideCounts[file.id]}
					<span class="ar-chip" data-testid="armory-side-chip">{sideCounts[file.id]} side {sideCounts[file.id] === 1 ? 'version' : 'versions'}</span>
				{/if}
			</span>
			<span class="ar-file-line">
				<span class={`ar-state ar-tone-${words.tone}`}>{words.label}.</span>
				{stateDetail(file, state, now)}
			</span>
		</a>
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
		{@render fileRow(file)}
	{/each}
{/snippet}

<div class="ar-split">
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
			<p class="ar-message" style="margin: 0 0 0.5rem">
				{files.length} {files.length === 1 ? 'file' : 'files'}{editing > 0 ? `, ${editing} being edited right now` : ''}.
			</p>
			<ul class="ar-tree" data-testid="armory-tree">{@render folder(tree)}</ul>
		{/if}
	</section>

	<section class="ar-panel" aria-labelledby="ar-people-h" data-testid="armory-members">
		<h2 id="ar-people-h">People</h2>
		<ul class="ar-members">
			{#each members as member (member.email)}
				<li class="ar-member">
					<span class="ar-member-who">
						<span>{personName(member.email)}{member.email === myEmail ? ' (you)' : ''}</span>
						<span class="ar-member-email">{member.email} · {ROLE_WORDS[member.role] ?? member.role}</span>
					</span>
					{#if removeMember && powers.remove && !(member.role === 'mentor' && mentorCount <= 1)}
						<button
							class={`ar-btn ${armed === member.email ? 'danger' : 'quiet'}`}
							type="button"
							aria-disabled={busy}
							onclick={() => remove(member.email)}
						>
							{armed === member.email ? `Remove ${personName(member.email)}?` : 'Remove'}
						</button>
					{/if}
				</li>
			{/each}
		</ul>
		{#if armed}
			<p class="ar-message">Press again to remove them. Their saved files and history stay.</p>
		{/if}
		{#if addMember && powers.add}
			<form class="ar-form" onsubmit={add} data-testid="armory-add-member">
				<label class="ar-field">
					<span>School email</span>
					<input bind:value={newEmail} type="email" autocomplete="off" placeholder="name@boscotech.net" required />
				</label>
				<label class="ar-field" style="flex: 0 1 10rem">
					<span>Role</span>
					<select bind:value={newRole}>
						<option value="student">Student</option>
						<option value="instructor">Instructor</option>
						{#if powers.addLeads}
							<option value="cad_lead">CAD lead</option>
							<option value="mentor">Mentor</option>
						{/if}
					</select>
				</label>
				<button class="ar-btn" type="submit" aria-disabled={busy}>Add</button>
			</form>
		{/if}
		{#if message}<p class={`ar-message ${bad ? 'bad' : ''}`} role="status">{message}</p>{/if}
	</section>
</div>
