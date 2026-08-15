<script lang="ts">
	import NotebookView from '$lib/notebook/NotebookView.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<!--
	NO TRANSPORTS AT ALL, which is the mechanism rather than the statement:
	every write prop on NotebookView is optional and an omitted one removes the
	control it drives -- the "Add an entry" form, the folder manager, bulk move,
	pinning, and each card's own add-photos / add-note / re-file controls. There
	is nothing here to call, and 0106 ships no write RPC beside the read.

	The migration flags are all TRUE because the payload only exists at all when
	0106 applied on top of them: the RPC selects folders, notes, pinned_at and
	the activity view directly, so a project missing any of those fails the load
	rather than degrading into a half-view that would misreport what the student
	has written. `uploadReady` is false since no upload is offered.

	`canReview` is FALSE deliberately. The "Section review" link would loop back
	into a console that flags and grades, from a surface whose whole point is
	reading; the way back is the banner's own link to the grid this arrived from.
-->
<div class="back-strip">
	<a class="back" href="/notebook/review">&larr; Section review</a>
	<p class="who">
		Reading <strong>{data.student.display_name ?? data.student.email}</strong>'s notebook. This is
		their whole notebook, including entries they filed outside your class. You cannot change
		anything here.
	</p>
</div>

{#if data.student.user_id === null}
	<div class="nb-noaccount">
		<p>
			<strong>{data.student.display_name ?? data.student.email}</strong> is on the roster but has
			never signed in, so there is no notebook to show yet. Their check-ins are waiting for them.
		</p>
	</div>
{/if}

<NotebookView
	entries={data.entries}
	sessions={data.sessions}
	folders={data.folders}
	activity={data.activity}
	sectionLabel={data.sectionLabel}
	canReview={false}
	uploadReady={false}
	readOnly
	homeHref="/notebook/review"
/>

<style>
	.back-strip {
		max-width: 47rem;
		margin: 1rem auto 0;
		display: grid;
		gap: 0.35rem;
	}
	.back {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
		color: var(--gold);
	}
	.who {
		margin: 0;
		font-size: 0.85rem;
		color: var(--dim);
	}
	.who strong {
		color: var(--white);
	}
	.nb-noaccount {
		max-width: 47rem;
		margin: 1rem auto 0;
		padding: 0.7rem 1rem;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--bg2);
		font-size: 0.9rem;
		color: var(--dim);
	}
	.nb-noaccount strong {
		color: var(--white);
	}
</style>
