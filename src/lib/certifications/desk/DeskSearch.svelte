<script lang="ts">
	/**
	 * THE STUDENT SEARCH BOX, ALWAYS VISIBLE ON THE DESK (the spec's desk row).
	 * A text box with a datalist of every name the caller's own desk payload
	 * names (`peopleFromDesk`), submitting to the student view. A typed
	 * address goes straight there; a typed name resolves through
	 * `resolveSearch` when exactly one person matches, and otherwise the box
	 * says so in words rather than guessing. `cert_student_view` is the
	 * boundary on the other side: a name the certifier may not see answers
	 * "not found" there.
	 */
	import { goto } from '$app/navigation';
	import { deskStudentHref } from '$lib/certifications/nav';
	import { resolveSearch, type DeskPerson } from './desk';

	let { people = [], onopen = null }: { people?: DeskPerson[]; onopen?: ((email: string) => void) | null } = $props();

	let typed = $state('');
	let problem = $state<string | null>(null);
	const uid = $props.id();
	const listId = `cert-people-${uid}`;

	function submit(event: Event) {
		event.preventDefault();
		const email = resolveSearch(typed, people);
		if (!email) {
			problem = typed.trim() ? 'No one person matches that. Type their school email address.' : 'Type a name or a school email address.';
			return;
		}
		problem = null;
		if (onopen) onopen(email);
		else void goto(deskStudentHref(email));
	}
</script>

<form class="dk-search" role="search" data-testid="cert-desk-search" onsubmit={submit}>
	<label class="dk-sr" for="{listId}-input">Find a student by name or email</label>
	<input
		id="{listId}-input"
		type="search"
		list={listId}
		bind:value={typed}
		placeholder="Find a student"
		autocomplete="off"
		aria-describedby={problem ? `${listId}-problem` : undefined}
		oninput={() => (problem = null)}
	/>
	<datalist id={listId}>
		{#each people as p (p.email)}
			<option value={p.email}>{p.name ?? p.email}</option>
		{/each}
	</datalist>
	<button type="submit" class="btn cert-btn" data-testid="cert-desk-search-go">Open</button>
</form>
{#if problem}
	<p class="dk-held" id="{listId}-problem" role="status" data-testid="cert-desk-search-problem">{problem}</p>
{/if}
