/**
 * VANGUARD run-history types + summary math (client-safe, no legacy/?raw imports).
 *
 * A `VanguardRun` mirrors one row of the `vanguard_runs` table (migration 0014).
 * `summarizeRuns` is a pure aggregate over an array of runs; both the read
 * endpoint (`/api/vanguard-run` GET) and the portal history page call it so the
 * stat math lives in exactly one place.
 */

export interface VanguardRun {
	id: string;
	user_id: string;
	created_at: string;
	mode: string | null;
	version: string | null;
	score: number | null;
	sector: number | null;
	accuracy: number | null;
	time_s: number | null;
	kills: number | null;
	bosses: number | null;
	coins_earned: number | null;
	primary_weapon: string | null;
	heavy_weapon: string | null;
	death_cause: string | null;
}

export interface RunSummary {
	totalRuns: number;
	/** Best score across every mode. */
	bestScore: number;
	/** Best score in ranked NORMAL and HARDCORE, kept distinct. */
	bestScoreNormal: number;
	bestScoreHardcore: number;
	/** Best score in ARCADE (unranked practice), for reference only. */
	bestScoreArcade: number;
	highestSector: number;
	bestAccuracy: number;
	totalPlaytimeSeconds: number;
	totalKills: number;
	totalBosses: number;
	totalCoins: number;
	/** Most frequently used non-empty primary weapon key, or null if none. */
	favoriteWeapon: string | null;
}

function n(v: number | null | undefined): number {
	return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Aggregate stats over a set of runs. Pure; safe with an empty array. */
export function summarizeRuns(runs: VanguardRun[]): RunSummary {
	const summary: RunSummary = {
		totalRuns: 0,
		bestScore: 0,
		bestScoreNormal: 0,
		bestScoreHardcore: 0,
		bestScoreArcade: 0,
		highestSector: 0,
		bestAccuracy: 0,
		totalPlaytimeSeconds: 0,
		totalKills: 0,
		totalBosses: 0,
		totalCoins: 0,
		favoriteWeapon: null
	};
	if (!Array.isArray(runs) || runs.length === 0) return summary;

	const weaponCounts = new Map<string, number>();

	for (const run of runs) {
		summary.totalRuns++;
		const score = n(run.score);
		summary.bestScore = Math.max(summary.bestScore, score);
		if (run.mode === 'normal') summary.bestScoreNormal = Math.max(summary.bestScoreNormal, score);
		else if (run.mode === 'hardcore') summary.bestScoreHardcore = Math.max(summary.bestScoreHardcore, score);
		else if (run.mode === 'arcade') summary.bestScoreArcade = Math.max(summary.bestScoreArcade, score);

		summary.highestSector = Math.max(summary.highestSector, n(run.sector));
		summary.bestAccuracy = Math.max(summary.bestAccuracy, n(run.accuracy));
		summary.totalPlaytimeSeconds += n(run.time_s);
		summary.totalKills += n(run.kills);
		summary.totalBosses += n(run.bosses);
		summary.totalCoins += n(run.coins_earned);

		const w = run.primary_weapon;
		if (typeof w === 'string' && w.length) weaponCounts.set(w, (weaponCounts.get(w) ?? 0) + 1);
	}

	let bestW: string | null = null;
	let bestN = 0;
	for (const [w, count] of weaponCounts) {
		if (count > bestN) {
			bestN = count;
			bestW = w;
		}
	}
	summary.favoriteWeapon = bestW;

	return summary;
}
