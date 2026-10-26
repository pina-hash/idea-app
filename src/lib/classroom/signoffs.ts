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
				autoOk: typeof i.auto_ok === 'boolean' ? i.auto_ok : null
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
