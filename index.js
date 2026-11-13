/* ACP Agents — Host half.
 *
 * Mounts:
 *   - one subagent provider per enabled external agent over ACP stdio
 *   - the `acp_agents` / `acp_delegate` model-facing tools
 *   - authenticated JSON routes under /acp-agents for the settings page
 *
 * Routes (same-origin browser session required):
 *   GET  /acp-agents/state
 *   POST /acp-agents/agents/save      { agent }
 *   POST /acp-agents/agents/remove    { id }
 *   POST /acp-agents/agents/test      { id }
 *   POST /acp-agents/agents/test-all
 *   POST /acp-agents/agents/default   { id }
 *   POST /acp-agents/detect
 *   POST /acp-agents/registry/refresh
 *   GET  /acp-agents/workspace/state
 *   GET  /acp-agents/workspace/events   (SSE)
 *   POST /acp-agents/workspace/open
 *   POST /acp-agents/workspace/send
 *   POST /acp-agents/workspace/cancel
 *   POST /acp-agents/workspace/options
 *   POST /acp-agents/workspace/close
 *   POST /acp-agents/selection           (remember the composer's last choice)
 *   POST /acp-agents/session/restore     (apply it to a fresh session)
 */

import { createAcpManager } from './manager.js';

const PREFIX = '/acp-agents';
const BODY_LIMIT = 1024 * 1024;

function respond(request, response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(request.method === 'HEAD' ? undefined : payload);
}

