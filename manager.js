/* Orchestration for the ACP agents plugin.
 *
 * One manager owns: the durable configuration, the registry cache and its
 * refresh, PATH detection, live subagent providers (one per enabled agent),
 * the two model-facing tools, and the HTTP state that the settings page reads.
 * Provider and tool registrations are effects of the plugin, rebuilt whenever
 * the configuration changes.
 */

import { homedir } from 'node:os';
import { statSync } from 'node:fs';
import { createAcpRunner } from './acp-client.js';
import { createAcpChatProvider } from './chat-provider.js';
import { createAcpWorkspace } from './workspace.js';
import {
  buildCandidates,
  detectCandidates,
  fetchRegistry,
} from './catalog.js';
import {
  acpDataDir,
  DEFAULT_MAX_IDLE_CONNECTIONS,
  loadConfig,
  loadRegistryCache,
  loadSessionRecords,
  MAX_SESSION_RECORDS,
  normalizeAgent,
  normalizeSelection,
  normalizeSelectionPatch,
  normalizeSessionRecord,
  registrySummary,
  saveConfig,
  saveRegistryCache,
  saveSessionRecords,
} from './store.js';

const REGISTRY_TTL_MS = 24 * 60 * 60 * 1000;
const DETECTION_TTL_MS = 10 * 1000;

function text(value) {
  return typeof value === 'string' ? value : '';
}

