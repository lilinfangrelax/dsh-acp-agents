/* Manager-level integration checks with a fake Cordis context and a temporary
 * DSH home. Run with: node test/manager-test.mjs
 *
 * This exercises configuration persistence, provider/tool registration,
 * detection, connection tests, and reload behavior without installing the
 * bundle into a live profile. */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAcpManager } from '../manager.js';
import {
  DEFAULT_MAX_IDLE_CONNECTIONS,
  configPath,
  loadConfig,
  loadSessionRecords,
  normalizeMaxIdleConnections,
  normalizeSessionRecord,
  saveSessionRecords,
} from '../store.js';
import { createLocalSubprocess } from './local-subprocess.js';

const here = dirname(fileURLToPath(import.meta.url));
const mock = join(here, 'mock-agent.js');
const home = mkdtempSync(join(tmpdir(), 'acp-agents-home-'));
const cwd = mkdtempSync(join(tmpdir(), 'acp-agents-ws-'));
process.env.DSH_HOME = home;

function fakeContext(records) {
  const subprocess = createLocalSubprocess();
  const llm = {
    registerAdapter(providers, adapter) {
      records.llmProviders = [...providers];
      records.llmAdapter = adapter;
      const dispose = () => {
        records.llmProviders = [];
        records.llmAdapter = null;
      };
      dispose.replace = (next) => {
        records.llmProviders = [...next];
      };
      return dispose;
    },
    async resolveCallConfig(selection) {
      records.resolved = selection;
      return selection;
    },
  };
  return {
    logger: { info() {}, warn() {}, debug() {} },
    subprocess,
    get(name) {
      if (name === 'workingDirectory') return { defaultDirectory: cwd };
      if (name === 'llm') return llm;
      if (name === 'subprocess') return subprocess;
      if (name === 'agents') {
        return {
          get(id) {
            // 'cascade-session' stays free of ACP turns, so the cascade test can
            // still assert the pending skeleton while 'live-session' keeps the
            // connection its earlier chat turn opened.
            if (id !== 'live-session' && id !== 'cascade-session') return undefined;
            return {
              id,
              session: { header: { cwd } },
              model: {
                current: () => records.selected ?? undefined,
                recordedSelection: () => records.recorded ?? null,
                select: (selection) => {
                  records.selected = { ...selection };
                  records.recorded = { ...selection };
                },
              },
            };
          },
        };
      }
      if (name === 'connection') return undefined;
      return undefined;
    },
    subagents: {
      registerProvider(provider) {
        records.providers.add(provider.name);
        return () => records.providers.delete(provider.name);
      },
      startActivation(spec) {
        records.activations.push(spec);
        return Promise.resolve({ childId: 'mock-child-id' });
      },
    },
    tools: {
      register(definition) {
        records.tools.add(definition.name);
        return () => records.tools.delete(definition.name);
      },
    },
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

const records = { providers: new Set(), tools: new Set(), activations: [], llmProviders: [], llmAdapter: null, selected: null, recorded: null, resolved: null };
const ctx = fakeContext(records);
const manager = createAcpManager(ctx);

await test('startup loads an empty configuration and a candidate catalog', async () => {
  const state = await manager.start();
  assert.equal(state.config.agents.length, 0);
  assert.ok(Array.isArray(state.candidates) && state.candidates.length > 5);
  assert.ok(records.tools.has('acp_agents'));
  assert.equal(records.tools.has('acp_delegate'), false);
});

await test('adding an agent persists it and registers provider and tool', async () => {
  const state = await manager.saveAgent({
    name: 'Mock ACP',
    command: process.execPath,
    args: [mock],
    enabled: true,
    permission: 'allow',
    source: 'manual',
  });
  assert.equal(state.config.agents.length, 1);
  const agent = state.config.agents[0];
  assert.equal(agent.name, 'Mock ACP');
  assert.equal(agent.available, true);
  assert.ok(records.providers.has(`acp:${agent.id}`));
  assert.ok(records.tools.has('acp_delegate'));
  assert.equal(state.config.defaultAgent, agent.id);
  assert.deepEqual(records.llmProviders, [`acp-${agent.id}`]);
  assert.equal(typeof records.llmAdapter.listModels, 'function');
  globalThis.agentId = agent.id;
});

await test('a chat turn persists the Harness to ACP session mapping', async () => {
  const sessionFile = join(home, 'acp-agents', 'sessions.json');
  const chunks = [];
  for await (const chunk of records.llmAdapter.stream({
    provider: `acp-${globalThis.agentId}`,
    model: 'default',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'persist me' }] }],
    sessionId: 'live-session',
    signal: new AbortController().signal,
  })) {
    chunks.push(chunk);
  }
  assert.ok(chunks.some((chunk) => chunk.type === 'finish'));
  await waitFor(() => existsSync(sessionFile));
  const document = JSON.parse(readFileSync(sessionFile, 'utf8'));
  assert.ok(document.sessions['live-session'].acpSessionId.startsWith('mock-session-'));
  assert.equal(document.sessions['live-session'].agentId, globalThis.agentId);
  assert.equal(document.sessions['live-session'].cwd, cwd);
});

