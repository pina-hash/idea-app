<script lang="ts">
	import type { PageData } from './$types';
	import {
		OBSERVATIONS,
		TELEMETRY,
		formatElapsed,
		formatVolume,
		isObservationCode,
		isTelemetryState
	} from './observations';

	/**
	 * RANKED RUN REVIEW. Admin only, and a REPORT rather than a gate: nothing on
	 * this page ranks, unranks, refuses or writes. It puts a run and its facts in
	 * front of a person.
	 *
	 * THE COPY IS THE FEATURE. Every number here has a plain sentence attached
	 * saying what ordinarily produces it, because the failure mode of a surface
	 * like this is not missing something, it is listing a fast honest student
	 * until its reader stops opening it. There is no suspicion score, no sort by
	 * how much was observed, and no word anywhere for dishonesty. The sentences
	 * live in `./observations.ts`, once, and are pinned against the migration's
	 * own vocabulary by `tests/gauntlet-run-review.test.ts`.
	 */

	let { data }: { data: PageData } = $props();

	const rows = $derived(data.rows);
	const filters = $derived(data.filters);

	/** Newest first WITHIN a challenge is the database's ordering; keep it. */
	const groups = $derived.by(() => {
		const out: Array<{ id: string; title: string; runs: typeof data.rows }> = [];
		for (const run of rows) {
			const last = out[out.length - 1];
			if (last && last.id === run.challenge_id) {
				last.runs.push(run);
				continue;
			}
			out.push({ id: run.challenge_id, title: run.challenge_title ?? 'Untitled', runs: [run] });
		}
		return out;
	});

	const listed = $derived(rows.length);
	const withObservations = $derived(rows.filter((r) => r.observations.length > 0).length);

	/** Only the codes actually present, so the legend explains what is on screen. */
	const legendCodes = $derived([
		...new Set(rows.flatMap((r) => r.observations).filter(isObservationCode))
	]);
	const legendStates = $derived([...new Set(rows.map((r) => r.telemetry).filter(isTelemetryState))]);

	const pctOfPar = (elapsedMs: number | null, parS: number | null): string => {
		if (elapsedMs === null || parS === null || parS <= 0) return '';
		return `${Math.round((elapsedMs / 1000 / parS) * 100)}% of par`;
	};
</script>

<svelte:head><title>Ranked run review | GAUNTLET</title></svelte:head>

