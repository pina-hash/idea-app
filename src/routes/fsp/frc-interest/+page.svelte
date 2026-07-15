<script lang="ts">
	import type { SupabaseClient } from '@supabase/supabase-js';
	import FrcInterestForm from '$lib/fsp/FrcInterestForm.svelte';
	import { submitFrcInterest } from '$lib/fsp/frc-interest';

	/**
	 * /fsp/frc-interest — a standalone, PUBLIC, unauthenticated FRC Team 5669
	 * interest form. Reached cold from a QR code (like /fsp-tech-selection and
	 * /fsp/ask), so it needs no sign-in at all: prospective freshmen and parents
	 * scanning the code will not have Bosco Tech accounts. It only reads an
	 * existing session (if any) to pre-fill (never lock) the email field.
	 *
	 * The form itself is $lib/fsp/FrcInterestForm.svelte (shared with the dev
	 * harness); this page just wires its `submit` callback to the real anon-safe
	 * insert (submitFrcInterest, see $lib/fsp/frc-interest.ts for why this table
	 * is the one exception to the "no direct client insert" convention).
	 */

	let { data } = $props();
	const supabase = $derived(data.supabase as SupabaseClient);
	const claims = $derived(data.claims);
	const initialEmail = $derived((claims?.email ?? '') as string);
</script>

<svelte:head>
	<title>FRC Team 5669 — Interest Form</title>
	<meta name="robots" content="noindex" />
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
</svelte:head>

<FrcInterestForm {initialEmail} submit={(s) => submitFrcInterest(supabase, s)} />
