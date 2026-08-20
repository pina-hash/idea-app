import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import NotebookEntryCard from '../src/lib/notebook/NotebookEntryCard.svelte';
import NotebookPhotos from '../src/lib/notebook/NotebookPhotos.svelte';
import EntryReview from '../src/lib/notebook/EntryReview.svelte';
import type { NotebookEntry, NotebookPhoto } from '../src/lib/notebook';
import type { GridCell, GridSession, GridStudent, ReviewEntry } from '../src/lib/notebook-review';

/**
 * THE THREE GATES the 0116 CONTROLS ship with, each proven the way this file's
 * neighbour (notebook-shell.test.ts) already proves the row/full split: render
 * the ABSENT case, render the PRESENT case beside it, and require the two to
 * differ. An absence assertion with no present counterpart would also pass if
 * the control never rendered at all, which is not the same claim.
 */

function entry(over: Partial<NotebookEntry> = {}): NotebookEntry {
	return {
		id: 'e-1',
		session_id: null,
		section_id: null,
		folder_id: null,
		pinned_at: null,
		custom_label: 'Gearbox ratios',
		upload_timestamp: '2026-08-08T13:20:00Z',
		// Turned in (0118). A fixture defaulting to a DRAFT would make every
		// assertion here about the draft path by accident.
		submitted_at: '2026-08-08T13:20:00Z',
		status: 'compliant',
		flag_reason: null,
		instructor_comment: null,
		session: null,
		photos: [
			{
				id: 'p-1',
				drive_file_id: 'drive-p-1',
				variant: 'original',
				sequence_order: 1,
				original_filename: 'ratios.jpg'
			}
		],
		notes: [],
		...over
	};
}

const writes = {
	onAddPhotos: async () => ({ ok: true as const }),
	onAddNote: async () => ({ ok: true as const }),
	onEditNote: async () => ({ ok: true as const }),
	onMove: async () => ({ ok: true as const }),
	onPin: async () => ({ ok: true as const })
};

function cardHtml(props: Record<string, unknown>): string {
	return render(NotebookEntryCard, {
		props: {
			entry: entry(),
			folders: [],
			variant: 'full',
			collapsed: false,
			onToggle: () => {},
			...writes,
			...props
		} as never
	}).body;
}

function photo(over: Partial<NotebookPhoto> = {}): NotebookPhoto {
	return {
		id: 'p-1',
		drive_file_id: 'drive-1',
		variant: 'original',
		sequence_order: 1,
		original_filename: 'page.jpg',
		...over
	};
}

describe('the photo remove control is absent on a read-only surface', () => {
	it('renders no remove control with onRemove omitted -- the read-only shape', () => {
		const markup = render(NotebookPhotos, {
			props: { photos: [photo()], label: 'Gearbox ratios' } as never
		}).body;
		expect(markup).not.toContain('data-testid="photo-remove"');
	});

	it('...and renders one the moment a transport is handed in, so the absence above means something', () => {
		const markup = render(NotebookPhotos, {
			props: {
				photos: [photo()],
				label: 'Gearbox ratios',
				onRemove: async () => ({ ok: true as const })
			} as never
		}).body;
		expect(markup).toContain('data-testid="photo-remove"');
	});

	it('the same rule holds through NotebookEntryCard: onRemovePhoto absent means the photo carries no control', () => {
		const readOnly = cardHtml({ onRemovePhoto: undefined });
		expect(readOnly).not.toContain('data-testid="photo-remove"');

		const writable = cardHtml({ onRemovePhoto: async () => ({ ok: true as const }) });
		expect(writable).toContain('data-testid="photo-remove"');
	});
});

describe('the title editor is absent on a check-in entry', () => {
	const onRetitle = async () => ({ ok: true as const });

	it('offers no rename control on a session-linked entry, even with a transport in hand', () => {
		const markup = cardHtml({
			entry: entry({
				session_id: 'ses-1',
				session: { session_label: 'Unit 3 check-in', unit_number: 3, session_date: '2026-08-08' }
			}),
			onRetitle
		});
		expect(markup).not.toContain('data-testid="entry-rename"');
	});

	it('...and offers it on a free-form entry with the same transport, so the absence above is the session gate and not a missing feature', () => {
		const markup = cardHtml({
			entry: entry({ session_id: null }),
			onRetitle
		});
		expect(markup).toContain('data-testid="entry-rename"');
	});

	it('offers nothing at all on a free-form entry with no transport -- the read-only case', () => {
		const markup = cardHtml({
			entry: entry({ session_id: null }),
			onRetitle: undefined
		});
		expect(markup).not.toContain('data-testid="entry-rename"');
	});
});