await test('connection test records a successful handshake', async () => {
  const { test: result } = await manager.testAgent(globalThis.agentId);
  assert.equal(result.ok, true, result.error || '');
  assert.equal(result.protocolVersion, 1);
  assert.equal(result.agentInfo.name, 'mock-acp');
  const state = await manager.state();
  assert.equal(state.config.agents[0].lastTest.ok, true);
});

await test('the composer picker lists the enabled agent', async () => {
  const list = await manager.listAgents();
  assert.equal(list.agents.length, 1);
  assert.equal(list.agents[0].id, globalThis.agentId);
  assert.equal(list.agents[0].available, true);
  assert.equal(list.defaultAgent, globalThis.agentId);
});

await test('dispatch starts a parent-delivered activation', async () => {
  const result = await manager.dispatch({
    agentId: globalThis.agentId,
    task: 'hello from composer',
    sessionId: 'live-session',
  });
  assert.equal(result.subagentId, 'mock-child-id');
  assert.equal(result.agentId, globalThis.agentId);
  const spec = records.activations.at(-1);
  assert.equal(spec.delivery, 'parent');
  assert.equal(spec.provider, `acp:${globalThis.agentId}`);
  assert.equal(spec.request.parent.id, 'live-session');
  assert.equal(spec.request.prompt[0].type, 'text');
  assert.equal(spec.request.prompt[0].text, 'hello from composer');
});

await test('dispatch rejects an absent session and an empty task', async () => {
  await assert.rejects(
    () => manager.dispatch({ agentId: globalThis.agentId, task: 'x', sessionId: 'missing' }),
    /not live/i,
  );
  await assert.rejects(
    () => manager.dispatch({ agentId: globalThis.agentId, task: '   ', sessionId: 'live-session' }),
    /task is required/i,
  );
});

