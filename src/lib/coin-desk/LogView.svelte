<script lang="ts">
	import StatusChip from '$lib/ui/StatusChip.svelte';
	import { toneStyle } from '$lib/ui/status-tone';
	import { onMount, tick, untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import ClassSplit from '$lib/shell/ClassSplit.svelte';
	import { coins, COIN_DEPOSIT_CATEGORY_ID, COIN_SYMBOL, signedCoins } from '$lib/coin-format';
	import Disclosure from '$lib/Disclosure.svelte';
	import DebtPaymentPanel from './DebtPaymentPanel.svelte';
	import DeskHistory from './DeskHistory.svelte';
	import StudentCoinTools from './StudentCoinTools.svelte';
	import {
		callV2,
		cents,
		coinRefusalWords,
		NEVER_IN_LOG_PICKER,
		num as coinNum,
		reverseTransaction,
		type CoinRefusal,
		type DeskTxn
	} from './v2';
	import { COIN_TYPE_GLYPHS, COIN_TYPE_TONES, categoryTxnType } from './transaction-types';
	import {
		coinLogMode,
		EXTRA_CREDIT_GRADING_CATEGORIES,
		KIND_LABELS,
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
		type StudentSuggestion
	} from '$lib/coin-desk';
	import {
		isBulkEligible,
		rosterEmails,
		rosterStudentLabel,
		type BulkLogResponse,
		type ClassRoster,
		type ClassRosterStudent,
		type CoinClass
	} from './log';

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
		classes = [],
		prefs = {},
		onPrefs
	}: {
		categories: CoinCategory[];
		supabase: SupabaseClient;
		configured?: boolean;
		/**
		 * The IDEA Classroom classes this caller may log against: the layout's
		 * `coinStaff.sections` (0244's coin_staff_scope). A class's roster is
		 * read when it is picked, through the same coin_fine_roster the fine
		 * screen uses. The pre-V2 coin sections are retired (0251).
		 */
		classes?: CoinClass[];
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

	/**
	 * The load already filters to loggable categories; this is the active-only
	 * subset every picker below offers (a retired category stays readable in
	 * history but can never be logged again).
	 *
	 * THE PRICE LIST'S OWN ORDER, `coin_categories.sort_order`, exactly as the
	 * load asked for it. It used to lift a "most used" set to the top from a
	 * static table counted off the retired Sheets ledger's archive; that table
	 * is gone with the rest of the pre-V2 model, and the order an admin sets on
	 * the Economy page is now the one the picker shows. Typing still filters.
	 */
	const selectableCategories = $derived(
		categories.filter((c) => c.active !== false && !NEVER_IN_LOG_PICKER.has(c.id))
	);

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
	/**
	 * `coin_admin_lookup`'s answer. IDEA Coin V2 (0239): `balance` is the ONE
	 * balance (the digital sum), and a negative one is the debt. The two medium
	 * figures a pre-V2 database also sends are never read.
	 */
	interface CoinLookup {
		email: string;
		balance: number | string;
		wage_tier: number;
		eating_pass_active: boolean;
		eating_pass_strikes: number;
		/** V2 only; absent on an older database, which cannot tell. */
		no_shop_today?: boolean;
		recent_transactions: DeskTxn[];
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
	// ONE CLASS SELECTOR SERVES BOTH JOBS -- whose roster is on screen, and
	// which class a whole-class run targets. They were never two questions.
	// A class is an IDEA Classroom section; its roster is coin_fine_roster.
	// ---------------------------------------------------------------------
	let selectedSectionId = $state('');
	let roster = $state<ClassRosterStudent[]>([]);
	let rosterBusy = $state(false);
	let rosterError = $state('');
	/** Guards against a slow answer for a class the operator already left. */
	let rosterToken = 0;

	async function loadRoster(sectionId: string) {
		roster = [];
		rosterError = '';
		picked.clear();
		if (!sectionId) return;
		const token = ++rosterToken;
		rosterBusy = true;
		const r = await callV2<ClassRoster>(supabase, 'coin_fine_roster', { p_section_id: sectionId });
		if (token !== rosterToken) return;
		rosterBusy = false;
		if (r.kind === 'missing') {
			rosterError = 'Class rosters are not available until the database update lands. The search box still works: type a full email address.';
			return;
		}
		if (r.kind === 'error') {
			rosterError = r.message;
			return;
		}
		roster = r.data?.students ?? [];
	}

	function rosterLabel(r: ClassRosterStudent): string {
		return rosterStudentLabel(r);
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
				r.email.toLowerCase().includes(term) ||
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
	// email that has never signed in and is on no class roster, and losing
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
		const on = new Set(roster.map((r) => r.email.toLowerCase()));
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
		if (filteredRoster.length) return filteredRoster[0].email;
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
		for (const r of filteredRoster) picked.add(r.email);
	}

	// ---------------------------------------------------------------------
	// Target: one student, the students you picked, or a whole class.
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
	// Logging. Every write below is a call to an EXISTING RPC --
	// coin_log_transaction for flat/range/per_unit/variable categories, one of
	// the five dedicated RPCs otherwise (see coin-desk.ts), and
	// coin_bulk_log_students for a picked set or a whole class's roster --
	// never a direct table write,
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
	/** Ledger 0455: the coins a student handed in, for a Deposit. */
	let depositInput = $state<string | number>('');
	let gramsInput = $state<string | number>('');
	let noteText = $state('');

	function resetEntryFields() {
		selectedCategoryId = '';
		rangeAmount = '';
		quantityInput = '';
		variableAmount = '';
		pointsInput = '';
		gradingCategory = '';
		costDollarsInput = '';
		depositInput = '';
		gramsInput = '';
		noteText = '';
	}

	function onCategoryChange() {
		rangeAmount = '';
		quantityInput = '';
		variableAmount = '';
		pointsInput = '';
		gradingCategory = '';
		costDollarsInput = '';
		depositInput = '';
		gramsInput = '';
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
		} else if (c.id === COIN_DEPOSIT_CATEGORY_ID) {
			// The minimum is the server's (deposit_minimum); under it, it says so.
			need('cd-deposit', filled(depositInput) && Number.isInteger(num(depositInput)) && num(depositInput) > 0);
		} else if (c.id === 'three_d_printing') {
			need('cd-grams', filled(gramsInput) && num(gramsInput) >= 0);
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
	 * entered once, applies uniformly (log.ts / 0251), which is
	 * also why bulk needs no field the single-student flow does not already
	 * render.
	 */
	const eligibleForTarget = $derived(
		bulkTarget ? selectableCategories.filter(isBulkEligible) : selectableCategories
	);

	/** A whole-class run's emails: the roster on screen, normalized. */
	const classEmails = $derived(rosterEmails(roster));

	const hasSubject = $derived(
		target === 'student'
			? !!lookup
			: target === 'picked'
				? picked.size > 0
				: !!selectedSectionId && !rosterBusy && classEmails.length > 0
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

	function reasonMessage(r: CoinRefusal): string {
		return coinRefusalWords(r);
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

		// NO CALL NAMES p_medium: every row is digital (0239), and since 0251
		// none of these functions has the parameter at all.
		let resp: { data: unknown; error: { message: string } | null };
		if (category.id === 'perfect_score_graded_work') {
			resp = await supabase.rpc('coin_log_perfect_score', {
				p_email: email,
				p_points: Math.round(num(pointsInput)),
				p_note: noteOrNull()
			});
		} else if (category.id === 'pay_raise') {
			resp = await supabase.rpc('coin_log_pay_raise', {
				p_email: email,
				p_note: noteOrNull()
			});
		} else if (category.id === 'property_damage_careless') {
			resp = await supabase.rpc('coin_log_property_damage_careless', {
				p_email: email,
				p_cost_dollars: num(costDollarsInput),
				p_note: noteText.trim()
			});
		} else if (category.id === COIN_DEPOSIT_CATEGORY_ID) {
			resp = await supabase.rpc('coin_log_deposit', {
				p_email: email,
				p_amount: num(depositInput),
				p_note: noteOrNull()
			});
		} else if (category.id === 'three_d_printing') {
			resp = await supabase.rpc('coin_log_three_d_printing', {
				p_email: email,
				p_grams: num(gramsInput),
				// V2 charges by weight only; the parameter has no default.
				p_hours: null,
				p_overnight: false,
				p_note: noteOrNull()
			});
		} else if (category.id === 'extra_credit') {
			resp = await supabase.rpc('coin_log_extra_credit', {
				p_email: email,
				p_points: Math.round(num(pointsInput)),
				p_grading_category: gradingCategory,
				p_note: noteOrNull()
			});
		} else {
			resp = await supabase.rpc('coin_log_transaction', {
				p_email: email,
				p_category_id: category.id,
				p_amount:
					category.pricing_model === 'range'
						? cents(num(rangeAmount))
						: category.pricing_model === 'variable'
							? cents(num(variableAmount))
							: null,
				p_quantity: category.pricing_model === 'per_unit' ? num(quantityInput) : null,
				p_note: noteOrNull()
			});
		}

		entryBusy = false;
		if (resp.error) {
			entryError = resp.error.message;
			return;
		}
		const r = resp.data as CoinRefusal & { ok: boolean };
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
		const balance = r.balance == null ? '' : ` New balance: ${coins(coinNum(r.balance as number))}.`;
		if (cat.id === 'pay_raise') {
			return `Wage tier raised from ${r.previous_tier} to ${r.new_tier} for ${coins(coinNum(r.cost as number))}.${balance}`;
		}
		if (cat.id === 'extra_credit') {
			return `Logged ${r.points} points for ${coins(coinNum(r.cost as number))}.${balance}`;
		}
		if (cat.id === 'three_d_printing') {
			return `Logged ${signedCoins(coinNum(r.amount as number))} by weight.${balance}`;
		}
		if (cat.id === 'property_damage_careless') {
			return `Logged ${signedCoins(coinNum(r.amount as number))} (${coins(coinNum(r.base as number))} base plus ${coins(coinNum(r.exchange as number))} for the repair cost).${balance}`;
		}
		const amt = r.amount == null ? null : coinNum(r.amount as number);
		const strikeNote = r.strike === true ? ' It counts as an Eating Pass strike.' : '';
		return `Logged "${cat.name}" for ${amt !== null ? (cat.kind === 'fine' || cat.kind === 'purchase' ? signedCoins(-Math.abs(amt)) : signedCoins(amt)) : 'the entered amount'}.${balance}${strikeNote}`;
	}

	/**
	 * ONE round trip, ONE server-side transaction, whether the subject is a
	 * hand-picked set or a whole class (its roster's emails): both are
	 * coin_bulk_log_students. Never a client-side loop over
	 * coin_log_transaction: that can be interrupted partway leaving nobody
	 * able to say how many of the twenty students actually got logged.
	 */
	async function submitBulk() {
		if (!category) return;
		bulkError = '';
		bulkResponse = null;
		bulkBusy = true;
		const amount =
			category.pricing_model === 'range'
				? cents(num(rangeAmount))
				: category.pricing_model === 'variable'
					? cents(num(variableAmount))
					: null;
		const resp = await supabase.rpc('coin_bulk_log_students', {
			p_emails: target === 'picked' ? rosterEmails([...picked].map((email) => ({ email }))) : classEmails,
			p_category_id: category.id,
			p_amount: amount,
			p_note: noteOrNull()
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
		if (!selectedSectionId && classes.length) {
			selectedSectionId = classes[0].id;
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
					{coins(coinNum(cat.amount))} x each student's own wage tier. Paid per student, so a
					raised tier is honored without splitting the run.
				</p>
			{:else if lookup}
				<p class="preview">
					Amount: {coins(weeklyWagePreview(coinNum(cat.amount), lookup.wage_tier))}
					({coins(coinNum(cat.amount))} base x wage tier {lookup.wage_tier})
				</p>
			{:else}
				<p class="preview">{coins(coinNum(cat.amount))} x the student's wage tier.</p>
			{/if}
		{:else}
			<p class="preview">Fixed amount: {coins(coinNum(cat.amount))}</p>
		{/if}
	{:else if cat.pricing_model === 'range'}
		<div class="field-row">
			<label for="cd-range">
				Amount ({coins(coinNum(cat.min_amount))} to {coins(coinNum(cat.max_amount))})
			</label>
			<input
				id="cd-range"
				type="number"
				min={cat.min_amount}
				max={cat.max_amount}
				step="0.01"
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
				step="0.01"
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
				<label class="sr-only" for="cd-section">Class</label>
				<select
					id="cd-section"
					data-testid="cd-section"
					bind:value={selectedSectionId}
					onchange={() => loadRoster(selectedSectionId)}
				>
					<option value="">No class</option>
					{#each classes as c (c.id)}
						<option value={c.id}>{c.label}{c.students != null ? ` (${c.students})` : ''}</option>
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

			{#if rosterError}
				<p class="feedback error" data-testid="cd-roster-error">{rosterError}</p>
			{:else if rosterBusy}
				<p class="note">Loading roster&hellip;</p>
			{:else if !classes.length}
				<p class="note">
					No class has the coin economy on yet. Turn it on for a class under
					<a href="/coin/settings">Settings</a>, or type a full email address to log against
					anyone.
				</p>
			{:else if !selectedSectionId}
				<p class="note">
					Pick a class to list its roster, or type a full email address to log against anyone.
				</p>
			{:else if !roster.length}
				<p class="note">
					Nobody is on this class's coin roster. A roster comes from IDEA Classroom, and only a
					class with the coin economy on has one.
				</p>
			{:else}
				<ul class="roster" data-testid="cd-roster" class:selecting={selectMode}>
					{#each filteredRoster as r (r.email)}
						{@const isOpen = lookup?.email === r.email && !bulkTarget}
						<li>
							{#if selectMode}
								<label class="roster-pick" title={r.email}>
									<input
										type="checkbox"
										checked={picked.has(r.email)}
										onchange={(e) =>
											togglePick(r.email, (e.currentTarget as HTMLInputElement).checked)}
									/>
									<span class="roster-name">{rosterLabel(r)}</span>
								</label>
							{:else}
								<button
									type="button"
									class="roster-row"
									class:open={isOpen}
									aria-current={isOpen ? 'true' : undefined}
									title={r.email}
									onclick={() => chooseStudent(r.email)}
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
				Whole class
			</button>
		</div>

		<!-- THE COMPRESSED STUDENT STRIP. Everything the old summary card put
		     between the search and the form, on one line: it is context for the
		     entry, not a report. -->
		{#if target === 'student'}
			{#if lookup}
				<div class="strip" data-testid="cd-strip">
					<span class="strip-who">{lookup.email}</span>
					<span
						class="strip-total"
						class:negative={coinNum(lookup.balance) < 0}
						data-testid="cd-strip-balance"
					>
						{coins(coinNum(lookup.balance))}
					</span>
					{#if coinNum(lookup.balance) < 0}<span class="strip-meta debt-word">in debt</span>{/if}
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
				<label for="cd-section-target">Class</label>
				<select
					id="cd-section-target"
					data-testid="cd-class-target"
					bind:value={selectedSectionId}
					onchange={() => loadRoster(selectedSectionId)}
				>
					<option value="" disabled selected>Choose a class&hellip;</option>
					{#each classes as c (c.id)}
						<option value={c.id}>
							{c.label}{c.students != null ? ` (${c.students} student${c.students === 1 ? '' : 's'})` : ''}
						</option>
					{/each}
				</select>
			</div>
			{#if selectedSectionId && !rosterBusy}
				<p class="note" data-testid="cd-class-count">
					{classEmails.length} student{classEmails.length === 1 ? '' : 's'} on this class's roster.
				</p>
			{/if}
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
										style={toneStyle(COIN_TYPE_TONES[categoryTxnType(c)])}
										class:highlighted={i === highlighted}
										data-type={categoryTxnType(c)}
										onmousedown={() => pickCategory(c)}
										onmouseenter={() => (highlighted = i)}
									>
										<span class="combo-name">{c.name}</span>
										<!-- THREE SIGNALS, NONE OF THEM ALONE. The chip carries the
										     type's glyph, the type's tone and the type's WORD, so the
										     row is identifiable at a glance, in greyscale, and to a
										     screen reader, and no one of the three is load-bearing. -->
										<StatusChip
											tone={COIN_TYPE_TONES[categoryTxnType(c)]}
											paths={COIN_TYPE_GLYPHS[categoryTxnType(c)].paths}
						pathsName={COIN_TYPE_GLYPHS[categoryTxnType(c)].name}
											label={KIND_LABELS[c.kind]}
										/>
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
						<p class="preview">Preview: {coins(perfectScorePreview(num(pointsInput)))}</p>
					{/if}
				{:else if !bulkTarget && category.id === 'pay_raise' && lookup}
					<p class="preview">
						Current tier {lookup.wage_tier}. This purchase raises it to {lookup.wage_tier + 1} for
						{coins(payRaisePreview(lookup.wage_tier))} (the server re-checks the tier and the exact cost
						when it is logged).
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
						<p class="preview">Preview: {coins(propertyDamagePreview(num(costDollarsInput)))}</p>
					{/if}
				{:else if !bulkTarget && category.id === COIN_DEPOSIT_CATEGORY_ID}
					<div class="field-row">
						<label for="cd-deposit">Coins handed in (physical to digital)</label>
						<input
							id="cd-deposit"
							type="number"
							min="1"
							step="1"
							bind:value={depositInput}
							onkeydown={onFieldKeydown}
						/>
					</div>
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
					{#if filled(gramsInput)}
						<p class="preview">
							Preview: {coins(threeDPrintingPreview(num(gramsInput), 0, false).total)}, by weight only
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
						<p class="preview">Preview: {coins(cents(num(pointsInput) * coinNum(category.amount)))}</p>
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
							Preview: {coins(cents(num(quantityInput) * coinNum(category.amount)))}
						</p>
					{/if}
				{:else}
					{@render amountFields(category)}
				{/if}

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
							Log to {classEmails.length} student{classEmails.length === 1 ? '' : 's'} in this class
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
			<p class="note">Choose a class above. A class with nobody on its roster cannot be logged against.</p>
		{:else if target === 'picked'}
			<p class="note">Tick some students on the left.</p>
		{/if}

		{#if bulkResponse}
			<div class="bulk-results" data-testid="cd-bulk-results">
				<p class="feedback notice">
					Logged against {bulkResponse.total} student{bulkResponse.total === 1 ? '' : 's'}:
					{bulkResponse.succeeded} succeeded, {bulkResponse.refused} refused.
				</p>
				<div class="rows bulk-rows">
					{#each bulkResponse.results as r (r.email)}
						<div class="row" class:refused={!r.ok}>
							<span class="email">{r.email}</span>
							{#if r.ok}
								<span class="txn-pos">
									{r.amount != null ? signedCoins(coinNum(r.amount as number)) : 'logged'}
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
			{#if coinNum(lookup.balance) < 0}
				<!--
					BEHIND A DISCLOSURE FOR THE SAME REASON THE HISTORY IS, and this
					one was found by measurement rather than reasoning: logging a
					fine that takes a student negative made the panel appear, which
					grew the page past the viewport (1035px against 900) on the very
					next frame after a successful log. Paying a debt is an ACTION the
					operator sometimes takes, not a step in logging, and it must not
					be able to push the form.
					The debt itself is not hidden: the strip above reads the balance
					in amber, and this summary names it.
				-->
				<details class="debt" data-testid="cd-debt">
					<summary>
						Pay off debt (balance {coins(coinNum(lookup.balance))})
					</summary>
					<DebtPaymentPanel
						{supabase}
						email={lookup.email}
						balance={lookup.balance}
						onLogged={() => runLookup(lookup!.email, true)}
					/>
				</details>
			{/if}

			<!-- Closed on arrival for the no-scroll rule: standing, no shop today
			     and a purchase paid in coins are actions taken sometimes. -->
			<div class="tools-disclosure cdx-disc">
				<Disclosure
					label="Student tools"
					collapseWhen={true}
					testId="cd-tools"
				>
					<StudentCoinTools
						{supabase}
						email={lookup.email}
						balance={lookup.balance}
						wageTier={lookup.wage_tier}
						eatingPassActive={lookup.eating_pass_active}
						eatingPassStrikes={lookup.eating_pass_strikes}
						noShopToday={lookup.no_shop_today}
						{categories}
						onChanged={() => runLookup(lookup!.email, true)}
					/>
				</Disclosure>
			</div>

			<details class="history" data-testid="cd-history">
				<summary>
					Recent transactions ({lookup.recent_transactions.length})
				</summary>
				<DeskHistory
					transactions={lookup.recent_transactions}
					kinds={categoryKinds}
					reverse={(id) => reverseTransaction(supabase, id)}
					onReversed={() => runLookup(lookup!.email, true)}
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
		font-family: var(--font-display);
		font-size: 1rem;
		padding: 0.45rem 0.6rem;
	}
	.search-row input:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 1px;
	}
	.busy {
		font-family: var(--font-mono);
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
		font-family: var(--font-display);
		font-size: 0.85rem;
		padding: 0.3rem 0.45rem;
	}
	.inline-link {
		background: none;
		border: none;
		color: var(--cyan);
		cursor: pointer;
		font-family: var(--font-mono);
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
		font-family: var(--font-mono);
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
		font-family: var(--font-display);
		font-size: 0.9rem;
		text-align: left;
		/* 44px, the tap-target floor. It was 25.1px, measured: the roster is
		   how an operator picks a student for every single entry and the rows
		   sit directly against each other, so a mis-tap logs against the wrong
		   person. `min-height` and not `height`: a wrapped name is free to make
		   a row taller and never shorter. */
		min-height: 44px;
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
		font-family: var(--font-mono);
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
		font-family: var(--font-mono);
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
		font-family: var(--font-mono);
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
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--white);
	}
	.strip-total {
		font-family: var(--font-mono);
		font-size: 1.05rem;
		color: var(--green);
	}
	.strip-total.negative,
	.strip-meta.debt-word {
		color: var(--amber);
	}
	.strip-meta {
		font-family: var(--font-mono);
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
		font-family: var(--font-display);
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
	/* SPACE WHITE DRAWS NO BLUR (ledger 0360): the list lifts on the theme's
	   hard ledge instead of a heavy dark drop meant for a black page. */
	:global(:root[data-theme='space-white']) .combo-list {
		box-shadow: var(--elevation-2);
	}
	.combo-option {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		width: 100%;
		background: none;
		border: none;
		border-bottom: 1px solid var(--line);
		/* THE LEDGER'S CARD SIGNATURE, ON A ROW. `.coin-card` in the IDEA Coin
		   Ledger is a `--bg1` panel with `border-left: 3px solid <accent>`; a
		   picker row is the smallest thing that can wear the same stripe, and
		   it is what makes the list scannable by type once the order stops
		   being grouped by type. `transparent` is the default so a type with no
		   tone can never paint a stripe in the ink colour by accident. */
		color: var(--white);
		cursor: pointer;
		font-family: var(--font-display);
		text-align: left;
		/* 44px, the tap-target floor: this list is a phone's whole way of
		   choosing a category and the rows sit directly against each other. */
		min-height: 44px;
		padding: 0.4rem 0.55rem;
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
	.combo-price {
		color: var(--cyan);
		font-family: var(--font-mono);
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
	.field-row label {
		color: var(--dim);
		font-family: var(--font-mono);
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
		font-family: var(--font-display);
		font-size: 0.95rem;
		padding: 0.35rem 0.5rem;
		width: 100%;
	}

	.preview {
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
		font-family: var(--font-mono);
		font-size: 0.68rem;
	}

	.feedback {
		font-family: var(--font-mono);
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

	.history,
	.debt {
		border: 1px solid var(--line);
		border-radius: 4px;
		padding: 0.3rem 0.6rem;
	}
	.tools-disclosure {
		border: 1px solid var(--line);
		border-radius: 4px;
		padding: 0.3rem 0.6rem;
	}
	.history summary,
	.debt summary {
		color: var(--dim);
		cursor: pointer;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		/* 44px tall with the line: the summary is the control. */
		min-height: 44px;
		padding: 0.75rem 0;
		box-sizing: border-box;
	}
	.debt {
		border-color: var(--amber);
	}
	.debt summary {
		color: var(--amber);
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
		font-family: var(--font-mono);
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
	.txn-pos {
		color: var(--green);
	}
	.txn-neg {
		color: var(--amber);
		flex: 2;
		min-width: 0;
	}
</style>
