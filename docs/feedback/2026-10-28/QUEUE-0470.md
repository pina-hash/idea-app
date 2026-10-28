# Queue 0470: IdeaCAD sharing that works

Issued 2026-10-28 14:38 PT by Mr. Pina in the IDEA & FRC chat ("also do ... The IdeaCAD sharing thing").

Report 155bba3d (student, /ideacad, Oct 28, with a screenshot): "sharing sucks. theres no confirmation and typing manually sucks. just pickl and share. simple. smooth experience. and ensure many users per file"

What the screenshot shows (the student's screenshot is kept out of this public repo): the model's side panel has a SHARE WITH text field holding one typed school email, a PERMISSION select ("Can edit"), and an "Update sharing" button; nothing lists who the model is already shared with, and nothing confirms a change.

Wanted:
- Pick people from a searchable list (classmates and teammates first, by name with their picture, any Bosco Tech account by name or email), several at once, each with Can view or Can edit.
- A list of everyone the model is shared with, each with their permission, changeable and removable in place.
- A clear confirmation of every change ("Shared with 3 people", undo for a few seconds), never a silent update.
- Many people per model, with no limit a class team would hit.
- The same through the IDEA Website connector (share a model with people, list who has it, unshare).
- A shared person-picker: lane 0455 is building a user picker for tournament entries today. If it has landed on main, reuse it; if not, build one reusable component and say so in your history entry so 0455 or a later lane can adopt it. Never two pickers.
