/**
 * THE SETTINGS IDEA COIN V2 SESSION TWO ADDED (0245's `_coin_setting_ok`),
 * as data the settings page renders: each key, its words, its kind and the
 * range the database accepts. Plain data and pure helpers (client-safe, the
 * coin-desk.ts convention). The writer is still `coin_settings_set`, one key
 * at a time, and every refusal is said with the rule written here.
 *
 * THE RANGES ARE A MIRROR, NOT THE RULE. `_coin_setting_ok` is the rule; these
 * numbers exist so the form can say what it accepts before a refusal does. A
 * range that drifts from the database shows as a refusal in words, never as a
 * silently different value.
 */

export type FieldKind = 'int' | 'number' | 'date' | 'time' | 'text';

export interface SettingField {
	key: string;
	label: string;
	help: string;
	kind: FieldKind;
	min?: number;
	max?: number;
	/** Characters, for a text field. */
	maxLength?: number;
}

export interface SettingGroup {
	id: string;
	title: string;
	intro: string;
	fields: SettingField[];
}

/** The plain one-value settings, grouped as the page shows them. */
export const SESSION_TWO_GROUPS: SettingGroup[] = [
	{
		id: 'debt',
		title: 'Debt and relief',
		intro: 'At each quarter end, a student in debt with no fine that quarter has half the debt written off. A debt this deep for this long is named on the digest.',
		fields: [
			{ key: 'debt_relief_fines_since', label: 'Count fines for relief from', help: 'The first quarter counts fines from this day.', kind: 'date' },
			{ key: 'chronic_debt_threshold', label: 'Chronic debt at or below (coins)', help: 'A balance this low or lower, for long enough, is chronic. Zero or a negative number.', kind: 'number', min: -100000, max: 0 },
			{ key: 'chronic_debt_weeks', label: 'For this many weeks', help: 'Whole weeks below the line before the digest names it.', kind: 'int', min: 1, max: 120 }
		]
	},
	{
		id: 'backgrounds',
		title: 'Desktop backgrounds',
		intro: 'What a student is told before submitting a background, and the checks a picture has to pass.',
		fields: [
			{ key: 'background_guidance', label: 'What students are told', help: 'Shown above the upload on the coin page.', kind: 'text', maxLength: 4000 },
			{ key: 'background_prompt', label: 'Suggested prompt', help: 'A prompt a student may copy into an image tool.', kind: 'text', maxLength: 4000 },
			{ key: 'background_min_width', label: 'Smallest width (pixels)', help: 'A whole number from 100 to 20000.', kind: 'int', min: 100, max: 20000 },
			{ key: 'background_min_height', label: 'Smallest height (pixels)', help: 'A whole number from 100 to 20000.', kind: 'int', min: 100, max: 20000 },
			{ key: 'background_min_kb_per_megapixel', label: 'Least file size per megapixel (KB)', help: 'Catches a picture that was blown up from a small one.', kind: 'number', min: 0, max: 10000 },
			{ key: 'background_days_between', label: 'Days between submissions', help: 'A whole number of days from 1 to 120.', kind: 'int', min: 1, max: 120 }
		]
	},
	{
		id: 'donations',
		title: 'Donations',
		intro: 'The most a student can earn from donations in a stretch of days. A claim over the limit pays up to it.',
		fields: [
			{ key: 'donation_cap_coins', label: 'Most coins', help: 'From 0 to 100000.', kind: 'number', min: 0, max: 100000 },
			{ key: 'donation_cap_days', label: 'Every this many days', help: 'A whole number from 1 to 120.', kind: 'int', min: 1, max: 120 }
		]
	},
	{
		id: 'deposits',
		title: 'Deposits',
		intro: 'Physical coins a student hands in become digital coins. A deposit smaller than this is refused, so single coins wait until there are enough.',
		fields: [
			{ key: 'deposit_minimum', label: 'Smallest deposit (coins)', help: 'A whole number from 1 to 1000.', kind: 'int', min: 1, max: 1000 }
		]
	},
	{
		id: 'roles',
		title: 'Roles',
		intro: 'The everyday rules for a role\'s photos, and when the stipend pays. A holder can be given rules of their own on the Roles page.',
		fields: [
			{ key: 'role_min_gap_minutes', label: 'Minutes between first and last photo', help: 'From 0 to 600.', kind: 'number', min: 0, max: 600 },
			{ key: 'role_photos_per_day', label: 'Photos a day', help: 'A whole number from 2 to 10.', kind: 'int', min: 2, max: 10 },
			{ key: 'role_window_start', label: 'Photos accepted from', help: 'School time, like 07:00.', kind: 'time' },
			{ key: 'role_window_end', label: 'Photos accepted until', help: 'School time, like 16:00.', kind: 'time' },
			{ key: 'role_stipend_anchor', label: 'Stipend periods start on', help: 'Autopay pays the stipend for each period counted from this day.', kind: 'date' },
			{ key: 'role_stipend_weeks', label: 'Stipend period (weeks)', help: 'A whole number from 1 to 120. Two means every two weeks.', kind: 'int', min: 1, max: 120 }
		]
	},
	{
		id: 'digest',
		title: 'The digest',
		intro: 'Who the weekly digest names as gaining the most.',
		fields: [
			{ key: 'digest_gain_threshold', label: 'Name a student who gained at least (coins)', help: 'From 0 to 100000.', kind: 'number', min: 0, max: 100000 }
		]
	}
];

