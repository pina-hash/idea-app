<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import { ADMIN_OWNER_EMAIL } from '$lib/admin';
	import type { PageData } from './$types';

	/**
	 * Who can administer the portal. Every admin can read this list; only the
	 * owner sees the controls, and admin_grant / admin_revoke refuse anyone
	 * else server-side regardless of what renders here.
	 */
	let { data }: { data: PageData } = $props();

	let email = $state('');
	let note = $state('');
	let busy = $state(false);
	let errorMsg = $state('');
	let notice = $state('');
	let confirmRevoke = $state<string | null>(null);

	/**
	 * IDEA Coin balance lookup/adjustment (0070). Any admin may use this, not
	 * just the owner -- is_admin() is the real gate on the RPCs themselves.
	 * This is the "attach a balance to an email regardless of login status"
	 * tool from docs/coin-economy Part 8: coin_admin_lookup /
	 * coin_admin_adjust_balance both work purely off the email string, with
	 * no requirement that the account has ever signed in.
	 */
	interface CoinTxn {
		id: string;
		category_id: string;
		category_name: string;
		amount: number;
		quantity: number | null;
		note: string | null;
		actor_email: string;
		created_at: string;
	}
	interface CoinLookup {
		email: string;
		balance: number;
		wage_tier: number;
		eating_pass_active: boolean;
		eating_pass_strikes: number;
		recent_transactions: CoinTxn[];
	}

	let coinEmail = $state('');
	let coinBusy = $state(false);
	let coinError = $state('');
	let coinNotice = $state('');
	let coinLookup = $state<CoinLookup | null>(null);
	let adjustAmount = $state('');
	let adjustNote = $state('');

	async function coinLookupRun() {
		const target = coinEmail.trim().toLowerCase();
		if (!target) return;
		coinError = '';
		coinNotice = '';
		coinBusy = true;
		const resp = await data.supabase.rpc('coin_admin_lookup', { p_email: target });
		coinBusy = false;
		if (resp.error) {
			coinError = resp.error.message;
			coinLookup = null;
			return;
		}
		coinLookup = resp.data as CoinLookup;
	}

	async function coinAdjust() {
		const target = coinEmail.trim().toLowerCase();
		const amt = Number(adjustAmount);
		if (!target || !Number.isFinite(amt) || amt === 0 || !adjustNote.trim()) return;
		coinError = '';
		coinNotice = '';
		coinBusy = true;
		const resp = await data.supabase.rpc('coin_admin_adjust_balance', {
			p_email: target,
			p_amount: Math.round(amt),
			p_note: adjustNote.trim()
		});
		coinBusy = false;
		if (resp.error) {
			coinError = resp.error.message;
			return;
		}
		const r = resp.data as { ok: boolean; reason?: string; balance?: number };
		if (!r.ok) {
			coinError = r.reason === 'debt' ? `Balance is negative (${r.balance}i¢); adjustments still apply.` : (r.reason ?? 'Adjustment refused.');
		} else {
			coinNotice = `Applied ${amt > 0 ? '+' : ''}${Math.round(amt)}i¢ to ${target}. New balance: ${r.balance}i¢.`;
			adjustAmount = '';
			adjustNote = '';
			await coinLookupRun();
		}
	}

	async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, done: string) {
		errorMsg = '';
		notice = '';
		busy = true;
		const { error } = await fn();
		busy = false;
		if (error) {
			errorMsg = error.message;
			return false;
		}
		notice = done;
		await invalidateAll();
		return true;
	}

	async function grant() {
		const target = email.trim().toLowerCase();
		if (!target) return;
		const ok = await run(
			() => data.supabase.rpc('admin_grant', { p_email: target, p_note: note.trim() || null }),
			`${target} is now an admin.`
		);
		if (ok) {
			email = '';
			note = '';
		}
	}

	function when(iso: string): string {
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
	}
</script>

<svelte:head>
	<title>Site Admins // IDEA</title>
</svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/dashboard">Dashboard</a>
		<a class="btn secondary" href="/">&lsaquo; Home</a>
		<ProfileMenu />
	</div>
</div>

