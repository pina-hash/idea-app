/** RFC 8414 authorization-server metadata: ideabosco.com is the connector's own OAuth server. */
import type { RequestHandler } from './$types';
import { authorizationServerMetadata, json } from '$lib/server/connector/oauth';

export const GET: RequestHandler = ({ url }) =>
	json(200, authorizationServerMetadata(url.origin), { 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=300' });
