<script lang="ts">
	import Header from '$lib/gauntlet/Header.svelte';
	import Avatar from '$lib/Avatar.svelte';
	import { displayName, type UserProfile } from '$lib/profile';
	import { levelFromXp } from '$lib/gauntlet/progression';
	import { formatTime } from '$lib/gauntlet';

	let { data } = $props();
	let { supabase, userName, userRole, myUserId, boards } = $derived(data);

	// A board row carries just the display fields; adapt it to what Avatar /
	// displayName read (avatar, avatar_url, display_name, full_name).
	type NameRow = {
		user_id: string | null;
		display_name: string | null;
		full_name: string | null;
		avatar: string | null;
		avatar_url: string | null;
	};
	const toProfile = (r: NameRow): UserProfile => ({
		id: r.user_id ?? '',
		email: null,
		full_name: r.full_name,
		display_name: r.display_name,
		avatar_url: r.avatar_url,
		avatar: r.avatar,
		role: 'student',
		section_id: null,
		preferences: {}
	});

	const TIER_LABELS: Record<string, string> = {
		T1: 'Tier 1',
		T2: 'Tier 2',
		T3: 'Tier 3',
		T4: 'Tier 4',
		Other: 'Other drawings'
	};

	// Group the per-drawing Speedrun records into one board per tier (T1..T4, then
	// untiered), preserving the RPC's within-tier ordering (difficulty, title).
	const tierGroups = $derived.by(() => {
		const order = ['T1', 'T2', 'T3', 'T4', 'Other'];
		const map = new Map<string, typeof boards.speedrun>();
		for (const r of boards.speedrun) {
			const key = r.tier && ['T1', 'T2', 'T3', 'T4'].includes(r.tier) ? r.tier : 'Other';
			if (!map.has(key)) map.set(key, []);
			map.get(key)!.push(r);
		}
		return order
			.filter((k) => map.has(k))
			.map((k) => ({ tier: k, label: TIER_LABELS[k] ?? k, rows: map.get(k)! }));
	});
</script>

<svelte:head>
	<title>Leaderboard // GAUNTLET</title>
</svelte:head>

<Header {supabase} {userName} {userRole} crumbs={[{ label: 'Leaderboard' }]} />

<main class="gauntlet">
	<section class="mode-hero">
		<span class="eyebrow">Standings</span>
		<h1>Leaderboard</h1>
		<p class="lead">
			Overall standing by XP across every mode, plus the fastest machine-verified Speedrun on each
			drawing. Everything is derived from graded runs, so it cannot be gamed.
		</p>
	</section>

	<h2>Overall <span class="mono dim">by XP</span></h2>
	{#if boards.overall.length === 0}
		<div class="card"><p>No runs recorded yet. Clear a challenge to get on the board.</p></div>
	{:else}
		<table class="board lb-board">
			<thead>
				<tr>
					<th class="rank-col">#</th>
					<th>Player</th>
					<th class="lvl-col">Level</th>
					<th class="num-col">XP</th>
					<th class="num-col">Cleared</th>
				</tr>
			</thead>
			<tbody>
				{#each boards.overall as row (row.user_id)}
					{@const lvl = levelFromXp(row.xp)}
					<tr class:me={row.user_id === myUserId}>
						<td class="rank-col">{row.rank}</td>
						<td>
							<span class="lb-player">
								<Avatar profile={toProfile(row)} size={28} />
								<span class="lb-name"
									>{displayName(toProfile(row))}{#if row.user_id === myUserId}<span class="you">you</span>{/if}</span
								>
							</span>
						</td>
						<td class="lvl-col">
							<span class="lb-level">LVL {lvl.level}</span>
							<span class="dim lb-level-name">{lvl.name}</span>
						</td>
						<td class="num-col">{row.xp}</td>
						<td class="num-col">{row.cleared}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}

	<h2>Speedrun records</h2>
	<p class="dim board-note">
		Fastest machine-verified passing time on each drawing. A tie goes to whoever set it first.
	</p>
	{#if tierGroups.length === 0}
		<div class="card"><p>No Speedrun drawings are published yet.</p></div>
	{:else}
		{#each tierGroups as g (g.tier)}
			<h3 class="lb-tier">{g.label}</h3>
			<table class="board lb-board">
				<thead>
					<tr>
						<th>Drawing</th>
						<th>Record holder</th>
						<th class="num-col">Best</th>
						<th class="num-col">Par</th>
					</tr>
				</thead>
				<tbody>
					{#each g.rows as r (r.challenge_id)}
						<tr class:me={r.user_id != null && r.user_id === myUserId}>
							<td><a class="lb-drawing" href="/gauntlet/speedrun/{r.challenge_id}">{r.title}</a></td>
							<td>
								{#if r.user_id}
									<span class="lb-player">
										<Avatar profile={toProfile(r)} size={24} />
										<span class="lb-name">{displayName(toProfile(r))}</span>
									</span>
								{:else}
									<span class="dim">No record yet</span>
								{/if}
							</td>
							<td class="num-col">{r.best_time != null ? formatTime(r.best_time) : '--'}</td>
							<td class="num-col dim">{r.par_time != null ? formatTime(r.par_time) : '--'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/each}
	{/if}

	<div class="btn-row">
		<a class="btn secondary" href="/gauntlet">&lsaquo; Back to dojo</a>
	</div>
</main>
