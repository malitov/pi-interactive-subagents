// Opt-in: creates a real Pi child in the current mux and makes one model request.
// PI_TEST_AUTO_EXIT=1 node --test test/integration/auto-exit.test.ts
import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import extension, { __test__ } from "../../pi-extension/subagents/index.ts";
import { closeSurface } from "../../pi-extension/subagents/cmux.ts";

it("returns a standalone child's final answer without subagent_done or a reminder", {
  skip: process.env.PI_TEST_AUTO_EXIT !== "1",
  timeout: 120_000,
}, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "pi-auto-exit-"));
  const parent = join(dir, "parent.jsonl");
  const id = randomUUID();
  writeFileSync(parent, JSON.stringify({ type: "session", version: 3, id, timestamp: new Date().toISOString(), cwd: dir }) + "\n");
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
  const tool = tools.find((tool) => tool.name === "subagent");
  assert.ok(tool.parameters.properties.autoExit);
  const launched = await tool.execute("auto-exit-test", {
    name: "Auto-exit test", autoExit: true,
    model: process.env.PI_TEST_MODEL ?? "openai-codex/gpt-6-luna",
    cwd: dir, tools: "read",
    task: "Reply with AUTO_EXIT_OK. Do not call any tools, including subagent_done or caller_ping. This tests automatic completion.",
  }, undefined, undefined, {
    cwd: dir,
    sessionManager: { getSessionFile: () => parent, getSessionId: () => id, getSessionDir: () => dir },
  });
  assert.equal(launched.details.status, "started");
  assert.match(readFileSync(launched.details.launchScriptFile, "utf8"), /PI_SUBAGENT_AUTO_EXIT=1/);
  const { message, options } = await completed.promise;
  assert.equal(message.details.exitCode, 0);
  assert.match(message.content, /AUTO_EXIT_OK/);
  assert.equal(options.triggerTurn, true);
  const transcript = readFileSync(launched.details.sessionFile, "utf8");
  const calls = transcript.trim().split("\n").map((line) => JSON.parse(line))
    .filter((entry) => entry.message?.role === "assistant")
    .flatMap((entry) => entry.message.content)
    .filter((block) => block.type === "toolCall");
  assert.equal(calls.length, 0, "Completion must not depend on the model calling a tool");
});
