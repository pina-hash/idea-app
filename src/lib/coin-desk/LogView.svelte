<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import ClassSplit from '$lib/shell/ClassSplit.svelte';
	import CoinTransactionRows from '$lib/coin-balance/CoinTransactionRows.svelte';
	import { coins, COIN_SYMBOL, signedCoins } from '$lib/coin-format';
	import DebtPaymentPanel from './DebtPaymentPanel.svelte';
	import {
		balanceFor,
		coinDefaultMedium,
		coinLogMode,
		effectiveMedium,
		EXTRA_CREDIT_GRADING_CATEGORIES,
		FORCED_MEDIUM,
		KIND_LABELS,
		MEDIA,
		MEDIUM_HINTS,
		MEDIUM_LABELS,
		payRaisePreview,
		perfectScorePreview,
		priceHint,
		propertyDamagePreview,
		sanitizeSearchTerm,
		studentLabel,
		threeDPrintingPreview,
		weeklyWagePreview,
		WEEKLY_WAGE_CATEGORY_ID,
		type CoinCategory,
		type CoinDeskPrefs,
		type CoinLogMode,
		type CoinMedium,
		type StudentSuggestion
	} from '$lib/coin-desk';
	import {
		isBulkEligible,
		sectionDisplayName,
		type BulkLogResponse,
		type CoinSectionRow,
		type CoinSectionStudentRow
	} from './sections';

	/**
	 * THE LOGGING SURFACE, rebuilt around one constraint: LOGGING A TRANSACTION
	 * MUST REQUIRE NO SCROLLING AT ALL at a working desktop size.
	 *
	 * What it replaced was three stacked cards -- find a student, then the
	 * student's whole summary (balance, split, wage tier, Eating Pass and up to
	 * 25 recent transactions), then the entry form -- so the summary sat
	 * BETWEEN the search box and the thing you came here to do, and the form
	 * was reliably below the fold. The cards were a plain vertical stack with
	 * no viewport arithmetic anywhere, so "below the fold" was not tuned, it
	 * was unconsidered.
	 *
	 * THE SHELL IS THE SHARED ONE ($lib/shell/ClassSplit + split.css), not a
	 * fourth split: navigation on the left (search + roster), the work surface
	 * on the right (the strip, the form). Three of its four knobs are set
	 * deliberately and are worth reading:
	 *
	 *   scroll="page" -- THE DOCUMENT OWNS THE SCROLL, and the panes bound
	 *   nothing. The alternative, `panes`, sizes each pane at
	 *   `100vh - --cr-chrome-h`, which is right when the split IS the page (the
	 *   classroom: a breadcrumb above, nothing below). The coin desk has a
	 *   masthead, a hero, a sub-nav AND a version footer, and split.css's own
	 *   header explains at length why that arithmetic cannot be fixed by tuning
	 *   the constant. It would also be the wrong tool here even if it fitted:
	 *   a pane that clips its overflow SATISFIES a no-scroll measurement by
	 *   hiding the form, which is the opposite of the requirement. Under
	 *   `page` the guarantee comes from the content genuinely fitting, which is
	 *   what "no scrolling at all" actually means.
	 *
	 *   navWidth="wide" -- the roster is A TABLE YOU SCAN, which is the exact
	 *   case split.css documents this variant for, and it is also what makes
	 *   the no-scroll rule hold against a real class: a wide pane lays the
	 *   roster out in columns, so forty students are forty names on screen
	 *   rather than forty rows to scroll past. The entry form is a narrow
	 *   stack of labelled inputs and is comfortable in the 27rem detail pane
	 *   (the same width the notebook's review console gives its entry panel).
	 *
	 *   narrow="stack" -- below 1024px both panes render in one column, form
	 *   first. The no-scroll rule is a DESKTOP rule; a phone gets a sensible
	 *   stacked layout and is not contorted to meet it.
	 *
	 * WHAT MOVED, AND WHAT DID NOT. The student summary is one compressed strip
	 * and the recent transactions are behind a disclosure that is CLOSED by
	 * default, so neither is ever in the path of logging. Every per-pricing-
	 * model field block below is the one that shipped before, unchanged --
	 * only the picking changed.
	 */
	let {
		categories,
		supabase,
		configured = true,
		sections = [],
		sectionsConfigured = true,
		prefs = {},
		onPrefs
	}: {
		categories: CoinCategory[];
		supabase: SupabaseClient;
		configured?: boolean;
		sections?: CoinSectionRow[];
		sectionsConfigured?: boolean;
		/** `profiles.preferences.coinDesk`, already parsed. See coin-desk.ts. */
		prefs?: CoinDeskPrefs;
		/**
		 * Persist a changed preference. INJECTED rather than written here, so
		 * this component never touches `profiles` and the dev harness can mount
		 * it with an in-memory store. The route's implementation is the
		 * whole-blob spread-merge every other namespace uses.
		 */
		onPrefs?: (next: CoinDeskPrefs) => void;
	} = $props();

	// The load already filters to loggable categories; this is the active-only
	// subset every picker below offers (a retired category stays readable in
	// history but can never be logged again).
	const selectableCategories = $derived(categories.filter((c) => c.active !== false));

	/**
	 * category id -> kind, for the history rows. Built from the list this view
	 * ALREADY loads rather than fetched again, so what a row is called and what
	 * it is styled as come from the same place. Retired categories are included
	 * on purpose: a student's history keeps rows logged under one, and a
	 * correction must still read as a correction after its category is retired.
	 */
	const categoryKinds = $derived(
		Object.fromEntries(categories.map((c) => [c.id, c.kind])) as Record<string, string>
	);

	// ---------------------------------------------------------------------
	// Student lookup (coin_admin_lookup -- the same RPC the balance tool on
	// /coin-desk/students uses, returning balance, wage tier, Eating Pass
	// status and recent history in one round trip)
	// ---------------------------------------------------------------------
	interface CoinTxn {
		id: string;
		category_id: string;
		category_name: string;
		amount: number;
		medium: CoinMedium;
		/**
		 * Set on BOTH halves of a payout (0096). Declared here because it is
		 * what CoinTransactionRows pairs on -- the RPC has always returned it
		 * and this type simply ignored it, so a withdrawal rendered as two
		 * unrelated rows with opposite signs.
		 */
		transfer_id: string | null;
		quantity: number | null;
		note: string | null;
		actor_email: string;
		created_at: string;
	}
	interface CoinLookup {
		email: string;
		/** The TOTAL. The two media below decompose it and always sum to it. */
		balance: number;
		physical_balance: number;
		digital_balance: number;
		wage_tier: number;
		eating_pass_active: boolean;
		eating_pass_strikes: number;
		recent_transactions: CoinTxn[];
	}

	let query = $state('');
	let lookupBusy = $state(false);
	let lookupError = $state('');
	let lookup = $state<CoinLookup | null>(null);

	let searchEl = $state<HTMLInputElement | null>(null);
	let categoryEl = $state<HTMLInputElement | null>(null);
	let submitEl = $state<HTMLButtonElement | null>(null);

	/**
	 * `refresh` distinguishes a user-initiated lookup (a fresh search, which
	 * should clear any leftover entry-form feedback from a previous student)
	 * from the silent re-lookup submitEntry() runs on ITS OWN student right
	 * after a successful write. That refresh must NOT clear entryNotice --
	 * it would wipe the success message the instant it appears, which is
	 * exactly what happened before this was a parameter (found in browser
	 * verification: the balance/history updated correctly but the "Logged…"
	 * confirmation flashed and vanished on the same tick).
	 */
	async function runLookup(email: string, refresh = false) {
		const target = email.trim().toLowerCase();
		if (!target) return;
		lookupError = '';
		if (!refresh) entryNotice = '';
		lookupBusy = true;
		const resp = await supabase.rpc('coin_admin_lookup', { p_email: target });
		lookupBusy = false;
		if (resp.error) {
			lookupError = resp.error.message;
			lookup = null;
			return;
		}
		lookup = resp.data as CoinLookup;
	}

	// ---------------------------------------------------------------------
	// The roster: which students the nav pane lists.
	//
	// ONE SECTION SELECTOR SERVES BOTH JOBS -- whose roster is on screen, and
	// which section a Section-mode run targets. They were never two questions.
	// ---------------------------------------------------------------------
	let selectedSectionId = $state('');
	let roster = $state<CoinSectionStudentRow[]>([]);
	let rosterBusy = $state(false);

	async function loadRoster(sectionId: string) {
		roster = [];
		mediumOverrides = {};
		picked.clear();
		if (!sectionId) return;
		rosterBusy = true;
		const resp = await supabase.rpc('coin_admin_list_section_students', {
			p_section_id: sectionId
		});
		rosterBusy = false;
		if (resp.error) return;
		roster = (resp.data ?? []) as CoinSectionStudentRow[];
	}

	function rosterLabel(r: CoinSectionStudentRow): string {
		return r.display_name || r.full_name || r.student_email;
	}

	/**
	 * The roster, filtered by whatever is in the search box. Name OR email, so
	 * typing a surname and typing the address both work -- the operator does
	 * not have to know which one the row is labelled with.
	 */
	const filteredRoster = $derived.by(() => {
		const term = query.trim().toLowerCase();
		if (!term) return roster;
		return roster.filter(
			(r) =>
				r.student_email.toLowerCase().includes(term) ||
				rosterLabel(r).toLowerCase().includes(term)
		);
	});

	// ---------------------------------------------------------------------
	// Name-based typeahead, degrading gracefully to plain email entry --
	// profiles rows only exist for students who have actually signed in, so
	// this is a shortcut when it finds someone, never a requirement to find
	// them: a plain email always works regardless of matches.
	//
	// IT SEARCHES BEYOND THE ROSTER ON PURPOSE. A balance can exist for an
	// email that has never signed in and is on nobody's section, and losing
	// that would be losing the doctrine the whole tool is built on.
	// ---------------------------------------------------------------------
	let suggestions = $state<StudentSuggestion[]>([]);
	let searching = $state(false);
	let searchToken = 0;
	let debounceHandle: ReturnType<typeof setTimeout> | undefined;

	function onQueryInput() {
		clearTimeout(debounceHandle);
		const term = sanitizeSearchTerm(query);
		if (term.length < 2) {
			suggestions = [];
			searching = false;
			return;
		}
		searching = true;
		debounceHandle = setTimeout(() => runSearch(term), 250);
	}

	async function runSearch(term: string) {
		const token = ++searchToken;
		const res = await supabase
			.from('profiles')
			.select('id, email, full_name, display_name')
			.eq('role', 'student')
			.or(`display_name.ilike.%${term}%,full_name.ilike.%${term}%,email.ilike.%${term}%`)
			.order('display_name', { ascending: true, nullsFirst: false })
			.limit(8);
		if (token !== searchToken) return; // a newer keystroke already fired
		searching = false;
		suggestions = (res.data ?? []) as StudentSuggestion[];
	}

	/** Suggestions that are not already on the roster shown above them. */
	const offRosterSuggestions = $derived.by(() => {
		if (query.trim().length < 2) return [];
		const on = new Set(roster.map((r) => r.student_email.toLowerCase()));
		return suggestions.filter((s) => !on.has(s.email.toLowerCase()));
	});

	const looksLikeEmail = $derived(/^\S+@\S+\.\S+$/.test(query.trim()));

	/**
	 * WHAT ENTER SELECTS, in one place so the keyboard path and the rendered
	 * highlight can never disagree about which row is "the top match": the
	 * first roster match, else the first off-roster suggestion, else -- and
	 * this is the fallback the doctrine above requires -- the typed address
	 * itself, whether or not anybody has ever signed in with it.
	 */
	const topMatch = $derived.by<string | null>(() => {
		if (filteredRoster.length) return filteredRoster[0].student_email;
		if (offRosterSuggestions.length) return offRosterSuggestions[0].email;
		if (looksLikeEmail) return query.trim().toLowerCase();
		return null;
	});

	async function chooseStudent(email: string) {
		picked.clear();
		await runLookup(email);
		if (lookup) {
			await tick();
			categoryEl?.focus();
		}
	}

	function onSearchKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			if (topMatch) void chooseStudent(topMatch);
		} else if (e.key === 'Escape') {
			query = '';
			suggestions = [];
		}
	}

	// ---------------------------------------------------------------------
	// Multi-select: several named students, one amount, one reason, ONE call.
	//
	// The pattern is the notebook's (NotebookView's selectMode + a SvelteSet
	// of ids + togglePick + one batched call), because that is the app's only
	// true multi-select and a second shape for the same idea is how the two
	// stop behaving alike.
	// ---------------------------------------------------------------------
	let selectMode = $state(false);
	const picked = new SvelteSet<string>();

	function togglePick(email: string, on: boolean) {
		if (on) picked.add(email);
		else picked.delete(email);
	}

	function exitSelectMode() {
		selectMode = false;
		picked.clear();
		bulkError = '';
		bulkResponse = null;
	}

	function pickAllVisible() {
		for (const r of filteredRoster) picked.add(r.student_email);
	}

	// ---------------------------------------------------------------------
	// Target: one student, the students you picked, or a whole section.
	// ---------------------------------------------------------------------
	type Target = 'student' | 'picked' | 'section';

	// SEEDED ONCE from the stored preference, then owned here: an operator who
	// flips the toggle mid-session must not have it flip back when the write
	// round-trips. `untrack` is that intent said out loud.
	let logMode = $state<CoinLogMode>(untrack(() => coinLogMode(prefs)));

	/**
	 * WHICH OF THE THREE IS LIVE. `picked` is not a fourth mode: multi-select
	 * is a sub-state of student mode, so ticking two names on the roster IS
	 * the way you address two students, with no mode to switch first.
	 */
	const target = $derived<Target>(
		logMode === 'section' ? 'section' : picked.size > 0 ? 'picked' : 'student'
	);

	const bulkTarget = $derived(target !== 'student');

	function setMode(mode: CoinLogMode) {
		if (logMode === mode) return;
		logMode = mode;
		selectedCategoryId = '';
		picked.clear();
		selectMode = false;
		onCategoryChange();
		onPrefs?.({ ...prefs, mode });
	}

	// ---------------------------------------------------------------------
	// Logging. Every write below is a call to an EXISTING RPC -- 0070's
	// coin_log_transaction for flat/range/per_unit/variable categories, one of
	// the five dedicated RPCs otherwise (see coin-desk.ts), 0115's
	// coin_bulk_log_students for a picked set and 0073/0115's
	// coin_bulk_log_section for a whole section -- never a direct table write,
	// because there is no other write path: coin_transactions grants clients
	// select only, and every rule (debt, caps, Eating Pass strikes, Extra
	// Credit's allowlist) lives inside those functions, not a trigger.
	// ---------------------------------------------------------------------
	let selectedCategoryId = $state('');
	const category = $derived(selectableCategories.find((c) => c.id === selectedCategoryId) ?? null);

	let rangeAmount = $state<string | number>('');
	let quantityInput = $state<string | number>('');
	let variableAmount = $state<string | number>('');
	let pointsInput = $state<string | number>(''); // perfect score + extra credit
	let gradingCategory = $state('');
	let costDollarsInput = $state<string | number>('');
	let gramsInput = $state<string | number>('');
	let hoursInput = $state<string | number>('');
	let overnight = $state(false);
	let noteText = $state('');

	/**
	 * WHICH BALANCE THIS ENTRY MOVES (0096). Seeded from the stored preference
	 * and defaulting to physical, because physical coins are the primary
	 * system -- digital is the exception for a student who was not there to be
	 * handed any. Deliberately NOT reset by onCategoryChange(): an admin
	 * logging a session's worth of entries for one absent student sets it
	 * once, and having it snap back between categories is exactly how the
	 * wrong balance gets credited.
	 */
	let medium = $state<CoinMedium>(untrack(() => coinDefaultMedium(prefs)));

	function setMedium(next: CoinMedium) {
		if (medium === next) return;
		medium = next;
		onPrefs?.({ ...prefs, medium: next });
	}

	/**
	 * What the server will ACTUALLY use. Physical Coin Submission is forced to
	 * physical whatever is chosen (it is a correction of the physical record,
	 * never a deposit into digital), so the picker says so rather than
	 * offering a choice that would be silently ignored.
	 */
	const forcedMedium = $derived(category ? FORCED_MEDIUM[category.id] : undefined);
	const activeMedium = $derived(category ? effectiveMedium(category.id, medium) : medium);

	/** PER-STUDENT MEDIUM OVERRIDES for a bulk run (0096), keyed by lowercased email. */
	let mediumOverrides = $state<Record<string, CoinMedium>>({});

	function toggleOverride(email: string) {
		const current = mediumOverrides[email] ?? medium;
		const flipped: CoinMedium = current === 'physical' ? 'digital' : 'physical';
		if (flipped === medium) {
			const { [email]: _dropped, ...rest } = mediumOverrides;
			mediumOverrides = rest;
		} else {
			mediumOverrides = { ...mediumOverrides, [email]: flipped };
		}
	}

	const overrideCount = $derived(Object.keys(mediumOverrides).length);

	/** The emails a bulk run will actually touch, for the override list. */
	const bulkEmails = $derived(
		target === 'picked' ? [...picked].sort() : roster.map((r) => r.student_email)
	);

	function resetEntryFields() {
		selectedCategoryId = '';
		rangeAmount = '';
		quantityInput = '';
		variableAmount = '';
		pointsInput = '';
		gradingCategory = '';
		costDollarsInput = '';
		gramsInput = '';
		hoursInput = '';
		overnight = false;
		noteText = '';
	}

	function onCategoryChange() {
		rangeAmount = '';
		quantityInput = '';
		variableAmount = '';
		pointsInput = '';
		gradingCategory = '';
		costDollarsInput = '';
		gramsInput = '';
		hoursInput = '';
		overnight = false;
		entryError = '';
		entryNotice = '';
		bulkError = '';
		bulkResponse = null;
	}

	function num(v: string | number): number {
		return Number(v);
	}

	function filled(v: string | number): boolean {
		return String(v).trim() !== '';
	}

	let entryBusy = $state(false);
	let entryError = $state('');
	let entryNotice = $state('');

	let bulkBusy = $state(false);
	let bulkError = $state('');
	let bulkResponse = $state<BulkLogResponse | null>(null);

	const noteRequired = $derived(
		!!category &&
			(category.id === 'property_damage_careless' ||
				(category.pricing_model === 'variable' && category.id !== 'extra_credit'))
	);

	/**
	 * THE FIELDS THIS CATEGORY STILL NEEDS, in the order they are rendered.
	 * One list drives three things -- whether submit is enabled, which field
	 * Enter moves to, and which field the keyboard path lands on after the
	 * category is chosen -- so they cannot disagree about what "required"
	 * means.
	 */
	const pendingFields = $derived.by<string[]>(() => {
		const c = category;
		if (!c) return [];
		const out: string[] = [];
		const need = (id: string, ok: boolean) => {
			if (!ok) out.push(id);
		};
		if (c.id === 'perfect_score_graded_work') {
			need('cd-points', filled(pointsInput) && num(pointsInput) > 0);
		} else if (c.id === 'pay_raise') {
			/* nothing but a note, and that is optional */
		} else if (c.id === 'property_damage_careless') {
			need('cd-cost', filled(costDollarsInput) && num(costDollarsInput) >= 0);
		} else if (c.id === 'three_d_printing') {
			need('cd-grams', filled(gramsInput) && num(gramsInput) >= 0);
			need('cd-hours', filled(hoursInput) && num(hoursInput) >= 0);
		} else if (c.id === 'extra_credit') {
			need('cd-points', filled(pointsInput) && num(pointsInput) > 0);
			need('cd-grading', !!gradingCategory);
		} else if (c.pricing_model === 'range') {
			const v = num(rangeAmount);
			need(
				'cd-range',
				filled(rangeAmount) &&
					Number.isFinite(v) &&
					v >= (c.min_amount ?? 0) &&
					v <= (c.max_amount ?? 0)
			);
		} else if (c.pricing_model === 'per_unit') {
			need('cd-qty', filled(quantityInput) && num(quantityInput) > 0);
		} else if (c.pricing_model === 'variable') {
			const v = num(variableAmount);
			const signOk = c.kind === 'adjustment' ? v !== 0 : v > 0;
			need('cd-variable', filled(variableAmount) && Number.isFinite(v) && signOk);
		}
		if (noteRequired) need('cd-note', !!noteText.trim());
		return out;
	});

	/**
	 * A bulk run is scoped to exactly the pricing models where ONE amount,
	 * entered once, applies uniformly (sections.ts / 0073 / 0115), which is
	 * also why bulk needs no field the single-student flow does not already
	 * render.
	 */
	const eligibleForTarget = $derived(
		bulkTarget ? selectableCategories.filter(isBulkEligible) : selectableCategories
	);

	const hasSubject = $derived(
		target === 'student' ? !!lookup : target === 'picked' ? picked.size > 0 : !!selectedSectionId
	);

	const canSubmit = $derived(
		!!category &&
			hasSubject &&
			!entryBusy &&
			!bulkBusy &&
			pendingFields.length === 0 &&
			(!bulkTarget || isBulkEligible(category))
	);

	function noteOrNull(): string | null {
		return noteText.trim() || null;
	}

	/**
	 * THE ONE KEYBOARD RULE, applied from every field and from the category
	 * picker: Enter submits when nothing further is required, and otherwise
	 * moves to the first field that is still holding the entry up. Nothing
	 * submits on the same keystroke that picks a category -- the amount
	 * preview has to be readable before it is committed -- so the final Enter
	 * is always a separate, deliberate one on the submit button.
	 */
	async function advance() {
		if (canSubmit) {
			await tick();
			submitEl?.focus();
			return;
		}
		const next = pendingFields[0];
		if (!next) return;
		await tick();
		document.getElementById(next)?.focus();
	}

	function onFieldKeydown(e: KeyboardEvent) {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		if (canSubmit) void submit();
		else void advance();
	}

	function reasonMessage(r: {
		reason?: string;
		balance?: number;
		medium?: string;
		cap_period?: string;
		used_points?: number;
		cap_points?: number;
		remaining_points?: number;
		message?: string;
	}): string {
		switch (r.reason) {
			case 'debt':
				return `Blocked: the ${r.medium ?? ''} balance is negative (${r.balance}${COIN_SYMBOL}) -- ${r.medium ?? ''} purchases are locked until it clears. The other balance is unaffected.`;
			case 'cap_reached':
				return `Blocked: already logged the max for this ${r.cap_period === 'day' ? 'day' : 'calendar month'}.`;
			case 'pass_already_active':
				return 'Blocked: this student already holds an active Eating Pass.';
			case 'cap_exceeded':
				return `Blocked: Extra Credit cap reached (${r.used_points}/${r.cap_points}pt used this semester, ${r.remaining_points}pt remaining).`;
			case 'error':
				return r.message ? `Error: ${r.message}` : 'An unexpected error occurred.';
			default:
				return r.reason ? `Refused: ${r.reason}` : 'Refused by the server.';
		}
	}

	function submit() {
		return bulkTarget ? submitBulk() : submitEntry();
	}

	async function submitEntry() {
		if (!category || !lookup) return;
		entryError = '';
		entryNotice = '';
		entryBusy = true;
		const email = lookup.email;

		// EVERY call names p_medium. 0096 dropped the old arity of each of
		// these six RPCs before recreating it, so the parameter is not
		// optional in practice -- a client that omitted it would resolve
		// against a signature that no longer exists.
		let resp: { data: unknown; error: { message: string } | null };
		if (category.id === 'perfect_score_graded_work') {
			resp = await supabase.rpc('coin_log_perfect_score', {
				p_email: email,
				p_points: Math.round(num(pointsInput)),
				p_note: noteOrNull(),
				p_medium: medium
			});
		} else if (category.id === 'pay_raise') {
			resp = await supabase.rpc('coin_log_pay_raise', {
				p_email: email,
				p_note: noteOrNull(),
				p_medium: medium
			});
		} else if (category.id === 'property_damage_careless') {
			resp = await supabase.rpc('coin_log_property_damage_careless', {
				p_email: email,
				p_cost_dollars: num(costDollarsInput),
				p_note: noteText.trim(),
				p_medium: medium
			});
		} else if (category.id === 'three_d_printing') {
			resp = await supabase.rpc('coin_log_three_d_printing', {
				p_email: email,
				p_grams: num(gramsInput),
				p_hours: num(hoursInput),
				p_overnight: overnight,
				p_note: noteOrNull(),
				p_medium: medium
			});
		} else if (category.id === 'extra_credit') {
			resp = await supabase.rpc('coin_log_extra_credit', {
				p_email: email,
				p_points: Math.round(num(pointsInput)),
				p_grading_category: gradingCategory,
				p_note: noteOrNull(),
				p_medium: medium
			});
		} else {
			resp = await supabase.rpc('coin_log_transaction', {
				p_email: email,
				p_category_id: category.id,
				p_amount:
					category.pricing_model === 'range'
						? Math.round(num(rangeAmount))
						: category.pricing_model === 'variable'
							? Math.round(num(variableAmount))
							: null,
				p_quantity: category.pricing_model === 'per_unit' ? num(quantityInput) : null,
				p_note: noteOrNull(),
				p_medium: medium
			});
		}

		entryBusy = false;
		if (resp.error) {
			entryError = resp.error.message;
			return;
		}
		const r = resp.data as { ok: boolean; balance?: number; [k: string]: unknown };
		if (!r.ok) {
			entryError = reasonMessage(r);
			return;
		}
		entryNotice = successMessage(category, r);
		resetEntryFields();
		await runLookup(email, true);
		await tick();
		searchEl?.focus();
	}

	function successMessage(cat: CoinCategory, r: Record<string, unknown>): string {
		const balance = typeof r.balance === 'number' ? r.balance : undefined;
		if (cat.id === 'pay_raise') {
			return `Wage tier raised ${r.previous_tier} -> ${r.new_tier} for ${r.cost}${COIN_SYMBOL}. New balance: ${balance}${COIN_SYMBOL}.`;
		}
		if (cat.id === 'extra_credit') {
			return `Logged ${r.points}pt (${r.cost}${COIN_SYMBOL}). ${r.used_points}/${r.cap_points}pt used this semester. New balance: ${balance}${COIN_SYMBOL}.`;
		}
		if (cat.id === 'three_d_printing') {
			return `Logged ${r.amount}${COIN_SYMBOL} (material ${r.material_ic}${COIN_SYMBOL} + time ${r.time_ic}${COIN_SYMBOL}). New balance: ${balance}${COIN_SYMBOL}.`;
		}
		if (cat.id === 'property_damage_careless') {
			return `Logged ${r.amount}${COIN_SYMBOL} (${r.base}${COIN_SYMBOL} base + ${r.exchange}${COIN_SYMBOL} repair cost). New balance: ${balance}${COIN_SYMBOL}.`;
		}
		const amt = typeof r.amount === 'number' ? r.amount : null;
		const strikeNote = r.strike === true ? ' -- flagged as an Eating Pass strike.' : '';
		// `balance` matches the four branches above deliberately: the RPC may
		// omit it, and this line is not the place to start differing from its
		// siblings about how that reads.
		return `Logged "${cat.name}" for ${amt !== null ? signedCoins(amt) : 'the entered amount'}. New balance: ${balance}${COIN_SYMBOL}.${strikeNote}`;
	}

	/**
	 * ONE round trip, ONE server-side transaction, whether the subject is a
	 * hand-picked set (0115's coin_bulk_log_students) or a whole section
	 * (coin_bulk_log_section, which since 0115 is a thin wrapper around the
	 * same function). Never a client-side loop over coin_log_transaction: that
	 * can be interrupted partway leaving nobody able to say how many of the
	 * twenty students actually got logged.
	 */
	async function submitBulk() {
		if (!category) return;
		bulkError = '';
		bulkResponse = null;
		bulkBusy = true;
		const amount =
			category.pricing_model === 'range'
				? Math.round(num(rangeAmount))
				: category.pricing_model === 'variable'
					? Math.round(num(variableAmount))
					: null;
		const resp =
			target === 'picked'
				? await supabase.rpc('coin_bulk_log_students', {
						p_emails: [...picked].sort(),
						p_category_id: category.id,
						p_amount: amount,
						p_note: noteOrNull(),
						p_medium: medium,
						p_medium_overrides: mediumOverrides
					})
				: await supabase.rpc('coin_bulk_log_section', {
						p_section_id: selectedSectionId,
						p_category_id: category.id,
						p_amount: amount,
						p_note: noteOrNull(),
						p_medium: medium,
						p_medium_overrides: mediumOverrides
					});
		bulkBusy = false;
		if (resp.error) {
			bulkError = resp.error.message;
			return;
		}
		bulkResponse = resp.data as BulkLogResponse;
		rangeAmount = '';
		variableAmount = '';
		noteText = '';
	}

	// ---------------------------------------------------------------------
	// The category picker: type to filter, Enter to select.
	//
	// It replaced a single <select> carrying every loggable category in four
	// optgroups -- a control whose cost is a scroll through a list you cannot
	// search, on the one field an operator touches for every single entry.
	// ---------------------------------------------------------------------
	let categoryQuery = $state('');
	let categoryOpen = $state(false);
	let highlighted = $state(0);

	const categoryMatches = $derived.by(() => {
		const term = categoryQuery.trim().toLowerCase();
		const pool = eligibleForTarget;
		if (!term) return pool;
		const scored = pool
			.map((c) => {
				const name = c.name.toLowerCase();
				const kind = KIND_LABELS[c.kind].toLowerCase();
				if (name.startsWith(term)) return { c, rank: 0 };
				if (name.includes(term)) return { c, rank: 1 };
				if (c.id.includes(term)) return { c, rank: 2 };
				if (kind.includes(term)) return { c, rank: 3 };
				return null;
			})
			.filter((x): x is { c: CoinCategory; rank: number } => x !== null);
		scored.sort((a, b) => a.rank - b.rank);
		return scored.map((x) => x.c);
	});

	$effect(() => {
		// Keep the highlight inside the list as it filters under the cursor.
		if (highlighted >= categoryMatches.length) highlighted = 0;
	});

	function openCategories() {
		categoryOpen = true;
		highlighted = 0;
	}

	async function pickCategory(c: CoinCategory) {
		selectedCategoryId = c.id;
		categoryQuery = c.name;
		categoryOpen = false;
		onCategoryChange();
		await advance();
	}

	function onCategoryKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			categoryOpen = true;
			highlighted = Math.min(highlighted + 1, categoryMatches.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			highlighted = Math.max(highlighted - 1, 0);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const c = categoryMatches[highlighted];
			if (c) void pickCategory(c);
		} else if (e.key === 'Escape') {
			categoryOpen = false;
		}
	}

	function onCategoryInput() {
		categoryOpen = true;
		highlighted = 0;
		// Typing past a chosen category un-chooses it, so the form can never
		// show one category's fields while the box names another.
		if (selectedCategoryId && categoryQuery !== category?.name) {
			selectedCategoryId = '';
			onCategoryChange();
		}
	}

	function when(iso: string): string {
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
	}

	/**
	 * SEARCH IS FOCUSED ON LOAD. The desk's first action is always "who", and
	 * the operator's hands are already on the keyboard.
	 *
	 * KEYED ON THE ELEMENT, NOT ON MOUNT. The input is bound inside a snippet
	 * that ClassSplit renders, so at the parent's onMount the binding is not
	 * necessarily set yet -- measured: it was null, and the focus call was a
	 * silent no-op. This runs the first time there is genuinely something to
	 * focus, and the flag keeps it to once: re-focusing the search box on a
	 * later re-render would yank the cursor out of whatever field the operator
	 * had moved on to.
	 */
	let focusedOnce = false;
	$effect(() => {
		if (focusedOnce || !searchEl) return;
		focusedOnce = true;
		searchEl.focus();
	});

	onMount(() => {
		if (!selectedSectionId && sections.length) {
			selectedSectionId = sections[0].id;
			void loadRoster(selectedSectionId);
		}
	});
