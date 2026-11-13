/* Chat-provider integration checks with a scripted ACP agent.
 * Run with: node test/chat-provider-test.mjs */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAcpChatProvider } from '../chat-provider.js';
import { createLocalSubprocess } from './local-subprocess.js';

const here = dirname(fileURLToPath(import.meta.url));
const mock = join(here, 'mock-agent.js');
const cwd = mkdtempSync(join(tmpdir(), 'acp-chat-test-'));
const events = [];
const modelsSeen = [];
const listeners = new Map();

const llm = {
  registered: null,
  registerAdapter(providers, adapter) {
    this.registered = { providers: [...providers], adapter };
    const dispose = () => {
      this.registered = null;
    };
    dispose.replace = (next) => {
      this.registered = { providers: [...next], adapter };
    };
    return dispose;
  },
  listProviders() {
    return this.registered ? [...this.registered.providers] : [];
  },
  async listModels(provider) {
    return this.registered.adapter.listModels(provider);
  },
};

const ctx = {
  logger: { info() {}, warn() {}, debug() {} },
  get(name) {
    if (name === 'llm') return llm;
    if (name === 'subprocess') return createLocalSubprocess();
    if (name === 'agents') {
      return {
        get(id) {
          return id === 'live-session' ? { id, session: { header: { cwd } } } : undefined;
        },
      };
    }
    if (name === 'workingDirectory') return { defaultDirectory: cwd };
    return undefined;
  },
  emit(name, payload) {
    events.push({ name, payload });
  },
  on(name, listener) {
    listeners.set(name, listener);
    return () => listeners.delete(name);
  },
};

const agents = [
  {
    id: 'mock',
    name: 'Mock ACP',
    command: process.execPath,
    args: [mock],
    env: {},
    enabled: true,
    permission: 'allow',
    model: null,
    cwd: null,
    source: 'manual',
    registryId: null,
    lastTest: null,
  },
];

const chat = createAcpChatProvider({
  ctx,
  logger: ctx.logger,
  readAgents: () => agents,
  readSessionOptions: () => sessionOptions,
  onModels: (agentId, models) => modelsSeen.push({ agentId, models }),
});
let sessionOptions = null;
chat.sync();

async function collect(iterable) {
  const chunks = [];
  for await (const chunk of iterable) chunks.push(chunk);
  return chunks;
}

function textOf(chunks) {
  return chunks
    .filter((chunk) => chunk.type === 'text-delta')
    .map((chunk) => chunk.text)
    .join('');
}

function finishOf(chunks) {
  const finish = chunks.filter((chunk) => chunk.type === 'finish');
  return finish[finish.length - 1]?.reason;
}

