<script lang="ts">
	/**
	 * "This student is on a roster but has never signed in" (0094's normal
	 * state), ONE IMPLEMENTATION shared by every screen that reads a specific
	 * student's notebook: /notebook/review/student/[studentEmail] and its dev
	 * harness (which used to hand-roll this identically), plus
	 * /classroom/view-as/[studentEmail]/notebook.
	 */

	let { displayName, email }: { displayName: string | null; email: string } = $props();
</script>

<div class="nb-noaccount">
	<p>
		<strong>{displayName ?? email}</strong> is on a roster but has never signed in, so there is no
		notebook to show yet. Their check-ins are waiting for them.
	</p>
</div>

<style>
	.nb-noaccount {
		max-width: var(--measure-split);
		margin: 1rem auto 0;
		box-sizing: border-box;
		padding: 0.7rem var(--cr-gutter, 1rem);
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
