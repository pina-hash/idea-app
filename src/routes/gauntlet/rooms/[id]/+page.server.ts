import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	DEFAULT_SPEEDRUN_RULESET,
	MODELS_BUCKET,
	type GauntletRoom,
	type ModelingFraming,
	type RoomBoardRow,
	type RoomParticipant,
	type SpeedrunRuleset
} from '$lib/gauntlet';

/**
 * One live room. RLS only lets members (host + participants) read the room, so a
 * non-member load returns null and we send them back to join. Room state is
 * DB-authoritative: the load returns the current state/roster/board/framing and
 * the page subscribes to Realtime for live updates. The drawing is NOT loaded
 * here; it is gated behind `gauntlet_room_reveal` until the host starts.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims }, params }) => {
	if (!claims) {
		redirect(303, '/');
	}

	const { data: room } = await supabase
		.from('gauntlet_rooms')
		.select('id, host_id, join_code, current_challenge_id, state, started_at')
		.eq('id', params.id)
		.maybeSingle();

	if (!room) {
		// Not a member (or no such room): go join.
		redirect(303, '/gauntlet/rooms');
	}

	const { data: profile } = await supabase
		.from('profiles')
		.select('full_name, role')
		.eq('id', claims.sub)
		.single();

	const amHost = room.host_id === claims.sub;
	let myRole: 'host' | 'racer' | 'spectator' | null = amHost ? 'host' : null;
	if (!amHost) {
		const { data: p } = await supabase
			.from('gauntlet_room_participants')
			.select('role')
			.eq('room_id', room.id)
			.eq('user_id', claims.sub)
			.maybeSingle();
		myRole = (p?.role ?? null) as 'racer' | 'spectator' | null;
	}

	const { data: roster } = await supabase
		.from('gauntlet_room_roster')
		.select('user_id, role, player')
		.eq('room_id', room.id)
		.order('joined_at', { ascending: true });

	const { data: board } = await supabase
		.from('gauntlet_room_board')
		.select('user_id, player, is_correct, score_metric, source, rank')
		.eq('room_id', room.id)
		.order('rank', { ascending: true });

	let framing: (ModelingFraming & { title: string; difficulty: number }) | null = null;
	// Shape-only STL preview (public framing), same signed-URL pattern as the
	// solo Speedrun page, for the same room-formatting parity.
	let modelUrl: string | null = null;
	if (room.current_challenge_id) {
		const { data: ch } = await supabase
			.from('challenges')
			.select('title, difficulty, prompt')
			.eq('id', room.current_challenge_id)
			.maybeSingle();
		if (ch) {
			framing = {
				...((ch.prompt ?? {}) as ModelingFraming),
				title: ch.title as string,
				difficulty: ch.difficulty as number
			};
			if (framing.model_path) {
				const { data: signed } = await supabase.storage
					.from(MODELS_BUCKET)
					.createSignedUrl(framing.model_path, 60 * 60);
				modelUrl = signed?.signedUrl ?? null;
			}
		}
	}

	// The one global ruleset, same as the solo Speedrun page (rooms are always
	// Speedrun mode, so it always applies once a challenge exists).
	const { data: rules } = await supabase
		.from('gauntlet_speedrun_ruleset')
		.select('units_label, projection, rule_lines')
		.maybeSingle();

	let speedrunChallenges: Array<{ id: string; title: string; difficulty: number }> = [];
	if (amHost && room.state === 'lobby') {
		const { data: list } = await supabase
			.from('challenges')
			.select('id, title, difficulty')
			.eq('mode', 'speedrun')
			.eq('published', true)
			.order('difficulty', { ascending: true })
			.order('title', { ascending: true });
		speedrunChallenges = (list ?? []) as typeof speedrunChallenges;
	}

	return {
		userName: profile?.full_name ?? claims.email ?? 'Signed in',
		userRole: profile?.role ?? 'student',
		room: room as GauntletRoom,
		amHost,
		myRole,
		myUserId: claims.sub,
		roster: (roster ?? []) as RoomParticipant[],
		board: (board ?? []) as RoomBoardRow[],
		framing,
		modelUrl,
		ruleset: (rules ?? DEFAULT_SPEEDRUN_RULESET) as SpeedrunRuleset,
		speedrunChallenges
	};
};
