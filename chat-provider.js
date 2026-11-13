/* ACP agents as DSH model routes.
 *
 * Each enabled external agent publishes one LLM provider route. Selecting it
 * in the normal model picker turns the current Harness session into an ACP
 * chat: one persistent ACP process per Harness session, text/thought streaming
 * into the normal assistant message, and the ACP agent's own tools running
 * inside that process.
 *
 * Deliberate Phase-1 limits:
 *   - text and reasoning stream; ACP tool activity appears as reasoning lines
 *   - Harness tools, images, and MCP mounts are not forwarded
 *   - one ACP session per Harness session; idle connections are kept up to
 *     `maxIdleConnections` and evicted least-recently-used first
 *   - a cold start resumes the agent-side session when the agent supports
 *     session/resume or session/load, and otherwise falls back to a short
 *     transcript preamble
 */

import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import { openAcpChatSession } from './acp-client.js';

const CONTEXT_WINDOW = 200_000;
const DEFAULT_MODEL = 'default';
const PREAMBLE_MAX_MESSAGES = 8;
const PREAMBLE_MAX_CHARS = 6_000;
const MAX_TOOL_LINES = 40;
const MAX_STATUS_TOOLS = 5;

function text(value) {
  return typeof value === 'string' ? value : '';
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function clamp(value, limit) {
  const input = String(value || '');
  if (input.length <= limit) return input;
  return `${input.slice(0, Math.max(0, limit - 1))}…`;
}

function providerIdFor(agent) {
  return `acp-${agent.id}`;
}

function agentSnapshot(agent) {
  return JSON.stringify([agent.command, agent.args, agent.env, agent.permission, agent.model]);
}

/** Stable, non-secret fingerprint of an agent launch, safe to persist. */
function agentSnapshotKey(agent) {
  return createHash('sha256').update(agentSnapshot(agent)).digest('hex').slice(0, 16);
}

function messageContentText(message) {
  if (!message || !Array.isArray(message.content)) return '';
  const parts = [];
  for (const block of message.content) {
    if (block && block.type === 'text' && typeof block.text === 'string') parts.push(block.text);
  }
  return parts.join('');
}

function messageKey(message) {
  if (message === null || typeof message !== 'object') return '';
  const id = text(message.id);
  if (id.length > 0) return `id:${id}`;
  return `text:${message.role}:${clamp(messageContentText(message), 160)}`;
}

function modelOptionOf(configOptions) {
  if (!Array.isArray(configOptions)) return null;
  const selects = configOptions.filter((option) => option && option.type === 'select');
  const option =
    selects.find((entry) => entry.category === 'model') ??
    selects.find((entry) => entry.id === 'model') ??
    selects.find((entry) => /model/i.test(text(entry.name)) || /model/i.test(text(entry.id)));
  if (!option) return null;
  const values = [];
  for (const entry of Array.isArray(option.options) ? option.options : []) {
    if (Array.isArray(entry.options)) {
      for (const nested of entry.options) {
        if (nested && typeof nested.value === 'string') {
          values.push({ id: nested.value, name: text(nested.name) || nested.value });
        }
      }
    } else if (entry && typeof entry.value === 'string') {
      values.push({ id: entry.value, name: text(entry.name) || entry.value });
    }
  }
  return {
    configId: text(option.id),
    currentValue: text(option.currentValue),
    models: values,
  };
}

/** Expand the persisted compact form back into the ACP `configOptions` shape. */
function configOptionsFromCompact(list) {
  if (!Array.isArray(list)) return null;
  const options = [];
  for (const option of list) {
    if (!option || option.type !== 'select' || typeof option.id !== 'string') continue;
    options.push({
      id: option.id,
      name: text(option.name),
      type: 'select',
      category: option.category ?? null,
      currentValue: option.currentValue ?? null,
      options: (Array.isArray(option.values) ? option.values : [])
        .filter((entry) => entry && typeof entry.value === 'string')
        .map((entry) => ({ value: entry.value, name: text(entry.name) || entry.value })),
    });
  }
  return options.length > 0 ? options : null;
}

function compactConfigOptions(configOptions) {  if (!Array.isArray(configOptions)) return [];
  const out = [];
  for (const option of configOptions) {
    if (!option || option.type !== 'select') continue;
    const values = [];
    for (const entry of Array.isArray(option.options) ? option.options : []) {
      if (Array.isArray(entry.options)) {
        for (const nested of entry.options) {
          if (nested && typeof nested.value === 'string') {
            values.push({ value: nested.value, name: text(nested.name) || nested.value });
          }
        }
      } else if (entry && typeof entry.value === 'string') {
        values.push({ value: entry.value, name: text(entry.name) || entry.value });
      }
    }
    out.push({
      id: text(option.id),
      name: text(option.name),
      type: 'select',
      category: option.category ?? null,
      currentValue: option.currentValue ?? null,
      values,
    });
  }
  return out;
}

function pickAllowOption(options) {
  if (!Array.isArray(options)) return null;
  for (const kind of ['allow_once', 'allow_always']) {
    const found = options.find((option) => option && option.kind === kind && typeof option.optionId === 'string');
    if (found !== undefined) return found;
  }
  return null;
}

function withDefaultModel(models, agent) {
  const list = [{ id: DEFAULT_MODEL, name: agent && agent.model ? `Default (${agent.model})` : 'Default model' }];
  const seen = new Set([DEFAULT_MODEL]);
  for (const model of Array.isArray(models) ? models : []) {
    const id = text(model.id);
    if (id.length === 0 || seen.has(id)) continue;
    seen.add(id);
    list.push({ id, name: text(model.name) || id });
  }
  return list;
}

function localSummary(messages) {
  const parts = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message || (message.role !== 'user' && message.role !== 'assistant')) continue;
    const body = messageContentText(message).trim();
    if (body.length === 0) continue;
    parts.push(`${message.role === 'user' ? '用户' : '助手'}：${clamp(body, 700)}`);
  }
  return parts.slice(-12).join('\n\n').slice(-12_000);
}

