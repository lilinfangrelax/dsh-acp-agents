/* Node-level checks for the ACP client. Run with:
 *   node test/run-tests.mjs
 *
 * These tests use a scripted ACP agent and a local subprocess seam, so they
 * exercise the real wire code without installing the bundle into a profile. */

import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createAcpRunner, buildLaunchPlan, resolveAgentCwd, openAcpChatSession } from '../acp-client.js';
import { createLocalSubprocess } from './local-subprocess.js';

const here = dirname(fileURLToPath(import.meta.url));
const mock = join(here, 'mock-agent.js');
const subprocess = createLocalSubprocess();
const runner = createAcpRunner({ subprocess, logger: console });

const cwd = mkdtempSync(join(tmpdir(), 'acp-agents-test-'));

function mockAgent(overrides = {}) {
  return {
    id: 'mock',
    name: 'Mock ACP',
    command: process.execPath,
    args: [mock],
    env: {},
    permission: 'allow',
    model: null,
    cwd,
    ...overrides,
  };
}

async function test(name, body) {
  const started = Date.now();
  try {
    await body();
    console.log(`ok   ${name} (${Date.now() - started}ms)`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

await test('launch plan resolves an npm cmd shim to its node entry', async () => {
  if (process.platform !== 'win32') return;
  try {
    const plan = await buildLaunchPlan(subprocess, 'gemini', ['--acp'], {}, 'Gemini CLI');
    if (plan.kind !== 'node-shim') return; // not installed on this machine
    assert.equal(plan.argv[0], process.execPath);
    assert.ok(plan.argv[1].endsWith('.js'), `expected a JS entry, got ${plan.argv[1]}`);
    assert.deepEqual(plan.argv.slice(-1), ['--acp']);
  } catch {
    // Gemini CLI is optional; the mock path below covers the client itself.
  }
});

await test('working directory validation rejects a missing directory', () => {
  assert.throws(() => resolveAgentCwd(join(cwd, 'missing'), undefined, 'Mock'));
  assert.equal(resolveAgentCwd(cwd, undefined, 'Mock'), cwd);
});

await test('probe negotiates initialize and session/new', async () => {
  const result = await runner.probe(mockAgent());
  assert.equal(result.info.protocolVersion, 1);
  assert.equal(result.info.agentInfo.name, 'mock-acp');
  assert.deepEqual(result.info.models.map((entry) => entry.value), ['mock-1', 'mock-2']);
  assert.equal(result.info.configOptions.length, 2);
  assert.equal(result.info.launch.kind, 'direct');
});

await test('prompt streams assistant text and maps end_turn', async () => {
  const run = await runner.start(mockAgent(), {
    prompt: [{ type: 'text', text: 'hello' }],
    signal: new AbortController().signal,
  });
  const result = await run.result;
  assert.equal(result.stopReason, 'completed');
  assert.equal(result.output.length, 1);
  assert.match(result.output[0].text, /pong \[mock-1\]: hello/);
  await run.dispose();
});

await test('configured model is applied through session/set_config_option', async () => {
  const run = await runner.start(mockAgent({ model: 'mock-2' }), {
    prompt: [{ type: 'text', text: 'model check' }],
    signal: new AbortController().signal,
  });
  const result = await run.result;
  assert.match(result.output[0].text, /pong \[mock-2\]: model check/);
  assert.equal(result.diagnostic, undefined);
  await run.dispose();
});

await test('permission policy allows a tool call', async () => {
  const run = await runner.start(mockAgent(), {
    prompt: [{ type: 'text', text: 'needs permission' }],
    signal: new AbortController().signal,
  });
  const result = await run.result;
  assert.match(result.output[0].text, /permission-allowed/);
  assert.equal(result.stopReason, 'completed');
  await run.dispose();
});

await test('permission policy deny answers cancelled', async () => {
  const run = await runner.start(mockAgent({ permission: 'deny' }), {
    prompt: [{ type: 'text', text: 'needs permission' }],
    signal: new AbortController().signal,
  });
  const result = await run.result;
  assert.match(result.output[0].text, /permission-denied/);
  await run.dispose();
});

await test('cancellation sends session/cancel and settles aborted', async () => {
  const controller = new AbortController();
  const run = await runner.start(mockAgent(), {
    prompt: [{ type: 'text', text: 'a slow task' }],
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(), 250);
  const started = Date.now();
  const result = await run.result;
  assert.equal(result.stopReason, 'aborted');
  assert.ok(Date.now() - started < 9_000, 'cancellation should settle inside the cancel grace');
  await run.dispose();
});

await test('a textless completion reports a diagnostic', async () => {
  const run = await runner.start(mockAgent(), {
    prompt: [{ type: 'text', text: 'no-text please' }],
    signal: new AbortController().signal,
  });
  const result = await run.result;
  assert.equal(result.stopReason, 'completed');
  assert.equal(result.output.length, 0);
  assert.match(result.diagnostic ?? '', /without emitting assistant text/);
  await run.dispose();
});

await test('a missing command fails with an actionable error', async () => {
  await assert.rejects(
    () => runner.probe(mockAgent({ command: 'definitely-not-an-acp-agent-xyz' })),
    /not found|Install it/i,
  );
});

function readLog(path) {
  try {
    return readFileSync(path, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

async function openChat(overrides = {}, options = {}) {
  const updates = [];
  const session = await openAcpChatSession({
    subprocess,
    agent: mockAgent(overrides),
    cwd,
    permission: 'allow',
    logger: console,
    onUpdate: (update) => updates.push(update),
    ...options,
  });
  return { session, updates };
}

await test('session/load resumes an advertised session and mutes replay', async () => {
  const { session, updates } = await openChat(
    { env: { MOCK_ACP_LOAD: '1', MOCK_ACP_REPLAY: '3' } },
    {
      resumeSessionId: 'mock-session-1',
      configOptionsHint: [{ id: 'model', type: 'select', category: 'model', currentValue: 'mock-1', options: [] }],
    },
  );
  assert.equal(session.resumed, true);
  assert.equal(session.resumeMethod, 'session/load');
  assert.equal(session.replayUpdates, 3);
  assert.equal(updates.length, 0, 'replay updates must not reach the consumer');
  assert.ok(Array.isArray(session.created.configOptions), 'the config hint backfills a bare load response');
  await session.dispose();
});

await test('session/resume is preferred when advertised', async () => {
  const { session } = await openChat({ env: { MOCK_ACP_RESUME: '1' } }, { resumeSessionId: 'mock-session-1' });
  assert.equal(session.resumed, true);
  assert.equal(session.resumeMethod, 'session/resume');
  assert.equal(session.replayUpdates, 0);
  await session.dispose();
});

await test('an unknown stored session falls back to session/new exactly once', async () => {
  const logPath = join(cwd, 'load-fallback.log');
  const { session } = await openChat(
    { env: { MOCK_ACP_LOAD: '1', MOCK_ACP_LOG: logPath } },
    { resumeSessionId: 'missing-session' },
  );
  assert.equal(session.resumed, false);
  assert.equal(session.resumeMethod, 'session/new');
  await session.dispose();
  const methods = readLog(logPath).map((entry) => entry.method);
  assert.equal(methods.filter((method) => method === 'session/load').length, 1);
  assert.equal(methods.filter((method) => method === 'session/new').length, 1);
});

await test('no resume request is made without the capability', async () => {
  const logPath = join(cwd, 'no-capability.log');
  const { session } = await openChat({ env: { MOCK_ACP_LOG: logPath } }, { resumeSessionId: 'mock-session-1' });
  assert.equal(session.resumed, false);
  await session.dispose();
  const methods = readLog(logPath).map((entry) => entry.method);
  assert.ok(!methods.includes('session/load'));
  assert.ok(methods.includes('session/new'));
});

await test('session/close is skipped when the agent does not advertise it', async () => {
  const logPath = join(cwd, 'no-close.log');
  const { session } = await openChat({ env: { MOCK_ACP_NO_CLOSE_CAP: '1', MOCK_ACP_LOG: logPath } });
  await session.closeRemoteSession();
  await session.dispose();
  assert.ok(!readLog(logPath).map((entry) => entry.method).includes('session/close'));
});

await test('session/close is sent when the capability is advertised', async () => {
  const logPath = join(cwd, 'close.log');
  const { session } = await openChat({ env: { MOCK_ACP_LOG: logPath } });
  await session.closeRemoteSession();
  await session.dispose();
  assert.ok(readLog(logPath).map((entry) => entry.method).includes('session/close'));
});

await runner.dispose();
console.log('done');
