<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import Avatar from '$lib/Avatar.svelte';
	import PathwayChip from '$lib/PathwayChip.svelte';
	import FrcUnitOverride from '$lib/frc/FrcUnitOverride.svelte';
	import FrcReviewQueue from '$lib/frc/FrcReviewQueue.svelte';
	import { PATHWAY_IDS, pathwayColor } from '$lib/pathways';
	import { displayName, type UserProfile } from '$lib/profile';
	import { domainById, rankForCount } from '$lib/frc/track';
	import { mdmUnitByNumber, mdmUnitById } from '$lib/frc/mdm-content';
	import { markUnitComplete, clearUnitComplete } from '$lib/frc/progression';
	import { approveSubmission, requestRevision } from '$lib/frc/gate-submissions';

	let { data } = $props();
	let { profile, email, students, rosterReady } = $derived(data);

	const teacherName = $derived(
		data.userProfile ? displayName(data.userProfile) : (profile?.full_name ?? email ?? 'Signed in')
	);
	const role = $derived(profile?.role ?? 'teacher');

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
</script>

<div class="legacy-index">
	<header>
		<a class="logo" href="/">IDEA</a>
		<div class="header-right">
			<div class="auth-block">
				<a class="auth-link" href="/">Home</a>
				<ProfileMenu />
			</div>
		</div>
	</header>

	<section class="hero">
		<div class="hero-eyebrow">Don Bosco Technical Institute - Teacher Dashboard</div>
		<h1>Welcome back<span class="accent">{profile?.full_name ? `, ${profile.full_name}` : ''}</span>.</h1>
		<p class="hero-sub">
			Teacher tools and portal controls. The public homepage carries the live 2026-27 curriculum for
			students.
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
		</div>
	</section>

	<div class="divider">
		<div class="divider-line"></div>
		<div class="divider-label">Profile</div>
		<div class="divider-line"></div>
	</div>

	<div class="courses">
		<div class="course-card visible">
			<div class="course-header">
				<div class="course-header-left">
					<div class="course-id">Account</div>
					<div class="course-updated">Your portal profile</div>
				</div>
			</div>
			<div class="assignment-list">
				<div class="assignment-item">
					<div class="assignment-left">
						<div class="assignment-name">Name</div>
					</div>
					<div class="assignment-right">
						<span class="section-meta">{profile?.full_name ?? 'Not set'}</span>
					</div>
				</div>
				<div class="assignment-item">
					<div class="assignment-left">
						<div class="assignment-name">Email</div>
					</div>
					<div class="assignment-right">
						<span class="section-meta">{email ?? 'Not set'}</span>
					</div>
				</div>
				<div class="assignment-item">
					<div class="assignment-left">
						<div class="assignment-name">Role</div>
					</div>
					<div class="assignment-right">
						<span class="assignment-status status-live">{role}</span>
					</div>
				</div>
			</div>
		</div>
	</div>

	<div class="divider" style="margin-top:2.5rem">
		<div class="divider-line"></div>
		<div class="divider-label">FRC Model Reviews</div>
		<div class="divider-line"></div>
	</div>

	<div class="courses">
		<div class="course-card visible">
			<div class="course-header">
				<div class="course-header-left">
					<div class="course-id">Review Queue</div>
					<div class="course-updated">
						Modeling-gate submissions (MDM-4 to MDM-8) awaiting review. Approving completes the
						unit and unlocks the next.
					</div>
				</div>
				<div class="course-meta">
					<span class="section-meta">{reviewItems.length} pending</span>
				</div>
			</div>
			{#if !data.frcReviewReady}
				<div class="roster-note">
					Model submissions are not available yet. Apply migration
					0042_frc_gate_submissions.sql in the Supabase SQL editor. The per-student completion
					override below still works.
				</div>
			{:else}
				<div style="padding:0.6rem 1rem 1rem">
					<FrcReviewQueue
						items={reviewItems}
						busyKey={reviewBusy}
						onApprove={approveReview}
						onRequestRevision={requestReview}
					/>
					{#if reviewError}<p class="roster-error">{reviewError}</p>{/if}
				</div>
			{/if}
		</div>
	</div>

	<div class="divider" style="margin-top:2.5rem">
		<div class="divider-line"></div>
		<div class="divider-label">Students &amp; Pathways</div>
		<div class="divider-line"></div>
	</div>

	<div class="courses">
		<div class="course-card visible">
			<div class="course-header">
				<div class="course-header-left">
					<div class="course-id">Pathway Roster</div>
					<div class="course-updated">
						Every Bosco Tech student's pathway. Identity only, it never gates access.
					</div>
				</div>
				<div class="course-meta">
					<input
						class="roster-filter"
						type="search"
						placeholder="Filter by name or email"
						bind:value={rosterFilter}
						aria-label="Filter students"
					/>
					<span class="section-meta">{filteredStudents.length} / {(students ?? []).length}</span>
				</div>
			</div>
			{#if !rosterReady}
				<div class="roster-note">
					The pathway column is not available yet. Apply migration 0038_profile_pathway.sql in the
					Supabase SQL editor.
				</div>
			{:else if filteredStudents.length === 0}
				<div class="roster-note">
					{(students ?? []).length === 0
						? 'No student accounts yet. Students appear here after their first sign-in.'
						: 'No students match this filter.'}
				</div>
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
										<span
											class="roster-name"
											style={pathwayColor(s.pathway) ? `color:${pathwayColor(s.pathway)}` : ''}
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
					<p class="roster-note">
						FRC unit completion is not available yet. Apply migration
						0039_frc_user_progress.sql in the Supabase SQL editor.
					</p>
				{/if}
				{#if frcError}<p class="roster-error">{frcError}</p>{/if}
			{/if}
			{#if rosterError}
				<p class="roster-error">{rosterError}</p>
			{/if}
		</div>
	</div>

	<div class="divider" style="margin-top:2.5rem">
		<div class="divider-line"></div>
		<div class="divider-label">Teacher Tools</div>
		<div class="divider-line"></div>
	</div>

	<a class="promo-callout nextlive" href="/coin-entry">
		<div class="promo-left">
			<div class="promo-icon">&#9679;</div>
			<div>
				<div class="promo-title">Coin Entry</div>
				<div class="promo-sub">Award IDEA Coins to students.</div>
			</div>
		</div>
		<div class="promo-cta">Open &rsaquo;</div>
	</a>

	<div class="divider" style="margin-top:2.5rem">
		<div class="divider-line"></div>
		<div class="divider-label">Content</div>
		<div class="divider-line"></div>
	</div>

	<a class="promo-callout" href="/">
		<div class="promo-left">
			<div class="promo-icon">&#9650;</div>
			<div>
				<div class="promo-title">Portal Homepage</div>
				<div class="promo-sub">The live 2026-27 curriculum, the student dashboard.</div>
			</div>
		</div>
		<div class="promo-cta">View &rsaquo;</div>
	</a>

	<a class="promo-callout" href="/archive">
		<div class="promo-left">
			<div class="promo-icon">&#9633;</div>
			<div>
				<div class="promo-title">Course Archive</div>
				<div class="promo-sub">Discontinued 2025-26 courses (IDEA-113/208/303/403).</div>
			</div>
		</div>
		<div class="promo-cta">View &rsaquo;</div>
	</a>

	<footer>
		<div class="footer-logo">IDEA - Integrated Design, Engineering &amp; Art</div>
		<div class="footer-sub">Don Bosco Technical Institute &bull; Rosemead, CA</div>
		<div class="footer-version"><VersionBadge app="dashboard" /></div>
	</footer>
</div>

<style>
	.roster-filter {
		background: var(--bg2, #081209);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.15));
		border-radius: 3px;
		color: var(--white, #e8ffe8);
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.7rem;
		padding: 0.35rem 0.55rem;
		min-width: 180px;
	}
	.roster-filter:focus {
		outline: none;
		border-color: var(--line-strong, rgba(0, 255, 65, 0.35));
	}
	.roster-note,
	.roster-error {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.72rem;
		color: var(--dim, #4a7a52);
		padding: 1rem 1.2rem;
		margin: 0;
	}
	.roster-error {
		color: var(--amber, #ff8c00);
	}
	.roster {
		display: flex;
		flex-direction: column;
	}
	.roster-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.55rem 1.2rem;
		border-top: 1px solid var(--line, rgba(0, 255, 65, 0.12));
	}
	.roster-row.saving {
		opacity: 0.55;
	}
	.roster-id {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-width: 0;
	}
	.roster-names {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.roster-name {
		font-family: var(--font-display, 'Rajdhani', sans-serif);
		font-weight: 600;
		font-size: 1rem;
		color: var(--white, #e8ffe8);
		line-height: 1.2;
	}
	.roster-email {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.62rem;
		color: var(--dim, #4a7a52);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.roster-set {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}
	.roster-set-label {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.58rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--dim, #4a7a52);
	}
	.roster-set select {
		background: var(--bg2, #081209);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.15));
		border-radius: 3px;
		color: var(--white, #e8ffe8);
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.7rem;
		padding: 0.3rem 0.4rem;
		cursor: pointer;
	}
	.roster-entry {
		border-top: 1px solid var(--line, rgba(0, 255, 65, 0.12));
	}
	.roster-entry .roster-row {
		border-top: none;
	}
	.roster-frc {
		padding: 0 1.2rem 0.6rem;
	}
	.roster-frc summary {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		cursor: pointer;
		list-style: none;
		padding: 0.2rem 0;
	}
	.roster-frc summary::-webkit-details-marker {
		display: none;
	}
	.frc-sum-label {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.6rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--cyan, #00f0ff);
	}
	.frc-sum-meta {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.66rem;
		color: var(--dim, #4a7a52);
	}
	.frc-sum-chev {
		margin-left: auto;
		font-size: 0.6rem;
		color: var(--dim, #4a7a52);
		transition: transform 0.15s ease;
	}
	.roster-frc[open] .frc-sum-chev {
		transform: rotate(180deg);
	}
	@media (max-width: 560px) {
		.roster-row {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.5rem;
		}
	}
</style>