function respondText(response, status, message) {
  response.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(message);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    request.on('data', (chunk) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > BODY_LIMIT) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (tooLarge) {
        const error = new Error('request body is too large');
        error.code = 'acp-agents/body-too-large';
        reject(error);
        return;
      }
      const text = Buffer.concat(chunks).toString('utf8');
      if (text.trim().length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch (error) {
        error.code = 'acp-agents/bad-json';
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function connectionOf(ctx) {
  try {
    const connection = ctx.get('connection');
    if (connection) return connection;
  } catch {
    /* no browser connection */
  }
  try {
    return ctx.connection || null;
  } catch {
    return null;
  }
}

/** Return the live browser peer, or answer the rejection and return null. */
function admit(ctx, request, response) {
  const connection = connectionOf(ctx);
  if (!connection || typeof connection.admit !== 'function') {
    respond(request, response, 503, { ok: false, error: 'acp-agents/host-unavailable' });
    return null;
  }
  let admission;
  try {
    admission = connection.admit(request);
  } catch {
    respond(request, response, 401, { ok: false, error: 'acp-agents/unauthorized' });
    return null;
  }
  if (!admission || !admission.peer) {
    const status = admission && typeof admission.rejection === 'number' ? admission.rejection : 401;
    if (status === 401 || status === 403) {
      respond(request, response, status, { ok: false, error: 'acp-agents/unauthorized' });
    } else {
      respondText(response, status, 'forbidden');
    }
    return null;
  }
  return admission.peer;
}

function errorStatus(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /required|must be|does not exist|already exists|Invalid|invalid|empty|whitespace|absolute|no enabled|not live/i.test(message)
  ) {
    return 400;
  }
  return 500;
}

function errorPayload(error) {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

function ownerOnly(peer, request, response) {
  const principalKind = peer && peer.principal && typeof peer.principal === 'object' ? peer.principal.kind : undefined;
  if (principalKind === undefined || principalKind === 'owner') return true;
  respond(request, response, 403, { ok: false, error: 'acp-agents/owner-only' });
  return false;
}

function streamWorkspaceEvents(ctx, request, response, manager, url) {
  const peer = admit(ctx, request, response);
  if (!peer) return;
  if (!ownerOnly(peer, request, response)) return;
  const chatId = url.searchParams.get('chatId') || '';
  if (manager.workspace.get(chatId) === null) {
    respond(request, response, 404, { ok: false, error: 'acp-agents/chat-not-found' });
    return;
  }
  const requestedSince = Number(url.searchParams.get('since') || request.headers['last-event-id'] || 0);
  const since = Number.isFinite(requestedSince) ? requestedSince : 0;
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  response.write(': connected\n\n');
  let finished = false;
  const unsubscribe = manager.workspace.subscribe(chatId, since, (event) => {
    if (finished || response.writableEnded) return;
    try {
      response.write(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
      if (event.kind === 'closed') {
        finished = true;
        response.end();
      }
    } catch {
      finished = true;
    }
  });
  const heartbeat = setInterval(() => {
    if (finished || response.writableEnded) return;
    try {
      response.write(': ping\n\n');
    } catch {
      /* the client went away */
    }
  }, 15_000);
  if (typeof heartbeat.unref === 'function') heartbeat.unref();
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    clearInterval(heartbeat);
    unsubscribe();
  };
  request.on('close', cleanup);
  response.on('close', cleanup);
}

export const inject = ['webServer', 'tools', 'subagents', 'subprocess'];

export function apply(ctx) {
  const manager = createAcpManager(ctx);

  void manager.start().catch((error) => {
    ctx.logger?.warn?.(`[acp-agents] initialization failed: ${error instanceof Error ? error.message : String(error)}`);
  });

  const disposeRoute = ctx.webServer.register({
    kind: 'prefix',
    path: PREFIX,
    async handler(request, response) {
      const url = new URL(request.url || '/', 'http://dsh.invalid');
      const path = url.pathname;
      const method = request.method || 'GET';

      if (method === 'GET' || method === 'HEAD') {
        if (path === `${PREFIX}/agents`) {
          const peer = admit(ctx, request, response);
          if (!peer) return;
          try {
            respond(request, response, 200, await manager.listAgents());
          } catch (error) {
            respond(request, response, 500, errorPayload(error));
          }
          return;
        }
        if (path === `${PREFIX}/workspace/state`) {
          const peer = admit(ctx, request, response);
          if (!peer) return;
          if (!ownerOnly(peer, request, response)) return;
          try {
            respond(request, response, 200, manager.workspace.state());
          } catch (error) {
            respond(request, response, 500, errorPayload(error));
          }
          return;
        }
        if (path === `${PREFIX}/workspace/events`) {
          streamWorkspaceEvents(ctx, request, response, manager, url);
          return;
        }
        if (path === `${PREFIX}/session`) {
          const peer = admit(ctx, request, response);
          if (!peer) return;
          try {
            const sessionId = url.searchParams.get('sessionId') || '';
            respond(request, response, 200, manager.sessionState(sessionId));
          } catch (error) {
            respond(request, response, 500, errorPayload(error));
          }
          return;
        }
        if (path === `${PREFIX}/state`) {
          const peer = admit(ctx, request, response);
          if (!peer) return;
          try {
            respond(request, response, 200, await manager.state());
          } catch (error) {
            respond(request, response, 500, errorPayload(error));
          }
          return;
        }
        respond(request, response, 404, { ok: false, error: 'acp-agents/not-found' });
        return;
      }

      if (method !== 'POST') {
        response.writeHead(405, { allow: 'GET, HEAD, POST', 'content-type': 'text/plain; charset=utf-8' });
        response.end('method not allowed');
        return;
      }

      const peer = admit(ctx, request, response);
      if (!peer) return;

      let body;
      try {
        body = await readJsonBody(request);
      } catch (error) {
        respond(request, response, error.code === 'acp-agents/body-too-large' ? 413 : 400, errorPayload(error));
        return;
      }

      try {
        if (path === `${PREFIX}/agents/save`) {
          respond(request, response, 200, await manager.saveAgent(body.agent ?? body));
          return;
        }
        if (path === `${PREFIX}/agents/remove`) {
          respond(request, response, 200, await manager.removeAgent(body.id));
          return;
        }
        if (path === `${PREFIX}/agents/default`) {
          respond(request, response, 200, await manager.setDefaultAgent(body.id));
          return;
        }
        if (path === `${PREFIX}/agents/test`) {
          const result = await manager.testAgent(body.id);
          respond(request, response, 200, { ok: true, result, state: await manager.state() });
          return;
        }
        if (path === `${PREFIX}/agents/test-all`) {
          const results = await manager.testAll();
          respond(request, response, 200, { ok: true, results, state: await manager.state() });
          return;
        }
        if (path === `${PREFIX}/session/apply`) {
          if (!ownerOnly(peer, request, response)) return;
          respond(request, response, 200, await manager.applySession(body));
          return;
        }
        if (path === `${PREFIX}/session/restore`) {
          if (!ownerOnly(peer, request, response)) return;
          respond(request, response, 200, await manager.restoreSession(body));
          return;
        }
        if (path === `${PREFIX}/selection`) {
          if (!ownerOnly(peer, request, response)) return;
          respond(request, response, 200, await manager.saveSelection(body.selection ?? body));
          return;
        }
        if (path === `${PREFIX}/workspace/open`) {
          if (!ownerOnly(peer, request, response)) return;
          respond(request, response, 200, await manager.workspace.open(body));
          return;
        }
        if (path === `${PREFIX}/workspace/send`) {
          if (!ownerOnly(peer, request, response)) return;
          respond(request, response, 200, await manager.workspace.send(body));
          return;
        }
        if (path === `${PREFIX}/workspace/cancel`) {
          if (!ownerOnly(peer, request, response)) return;
          respond(request, response, 200, await manager.workspace.cancel(body));
          return;
        }
        if (path === `${PREFIX}/workspace/options`) {
          if (!ownerOnly(peer, request, response)) return;
          respond(request, response, 200, await manager.workspace.setOptions(body));
          return;
        }
        if (path === `${PREFIX}/workspace/close`) {
          if (!ownerOnly(peer, request, response)) return;
          respond(request, response, 200, await manager.workspace.close(body));
          return;
        }
        if (path === `${PREFIX}/dispatch`) {
          const principalKind = peer.principal && typeof peer.principal === 'object' ? peer.principal.kind : undefined;
          if (principalKind !== undefined && principalKind !== 'owner') {
            respond(request, response, 403, { ok: false, error: 'acp-agents/owner-only' });
            return;
          }
          const result = await manager.dispatch({
            agentId: body.agentId ?? body.agent,
            task: body.task,
            sessionId: body.sessionId,
          });
          respond(request, response, 200, { ok: true, ...result });
          return;
        }
        if (path === `${PREFIX}/detect`) {
          respond(request, response, 200, await manager.detectNow());
          return;
        }
        if (path === `${PREFIX}/registry/refresh`) {
          respond(request, response, 200, await manager.refreshRegistry());
          return;
        }
        respond(request, response, 404, { ok: false, error: 'acp-agents/not-found' });
      } catch (error) {
        respond(request, response, errorStatus(error), errorPayload(error));
      }
    },
  });

  ctx.effect(
    () => () => {
      try {
        disposeRoute();
      } catch {
        /* ignore */
      }
      void manager.dispose();
    },
    'acp-agents: routes and runtime',
  );
}
