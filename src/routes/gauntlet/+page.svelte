<script lang="ts">
	import Header from '$lib/gauntlet/Header.svelte';
	import TiltCard from '$lib/gauntlet/viewport/TiltCard.svelte';
	import ModeArt from '$lib/gauntlet/viewport/ModeArt.svelte';
	import { countUp } from '$lib/gauntlet/viewport/motion';
	import { MODES, familyLabel, modeStatusLabel } from '$lib/gauntlet';
	import {
		BADGES,
		computeStreak,
		levelFromXp,
		xpFromProgression,
		type ProgressionPayload
	} from '$lib/gauntlet/progression';

	/** Family sublabels for the card header (mockup: how each family verifies). */
	const FAMILY_SUB: Record<string, string> = {
		modeling: 'verified by mass',
		knowledge: 'read the print'
	};

	let { data } = $props();
	let { supabase, userName, userRole, isTeacher, modeStats } = $derived(data);

	const liveCount = MODES.filter((m) => m.status === 'live').length;
	const totalCleared = $derived(
		Object.values(modeStats.cleared as Record<string, number>).reduce((a, b) => a + b, 0)
	);

	// Progression layer (XP / level / streak / badges), null until 0021 lands.
	const progression = $derived((data.progression ?? null) as ProgressionPayload | null);
	const level = $derived(progression ? levelFromXp(xpFromProgression(progression)) : null);
	const streak = $derived(
		progression ? computeStreak(progression.practice_days, progression.today) : null
	);
	const clearedSet = $derived(new Set(progression?.cleared_ids ?? []));
	const badges = $derived(
		progression && streak
			? BADGES.map((b) => ({ ...b, isEarned: b.earned(progression, streak) }))
			: []
	);
	const earnedCount = $derived(badges.filter((b) => b.isEarned).length);

	/** Ring geometry: r=15 circle, circumference ~94.25. */
	const RING_C = 2 * Math.PI * 15;
</script>

<svelte:head>
	<title>IDEA // GAUNTLET</title>
</svelte:head>

<Header {supabase} {userName} {userRole} />

