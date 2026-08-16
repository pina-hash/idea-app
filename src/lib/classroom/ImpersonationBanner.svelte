<script lang="ts">
	/**
	 * The persistent "you are looking at someone else's classroom" bar. Sticky
	 * and unmissable ON PURPOSE: every screen underneath it is the ordinary
	 * student UI, so without this an admin could easily believe they were
	 * looking at their own account -- and the whole point of the mode is to
	 * report accurately on what a student sees.
	 *
	 * Amber, not crimson: this is a state to be aware of, not an error. It is
	 * also the honest colour for "read-only": there is no write path anywhere in
	 * this tree (no transports are passed, and 0083 ships no view_as write RPC
	 * at all), which the bar says out loud.
	 */
	let {
		email,
		displayName = null,
		exitHref = '/classroom/manage'
	}: {
		email: string;
		displayName?: string | null;
		exitHref?: string;
	} = $props();
</script>

<div class="imp-bar">
	<span class="imp-tag">VIEWING AS</span>
	<span class="imp-who">
		{#if displayName}<strong>{displayName}</strong>{/if}
		<span class="imp-email">{email}</span>
	</span>
	<span class="imp-note">read-only preview of what this student sees</span>
	<a class="imp-exit" href={exitHref}>Exit</a>
</div>

<style>
	.imp-bar {
		position: sticky;
		top: 0;
		z-index: 20;
		display: flex;
		align-items: center;
		gap: 0.7rem;
		flex-wrap: wrap;
		padding: 0.45rem 1rem;
		background: var(--surface-2);
		border-bottom: 1px solid var(--amber);
	}
	.imp-tag {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		letter-spacing: 0.12em;
		color: var(--amber);
		border: 1px solid var(--amber);
		border-radius: 999px;
		padding: 0.05rem 0.5rem;
	}
	.imp-who {
		display: flex;
		align-items: baseline;
		gap: 0.45rem;
		flex-wrap: wrap;
		min-width: 0;
	}
	.imp-who strong {
		font-size: 0.9rem;
		color: var(--text-1);
	}
	.imp-email {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--text-2);
		overflow-wrap: anywhere;
	}
	.imp-note {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.64rem;
		color: var(--text-2);
	}
	.imp-exit {
		margin-left: auto;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		color: var(--gold);
	}
	@media (max-width: 560px) {
		.imp-exit {
			margin-left: 0;
		}
	}
</style>
