---
name: plan
description: >
  Planning workflow. Gathers only the codebase context needed, then uses the
  interactive planner to produce a proportional implementation plan. Use when
  asked to plan, brainstorm, or design a change. Requires the subagents
  extension and a supported multiplexer.
---

# Plan

Produce a plan proportional to the task. Simple changes get a short plan; ambiguous, cross-cutting, or risky changes get deeper discussion.

## Flow

1. Assess the request and inspect enough of the repository to focus discovery.
2. Spawn a scout only when codebase facts are not already known.
3. Spawn the interactive planner with the request and gathered evidence.
4. Review the plan with the user.
5. If approved, execute its scoped tasks sequentially with workers.
6. Review the resulting changes.

Do not require every phase when its input or output already exists.

## Artifacts

When a durable plan is useful, use `.pi/plans/YYYY-MM-DD-<name>/`:

- `scout-context.md` — optional; the orchestrator saves the scout's returned report.
- `plan.md` — written by the planner when a path is provided.
- `review.md` — optional; the orchestrator saves the reviewer's returned report.

If writing is unavailable, pass and return the content inline. Never claim an artifact exists unless it was written.

## Scout When Needed

Skip the scout when the relevant code and constraints are already established. Otherwise ask one bounded discovery question:

```typescript
subagent({
  name: "🔍 Scout",
  agent: "scout",
  task: `For [requested change], identify the current entrypoint, flow, relevant files, existing patterns, and genuine unknowns. Return the complete report in your final message; do not create a report file.`,
});
```

Wait for automatic result delivery. As the orchestrator, save the returned report only if useful, then pass it to the planner.

## Planner

```typescript
subagent({
  name: "💬 Planner",
  agent: "planner",
  interactive: true,
  task: `Plan: [user request]

Verified context:
[paste scout findings and relevant user decisions]

Save the final plan to: .pi/plans/YYYY-MM-DD-<name>/plan.md`,
});
```

The planner uses the short path by default. The user only needs to interact when a real decision is unresolved. When planning is complete, the user exits the planner session with Ctrl+D.

If planning materially expands into an uninspected subsystem, gather one additional bounded scout report before execution.

## Review the Plan

Read the plan and summarize its scope, ordered tasks, verification, and material risks. Ask the user for approval only when execution was not already requested or a material choice remains open.

## Execute

Pass each ordered plan step directly to a worker with its acceptance criteria. Run workers sequentially in a shared working tree.

```typescript
subagent({
  name: "🔨 Worker 1/N",
  agent: "worker",
  task: "Implement [task and acceptance criteria]. Plan: [plan path or inline plan]. Verified context: [relevant evidence]",
});
```

After each result, verify it before starting the next dependent step. A worker commits only when explicitly requested.

## Review Changes

```typescript
subagent({
  name: "Reviewer",
  agent: "reviewer",
  interactive: false,
  task: "Review the changes against [plan path or inline plan]. Return the complete review in your final message; do not create a report file.",
});
```

Fix evidence-backed critical/high findings. Re-review only when fixes are substantial.

## Completion Check

- The plan matches the request and verified code.
- Every executed step has validation evidence.
- Material reviewer findings are resolved or explicitly accepted.
- Commits exist only when requested.
