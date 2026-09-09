<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import Avatar from '$lib/Avatar.svelte';
	import PathwayChip from '$lib/PathwayChip.svelte';
	import FrcUnitOverride from '$lib/frc/FrcUnitOverride.svelte';
	import FrcReviewQueue from '$lib/frc/FrcReviewQueue.svelte';
	import DecalReviewQueue from '$lib/greenline/DecalReviewQueue.svelte';
	import GreenlineDashboardCard from '$lib/greenline/GreenlineDashboardCard.svelte';
	import { reviewDecal } from '$lib/greenline/decals';
	import { PATHWAY_IDS, pathwayInk } from '$lib/pathways';
	import { displayName, type UserProfile } from '$lib/profile';
	import { domainById, rankForCount } from '$lib/frc/track';
	import { mdmUnitByNumber, mdmUnitById } from '$lib/frc/mdm-content';
	import { markUnitComplete, clearUnitComplete } from '$lib/frc/progression';
	import { approveSubmission, requestRevision } from '$lib/frc/gate-submissions';
	import AdminRoster from './AdminRoster.svelte';
	import {
		CONSOLE_PANELS,
		CONSOLE_SORT_MODES,
		mergeConsolePrefs,
		orderPanels,
		readConsolePrefs,
		recordConsoleUse,
		type ConsolePrefs,
		type ConsoleSort
	} from './console';

	/**
	 * THE ADMIN CONSOLE. One page, one app (ledger 0117, reports 24 and 26):
	 * what used to be `/dashboard` (the review queues, feedback, the pathway
	 * roster) and what used to be `/admin` (the admin roster, the coin links,
	 * the short links, the Drive connection) are PANELS on one grid.
	 *
	 * IT TAKES THE WINDOW. Mr. Pina runs 2844x1450, and the previous page put
	 * every section in a 1100px column (`.legacy-index .courses`, `.hero`,
	 * `.divider` and `.promo-callout` in app.css all cap there) -- so a console
	 * of nine regions sat in 39% of his screen with a stack that scrolled for
	 * five screens. The prompt named the 880px `main` cap; the tree says this
	 * page never sat in a `main` at all, and the cap that actually bit was the
	 * 1100px one, so that is the one released: the grid below is
	 * `repeat(auto-fit, minmax(min(26rem, 100%), 1fr))` inside a viewport
	 * gutter, which is 3 columns at 1440, 6 at 2844 and 1 at 375, measured.
	 * Prose is capped separately (`--measure-reading` on the hero paragraph and
	 * the blurbs sit inside a panel that is never wider than a column), which is
	 * the standard's own rule: cap the sentence, not the console.
	 *
	 * THE ORDER IS "MOST USED", PER ADMIN, AND THE RECORD IS THE ADMIN'S OWN
	 * INTERACTION. See ./console.ts for the registry, the preference shape and
	 * the ranking (which is the launcher's `rankByUse`, not a second copy). A
	 * use is noted on the first pointer-down or focus inside a panel per page
	 * load and persisted silently; the order is computed from the prefs the page
	 * loaded with, so nothing moves under a pointer.
	 *
	 * THE NAV CHIPS ARE THE SAME ORDER AS THE GRID, so the strip reads as an
	 * index of what is on screen rather than a second opinion about it. Each
	 * carries the panel's count where there is one, so at 375px -- where the
	 * grid is one column and the roster is a screen down -- the numbers are on
	 * the first screen.
	 */
	let { data } = $props();
	let { profile, email, students, rosterReady } = $derived(data);

	const teacherName = $derived(
		data.userProfile ? displayName(data.userProfile) : (profile?.full_name ?? email ?? 'Signed in')
	);
	const role = $derived(profile?.role ?? 'teacher');

	// ------ Panel order and the per-admin usage record. ------
	let prefs = $state<ConsolePrefs>({});
	$effect(() => {
		prefs = readConsolePrefs(data.userProfile?.preferences);
	});
	const sortMode = $derived<ConsoleSort>(prefs.sort ?? 'used');
	/* SEEDED ONCE, AT CONSTRUCTION, AND NOT IN AN EFFECT. The order keys on
	   the prefs the page LOADED with: a use recorded this visit changes
	   `prefs` and is persisted, and every `invalidateAll()` after an approval
	   brings the new record back through `data.userProfile` -- an effect
	   tracking that would then reorder the grid under the pointer that just
	   pressed Approve, which is the one thing the header promises not to do.
	   The page component remounts on the next navigation, which is when the
	   new order is meant to show. `setSort` writes it deliberately. */
	// svelte-ignore state_referenced_locally
	let loadedPrefs = $state<ConsolePrefs>(readConsolePrefs(data.userProfile?.preferences));
	const ordered = $derived(orderPanels(CONSOLE_PANELS, loadedPrefs, sortMode));

	const persist = async (next: ConsolePrefs) => {
		prefs = next;
		const merged = mergeConsolePrefs(data.userProfile?.preferences, next);
		// Fire and forget on purpose: a usage record that failed to save costs
		// nothing but next visit's order, and a save error here is not a thing
		// to put in front of somebody who is reviewing a queue.
		await data.supabase.from('profiles').update({ preferences: merged }).eq('id', data.userProfile?.id ?? '');
	};
	const setSort = (mode: ConsoleSort) => {
		loadedPrefs = { ...loadedPrefs, sort: mode };
		void persist({ ...prefs, sort: mode });
	};
	/* Once per panel per page load. Plain, NOT `$state`: written by the
	   handler that reads it, never read by an effect. */
	const noted = new Set<string>();
	const noteUse = (id: string) => {
		if (noted.has(id) || !data.userProfile?.id) return;
		noted.add(id);
		void persist(recordConsoleUse(prefs, id, new Date()));
	};

	// ------ Pathway admin: see and change any student's pathway. ------
	type StudentRow = {
		id: string;
		email: string | null;
		full_name: string | null;
		display_name: string | null;
		avatar: string | null;
		avatar_url: string | null;
		pathway: string | null;
	};

	// Adapt a roster row to what Avatar / displayName read.
	const toProfile = (s: StudentRow): UserProfile => ({
		...s,
		role: 'student',
		section_id: null,
		preferences: {}
	});

	let rosterFilter = $state('');
	let savingId = $state('');
	let rosterError = $state('');

	const filteredStudents = $derived.by(() => {
		const q = rosterFilter.trim().toLowerCase();
		const rows = (students ?? []) as StudentRow[];
		if (!q) return rows;
		return rows.filter((s) =>
			[s.display_name, s.full_name, s.email].some((v) => v?.toLowerCase().includes(q))
		);
	});

	const setPathway = async (s: StudentRow, value: string) => {
		savingId = s.id;
		rosterError = '';
		// Select the row back so an RLS-blocked zero-row update surfaces instead
		// of silently "succeeding" (same guard as ProfileMenu's saveProfile).
		const { data: rows, error } = await data.supabase
			.from('profiles')
			.update({ pathway: value || null })
			.eq('id', s.id)
			.select('id');
		if (error) {
			rosterError = error.message;
		} else if (!rows || rows.length === 0) {
			rosterError = 'Could not save. The change was blocked; try signing out and back in.';
		} else {
			await invalidateAll();
		}
		savingId = '';
	};

	// ------ FRC completion override: mark/unmark any student's units. ------
	// The completable CAD units (those with authored content); the override
	// covers exactly the units a mentor can verify a gate for.
	const cadUnits = (domainById('cad-mechanical')?.units ?? []).filter((u) => mdmUnitByNumber(u.n));

	let frcBusy = $state(''); // "<userId>:<unitId>" while a toggle is in flight
	let frcError = $state('');

	const completedFor = (userId: string): string[] => data.frcProgress?.[userId] ?? [];
	const cadDoneCount = (userId: string) => {
		const done = new Set(completedFor(userId));
		return cadUnits.reduce((acc, u) => acc + (done.has(u.id) ? 1 : 0), 0);
	};

	const toggleUnit = async (userId: string, unitId: string, next: boolean) => {
		frcBusy = `${userId}:${unitId}`;
		frcError = '';
		const { error } = next
			? await markUnitComplete(data.supabase, userId, unitId)
			: await clearUnitComplete(data.supabase, userId, unitId);
		if (error) frcError = error;
		else await invalidateAll();
		frcBusy = '';
	};

	// ------ FRC modeling-gate review queue (MDM-4 through MDM-8). ------
	// Maps each pending submission to its student (from the roster) and unit
	// (from the registry) for display. Approving records completion through
	// frc_mark_complete (inside approveSubmission), the single completion path.
	let reviewBusy = $state(''); // "<userId>:<unitId>" in flight
	let reviewError = $state('');

	const studentById = $derived(
		new Map(((students ?? []) as StudentRow[]).map((s) => [s.id, s]))
	);
	const reviewItems = $derived(
		(data.frcReviewQueue ?? []).map((r) => {
			const s = studentById.get(r.userId);
			const unit = mdmUnitById(r.unitId);
			return {
				userId: r.userId,
				unitId: r.unitId,
				unitLabel: unit ? `${unit.id} · ${unit.title}` : r.unitId,
				studentName: s ? displayName(toProfile(s)) : 'Unknown student',
				studentEmail: s?.email ?? null,
				link: r.link,
				notes: r.notes,
				submittedAt: r.submittedAt
			};
		})
	);

	const approveReview = async (userId: string, unitId: string) => {
		reviewBusy = `${userId}:${unitId}`;
		reviewError = '';
		const { error } = await approveSubmission(
			data.supabase,
			userId,
			unitId,
			new Date().toISOString()
		);
		if (error) reviewError = error;
		else await invalidateAll();
		reviewBusy = '';
	};

	const requestReview = async (userId: string, unitId: string, feedback: string) => {
		reviewBusy = `${userId}:${unitId}`;
		reviewError = '';
		const { error } = await requestRevision(
			data.supabase,
			userId,
			unitId,
			feedback,
			new Date().toISOString()
		);
		if (error) reviewError = error;
		else await invalidateAll();
		reviewBusy = '';
	};

	// ------ GREENLINE decal review queue (Phase 6c). ------
	// Both decisions route through the greenline_decal_review SECURITY DEFINER
	// RPC (reviewDecal) — the only write path onto another user's decal row; the
	// dashboard never updates greenline_decals directly.
	let decalBusy = $state(''); // userId in flight
	let decalError = $state('');

	const decalItems = $derived(
		(data.greenlineDecalQueue ?? []).map((r) => {
			const s = studentById.get(r.userId);
			return {
				userId: r.userId,
				studentName: s ? displayName(toProfile(s)) : 'Unknown student',
				studentEmail: s?.email ?? null,
				imageUrl: r.imageUrl,
				submittedAt: r.submittedAt
			};
		})
	);

	const approveDecal = async (userId: string) => {
		decalBusy = userId;
		decalError = '';
		const { error } = await reviewDecal(data.supabase, userId, 'approve');
		if (error) decalError = error;
		else await invalidateAll();
		decalBusy = '';
	};
	const requestDecalRevision = async (userId: string, feedback: string) => {
		decalBusy = userId;
		decalError = '';
		const { error } = await reviewDecal(data.supabase, userId, 'needs_revision', feedback);
		if (error) decalError = error;
		else await invalidateAll();
		decalBusy = '';
	};

	// ------ The counts each nav chip carries, and the hero's "waiting" tile. ------
	const greenlineWaiting = $derived(
		data.greenlinePending?.ready ? data.greenlinePending.total : decalItems.length
	);
	const counts = $derived<Record<string, number | null>>({
		'frc-reviews': reviewItems.length,
		'greenline-reviews': greenlineWaiting,
		feedback: data.feedbackNewCount ?? 0,
		roster: (students ?? []).length,
		admins: (data.admins ?? []).length,
		links: null,
		coin: null,
		drive: null,
		content: null
	});
	const waiting = $derived(reviewItems.length + greenlineWaiting + (data.feedbackNewCount ?? 0));
