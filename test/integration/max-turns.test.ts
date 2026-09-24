// Opt-in: creates a real Pi child in the current mux and makes one model request.
// PI_TEST_MAX_TURNS=1 node --test test/integration/max-turns.test.ts
import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import extension, { __test__ } from "../../pi-extension/subagents/index.ts";
import { closeSurface } from "../../pi-extension/subagents/cmux.ts";

it("stops before a second model cycle and reports a partial result", {
  skip: process.env.PI_TEST_MAX_TURNS !== "1",
  timeout: 120_000,
}, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "pi-max-turns-"));
  const parent = join(dir, "parent.jsonl");
  const evidence = join(dir, "evidence.txt");
  const id = randomUUID();
  writeFileSync(parent, JSON.stringify({ type: "session", version: 3, id, timestamp: new Date().toISOString(), cwd: dir }) + "\n");
  writeFileSync(evidence, "MAX_TURNS_EVIDENCE\n");
  const tools: any[] = [];
  const handlers = new Map<string, Function>();
  const completed = Promise.withResolvers<any>();
  extension({
    on: (name: string, handler: Function) => handlers.set(name, handler),
    registerTool: (tool: any) => tools.push(tool),
    registerCommand() {}, registerShortcut() {}, registerMessageRenderer() {},
    sendMessage: (message: any, options: any) => {
      if (message.customType === "subagent_result") completed.resolve({ message, options });
    },
  } as any);
  t.after(() => {
    for (const running of __test__.runningSubagents.values()) {
      running.abortController?.abort();
      try { closeSurface(running.surface); } catch {}
    }
    handlers.get("session_shutdown")?.();
    rmSync(dir, { recursive: true, force: true });
  });

  const tool = tools.find((candidate) => candidate.name === "subagent");
  const launched = await tool.execute("max-turns-test", {
    name: "Max turns test",
    autoExit: true,
    maxTurns: 1,
    model: process.env.PI_TEST_MODEL ?? "openai-codex/gpt-6-luna",
    cwd: dir,
    tools: "read",
    task: `Your first response must call the read tool on ${evidence}. After the tool result, report its contents.`,
  }, undefined, undefined, {
    cwd: dir,
    sessionManager: { getSessionFile: () => parent, getSessionId: () => id, getSessionDir: () => dir },
  });

  assert.match(readFileSync(launched.details.launchScriptFile, "utf8"), /PI_SUBAGENT_MAX_TURNS=1/);
  const { message, options } = await completed.promise;
  assert.equal(message.details.status, "limit_reached");
  assert.equal(message.details.maxTurns, 1);
  assert.equal(message.details.completedTurns, 1);
  assert.equal(message.details.exitCode, 1);
  assert.match(message.content, /partial result, not a successful completion/);
  assert.equal(options.triggerTurn, true);

  const transcript = readFileSync(launched.details.sessionFile, "utf8");
  const assistantMessages = transcript.trim().split("\n").map((line) => JSON.parse(line))
    .filter((entry) => entry.message?.role === "assistant");
  assert.equal(assistantMessages.length, 1);
  assert.ok(assistantMessages[0].message.content.some((block: any) => block.type === "toolCall"));
});
