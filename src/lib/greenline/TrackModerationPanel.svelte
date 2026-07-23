<script lang="ts">
	import './brand/brand';
	import { formatLapMs } from './track-runtime';
	import type { CommunityTrackSummary } from './community';

	/**
	 * GREENLINE community-track moderation panel (Bundle 4b). Presentation
	 * only, the DecalReviewQueue / FrcReviewQueue convention: the list and the
	 * two intents (feature / remove) come from the host, so the dev harness
	 * drives the identical component over an in-memory store. Teacher gating
	 * is the ROUTE's job (and, authoritatively, the RPCs'); this component
	 * assumes it is only ever mounted for a teacher.
	 *
	 * Every number shown is derived from the raw ratings/attempts tables by
	 * greenline_track_list — nothing here is a stored counter except
	 * report_count (bumped transactionally with each genuinely-new report).
	 * Default sort is REPORTS DESC so problem tracks surface first; rating and
	 * completion-rate sorts support the featuring decision, which is what this
	 * view mostly exists for.
	 */
	const {
		tracks,
		busyUuid = null,
		error = '',
		onFeature,
		onRemove
	}: {
		tracks: CommunityTrackSummary[];
		/** Track uuid with an action in flight (disables its buttons). */
		busyUuid?: string | null;
		/** Last action failure to surface inline. */
		error?: string;
		/** Promote (true) / demote (false) — the greenline_track_set_featured RPC. */
		onFeature: (uuid: string, featured: boolean) => void;
		/** Teacher removal — the SAME greenline_track_remove path self-remove uses. */
		onRemove: (uuid: string) => void;
	} = $props();

	type SortKey = 'reports' | 'rating' | 'completion';
	let sortKey = $state<SortKey>('reports');
	let confirmRemove = $state<string | null>(null);

	const sorted = $derived.by(() => {
		const list = [...tracks];
		if (sortKey === 'rating') {
			// Unrated tracks sink; ties break toward more ratings (more signal).
			list.sort(
				(a, b) =>
					(b.avgRating ?? -1) - (a.avgRating ?? -1) || b.ratingCount - a.ratingCount
			);
		} else if (sortKey === 'completion') {
			list.sort(
				(a, b) =>
					(b.completionPct ?? -1) - (a.completionPct ?? -1) || b.attemptCount - a.attemptCount
			);
		} else {
			list.sort((a, b) => b.reportCount - a.reportCount || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
		}
		return list;
	});

	const fmtDate = (iso: string | null) => (iso ? iso.slice(0, 10) : '—');
	const fmtAvg = (v: number | null, digits = 1) => (v == null ? '—' : v.toFixed(digits));
</script>

<div class="glb tm-root">
	<div class="tm-toolbar">
		<span class="tm-count">{tracks.length} published track{tracks.length === 1 ? '' : 's'}</span>
		<span class="tm-sort-label">SORT</span>
		{#each [{ k: 'reports', label: 'REPORTS' }, { k: 'rating', label: 'RATING' }, { k: 'completion', label: 'COMPLETION %' }] as s (s.k)}
			<button
				type="button"
				class="tm-sort"
				class:on={sortKey === s.k}
				onclick={() => (sortKey = s.k as SortKey)}>{s.label}</button
			>
		{/each}
	</div>
	{#if error}<div class="tm-error">{error}</div>{/if}

	{#if tracks.length === 0}
		<div class="tm-empty">No published community tracks yet.</div>
	{:else}
		<div class="tm-table" role="table" aria-label="Published community tracks">
			<div class="tm-row tm-head" role="row">
				<span>TRACK</span>
				<span class="num">REPORTS</span>
				<span class="num">RATING</span>
				<span class="num">STARTS</span>
				<span class="num">FINISHES</span>
				<span class="num">AVG TIME</span>
				<span class="num">RACERS</span>
				<span class="num">AVG WALLS</span>
				<span>ACTIONS</span>
			</div>
			{#each sorted as t (t.uuid)}
				<div class="tm-row" class:flagged={t.reportCount > 0} role="row">
					<span class="tm-name">
						<b>{t.name}</b>
						{#if t.featured}<i class="tm-chip featured">FEATURED · RANKED</i>{/if}
						<em>by {t.authorName} · {fmtDate(t.createdAt)} · {((t.lengthM ?? 0) / 1000).toFixed(2)} km</em>
					</span>
					<span class="num" class:hot={t.reportCount > 0}>{t.reportCount}</span>
					<span class="num">
						{t.avgRating == null ? '—' : `★ ${fmtAvg(t.avgRating)}`}
						<em>({t.ratingCount})</em>
					</span>
					<span class="num">{t.attemptCount}</span>
					<span class="num">
						{t.completedCount}
						<em>{t.completionPct == null ? '' : `(${t.completionPct}%)`}</em>
					</span>
					<span class="num">{t.avgTimeMs == null ? '—' : formatLapMs(Math.round(t.avgTimeMs))}</span>
					<span class="num">{t.uniqueRacers}</span>
					<span class="num">{fmtAvg(t.avgWallViolations)}</span>
					<span class="tm-acts">
						<button
							type="button"
							class="tm-btn"
							class:feature={!t.featured}
							disabled={busyUuid === t.uuid}
							title={t.featured
								? 'Demote to unranked (the track, its ratings, telemetry, and leaderboard history all stay)'
								: 'Feature: ranked leaderboard + IC payout, same terms as the official tracks'}
							onclick={() => onFeature(t.uuid, !t.featured)}
							>{t.featured ? 'UN-FEATURE' : 'FEATURE'}</button
						>
						{#if confirmRemove === t.uuid}
							<button
								type="button"
								class="tm-btn danger"
								disabled={busyUuid === t.uuid}
								onclick={() => {
									confirmRemove = null;
									onRemove(t.uuid);
								}}>CONFIRM</button
							>
							<button type="button" class="tm-btn" onclick={() => (confirmRemove = null)}
								>KEEP</button
							>
						{:else}
							<button
								type="button"
								class="tm-btn"
								disabled={busyUuid === t.uuid}
								title="Remove from the listing (soft: history kept). Same path as the author's own self-remove."
								onclick={() => (confirmRemove = t.uuid)}>REMOVE</button
							>
						{/if}
					</span>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.tm-root {
		background: linear-gradient(180deg, #0b1016 0%, #070a0e 45%, #04060a 100%);
		border: 1px solid var(--glb-line, rgba(147, 163, 176, 0.28));
		padding: 0.9rem 1rem 1rem;
		color: var(--glb-ink, #dfe8ee);
		font-family: var(--glb-font-ui, 'Saira Condensed', sans-serif);
	}
	.tm-toolbar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-bottom: 0.6rem;
	}
	.tm-count {
		color: var(--glb-ink-dim, #93a3b0);
		font-size: 0.74rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		margin-right: auto;
	}
	.tm-sort-label {
		color: var(--glb-ink-faint, #6b7b88);
		font-size: 0.62rem;
		letter-spacing: 0.24em;
	}
	.tm-sort {
		background: none;
		border: 1px solid var(--glb-line, rgba(147, 163, 176, 0.28));
		border-radius: 2px;
		color: var(--glb-steel-dim, #93a3b0);
		font: 600 0.6rem var(--glb-font-ui, sans-serif);
		letter-spacing: 0.14em;
		padding: 0.22rem 0.55rem;
		cursor: pointer;
	}
	.tm-sort.on {
		color: #8fffc4;
		border-color: rgba(42, 229, 126, 0.6);
	}
	.tm-error {
		color: #ff8899;
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		margin-bottom: 0.5rem;
	}
	.tm-empty {
		color: var(--glb-ink-faint, #6b7b88);
		font-size: 0.8rem;
		padding: 1rem 0;
	}
	.tm-table {
		display: flex;
		flex-direction: column;
		overflow-x: auto;
	}
	.tm-row {
		display: grid;
		grid-template-columns: minmax(11rem, 1.6fr) 4.2rem 4.6rem 3.6rem 4.6rem 4.6rem 3.6rem 4.4rem minmax(11rem, 1fr);
		gap: 0.5rem;
		align-items: center;
		min-width: 58rem;
		padding: 0.34rem 0.4rem;
		font-size: 0.78rem;
	}
	.tm-row:nth-child(even) {
		background: rgba(147, 163, 176, 0.04);
	}
	.tm-head {
		color: var(--glb-ink-faint, #6b7b88);
		font-size: 0.58rem;
		letter-spacing: 0.16em;
		border-bottom: 1px solid var(--glb-line, rgba(147, 163, 176, 0.28));
	}
	/* Amber-adjacent left tick on reported tracks: the whole point of the
	   default sort is that these read first. */
	.tm-row.flagged:not(.tm-head) {
		box-shadow: inset 2px 0 0 rgba(201, 161, 95, 0.7);
	}
	.tm-name {
		display: flex;
		flex-direction: column;
		gap: 0.05rem;
		min-width: 0;
	}
	.tm-name b {
		font-weight: 600;
		letter-spacing: 0.06em;
	}
	.tm-name em {
		font-style: normal;
		color: var(--glb-ink-faint, #6b7b88);
		font-size: 0.64rem;
	}
	.tm-chip {
		align-self: flex-start;
		font-style: normal;
		color: #8fffc4;
		border: 1px solid rgba(42, 229, 126, 0.45);
		border-radius: 2px;
		font-size: 0.52rem;
		letter-spacing: 0.16em;
		padding: 0.04rem 0.3rem;
		margin: 0.1rem 0;
	}
	.num {
		font-family: var(--glb-font-data, 'Share Tech Mono', monospace);
		font-size: 0.72rem;
		color: var(--glb-chrome-mid, #b9c6cf);
		text-align: right;
	}
	.num em {
		font-style: normal;
		color: var(--glb-ink-faint, #6b7b88);
		font-size: 0.6rem;
	}
	.num.hot {
		color: #e3c68a;
	}
	.tm-acts {
		display: flex;
		gap: 0.3rem;
		justify-content: flex-end;
		flex-wrap: wrap;
	}
	.tm-btn {
		background: rgba(4, 7, 11, 0.85);
		border: 1px solid var(--glb-line, rgba(147, 163, 176, 0.28));
		border-radius: 2px;
		color: var(--glb-steel-dim, #93a3b0);
		font: 600 0.58rem var(--glb-font-ui, sans-serif);
		letter-spacing: 0.12em;
		padding: 0.24rem 0.5rem;
		cursor: pointer;
	}
	.tm-btn:hover:not(:disabled) {
		color: var(--glb-chrome-hi, #eaf4ff);
		border-color: var(--glb-line-strong, rgba(147, 163, 176, 0.5));
	}
	.tm-btn.feature {
		color: #8fffc4;
		border-color: rgba(42, 229, 126, 0.45);
	}
	.tm-btn.danger {
		color: #c9a15f;
		border-color: rgba(201, 161, 95, 0.5);
	}
	.tm-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}
</style>
