/**
 * THE TEAM PLAN, AS NUMBERS AND WORDS (ledger 0436, 0303; decision 71).
 *
 * `classroom_team_plan` answers a team's tasks with each one's linked answer;
 * this turns that into what the student's timeline, the check-in, the board and
 * the document's tracker show. No DOM, no Svelte, no client.
 *
 * DONE IS THE COMPLETION RULE, CALLED: `hxBlockHasResponse` and
 * `hxIncompleteBlocks` in the HTML assignment modules, the same two the progress
 * rail and Answers left ask, put to one block. There is no done button.
 *
 * THE OTHER STATUSES, IN THE ORDER A TASK EARNS THEM: Done; Blocked (the one a
 * student sets); Behind (past due and not done); On it (checked in today); To do.
 * A team is Slipping when done points fall below 80% of the points planned to
 * date, and Uneven when the share does not balance (the database's own answer,
 * `balance.balanced`, never recomputed here).
 */

import { hxBlockHasResponse } from './html-assignment/progress';
import { hxBridgeValue, hxIncompleteBlocks } from './html-assignment/answers';
import type { HtmlAssignmentManifest, HtmlBlock } from './html-assignment/manifest';
import type { ResponseValue } from './assignment-spec';
import { dayIndex, schoolDayPlus, schoolWeekday } from './school-calendar';

export type TeamTaskStatus = 'done' | 'blocked' | 'behind' | 'on-it' | 'todo';

export interface TeamPlanTask {
	id: string;
	kind: 'seed' | 'team' | 'sendback';
	title: string;
	itemId: string | null;
	blockId: string | null;
	roleId: string | null;
	block: HtmlBlock | null;
	owner: string | null;
	fixedOwner: boolean;
	dueOn: string | null;
	cap: string | null;
	points: number;
	machine: string | null;
	dependsOn: string | null;
	blocked: string | null;
	note: string | null;
	value: unknown;
	hasImage: boolean;
	onIt: string[];
	/** Set by the sign-off layer (0304): a send-back task its checkpoint has since passed. */
	cleared?: boolean;
}

export interface TeamPlan {
	today: string;
	team: { id: string; name: string; number: number; sectionId: string; drawnOn: string | null };
	me: string;
	manager: boolean;
	members: { key: string; name: string; me: boolean }[];
	roles: { id: string; title: string; owner: string | null }[];
	items: { id: string; title: string; dueAt: string | null }[];
	tasks: TeamPlanTask[];
	checkedIn: string[];
	balance: { total: number; unowned: number; even: number; balanced: boolean; members: { key: string; points: number }[] };
	machines: { id: string; label: string }[];
	noSchool: { day: string; label: string }[];
	/** The sign-off layer's checkpoints (0304), or empty before it. */
	checkpoints: TeamCheckpoint[];
	/** True once sign-off 1 is approved: owners are fixed (0304). */
	ownersFixed: boolean;
}

export interface TeamCheckpoint {
	key: string;
	title: string;
	date: string | null;
	gate: string | null;
	/** 'approved', 'requested', 'sent-back' or 'open'. */
	state: string;
	items: { id: string; kind: 'auto' | 'tap'; text: string }[];
	/** The database's answer for each auto item. */
	auto: Record<string, boolean>;
	/** The latest decision: who and when, and the note of a send-back. */
	decision: { status: string; at: string | null; by: string; note: string | null } | null;
}

/** True when every auto item passes, which is what unlocks Request sign-off. */
export function teamCheckpointReady(cp: TeamCheckpoint): boolean {
	return cp.items.filter((i) => i.kind === 'auto').every((i) => cp.auto[i.id] === true);
}

