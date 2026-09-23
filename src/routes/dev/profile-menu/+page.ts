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
let seeded = false;
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
		// Set so this harness shows the pathway chip AND the root layout's
		// first-login PathwayPicker never overlays this page (it targets
		// students with no pathway; /dev/pathways is its harness).
		pathway: 'IDEA' as string | null,
		preferences: {} as Record<string, unknown>,
		/**
		 * THE 0220 STYLE COLUMNS, PRESENT AND NULL -- which is the state every
		 * real row is in until somebody customizes something, and is NOT the
		 * same as absent. `profileStyleReady` keys on `undefined`, so seeding
		 * these as null is what makes the Identity section appear at all; the
		 * `?style=absent` switch below is the other state, where 0220 is not
		 * applied and the section must be GONE rather than broken.
		 */
		style_background_type: null as string | null,
		style_background_value: null as unknown,
		style_accent_color: null as string | null,
		style_badge: null as string | null,
		style_flourish: null as string | null,
		style_tagline: null as string | null
	}
};

/**
 * THE REFUSAL SWITCH, AND WHY THE HARNESS OWNS ONE.
 *
 * `ProfileMenu`'s `saveProfile` has three outcomes and only one of them is
 * reachable by pressing something: it succeeds, it gets a transport/RLS
 * `error`, or it gets a ZERO-ROW result with `error: null` -- which is what a
 * write the database declined to apply looks like through supabase-js, and the
 * reason that helper selects the row back at all. A harness that can only
 * succeed cannot show what a student sees when it does not, so the two failure
 * shapes are forced from the URL:
 *
 *   ?refuse=rls     zero rows, no error  (the silent-success trap itself)
 *   ?refuse=error   a PostgREST-shaped error object
 *
 * NEITHER IS A SECOND CODE PATH IN THE COMPONENT. The component is unchanged
 * and unaware; this only changes what the stub client answers, which is the
 * one thing a real refusal changes too.
 */
type RefuseMode = 'rls' | 'error' | null;

function makeStubSupabase(refuse: RefuseMode) {
	return {
		from() {
			return {
				update(patch: Record<string, unknown>) {
					// A refused write changes nothing in the store, exactly as a
					// declined UPDATE changes nothing in the table -- which is what
					// makes the chip still showing the old value the correct
					// reading rather than a stale render.
					if (!refuse) Object.assign(store.profile, patch);
					return {
						eq() {
							return this;
						},
						select() {
							if (refuse === 'rls') return Promise.resolve({ data: [], error: null });
							if (refuse === 'error')
								return Promise.resolve({
									data: null,
									error: { message: 'new row violates row-level security policy for table "profiles"' }
								});
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

export const load: PageLoad = async ({ url }) => {
	const r = url.searchParams.get('refuse');
	const refuse: RefuseMode = r === 'rls' || r === 'error' ? r : null;
	// `?pathway=` seeds the column so the unset case (a student who deferred the
	// first-login sheet) is drivable too; `none` is the unset state itself.
	//
	// ONCE, AND THAT IS NOT A MICRO-OPTIMISATION. `invalidateAll()` re-runs this
	// load with the SAME url, so a seed applied on every run would overwrite the
	// value the write just stored with the one in the query string -- the write
	// would land, the chip would flicker to it, and the next frame would put it
	// back. The seed is the STARTING state, not a standing instruction.
	if (!seeded) {
		seeded = true;
		const seed = url.searchParams.get('pathway');
		if (seed) store.profile.pathway = seed === 'none' ? null : seed;
	}
	/**
	 * `?style=absent` DROPS THE SIX COLUMNS ENTIRELY, which is the pre-0220
	 * deployment -- the migration is pasted by hand, so a client shipped ahead
	 * of it is a real state and not a hypothetical. The Identity section must
	 * be ABSENT there rather than present and refusing every save: a control
	 * whose only possible outcome is a refusal must not be offered.
	 * `?style=set` seeds a fully customized identity so the banner, the badge
	 * and the tagline are drivable without pressing six controls first.
	 */
	const styleMode = url.searchParams.get('style');
	const row: Record<string, unknown> = { ...store.profile };
	if (styleMode === 'absent') {
		for (const k of Object.keys(row)) if (k.startsWith('style_')) delete row[k];
	} else if (styleMode === 'set' && row.style_accent_color == null) {
		row.style_background_type = 'gradient';
		row.style_background_value = ['#3e7bfa', '#8e5bf0'];
		row.style_accent_color = '#22cccc';
		row.style_badge = 'rocket';
		row.style_flourish = 'glow-pulse';
		row.style_tagline = 'CAD or nothing';
		Object.assign(store.profile, row);
	}
	return {
		claims: { sub: store.profile.id, email: store.profile.email },
		userProfile: row,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		supabase: makeStubSupabase(refuse) as any
	};
};
