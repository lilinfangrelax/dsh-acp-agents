/* Independent ACP workspace: one persistent ACP conversation channel per
 * opened chat, separate from the Harness Session model route and creation mode.
 *
 * The client talks to this channel through the authenticated `/acp-agents/
 * workspace` routes; transcript chunks are delivered over SSE. A chat owns one
 * ACP process and one ACP session, reused across turns until closed or idle.
 */

import { randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import { openAcpChatSession } from './acp-client.js';
import { compactConfigOptions, modeOptionOf, modelOptionOf, pickAllowOption } from './acp-options.js';

const IDLE_CLOSE_MS = 30 * 60 * 1000;
const EVENT_LIMIT = 5_000;
const MAX_CHATS = 6;

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

function toMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function withDefaultModel(models, agent) {
  const list = [{ id: 'default', name: agent && agent.model ? `Default (${agent.model})` : 'Default model' }];
  const seen = new Set(['default']);
  for (const model of Array.isArray(models) ? models : []) {
    const id = text(model.value) || text(model.id);
    if (id.length === 0 || seen.has(id)) continue;
    seen.add(id);
    list.push({ id, name: text(model.name) || id });
  }
  return list;
}

export function createAcpWorkspace({ ctx, subprocess: providedSubprocess, logger = console, readAgents, defaultCwd, onOptions }) {
  const chats = new Map();
  let disposed = false;

  const subprocess = (() => {
    if (providedSubprocess) return providedSubprocess;
    try {
      return ctx.get('subprocess');
    } catch {
      return null;
    }
  })();

  function agentOf(chat) {
    return readAgents().find((agent) => agent.id === chat.agentId) ?? null;
  }

  function meta(chat) {
    return {
      id: chat.id,
      agentId: chat.agentId,
      agentName: chat.agentName,
      cwd: chat.cwd,
      model: chat.model,
      permission: chat.permission,
      mode: chat.mode,
      models: chat.models,
      configOptions: chat.configOptions,
      busy: chat.busy,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    };
  }

  function emit(chat, event) {
    const next = { seq: chat.seq + 1, at: Date.now(), ...event };
    chat.seq = next.seq;
    chat.events.push(next);
    if (chat.events.length > EVENT_LIMIT) chat.events.splice(0, chat.events.length - EVENT_LIMIT);
    for (const listener of [...chat.listeners]) {
      try {
        listener(next);
      } catch {
        /* one subscriber must not break the chat */
      }
    }
    return next;
  }

  function touch(chat) {
    if (chat.idleTimer !== null) clearTimeout(chat.idleTimer);
    chat.idleTimer = setTimeout(() => {
      void close({ chatId: chat.id, reason: 'idle' });
    }, IDLE_CLOSE_MS);
    if (typeof chat.idleTimer.unref === 'function') chat.idleTimer.unref();
  }

  function answerPermission(chat, params) {
    if (chat.permission === 'deny') return { outcome: { outcome: 'cancelled' } };
    const option = pickAllowOption(params && params.options);
    return option === null
      ? { outcome: { outcome: 'cancelled' } }
      : { outcome: { outcome: 'selected', optionId: option.optionId } };
  }

  function handleUpdate(chat, update) {
    if (!update || typeof update !== 'object') return;
    switch (update.sessionUpdate) {
      case 'agent_message_chunk': {
        if (update.content && update.content.type === 'text') {
          const delta = text(update.content.text);
          if (delta.length > 0) emit(chat, { kind: 'assistant', delta });
        }
        break;
      }
      case 'agent_thought_chunk': {
        if (update.content && update.content.type === 'text') {
          const delta = text(update.content.text);
          if (delta.length > 0) emit(chat, { kind: 'thought', delta });
        }
        break;
      }
      case 'tool_call': {
        const event = {
          kind: 'tool',
          id: text(update.toolCallId),
          title: text(update.title) || text(update.name) || 'tool',
          status: text(update.status) || 'pending',
        };
        emit(chat, event);
        break;
      }
      case 'tool_call_update': {
        const event = { kind: 'tool', id: text(update.toolCallId) };
        const title = text(update.title) || text(update.name);
        const status = text(update.status);
        if (title.length > 0) event.title = title;
        if (status.length > 0) event.status = status;
        emit(chat, event);
        break;
      }
      case 'current_mode_update': {
        const mode = text(update.currentModeId);
        if (mode.length > 0 && mode !== chat.mode) {
          chat.mode = mode;
          emit(chat, { kind: 'state', busy: chat.busy, model: chat.model, permission: chat.permission, mode: chat.mode });
        }
        break;
      }
      default:
        break;
    }
  }

  function handleExit(chat, error) {
    emit(chat, { kind: 'done', stopReason: 'error', error: error === undefined ? 'ACP agent exited' : toMessage(error) });
    chat.busy = false;
    emit(chat, { kind: 'closed', reason: 'agent exited' });
    if (chat.idleTimer !== null) clearTimeout(chat.idleTimer);
    chats.delete(chat.id);
  }

  function closeOldest(exceptId) {
    if (chats.size <= MAX_CHATS) return;
    const oldest = [...chats.values()]
      .filter((chat) => chat.id !== exceptId)
      .sort((left, right) => left.createdAt - right.createdAt)[0];
    if (oldest !== undefined) void close({ chatId: oldest.id, reason: 'cap' });
  }

  async function open(request) {
    if (disposed) throw new Error('ACP workspace is disposed');
    if (subprocess === null || subprocess === undefined) throw new Error('The subprocess service is unavailable');
    const agentId = text(request?.agentId).trim();
    const agent = readAgents().find((entry) => entry.id === agentId);
    if (agent === undefined) throw new Error(`no enabled ACP agent named "${agentId}"`);
    const requestedCwd = text(request?.cwd).trim();
    const cwd = requestedCwd.length > 0 && isDirectory(requestedCwd)
      ? requestedCwd
      : agent.cwd && isDirectory(agent.cwd)
        ? agent.cwd
        : defaultCwd();
    if (!isDirectory(cwd)) throw new Error(`working directory is not accessible: ${cwd}`);

    let chat = null;
    const session = await openAcpChatSession({
      subprocess,
      agent,
      cwd,
      permission: 'allow',
      logger,
      onUpdate: (update) => {
        if (chat !== null) handleUpdate(chat, update);
      },
      onPermission: (params) => (chat === null ? { outcome: { outcome: 'cancelled' } } : answerPermission(chat, params)),
      onExit: (error) => {
        if (chat !== null) handleExit(chat, error);
      },
    });

    const modelOption = modelOptionOf(session.created?.configOptions);
    const modeOption = modeOptionOf(session.created?.configOptions);
    const configOptions = compactConfigOptions(session.created?.configOptions);
    const now = Date.now();
    chat = {
      id: randomUUID(),
      agentId: agent.id,
      agentName: agent.name,
      cwd,
      session,
      model: modelOption?.currentValue || 'default',
      appliedModel: modelOption?.currentValue || '',
      permission: request?.permission === 'deny' ? 'deny' : 'allow',
      mode: modeOption?.currentValue || '',
      appliedMode: modeOption?.currentValue || '',
      modeConfigId: modeOption?.configId || '',
      models: withDefaultModel(modelOption?.models, agent),
      configOptions,
      events: [],
      seq: 0,
      listeners: new Set(),
      busy: false,
      controller: null,
      idleTimer: null,
      createdAt: now,
      updatedAt: now,
    };
    chats.set(chat.id, chat);
    const warnings = [];

    const requestedModel = text(request?.model).trim();
    if (requestedModel.length > 0 && requestedModel !== 'default' && requestedModel !== chat.model) {
      try {
        const applied = await session.applyModel(requestedModel);
        if (applied.applied === true) {
          chat.model = requestedModel;
          chat.appliedModel = requestedModel;
        } else {
          warnings.push(`模型 ${requestedModel} 未应用：${applied.reason || 'unknown'}`);
        }
      } catch (error) {
        warnings.push(`模型 ${requestedModel} 未应用：${toMessage(error)}`);
      }
    }
    const requestedMode = text(request?.mode).trim();
    if (requestedMode.length > 0 && chat.modeConfigId.length > 0 && requestedMode !== chat.mode) {
      try {
        const applied = await session.applyConfigOption(chat.modeConfigId, requestedMode);
        if (applied.applied === true) chat.mode = requestedMode;
        else warnings.push(`模式 ${requestedMode} 未应用：${applied.reason || 'unknown'}`);
      } catch (error) {
        warnings.push(`模式 ${requestedMode} 未应用：${toMessage(error)}`);
      }
    }

    if (typeof onOptions === 'function') {
      try {
        onOptions(agent.id, chat.models.filter((model) => model.id !== 'default'), configOptions);
      } catch {
        /* persistence is best-effort */
      }
    }
    touch(chat);
    closeOldest(chat.id);
    return { ...meta(chat), warnings };
  }

  async function send(request) {
    const chat = chats.get(text(request?.chatId));
    if (chat === undefined) throw new Error('ACP chat does not exist');
    if (chat.busy) throw new Error('ACP agent is still answering; wait or stop it first');
    const input = text(request?.text).trim();
    if (input.length === 0) throw new Error('task is required');
    chat.busy = true;
    chat.updatedAt = Date.now();
    touch(chat);
    emit(chat, { kind: 'user', text: input });
    emit(chat, { kind: 'state', busy: true, model: chat.model, permission: chat.permission, mode: chat.mode });
    const controller = new AbortController();
    chat.controller = controller;
    void (async () => {
      const warnings = [];
      try {
        const desiredModel =
          chat.model === 'default' ? text(agentOf(chat)?.model) : chat.model;
        if (desiredModel.length > 0 && desiredModel !== 'default' && desiredModel !== chat.appliedModel) {
          try {
            const applied = await chat.session.applyModel(desiredModel);
            if (applied.applied === true) chat.appliedModel = desiredModel;
            else warnings.push(`模型 ${desiredModel} 未应用：${applied.reason || 'unknown'}`);
          } catch (error) {
            warnings.push(`模型 ${desiredModel} 未应用：${toMessage(error)}`);
          }
        }
        if (chat.modeConfigId.length > 0 && chat.mode.length > 0 && chat.mode !== chat.appliedMode) {
          try {
            const applied = await chat.session.applyConfigOption(chat.modeConfigId, chat.mode);
            if (applied.applied === true) chat.appliedMode = chat.mode;
            else warnings.push(`模式 ${chat.mode} 未应用：${applied.reason || 'unknown'}`);
          } catch (error) {
            warnings.push(`模式 ${chat.mode} 未应用：${toMessage(error)}`);
          }
        }
        const outcome = await chat.session.prompt([{ type: 'text', text: input }], controller.signal);
        emit(chat, {
          kind: 'done',
          stopReason: text(outcome.stopReason) || 'end_turn',
          cancelled: outcome.cancelled === true,
          warnings,
        });
      } catch (error) {
        emit(chat, {
          kind: 'done',
          stopReason: controller.signal.aborted ? 'cancelled' : 'error',
          error: toMessage(error),
          warnings,
        });
      } finally {
        chat.busy = false;
        chat.controller = null;
        chat.updatedAt = Date.now();
        emit(chat, { kind: 'state', busy: false, model: chat.model, permission: chat.permission, mode: chat.mode });
        touch(chat);
      }
    })();
    return { ok: true, chatId: chat.id, seq: chat.seq };
  }

  async function cancel(request) {
    const chat = chats.get(text(request?.chatId));
    if (chat === undefined) throw new Error('ACP chat does not exist');
    if (chat.controller !== null) chat.controller.abort();
    return { ok: true, chatId: chat.id };
  }

  async function setOptions(request) {
    const chat = chats.get(text(request?.chatId));
    if (chat === undefined) throw new Error('ACP chat does not exist');
    if (typeof request?.model === 'string' && request.model.length > 0) chat.model = request.model;
    if (request?.permission === 'allow' || request?.permission === 'deny') chat.permission = request.permission;
    if (typeof request?.mode === 'string') chat.mode = request.mode;
    chat.updatedAt = Date.now();
    emit(chat, { kind: 'state', busy: chat.busy, model: chat.model, permission: chat.permission, mode: chat.mode });
    return { ok: true, chat: meta(chat) };
  }

  async function close(request) {
    const chat = chats.get(text(request?.chatId));
    if (chat === undefined) return { ok: true, closed: false };
    chats.delete(chat.id);
    if (chat.idleTimer !== null) clearTimeout(chat.idleTimer);
    emit(chat, { kind: 'closed', reason: text(request?.reason) || 'closed' });
    chat.listeners.clear();
    try {
      await chat.session.closeRemoteSession();
    } catch {
      /* optional */
    }
    await chat.session.dispose().catch(() => {});
    return { ok: true, closed: true };
  }

  function state() {
    return {
      ok: true,
      cwd: defaultCwd(),
      chats: [...chats.values()].sort((left, right) => left.createdAt - right.createdAt).map(meta),
    };
  }

  function subscribe(chatId, since, listener) {
    const chat = chats.get(text(chatId));
    if (chat === undefined) return () => {};
    const cursor = Number.isFinite(since) ? since : 0;
    for (const event of chat.events) if (event.seq > cursor) listener(event);
    chat.listeners.add(listener);
    return () => chat.listeners.delete(listener);
  }

  function get(chatId) {
    return chats.get(text(chatId)) ?? null;
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    for (const id of [...chats.keys()]) await close({ chatId: id, reason: 'plugin disposed' });
  }

  return {
    open,
    send,
    cancel,
    setOptions,
    close,
    state,
    subscribe,
    get,
    dispose,
    meta,
  };
}
