/**
 * Co-op netcode latency spike. Deliberately reachable in production
 * (unlike every other /dev/ tool): it needs to open directly on real
 * devices on the school WiFi with no local server. It creates no database
 * rows, requires no auth, and only opens an ephemeral Supabase Realtime
 * broadcast channel, so this is safe to leave open. Do not add a `dev`
 * check here without re-checking that requirement first.
 */
export const prerender = false;