<main class="gauntlet">
	<section class="dojo-hero">
		<span class="eyebrow">CAD Skills Dojo</span>
		<h1 class="dojo-tagline">Enter weak. Leave strong.</h1>
		<p class="lead">
			Train your SolidWorks skills across challenge modes. Read drawings, model against the
			clock, reverse engineer parts, and climb the boards. Every run is scored and tracked.
		</p>
		<div class="dojo-stats">
			<div class="dojo-stat">
				<span class="stat-value"><span use:countUp={liveCount}>{liveCount}</span><span class="stat-of">/ {MODES.length}</span></span>
				<span class="stat-label">Modes live</span>
			</div>
			<div class="dojo-stat">
				<span class="stat-value" use:countUp={totalCleared}>{totalCleared}</span>
				<span class="stat-label">Challenges cleared</span>
			</div>
			{#if level}
				<div class="dojo-stat">
					<span class="stat-value" use:countUp={level.level}>{level.level}</span>
					<span class="stat-label">Level &middot; {level.name}</span>
				</div>
			{/if}
			{#if streak}
				<div class="dojo-stat">
					<span class="stat-value" class:streak-live={streak.state === 'active'}>
						{streak.current}<span class="stat-of">day{streak.current === 1 ? '' : 's'}</span>
					</span>
					<span class="stat-label">Practice streak</span>
				</div>
			{/if}
			<div class="dojo-stat">
				<span class="stat-value cyan">{userRole}</span>
				<span class="stat-label">Your rank</span>
			</div>
		</div>
		{#if level}
			<div class="xp-bar" role="img" aria-label="Level {level.level}, {level.xp} XP">
				<div class="xp-track"><div class="xp-fill" style="width:{Math.round(level.progress * 100)}%"></div></div>
				<span class="xp-label">{level.xp} XP &middot; {level.ceiling - level.xp} to level {level.level + 1}</span>
			</div>
		{/if}
		{#if streak && streak.hint && streak.state !== 'active'}
			<p class="streak-hint" class:restore={streak.state === 'restore'}>{streak.hint}</p>
		{/if}
	</section>

	<a class="roomstrip" href="/gauntlet/rooms">
		<div>
			<div class="rs-label">Live rooms</div>
			<div class="rs-title">Race a synchronized Speedrun</div>
			<div class="rs-meta">One host &middot; one shared server clock &middot; a live board</div>
		</div>
		<span class="btn">Enter rooms</span>
	</a>

	<a class="card author-callout" href="/gauntlet/leaderboard">
		<div>
			<div class="author-title">Leaderboard</div>
			<div class="author-sub">Overall XP standings and Speedrun records across the dojo.</div>
		</div>
		<span class="btn secondary">View board &rsaquo;</span>
	</a>

	{#if isTeacher}
		<a class="card author-callout" href="/gauntlet/author">
			<div>
				<div class="author-title">Authoring</div>
				<div class="author-sub">Create and manage challenges across every mode.</div>
			</div>
			<span class="btn secondary">Open authoring &rsaquo;</span>
		</a>
	{/if}

	<div class="grid-lede">
		<span class="gt-kicker">Select challenge</span>
		<h2>Six ways to sharpen the same skill</h2>
		<p>
			Modeling modes verify your part by mass. Knowledge modes test the print. Pick one, or drop
			into a live room and race the class.
		</p>
	</div>
	<div class="mode-grid">
		{#each MODES as mode (mode.id)}
			{@const total = (modeStats.totals as Record<string, number>)[mode.id] ?? 0}
			{@const cleared = (modeStats.cleared as Record<string, number>)[mode.id] ?? 0}
			{@const modeIds = ((modeStats.idsByMode as Record<string, string[]>) ?? {})[mode.id] ?? []}
			{#if mode.status === 'live' && mode.href}
				<TiltCard family={mode.family}>
					<a class="mode-card live {mode.family}" href={mode.href}>
						<div class="mode-top">
							<span class="mode-family {mode.family}">
								{familyLabel(mode.family)} &middot; {FAMILY_SUB[mode.family]}
							</span>
							<span class="mode-status status-live">Live</span>
						</div>
						<div class="mode-art"><ModeArt id={mode.id} /></div>
						<h3 class="mode-name">{mode.name}</h3>
						<p class="mode-tagline">{mode.tagline}</p>
						{#if progression && modeIds.length}
							<div class="gt-dots" aria-label="{cleared} of {total} challenges cleared">
								{#each modeIds.slice(0, 14) as id (id)}
									<span class="dot" class:cleared={clearedSet.has(id)}></span>
								{/each}
								{#if modeIds.length > 14}<span class="dots-more">+{modeIds.length - 14}</span>{/if}
							</div>
						{/if}
						<div class="mode-foot">
							<span class="gt-ring" role="img" aria-label="{total ? Math.round((cleared / total) * 100) : 0}% complete">
								<svg viewBox="0 0 36 36" aria-hidden="true">
									<circle class="ring-track" cx="18" cy="18" r="15" />
									<circle
										class="ring-fill"
										cx="18"
										cy="18"
										r="15"
										stroke-dasharray="{RING_C}"
										stroke-dashoffset={RING_C * (1 - (total ? cleared / total : 0))}
									/>
								</svg>
								<span class="ring-pct">{total ? Math.round((cleared / total) * 100) : 0}</span>
							</span>
							<span class="gt-chip">
								<span class="chip-l">Cleared</span>
								<span class="chip-v">{cleared} / {total}</span>
							</span>
							<span class="mode-play">ENTER &#9656;</span>
						</div>
					</a>
				</TiltCard>
			{:else}
				<div class="mode-card locked {mode.family}" aria-disabled="true">
					<div class="mode-top">
						<span class="mode-family {mode.family}">
							{familyLabel(mode.family)} &middot; {FAMILY_SUB[mode.family]}
						</span>
						<span class="mode-status status-{mode.status}">{modeStatusLabel(mode.status)}</span>
					</div>
					<div class="mode-art"><ModeArt id={mode.id} /></div>
					<h3 class="mode-name">{mode.name}</h3>
					<p class="mode-tagline">{mode.tagline}</p>
					<div class="mode-foot">
						<span class="gt-chip">
							<span class="chip-l">Status</span>
							<span class="chip-v">{mode.status === 'construction' ? 'In progress' : 'Locked'}</span>
						</span>
					</div>
				</div>
			{/if}
		{/each}
	</div>

	{#if badges.length}
		<div class="grid-lede">
			<span class="gt-kicker">Achievements</span>
			<h2>Badges &middot; {earnedCount} / {badges.length}</h2>
		</div>
		<div class="badge-strip">
			{#each badges as badge (badge.id)}
				<div class="badge-chip" class:earned={badge.isEarned} title={badge.desc}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						{#if badge.icon === 'cut'}
							<path d="M4 18L20 6M4 6l16 12" /><circle cx="6" cy="18" r="2" /><circle cx="6" cy="6" r="2" />
						{:else if badge.icon === 'clear'}
							<path d="M5 12l5 5 9-10" />
						{:else if badge.icon === 'clock'}
							<circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 2M9 3h6" />
						{:else if badge.icon === 'macro'}
							<rect x="4" y="5" width="16" height="12" rx="1" /><path d="M8 21h8M12 17v4M8 9l3 3-3 3" />
						{:else if badge.icon === 'par'}
							<circle cx="12" cy="13" r="8" /><path d="M12 13l4-4M9 3h6" />
						{:else if badge.icon === 'target'}
							<circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
						{:else if badge.icon === 'streak'}
							<path d="M12 3c1 4-4 6-4 10a4 4 0 008 0c0-2-1-3-1-5 2 1 4 3 4 6a7 7 0 11-14 0c0-5 6-7 7-11z" />
						{:else if badge.icon === 'modes'}
							<rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" />
						{:else}
							<path d="M12 3l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.4 6.7 19.1l1-5.8L3.5 9.2l5.9-.9z" />
						{/if}
					</svg>
					<span class="badge-name">{badge.name}</span>
				</div>
			{/each}
		</div>
	{/if}

	<p class="dojo-note">
		Speedrun is live now, machine verified by the
		<a href="/gauntlet/tools">SolidWorks capture macro</a>. The other modes are under construction and
		will open as they are finished.
	</p>
</main>
