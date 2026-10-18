/** RFC 9728 protected-resource metadata for the connector's MCP endpoint. */
import type { RequestHandler } from './$types';
import { json, protectedResourceMetadata } from '$lib/server/connector/oauth';

export const GET: RequestHandler = ({ url }) =>
	json(200, protectedResourceMetadata(url.origin), { 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=300' });
