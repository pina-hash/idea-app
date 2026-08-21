import type { SupabaseClient } from '@supabase/supabase-js';

declare global {
	namespace App {
		/**
		 * Decoded JWT claims returned by `supabase.auth.getClaims()`.
		 * `sub` is the authenticated user's id.
		 */
		interface Claims {
			sub: string;
			email?: string;
			[key: string]: unknown;
		}

		/**
		 * WHAT A FAILED REQUEST CARRIES BACK TO THE PAGE. `id` is minted by
		 * `handleError` in hooks.server.ts and logged beside the stack, so a
		 * report someone files from the error boundary can be joined to the
		 * server log line for the same failure. The message stays generic: an
		 * internal error's real text is never handed to a caller.
		 */
		interface Error {
			message: string;
			id?: string;
		}
		interface Locals {
			supabase: SupabaseClient;
			claims: Claims | null;
		}
		interface PageData {
			claims?: Claims | null;
			supabase?: SupabaseClient;
			userProfile?: import('$lib/profile').UserProfile | null;
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
