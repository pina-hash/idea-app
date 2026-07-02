<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import VersionBadge from '$lib/VersionBadge.svelte';

	let { data } = $props();

	// Humanize an internal key for display: uppercase, underscores to spaces.
	const human = (v: string | null | undefined): string =>
		v && v.length ? v.replace(/_/g, ' ').toUpperCase() : '—';

	// Score / count formatting.
	const fmtNum = (v: number | null | undefined): string =>
		typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString() : '0';

	// Run time as m:ss.
	const fmtTime = (s: number | null | undefined): string => {
		const t = Math.max(0, Math.round(typeof s === 'number' ? s : 0));
		return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
	};

	// Total playtime as e.g. "2h 14m" or "37m".
	const fmtPlaytime = (s: number): string => {
		const total = Math.max(0, Math.round(s || 0));
		const h = Math.floor(total / 3600);
		const m = Math.floor((total % 3600) / 60);
		if (h > 0) return h + 'h ' + m + 'm';
		if (m > 0) return m + 'm';
		return total + 's';
	};

	// Compact local date + time for a run row.
	const fmtWhen = (iso: string): string => {
		try {
			const d = new Date(iso);
			return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
				d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
		} catch {
			return iso;
		}
	};

	const signOut = async () => {
		await data.supabase.auth.signOut();
		await invalidateAll();
	};

	const summary = $derived(data.signedIn ? data.summary : null);
	const runs = $derived(data.signedIn ? data.runs : []);
	const userLabel = $derived(data.claims?.email ?? 'Signed in');
</script>

<svelte:head>
	<title>Run History // VANGUARD</title>
</svelte:head>

