# Results 0441: one lab computer, one line on the website

The website half is live with this push. The app half (Armory 0.5.1) is built and on idea-armory main, not published. Publishing is yours (steps at the bottom).

- Server: migration 0310, on main and applied to production.
- Website: the Team, Files and Checked out views group by computer. The commit that carries this file, on idea-app main.
- App: Armory 0.5.1 on idea-armory main (`fe83ebb`). Each computer sends its per-computer code with every heartbeat.

## What you will see

- **Team view:** a new Computers list under the people. One line per computer, with everyone who used it, the most recent first ("Used by 4 people: Ana Reyes, Diego Marin, ...").
- **Two lab computers imaged alike and both named IDEA-06** are two lines, "IDEA-06 (3fa1)" and "IDEA-06 (b2c4)". The four characters come from each computer's code.
- **Files and Checked out:** every check out made on one shared computer carries that computer's one label.
- **Until a computer runs 0.5.1** it sends no code, and the website groups it by its name, exactly as today. During the changeover one shared computer can show two lines (one for people already on 0.5.1, one for the rest) until everyone on it has opened 0.5.1.

## Privacy

The code is a hash of the computer's Windows ID and network address, never either one. The website never receives even the hash: each project gets its own 12-character token, so a computer cannot be linked across projects. A member sees computers only for projects they are in, the same devices as before. Proved by breaking the access check and the token on purpose (the tests went red) and restoring the file byte for byte.

## Checked

- Website tests: every Armory test green. The full suite has 17 failures in 7 files outside Armory (certifications, coin stocks, Foundry schedule, class page layout, HTML manifests, IdeaCAD trash); they fail the same way on main without this change, so they are already on the site's main and worth a separate look. Type check at the baseline (0 errors, 33 warnings).
- Visual pass at 375 and 1440 wide: 32 runs, 1072 measurements, 0 outside threshold, no sideways scroll.
- App: 1415 tests passed against a real database, 0 failed; the Windows-only tests ran in CI on a draft pull request that was closed, never merged.

## Not checked

- A real 0.5.1 computer against the live site. The first lab computer on 0.5.1 is the first real proof.
- The live Team view signed in.

## Publish Armory 0.5.1

1. Open https://github.com/pina-hash/idea-armory/releases/new
2. Choose a tag: type `v0.5.1`, then click "Create new tag: v0.5.1 on publish".
3. Target: `main`.
4. Title: `IDEA Armory v0.5.1`. Leave the description empty.
5. Click "Publish release".

Computers on 0.5.0 update on their own. Within a few minutes of a lab computer opening 0.5.1, its Team view line shows "Armory 0.5.1" and everyone who used it on one line.
