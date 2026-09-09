<script lang="ts">
	/**
	 * ONE ENTRY'S PEOPLE, AND WHAT THE VIEWER MAY DO ABOUT THEM (prompt 0110,
	 * items 6 and 7). Mounted by the event page for the viewer's own entry and
	 * by the host console per entry; presentation only, every write a callback
	 * the route points at a 0192 RPC.
	 *
	 * AN OMITTED TRANSPORT REMOVES THE CONTROL IT DRIVES: no `onrename`, no
	 * rename control; no `onaddmember`, no add row; and so on. On top of that
	 * the panel mirrors the server's two windows so no control is offered
	 * whose only answer is a refusal:
	 *
	 *   NOT STARTED   `entriesLocked(status)` is false -- draft, registration,
	 *                 seeding. Entry and member names may be renamed. Once the
	 *                 bracket exists (live, complete) the rename control is
	 *                 replaced by the sentence that says why, for the owner
	 *                 and a host and an admin alike, because the server's rule
	 *                 has no host carve-out and a control that appeared for a
	 *                 host would be one whose click fails.
	 *   THE WINDOW    status in registration_open | seeding. Members may be
	 *                 added and removed. Outside it the rows are read-only.
	 *
	 * WHO MAY ACT ON A ROW: the member themselves (leaving, renaming
	 * themselves), the CAPTAIN (the member whose user_id is the entry's own)
	 * over every row, and a viewer who is not a member at all -- which is what
	 * a host or an admin mounting this panel from the console is, since the
	 * event page only ever mounts it for the viewer's OWN entry. A host who
	 * also happens to be a non-captain member of the entry gets own-row
	 * controls here and the console's transports elsewhere; that corner is
	 * accepted rather than solved with a fourth flag.
	 *
	 * Two rows carry no Remove and say why in the row: the last member (an
	 * entry needs at least one registrant) and the captain's while teammates
	 * remain (the registering account stays on the entry). Both are the
	 * server's refusals, rendered as sentences instead of as buttons that
	 * fail. Names are the members' CHOSEN names; nothing here reads a profile.
	 *
	 * ADDING A TEAMMATE BY ACCOUNT IS A MANAGER'S ACT (prompt 0110, the
	 * orchestrator's decision). A captain adds UNLINKED teammates by name; a
	 * teammate who has an account joins the entry themselves through
	 * `tournament_join_entry`, which is the consent path -- nobody is put on
	 * a roster under their own account by somebody else's click. The server
	 * refuses the email branch to anyone who is not a host or a site admin,
	 * so the account-email field is offered only when `manager` is true (the
	 * host console mounts the panel that way; the event page does not), and
	 * a non-manager's add row says in words how a teammate with an account
	 * gets on instead. The prop is a fact about WHO MOUNTED the panel, not a
	 * grant: the RPC re-checks the caller.
	 */
	import {
		entriesLocked,
		entryIsFull,
		type TournamentEntry,
		type TournamentEntryMember,
		type TournamentStatus
	} from './tournaments';

	let {
		entry,
		members,
		teamSize,
		status,
		viewerId,
		busy = false,
		error = '',
		manager = false,
		onrename,
		onaddmember,
		onremovemember,
		onrenamemember
	}: {
		entry: TournamentEntry;
		/** This entry's members (the caller filters), any order. */
		members: TournamentEntryMember[];
		teamSize: number;
		status: TournamentStatus;
		/** The signed-in viewer, or null. */
		viewerId: string | null;
		busy?: boolean;
		error?: string;
		/** True only when a host or a site admin mounted the panel (the host
		 * console): it is what offers the account-email field on the add row.
		 * The default is the event page's own entry, which adds by name alone. */
		manager?: boolean;
		onrename?: (name: string) => void;
		onaddmember?: (name: string, email: string | null) => void;
		onremovemember?: (memberId: string) => void;
		onrenamemember?: (memberId: string, name: string) => void;
	} = $props();

	const locked = $derived(entriesLocked(status));
	const inWindow = $derived(status === 'registration_open' || status === 'seeding');
	const rows = $derived(
		[...members].sort(
			(a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
		)
	);
	const full = $derived(entryIsFull(rows.length, teamSize));
	const isCaptain = $derived(viewerId !== null && entry.user_id === viewerId);
	const viewerIsMember = $derived(viewerId !== null && rows.some((m) => m.user_id === viewerId));
	/** Every row: the captain, or a manager (a viewer who is nobody's row). */
	const overAll = $derived(isCaptain || !viewerIsMember);
	const isCaptainRow = (m: TournamentEntryMember) =>
		entry.user_id !== null && m.user_id === entry.user_id;
	const mayAct = (m: TournamentEntryMember) => overAll || (viewerId !== null && m.user_id === viewerId);

	/** Why a row carries no Remove, or null when it may. */
	function removeBlocker(m: TournamentEntryMember): string | null {
		if (rows.length <= 1) return 'An entry needs at least one registrant.';
		if (isCaptainRow(m)) return 'The registering account stays on the entry.';
		return null;
	}

	// Inline forms. One thing open at a time is the simplest true statement
	// about a panel this size, so opening any form closes the others.
	let renaming = $state(false);
	let entryName = $state('');
	let renamingMember = $state<string | null>(null);
	let memberName = $state('');
	let removing = $state<string | null>(null);
	let addName = $state('');
	let addEmail = $state('');

	function closeAll() {
		renaming = false;
		renamingMember = null;
		removing = null;
	}
	function openRename() {
		closeAll();
		entryName = entry.display_name;
		renaming = true;
	}
	function submitRename(e: SubmitEvent) {
		e.preventDefault();
		const n = entryName.trim();
		if (!n || busy) return;
		onrename?.(n);
		renaming = false;
	}
	function openRenameMember(m: TournamentEntryMember) {
		closeAll();
		memberName = m.name;
		renamingMember = m.id;
	}
	function submitRenameMember(e: SubmitEvent, id: string) {
		e.preventDefault();
		const n = memberName.trim();
		if (!n || busy) return;
		onrenamemember?.(id, n);
		renamingMember = null;
	}
	function armRemove(id: string) {
		closeAll();
		removing = id;
	}
	function confirmRemove(id: string) {
		if (busy) return;
		onremovemember?.(id);
		removing = null;
	}
	function submitAdd(e: SubmitEvent) {
		e.preventDefault();
		const n = addName.trim();
		if (!n || busy) return;
		// A non-manager has no email field, so nothing typed can reach the
		// server's refusal; the null is the name-only shape the RPC accepts.
		const email = manager ? addEmail.trim() : '';
		onaddmember?.(n, email.length ? email : null);
		addName = '';
		addEmail = '';
	}
</script>

<div class="team" data-testid="entry-team" data-locked={locked} data-window={inWindow}>
	{#if error}<p class="error" role="alert">{error}</p>{/if}

	<div class="head">
		{#if renaming}
			<form class="inline" onsubmit={submitRename} data-form="rename-entry">
				<label class="field">
					<span class="f-label">Entry name</span>
					<input type="text" maxlength="40" required bind:value={entryName} />
				</label>
				<div class="tnm-actions">
					<button type="submit" class="btn" disabled={busy || !entryName.trim()}>Save name</button>
					<button type="button" class="btn secondary" onclick={closeAll}>Cancel</button>
				</div>
			</form>
		{:else}
			<p class="name">{entry.display_name}</p>
			{#if onrename && !locked}
				<button type="button" class="btn secondary" onclick={openRename} data-action="rename-entry">
					Rename
				</button>
			{:else if onrename && locked}
				<!-- The absent control says why (CLAUDE.md): the server's one
				     rule, with no host carve-out, in its own words. -->
				<p class="lock" data-testid="entry-lock">Entry names lock once the bracket is generated.</p>
			{/if}
		{/if}
	</div>

	<p class="tnm-label roster-label">
		Registrant{rows.length === 1 ? '' : 's'}
		<span class="count">{rows.length} of {teamSize}</span>
	</p>
	<ul class="roster">
		{#each rows as m (m.id)}
			{@const blocker = removeBlocker(m)}
			<li class="row" data-member-id={m.id}>
				{#if renamingMember === m.id}
					<form class="inline" onsubmit={(e) => submitRenameMember(e, m.id)} data-form="rename-member">
						<label class="field">
							<span class="f-label">Name on the roster</span>
							<input type="text" maxlength="40" required bind:value={memberName} />
						</label>
						<div class="tnm-actions">
							<button type="submit" class="btn" disabled={busy || !memberName.trim()}>Save</button>
							<button type="button" class="btn secondary" onclick={closeAll}>Cancel</button>
						</div>
					</form>
				{:else if removing === m.id}
					<div class="confirm">
						<span class="ask">Remove <strong>{m.name}</strong> from this entry?</span>
						<div class="tnm-actions">
							<button
								type="button"
								class="btn danger"
								disabled={busy}
								onclick={() => confirmRemove(m.id)}
								data-action="confirm-remove"
							>
								Remove
							</button>
							<button type="button" class="btn secondary" onclick={closeAll}>Keep</button>
						</div>
					</div>
				{:else}
					<span class="who">
						<span class="m-name">{m.name}</span>
						{#if isCaptainRow(m)}<span class="tag">registered the entry</span>{/if}
						{#if m.user_id === null}<span class="tag">no account</span>{/if}
						{#if viewerId !== null && m.user_id === viewerId}<span class="tag you">you</span>{/if}
					</span>
					<span class="tnm-actions row-actions">
						{#if onrenamemember && !locked && mayAct(m)}
							<button
								type="button"
								class="btn secondary"
								onclick={() => openRenameMember(m)}
								data-action="rename-member"
							>
								Rename
							</button>
						{/if}
						{#if onremovemember && inWindow && mayAct(m)}
							{#if blocker}
								<span class="why">{blocker}</span>
							{:else}
								<button
									type="button"
									class="btn secondary"
									onclick={() => armRemove(m.id)}
									data-action="remove-member"
								>
									{viewerId !== null && m.user_id === viewerId && !isCaptainRow(m) ? 'Leave' : 'Remove'}
								</button>
							{/if}
						{/if}
					</span>
				{/if}
			</li>
		{/each}
	</ul>

	{#if onaddmember && inWindow}
		{#if full}
			<p class="full" data-testid="entry-full">This entry is full ({rows.length} of {teamSize}).</p>
		{:else}
			<form class="add" onsubmit={submitAdd} data-form="add-member">
				<p class="tnm-label add-label">Add a teammate</p>
				<div class="add-fields">
					<label class="field">
						<span class="f-label">Name on the roster</span>
						<input type="text" maxlength="40" required bind:value={addName} data-field="name" />
					</label>
					{#if manager}
						<label class="field">
							<span class="f-label">Account email (optional)</span>
							<input type="email" bind:value={addEmail} data-field="email" />
						</label>
					{/if}
				</div>
				{#if !manager}
					<!-- The consent path, said in words where the field would have
					     been: the server refuses a captain's add-by-account, and a
					     control that is absent for a reason says the reason. -->
					<p class="join-note" data-testid="entry-join-note">
						Teammates with an account can join your entry themselves while registration is open.
					</p>
				{/if}
				<div class="tnm-actions">
					<button type="submit" class="btn" disabled={busy || !addName.trim()} data-action="add-member">
						Add teammate
					</button>
				</div>
			</form>
		{/if}
	{/if}
</div>

<style>
	/* Room tokens throughout (measured in tournaments-theme.css): ink
	   #edede8 on the card 14.10:1 and on the input plate 12.72:1, ink-dim
	   #93a09a 6.10:1 on the card, amber #d08030 5.37:1 for a refusal, crimson
	   #d95f5f 4.54:1 on the card for the one destructive confirm -- crimson
	   is error/destructive status and this is the one place the panel spends
	   it. */
	.team {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		min-width: 0;
		font-family: 'Rajdhani', sans-serif;
	}
	.error {
		margin: 0;
		color: var(--amber);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
	}
	.name {
		margin: 0;
		font-size: 1.35rem;
		font-weight: 700;
		color: var(--tnm-ink);
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.lock,
	.why,
	.full,
	.join-note {
		margin: 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.74rem;
		color: var(--tnm-ink-dim);
	}
	.roster-label {
		font-size: 0.7rem;
		display: flex;
		gap: 0.6rem;
		align-items: baseline;
	}
	.roster-label .count {
		color: var(--tnm-ink);
		letter-spacing: 0;
	}
	.roster {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.4rem 0.8rem;
		padding: 0.45rem 0;
		border-bottom: 1px solid var(--tnm-line);
		min-width: 0;
	}
	.row:last-child {
		border-bottom: none;
	}
	.who {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.3rem 0.6rem;
		min-width: 0;
	}
	.m-name {
		font-size: 1.05rem;
		font-weight: 700;
		color: var(--tnm-ink);
	}
	.tag {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--tnm-ink-dim);
	}
	.tag.you {
		color: var(--tnm-ink);
		border: 1px solid var(--tnm-line-strong);
		border-radius: 999px;
		padding: 0 0.45rem;
	}
	.row-actions {
		gap: 0.4rem;
	}
	.confirm {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		width: 100%;
	}
	.ask {
		color: var(--tnm-ink);
	}
	/* The destructive confirm: crimson edge and ink on the panel (4.54:1),
	   the DeleteTournament treatment. Only ever the SECOND step. */
	.btn.danger {
		color: var(--crimson);
		border-color: var(--crimson);
	}
	.btn.danger:hover:not(:disabled) {
		background: var(--crimson);
		color: var(--tnm-bg);
	}
	/* Every control on the panel clears 44px as a min-height. The room's
	   `.tnm-actions .btn` rule says the same for the buttons; the inputs are
	   restated here because they are not `.btn`s. */
	.btn {
		min-height: 44px;
		box-sizing: border-box;
	}
	.inline,
	.add {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		width: 100%;
		min-width: 0;
	}
	.add {
		padding-top: 0.6rem;
		border-top: 1px solid var(--tnm-line);
	}
	.add-label {
		font-size: 0.7rem;
	}
	.add-fields {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 1 1 14rem;
		min-width: 0;
	}
	.f-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--tnm-ink-dim);
	}
	.field input {
		box-sizing: border-box;
		min-height: 44px;
		background: var(--tnm-panel-2);
		border: 1px solid var(--tnm-ink-dim);
		border-radius: 6px;
		color: var(--tnm-ink);
		font-family: 'Rajdhani', sans-serif;
		font-size: 1rem;
		padding: 0.4rem 0.6rem;
	}
</style>