export const TEAM_CHECKPOINT_WORDS: Record<string, string> = {
	approved: 'Approved',
	requested: 'Waiting for sign-off',
	'sent-back': 'Sent back',
	open: 'Not requested'
};

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** The RPC's answer, read defensively, or null for no plan (with `reason`). */
export function parseTeamPlan(raw: unknown): { plan: TeamPlan | null; reason: string | null } {
	if (!isRecord(raw) || raw.ok !== true) return { plan: null, reason: null };
	if (!isRecord(raw.team)) return { plan: null, reason: str(raw.reason) };
	const arr = (v: unknown) => (Array.isArray(v) ? v.filter(isRecord) : []);
	const team = raw.team;
	const balance = isRecord(raw.balance) ? raw.balance : {};
	return {
		reason: null,
		plan: {
			today: String(raw.today ?? ''),
			team: {
				id: String(team.id),
				name: String(team.name ?? ''),
				number: Number(team.number ?? 0),
				sectionId: String(team.section_id ?? ''),
				drawnOn: str(team.drawn_on)
			},
			me: String(raw.me ?? ''),
			manager: raw.manager === true,
			members: arr(raw.members).map((m) => ({ key: String(m.key), name: String(m.name ?? ''), me: m.me === true })),
			roles: arr(raw.roles).map((r) => ({ id: String(r.id), title: String(r.title ?? r.id), owner: str(r.owner) })),
			items: arr(raw.items).map((i) => ({ id: String(i.id), title: String(i.title ?? ''), dueAt: str(i.due_at) })),
			tasks: arr(raw.tasks).map((t) => ({
				id: String(t.id),
				kind: (t.kind === 'team' || t.kind === 'sendback' ? t.kind : 'seed') as TeamPlanTask['kind'],
				title: String(t.title ?? ''),
				itemId: str(t.item_id),
				blockId: str(t.block_id),
				roleId: str(t.role_id),
				block: isRecord(t.block) ? (t.block as unknown as HtmlBlock) : null,
				owner: str(t.owner),
				fixedOwner: t.fixed_owner === true,
				dueOn: str(t.due_on),
				cap: str(t.cap),
				points: Number(t.points ?? 0),
				machine: str(t.machine),
				dependsOn: str(t.depends_on),
				blocked: str(t.blocked),
				note: str(t.note),
				value: t.value,
				hasImage: t.has_image === true,
				onIt: Array.isArray(t.on_it) ? t.on_it.map(String) : [],
				cleared: t.cleared === true
			})),
			checkedIn: Array.isArray(raw.checked_in) ? raw.checked_in.map(String) : [],
			balance: {
				total: Number(balance.total ?? 0),
				unowned: Number(balance.unowned ?? 0),
				even: Number(balance.even ?? 0),
				balanced: balance.balanced === true,
				members: arr(balance.members).map((m) => ({ key: String(m.key), points: Number(m.points ?? 0) }))
			},
			machines: arr(raw.machines).map((m) => ({ id: String(m.id), label: String(m.label ?? m.id) })),
			noSchool: arr(raw.no_school).map((d) => ({ day: String(d.day), label: String(d.label ?? '') })),
			checkpoints: arr(raw.checkpoints).map((c) => ({
				key: String(c.key),
				title: String(c.title ?? c.key),
				date: str(c.date),
				gate: str(c.gate),
				state: String(c.state ?? 'open'),
				items: arr(c.items).map((i) => ({
					id: String(i.id),
					kind: (i.kind === 'auto' ? 'auto' : 'tap') as 'auto' | 'tap',
					text: String(i.text ?? '')
				})),
				auto: isRecord(c.auto) ? Object.fromEntries(Object.entries(c.auto).map(([k, v]) => [k, v === true])) : {},
				decision: isRecord(c.decision)
					? {
							status: String(c.decision.status ?? ''),
							at: str(c.decision.at),
							by: String(c.decision.by ?? ''),
							note: str(c.decision.note)
						}
					: null
			})),
			ownersFixed: raw.owners_fixed === true
		}
	};
}

/**
 * DONE: the linked field passes the completion rule, by the two functions the
 * progress rail asks. A task with no linked field is never done by itself; a
 * send-back task is done when its checkpoint has since passed (`cleared`).
 */