/** Title LLM frames human messages as a JSON payload behind one of these prefixes. */
const TITLE_GENERATE_PREFIX = 'Generate the session title from this JSON array of human messages:';
const TITLE_UPDATE_PREFIX = 'Update the session title from this JSON object:';

function firstHumanTextFromTitlePayload(value) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const body = text(entry?.text).replace(/\s+/g, ' ').trim();
      if (body.length > 0) return body;
    }
    return '';
  }
  if (value !== null && typeof value === 'object' && Array.isArray(value.messages)) {
    return firstHumanTextFromTitlePayload(value.messages);
  }
  return '';
}

/**
 * Session-title LLM calls arrive with purpose `session-title` and a user message
 * that is the framing prompt, not the conversation text. Unwrap that framing so
 * the local title path uses the human message instead of "Generate the session title…".
 */
function unwrapTitleRequest(raw) {
  const trimmed = text(raw).trim();
  for (const prefix of [TITLE_GENERATE_PREFIX, TITLE_UPDATE_PREFIX]) {
    if (!trimmed.startsWith(prefix)) continue;
    const jsonPart = trimmed.slice(prefix.length).trim();
    try {
      const extracted = firstHumanTextFromTitlePayload(JSON.parse(jsonPart));
      if (extracted.length > 0) return extracted;
    } catch {
      /* keep looking / fall through */
    }
  }
  return null;
}

function localTitle(messages) {
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message || message.role !== 'user') continue;
    const raw = messageContentText(message).trim();
    if (raw.length === 0) continue;
    const unwrapped = unwrapTitleRequest(raw);
    const body = (unwrapped ?? raw).replace(/\s+/g, ' ').trim();
    if (body.length > 0) return clamp(body, 48);
  }
  return '外部 Agent 会话';
}

function zeroRetryPolicy() {
  return {
    mode: 'normal',
    maxRetries: 0,
    retryableCodes: ['ACP_ERROR'],
    backoff: { initialDelayMs: 250, maxDelayMs: 250, jitterRatio: 0 },
  };
}

function createQueue() {
  const items = [];
  let resolve = null;
  let ended = false;
  const wake = () => {
    if (resolve === null) return;
    const next = resolve;
    resolve = null;
    next();
  };
  return {
    push(item) {
      if (ended) return;
      items.push(item);
      wake();
    },
    end() {
      ended = true;
      wake();
    },
    async *[Symbol.asyncIterator]() {
      while (true) {
        if (items.length > 0) {
          yield items.shift();
          continue;
        }
        if (ended) return;
        await new Promise((settle) => {
          resolve = settle;
        });
      }
    },
  };
}

function failure(message, code) {
  return { message: String(message || 'ACP request failed'), code: String(code || 'ACP_ERROR') };
}

function abortedFinish() {
  return { kind: 'aborted', failure: failure('ACP prompt cancelled', 'ABORTED') };
}

function errorFinish(message, code) {
  return { kind: 'error', failure: failure(message, code) };
}

function stopFinish() {
  return { kind: 'stop' };
}

/**
 * Turn an agent-side refusal into the message the user sees.
 *
 * Agents report transport/model failures (quota, auth, upstream 5xx) as
 * `stopReason: refusal` with an empty body and put the real cause in `_meta`.
 * Showing "no text returned" for those hides a hard failure, so prefer the
 * agent's own error detail and fall back to the outcome code.
 */
function refusalMessage(meta) {
  if (meta !== null && typeof meta === 'object') {
    for (const [key, value] of Object.entries(meta)) {
      if (typeof value !== 'string' || value.length === 0) continue;
      if (!/(error|failure|detail|message)$/i.test(key)) continue;
      let detail = value;
      try {
        const parsed = JSON.parse(value);
        detail = text(parsed?.data?.details) || text(parsed?.message) || value;
      } catch {
        /* the field is already plain text */
      }
      if (detail.length > 0) return `外部 Agent 拒绝了本次请求：${detail}`;
    }
    const outcome = text(meta['codebuddy.ai/outcome']);
    if (outcome.length > 0) return `外部 Agent 拒绝了本次请求（${outcome}）`;
  }
  return '外部 Agent 拒绝了本次请求，且没有返回任何内容';
}

/* ------------------------------------------------------------------ */
/* Session status reported by the ACP agent                            */
/* ------------------------------------------------------------------ */

function hasCapability(capabilities, name) {
  if (capabilities === null || typeof capabilities !== 'object') return false;
  const value = capabilities[name];
  return value === true || (value !== null && typeof value === 'object');
}

function normalizeAuthMethods(list) {
  return (Array.isArray(list) ? list : [])
    .map((method) => ({
      type: text(method?.type) || 'agent',
      id: text(method?.id),
      name: text(method?.name),
    }))
    .filter((method) => method.id.length > 0 || method.name.length > 0);
}

/** Only the capability flags the status panel renders; unknown fields are dropped. */
function normalizeCapabilities(raw) {
  const capabilities = raw !== null && typeof raw === 'object' ? raw : {};
  const prompt = capabilities.promptCapabilities ?? {};
  const mcp = capabilities.mcpCapabilities ?? {};
  const session = capabilities.sessionCapabilities ?? {};
  return {
    loadSession: capabilities.loadSession === true,
    resume: hasCapability(session, 'resume'),
    fork: hasCapability(session, 'fork'),
    close: hasCapability(session, 'close'),
    image: prompt.image === true,
    audio: prompt.audio === true,
    embeddedContext: prompt.embeddedContext === true,
    mcpHttp: mcp.http === true,
    mcpSse: mcp.sse === true,
  };
}

