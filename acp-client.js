/* ACP client: one external agent process per run, driven over newline-delimited
 * JSON-RPC 2.0 on stdio.
 *
 * This module deliberately has no package imports beyond Node builtins: the
 * bundle runs from the DSH profile, where only Node builtins and relative
 * modules are guaranteed to resolve. It receives DSH's `ctx.subprocess` seam
 * so process ownership, environment scrubbing, and whole-tree termination stay
 * with the Host implementation.
 *
 * Wire coverage: initialize, session/new, optional session/load and
 * session/resume, session/set_config_option, session/prompt, session/update,
 * session/request_permission, session/cancel, optional session/close. Every
 * other client method the agent might call is refused with JSON-RPC -32601
 * because this client advertises no fs, terminal, or auth capabilities.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export const ACP_PROTOCOL_VERSION = 1;

const START_TIMEOUT_MS = 120_000;
const CONFIG_TIMEOUT_MS = 30_000;
const CLOSE_TIMEOUT_MS = 5_000;
const CANCEL_GRACE_MS = 8_000;
const DISPOSE_EOF_GRACE_MS = 4_000;
const DISPOSE_GRACE_MS = 4_000;
const EXIT_PROOF_TIMEOUT_MS = 8_000;
const STDERR_TAIL_BYTES = 8 * 1024;
const STDOUT_NOISE_TAIL_BYTES = 4 * 1024;
const MAX_LINE_BYTES = 32 * 1024 * 1024;

/** Stable client identity advertised during initialize. */
export const CLIENT_INFO = {
  name: 'deepseek-harness',
  title: 'DeepSeek Harness',
  version: '1.0.0',
};

/** One ACP exchange failure with the child's stderr tail attached. */
export class AcpError extends Error {
  constructor(message, options = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AcpError';
    this.code = options.code ?? 'acp/error';
    this.detail = options.detail;
    this.rpcCode = Number.isInteger(options.rpcCode) ? options.rpcCode : null;
    this.method = typeof options.method === 'string' ? options.method : null;
  }
}

function toError(value) {
  return value instanceof Error ? value : new Error(String(value));
}

function textOf(value) {
  return typeof value === 'string' ? value : '';
}

function tailPush(state, chunk, limit) {
  state.text = (state.text + chunk.toString('utf8')).slice(-limit);
}

function stderrDetail(state) {
  const text = state.text.trim();
  if (text.length === 0) return '';
  return text.length > 1_200 ? `…${text.slice(-1_200)}` : text;
}