export function teamTaskDone(task: TeamPlanTask): boolean {
	if (task.kind === 'sendback') return task.cleared === true;
	const block = task.block;
	if (!block || !task.blockId) return false;
	const field = block.field;
	const bridged = hxBridgeValue(task.value as ResponseValue | null | undefined);
	const values: Record<string, string | boolean> = bridged === null ? {} : { [field]: bridged };
	const images = task.hasImage ? { [field]: { url: 'stored', name: '', caption: '' } } : {};
	if (!hxBlockHasResponse(block, values, images)) return false;
	const one = { modules: [{ id: 'm', title: '', points: 0, blocks: [block], criteria: [] }] } as unknown as HtmlAssignmentManifest;
	return hxIncompleteBlocks(one, values).length === 0;
}

export function teamTaskStatus(task: TeamPlanTask, today: string): TeamTaskStatus {
	if (teamTaskDone(task)) return 'done';
	if (task.blocked) return 'blocked';
	if (task.dueOn && task.dueOn < today) return 'behind';
	if (task.onIt.length > 0) return 'on-it';
	return 'todo';
}

export const TEAM_STATUS_WORDS: Record<TeamTaskStatus, string> = {
	done: 'Done',
	blocked: 'Blocked',
	behind: 'Behind',
	'on-it': 'On it',
	todo: 'To do'
};

/** The share of planned points that must be done by now, below which a team is Slipping. */
export const TEAM_SLIPPING_RATIO = 0.8;

export interface TeamPlanSummary {
	total: number;
	done: number;
	percent: number;
	plannedToDate: number;
	doneToDate: number;
	behind: number;
	blocked: number;
	slipping: boolean;
	uneven: boolean;
}

export function teamPlanSummary(plan: TeamPlan): TeamPlanSummary {
	let total = 0;
	let done = 0;
	let plannedToDate = 0;
	let behind = 0;
	let blocked = 0;
	for (const t of plan.tasks) {
		const status = teamTaskStatus(t, plan.today);
		total += t.points;
		if (status === 'done') done += t.points;
		if (t.dueOn && t.dueOn <= plan.today) plannedToDate += t.points;
		if (status === 'behind') behind += 1;
		if (status === 'blocked') blocked += 1;
	}
	return {
		total,
		done,
		percent: total > 0 ? Math.round((done / total) * 100) : 0,
		plannedToDate,
		doneToDate: done,
		behind,
		blocked,
		slipping: plannedToDate > 0 && done < TEAM_SLIPPING_RATIO * plannedToDate,
		uneven: !plan.balance.balanced
	};
}

/** True when a day is a school day: a weekday and not a listed no-school day. */
export function isSchoolDay(day: string, noSchool: readonly { day: string }[]): boolean {
	const w = schoolWeekday(day);
	if (w === null || w === 0 || w === 6) return false;
	return !noSchool.some((d) => d.day === day);
}

/** Every school day from `from` to `to`, both inclusive. */
export function schoolDaysBetween(from: string, to: string, noSchool: readonly { day: string }[]): string[] {
	const a = dayIndex(from);
	const b = dayIndex(to);
	if (a === null || b === null || b < a || b - a > 400) return [];
	const out: string[] = [];
	for (let i = 0; i <= b - a; i++) {
		const day = schoolDayPlus(from, i)!;
		if (isSchoolDay(day, noSchool)) out.push(day);
	}
	return out;
}

/** The school day a task is drawn on: its due date, or the school day before it when that is not one. */
export function teamTaskColumn(dueOn: string, days: readonly string[]): number {
	let at = -1;
	for (let i = 0; i < days.length; i++) if (days[i] <= dueOn) at = i;
	return at;
}

