import { foundryBuildContract } from '$lib/foundry/preflight';
import type { PageServerLoad } from './$types';

/**
 * THE CONTRACT IS GENERATED, NEVER STORED.
 *
 * `foundryBuildContract()` derives every number and every list from the
 * constants `preflight.ts` actually enforces, so this page cannot disagree with
 * the checks: moving a cap rewrites the document in the same commit. There is
 * no copy of this text anywhere in the repo to fall out of date.
 *
 * It is built on the SERVER so the page has its text in the first response --
 * a student pasting this into an AI tool should be able to select it the moment
 * the page paints, and it costs one string concatenation.
 */
export const load: PageServerLoad = async () => ({ contract: foundryBuildContract() });
