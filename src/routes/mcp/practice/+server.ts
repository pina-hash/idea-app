/**
 * THE PRACTICE CONNECTOR (docs/connector/DESIGN.md section 9): the same MCP
 * server as /mcp, with one difference fixed by THIS URL and never by an
 * argument: every write runs as a preview and nothing commits, and no request,
 * gap or confirmation is stored. Same sign-in, same switch, same admin check.
 * The nightly replay of his saved requests runs here.
 */
import type { RequestHandler } from './$types';
import { connectorDeps } from '$lib/server/connector/deps';
import { handleMcp } from '$lib/server/connector/mcp';

const handle: RequestHandler = async ({ request, url }) => handleMcp(request, url.origin, await connectorDeps(), { practice: true });

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
export const OPTIONS = handle;
