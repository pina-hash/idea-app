# How IDEA project knowledge works
**Version 1.0 - 2026-10-17**

Mr. Pina's brief of 2026-10-17: every chat starts current, applies the right rules, and produces work that looks like IDEA today. This file is the map. It lives only here, in `pina-hash/idea-app`, and nothing else repeats it.

## The four layers, and what goes in each

| Layer | Holds | Read by | Authority | Changed by |
|---|---|---|---|---|
| Project instructions field (claude.ai) | About one page of rules true in every reply | every chat, always | `docs/project-instructions.md` in this repo | a chat edits the repo file; Mr. Pina pastes it into the field |
| Skills (his claude.ai account) | Procedures: how to do a kind of job | a chat whose request matches the skill's description, or `/name` | `docs/skills/<name>/SKILL.md` in this repo | a chat edits the repo file, then proposes it on a skill card he saves |
| Project knowledge | Facts: calendar, bell schedules, school and course context, coin economy as built, Drive library map, product context, policies, source PDFs and workbooks | every chat, by retrieval | the repo copy where one exists | a chat writes it with the Projects tool, repo first |
| The repo (`docs/standards/`, `CLAUDE.md`, `materials/`) | Full standards and rationale, Claude Code's rules, what students actually see | Claude Code sessions; chats when a skill sends them | itself | Claude Code or a chat's docs-only push to main |

Two more sources sit outside this table and are read as data: the design systems (Design System artifacts, one per brand) and claude.ai memory (facts Mr. Pina stated, filed per chat).

**Test for where a line goes.** True in every reply: the field. A step-by-step way of doing one kind of job: a skill. A fact that can be looked up: project knowledge. Rationale, history, Claude Code mechanics: the repo only.

## The design systems

- **IDEA Design System** (https://claude.ai/artifact/Gb9XpTcK43gZMGSkqy22xs; claude.ai has no default-design-system setting, so the instructions field names it by link): built 2026-10-17 from the live site's Plate (`src/lib/classroom/plate.css`) and the `space-white` theme, at main `4452876b`. Every IDEA deck, doc, design and page uses it.
- **FRC 5669 Techmen Design System**: FRC Team 5669 work.
- Retired: the July 2026 machined-palette system (the old "IDEA Design System" artifact, retitled), `IDEA_DS_DIGEST.md`, the identity half of `IDEA_CLAUDE_DESIGN_STANDARDS.md`, `HTML_ASSIGNMENT_BUILD_STANDARDS.md`.
- When the site's look changes, the IDEA Design System is re-synced from code in the same bundle (from-code re-sync, never a rebuild).

## Skills, and when each loads

| Skill | Loads when |
|---|---|
| idea-state-of-world | before any prompt, lane, or answer about what is on main, deployed, standing or owed |
| idea-code-prompt | writing any Claude Code or Codex prompt |
| idea-closeout | closing a chat or reconciling delivered standards files |
| deeper-not-bigger | before building a unit, assignment, deck or app feature; or `/deeper-not-bigger` |
| idea-design | anything visual, IDEA or FRC |
| idea-course-material | units, day plans, HTML assignments, rubrics, instructor notes, handouts |
| my-writing-style | anything sent as Mr. Pina, including morning announcement requests |
| deck-humor | the humor pass on a deck |
| uc-course-description | UC A-G CMP course descriptions |
| feedback-round (repo, Claude Code) | a feedback-console export |

A skill source changed in the repo is not live until Mr. Pina saves its card. The closeout pass compares each `docs/skills/*/SKILL.md` against the saved skill and proposes any that drifted.

## Staying current

- The field and every skill say: check current state before stating it (the site's build, main, the look, model names). A file's date is never evidence.
- Model names are written in exactly one place, the idea-code-prompt skill, and are updated there when a generation ships.
- Project knowledge copies of repo files are rewritten from main whenever the repo file changes, in the same turn.
- The scheduled task "IDEA ops morning check" (daily, 6:40 AM Pacific) reports stalled branches, deploy gaps and new decisions.

## Changelog

- **1.0 (2026-10-17)** - Created by the knowledge restructure. Field cut from 9,894 words to about 700; 34 of 51 project knowledge docs retired into skills or the repo; IDEA Design System rebuilt from the live Plate.
