/**
 * In-memory mock session for the /dev/tour harness ($state so the on-screen
 * write log and profile readout update live; module-level so values written by
 * the stub client survive invalidateAll(), mirroring a persisted profile). Not
 * a route file; private to the harness.
 */
import type { UserProfile } from '$lib/profile';

export type TourHarnessMode = 'anon' | 'student' | 'done' | 'picker' | 'old';

/** Who is signed in: a student, or staff (the email domain's `teacher` role). */
export type TourHarnessRole = 'student' | 'teacher';

/*
 * TWO STAMPS, ONE EACH SIDE OF `HOME_TOUR_VERSION` (ledger 0298). `done` has
 * seen THIS tour, so nothing starts and nothing is offered; `old` finished the
 * tour before it was rewritten, so the one-line offer shows under the header.
 * `done` used to carry the older value, which since the rewrite is `old`.
 */
const SEEN_THIS_TOUR = '2026-09-26T03:00:00.000Z';
const SEEN_OLD_TOUR = '2026-07-01T00:00:00.000Z';

export const store = $state({
	/** Mutated by the stub client's tour_completed_at writes. */
	tourCompletedAt: null as string | null,
	/** Mutated by the stub client's pathway writes (picker mode). */
	pathway: null as string | null,
	/**
	 * Mutated by the stub client's `preferences` writes, so the app launcher's
	 * saved layout, sort mode and usage counters behave like a persisted profile
	 * within the session -- which is the only way to check that a reorder or an
	 * open actually stuck. Seedable from the harness page (see `seedPreferences`)
	 * so a pre-migration v1 layout can be loaded and watched migrate.
	 */
	preferences: {} as Record<string, unknown>,
	/** Human-readable log of every write the stub client received. */
	log: [] as string[]
});

/** Replace the mock profile's stored preferences (harness setup, not a write). */
export function seedPreferences(next: Record<string, unknown>) {
	store.preferences = next;
}

export function profileForMode(mode: TourHarnessMode, role: TourHarnessRole = 'student'): UserProfile | null {
	if (mode === 'anon') return null;
	const staff = role === 'teacher';
	return {
		id: staff ? 'mock-teacher' : 'mock-student',
		email: staff ? 'test.teacher@boscotech.edu' : 'test.student@boscotech.net',
		full_name: staff ? 'Sam Ortega' : 'Alex Rivera',
		display_name: null,
		avatar_url: null,
		avatar: 'preset:hex',
		role,
		section_id: null,
		// 'picker' starts with no pathway so the REAL root-layout PathwayPicker
		// shows first and the tour has to wait for it.
		pathway: mode === 'picker' ? store.pathway : (store.pathway ?? 'IDEA'),
		preferences: store.preferences,
		tour_completed_at:
			mode === 'done' ? SEEN_THIS_TOUR : mode === 'old' ? (store.tourCompletedAt ?? SEEN_OLD_TOUR) : store.tourCompletedAt
	};
}

function note(msg: string) {
	store.log = [...store.log, `${new Date().toLocaleTimeString()} ${msg}`].slice(-8);
}

export function makeStubSupabase() {
	return {
		from(table: string) {
			return {
				update(patch: Record<string, unknown>) {
					return {
						eq(_col: string, _val: string) {
							if ('tour_completed_at' in patch)
								store.tourCompletedAt = patch.tour_completed_at as string | null;
							if ('pathway' in patch) store.pathway = patch.pathway as string | null;
							if ('preferences' in patch)
								store.preferences = patch.preferences as Record<string, unknown>;
							note(`update ${table} ${JSON.stringify(patch)}`);
							return {
								// Awaitable like the real builder, and .select()-able for
								// the confirm-the-write-landed pattern (PathwayPicker).
								then(resolve: (v: { data: null; error: null }) => void) {
									resolve({ data: null, error: null });
								},
								select() {
									return Promise.resolve({ data: [{ id: 'mock-student' }], error: null });
								}
							};
						}
					};
				}
			};
		},
		auth: {
			async signInWithOAuth() {
				note('auth.signInWithOAuth (stubbed, no redirect)');
				return { error: { message: 'Sign-in is stubbed in this harness.' } };
			},
			async signOut() {
				note('auth.signOut (stubbed)');
				return { error: null };
			}
		},
		storage: {
			from() {
				return {
					async upload() {
						return { error: null };
					}
				};
			}
		}
	};
}
