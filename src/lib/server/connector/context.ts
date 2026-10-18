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
}
