<script lang="ts">
	/**
	 * FIND PEOPLE BY NAME (Mr. Pina's report of 2026-10-07: "select students
	 * with accounts on the IDEA website ... linked to the IDEA website as users,
	 * not separate"). A combobox over `armory_people_search` (0233): type two
	 * letters of a name or of a school address, pick from the list, gather
	 * several in the tray, choose the role once, and add them all.
	 *
	 * THE SEARCH IS A GATED DIRECTORY, AND THE GATE IS THE DATABASE'S: mentors
	 * of the project and site admins, school accounts only, at most a dozen
	 * results, never a uuid, and a person who chose a display name is shown by
	 * it alone (found by their address, never by the full name it replaced).
	 * A refusal or a database without the function removes this control and
	 * the paste box takes its place, with a sentence saying why.
	 *
	 * THE SEARCH RUNS FROM THE INPUT HANDLER, NEVER FROM AN `$effect`: a
	 * debounce and a request counter, so a slow answer to "an" never replaces
	 * the answer to "ana" (CLAUDE.md, the injected-transport trap).
	 *
	 * Adding is the SAME per-person loop as the paste box (`addPeople`), with
	 * the page's reload held to one at the end.
	 */
	import { onDestroy } from 'svelte';
	import { holdDeployReload } from '$lib/shell/deploy-safety';
	import Avatar from '$lib/Avatar.svelte';
	import PathwayChip from '$lib/PathwayChip.svelte';
	import { gridStudentSubject } from '$lib/avatars';
	import {
		addPeople,
		addPeopleWords,
		PEOPLE_SEARCH_DEBOUNCE_MS,
		searchable,
		type ArmoryPersonResult,
		type MemberOutcome,
		type PeopleSearchAnswer
	} from './team';
	import { personName, ROLE_WORDS, type ArmoryMember, type ArmoryRole } from './view';

	let {
		search,
		roles,
		members,
		addMember,
		refresh = null,
		onunavailable = null
	}: {
		search: (query: string) => Promise<PeopleSearchAnswer>;
		/** The roles this person may hand out; the first is the default. */
		roles: ArmoryRole[];
		members: ArmoryMember[];
		addMember: (email: string, role: ArmoryRole, opts?: { refresh?: boolean }) => Promise<MemberOutcome>;
		refresh?: (() => Promise<void>) | null;
		/** Told when the search is refused or missing, so the paste box can take over. */
		onunavailable?: ((reason: 'unavailable' | 'refused') => void) | null;
	} = $props();

	const uid = $props.id();
	const listId = `ar-people-list-${uid}`;

	let query = $state('');
	let results = $state<ArmoryPersonResult[]>([]);
	let open = $state(false);
	let highlighted = $state(-1);
	let searching = $state(false);
	let searchProblem = $state('');
	let tray = $state<ArmoryPersonResult[]>([]);
	let role = $state<ArmoryRole>('student');
	let busy = $state(false);
	let message = $state('');
	let bad = $state(false);

	let timer: ReturnType<typeof setTimeout> | null = null;
	let seq = 0;
	onDestroy(() => {
		if (timer) clearTimeout(timer);
	});

	/* People picked and not yet added are work a full reload would lose, so a
	   new version of the site waits while the tray holds anybody (CLAUDE.md,
	   "ANYTHING A FULL LOAD WOULD DESTROY HOLDS THE RELOAD"). */
	$effect(() => {
		if (tray.length === 0) return;
		return holdDeployReload('armory people picked, not yet added');
	});

	const shownName = (p: Pick<ArmoryPersonResult, 'name' | 'email'>) => p.name?.trim() || personName(p.email);
	const inTray = (email: string) => tray.some((t) => t.email === email);

	function onInput(event: Event) {
		if (timer) clearTimeout(timer);
		searchProblem = '';
		// The box's own value, so the order of this handler and the binding never matters.
		const q = (event.currentTarget as HTMLInputElement).value;
		if (!searchable(q)) {
			seq++;
			results = [];
			open = false;
			searching = false;
			return;
		}
		searching = true;
		timer = setTimeout(() => void ask(q), PEOPLE_SEARCH_DEBOUNCE_MS);
	}

	async function ask(q: string) {
		const mine = ++seq;
		const answer = await search(q);
		if (mine !== seq) return; // a newer keystroke has its own answer coming
		searching = false;
		if (!answer.ok) {
			results = [];
			open = false;
			if (answer.reason === 'failed') searchProblem = 'The search did not answer. Try again in a minute.';
			else onunavailable?.(answer.reason);
			return;
		}
		results = answer.rows;
		highlighted = results.length ? 0 : -1;
		open = true;
	}

	function pick(person: ArmoryPersonResult) {
		if (!inTray(person.email)) tray = [...tray, person];
		query = '';
		results = [];
		open = false;
		highlighted = -1;
		message = '';
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			open = false;
			return;
		}
		if (!open || results.length === 0) return;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			highlighted = (highlighted + 1) % results.length;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			highlighted = (highlighted - 1 + results.length) % results.length;
		} else if (event.key === 'Enter' && highlighted >= 0) {
			event.preventDefault();
			pick(results[highlighted]);
		}
	}

	const canAdd = $derived(tray.length > 0 && !busy);

	async function addAll() {
		if (!canAdd) return;
		busy = true;
		message = '';
		const chosen = tray.map((t) => t.email);
		try {
			const result = await addPeople(chosen, role, members, addMember);
			if (result.added.length > 0) await refresh?.();
			// What did not land stays in the tray, so pressing Add again retries exactly that.
			const left = new Set(result.failed.map((f) => f.email));
			const label = (email: string) => shownName(tray.find((t) => t.email === email) ?? { email, name: null });
			message = addPeopleWords(result, role, label);
			bad = result.failed.length > 0;
			tray = tray.filter((t) => left.has(t.email));
		} finally {
			busy = false;
		}
	}