/** The window the timeline draws: from the earlier of the draw and today, to the last cap or checkpoint. */
export function teamTimelineDays(plan: TeamPlan): string[] {
	const ends = [
		...plan.tasks.map((t) => t.cap ?? t.dueOn).filter((d): d is string => !!d),
		...plan.checkpoints.map((c) => c.date).filter((d): d is string => !!d)
	];
	const last = ends.sort().at(-1) ?? plan.today;
	const firstDue = plan.tasks.map((t) => t.dueOn).filter((d): d is string => !!d).sort()[0];
	const start = [plan.team.drawnOn, plan.today, firstDue].filter((d): d is string => !!d).sort()[0] ?? plan.today;
	return schoolDaysBetween(start, last > start ? last : start, plan.noSchool);
}

/** The school days a task's due date may move to: on or before its cap, from today on. */
export function teamDueChoices(task: TeamPlanTask, plan: TeamPlan): string[] {
	const end = task.cap ?? teamTimelineDays(plan).at(-1) ?? plan.today;
	return schoolDaysBetween(plan.today, end, plan.noSchool);
}

/** A school day in the student's words, never a weekday name: "Oct 28". */
export function teamDayWords(day: string): string {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
	if (!m) return day;
	const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	return `${months[Number(m[2]) - 1]} ${Number(m[3])}`;
}

/** Each member's planned points against the even share, for the share bar. */
export function teamShares(plan: TeamPlan): { key: string; name: string; points: number; ratio: number }[] {
	const even = plan.balance.even || 0;
	return plan.members.map((m) => {
		const points = plan.balance.members.find((b) => b.key === m.key)?.points ?? 0;
		return { key: m.key, name: m.name, points, ratio: even > 0 ? points / even : 0 };
	});
}

/** The tracker message the document receives (`idea:team-tracker`, spec 16.7). */
export function teamTrackerMessage(plan: TeamPlan): {
	team: string;
	today: string;
	summary: string;
	tasks: { id: string; title: string; owner: string; due: string | null; status: TeamTaskStatus; points: number }[];
	flags: { behind: number; slipping: boolean; uneven: boolean };
	next: { title: string; date: string | null; state: string } | null;
} {
	const s = teamPlanSummary(plan);
	const nameOf = (k: string | null) => plan.members.find((m) => m.key === k)?.name ?? 'No owner yet';
	const mine = (t: TeamPlanTask) => (t.owner === plan.me ? 0 : 1);
	const next = plan.checkpoints.find((c) => c.state !== 'approved') ?? null;
	return {
		team: plan.team.name,
		today: plan.today,
		summary: `${s.percent}% done, ${s.behind} behind${s.slipping ? ', slipping' : ''}${s.uneven ? ', the split is uneven' : ''}.`,
		tasks: [...plan.tasks]
			.sort((a, b) => mine(a) - mine(b) || (a.dueOn ?? '9').localeCompare(b.dueOn ?? '9'))
			.map((t) => ({
				id: t.id,
				title: t.title,
				owner: nameOf(t.owner),
				due: t.dueOn,
				status: teamTaskStatus(t, plan.today),
				points: t.points
			})),
		flags: { behind: s.behind, slipping: s.slipping, uneven: s.uneven },
		next: next ? { title: next.title, date: next.date, state: next.state } : null
	};
}

/** Every write the plan page makes, one RPC each (0303). */
export interface TeamPlanWrites {
	setRole(teamId: string, roleId: string, memberKey: string | null): Promise<unknown>;
	setOwner(taskId: string, memberKey: string | null): Promise<unknown>;
	setDue(taskId: string, dueOn: string): Promise<unknown>;
	addTask(teamId: string, title: string, memberKey: string | null, dueOn: string | null): Promise<unknown>;
	removeTask(taskId: string): Promise<unknown>;
	block(taskId: string, reason: string | null): Promise<unknown>;
	depends(taskId: string, on: string | null): Promise<unknown>;
	checkin(teamId: string, taskIds: string[]): Promise<unknown>;
	/** Request a checkpoint's sign-off (0304). */
	request(teamId: string, checkpointKey: string): Promise<unknown>;
}