async function prompt(text, extra = {}) {
  return collect(
    chat.stream({
      provider: 'acp-mock',
      model: 'default',
      messages: [{ role: 'user', content: [{ type: 'text', text }] }],
      sessionId: 'live-session',
      signal: new AbortController().signal,
      ...extra,
    }),
  );
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

async function waitFor(predicate, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('timed out waiting for condition');
}

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

/** Isolated provider + LLM registry + record store for lifecycle tests. */
function createRig({ env = {}, cap = 5, records = new Map() } = {}) {
  const rigEvents = [];
  const rigLlm = {
    registered: null,
    registerAdapter(providers, adapter) {
      this.registered = { providers: [...providers], adapter };
      const dispose = () => {
        this.registered = null;
      };
      dispose.replace = (next) => {
        this.registered = { providers: [...next], adapter };
      };
      return dispose;
    },
    listProviders() {
      return this.registered ? [...this.registered.providers] : [];
    },
  };
  const rigAgents = [{ ...agents[0], env }];
  const rigCtx = {
    logger: { info() {}, warn() {}, debug() {} },
    get(name) {
      if (name === 'llm') return rigLlm;
      if (name === 'subprocess') return createLocalSubprocess();
      if (name === 'agents') {
        return { get: (id) => ({ id, session: { header: { cwd } } }) };
      }
      if (name === 'workingDirectory') return { defaultDirectory: cwd };
      return undefined;
    },
    emit(name, payload) {
      rigEvents.push({ name, payload });
    },
    on(name, listener) {
      listeners.set(`rig:${name}`, listener);
      return () => listeners.delete(`rig:${name}`);
    },
  };
  const rig = { clock: 1_000, cap, records, events: rigEvents, agents: rigAgents };
  rig.provider = createAcpChatProvider({
    ctx: rigCtx,
    logger: rigCtx.logger,
    readAgents: () => rigAgents,
    readSessionOptions: () => null,
    onModels: () => {},
    readSessionRecord: (id) => records.get(id) ?? null,
    rememberSession: (id, record) => {
      records.set(id, record);
    },
    forgetSession: (id) => {
      records.delete(id);
    },
    maxIdleConnections: () => rig.cap,
    now: () => {
      rig.clock += 1;
      return rig.clock;
    },
  });
  rig.provider.sync();
  rig.prompt = async (sessionId, messages, extra = {}) => {
    const chunks = [];
    for await (const chunk of rig.provider.stream({
      provider: 'acp-mock',
      model: 'default',
      messages,
      sessionId,
      signal: new AbortController().signal,
      ...extra,
    })) {
      chunks.push(chunk);
    }
    return chunks;
  };
  rig.user = (text) => ({ role: 'user', content: [{ type: 'text', text }] });
  rig.disposeSession = (id) => listeners.get('rig:session/disposed')?.({ id });
  return rig;
}

await test('publishes one provider route with an ACP display name', () => {
  assert.deepEqual(llm.listProviders(), ['acp-mock']);
  const adapter = llm.registered.adapter;
  assert.deepEqual(adapter.providerInfo('acp-mock'), { id: 'acp-mock', name: 'Mock ACP (ACP)' });
  const policy = adapter.providerRetryPolicy('acp-mock');
  assert.equal(policy.maxRetries, 0);
});

await test('lists a default model before the first connection', async () => {
  const models = await llm.listModels('acp-mock');
  assert.equal(models[0].id, 'default');
  assert.equal(models[0].name, 'Default model');
  assert.equal(models[0].badge, undefined);
});

await test('streams assistant text through the LLM chunks and discovers models', async () => {
  const chunks = await prompt('hello from the model picker');
  assert.equal(finishOf(chunks).kind, 'stop');
  assert.match(textOf(chunks), /pong \[mock-1\]: hello from the model picker/);
  assert.ok(modelsSeen.some((entry) => entry.agentId === 'mock' && entry.models.length === 2));
  const models = await llm.listModels('acp-mock');
  assert.deepEqual(models.map((entry) => entry.id), ['default', 'mock-1', 'mock-2']);
  assert.ok(events.some((event) => event.name === 'llm/models-updated' && event.payload === 'acp-mock'));
});

await test('a second prompt reuses the same ACP session', async () => {
  const chunks = await prompt('second turn');
  assert.equal(finishOf(chunks).kind, 'stop');
  assert.match(textOf(chunks), /pong \[mock-1\]: second turn/);
});

await test('a selected model is applied with set_config_option', async () => {
  const chunks = await prompt('model switch', { model: 'mock-2' });
  assert.match(textOf(chunks), /pong \[mock-2\]: model switch/);
});

await test('per-session permission deny answers permission requests', async () => {
  sessionOptions = { permission: 'deny', model: 'default', config: {} };
  const chunks = await prompt('needs permission');
  assert.match(textOf(chunks), /permission-denied/);
  sessionOptions = null;
});

await test('auxiliary purposes stay local and do not prompt the external agent', async () => {
  const chunks = await prompt('title me', { purpose: 'session-title' });
  assert.equal(finishOf(chunks).kind, 'stop');
  assert.equal(textOf(chunks), 'title me');
  const framed = await prompt(
    `Generate the session title from this JSON array of human messages:\n${JSON.stringify([{ seq: 1, text: 'Fix login redirect loop' }])}`,
    { purpose: 'session-title' },
  );
  assert.equal(finishOf(framed).kind, 'stop');
  assert.equal(textOf(framed), 'Fix login redirect loop');
  const updated = await prompt(
    `Update the session title from this JSON object:\n${JSON.stringify({
      currentTitle: 'Greeting',
      messages: [
        { seq: 1, text: 'hi' },
        { seq: 2, text: 'Fix login redirect loop' },
      ],
    })}`,
    { purpose: 'session-title' },
  );
  assert.equal(textOf(updated), 'hi');
  const summary = await prompt('summarize me', { purpose: 'compaction' });
  assert.equal(finishOf(summary).kind, 'stop');
  assert.match(textOf(summary), /用户：/);
});

await test('a refusal with no content surfaces the agent error instead of placeholder text', async () => {
  const chunks = await prompt('refused please');
  const finish = finishOf(chunks);
  assert.equal(finish.kind, 'error');
  assert.equal(finish.failure.code, 'ACP_REFUSAL');
  assert.match(finish.failure.message, /429/);
  assert.doesNotMatch(textOf(chunks), /没有返回文本/);
});

await test('the status snapshot keeps every reported ACP session update', async () => {
  const rig = createRig({ cap: 5 });
  try {
    await rig.prompt('status', [rig.user('status-probe')]);
    const snapshot = rig.provider.sessionSnapshot('status');
    assert.equal(snapshot.usage.used, 12_000);
    assert.equal(snapshot.usage.size, 200_000);
    assert.equal(snapshot.cost.amount, 0.42);
    assert.equal(snapshot.cost.currency, 'USD');
    assert.equal(snapshot.commands[0].name, 'compact');
    assert.equal(snapshot.plan.length, 2);
    assert.equal(snapshot.plan[1].status, 'in_progress');
    assert.equal(snapshot.sessionInfo.title, 'Status probe');
    assert.equal(snapshot.mode.currentId, 'code');
    assert.equal(snapshot.compaction.status, 'completed');
    assert.equal(snapshot.tools[0].title, 'Read src/auth/login.ts');
    assert.equal(snapshot.tools[0].locations[0].path, 'src/auth/login.ts');
    assert.equal(snapshot.connected, true);
  } finally {
    await rig.provider.dispose();
  }
});

await test('an agent that reports nothing leaves the optional fields empty', async () => {
  const rig = createRig({ cap: 5 });
  try {
    await rig.prompt('plain', [rig.user('hello')]);
    const snapshot = rig.provider.sessionSnapshot('plain');
    assert.equal(snapshot.usage, null);
    assert.equal(snapshot.cost, null);
    assert.equal(snapshot.commands, null);
    assert.equal(snapshot.plan, null);
    assert.equal(snapshot.compaction, null);
    assert.deepEqual(snapshot.tools, []);
  } finally {
    await rig.provider.dispose();
  }
});

await test('keeps at most maxIdleConnections idle processes, least recent first', async () => {
  const logPath = join(cwd, 'lru.log');
  const rig = createRig({ env: { MOCK_ACP_LOG: logPath }, cap: 1 });
  try {
    await rig.prompt('a', [rig.user('alpha')]);
    await waitFor(() => rig.provider.connectionIds().length === 1);
    await rig.prompt('b', [rig.user('bravo')]);
    await waitFor(() => rig.provider.connectionIds().length === 1);
    await rig.prompt('c', [rig.user('charlie')]);
    await waitFor(() => rig.provider.connectionIds().length === 1);
    assert.deepEqual(rig.provider.connectionIds(), ['c']);
    const methods = readLog(logPath).map((entry) => entry.method);
    assert.equal(methods.filter((method) => method === 'session/new').length, 3);
  } finally {
    await rig.provider.dispose();
  }
});

await test('an evicted session resumes and sends only the newest user message', async () => {
  const logPath = join(cwd, 'resume.log');
  const rig = createRig({ env: { MOCK_ACP_LOAD: '1', MOCK_ACP_LOG: logPath }, cap: 0 });
  try {
    await rig.prompt('s', [rig.user('first')]);
    await waitFor(() => rig.provider.connectionIds().length === 0);
    assert.ok(rig.records.has('s'), 'the ACP session id must survive eviction');

    const second = await rig.prompt('s', [rig.user('first'), rig.user('second')]);
    assert.equal(finishOf(second).kind, 'stop');
    await waitFor(() => rig.provider.connectionIds().length === 0);

    const third = await rig.prompt('s', [rig.user('first'), rig.user('second'), rig.user('third')]);
    assert.equal(finishOf(third).kind, 'stop');
    await waitFor(() => rig.provider.connectionIds().length === 0);

    const entries = readLog(logPath);
    assert.equal(entries.filter((entry) => entry.method === 'session/load').length, 2);
    assert.equal(entries.filter((entry) => entry.method === 'session/new').length, 1);
    const prompts = entries.filter((entry) => entry.method === 'session/prompt');
    assert.equal(prompts[0].text, 'first');
    assert.equal(prompts[1].text, 'second', 'a resumed turn must not resend the old history');
    assert.equal(prompts[2].text, 'third');
  } finally {
    await rig.provider.dispose();
  }
});

await test('a fresh provider instance resumes from the persisted mapping', async () => {
  const logPath = join(cwd, 'restart.log');
  const records = new Map();
  const first = createRig({ env: { MOCK_ACP_LOAD: '1', MOCK_ACP_LOG: logPath }, cap: 5, records });
  await first.prompt('s', [first.user('before restart')]);
  await first.provider.dispose();
  assert.ok(records.has('s'));

  const second = createRig({ env: { MOCK_ACP_LOAD: '1', MOCK_ACP_LOG: logPath }, cap: 5, records });
  try {
    const chunks = await second.prompt('s', [second.user('before restart'), second.user('after restart')]);
    assert.equal(finishOf(chunks).kind, 'stop');
    const entries = readLog(logPath);
    assert.ok(entries.some((entry) => entry.method === 'session/load'));
    const prompts = entries.filter((entry) => entry.method === 'session/prompt');
    assert.equal(prompts[prompts.length - 1].text, 'after restart');
  } finally {
    await second.provider.dispose();
  }
});

await test('idle eviction releases the process without session/close', async () => {
  const logPath = join(cwd, 'evict-close.log');
  const rig = createRig({ env: { MOCK_ACP_LOG: logPath }, cap: 0 });
  try {
    await rig.prompt('s', [rig.user('one turn')]);
    await waitFor(() => rig.provider.connectionIds().length === 0);
    assert.ok(!readLog(logPath).map((entry) => entry.method).includes('session/close'));
  } finally {
    await rig.provider.dispose();
  }
});

await test('deleting the Harness session closes the agent-side session once', async () => {
  const logPath = join(cwd, 'destroy-close.log');
  const rig = createRig({ env: { MOCK_ACP_LOG: logPath }, cap: 5 });
  try {
    await rig.prompt('s', [rig.user('one turn')]);
    await waitFor(() => rig.provider.connectionIds().length === 1);
    rig.disposeSession('s');
    await waitFor(() => readLog(logPath).filter((entry) => entry.method === 'session/close').length === 1);
    await waitFor(() => rig.provider.connectionIds().length === 0);
    const closes = readLog(logPath).filter((entry) => entry.method === 'session/close');
    assert.equal(closes.length, 1);
    assert.ok(!rig.records.has('s'));
  } finally {
    await rig.provider.dispose();
  }
});

await test('removing the agent withdraws the provider route', () => {
  agents.length = 0;
  chat.sync();
  assert.deepEqual(llm.listProviders(), []);
});

await chat.dispose();
try {
  rmSync(cwd, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
} catch {
  /* Windows may hold the spawn cwd for a moment after process exit. */
}
console.log('done');
