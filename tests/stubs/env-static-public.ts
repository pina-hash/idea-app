/**
 * A stand-in for SvelteKit's `$env/static/public`, aliased in vitest.config.ts.
 *
 * WHY IT EXISTS: server-rendering the real home page reaches Avatar, which
 * imports `profile.ts` for the Supabase storage URL an uploaded avatar is built
 * from. Without a stand-in the page cannot be imported here at all.
 *
 * THESE ARE PLACEHOLDERS AND THEY LOOK LIKE IT. Nothing in the suite may assert
 * against them or send them anywhere: the local `.env` is already a placeholder
 * project (see CLAUDE.md), and these values exist only so a module that reads
 * the URL at import time can be imported.
 */
export const PUBLIC_SUPABASE_URL = 'https://example-ref.supabase.co';
export const PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key-not-a-real-credential';
export const PUBLIC_FSP_APPS_SCRIPT_URL = '';
export const PUBLIC_FSP_PULSE_APPS_SCRIPT_URL = '';
export const PUBLIC_VAPID_PUBLIC_KEY = '';
