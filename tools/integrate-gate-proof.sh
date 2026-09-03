#!/usr/bin/env bash
#
# Proof for the LEDGER GATE in `.github/workflows/integrate.yml`.
#
# A green workflow file is not evidence. The gate decides whether a session
# branch is merged into `integration` and then DELETED, so the thing worth
# proving is its verdict on real git history, and this drives it against
# throwaway repositories built under `mktemp -d`. Nothing is pushed anywhere,
# no branch of this repository is touched, and the temporary tree is removed on
# exit however the run ends.
#
# HOW THE HARNESS AND THE WORKFLOW ARE KEPT FROM DRIFTING: they are not two
# things. This file contains NO copy of the gate. It CUTS the text between
# `# ledger_gate_marker:begin` and `# ledger_gate_marker:end` out of the
# workflow, strips the YAML block indentation, and sources that exact text -- so
# every case below is executed by the same characters GitHub executes. If the
# markers are missing, the cut comes back empty, the text is not valid shell, or
# it does not define `ledger_gate`, this script FAILS LOUDLY instead of falling
# back to a private copy. A harness quietly testing its own reimplementation of
# a rule is the failure mode this arrangement exists to make impossible.
#
# WHAT IT DOES NOT COVER, said plainly because a proof that overstates itself is
# worse than none: it drives `ledger_gate` directly, so it proves the FUNCTION's
# verdicts and not the CALL SITE. That the loop still calls it, still pushes its
# reason into `skipped`, and still `continue`s, is asserted here only as a
# structural grep over the workflow (case 0). It also does not exercise the
# Actions API, the merge, the push or the delete.
#
# THE CASE COUNT IS ASSERTED AT THE END, and that is not bookkeeping: before it,
# deleting every SKIP-direction case left `failed 0` and a green exit. Measured
# by removing one case, the run reports `passed 23, failed 0` and still exits 1.
#
# Usage:
#   tools/integrate-gate-proof.sh            run every case
#   tools/integrate-gate-proof.sh --show     also print the extracted gate text
#
# Exit status is 0 only when every case observed what it expected.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOW="$ROOT/.github/workflows/integrate.yml"
DIR='docs/prompt-ledger/entries'

pass=0
fail=0

# ---------------------------------------------------------------------------
# Case 0: the call site. A grep, and it says so in its own label -- the point
# is that a gate nobody calls proves nothing, and that fact is not observable
# from the function itself.
# ---------------------------------------------------------------------------
echo "== case 0: the workflow actually calls the gate (structural, by grep) =="
call_ok=yes
for needle in \
	'if ledger_reason="$(ledger_gate "$ref")"; then' \
	'skipped+=("$branch -- $ledger_reason")'
do
	if grep -qF -- "$needle" "$WORKFLOW"; then
		echo "  found: $needle"
	else
		echo "  MISSING: $needle"
		call_ok=no
	fi
done
if [ "$call_ok" = yes ]; then pass=$((pass + 1)); else fail=$((fail + 1)); fi
echo

# ---------------------------------------------------------------------------
# Extract the gate. The indentation to strip is read off the BEGIN marker line
# itself rather than hardcoded at ten spaces: re-indenting the YAML block is a
# legitimate edit, and a hardcoded width would answer it by silently cutting
# characters off the front of every line.
# ---------------------------------------------------------------------------
GATE_SRC="$(awk '
	/ledger_gate_marker:begin/ { match($0, /^ */); indent = RLENGTH; grab = 1; next }
	/ledger_gate_marker:end/   { grab = 0; next }
	grab                       { print substr($0, indent + 1) }
' "$WORKFLOW")"

if [ -z "${GATE_SRC//[[:space:]]/}" ]; then
	echo "FATAL: extracted nothing between the ledger_gate markers in $WORKFLOW" >&2
	exit 2
fi

GATE_FILE="$(mktemp)"
printf '%s\n' "$GATE_SRC" > "$GATE_FILE"

if ! bash -n "$GATE_FILE"; then
	echo "FATAL: the extracted gate text is not valid shell" >&2
	exit 2
