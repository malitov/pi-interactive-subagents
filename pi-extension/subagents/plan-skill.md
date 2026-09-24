---
name: plan
description: >
  Planning workflow. Runs a pre-flight scout, then spawns the planner agent
  which clarifies WHAT to build and figures out HOW, with the ability to
  spawn its own scouts/researchers mid-session. Use when asked to "plan",
  "brainstorm", "I want to build X", or "let's design". Requires the
  subagents extension and a supported multiplexer (cmux/tmux/zellij).
---

# Plan

A planning workflow. A scout maps the relevant codebase, then an interactive planner clarifies intent + requirements and designs the technical approach, producing a `plan.md` and todos.

**Announce at start:** "Let me take a quick look, then I'll send a scout to map the codebase before we start the planning session."

---

## The Flow

```
Phase 1: Quick Assessment (main session — 30s orientation)
    ↓
Phase 2: Scout (autonomous — codebase context)
    ↓
Phase 3: Spawn Planner Agent (interactive — clarifies WHAT, plans HOW, creates todos)
    ↓
    (Planner may spawn its own scouts/researchers mid-session as needed)
    ↓
Phase 4: Review Plan & Todos (main session)
    ↓
Phase 5: Execute Todos (workers — receive plan + scout context)
    ↓
Phase 6: Review
```

---

## Phase 1: Quick Assessment

Quick orientation — just enough to give the scout a focused mission:

```bash
ls -la
find . -type f -name "*.ts" | head -20  # or relevant extension
cat package.json 2>/dev/null | head -30
```

Spend ~30 seconds. Tech stack, project shape, and the area relevant to the user's request. This tells you what to ask the scout to focus on.

---

## Artifact Paths

For a planning run, pick a short `<name>` (e.g. `auth-redesign`) and use a shared directory under `.pi/plans/YYYY-MM-DD-<name>/` for every deliverable. Scout and reviewer return reports in their final messages; the orchestrator writes those reports to the paths below when needed. Only ask agents with a suitable write tool and role permissions, such as planner, to create their own artifacts.

Standard filenames:

- `.pi/plans/YYYY-MM-DD-<name>/scout-context.md`
- `.pi/plans/YYYY-MM-DD-<name>/plan.md`
- `.pi/plans/YYYY-MM-DD-<name>/review.md` (optional, for reviewer output)

---

## Phase 2: Scout

**Always spawn a scout before the planner.** The scout's context feeds into the planning session — it lets the planner skip re-asking questions whose answers live in the code, and gives it a solid base to design from.

```typescript
subagent({
  name: "🔍 Scout",
  agent: "scout",
  task: `Analyze the codebase for [user's request area]. Map file structure, key modules, patterns, conventions, and existing code related to [feature area]. Focus on what a planner would need to understand before designing this feature.

Return your complete findings in your final message. Do not create a report file.`,
});
```

**Wait for the scout's automatic result delivery.** As the orchestrator, save the returned report to `.pi/plans/YYYY-MM-DD-<name>/scout-context.md` using your own `write` tool, then pass the findings to the planner. If writing is unavailable, pass the report inline and do not claim a file exists.

The planner can spawn **additional** scouts or researchers mid-session if it hits a factual gap. That's expected — don't try to pre-scout every possible area.

---

## Phase 3: Spawn Planner Agent

Spawn the interactive planner with the scout's context and the user's request. The planner handles everything from here: clarifying intent, compact requirements engineering, ISC, approach exploration, design validation, premortem, plan artifact, and todos.

```typescript
subagent({
  name: "💬 Planner",
  agent: "planner",
  interactive: true,
  task: `Plan: [what the user wants to build]

Scout context:
[paste scout findings here — file structure, conventions, patterns, relevant code]

Save the final plan to: .pi/plans/YYYY-MM-DD-<name>/plan.md
Create todos tagged with: <name>`,
});
```

**The user works with the planner.** It will clarify requirements lightly (1-2 rounds of questions, not a deep spec session), propose approaches, validate the design, run a premortem, write the plan, and create todos with mandatory code examples.

When done, the user presses Ctrl+D and the plan + todos are returned to the main session.

### The planner may spawn its own specialists

During the session, the planner can spawn:
- **`scout`** — when a design decision depends on existing code it hasn't read
- **`researcher`** — when a decision depends on external facts (library tradeoffs, best practices, API behaviors)

These are internal to the planning session. You'll see them in the multiplexer but don't need to intervene.

### Optional: extra scout after planning

If the planner significantly changed scope (new subsystems, areas the original scout didn't cover), spawn another scout targeting the new areas before workers start:

```typescript
subagent({
  name: "🔍 Scout (updated scope)",
  agent: "scout",
  task: "The plan changed scope. Gather context for [new areas]. Read the plan at [plan path]. Focus on [specific files/modules the planner identified that weren't in the original scout].",
});
```

Fold the new context into the worker tasks.

---

## Phase 4: Review Plan & Todos

Once the planner closes, read the plan and list todos:

```typescript
todo({ action: "list" });
```

Review with the user:

> "Here's what the planner produced: [brief summary]. Ready to execute, or anything to adjust?"

---

## Phase 5: Execute Todos

Spawn workers sequentially. Each worker gets the plan path and scout context:

```typescript
// Workers execute scoped tasks sequentially — one at a time
subagent({
  name: "🔨 Worker 1/N",
  agent: "worker",
  task: "Implement [task details and acceptance criteria]. Plan: [plan path]\n\nScout context: [paste scout summary from Phase 2, plus any re-scout from Phase 3]",
});

// Check the result, update orchestration state, then start the next task
subagent({
  name: "🔨 Worker 2/N",
  agent: "worker",
  task: "Implement [next task details and acceptance criteria]. Plan: [plan path]\n\nScout context: [paste scout summary]",
});
```

**Always run workers sequentially in the same git repo** — parallel workers can conflict in the shared working tree.

---

## Phase 6: Review

After all todos are complete:

```typescript
subagent({
  name: "Reviewer",
  agent: "reviewer",
  interactive: false,
  task: "Review the recent changes. Plan: [plan path]. Return the complete review in your final message; do not create a report file.",
});
```

After the reviewer returns, the orchestrator may save its report to `.pi/plans/YYYY-MM-DD-<name>/review.md` using its own `write` tool. Otherwise keep it inline; do not ask the reviewer to write it.

Triage findings:

- **P0** — Real bugs, security issues → fix now
- **P1** — Genuine traps, maintenance dangers → fix before merging
- **P2** — Minor issues → fix if quick, note otherwise
- **P3** — Nits → skip

Create todos for P0/P1, run workers to fix, re-review only if fixes were substantial.

---

## ⚠️ Completion Checklist

Before reporting done:

1. ✅ Scout ran before the planner?
2. ✅ Scout context was passed to the planner?
3. ✅ All worker tasks completed and verified?
4. ✅ Any explicitly requested commits created?
5. ✅ Reviewer has run?
6. ✅ Reviewer findings triaged and addressed?