</script>

<svelte:head>
	<title>Admin console // IDEA</title>
</svelte:head>

<div class="legacy-index admin-console" data-testid="admin-console">
	<header>
		<a class="logo logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
		<div class="header-right">
			<div class="auth-block">
				<a class="auth-link" href="/">Home</a>
				<ProfileMenu />
			</div>
		</div>
	</header>

	<section class="hero console-hero">
		<div class="hero-eyebrow">IDEA // Administration</div>
		<h1>Admin console<span class="accent">{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}</span>.</h1>
		<p class="hero-sub">
			Every review queue, the rosters and the portal settings, on one screen. Panels sit in
			the order you use them.
		</p>
		<div class="hero-meta">
			<div class="hero-stat">
				<span class="value" style="color:var(--cyan); text-shadow:var(--glow-cyan)">{teacherName}</span>
				<span class="label">Signed in as</span>
			</div>
			<div class="hero-stat">
				<span class="value" style="color:var(--gold); text-shadow:var(--glow-gold); animation-delay:0.8s">{role}</span>
				<span class="label">Role</span>
			</div>
			<div class="hero-stat">
				<span class="value" data-testid="console-waiting">{waiting}</span>
				<span class="label">Waiting on you</span>
			</div>
		</div>
	</section>

	<div class="console-bar">
		<nav class="console-nav" aria-label="Console panels" data-testid="console-nav">
			{#each ordered as panel (panel.id)}
				<a class="chip" href="#panel-{panel.id}" data-chip={panel.id}>
					<span class="chip-word">{panel.title}</span>
					{#if counts[panel.id] !== null}
						<span class="chip-count" aria-label="{counts[panel.id]} in {panel.title}">{counts[panel.id]}</span>
					{/if}
				</a>
			{/each}
		</nav>
		<label class="console-sort">
			<span>Order</span>
			<select
				aria-label="Panel order"
				value={sortMode}
				data-testid="console-sort"
				onchange={(e) => setSort(e.currentTarget.value as ConsoleSort)}
			>
				{#each CONSOLE_SORT_MODES as m (m.id)}
					<option value={m.id}>{m.label}</option>
				{/each}
			</select>
		</label>
	</div>

	{#snippet panelHead(id: string, title: string, blurb: string)}
		<div class="panel-head">
			<h2 class="panel-title" id="panel-{id}-title">{title}</h2>
			<p class="panel-blurb">{blurb}</p>
		</div>
	{/snippet}

	<div class="console-grid" data-testid="console-grid">
		{#each ordered as panel (panel.id)}
			<section
				class="panel"
				id="panel-{panel.id}"
				data-panel={panel.id}
				aria-labelledby="panel-{panel.id}-title"
				onpointerdown={() => noteUse(panel.id)}
				onfocusin={() => noteUse(panel.id)}
			>
				{@render panelHead(panel.id, panel.title, panel.blurb)}

				{#if panel.id === 'frc-reviews'}
					<div class="panel-meta"><span class="meta-count">{reviewItems.length} pending</span></div>
					{#if !data.frcReviewReady}
						<p class="panel-note">
							Model submissions are not available yet. Apply migration
							0042_frc_gate_submissions.sql in the Supabase SQL editor. The per-student
							completion override in Students and pathways still works.
						</p>
					{:else}
						<FrcReviewQueue
							items={reviewItems}
							busyKey={reviewBusy}
							onApprove={approveReview}
							onRequestRevision={requestReview}
						/>
						{#if reviewError}<p class="panel-error">{reviewError}</p>{/if}
					{/if}
				{:else if panel.id === 'greenline-reviews'}
					<div class="panel-meta"><span class="meta-count">{decalItems.length} decals pending</span></div>
					{#if !data.greenlineDecalReady}
						<p class="panel-note">
							Decal submissions are not available yet. Apply migration 0051_greenline_decals.sql
							in the Supabase SQL editor.
						</p>
					{:else}
						<DecalReviewQueue
							items={decalItems}
							busyKey={decalBusy}
							onApprove={approveDecal}
							onRequestRevision={requestDecalRevision}
						/>
						{#if decalError}<p class="panel-error">{decalError}</p>{/if}
					{/if}
					<!-- GREENLINE moderation lives on its own page: the panel is
					     telemetry-wide and the real gate is in its RPCs; this card is the
					     admin's way to find it and carries the count as well as the link.
					     It is $lib/greenline/GreenlineDashboardCard.svelte, unchanged. -->
					<div class="panel-nested">
						<GreenlineDashboardCard pending={data.greenlinePending} />
					</div>
				{:else if panel.id === 'feedback'}
					<div class="panel-meta">
						<span class="meta-count">{data.feedbackNewCount} new</span>
						<a class="btn secondary" href="/classroom/feedback">Open queue</a>
					</div>
				{:else if panel.id === 'roster'}
					<div class="panel-meta roster-meta">
						<label class="roster-filter-wrap">
							<span class="sr-only">Filter students</span>
							<input
								class="roster-filter"
								type="search"
								placeholder="Filter by name or email"
								bind:value={rosterFilter}
							/>
						</label>
						<span class="meta-count">{filteredStudents.length} / {(students ?? []).length}</span>
					</div>
					{#if !rosterReady}
						<p class="panel-note">
							The pathway column is not available yet. Apply migration 0038_profile_pathway.sql in
							the Supabase SQL editor.
						</p>
					{:else if filteredStudents.length === 0}
						<p class="panel-note">
							{(students ?? []).length === 0
								? 'No student accounts yet. Students appear here after their first sign-in.'
								: 'No students match this filter.'}
						</p>
					{:else}
						<div class="roster">
							{#each filteredStudents as s (s.id)}
								{@const done = cadDoneCount(s.id)}
								{@const rank = rankForCount(done)}
								<div class="roster-entry">
									<div class="roster-row" class:saving={savingId === s.id}>
										<div class="roster-id">
											<Avatar profile={toProfile(s)} size={28} />
											<PathwayChip pathway={s.pathway} size="sm" />
											<div class="roster-names">
												<!-- THE INK, NOT THE IDENTITY COLOUR: the previous page tinted the
												     name in `pathwayColor`, and CSEE's blue measured 4.01:1 on
												     the card. `pathwayInk` is the same hue at a lightness that
												     carries text (CLAUDE.md, "an identity colour is never moved
												     to pass a contrast check; the derived value moves"). -->
												<span
													class="roster-name"
													style={pathwayInk(s.pathway) ? `color:${pathwayInk(s.pathway)}` : ''}
												>
													{displayName(toProfile(s))}
												</span>
												{#if s.email}<span class="roster-email">{s.email}</span>{/if}
											</div>
										</div>
										<label class="roster-set">
											<span class="roster-set-label">Pathway</span>
											<select
												value={s.pathway ?? ''}
												disabled={savingId === s.id}
												onchange={(e) => setPathway(s, e.currentTarget.value)}
											>
												<option value="">Not set</option>
												{#each PATHWAY_IDS as id (id)}
													<option value={id}>{id}</option>
												{/each}
											</select>
										</label>
									</div>
									{#if data.frcProgressReady && cadUnits.length}
										<details class="roster-frc">
											<summary>
												<span class="frc-sum-label">FRC completion</span>
												<span class="frc-sum-meta">{rank.name} &middot; {done}/{cadUnits.length} CAD units</span>
												<span class="frc-sum-chev" aria-hidden="true">&#9662;</span>
											</summary>
											<FrcUnitOverride
												units={cadUnits}
												completed={completedFor(s.id)}
												busyId={frcBusy.startsWith(s.id + ':') ? frcBusy.slice(s.id.length + 1) : ''}
												onToggle={(unitId, next) => toggleUnit(s.id, unitId, next)}
											/>
										</details>
									{/if}
								</div>
							{/each}
						</div>
						{#if !data.frcProgressReady}
							<p class="panel-note">
								FRC unit completion is not available yet. Apply migration
								0039_frc_user_progress.sql in the Supabase SQL editor.
							</p>
						{/if}
						{#if frcError}<p class="panel-error">{frcError}</p>{/if}
					{/if}
					{#if rosterError}<p class="panel-error">{rosterError}</p>{/if}
				{:else if panel.id === 'admins'}
					<AdminRoster
						admins={data.admins ?? []}
						isOwner={data.isOwner === true}
						myEmail={data.myEmail ?? null}
						supabase={data.supabase}
					/>
				{:else if panel.id === 'links'}
					<div class="panel-meta">
						<a class="btn secondary" href="/admin/links">Manage short links</a>
					</div>
				{:else if panel.id === 'coin'}
					<div class="panel-meta">
						<a class="btn secondary" href="/coin-desk/students">Balances &amp; adjustments</a>
						<a class="btn secondary" href="/coin-desk">Coin desk</a>
					</div>
				{:else if panel.id === 'drive'}
					{#if data.notebookDrive?.configured}
						<p class="panel-note drive-ok">
							Connected: a refresh token is configured. Reconnect only to switch accounts or
							replace a revoked token.
						</p>
					{:else if !data.notebookDrive?.connectReady}
						<p class="panel-note drive-warn">
							Not configured: set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in the
							Vercel project env first (see .env.example), then connect.
						</p>
					{:else}
						<p class="panel-note drive-warn">
							Not connected yet: uploads answer 503 until the consent flow runs and the token is
							set.
						</p>
					{/if}
					<p class="panel-note">
						Connecting runs a one-time Google consent flow and displays a refresh token to copy
						into Vercel as <strong>GOOGLE_DRIVE_REFRESH_TOKEN</strong>. It acts as a real school
						account: the shared drive blocks outside identities, so there is no service account.
					</p>
					<div class="panel-meta">
						<a class="btn secondary" href="/admin/drive-connect">Connect Google Drive</a>
					</div>
				{:else if panel.id === 'content'}
					<div class="panel-meta">
						<a class="btn secondary" href="/">Portal homepage</a>
						<a class="btn secondary" href="/archive">Course archive (2025-26)</a>
					</div>
				{/if}
			</section>
		{/each}
	</div>

	<footer>
		<div class="footer-logo">IDEA - Integrated Design, Engineering &amp; Art</div>
		<div class="footer-sub">Don Bosco Technical Institute &bull; Rosemead, CA</div>
		<div class="footer-version"><VersionBadge app="dashboard" /></div>
	</footer>
</div>

<style>
	/* --- The console takes the window ------------------------------------
	   `.legacy-index .hero`, `.courses`, `.divider` and `.promo-callout` in
	   app.css all cap at 1100px centred. The hero keeps its type and rhythm
	   and loses the cap; the grid is this file's own. The gutter is one token
	   for the hero, the bar and the grid, so chrome and content share a width
	   source (IDEA_INTERFACE_STANDARDS 1). */
	.admin-console {
		--console-gutter: clamp(1rem, 2.5vw, 3rem);
	}
	.admin-console .console-hero {
		max-width: none;
		padding: 3.5rem var(--console-gutter) 2rem;
	}
	.admin-console .console-hero .hero-sub {
		max-width: var(--measure-reading);
	}

	/* --- The nav strip and the order control ----------------------------- */
	.console-bar {
		position: relative;
		z-index: 1;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3) var(--space-4);
		padding: 0 var(--console-gutter) var(--space-5);
	}
	.console-nav {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		flex: 1 1 auto;
		min-width: 0;
	}
	/* 44px chips: a word and, where there is one, a number. The chip is a
	   control (it jumps to the panel) so its edge is the boundary token. */
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		min-height: 44px;
		padding: 0.4rem 0.9rem;
		border: 1px solid var(--boundary);
		border-radius: 999px;
		background: var(--bg1);
		color: var(--white);
		text-decoration: none;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.chip:hover,
	.chip:focus-visible {
		border-color: var(--green);
		color: var(--green);
		box-shadow: none;
	}
	.chip-count {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--cyan);
		padding: 0.05rem 0.45rem;
		border: 1px solid var(--cyan);
		border-radius: var(--radius-chip);
		line-height: 1.3;
	}
	.console-sort {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-2);
		margin-left: auto;
	}
	.console-sort select {
		min-height: 44px;
		background: var(--bg2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		color: var(--white);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		padding: 0.4rem 0.6rem;
		cursor: pointer;
	}

	/* --- The grid -----------------------------------------------------------
	   A column is 26rem because the roster row (avatar, chip, name, email and
	   a pathway select) stops fitting on one line below about 380px of panel,
	   and a review item's link row ellipsises below ~400px; 26rem (416px)
	   leaves both a margin. `auto-fit` so nine panels in a 2844px window make
	   six columns and a 375px window makes one, with no breakpoint of its own.
	   `align-items: start` keeps a short panel short beside a tall one. */
	.console-grid {
		position: relative;
		z-index: 1;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(26rem, 100%), 1fr));
		gap: var(--space-5);
		align-items: start;
		padding: 0 var(--console-gutter) var(--space-8);
	}
	/* The roster is a list of every student in the school; above two columns
	   it takes two, so a name and its select share a line at any roster size. */
	@media (min-width: 64rem) {
		.panel[data-panel='roster'] {
			grid-column: span 2;
		}
	}

	/* --- A panel --------------------------------------------------------------
	   A card on the page plate: `--bg1` with the machined bevel the home
	   cards carry, and a `--boundary` edge because at 1.18:1 the plate and the
	   card are one region to the eye. */
	.panel {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4) var(--space-4) var(--space-5);
		background: var(--bg1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		box-shadow: var(--bevel-raised);
		scroll-margin-top: 80px;
		min-width: 0;
	}
	.panel:target {
		border-color: var(--green);
	}
	.panel-head {
		display: grid;
		gap: 0.3rem;
	}
	.panel-title {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--white);
		letter-spacing: 0.01em;
	}
	.panel-title::before {
		content: '// ';
		color: var(--green);
		font-family: var(--font-mono);
	}
	.panel-blurb,
	.panel-note {
		margin: 0;
		font-family: var(--font-display);
		font-size: 0.95rem;
		line-height: 1.5;
		color: var(--text-2);
	}
	.panel-note.drive-ok {
		color: var(--green);
	}
	.panel-note.drive-warn {
		color: var(--amber);
	}
	.panel-error {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--amber);
	}
	.panel-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}
	.meta-count {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	/* The GREENLINE card is a `.course-card` from app.css; inside a panel it
	   is a nested card and takes the recessed ground rather than a second
	   bevel on a bevel. */
	.panel-nested :global(.course-card) {
		box-shadow: none;
		background: var(--bg2);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	/* --- The pathway roster ---------------------------------------------------
	   The rows from the previous page, on 44px controls. */
	.roster-meta {
		justify-content: space-between;
	}
	.roster-filter-wrap {
		flex: 1 1 14rem;
		min-width: 0;
	}
	.roster-filter {
		width: 100%;
		box-sizing: border-box;
		min-height: 44px;
		background: var(--bg2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		color: var(--white);
		font-family: var(--font-display);
		font-size: 1rem;
		padding: 0.45rem 0.7rem;
	}
	.roster-filter:focus {
		outline: 2px solid var(--focus-ring);
		outline-offset: 1px;
	}
	.roster {
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--hairline);
	}
	.roster-entry {
		border-bottom: 1px solid var(--hairline);
	}
	.roster-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
		padding: var(--space-2) 0;
	}
	.roster-row.saving {
		opacity: 0.55;
	}
	.roster-id {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-width: 0;
		flex: 1 1 14rem;
	}
	.roster-names {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.roster-name {
		font-family: var(--font-display);
		font-weight: 600;
		font-size: 1rem;
		color: var(--white);
		line-height: 1.2;
	}
	.roster-email {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.roster-set {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
		min-height: 44px;
	}
	.roster-set-label {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.roster-set select {
		min-height: 44px;
		background: var(--bg2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		color: var(--white);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		padding: 0.3rem 0.5rem;
		cursor: pointer;
	}
	.roster-frc {
		padding: 0 0 var(--space-2);
	}
	.roster-frc summary {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.6rem;
		cursor: pointer;
		list-style: none;
		min-height: 44px;
		padding: 0.2rem 0;
	}
	.roster-frc summary::-webkit-details-marker {
		display: none;
	}
	.frc-sum-label {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	.frc-sum-meta {
		font-family: var(--font-mono);
		font-size: 0.74rem;
		color: var(--text-2);
	}
	.frc-sum-chev {
		margin-left: auto;
		font-size: 0.7rem;
		color: var(--text-2);
		transition: transform 0.15s ease;
	}
	.roster-frc[open] .frc-sum-chev {
		transform: rotate(180deg);
	}
	@media (prefers-reduced-motion: reduce) {
		.frc-sum-chev {
			transition: none;
		}
	}
</style>
