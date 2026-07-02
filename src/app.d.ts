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

		// interface Error {}
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
