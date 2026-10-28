# Assignment sources

The `.src.html` source of every IDEA HTML assignment built on `tools/hx-kit/`, one folder per course:
`assignment-sources/<course>/<slug>.src.html` (for example `assignment-sources/idea209h/launcher-design.src.html`).

- **Why here:** a built page can be rebuilt on a newer kit only from its source. Until 2026-10-28 sources lived only in the authoring chat and in Library C, and the Drive connector cannot take large files, so a chat could neither archive its sources nor find another chat's (Launcher: Design's source had to be rebuilt from the built file).
- **What it holds:** the source only. The built page is reproducible with `node tools/hx-kit/build.mjs`, and the live built page is what the classroom exports into `materials/`, which only the app writes.
- **This repository is public.** A source holds the manifest, the rubric and the page, never an answer, a name or a grade, which is why it may live here. A source that would carry anything about a student does not belong here.
- The authoring chat commits its source here, straight to `main`, in the same session it re-uploads the post (standard Part I). Library C keeps a copy when the Drive connector can take the file.
