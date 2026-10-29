<script lang="ts">
	import AdminSubNav from '$lib/shell/AdminSubNav.svelte';
	import PageHeader from '$lib/shell/PageHeader.svelte';
	/**
	 * /admin/test-accounts (ledger 0422). Make a test student, put it in a class,
	 * then view or act as it. A test account is in no roster, grade view, count,
	 * leaderboard, stock board or badge anybody else sees.
	 */
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import ViewAsButtons from '$lib/shell/ViewAsButtons.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const live = $derived(data.accounts.filter((a) => !a.retired_at));
	const retired = $derived(data.accounts.filter((a) => a.retired_at));
	const when = (iso: string | null) =>
		iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' }) : 'never';
	let armRetire = $state<string | null>(null);
</script>

<svelte:head><title>Test accounts · IDEA</title></svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/admin/view-as">View as</a>
		<a class="btn secondary" href="/dashboard">&lsaquo; Admin console</a>
		<ProfileMenu />
	</div>
</div>
<AdminSubNav current="test-accounts" />

<main class="ta-page" data-testid="test-accounts-admin">
	<PageHeader eyebrow="IDEA Admin" title="Test accounts" meta="Student accounts for trying a class the way a student would. Nobody else ever sees them: not in a roster, a grade, a count, a leaderboard, a stock board or a badge." />

	{#if form?.message}
		<p class="ta-note" role="status" data-testid="test-accounts-note">{form.message}</p>
	{/if}

	{#if !data.ready}
		<section class="card ta-card"><p class="ta-small">Test accounts are not available on this database yet.</p></section>
	{:else}
		<section class="card ta-card ta-make" aria-labelledby="ta-new">
			<h2 id="ta-new" class="section-label">New test student</h2>
			<form method="POST" action="?/create" class="ta-row">
				<label class="ta-field">
					<span>Name</span>
					<input name="label" required maxlength="80" placeholder="Test Student, Block 2" />
				</label>
				<label class="ta-field">
					<span>Put in a class</span>
					<select name="section">
						<option value="">Not yet</option>
						{#each data.sections as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
					</select>
				</label>
				<button class="btn" type="submit" data-testid="test-account-create">Create</button>
			</form>
		</section>

		<section class="card ta-card" aria-labelledby="ta-list">
			<h2 id="ta-list" class="section-label">Test students <span class="ta-count">{live.length}</span></h2>
			{#if live.length === 0}
				<p class="ta-small">None yet. Make one above.</p>
			{:else}
				<ul class="ta-accounts" data-testid="test-accounts-list">
					{#each live as a (a.email)}
						<li class="ta-account">
							<div class="ta-who">
								<strong>{a.label}</strong>
								<span class="ta-small">{a.email}</span>
								<span class="ta-chips">
									{#each a.classes.filter((c) => c.active) as c (c.section_id)}<span class="ta-chip">{c.label}</span>{:else}<span class="ta-small">In no class</span>{/each}
									<span class="ta-small">· last used {when(a.last_session)}</span>
								</span>
							</div>
							<div class="ta-actions">
								{#if a.user_id}<ViewAsButtons userId={a.user_id} name={a.label} />{/if}
								<form method="POST" action="?/enroll" class="ta-enroll">
									<input type="hidden" name="email" value={a.email} />
									<input type="hidden" name="label" value={a.label} />
									<label class="sr-only" for={`ta-sec-${a.email}`}>Class for {a.label}</label>
									<select id={`ta-sec-${a.email}`} name="section" required>
										<option value="">Add to a class</option>
										{#each data.sections as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
									</select>
									<button class="btn secondary" type="submit">Add</button>
								</form>
								<form method="POST" action="?/retire">
									<input type="hidden" name="email" value={a.email} />
									{#if armRetire === a.email}
										<button class="btn danger" type="submit">Retire {a.label}</button>
										<button class="btn secondary" type="button" onclick={() => (armRetire = null)}>Keep</button>
									{:else}
										<button class="btn secondary" type="button" onclick={() => (armRetire = a.email)}>Retire</button>
									{/if}
								</form>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
			{#if retired.length}
				<details class="ta-retired">
					<summary>{retired.length} retired</summary>
					<ul>{#each retired as a (a.email)}<li class="ta-small">{a.label} · {a.email} · retired {when(a.retired_at)}</li>{/each}</ul>
				</details>
			{/if}
		</section>
	{/if}
</main>

<style>
	.ta-page {
		max-width: 72rem;
		margin: 0 auto;
		padding: 0 1rem 3rem;
	}
	.ta-card {
		padding: 1.1rem 1.2rem;
		margin: 0 0 1rem;
		min-width: 0;
	}
	.ta-card h2 {
		margin: 0 0 0.7rem;
	}
	.ta-count {
		margin-left: 0.4rem;
		color: var(--text-2);
	}
	.ta-note {
		margin: 0 0 1rem;
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--boundary);
		border-radius: 0.6rem;
	}
	.ta-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.8rem;
		align-items: end;
	}
	.ta-field {
		display: grid;
		gap: 0.25rem;
		flex: 1 1 14rem;
		min-width: 0;
	}
	.ta-field span {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.ta-field input,
	.ta-field select,
	.ta-enroll select {
		min-height: 44px;
		min-width: 0;
	}
	.ta-row .btn,
	.ta-actions .btn {
		min-height: 44px;
	}
	.ta-small {
		color: var(--text-2);
		font-size: 0.92rem;
		margin: 0;
	}
	.ta-accounts {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.ta-account {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.6rem 1rem;
		align-items: center;
		padding: 0.7rem 0;
		border-top: 1px solid var(--hairline);
	}
	@media (max-width: 900px) {
		.ta-account {
			grid-template-columns: minmax(0, 1fr);
		}
		.ta-actions {
			justify-content: flex-start;
		}
	}
	.ta-who {
		display: grid;
		gap: 0.15rem;
		min-width: 0;
	}
	.ta-who strong {
		font-size: 1.05rem;
	}
	.ta-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		align-items: center;
	}
	.ta-chip {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		padding: 0.12rem 0.5rem;
		border-radius: 999px;
		background: var(--surface-2);
		box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.5);
		color: var(--text-1);
	}
	.ta-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		align-items: center;
		justify-content: flex-end;
	}
	.ta-actions form {
		margin: 0;
		display: flex;
		gap: 0.4rem;
	}
	.ta-retired {
		margin-top: 0.8rem;
		color: var(--text-2);
	}
	.ta-retired summary {
		cursor: pointer;
		min-height: 32px;
		display: flex;
		align-items: center;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	.ta-page :is(input, select) {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 500;
		padding-inline: 0.7rem;
	}
</style>
