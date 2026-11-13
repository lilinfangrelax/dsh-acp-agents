# External Agents (ACP)

[中文](README.md) | English

Connect agents already installed on this machine to DeepSeek Harness by launching them as separate processes over the [Agent Client Protocol](https://agentclientprotocol.com) (ACP). Once enabled, an agent shows up in two places:

- **Native chat window**: every enabled agent is registered as an ACP model route. Pick it in the model picker of an ordinary session and its answers stream straight into the current chat window; the sidebar, titles, history and search keep working as usual.
- **Subagent delegation**: the model can also hand a one-off task to an external agent with `acp_delegate`, and the result arrives as a subagent completion notice.

The plugin does three things:

1. **Detection**: scans `PATH` (on Windows, resolving `.exe` / `.cmd` / `.bat` through `PATHEXT`) for ACP agents installed on this machine and reports their executable paths.
2. **Official registry**: fetches [`cdn.agentclientprotocol.com/registry/v1/latest/registry.json`](https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json), lists the agents the registry covers, and lets `npx` / `uvx` entries be added and run on demand (downloaded by npx/uvx on first run).
3. **Opt-in and configurable**: enable agents one by one in **Settings → External Agents (ACP)**, edit their command and arguments, choose a model, test the connection and pick a default agent.

## Install

```sh
dsh plugin --profile web add github:lilinfangrelax/dsh-acp-agents
```

The package and repository are both `dsh-acp-agents` (plugin id stays `acp-agents`).

Or clone first and install from a local path:

```sh
git clone https://github.com/lilinfangrelax/dsh-acp-agents.git
dsh plugin --profile web add file:/path/to/dsh-acp-agents
```

After installing or upgrading, **restart `dsh web`** and then reload the page: the host-side collection code only loads when the process starts, so a browser refresh alone will not pick up host changes. Once restarted, open **Settings → External agents (ACP)** and enable an agent that is already installed on the machine.

## Using ACP in the native chat window

After enabling an agent such as Cursor Agent, reload the page:

1. Click the model seat at the bottom right of the composer. The seat summarises **Native/ACP · model · thinking depth (native) or permission (ACP)**.
2. Opening it shows one column: **mode → agent → model → permission → more options (configOptions)**. Clicking any row opens a submenu; a choice returns you to the column. For native mode the column is **mode → model → thinking depth**, just like the native picker.
3. The top right of the session header is a **read-only ACP session status** panel: agent name and version, protocol version, ACP session id, working directory, connection state, context usage and cumulative cost, current mode, plan progress, available commands, recent tools and compaction status. Route/model/permission/mode picking stays in the composer seat, so the two no longer overlap.
4. Your message goes out as an ACP `session/prompt` and the answer streams into the current chat window as ordinary assistant messages; thinking is collapsed and tool activity shows up as activity rows.
5. To switch back to DeepSeek, choose **Native** in the seat and pick a DeepSeek model; the ACP status panel disappears once the route switches back.

The panel only shows fields the agent actually reported. All of these are **optional ACP notifications** and agents differ widely in what they emit, so unreported fields are collected into a collapsed **Not reported (N)** section at the bottom of the panel; expanding it lists each field with "This agent does not report it" instead of leaving a blank or inventing a default.

**New sessions remember your last choice**: the mode (native/ACP), the ACP agent/model/permission/mode parameters, and the native model and thinking depth are all stored as `lastSelection` in `$DSH_HOME/acp-agents/config.json`. Every new session reuses them; switching to another session or reopening an old one does not overwrite that session's own choice. Existing sessions still prefer their own route.

Characteristics of an ACP session:

- **Native session**: sidebar, titles, history and search all reuse the ordinary session.
- **No Harness tools, no creation mode**: the external agent uses its own tools and context; Harness bash/read/skill/creation cards take no part.
- **Permission / mode are per session**: a single session's adjustments live in Host memory; after a Host restart or when an old session is reopened they fall back to the agent card defaults, while new sessions reuse `lastSelection`.
- **One process per ACP session**: processes are reclaimed by idle-connection count (5 kept by default, configurable via `maxIdleConnections`), least recently used first. A reclaimed session resumes the agent-side context with `session/resume` / `session/load` on the next message, and only falls back to a recap of the most recent visible turns when the agent does not support either.
- **Independent context**: ACP does not write Harness tool records, and ACP's native context cannot be replayed token by token; once resumption succeeds no recap is sent.

This is the Phase 1 shape: ACP no longer opens a separate workbench and all conversation happens in the native chat window. Letting ACP call Harness tools would need a separate MCP tool bridge.

## Settings page

Reload the page and open **Settings → External Agents (ACP)**:

- **Detected on this machine**: built-in agents that resolve on `PATH`; click **Add** to connect one.
- **Official ACP registry**: search by name. Installed entries show **Add**, `npx`/`uvx` entries show **Add (runs via npx)**, and pure-binary entries that are not installed ask you to install them first.
- **Connected agents**: every card can
  - toggle enabled (disabling immediately unregisters the subagent provider and model route; the current session has to switch back to DeepSeek);
  - **test the connection**: really runs `initialize` + `session/new` and records the agent name, version, protocol version, model list and any error;
  - choose a model (from the models the agent advertises after a successful test);
  - edit command, arguments, environment variables, working directory and tool permission;
  - set as default, or remove.
- **Add manually**: for agents outside the registry, or ones needing custom launch arguments.

## Subagent delegation

The plugin exposes two tools to the model:

| Tool | Purpose |
|---|---|
| `acp_agents` | Lists configured external agents, whether each is enabled, whether its command resolves, and the last test result. |
| `acp_delegate` | Hands a task to the given agent (omitting `agent` uses the default one). Returns a subagent id immediately; the final answer arrives later as a completion notice. |

`acp_delegate`'s `task` must be self-contained: the external agent cannot see the current conversation and only receives that text plus its own working directory. After it returns, **do not poll and do not re-issue**; the completion notice carries the final text.

## Built-in launch arguments

| Agent | Command | Arguments |
|---|---|---|
| OpenCode | `opencode` | `acp` |
| Gemini CLI | `gemini` | `--acp` |
| Codex | `codex-acp` | — |
| Claude Agent | `claude-agent-acp` | — |
| Cursor Agent | `cursor-agent` | `acp` |
| Qwen Code | `qwen` | `--acp --experimental-skills` |
| GitHub Copilot | `copilot` | `--acp` |
| Cline | `cline` | `--acp` |
| Auggie CLI | `auggie` | `--acp` |
| Kimi | `kimi` | `acp` |
| Goose | `goose` | `acp` |
| Factory Droid | `droid` | `exec --output-format acp-daemon` |
| Amp | `amp-acp` | — |
| Kiro CLI | `kiro-cli` | `acp --agent-engine=v3` |
| Devin | `devin` | `acp` |
| Junie | `junie` | `--acp=true` |
| Mistral Vibe | `vibe-acp` | — |
| DeepSeek Harness | `dsh` | `--profile acp` |

Remaining registry entries run through `npx -y <package> ...` or `uvx <package> ...`; entries distributed as plain binaries must be installed onto `PATH` before they can be added.

## Launching on Windows

Node cannot `spawn` a `.cmd` directly. The plugin resolves the real launch command in this order:

1. `.exe` / native executable: launched directly.
2. A `.cmd` shim generated by npm/pnpm: resolve the Node entry script inside the shim and launch that script with Harness's own Node.
3. A sibling `.ps1` (as with `cursor-agent`): launch through Windows PowerShell with `-File`.
4. Any other `.cmd`: fall back to PowerShell with single-quote escaping (arguments must not contain newlines).

On POSIX, the resolved executable is spawned directly.

## Data and safety

- Config: `$DSH_HOME/acp-agents/config.json`; registry cache: `$DSH_HOME/acp-agents/registry.json`; resumable session mappings: `$DSH_HOME/acp-agents/sessions.json`.
- Environment variables are stored **in plain text** in the config file; only put credentials there that you are willing to have on disk. `sessions.json` only records ACP session ids, agent ids, launch fingerprints, cwd and timestamps — never environment variables.
- External agents run as the same system user that started Harness, with their own models, tools and login state.
- The "auto allow" setting is the default for an agent card; the **Permission** step of the composer seat lets you choose auto allow/deny per session. Allowing picks the first `allow_once`/`allow_always`, denying answers `cancelled`. **On by default**; only connect agents you trust.
- The client only declares text-prompt capability: it offers the agent no filesystem, terminal or authentication capabilities, so an agent cannot call back into Harness's file API over ACP. Non-text blocks such as images in a prompt are dropped.
- Every ACP session keeps its own ACP process; at most `maxIdleConnections` idle sessions are kept (default 5, written to `config.json`; 0 releases the process after each turn), evicted least recently used first, and a running session is never reclaimed. Releasing an idle process does **not** send `session/close`, so the next `session/load` can resume it; a session is only truly closed when the Harness session is deleted, the agent configuration changes, or the agent is removed. Subagent delegation still uses one process per task. Neither supports MCP mounts or multiple workspaces.
- The native chat window's ACP route lives under `/acp-agents/session` and authenticates with the web session cookie; the standalone `/acp-agents/workspace` API is an early experimental channel that the current UI no longer uses.

## Limitations

- **Harness tools do not take part**: tools inside an ACP session are executed by the external agent itself; Harness bash/read/skill/creation mode are neither forwarded nor re-executed. Letting ACP call Harness tools would need a separate MCP tool bridge.
- Text streams; thinking is collapsed; ACP tool activity shows as activity rows. Native tool cards (diffs, command output) are the next stage.
- Image/file prompts are not forwarded yet; text only.
- An ACP conversation's context is independent of the Harness session log. When the agent advertises `session/resume` or `session/load` the agent-side session is resumed (history replayed by `load` is not rendered twice); otherwise a recap is built from the most recent visible turns.
- Resumption depends on the agent keeping its own sessions: some CLIs drop them on exit, in which case the plugin falls back to a new session and clears the stale mapping.
- ACP authentication flows are not handled: log in to the agent in a terminal first (the connection test reports `Authentication required`).
- The first `npx` run has to download and may exceed the connection test's 45-second timeout; test again once the download finishes.
- The registry cache holds metadata only; binary distributions are not downloaded for you.
- Some CLIs start slowly in ACP mode or wait silently for a login, so a test may time out; the error is shown on the card.

## Files

- `index.js` — Host entry: the `/acp-agents` routes (settings, detection, registry, session ACP routing) and the lifecycle of providers and tools.
- `manager.js` — Config, registry, detection, subagent provider/tool/ACP model-route registration, connection tests, per-session ACP options and state aggregation.
- `acp-client.js` — Dependency-free ACP client: NDJSON JSON-RPC, `initialize`, `session/new`, `session/resume` / `session/load`, `session/prompt`, `session/request_permission`, `session/cancel`, process cleanup, Windows launch planning; exposes both a one-shot runner and a persistent session handle.
- `acp-options.js` — Extracts model/mode lists and permission options from ACP `configOptions`.
- `chat-provider.js` — ACP as an LLM model route: model catalogue, per-session process reuse, LRU reclaim of idle connections, history deduplication after resumption, streaming mapping, model switching, cold-start recap, local handling of auxiliary requests.
- `workspace.js` — Early experimental implementation of the standalone ACP channel; the current UI no longer uses it and it is kept for reference.
- `catalog.js` — Built-in agent table, registry fetch and normalisation, candidate construction and `PATH` detection.
- `store.js` — Atomic read/write and validation for `config.json` / `registry.json` / `sessions.json`.
- `client.js` — Settings page (`settings.section`), the read-only ACP session status panel in the session header (`conversation.session.header.utilities`), and the native/ACP layered model seat at the bottom right of the composer (`conversation.input.model`).
- `locale/*.json`, `icon.svg`, `cordis.patch.yml`, `package.json`.

## Verification

- `node test/run-tests.mjs`: in-process mock ACP agent covering handshake, streaming text, model switching, permission allow/deny, cancellation, empty-output diagnostics, missing commands, plus `session/load` resumption, `session/resume` preference, unknown-session fallback, load-replay suppression and `session/close` capability gating.
- `node test/chat-provider-test.mjs`: a mock agent driven through the real LLM adapter path, covering provider publication, default model, text streaming, model discovery, cross-turn reuse, `set_config_option`, local handling of auxiliary requests, route teardown, and idle-connection LRU — resume-without-replaying-history after eviction, resumption across provider instances, no `session/close` on eviction, and closing a session exactly once.
- `node test/manager-test.mjs`: config persistence under a temporary `DSH_HOME`, subagent provider/tool/LLM route registration and unregistration, reload, registry fetch, `listAgents` / `dispatch`, and per-session `applySession` (route + permission + mode) with `sessionState`; also covers `lastSelection` write/merge/reload, `restoreSession`, `maxIdleConnections` defaults and clamping, and `sessions.json` round-trip, the 500-record cap and "never persists env".
- `node test/client-render-check.mjs`: React server-side rendering of the settings page and session header, validating the locale dictionaries (188 keys each in Chinese and English) and the `settings.section` / `conversation.session.header.utilities` / `conversation.input.model` registrations; the static preview of the model seat can be screenshotted with the same component in headless Chrome.
- A real Cursor Agent has been exercised through the main-window model route: `acp-cursor-agent` shows up in the `ctx.llm` provider list, both the default model and `grok-4.7` stream back `pong`, `resolveCallConfig` validation passes, and the model catalogue comes from Cursor's `configOptions`.
- The in-browser visuals of the session-header ACP settings and the composer model seat have not been screenshot-verified on a real page yet: the local `agent-browser-cli` Chrome extension was not connected, so the real page could not be driven. The model seat has been render-checked with the real component and mock data in headless Chrome; after reloading the web page the bottom-right seat of the composer should read `Native/ACP · model · thinking depth/permission`, and opening it shows one column plus submenus.

The Host takes effect as soon as the plugin is installed/enabled; reload the web page once and the enabled external agents appear in the model picker.