function normalizeModes(raw) {
  if (raw === null || typeof raw !== 'object') return null;
  const available = (Array.isArray(raw.availableModes) ? raw.availableModes : [])
    .map((mode) => ({
      id: text(mode?.id),
      name: text(mode?.name) || text(mode?.id),
      description: text(mode?.description),
    }))
    .filter((mode) => mode.id.length > 0);
  if (available.length === 0 && text(raw.currentModeId).length === 0) return null;
  const currentId = text(raw.currentModeId);
  const current = available.find((mode) => mode.id === currentId) ?? null;
  return { currentId, currentName: current?.name ?? currentId, available };
}

function normalizePlanEntries(raw) {
  const entries = Array.isArray(raw) ? raw : Array.isArray(raw?.entries) ? raw.entries : [];
  return entries
    .map((entry) => ({
      content: text(entry?.content),
      status: text(entry?.status) || 'pending',
      priority: text(entry?.priority) || null,
    }))
    .filter((entry) => entry.content.length > 0);
}

function normalizeCommands(raw) {
  const commands = Array.isArray(raw) ? raw : Array.isArray(raw?.availableCommands) ? raw.availableCommands : [];
  return commands
    .map((command) => ({
      name: text(command?.name),
      description: text(command?.description),
      hint: text(command?.input?.hint),
    }))
    .filter((command) => command.name.length > 0);
}

function normalizeConfigList(options) {
  return (Array.isArray(options) ? options : [])
    .map((option) => ({
      id: text(option?.id),
      name: text(option?.name) || text(option?.id),
      currentValue: option?.currentValue ?? null,
    }))
    .filter((option) => option.id.length > 0);
}

function normalizeLocations(list) {
  return (Array.isArray(list) ? list : [])
    .map((entry) => ({ path: text(entry?.path), line: Number.isFinite(entry?.line) ? entry.line : null }))
    .filter((entry) => entry.path.length > 0);
}

/* ------------------------------------------------------------------ */
/* One persistent ACP chat connection                                  */
/* ------------------------------------------------------------------ */

/**
 * What a running turn sees when the host tears the connection down, as a
 * plugin reload or a session release does. The agent-side session keeps its
 * history, so a retry resumes it instead of starting over.
 */
const HOST_CLOSED_TURN =
  'ACP connection closed by the host (plugin reloaded or session released); this turn was interrupted. Retry to resume the same agent session.';

class AcpChatConnection {
  constructor(manager, agent, provider, sessionId, cwd) {
    this.manager = manager;
    this.agent = agent;
    this.provider = provider;
    this.sessionId = sessionId;
    this.cwd = cwd;
    this.snapshot = agentSnapshot(agent);
    this.session = null;
    this.sink = null;
    this.sentKeys = new Set();
    this.hasPrompted = false;
    this.resumed = false;
    this.resumeMethod = null;
    this.configOptionsKnown = false;
    this.currentModel = '';
    this.modelConfigId = '';
    this.appliedConfig = new Map();
    this.lock = Promise.resolve();
    this.lastUsed = manager.now();
    this.waiting = 0;
    this.reserved = 0;
    this.ephemeral = sessionId.startsWith('acp-ephemeral-');
    this.active = 0;
    this.closed = false;
    // Static facts from initialize/session/new, plus whatever the agent pushes
    // through session/update. Both feed the read-only status panel.
    this.info = null;
    this.modes = null;
    this.runtime = {
      usage: null,
      cost: null,
      commands: null,
      config: null,
      plan: null,
      compaction: null,
      sessionInfo: null,
      tools: [],
      updatedAt: 0,
    };
  }

  matches(agent, cwd) {
    return !this.closed && this.cwd === cwd && this.snapshot === agentSnapshot(agent);
  }

  async open() {
    const record = this.manager.readSessionRecord?.(this.sessionId) ?? null;
    const key = agentSnapshotKey(this.agent);
    const resumable =
      record !== null && record.agentId === this.agent.id && record.snapshotKey === key && record.cwd === this.cwd;
    let session;
    try {
      session = await openAcpChatSession({
        subprocess: this.manager.subprocess,
        agent: this.agent,
        cwd: this.cwd,
        permission: this.agent.permission === 'deny' ? 'deny' : 'allow',
        logger: this.manager.logger,
        resumeSessionId: resumable ? record.acpSessionId : null,
        configOptionsHint: configOptionsFromCompact(this.agent.lastTest?.configOptions),
        onUpdate: (update) => {
          this.noteUpdate(update);
          if (typeof this.sink === 'function') this.sink(update);
        },
        onExit: (error) => {
          this.manager.drop(this, error);
        },
        onPermission: (params) => this.permissionAnswer(params),
      });
    } catch (error) {
      // A stored id that cannot be reopened must not be retried on every turn.
      if (resumable) this.manager.forgetSession?.(this.sessionId);
      throw error;
    }
    this.session = session;
    const init = session.init ?? {};
    this.info = {
      agentInfo: init.agentInfo ?? null,
      protocolVersion: typeof init.protocolVersion === 'number' ? init.protocolVersion : null,
      capabilities: normalizeCapabilities(init.agentCapabilities),
      authMethods: normalizeAuthMethods(init.authMethods),
    };
    this.modes = normalizeModes(session.created?.modes);
    this.resumed = session.resumed === true;
    this.resumeMethod = session.resumeMethod ?? null;
    this.configOptionsKnown = Array.isArray(session.created?.configOptions);
    const option = modelOptionOf(session.created?.configOptions);
    if (option !== null) {
      this.modelConfigId = option.configId;
      this.currentModel = option.currentValue;
    }
    const compact = compactConfigOptions(session.created?.configOptions);
    this.manager.noteModels(this.agent.id, option?.models ?? [], compact.length > 0 ? compact : null);
    this.manager.rememberSession?.(this.sessionId, {
      acpSessionId: session.sessionId,
      agentId: this.agent.id,
      snapshotKey: key,
      cwd: this.cwd,
      method: this.resumeMethod,
    });
    this.touch();
  }

