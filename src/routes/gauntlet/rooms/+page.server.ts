import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { RoomState } from '$lib/gauntlet';

/**
 * Live rooms landing. Auth-gated with the rest of /gauntlet. Anyone can join a
 * room by code; teachers can also host. We load the rooms the user hosts and the
 * rooms they have joined so they can return (room state is DB-authoritative).
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

	const isTeacher = profile?.role === 'teacher';

	const { data: hosted } = isTeacher
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
		isTeacher,
		hosted: (hosted ?? []) as Array<{ id: string; join_code: string; state: RoomState }>,
		joined
	};
};