fi

# `set -euo pipefail` is on in the workflow's run block, and the SIGPIPE comment
# inside the gate is only true under `pipefail` -- so the harness runs the gate
# under the same options the workflow does, or it is proving the function under
# conditions it never meets.
set -o pipefail
# shellcheck source=/dev/null
. "$GATE_FILE"
rm -f "$GATE_FILE"

if ! declare -F ledger_gate >/dev/null; then
	echo "FATAL: the extracted text did not define ledger_gate()" >&2
	exit 2
fi

if [ "${1:-}" = --show ]; then
	echo "---- extracted gate ----"
	printf '%s\n' "$GATE_SRC"
	echo "---- end ----"
	echo
fi

echo "extracted $(printf '%s\n' "$GATE_SRC" | wc -l | tr -d ' ') lines of gate from $WORKFLOW"
echo

# ---------------------------------------------------------------------------
# Fixtures.
# ---------------------------------------------------------------------------
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

git_q() { git -c advice.detachedHead=false "$@" >/dev/null 2>&1; }

# Writes one ledger entry in the real shape (`docs/prompt-ledger/README.md`
# "Entry format"). Status value NONE omits the line entirely, which is case 4.
write_entry() {
	local path="$1" value="$2" id
	id="$(basename "$path" .md | sed 's/-.*//')"
	{
		printf '# %s A fixture entry\n' "$id"
		printf -- '- Issued: 2026-09-02\n'
		printf -- '- By: tools/integrate-gate-proof.sh\n'
		printf -- '- Owns: `nothing at all`\n'
		printf -- '- Migration permitted: no. Highest on origin/main at issue: 0170\n'
		[ "$value" = NONE ] || printf -- '- Status: %s\n' "$value"
		printf -- '- Branch: fixture\n'
		printf -- '- Notes: written by the proof harness.\n'
	} > "$path"
}

# Builds a fresh repo with a real `origin` (a bare repo), so `origin/main` is a
# genuine remote-tracking ref and the gate reads exactly what it reads in CI --
# not a local branch standing in for one.
new_repo() {
	# Two statements, not one `local name=... repo=...`: bash creates every
	# name in a `local` list BEFORE assigning any of them, so the second word
	# would read an unset local under `set -u` and abort the run.
	local name="$1"
	local repo="$WORK/$name"
	mkdir -p "$repo"
	git_q init --bare "$WORK/$name.git"
	git_q init "$repo"
	git -C "$repo" config user.email proof@example.invalid
	git -C "$repo" config user.name 'Proof Harness'
	git -C "$repo" config commit.gpgsign false
	# The CRLF case below writes a blob with carriage returns in it and expects
	# them to survive into the object. A machine with `core.autocrlf=true` in its
	# global config would strip them on the way in and the case would prove
	# nothing while still passing.
	git -C "$repo" config core.autocrlf false
	git -C "$repo" remote add origin "$WORK/$name.git"
	mkdir -p "$repo/$DIR" "$repo/src"
	echo baseline > "$repo/src/app.txt"
	git -C "$repo" add -A
	git_q -C "$repo" commit -m 'baseline'
	git_q -C "$repo" branch -M main
	printf '%s\n' "$repo"
}

publish_main() {
	local repo="$1"
	git_q -C "$repo" push origin main
	git_q -C "$repo" fetch origin
}

# Cuts a branch off main, applies whatever the caller staged via a callback,
# pushes it, and fetches so `origin/<branch>` exists.
branch_with() {
	local repo="$1" branch="$2"; shift 2
	git_q -C "$repo" checkout -B "$branch" main
	( cd "$repo" && "$@" )
	git -C "$repo" add -A
	git_q -C "$repo" commit -m "work on $branch"
	git_q -C "$repo" push origin "$branch"
	git_q -C "$repo" fetch origin
	git_q -C "$repo" checkout main
}