<main class="admin-page">
	<section class="hero">
		<div class="eyebrow">IDEA // Administration</div>
		<h1>Site admins</h1>
		<p class="lead">
			Admins hold every privileged capability on the portal: role assignment, the coin entry tool,
			student contact rosters, GAUNTLET authoring, FRC grading, content moderation and permanent
			deletion. A <strong>@boscotech.edu</strong> account on its own gets none of that.
		</p>
	</section>

	{#if errorMsg}<p class="feedback error">{errorMsg}</p>{/if}
	{#if notice}<p class="feedback notice">{notice}</p>{/if}

	<section class="card">
		<h2>Current admins ({data.admins.length})</h2>
		{#if !data.admins.length}
			<p class="note">
				No roster rows. If this is unexpected, migration 0067 may not be applied yet.
			</p>
		{/if}
		<div class="rows">
			{#each data.admins as a (a.email)}
				<div class="row" class:owner={a.is_owner}>
					<div class="who">
						<span class="email">{a.email}</span>
						{#if a.is_owner}
							<span class="tag owner-tag">Owner</span>
						{/if}
						{#if a.email === data.myEmail?.toLowerCase()}
							<span class="tag you-tag">You</span>
						{/if}
					</div>
					<div class="meta">
						{#if a.note}<span class="note-text">{a.note}</span>{/if}
						<span class="since">
							{a.granted_by ? `added by ${a.granted_by} · ` : ''}{when(a.granted_at)}
						</span>
					</div>
					{#if data.isOwner && !a.is_owner}
						<div class="actions">
							{#if confirmRevoke === a.email}
								<button
									class="mini danger"
									disabled={busy}
									onclick={async () => {
										confirmRevoke = null;
										await run(
											() => data.supabase.rpc('admin_revoke', { p_email: a.email }),
											`${a.email} is no longer an admin.`
										);
									}}
								>
									confirm remove
								</button>
								<button class="mini" onclick={() => (confirmRevoke = null)}>cancel</button>
							{:else}
								<button class="mini" disabled={busy} onclick={() => (confirmRevoke = a.email)}>
									remove
								</button>
							{/if}
						</div>
					{:else if a.is_owner}
						<div class="actions">
							<span class="pinned">pinned in the schema</span>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</section>

	{#if data.isOwner}
		<section class="card">
			<h2>Add an admin</h2>
			<p class="note">
				Must be a <strong>@boscotech.edu</strong> address. The account does not have to have signed
				in yet: access applies the first time they do.
			</p>
			<div class="add-row">
				<input
					type="email"
					placeholder="name@boscotech.edu"
					bind:value={email}
					onkeydown={(e) => {
						if (e.key === 'Enter') grant();
					}}
				/>
				<input type="text" maxlength="200" placeholder="Note (optional)" bind:value={note} />
				<button class="btn" disabled={busy || !email.trim()} onclick={grant}>Grant admin</button>
			</div>
		</section>
	{:else}
		<section class="card">
			<h2>Changing this list</h2>
			<p class="note">
				Only the site owner ({ADMIN_OWNER_EMAIL}) can add or remove admins. That is enforced inside
				the database, not just here.
			</p>
		</section>
	{/if}

	<section class="card">
		<h2>IDEA Coin balances</h2>
		<p class="note">
			Look up or adjust a student's coin balance by email, whether or not they've signed in yet.
			The balance is derived from the transaction ledger (migration 0070); this does not touch the
			old Sheets-based ledger or coin-entry.html.
		</p>
		{#if coinError}<p class="feedback error">{coinError}</p>{/if}
		{#if coinNotice}<p class="feedback notice">{coinNotice}</p>{/if}
		<div class="add-row">
			<input
				type="email"
				placeholder="student@boscotech.net"
				bind:value={coinEmail}
				onkeydown={(e) => {
					if (e.key === 'Enter') coinLookupRun();
				}}
			/>
			<button class="btn secondary" disabled={coinBusy || !coinEmail.trim()} onclick={coinLookupRun}>
				Look up
			</button>
		</div>

		{#if coinLookup}
			<div class="coin-summary">
				<div class="coin-balance" class:negative={coinLookup.balance < 0}>
					{coinLookup.balance}i¢
				</div>
				<div class="coin-meta">
					<span>{coinLookup.email}</span>
					<span>wage tier {coinLookup.wage_tier}</span>
					<span>
						eating pass:
						{coinLookup.eating_pass_active ? `active (${coinLookup.eating_pass_strikes} strike${coinLookup.eating_pass_strikes === 1 ? '' : 's'})` : 'none'}
					</span>
				</div>
			</div>

			<div class="add-row">
				<input type="number" step="1" placeholder="+/- i¢" bind:value={adjustAmount} />
				<input type="text" maxlength="500" placeholder="Reason (required)" bind:value={adjustNote} />
				<button
					class="btn"
					disabled={coinBusy ||
						!Number.isFinite(Number(adjustAmount)) ||
						Number(adjustAmount) === 0 ||
						!adjustNote.trim()}
					onclick={coinAdjust}
				>
					Apply adjustment
				</button>
			</div>

			{#if coinLookup.recent_transactions.length}
				<div class="rows coin-rows">
					{#each coinLookup.recent_transactions as t (t.id)}
						<div class="row">
							<div class="who">
								<span class="email">{t.category_name}</span>
							</div>
							<div class="meta">
								{#if t.note}<span class="note-text">{t.note}</span>{/if}
								<span class="since">by {t.actor_email} · {when(t.created_at)}</span>
							</div>
							<div class="actions">
								<span class:txn-neg={t.amount < 0} class:txn-pos={t.amount > 0}>
									{t.amount > 0 ? '+' : ''}{t.amount}i¢
								</span>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="note">No transactions logged yet for this email.</p>
			{/if}
		{/if}
	</section>

	<section class="card">
		<h2>Digital notebook · Google Drive</h2>
		<p class="note">
			Notebook photo uploads act as a real school Google account (the shared drive blocks outside
			identities, so there is no service account). Connecting runs a one-time Google consent flow
			and displays a refresh token to copy into Vercel as
			<strong>GOOGLE_DRIVE_REFRESH_TOKEN</strong>.
		</p>
		{#if data.notebookDrive.configured}
			<p class="note drive-ok">
				Connected: a refresh token is configured. Reconnect only to switch accounts or replace a
				revoked token.
			</p>
		{:else if !data.notebookDrive.connectReady}
			<p class="note drive-warn">
				Not configured: set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in the Vercel
				project env first (see .env.example), then connect.
			</p>
		{:else}
			<p class="note drive-warn">
				Not connected yet: uploads answer 503 until the consent flow runs and the token is set.
			</p>
		{/if}
		<div class="add-row">
			<a class="btn secondary" href="/admin/drive-connect">Connect Google Drive</a>
		</div>
	</section>

	<footer class="page-footer">
		<VersionBadge app="portal" />
	</footer>
</main>

<style>
	.admin-page {
		max-width: 52rem;
		margin: 0 auto;
		padding: 0 1.2rem 3rem;
	}
	.admin-page > .card {
		margin-bottom: 1.1rem;
	}
	.admin-page h2 {
		margin-top: 0;
	}
	.lead strong {
		color: var(--white);
	}
	.feedback {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
		padding: 0.45rem 0.7rem;
		border-radius: 5px;
		margin-bottom: 0.8rem;
	}
	.feedback.error {
		color: var(--amber);
		border: 1px solid var(--amber);
	}
	.feedback.notice {
		color: var(--green);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.25));
	}
	.drive-ok {
		color: var(--green);
	}
	.drive-warn {
		color: var(--amber);
	}
	.rows {
		display: flex;
		flex-direction: column;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		flex-wrap: wrap;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--line, rgba(0, 255, 65, 0.08));
	}
	.row:last-child {
		border-bottom: none;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 14rem;
	}
	.email {
		font-weight: 700;
		color: var(--white);
	}
	.tag {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.6rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		border-radius: 999px;
		padding: 0.05rem 0.5rem;
		border: 1px solid currentColor;
	}
	.owner-tag {
		color: var(--gold);
	}
	.you-tag {
		color: var(--cyan);
	}
	.meta {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}
	.note-text {
		font-size: 0.85rem;
		color: var(--dim);
	}
	.since {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.65rem;
		color: var(--dim);
	}
	.actions {
		margin-left: auto;
		display: flex;
		gap: 0.35rem;
		align-items: center;
	}
	.pinned {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		color: var(--gold);
		opacity: 0.8;
	}
	.mini {
		background: none;
		border: 1px solid var(--line, rgba(0, 255, 65, 0.25));
		border-radius: 4px;
		color: var(--dim);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		padding: 0.15rem 0.5rem;
		cursor: pointer;
	}
	.mini:hover:not(:disabled) {
		color: var(--white);
		border-color: var(--green);
	}
	.mini.danger {
		color: var(--crimson);
		border-color: var(--crimson);
	}
	.mini:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.add-row {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.add-row input {
		flex: 1;
		min-width: 12rem;
		background: var(--bg0);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.25));
		border-radius: 4px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		padding: 0.4rem 0.55rem;
	}
	.note {
		color: var(--dim);
		font-size: 0.9rem;
	}
	.coin-summary {
		display: flex;
		align-items: baseline;
		gap: 1rem;
		flex-wrap: wrap;
		margin: 0.6rem 0 0.8rem;
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--line, rgba(0, 255, 65, 0.25));
		border-radius: 6px;
	}
	.coin-balance {
		font-family: 'Share Tech Mono', monospace;
		font-size: 1.4rem;
		color: var(--green);
	}
	.coin-balance.negative {
		color: var(--amber);
	}
	.coin-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.8rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--dim);
	}
	.coin-rows {
		margin-top: 0.6rem;
	}
	.txn-neg {
		color: var(--amber);
		font-family: 'Share Tech Mono', monospace;
	}
	.txn-pos {
		color: var(--green);
		font-family: 'Share Tech Mono', monospace;
	}
	.page-footer {
		margin-top: 2rem;
		display: flex;
		justify-content: center;
	}
</style>
