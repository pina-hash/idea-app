<script lang="ts">
	/**
	 * THE WHOLE FOUNDRY IS OFF (report c26026b0, ledger 0360). Two weights of
	 * one statement, the `FoundryClosed` shape one switch wider.
	 *
	 *   panel   what everybody who is not a site administrator reads IN PLACE
	 *           of any Foundry page while it is off. The shell stays above it,
	 *           because a page that loses its masthead looks broken rather
	 *           than closed.
	 *   admin   a banner above the page for a site administrator, who is
	 *           exempt and keeps the whole room, and is told so with a link
	 *           to the switch. Browsing a Foundry nobody else can see without
	 *           being reminded is how it stays off by accident.
	 *
	 * THE WORDS ARE `access.ts`'s, ONCE, and the serve routes' refusal reads
	 * the same two. The admin's own note is shown on the panel when there is
	 * one; it is plain text, never `{@html}`, and nothing here names who
	 * pressed the switch (0230 never projects it).
	 */
	import {
		FOUNDRY_SITE_OFF_ADMIN_NOTICE,
		FOUNDRY_SITE_OFF_LEAD,
		FOUNDRY_SITE_OFF_SCOPE,
		type FoundrySiteState
	} from './access.ts';

	let {
		site,
		variant = 'panel',
		switchHref = '/foundry/classes#foundry-site'
	}: {
		site: FoundrySiteState;
		variant?: 'panel' | 'admin';
		/** Where the switch lives. Only the admin banner links to it. */
		switchHref?: string;
	} = $props();
</script>

{#if variant === 'panel'}
	<section class="fdy-block fdy-off" data-testid="foundry-site-off" data-variant="panel">
		<h2>{FOUNDRY_SITE_OFF_LEAD}</h2>
		{#if site.note}
			<!-- WHAT THE ADMINISTRATOR TYPED, as text. A label in words says whose
			     sentence it is without naming the person. -->
			<p class="fdy-off-note">
				<span class="fdy-off-note-label">Note from the site administrators</span>
				<span class="fdy-off-note-text">{site.note}</span>
			</p>
		{/if}
		<p class="fdy-off-scope">{FOUNDRY_SITE_OFF_SCOPE}</p>
	</section>
{:else}
	<p class="fdy-off-banner" role="status" data-testid="foundry-site-off" data-variant="admin">
		<span class="fdy-off-banner-word">Off for everyone else</span>
		<span class="fdy-off-banner-text">{FOUNDRY_SITE_OFF_ADMIN_NOTICE}</span>
		<a class="fdy-off-banner-link tap-44" href={switchHref}>Go to the switch</a>
	</p>
{/if}

<style>
	.fdy-off {
		max-width: 44rem;
		margin: 2rem auto;
		padding: 1.5rem;
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-md, 8px);
	}

	.fdy-off h2 {
		margin: 0 0 0.75rem;
		font-family: var(--font-display);
		color: var(--text-1);
	}

	.fdy-off-note {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		margin: 0 0 1rem;
		padding: 0.6rem 0.75rem;
		background: var(--surface-2);
		border-left: 3px solid var(--fg-heat-ember, var(--hairline));
		border-radius: var(--radius-sm, 4px);
	}

	.fdy-off-note-label {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}

	.fdy-off-note-text {
		color: var(--text-1);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.fdy-off-scope {
		margin: 0;
		color: var(--text-2);
	}

	/* THE ADMIN BANNER takes the page's own width and the heat edge this room
	   uses for "an adult turned something off". The word "Off" is the state;
	   the edge is not the only signal. */
	.fdy-off-banner {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem 0.85rem;
		margin: 0.75rem var(--cr-gutter, 1rem) 0;
		padding: 0.5rem 0.85rem;
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-left: 3px solid var(--fg-heat-ember, var(--hairline));
		border-radius: var(--radius-sm, 4px);
		color: var(--text-1);
	}

	.fdy-off-banner-word {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-1);
	}

	.fdy-off-banner-text {
		flex: 1 1 18rem;
		min-width: 0;
		color: var(--text-2);
	}

	.fdy-off-banner-link {
		display: inline-flex;
		align-items: center;
		font-family: var(--font-mono);
		font-size: 0.85rem;
	}
</style>