</script>

<div class="ar-picker" data-testid="armory-people-picker">
	<label class="ar-field ar-picker-field" for={`ar-people-q-${uid}`}>
		<span>Find people by name</span>
	</label>
	<div class="ar-combo">
		<input
			id={`ar-people-q-${uid}`}
			class="plate-well"
			type="text"
			role="combobox"
			aria-expanded={open}
			aria-controls={listId}
			aria-autocomplete="list"
			aria-activedescendant={open && highlighted >= 0 ? `${listId}-${highlighted}` : undefined}
			autocomplete="off"
			placeholder="Two letters of a name or a school email"
			bind:value={query}
			oninput={onInput}
			onkeydown={onKeydown}
			onblur={() => setTimeout(() => (open = false), 150)}
			onfocus={() => {
				if (results.length) open = true;
			}}
			data-testid="armory-people-search"
		/>
		{#if open}
			<ul class="ar-combo-list" id={listId} role="listbox" aria-label="People with an IDEA account" data-testid="armory-people-results">
				{#each results as person, i (person.email)}
					<li>
						<button
							type="button"
							role="option"
							id={`${listId}-${i}`}
							aria-selected={i === highlighted}
							class="ar-combo-option"
							class:highlighted={i === highlighted}
							data-testid="armory-people-option"
							onmousedown={(e) => {
								e.preventDefault();
								pick(person);
							}}
							onmouseenter={() => (highlighted = i)}
						>
							<Avatar subject={gridStudentSubject({ name: shownName(person), email: person.email, avatar: person.avatar, avatar_url: person.avatar_url })} tintKey={person.email} size={28} />
							<span class="ar-combo-who">
								<span class="ar-combo-name person-name" title={shownName(person)}>{shownName(person)}</span>
								<span class="ar-combo-email">{person.email}</span>
							</span>
							{#if person.pathway}<PathwayChip pathway={person.pathway} />{/if}
							{#if person.member_role}
								<span class="ar-readout" data-testid="armory-people-member">Already a {ROLE_WORDS[person.member_role] ?? 'member'}</span>
							{:else if inTray(person.email)}
								<span class="ar-readout">Picked</span>
							{/if}
						</button>
					</li>
				{/each}
				{#if results.length === 0}
					<li class="ar-combo-empty" data-testid="armory-people-none">
						Nobody with an IDEA account matches that. Someone who has not signed in yet can be added by email below.
					</li>
				{/if}
			</ul>
		{/if}
	</div>
	<p class="ar-message" role="status">
		{#if searching}Searching…{:else if searchProblem}{searchProblem}{:else}Only people who have signed in to ideabosco.com with a school account are found.{/if}
	</p>

	{#if tray.length > 0}
		<ul class="ar-tray" aria-label="People to add" data-testid="armory-people-tray">
			{#each tray as person (person.email)}
				<li class="ar-tray-item">
					<span class="person-name" title={shownName(person)}>{shownName(person)}</span>
					<button
						class="btn secondary ar-btn ar-tray-remove"
						type="button"
						aria-label={`Remove ${shownName(person)} from the list`}
						onclick={() => (tray = tray.filter((t) => t.email !== person.email))}
					>
						Remove
					</button>
				</li>
			{/each}
		</ul>
	{/if}
	<div class="ar-form">
		<label class="ar-field ar-role-field">
			<span>As</span>
			<select class="plate-well" bind:value={role} data-testid="armory-people-role">
				{#each roles as r (r)}<option value={r}>{ROLE_WORDS[r]}</option>{/each}
			</select>
		</label>
		<button class="btn ar-btn" type="button" aria-disabled={!canAdd} data-testid="armory-people-add" onclick={addAll}>
			{busy ? 'Adding…' : tray.length > 0 ? `Add ${tray.length} ${tray.length === 1 ? 'person' : 'people'}` : 'Add people'}
		</button>
	</div>
	{#if tray.length === 0 && !message}
		<p class="ar-message">Pick one or more people above, then add them together.</p>
	{/if}
	{#if message}<p class={`ar-message ${bad ? 'bad' : ''}`} role="status" data-testid="armory-people-message">{message}</p>{/if}
</div>
