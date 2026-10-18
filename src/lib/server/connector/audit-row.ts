/** One connector_audit row as the server reads it, whichever backend read it. */
import type { AuditRow } from './types';

export function auditRowFromDb(r: Record<string, unknown>): AuditRow {
	return {
		id: r.id as string,
		userId: r.user_id as string,
		tool: r.tool as string,
		functionName: r.function_name as string,
		args: (r.args as Record<string, unknown>) ?? {},
		result: r.result ?? null,
		rowsWritten: (r.rows_written as unknown[]) ?? [],
		undo: (r.undo as AuditRow['undo']) ?? null,
		undoOf: (r.undo_of as string | null) ?? null,
		undoneBy: (r.undone_by as string | null) ?? null,
		groupKey: (r.group_key as string | null) ?? null,
		status: r.status as AuditRow['status'],
		startedAt: new Date(r.started_at as string).getTime()
	};
}
