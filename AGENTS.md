# Delivery OS Agent Instructions

## Implementation status

`docs/planning/implementation-roadmap.md` is the single source of truth for implementation status.
Do not add, update, or rely on a status value in the delivery backlog, an execution packet, a
validation record, an issue, or a pull request.

For each module implementation:

1. Before making implementation changes, verify in the roadmap that every dependency is `Complete`
   with a stable evidence link, and that the module has an assigned owner.
2. In the same change that starts implementation, set the module to `In Progress` in both the
   roadmap summary and its detailed wave section.
3. Before marking work complete, run and record all mapped acceptance, validation, security,
   accessibility, migration, and operational checks. Link the resulting validation record from the
   roadmap and use `In Validation` while assessing the exit gate.
4. Set `Complete` only after the exit gate passes. If it does not pass, use `Blocked` and record an
   owner, opened date, clearing condition, and linked issue or decision in the roadmap.
5. Do not begin the next dependent module's implementation until the preceding module is
   `Complete` in the roadmap and its validation evidence is linked.

Keep the roadmap summary and affected wave section synchronized in every status-changing change.