# ---------------------------------------------------------------------------
# The assertion. `ledger_gate` returning 0 means SKIP (and prints the reason);
# returning 1 means MERGE. Both the verdict AND the reason text are printed, so
# a reader of this output can see what would land in the job summary.
# ---------------------------------------------------------------------------
check() {
	local label="$1" expect="$2" repo="$3" ref="$4"
	local out verdict rc=0
	out="$( cd "$repo" && ledger_gate "$ref" )" || rc=$?
	if [ "$rc" -eq 0 ]; then verdict=SKIP; else verdict=MERGE; fi
	if [ "$verdict" = "$expect" ]; then
		pass=$((pass + 1))
		printf 'ok    %-72s observed %-5s' "$label" "$verdict"
	else
		fail=$((fail + 1))
		printf 'FAIL  %-72s observed %-5s (expected %s)' "$label" "$verdict" "$expect"
	fi
	if [ -n "$out" ]; then printf '  reason: %s' "$out"; fi
	printf '\n'
}

# --- case 1 / case 2: the same branch, one word apart ----------------------
r="$(new_repo issued)"
write_entry "$r/$DIR/0011-a-fixture.md" deployed   # an unrelated, finished entry on main
git -C "$r" add -A; git_q -C "$r" commit -m 'entry 0011 on main'
publish_main "$r"
branch_with "$r" claude/still-running bash -c "
	printf 'work\n' >> src/app.txt
	$(declare -f write_entry)
	write_entry '$DIR/0012-in-flight.md' issued
"
check "1. the entry the branch ADDED says 'issued'" SKIP "$r" origin/claude/still-running

# The SAME branch, flipped. A second commit on the same branch is exactly what a
# session's final commit is, which is the transition this gate reads. It is also
# the proof that the entry is read AT THE TIP: the entry is still an `A` against
# the merge base, and its first committed value on this very branch said
# `issued`.
git_q -C "$r" checkout claude/still-running
write_entry "$r/$DIR/0012-in-flight.md" pushed
git -C "$r" add -A; git_q -C "$r" commit -m 'session final commit: pushed'
git_q -C "$r" push origin claude/still-running
git_q -C "$r" fetch origin
git_q -C "$r" checkout main
check "2. the same branch with that entry flipped to 'pushed'" MERGE "$r" origin/claude/still-running

# --- case 3: no entry at all ----------------------------------------------
# Main deliberately carries an entry reading `issued` that this branch never
# touched. A gate that read the DIRECTORY rather than the branch's own DIFF
# would skip here, so this is the positive control for the derivation.
r="$(new_repo no-entry)"
write_entry "$r/$DIR/0020-someone-elses-running-session.md" issued
git -C "$r" add -A; git_q -C "$r" commit -m 'another session entry on main'
publish_main "$r"
branch_with "$r" claude/no-ledger bash -c "printf 'work\n' >> src/app.txt"
check "3. branch introducing no entry (main holds an 'issued' one)" MERGE "$r" origin/claude/no-ledger

# --- case 4: entry present, no Status line --------------------------------
r="$(new_repo no-status)"
publish_main "$r"
branch_with "$r" claude/no-status bash -c "
	$(declare -f write_entry)
	write_entry '$DIR/0013-no-status-line.md' NONE
"
check "4. entry file exists but carries no 'Status:' line" MERGE "$r" origin/claude/no-status

# --- a free-text status ----------------------------------------------------
# The literal value entry 0006 carried for most of 2026-09-02, continuation line
# and all, recorded here as a FIXTURE: 0006 has since advanced to `deployed`, so
# this text is no longer in the tree and this case does not read it from there.
# It is the shape somebody writes whenever they have something true to say that
# the four states cannot carry. Normalising it must yield `partly`, not a parse
# error and not `issued`.
r="$(new_repo free-text)"
publish_main "$r"
branch_with "$r" claude/free-text bash -c "
	mkdir -p '$DIR'
	{
		printf '# 0006 Feedback form: capture a screenshot and what the reporter tried\n'
		printf -- '- Issued: 2026-09-02\n'
		printf -- '- Status: partly landed. Its MIGRATION is on \`origin/main\`; its client half is not\n'
		printf '  on any ref this session can see.\n'
		printf -- '- Branch: none on the remote.\n'
	} > '$DIR/0006-feedback-form-screenshot-and-tried.md'
