/**
 * RFC 9728 metadata for the practice endpoint, where its 401 points. It names
 * /mcp/practice as the resource, so a client that checks the metadata against
 * the URL it called accepts it; the authorization server is the site's own.
 */
import type { RequestHandler } from './$types';
import { json, protectedResourceMetadata } from '$lib/server/connector/oauth';

export const GET: RequestHandler = ({ url }) =>
	json(200, protectedResourceMetadata(url.origin, true), { 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=300' });
