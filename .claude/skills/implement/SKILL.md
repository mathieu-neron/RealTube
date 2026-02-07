---
name: implement
description: Check current progress and implement the next step. Reads the plan and status files, picks the next pending step, implements it, verifies it, and updates the tracker.
user-invocable: true
---

# /implement - RealTube Implementation Orchestrator

You are implementing the RealTube project step by step. Follow this workflow exactly.

## Arguments

- If invoked as `/implement` (no arguments): implement the next pending step.
- If invoked as `/implement N` (with a step number): implement that specific step.

## Workflow

### 1. Read the plan and status

Read both files:
- `docs/implementation-plan.md` - the full plan with all step details
- `docs/implementation-status.md` - current progress tracker

### 2. Determine which step to implement

- If a step number was provided as an argument, use that step.
- Otherwise, find the first step with status `pending` in `implementation-status.md`.
- If a step has status `in-progress`, resume that step instead.
- If all steps are `done`, report that implementation is complete.

### 3. Read relevant design docs

Each step in the plan references specific design docs. Before implementing, read those design docs from `docs/design/`. This is critical for getting the implementation details right.

### 4. Mark the step as in-progress

Update `docs/implementation-status.md`:
- Change the step's status from `pending` to `in-progress`
- Add today's date

### 5. Implement the step

- Create or modify the files listed in the step description
- Follow the project structure and patterns from the design docs
- If previous steps have established patterns (e.g., how the Go handlers are structured), follow those patterns for consistency
- Keep the implementation focused on exactly what the step describes - no more, no less

### 6. Verify the step

Run the verification command described in the step. Fix any issues until verification passes.

### 7. Update the status tracker

Update `docs/implementation-status.md`:
- Change the step's status from `in-progress` to `done`
- Add today's date in the Date column
- Add any relevant notes (e.g., "had to adjust X because Y", "also created Z")
- Update the Summary counts at the bottom

### 8. Stop and report

After completing one step, **stop**. Report to the user:
- Which step was completed
- What was created/modified
- Verification results
- What the next step will be

Do NOT continue to the next step automatically. Let the user review and invoke `/implement` again when ready.

## Important Rules

- **One step at a time.** Never implement more than one step per invocation.
- **Read design docs first.** Every step references design docs for a reason.
- **Verify before marking done.** If verification fails, fix the issue. Don't mark as done until it passes.
- **Update status accurately.** The status file is the source of truth for progress.
- **Follow existing patterns.** If earlier steps established conventions, follow them.
- **If blocked**, mark the step as `blocked` in the status with an explanation in the Notes column, and tell the user what's needed to unblock.
- **Use available plugins.** If MCP servers or other plugins are installed, use their tools when they'd help with implementation (e.g., fetching up-to-date library docs, querying APIs). Prefer plugin-provided tools over manual alternatives when available.