"
check "5. a free-text 'partly landed. ...' value (0006's, as it read)" MERGE "$r" origin/claude/free-text

# --- two entries: NO ordering decides --------------------------------------
# Both directions, and both now SKIP: every entry the branch ADDED is asked and
# one `issued` among them is enough. 6a is the case the old "highest-numbered
# entry decides" rule got wrong -- it read 0012, merged, and deleted the branch
# of whatever session 0007 was describing. Two entries sharing an id used to be
# resolved by whichever slug sorted last, which is a coin toss; there is nothing
# left for a tie to decide.
r="$(new_repo two-entries-a)"
publish_main "$r"
branch_with "$r" claude/seven-issued-twelve-pushed bash -c "
	$(declare -f write_entry)
	write_entry '$DIR/0007-earlier.md' issued
	write_entry '$DIR/0012-later.md' pushed
"
check "6a. adds 0007=issued and 0012=pushed (one issued is enough)" SKIP "$r" origin/claude/seven-issued-twelve-pushed

r="$(new_repo two-entries-b)"
publish_main "$r"
branch_with "$r" claude/seven-pushed-twelve-issued bash -c "
	$(declare -f write_entry)
	write_entry '$DIR/0007-earlier.md' pushed
	write_entry '$DIR/0012-later.md' issued
"
check "6b. adds 0007=pushed and 0012=issued (one issued is enough)" SKIP "$r" origin/claude/seven-pushed-twelve-issued

# --- ADDED decides, MODIFIED does not: the merging direction ---------------
# The branch ADDS its own entry reading `pushed` and MODIFIES a higher-numbered
# entry belonging to somebody else that reads `issued` at the tip. 0100 is not
# this branch's to answer for, so it decides nothing and the branch merges. A
# gate reading every CHANGED entry -- or the highest-numbered changed one --
# would hold this branch open forever behind another session's status.
r="$(new_repo modifies-foreign-issued)"
write_entry "$r/$DIR/0100-someone-else-still-running.md" issued
git -C "$r" add -A; git_q -C "$r" commit -m 'entry 0100 on main'
publish_main "$r"
branch_with "$r" claude/adds-pushed-touches-issued bash -c "
	$(declare -f write_entry)
	write_entry '$DIR/0099-its-own.md' pushed
	write_entry '$DIR/0100-someone-else-still-running.md' issued
	printf 'a touch\n' >> '$DIR/0100-someone-else-still-running.md'
"
check "7. adds 0099=pushed, modifies 0100=issued (0100 is not its own)" MERGE "$r" origin/claude/adds-pushed-touches-issued

# --- a DELETION is not an add ---------------------------------------------
# A branch that deletes an entry standing on main. It is a `D` record, not an
# `A`, so it is not one of the entries this branch introduced and it decides
# nothing. THIS EXPECTATION CHANGED WITH THE ADD RULE and it is deliberate: the
# deletion is against the ledger README either way, but the thing that catches
# it is a person reading the diff, not a gate whose only lever is to hold a
# branch open. Case 21 is what keeps the unreadable-entry branch of the gate
# under a positive control now.
r="$(new_repo deleted-entry)"
write_entry "$r/$DIR/0015-about-to-vanish.md" pushed
git -C "$r" add -A; git_q -C "$r" commit -m 'entry 0015 on main'
publish_main "$r"
branch_with "$r" claude/deleted-its-entry bash -c "rm '$DIR/0015-about-to-vanish.md'"
check "8. branch deleted an entry standing on main (a D, not an A)" MERGE "$r" origin/claude/deleted-its-entry

# --- an unrecognised fifth word merges -------------------------------------
r="$(new_repo fifth-word)"
publish_main "$r"
branch_with "$r" claude/fifth-word bash -c "
	$(declare -f write_entry)
	write_entry '$DIR/0016-unknown-word.md' 'marinating'
