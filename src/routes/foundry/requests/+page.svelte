<script lang="ts">
	/**
	 * /foundry/requests. The route owns the load and the transports; the board
	 * owns the arrangement. Every write is one RPC straight from the browser
	 * client, and each re-checks the caller in its own body: posting takes no
	 * identity, closing answers the same `not_found` for somebody else's
	 * request as for one that does not exist, and hiding is admin-only.
	 *
	 * `setHidden` IS HANDED DOWN ONLY TO AN ADMIN, so a student's board has no
	 * Hide key at all. That is markup gating; `is_admin()` inside
	 * `foundry_game_request_set_hidden` is the boundary.
	 */
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';

	import FoundryPage from '$lib/foundry/FoundryPage.svelte';
	import FoundryRequestBoard from '$lib/foundry/FoundryRequestBoard.svelte';
	import { foundryRpcOutcome, type FoundryRequestTransports } from '$lib/foundry/transports';

	let { data } = $props();

	const isAdmin = $derived(page.data.isAdmin === true);

	async function call(fn: string, args: Record<string, unknown>) {
		try {
			const { data: r, error } = await data.supabase.rpc(fn, args);
			return foundryRpcOutcome(r, error);
		} catch (err) {
			return { ok: false as const, message: err instanceof Error ? err.message : undefined };
		}
	}

	const base: FoundryRequestTransports = {
		async post(title, body, offer) {
			const out = await call('foundry_game_request_post', {
				p_title: title,
				p_body: body,
				p_offer: offer
			});
			if (!out.ok) return out;
			return { ok: true, id: String(out.row.id ?? '') };
		},
		async close(requestId, fulfilledSlug) {
			const out = await call('foundry_game_request_close', {
				p_request_id: requestId,
				p_fulfilled_slug: fulfilledSlug
			});
			return out.ok ? { ok: true } : out;
		}
	};

	const transports = $derived<FoundryRequestTransports>(
		isAdmin
			? {
					...base,
					async setHidden(requestId, hidden) {
						const out = await call('foundry_game_request_set_hidden', {
							p_request_id: requestId,
							p_hidden: hidden
						});
						return out.ok ? { ok: true } : out;
					}
				}
			: base
	);
</script>

<svelte:head>
	<title>Game requests // IDEA Foundry</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<FoundryPage
	heading="Game requests"
	lead="Ask for a game you would like somebody to make, or find one to build. The site only holds the board; anything you offer is between you and the maker."
	testid="foundry-requests-page"
>
	<FoundryRequestBoard
		requests={data.requests}
		available={data.available}
		{transports}
		onChanged={() => invalidateAll()}
	/>
</FoundryPage>