/** The three date-list settings, each its own list on the page. */
export interface DateListSetting {
	key: 'no_class_days' | 'payday_dates' | 'quarter_ends';
	title: string;
	help: string;
	empty: string;
}

export const DATE_LIST_SETTINGS: DateListSetting[] = [
	{
		key: 'no_class_days',
		title: 'Days with no class',
		help: 'A weekday with no class. Role photos are not expected on it and payday is never on it. Adding or removing a day saves at once.',
		empty: 'No days are listed.'
	},
	{
		key: 'payday_dates',
		title: 'Paydays',
		help: 'The days coins out are handed over. With none listed, payday is the first class day of each month.',
		empty: 'None listed, so payday is the first class day of each month.'
	},
	{
		key: 'quarter_ends',
		title: 'Quarter ends',
		help: 'The last day of each quarter. A student in debt with no fine that quarter has half the debt written off when it ends.',
		empty: 'No quarter ends are listed.'
	}
];

/** The role ids the instructions are kept for (coin_role_definitions, 0074). */
export const ROLE_INSTRUCTION_IDS = ['shop_steward', 'quartermaster', 'safety_officer', 'lab_tech'];

export function roleIdLabel(id: string): string {
	return id
		.split('_')
		.map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
		.join(' ');
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isIsoDay(s: string): boolean {
	if (!ISO_DATE.test(s)) return false;
	const d = new Date(`${s}T00:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** A field's draft as text, from whatever is stored. */
export function fieldDraft(field: SettingField, stored: unknown): string {
	if (stored === null || stored === undefined) return '';
	return typeof stored === 'string' ? stored : String(stored);
}

/**
 * A field's draft as the value to store, or a sentence saying why it cannot
 * be. The sentence is the rule, in words, and is what a refusal says too.
 */
export function fieldValue(field: SettingField, draft: string): { value: unknown } | { problem: string } {
	const t = draft.trim();
	switch (field.kind) {
		case 'text':
			if (draft.length > (field.maxLength ?? 4000)) {
				return { problem: `${field.label}: at most ${field.maxLength ?? 4000} characters.` };
			}
			return { value: draft };
		case 'date':
			return isIsoDay(t) ? { value: t } : { problem: `${field.label}: pick a date.` };
		case 'time':
			return HHMM.test(t) ? { value: t } : { problem: `${field.label}: a time like 07:00.` };
		case 'int':
		case 'number': {
			const n = Number(t);
			const lo = field.min ?? -Infinity;
			const hi = field.max ?? Infinity;
			const whole = field.kind === 'int';
			if (t === '' || !Number.isFinite(n) || n < lo || n > hi || (whole && !Number.isInteger(n))) {
				return {
					problem: `${field.label}: ${whole ? 'a whole number' : 'a number'} from ${lo} to ${hi}.`
				};
			}
			return { value: n };
		}
	}
}

/** Adds a day to a list, sorted, with no repeats. */
export function withDay(list: string[], day: string): string[] {
	return [...new Set([...list, day])].sort();
}

/** A stored date list, cleaned: strings only, sorted. */
export function storedDays(v: unknown): string[] {
	return Array.isArray(v) ? v.filter((d): d is string => typeof d === 'string' && isIsoDay(d)).sort() : [];
}

/** The three placement defaults as stored, padded to three. */
export function placementDefaults(v: unknown): [string, string, string] {
	const a = Array.isArray(v) ? v : [];
	return [0, 1, 2].map((i) => (a[i] == null ? '' : String(a[i]))) as [string, string, string];
}

export function placementProblem(d: string[]): string | null {
	for (const [i, x] of d.entries()) {
		const n = Number(x);
		if (x.trim() === '' || !Number.isFinite(n) || n < 0 || n > 1000) {
			return `${['First', 'Second', 'Third'][i]} place: a number from 0 to 1000.`;
		}
	}
	return null;
}

/** The stored role instructions, as text per role. */
export function roleInstructions(v: unknown): Record<string, string> {
	const out: Record<string, string> = {};
	const src = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
	for (const id of [...ROLE_INSTRUCTION_IDS, ...Object.keys(src)]) {
		out[id] = typeof src[id] === 'string' ? (src[id] as string) : (out[id] ?? '');
	}
	return out;
}

/** The instructions to store: every role, empty ones dropped (the role's description shows instead). */
export function roleInstructionsValue(d: Record<string, string>): { value: Record<string, string> } | { problem: string } {
	const out: Record<string, string> = {};
	for (const [id, text] of Object.entries(d)) {
		if (text.length > 4000) return { problem: `${roleIdLabel(id)}: at most 4000 characters.` };
		if (text.trim()) out[id] = text;
	}
	return { value: out };
}

// --- full coin admins (0244) -------------------------------------------------

export interface FullAdminRow {
	email: string;
	added_by: string | null;
	added_at: string | null;
	note: string | null;
	is_site_admin: boolean;
}

export interface FullAdminList {
	owner: string;
	full_admins: FullAdminRow[];
	site_admins: string[];
}

export const FULL_ADMIN_SENTENCE =
	'The owner always has full coin powers. Everyone else on this list must also be a site admin to have them. Every other admin, and every class’s teacher, has coin powers over their own classes only.';

export function fullAdminRefusal(reason: string | undefined): string {
	if (reason === 'invalid') return 'A full coin admin is a staff address ending in @boscotech.edu.';
	if (reason === 'owner') return 'The owner always has full coin powers, so the owner is not on this list.';
	return reason ? `Refused: ${reason}.` : 'Refused by the server.';
}

// --- the donation want list (0245) ----------------------------------------------

export interface DonationItem {
	id: string;
	name: string;
	rate: number | string | null;
	photo_path: string | null;
	active: boolean;
	sort_order: number;
}

export interface DonationDraft {
	name: string;
	/** Empty means "Other": the amount is set when the claim is approved. */
	rate: string;
	active: boolean;
	sortOrder: string;
	photoPath: string | null;
}

export function donationDraft(i: DonationItem | null): DonationDraft {
	if (!i) return { name: '', rate: '', active: true, sortOrder: '0', photoPath: null };
	return {
		name: i.name,
		rate: i.rate == null ? '' : String(Number(i.rate)),
		active: i.active,
		sortOrder: String(i.sort_order ?? 0),
		photoPath: i.photo_path
	};
}

export function donationProblem(d: DonationDraft): string | null {
	if (!d.name.trim()) return 'Name the item.';
	if (d.name.trim().length > 120) return 'A name is at most 120 characters.';
	if (d.rate.trim() !== '') {
		const r = Number(d.rate);
		if (!Number.isFinite(r) || r < 0 || r > 1000) return 'A rate is from 0 to 1000 coins, or empty for Other.';
	}
	if (!Number.isInteger(Number(d.sortOrder))) return 'The order is a whole number.';
	return null;
}

export function donationParams(id: string | null, d: DonationDraft): Record<string, unknown> {
	return {
		p_id: id,
		p_name: d.name.trim(),
		p_rate: d.rate.trim() === '' ? null : Math.round(Number(d.rate) * 100) / 100,
		p_photo_path: d.photoPath,
		p_active: d.active,
		p_sort_order: Number(d.sortOrder)
	};
}

export function donationRefusal(reason: string | undefined): string {
	switch (reason) {
		case 'name':
			return 'Name the item, at most 120 characters.';
		case 'rate':
			return 'A rate is from 0 to 1000 coins, or empty for Other.';
		case 'photo':
			return 'That photo is not one you uploaded.';
		case 'not_found':
			return 'That item is not there any more. Reload the page.';
		default:
			return reason ? `Refused: ${reason}.` : 'Refused by the server.';
	}
}

// --- Student Auditors (0245) -------------------------------------------------------

export interface AuditorRow {
	email: string;
	name: string | null;
	assigned_at: string | null;
	assigned_by: string | null;
}
