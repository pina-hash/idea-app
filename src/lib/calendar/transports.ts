/**
 * THE CALENDAR'S WRITES FROM A PAGE (ledger 0439). Every one is a definer
 * function that re-checks its caller (0308) or the caller's own preferences row
 * through the site's one preferences path; handing these in is plumbing, never
 * a boundary.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseProfileIo, writeProfileNamespace } from '$lib/preferences/profile-io';
import { storedCalendarPrefs, type CalendarPrefs } from './model';

export type CalendarResult<T extends object = object> = ({ ok: true } & T) | { ok: false; message: string };

export interface CalendarEventDraft {
	id: string | null;
	layer: 'idea' | 'robotics';
	title: string;
	startsOn: string;
	endsOn: string | null;
	startTime: string | null;
	endTime: string | null;
	location: string | null;
	notes: string | null;
}

export interface CalendarTransports {
	savePrefs(prefs: CalendarPrefs): Promise<CalendarResult>;
	link(reset: boolean): Promise<CalendarResult<{ token: string }>>;
	revokeLink(): Promise<CalendarResult>;
	saveEvent(draft: CalendarEventDraft): Promise<CalendarResult<{ id: string }>>;
	removeEvent(id: string): Promise<CalendarResult>;
}

const UNREACHABLE = 'The calendar could not be reached. Try again in a moment.';

function refusal(data: unknown): string | null {
	const d = data as { ok?: boolean; message?: string } | null;
	return d && d.ok === false ? (d.message ?? 'That did not save.') : null;
}

export function createCalendarTransports(supabase: SupabaseClient, userId: string): CalendarTransports {
	return {
		async savePrefs(prefs) {
			const res = await writeProfileNamespace(supabaseProfileIo(supabase, userId), 'calendar', storedCalendarPrefs(prefs));
			return res.ok ? { ok: true } : { ok: false, message: 'Your choice shows on this page but did not save for next time.' };
		},
		async link(reset) {
			const { data, error } = await supabase.rpc('calendar_feed_link', { p_reset: reset });
			const token = (data as { token?: string } | null)?.token;
			return error || !token ? { ok: false, message: UNREACHABLE } : { ok: true, token };
		},
		async revokeLink() {
			const { error } = await supabase.rpc('calendar_feed_link_revoke');
			return error ? { ok: false, message: UNREACHABLE } : { ok: true };
		},
		async saveEvent(d) {
			const { data, error } = await supabase.rpc('calendar_event_save', {
				p_id: d.id,
				p_layer: d.layer,
				p_title: d.title,
				p_starts_on: d.startsOn,
				p_ends_on: d.endsOn,
				p_start_time: d.startTime,
				p_end_time: d.endTime,
				p_location: d.location,
				p_notes: d.notes
			});
			if (error) return { ok: false, message: UNREACHABLE };
			const why = refusal(data);
			if (why) return { ok: false, message: why };
			return { ok: true, id: String((data as { id?: string }).id ?? '') };
		},
		async removeEvent(id) {
			const { data, error } = await supabase.rpc('calendar_event_remove', { p_id: id });
			if (error) return { ok: false, message: UNREACHABLE };
			const why = refusal(data);
			return why ? { ok: false, message: why } : { ok: true };
		}
	};
}

/** The subscription address for a token, as `https:` and as the `webcal:` a phone opens. */
export function subscriptionUrls(origin: string, token: string): { https: string; webcal: string } {
	const https = `${origin}/api/calendar/feed/${token}.ics`;
	return { https, webcal: https.replace(/^https?:/, 'webcal:') };
}
