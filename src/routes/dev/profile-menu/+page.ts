import type { PageLoad } from './$types';

/**
 * Dev-only harness data for the ProfileMenu bug (display-name edit). Renders
 * client-side only (ssr=false) so we can hand the real component a mock session:
 * mock `claims` + `userProfile`, and a stub `supabase` whose profile update
 * "succeeds" against a mutable in-memory profile. Overriding these keys shadows
 * the root layout's real (placeholder-env) client, so the whole open -> Edit ->
 * Save -> stays-open -> name-updates flow is exercisable with no auth / network.
 *
 * 404 in production (guarded in +page.svelte's parent dev layout is not needed:
 * this route carries no secrets and reaches no backend).
 */
export const ssr = false;

// Module-level so a value written by the stub survives invalidateAll() (which
// re-runs this load), mirroring a real persisted profile.
const store = {
	profile: {
		id: 'mock-user',
		email: 'test.student@boscotech.net',
		full_name: 'Alex Rivera',
		display_name: null as string | null,
		avatar_url: null as string | null,
		avatar: 'preset:hex' as string | null,
		role: 'student',
		section_id: null as string | null,
		preferences: {} as Record<string, unknown>
	}
};

function makeStubSupabase() {
	return {
		from() {
			return {
				update(patch: Record<string, unknown>) {
					Object.assign(store.profile, patch);
					return {
						eq() {
							return this;
						},
						select() {
							return Promise.resolve({ data: [{ id: store.profile.id }], error: null });
						}
					};
				}
			};
		},
		auth: {
			async signOut() {
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

export const load: PageLoad = async () => {
	return {
		claims: { sub: store.profile.id, email: store.profile.email },
		userProfile: { ...store.profile },
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		supabase: makeStubSupabase() as any
	};
};
