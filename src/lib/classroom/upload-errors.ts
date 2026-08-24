/**
 * WHAT WENT WRONG WITH ONE FILE, NAMED.
 *
 * Pure, client-safe, no Svelte and no Supabase -- imported by the sign routes
 * (which see a storage-js error) and by the browser uploader (which sees an
 * XHR status), so the two cannot end up describing the same refusal in two
 * different sets of words.
 *
 * THE RULE THIS EXISTS FOR: "Upload failed" is never the whole message. Three
 * things go wrong on this path and they need three different actions from the
 * person reading:
 *
 *   too_large   -- nothing will ever make this file fit. Say the size AND the
 *                  cap, because "too large" without a number is a guessing game.
 *   expired     -- the signed URL outlived its window. The file is fine, the
 *                  LINK is stale, and retrying mints a new one. This is the one
 *                  a reader will otherwise interpret as "my file is broken".
 *   denied      -- the database said no. Something about the caller's rights or
 *                  the row's state changed (an item unposted, an assignment
 *                  submitted mid-upload), and retrying will not help until that
 *                  changes.
 *
 * Anything else keeps the server's own sentence rather than being flattened
 * into one of these -- a message we did not anticipate is more useful verbatim
 * than paraphrased.
 */

export type UploadGate =
	| 'too_large'
	| 'expired'
	| 'denied'
	| 'not_configured'
	| 'network'
	| 'server';

export interface UploadRefusal {
	gate: UploadGate;
	/** Rendered verbatim. Already a complete sentence, already specific. */
	message: string;
	/** True when saving again is worth trying with the SAME file. */
	retryable: boolean;
}

/** Which side of the classroom is uploading. Only the wording differs. */
export type UploadRole = 'attachment' | 'submission';

