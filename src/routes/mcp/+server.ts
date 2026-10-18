/**
 * The IDEA Website connector's MCP endpoint (docs/connector/DESIGN.md). Not
 * under `authedPrefixes`: it answers its own 401, with the pointer Claude needs
 * to sign in. Everything else is `handleMcp`.
 */
import type { RequestHandler } from './$types';
import { connectorDeps } from '$lib/server/connector/deps';
import { handleMcp } from '$lib/server/connector/mcp';

const handle: RequestHandler = async ({ request, url }) => handleMcp(request, url.origin, await connectorDeps());

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
export const OPTIONS = handle;