  /**
   * Record agent-pushed session facts. These updates are optional per agent, so
   * every field stays null until the agent actually reports it; the status
   * panel renders the difference instead of inventing defaults.
   */
  noteUpdate(update) {
    const kind = text(update?.sessionUpdate);
    if (kind.length === 0) return;
    const runtime = this.runtime;
    const stamp = () => {
      runtime.updatedAt = this.manager.now();
    };
    switch (kind) {
      case 'usage_update': {
        const used = Number(update.used);
        if (!Number.isFinite(used)) break;
        const size = Number(update.size);
        runtime.usage = { used, size: Number.isFinite(size) && size > 0 ? size : null };
        const amount = Number(update.cost?.amount);
        if (Number.isFinite(amount)) runtime.cost = { amount, currency: text(update.cost?.currency) };
        stamp();
        break;
      }
      case 'available_commands_update': {
        const commands = normalizeCommands(update);
        if (commands.length > 0) runtime.commands = commands;
        stamp();
        break;
      }
      case 'current_mode_update': {
        const currentId = text(update.currentModeId);
        if (currentId.length === 0) break;
        const name = this.modes?.available.find((mode) => mode.id === currentId)?.name ?? currentId;
        this.modes = this.modes === null
          ? { currentId, currentName: name, available: [] }
          : { ...this.modes, currentId, currentName: name };
        stamp();
        break;
      }
      case 'config_option_update': {
        runtime.config = normalizeConfigList(update.configOptions);
        stamp();
        break;
      }
      case 'session_info_update': {
        runtime.sessionInfo = {
          title: update.title === null ? null : text(update.title),
          updatedAt: update.updatedAt === null ? null : text(update.updatedAt),
        };
        stamp();
        break;
      }
      case 'plan':
      case 'plan_update': {
        const entries = normalizePlanEntries(update);
        runtime.plan = entries.length > 0 ? entries : null;
        stamp();
        break;
      }
      case 'plan_removed': {
        runtime.plan = null;
        stamp();
        break;
      }
      case 'compaction_update': {
        runtime.compaction = { status: text(update.status) || 'unknown', error: text(update.error) || null };
        stamp();
        break;
      }
      case 'tool_call':
      case 'tool_call_update': {
        const id = text(update.toolCallId);
        if (id.length === 0) break;
        const index = runtime.tools.findIndex((entry) => entry.id === id);
        const previous = index === -1 ? null : runtime.tools[index];
        const next = {
          id,
          title: text(update.title) || previous?.title || 'tool',
          kind: text(update.kind) || previous?.kind || null,
          status: text(update.status) || previous?.status || 'pending',
          locations: Array.isArray(update.locations) && update.locations.length > 0
            ? normalizeLocations(update.locations)
            : previous?.locations ?? [],
        };
        if (index !== -1) runtime.tools.splice(index, 1);
        runtime.tools.push(next);
        if (runtime.tools.length > MAX_STATUS_TOOLS) {
          runtime.tools.splice(0, runtime.tools.length - MAX_STATUS_TOOLS);
        }
        stamp();
        break;
      }
      default:
        break;
    }
  }

  /** Read-only view of everything this connection knows about the ACP session. */
  statusSnapshot() {
    const runtime = this.runtime;
    const info = this.info ?? {};
    const agentInfo = info.agentInfo ?? null;
    return {
      connected: !this.closed,
      busy: this.active > 0,
      agent: {
        id: this.agent.id,
        name: text(agentInfo?.title) || text(agentInfo?.name) || text(this.agent.name) || this.agent.id,
        version: text(agentInfo?.version) || null,
      },
      protocolVersion: info.protocolVersion ?? null,
      capabilities: info.capabilities ?? null,
      authMethods: info.authMethods ?? [],
      acpSessionId: this.session?.sessionId ?? null,
      cwd: this.cwd,
      resumed: this.resumed === true,
      resumeMethod: this.resumeMethod ?? null,
      mode: this.modes,
      usage: runtime.usage,
      cost: runtime.cost,
      commands: runtime.commands,
      config: runtime.config,
      plan: runtime.plan,
      compaction: runtime.compaction,
      sessionInfo: runtime.sessionInfo,
      tools: runtime.tools,
      pid: Number.isFinite(this.session?.child?.pid) ? this.session.child.pid : null,
      updatedAt: runtime.updatedAt || null,
    };
  }

  permissionAnswer(params) {
    const rawOptions = this.manager.readSessionOptions?.(this.sessionId) ?? null;
    const options = rawOptions !== null && (!rawOptions.agentId || rawOptions.agentId === this.agent.id) ? rawOptions : null;
    if (options?.permission === 'deny') return { outcome: { outcome: 'cancelled' } };
    const option = pickAllowOption(params && params.options);
    if (option !== null) return { outcome: { outcome: 'selected', optionId: option.optionId } };
    return { outcome: { outcome: 'cancelled' } };
  }

  touch() {
    this.lastUsed = this.manager.now();
  }

  /** Guards the turn from eviction between `ensureConnection` and `run`. */
  reserve() {
    this.reserved += 1;
  }

  unreserve() {
    this.reserved = Math.max(0, this.reserved - 1);
  }

