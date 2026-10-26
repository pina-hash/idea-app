/**
 * THE TEAM BOARD, AS DATA (ledger 0436, 0306; decision 71).
 *
 * `classroom_team_board` answers every team the caller manages as its own
 * team plan (the same read a team's page makes) plus `saved_at`, when each
 * task's linked work was last saved. Everything here is derived from those
 * with the plan's own rules (`teamTaskDone`, `teamPlanSummary`), so a flag on
 * the board and the same flag on the team's page cannot disagree.
 *
 * THE BURN-UP is two lines over the school days: PLANNED, the points of every
 * task due on or before the day; DONE, the points of every task that is done
 * now, counted from the day its work was last saved (a done task with no saved
 * time counts from today). Done is stacked by whose task it is, so each
 * student's share of the finished work shows.
 */

import {
	parseTeamPlan,
	schoolDaysBetween,
	teamPlanSummary,
	teamTaskDone,
	type TeamCheckpoint,
	type TeamPlan,
	type TeamPlanSummary
} from './team-plan';

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** A school day in Los Angeles, from a saved time. */
export function schoolDayOf(at: string): string | null {
	const t = Date.parse(at);
	if (!Number.isFinite(t)) return null;
	return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
}

export interface BoardTeam {
	plan: TeamPlan;
	sectionLabel: string;
	savedAt: Record<string, string>;
}

export interface TeamBoard {
	today: string;
	sections: { id: string; label: string }[];
	teams: BoardTeam[];
	machines: { id: string; label: string }[];
	noSchool: { day: string; label: string }[];
}

export function parseTeamBoard(raw: unknown): TeamBoard | null {
	if (!isRecord(raw) || raw.ok !== true) return null;
	const teams: BoardTeam[] = [];
	for (const t of Array.isArray(raw.teams) ? raw.teams : []) {
		if (!isRecord(t)) continue;
		const { plan } = parseTeamPlan(t);
		if (!plan) continue;
		const savedAt: Record<string, string> = {};
		if (isRecord(t.saved_at)) for (const [k, v] of Object.entries(t.saved_at)) if (typeof v === 'string') savedAt[k] = v;
		teams.push({ plan, sectionLabel: String(t.section_label ?? ''), savedAt });
	}
	const list = (v: unknown) => (Array.isArray(v) ? v.filter(isRecord) : []);
	return {
		today: String(raw.today ?? ''),
		sections: list(raw.sections).map((s) => ({ id: String(s.id), label: String(s.label ?? '') })),
		teams,
		machines: list(raw.machines).map((m) => ({ id: String(m.id), label: String(m.label ?? m.id) })),
		noSchool: list(raw.no_school).map((d) => ({ day: String(d.day), label: String(d.label ?? '') }))
	};
}

/** The board's span: from the earliest draw to the last due date or checkpoint, school days only. */
export function boardDays(board: TeamBoard): string[] {
	const starts: string[] = [];
	const ends: string[] = [board.today];
	for (const { plan } of board.teams) {
		if (plan.team.drawnOn) starts.push(plan.team.drawnOn);
		for (const t of plan.tasks) {
			if (t.dueOn) {
				starts.push(t.dueOn);
				ends.push(t.dueOn);
			}
		}
		for (const c of plan.checkpoints) if (c.date) ends.push(c.date);
	}
	const start = [...starts, board.today].sort()[0];
	const end = ends.sort().at(-1)!;
	return schoolDaysBetween(start, end, board.noSchool);
}

export interface BurnPoint {
	day: string;
	planned: number;
	done: number;
	/** Done points to date by whose task it is: a member key, or '' for the team's. */
	byOwner: Record<string, number>;
}

/** One team's burn-up over `days`. */
export function teamBurnUp(team: BoardTeam, days: readonly string[]): BurnPoint[] {
	const { plan, savedAt } = team;
	const done = plan.tasks
		.filter((t) => t.points > 0 && teamTaskDone(t))
		.map((t) => ({ owner: t.owner ?? '', points: t.points, day: (savedAt[t.id] && schoolDayOf(savedAt[t.id])) || plan.today }));
	return days.map((day) => {
		const byOwner: Record<string, number> = {};
		let d = 0;
		for (const x of done) {
			if (x.day > day) continue;
			d += x.points;
			byOwner[x.owner] = (byOwner[x.owner] ?? 0) + x.points;
		}
		const planned = plan.tasks.filter((t) => t.dueOn && t.dueOn <= day).reduce((s, t) => s + t.points, 0);
		return { day, planned, done: d, byOwner };
	});
}

/** The next checkpoint not yet approved, with how many school days remain until its date. */
export function nextSignoff(plan: TeamPlan): (TeamCheckpoint & { schoolDaysLeft: number | null }) | null {
	const next = plan.checkpoints.find((c) => c.state !== 'approved');
	if (!next) return null;
	const left = next.date ? Math.max(0, schoolDaysBetween(plan.today, next.date, plan.noSchool).length - 1) : null;
	return { ...next, schoolDaysLeft: left };
}

/** Each checkpoint's shop gate and whether it is open (its checkpoint approved). */
export function shopGates(plan: TeamPlan): { gate: string; open: boolean; title: string }[] {
	return plan.checkpoints.filter((c) => c.gate).map((c) => ({ gate: c.gate!, open: c.state === 'approved', title: c.title }));
}

/** Everything one team's card shows. */
export function boardTeamCard(team: BoardTeam): TeamPlanSummary & { next: ReturnType<typeof nextSignoff>; gates: ReturnType<typeof shopGates> } {
	return { ...teamPlanSummary(team.plan), next: nextSignoff(team.plan), gates: shopGates(team.plan) };
}

/**
 * Tasks tagged with each machine, by the day they are due, across every team
 * on the board (all three sections for an admin). Done or not: it is the
 * day's planned use of the machine.
 */
export function machineCounts(board: TeamBoard, days: readonly string[]): { id: string; label: string; byDay: Record<string, number>; total: number }[] {
	return board.machines.map((m) => {
		const byDay: Record<string, number> = Object.fromEntries(days.map((d) => [d, 0]));
		let total = 0;
		for (const { plan } of board.teams) {
			for (const t of plan.tasks) {
				if (t.machine !== m.id || !t.dueOn) continue;
				byDay[t.dueOn] = (byDay[t.dueOn] ?? 0) + 1;
				total += 1;
			}
		}
		return { id: m.id, label: m.label, byDay, total };
	});
}