"
check "9. a status word no tool recognises" MERGE "$r" origin/claude/fifth-word

# --- normalisation agrees with tools/idea-status.py ------------------------
# `.split()[0].strip(".,").lower()` -- so `Issued.` is `issued` and holds.
r="$(new_repo normalised)"
publish_main "$r"
branch_with "$r" claude/capitalised bash -c "
	$(declare -f write_entry)
	write_entry '$DIR/0017-capitalised.md' 'Issued.'
"
check "10. 'Issued.' normalises to the exact token" SKIP "$r" origin/claude/capitalised

# --- an unnumbered id is still an entry the branch added -------------------
# `retro-*` entries carry no leading number. Under the rule this replaces they
# sorted as 0 and were outvoted by any numbered entry; there is no vote now, so
# an added `retro-*` reading `issued` holds the branch exactly as 0018 would.
r="$(new_repo retro)"
publish_main "$r"
branch_with "$r" claude/retro-and-number bash -c "
	$(declare -f write_entry)
	write_entry '$DIR/retro-02-a-retrospective.md' issued
	write_entry '$DIR/0018-the-real-one.md' pushed
"
check "11. retro-02=issued alongside 0018=pushed (no id outranks another)" SKIP "$r" origin/claude/retro-and-number

# --- ADDED decides, MODIFIED does not: the holding direction ---------------
# THE SHAPE THIS WHOLE FIX EXISTS FOR, and it is not hypothetical: the branch
# that wrote this ADDED 0007 (`issued`, its own session, still running) and
# MODIFIED 0010 (`deployed`, somebody else's -- advancing another session's
# status is bookkeeping the ledger README asks for). Under "the highest-numbered
# CHANGED entry decides" the gate read 0010, never looked at 0007 at all, and
# merged and deleted a live session's branch. Extracted and run against this
# repository's own HEAD, that rule answered MERGE.
r="$(new_repo adds-issued-touches-deployed)"
write_entry "$r/$DIR/0010-somebody-elses-finished-work.md" pushed
git -C "$r" add -A; git_q -C "$r" commit -m 'entry 0010 on main'
publish_main "$r"
branch_with "$r" claude/adds-issued-touches-deployed bash -c "
	$(declare -f write_entry)
	write_entry '$DIR/0007-its-own.md' issued
	write_entry '$DIR/0010-somebody-elses-finished-work.md' deployed
"
check "12. adds 0007=issued, modifies 0010=deployed (the live-session shape)" SKIP "$r" origin/claude/adds-issued-touches-deployed

# --- CRLF ------------------------------------------------------------------
# `.gitattributes` records `core.autocrlf=true` on the authoring machine, so a
# blob with carriage returns in it is ordinary. `tools/idea-status.py` reads
# `- Status: issued\r` as `issued` because Python's `.split()` splits on `\r`;
# bash's `read` uses IFS and does not, so the gate compared `issued` plus a
# carriage return against `issued`, failed, and MERGED a live session's branch.
r="$(new_repo crlf)"
publish_main "$r"
branch_with "$r" claude/crlf-entry bash -c "
	mkdir -p '$DIR'
	printf '# 0021 A CRLF entry\r\n- Issued: 2026-09-02\r\n- Status: issued\r\n- Branch: fixture\r\n' \
		> '$DIR/0021-crlf.md'
"
check "13. entry written with CRLF line endings" SKIP "$r" origin/claude/crlf-entry

# --- a non-ASCII filename --------------------------------------------------
# Slugs are hand-written from prompt titles. `git diff --name-only` C-quotes any
# path carrying a non-ASCII byte (`core.quotePath` defaults true), so this
# arrived as `"docs/.../0012-caf\303\251.md"`, the anchored `sed` matched
# nothing, and an `issued` branch MERGED. `-c core.quotePath=false` plus `-z`.
r="$(new_repo non-ascii)"
publish_main "$r"
branch_with "$r" claude/non-ascii-entry bash -c "
	$(declare -f write_entry)
	write_entry \"\$(printf '%s/0012-caf\\303\\251.md' '$DIR')\" issued
