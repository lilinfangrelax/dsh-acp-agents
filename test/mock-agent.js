/* Minimal ACP agent used by the plugin's own tests. It speaks newline-delimited
 * JSON-RPC on stdio and exercises initialize, session/new, session/load,
 * session/resume, config options, streaming text, permission requests,
 * cancellation, and session/close.
 *
 * Capabilities and faults are driven by environment variables so one fixture
 * covers both the resumable and the legacy agent:
 *   MOCK_ACP_LOAD=1         advertise and accept session/load
 *   MOCK_ACP_RESUME=1       advertise and accept session/resume
 *   MOCK_ACP_LOAD_ERROR=1   reject session/load with -32002
 *   MOCK_ACP_LOAD_CONFIG=1  return configOptions from load/resume
 *   MOCK_ACP_REPLAY=<n>     replay n updates during load (default 2)
 *   MOCK_ACP_NO_CLOSE_CAP=1 omit the session/close capability
 *   MOCK_ACP_LOG=<path>     append one JSON line per received method
 */

import { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const LOAD = process.env.MOCK_ACP_LOAD === '1';
const RESUME = process.env.MOCK_ACP_RESUME === '1';
const LOAD_ERROR = process.env.MOCK_ACP_LOAD_ERROR === '1';
const LOAD_CONFIG = process.env.MOCK_ACP_LOAD_CONFIG === '1';
const REPLAY = Number.isFinite(Number(process.env.MOCK_ACP_REPLAY)) ? Number(process.env.MOCK_ACP_REPLAY) : 2;
const NO_CLOSE_CAP = process.env.MOCK_ACP_NO_CLOSE_CAP === '1';
const LOG = process.env.MOCK_ACP_LOG || '';

const pending = new Map();
const sessions = new Map();
let sessionId = null;
let nextSession = 0;
let pendingPrompt = null;
let cancelled = false;
let permissionSerial = 0;

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function respond(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function notify(method, params) {
  send({ jsonrpc: '2.0', method, params });
}

function logMethod(method, params) {
  if (LOG.length === 0) return;
  try {
    appendFileSync(LOG, `${JSON.stringify({ method, sessionId: params?.sessionId ?? null, text: params?.prompt?.map((block) => block.text || '').join('\n') ?? null })}\n`);
  } catch {
    /* the test log is best effort */
  }
}

function stateFor(id) {
  if (!sessions.has(id)) sessions.set(id, { selectedModel: 'mock-1' });
  return sessions.get(id);
}

function configOptions(model) {
  return [
    {
      id: 'model',
      name: 'Model',
      category: 'model',
      type: 'select',
      currentValue: model,
      options: [
        { value: 'mock-1', name: 'Mock One' },
        { value: 'mock-2', name: 'Mock Two' },
      ],
    },
    {
      id: 'reasoning_effort',
      name: 'Reasoning effort',
      category: 'thought_level',
      type: 'select',
      currentValue: 'low',
      options: [
        { value: 'low', name: 'Low' },
        { value: 'high', name: 'High' },
      ],
    },
  ];
}

function update(value) {
  if (sessionId === null) return;
  notify('session/update', { sessionId, update: value });
}

/** Restore from a previous process: ids we handed out are accepted even if the map is empty. */
function resumable(params) {
  const id = typeof params?.sessionId === 'string' ? params.sessionId : '';
  if (id.length === 0) return null;
  if (sessions.has(id)) return id;
  return /^mock-session-\d+$/.test(id) ? id : null;
}

function establish(message, method) {
  const target = resumable(message.params);
  if (LOAD_ERROR || target === null) {
    send({
      jsonrpc: '2.0',
      id: message.id,
      error: { code: -32002, message: 'mock: unknown session' },
    });
    return;
  }
  if (message.params?.cwd !== undefined && typeof message.params.cwd !== 'string') {
    send({ jsonrpc: '2.0', id: message.id, error: { code: -32602, message: 'mock: cwd must be a string' } });
    return;
  }
  if (!Array.isArray(message.params?.mcpServers)) {
    send({ jsonrpc: '2.0', id: message.id, error: { code: -32602, message: 'mock: mcpServers must be an array' } });
    return;
  }
  sessionId = target;
  const state = stateFor(target);
  if (method === 'session/load') {
    for (let index = 0; index < REPLAY; index += 1) {
      update({
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: `REPLAY-${index + 1}` },
      });
    }
  }
  respond(message.id, LOAD_CONFIG ? { configOptions: configOptions(state.selectedModel) } : {});
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', (line) => {
  if (line.trim().length === 0) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (message.id !== undefined && typeof message.method !== 'string') {
    const settle = pending.get(message.id);
    if (settle !== undefined) {
      pending.delete(message.id);
      settle(message);
    }
    return;
  }
  const method = message.method;
  logMethod(method, message.params);
  if (method === 'initialize') {
    const capabilities = {
      loadSession: LOAD,
      promptCapabilities: { image: false, audio: false, embeddedContext: false },
      mcpCapabilities: { http: false, sse: false, acp: false },
      sessionCapabilities: NO_CLOSE_CAP ? {} : { close: {} },
    };
    if (RESUME) capabilities.sessionCapabilities.resume = {};
    respond(message.id, {
      protocolVersion: 1,
      agentCapabilities: capabilities,
      agentInfo: { name: 'mock-acp', title: 'Mock ACP Agent', version: '1.0.0' },
      authMethods: [],
    });
    return;
  }
  if (method === 'session/new') {
    nextSession += 1;
    sessionId = `mock-session-${nextSession}`;
    const state = stateFor(sessionId);
    respond(message.id, { sessionId, configOptions: configOptions(state.selectedModel) });
    return;
  }
  if (method === 'session/load' || method === 'session/resume') {
    if (method === 'session/load' && !LOAD && !RESUME) {
      send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `mock: unsupported ${method}` } });
      return;
    }
    if (method === 'session/resume' && !RESUME) {
      send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `mock: unsupported ${method}` } });
      return;
    }
    establish(message, method);
    return;
  }
  if (method === 'session/set_config_option') {
    const state = stateFor(sessionId ?? 'mock-session-0');
    if (message.params && message.params.configId === 'model') state.selectedModel = String(message.params.value);
    respond(message.id, { configOptions: configOptions(state.selectedModel) });
    return;
  }
  if (method === 'session/close') {
    respond(message.id, {});
    setTimeout(() => process.exit(0), 30);
    return;
  }
  if (method === 'session/prompt') {
    const target = typeof message.params?.sessionId === 'string' ? message.params.sessionId : sessionId;
    sessionId = target;
    const state = stateFor(target);
    const text = (message.params.prompt || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    cancelled = false;
    const finish = (stopReason, extra) => {
      if (pendingPrompt !== message.id) return;
      pendingPrompt = null;
      respond(message.id, { stopReason, ...extra });
    };
    pendingPrompt = message.id;
    if (text.includes('refused')) {
      finish('refusal', {
        _meta: {
          'codebuddy.ai/outcome': 'FAILED_MODEL_REQUEST',
          'codebuddy.ai/errorMessage': JSON.stringify({
            code: -32003,
            message: '429 您的使用量已超出频率限制',
            data: { statusCode: 429, details: '429 您的使用量已超出频率限制' },
          }),
        },
      });
      return;
    }
    update({ sessionUpdate: 'user_message_chunk', content: { type: 'text', text } });
    update({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'thinking…' } });
    if (text.includes('status-probe')) {
      update({ sessionUpdate: 'usage_update', used: 12_000, size: 200_000, cost: { amount: 0.42, currency: 'USD' } });
      update({
        sessionUpdate: 'available_commands_update',
        availableCommands: [{ name: 'compact', description: 'Compact the context' }],
      });
      update({
        sessionUpdate: 'plan',
        entries: [
          { content: 'locate the failure', status: 'completed', priority: 'high' },
          { content: 'add a regression test', status: 'in_progress', priority: 'medium' },
        ],
      });
      update({ sessionUpdate: 'session_info_update', title: 'Status probe', updatedAt: '2026-11-12T09:00:00Z' });
      update({ sessionUpdate: 'current_mode_update', currentModeId: 'code' });
      update({ sessionUpdate: 'compaction_update', status: 'completed' });
      update({
        sessionUpdate: 'tool_call',
        toolCallId: 'tool-status-1',
        title: 'Read src/auth/login.ts',
        kind: 'read',
        status: 'completed',
        locations: [{ path: 'src/auth/login.ts', line: 12 }],
      });
    }
    if (text.includes('no-text')) {
      finish('end_turn');
      return;
    }
    update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: `pong [${state.selectedModel}]: ${text}` } });
    if (text.includes('slow')) {
      const timer = setTimeout(() => finish('end_turn'), 6_000);
      const watcher = setInterval(() => {
        if (cancelled) {
          clearTimeout(timer);
          clearInterval(watcher);
          finish('cancelled');
        }
      }, 50);
      return;
    }
    if (text.includes('permission')) {
      permissionSerial += 1;
      const permissionId = 90_000 + permissionSerial;
      pending.set(permissionId, (response) => {
        const outcome = response && response.result && response.result.outcome;
        update({
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: outcome && outcome.outcome === 'selected' ? ' permission-allowed' : ' permission-denied' },
        });
        finish('end_turn');
      });
      send({
        jsonrpc: '2.0',
        id: permissionId,
        method: 'session/request_permission',
        params: {
          sessionId,
          toolCall: { toolCallId: 'tool-1', title: 'Run a command', kind: 'execute', status: 'pending' },
          options: [
            { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
            { optionId: 'reject-once', name: 'Reject', kind: 'reject_once' },
          ],
        },
      });
      return;
    }
    finish('end_turn');
    return;
  }
  if (method === 'session/cancel') {
    cancelled = true;
    return;
  }
  if (method !== undefined && message.id !== undefined) {
    send({
      jsonrpc: '2.0',
      id: message.id,
      error: { code: -32601, message: `mock: unsupported ${method}` },
    });
  }
});

rl.on('close', () => {
  process.exit(0);
});
