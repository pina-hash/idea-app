<script lang="ts">
	/**
	 * /foundry/review/publishers. An ordinary document, not a full-height
	 * application (`foundryIsApplication` answers false for it), so a long list
	 * of applications scrolls the page instead of being clipped inside a
	 * 100dvh box -- the defect report 647d1201 filed against the queue page this
	 * roster used to share.
	 *
	 * THE ROUTE OWNS THE TRANSPORTS. Every write is one RPC straight from the
	 * browser client, each re-checking `is_admin()` in its own body. The roster
	 * transports moved here from the queue page verbatim.
	 */
	import { invalidateAll } from '$app/navigation';

	import FoundryPage from '$lib/foundry/FoundryPage.svelte';
	import FoundryPublisherApplications from '$lib/foundry/FoundryPublisherApplications.svelte';
	import FoundryPublisherQuestions from '$lib/foundry/FoundryPublisherQuestions.svelte';
	import FoundryReviewNav from '$lib/foundry/FoundryReviewNav.svelte';
	import FoundryTrustRoster from '$lib/foundry/FoundryTrustRoster.svelte';
	import { foundryRpcOutcome, type FoundryPublisherTransports } from '$lib/foundry/transports';

	let { data } = $props();

	const decide: FoundryPublisherTransports['decide'] = async (applicationId, decision, note) => {
		try {
			const { data: r, error } = await data.supabase.rpc('foundry_publisher_decide', {
				p_application_id: applicationId,
				p_decision: decision,
				p_note: note
			});
			const out = foundryRpcOutcome(r, error);
			if (!out.ok) return out;
			return { ok: true, status: String(out.row.status ?? '') };
		} catch (err) {
			return { ok: false, message: err instanceof Error ? err.message : undefined };
		}
	};

	const saveQuestions: FoundryPublisherTransports['saveQuestions'] = async (questions) => {
		try {
			const { data: r, error } = await data.supabase.rpc('foundry_publisher_set_questions', {
				p_questions: questions
			});
			const out = foundryRpcOutcome(r, error);
			if (!out.ok) return out;
			return {
				ok: true,
				active: Number(out.row.active ?? 0),
				retired: Number(out.row.retired ?? 0)
			};
		} catch (err) {
			return { ok: false, message: err instanceof Error ? err.message : undefined };
		}
	};
</script>

<svelte:head>
	<title>Foundry publishers</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<FoundryPage
	heading="Publishers"
	lead="Students who asked to publish without waiting for review, the questions they answer, and everybody who is already trusted."
	testid="foundry-publishers-page"
>
	{#snippet nav()}
		<FoundryReviewNav
			active="publishers"
			pendingApps={data.reviewPending ?? null}
			pendingApplications={data.pendingApplications ?? null}
		/>
	{/snippet}

	<FoundryPublisherApplications
		pending={data.pending}
		decided={data.decided}
		{decide}
		onChanged={() => invalidateAll()}
	/>

	<FoundryPublisherQuestions
		read={data.questions}
		save={saveQuestions}
		onChanged={() => invalidateAll()}
	/>

	<FoundryTrustRoster
		rows={data.trusted ?? []}
		transports={{
			async grantTrust(email, note) {
				const { error } = await data.supabase.rpc('foundry_trusted_grant', {
					p_email: email,
					p_note: note
				});
				// The database's own sentence, verbatim: it is the one that says
				// whether the address was refused for its domain or the caller
				// for not being an admin.
				if (error) return { ok: false, message: error.message };
				return { ok: true };
			},
			async revokeTrust(email) {
				const { error } = await data.supabase.rpc('foundry_trusted_revoke', {
					p_email: email
				});
				if (error) return { ok: false, message: error.message };
				return { ok: true };
			}
		}}
		onChanged={() => invalidateAll()}
	/>
</FoundryPage>
