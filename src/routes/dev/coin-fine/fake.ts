/**
 * AN IN-MEMORY FINE SCREEN BACKEND for `/dev/coin-fine`, shaped like 0240's
 * real answers: `coin_fine_sections`, `coin_fine_roster`, `coin_settings_get`
 * (the default fine buttons and their seeded amounts), `coin_fine_log` and
 * `coin_reverse_transaction`. It records every call it is handed so the page
 * can show what the component sent. No network.
 */
import type {
	FineCategory,
	FineLogRow,
	FineSection,
	FineStudent,
	FineTransports
} from '$lib/coin-fine/fine';

export const SECTION_A = '11111111-aaaa-4aaa-8aaa-111111111111';
export const SECTION_B = '22222222-bbbb-4bbb-8bbb-222222222222';

const NAMES_A = [
	'Reyes, Ana',
	'Rios, Ana',
	'Okonkwo, Ben',
	'Chen, Carla',
	'Diaz, Diego',
	'Evans, Elena',
	'Fischer, Felix',
	'Garcia, Gabriela',
	'Huang, Henry',
	'Ibrahim, Isabella',
	'Johnson, Jamal',
	'Kim, Kenji',
	'Lopez, Lucia',
	'Martinez, Mateo',
	'Nguyen, Nora',
	'Ortiz, Oscar',
	'Patel, Priya',
	'Quinn, Quentin',
	'Ramirez, Rafael',
	'Santos, Sofia',
	'Torres, Tomas',
	'Vargas, Valentina'
];
const NAMES_B = ['Adams, Aaron', 'Brooks, Bella', 'Cruz, Carlos', 'Dunn, Daisy', 'Ellis, Ethan'];

function emailOf(name: string): string {
	const [last, first] = name.split(',').map((x) => x.trim().toLowerCase());
	return `${first}.${last}@boscotech.net`;
}

function seedStudents(names: string[]): FineStudent[] {
	return names.map((display_name, i) => ({
		email: emailOf(display_name),
		display_name,
		balance: [42, 7, -3, 18.5, 0, 25][i % 6],
		out_on_pass: i === 2,
		no_shop: i === 5,
		eating_pass: i % 4 === 0
	}));
}

const cat = (
	id: string,
	name: string,
	kind: string,
	pricing_model: string,
	amount: number | null,
	min: number | null = null,
	max: number | null = null,
	sort = 0
): FineCategory => ({
	id,
	name,
	kind,
	pricing_model,
	amount,
	min_amount: min,
	max_amount: max,
	loggable: true,
	active: true,
	sort_order: sort
});

export const CATEGORIES: FineCategory[] = [
	cat('shop_safety_violation', 'Shop Safety', 'fine', 'flat', 12),
	cat('coin_theft', 'Coin Integrity', 'fine', 'flat', 12),
	cat('classmate_trust_violation', 'Classmate Trust', 'fine', 'flat', 5),
	cat('eating_violation', 'Eating', 'fine', 'flat', 5),
	cat('leaving_without_permission', 'Left Without Permission', 'fine', 'flat', 5),
	cat('disruptive_behavior', 'Disruptive', 'fine', 'flat', 3),
	cat('printer_not_reset', 'Printer Not Reset', 'fine', 'flat', 3),
	cat('off_task_device_use', 'Off-Task', 'fine', 'flat', 2),
	cat('inappropriate_screen_content', 'Inappropriate Screen Content', 'fine', 'flat', 2),
	cat('classroom_standards_violation', 'Classroom Standards', 'fine', 'flat', 1),
	cat('property_damage_first_accident', 'Property Damage (first accident)', 'fine', 'flat', 0),
	cat('property_damage_repeat_accident', 'Property Damage (repeat accident)', 'fine', 'flat', 3),
	cat('helping_classmate', 'Helping a Classmate', 'award', 'flat', 2, null, null, 1),
	cat('clean_up_crew', 'Clean-Up Crew', 'award', 'range', null, 1, 5, 2),
	cat('special_recognition', 'Special Recognition', 'award', 'variable', null, null, null, 3),
	cat('extra_credit', 'Extra Credit', 'award', 'formula', null, null, null, 4)
];

export const FINE_BUTTON_IDS = [
	'shop_safety_violation',
	'coin_theft',
	'classmate_trust_violation',
	'eating_violation',
	'leaving_without_permission',
	'property_damage',
	'disruptive_behavior',
	'printer_not_reset',
	'off_task_device_use',
	'inappropriate_screen_content',
	'classroom_standards_violation'
];