function toError(value) {
  return value instanceof Error ? value : new Error(String(value));
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function providerName(agent) {
  return `acp:${agent.id}`;
}

/**
 * Create the manager. `start()` is idempotent and must be called by `apply`.
 */
export function createAcpManager(ctx) {
  const logger = ctx.logger ?? console;
  const subprocess = ctx.subprocess;
  const runner = createAcpRunner({ subprocess, logger });

  let config = {
    version: 1,
    agents: [],
    defaultAgent: null,
    updatedAt: null,
    lastSelection: null,
    maxIdleConnections: DEFAULT_MAX_IDLE_CONNECTIONS,
  };
  let registry = null;
  let registryError = null;
  let registryLoading = false;
  let registryTask = null;
  let detection = new Map();
  let detectionAt = 0;
  let started = false;
  let startPromise = null;
  let disposed = false;
  let toolDisposers = [];
  let providerDisposers = [];
  let saving = Promise.resolve();
  const sessionOptions = new Map();
  let sessionRecords = new Map();
  let sessionOptionsListener = null;

  const chat = createAcpChatProvider({
    ctx,
    logger,
    readAgents: () => config.agents.filter((agent) => agent.enabled),
    readSessionOptions: (sessionId) => sessionOptions.get(sessionId) ?? null,
    onModels: (agentId, models, configOptions) => noteModels(agentId, models, configOptions),
    readSessionRecord,
    rememberSession,
    forgetSession,
    maxIdleConnections: () => config.maxIdleConnections ?? DEFAULT_MAX_IDLE_CONNECTIONS,
  });

  try {
    sessionOptionsListener = ctx.on('session/disposed', (session) => {
      const id = text(session?.id);
      if (id.length === 0) return;
      sessionOptions.delete(id);
      // The provider may have been evicted already, so the record must be
      // dropped here as well or sessions.json would keep a dead id forever.
      void forgetSession(id);
    });
  } catch {
    /* event registry unavailable */
  }

  /* ------------------------------------------------------------------ */
  /* Working directory                                                   */
  /* ------------------------------------------------------------------ */

  function defaultCwd() {
    try {
      const workingDirectory = ctx.get('workingDirectory');
      const value = workingDirectory && workingDirectory.defaultDirectory;
      if (typeof value === 'string' && isDirectory(value)) return value;
    } catch {
      /* service absent */
    }
    return homedir();
  }

  const workspace = createAcpWorkspace({
    ctx,
    subprocess,
    logger,
    readAgents: () => config.agents.filter((agent) => agent.enabled),
    defaultCwd,
    onOptions: (agentId, models, configOptions) => noteModels(agentId, models, configOptions),
  });

  /* ------------------------------------------------------------------ */
  /* Registry                                                            */
  /* ------------------------------------------------------------------ */

  async function ensureRegistry(force = false) {
    if (registryTask !== null) {
      await registryTask;
      return;
    }
    const age = registry === null ? Number.POSITIVE_INFINITY : Date.now() - registry.fetchedAt;
    if (!force && age < REGISTRY_TTL_MS) return;
    registryLoading = true;
    registryTask = (async () => {
      try {
        const next = await fetchRegistry();
        registry = next;
        registryError = null;
        detectionAt = 0;
        await saveRegistryCache(next).catch((error) => {
          logger.warn?.(`[acp-agents] could not cache the ACP registry: ${toError(error).message}`);
        });
      } catch (error) {
        registryError = toError(error).message;
        logger.warn?.(`[acp-agents] ACP registry refresh failed: ${registryError}`);
      } finally {
        registryLoading = false;
        registryTask = null;
      }
    })();
    await registryTask;
  }

  async function refreshRegistry() {
    await ensureRegistry(true);
    if (registryError !== null) throw new Error(registryError);
    return state();
  }

  /* ------------------------------------------------------------------ */
  /* Detection                                                           */
  /* ------------------------------------------------------------------ */

  function candidatesNow() {
    return buildCandidates(registry);
  }

  function extraDetectionRequests(candidates) {
    const covered = new Set(candidates.map((candidate) => candidate.command.trim().toLowerCase()));
    return config.agents
      .filter((agent) => !covered.has(agent.command.trim().toLowerCase()))
      .map((agent) => ({ key: `agent:${agent.id}`, command: agent.command, args: agent.args, env: agent.env }));
  }

  async function detect(force = false) {
    if (!force && Date.now() - detectionAt < DETECTION_TTL_MS) return detection;
    const candidates = candidatesNow();
    const extra = extraDetectionRequests(candidates);
    const [primary, additional] = await Promise.all([
      detectCandidates(subprocess, candidates),
      detectCandidates(subprocess, extra),
    ]);
    detection = new Map([...primary, ...additional]);
    detectionAt = Date.now();
    return detection;
  }

  /* ------------------------------------------------------------------ */
  /* State                                                               */
  /* ------------------------------------------------------------------ */

  function matchesCandidate(agent, candidate) {
    if (candidate.registryId !== null && agent.registryId !== null && candidate.registryId === agent.registryId) {
      return true;
    }
    return agent.command.trim().toLowerCase() === candidate.command.trim().toLowerCase();
  }

  function agentView(agent, detectionMap, candidates) {
    const candidate = candidates.find((entry) => matchesCandidate(agent, entry));
    const resolved = candidate === undefined
      ? detectionMap.get(`agent:${agent.id}`)
      : detectionMap.get(candidate.key);
    return {
      id: agent.id,
      name: agent.name,
      command: agent.command,
      args: agent.args,
      env: agent.env,
      enabled: agent.enabled,
      permission: agent.permission,
      model: agent.model,
      cwd: agent.cwd,
      source: agent.source,
      registryId: agent.registryId,
      available: resolved?.available === true,
      executable: resolved?.executable ?? null,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
      lastTest: agent.lastTest,
    };
  }

  async function state() {
    if (startPromise !== null) await startPromise.catch(() => {});
    const detectionMap = await detect();
    const candidates = candidatesNow();
    const enabled = config.agents.filter((agent) => agent.enabled);
    return {
      ok: true,
      at: Date.now(),
      dataDir: acpDataDir(),
      config: {
        agents: config.agents.map((agent) => agentView(agent, detectionMap, candidates)),
        defaultAgent: config.defaultAgent,
        updatedAt: config.updatedAt,
      },
      registry: registrySummary(registry),
      registryStatus: {
        loading: registryLoading,
        error: registryError,
        stale: registry === null || Date.now() - registry.fetchedAt > REGISTRY_TTL_MS,
      },
      candidates: candidates.map((candidate) => {
        const resolved = detectionMap.get(candidate.key);
        const added = config.agents.some((agent) => matchesCandidate(agent, candidate));
        return {
          key: candidate.key,
          name: candidate.name,
          description: candidate.description,
          command: candidate.command,
          args: candidate.args,
          env: candidate.env,
          source: candidate.source,
          registryId: candidate.registryId,
          website: candidate.website,
          distributionKind: candidate.distributionKind,
          available: resolved?.available === true,
          executable: resolved?.executable ?? null,
          reason: resolved?.reason ?? null,
          added,
        };
      }),
      runtime: {
        providers: providerDisposers.length,
        activeRuns: runner.activeCount(),
        enabledAgents: enabled.map((agent) => agent.id),
        modelRoutes: chat.listProviders(),
        workspaceChats: workspace.state().chats.length,
        maxIdleConnections: maxIdleConnections(),
        chatConnections: typeof chat.connectionCount === 'function' ? chat.connectionCount() : 0,
        idleConnections: typeof chat.idleCount === 'function' ? chat.idleCount() : 0,
      },
    };
  }

  /* ------------------------------------------------------------------ */
  /* Persistence                                                         */
  /* ------------------------------------------------------------------ */

  function serialize(work) {
    const next = saving.then(work, work);
    saving = next.catch(() => {});
    return next;
  }

  async function persist(nextConfig) {
    config = await saveConfig(nextConfig);
    config.updatedAt = Date.now();
    await pruneSessionRecords();
    await detect(true);
    syncRuntime();
    return state();
  }

  /* ------------------------------------------------------------------ */
  /* Runtime registrations                                               */
  /* ------------------------------------------------------------------ */

  function makeProvider(agent) {
    return {
      name: providerName(agent),
      capabilities: {
        agentOptions: false,
        agentPreset: false,
        outputSchema: false,
        depthLimit: false,
      },
      inheritsParentContext: false,
      async start(request) {
        const cwd = agent.cwd ?? request.cwd ?? request.parent?.session?.header?.cwd;
        const run = await runner.start(agent, {
          cwd,
          prompt: request.prompt,
          signal: request.signal,
          permission: agent.permission,
        });
        return {
          id: run.id,
          result: run.result,
          dispose: run.dispose,
        };
      },
    };
  }

  function agentDescription(agent) {
    const cwd = agent.cwd === null ? '' : `, cwd ${agent.cwd}`;
    return `${agent.id} (${agent.name}${cwd})`;
  }

  function describeAgents() {
    const enabled = config.agents.filter((agent) => agent.enabled);
    if (enabled.length === 0) {
      return 'No external ACP agents are enabled yet. Ask the user to enable one in Settings → External agents (ACP).';
    }
    return enabled.map(agentDescription).join('; ');
  }

  function registerTools() {
    const enabled = config.agents.filter((agent) => agent.enabled);

    toolDisposers.push(
      ctx.tools.register({
        name: 'acp_agents',
        description:
          'List the external ACP agents configured on this machine (OpenCode, Gemini CLI, Codex, Claude Agent, Cursor, and others), ' +
          'whether each is enabled and installed, its launch command, and the result of its last connection test. ' +
          'Call this before acp_delegate when you are not sure which agent id to use. ' +
          `Currently enabled: ${enabled.length === 0 ? 'none' : enabled.map((agent) => agent.id).join(', ')}.`,
        parameters: { type: 'object', properties: {}, additionalProperties: false },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['agents'],
            properties: {
              agents: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: true,
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    enabled: { type: 'boolean' },
                    available: { type: 'boolean' },
                    model: { type: 'string' },
                    executable: { type: 'string' },
                  },
                },
              },
              defaultAgent: { type: 'string' },
            },
          },
          render: (_args, value) => [{ type: 'text', text: renderAgents(value) }],
        },
        async execute() {
          const detectionMap = await detect();
          const candidates = candidatesNow();
          const agents = config.agents.map((agent) => {
            const view = agentView(agent, detectionMap, candidates);
            const entry = {
              id: view.id,
              name: view.name,
              enabled: view.enabled,
              available: view.available,
              command: view.command,
              lastTest: view.lastTest ?? null,
            };
            if (view.model !== null) entry.model = view.model;
            if (view.executable !== null) entry.executable = view.executable;
            return entry;
          });
          const result = { agents };
          if (config.defaultAgent !== null) result.defaultAgent = config.defaultAgent;
          return result;
        },
      }),
    );

    if (enabled.length === 0) return;

    toolDisposers.push(
      ctx.tools.register({
        name: 'acp_delegate',
        description:
          'Delegate a task to an external ACP agent running on this machine. ' +
          'The agent runs in its own process with its own model, tools, and permissions; it does not see this conversation, so put the complete task, relevant absolute paths, and constraints in `task`. ' +
          'The tool returns as soon as the agent accepts the task; the final answer arrives later as a subagent completion notice. Do not poll and do not start a duplicate delegation. ' +
          'If `agent` is omitted the configured default agent is used. ' +
          `Available agents: ${describeAgents()}.`,
        parameters: {
          type: 'object',
          required: ['task'],
          properties: {
            agent: {
              type: 'string',
              description: `ACP agent id. One of: ${enabled.map((agent) => agent.id).join(', ')}. Omit to use the default agent.`,
            },
            task: {
              type: 'string',
              description: 'The complete, self-contained task for the external agent.',
            },
            cwd: {
              type: 'string',
              description: 'Optional absolute working directory for the agent. Relative paths resolve against the caller current directory; omission inherits it.',
            },
          },
          additionalProperties: false,
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'subagentId', 'agent'],
            properties: {
              kind: { type: 'string' },
              subagentId: { type: 'string' },
              agent: { type: 'string' },
            },
          },
          render: (_args, value) => [
            {
              type: 'text',
              text: `Started ACP agent "${value.agent}" as subagent ${value.subagentId}. The result will arrive as a completion notice.`,
            },
          ],
        },
        async execute(args, exec) {
          if (!exec.agent) throw new Error('acp_delegate requires an owning agent session');
          const requested = text(args.agent).trim();
          const agent =
            requested.length === 0
              ? config.agents.find((entry) => entry.id === config.defaultAgent && entry.enabled) ??
                config.agents.find((entry) => entry.enabled)
              : config.agents.find((entry) => entry.id === requested && entry.enabled);
          if (agent === undefined) {
            throw new Error(
              `No enabled ACP agent named "${requested || '(default)'}". Call acp_agents to list the configured agents.`,
            );
          }
          const task = text(args.task).trim();
          if (task.length === 0) throw new Error('acp_delegate requires a non-empty task');
          const cwd = text(args.cwd).trim();
          const activation = await ctx.subagents.startActivation({
            provider: providerName(agent),
            label: `${agent.name} (ACP)`,
            request: {
              prompt: [{ type: 'text', text: task }],
              parent: exec.agent,
              ...(cwd.length === 0 ? {} : { cwd }),
            },
            signal: exec.signal,
            delivery: 'parent',
          });
          return {
            kind: 'activation',
            subagentId: String(activation.childId),
            agent: agent.id,
          };
        },
      }),
    );
  }

  function renderAgents(value) {
    const agents = Array.isArray(value.agents) ? value.agents : [];
    if (agents.length === 0) {
      return 'No external ACP agents are configured. Open Settings → External agents (ACP) to enable one.';
    }
    const lines = [`External ACP agents (${agents.length} total):`];
    for (const agent of agents) {
      const status = agent.enabled ? (agent.available ? 'enabled, installed' : 'enabled, command not found') : 'disabled';
      const test = agent.lastTest
        ? agent.lastTest.ok
          ? `last test ok${agent.lastTest.agentInfo?.name ? ` (${agent.lastTest.agentInfo.name} ${agent.lastTest.agentInfo.version ?? ''})`.trim() : ''}`
          : `last test failed: ${text(agent.lastTest.error).slice(0, 160)}`
        : 'not tested';
      lines.push(`- ${agent.id} (${agent.name}): ${status}; ${test}.`);
    }
    lines.push('Delegate with acp_delegate, which returns immediately and reports the final answer as a subagent completion notice.');
    return lines.join('\n');
  }

  function syncRuntime() {
    for (const dispose of toolDisposers) {
      try {
        dispose();
      } catch {
        /* ignore */
      }
    }
    toolDisposers = [];
    for (const dispose of providerDisposers) {
      try {
        dispose();
      } catch {
        /* ignore */
      }
    }
    providerDisposers = [];
    if (disposed) return;
    for (const agent of config.agents) {
      if (!agent.enabled) continue;
      try {
        providerDisposers.push(ctx.subagents.registerProvider(makeProvider(agent)));
      } catch (error) {
        logger.warn?.(`[acp-agents] could not register provider "${providerName(agent)}": ${toError(error).message}`);
      }
    }
    try {
      registerTools();
    } catch (error) {
      logger.warn?.(`[acp-agents] could not register tools: ${toError(error).message}`);
    }
    try {
      chat.sync();
    } catch (error) {
      logger.warn?.(`[acp-agents] could not publish ACP model routes: ${toError(error).message}`);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Public operations                                                   */
  /* ------------------------------------------------------------------ */

  async function initialize() {
    config = await loadConfig();
    sessionRecords = await loadSessionRecords().catch(() => new Map());
    registry = await loadRegistryCache().catch(() => null);
    syncRuntime();
    void ensureRegistry();
  }

  async function start() {
    if (started) return state();
    started = true;
    startPromise = initialize();
    await startPromise;
    return state();
  }

  async function saveAgent(input) {
    return serialize(async () => {
      const existingId = text(input?.id).trim();
      const existing = existingId.length > 0 ? config.agents.find((agent) => agent.id === existingId) : undefined;
      const taken = new Set(config.agents.map((agent) => agent.id));
      const record = normalizeAgent(input, { existing, taken });
      const agents = existing === undefined
        ? [...config.agents, record]
        : config.agents.map((agent) => (agent.id === record.id ? record : agent));
      return persist({
        ...config,
        agents,
        defaultAgent: config.defaultAgent ?? record.id,
      });
    });
  }

  async function removeAgent(id) {
    return serialize(async () => {
      const agentId = text(id).trim();
      const agent = config.agents.find((entry) => entry.id === agentId);
      if (agent === undefined) throw new Error(`agent "${agentId}" does not exist`);
      const agents = config.agents.filter((entry) => entry.id !== agentId);
      const defaultAgent = config.defaultAgent === agentId ? agents.find((entry) => entry.enabled)?.id ?? agents[0]?.id ?? null : config.defaultAgent;
      return persist({ ...config, agents, defaultAgent });
    });
  }

  async function setDefaultAgent(id) {
    return serialize(async () => {
      const agentId = text(id).trim();
      if (!config.agents.some((agent) => agent.id === agentId)) throw new Error(`agent "${agentId}" does not exist`);
      return persist({ ...config, defaultAgent: agentId });
    });
  }

  function readSessionOptions(sessionId) {
    return sessionOptions.get(text(sessionId)) ?? null;
  }

  function readSessionRecord(sessionId) {
    return sessionRecords.get(text(sessionId).trim()) ?? null;
  }

  /** Persist one Harness → ACP session mapping after a fresh session is established. */
  function rememberSession(sessionId, record) {
    const id = text(sessionId).trim();
    const normalized = normalizeSessionRecord({ ...record, updatedAt: Date.now() }, id);
    if (normalized === null) return Promise.resolve();
    sessionRecords.set(id, normalized);
    if (sessionRecords.size > MAX_SESSION_RECORDS) {
      const overflow = [...sessionRecords.entries()]
        .sort((left, right) => left[1].updatedAt - right[1].updatedAt)
        .slice(0, sessionRecords.size - MAX_SESSION_RECORDS);
      for (const [key] of overflow) sessionRecords.delete(key);
    }
    return serialize(() => saveSessionRecords(sessionRecords)).catch(() => {});
  }

  function forgetSession(sessionId) {
    const id = text(sessionId).trim();
    if (id.length === 0 || !sessionRecords.delete(id)) return Promise.resolve();
    return serialize(() => saveSessionRecords(sessionRecords)).catch(() => {});
  }

  /** Drop mappings whose agent was removed; called inside the save chain. */
  async function pruneSessionRecords() {
    const known = new Set(config.agents.map((agent) => agent.id));
    let changed = false;
    for (const [id, record] of [...sessionRecords]) {
      if (known.has(record.agentId)) continue;
      sessionRecords.delete(id);
      changed = true;
    }
    if (changed) await saveSessionRecords(sessionRecords);
  }

  function maxIdleConnections() {
    return config.maxIdleConnections ?? DEFAULT_MAX_IDLE_CONNECTIONS;
  }

  /**
   * The ACP process only starts with the first turn. Until then the session is
   * pointed at an agent but has no connection, so report a pending skeleton
   * that still carries the agent name the header should show.
   */
  function pendingAcpState(options, providerAgentId = '') {
    const agentId = text(options?.agentId).trim() || text(providerAgentId).trim();
    if (agentId.length === 0) return null;
    const agent = config.agents.find((entry) => entry.id === agentId) ?? null;
    return {
      connected: false,
      pending: true,
      busy: false,
      agent: { id: agentId, name: text(agent?.name) || agentId, version: null },
      protocolVersion: null,
      capabilities: null,
      authMethods: [],
      acpSessionId: null,
      cwd: null,
      resumed: false,
      resumeMethod: null,
      mode: null,
      usage: null,
      cost: null,
      commands: null,
      config: null,
      plan: null,
      compaction: null,
      sessionInfo: null,
      tools: [],
      pid: null,
      updatedAt: null,
    };
  }

  /** Current route + per-session ACP options for the native chat header. */
  function sessionState(sessionId) {
    const id = text(sessionId).trim();
    let current = null;
    let explicit = false;
    try {
      const live = ctx.get('agents')?.get?.(id);
      current = live?.model?.current?.() ?? null;
      const recorded = live?.model?.recordedSelection?.();
      explicit = recorded !== null && recorded !== undefined;
    } catch {
      current = null;
      explicit = false;
    }
    const options = sessionOptions.get(id) ?? null;
    const snapshot = chat.sessionSnapshot?.(id) ?? null;
    // A session can carry an ACP route without per-session options (for example
    // when it was reopened after a Host restart); the provider id still names
    // the agent, so the header keeps showing it.
    const providerAgentId = typeof current?.provider === 'string' && current.provider.startsWith('acp-')
      ? current.provider.slice(4)
      : '';
    return {
      ok: true,
      sessionId: id,
      provider: current?.provider ?? null,
      model: current?.model ?? null,
      options,
      explicit,
      selection: config.lastSelection ?? null,
      acp: snapshot ?? pendingAcpState(options, providerAgentId),
    };
  }

  /**
   * Point one live Session at an ACP agent and record its ACP-only options.
   * Shared by the composer/header apply route and by new-session restoration.
   */
  async function applyAcpRoute(id, selection) {
    const agent = config.agents.find((entry) => entry.id === selection.agentId && entry.enabled);
    if (agent === undefined) throw new Error(`no enabled ACP agent named "${selection.agentId}"`);
    const live = ctx.get('agents')?.get?.(id);
    if (live === undefined) throw new Error('the target session is not live; reopen it and try again');
    const llm = ctx.get('llm');
    if (llm === null || llm === undefined) throw new Error('the LLM service is unavailable');
    const selectedModel = text(selection.model).trim() || 'default';
    const provider = `acp-${agent.id}`;
    await llm.resolveCallConfig({ provider, model: selectedModel });
    live.model.select({ provider, model: selectedModel });
    const options = {
      agentId: agent.id,
      model: selectedModel,
      permission: selection.permission === 'deny' ? 'deny' : 'allow',
      config: { ...selection.config },
    };
    sessionOptions.set(id, options);
    return { provider, model: selectedModel, options };
  }

  /**
   * Apply the Agent → Model → Permission → Mode selection to one live Session:
   * record the LLM route and keep ACP-only options for the chat provider.
   */
  async function applySession(request) {
    const id = text(request?.sessionId).trim();
    if (id.length === 0) throw new Error('sessionId is required');
    const configValues = {};
    if (request?.config !== null && typeof request?.config === 'object' && !Array.isArray(request.config)) {
      for (const [key, value] of Object.entries(request.config)) {
        if (typeof key === 'string' && key.length > 0 && typeof value === 'string') configValues[key] = value;
      }
    }
    const selection = {
      agentId: text(request?.agentId).trim(),
      model: text(request?.model).trim() || 'default',
      permission: request?.permission === 'deny' ? 'deny' : 'allow',
      config: configValues,
    };
    const applied = await applyAcpRoute(id, selection);
    await saveSelection({ lane: 'acp', acp: selection });
    return { ok: true, sessionId: id, ...applied, selection: config.lastSelection ?? null };
  }

  /** Remember the composer's last choice so a brand-new conversation reuses it. */
  async function saveSelection(input) {
    return serialize(async () => {
      const patch = normalizeSelectionPatch(input);
      const previous = config.lastSelection ?? { lane: 'native', native: null, acp: null };
      const next = normalizeSelection({
        lane: patch.lane ?? previous.lane,
        native: patch.native === undefined ? previous.native : patch.native,
        acp: patch.acp === undefined ? previous.acp : patch.acp,
      });
      config = await saveConfig({ ...config, lastSelection: next });
      config.updatedAt = Date.now();
      return { ok: true, selection: next };
    });
  }

  /**
   * Restore the remembered ACP choice into a fresh Session. A session that has
   * already recorded a model selection (or sent a turn) keeps its own route.
   */
  async function restoreSession(request) {
    const id = text(request?.sessionId).trim();
    if (id.length === 0) throw new Error('sessionId is required');
    const saved = config.lastSelection;
    if (saved === null || saved.lane !== 'acp' || saved.acp === null) {
      return { ok: true, sessionId: id, restored: false, ...sessionState(id) };
    }
    let live;
    try {
      live = ctx.get('agents')?.get?.(id);
    } catch {
      live = undefined;
    }
    if (live === undefined) return { ok: true, sessionId: id, restored: false, ...sessionState(id) };
    let recorded;
    try {
      recorded = live.model?.recordedSelection?.();
    } catch {
      recorded = null;
    }
    if (recorded !== null && recorded !== undefined) {
      return { ok: true, sessionId: id, restored: false, ...sessionState(id) };
    }
    try {
      await applyAcpRoute(id, saved.acp);
    } catch (error) {
      logger.warn?.(`[acp-agents] could not restore the last ACP choice: ${toError(error).message}`);
      return { ok: true, sessionId: id, restored: false, ...sessionState(id) };
    }
    return { ok: true, sessionId: id, restored: true, ...sessionState(id) };
  }

  /** Persist model/config discovery from a live ACP chat so the header picker survives restarts. */
  function noteModels(agentId, models, configOptions) {
    const agent = config.agents.find((entry) => entry.id === agentId);
    if (agent === undefined) return;
    const normalized = (Array.isArray(models) ? models : [])
      .map((entry) => ({ value: text(entry.id) || text(entry.value), name: text(entry.name) }))
      .filter((entry) => entry.value.length > 0);
    const normalizedOptions = Array.isArray(configOptions) ? configOptions : null;
    if (normalized.length === 0 && normalizedOptions === null) return;
    const sameModels = normalized.length === 0 || JSON.stringify(agent.lastTest?.models ?? null) === JSON.stringify(normalized);
    const sameOptions = normalizedOptions === null || JSON.stringify(agent.lastTest?.configOptions ?? null) === JSON.stringify(normalizedOptions);
    if (sameModels && sameOptions) return;
    void serialize(async () => {
      const current = config.agents.find((entry) => entry.id === agentId);
      if (current === undefined) return;
      const now = Date.now();
      const lastTest = {
        ...(current.lastTest ?? { ok: true, at: now, error: null }),
        ok: true,
        at: now,
        error: null,
        ...(normalized.length === 0 ? {} : { models: normalized }),
        ...(normalizedOptions === null ? {} : { configOptions: normalizedOptions }),
      };
      config = await saveConfig({
        ...config,
        agents: config.agents.map((entry) =>
          entry.id === agentId ? { ...entry, lastTest, updatedAt: now } : entry,
        ),
      });
      config.updatedAt = now;
    }).catch((error) => {
      logger.warn?.(`[acp-agents] could not save discovered models for "${agentId}": ${toError(error).message}`);
    });
  }

  async function testAgent(id) {
    const agentId = text(id).trim();
    const agent = config.agents.find((entry) => entry.id === agentId);
    if (agent === undefined) throw new Error(`agent "${agentId}" does not exist`);
    const startedAt = Date.now();
    let lastTest;
    try {
      const cwd = agent.cwd ?? defaultCwd();
      const result = await runner.probe(agent, { cwd });
      lastTest = {
        ok: true,
        at: Date.now(),
        durationMs: Date.now() - startedAt,
        executable: result.info.launch.executable,
        launchKind: result.info.launch.kind,
        protocolVersion: result.info.protocolVersion,
        agentInfo: result.info.agentInfo,
        models: result.info.models,
        configOptions: result.info.configOptions,
        capabilities: result.info.capabilities,
        authMethods: result.info.authMethods,
        error: null,
      };
    } catch (error) {
      lastTest = {
        ok: false,
        at: Date.now(),
        durationMs: Date.now() - startedAt,
        error: toError(error).message,
      };
    }
    await serialize(async () => {
      const agents = config.agents.map((entry) =>
        entry.id === agentId ? { ...entry, lastTest, updatedAt: Date.now() } : entry,
      );
      config = await saveConfig({ ...config, agents });
      config.updatedAt = Date.now();
    });
    chat.notifyModels(agentId);
    return { agentId, test: lastTest };
  }

  async function testAll() {
    const results = [];
    for (const agent of config.agents) {
      results.push(await testAgent(agent.id));
    }
    return results;
  }

  async function detectNow() {
    await detect(true);
    return state();
  }

  /** Lightweight agent list for the composer picker (no registry payload). */
  async function listAgents() {
    const detectionMap = await detect();
    const candidates = candidatesNow();
    return {
      ok: true,
      defaultAgent: config.defaultAgent,
      agents: config.agents.map((agent) => agentView(agent, detectionMap, candidates)),
    };
  }

  /**
   * Start one external-agent run for a live browser session. The activation
   * delivers its completion notice to that session, exactly like a model tool
   * call, but the human authors the task directly.
   */
  async function dispatch({ agentId, task, sessionId }) {
    const id = text(agentId).trim();
    const agent = config.agents.find((entry) => entry.id === id && entry.enabled);
    if (agent === undefined) throw new Error(`no enabled ACP agent named "${id}"`);
    const prompt = text(task).trim();
    if (prompt.length === 0) throw new Error('task is required');
    const target = text(sessionId).trim();
    if (target.length === 0) throw new Error('sessionId is required');
    const agentsService = ctx.get('agents');
    const live = agentsService && typeof agentsService.get === 'function' ? agentsService.get(target) : undefined;
    if (live === undefined) throw new Error('the target session is not live; reopen it and try again');
    const controller = new AbortController();
    const activation = await ctx.subagents.startActivation({
      provider: providerName(agent),
      label: `${agent.name} (ACP)`,
      request: { prompt: [{ type: 'text', text: prompt }], parent: live },
      signal: controller.signal,
      delivery: 'parent',
    });
    return { agentId: agent.id, agentName: agent.name, subagentId: String(activation.childId) };
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    for (const disposeTool of toolDisposers) {
      try {
        disposeTool();
      } catch {
        /* ignore */
      }
    }
    toolDisposers = [];
    for (const disposeProvider of providerDisposers) {
      try {
        disposeProvider();
      } catch {
        /* ignore */
      }
    }
    providerDisposers = [];
    if (sessionOptionsListener !== null && typeof sessionOptionsListener === 'function') {
      try {
        sessionOptionsListener();
      } catch {
        /* ignore */
      }
      sessionOptionsListener = null;
    }
    sessionOptions.clear();
    await chat.dispose().catch(() => {});
    await workspace.dispose().catch(() => {});
    await runner.dispose().catch(() => {});
  }

  return {
    start,
    state,
    saveAgent,
    removeAgent,
    setDefaultAgent,
    testAgent,
    testAll,
    detectNow,
    refreshRegistry,
    listAgents,
    dispatch,
    sessionState,
    applySession,
    restoreSession,
    saveSelection,
    readSessionOptions,
    workspace,
    dispose,
  };
}
