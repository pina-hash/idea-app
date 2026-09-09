<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { ADMIN_OWNER_EMAIL, type AdminRow } from '$lib/admin';

	/**
	 * WHO CAN ADMINISTER THE PORTAL -- the panel that used to be the whole of
	 * `/admin` (0067), moved onto the console by ledger 0117 (report 26). Every
	 * admin can read this list; only the owner sees the controls, and
	 * `admin_grant` / `admin_revoke` refuse anyone else inside the database
	 * regardless of what renders here. The load decides what to render; the
	 * RPC decides what happens.
	 *
	 * REMOVE IS A TWO-STEP INLINE CONFIRM (arm, then confirm), the rule for
	 * anything irreversible-in-practice: a revoked admin is one line to
	 * re-grant, but the person pressing it is on a roster where every row is a
	 * colleague. The confirm names the address it is about to remove.
	 */
	let {
		admins,
		isOwner,
		myEmail,
		supabase
	}: { admins: AdminRow[]; isOwner: boolean; myEmail: string | null; supabase: SupabaseClient } =
		$props();

	let email = $state('');
	let note = $state('');
	let busy = $state(false);
	let errorMsg = $state('');
	let notice = $state('');
	let confirmRevoke = $state<string | null>(null);

	async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, done: string) {
		errorMsg = '';
		notice = '';
		busy = true;
		try {
			const { error } = await fn();
			if (error) {
				errorMsg = error.message;
				return false;
			}
			notice = done;
			await invalidateAll();
			return true;
		} finally {
			busy = false;
		}
	}

	async function grant() {
		const target = email.trim().toLowerCase();
		if (!target) return;
		const ok = await run(
			() => supabase.rpc('admin_grant', { p_email: target, p_note: note.trim() || null }),
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

<div class="ar" data-testid="admin-roster">
	{#if errorMsg}<p class="ar-feedback error" role="alert">{errorMsg}</p>{/if}
	{#if notice}<p class="ar-feedback notice" role="status">{notice}</p>{/if}

	{#if !admins.length}
		<p class="ar-note">No roster rows. If this is unexpected, migration 0067 may not be applied yet.</p>
	{/if}
	<ul class="ar-rows">
		{#each admins as a (a.email)}
			<li class="ar-row" class:owner={a.is_owner}>
				<div class="ar-who">
					<span class="ar-email">{a.email}</span>
					{#if a.is_owner}<span class="ar-tag owner-tag">Owner</span>{/if}
					{#if a.email === myEmail?.toLowerCase()}<span class="ar-tag you-tag">You</span>{/if}
				</div>
				<div class="ar-meta">
					{#if a.note}<span class="ar-note-text">{a.note}</span>{/if}
					<span class="ar-since">
						{a.granted_by ? `added by ${a.granted_by} · ` : ''}{when(a.granted_at)}
					</span>
				</div>
				{#if isOwner && !a.is_owner}
					<div class="ar-actions">
						{#if confirmRevoke === a.email}
							<button
								class="ar-btn danger"
								type="button"
								disabled={busy}
								onclick={async () => {
									confirmRevoke = null;
									await run(
										() => supabase.rpc('admin_revoke', { p_email: a.email }),
										`${a.email} is no longer an admin.`
									);
								}}
							>
								Confirm: remove {a.email}
							</button>
							<button class="ar-btn" type="button" onclick={() => (confirmRevoke = null)}>Cancel</button>
						{:else}
							<button class="ar-btn" type="button" disabled={busy} onclick={() => (confirmRevoke = a.email)}>
								Remove
							</button>
						{/if}
					</div>
				{:else if a.is_owner}
					<div class="ar-actions"><span class="ar-pinned">pinned in the schema</span></div>
				{/if}
			</li>
		{/each}
	</ul>

	{#if isOwner}
		<form
			class="ar-add"
			data-testid="admin-grant-form"
			onsubmit={(e) => {
				e.preventDefault();
				grant();
			}}
		>
			<p class="ar-note">
				Add an admin. Must be a <strong>@boscotech.edu</strong> address; the account does not have
				to have signed in yet, access applies the first time it does.
			</p>
			<div class="ar-add-row">
				<label class="ar-field">
					<span>Email</span>
					<input type="email" placeholder="name@boscotech.edu" bind:value={email} />
				</label>
				<label class="ar-field">
					<span>Note (optional)</span>
					<input type="text" maxlength="200" bind:value={note} />
				</label>
				<button class="btn" type="submit" disabled={busy || !email.trim()}>Grant admin</button>
			</div>
		</form>
	{:else}
		<p class="ar-note">
			Only the site owner ({ADMIN_OWNER_EMAIL}) can add or remove admins. That is enforced inside the
			database, not just here.
		</p>
	{/if}
</div>

<style>
	.ar {
		display: grid;
		gap: var(--space-3);
	}
	.ar-feedback {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
	}
	.ar-feedback.error {
		color: var(--amber);
		border-color: var(--amber);
	}
	.ar-feedback.notice {
		color: var(--green);
	}
	.ar-note {
		margin: 0;
		font-family: var(--font-display);
		font-size: 0.95rem;
		line-height: 1.5;
		color: var(--text-2);
		max-width: var(--measure-reading);
	}
	.ar-rows {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-2);
	}
	/* A ROW IS A CARD ON THE PANEL: it holds a control, so its edge is the
	   load-bearing token, not the hairline. */
	.ar-row {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-3);
		background: var(--bg2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
	}
	.ar-row.owner {
		border-color: var(--gold);
	}
	.ar-who {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
		min-width: 0;
	}
	.ar-email {
		font-family: var(--font-mono);
		font-size: 0.9rem;
		color: var(--white);
		overflow-wrap: anywhere;
	}
	.ar-tag {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		padding: 0.15rem 0.45rem;
		border-radius: var(--radius-chip);
		border: 1px solid currentColor;
	}
	.owner-tag {
		color: var(--gold);
	}
	.you-tag {
		color: var(--cyan);
	}
	.ar-meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-3);
		font-family: var(--font-mono);
		font-size: 0.74rem;
		color: var(--text-2);
	}
	.ar-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	/* 44px, at every width: a roster of colleagues is not a place to miss. */
	.ar-btn {
		min-height: 44px;
		padding: 0.5rem 0.9rem;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--white);
		background: transparent;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		cursor: pointer;
	}
	.ar-btn:hover,
	.ar-btn:focus-visible {
		border-color: var(--green);
		color: var(--green);
	}
	.ar-btn.danger {
		color: var(--amber);
		border-color: var(--amber);
	}
	.ar-btn:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.ar-pinned {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
		letter-spacing: 0.06em;
	}
	.ar-add {
		display: grid;
		gap: var(--space-3);
		padding-top: var(--space-3);
		border-top: 1px solid var(--hairline);
	}
	.ar-add-row {
		display: grid;
		gap: var(--space-3);
		grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
		align-items: end;
	}
	.ar-field {
		display: grid;
		gap: 0.3rem;
	}
	.ar-field span {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.ar-field input {
		min-height: 44px;
		width: 100%;
		box-sizing: border-box;
		background: var(--bg2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		color: var(--white);
		font-family: var(--font-display);
		font-size: 1rem;
		padding: 0.45rem 0.7rem;
	}
	.ar-field input:focus {
		outline: 2px solid var(--focus-ring);
		outline-offset: 1px;
	}
</style>