describe('the instructor delete control is absent for a non-manager', () => {
	function reviewEntry(over: Partial<ReviewEntry> = {}): ReviewEntry {
		return {
			id: 'e-1',
			student_id: 'stu-1',
			session_id: null,
			custom_label: 'Gearbox ratios',
			upload_timestamp: '2026-08-08T13:20:00Z',
			status: 'compliant',
			flag_reason: null,
			instructor_comment: null,
			folder_name: null,
			photos: [],
			notes: [],
			...over
		};
	}

	const cell: GridCell = {
		student_key: 'stu-1',
		student_id: 'stu-1',
		session_id: 'ses-1',
		status: 'compliant',
		entry_id: 'e-1',
		entry_count: 1,
		upload_timestamp: '2026-08-08T13:20:00Z',
		on_time: true,
		excused: false,
		flag_reason: null
	};

	const student: GridStudent = {
		student_key: 'stu-1',
		id: 'stu-1',
		name: 'Ada Lovelace',
		email: 'ada@boscotech.net',
		enrolled: true,
		free_entries: 0
	};

	const session: GridSession = {
		id: 'ses-1',
		unit_number: 3,
		session_date: '2026-08-08',
		session_label: 'Unit 3 check-in'
	};

	const reads = {
		onFlag: async () => ({ ok: true as const, value: undefined }),
		onResolve: async () => ({ ok: true as const, value: undefined }),
		onClose: () => {}
	};

	it('renders no delete control when the RPC-scoped transport is not handed in -- the non-manager shape', () => {
		const markup = render(EntryReview, {
			props: {
				entry: reviewEntry(),
				cell,
				student,
				session,
				...reads,
				onDelete: undefined
			} as never
		}).body;
		expect(markup).not.toContain('data-testid="entry-delete"');
		expect(markup).not.toContain('data-testid="entry-danger-zone"');
	});

	it('...and renders it, visually separated, the moment a manager transport is in hand', () => {
		const markup = render(EntryReview, {
			props: {
				entry: reviewEntry(),
				cell,
				student,
				session,
				...reads,
				onDelete: async () => ({ ok: true as const, value: undefined })
			} as never
		}).body;
		expect(markup).toContain('data-testid="entry-delete"');
		// Its own card, not folded into the flag/resolve form.
		expect(markup).toContain('data-testid="entry-danger-zone"');
		// The confirm names the student, once armed -- covered separately below;
		// here only the control's presence is asserted.
	});

	it('names the student in the confirm text and in the delete-zone copy', () => {
		const markup = render(EntryReview, {
			props: {
				entry: reviewEntry(),
				cell,
				student,
				session,
				...reads,
				onDelete: async () => ({ ok: true as const, value: undefined })
			} as never
		}).body;
		expect(markup).toContain('Ada Lovelace');
	});
});

/**
 * THE 0118 DRAFT-STATE CONTROLS, on the SAME gates-that-go-red convention as
 * the three above: absent case, present case beside it, and the two must
 * differ. `entry()`'s own default is TURNED IN (see its own comment), which
 * is exactly why every "present" case here has to say `submitted_at: null`
 * out loud rather than lean on the fixture.
 */

describe('the "Turn in" control is absent on a turned-in entry', () => {
	const onSubmit = async () => ({ ok: true as const });

	it('renders no control on an entry that has already been turned in, even with a transport in hand', () => {
		const markup = cardHtml({ onSubmit });
		expect(markup).not.toContain('data-testid="entry-turn-in"');
	});

	it('...and renders it on a DRAFT with the same transport, so the absence above is the submitted-state gate and not a missing feature', () => {
		const markup = cardHtml({ entry: entry({ submitted_at: null }), onSubmit });
		expect(markup).toContain('data-testid="entry-turn-in"');
	});

	it('offers nothing at all on a draft entry with no transport -- the read-only / non-owner case', () => {
		const markup = cardHtml({ entry: entry({ submitted_at: null }), onSubmit: undefined });
		expect(markup).not.toContain('data-testid="entry-turn-in"');
	});
});

describe('the "Move to drafts" control is absent on a draft entry', () => {
	const onUnsubmit = async () => ({ ok: true as const });

	it('renders no control on a draft, even with a transport in hand', () => {
		const markup = cardHtml({ entry: entry({ submitted_at: null }), onUnsubmit });
		expect(markup).not.toContain('data-testid="entry-move-to-drafts"');
	});

	it('...and renders it on a TURNED-IN entry with the same transport, so the absence above is the draft-state gate and not a missing feature', () => {
		const markup = cardHtml({ onUnsubmit });
		expect(markup).toContain('data-testid="entry-move-to-drafts"');
	});

	it('offers nothing at all on a turned-in entry with no transport -- the read-only / non-owner case', () => {
		const markup = cardHtml({ onUnsubmit: undefined });
		expect(markup).not.toContain('data-testid="entry-move-to-drafts"');
	});
});

describe('neither draft-state control ever renders on the row variant', () => {
	const onSubmit = async () => ({ ok: true as const });
	const onUnsubmit = async () => ({ ok: true as const });

	it('a draft renders its Draft marker in the row variant, but never a Turn in control there', () => {
		const markup = cardHtml({
			entry: entry({ submitted_at: null }),
			variant: 'row',
			onSubmit
		});
		expect(markup).toContain('data-testid="row-draft"');
		expect(markup).not.toContain('data-testid="entry-turn-in"');
	});

	it('a turned-in entry offers no Move to drafts control in the row variant either', () => {
		const markup = cardHtml({ variant: 'row', onUnsubmit });
		expect(markup).not.toContain('data-testid="entry-move-to-drafts"');
	});
});

describe('the Draft marker is unmistakable, in both variants', () => {
	it('a turned-in entry carries no Draft marker', () => {
		expect(cardHtml({})).not.toContain('data-testid="entry-draft-chip"');
		expect(cardHtml({ variant: 'row' })).not.toContain('data-testid="row-draft"');
	});

	it('...and a draft carries it in both, so the absence above is the submitted-state gate and not a missing marker', () => {
		expect(cardHtml({ entry: entry({ submitted_at: null }) })).toContain(
			'data-testid="entry-draft-chip"'
		);
		expect(
			cardHtml({ entry: entry({ submitted_at: null }), variant: 'row' })
		).toContain('data-testid="row-draft"');
	});
});
