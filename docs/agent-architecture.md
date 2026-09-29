# Agent Architecture and Model Routing

This document records why the bundled agents are separated as they are, how the orchestrator should route work, and how to evaluate future model upgrades. It is decision context, not a substitute for the live profile definitions in `agents/*.md`.

## Source of Truth

- `agents/*.md` defines each agent's current model, thinking level, tools, permissions, and operating prompt.
- `pi-extension/subagents/index.ts` contains routing guidance visible to the main agent whenever it can call `subagent`.
- `pi-extension/subagents/plan-skill.md` defines the planning-to-execution workflow.
- `README.md` is the public summary.
- `test/test.ts` guards bundled profiles and critical routing rules against accidental drift.

When these disagree, fix them together. Do not update only the README or this document.

## Design Goal

Spend expensive reasoning where an error propagates across the workflow, and use cheaper models where the task is bounded and independently verifiable.

```text
GPT-5.6: established quality baseline for planning, review, research, and integration
GPT-6.1 Sol: main interaction and bounded Sol specialist roles
GPT-6 Luna: inexpensive reconnaissance and independently verifiable execution
```

This is role-based routing, not a claim that one model family is universally better.

## Evidence Behind the Decision

The configuration was chosen after two kinds of evidence were reviewed:

1. A local history sample of 45 subagent launches contained 15 review/audit tasks, 12 implementation tasks, 9 scout/trace tasks, and 6 external research tasks. Twenty-six launches had no matching profile. The clearest missing roles were external research and broad, inseparable integration work.
2. Informal Reddit comparisons consistently suggested that GPT-5.6 was more reliable for broad-context coding, planning, review, and complex integration, while GPT-6 mainly improved speed, quota use, and parallel throughput on tightly bounded work.

Relevant discussions reviewed at the time:

