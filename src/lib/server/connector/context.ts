/** What every tool call carries: who it acts as, how to reach the database, and a clock. */
import type { ConnectorBackend, TokenRow, UserSession } from './types';

export interface ToolContext {
	backend: ConnectorBackend;
	session: UserSession;
	/** The connection the request came in on; null when a test drives a tool directly. */
	token: TokenRow | null;
	now(): number;
	random(n: number): Buffer;
	/** Per-request memo of reads (his classes, rosters, posts). */
	cache: Map<string, unknown>;
	/**
	 * PRACTICE (/mcp/practice): fixed by the URL, never by an argument. Every
	 * write previews, nothing commits, and no request, gap or confirmation is
	 * stored; reads run for real.
	 */
	practice?: boolean;
	/** After a delete commits: remove the files it orphaned, as the site's own route does (cleanup.ts). */
	cleanup?: (kind: string, result: unknown) => Promise<void>;
	/** The model name, when the client sends one. */
	model?: string | null;
	/** His request in his own words, for this tool call (set by runTool). */
	said?: string | null;
}