  async run(promptText, model, signal, sink) {
    this.unreserve();
    const previous = this.lock;
    let release;
    this.lock = new Promise((settle) => {
      release = settle;
    });
    this.waiting += 1;
    await previous;
    this.waiting -= 1;
    if (this.closed) {
      release();
      throw new Error('ACP connection was closed before the turn started');
    }
    this.active += 1;
    this.touch();
    this.sink = typeof sink === 'function' ? sink : null;
    let note = null;
    try {
      const rawSessionOptions = this.manager.readSessionOptions?.(this.sessionId) ?? null;
      const sessionOptions = rawSessionOptions !== null && (!rawSessionOptions.agentId || rawSessionOptions.agentId === this.agent.id) ? rawSessionOptions : null;
      const optionModel = text(sessionOptions?.model);
      const requested = model === DEFAULT_MODEL
        ? (optionModel.length > 0 && optionModel !== DEFAULT_MODEL ? optionModel : text(this.agent.model))
        : text(model);
      if (requested.length > 0 && requested !== this.currentModel) {
        const applied = await this.session.applyModel(requested);
        if (applied.applied === true) this.currentModel = requested;
        // A resumed session may not report configOptions; that is not an error
        // worth surfacing on every turn.
        else if (!(this.configOptionsKnown === false && applied.reason === 'agent advertised no model selector')) {
          note = `模型 ${requested} 未应用：${applied.reason || 'unknown'}`;
        }
      }
      const configValues = sessionOptions?.config !== null && typeof sessionOptions?.config === 'object' && !Array.isArray(sessionOptions.config)
        ? sessionOptions.config
        : {};
      for (const [configId, value] of Object.entries(configValues)) {
        if (typeof configId !== 'string' || configId.length === 0 || typeof value !== 'string') continue;
        if (this.appliedConfig.get(configId) === value) continue;
        try {
          const applied = await this.session.applyConfigOption(configId, value);
          if (applied.applied === true) this.appliedConfig.set(configId, value);
          else note = `选项 ${configId}=${value} 未应用：${applied.reason || 'unknown'}`;
        } catch (error) {
          note = `选项 ${configId}=${value} 未应用：${error instanceof Error ? error.message : String(error)}`;
        }
      }
      if (signal?.aborted) {
        return { outcome: { stopReason: 'cancelled', cancelled: true }, note };
      }
      const outcome = await this.session.prompt([{ type: 'text', text: promptText }], signal);
      this.hasPrompted = true;
      return { outcome, note };
    } finally {
      this.sink = null;
      this.active -= 1;
      this.touch();
      release();
      void this.manager.evictIdle?.();
    }
  }

  /** Release the process but keep the agent-side session resumable. */
  async detach() {
    if (this.closed) return;
    this.closed = true;
    await this.session?.dispose(this.active > 0 || this.waiting > 0 ? HOST_CLOSED_TURN : undefined);
  }

  /** Permanent teardown: also tells the agent to drop the session. */
  async destroy() {
    if (!this.closed) {
      this.closed = true;
      try {
        await this.session?.closeRemoteSession();
      } catch {
        /* optional capability */
      }
    }
    await this.session?.dispose(this.active > 0 || this.waiting > 0 ? HOST_CLOSED_TURN : undefined);
    await this.manager.forgetSession?.(this.sessionId);
  }
}

/* ------------------------------------------------------------------ */
/* Provider factory                                                    */
/* ------------------------------------------------------------------ */