export interface FakeOptions {
	/** Every call answers as a database without 0240 (PGRST202). */
	missing?: boolean;
	/** One student whose every post is refused, to show a refusal in words. */
	refuse?: string | null;
	/** The class in session, or null for none. */
	inSession?: string | null;
}

export function createFakeFine(options: FakeOptions, note: (line: string) => void): FineTransports {
	const rosters = new Map<string, FineStudent[]>([
		[SECTION_A, seedStudents(NAMES_A)],
		[SECTION_B, seedStudents(NAMES_B)]
	]);
	const posted = new Map<string, { email: string; amount: number }>();
	const reversed = new Set<string>();
	let seq = 0;
	const gone = { ok: false as const, missing: true, message: 'The coin database update has not landed yet.' };
	const find = (email: string) => {
		for (const list of rosters.values()) {
			const s = list.find((x) => x.email === email);
			if (s) return s;
		}
		return null;
	};
	const damageCount = new Map<string, number>();

	return {
		async sections() {
			note('sections()');
			if (options.missing) return gone;
			const out: FineSection[] = [
				{ id: SECTION_A, label: 'IDEA100 Block 2', teacher_email: 'apina@boscotech.edu', in_session: options.inSession === SECTION_A, students: NAMES_A.length },
				{ id: SECTION_B, label: 'IDEA209H Block 4', teacher_email: 'apina@boscotech.edu', in_session: options.inSession === SECTION_B, students: NAMES_B.length }
			];
			return { ok: true, data: out };
		},
		async roster(sectionId) {
			note(`roster(${sectionId.slice(0, 8)})`);
			if (options.missing) return gone;
			const list = rosters.get(sectionId) ?? [];
			return {
				ok: true,
				data: {
					section_id: sectionId,
					label: sectionId === SECTION_A ? 'IDEA100 Block 2' : 'IDEA209H Block 4',
					students: list.map((s) => ({ ...s }))
				}
			};
		},
		async settings() {
			note('settings()');
			if (options.missing) return gone;
			return { ok: true, data: { fineButtons: [...FINE_BUTTON_IDS], categories: CATEGORIES } };
		},
		async log(emails, categoryId, opts = {}) {
			note(
				`log([${emails.map((e) => e.split('@')[0]).join(', ')}], ${categoryId}` +
					(opts.amount != null ? `, amount ${opts.amount}` : '') +
					(opts.carelessCost != null ? `, careless $${opts.carelessCost}` : '') +
					')'
			);
			if (options.missing) return gone;
			const results: FineLogRow[] = [];
			for (const email of emails) {
				const s = find(email);
				if (!s || email === options.refuse) {
					results.push({ email, ok: false, reason: 'cap_reached', cap_period: 'day' });
					continue;
				}
				let signed: number;
				if (categoryId === 'property_damage') {
					if (opts.carelessCost != null) signed = -(3 + Math.ceil(opts.carelessCost / 0.25));
					else {
						const n = damageCount.get(email) ?? 0;
						damageCount.set(email, n + 1);
						signed = n === 0 ? 0 : -3;
					}
				} else {
					const c = CATEGORIES.find((x) => x.id === categoryId);
					if (!c) {
						results.push({ email, ok: false, reason: 'error', message: 'Unknown category.' });
						continue;
					}
					const mag = c.pricing_model === 'flat' ? Number(c.amount) : Number(opts.amount ?? 0);
					signed = c.kind === 'fine' ? -mag : mag;
				}
				s.balance = Math.round((Number(s.balance) + signed) * 100) / 100;
				if (categoryId === 'shop_safety_violation') s.no_shop = true;
				const id = `tx-${++seq}`;
				posted.set(id, { email, amount: signed });
				results.push({ email, ok: true, transaction_id: id, amount: signed });
			}
			const ok = results.filter((r) => r.ok).length;
			return { ok: true, data: { total: emails.length, succeeded: ok, refused: emails.length - ok, results } };
		},
		async reverse(id) {
			note(`reverse(${id})`);
			if (options.missing) return gone;
			const row = posted.get(id);
			if (!row) return { ok: true, data: { ok: false, reason: 'not_found' } };
			if (reversed.has(id)) return { ok: true, data: { ok: false, reason: 'already_reversed' } };
			reversed.add(id);
			const s = find(row.email);
			if (s) s.balance = Math.round((Number(s.balance) - row.amount) * 100) / 100;
			return { ok: true, data: { ok: true } };
		}
	};
}
