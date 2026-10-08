<script lang="ts">
	/**
	 * THE TEAM VIEW (Mr. Pina's report of 2026-10-07, and Armory v0.3 item 5):
	 * every member as a PERSON, linked to their site account at read time by
	 * `armory_team_status` (0233): their picture, their chosen name, their
	 * pathway, their role, what they have checked out, and each of their
	 * computers with when Armory was last heard from on it.
	 *
	 * AN INSTRUMENT'S SILENCE IS NEVER A FACT ABOUT A STUDENT. A computer says
	 * "Armory open" or "Last heard from <time>", never "offline"
	 * (`devicePresence`). The heartbeat writes no change-feed row, so nothing
	 * realtime would ever age "Armory open"; this view keeps its own clock
	 * (`ARMORY_PRESENCE_TICK_MS`) and, while it is on screen, re-reads the team
	 * through the classroom's one poller (`ARMORY_TEAM_POLL_MS`, visible tab
	 * only, stopping on a lost session).
	 *
	 * A MEMBER'S ADDRESS IS SHOWN TO THOSE WHO MANAGE MEMBERSHIP (mentors, CAD
	 * leads, site admins); everyone sees the name, the picture and the role.
	 *
	 * A SITE ADMIN MANAGES PEOPLE ON ANY PROJECT WITH A MENTOR'S REACH once 0233
	 * is in (`adminReach`; `memberManagerRole`), member or not, because
	 * `armory_add_member` and `armory_remove_member` admit `is_admin()`.
	 *
	 * Adding people: `ArmoryPeoplePicker` for those the search admits, and the
	 * paste box ("Add by email", for someone with no site account yet) in a
	 * closed section beneath it, or open with a sentence saying why when the
	 * search is not offered. Every omitted transport removes its control.
	 */
	import { onDestroy, onMount, untrack } from 'svelte';
	import Avatar from '$lib/Avatar.svelte';
	import Disclosure from '$lib/Disclosure.svelte';
	import PathwayChip from '$lib/PathwayChip.svelte';
	import { gridStudentSubject } from '$lib/avatars';
	import { startPoller, type Poller } from '$lib/classroom/poll';
	import { pollSignedOut } from '$lib/classroom/poll-session';
	import ArmoryPeoplePicker from './ArmoryPeoplePicker.svelte';
	import {
		addableRoles,
		addPeople,
		addPeopleWords,
		appVersionWords,
		ARMORY_PRESENCE_TICK_MS,
		ARMORY_TEAM_POLL_MS,
		checkoutCountFor,
		devicePresence,
		memberManagerRole,
		memberName,
		noComputerWords,
		PEOPLE_SEARCH_NOT_OFFERED,
		sortTeam,
		type MemberOutcome,
		type PeopleSearchAnswer
	} from './team';
	import {
		memberErrorWords,
		memberPowers,
		parseEmails,
		ROLE_WORDS,
		type ArmoryCheckout,
		type ArmoryMember,
		type ArmoryRole
	} from './view';

	let {
		role,
		isAdmin = false,
		adminReach = false,
		searchOffered = false,
		members,
		checkouts = [],
		teamReady = true,
		now,
		me,
		checkedOutHref = null,
		onholder = null,
		addMember = null,
		removeMember = null,
		searchPeople = null,
		loadTeam = null,
		refresh = null
	}: {
		/** The viewer's role in the project; null for a site admin who is not a member. */
		role: ArmoryRole | null;
		isAdmin?: boolean;
		/** A site admin on a database with 0233: manages people as a mentor, member or not. */
		adminReach?: boolean;
		/** Whether `peopleSearchOffered` admits this viewer, which says why the search is absent when it is. */
		searchOffered?: boolean;
		members: ArmoryMember[];
		checkouts?: ArmoryCheckout[];
		/** False on a database without `armory_team_status`: no names, pictures or presence. */
		teamReady?: boolean;
		now: number;
		me: string;
		/** Where "<n> checked out" goes (the Checked out view). Absent, the count is plain text. */
		checkedOutHref?: string | null;
		/** Told whose checkouts to show before the view changes; true when it changed the view itself. */
		onholder?: ((email: string) => boolean) | null;
		addMember?: ((email: string, role: ArmoryRole, opts?: { refresh?: boolean }) => Promise<MemberOutcome>) | null;
		removeMember?: ((email: string) => Promise<MemberOutcome>) | null;
		searchPeople?: ((query: string) => Promise<PeopleSearchAnswer>) | null;
		/** A fresh read of the team, for the poller; null on a failed read. */
		loadTeam?: (() => Promise<ArmoryMember[] | null>) | null;
		/** Reload the page once (after a batch of adds). */
		refresh?: (() => Promise<void>) | null;
	} = $props();

	// ---- The team on screen: the load's, or the poller's newer read of the same ----
	let fresh = $state<{ rows: ArmoryMember[]; base: ArmoryMember[] } | null>(null);
	const team = $derived(sortTeam(fresh && fresh.base === members ? fresh.rows : members));

	// ---- A clock that ages presence from the load's own instant ----
	let elapsed = $state(0);
	const clock = $derived(now + elapsed);
	let tick: ReturnType<typeof setInterval> | null = null;
	let poller: Poller | null = null;
	onMount(() => {
		const started = Date.now();
		tick = setInterval(() => (elapsed = Date.now() - started), ARMORY_PRESENCE_TICK_MS);
		const read = untrack(() => loadTeam);
		if (read) {
			poller = startPoller({
				intervalMs: ARMORY_TEAM_POLL_MS,
				onSignedOut: pollSignedOut,
				async run() {
					const base = members;
					const rows = await read();
					if (!rows) return 'failed';
					fresh = { rows, base };
					return 'ok';
				}
			});
		}
	});
	onDestroy(() => {
		if (tick) clearInterval(tick);
		poller?.stop();
	});

	/** The role this viewer manages people with: their own, or a mentor's for a site admin under 0233. */
	const manager = $derived(memberManagerRole(role, adminReach));
	const powers = $derived(memberPowers(manager));
	const manages = $derived(isAdmin || role === 'mentor' || role === 'cad_lead');
	const mentorCount = $derived(members.filter((m) => m.role === 'mentor').length);
	const roles = $derived(addableRoles(manager));
	const canAdd = $derived(!!addMember && powers.add && roles.length > 0);

	// The search, until it is refused or found missing; then the paste box takes over.
	let searchGone = $state<'unavailable' | 'refused' | null>(null);
	const picker = $derived(canAdd && !!searchPeople && searchGone === null);

	let busy = $state(false);
	let message = $state('');
	let bad = $state(false);
	let armedRemove = $state<string | null>(null);

	/** Whether the viewer may set this member's role, and to what. The RPC decides; this is what is offered. */
	function roleChoices(member: ArmoryMember): ArmoryRole[] {
		if (!addMember || member.email === me) return [];
		if (member.role === 'mentor' && mentorCount <= 1) return [];
		if (manager === 'mentor') return ['student', 'instructor', 'cad_lead', 'mentor'];
		if (manager === 'cad_lead' && (member.role === 'student' || member.role === 'instructor')) return ['student', 'instructor'];
		return [];
	}

	async function changeRole(member: ArmoryMember, next: ArmoryRole) {
		if (!addMember || busy || next === member.role) return;
		busy = true;
		try {
			const r = await addMember(member.email, next);
			bad = !r.ok;
			message = r.ok ? `${memberName(member)} is now ${ROLE_WORDS[next]}.` : memberErrorWords(r.message, r.code);
		} finally {
			busy = false;
		}
	}

	async function remove(member: ArmoryMember) {
		if (!removeMember || busy) return;
		if (armedRemove !== member.email) {
			armedRemove = member.email;
			return;
		}
		busy = true;
		try {
			const r = await removeMember(member.email);
			bad = !r.ok;
			message = r.ok
				? `Removed ${memberName(member)}. Their saved files and history stay in the project.`
				: memberErrorWords(r.message, r.code);
			armedRemove = null;
		} finally {
			busy = false;
		}
	}

	// ---- Add by email: the paste box ----
	let pasted = $state('');
	let pasteRole = $state<ArmoryRole>('student');

	async function addPasted(event: SubmitEvent) {
		event.preventDefault();
		if (!addMember || busy) return;
		const { emails, rejected } = parseEmails(pasted);
		if (emails.length === 0) {
			bad = true;
			message = rejected.length ? `None of that is an email address: ${rejected.slice(0, 5).join(', ')}.` : 'Paste or type at least one school email.';
			return;
		}
		busy = true;
		message = '';
		try {
			const result = await addPeople(emails, pasteRole, members, addMember);
			if (result.added.length > 0) await refresh?.();
			// What did not land stays in the box, so pressing Add again retries exactly that.
			pasted = result.failed.map((f) => f.email).join('\n');
			bad = result.failed.length > 0 || rejected.length > 0;
			message = [
				addPeopleWords(result, pasteRole),
				rejected.length ? `Skipped, not an email: ${rejected.slice(0, 5).join(', ')}${rejected.length > 5 ? ` and ${rejected.length - 5} more` : ''}.` : ''
			]
				.filter(Boolean)
				.join(' ');
		} finally {
			busy = false;
		}
	}

	const pasteWhy = $derived(
		!searchOffered || searchGone === 'refused'
			? PEOPLE_SEARCH_NOT_OFFERED
			: !searchPeople || searchGone === 'unavailable'
				? 'Finding people by name appears once the server has the Armory 0.3 update. Add people by their school email.'
				: null
	);