<header class="app-header">
	<div class="gauntlet-brand">
		<a class="wordmark" href="/">IDEA</a>
		<nav class="gauntlet-crumbs" aria-label="Breadcrumb">
			<a class="crumb crumb-root" href="/vanguard/">// VANGUARD</a>
			<span class="crumb-sep" aria-hidden="true">/</span>
			<span class="crumb crumb-current">Run History</span>
		</nav>
	</div>
	{#if data.signedIn}
		<div class="header-right">
			<div class="user-block">
				<div class="user-name">{userLabel}</div>
				<div class="user-role">pilot</div>
			</div>
			<button class="btn secondary" type="button" onclick={signOut}>Sign out</button>
		</div>
	{:else}
		<div class="header-right">
			<a class="btn secondary" href="/">Home</a>
		</div>
	{/if}
</header>

<main class="vg-history">
	<section class="vg-hero">
		<span class="eyebrow">VANGUARD</span>
		<h1>Run History</h1>
		<p class="lead">Your past runs and lifetime stats. Every finished run is logged while you are signed in.</p>
	</section>

	{#if !data.signedIn}
		<div class="card empty">
			<p>Sign in to track your VANGUARD run history.</p>
			<div class="btn-row">
				<a class="btn" href="/">Go to sign in &rsaquo;</a>
				<a class="btn secondary" href="/vanguard/">Play VANGUARD</a>
			</div>
		</div>
	{:else if !runs.length}
		<div class="card empty">
			<p>No runs recorded yet. Go play a run and it will show up here.</p>
			<div class="btn-row">
				<a class="btn" href="/vanguard/">Play VANGUARD &rsaquo;</a>
			</div>
		</div>
	{:else if summary}
		<div class="stat-grid">
			<div class="stat"><span class="stat-value">{fmtNum(summary.totalRuns)}</span><span class="stat-label">Total runs</span></div>
			<div class="stat"><span class="stat-value gold">{fmtNum(summary.bestScore)}</span><span class="stat-label">Best score</span></div>
			<div class="stat"><span class="stat-value">{fmtNum(summary.bestScoreNormal)}</span><span class="stat-label">Best normal</span></div>
			<div class="stat"><span class="stat-value">{fmtNum(summary.bestScoreHardcore)}</span><span class="stat-label">Best hardcore</span></div>
			<div class="stat"><span class="stat-value">{fmtNum(summary.highestSector)}</span><span class="stat-label">Highest sector</span></div>
			<div class="stat"><span class="stat-value">{fmtNum(summary.bestAccuracy)}%</span><span class="stat-label">Best accuracy</span></div>
			<div class="stat"><span class="stat-value cyan">{human(summary.favoriteWeapon)}</span><span class="stat-label">Favorite weapon</span></div>
			<div class="stat"><span class="stat-value">{fmtPlaytime(summary.totalPlaytimeSeconds)}</span><span class="stat-label">Total playtime</span></div>
			<div class="stat"><span class="stat-value">{fmtNum(summary.totalKills)}</span><span class="stat-label">Total kills</span></div>
			<div class="stat"><span class="stat-value">{fmtNum(summary.totalBosses)}</span><span class="stat-label">Total bosses</span></div>
			<div class="stat"><span class="stat-value gold">{fmtNum(summary.totalCoins)}</span><span class="stat-label">Total i&cent;</span></div>
			{#if summary.bestScoreArcade > 0}
				<div class="stat"><span class="stat-value dim">{fmtNum(summary.bestScoreArcade)}</span><span class="stat-label">Best arcade (practice)</span></div>
			{/if}
		</div>

		<h2>Recent runs</h2>
		<div class="run-log">
			<div class="run-head">
				<span>When</span><span>Mode</span><span class="num">Score</span><span class="num">Sector</span>
				<span class="num">Acc</span><span class="num">Time</span><span>Weapon</span><span>Heavy</span><span>Felled by</span>
			</div>
			{#each runs as run (run.id)}
				<div class="run-row">
					<span class="when">{fmtWhen(run.created_at)}</span>
					<span class="mode {run.mode ?? ''}">{human(run.mode)}</span>
					<span class="num score">{fmtNum(run.score)}</span>
					<span class="num">{fmtNum(run.sector)}</span>
					<span class="num">{fmtNum(run.accuracy)}%</span>
					<span class="num">{fmtTime(run.time_s)}</span>
					<span class="wpn">{human(run.primary_weapon)}</span>
					<span class="wpn">{human(run.heavy_weapon)}</span>
					<span class="cause">{human(run.death_cause)}</span>
				</div>
			{/each}
		</div>
	{/if}

	<p class="page-version"><VersionBadge app="vanguard" /></p>
</main>

<style>
	.vg-hero {
		margin-bottom: 1.5rem;
	}
	.vg-hero h1 {
		margin: 0.35rem 0 0.6rem;
	}
	.empty p {
		color: var(--white);
		margin: 0 0 0.25rem;
	}

	.stat-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: 0.75rem;
		margin: 1.25rem 0 0.5rem;
	}
	.stat {
		background: var(--bg1);
		border: 1px solid var(--line);
		border-radius: 4px;
		padding: 0.9rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.stat-value {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.5rem;
		color: var(--green);
		text-shadow: var(--glow-green);
		line-height: 1.1;
	}
	.stat-value.gold {
		color: var(--gold);
		text-shadow: var(--glow-gold);
	}
	.stat-value.cyan {
		color: var(--cyan);
		text-shadow: var(--glow-cyan);
		font-size: 1.2rem;
	}
	.stat-value.dim {
		color: var(--dim);
		text-shadow: none;
	}
	.stat-label {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--dim);
	}

	.run-log {
		border: 1px solid var(--line);
		border-radius: 4px;
		overflow-x: auto;
	}
	.run-head,
	.run-row {
		display: grid;
		grid-template-columns: 1.3fr 0.9fr 1fr 0.7fr 0.7fr 0.8fr 1fr 1fr 1.2fr;
		gap: 0.5rem;
		align-items: center;
		padding: 0.55rem 0.85rem;
		min-width: 720px;
	}
	.run-head {
		background: var(--bg2);
		border-bottom: 1px solid var(--line);
		font-family: var(--font-mono);
		font-size: 0.64rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	.run-row {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--white);
		border-bottom: 1px solid var(--line);
	}
	.run-row:last-child {
		border-bottom: none;
	}
	.run-row .num {
		text-align: right;
	}
	.run-head .num {
		text-align: right;
	}
	.run-row .score {
		color: var(--gold);
	}
	.run-row .when {
		color: var(--dim);
	}
	.run-row .mode {
		color: var(--green);
	}
	.run-row .mode.hardcore {
		color: var(--amber);
	}
	.run-row .mode.arcade {
		color: var(--dim);
	}
	.run-row .wpn {
		color: var(--cyan);
	}
	.run-row .cause {
		color: var(--dim);
	}
</style>
