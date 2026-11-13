# 外部 Agent 作为主窗口会话：设计讨论

> 状态：**讨论稿，未按此实现**。当前线上仍是「子代理 + 输入框选择器」的版本。

## 1. 为什么现在的实现不够好

上一版把 ACP Agent 当作 **subagent**：

- 每个任务是一次性的，最终回答以「子代理完成通知」回到对话；
- 不能在主窗口里连续多轮聊天；
- 模型选择在设置页的 Agent 卡片里，而不是对话的模型下拉；
- 工具活动、思考、权限都不在主对话流里。

它适合「把一件活儿外包出去」，不适合「把它当成当前对话的 Agent」。目标应该是：**像选 DeepSeek 模型一样选 Cursor，然后整个主窗口就是和 Cursor 的会话。**

## 2. 三种可选架构

| | A. ACP 作为模型路由（推荐） | B. 主窗口内的独立 ACP 视图 | C. 继续用 subagent |
|---|---|---|---|
| 主窗口展示 | 原生 Chat，流式 | 自定义 View，需要自带输入框 | 只有完成通知 |
| 模型选择 | 复用现有模型下拉，Agent/模型都在里面 | 视图内自定义模型下拉 | 设置页里选 |
| 多轮对话 | 是 | 是 | 否，一次性 |
| 会话列表/搜索/标题 | 原生支持 | 不进入普通 Session | 子代理目录 |
| 与 Harness 工具/技能 | 不共享（外部 Agent 自带工具） | 不共享 | 不共享 |
| 实现复杂度 | 中高，但复用最多 | 中，但会出现两套聊天 | 低，但不符合目标 |
| 主要风险 | ACP 上下文与 Session 日志分离；权限/工具卡片需要额外映射 | 主输入框仍属于 Harness，交互割裂 | 交互形态不对 |

推荐 **A**。它把「外部 Agent」变成一条普通模型路由：用户不需要理解 ACP，只需要在模型下拉里看到 `Cursor Agent (ACP)` 和它的模型。

## 3. 方案 A 的技术设计

### 3.1 Provider 与模型目录

- 每个启用的 ACP Agent 注册一个 DSH LLM provider：
  - provider id：`acp-cursor-agent`（slug）
  - 显示名：`Cursor Agent (ACP)`
- `listModels(provider)` 返回：
  - Agent 最近一次测试/连接发现的 `configOptions` 模型（如 `composer-2.5`、`grok-4.7`）；
  - 未测试时返回一个 `default`（名称 “Agent 默认”）；首次对话成功后再补全并发布 `llm/models-updated`。
- 用户在模型下拉里选 `Cursor Agent · Composer 2.5`，Harness 就把会话的 `provider/model` 记为这条路由。

### 3.2 会话与进程

- 每个 Harness `sessionId` 对应一个 ACP 子进程和一个 ACP session；懒启动，跨轮复用。
- 空闲连接按 LRU 保留（默认 5 条，`maxIdleConnections` 可改）：运行中的绝不回收，淘汰只杀进程、不发 `session/close`；Harness 会话被删除、Agent 配置变更或 Agent 被移除时才真正关闭。
- 模型切换：调用 ACP `session/set_config_option`；Agent 不支持时，重开 ACP session（并用最近对话摘要做一次 preamble）。
- Host 重启或进程被淘汰后：下一次请求优先用 `session/resume`（无回放）或 `session/load`（回放被抑制）续接 agent 侧会话；两者都不可用时回退为：
  - 用最近 N 条 Harness 消息拼一段摘要式 preamble（近似恢复）；
  - 或明确提示上下文已重置。

映射（Harness sessionId → ACP sessionId / Agent / 启动指纹 / cwd）持久化在 `$DSH_HOME/acp-agents/sessions.json`，上限 500 条，不保存环境变量。

### 3.3 一次请求怎么映射

LLM adapter 的 `stream(options)` 会拿到 `sessionId`、完整 `messages`、`system`、`tools`、`signal`、`purpose`。