async function waitFor(predicate, timeoutMs = 5000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('timed out waiting for the ACP workspace event');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

await test('the ACP workspace opens, streams, and keeps its own options', async () => {
  const chat = await manager.workspace.open({
    agentId: globalThis.agentId,
    model: 'default',
    permission: 'allow',
  });
  assert.equal(chat.agentId, globalThis.agentId);
  assert.ok(Array.isArray(chat.models) && chat.models.length >= 2);
  assert.ok(Array.isArray(chat.configOptions));
  const events = [];
  const unsubscribe = manager.workspace.subscribe(chat.id, 0, (event) => events.push(event));
  await manager.workspace.send({ chatId: chat.id, text: 'workspace hello' });
  await waitFor(() => events.some((event) => event.kind === 'done'));
  assert.ok(events.some((event) => event.kind === 'user' && event.text === 'workspace hello'));
  const streamed = events.filter((event) => event.kind === 'assistant').map((event) => event.delta).join('');
  assert.match(streamed, /pong.*workspace hello/);
  assert.equal(manager.workspace.state().chats.length, 1);
  await manager.workspace.setOptions({ chatId: chat.id, permission: 'deny' });
  assert.equal(manager.workspace.state().chats[0].permission, 'deny');
  await manager.workspace.close({ chatId: chat.id });
  unsubscribe();
  assert.equal(manager.workspace.state().chats.length, 0);
});

await test('the native session cascade applies the ACP route and options', async () => {
  // A session id with no ACP turn behind it, so "no turn has run yet" below
  // still holds: the chat test above already prompted on 'live-session' and
  // leaves a live connection there.
  const result = await manager.applySession({
    sessionId: 'cascade-session',
    agentId: globalThis.agentId,
    model: 'default',
    permission: 'deny',
    config: { mode: 'plan' },
  });
  assert.equal(result.provider, `acp-${globalThis.agentId}`);
  assert.equal(result.model, 'default');
  assert.equal(records.resolved.provider, `acp-${globalThis.agentId}`);
  assert.equal(records.selected.provider, `acp-${globalThis.agentId}`);
  const state = manager.sessionState('cascade-session');
  assert.equal(state.provider, `acp-${globalThis.agentId}`);
  assert.equal(state.options.permission, 'deny');
  assert.deepEqual(state.options.config, { mode: 'plan' });
  // No turn has run yet: the header still needs the agent name, but must not
  // pretend there is a live ACP connection.
  assert.equal(state.acp.pending, true);
  assert.equal(state.acp.connected, false);
  assert.equal(state.acp.agent.id, globalThis.agentId);
  assert.ok(state.acp.agent.name.length > 0);
});

await test('registry refresh fills the catalog without breaking candidates', async () => {
  try {
    const state = await manager.refreshRegistry();
    assert.ok(state.registry && state.registry.agents.length > 10);
    assert.ok(state.candidates.some((candidate) => candidate.name === 'OpenCode'));
  } catch (error) {
    console.log(`skip registry refresh (network): ${error.message}`);
  }
});

await test('editing the model keeps one provider registration', async () => {
  const before = (await manager.state()).config.agents[0];
  const state = await manager.saveAgent({
    id: before.id,
    name: before.name,
    command: before.command,
    args: before.args,
    enabled: true,
    permission: 'allow',
    model: 'mock-2',
  });
  assert.equal(state.config.agents.length, 1);
  assert.equal(state.config.agents[0].model, 'mock-2');
  assert.equal(records.providers.size, 1);
  assert.equal(records.tools.size, 2);
});

await test('a second manager instance reloads the persisted configuration', async () => {
  const reloadedRecords = { providers: new Set(), tools: new Set() };
  const reloaded = createAcpManager(fakeContext(reloadedRecords));
  const state = await reloaded.start();
  assert.equal(state.config.agents.length, 1);
  assert.equal(state.config.agents[0].model, 'mock-2');
  assert.ok(reloadedRecords.providers.has(`acp:${globalThis.agentId}`));
  await reloaded.dispose();
});

await test('the composer preference is persisted and reloaded', async () => {
  const saved = await manager.saveSelection({
    lane: 'native',
    native: { provider: 'deepseek-official', model: 'deepseek-reasoner', reasoningEffort: 'high' },
  });
  assert.equal(saved.selection.lane, 'native');
  assert.equal(saved.selection.native.model, 'deepseek-reasoner');
  assert.equal(saved.selection.native.reasoningEffort, 'high');
  assert.equal(manager.sessionState('live-session').selection.lane, 'native');
  const reloaded = createAcpManager(fakeContext({ providers: new Set(), tools: new Set(), activations: [] }));
  await reloaded.start();
  assert.equal(reloaded.sessionState('any').selection.native.model, 'deepseek-reasoner');
  await reloaded.dispose();
});

await test('an ACP apply records the choice and a fresh session restores it', async () => {
  await manager.applySession({
    sessionId: 'live-session',
    agentId: globalThis.agentId,
    model: 'mock-2',
    permission: 'deny',
    config: { mode: 'plan' },
  });
  const remembered = manager.sessionState('live-session').selection;
  assert.equal(remembered.lane, 'acp');
  assert.equal(remembered.acp.agentId, globalThis.agentId);
  assert.equal(remembered.acp.model, 'mock-2');
  assert.equal(remembered.acp.permission, 'deny');
  assert.deepEqual(remembered.acp.config, { mode: 'plan' });

  records.recorded = null;
  const restored = await manager.restoreSession({ sessionId: 'live-session' });
  assert.equal(restored.restored, true);
  assert.equal(restored.provider, `acp-${globalThis.agentId}`);
  assert.equal(restored.model, 'mock-2');
  assert.deepEqual(restored.options.config, { mode: 'plan' });
  assert.equal(restored.explicit, true);

  records.recorded = { provider: 'deepseek-official', model: 'deepseek-chat' };
  const skipped = await manager.restoreSession({ sessionId: 'live-session' });
  assert.equal(skipped.restored, false);
});

await test('switching to native keeps the remembered ACP choice', async () => {
  const saved = await manager.saveSelection({
    lane: 'native',
    native: { provider: 'deepseek-official', model: 'deepseek-chat' },
  });
  assert.equal(saved.selection.lane, 'native');
  assert.equal(saved.selection.native.model, 'deepseek-chat');
  assert.equal(saved.selection.acp.agentId, globalThis.agentId);
  assert.equal(saved.selection.acp.permission, 'deny');
});

await test('a fresh session exposes the native choice for the composer to reapply', async () => {
  records.recorded = null;
  const result = await manager.restoreSession({ sessionId: 'live-session' });
  assert.equal(result.restored, false);
  assert.equal(result.selection.lane, 'native');
  assert.equal(result.selection.native.model, 'deepseek-chat');
});

await test('removing an agent unregisters its provider and the delegation tool', async () => {
  const state = await manager.removeAgent(globalThis.agentId);
  assert.equal(state.config.agents.length, 0);
  assert.equal(records.providers.size, 0);
  assert.equal(records.tools.has('acp_delegate'), false);
  assert.ok(records.tools.has('acp_agents'));
  assert.deepEqual(records.llmProviders, []);
  const sessionFile = join(home, 'acp-agents', 'sessions.json');
  await waitFor(() => {
    if (!existsSync(sessionFile)) return true;
    return !('live-session' in JSON.parse(readFileSync(sessionFile, 'utf8')).sessions);
  });
});

await test('the idle-connection cap defaults to five and clamps user values', async () => {
  assert.equal(DEFAULT_MAX_IDLE_CONNECTIONS, 5);
  assert.equal(normalizeMaxIdleConnections(undefined), 5);
  assert.equal(normalizeMaxIdleConnections('3'), 3);
  assert.equal(normalizeMaxIdleConnections(2.7), 2);
  assert.equal(normalizeMaxIdleConnections(-4), 0);
  assert.equal(normalizeMaxIdleConnections(999), 50);
  const saved = await loadConfig();
  assert.equal(saved.maxIdleConnections, 5);
  const runtime = await manager.state();
  assert.equal(runtime.runtime.maxIdleConnections, 5);
  assert.equal(typeof runtime.runtime.chatConnections, 'number');
  assert.equal(typeof runtime.runtime.idleConnections, 'number');
});

await test('session mappings round-trip, stay bounded, and never carry env values', async () => {
  const records = new Map();
  for (let index = 0; index < 505; index += 1) {
    records.set(`s-${index}`, {
      acpSessionId: `acp-${index}`,
      agentId: 'mock',
      snapshotKey: 'abc123',
      cwd: '/work',
      method: 'session/load',
      updatedAt: 1_000 + index,
    });
  }
  await saveSessionRecords(records);
  const loaded = await loadSessionRecords();
  assert.equal(loaded.size, 500);
  assert.ok(!loaded.has('s-4'), 'the oldest records are dropped first');
  assert.ok(loaded.has('s-504'));

  const normalized = normalizeSessionRecord(
    {
      acpSessionId: 'acp-x',
      agentId: 'mock',
      snapshotKey: 'abc123',
      cwd: '/work',
      env: { SECRET_TOKEN: 'do-not-persist' },
      updatedAt: 2_000,
    },
    'harness-session',
  );
  assert.equal(normalized.env, undefined);
  assert.equal(normalizeSessionRecord({}, 'acp-ephemeral-123'), null);
});

await manager.dispose();
rmSync(home, { recursive: true, force: true });
rmSync(cwd, { recursive: true, force: true });
console.log('done');