<main class="gauntlet">
	<section class="mode-hero">
		<span class="eyebrow">Teacher Tools</span>
		<h1>Ranked run review</h1>
		<p class="lead">
			Ranked Speedrun runs, newest first within each drawing, with what the server recorded about
			each one. Nothing here changes a rank, a time or a board. It is a list of runs and the facts
			beside them, so you can decide which ones you want to ask a student about.
		</p>
	</section>

	<div class="btn-row">
		<a class="btn secondary" href="/gauntlet/author">Challenge authoring</a>
		<a class="btn secondary" href="/gauntlet/leaderboard">Leaderboards</a>
		<a class="btn secondary" href="/gauntlet">Back to dojo</a>
	</div>

	{#if data.notApplied}
		<p class="warn">
			The review function is not on the database yet. Migration 0152 has to be applied in the
			Supabase SQL editor before this page has anything to show. Nothing is wrong with the runs.
		</p>
	{:else if data.readError}
		<p class="warn">This report could not be read, so it is not showing you an all clear: {data.readError}</p>
	{/if}

	<!--
		THE STANDING NOTE. It is not decoration and it is not dismissible. A
		reader who meets a page of "none recorded" without it concludes the board
		is full of fakes, when what they are actually looking at is a feature that
		did not exist when most of those runs were set.
	-->
	<section class="card rr-note">
		<h2>Read this before you read the list</h2>
		<ul>
			<li>
				<strong>Most ranked runs cannot have a progress record, and that is not a finding.</strong>
				Progress recording arrived with the SolidWorks add-in. Every run set before that, and every
				run set with the VBA macros since, records nothing at all, because the macros do not send
				any. On this board that is expected to be most rows.
			</li>
			<li>
				<strong>The VBA macros are still a supported way to play.</strong> The tools page offers them
				beside the add-in for anyone who cannot register a COM add-in. A run with no progress record
				is very often just a student who took that route.
			</li>
			<li>
				<strong>A run raced in a live room can never have one.</strong> Room racers do not run the
				Start macro, so there is no run id to record against.
			</li>
			<li>
				<strong>A progress record is not proof of anything on its own.</strong> It is sent by the
				student's own machine, so it can say whatever that machine sends. What is worth reading is
				where it disagrees with the server's own clock and with the part that was handed in.
			</li>
			<li>
				<strong>One observation is a reason to look, not a conclusion.</strong> A fast time can be
				a fast student. Ask them how they built it.
			</li>
		</ul>
	</section>

	<form class="card rr-controls" method="GET">
		<h2>What to show</h2>
		<div class="rr-fields">
			<label class="rr-field">
				<span class="rr-label">Drawing</span>
				<select class="ff-input" name="challenge">
					<option value="" selected={!filters.challengeId}>All drawings</option>
					{#each data.challenges as c (c.id)}
						<option value={c.id} selected={filters.challengeId === c.id}>{c.title}</option>
					{/each}
				</select>
			</label>

			<label class="rr-field">
				<span class="rr-label">Look back (hours)</span>
				<input class="ff-input" type="number" name="hours" min="1" max="8760" value={filters.sinceHours} />
			</label>

			<label class="rr-field">
				<span class="rr-label">Quick finish under (seconds)</span>
				<input class="ff-input" type="number" name="floor" min="0" max="3600" value={filters.fastFinishSeconds} />
				<span class="rr-help">
					Your floor, not a rule about the part. A run under it is listed as having finished
					quickly.
				</span>
			</label>
		</div>

		<div class="rr-switches">
			<label class="rr-switch tap-44">
				<input type="checkbox" name="all" value="1" checked={!filters.observedOnly} />
				<span>Show every ranked run, not only the ones with an observation</span>
			</label>
			<label class="rr-switch tap-44">
				<input type="checkbox" name="absent" value="1" checked={filters.includeAbsent} />
				<span>
					List runs that recorded no progress
					<span class="rr-help">
						Off by default. Turn this on only if you know this class was using the add-in, because
						otherwise it lists everyone who used the macros.
					</span>
				</span>
			</label>
		</div>

		<button class="btn" type="submit">Update the list</button>
	</form>

	<p class="rr-count mono">
		{listed} run{listed === 1 ? '' : 's'} listed · {withObservations} with at least one observation
		{#if filters.observedOnly}
			· runs with nothing observed are hidden
		{/if}
	</p>

	{#if listed === 0 && !data.notApplied && !data.readError}
		<p class="rr-empty">
			Nothing matched. With the current settings that means no ranked run in this window has an
			observation against it, which is the ordinary result.
		</p>
	{/if}

	{#each groups as group (group.id)}
		<section class="rr-group">
			<h2>{group.title}</h2>
			<ul class="rr-runs">
				{#each group.runs as run (run.submission_id)}
					<li class="card rr-run">
						<div class="rr-head">
							<span class="rr-player">{run.player ?? 'Unnamed student'}</span>
							<span class="rr-when mono dim">{new Date(run.submitted_at).toLocaleString()}</span>
						</div>

						<dl class="rr-facts">
							<div class="rr-fact">
								<dt>Elapsed</dt>
								<dd class="mono">
									{formatElapsed(run.elapsed_ms)}
									{#if run.par_time_s !== null}
										<span class="dim"> ({pctOfPar(run.elapsed_ms, run.par_time_s)}, par {run.par_time_s}s)</span>
									{/if}
								</dd>
							</div>
							<div class="rr-fact">
								<dt>Board rank now</dt>
								<dd class="mono">{run.board_rank ?? '--'}</dd>
							</div>
							<div class="rr-fact">
								<dt>Earlier submits on this run</dt>
								<dd class="mono">
									{run.failed_attempts ?? '--'}
									{#if run.failed_attempts === 0}
										<span class="dim"> (passed first time)</span>
									{/if}
								</dd>
							</div>
							<div class="rr-fact">
								<dt>Volume handed in</dt>
								<dd class="mono">{formatVolume(run.submitted_volume_mm3)}</dd>
							</div>
							<div class="rr-fact">
								<dt>Progress record</dt>
								<dd>
									<span class="rr-tele" data-state={run.telemetry}>
										{TELEMETRY[run.telemetry]?.label ?? run.telemetry}
									</span>
									{#if run.telemetry === 'present'}
										<span class="mono dim">
											{run.event_count} events · {run.snapshot_count} snapshots · {run.feature_add_count}
											features added
										</span>
									{/if}
								</dd>
							</div>
							{#if run.telemetry === 'present'}
								<div class="rr-fact">
									<dt>Last recorded volume</dt>
									<dd class="mono">{formatVolume(run.last_snapshot_volume_mm3)}</dd>
								</div>
								<div class="rr-fact">
									<dt>Add-in stopwatch</dt>
									<dd class="mono">{formatElapsed(run.telemetry_span_ms)}</dd>
								</div>
								<div class="rr-fact">
									<dt>Distinct feature counts seen</dt>
									<dd class="mono">{run.distinct_feature_counts}</dd>
								</div>
							{/if}
						</dl>

						{#if run.telemetry !== 'present'}
							<p class="rr-tele-why">{TELEMETRY[run.telemetry]?.meaning ?? ''}</p>
						{/if}

						{#if run.observations.length > 0}
							<ul class="rr-obs">
								{#each run.observations.filter(isObservationCode) as code (code)}
									<li class="rr-ob">
										<span class="rr-ob-label">{OBSERVATIONS[code].label}</span>
										<span class="rr-ob-why">{OBSERVATIONS[code].meaning}</span>
									</li>
								{/each}
							</ul>
						{:else}
							<p class="rr-none">Nothing observed on this run.</p>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/each}

	{#if legendCodes.length > 0 || legendStates.length > 0}
		<section class="card rr-legend">
			<h2>What these say</h2>
			{#if legendStates.length > 0}
				<h3>Progress record</h3>
				<dl>
					{#each legendStates as state (state)}
						<div class="rr-legend-row">
							<dt>{TELEMETRY[state].label}</dt>
							<dd>{TELEMETRY[state].meaning}</dd>
						</div>
					{/each}
				</dl>
			{/if}
			{#if legendCodes.length > 0}
				<h3>Observations</h3>
				<dl>
					{#each legendCodes as code (code)}
						<div class="rr-legend-row">
							<dt>{OBSERVATIONS[code].label}</dt>
							<dd>{OBSERVATIONS[code].meaning}</dd>
						</div>
					{/each}
				</dl>
			{/if}
		</section>
	{/if}
</main>

<style>
	.rr-note ul {
		margin: 0;
		padding-left: 1.1rem;
		display: grid;
		gap: 0.55rem;
	}
	.rr-note li {
		color: var(--white);
		line-height: 1.5;
	}
	.rr-note strong {
		color: var(--gold);
	}

	.rr-controls {
		display: grid;
		gap: 0.9rem;
	}
	.rr-fields {
		display: grid;
		gap: 0.9rem;
		grid-template-columns: repeat(auto-fit, minmax(min(15rem, 100%), 1fr));
	}
	.rr-field {
		display: grid;
		gap: 0.3rem;
		min-width: 0;
	}
	.rr-label {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	.rr-help {
		display: block;
		font-size: 0.82rem;
		color: var(--text-2, var(--dim));
		line-height: 1.4;
	}
	.rr-switches {
		display: grid;
		gap: 0.5rem;
	}
	.rr-switch {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		color: var(--white);
		line-height: 1.45;
		cursor: pointer;
	}
	.rr-switch input {
		margin-top: 0.15rem;
		width: 1.15rem;
		height: 1.15rem;
		flex: none;
	}

	.rr-count {
		color: var(--cyan);
		font-size: 0.85rem;
		margin: 1.2rem 0 0.4rem;
	}
	.rr-empty {
		color: var(--text-2, var(--dim));
		line-height: 1.5;
		margin: 0 0 1.5rem;
	}

	.rr-group {
		margin: 1.6rem 0 0;
	}
	.rr-group > h2 {
		margin: 0 0 0.6rem;
	}
	.rr-runs {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.8rem;
	}
	.rr-run {
		display: grid;
		gap: 0.7rem;
	}
	.rr-head {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 0.9rem;
		align-items: baseline;
		justify-content: space-between;
	}
	.rr-player {
		font-family: var(--font-display);
		font-size: 1.05rem;
		color: var(--white);
	}
	.rr-when {
		font-size: 0.8rem;
	}

	.rr-facts {
		display: grid;
		gap: 0.5rem 1.2rem;
		grid-template-columns: repeat(auto-fit, minmax(min(13rem, 100%), 1fr));
		margin: 0;
	}
	.rr-fact {
		min-width: 0;
	}
	.rr-fact dt {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	.rr-fact dd {
		margin: 0.15rem 0 0;
		color: var(--white);
		font-size: 0.95rem;
		overflow-wrap: anywhere;
	}
	.rr-fact dd .dim {
		font-size: 0.85rem;
	}

	/*
		The state is carried by the WORD, always. The tint is a second signal on
		top of a label that already says which of the four this is, never the only
		one -- and none of these four means anything is wrong, so none of them is
		crimson.
	*/
	.rr-tele {
		display: inline-block;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		padding: 0.1rem 0.45rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-sm, 4px);
		color: var(--white);
		margin-right: 0.4rem;
	}
	.rr-tele[data-state='present'] {
		color: var(--green);
	}
	.rr-tele[data-state='absent'],
	.rr-tele[data-state='room'],
	.rr-tele[data-state='unlinked'] {
		color: var(--cyan);
	}
	.rr-tele-why {
		margin: 0;
		color: var(--text-2, var(--dim));
		font-size: 0.86rem;
		line-height: 1.45;
	}

	.rr-obs {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.5rem;
		border-top: 1px solid var(--hairline);
		padding-top: 0.7rem;
	}
	.rr-ob {
		display: grid;
		gap: 0.2rem;
	}
	.rr-ob-label {
		font-family: var(--font-mono);
		font-size: 0.82rem;
		color: var(--amber);
	}
	.rr-ob-why {
		color: var(--text-2, var(--dim));
		font-size: 0.86rem;
		line-height: 1.45;
	}
	.rr-none {
		margin: 0;
		color: var(--text-2, var(--dim));
		font-size: 0.86rem;
	}

	.rr-legend {
		margin-top: 1.8rem;
	}
	.rr-legend h3 {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--cyan);
		margin: 1rem 0 0.4rem;
	}
	.rr-legend dl {
		margin: 0;
		display: grid;
		gap: 0.55rem;
	}
	.rr-legend-row dt {
		font-family: var(--font-mono);
		font-size: 0.84rem;
		color: var(--white);
	}
	.rr-legend-row dd {
		margin: 0.15rem 0 0;
		color: var(--text-2, var(--dim));
		font-size: 0.88rem;
		line-height: 1.45;
	}
</style>