</script>

{#if !configured}
	<section class="card">
		<p class="feedback error">
			Migration 0070 does not appear to be applied yet -- the category list came back empty. Apply it
			in the Supabase SQL editor, then reload this page.
		</p>
	</section>
{/if}

{#snippet mediumPicker()}
	<div class="field-row">
		<span class="field-label">Which balance</span>
		{#if forcedMedium}
			<p class="preview">
				Always {MEDIUM_LABELS[forcedMedium]}. This category credits physical coins the student
				already holds that the record is missing -- it is a correction of the physical record, not
				a deposit into digital. There is no path from physical into digital.
			</p>
		{:else}
			<div class="medium-toggle">
				{#each MEDIA as m (m)}
					<button type="button" class:active={medium === m} onclick={() => setMedium(m)}>
						{MEDIUM_LABELS[m]}
					</button>
				{/each}
			</div>
			{#if target === 'student' && lookup}
				<p class="hint">
					{MEDIUM_HINTS[medium]} Balance now: {balanceFor(lookup, activeMedium)}{COIN_SYMBOL}
				</p>
			{:else}
				<p class="hint">{MEDIUM_HINTS[medium]}</p>
			{/if}
		{/if}
	</div>
{/snippet}

{#snippet amountFields(cat: CoinCategory)}
	{#if cat.pricing_model === 'flat'}
		{#if cat.id === WEEKLY_WAGE_CATEGORY_ID}
			<!--
				Weekly Wage's stored amount is a BASE rate the student's own wage
				tier multiplies (0087). In a bulk run there is no single tier to
				preview -- each student is paid at theirs, which is exactly why the
				bulk logger nests into coin_log_transaction per student.
			-->
			{#if bulkTarget}
				<p class="preview">
					{cat.amount}{COIN_SYMBOL} x each student's own wage tier. Paid per student, so a
					raised tier is honored without splitting the run.
				</p>
			{:else if lookup}
				<p class="preview">
					Amount: {weeklyWagePreview(cat.amount, lookup.wage_tier)}{COIN_SYMBOL}
					({cat.amount}{COIN_SYMBOL} base x wage tier {lookup.wage_tier})
				</p>
			{:else}
				<p class="preview">{cat.amount}{COIN_SYMBOL} x the student's wage tier.</p>
			{/if}
		{:else}
			<p class="preview">Fixed amount: {cat.amount}{COIN_SYMBOL}</p>
		{/if}
	{:else if cat.pricing_model === 'range'}
		<div class="field-row">
			<label for="cd-range">
				Amount ({cat.min_amount}-{cat.max_amount}{COIN_SYMBOL})
			</label>
			<input
				id="cd-range"
				type="number"
				min={cat.min_amount}
				max={cat.max_amount}
				step="1"
				bind:value={rangeAmount}
				onkeydown={onFieldKeydown}
			/>
		</div>
	{:else if cat.pricing_model === 'variable'}
		<div class="field-row">
			<label for="cd-variable">
				{cat.kind === 'adjustment' ? 'Adjustment amount (+/-)' : `Amount (${COIN_SYMBOL})`}
			</label>
			<input
				id="cd-variable"
				type="number"
				step="1"
				bind:value={variableAmount}
				onkeydown={onFieldKeydown}
			/>
		</div>
	{/if}
{/snippet}

<ClassSplit hasDetail navWidth="wide" scroll="page" narrow="stack">
	{#snippet nav()}
		<div class="pane nav-pane" data-testid="cd-nav">
			<div class="search-row">
				<label class="sr-only" for="cd-search">Find a student</label>
				<input
					id="cd-search"
					data-testid="cd-search"
					type="text"
					placeholder="Name, or student@boscotech.net"
					autocomplete="off"
					bind:this={searchEl}
					bind:value={query}
					oninput={onQueryInput}
					onkeydown={onSearchKeydown}
				/>
				{#if lookupBusy}<span class="busy">Looking up&hellip;</span>{/if}
			</div>

			{#if lookupError}<p class="feedback error">{lookupError}</p>{/if}

			<div class="roster-head">
				<label class="sr-only" for="cd-section">Section</label>
				<select
					id="cd-section"
					data-testid="cd-section"
					bind:value={selectedSectionId}
					onchange={() => loadRoster(selectedSectionId)}
				>
					<option value="">No section</option>
					{#each sections as s (s.id)}
						<option value={s.id}>
							{sectionDisplayName(s)} ({s.student_count})
						</option>
					{/each}
				</select>
				<button
					type="button"
					class="inline-link"
					data-testid="cd-select-toggle"
					onclick={() => (selectMode ? exitSelectMode() : (selectMode = true))}
				>
					{selectMode ? 'Done' : 'Select'}
				</button>
			</div>

			{#if selectMode}
				<div class="bulk-bar" data-testid="cd-bulk-bar">
					<span class="bulk-count">
						{picked.size === 0 ? 'Tick students to log against' : `${picked.size} selected`}
					</span>
					<button type="button" class="inline-link" onclick={pickAllVisible}>All shown</button>
					{#if picked.size}
						<button type="button" class="inline-link" onclick={() => picked.clear()}>Clear</button>
					{/if}
				</div>
			{/if}

			{#if !sectionsConfigured}
				<p class="feedback error">
					Migration 0073 does not appear to be applied yet -- rosters are unavailable. The search
					box still works: type a full email address.
				</p>
			{:else if rosterBusy}
				<p class="note">Loading roster&hellip;</p>
			{:else if !selectedSectionId}
				<p class="note">
					Pick a section to list its roster, or type a full email address to log against anyone.
				</p>
			{:else if !roster.length}
				<p class="note">
					No students on this section's roster yet -- add them under
					<a href="/coin-desk/students">Students</a>.
				</p>
			{:else}
				<ul class="roster" data-testid="cd-roster" class:selecting={selectMode}>
					{#each filteredRoster as r (r.student_email)}
						{@const isOpen = lookup?.email === r.student_email && !bulkTarget}
						<li>
							{#if selectMode}
								<label class="roster-pick" title={r.student_email}>
									<input
										type="checkbox"
										checked={picked.has(r.student_email)}
										onchange={(e) =>
											togglePick(r.student_email, (e.currentTarget as HTMLInputElement).checked)}
									/>
									<span class="roster-name">{rosterLabel(r)}</span>
								</label>
							{:else}
								<button
									type="button"
									class="roster-row"
									class:open={isOpen}
									aria-current={isOpen ? 'true' : undefined}
									title={r.student_email}
									onclick={() => chooseStudent(r.student_email)}
								>
									<span class="roster-name">{rosterLabel(r)}</span>
								</button>
							{/if}
						</li>
					{/each}
					{#if !filteredRoster.length}
						<li class="roster-empty">Nobody on this roster matches.</li>
					{/if}
				</ul>
			{/if}

			{#if offRosterSuggestions.length || (looksLikeEmail && !filteredRoster.length)}
				<div class="off-roster" data-testid="cd-off-roster">
					<p class="off-roster-head">Not on this roster</p>
					{#each offRosterSuggestions as s (s.id)}
						<button type="button" class="roster-row" onclick={() => chooseStudent(s.email)}>
							<span class="roster-name">{studentLabel(s)}</span>
							<span class="roster-email">{s.email}</span>
						</button>
					{/each}
					{#if looksLikeEmail && !offRosterSuggestions.some((s) => s.email.toLowerCase() === query.trim().toLowerCase())}
						<button
							type="button"
							class="roster-row"
							data-testid="cd-use-email"
							onclick={() => chooseStudent(query.trim().toLowerCase())}
						>
							<span class="roster-name">Use {query.trim().toLowerCase()}</span>
							<span class="roster-email">A balance can exist before a first sign-in.</span>
						</button>
					{/if}
				</div>
			{:else if searching}
				<p class="note">Searching&hellip;</p>
			{/if}
		</div>
	{/snippet}

	<div class="pane detail-pane" data-testid="cd-detail">
		<div class="mode-toggle" role="group" aria-label="What this entry logs against">
			<button type="button" class:active={logMode === 'student'} onclick={() => setMode('student')}>
				Students
			</button>
			<button type="button" class:active={logMode === 'section'} onclick={() => setMode('section')}>
				Whole section
			</button>
		</div>

		<!-- THE COMPRESSED STUDENT STRIP. Everything the old summary card put
		     between the search and the form, on one line: it is context for the
		     entry, not a report. -->
		{#if target === 'student'}
			{#if lookup}
				<div class="strip" data-testid="cd-strip">
					<span class="strip-who">{lookup.email}</span>
					<span class="strip-total" class:negative={lookup.balance < 0}>
						{coins(lookup.balance)}
					</span>
					<span class="strip-split" class:negative={lookup.physical_balance < 0}>
						phys {coins(lookup.physical_balance)}
					</span>
					<span class="strip-split" class:negative={lookup.digital_balance < 0}>
						dig {coins(lookup.digital_balance)}
					</span>
					<span class="strip-meta">tier {lookup.wage_tier}</span>
					<span class="strip-meta">
						pass: {lookup.eating_pass_active
							? `active (${lookup.eating_pass_strikes} strike${lookup.eating_pass_strikes === 1 ? '' : 's'})`
							: 'none'}
					</span>
				</div>
			{:else}
				<p class="note" data-testid="cd-empty">
					Find a student on the left -- the search box is already focused.
				</p>
			{/if}
		{:else if target === 'picked'}
			<div class="strip" data-testid="cd-strip">
				<span class="strip-who">{picked.size} students selected</span>
				<span class="strip-meta">one amount, one reason, one call</span>
			</div>
		{:else}
			<div class="field-row">
				<label for="cd-section-target">Section</label>
				<select id="cd-section-target" bind:value={selectedSectionId} onchange={() => loadRoster(selectedSectionId)}>
					<option value="" disabled selected>Choose a section&hellip;</option>
					{#each sections as s (s.id)}
						<option value={s.id}>
							{sectionDisplayName(s)} ({s.student_count} student{s.student_count === 1 ? '' : 's'})
						</option>
					{/each}
				</select>
			</div>
		{/if}

		{#if entryError}<p class="feedback error" data-testid="cd-error">{entryError}</p>{/if}
		{#if entryNotice}<p class="feedback notice" data-testid="cd-notice">{entryNotice}</p>{/if}
		{#if bulkError}<p class="feedback error" data-testid="cd-bulk-error">{bulkError}</p>{/if}

		{#if hasSubject}
			<div class="field-row combo-row">
				<label for="cd-category">Category</label>
				<div class="combo">
					<input
						id="cd-category"
						data-testid="cd-category"
						type="text"
						role="combobox"
						aria-expanded={categoryOpen}
						aria-controls="cd-category-list"
						aria-autocomplete="list"
						autocomplete="off"
						placeholder="Type to filter&hellip;"
						bind:this={categoryEl}
						bind:value={categoryQuery}
						oninput={onCategoryInput}
						onfocus={openCategories}
						onblur={() => setTimeout(() => (categoryOpen = false), 120)}
						onkeydown={onCategoryKeydown}
					/>
					{#if categoryOpen}
						<ul class="combo-list" id="cd-category-list" role="listbox" data-testid="cd-category-list">
							{#each categoryMatches as c, i (c.id)}
								<li>
									<button
										type="button"
										role="option"
										aria-selected={i === highlighted}
										class="combo-option"
										class:highlighted={i === highlighted}
										onmousedown={() => pickCategory(c)}
										onmouseenter={() => (highlighted = i)}
									>
										<span class="combo-name">{c.name}</span>
										<span class="combo-kind">{KIND_LABELS[c.kind]}</span>
										<span class="combo-price">{priceHint(c)}</span>
									</button>
								</li>
							{/each}
							{#if !categoryMatches.length}
								<li class="combo-empty">
									No {bulkTarget ? 'bulk-loggable ' : ''}category matches.
								</li>
							{/if}
						</ul>
					{/if}
				</div>
			</div>

			{#if category}
				{#if category.notes}
					<p class="note category-note">{category.notes}</p>
				{/if}

				{#if !bulkTarget && category.id === 'perfect_score_graded_work'}
					<div class="field-row">
						<label for="cd-points">Points the work was worth</label>
						<input
							id="cd-points"
							type="number"
							min="1"
							step="1"
							bind:value={pointsInput}
							onkeydown={onFieldKeydown}
						/>
					</div>
					{#if filled(pointsInput)}
						<p class="preview">Preview: {perfectScorePreview(num(pointsInput))}{COIN_SYMBOL}</p>
					{/if}
				{:else if !bulkTarget && category.id === 'pay_raise' && lookup}
					<p class="preview">
						Current tier {lookup.wage_tier}. This purchase raises it to {lookup.wage_tier + 1} for
						{payRaisePreview(lookup.wage_tier)}{COIN_SYMBOL} (the server re-checks the tier and the exact cost
						at submit time).
					</p>
				{:else if !bulkTarget && category.id === 'property_damage_careless'}
					<div class="field-row">
						<label for="cd-cost">Repair/replacement cost ($)</label>
						<input
							id="cd-cost"
							type="number"
							min="0"
							step="0.01"
							bind:value={costDollarsInput}
							onkeydown={onFieldKeydown}
						/>
					</div>
					{#if filled(costDollarsInput)}
						<p class="preview">Preview: {propertyDamagePreview(num(costDollarsInput))}{COIN_SYMBOL}</p>
					{/if}
				{:else if !bulkTarget && category.id === 'three_d_printing'}
					<div class="field-row">
						<label for="cd-grams">Grams (slicer's reported weight)</label>
						<input
							id="cd-grams"
							type="number"
							min="0"
							step="1"
							bind:value={gramsInput}
							onkeydown={onFieldKeydown}
						/>
					</div>
					<div class="field-row">
						<label for="cd-hours">Print time (hours)</label>
						<input
							id="cd-hours"
							type="number"
							min="0"
							step="0.1"
							bind:value={hoursInput}
							onkeydown={onFieldKeydown}
						/>
					</div>
					<label class="checkbox-row">
						<input type="checkbox" bind:checked={overnight} />
						Printed overnight (no time charge)
					</label>
					{#if filled(gramsInput) || filled(hoursInput)}
						{@const preview = threeDPrintingPreview(num(gramsInput), num(hoursInput), overnight)}
						<p class="preview">
							Preview: {preview.total}{COIN_SYMBOL} (material {preview.material}{COIN_SYMBOL} + time {preview.time}{COIN_SYMBOL})
						</p>
					{/if}
				{:else if !bulkTarget && category.id === 'extra_credit'}
					<div class="field-row">
						<label for="cd-points">Points</label>
						<input
							id="cd-points"
							type="number"
							min="1"
							step="1"
							bind:value={pointsInput}
							onkeydown={onFieldKeydown}
						/>
					</div>
					<div class="field-row">
						<label for="cd-grading">Grading category</label>
						<select id="cd-grading" bind:value={gradingCategory} onkeydown={onFieldKeydown}>
							<option value="" disabled selected>Choose&hellip;</option>
							{#each EXTRA_CREDIT_GRADING_CATEGORIES as g (g.id)}
								<option value={g.id}>{g.label}</option>
							{/each}
						</select>
					</div>
					{#if filled(pointsInput)}
						<p class="preview">Preview: {Math.round(num(pointsInput) * (category.amount ?? 0))}{COIN_SYMBOL}</p>
					{/if}
				{:else if !bulkTarget && category.pricing_model === 'per_unit'}
					<div class="field-row">
						<label for="cd-qty">Quantity ({category.unit_label})</label>
						<input
							id="cd-qty"
							type="number"
							min="0"
							step="any"
							bind:value={quantityInput}
							onkeydown={onFieldKeydown}
						/>
					</div>
					{#if filled(quantityInput)}
						<p class="preview">
							Preview: {Math.round(num(quantityInput) * (category.amount ?? 0))}{COIN_SYMBOL}
						</p>
					{/if}
				{:else}
					{@render amountFields(category)}
				{/if}

				{@render mediumPicker()}

				<div class="field-row">
					<label for="cd-note">Note{noteRequired ? ' (required)' : ' (optional)'}</label>
					<input
						id="cd-note"
						type="text"
						maxlength="500"
						bind:value={noteText}
						onkeydown={onFieldKeydown}
					/>
				</div>

				{#if bulkTarget && !forcedMedium && bulkEmails.length}
					<details class="overrides">
						<summary>
							Per-student exceptions{overrideCount ? ` (${overrideCount})` : ''}
						</summary>
						<p class="hint">
							Everyone is logged as {MEDIUM_LABELS[medium]}. Flip anyone who was absent (or
							present) to the other balance -- it all goes in one server-side pass, not a
							second run.
						</p>
						<div class="override-grid">
							{#each bulkEmails as email (email)}
								{@const rowMedium = mediumOverrides[email] ?? medium}
								<button
									type="button"
									class="override-chip"
									class:flipped={!!mediumOverrides[email]}
									onclick={() => toggleOverride(email)}
								>
									<span class="override-email">{email}</span>
									<span class="override-medium">{MEDIUM_LABELS[rowMedium]}</span>
								</button>
							{/each}
						</div>
					</details>
				{/if}

				<div class="btn-row">
					<button
						class="btn"
						data-testid="cd-submit"
						bind:this={submitEl}
						disabled={!canSubmit}
						onclick={submit}
					>
						{#if entryBusy || bulkBusy}
							Logging&hellip;
						{:else if target === 'picked'}
							Log to {picked.size} student{picked.size === 1 ? '' : 's'}
						{:else if target === 'section'}
							Log to section
						{:else}
							Log transaction
						{/if}
					</button>
					{#if pendingFields.length}
						<span class="pending-hint">
							{pendingFields.length} field{pendingFields.length === 1 ? '' : 's'} still needed
						</span>
					{/if}
				</div>
			{/if}
		{:else if target === 'section'}
			<p class="note">Choose a section above.</p>
		{:else if target === 'picked'}
			<p class="note">Tick some students on the left.</p>
		{/if}

		{#if bulkResponse}
			<div class="bulk-results" data-testid="cd-bulk-results">
				<p class="feedback notice">
					Logged against {bulkResponse.total} student{bulkResponse.total === 1 ? '' : 's'} as
					{bulkResponse.medium ?? medium}: {bulkResponse.succeeded} succeeded, {bulkResponse.refused}
					refused.
				</p>
				{#if bulkResponse.unmatched_overrides?.length}
					<p class="feedback error">
						{bulkResponse.unmatched_overrides.length} per-student exception{bulkResponse
							.unmatched_overrides.length === 1
							? ''
							: 's'} matched nobody and did nothing:
						{bulkResponse.unmatched_overrides.join(', ')}
					</p>
				{/if}
				<div class="rows bulk-rows">
					{#each bulkResponse.results as r (r.email)}
						<div class="row" class:refused={!r.ok}>
							<span class="email">{r.email}</span>
							{#if r.medium}
								<span class="medium-chip" class:digital={r.medium === 'digital'}>{r.medium}</span>
							{/if}
							{#if r.ok}
								<span class="txn-pos">
									{typeof r.amount === 'number' ? signedCoins(r.amount) : 'logged'}
								</span>
							{:else}
								<span class="txn-neg">{reasonMessage(r)}</span>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- OUT OF THE PATH OF LOGGING, BY CONSTRUCTION: a debt is an action the
		     operator sometimes takes, and the history is a report they sometimes
		     read. Both sit BELOW the form, and the history is closed. -->
		{#if target === 'student' && lookup}
			{#if lookup.physical_balance < 0 || lookup.digital_balance < 0}
				<!--
					BEHIND A DISCLOSURE FOR THE SAME REASON THE HISTORY IS, and this
					one was found by measurement rather than reasoning: logging a
					fine that takes a student negative made the panel appear, which
					grew the page past the viewport (1035px against 900) on the very
					next frame after a successful log. Paying a debt is an ACTION the
					operator sometimes takes, not a step in logging, and it must not
					be able to push the form.
					The debt itself is not hidden -- the strip above already reads it
					in amber, and this summary names the amount.
				-->
				<details class="debt" data-testid="cd-debt">
					<summary>
						Pay off debt ({coins(Math.min(lookup.physical_balance, lookup.digital_balance, 0))})
					</summary>
					<DebtPaymentPanel
						{supabase}
						email={lookup.email}
						physicalBalance={lookup.physical_balance}
						digitalBalance={lookup.digital_balance}
						onLogged={() => runLookup(lookup!.email, true)}
					/>
				</details>
			{/if}

			<details class="history" data-testid="cd-history">
				<summary>
					Recent transactions ({lookup.recent_transactions.length})
				</summary>
				<CoinTransactionRows
					transactions={lookup.recent_transactions}
					kinds={categoryKinds}
					showActor
				/>
			</details>
		{/if}
	</div>
</ClassSplit>

<style>
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.pane {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		min-width: 0;
	}

	/* --- the navigation pane: search, roster ------------------------------ */
	.search-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.search-row input {
		flex: 1;
		min-width: 0;
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		font-size: 1rem;
		padding: 0.45rem 0.6rem;
	}
	.search-row input:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 1px;
	}
	.busy {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		color: var(--dim);
	}

	.roster-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.roster-head select {
		flex: 1;
		min-width: 0;
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		font-size: 0.85rem;
		padding: 0.3rem 0.45rem;
	}
	.inline-link {
		background: none;
		border: none;
		color: var(--cyan);
		cursor: pointer;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		padding: 0.35rem 0.4rem;
		text-decoration: underline;
	}

	.bulk-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		border: 1px solid var(--line);
		border-radius: 4px;
		padding: 0.25rem 0.5rem;
	}
	.bulk-count {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--white);
	}

	/*
	 * THE ROSTER IS A GRID, and that is what makes the no-scroll rule hold
	 * against a real class rather than only against a short one: in the wide
	 * navigation pane `auto-fill` lays a section out in three or four columns,
	 * so forty students are forty names ON SCREEN instead of forty rows to
	 * scroll past. The cap is a backstop for a roster far larger than a class,
	 * which is the only case where something has to give -- and when it does,
	 * what scrolls is this list, never the pane and never the page, so the
	 * entry form does not move.
	 */
	.roster {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(12.5rem, 1fr));
		gap: 0.1rem 0.4rem;
		max-height: 24rem;
		overflow-y: auto;
	}
	.roster-empty {
		grid-column: 1 / -1;
		color: var(--dim);
		font-size: 0.85rem;
		padding: 0.3rem 0;
	}
	.roster-row,
	.roster-pick {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		width: 100%;
		background: none;
		border: 1px solid transparent;
		border-radius: 3px;
		color: var(--white);
		cursor: pointer;
		font-family: 'Rajdhani', sans-serif;
		font-size: 0.9rem;
		text-align: left;
		padding: 0.16rem 0.35rem;
	}
	.roster-row:hover,
	.roster-pick:hover {
		border-color: var(--line);
		background: var(--bg1);
	}
	.roster-row:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: -2px;
	}
	/* The open student, marked with a fill AND a rule -- never colour alone. */
	.roster-row.open {
		background: var(--bg1);
		border-color: var(--line-strong);
		box-shadow: inset 2px 0 0 var(--green);
	}
	.roster-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.roster-email {
		color: var(--dim);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		margin-left: auto;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.off-roster {
		border-top: 1px solid var(--line);
		padding-top: 0.4rem;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.off-roster-head {
		color: var(--dim);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		margin: 0 0 0.15rem;
	}

	/* --- the detail pane: strip, form ------------------------------------- */
	.mode-toggle {
		display: flex;
		gap: 0.3rem;
	}
	.mode-toggle button {
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--dim);
		cursor: pointer;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		padding: 0.3rem 0.6rem;
	}
	.mode-toggle button.active {
		border-color: var(--green);
		color: var(--green);
	}

	.strip {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.2rem 0.7rem;
		border: 1px solid var(--line);
		border-radius: 4px;
		padding: 0.35rem 0.6rem;
	}
	.strip-who {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--white);
	}
	.strip-total {
		font-family: 'Share Tech Mono', monospace;
		font-size: 1.05rem;
		color: var(--green);
	}
	.strip-total.negative,
	.strip-split.negative {
		color: var(--amber);
	}
	.strip-split,
	.strip-meta {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		color: var(--dim);
	}

	.combo-row {
		position: relative;
	}
	.combo {
		position: relative;
	}
	.combo input {
		width: 100%;
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		font-size: 0.95rem;
		padding: 0.4rem 0.55rem;
	}
	.combo input:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 1px;
	}
	.combo-list {
		position: absolute;
		top: calc(100% + 0.2rem);
		left: 0;
		right: 0;
		z-index: 20;
		list-style: none;
		margin: 0;
		padding: 0;
		background: var(--bg1);
		border: 1px solid var(--line-strong);
		border-radius: 5px;
		box-shadow: 0 8px 20px rgba(0, 0, 0, 0.5);
		max-height: 15rem;
		overflow-y: auto;
	}
	.combo-option {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		width: 100%;
		background: none;
		border: none;
		border-bottom: 1px solid var(--line);
		color: var(--white);
		cursor: pointer;
		font-family: 'Rajdhani', sans-serif;
		text-align: left;
		padding: 0.32rem 0.55rem;
	}
	.combo-option.highlighted {
		background: var(--bg2);
	}
	.combo-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.combo-kind {
		color: var(--dim);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		text-transform: uppercase;
	}
	.combo-price {
		color: var(--cyan);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
	}
	.combo-empty {
		color: var(--dim);
		font-size: 0.82rem;
		padding: 0.4rem 0.55rem;
	}

	.field-row {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.field-row label,
	.field-label {
		color: var(--dim);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	.field-row input[type='number'],
	.field-row input[type='text'],
	.field-row select {
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		font-size: 0.95rem;
		padding: 0.35rem 0.5rem;
		width: 100%;
	}
	.checkbox-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--white);
		font-size: 0.9rem;
	}

	.medium-toggle {
		display: flex;
		gap: 0.3rem;
	}
	.medium-toggle button {
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--dim);
		cursor: pointer;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		padding: 0.25rem 0.6rem;
	}
	.medium-toggle button.active {
		border-color: var(--green);
		color: var(--green);
	}

	.preview,
	.hint {
		color: var(--dim);
		font-size: 0.8rem;
		margin: 0;
	}
	.note {
		color: var(--dim);
		font-size: 0.88rem;
		margin: 0;
	}
	.category-note {
		margin: 0;
	}

	.btn-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-top: 0.15rem;
	}
	.pending-hint {
		color: var(--dim);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
	}

	.feedback {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.76rem;
		padding: 0.35rem 0.6rem;
		border-radius: 4px;
		margin: 0;
	}
	.feedback.error {
		color: var(--amber);
		border: 1px solid var(--amber);
	}
	.feedback.notice {
		color: var(--green);
		border: 1px solid var(--line);
	}

	.overrides,
	.history,
	.debt {
		border: 1px solid var(--line);
		border-radius: 4px;
		padding: 0.3rem 0.6rem;
	}
	.overrides summary,
	.history summary,
	.debt summary {
		color: var(--dim);
		cursor: pointer;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		padding: 0.15rem 0;
	}
	.debt {
		border-color: var(--amber);
	}
	.debt summary {
		color: var(--amber);
	}
	.override-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		gap: 0.25rem;
		max-height: 14rem;
		overflow-y: auto;
		margin-top: 0.35rem;
	}
	.override-chip {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.4rem;
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 3px;
		color: var(--white);
		cursor: pointer;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		padding: 0.22rem 0.4rem;
		text-align: left;
	}
	.override-chip.flipped {
		border-color: var(--cyan);
		color: var(--cyan);
	}
	.override-email {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.bulk-results .rows {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		max-height: 16rem;
		overflow-y: auto;
		margin-top: 0.35rem;
	}
	.bulk-results .row {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		border-bottom: 1px solid var(--line);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		padding: 0.18rem 0;
	}
	.bulk-results .email {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--white);
	}
	.medium-chip {
		color: var(--dim);
		text-transform: uppercase;
		font-size: 0.6rem;
	}
	.medium-chip.digital {
		color: var(--cyan);
	}
	.txn-pos {
		color: var(--green);
	}
	.txn-neg {
		color: var(--amber);
		flex: 2;
		min-width: 0;
	}
</style>
