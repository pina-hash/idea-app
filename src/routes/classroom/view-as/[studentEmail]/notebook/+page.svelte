<script lang="ts">
	import NotebookView from '$lib/notebook/NotebookView.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const base = $derived(`/classroom/view-as/${encodeURIComponent(data.student.email)}`);
</script>

<!--
	NO TRANSPORTS AT ALL. Every write prop on NotebookView is optional and an
	omitted one removes its control from the markup -- the "Add an entry" form,
	the folder manager, bulk move, pinning, and each card's own add-photos /
	add-note / re-file controls. There is nothing here to call, and 0099 ships
	no notebook view_as write RPC for it to call anyway.

	The migration flags are all TRUE because the payload only exists at all when
	0099 applied cleanly on top of them: the RPC selects folders, notes,
	pinned_at and the activity view directly, so a project missing any of those
	fails the load rather than degrading into a half-view that would misreport
	what the student sees. `uploadReady` is false since no upload is offered.
-->
{#if data.student.user_id === null}
	<div class="nb-noaccount">
		<p>
			<strong>{data.student.display_name ?? data.student.email}</strong> is on a roster but has
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
	homeHref={base}
/>

<style>
	.nb-noaccount {
		max-width: var(--measure-split);
		margin: var(--space-4) auto 0;
		padding: 0.7rem var(--cr-gutter, 1rem);
		box-sizing: border-box;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		background: var(--surface-2);
		font-size: 0.9rem;
		color: var(--text-2);
	}
	.nb-noaccount strong {
		color: var(--text-1);
	}
</style>
