/**
 * THE SIGN-OFF QUEUE, AS DATA (ledger 0436, 0304; decision 71).
 *
 * `classroom_signoff_queue` answers every open request the caller may decide,
 * oldest first, each with its checklist: an `auto` item carries the database's
 * own pass or fail (`auto_ok`), a `tap` item is the instructor's pass or fail.
 * Approve needs every item to pass; Send back needs at least one to fail, and
 * the failed items are the note, so nobody types. The database refuses a wrong
 * decision regardless (`items_failed`); this only keeps the keys honest.
 */

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export interface SignoffItem {
	id: string;
	kind: 'auto' | 'tap';
	text: string;
	ownerOnly: boolean;
	role: string | null;
	/** The role owner's first name, for a role item. */
	owner: string | null;
	/** The database's answer for an auto item; null for a tap item. */
	autoOk: boolean | null;
	/** Who is missing what, for a field check (0323); empty when it passes or is not one. */
	missing: SignoffMissing[];
}

/** One empty box a field check found: the box, and who owes it (0323). */
export interface SignoffMissing {
	block: string;
	label: string;
	/** A member's name, the role owner's, "Team", or "No owner yet". */
	who: string;
	kind: 'team' | 'role' | 'individual';
}

export function parseSignoffMissing(raw: unknown): SignoffMissing[] {
	if (!Array.isArray(raw)) return [];
	return raw.filter(isRecord).map((m) => ({
		block: String(m.block ?? ''),
		label: String(m.label ?? m.block ?? ''),
		who: String(m.who ?? ''),
		kind: m.kind === 'team' || m.kind === 'role' ? m.kind : 'individual'
	}));
}

/**
 * WHO IS MISSING WHAT, as lines a teacher reads on a phone: one line per
 * person, their empty boxes after the name. "Ben: Rule test, Sketch".
 */
export function signoffMissingLines(missing: readonly SignoffMissing[]): string[] {
	const by = new Map<string, string[]>();
	for (const m of missing) {
		const list = by.get(m.who) ?? [];
		if (!list.includes(m.label)) list.push(m.label);
		by.set(m.who, list);
	}
	return [...by].map(([who, labels]) => `${who}: ${labels.join(', ')}`);
}

export interface SignoffRequest {
	id: string;
	requestedAt: string;
	requestedBy: string;
	ownerOnly: boolean;
	section: { id: string; label: string };
	team: { id: string; name: string; members: string[] };
	checkpoint: { key: string; title: string; date: string | null; gate: string | null };
	items: SignoffItem[];
}

export function parseSignoffQueue(raw: unknown): SignoffRequest[] | null {
	if (!isRecord(raw) || raw.ok !== true || !Array.isArray(raw.requests)) return null;
	return raw.requests.filter(isRecord).map((r) => {
		const section = isRecord(r.section) ? r.section : {};
		const team = isRecord(r.team) ? r.team : {};
		const cp = isRecord(r.checkpoint) ? r.checkpoint : {};
		return {
			id: String(r.id),
			requestedAt: String(r.requested_at ?? ''),
			requestedBy: String(r.requested_by ?? ''),
			ownerOnly: r.owner_only === true,
			section: { id: String(section.id ?? ''), label: String(section.label ?? '') },
			team: {
				id: String(team.id ?? ''),
				name: String(team.name ?? ''),
				members: Array.isArray(team.members) ? team.members.map(String) : []
			},
			checkpoint: {
				key: String(cp.key ?? ''),
				title: String(cp.title ?? ''),
				date: typeof cp.date === 'string' ? cp.date : null,
				gate: typeof cp.gate === 'string' ? cp.gate : null
			},
			items: (Array.isArray(r.items) ? r.items : []).filter(isRecord).map((i) => ({
				id: String(i.id),
				kind: i.kind === 'auto' ? 'auto' : 'tap',
				text: String(i.text ?? ''),
				ownerOnly: i.ownerOnly === true,
				role: typeof i.role === 'string' ? i.role : null,
				owner: typeof i.owner === 'string' ? i.owner : null,
				autoOk: typeof i.auto_ok === 'boolean' ? i.auto_ok : null,
				missing: parseSignoffMissing(i.missing)
			}))
		};
	});
}

