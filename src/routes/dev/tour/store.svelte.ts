/**
 * In-memory mock session for the /dev/tour harness ($state so the on-screen
 * write log and profile readout update live; module-level so values written by
 * the stub client survive invalidateAll(), mirroring a persisted profile). Not
 * a route file; private to the harness.
 */
import type { UserProfile } from '$lib/profile';

export type TourHarnessMode = 'anon' | 'student' | 'done' | 'picker';

export const store = $state({
	/** Mutated by the stub client's tour_completed_at writes. */
	tourCompletedAt: null as string | null,
	/** Mutated by the stub client's pathway writes (picker mode). */
	pathway: null as string | null,
	/** Human-readable log of every write the stub client received. */
	log: [] as string[]
});

export function profileForMode(mode: TourHarnessMode): UserProfile | null {
	if (mode === 'anon') return null;
	return {
		id: 'mock-student',
		email: 'test.student@boscotech.net',
		full_name: 'Alex Rivera',
		display_name: null,
		avatar_url: null,
		avatar: 'preset:hex',
		role: 'student',
		section_id: null,
		// 'picker' starts with no pathway so the REAL root-layout PathwayPicker
		// shows first and the tour has to wait for it.
		pathway: mode === 'picker' ? store.pathway : (store.pathway ?? 'IDEA'),
		preferences: {},
		tour_completed_at: mode === 'done' ? '2026-07-01T00:00:00.000Z' : store.tourCompletedAt
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
