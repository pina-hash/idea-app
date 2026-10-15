/**
 * THE ROUTE'S `CertActionPost`: a SvelteKit form action called by name from a
 * component, over `fetch`, the way `use:enhance` does it under the hood
 * (ledger 0391). It lives apart from `actions.ts` because it imports
 * `$app/forms` and `$app/navigation`, which a component under test and a /dev
 * harness must never pull in.
 *
 * Why not `use:enhance` on every form: a harness mounts the same component
 * with no route action behind it, so the form's submit has to be a CALLBACK
 * the mounting surface supplies. Here that callback is the real action; in a
 * harness it is memory. The form still carries `method="POST"
 * action="?/<name>"`, so with scripting off the browser posts natively and
 * the page re-renders with `form.message`.
 *
 * `x-sveltekit-action` is what makes the server answer a redirect as JSON
 * rather than following it, and a `success` is followed by `invalidateAll()`
 * so every load on the page re-reads what the write changed.
 */
import { deserialize } from '$app/forms';
import { goto, invalidateAll } from '$app/navigation';
import type { ActionAnswer, CertActionPost } from './actions';
import { GENERIC_FAILURE } from './actions';

export function createActionPost(): CertActionPost {
	return async (action, fields): Promise<ActionAnswer> => {
		const body = new FormData();
		for (const [k, v] of Object.entries(fields)) body.append(k, v);
		let text: string;
		try {
			const res = await fetch(`${location.pathname}?/${encodeURIComponent(action)}`, {
				method: 'POST',
				body,
				headers: { 'x-sveltekit-action': 'true', accept: 'application/json' }
			});
			text = await res.text();
		} catch (e) {
			return { ok: false, message: (e as Error)?.message || GENERIC_FAILURE };
		}
		let result: ReturnType<typeof deserialize>;
		try {
			result = deserialize(text);
		} catch {
			return { ok: false, message: GENERIC_FAILURE };
		}
		if (result.type === 'success') {
			await invalidateAll();
			return { ok: true, data: (result.data ?? undefined) as Record<string, unknown> | undefined };
		}
		if (result.type === 'failure') {
			const d = (result.data ?? {}) as Record<string, unknown>;
			return {
				ok: false,
				message: typeof d.message === 'string' && d.message ? d.message : 'Refused.',
				reason: typeof d.reason === 'string' ? d.reason : undefined
			};
		}
		if (result.type === 'redirect') {
			await goto(result.location, { invalidateAll: true });
			return { ok: true };
		}
		return { ok: false, message: result.error?.message || GENERIC_FAILURE };
	};
}
