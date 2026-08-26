# Chat Handoff Standard

Governs every prompt this assistant writes for Mr. Pina to paste into a **new claude.ai chat**. This is the chat-surface counterpart to the Claude Code routing section in `IDEA_instructions.md`. CC prompts follow that section; new-chat kickoff prompts follow this one. Do not mix the two rubrics.

---

## When a handoff happens

Write a kickoff prompt (and follow this standard) whenever any of these occur:

1. **Scoped spinoff.** A sub-project deserves its own thread (e.g., a Unit 1 detail chat spun off from a course-planning chat).
2. **Continuation.** A multi-session workflow resumes in a fresh chat (e.g., grading sessions spanning days).
3. **Context reset.** The current chat is long, near usage limits, or has accumulated enough noise that a clean start is cheaper than continuing.
4. **Explicit request.** Mr. Pina asks for a prompt to start a new chat.

If Mr. Pina asks a question that clearly belongs in a new scoped chat, propose the handoff rather than answering in place.

---

## Mandatory routing header

Every kickoff prompt is immediately preceded by a one-line header in this exact shape:

`MODEL: <recommended> (min: <model>) | THINKING: <on/off> | EFFORT: <High/Extra/Max> - <one-line reason>`

Rules:

- The header lives in the surrounding chat text, directly above the pasteable block, never inside it. It tells Mr. Pina what to set before pasting; the new chat never reads it.
- **Recommended** is the model the task deserves. **Min** is the cheapest model that can still succeed. When they match, write `(min: same)`. Both are always stated - this is standing policy, not only for low-usage days.
- The one-line reason must name which routing row the task matches, so the stated row and the chosen model can be checked against each other at a glance.
- No kickoff prompt ships without the header. If Mr. Pina has to ask "what model and thinking level," that is a failure of this standard.

---

## Chat model routing

The claude.ai effort dial exposes **High** (default), **Extra**, and **Max** only. Low and medium are Claude Code labels and never appear in a chat header.

| Task profile of the new chat | Model | Thinking | Effort |
|---|---|---|---|
| Trivial lookups, short blurbs, format fixes | Haiku 4.5 | off | High |
| Bounded execution off a locked architecture: grading runs, spec'd builds, generating CC prompts from settled designs, iterative edits | Sonnet 5 | off | High |
| Well-scoped work needing careful reasoning: content authoring against fixed standards, rubric application, debugging, multi-file planning within a known structure | Opus 5 | on | High |
| Genuinely ambiguous first-draft architecture, evaluate-from-scratch questions, novel system or rubric design, vague briefs with real structural unknowns | Fable 5 | on | High or Extra |

Overrides:

- **Highest-scrutiny or hard-to-reverse work** (A-G reclassification drafting, anything submitted to UC, live-data migrations): bump one tier and set **Max**.
- **Thinking follows the adaptive-thinking framework**, same as always: ON for first-draft architecture, novel rubric design, multi-constraint planning, vague briefs; OFF for execution against a settled spec.
- **Ambiguity must be real.** Before routing to Fable, list what is actually undecided. If the list is minor polish rather than structural unknowns, it is an Opus chat.
- **Re-derive every time.** Classify each handoff on its own. Never inherit the tier of the chat that spawned it - a Fable planning chat routinely spawns Sonnet execution chats.

---

## Kickoff prompt content rules

The new chat starts with zero memory of the originating conversation beyond project knowledge, memory summaries, and past-chat search. Write the prompt accordingly:

1. **Self-contained.** State the task, the scope, and the boundary (what is explicitly out of scope) without assuming the new chat can see this one.
2. **Locked vs open.** List decisions already made as locked, so the new chat does not relitigate them. List open questions separately - those are the chat's actual work.
3. **Name the files.** Point to the exact project knowledge files the new chat must read before starting. If the task depends on a file built in the current chat, that file must be uploaded to project knowledge **before** the handoff; the prompt does not ship until the upload is confirmed. Flag any pending uploads explicitly.
4. **Past-chat pointers.** If the new chat needs history that lives only in conversation (logged data, prior grading records), instruct it by name to search past chats for the specific thread before proceeding, and state what it should find there.
5. **Workflow carryover.** Restate only the behavioral rules the new chat needs that are not already in project instructions. Do not duplicate what `IDEA_instructions.md` already enforces.
6. **Delivery format.** One directly-pasteable quoted block containing only what the new chat should read. Header above it, nothing extra inside it.

---

## After the handoff

- The originating chat stays open as the fallback. If the new chat asks for context it should have received, the fix is a patch to this standard, not a one-off answer.
- On request, this assistant reads the new chat back via past-chat tools to verify the handoff landed and to sync any decisions made there.
- Decisions made in the spinoff chat flow back through project knowledge updates, not through re-narration across chats.