export function createAcpChatProvider({
  ctx,
  logger = console,
  readAgents,
  readSessionOptions,
  onModels,
  readSessionRecord = () => null,
  rememberSession = () => {},
  forgetSession = () => {},
  maxIdleConnections = () => 5,
  now = () => Date.now(),
}) {
  const llm = (() => {
    try {
      return ctx.get('llm');
    } catch {
      return null;
    }
  })();
  const connections = new Map();
  const opening = new Map();
  const providerAgents = new Map();
  const modelCache = new Map();
  let registration = null;
  let sessionListener = null;
  let disposed = false;

  const subprocess = (() => {
    try {
      return ctx.get('subprocess');
    } catch {
      return null;
    }
  })();

  const providerFor = (agentId) => `acp-${agentId}`;

  function agentForProvider(provider) {
    const agentId = providerAgents.get(provider);
    if (agentId === undefined) return null;
    return readAgents().find((agent) => agent.id === agentId) ?? null;
  }

  function modelsForProvider(provider) {
    const agent = agentForProvider(provider);
    if (agent === null) return [{ id: DEFAULT_MODEL, name: 'Default model' }];
    const cached = modelCache.get(provider);
    if (Array.isArray(cached) && cached.length > 1) return cached;
    const tested = Array.isArray(agent.lastTest?.models) && agent.lastTest.ok
      ? agent.lastTest.models.map((entry) => ({ id: text(entry.value) || text(entry.id), name: text(entry.name) }))
      : [];
    if (tested.length > 0) {
      const list = withDefaultModel(tested, agent);
      modelCache.set(provider, list);
      return list;
    }
    return withDefaultModel([], agent);
  }

  function noteModels(agentId, models, configOptions) {
    const provider = providerFor(agentId);
    const agent = readAgents().find((entry) => entry.id === agentId);
    if (agent === undefined) return;
    const normalized = (Array.isArray(models) ? models : [])
      .map((entry) => ({ id: text(entry.id) || text(entry.value), name: text(entry.name) }))
      .filter((entry) => entry.id.length > 0);
    if (normalized.length > 0) modelCache.set(provider, withDefaultModel(normalized, agent));
    try {
      onModels?.(agentId, normalized, Array.isArray(configOptions) ? configOptions : null);
    } catch (error) {
      logger.warn?.(`[acp-agents] could not persist models for "${agentId}": ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
      ctx.emit?.('llm/models-updated', provider);
    } catch {
      /* the LLM registry may be absent */
    }
  }

  function sessionCwd(sessionId) {
    try {
      const agents = ctx.get('agents');
      const live = agents && typeof agents.get === 'function' ? agents.get(sessionId) : undefined;
      const cwd = live?.session?.header?.cwd;
      if (typeof cwd === 'string' && isDirectory(cwd)) return cwd;
    } catch {
      /* absent service */
    }
    try {
      const workingDirectory = ctx.get('workingDirectory');
      const cwd = workingDirectory?.defaultDirectory;
      if (typeof cwd === 'string' && isDirectory(cwd)) return cwd;
    } catch {
      /* absent service */
    }
    return homedir();
  }

  function drop(connection, error) {
    connection.closed = true;
    if (connections.get(connection.sessionId) === connection) connections.delete(connection.sessionId);
    if (error !== undefined) {
      logger.warn?.(`[acp-agents] chat session "${connection.sessionId}" ended: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Release an idle process without telling the agent to drop its session. */
  async function detach(sessionId, reason) {
    const connection = connections.get(sessionId);
    if (connection === undefined) return;
    connections.delete(sessionId);
    await connection.detach().catch((error) => {
      logger.warn?.(`[acp-agents] could not release chat session "${sessionId}" (${reason}): ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  /** Permanent teardown for a deleted session or a removed agent. */
  async function destroy(sessionId, reason) {
    const connection = connections.get(sessionId);
    if (connection === undefined) {
      await forgetSession?.(sessionId);
      return;
    }
    connections.delete(sessionId);
    await connection.destroy().catch((error) => {
      logger.warn?.(`[acp-agents] could not close chat session "${sessionId}" (${reason}): ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  function idleCount() {
    let count = 0;
    for (const connection of connections.values()) {
      if (connection.active === 0 && connection.waiting === 0 && connection.reserved === 0 && !connection.closed) count += 1;
    }
    return count;
  }

  /**
   * Keep at most `maxIdleConnections` idle processes. Ephemeral ids go first,
   * then the least recently used; a connection with a queued or running turn is
   * never a candidate.
   */
  async function evictIdle(keep = null) {
    const cap = Math.max(0, Math.trunc(Number(maxIdleConnections())) || 0);
    const idle = [];
    let total = 0;
    for (const [sessionId, connection] of connections) {
      if (connection.active !== 0 || connection.waiting !== 0 || connection.reserved !== 0 || connection.closed) continue;
      total += 1;
      if (connection !== keep) idle.push([sessionId, connection]);
    }
    if (total <= cap) return;
    idle.sort((left, right) => {
      if (left[1].ephemeral !== right[1].ephemeral) return left[1].ephemeral ? -1 : 1;
      return left[1].lastUsed - right[1].lastUsed;
    });
    const excess = Math.min(total - cap, idle.length);
    for (const [sessionId, connection] of idle.slice(0, excess)) {
      if (connections.get(sessionId) !== connection) continue;
      connections.delete(sessionId);
      await connection.detach().catch((error) => {
        logger.warn?.(`[acp-agents] could not release idle chat session "${sessionId}": ${error instanceof Error ? error.message : String(error)}`);
      });
    }
  }

  async function ensureConnection(agent, sessionId) {
    const provider = providerFor(agent.id);
    const cwd = sessionCwd(sessionId);
    const current = connections.get(sessionId);
    if (current !== undefined && current.matches(agent, cwd)) return current;
    if (current !== undefined) await destroy(sessionId, 'configuration changed');
    const pending = opening.get(sessionId);
    if (pending !== undefined) return pending;
    const creating = (async () => {
      const connection = new AcpChatConnection(
        {
          subprocess,
          logger,
          drop,
          noteModels,
          readSessionOptions,
          readSessionRecord,
          rememberSession,
          forgetSession,
          evictIdle,
          now,
        },
        agent,
        provider,
        sessionId,
        cwd,
      );
      await connection.open();
      connections.set(sessionId, connection);
      // The fresh connection is protected until its first turn finishes; with
      // a cap of 0 it is released at the end of that turn.
      void evictIdle(connection);
      return connection;
    })();
    opening.set(sessionId, creating);
    try {
      return await creating;
    } finally {
      opening.delete(sessionId);
    }
  }

  function buildPreamble(messages) {
    const parts = [];
    for (const message of messages) {
      if (!message || (message.role !== 'user' && message.role !== 'assistant')) continue;
      const body = messageContentText(message).trim();
      if (body.length === 0) continue;
      parts.push(`${message.role === 'user' ? '用户' : '助手'}：${clamp(body, 700)}`);
    }
    if (parts.length === 0) return '';
    return clamp(parts.slice(-PREAMBLE_MAX_MESSAGES).join('\n\n'), PREAMBLE_MAX_CHARS);
  }

  function buildPrompt(options, connection) {
    const messages = Array.isArray(options.messages) ? options.messages : [];
    const users = messages.filter((message) => message && message.role === 'user' && messageContentText(message).trim().length > 0);
    if (users.length === 0) return { error: 'ACP chat needs a text user message.' };
    // A resumed agent already owns every earlier turn. Re-sending them would
    // duplicate the whole conversation, so only the newest user message goes
    // out and the older keys are marked as already delivered.
    const resumedFresh = connection.resumed && !connection.hasPrompted;
    if (resumedFresh) {
      for (const message of users.slice(0, -1)) connection.sentKeys.add(messageKey(message));
    }
    const fresh = users.filter((message) => !connection.sentKeys.has(messageKey(message)));
    const selected = resumedFresh ? [users[users.length - 1]] : fresh.length > 0 ? fresh : [users[users.length - 1]];
    const textPart = selected.map(messageContentText).join('\n\n').trim();
    if (textPart.length === 0) return { error: 'ACP chat needs a text user message.' };
    let prompt = textPart;
    if (!connection.hasPrompted && !resumedFresh) {
      const firstIndex = messages.indexOf(selected[0]);
      const prior = firstIndex > 0 ? messages.slice(0, firstIndex) : [];
      const preamble = buildPreamble(prior);
      if (preamble.length > 0) {
        prompt = `以下是我们此前在同一会话中的对话，供你了解背景：\n\n${preamble}\n\n---\n\n请继续处理下面的新消息：\n\n${textPart}`;
      }
    }
    return {
      text: prompt,
      keys: selected.map(messageKey),
      fresh: fresh.length > 0,
    };
  }

  function* auxiliaryStream(options) {
    const purpose = text(options.purpose);
    const messages = Array.isArray(options.messages) ? options.messages : [];
    const body = purpose.includes('title') ? localTitle(messages) : localSummary(messages) || '（外部 Agent 会话没有可摘要的文本记录）';
    yield { type: 'block-start', index: 0, blockType: 'text' };
    yield { type: 'text-delta', index: 0, text: body };
    yield { type: 'block-end', index: 0, block: { type: 'text', text: body } };
    yield { type: 'finish', reason: stopFinish() };
  }

  async function* stream(options) {
    if (disposed) {
      yield { type: 'finish', reason: errorFinish('ACP chat provider is disposed.', 'ACP_DISPOSED') };
      return;
    }
    if (text(options.purpose).length > 0) {
      yield* auxiliaryStream(options);
      return;
    }
    const provider = text(options.provider);
    const agent = agentForProvider(provider);
    if (agent === null) {
      yield { type: 'finish', reason: errorFinish(`No enabled ACP agent serves provider "${provider}".`, 'ACP_NO_AGENT') };
      return;
    }
    if (subprocess === null) {
      yield { type: 'finish', reason: errorFinish('The subprocess service is unavailable.', 'ACP_NO_SUBPROCESS') };
      return;
    }
    const sessionId = text(options.sessionId) || `acp-ephemeral-${Date.now().toString(36)}`;
    let connection;
    try {
      connection = await ensureConnection(agent, sessionId);
    } catch (error) {
      yield {
        type: 'finish',
        reason: errorFinish(
          `Could not start ${agent.name} over ACP: ${error instanceof Error ? error.message : String(error)}`,
          'ACP_START_FAILED',
        ),
      };
      return;
    }
    connection.reserve();
    const plan = buildPrompt(options, connection);
    if (plan.error !== undefined) {
      connection.unreserve();
      yield { type: 'finish', reason: errorFinish(plan.error, 'ACP_NO_PROMPT') };
      return;
    }
    if (options.signal?.aborted) {
      connection.unreserve();
      yield { type: 'finish', reason: abortedFinish() };
      return;
    }

    const queue = createQueue();
    let textIndex = null;
    let textBuffer = '';
    let reasoningIndex = null;
    let reasoningBuffer = '';
    let nextIndex = 0;
    let toolLines = 0;
    const toolState = new Map();

    const ensureText = () => {
      if (textIndex === null) {
        textIndex = nextIndex++;
        queue.push({ type: 'block-start', index: textIndex, blockType: 'text' });
      }
    };
    const ensureReasoning = () => {
      if (reasoningIndex === null) {
        reasoningIndex = nextIndex++;
        queue.push({ type: 'block-start', index: reasoningIndex, blockType: 'reasoning' });
      }
    };
    const appendReasoning = (value) => {
      ensureReasoning();
      reasoningBuffer += value;
      queue.push({ type: 'reasoning-delta', index: reasoningIndex, text: value });
    };
    const appendToolLine = (value) => {
      if (toolLines >= MAX_TOOL_LINES) return;
      toolLines += 1;
      appendReasoning(value);
    };

    const sink = (update) => {
      if (!update || typeof update !== 'object') return;
      switch (update.sessionUpdate) {
        case 'agent_message_chunk': {
          if (update.content && update.content.type === 'text') {
            const value = text(update.content.text);
            if (value.length > 0) {
              ensureText();
              textBuffer += value;
              queue.push({ type: 'text-delta', index: textIndex, text: value });
            }
          }
          break;
        }
        case 'agent_thought_chunk': {
          if (update.content && update.content.type === 'text') {
            const value = text(update.content.text);
            if (value.length > 0) appendReasoning(value);
          }
          break;
        }
        case 'tool_call': {
          const title = text(update.title) || text(update.name) || 'tool';
          const status = text(update.status);
          toolState.set(text(update.toolCallId), { title, status });
          appendToolLine(`\n\n▸ ${title}${status.length > 0 ? ` · ${status}` : ''}`);
          break;
        }
        case 'tool_call_update': {
          const id = text(update.toolCallId);
          const previous = toolState.get(id);
          const status = text(update.status);
          const title = text(update.title) || previous?.title || 'tool';
          if (status === 'completed' || status === 'failed') {
            if (previous?.status !== status) {
              toolState.set(id, { title, status });
              appendToolLine(`\n  ${status === 'completed' ? '✓' : '✗'} ${title}`);
            }
          } else if (previous === undefined) {
            toolState.set(id, { title, status });
            appendToolLine(`\n\n▸ ${title}`);
          }
          break;
        }
        default:
          break;
      }
    };

    const finish = (reason, note) => {
      if (note !== null && note.length > 0) appendReasoning(`\n\n${note}`);
      if (textIndex === null && reasoningIndex === null && reason.kind === 'stop') {
        ensureText();
        const fallback = '（外部 Agent 没有返回文本）';
        textBuffer = fallback;
        queue.push({ type: 'text-delta', index: textIndex, text: fallback });
      }
      if (textIndex !== null) {
        queue.push({ type: 'block-end', index: textIndex, block: { type: 'text', text: textBuffer } });
      }
      if (reasoningIndex !== null) {
        queue.push({ type: 'block-end', index: reasoningIndex, block: { type: 'reasoning', text: reasoningBuffer } });
      }
      queue.push({ type: 'finish', reason });
      if (plan.fresh) for (const key of plan.keys) connection.sentKeys.add(key);
      queue.end();
    };

    void (async () => {
      try {
        const { outcome, note } = await connection.run(plan.text, options.model, options.signal, sink);
        if (outcome.cancelled === true || outcome.stopReason === 'cancelled' || options.signal?.aborted) {
          finish(abortedFinish(), note ?? null);
          return;
        }
        switch (outcome.stopReason) {
          case 'max_tokens':
            finish({ kind: 'max-tokens' }, note ?? null);
            break;
          case 'end_turn':
            finish(stopFinish(), note ?? null);
            break;
          case 'refusal':
            // A refusal that still produced content is a normal ending; one with
            // an empty body means the agent failed behind the scenes.
            finish(
              textIndex !== null || reasoningIndex !== null
                ? stopFinish()
                : errorFinish(refusalMessage(outcome.meta), 'ACP_REFUSAL'),
              note ?? null,
            );
            break;
          default:
            finish(errorFinish(`ACP stop reason: ${text(outcome.stopReason) || 'unknown'}`, 'ACP_STOP'), note ?? null);
            break;
        }
      } catch (error) {
        finish(
          options.signal?.aborted
            ? abortedFinish()
            : errorFinish(error instanceof Error ? error.message : String(error), 'ACP_PROMPT_FAILED'),
          null,
        );
      }
    })();

    for await (const chunk of queue) yield chunk;
  }

  const adapter = {
    providerInfo(provider) {
      const agent = agentForProvider(provider);
      return {
        id: provider,
        name: agent === null ? provider : `${agent.name} (ACP)`,
      };
    },
    providerRetryPolicy() {
      return zeroRetryPolicy();
    },
    async listModels(provider) {
      return modelsForProvider(provider).map((model) => ({
        provider,
        id: model.id,
        name: model.name,
      }));
    },
    async resolveModel(provider, model) {
      const found = modelsForProvider(provider).find((entry) => entry.id === model);
      return {
        provider,
        id: model,
        name: found?.name || model,
        context: { contextWindow: CONTEXT_WINDOW },
      };
    },
    async prepareCall(provider, model) {
      const resolved = await adapter.resolveModel(provider, model);
      return {
        model: resolved,
        stream: (options) => stream(options),
      };
    },
    stream(options) {
      return stream(options);
    },
  };

  function sync() {
    if (disposed) return;
    const agents = readAgents().filter((agent) => agent.enabled);
    providerAgents.clear();
    const providers = [];
    for (const agent of agents) {
      const provider = providerFor(agent.id);
      providerAgents.set(provider, agent.id);
      providers.push(provider);
      const tested = Array.isArray(agent.lastTest?.models) && agent.lastTest.ok ? agent.lastTest.models : [];
      if (tested.length > 0) {
        const normalized = tested.map((entry) => ({ id: text(entry.value) || text(entry.id), name: text(entry.name) }));
        if (!modelCache.has(provider)) modelCache.set(provider, withDefaultModel(normalized, agent));
      }
    }
    for (const provider of [...modelCache.keys()]) {
      if (!providerAgents.has(provider)) modelCache.delete(provider);
    }
    for (const [sessionId, connection] of [...connections]) {
      if (!providerAgents.has(connection.provider)) void detach(sessionId, 'agent disabled');
    }
    if (llm === null) return;
    try {
      if (providers.length === 0) {
        if (registration !== null) {
          registration();
          registration = null;
        }
        for (const sessionId of [...connections.keys()]) void detach(sessionId, 'agent disabled');
        return;
      }
      if (registration === null) {
        registration = llm.registerAdapter(providers, adapter);
      } else {
        registration.replace(providers);
      }
      for (const provider of providers) {
        try {
          ctx.emit?.('llm/models-updated', provider);
        } catch {
          /* no listeners */
        }
      }
    } catch (error) {
      logger.warn?.(`[acp-agents] could not publish ACP model routes: ${error instanceof Error ? error.message : String(error)}`);
    }
    // A lowered cap must take effect without waiting for the next turn.
    void evictIdle();
  }

  function notifyModels(agentId) {
    const provider = providerFor(agentId);
    const agent = readAgents().find((entry) => entry.id === agentId);
    if (agent !== undefined) {
      const tested = Array.isArray(agent.lastTest?.models) && agent.lastTest.ok ? agent.lastTest.models : [];
      if (tested.length > 0) {
        modelCache.set(provider, withDefaultModel(
          tested.map((entry) => ({ id: text(entry.value) || text(entry.id), name: text(entry.name) })),
          agent,
        ));
      }
    }
    try {
      ctx.emit?.('llm/models-updated', provider);
    } catch {
      /* absent llm */
    }
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    if (sessionListener !== null && typeof sessionListener === 'function') {
      try {
        sessionListener();
      } catch {
        /* ignore */
      }
      sessionListener = null;
    }
    if (registration !== null) {
      registration();
      registration = null;
    }
    for (const sessionId of [...connections.keys()]) {
      await detach(sessionId, 'plugin disposed').catch(() => {});
    }
  }

  // Clean up a Harness session's ACP process when that session leaves the store.
  try {
    sessionListener = ctx.on('session/disposed', (session) => {
      const sessionId = text(session?.id);
      // Deleting the Harness session is permanent: drop the agent-side session
      // too, so the agent does not accumulate unreachable history.
      if (sessionId.length > 0) void destroy(sessionId, 'session disposed');
    });
  } catch {
    /* event registry unavailable */
  }

  return {
    sync,
    notifyModels,
    stream,
    dispose,
    providerFor,
    listModels: (provider) => adapter.listModels(provider),
    listProviders: () => [...providerAgents.keys()],
    connectionCount: () => connections.size,
    idleCount: () => idleCount(),
    connectionIds: () => [...connections.keys()],
    sessionSnapshot: (sessionId) => connections.get(text(sessionId))?.statusSnapshot?.() ?? null,
  };
}