/** Pass, fail, or not yet tapped. */
export type TapMark = boolean | undefined;

/** Every item's pass or fail as it stands: auto from the database, tap from the taps. */
export function signoffMarks(req: SignoffRequest, taps: Readonly<Record<string, boolean>>): Record<string, TapMark> {
	return Object.fromEntries(req.items.map((i) => [i.id, i.kind === 'auto' ? (i.autoOk ?? false) : taps[i.id]]));
}

/** Approve: every item passes, every tap tapped. */
export function signoffCanApprove(req: SignoffRequest, taps: Readonly<Record<string, boolean>>): boolean {
	const marks = signoffMarks(req, taps);
	return req.items.length > 0 && req.items.every((i) => marks[i.id] === true);
}

/** Send back: every tap item tapped, and at least one item failed. */
export function signoffCanSendBack(req: SignoffRequest, taps: Readonly<Record<string, boolean>>): boolean {
	const marks = signoffMarks(req, taps);
	return req.items.every((i) => marks[i.id] !== undefined) && req.items.some((i) => marks[i.id] === false);
}

/**
 * Approve anyway (0323): every tap tapped and something fails, the same moment
 * Send back lights. The database asks for a note before it approves over a
 * failure; the page asks first so nothing is sent without one.
 */
export function signoffCanApproveAnyway(req: SignoffRequest, taps: Readonly<Record<string, boolean>>): boolean {
	return signoffCanSendBack(req, taps);
}

/** What the team reads as the note, in the items' own words. */
export function signoffSendBackNote(req: SignoffRequest, taps: Readonly<Record<string, boolean>>): string {
	const marks = signoffMarks(req, taps);
	return req.items.filter((i) => marks[i.id] === false).map((i) => i.text).join('; ');
}

/** "Waiting 12 min" / "Waiting 2 h", from the request's own time. */
export function signoffWaited(requestedAt: string, nowMs: number): string {
	const t = Date.parse(requestedAt);
	if (!Number.isFinite(t)) return '';
	const min = Math.max(0, Math.round((nowMs - t) / 60_000));
	if (min < 60) return `Waiting ${min} min`;
	const h = Math.round(min / 60);
	return h < 48 ? `Waiting ${h} h` : `Waiting ${Math.round(h / 24)} days`;
}

/**
 * THE TEAMS PANEL ON A TEAM POST (0323, `classroom_item_signoff_board`), as
 * data: every class the caller manages, its teams, and for each team its
 * people, its parts, its blocked tasks and its checkpoints, each checkpoint
 * already shaped as a `SignoffRequest` so the one sign-off card decides it.
 */
export interface SignoffBoardTeam {
	id: string;
	name: string;
	members: { name: string; checkedIn: boolean; done: number; total: number }[];
	parts: { id: string; title: string; audience: string; owner: string | null; done: number; total: number; opensAfter: string | null }[];
	blocked: { title: string; reason: string; owner: string | null }[];
	phases: Record<string, { open: boolean; title: string; date: string | null }>;
	checkpoints: (SignoffRequest & { state: string; requestId: string | null; decision: { status: string; at: string | null; note: string | null } | null })[];
}