</script>

{#snippet pasteForm()}
	<form class="ar-bulk" onsubmit={addPasted} data-testid="armory-add-member">
		<label class="ar-field">
			<span>School emails, one per line or separated by commas</span>
			<textarea
				class="plate-well"
				rows="3"
				bind:value={pasted}
				placeholder={'ana.reyes@boscotech.net\nben.okafor@boscotech.net, maria.lopez@boscotech.net'}
				data-testid="armory-add-emails"
			></textarea>
		</label>
		<div class="ar-form">
			<label class="ar-field ar-role-field">
				<span>As</span>
				<select class="plate-well" bind:value={pasteRole}>
					{#each roles as r (r)}<option value={r}>{ROLE_WORDS[r]}</option>{/each}
				</select>
			</label>
			<button class="btn ar-btn" type="submit" aria-disabled={busy}>Add people</button>
		</div>
		<p class="ar-message">A list copied from an email works too. Someone with no IDEA account yet is added now and appears by name once they sign in.</p>
	</form>
{/snippet}

<section class="ar-view-panel" aria-labelledby="ar-team-h" data-testid="armory-members">
	<h2 class="ar-visually-hidden" id="ar-team-h">Team</h2>
	{#if !teamReady}
		<p class="ar-message" data-testid="armory-team-not-ready">
			Names, pictures and who has Armory open appear once the server has the Armory 0.3 update.
		</p>
	{/if}
	<ul class="ar-well ar-team">
		{#each team as member (member.email)}
			{@const choices = roleChoices(member)}
			{@const out = checkoutCountFor(member, checkouts)}
			{@const shown = memberName(member)}
			<li class="ar-person" data-testid="armory-member" data-email={manages ? member.email : undefined}>
				<span class="ar-person-face">
					<Avatar subject={gridStudentSubject({ name: shown, email: member.email, avatar: member.avatar, avatar_url: member.avatar_url })} tintKey={member.email} size={40} />
				</span>
				<span class="ar-person-main">
					<span class="ar-person-head">
						<span class="person-name ar-person-name" title={shown}>{shown}{member.email === me ? ' (you)' : ''}</span>
						{#if member.pathway}<PathwayChip pathway={member.pathway} />{/if}
						{#if choices.length === 0}<span class="ar-readout" data-testid="armory-member-role">{ROLE_WORDS[member.role] ?? member.role}</span>{/if}
						{#if member.has_account === false}
							<span class="ar-readout" data-testid="armory-member-no-account">Not signed in to ideabosco.com yet</span>
						{/if}
					</span>
					{#if manages}<span class="ar-member-email">{member.email}</span>{/if}
					{#if teamReady}
						<ul class="ar-presence" data-testid="armory-presence">
							{#each member.devices ?? [] as device (device.id)}
								{@const presence = devicePresence(device, clock)}
								{@const version = appVersionWords(device)}
								<li class={`ar-presence-line ar-presence-${presence.tone}`} data-tone={presence.tone}>
									<span class="ar-presence-glyph" aria-hidden="true">{presence.glyph}</span>
									<span><span class="ar-presence-device">{device.name}</span>: {presence.words}{version ? ` · ${version}` : ''}</span>
								</li>
							{:else}
								<li class="ar-presence-line ar-presence-unknown" data-tone="none">
									<span class="ar-presence-glyph" aria-hidden="true">–</span>
									<span>{noComputerWords(member)}</span>
								</li>
							{/each}
						</ul>
					{/if}
					{#if out > 0}
						{#if checkedOutHref}
							<a
								class="ar-person-out"
								href={checkedOutHref}
								data-sveltekit-noscroll
								data-testid="armory-member-checkouts"
								onclick={(e) => {
									if (onholder?.(member.email)) e.preventDefault();
								}}>{out} checked out</a
							>
						{:else}
							<span class="ar-person-out">{out} checked out</span>
						{/if}
					{/if}
					{#if member.role === 'mentor' && mentorCount <= 1}
						<span class="ar-member-note" data-testid="armory-last-mentor">The only mentor. A project always keeps at least one, so this person cannot be removed or changed until another mentor is added.</span>
					{/if}
				</span>
				<span class="ar-member-actions">
					{#if choices.length > 0}
						<label class="ar-role">
							<span class="ar-visually-hidden">Role for {shown}</span>
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
							data-testid="armory-remove-member"
							onclick={() => remove(member)}
						>
							{armedRemove === member.email ? `Remove ${shown}?` : 'Remove'}
						</button>
					{/if}
				</span>
			</li>
		{/each}
	</ul>
	{#if armedRemove}
		<p class="ar-message">Press again to remove them. Their saved files and history stay in the project.</p>
	{/if}
	{#if message}<p class={`ar-message ${bad ? 'bad' : ''}`} role="status" data-testid="armory-people-message">{message}</p>{/if}

	{#if canAdd}
		<div class="ar-add" data-testid="armory-add">
			<h3 class="section-label ar-view-h">Add people</h3>
			{#if picker && searchPeople && addMember}
				<ArmoryPeoplePicker
					search={searchPeople}
					{roles}
					{members}
					{addMember}
					{refresh}
					onunavailable={(reason) => (searchGone = reason)}
				/>
				<div class="ar-paste" data-testid="armory-add-by-email">
					<Disclosure label="Add by email (someone without an IDEA account yet)" collapseWhen={true} testId="armory-add-by-email-toggle">
						{@render pasteForm()}
					</Disclosure>
				</div>
			{:else}
				{#if pasteWhy}<p class="ar-message" data-testid="armory-picker-why">{pasteWhy}</p>{/if}
				{@render pasteForm()}
			{/if}
		</div>
	{/if}
</section>