export function formatBytesShort(size: number): string {
	if (size < 1024) return `${size} B`;
	if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
	return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** The cap, said the way a person would say it. */
export function formatCap(maxBytes: number): string {
	return `${Math.round(maxBytes / 1024 / 1024)} MB`;
}

export function tooLarge(sizeBytes: number, maxBytes: number): UploadRefusal {
	return {
		gate: 'too_large',
		message:
			`That file is ${formatBytesShort(sizeBytes)}, and the limit is ${formatCap(maxBytes)}. ` +
			'Nothing about retrying will change that -- split it, zip it, or link to it instead.',
		retryable: false
	};
}

const DENIED_REASON: Record<UploadRole, string> = {
	attachment:
		'Storage refused this file because of who is asking. You have to be the teacher of ' +
		'record for every class this item is posted to. If somebody unposted it, or added a ' +
		'class you do not teach, that is what changed.',
	submission:
		'Storage refused this file because of who is asking. It can only go on your own ' +
		'submission, and only while that submission is still open -- if it was turned in ' +
		'while this was uploading, unsubmit and try again.'
};

/**
 * Turn a status code and whatever detail came with it into one of the three
 * named gates.
 *
 * KEYED ON THE STATUS FIRST, TEXT SECOND. Storage's messages are not a
 * contract and have changed shape before; the status codes have not. The text
 * match is a second chance, not the primary signal.
 */
export function classifyUploadError(args: {
	status: number;
	detail?: string | null;
	role: UploadRole;
	sizeBytes?: number;
	maxBytes: number;
}): UploadRefusal {
	const detail = (args.detail ?? '').trim();
	const lower = detail.toLowerCase();

	if (args.status === 413 || lower.includes('maximum allowed size') || lower.includes('payload too large')) {
		return args.sizeBytes != null
			? tooLarge(args.sizeBytes, args.maxBytes)
			: {
					gate: 'too_large',
					message: `Storage refused this file for size. The limit is ${formatCap(args.maxBytes)}.`,
					retryable: false
				};
	}

	// AN EXPIRED SIGNED URL IS A 400 WITH A JWT COMPLAINT, not a 401 -- the
	// token is in the query string and storage-api answers "invalid signature"
	// / "jwt expired" rather than challenging for credentials.
	if (
		lower.includes('expired') ||
		lower.includes('invalid signature') ||
		lower.includes('invalid jwt') ||
		lower.includes('jwt')
	) {
		return {
			gate: 'expired',
			message:
				'The upload link for this file ran out before the bytes finished, so nothing was ' +
				'stored. The file itself is fine and is still here -- save again and it gets a ' +
				'fresh link.',
			retryable: true
		};
	}

	if (
		args.status === 401 ||
		args.status === 403 ||
		lower.includes('row-level security') ||
		lower.includes('violates row-level') ||
		lower.includes('unauthorized')
	) {
		return { gate: 'denied', message: DENIED_REASON[args.role], retryable: false };
	}

	if (args.status === 404 || lower.includes('bucket not found')) {
		return {
			gate: 'not_configured',
			message:
				'File storage is not set up on this deployment: the bucket this file belongs in ' +
				'does not exist. An admin has to apply the pending migration.',
			retryable: false
		};
	}

	if (args.status === 0) {
		return {
			gate: 'network',
			message:
				'The connection dropped part way through this file. It is still here -- save again ' +
				'to send it.',
			retryable: true
		};
	}

	return {
		gate: 'server',
		// Verbatim, with the status, so an unanticipated refusal is still
		// actionable and still pasteable.
		message: detail ? `${detail} (HTTP ${args.status})` : `Storage answered HTTP ${args.status}.`,
		retryable: args.status >= 500
	};
}

/**
 * A DELIBERATE REFUSAL AND A TRANSIENT CONFLICT ARE DIFFERENT OUTCOMES, and
 * only one of them should offer Retry. This is the write-RPC half of
 * `classifyUploadError` -- same rule, different vocabulary of failure.
 *
 * FOUND IN A BROWSER, NOT BY READING. Nine files picked at once became nine
 * concurrent `classroom_open_submission` calls, each of which reads the
 * caller's submission row and inserts one if it is missing. Under READ
 * COMMITTED several read null, several insert, and the losers came back with
 * `duplicate key value violates unique constraint
 * classroom_submissions_item_id_student_email_key` -- a raw SQLSTATE 23505 that
 * the route was flattening into `gate: 'denied', retryable: false`, so the two
 * files that lost the race sat there with a database error on screen and NO
 * Retry offered. Measured: 7 of 9 landed, 2 stranded.
 *
 * 0134 fixes the race itself. This exists because the race was only the loudest
 * transient there is: a serialization failure, a deadlock and a lock timeout all
 * read as "refused" to a caller that treats every RPC error the same way, and
 * every one of them is worth exactly one more attempt.
 *
 * THE LIST IS A WHITELIST, ON PURPOSE. Almost every raise on this path IS a
 * considered refusal -- not enrolled, not the teacher of record, already turned
 * in -- and retrying those is how a UI ends up asking the same question five
 * times. Only a named transient is retryable; everything else keeps the
 * server's own sentence and does not offer Retry.
 */
const TRANSIENT_SQLSTATES = new Set([
	'23505', // unique_violation      -- two writers raced an upsert
	'40001', // serialization_failure
	'40P01', // deadlock_detected
	'55P03', // lock_not_available
	'57014', // query_canceled (statement timeout)
	'53300' // too_many_connections
]);

export function classifyRpcError(args: {
	code?: string | null;
	message?: string | null;
	role: UploadRole;
}): UploadRefusal {
	const code = (args.code ?? '').trim();
	const message = (args.message ?? '').trim();

	if (TRANSIENT_SQLSTATES.has(code)) {
		return {
			gate: 'server',
			message:
				'Two of your files reached the server at the same moment and one of them lost the ' +
				'race, so nothing was written for it. Nothing is lost -- try it again.',
			retryable: true
		};
	}

	if (code === '42501' || /permission denied|row-level security/i.test(message)) {
		return { gate: 'denied', message: DENIED_REASON[args.role], retryable: false };
	}

	// A considered refusal. Its own sentence, verbatim -- these are written for
	// the person reading them ("Only a student enrolled in this class can work
	// on this assignment.") and paraphrasing them loses the only useful part.
	return {
		gate: 'denied',
		message: message || 'That file was refused.',
		retryable: false
	};
}
