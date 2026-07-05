/**
 * In-memory mock session for the /dev/pathways harness (module-level so values
 * written by the stub client survive invalidateAll(), mirroring a persisted
 * profile). Not a route file; private to the harness.
 */

export const store = {
	profile: {
		id: 'mock-student',
		email: 'test.student@boscotech.net',
		full_name: 'Alex Rivera',
		display_name: null as string | null,
		avatar_url: null as string | null,
		avatar: 'preset:hex' as string | null,
		role: 'student',
		section_id: null as string | null,
		pathway: null as string | null,
		preferences: {} as Record<string, unknown>
	}
};

export function makeStubSupabase() {
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
