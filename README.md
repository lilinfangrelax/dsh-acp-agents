# 外部 Agent（ACP）

中文 | [English](README.en.md)

把本机上已经装好的其他 Agent 接到 DeepSeek Harness：通过 [Agent Client Protocol](https://agentclientprotocol.com)（ACP）启动独立的 Agent 进程。启用后的 Agent 会以两种方式出现：

- **原生聊天窗口**：每个启用的 Agent 注册为一条 ACP 模型路由；在普通会话的模型下拉里选择它，回答直接出现在当前聊天窗口，侧边栏、标题、历史和搜索都复用；
- **子代理委派**：模型也可以通过 `acp_delegate` 把一次性任务交给外部 Agent，结果以子代理完成通知返回。

这个插件解决三件事：

1. **自行探测**：扫描 PATH（Windows 上按 `PATHEXT` 解析 `.exe` / `.cmd` / `.bat`），识别本机已安装的 ACP Agent，并给出可执行文件路径。
2. **接入官方 Registry**：拉取 [`cdn.agentclientprotocol.com/registry/v1/latest/registry.json`](https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json)，展示官方收录的 Agent；`npx` / `uvx` 分发的条目可以直接接入并按需运行（首次运行由 npx/uvx 下载）。
3. **可选可配置**：在 **设置 → 外部 Agent（ACP）** 里逐个启用、编辑命令与参数、选择模型、测试连接、设置默认 Agent。

## 安装

```sh
dsh plugin --profile web add github:lilinfangrelax/dsh-acp-agents
```

包名与仓库均为 `dsh-acp-agents`（插件 id 仍为 `acp-agents`）。

也可以先克隆，再按本地路径安装：

```sh
git clone https://github.com/lilinfangrelax/dsh-acp-agents.git
dsh plugin --profile web add file:/path/to/dsh-acp-agents
```

安装或升级后**重启 `dsh web`**，再刷新页面 —— Host 侧的采集代码只在进程启动时加载，只刷新浏览器看不到改动。重启后打开 **设置 → 外部 Agent（ACP）** 启用一个本机已安装的 Agent。

## 在原生聊天窗口里使用 ACP

启用 Cursor Agent 等 Agent 后，刷新页面：

1. 点击输入框右下角的模型座位：座位概括显示 **原生/ACP · 模型 · 思考深度（原生）或权限（ACP）**；
2. 点开是一列：**方式 → Agent → 模型 → 权限 → 更多参数（configOptions）**；点任意一行进入二级菜单，选中后回到这一列。原生方式则是 **方式 → 模型 → 思考深度**，选择和原生 picker 一样；
3. 会话头部右上角是一个**只读的 ACP 会话状态**面板：显示 Agent 名称与版本、协议版本、ACP 会话 id、工作目录、连接状态、上下文占用与累计成本、当前模式、计划进度、可用命令、最近工具和上下文压缩状态。路由与模型/权限/Mode 的选择仍只在输入框右下角的座位里，两处不再重复；
4. 你的消息通过 ACP `session/prompt` 发过去，回答以普通助手消息流式显示在当前聊天窗口；思考折叠，工具活动显示为活动行；
5. 想切回 DeepSeek，在座位里切到「原生」并选择 DeepSeek 模型；右上角的 ACP 状态面板会在路由切回后消失。

面板只展示 Agent 真正上报过的字段。ACP 里这些都是**可选通知**，不同 Agent 上报的子集差异很大；没有上报的字段会被收进面板底部的「未上报的信息（N）」折叠栏，展开后逐项标注「该 Agent 未上报」，而不是留空或显示默认值。

**新建会话会记住上次的选择**：方式（原生/ACP）、ACP 的 Agent/模型/权限/Mode 参数、原生的模型与思考深度都写在 `$DSH_HOME/acp-agents/config.json` 的 `lastSelection` 里；每次新建会话自动沿用，切到别的会话或重开旧会话不会覆盖它们各自的选择。已有会话仍优先用自己的路由。

ACP 会话的特点：

- **原生会话**：侧边栏、标题、历史、搜索都复用普通 Session；
- **失去 Harness 工具和创造模式**：外部 Agent 用自己的工具和上下文，Harness 的 bash/read/skill/creation card 不参与；
- **Permission / Mode 按会话隔离**：单个会话的调整仍保存在 Host 内存，Host 重启或重开旧会话后回落到 Agent 卡片默认值；新建会话则沿用 `lastSelection`；
- **每条 ACP 会话一个进程**：进程按「空闲连接数」回收（默认保留 5 条，`maxIdleConnections` 可改），最近最少使用的先释放；被释放的会话在下次发言时优先用 `session/resume` / `session/load` 续接 agent 侧上下文，Agent 不支持时才退回「最近几条可见对话拼前情提要」；
- **上下文独立**：ACP 不写入 Harness 的工具记录，也不能逐 token 重放 ACP 原生上下文；续接成功后不再发送前情提要。

这是 Phase 1 的形态：ACP 不再单独开工作台，所有对话都在原生聊天窗口；如果以后需要 ACP 调用 Harness 工具，需要单独的 MCP 工具桥。

## 设置页

刷新页面，打开 **设置 → 外部 Agent（ACP）**：

- **本机探测到**：列出 PATH 中可执行的内置 Agent，点「接入」即可。
- **官方 ACP Registry**：按名称搜索；已安装的条目显示「接入」，`npx`/`uvx` 条目显示「接入（npx 运行）」，纯二进制且未安装的条目会要求先安装。
- **已接入的 Agent**：每个卡片可以
  - 开关启用（停用会立即注销对应的子代理 Provider 和模型路由；当前会话需要切回 DeepSeek）；
  - 「测试连接」：真实执行 `initialize` + `session/new`，记录 Agent 名称、版本、协议版本、模型列表和错误信息；
  - 选择模型（测试成功后从 Agent 公布的模型里选）；
  - 编辑命令、参数、环境变量、工作目录、工具权限；
  - 设为默认、移除。
- **手动添加**：接入 Registry 之外、或需要自定义启动参数的 Agent。

## 子代理委派

插件向模型暴露两个工具：

| 工具 | 作用 |
|---|---|
| `acp_agents` | 列出已配置的外部 Agent、是否启用、命令是否找到、上次测试结果。 |
| `acp_delegate` | 把任务委派给指定 Agent（省略 `agent` 用默认 Agent）。调用立即返回子代理 id，最终回答稍后以完成通知到达。 |

`acp_delegate` 的 `task` 必须自包含：外部 Agent 看不到当前对话，只会收到这段文字和自己的工作目录。它返回后**不要轮询、不要重复发起**；完成通知会带着最终文本回来。

## 已内置的启动参数

| Agent | 命令 | 参数 |
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

Registry 中其余条目通过 `npx -y <package> ...` 或 `uvx <package> ...` 运行；二进制分发的条目需要自行安装到 PATH 后再接入。

## Windows 启动方式

Node 不能直接 `spawn` 一个 `.cmd`。插件按以下顺序解析实际启动命令：

1. `.exe` / 原生可执行文件：直接启动。
2. npm/pnpm 生成的 `.cmd` shim：解析 shim 中的 Node 入口脚本，用 Harness 自己的 Node 启动该脚本。
3. 同目录存在 `.ps1`（如 `cursor-agent`）：用 Windows PowerShell `-File` 启动。
4. 其他 `.cmd`：回退到 PowerShell 单引号转义执行（参数中不能含换行）。

POSIX 上直接 `spawn` 解析出的可执行文件。

## 数据与安全

- 配置：`$DSH_HOME/acp-agents/config.json`；Registry 缓存：`$DSH_HOME/acp-agents/registry.json`；可续接的会话映射：`$DSH_HOME/acp-agents/sessions.json`。
- 环境变量以**明文**保存在配置文件里；只填你愿意落盘的凭据。`sessions.json` 只记录 ACP 会话 id、Agent id、启动指纹、cwd 与时间，不包含环境变量。
- 外部 Agent 以启动 Harness 的系统用户身份运行，使用它自己的模型、工具和登录态。
- 设置里的「自动允许」是 Agent 卡片的默认值；输入框座位里的「权限」一级可以按会话单独选择自动允许/自动拒绝。允许时选择第一个 `allow_once`/`allow_always`，拒绝时回答 `cancelled`。**默认开启**；只接入你信任的 Agent。
- Client 只声明文本提示能力：不向 Agent 提供文件系统、终端、认证能力，因此 Agent 不会通过 ACP 反向调用 Harness 的文件 API。提示中的图片等非文本块会被丢弃。
- 每条 ACP 会话保持一个独立 ACP 进程；空闲会话最多保留 `maxIdleConnections` 条（默认 5，写入 `config.json`，0 表示每轮结束即释放进程），按最近使用时间淘汰，运行中的会话永不被回收。释放空闲进程时**不会**发送 `session/close`，以便下次 `session/load`；只有 Harness 会话被删除、Agent 配置变更或 Agent 被移除时才真正关闭会话。子代理委派仍然是每个任务一个独立进程。两者都不支持 MCP 挂载或多工作区。
- 原生聊天窗口的 ACP 路由在 `/acp-agents/session` 下，使用 Web 会话 Cookie 鉴权；独立的 `/acp-agents/workspace` API 是早期实验通道，当前 UI 不再使用。

## 限制

- **Harness 工具不参与**：ACP 会话里的工具由外部 Agent 自己执行；Harness 的 bash/read/skill/创造模式不会转发，也不会重复执行。如果以后要让 ACP 调用 Harness 工具，需要单独的 MCP 工具桥。
- 文本流式显示；思考折叠；ACP 工具活动显示为活动行。原生工具卡片（diff、命令输出）是下一阶段。
- 图片/文件提示暂不转发；只支持文本。
- ACP 对话的上下文独立于 Harness Session 日志；Agent 声明 `session/resume` 或 `session/load` 时会续接 agent 侧会话（load 的历史回放不会重复渲染），不支持时才用最近几条可见对话拼前情提要。
- 续接依赖 Agent 自己保留会话：部分 CLI 退出进程后不保留，此时会回退为新会话，并清掉这条失效映射。
- 不处理 ACP 认证流程：Agent 需先在终端完成登录（测试连接会显示 `Authentication required`）。
- `npx` 首次运行需要下载，可能超过连接测试的 45 秒超时；下载完成后再测即可。
- Registry 只缓存元数据；二进制分发包不代下载。
- 个别 CLI 的 ACP 模式启动较慢或会静默等待登录，测试可能超时；错误会显示在卡片上。

## 文件

- `index.js` — Host 入口：`/acp-agents` 路由（设置、探测、Registry、会话 ACP 路由）、Provider 与工具的生命周期。
- `manager.js` — 配置、Registry、探测、子代理 Provider/工具/ACP 模型路由注册、连接测试、会话 ACP 选项与状态汇总。
- `acp-client.js` — 无第三方依赖的 ACP 客户端：NDJSON JSON-RPC、`initialize`、`session/new`、`session/resume` / `session/load`、`session/prompt`、`session/request_permission`、`session/cancel`、进程清理、Windows 启动计划；同时提供一次性运行和持久会话两种句柄。
- `acp-options.js` — 从 ACP `configOptions` 提取模型/模式列表与权限选项。
- `chat-provider.js` — ACP 作为 LLM 模型路由：模型目录、按 Session 复用进程、空闲连接的 LRU 回收、续接后的历史去重、流式映射、模型切换、冷启动前情提要、辅助请求本地处理。
- `workspace.js` — 早期独立 ACP 通道的实验实现，当前 UI 不再使用，保留作参考。
- `catalog.js` — 内置 Agent 表、Registry 拉取与归一化、候选构造与 PATH 探测。
- `store.js` — `config.json` / `registry.json` / `sessions.json` 的原子读写与校验。
- `client.js` — 设置页（`settings.section`）、会话头部的只读 ACP 会话状态面板（`conversation.session.header.utilities`），以及输入框右下角的原生/ACP 分层模型座位（`conversation.input.model`）。
- `locale/*.json`、`icon.svg`、`cordis.patch.yml`、`package.json`。

## 验证

- `node test/run-tests.mjs`：进程内 mock ACP Agent，覆盖握手、流式文本、模型切换、权限允许/拒绝、取消、空输出诊断、命令缺失，以及 `session/load` 续接、`session/resume` 优先、未知会话回退、load 回放抑制、`session/close` 能力门控。
- `node test/chat-provider-test.mjs`：mock Agent 通过真实 LLM 适配器路径，覆盖 provider 发布、默认模型、文本流式、模型发现、跨轮复用、`set_config_option`、辅助请求本地处理、路由撤销，以及空闲连接 LRU、淘汰后续接且不重发历史、跨 Provider 实例续接、淘汰不发 `session/close`、删除会话只关闭一次。
- `node test/manager-test.mjs`：临时 `DSH_HOME` 下的配置持久化、子代理 Provider/工具/LLM 路由注册与注销、重载、Registry 拉取、`listAgents` / `dispatch`，以及会话级 `applySession`（路由 + 权限 + mode）与 `sessionState`；另覆盖 `lastSelection` 的写入/合并/重载、`restoreSession`、`maxIdleConnections` 默认/钳制，以及 `sessions.json` 的往返、500 条上限与「不落 env」。
- `node test/client-render-check.mjs`：用 React 服务端渲染设置页与会话头部，校验 locale 字典（中英各 188 键）与 `settings.section` / `conversation.session.header.utilities` / `conversation.input.model` 注册；模型座位的静态预览可用同一组件在 headless Chrome 中截图确认。
- 真实 Cursor Agent 已通过主窗口模型路由实测：`acp-cursor-agent` 出现在 `ctx.llm` provider 列表，默认模型与 `grok-4.7` 都能流式返回 `pong`，`resolveCallConfig` 校验通过，模型目录来自 Cursor 的 `configOptions`。
- 会话头部 ACP 设置与输入框模型座位的浏览器内视觉效果尚未在真实页面上截图验证：本机 `agent-browser-cli` 的 Chrome 扩展未连接，无法驱动真实页面。模型座位已用真实组件 + mock 数据在 headless Chrome 中渲染检查；刷新 Web 页面后，输入框右下角应显示 `原生/ACP · 模型 · 思考深度/权限` 座位，点开是一列 + 二级菜单。

安装/启用后 Host 立即生效；刷新一次 Web 页面即可在模型下拉里看到已启用的外部 Agent。