"
check "14. entry filename carrying a non-ASCII byte" SKIP "$r" origin/claude/non-ascii-entry

# --- an entry one directory deeper -----------------------------------------
# The rule this replaces rebuilt `<dir>/<basename>` from an anchored `sed` that
# matched only the top level, so an entry filed in a subdirectory was invisible
# and an `issued` branch MERGED. The path now comes from the diff itself.
r="$(new_repo nested)"
publish_main "$r"
branch_with "$r" claude/nested-entry bash -c "
	$(declare -f write_entry)
	mkdir -p '$DIR/sub'
	write_entry '$DIR/sub/0012-a.md' issued
"
check "15. entry nested under entries/sub/" SKIP "$r" origin/claude/nested-entry

# --- adjacent punctuation --------------------------------------------------
# Only `.` and `,` were stripped, so every other adjacent mark failed OPEN and
# MERGED a branch that should have been held. The trim is now surrounding
# punctuation generally, which makes the gate's normaliser a strict SUPERSET of
# `tools/idea-status.py`'s rather than a disagreement with it.
r="$(new_repo punct-semicolon)"
publish_main "$r"
branch_with "$r" claude/punct-semicolon bash -c "
	$(declare -f write_entry)
	write_entry '$DIR/0022-semicolon.md' 'issued;'
"
check "16. 'issued;'" SKIP "$r" origin/claude/punct-semicolon

r="$(new_repo punct-quoted)"
publish_main "$r"
branch_with "$r" claude/punct-quoted bash -c "
	$(declare -f write_entry)
	write_entry '$DIR/0023-quoted.md' '\"issued\"'
"
check "17. '\"issued\"'" SKIP "$r" origin/claude/punct-quoted

# The other direction, and it is the one that keeps the widened trim honest: a
# trim that held everything would pass both cases above while having stopped
# reading the value at all. `"pushed"` must still normalise to `pushed`.
r="$(new_repo punct-quoted-pushed)"
publish_main "$r"
branch_with "$r" claude/punct-quoted-pushed bash -c "
	$(declare -f write_entry)
	write_entry '$DIR/0024-quoted-pushed.md' '\"pushed\"'
"
check "18. '\"pushed\"' (the widened trim still reads the word)" MERGE "$r" origin/claude/punct-quoted-pushed

# --- bullet and emphasis shapes --------------------------------------------
# `- Status:` was matched as one exact line shape, so an indented bullet and a
# bolded field name each failed OPEN.
r="$(new_repo indented-bullet)"
publish_main "$r"
branch_with "$r" claude/indented-bullet bash -c "
	mkdir -p '$DIR'
	printf '# 0025 An indented bullet\n- Issued: 2026-09-02\n  - Status: issued\n' \
		> '$DIR/0025-indented.md'
"
check "19. an indented '  - Status: issued' bullet" SKIP "$r" origin/claude/indented-bullet

r="$(new_repo bold-field)"
publish_main "$r"
branch_with "$r" claude/bold-field bash -c "
	mkdir -p '$DIR'
	printf '# 0026 A bolded field name\n- Issued: 2026-09-02\n- **Status**: issued\n' \
		> '$DIR/0026-bold.md'
"
check "20. a '- **Status**: issued' bullet" SKIP "$r" origin/claude/bold-field

# --- a value FOLDED onto the continuation line ------------------------------
# The one shape in which the gate's "strict superset of tools/idea-status.py"
# claim was FALSE, which is the direction that costs a running session its
# branch: the tool parses a continuation line and reads `issued`, and the gate
# read an EMPTY inline value and merged. Both directions are here, because a
# lookahead that fires unconditionally would swallow the NEXT field as this
# one's value.
r="$(new_repo folded-value)"
publish_main "$r"
branch_with "$r" claude/folded-issued bash -c "
	mkdir -p '$DIR'
	printf '# 0031 A folded value\n- Issued: 2026-09-02\n- Status:\n  issued\n- Branch: x\n' \
		> '$DIR/0031-folded.md'
