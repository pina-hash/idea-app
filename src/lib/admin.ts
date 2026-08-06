/**
 * Client-safe admin constants (0067). Plain data, the curriculum.ts
 * convention; the authority is the SQL.
 *
 * ADMIN_OWNER_EMAIL mirrors admin_owner_email() in
 * supabase/migrations/0067_admin_tier.sql. It is used only for DISPLAY -- "ask
 * this person for access", and marking the owner's row on the admin page --
 * never as a check. Every real decision is is_admin() / is_owner() inside the
 * database, which a client cannot influence. Keep the two in step if the owner
 * ever changes.
 */
export const ADMIN_OWNER_EMAIL = 'apina@boscotech.edu';

export interface AdminRow {
	email: string;
	is_owner: boolean;
	granted_by: string | null;
	granted_at: string;
	note: string | null;
}
