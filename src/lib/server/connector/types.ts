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
	/** One reverse call, or several (an `each` undo). */
	undo: UndoCall | UndoCall[] | null;
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

/**
 * ONE FILE SENT FROM A CHAT (ledger 0422, gap d782fd4e): a one-time slot the
 * connector hands out with a signed address, the bytes PUT straight to the
 * private bucket there, then read by the tool that uses them.
 */
export interface UploadSlot {
	id: string;
	userId: string;
	filename: string;
	contentType: string | null;
	maxBytes: number;
	sizeBytes: number | null;
	expiresAt: number;
	uploadedAt: number | null;
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
	/** Upserts the registry rows, and inserts any log table not listed yet (never removes one). */
	syncRegistry(rows: Array<{ function_name: string; tool: string; level: Level }>, logTables?: readonly string[]): Promise<void>;
	setAuditUndo(auditId: string, undo: UndoCall | UndoCall[] | null): Promise<void>;
	/** The caller's newest finished connector writes that are not undone, newest first. */
	undoCandidates(userId: string, limit: number): Promise<AuditRow[]>;
	mintSession(user: ConnectorUser): Promise<UserSession>;
	/**
	 * A one-time upload slot for this user (connector_uploads, 0290), and a
	 * signed address the bytes are PUT to, straight into the private bucket, so
	 * a file far larger than a request body reaches the site.
	 */
	createUpload(slot: { userId: string; tokenHash: string; filename: string; contentType: string | null; maxBytes: number; expiresAt: number }): Promise<{ id: string; uploadUrl: string }>;
	/**
	 * One numbered piece of a slot's bytes, for a chat that cannot PUT a file:
	 * the pieces are joined in order when the bytes are read. Refuses (false) a
	 * slot that is not this user's, has expired, or would pass its size.
	 */
	storeUploadPart(userId: string, id: string, index: number, bytes: Uint8Array): Promise<{ ok: boolean; message?: string; received?: number }>;
	/**
	 * THE NIGHTLY REPLAY'S HALF (ledger 0422): every live saved request, when
	 * the replay last ran, and whose account a run is recorded under (the
	 * admin who connected most recently); and the rows a replay writes.
	 */
	replayState(): Promise<{ evals: Array<{ id: string; seq: number; said: string; level: string; expected_path: string[] }>; lastReplayAt: number | null; recordAs: string | null }>;
	recordReplay(rows: Array<{ evalId: string; userId: string; passed: boolean; path: string[]; detail: Record<string, unknown> }>): Promise<void>;
	/** A slot's bytes, for its own user only, once they have arrived; null when there are none yet. */
	readUpload(userId: string, id: string): Promise<{ slot: UploadSlot; bytes: Uint8Array } | null>;

	// THE USER HALF: everything else, as the minted user, so every gate and
	// policy sees that user and nobody else.
	rpc<T = unknown>(session: UserSession, fn: string, args: Record<string, unknown>): Promise<DbResult<T>>;
	/**
	 * A client a site route's handler can be handed as `locals.supabase`, carrying
	 * THIS user's session (src/lib/server/connector/endpoints.ts). On Supabase it
	 * is a real client; on the local backend it answers `rpc` only, which is all
	 * the endpoint entries' handlers call before their storage step.
	 */
	routeClient(session: UserSession): unknown;
	/**
	 * A short-lived signed link to one stored file, signed AS THIS USER, so the
	 * bucket's own read policy decides (the feedback console's screenshot link,
	 * ledger 0416). The local backend has no storage and says so.
	 */
	signStorage(session: UserSession, bucket: string, path: string, seconds: number): Promise<DbResult<string>>;
	select<T = Record<string, unknown>>(session: UserSession, spec: SelectSpec): Promise<DbResult<T[]>>;
}