- **只把最新的用户消息发给 ACP**：Harness 的系统提示、工具 schema、历史消息不重复塞给外部 Agent（它有自己的上下文与系统提示）。
- 多轮：ACP 自己维护上下文，后续只发新用户消息。
- 冷启动/切换 Agent：把最近几条对话拼成一段「前情提要」作为首个 prompt 的前缀。
- `purpose` 为标题生成、压缩等辅助请求时，不发给 ACP：
  - 标题：用首条用户消息在本地截断生成；
  - 压缩：本地跳过或返回轻量摘要，避免污染外部 Agent 上下文。

### 3.4 流式映射

| ACP update | Harness 流 |
|---|---|
| `agent_message_chunk` | `text-delta`（主回答，正常流式显示） |
| `agent_thought_chunk` | `reasoning-delta`（折叠的思考区） |
| `tool_call` / `tool_call_update` | 第一版：折叠的 activity 行（如 `▸ 读取 src/auth/login.ts · 完成`）；第二版：原生工具卡片 |
| `plan` | 可折叠的计划块（第二版） |
| `usage_update` | 可选 `usage`（token 计量近似） |
| `stopReason` | `finish`：`end_turn→stop`、`max_tokens→max-tokens`、取消→`aborted`、失败→`error` |

### 3.5 工具与权限

- **工具不经过 Harness 执行器**：Cursor/OpenCode 在自己的进程里执行工具；Harness 只显示活动与结果。这是把 Agent 作为「模型」的固有取舍，也是必须提前确认的点。
- 权限第一版沿用 Agent 卡片的「自动允许/自动拒绝」；第二版把 ACP `session/request_permission` 映射到 `ctx.approval`，在主对话里出现允许/拒绝卡片。

### 3.6 会话外观

- 仍然是普通 Session：侧边栏、标题、搜索、历史、fork 入口都复用。
- 会话头部加一个 `ACP` 小徽标和 Agent 名，避免误以为是 DeepSeek 在回答。
- 模型下拉中 ACP 分组排在 DeepSeek 之后（或按最近使用排序）。
- 现在的「输入框机器人按钮」不再是主入口：可以移除，或改成「新建一个 ACP 会话」的快捷方式。

## 4. 分阶段

**Phase 1（建议先做）**
- ACP provider 注册 + 模型目录（含未测试时的 default）
- 每 Session 一个 ACP 进程、多轮流式文本/思考
- 模型下拉选择、会话 ACP 徽标
- 工具活动以折叠 activity 行展示
- 自动允许/拒绝权限沿用设置
- 标题/压缩辅助请求本地处理
- 明确限制：无 Harness 工具、无图片、重启后上下文近似恢复

**Phase 2**
- ACP 工具调用转成原生工具卡片（需要把 ACP 工具事件投影到 Session/UI）
- 权限请求映射到 approval 卡片
- 图片/文件 prompt
- 会话恢复的 fork 语义（`session/load` 与 `session/resume` 已实现，preamble 仅作降级）
- 多 Agent 并行（不同会话）

## 5. 需要你确认的取舍

1. **工具归属**：ACP 会话里 Cursor 用自己的工具，Harness 的 bash/read/skill 等不可用——可以接受吗？
2. **工具展示**：第一版用折叠 activity 行（快），还是直接做原生工具卡片（慢但更像现在的对话）？
3. **会话归类**：ACP 会话放普通会话列表（加 ACP 徽标），还是单独一个「外部 Agent」分区？
4. **权限**：继续自动允许，还是第一版就做「每次询问」的 approval 卡片？
5. **模型切换**：同一会话中途换 Agent/模型，允许（新开 ACP session + 前情提要）还是锁定？

## 6. 草图说明

草图展示的是目标形态：

- 主窗口是普通 Session，Cursor 的回答流式显示；
- 现有模型下拉里出现 `Cursor Agent (ACP)` 分组与模型；
- 工具活动显示在回答旁边（第一版可能是折叠行）；
- 设置页仍是命令、环境、权限、测试连接的中心。

草图里的工具卡片是 Phase 2 的目标，不代表 Phase 1 一定按卡片实现。