export interface SignoffBoard {
	isOwner: boolean;
	sections: { id: string; label: string; setLabel: string | null; teams: SignoffBoardTeam[] }[];
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

export function parseSignoffBoard(raw: unknown): SignoffBoard | null {
	if (!isRecord(raw) || raw.ok !== true || !Array.isArray(raw.sections)) return null;
	return {
		isOwner: raw.is_owner === true,
		sections: raw.sections.filter(isRecord).map((s) => {
			const section = { id: String(s.section_id ?? ''), label: String(s.label ?? '') };
			return {
				...section,
				setLabel: typeof s.set_label === 'string' ? s.set_label : null,
				teams: (Array.isArray(s.teams) ? s.teams : []).filter(isRecord).map((t) => {
					const members = (Array.isArray(t.members) ? t.members : []).filter(isRecord).map((m) => ({
						name: String(m.name ?? ''),
						checkedIn: m.checked_in === true,
						done: num(m.done),
						total: num(m.total)
					}));
					const team = { id: String(t.id ?? ''), name: String(t.name ?? ''), members: members.map((m) => m.name) };
					const phases: SignoffBoardTeam['phases'] = {};
					if (isRecord(t.phases)) {
						for (const [k, v] of Object.entries(t.phases)) {
							if (!isRecord(v)) continue;
							phases[k] = { open: v.open === true, title: String(v.title ?? k), date: typeof v.date === 'string' ? v.date : null };
						}
					}
					return {
						id: team.id,
						name: team.name,
						members,
						parts: (Array.isArray(t.parts) ? t.parts : []).filter(isRecord).map((p) => ({
							id: String(p.id ?? ''),
							title: String(p.title ?? ''),
							audience: String(p.audience ?? ''),
							owner: typeof p.owner === 'string' && p.owner ? p.owner : null,
							done: num(p.done),
							total: num(p.total),
							opensAfter: typeof p.opens_after === 'string' ? p.opens_after : null
						})),
						blocked: (Array.isArray(t.blocked) ? t.blocked : []).filter(isRecord).map((b) => ({
							title: String(b.title ?? ''),
							reason: String(b.reason ?? ''),
							owner: typeof b.owner === 'string' && b.owner ? b.owner : null
						})),
						phases,
						checkpoints: (Array.isArray(t.checkpoints) ? t.checkpoints : []).filter(isRecord).map((c) => {
							const request = isRecord(c.request) ? c.request : null;
							const decision = isRecord(c.decision) ? c.decision : null;
							return {
								id: request ? String(request.id) : `${team.id}:${String(c.key)}`,
								requestId: request ? String(request.id) : null,
								requestedAt: request ? String(request.at ?? '') : '',
								requestedBy: request ? String(request.by ?? '') : '',
								ownerOnly: c.owner_only === true,
								section,
								team,
								checkpoint: {
									key: String(c.key ?? ''),
									title: String(c.title ?? ''),
									date: typeof c.date === 'string' ? c.date : null,
									gate: typeof c.gate === 'string' ? c.gate : null
								},
								state: String(c.state ?? 'open'),
								decision: decision
									? { status: String(decision.status ?? ''), at: typeof decision.at === 'string' ? decision.at : null, note: typeof decision.note === 'string' ? decision.note : null }
									: null,
								items: (Array.isArray(c.items) ? c.items : []).filter(isRecord).map((i) => ({
									id: String(i.id),
									kind: i.kind === 'auto' ? 'auto' : 'tap',
									text: String(i.text ?? ''),
									ownerOnly: i.ownerOnly === true,
									role: typeof i.role === 'string' ? i.role : null,
									owner: typeof i.owner === 'string' ? i.owner : null,
									autoOk: typeof i.auto_ok === 'boolean' ? i.auto_ok : null,
									missing: parseSignoffMissing(i.missing)
								}))
							};
						})
					};
				})
			};
		})
	};
}

/** The one line a team's row shows: the waiting request first, else the next checkpoint not approved. */
export function signoffBoardHeadline(team: SignoffBoardTeam): { title: string; state: string } | null {
	const waiting = team.checkpoints.find((c) => c.state === 'requested');
	const next = waiting ?? team.checkpoints.find((c) => c.state !== 'approved') ?? null;
	return next ? { title: next.checkpoint.title, state: next.state } : null;
}
