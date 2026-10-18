/**
 * The connector's shared types: who it acts as, what it stores, and the one
 * interface (`ConnectorBackend`) every route and tool reaches Supabase
 * through. See docs/connector/DESIGN.md.
 */

export type Level = 'read' | 'undo' | 'confirm';

export interface ConnectorUser {
	id: string;
	email: string;
}

export interface ClientRecord {
	clientId: string;
	clientName: string;
	redirectUris: string[];
}

export interface StoredCode {
	codeHash: string;
	userId: string;
	email: string;
	clientId: string;
	clientName: string;
	redirectUri: string;
	codeChallenge: string;
	scope: string;
	expiresAt: number;
}

export interface TokenRow {
	id: string;
	userId: string;
	email: string;
	clientId: string;
	label: string;
	scope: string;
	accessExpiresAt: number;
	refreshExpiresAt: number;
	revokedAt: number | null;
	lastUsedAt: number | null;
}

export interface NewToken {
	userId: string;
	email: string;
	clientId: string;
	label: string;
	scope: string;
	accessHash: string;
	refreshHash: string;
	accessExpiresAt: number;
	refreshExpiresAt: number;
}

export interface Rotation {
	accessHash: string;
	refreshHash: string;
	accessExpiresAt: number;
	refreshExpiresAt: number;
}

export interface Confirmation {
	tokenHash: string;
	userId: string;
	tool: string;
	argsHash: string;
	preview: unknown;
	expiresAt: number;
}

export interface UndoCall {
	function: string;
	args: Record<string, unknown>;
}

export interface AuditRow {
	id: string;
	userId: string;
	tool: string;
	functionName: string;
	args: Record<string, unknown>;
	result: unknown;
	rowsWritten: unknown[];
	undo: UndoCall | null;
	undoOf: string | null;
	undoneBy: string | null;
	groupKey: string | null;
	status: 'running' | 'done' | 'failed';
	startedAt: number;
}

export interface UserSession {
	accessToken: string;
	expiresAt: number;
	user: ConnectorUser;
}

export interface DbError {
	code?: string;
	message: string;
	details?: string | null;
	hint?: string | null;
}

export type DbResult<T> = { data: T; error: null } | { data: null; error: DbError };

export type Scalar = string | number | boolean | null;

/** A narrow read: one table, plain columns, conjunctive filters. RLS decides the rows. */
export interface SelectSpec {
	table: string;
	columns: string[];
	eq?: Record<string, Scalar>;
	in?: Record<string, Scalar[]>;
	gte?: Record<string, string | number>;
	lte?: Record<string, string | number>;
	order?: Array<[string, 'asc' | 'desc']>;
	limit?: number;
	offset?: number;
}

/** A refusal the backend could not even ask (unset key, unreachable), never a database refusal. */
export class ConnectorUnavailable extends Error {}

export interface ConnectorBackend {
	readonly kind: 'supabase' | 'local-pg';

	// THE SERVICE-ROLE HALF: the connector_* tables, which no client role may
	// touch, and minting a session. Nothing else.
	enabled(): Promise<boolean>;
	findClient(clientId: string): Promise<ClientRecord | null>;
	registerClient(client: ClientRecord): Promise<void>;
	storeCode(code: StoredCode): Promise<void>;
	/** Marks the code used in one statement; null when it was missing or already used. */
	takeCode(codeHash: string, now: number): Promise<StoredCode | null>;
	createToken(token: NewToken): Promise<string>;
	tokenByAccess(accessHash: string): Promise<TokenRow | null>;
	/** Rotates both tokens on the row holding `refreshHash`, in one statement; null for a dead token. */
	rotate(refreshHash: string, next: Rotation, now: number): Promise<TokenRow | null>;
	/** Revokes the row an access or refresh token belongs to; false when none matched. */
	revokeByHash(hash: string, by: string): Promise<boolean>;
	revokeToken(id: string, by: string): Promise<void>;
	touchToken(id: string, now: number): Promise<void>;
	storeConfirmation(confirmation: Confirmation): Promise<void>;
	/** Marks the confirmation used in one statement; null when missing, used or expired. */
	takeConfirmation(tokenHash: string, now: number): Promise<Confirmation | null>;
	syncRegistry(rows: Array<{ function_name: string; tool: string; level: Level }>): Promise<void>;
	setAuditUndo(auditId: string, undo: UndoCall | null): Promise<void>;
	/** The caller's newest finished connector writes that are not undone, newest first. */
	undoCandidates(userId: string, limit: number): Promise<AuditRow[]>;
	mintSession(user: ConnectorUser): Promise<UserSession>;

	// THE USER HALF: everything else, as the minted user, so every gate and
	// policy sees that user and nobody else.
	rpc<T = unknown>(session: UserSession, fn: string, args: Record<string, unknown>): Promise<DbResult<T>>;
	select<T = Record<string, unknown>>(session: UserSession, spec: SelectSpec): Promise<DbResult<T[]>>;
}
