import { redirect } from '@sveltejs/kit';
import {
	canAuthorGauntlet,
	GAUNTLET_AUTHORING_REFUSAL
} from '$lib/server/gauntlet-authoring';
import type { PageServerLoad } from './$types';
import type { RoomState } from '$lib/gauntlet';

/**
 * Live rooms landing. Auth-gated with the rest of /gauntlet. Anyone can JOIN a
 * room by code; HOSTING is the author tier since 0155
 * (`gauntlet_room_create`'s own check is `gauntlet_can_author()` now, not
 * `is_teacher()`). We load the rooms the user hosts and the rooms they have
 * joined so they can return (room state is DB-authoritative).
 *
 * THE FLAG IS `canHost`, NOT `isAdmin`, AND THE RENAME IS THE POINT. This route
 * never redirected -- it simply omitted the host section for a non-admin, which
 * is the same audit finding wearing different clothes: a teacher read a page
 * with no way to host and nothing saying why, so being refused looked like the
 * feature not existing. It now returns the reason alongside the flag, and the
 * page says it. Naming the flag after the CAPABILITY rather than after a tier
 * is also what stops the next reader gating something admin-only on it.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) {
		redirect(303, '/');
	}

	const { data: profile } = await supabase
		.from('profiles')
		.select('full_name, role')
		.eq('id', claims.sub)
		.single();

	const canHost = await canAuthorGauntlet(supabase, claims.sub);

	const { data: hosted } = canHost
		? await supabase
				.from('gauntlet_rooms')
				.select('id, join_code, state, created_at')
				.eq('host_id', claims.sub)
				.order('created_at', { ascending: false })
				.limit(10)
		: { data: [] };

	const { data: joinedRows } = await supabase
		.from('gauntlet_room_participants')
		.select('role, room:gauntlet_rooms(id, join_code, state)')
		.eq('user_id', claims.sub)
		.limit(10);

	type JoinedRoom = { id: string; join_code: string; state: RoomState; role: string };
	const joined = (joinedRows ?? [])
		.map((r): JoinedRoom | null => {
			const room = r.room as unknown as { id: string; join_code: string; state: RoomState } | null;
			return room ? { id: room.id, join_code: room.join_code, state: room.state, role: r.role } : null;
		})
		.filter((r): r is JoinedRoom => r !== null);

	return {
		userName: profile?.full_name ?? claims.email ?? 'Signed in',
		userRole: profile?.role ?? 'student',
		canHost,
		// Null when they can host: there is nothing to explain.
		refusal: canHost ? null : GAUNTLET_AUTHORING_REFUSAL,
		hosted: (hosted ?? []) as Array<{ id: string; join_code: string; state: RoomState }>,
		joined
	};
};
