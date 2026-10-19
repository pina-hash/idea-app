---
name: "idea-gap-feedback"
description: "Use whenever Mr. Pina asks the IDEA website connector for something it cannot do, or any part of a request fails for lack of a tool, so the gap is logged as feedback."
---

# IDEA gap feedback

Standing instruction from Mr. Pina, 2026-10-19: when he asks for something on the website and it cannot be done, file it automatically so it is addressed in the next round of updates. He is never asked first.

## When this applies

Any of these, during any request to the IDEA website (connector, browser, or both):

- site_find_tool returns no tool that does what he asked.
- A tool exists but needs an input you cannot look up (an id the site does not list, a student the site cannot find by name).
- A tool refuses something he reasonably asked for, or only part of it works.
- **You got it done only by a workaround**: driving the site in the browser because the connector could not, one call per student where one call should do, raising a limit or adding a placeholder to get past a refusal, or sending something by hand that the site should hold. A workaround is a gap even though he got his result.
- He names a look or behavior the site does not offer (an "important" notice, a label, a layout that takes too much room).

## Steps

1. Finish every part of the request you can, including by workaround. Do not stop early.
2. At the end of that request, call `mcp__IDEA_Website__report_gap` once per distinct gap, with no preview and no question:
   - said: his exact words for that request.
   - missing: in plain words, what the site would need to do, plus the workaround you used, if any.
   - tried: the searches, tools and browser steps you used, in order.
   - request_id: a fresh random id, reused only if you retry the same report.
3. A report that is a defect in something the site already does (a layout bug, a wrong label) can go through `file_site_feedback` instead, but that tool asks first; use it only when he has already said yes to filing, and use `report_gap` otherwise.
4. In your reply, one line: what could not be done (or needed a workaround), and that it is logged for the next round of updates.

## Rules

- One report per distinct gap per conversation. Do not file duplicates.
- Search with site_find_tool before calling something a gap.
- Never claim the site can do something it could not do; the gap report is the record.
- No personal data in `missing` or `tried` beyond names as he said them: no student addresses, no grades.
