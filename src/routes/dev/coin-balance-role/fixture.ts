/**
 * A `coin_my_role()`-shaped payload (0247) for the /dev/coin-balance-role
 * harness, run through the REAL `parseMyRole` by the harness. Today is
 * Oct 15, 2026 (a Thursday); the weekends are not class days.
 */

const PIC = (hue: string) =>
	'data:image/svg+xml;charset=utf-8,' +
	encodeURIComponent(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 30"><rect width="40" height="30" fill="${hue}"/><rect x="6" y="8" width="28" height="14" fill="#d9d9d9" opacity="0.6"/></svg>`
	);

type Day = {
	day: string;
	photos: number;
	gap_minutes: number | null;
	rules_pass: boolean;
	reason: string | null;
	override: string | null;
	valid: boolean;
	status: string;
	class_day: boolean;
	photo_paths: { path: string; taken_at: string; url: string }[];
};

function day(d: string, status: string, photos: number, extra: Partial<Day> = {}): Day {
	const shots = Array.from({ length: photos }, (_, i) => ({
		path: `u1/${d}-${i}.jpg`,
		taken_at: `${d}T${i === 0 ? '15:05' : '16:10'}:00Z`,
		url: PIC(i === 0 ? '#2c4a3e' : '#3e2c4a')
	}));
	return {
		day: d,
		photos,
		gap_minutes: photos > 1 ? 65 : null,
		rules_pass: status === 'passed',
		reason: status === 'passed' ? null : photos === 0 ? 'no_photos' : 'too_few_photos',
		override: status === 'accepted' || status === 'rejected' ? status : null,
		valid: status === 'passed' || status === 'accepted',
		status,
		class_day: true,
		photo_paths: shots,
		...extra
	};
}

export type RoleScenario = 'holder' | 'none' | 'signed_out' | 'updating';

export const ROLE_SCENARIOS: { id: RoleScenario; label: string }[] = [
	{ id: 'holder', label: 'Holds a role, two weeks of days' },
	{ id: 'none', label: 'Holds no role' },
	{ id: 'signed_out', label: 'Signed out' },
	{ id: 'updating', label: 'Database not updated (0247 missing)' }
];

export function fixtureRole(s: RoleScenario): Record<string, unknown> | null {
	if (s === 'signed_out' || s === 'updating') return null;
	if (s === 'none') return { signed_in: true, roles: [] };
	const days: Day[] = [
		day('2026-10-02', 'rejected', 2),
		day('2026-10-03', 'none', 0, { class_day: false }),
		day('2026-10-04', 'none', 0, { class_day: false }),
		day('2026-10-05', 'passed', 2),
		day('2026-10-06', 'accepted', 1),
		day('2026-10-07', 'passed', 2),
		day('2026-10-08', 'failed', 1),
		day('2026-10-09', 'none', 0),
		day('2026-10-10', 'none', 0, { class_day: false }),
		day('2026-10-11', 'none', 0, { class_day: false }),
		day('2026-10-12', 'passed', 2),
		day('2026-10-13', 'failed', 2, { reason: 'gap_too_short', gap_minutes: 20 }),
		day('2026-10-14', 'passed', 2),
		day('2026-10-15', 'failed', 1)
	];
	return {
		signed_in: true,
		roles: [
			{
				holder_id: 'hold-1',
				role_id: 'shop_steward',
				role: 'Shop Steward',
				section: 'Engineering I Honors, Block 2',
				since: '2026-09-28T17:00:00Z',
				expires_at: null,
				instructions:
					'At the start of class, photograph the whole shop from the doorway. At the end of class, photograph the same spot again. The shop must be as clean or cleaner than when you started.',
				rules: { min_gap_minutes: 45, photos_per_day: 2, window_start: '07:00', window_end: '16:00', own: false },
				today: '2026-10-15',
				class_today: true,
				days
			}
		]
	};
}