function withDetail(message, stderr) {
  const detail = stderrDetail(stderr);
  return detail.length === 0 ? message : `${message}\n${detail}`;
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Resolve and validate the child's working directory before anything spawns. */
export function resolveAgentCwd(configured, fallback, label) {
  const candidate = configured ?? fallback;
  if (typeof candidate !== 'string' || candidate.trim().length === 0) {
    throw new AcpError(`No working directory for "${label}": configure one, or delegate from a session that has a workspace.`);
  }
  const absolute = isAbsolute(candidate) ? candidate : resolve(candidate);
  if (!isDirectory(absolute)) {
    throw new AcpError(`Working directory for "${label}" is not an accessible directory: ${absolute}`);
  }
  return absolute;
}

/* ------------------------------------------------------------------ */
/* Launch planning                                                     */
/* ------------------------------------------------------------------ */

/**
 * Read an npm/pnpm Windows shim and recover the Node entry script it runs.
 * Generated shims carry a `"%dp0%\node_modules\...\index.js"` path; running
 * that script with the Host's own Node avoids cmd.exe quoting entirely.
 */
function parseNodeShim(cmdPath) {
  let source;
  try {
    source = readFileSync(cmdPath, 'utf8');
  } catch {
    return null;
  }
  if (source.length > 64 * 1024) return null;
  const directory = dirname(cmdPath);
  const pattern = /(?:%dp0%|%~dp0)[\\/]([^"\r\n]+?\.(?:js|mjs|cjs))/gi;
  let match;
  let relative = null;
  while ((match = pattern.exec(source)) !== null) relative = match[1];
  if (relative === null) return null;
  const script = join(directory, relative);
  return existsSync(script) ? script : null;
}

function powershellExecutable() {
  const systemRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  const full = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return existsSync(full) ? full : 'powershell.exe';
}

function powershellQuote(value) {
  if (/[\r\n]/.test(value)) {
    throw new AcpError('A launch argument contains a newline, which cannot be passed through the Windows command shim.');
  }
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Decide the exact argv to spawn for one configured command.
 *
 * On Windows `resolveExecutable` may return a `.cmd`/`.bat` shim, which Node
 * cannot spawn directly. Prefer the shim's Node entry script, then a sibling
 * PowerShell script, then a conservative PowerShell invocation.
 */
export async function buildLaunchPlan(subprocess, command, args, env, label) {
  if (typeof command !== 'string' || command.trim().length === 0) {
    throw new AcpError(`Agent "${label}" has no command configured.`);
  }
  const normalizedArgs = Array.isArray(args) ? args.map((entry) => String(entry)) : [];
  let executable;
  try {
    executable = await subprocess.resolveExecutable(command.trim(), env);
  } catch (error) {
    throw new AcpError(
      `Agent "${label}" command not found: ${command}. Install it, or set the command to an absolute path.`,
      { cause: error, code: 'acp/executable-not-found' },
    );
  }
  if (process.platform !== 'win32') {
    return { argv: [executable, ...normalizedArgs], executable, kind: 'direct' };
  }
  const extension = extname(executable).toLowerCase();
  if (extension !== '.cmd' && extension !== '.bat') {
    return { argv: [executable, ...normalizedArgs], executable, kind: 'direct' };
  }
  const shimScript = parseNodeShim(executable);
  if (shimScript !== null) {
    return {
      argv: [process.execPath, shimScript, ...normalizedArgs],
      executable,
      kind: 'node-shim',
    };
  }
  const sibling = executable.slice(0, -extension.length) + '.ps1';
  if (existsSync(sibling)) {
    return {
      argv: [powershellExecutable(), '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', sibling, ...normalizedArgs],
      executable,
      kind: 'powershell-file',
    };
  }
  const line = [executable, ...normalizedArgs].map(powershellQuote).join(' ');
  return {
    argv: [powershellExecutable(), '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `& ${line}`],
    executable,
    kind: 'powershell-command',
  };
}

/* ------------------------------------------------------------------ */
/* JSON-RPC peer                                                       */
/* ------------------------------------------------------------------ */

class AcpPeer {
  constructor({ readable, writable, onRequest, onNotification, onFailure }) {
    this.readable = readable;
    this.writable = writable;
    this.onRequest = onRequest;
    this.onNotification = onNotification;
    this.onFailure = onFailure;
    this.pending = new Map();
    this.nextId = 1;
    this.buffer = '';
    this.closed = false;
    this.failure = null;
    this.stdoutNoise = { text: '' };
    this._onData = (chunk) => this._handleData(chunk);
    this._onError = (error) => this.fail(new AcpError('ACP stdio failed', { cause: error }));
    readable.on('data', this._onData);
    readable.on('error', this._onError);
    writable.on?.('error', this._onError);
  }

  _handleData(chunk) {
    if (this.closed) return;
    this.buffer += chunk.toString('utf8');
    if (this.buffer.length > MAX_LINE_BYTES) {
      this.fail(new AcpError('ACP agent produced an oversized protocol line'));
      return;
    }
    let newline;
    while ((newline = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newline).replace(/\r$/, '');
      this.buffer = this.buffer.slice(newline + 1);
      if (line.trim().length === 0) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        tailPush(this.stdoutNoise, line + '\n', STDOUT_NOISE_TAIL_BYTES);
        continue;
      }
      this._dispatch(message);
    }
  }

  _dispatch(message) {
    if (message === null || typeof message !== 'object') return;
    const hasId = message.id !== undefined && message.id !== null;
    const method = typeof message.method === 'string' ? message.method : null;
    if (hasId && method !== null) {
      this._answer(message.id, method, message.params);
      return;
    }
    if (hasId) {
      const pending = this.pending.get(message.id);
      if (pending === undefined) return;
      this.pending.delete(message.id);
      pending.settle();
      if (message.error !== undefined) {
        const error = message.error || {};
        pending.reject(
          new AcpError(
            textOf(error.message) || `ACP request "${pending.method}" failed`,
            {
              code: 'acp/agent-error',
              detail: error.data,
              rpcCode: error.code,
              method: pending.method,
            },
          ),
        );
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    if (method !== null) {
      try {
        this.onNotification(method, message.params);
      } catch {
        /* A malformed notification must not take down the connection. */
      }
    }
  }

  _answer(id, method, params) {
    const respond = (payload) => {
      try {
        this.send({ jsonrpc: '2.0', id, ...payload });
      } catch {
        /* The child is gone; nothing to answer. */
      }
    };
    if (method === 'session/request_permission') {
      Promise.resolve()
        .then(() => this.onRequest.handlePermission(params))
        .then((result) => respond({ result }))
        .catch((error) => {
          respond({ error: { code: -32603, message: toError(error).message } });
        });
      return;
    }
    if (method === 'session/update') {
      try {
        this.onNotification(method, params);
        respond({ result: null });
      } catch {
        respond({ result: null });
      }
      return;
    }
    respond({
      error: {
        code: -32601,
        message: `Method not found: ${method}. This client advertises no filesystem, terminal, or auth capabilities.`,
      },
    });
  }

  send(payload) {
    if (this.closed) throw new AcpError('ACP connection is closed');
    if (!this.writable || this.writable.destroyed || this.writable.writableEnded) {
      throw new AcpError('ACP agent stdin is closed');
    }
    this.writable.write(`${JSON.stringify(payload)}\n`);
  }

  request(method, params, options = {}) {
    if (this.closed) return Promise.reject(this.failure ?? new AcpError('ACP connection is closed'));
    const id = this.nextId++;
    const { timeoutMs, signal } = options;
    return new Promise((resolvePromise, rejectPromise) => {
      let timer = null;
      let abortListener = null;
      const settle = () => {
        if (timer !== null) clearTimeout(timer);
        if (abortListener !== null) signal?.removeEventListener('abort', abortListener);
      };
      const entry = {
        method,
        resolve: (value) => { settle(); resolvePromise(value); },
        reject: (error) => { settle(); rejectPromise(error); },
        settle,
      };
      if (typeof timeoutMs === 'number' && timeoutMs > 0) {
        timer = setTimeout(() => {
          if (!this.pending.has(id)) return;
          this.pending.delete(id);
          settle();
          rejectPromise(new AcpError(`ACP request "${method}" timed out after ${Math.round(timeoutMs / 1000)}s`));
        }, timeoutMs);
      }
      if (signal !== undefined) {
        if (signal.aborted) {
          settle();
          rejectPromise(new AcpError('ACP request was cancelled before it started', { code: 'acp/aborted' }));
          return;
        }
        abortListener = () => {
          if (!this.pending.has(id)) return;
          this.pending.delete(id);
          settle();
          rejectPromise(new AcpError(`ACP request "${method}" was cancelled`, { code: 'acp/aborted' }));
        };
        signal.addEventListener('abort', abortListener, { once: true });
      }
      this.pending.set(id, entry);
      try {
        this.send({ jsonrpc: '2.0', id, method, params });
      } catch (error) {
        this.pending.delete(id);
        settle();
        rejectPromise(toError(error));
      }
    });
  }

  notify(method, params) {
    this.send({ jsonrpc: '2.0', method, params });
  }

  fail(error) {
    if (this.closed) return;
    this.closed = true;
    this.failure = error;
    for (const entry of this.pending.values()) {
      entry.settle();
      entry.reject(error);
    }
    this.pending.clear();
    try {
      this.readable.off('data', this._onData);
      this.readable.off('error', this._onError);
      this.writable.off?.('error', this._onError);
    } catch {
      /* ignore */
    }
    try {
      this.onFailure?.(error);
    } catch {
      /* ignore */
    }
  }

  close(reason) {
    this.fail(new AcpError(reason ?? 'ACP connection closed'));
  }

  describeNoise() {
    const noise = this.stdoutNoise.text.trim();
    if (noise.length === 0) return '';
    return noise.length > 600 ? `…${noise.slice(-600)}` : noise;
  }
}

/* ------------------------------------------------------------------ */
/* One ACP session                                                     */
/* ------------------------------------------------------------------ */

function flattenSelectOptions(options) {
  if (!Array.isArray(options)) return [];
  const flat = [];
  for (const entry of options) {
    if (entry === null || typeof entry !== 'object') continue;
    if (Array.isArray(entry.options)) {
      for (const nested of entry.options) {
        if (nested && typeof nested === 'object' && typeof nested.value === 'string') flat.push(nested);
      }
    } else if (typeof entry.value === 'string') {
      flat.push(entry);
    }
  }
  return flat;
}

function pickPermissionOption(options) {
  if (!Array.isArray(options)) return null;
  for (const kind of ['allow_once', 'allow_always']) {
    const found = options.find((option) => option && option.kind === kind && typeof option.optionId === 'string');
    if (found !== undefined) return found;
  }
  return null;
}

function modelOptionOf(configOptions) {
  if (!Array.isArray(configOptions)) return null;
  const candidates = configOptions.filter((option) => option && option.type === 'select');
  return (
    candidates.find((option) => option.category === 'model') ??
    candidates.find((option) => option.id === 'model') ??
    candidates.find((option) => /model/i.test(textOf(option.name)) || /model/i.test(textOf(option.id))) ??
    null
  );
}

/** A session capability is declared either as `true` or as an options object. */
function hasSessionCapability(init, name) {
  const capabilities = init && init.agentCapabilities && init.agentCapabilities.sessionCapabilities;
  if (!capabilities || typeof capabilities !== 'object') return false;
  const value = capabilities[name];
  return value === true || (value !== null && typeof value === 'object');
}

/**
 * Prefer `session/resume` (no replay) over `session/load` (full replay).
 * Returns null when the agent cannot restore a stored session at all.
 */
function resumeRequestFor(init, { sessionId, cwd }) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) return null;
  const params = { sessionId, cwd, mcpServers: [] };
  if (hasSessionCapability(init, 'resume')) return { method: 'session/resume', params };
  const capabilities = (init && init.agentCapabilities) || {};
  if (capabilities.loadSession === true) return { method: 'session/load', params };
  return null;
}

/**
 * Only an answered request is worth a fresh-session retry. A dead transport or
 * a local abort cannot be repaired by calling session/new on the same process.
 */
function isResumeFallback(error) {
  if (!(error instanceof AcpError) || error.code !== 'acp/agent-error') return false;
  return true;
}

/**
 * Create or restore the remote session.
 *
 * A stored id is only a hint: agents may advertise load support and still drop
 * sessions across restarts, so exactly one fallback to `session/new` follows a
 * rejected load. `cwd` must match the original session for the agent to accept
 * the resume, which the caller guarantees before passing `resumeSessionId`.
 */
async function establishSession(peer, init, { cwd, resumeSessionId, startTimeoutMs, logger, label }) {
  const request = resumeRequestFor(init, { sessionId: resumeSessionId, cwd });
  if (request !== null) {
    try {
      const response = await peer.request(request.method, request.params, { timeoutMs: startTimeoutMs });
      const created = response && typeof response === 'object' ? response : {};
      const returnedId = textOf(created.sessionId);
      if (returnedId.length > 0 && returnedId !== resumeSessionId) {
        throw new AcpError(`${request.method} returned a different session id`);
      }
      return {
        created: { ...created, sessionId: returnedId.length > 0 ? returnedId : resumeSessionId },
        sessionId: returnedId.length > 0 ? returnedId : resumeSessionId,
        resumed: true,
        method: request.method,
      };
    } catch (error) {
      if (!isResumeFallback(error)) throw error;
      if (logger && typeof logger.info === 'function') {
        logger.info(`[acp-agents] ${label}: ${request.method} failed (${toError(error).message}); starting a new session`);
      }
    }
  }
  const created = await peer.request('session/new', { cwd, mcpServers: [] }, { timeoutMs: startTimeoutMs });
  if (!created || typeof created.sessionId !== 'string' || created.sessionId.length === 0) {
    throw new AcpError('ACP agent returned no session id from session/new.');
  }
  return { created, sessionId: created.sessionId, resumed: false, method: 'session/new' };
}

/**
 * Spawn one agent and complete ACP initialization plus session creation.
 *
 * Fulfillment means the remote session exists and the caller owns both ends.
 * Every failure path reaps the child before rejecting.
 */
async function openSession({
  subprocess,
  agent,
  cwd,
  permission,
  logger,
  startTimeoutMs = START_TIMEOUT_MS,
  resumeSessionId = null,
  configOptionsHint = null,
  onUpdate,
  onExit,
  onPermission,
}) {
  const plan = await buildLaunchPlan(subprocess, agent.command, agent.args, agent.env, agent.name || agent.id);
  const stderrState = { text: '' };
  let child;
  try {
    child = subprocess.spawn({
      argv: plan.argv,
      cwd,
      stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
      graceMs: DISPOSE_GRACE_MS,
      env: agent.env === undefined ? undefined : { ...agent.env },
    });
  } catch (error) {
    throw new AcpError(`Could not start agent "${agent.name || agent.id}" (${plan.executable}).`, {
      cause: toError(error),
      code: 'acp/spawn-failed',
    });
  }
  if (!child || !child.stdin || !child.stdout) {
    throw new AcpError('The subprocess provider did not expose the ACP protocol streams.');
  }
  child.stderr?.on('data', (chunk) => tailPush(stderrState, chunk, STDERR_TAIL_BYTES));

  let sessionId = null;
  let collector = null;
  let closed = false;
  let disposed = false;
  let disposal = null;
  let quiet = false;
  let processExitError = null;
  let resumed = false;
  let resumeMethod = null;
  let replayUpdates = 0;
  // `session/load` replays the whole conversation as updates. The Harness
  // already renders that transcript, so the load window is muted explicitly
  // instead of relying on the absence of a sink.
  let suppressUpdates = typeof resumeSessionId === 'string' && resumeSessionId.length > 0;
  const childExitSummary = { value: '' };
  const finishProcess = () => {
    if (closed || quiet) return;
    closed = true;
    processExitError = new AcpError(
      withDetail(
        `ACP agent "${agent.name || agent.id}" exited before the session completed` +
          (childExitSummary.value === '' ? '.' : ` (${childExitSummary.value}).`),
        stderrState,
      ),
    );
    peer.fail(processExitError);
    if (typeof onExit === 'function') {
      try {
        onExit(processExitError);
      } catch {
        /* consumer callback is observational */
      }
    }
  };
  Promise.resolve(child.done)
    .then(
      (outcome) => {
        childExitSummary.value = outcome && outcome.signal ? `signal ${outcome.signal}` : `exit ${outcome && outcome.exitCode}`;
        finishProcess();
      },
      (error) => {
        childExitSummary.value = toError(error).message;
        finishProcess();
      },
    )
    .catch(() => {});

  const peer = new AcpPeer({
    readable: child.stdout,
    writable: child.stdin,
    onFailure: (error) => {
      if (!quiet && logger && typeof logger.warn === 'function') {
        logger.warn(`[acp-agents] ${error.message}`);
      }
    },
    onRequest: {
      handlePermission(params) {
        if (typeof onPermission === 'function') return onPermission(params);
        const options = params && params.options;
        if (permission === 'allow') {
          const option = pickPermissionOption(options);
          if (option !== null) return { outcome: { outcome: 'selected', optionId: option.optionId } };
        }
        return { outcome: { outcome: 'cancelled' } };
      },
    },
    onNotification(method, params) {
      if (method !== 'session/update') return;
      const update = params && params.update;
      if (!update || typeof update !== 'object') return;
      if (suppressUpdates) {
        replayUpdates += 1;
        return;
      }
      if (typeof onUpdate === 'function') {
        try {
          onUpdate(update);
        } catch {
          /* one consumer must not break protocol dispatch */
        }
      }
      if (update.sessionUpdate === 'agent_message_chunk' && update.content && update.content.type === 'text') {
        if (collector !== null) collector(textOf(update.content.text));
      }
    },
  });

  const dispose = (reason) => {
    if (disposal !== null) return disposal;
    disposal = (async () => {
      quiet = true;
      disposed = true;
      try {
        if (sessionId !== null) {
          peer.notify('session/cancel', { sessionId });
        }
      } catch {
        /* best effort */
      }
      peer.close(reason);
      try {
        child.stdin.end();
      } catch {
        /* ignore */
      }
      const exited = await Promise.race([
        Promise.resolve(child.waitForExit ? child.waitForExit() : child.done).then(
          () => true,
          () => true,
        ),
        new Promise((resolveWait) => setTimeout(() => resolveWait(false), DISPOSE_EOF_GRACE_MS)),
      ]);
      if (!exited) {
        try {
          child.terminate();
        } catch {
          /* ignore */
        }
        await Promise.race([
          Promise.resolve(child.waitForExit ? child.waitForExit() : child.done).then(
            () => true,
            () => true,
          ),
          new Promise((resolveWait) => setTimeout(() => resolveWait(false), EXIT_PROOF_TIMEOUT_MS)),
        ]);
      }
    })();
    return disposal;
  };

  const closeRemoteSession = async () => {
    if (sessionId === null) return;
    if (!hasSessionCapability(init, 'close')) return;
    try {
      await peer.request('session/close', { sessionId }, { timeoutMs: CLOSE_TIMEOUT_MS });
    } catch {
      /* optional capability */
    }
  };

  let init;
  try {
    init =
      (await peer.request(
        'initialize',
        {
          protocolVersion: ACP_PROTOCOL_VERSION,
          clientCapabilities: {
            fs: { readTextFile: false, writeTextFile: false },
            terminal: false,
            auth: { terminal: false },
          },
          clientInfo: CLIENT_INFO,
        },
        { timeoutMs: startTimeoutMs },
      )) ?? {};
    if (typeof init.protocolVersion === 'number' && init.protocolVersion > ACP_PROTOCOL_VERSION) {
      logger?.info?.(
        `[acp-agents] "${agent.name || agent.id}" negotiated ACP ${init.protocolVersion}; this client speaks ${ACP_PROTOCOL_VERSION}.`,
      );
    }
    const established = await establishSession(peer, init, {
      cwd,
      resumeSessionId,
      startTimeoutMs,
      logger,
      label: agent.name || agent.id,
    });
    sessionId = established.sessionId;
    resumed = established.resumed;
    resumeMethod = established.method;
    // A load response may omit configOptions; the caller's last discovery keeps
    // the model picker usable until the agent reports a fresh list.
    let created = established.created;
    if (!Array.isArray(created.configOptions) && Array.isArray(configOptionsHint) && configOptionsHint.length > 0) {
      created = { ...created, configOptions: configOptionsHint.map((option) => ({ ...option })) };
    }
    return {
      plan,
      child,
      peer,
      init,
      created,
      resumed,
      resumeMethod,
      replayUpdates,
      sessionId,
      stderr: stderrState,
      setCollector(next) {
        collector = next;
      },
      async prompt(blocks, signal) {
        suppressUpdates = false;
        const promptBlocks = [];
        const dropped = [];
        for (const block of blocks) {
          if (block && block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
            promptBlocks.push({ type: 'text', text: block.text });
          } else {
            dropped.push(block && block.type ? block.type : 'unknown');
          }
        }
        if (promptBlocks.length === 0) {
          throw new AcpError('The delegated task contains no text the ACP agent can receive.');
        }
        let cancelled = false;
        let cancelTimer = null;
        let cancelPromiseCleanup = null;
        const cancelPromise = new Promise((resolveCancel) => {
          if (signal === undefined) return;
          const onAbort = () => {
            cancelled = true;
            try {
              peer.notify('session/cancel', { sessionId });
            } catch {
              /* ignore */
            }
            cancelTimer = setTimeout(() => resolveCancel('timeout'), CANCEL_GRACE_MS);
          };
          if (signal.aborted) onAbort();
          else signal.addEventListener('abort', onAbort, { once: true });
          cancelPromiseCleanup = () => signal.removeEventListener('abort', onAbort);
        });
        const promptPromise = peer.request('session/prompt', { sessionId, prompt: promptBlocks });
        try {
          const outcome = await Promise.race([
            promptPromise.then((value) => ({ kind: 'response', value })),
            cancelPromise.then((kind) => ({ kind: 'cancelled', kindDetail: kind })),
          ]);
          if (outcome.kind === 'cancelled') {
            return { stopReason: 'cancelled', dropped, cancelled: true };
          }
          const value = outcome.value ?? {};
          // `_meta` carries the agent's own failure detail (e.g. the upstream HTTP
          // error behind a `refusal`); dropping it here hides the real cause.
          return {
            stopReason: textOf(value.stopReason) || 'end_turn',
            dropped,
            cancelled: false,
            usage: value.usage,
            meta: value._meta !== null && typeof value._meta === 'object' ? value._meta : null,
          };
        } catch (error) {
          if (cancelled || signal?.aborted) {
            return { stopReason: 'cancelled', dropped, cancelled: true };
          }
          throw new AcpError(withDetail(error.message, stderrState), {
            cause: toError(error),
            code: error.code,
          });
        } finally {
          if (cancelTimer !== null) clearTimeout(cancelTimer);
          cancelPromiseCleanup?.();
        }
      },
      async applyConfigOption(configId, value) {
        if (typeof configId !== 'string' || configId.length === 0) {
          return { applied: false, reason: 'no config id' };
        }
        await peer.request(
          'session/set_config_option',
          { sessionId, configId, value },
          { timeoutMs: CONFIG_TIMEOUT_MS },
        );
        return { applied: true };
      },
      async applyModel(model) {
        if (typeof model !== 'string' || model.length === 0) return { applied: false, reason: 'no model configured' };
        const option = modelOptionOf(created.configOptions);
        if (option === null) return { applied: false, reason: 'agent advertised no model selector' };
        const values = flattenSelectOptions(option.options).map((entry) => entry.value);
        if (!values.includes(model)) {
          return { applied: false, reason: `agent did not advertise model "${model}"`, values };
        }
        await this.applyConfigOption(option.id, model);
        return { applied: true, values };
      },
      async closeRemoteSession() {
        await closeRemoteSession();
      },
      dispose,
      isDisposed() {
        return disposed;
      },
      describeNoise() {
        return peer.describeNoise();
      },
    };
  } catch (error) {
    await dispose();
    throw error instanceof AcpError
      ? error
      : new AcpError(withDetail(toError(error).message, stderrState), { cause: toError(error) });
  }
}

/**
 * Open one persistent ACP chat session. Unlike the one-shot subagent runner,
 * the caller keeps this handle across turns and must dispose it explicitly.
 *
 * The handle exposes `prompt(blocks, signal)`, `applyModel(model)`,
 * `created.configOptions`, `closeRemoteSession()`, `dispose()`, and the
 * resume outcome (`resumed`, `resumeMethod`, `replayUpdates`).
 */
export async function openAcpChatSession(options) {
  return openSession(options);
}

/* ------------------------------------------------------------------ */
/* Probe                                                              */
/* ------------------------------------------------------------------ */
function describeProbe(session) {
  const init = session.init ?? {};
  const created = session.created ?? {};
  const capabilities = init.agentCapabilities ?? {};
  const configOptions = Array.isArray(created.configOptions) ? created.configOptions : [];
  const modelOption = modelOptionOf(configOptions);
  return {
    protocolVersion: typeof init.protocolVersion === 'number' ? init.protocolVersion : ACP_PROTOCOL_VERSION,
    agentInfo: init.agentInfo ?? null,
    authMethods: Array.isArray(init.authMethods) ? init.authMethods.map((method) => ({
      type: textOf(method && method.type) || 'agent',
      id: textOf(method && (method.id ?? method.methodId)),
      name: textOf(method && method.name),
    })) : [],
    capabilities: {
      loadSession: capabilities.loadSession === true,
      prompt: capabilities.promptCapabilities ?? {},
      mcp: capabilities.mcpCapabilities ?? {},
      session: capabilities.sessionCapabilities ?? {},
    },
    configOptions: configOptions.map((option) => ({
      id: textOf(option.id),
      name: textOf(option.name),
      type: textOf(option.type),
      category: option.category ?? null,
      currentValue: option.currentValue ?? null,
      values: option.type === 'select' ? flattenSelectOptions(option.options).map((entry) => ({
        value: textOf(entry.value),
        name: textOf(entry.name),
      })) : [],
    })),
    models: modelOption === null
      ? []
      : flattenSelectOptions(modelOption.options).map((entry) => ({ value: textOf(entry.value), name: textOf(entry.name) })),
    launch: {
      kind: session.plan.kind,
      executable: session.plan.executable,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Runner                                                             */
/* ------------------------------------------------------------------ */

/**
 * Create the ACP runner bound to one Host subprocess seam.
 *
 * `probe` verifies a launch; `start` creates a fresh process and session and
 * returns a managed run whose result is the agent's final assistant text.
 */
export function createAcpRunner({ subprocess, logger = console }) {
  const active = new Set();
  let disposed = false;

  async function probe(agent, options = {}) {
    const cwd = resolveAgentCwd(agent.cwd, options.cwd, agent.name || agent.id);
    const session = await openSession({
      subprocess,
      agent,
      cwd,
      permission: agent.permission === 'deny' ? 'deny' : 'allow',
      logger,
      startTimeoutMs: options.timeoutMs ?? 45_000,
    });
    try {
      const info = describeProbe(session);
      await session.closeRemoteSession();
      return { info, noise: session.describeNoise() };
    } finally {
      await session.dispose();
    }
  }

  async function start(agent, options = {}) {
    if (disposed) throw new AcpError('ACP runner is disposed');
    const cwd = resolveAgentCwd(agent.cwd, options.cwd, agent.name || agent.id);
    const session = await openSession({
      subprocess,
      agent,
      cwd,
      permission: agent.permission === 'deny' ? 'deny' : 'allow',
      logger,
    });
    const collected = [];
    session.setCollector((text) => collected.push(text));
    const modelResult = await session
      .applyModel(agent.model)
      .catch((error) => ({ applied: false, reason: toError(error).message }));
    const result = session
      .prompt(options.prompt ?? [], options.signal)
      .then((outcome) => {
        const text = collected.join('');
        const output = text.length > 0 ? [{ type: 'text', text }] : [];
        const stopReason = mapStopReason(outcome.stopReason);
        const diagnosticParts = [];
        if (outcome.cancelled) diagnosticParts.push('ACP prompt cancelled.');
        if (modelResult.applied !== true && typeof agent.model === 'string' && agent.model.length > 0) {
          diagnosticParts.push(`Model "${agent.model}" was not applied: ${modelResult.reason}.`);
        }
        if (output.length === 0 && stopReason !== 'aborted') {
          diagnosticParts.push('The agent completed without emitting assistant text.');
        }
        return {
          output,
          stopReason,
          ...(diagnosticParts.length === 0 ? {} : { diagnostic: diagnosticParts.join(' ') }),
        };
      })
      .catch((error) => ({
        output: collected.join('').length > 0 ? [{ type: 'text', text: collected.join('') }] : [],
        stopReason: options.signal?.aborted ? 'aborted' : 'error',
        diagnostic: toError(error).message,
      }));

    const run = {
      id: randomUUID(),
      result,
      dispose: session.dispose,
      session,
    };
    active.add(run);
    const release = () => {
      active.delete(run);
      void session.dispose();
    };
    result.then(release, release);
    return run;
  }

  return {
    probe,
    start,
    activeCount() {
      return active.size;
    },
    async dispose() {
      disposed = true;
      const runs = [...active];
      active.clear();
      await Promise.all(runs.map((run) => run.dispose().catch(() => {})));
    },
  };
}

function mapStopReason(reason) {
  switch (reason) {
    case 'end_turn':
      return 'completed';
    case 'max_tokens':
      return 'max-tokens';
    case 'refusal':
      return 'refusal';
    case 'cancelled':
      return 'aborted';
    default:
      return 'error';
  }
}