- [Luna 6, Sol 6, Sol 5.6, and Astra 6 on Plus](https://www.reddit.com/r/codex/comments/1wqg82q/)
- [Luna 5.6 vs Luna 6 Terminal-Bench report](https://www.reddit.com/r/codex/comments/1wr2dda/)
- [Luna 5.6 vs Luna 6 real-codebase A/B report](https://www.reddit.com/r/codex/comments/1wp7ckc/)
- [Sol/Luna 6 efficiency discussion](https://www.reddit.com/r/codex/comments/1wnhmfd/)
- [Sol 6 vs Sol 5.6 user comparison](https://www.reddit.com/r/codex/comments/1worwfr/)
- [OpenAI GPT-6.1 Sol announcement](https://openai.com/index/introducing-gpt-6-1-sol/)

These are directional signals, not scientific benchmarks. Samples were small, prompts and environments differed, and benchmark contamination was possible. OpenAI reports that GPT-6.1 Sol materially improves coding, computer use, factuality, and agent reliability over GPT-6 Sol, but does not publish a direct GPT-5.6 Sol comparison. Future changes must be validated against this repository's actual tasks rather than preserving these assignments indefinitely.

## Current Role Structure

### Decision and evidence roles

| Agent | Default model | Why |
|---|---|---|
| `planner` | GPT-5.6 Sol · High | Decomposes ambiguous work and makes decisions whose errors affect every later step. |
| `reviewer` | GPT-5.6 Sol · XHigh | Independently challenges correctness, security, scope, and regressions. |
| `deep-explorer` | GPT-5.6 Sol · XHigh | Investigates unclear failures where the relevant hypothesis is not known in advance. |
| `researcher` | GPT-5.6 Sol · High | Synthesizes external primary sources and reconciles conflicting evidence. |

### Execution and bounded specialist roles

| Agent | Default model | Why |
|---|---|---|
| `scout` | GPT-6 Luna · High | Current-repository reconnaissance is read-only, bounded, and cheap to verify. |
| `worker` | GPT-6 Luna · Max | Implements a planned, independently verifiable change at low quota cost. |
| `integrator` | GPT-5.6 Luna · Max | Owns one inseparable cross-module invariant where weak integration reasoning is costly. |
| `ephemeral-specialist` | GPT-6.1 Sol · Medium | Answers one narrow technical question without creating a permanent role. |
| `visual-tester` | GPT-6.1 Sol · High | Uses GPT-6.1's stronger computer-use performance for browser-based QA. |

The configured model for the main interactive session is **GPT-6.1 Sol · Low**. The main session interprets requests, retains conversation context, chooses agents, and judges their outputs; GPT-6.1 replaces GPT-6 Sol here because of its stronger coding, factuality, and agent-reliability results. Low is the Pi-supported equivalent of the requested light mode. Raise it temporarily for critical architecture or debugging rather than paying for deeper reasoning on every conversational turn.

GPT-5.6 Sol remains the quality baseline for `planner`, `researcher`, `reviewer`, and `deep-explorer` until controlled local A/B tasks show that GPT-6.1 Sol matches or improves their role-specific outcomes.

## Routing Rules

### Evidence routing

```text
Question answered from the current repository? → scout
Question requires external docs, repositories, specs, APIs, or web sources? → researcher
Root cause cannot be established by reading alone? → deep-explorer
One narrow technical judgment with a supplied role? → ephemeral-specialist
```

Do not use `researcher` as a slower scout. Do not ask `scout` to synthesize external evidence.

### Implementation routing

Start by trying to divide the change into independently verifiable worker tasks.

```text
Can each step be implemented and tested independently? → worker(s)
Would splitting risk one shared invariant or atomic cross-module flow? → integrator
```

File count does not select the integrator. A ten-file mechanical rename may be worker work; a three-file authentication transaction may require the integrator. A plan that selects `integrator` must name the invariant that cannot safely be split.

Run dependent workers sequentially in a shared working tree. Run workers in parallel only when their ownership and files do not overlap.

### Review routing

```text
worker or integrator finishes → reviewer
browser-visible behavior matters → visual-tester as an additional check
```

The reviewer is both the independent code reviewer and the proportional validation agent. It inspects staged, unstaged, and untracked changes; uses an explicit base or merge-base for committed work; traces affected behavior; and runs targeted tests before broad checks.

## Why Some Agents Do Not Exist

### No separate verifier

The reviewer already runs targeted tests, type checks, lint, or builds when relevant. A separate verifier would currently duplicate work. Add one only when mechanical validation becomes frequent enough to delay reviews, or when CI checks need to run independently from code judgment.

### No separate security reviewer

The reviewer applies security checks when changes touch authentication, authorization, secrets, untrusted input, payments, or sensitive data. Add a dedicated security role only when sensitive reviews become frequent, require a separate model/context, or must satisfy a compliance separation-of-duties rule.

### No generic frontend implementer

UI implementation belongs to `worker` or `integrator`; browser verification belongs to `visual-tester`. Add a frontend-specific agent only if repeated tasks need a stable specialist prompt that cannot be expressed as a skill or task instruction.

## Workflow Invariants

- Autonomous agents have `auto-exit: true` and do not spawn more agents.
- Read-only roles must not modify project files or external services.
- Workers implement an already bounded task; they do not redesign or expand scope.
- Integrators own one named cross-boundary invariant, not an entire vague feature.
- Reviewers never fix the code they review.
- Every implementation returns executable validation evidence.
- Reports are returned in the final assistant message; the orchestrator saves them only when a durable artifact is useful.

## Upgrade Playbook

Use this procedure when a new model or reasoning level becomes available:

1. **Select representative tasks by role.** Reuse real planner, scout, worker, integrator, researcher, and reviewer tasks. Do not evaluate every role with one generic coding benchmark.
2. **Run controlled A/B comparisons.** Keep the prompt, repository state, tools, and acceptance criteria identical.
3. **Measure the workflow outcome.** Record first-pass correctness, missed reviewer findings, steering turns, completion rate, elapsed time, and quota/cost. Do not optimize only for speed.
4. **Change one role at a time.** Quality dominates for planner/reviewer/integrator; efficiency has more weight for scout/worker/structured QA.
5. **Monitor and roll back.** Preserve the previous profile in git history and revert when real tasks show more retries, premature completion, or integration defects.

Do not promote a model because it wins a single benchmark. Prefer repeated success on the exact role's task distribution.

## Maintenance Checklist

When changing a role, model, or routing rule:

1. Update the relevant `agents/*.md` profile.
2. Update routing in `pi-extension/subagents/index.ts` or `plan-skill.md` when agent selection changes.
3. Synchronize `README.md`, this document, and model expectations in `test/test.ts`.
4. Run `npm test` and `git diff --check`; run `npm run test:integration` when extension lifecycle behavior changes.
5. Run `subagents_list` after reload and confirm the profile, model, and description are discoverable.

Before changing model IDs or thinking levels, verify the current Pi model catalog and provider support. Do not assume a model name or reasoning level remains available.

## Reconsideration Triggers

Revisit this architecture when any of these becomes true:

- Reviewer latency is dominated by deterministic command execution rather than analysis.
- Integrator tasks are routinely divisible after planning, indicating the role is overused.
- Workers repeatedly need steering or reviewers catch integration failures that one stronger worker model would have prevented.
- Research tasks require authenticated browser/API tooling that the current read-only Bash workflow cannot access safely.
- A new model changes the quality/cost frontier on representative local tasks.

The desired outcome is not the largest agent roster. Keep the smallest set of roles with distinct inputs, permissions, and success criteria.