"
check "23. a value folded onto the continuation line" SKIP "$r" origin/claude/folded-issued

r="$(new_repo folded-pushed)"
publish_main "$r"
branch_with "$r" claude/folded-pushed bash -c "
	mkdir -p '$DIR'
	printf '# 0032 A folded finished value\n- Issued: 2026-09-02\n- Status:\n  pushed\n- Branch: x\n' \
		> '$DIR/0032-folded.md'
"
check "24. a folded 'pushed' is still read, and merges" MERGE "$r" origin/claude/folded-pushed

r="$(new_repo folded-empty)"
publish_main "$r"
branch_with "$r" claude/folded-empty bash -c "
	mkdir -p '$DIR'
	printf '# 0033 An empty Status followed by the next field\n- Status:\n- Branch: issued\n' \
		> '$DIR/0033-folded.md'
"
check "25. an empty Status does not swallow the next field" MERGE "$r" origin/claude/folded-empty

# --- fails safe: an added path that is not a readable blob -----------------
# The gate's other skip-on-surprise branch, kept under a positive control. Git
# reports the path as ADDED and then cannot produce a blob for it at the tip --
# here a submodule gitlink, written with `update-index --cacheinfo` because
# nothing a person types produces this. It is contrived on purpose: a check that
# has never failed has not been tested, and this branch is otherwise unreachable
# now that only `A` records are read.
r="$(new_repo gitlink)"
publish_main "$r"
git_q -C "$r" checkout -B claude/gitlink-entry main
(
	cd "$r"
	printf 'work\n' >> src/app.txt
	git add -A
	git update-index --add --cacheinfo \
		160000,0000000000000000000000000000000000000001,"$DIR/0027-not-a-blob.md"
)
git_q -C "$r" commit -m 'an added entry path that is not a blob'
git_q -C "$r" push origin claude/gitlink-entry
git_q -C "$r" fetch origin
git_q -C "$r" checkout -f main
check "21. added entry path yields no blob at the tip (fails safe)" SKIP "$r" origin/claude/gitlink-entry


# --- fails safe: no merge base --------------------------------------------
# The gate's OTHER skip-on-surprise branch, named in the workflow's header and
# until now proved by nothing. An orphan branch shares no history with
# `origin/main`, so the three-dot diff has no base to compute and fails; git's
# exit status rides back as the final NUL record and the branch is left
# standing. This is also the case a command substitution would have hidden: it
# swallows the NULs, and with them the record carrying that status.
r="$(new_repo no-merge-base)"
publish_main "$r"
git_q -C "$r" checkout --orphan claude/orphan-branch
(
	cd "$r"
	git rm -rq --cached . || true
	rm -rf src "$DIR"
	mkdir -p "$DIR"
	printf 'unrelated\n' > unrelated.txt
)
git -C "$r" add -A
git_q -C "$r" commit -m 'an orphan branch'
git_q -C "$r" push origin claude/orphan-branch
git_q -C "$r" fetch origin
git_q -C "$r" checkout -f main
check "22. a branch with no merge base against origin/main (fails safe)" SKIP "$r" origin/claude/orphan-branch

# ---------------------------------------------------------------------------
# THE CASE COUNT. Without it, deleting every SKIP-direction case leaves
# `fail=0` and a green exit -- a sweep that generated nothing cannot be allowed
# to pass. The number is the count of `check` calls plus case 0, and it is
# raised deliberately by whoever adds a case. Case 6 is two of them.
# ---------------------------------------------------------------------------
EXPECTED_CASES=27
ran=$((pass + fail))

echo
echo "passed $pass, failed $fail"
if [ "$ran" -ne "$EXPECTED_CASES" ]; then
	echo "FAIL  case count: ran $ran, expected $EXPECTED_CASES (a case was added or lost without moving EXPECTED_CASES)"
	exit 1
fi
echo "ran $ran of $EXPECTED_CASES expected cases"
[ "$fail" -eq 0 ]
