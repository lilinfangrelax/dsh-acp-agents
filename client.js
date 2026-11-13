/* ACP Agents — Client half.
 *
 * One settings section ("外部 Agent (ACP)") that manages the external agents the
 * Host half can drive over ACP: local detection, the official ACP Registry,
 * per-agent launch configuration, connection tests, and the default agent.
 *
 * The page talks to the authenticated Host routes under /acp-agents; all
 * display text goes through the locale namespace registered below.
 */

window.__ModuleLoader__.load({
  id: 'dsh-acp-agents',
  factory(require) {
    const React = require('react');
    const reactDom = require('react-dom');
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useRef, useState } = React;

    const NS = 'acp-agents';
    const API = '/acp-agents';

    /* ------------------------------------------------------------------ */
    /* Dictionaries                                                        */
    /* ------------------------------------------------------------------ */

    const ZH = {
      nav: '外部 Agent',
      title: '外部 Agent（ACP）',
      intro:
        '把本机的其他 Agent 接到 Harness。启用后可以在原生聊天窗口的模型下拉里选择它，会话头部的 ACP 设置用来调整权限/Mode；也可以用 acp_delegate 委派一次性任务。',
      refresh: '刷新',
      detect: '重新探测本机',
      refreshRegistry: '更新 ACP Registry',
      updating: '更新中…',
      loadingPage: '加载中…',
      updated: '更新于 {time}',
      never: '尚未加载',
      sectionConnected: '已接入的 Agent',
      sectionLocal: '本机探测到',
      sectionRegistry: '官方 ACP Registry',
      sectionManual: '手动添加',
      count: '{count} 个',
      emptyConnected: '还没有接入任何外部 Agent。可以从下面的“本机探测到”或 Registry 里选择一个。',
      emptyLocal: '没有探测到未接入的本地 Agent。',
      emptyRegistry: 'Registry 尚未加载。点击“更新 ACP Registry”重试。',
      emptySearch: '没有匹配的 Agent。',
      statusInstalled: '已安装',
      statusMissing: '命令未找到',
      statusDisabled: '已停用',
      sourceBuiltin: '内置',
      sourceRegistry: 'Registry',
      sourceDetected: '探测',
      sourceManual: '手动',
      defaultBadge: '默认',
      added: '已接入',
      add: '接入',
      addNpx: '接入（npx 运行）',
      remove: '移除',
      edit: '编辑',
      test: '测试连接',
      testing: '测试中…',
      saving: '保存中…',
      save: '保存',
      cancel: '取消',
      makeDefault: '设为默认',
      addManual: '添加 Agent',
      fieldName: '名称',
      fieldCommand: '命令',
      fieldArgs: '参数',
      fieldEnv: '环境变量',
      fieldModel: '模型',
      fieldCwd: '工作目录',
      fieldPermission: '工具权限',
      fieldEnabled: '启用',
      placeholderName: '例如 My agent',
      placeholderCommand: 'PATH 中的命令，或绝对路径',
      placeholderArgs: '空格分隔，例如 --acp',
      placeholderEnv: '每行一个 KEY=VALUE',
      placeholderModel: '留空则用 Agent 的默认模型',
      placeholderCwd: '留空则使用当前会话的工作目录',
      placeholderSearch: '搜索名称、描述或包名',
      hintArgs: '参数按空格拆分；包含空格的参数请直接编辑配置文件。',
      hintEnv: '环境变量会写入 Host 上的配置文件，并以明文保存。',
      hintCwd: '必须是已存在的绝对路径。留空时使用发起会话的工作目录。',
      hintModel: '填写测试连接后列出的模型值；留空使用 Agent 默认值。',
      permissionAllow: '自动允许',
      permissionDeny: '自动拒绝',
      permissionHelp: '外部 Agent 请求工具权限时，由 Harness 自动回答，不会弹出确认。',
      testNever: '尚未测试',
      testRunning: '正在握手…',
      testOk: '连接正常 · {name} {version} · ACP v{protocol} · {models} 个模型',
      testOkSimple: '连接正常 · ACP v{protocol}',
      testFail: '测试失败：{error}',
      lastTestAt: '上次测试 {time}',
      registryLoading: '正在从 agentclientprotocol.com 获取 Registry…',
      registryError: 'Registry 获取失败：{error}',
      registryStale: '缓存已过期，可手动更新。',
      registryVersion: 'Registry v{version} · {count} 个 Agent',
      requiresInstall: '需先安装',
      registrySearchPlaceholder: '搜索 Agent',
      showAll: '显示全部 {count} 个',
      showLess: '收起',
      noticeSaved: '已保存。',
      noticeAdded: '已接入 {name}。',
      noticeRemoved: '已移除 {name}。',
      noticeTested: '测试完成。',
      noticeDetected: '本机探测完成。',
      noticeRegistry: 'Registry 已更新。',
      errorLoad: '加载失败：{error}',
      errorAction: '操作失败：{error}',
      securityTitle: '权限与安全',
      securityBody:
        '外部 Agent 以启动 Harness 的系统用户身份运行，使用它自己的模型、工具和凭据。开启“自动允许”后，它请求工具权限时会被直接放行；请只接入你信任的 Agent。',
      dataTitle: '数据位置',
      dataBody: '配置与 Registry 缓存保存在 {dir}；环境变量以明文存储。',
      runtimeInfo: '运行中：{providers} 个 Provider · {active} 个任务',
      registrySite: 'agentclientprotocol.com',
      removeConfirm: '确定移除 {name}？',
      argsEmpty: '（无参数）',
      defaultHelp: '调用 acp_delegate 时省略 agent 参数会使用默认 Agent。',
      pickerButton: '外部 Agent',
      pickerTitle: '外部 Agent',
      pickerSubtitle: '选择一个已启用的 ACP Agent，把任务直接交给它',
      pickerClose: '关闭',
      pickerEmpty: '还没有启用外部 Agent。请到「设置 → 外部 Agent（ACP）」里启用一个。',
      pickerLoading: '正在读取外部 Agent…',
      pickerDefault: '默认',
      pickerInstalled: '已安装',
      pickerMissing: '命令未找到',
      pickerUntested: '尚未测试',
      pickerTested: '已测试 · {count} 个模型',
      pickerPlaceholder: '给 {name} 的任务：它看不到当前对话，请把目标、路径和约束写完整…',
      pickerHint: '任务在独立进程中执行；最终回答会以子代理完成通知出现在当前会话。',
      pickerCancel: '取消',
      pickerSend: '发送给 {name}',
      pickerStarting: '正在启动 {name}…',
      pickerSent: '已发送给 {name}。结果稍后以子代理通知返回。',
      pickerError: '发送失败：{error}',
      pickerNoSession: '当前会话尚未就绪',
      pickerManage: '在设置中管理',
      cascadeAgent: '外部 Agent',
      cascadeModel: '模型',
      cascadePermission: '权限',
      cascadeMode: '模式',
      cascadeChooseAgent: '选择 Agent',
      cascadeChooseModel: '选择模型',
      cascadePermissionHint: '外部 Agent 请求工具权限时的回答方式。',
      cascadeAskSoon: '每次询问（后续支持）',
      cascadeApply: '应用并开始',
      cascadeApplying: '正在应用…',
      cascadeApplied: '已切换到 {name}。下一条消息将由它回答。',
      cascadeError: '应用失败：{error}',
      cascadeNoAgents: '还没有启用外部 Agent。请到「设置 → 外部 Agent（ACP）」里启用一个。',
      cascadeLoading: '正在读取外部 Agent…',
      cascadeDefault: '默认',
      cascadeBack: '上一步',
      cascadeCurrent: '当前',
      cascadeSwitchBackHint: '想切回 DeepSeek，请使用右侧模型下拉。',
      cascadeModelHint: '模型来自 Agent 的 configOptions；首次连接或测试后自动发现。',
      cascadeNoSession: '当前会话尚未就绪',
      statusTitle: 'ACP 会话状态',
      statusSectionSession: '会话',
      statusAgent: 'Agent',
      statusProtocol: '协议',
      statusSession: 'ACP 会话',
      statusCwd: '工作目录',
      statusLink: '连接',
      statusBusy: '运行中',
      statusIdle: '空闲',
      statusClosed: '已断开',
      statusResume: '续接方式',
      statusResumeYes: '已续接',
      statusUsage: '上下文',
      statusCost: '成本',
      statusCostValue: '{amount} {currency}',
      statusMode: '模式',
      statusModeCurrent: '当前',
      statusModeAll: '可选',
      statusPlan: '计划',
      statusCommands: '可用命令',
      statusTools: '最近工具',
      statusCompaction: '上下文压缩',
      statusCompactionState: '状态',
      statusCompactionError: '错误',
      statusSessionInfo: '会话信息',
      statusSessionTitle: '标题',
      statusUpdatedAt: '更新于',
      statusConfig: '配置项',
      statusCapabilities: '能力',
      statusCapResume: '续接',
      statusCapLoad: '加载',
      statusCapFork: '分叉',
      statusCapClose: '关闭',
      statusCapImage: '图片输入',
      statusCapMcp: 'MCP',
      statusAuth: '登录方式',
      statusMissingTitle: '未上报的信息（{count}）',
      statusUnreported: '该 Agent 未上报',
      statusWaiting: '正在读取 ACP 会话状态…',
      statusError: '读取状态失败，请稍后重试。',
      statusPendingTitle: '等待第一条消息',
      statusPendingBody: '发出第一条消息后，Agent 才会启动；会话状态、上下文占用和可用命令随后出现。',
      seatNative: '原生',
      seatAcp: 'ACP',
      seatMode: '方式',
      seatAgent: 'Agent',
      seatModel: '模型',
      seatEffort: '思考深度',
      seatPermission: '权限',
      seatMore: '更多参数',
      seatAllow: '允许',
      seatDeny: '拒绝',
      seatPermissionHint: '外部 Agent 请求工具权限时的回答。',
      seatDefault: '默认',
      seatDefaultModel: '默认模型',
      seatSearchModel: '搜索模型…',
      seatNoModels: '没有可用模型',
      seatNoNative: '没有可用的原生模型',
      seatNoAgents: '还没有启用外部 Agent。请先到「设置 → 外部 Agent（ACP）」启用。',
      seatNoAgentsShort: '未启用',
      seatChooseModel: '选择模型',
      seatDone: '完成',
      seatApplying: '切换中…',
      seatLoading: '加载中…',
      seatError: '切换失败：{error}',
      seatNoSession: '当前会话尚未就绪',
      seatModelCount: '{count} 个模型',
      seatHint: '选择后立即生效，点击面板外部关闭。',
      seatAcpNote: '外部 Agent 使用自己的模型与工具回答。',
      workspaceNav: 'ACP 工作台',
      workspaceTitle: 'ACP 工作台',
      workspaceSub: '独立通道 · 不影响 Harness 会话与创造模式',
      workspaceStart: '开始对话',
      workspaceStarting: '正在启动…',
      workspaceAgent: 'Agent',
      workspaceModel: '模型',
      workspacePermission: '权限',
      workspaceMode: '模式',
      workspaceCwd: '工作目录',
      workspaceAllow: '自动允许',
      workspaceDeny: '自动拒绝',
      workspaceAsk: '每次询问（后续）',
      workspaceInput: '给 {name} 发消息…',
      workspaceSend: '发送',
      workspaceStop: '停止',
      workspaceEmpty: '开始和 {name} 对话。它有自己的上下文和工具，不会读取 Harness 会话。',
      workspaceNew: '新对话',
      workspaceSwitch: '切换 Agent',
      workspaceBusy: '正在回答…',
      workspaceError: '操作失败：{error}',
      workspaceNoAgents: '还没有启用外部 Agent。请到「设置 → 外部 Agent（ACP）」里启用一个。',
      workspaceSettings: '在设置中管理',
      workspaceLoading: '正在读取 ACP 工作台…',
      workspaceClosed: 'ACP 会话已结束',
      workspaceThought: '思考',
      workspaceTool: '工具',
      workspaceHint: 'Enter 发送 · Shift+Enter 换行',
      workspaceIndependent: '独立 ACP 进程',
      workspaceDefaultModel: '默认模型',
      workspaceNoCwd: '未选择',
    };

    const EN = {
      nav: 'External agents',
      title: 'External agents (ACP)',
      intro:
        'Connect other agents on this machine to Harness. Pick one in the native model dropdown; the ACP settings in the session header tune permission and mode. acp_delegate stays available for one-off tasks.',
      refresh: 'Refresh',
      detect: 'Detect again',
      refreshRegistry: 'Update ACP Registry',
      updating: 'Updating…',
      loadingPage: 'Loading…',
      updated: 'Updated {time}',
      never: 'not loaded yet',
      sectionConnected: 'Connected agents',
      sectionLocal: 'Detected on this machine',
      sectionRegistry: 'Official ACP Registry',
      sectionManual: 'Add manually',
      count: '{count}',
      emptyConnected: 'No external agent is connected yet. Pick one from the detected list or the Registry below.',
      emptyLocal: 'No unconnected local agent was detected.',
      emptyRegistry: 'The Registry is not loaded. Use “Update ACP Registry” to retry.',
      emptySearch: 'No matching agent.',
      statusInstalled: 'installed',
      statusMissing: 'command not found',
      statusDisabled: 'disabled',
      sourceBuiltin: 'built-in',
      sourceRegistry: 'Registry',
      sourceDetected: 'detected',
      sourceManual: 'manual',
      defaultBadge: 'default',
      added: 'Connected',
      add: 'Connect',
      addNpx: 'Connect (runs via npx)',
      remove: 'Remove',
      edit: 'Edit',
      test: 'Test connection',
      testing: 'Testing…',
      saving: 'Saving…',
      save: 'Save',
      cancel: 'Cancel',
      makeDefault: 'Make default',
      addManual: 'Add agent',
      fieldName: 'Name',
      fieldCommand: 'Command',
      fieldArgs: 'Arguments',
      fieldEnv: 'Environment',
      fieldModel: 'Model',
      fieldCwd: 'Working directory',
      fieldPermission: 'Tool permission',
      fieldEnabled: 'Enabled',
      placeholderName: 'e.g. My agent',
      placeholderCommand: 'A command on PATH, or an absolute path',
      placeholderArgs: 'Space separated, e.g. --acp',
      placeholderEnv: 'One KEY=VALUE per line',
      placeholderModel: 'Empty uses the agent default',
      placeholderCwd: 'Empty uses the session working directory',
      placeholderSearch: 'Search name, description, or package',
      hintArgs: 'Arguments are split on spaces; edit the config file for arguments that contain spaces.',
      hintEnv: 'Environment variables are stored in the Host config file in plain text.',
      hintCwd: 'Must be an existing absolute directory. Empty uses the delegating session directory.',
      hintModel: 'Use a model value listed by the connection test; empty uses the agent default.',
      permissionAllow: 'Allow automatically',
      permissionDeny: 'Reject automatically',
      permissionHelp: 'Tool permission requests from the external agent are answered automatically, without a prompt.',
      testNever: 'Not tested yet',
      testRunning: 'Negotiating…',
      testOk: 'Connected · {name} {version} · ACP v{protocol} · {models} models',
      testOkSimple: 'Connected · ACP v{protocol}',
      testFail: 'Test failed: {error}',
      lastTestAt: 'Last tested {time}',
      registryLoading: 'Fetching the Registry from agentclientprotocol.com…',
      registryError: 'Registry fetch failed: {error}',
      registryStale: 'The cached copy is stale; update it manually.',
      registryVersion: 'Registry v{version} · {count} agents',
      requiresInstall: 'install first',
      registrySearchPlaceholder: 'Search agents',
      showAll: 'Show all {count}',
      showLess: 'Show less',
      noticeSaved: 'Saved.',
      noticeAdded: 'Connected {name}.',
      noticeRemoved: 'Removed {name}.',
      noticeTested: 'Test finished.',
      noticeDetected: 'Detection finished.',
      noticeRegistry: 'Registry updated.',
      errorLoad: 'Load failed: {error}',
      errorAction: 'Action failed: {error}',
      securityTitle: 'Permissions and safety',
      securityBody:
        'An external agent runs as the same system user as Harness and brings its own model, tools, and credentials. With “Allow automatically”, its tool permission requests are approved without a prompt; only connect agents you trust.',
      dataTitle: 'Data location',
      dataBody: 'Configuration and the Registry cache live in {dir}; environment variables are stored in plain text.',
      runtimeInfo: 'Runtime: {providers} providers · {active} active tasks',
      registrySite: 'agentclientprotocol.com',
      removeConfirm: 'Remove {name}?',
      argsEmpty: '(no arguments)',
      defaultHelp: 'acp_delegate uses the default agent when its agent argument is omitted.',
      pickerButton: 'External agent',
      pickerTitle: 'External agent',
      pickerSubtitle: 'Pick an enabled ACP agent and hand it a task directly',
      pickerClose: 'Close',
      pickerEmpty: 'No external agent is enabled. Enable one in Settings → External agents (ACP).',
      pickerLoading: 'Loading external agents…',
      pickerDefault: 'default',
      pickerInstalled: 'installed',
      pickerMissing: 'command not found',
      pickerUntested: 'not tested',
      pickerTested: 'tested · {count} models',
      pickerPlaceholder: 'Task for {name}: it cannot see this conversation, so include goals, paths, and constraints…',
      pickerHint: 'The task runs in its own process; the final answer arrives in this session as a subagent completion notice.',
      pickerCancel: 'Cancel',
      pickerSend: 'Send to {name}',
      pickerStarting: 'Starting {name}…',
      pickerSent: 'Sent to {name}. The result will arrive as a subagent notice.',
      pickerError: 'Send failed: {error}',
      pickerNoSession: 'This session is not ready yet',
      pickerManage: 'Manage in settings',
      cascadeAgent: 'External agent',
      cascadeModel: 'Model',
      cascadePermission: 'Permission',
      cascadeMode: 'Mode',
      cascadeChooseAgent: 'Choose an agent',
      cascadeChooseModel: 'Choose a model',
      cascadePermissionHint: 'How tool permission requests from the external agent are answered.',
      cascadeAskSoon: 'Ask every time (coming later)',
      cascadeApply: 'Apply and start',
      cascadeApplying: 'Applying…',
      cascadeApplied: 'Switched to {name}. Your next message will be answered by it.',
      cascadeError: 'Apply failed: {error}',
      cascadeNoAgents: 'No external agent is enabled. Enable one in Settings → External agents (ACP).',
      cascadeLoading: 'Loading external agents…',
      cascadeDefault: 'Default',
      cascadeBack: 'Back',
      cascadeCurrent: 'Current',
      cascadeSwitchBackHint: 'To switch back to DeepSeek, use the model dropdown on the right.',
      cascadeModelHint: 'Models come from the agent configOptions; they are discovered on the first connection or a test.',
      cascadeNoSession: 'This session is not ready yet',
      statusTitle: 'ACP session status',
      statusSectionSession: 'Session',
      statusAgent: 'Agent',
      statusProtocol: 'Protocol',
      statusSession: 'ACP session',
      statusCwd: 'Working directory',
      statusLink: 'Connection',
      statusBusy: 'running',
      statusIdle: 'idle',
      statusClosed: 'disconnected',
      statusResume: 'Resumed via',
      statusResumeYes: 'resumed',
      statusUsage: 'Context',
      statusCost: 'Cost',
      statusCostValue: '{amount} {currency}',
      statusMode: 'Mode',
      statusModeCurrent: 'Current',
      statusModeAll: 'Available',
      statusPlan: 'Plan',
      statusCommands: 'Available commands',
      statusTools: 'Recent tools',
      statusCompaction: 'Compaction',
      statusCompactionState: 'Status',
      statusCompactionError: 'Error',
      statusSessionInfo: 'Session info',
      statusSessionTitle: 'Title',
      statusUpdatedAt: 'Updated',
      statusConfig: 'Config options',
      statusCapabilities: 'Capabilities',
      statusCapResume: 'resume',
      statusCapLoad: 'load',
      statusCapFork: 'fork',
      statusCapClose: 'close',
      statusCapImage: 'image input',
      statusCapMcp: 'MCP',
      statusAuth: 'Auth methods',
      statusMissingTitle: 'Not reported ({count})',
      statusUnreported: 'This agent does not report it',
      statusWaiting: 'Reading ACP session status…',
      statusError: 'Could not read the session status. Try again.',
      statusPendingTitle: 'Waiting for the first message',
      statusPendingBody: 'The agent starts with your first message; session status, context usage and available commands appear after that.',
      seatNative: 'Native',
      seatAcp: 'ACP',
      seatMode: 'Mode',
      seatAgent: 'Agent',
      seatModel: 'Model',
      seatEffort: 'Thinking',
      seatPermission: 'Permission',
      seatMore: 'More options',
      seatAllow: 'Allow',
      seatDeny: 'Deny',
      seatPermissionHint: 'How tool permission requests from the external agent are answered.',
      seatDefault: 'Default',
      seatDefaultModel: 'Default model',
      seatSearchModel: 'Search models…',
      seatNoModels: 'No models available',
      seatNoNative: 'No native models available',
      seatNoAgents: 'No external agent is enabled. Enable one in Settings → External agents (ACP).',
      seatNoAgentsShort: 'None',
      seatChooseModel: 'Choose a model',
      seatDone: 'Done',
      seatApplying: 'Switching…',
      seatLoading: 'Loading…',
      seatError: 'Switch failed: {error}',
      seatNoSession: 'This session is not ready yet',
      seatModelCount: '{count} models',
      seatHint: 'Changes apply immediately. Click outside to close.',
      seatAcpNote: 'The external agent answers with its own model and tools.',
      workspaceNav: 'ACP workspace',
      workspaceTitle: 'ACP workspace',
      workspaceSub: 'Separate channel · leaves Harness sessions and Creation mode untouched',
      workspaceStart: 'Start chat',
      workspaceStarting: 'Starting…',
      workspaceAgent: 'Agent',
      workspaceModel: 'Model',
      workspacePermission: 'Permission',
      workspaceMode: 'Mode',
      workspaceCwd: 'Working directory',
      workspaceAllow: 'Allow automatically',
      workspaceDeny: 'Deny automatically',
      workspaceAsk: 'Ask every time (coming later)',
      workspaceInput: 'Message {name}…',
      workspaceSend: 'Send',
      workspaceStop: 'Stop',
      workspaceEmpty: 'Start a chat with {name}. It has its own context and tools and does not read the Harness session.',
      workspaceNew: 'New chat',
      workspaceSwitch: 'Switch agent',
      workspaceBusy: 'Answering…',
      workspaceError: 'Action failed: {error}',
      workspaceNoAgents: 'No external agent is enabled. Enable one in Settings → External agents (ACP).',
      workspaceSettings: 'Manage in settings',
      workspaceLoading: 'Loading the ACP workspace…',
      workspaceClosed: 'This ACP chat has ended',
      workspaceThought: 'Thinking',
      workspaceTool: 'Tool',
      workspaceHint: 'Enter sends · Shift+Enter adds a line',
      workspaceIndependent: 'Separate ACP process',
      workspaceDefaultModel: 'Default model',
      workspaceNoCwd: 'Not set',
    };

    /* ------------------------------------------------------------------ */
    /* Small helpers                                                       */
    /* ------------------------------------------------------------------ */

    function formatTime(timestamp) {
      if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return '';
      try {
        return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
      } catch {
        return new Date(timestamp).toLocaleTimeString();
      }
    }

    function splitArgs(value) {
      return String(value || '')
        .trim()
        .split(/\s+/)
        .filter((entry) => entry.length > 0);
    }

    function parseEnv(value) {
      const env = {};
      for (const line of String(value || '').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
        const index = trimmed.indexOf('=');
        if (index <= 0) continue;
        const key = trimmed.slice(0, index).trim();
        const entry = trimmed.slice(index + 1);
        if (key.length > 0) env[key] = entry;
      }
      return env;
    }

    function envText(env) {
      if (env === null || typeof env !== 'object') return '';
      return Object.entries(env)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
    }

    function agentInput(agent, patch) {
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
        ...patch,
      };
    }

    function statusOf(agent) {
      if (!agent.enabled) return { tone: 'idle', text: 'statusDisabled' };
      return agent.available ? { tone: 'ok', text: 'statusInstalled' } : { tone: 'warn', text: 'statusMissing' };
    }

    function sourceKey(agent) {
      if (agent.source === 'builtin') return 'sourceBuiltin';
      if (agent.source === 'registry') return 'sourceRegistry';
      if (agent.source === 'detected') return 'sourceDetected';
      return 'sourceManual';
    }

    function distributionLabel(entry) {
      if (entry.distributionKind === 'npx') return 'npx';
      if (entry.distributionKind === 'uvx') return 'uvx';
      if (entry.distributionKind === 'binary') return 'binary';
      return 'local';
    }

    /* ------------------------------------------------------------------ */
    /* Styled atoms                                                        */
    /* ------------------------------------------------------------------ */

    function Switch({ checked, disabled, label, onChange }) {
      return h(
        'button',
        {
          type: 'button',
          role: 'switch',
          'aria-checked': checked ? 'true' : 'false',
          'aria-label': label,
          className: 'acp-switch',
          'data-on': checked ? '1' : undefined,
          disabled: disabled === true,
          onClick: () => {
            if (disabled !== true) onChange(!checked);
          },
        },
        h('span', { className: 'acp-switch-knob' }),
      );
    }

    function Notice({ notice, onClose }) {
      if (notice === null) return null;
      return h(
        'div',
        { className: 'acp-notice', 'data-tone': notice.tone, role: notice.tone === 'error' ? 'alert' : 'status' },
        h('span', { className: 'acp-notice-text' }, notice.text),
        h('button', { type: 'button', className: 'acp-notice-close', 'aria-label': 'dismiss', onClick: onClose }, '×'),
      );
    }

    /* ------------------------------------------------------------------ */
    /* Agent editor                                                        */
    /* ------------------------------------------------------------------ */

    function AgentEditor({ t, draft, setDraft, models, busy, onSave, onCancel }) {
      const listId = useMemo(() => `acp-models-${Math.random().toString(36).slice(2)}`, []);
      return h(
        'div',
        { className: 'acp-form' },
        h(
          'div',
          { className: 'acp-form-grid' },
          h(
            'label',
            { className: 'acp-field' },
            h('span', { className: 'acp-field-label' }, t('fieldName')),
            h('input', {
              className: 'acp-input',
              value: draft.name,
              onChange: (event) => setDraft({ name: event.target.value }),
            }),
          ),
          h(
            'label',
            { className: 'acp-field' },
            h('span', { className: 'acp-field-label' }, t('fieldCommand')),
            h('input', {
              className: 'acp-input acp-mono',
              value: draft.command,
              spellCheck: false,
              onChange: (event) => setDraft({ command: event.target.value }),
            }),
          ),
        ),
        h(
          'label',
          { className: 'acp-field' },
          h('span', { className: 'acp-field-label' }, t('fieldArgs')),
          h('input', {
            className: 'acp-input acp-mono',
            value: draft.argsText,
            spellCheck: false,
            placeholder: t('placeholderArgs'),
            onChange: (event) => setDraft({ argsText: event.target.value }),
          }),
          h('span', { className: 'acp-field-hint' }, t('hintArgs')),
        ),
        h(
          'div',
          { className: 'acp-form-grid' },
          h(
            'label',
            { className: 'acp-field' },
            h('span', { className: 'acp-field-label' }, t('fieldModel')),
            h('input', {
              className: 'acp-input acp-mono',
              value: draft.model,
              list: listId,
              placeholder: t('placeholderModel'),
              onChange: (event) => setDraft({ model: event.target.value }),
            }),
            h(
              'datalist',
              { id: listId },
              (models || []).map((model) => h('option', { key: model.value, value: model.value }, model.name)),
            ),
            h('span', { className: 'acp-field-hint' }, t('hintModel')),
          ),
          h(
            'label',
            { className: 'acp-field' },
            h('span', { className: 'acp-field-label' }, t('fieldCwd')),
            h('input', {
              className: 'acp-input acp-mono',
              value: draft.cwd,
              placeholder: t('placeholderCwd'),
              onChange: (event) => setDraft({ cwd: event.target.value }),
            }),
            h('span', { className: 'acp-field-hint' }, t('hintCwd')),
          ),
        ),
        h(
          'label',
          { className: 'acp-field' },
          h('span', { className: 'acp-field-label' }, t('fieldEnv')),
          h('textarea', {
            className: 'acp-textarea acp-mono',
            rows: 3,
            value: draft.envText,
            spellCheck: false,
            placeholder: t('placeholderEnv'),
            onChange: (event) => setDraft({ envText: event.target.value }),
          }),
          h('span', { className: 'acp-field-hint' }, t('hintEnv')),
        ),
        h(
          'div',
          { className: 'acp-form-row' },
          h(
            'label',
            { className: 'acp-choice' },
            h('input', {
              type: 'checkbox',
              checked: draft.enabled,
              onChange: (event) => setDraft({ enabled: event.target.checked }),
            }),
            h('span', null, t('fieldEnabled')),
          ),
          h(
            'label',
            { className: 'acp-choice' },
            h('input', {
              type: 'checkbox',
              checked: draft.permission === 'allow',
              onChange: (event) => setDraft({ permission: event.target.checked ? 'allow' : 'deny' }),
            }),
            h('span', null, t('permissionAllow')),
          ),
        ),
        h('span', { className: 'acp-field-hint' }, t('permissionHelp')),
        h(
          'div',
          { className: 'acp-form-actions' },
          h('button', { type: 'button', className: 'acp-btn', onClick: onCancel }, t('cancel')),
          h(
            'button',
            { type: 'button', className: 'acp-btn', 'data-variant': 'primary', disabled: busy, onClick: onSave },
            busy ? t('saving') : t('save'),
          ),
        ),
      );
    }

    /* ------------------------------------------------------------------ */
    /* Agent card                                                          */
    /* ------------------------------------------------------------------ */

    function AgentCard({ t, agent, isDefault, busy, editing, draft, setDraft, models, onToggle, onTest, onEdit, onCancelEdit, onSaveEdit, onRemove, onDefault, onModel }) {
      const status = statusOf(agent);
      const lastTest = agent.lastTest;
      const testText = (() => {
        if (busy === `test:${agent.id}`) return t('testRunning');
        if (!lastTest) return t('testNever');
        if (lastTest.ok) {
          const info = lastTest.agentInfo || {};
          const name = info.name || agent.name;
          const version = info.version || '';
          const protocol = lastTest.protocolVersion || 1;
          const modelCount = Array.isArray(lastTest.models) ? lastTest.models.length : 0;
          return modelCount > 0
            ? t('testOk', { name, version, protocol, models: modelCount })
            : t('testOkSimple', { protocol });
        }
        return t('testFail', { error: String(lastTest.error || 'unknown').slice(0, 240) });
      })();
      const modelsForAgent = lastTest && Array.isArray(lastTest.models) ? lastTest.models : [];
      return h(
        'div',
        { className: 'acp-card', 'data-disabled': agent.enabled ? undefined : '1' },
        h(
          'div',
          { className: 'acp-card-head' },
          h(
            'div',
            { className: 'acp-card-title' },
            h('span', { className: 'acp-name' }, agent.name),
            h('span', { className: 'acp-id acp-mono' }, agent.id),
            isDefault ? h('span', { className: 'acp-chip', 'data-tone': 'brand' }, t('defaultBadge')) : null,
            h('span', { className: 'acp-chip' }, t(sourceKey(agent))),
          ),
          h(
            'div',
            { className: 'acp-card-head-actions' },
            isDefault ? null : h('button', { type: 'button', className: 'acp-link', onClick: () => onDefault(agent.id) }, t('makeDefault')),
            h(Switch, {
              checked: agent.enabled,
              disabled: busy === `toggle:${agent.id}`,
              label: t('fieldEnabled'),
              onChange: () => onToggle(agent),
            }),
          ),
        ),
        h(
          'code',
          { className: 'acp-cmd' },
          agent.command,
          agent.args && agent.args.length > 0 ? ` ${agent.args.join(' ')}` : ` ${t('argsEmpty')}`,
        ),
        h(
          'div',
          { className: 'acp-meta' },
          h('span', { className: 'acp-status' }, h('span', { className: 'acp-dot', 'data-tone': status.tone }), t(status.text)),
          h('span', { className: 'acp-meta-sep' }, '·'),
          h('span', { className: lastTest && !lastTest.ok ? 'acp-test acp-test-bad' : 'acp-test' }, testText),
        ),
        lastTest && lastTest.at ? h('div', { className: 'acp-subline' }, t('lastTestAt', { time: formatTime(lastTest.at) })) : null,
        modelsForAgent.length > 0
          ? h(
              'label',
              { className: 'acp-inline-field' },
              h('span', { className: 'acp-field-label' }, t('fieldModel')),
              h(
                'select',
                {
                  className: 'acp-select',
                  value: agent.model || '',
                  disabled: busy === `model:${agent.id}`,
                  onChange: (event) => onModel(agent, event.target.value),
                },
                h('option', { value: '' }, t('placeholderModel')),
                modelsForAgent.map((model) => h('option', { key: model.value, value: model.value }, `${model.name || model.value} (${model.value})`)),
                agent.model && !modelsForAgent.some((model) => model.value === agent.model)
                  ? h('option', { value: agent.model }, agent.model)
                  : null,
              ),
            )
          : null,
        editing
          ? h(AgentEditor, {
              t,
              draft,
              setDraft,
              models: modelsForAgent,
              busy: busy === `save:${agent.id}`,
              onSave: onSaveEdit,
              onCancel: onCancelEdit,
            })
          : h(
              'div',
              { className: 'acp-card-actions' },
              h(
                'button',
                { type: 'button', className: 'acp-btn', disabled: busy === `test:${agent.id}`, onClick: () => onTest(agent.id) },
                busy === `test:${agent.id}` ? t('testing') : t('test'),
              ),
              h('button', { type: 'button', className: 'acp-btn', onClick: () => onEdit(agent, modelsForAgent) }, t('edit')),
              h('button', { type: 'button', className: 'acp-btn', 'data-variant': 'danger', onClick: () => onRemove(agent) }, t('remove')),
            ),
      );
    }

    /* ------------------------------------------------------------------ */
    /* Registry row                                                        */
    /* ------------------------------------------------------------------ */

    function RegistryRow({ t, entry, candidate, added, busy, onAdd }) {
      const viaNpx = entry.launchKind === 'npx' || entry.launchKind === 'uvx';
      const installed = Boolean(candidate && candidate.available);
      return h(
        'div',
        { className: 'acp-registry-row' },
        h(
          'div',
          { className: 'acp-registry-main' },
          h(
            'div',
            { className: 'acp-registry-title' },
            h('span', { className: 'acp-name' }, entry.name),
            entry.version ? h('span', { className: 'acp-id acp-mono' }, entry.version) : null,
            h('span', { className: 'acp-chip' }, distributionLabel(entry)),
            entry.package ? h('span', { className: 'acp-id acp-mono acp-package' }, entry.package) : null,
          ),
          h('p', { className: 'acp-registry-desc' }, entry.description || ''),
        ),
        h(
          'div',
          { className: 'acp-registry-side' },
          added
            ? h('span', { className: 'acp-chip', 'data-tone': 'ok' }, t('added'))
            : installed
              ? h('button', { type: 'button', className: 'acp-btn', disabled: busy, onClick: () => onAdd(entry, candidate) }, t('add'))
              : viaNpx
                ? h('button', { type: 'button', className: 'acp-btn', disabled: busy, onClick: () => onAdd(entry, null) }, t('addNpx'))
                : h(
                    'div',
                    { className: 'acp-registry-install' },
                    h('span', { className: 'acp-chip' }, t('requiresInstall')),
                    entry.website
                      ? h('a', { className: 'acp-link', href: entry.website, target: '_blank', rel: 'noreferrer noopener' }, '↗')
                      : null,
                  ),
        ),
      );
    }

    /* ------------------------------------------------------------------ */
    /* Panel                                                               */
    /* ------------------------------------------------------------------ */

    function fallbackTranslate(key, params) {
      const template = ZH[key] ?? key;
      if (!params) return template;
      return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
    }

    /* ------------------------------------------------------------------ */
    /* Composer picker                                                     */
    /* ------------------------------------------------------------------ */

    function AgentGlyph({ size = 16 }) {
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
        h('rect', { x: 3.5, y: 7.5, width: 17, height: 12, rx: 3.5, stroke: 'currentColor', strokeWidth: 1.6 }),
        h('path', { d: 'M12 3.2v4.1', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }),
        h('circle', { cx: 12, cy: 3.2, r: 1.15, fill: 'currentColor' }),
        h('circle', { cx: 9, cy: 13.2, r: 1.15, fill: 'currentColor' }),
        h('circle', { cx: 15, cy: 13.2, r: 1.15, fill: 'currentColor' }),
        h('path', { d: 'M9 16.8h6', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }),
      );
    }

    function AcpComposerButton(props) {
      const t = typeof props.t === 'function' ? props.t : fallbackTranslate;
      const sessionId = props.sessionId;
      const [open, setOpen] = useState(false);
      const [data, setData] = useState(null);
      const [loading, setLoading] = useState(false);
      const [selectedId, setSelectedId] = useState(null);
      const [task, setTask] = useState('');
      const [phase, setPhase] = useState('idle');
      const [sentName, setSentName] = useState('');
      const [error, setError] = useState(null);
      const textareaRef = useRef(null);
      const closeTimer = useRef(null);

      const load = useCallback(async (withSpinner) => {
        if (withSpinner) setLoading(true);
        try {
          const response = await fetch(`${API}/agents`, {
            credentials: 'same-origin',
            headers: { accept: 'application/json' },
          });
          let payload = null;
          try {
            payload = await response.json();
          } catch {
            payload = null;
          }
          if (!response.ok || payload === null || payload.ok === false) {
            throw new Error(payload && payload.error ? String(payload.error) : `HTTP ${response.status}`);
          }
          setData(payload);
          if (withSpinner) setError(null);
          setSelectedId((current) => {
            const enabled = (Array.isArray(payload.agents) ? payload.agents : []).filter((agent) => agent.enabled);
            if (current !== null && enabled.some((agent) => agent.id === current)) return current;
            const preferred = enabled.find((agent) => agent.id === payload.defaultAgent) || enabled[0];
            return preferred ? preferred.id : null;
          });
        } catch (loadError) {
          if (withSpinner) setError(loadError.message);
        } finally {
          if (withSpinner) setLoading(false);
        }
      }, []);

      useEffect(() => {
        void load(false);
      }, [load]);

      useEffect(() => () => {
        if (closeTimer.current !== null) clearTimeout(closeTimer.current);
      }, []);

      const close = useCallback(() => {
        setOpen(false);
        setError(null);
        setPhase((current) => (current === 'starting' ? current : 'idle'));
      }, []);

      useEffect(() => {
        if (!open) return undefined;
        const onKey = (event) => {
          if (event.key === 'Escape') close();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [open, close]);

      const enabledAgents = data && Array.isArray(data.agents) ? data.agents.filter((agent) => agent.enabled) : [];
      const selected = enabledAgents.find((agent) => agent.id === selectedId) || enabledAgents[0] || null;
      const defaultAgent = enabledAgents.find((agent) => data && agent.id === data.defaultAgent) || enabledAgents[0] || null;

      useEffect(() => {
        if (!open) return undefined;
        const timer = setTimeout(() => {
          if (textareaRef.current) textareaRef.current.focus();
        }, 60);
        return () => clearTimeout(timer);
      }, [open, selectedId]);

      function toggleOpen() {
        const next = !open;
        setOpen(next);
        if (next) {
          setError(null);
          setPhase('idle');
          void load(true);
        }
      }

      async function send() {
        if (selected === null || phase !== 'idle') return;
        const content = task.trim();
        if (content.length === 0) return;
        if (sessionId === undefined || sessionId === null || String(sessionId).length === 0) {
          setError(t('pickerNoSession'));
          return;
        }
        setPhase('starting');
        setError(null);
        try {
          const response = await fetch(`${API}/dispatch`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({
              agentId: selected.id,
              task: content,
              sessionId: String(sessionId),
            }),
          });
          let payload = null;
          try {
            payload = await response.json();
          } catch {
            payload = null;
          }
          if (!response.ok || payload === null || payload.ok === false) {
            throw new Error(payload && payload.error ? String(payload.error) : `HTTP ${response.status}`);
          }
          setPhase('sent');
          setSentName(selected.name);
          setTask('');
          closeTimer.current = setTimeout(() => {
            setOpen(false);
            setPhase('idle');
          }, 1600);
        } catch (sendError) {
          setPhase('idle');
          setError(String(sendError.message || sendError));
        }
      }

      function agentStatus(agent) {
        if (!agent.available) return { tone: 'warn', text: t('pickerMissing') };
        return { tone: 'ok', text: t('pickerInstalled') };
      }

      function testLine(agent) {
        if (!agent.lastTest) return t('pickerUntested');
        if (agent.lastTest.ok) {
          return t('pickerTested', {
            count: Array.isArray(agent.lastTest.models) ? agent.lastTest.models.length : 0,
          });
        }
        return t('testFail', { error: String(agent.lastTest.error || 'unknown').slice(0, 120) });
      }

      const title = defaultAgent === null ? t('pickerButton') : `${t('pickerButton')} · ${defaultAgent.name}`;

      const dialog = open
        ? reactDom.createPortal(
            h(
              'div',
              {
                className: 'acp-pick-backdrop',
                onMouseDown: (event) => {
                  if (event.target === event.currentTarget) close();
                },
              },
              h(
                'div',
                { className: 'acp-pick-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('pickerTitle') },
                h(
                  'div',
                  { className: 'acp-pick-head' },
                  h(
                    'div',
                    { className: 'acp-pick-heading' },
                    h('span', { className: 'acp-pick-title' }, t('pickerTitle')),
                    h('span', { className: 'acp-pick-sub' }, t('pickerSubtitle')),
                  ),
                  h(
                    'button',
                    { type: 'button', className: 'acp-pick-close', 'aria-label': t('pickerClose'), onClick: close },
                    '×',
                  ),
                ),
                error !== null
                  ? h('div', { className: 'acp-pick-error', role: 'alert' }, t('pickerError', { error }))
                  : null,
                phase === 'sent'
                  ? h(
                      'div',
                      { className: 'acp-pick-success' },
                      h('span', { className: 'acp-pick-success-mark' }, '✓'),
                      h('span', null, t('pickerSent', { name: sentName })),
                    )
                  : loading && data === null
                    ? h('div', { className: 'acp-pick-loading' }, t('pickerLoading'))
                    : enabledAgents.length === 0
                      ? h('div', { className: 'acp-pick-empty' }, t('pickerEmpty'))
                      : h(
                          React.Fragment,
                          null,
                          h(
                            'div',
                            { className: 'acp-pick-list', role: 'listbox', 'aria-label': t('pickerTitle') },
                            enabledAgents.map((agent) => {
                              const status = agentStatus(agent);
                              const selectedNow = selected !== null && selected.id === agent.id;
                              return h(
                                'button',
                                {
                                  key: agent.id,
                                  type: 'button',
                                  role: 'option',
                                  'aria-selected': selectedNow ? 'true' : 'false',
                                  className: 'acp-pick-agent',
                                  'data-selected': selectedNow ? '1' : undefined,
                                  onClick: () => {
                                    setSelectedId(agent.id);
                                    setError(null);
                                  },
                                },
                                h('span', { className: 'acp-pick-agent-dot', 'data-tone': status.tone }),
                                h(
                                  'span',
                                  { className: 'acp-pick-agent-text' },
                                  h(
                                    'span',
                                    { className: 'acp-pick-agent-line' },
                                    h('span', { className: 'acp-pick-agent-name' }, agent.name),
                                    data && data.defaultAgent === agent.id
                                      ? h('span', { className: 'acp-pick-chip' }, t('pickerDefault'))
                                      : null,
                                  ),
                                  h(
                                    'span',
                                    { className: 'acp-pick-agent-meta' },
                                    `${status.text} · ${testLine(agent)}`,
                                  ),
                                ),
                                h(
                                  'span',
                                  { className: 'acp-pick-radio', 'data-on': selectedNow ? '1' : undefined },
                                  selectedNow ? h('span', { className: 'acp-pick-radio-dot' }) : null,
                                ),
                              );
                            }),
                          ),
                          selected !== null
                            ? h(
                                'div',
                                { className: 'acp-pick-task' },
                                h('textarea', {
                                  ref: textareaRef,
                                  className: 'acp-pick-textarea',
                                  rows: 4,
                                  value: task,
                                  placeholder: t('pickerPlaceholder', { name: selected.name }),
                                  onChange: (event) => setTask(event.target.value),
                                  onKeyDown: (event) => {
                                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                                      event.preventDefault();
                                      void send();
                                    }
                                  },
                                }),
                                h('div', { className: 'acp-pick-hint' }, t('pickerHint')),
                                h(
                                  'div',
                                  { className: 'acp-pick-actions' },
                                  h('button', { type: 'button', className: 'acp-pick-btn', onClick: close }, t('pickerCancel')),
                                  h(
                                    'button',
                                    {
                                      type: 'button',
                                      className: 'acp-pick-btn',
                                      'data-variant': 'primary',
                                      disabled: phase !== 'idle' || task.trim().length === 0,
                                      onClick: () => void send(),
                                    },
                                    phase === 'starting'
                                      ? t('pickerStarting', { name: selected.name })
                                      : t('pickerSend', { name: selected.name }),
                                  ),
                                ),
                              )
                            : null,
                        ),
              ),
            ),
            document.body,
          )
        : null;

      return h(
        React.Fragment,
        null,
        h('style', null, PICKER_CSS),
        h(
          'button',
          {
            type: 'button',
            className: 'acp-pick-btn-composer',
            'data-open': open ? '1' : undefined,
            'aria-haspopup': 'dialog',
            'aria-expanded': open ? 'true' : 'false',
            'aria-label': title,
            title,
            onClick: toggleOpen,
          },
          h(AgentGlyph, { size: 16 }),
          enabledAgents.length > 0 ? h('span', { className: 'acp-pick-presence' }) : null,
        ),
        dialog,
      );
    }

    /* Read-only ACP session status.
     *
     * Route/model picking belongs to the composer seat; this panel only reports
     * what the agent itself told us. Anything the agent did not report is listed
     * inside a collapsed section instead of being rendered as an empty field. */
    const STATUS_KEYS = [
      'agentInfo',
      'protocolVersion',
      'capabilities',
      'authMethods',
      'acpSessionId',
      'usage',
      'cost',
      'mode',
      'plan',
      'commands',
      'tools',
      'compaction',
      'sessionInfo',
      'config',
    ];

    function acpStatusPresent(acp, key) {
      if (acp === null || acp === undefined) return false;
      switch (key) {
        case 'agentInfo':
          return typeof acp.agent?.name === 'string' && acp.agent.name.length > 0;
        case 'protocolVersion':
          return acp.protocolVersion !== null && acp.protocolVersion !== undefined;
        case 'capabilities':
          return acp.capabilities !== null && acp.capabilities !== undefined;
        case 'authMethods':
          return Array.isArray(acp.authMethods) && acp.authMethods.length > 0;
        case 'acpSessionId':
          return typeof acp.acpSessionId === 'string' && acp.acpSessionId.length > 0;
        case 'usage':
          return acp.usage !== null && acp.usage !== undefined;
        case 'cost':
          return acp.cost !== null && acp.cost !== undefined;
        case 'mode':
          return acp.mode !== null && acp.mode !== undefined;
        case 'plan':
          return Array.isArray(acp.plan) && acp.plan.length > 0;
        case 'commands':
          return Array.isArray(acp.commands) && acp.commands.length > 0;
        case 'tools':
          return Array.isArray(acp.tools) && acp.tools.length > 0;
        case 'compaction':
          return acp.compaction !== null && acp.compaction !== undefined;
        case 'sessionInfo':
          return acp.sessionInfo !== null && acp.sessionInfo !== undefined;
        case 'config':
          return Array.isArray(acp.config) && acp.config.length > 0;
        default:
          return false;
      }
    }

    function AcpStatusPanel(props) {
      const t = typeof props.t === 'function' ? props.t : fallbackTranslate;
      const sessionId = props.sessionId;
      const [open, setOpen] = useState(false);
      const [payload, setPayload] = useState(props.session ?? null);
      const [error, setError] = useState(null);

      useEffect(() => {
        if (props.session !== undefined) setPayload(props.session);
      }, [props.session]);

      useEffect(() => {
        if (!open || sessionId === undefined || sessionId === null) return undefined;
        let alive = true;
        let inFlight = false;
        const load = async () => {
          if (inFlight) return;
          inFlight = true;
          try {
            const response = await fetch(`${API}/session?sessionId=${encodeURIComponent(String(sessionId))}`, {
              credentials: 'same-origin',
              headers: { accept: 'application/json' },
            });
            const data = await response.json().catch(() => null);
            if (!alive) return;
            if (response.ok && data !== null && data.ok !== false) {
              setPayload(data);
              setError(null);
            } else {
              setError(t('statusError'));
            }
          } catch (loadError) {
            if (alive) setError(loadError && loadError.message ? loadError.message : String(loadError));
          } finally {
            inFlight = false;
          }
        };
        void load();
        const timer = setInterval(load, 2500);
        return () => {
          alive = false;
          clearInterval(timer);
        };
      }, [open, sessionId]);

      const acp = payload !== null && typeof payload?.acp === 'object' && payload.acp !== null ? payload.acp : null;
      const agentName = acp?.agent?.name ?? t('cascadeAgent');
      const pending = acp?.pending === true;
      const percent = acp?.usage !== null && acp?.usage !== undefined && acp.usage.size
        ? Math.min(100, Math.max(0, Math.round((acp.usage.used / acp.usage.size) * 100)))
        : null;
      const missing = pending ? [] : STATUS_KEYS.filter((key) => !acpStatusPresent(acp, key));
      const labels = {
        agentInfo: t('statusAgent'),
        protocolVersion: t('statusProtocol'),
        capabilities: t('statusCapabilities'),
        authMethods: t('statusAuth'),
        acpSessionId: t('statusSession'),
        usage: t('statusUsage'),
        cost: t('statusCost'),
        mode: t('statusMode'),
        plan: t('statusPlan'),
        commands: t('statusCommands'),
        tools: t('statusTools'),
        compaction: t('statusCompaction'),
        sessionInfo: t('statusSessionInfo'),
        config: t('statusConfig'),
      };

      const row = (label, value) => h(
        'div',
        { className: 'acp-status-row' },
        h('span', { className: 'acp-status-label' }, label),
        h('span', { className: 'acp-status-value' }, value),
      );

      const section = (key, title, children) => h(
        'div',
        { className: 'acp-status-section', key },
        h('div', { className: 'acp-status-title' }, title),
        children,
      );

      const body = (() => {
        if (acp === null) return h('div', { className: 'acp-pick-loading' }, t('statusWaiting'));
        if (acp.pending === true) {
          return h(
            'div',
            { className: 'acp-status-pending' },
            h('div', { className: 'acp-status-pending-title' }, t('statusPendingTitle')),
            h('div', { className: 'acp-status-pending-body' }, t('statusPendingBody')),
          );
        }
        const parts = [];
        parts.push(section(
          'identity',
          t('statusSectionSession'),
          [
            row(t('statusAgent'), acp.agent?.version ? `${acp.agent.name} · v${acp.agent.version}` : agentName),
            acp.protocolVersion !== null && acp.protocolVersion !== undefined
              ? row(t('statusProtocol'), `ACP v${acp.protocolVersion}`)
              : null,
            acp.acpSessionId
              ? row(t('statusSession'), `${String(acp.acpSessionId).slice(0, 8)}…`)
              : null,
            acp.cwd ? row(t('statusCwd'), acp.cwd) : null,
            row(t('statusLink'), acp.connected ? (acp.busy ? t('statusBusy') : t('statusIdle')) : t('statusClosed')),
            acp.resumed
              ? row(t('statusResume'), acp.resumeMethod ?? t('statusResumeYes'))
              : null,
          ],
        ));
        if (acp.usage) {
          parts.push(section(
            'usage',
            t('statusUsage'),
            [
              h(
                'div',
                { className: 'acp-status-bar', key: 'bar' },
                h('span', { style: { width: `${percent ?? 0}%` } }),
              ),
              h(
                'div',
                { className: 'acp-status-meta', key: 'meta' },
                `${acp.usage.used.toLocaleString()}${acp.usage.size ? ` / ${acp.usage.size.toLocaleString()}` : ''} tokens${percent === null ? '' : ` · ${percent}%`}`,
              ),
              acp.cost
                ? h(
                    'div',
                    { className: 'acp-status-meta', key: 'cost' },
                    t('statusCostValue', { amount: acp.cost.amount, currency: acp.cost.currency || '' }),
                  )
                : null,
            ],
          ));
        }
        if (acp.mode) {
          parts.push(section(
            'mode',
            t('statusMode'),
            [
              row(t('statusModeCurrent'), acp.mode.currentName || acp.mode.currentId || '—'),
              Array.isArray(acp.mode.available) && acp.mode.available.length > 1
                ? row(t('statusModeAll'), acp.mode.available.map((mode) => mode.name).join(' · '))
                : null,
            ],
          ));
        }
        if (Array.isArray(acp.plan) && acp.plan.length > 0) {
          const done = acp.plan.filter((entry) => entry.status === 'completed').length;
          parts.push(section(
            'plan',
            `${t('statusPlan')} ${done}/${acp.plan.length}`,
            h(
              'div',
              { className: 'acp-status-list' },
              acp.plan.slice(0, 8).map((entry, index) => h(
                'div',
                { className: 'acp-status-item', key: `plan-${index}` },
                h('span', { className: 'acp-status-icon', 'data-state': entry.status }, entry.status === 'completed' ? '✓' : entry.status === 'in_progress' ? '▸' : '○'),
                h('span', { className: 'acp-status-item-text' }, entry.content),
              )),
            ),
          ));
        }
        if (Array.isArray(acp.commands) && acp.commands.length > 0) {
          parts.push(section(
            'commands',
            t('statusCommands'),
            h(
              'div',
              { className: 'acp-status-chips' },
              acp.commands.slice(0, 12).map((command) => h(
                'span',
                { className: 'acp-status-chip', key: command.name, title: command.description || command.hint || command.name },
                `/${command.name}`,
              )),
            ),
          ));
        }
        if (Array.isArray(acp.tools) && acp.tools.length > 0) {
          parts.push(section(
            'tools',
            t('statusTools'),
            h(
              'div',
              { className: 'acp-status-list' },
              acp.tools.slice(-3).reverse().map((tool) => h(
                'div',
                { className: 'acp-status-item', key: tool.id },
                h('span', { className: 'acp-status-icon', 'data-state': tool.status }, tool.status === 'completed' ? '✓' : tool.status === 'failed' ? '✗' : '▸'),
                h('span', { className: 'acp-status-item-text' }, tool.title),
              )),
            ),
          ));
        }
        if (acp.compaction) {
          parts.push(section(
            'compaction',
            t('statusCompaction'),
            [
              row(t('statusCompactionState'), acp.compaction.status),
              acp.compaction.error ? row(t('statusCompactionError'), acp.compaction.error) : null,
            ],
          ));
        }
        if (acp.sessionInfo) {
          parts.push(section(
            'sessionInfo',
            t('statusSessionInfo'),
            [
              acp.sessionInfo.title ? row(t('statusSessionTitle'), acp.sessionInfo.title) : null,
              acp.sessionInfo.updatedAt ? row(t('statusUpdatedAt'), acp.sessionInfo.updatedAt) : null,
            ],
          ));
        }
        if (Array.isArray(acp.config) && acp.config.length > 0) {
          parts.push(section(
            'config',
            t('statusConfig'),
            h(
              'div',
              { className: 'acp-status-list' },
              acp.config.slice(0, 8).map((option) => h(
                'div',
                { className: 'acp-status-item', key: option.id },
                h('span', { className: 'acp-status-item-text' }, `${option.name} = ${option.currentValue ?? '—'}`),
              )),
            ),
          ));
        }
        if (acp.capabilities) {
          const capabilities = acp.capabilities;
          const flags = [
            capabilities.resume ? t('statusCapResume') : null,
            capabilities.loadSession ? t('statusCapLoad') : null,
            capabilities.fork ? t('statusCapFork') : null,
            capabilities.close ? t('statusCapClose') : null,
            capabilities.image ? t('statusCapImage') : null,
            capabilities.mcpHttp || capabilities.mcpSse ? t('statusCapMcp') : null,
          ].filter((flag) => flag !== null);
          if (flags.length > 0) {
            parts.push(section(
              'capabilities',
              t('statusCapabilities'),
              h('div', { className: 'acp-status-chips' }, flags.map((flag) => h('span', { className: 'acp-status-chip', key: flag }, flag))),
            ));
          }
        }
        if (Array.isArray(acp.authMethods) && acp.authMethods.length > 0) {
          parts.push(section(
            'auth',
            t('statusAuth'),
            h(
              'div',
              { className: 'acp-status-list' },
              acp.authMethods.map((method) => h(
                'div',
                { className: 'acp-status-item', key: `${method.type}:${method.id}` },
                h('span', { className: 'acp-status-item-text' }, method.name || method.id || method.type),
              )),
            ),
          ));
        }
        if (missing.length > 0) {
          parts.push(h(
            'details',
            { className: 'acp-status-missing', key: 'missing' },
            h('summary', null, t('statusMissingTitle', { count: missing.length })),
            h(
              'div',
              { className: 'acp-status-missing-list' },
              missing.map((key) => h(
                'div',
                { className: 'acp-status-row', key },
                h('span', { className: 'acp-status-label' }, labels[key]),
                h('span', { className: 'acp-status-value acp-status-unreported' }, t('statusUnreported')),
              )),
            ),
          ));
        }
        return parts;
      })();

      return h(
        React.Fragment,
        null,
        h('style', null, STATUS_STYLE),
        h(
          'button',
          {
            type: 'button',
            className: 'acp-cas-trigger',
            'data-open': open ? '1' : undefined,
            'data-active': '1',
            'aria-haspopup': 'dialog',
            'aria-expanded': open ? 'true' : 'false',
            title: agentName,
            onClick: () => setOpen((current) => !current),
          },
          h(AgentGlyph, { size: 14 }),
          h('span', { className: 'acp-cas-trigger-label' }, agentName),
          h('span', {
            className: 'acp-pick-presence',
            'data-state': pending ? 'idle' : acp?.connected === false ? 'off' : 'on',
          }),
          h('span', { className: 'acp-cas-trigger-caret' }, '▾'),
        ),
        open
          ? reactDom.createPortal(
              h(
                'div',
                {
                  className: 'acp-pick-backdrop',
                  onMouseDown: (event) => {
                    if (event.target === event.currentTarget) setOpen(false);
                  },
                },
                h(
                  'div',
                  { className: 'acp-pick-dialog acp-status-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('statusTitle') },
                  h(
                    'div',
                    { className: 'acp-pick-head' },
                    h(
                      'div',
                      { className: 'acp-pick-heading' },
                      h('span', { className: 'acp-pick-title' }, t('statusTitle')),
                      h('span', { className: 'acp-pick-sub' }, acp?.agent?.version ? `${agentName} · v${acp.agent.version}` : agentName),
                    ),
                    h('button', { type: 'button', className: 'acp-pick-close', 'aria-label': t('pickerClose'), onClick: () => setOpen(false) }, '×'),
                  ),
                  error !== null ? h('div', { className: 'acp-pick-error', role: 'alert' }, error) : null,
                  h('div', { className: 'acp-status-body' }, body),
                ),
              ),
              document.body,
            )
          : null,
      );
    }

    function AcpSessionHeader(props) {
      const t = typeof props.t === 'function' ? props.t : fallbackTranslate;
      const sessionId = props.sessionId;
      const [session, setSession] = useState(null);
      const [routeKey, setRouteKey] = useState('');
      useEffect(() => {
        if (sessionId === undefined || sessionId === null) {
          setSession(null);
          return undefined;
        }
        let alive = true;
        let timer = null;
        const check = async () => {
          try {
            const response = await fetch(
              `${API}/session?sessionId=${encodeURIComponent(String(sessionId))}`,
              { credentials: 'same-origin', headers: { accept: 'application/json' } },
            );
            const payload = await response.json().catch(() => null);
            const isAcp =
              response.ok &&
              payload !== null &&
              payload.ok !== false &&
              typeof payload.provider === 'string' &&
              payload.provider.startsWith('acp-');
            if (alive) {
              setSession(isAcp ? payload : null);
              setRouteKey(isAcp ? `${payload.provider}:${payload.model ?? ''}` : '');
            }
          } catch {
            if (alive) {
              setSession(null);
              setRouteKey('');
            }
          }
          if (alive) timer = setTimeout(check, 5000);
        };
        void check();
        return () => {
          alive = false;
          if (timer !== null) clearTimeout(timer);
        };
      }, [sessionId]);
      if (session === null && props.testActive !== true) return null;
      return h(AcpStatusPanel, { ...props, t, session, key: routeKey });
    }

    function AcpPanel(props) {
      const t = typeof props.t === 'function' ? props.t : fallbackTranslate;
      const [state, setState] = useState(null);
      const [loading, setLoading] = useState(true);
      const [busy, setBusy] = useState('');
      const [notice, setNotice] = useState(null);
      const [editing, setEditing] = useState(null);
      const [manual, setManual] = useState(null);
      const [query, setQuery] = useState('');
      const [showAll, setShowAll] = useState(false);
      const autoRegistry = useRef(false);

      const notify = useCallback((tone, text) => {
        setNotice({ tone, text });
      }, []);

      const apply = useCallback((payload) => {
        if (payload === null || typeof payload !== 'object') return;
        const next = payload.state && payload.state.config ? payload.state : payload;
        if (next && next.config) setState(next);
      }, []);

      const request = useCallback(async (path, body) => {
        const response = await fetch(`${API}${path}`, {
          method: body === undefined ? 'GET' : 'POST',
          credentials: 'same-origin',
          headers:
            body === undefined
              ? { accept: 'application/json' }
              : { 'content-type': 'application/json', accept: 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        let data = null;
        try {
          data = await response.json();
        } catch {
          data = null;
        }
        if (!response.ok || data === null || data.ok === false) {
          const message = data && data.error ? String(data.error) : `HTTP ${response.status}`;
          throw new Error(message);
        }
        return data;
      }, []);

      const load = useCallback(async () => {
        try {
          const data = await request('/state');
          apply(data);
          setLoading(false);
          return data;
        } catch (error) {
          setLoading(false);
          notify('error', t('errorLoad', { error: error.message }));
          return null;
        }
      }, [apply, notify, request, t]);

      useEffect(() => {
        void load();
      }, [load]);

      useEffect(() => {
        if (notice === null) return undefined;
        const timer = setTimeout(() => setNotice(null), 8_000);
        return () => clearTimeout(timer);
      }, [notice]);

      useEffect(() => {
        const loadingRegistry = state && state.registryStatus && state.registryStatus.loading;
        if (!loadingRegistry) return undefined;
        const timer = setInterval(() => {
          void load();
        }, 2_500);
        return () => clearInterval(timer);
      }, [state, load]);

      useEffect(() => {
        if (state === null) return;
        if (autoRegistry.current) return;
        if (state.registry === null && state.registryStatus && !state.registryStatus.loading) {
          autoRegistry.current = true;
          void refreshRegistry();
        }
      }, [state]);

      const agents = state ? state.config.agents : [];
      const candidates = state && Array.isArray(state.candidates) ? state.candidates : [];
      const registry = state && state.registry ? state.registry : null;
      const byRegistryId = useMemo(() => {
        const map = new Map();
        for (const candidate of candidates) {
          if (candidate.registryId) map.set(candidate.registryId, candidate);
        }
        return map;
      }, [candidates]);

      const isAdded = useCallback(
        (entry, candidate) => {
          return agents.some((agent) => {
            if (candidate && agent.command.toLowerCase() === candidate.command.toLowerCase()) return true;
            return entry !== null && agent.registryId !== null && agent.registryId === entry.id;
          });
        },
        [agents],
      );

      async function saveAgent(input, messageKey, params) {
        setBusy(`save:${input.id || input.name || 'new'}`);
        try {
          const data = await request('/agents/save', { agent: input });
          apply(data);
          notify('ok', t(messageKey, params || {}));
          return true;
        } catch (error) {
          notify('error', t('errorAction', { error: error.message }));
          return false;
        } finally {
          setBusy('');
        }
      }

      async function onToggle(agent) {
        setBusy(`toggle:${agent.id}`);
        try {
          const data = await request('/agents/save', { agent: agentInput(agent, { enabled: !agent.enabled }) });
          apply(data);
        } catch (error) {
          notify('error', t('errorAction', { error: error.message }));
        } finally {
          setBusy('');
        }
      }

      async function onTest(id) {
        setBusy(`test:${id}`);
        try {
          const data = await request('/agents/test', { id });
          apply(data);
          notify('ok', t('noticeTested'));
        } catch (error) {
          notify('error', t('errorAction', { error: error.message }));
        } finally {
          setBusy('');
        }
      }

      async function onSaveEdit() {
        if (editing === null) return;
        const draft = editing.draft;
        const input = {
          ...(editing.id === null ? {} : { id: editing.id }),
          name: draft.name,
          command: draft.command,
          args: splitArgs(draft.argsText),
          env: parseEnv(draft.envText),
          enabled: draft.enabled,
          permission: draft.permission,
          model: draft.model.trim().length === 0 ? null : draft.model.trim(),
          cwd: draft.cwd.trim().length === 0 ? null : draft.cwd.trim(),
          source: draft.source,
          registryId: draft.registryId,
        };
        const saved = await saveAgent(input, 'noticeSaved');
        if (saved) setEditing(null);
      }

      function onEdit(agent) {
        setEditing({
          id: agent.id,
          draft: {
            name: agent.name,
            command: agent.command,
            argsText: (agent.args || []).join(' '),
            envText: envText(agent.env),
            model: agent.model || '',
            cwd: agent.cwd || '',
            enabled: agent.enabled,
            permission: agent.permission,
            source: agent.source,
            registryId: agent.registryId,
          },
        });
      }

      async function onRemove(agent) {
        const question = t('removeConfirm', { name: agent.name });
        if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(question)) return;
        setBusy(`remove:${agent.id}`);
        try {
          const data = await request('/agents/remove', { id: agent.id });
          apply(data);
          if (editing && editing.id === agent.id) setEditing(null);
          notify('ok', t('noticeRemoved', { name: agent.name }));
        } catch (error) {
          notify('error', t('errorAction', { error: error.message }));
        } finally {
          setBusy('');
        }
      }

      async function onDefault(id) {
        setBusy(`default:${id}`);
        try {
          const data = await request('/agents/default', { id });
          apply(data);
        } catch (error) {
          notify('error', t('errorAction', { error: error.message }));
        } finally {
          setBusy('');
        }
      }

      async function onModel(agent, model) {
        setBusy(`model:${agent.id}`);
        try {
          const data = await request('/agents/save', {
            agent: agentInput(agent, { model: model.length === 0 ? null : model }),
          });
          apply(data);
        } catch (error) {
          notify('error', t('errorAction', { error: error.message }));
        } finally {
          setBusy('');
        }
      }

      async function addCandidate(candidate) {
        const draft = {
          name: candidate.name,
          command: candidate.command,
          args: candidate.args || [],
          env: candidate.env || {},
          enabled: true,
          permission: 'allow',
          model: null,
          cwd: null,
          source: candidate.source,
          registryId: candidate.registryId,
        };
        setEditing(null);
        await saveAgent(draft, 'noticeAdded', { name: candidate.name });
      }

      async function addRegistry(entry, candidate) {
        if (candidate) {
          await addCandidate(candidate);
          return;
        }
        if (!entry.command) return;
        const draft = {
          name: entry.name,
          command: entry.command,
          args: entry.args || [],
          env: entry.env || {},
          enabled: true,
          permission: 'allow',
          model: null,
          cwd: null,
          source: 'registry',
          registryId: entry.id,
        };
        await saveAgent(draft, 'noticeAdded', { name: entry.name });
      }

      async function refreshRegistry() {
        setBusy('registry');
        try {
          const data = await request('/registry/refresh');
          apply(data);
          notify('ok', t('noticeRegistry'));
        } catch (error) {
          notify('error', t('errorAction', { error: error.message }));
        } finally {
          setBusy('');
        }
      }

      async function detectAgain() {
        setBusy('detect');
        try {
          const data = await request('/detect');
          apply(data);
          notify('ok', t('noticeDetected'));
        } catch (error) {
          notify('error', t('errorAction', { error: error.message }));
        } finally {
          setBusy('');
        }
      }

      async function saveManual() {
        if (manual === null) return;
        const input = {
          name: manual.name,
          command: manual.command,
          args: splitArgs(manual.argsText),
          env: parseEnv(manual.envText),
          enabled: true,
          permission: 'allow',
          model: manual.model.trim().length === 0 ? null : manual.model.trim(),
          cwd: manual.cwd.trim().length === 0 ? null : manual.cwd.trim(),
          source: 'manual',
          registryId: null,
        };
        const saved = await saveAgent(input, 'noticeSaved');
        if (saved) setManual(null);
      }

      const filteredRegistry = useMemo(() => {
        if (registry === null) return [];
        const needle = query.trim().toLowerCase();
        if (needle.length === 0) return registry.agents;
        return registry.agents.filter((entry) =>
          `${entry.name} ${entry.id} ${entry.description} ${entry.package || ''}`.toLowerCase().includes(needle),
        );
      }, [registry, query]);

      const visibleRegistry = showAll ? filteredRegistry : filteredRegistry.slice(0, 12);
      const localCandidates = candidates.filter((candidate) => candidate.available && !candidate.added);
      const registryStatus = state ? state.registryStatus : null;

      return h(
        'div',
        { className: 'acp-root' },
        h('style', null, CSS),
        h(
          'div',
          { className: 'acp-head' },
          h('h2', { className: 'acp-title' }, t('title')),
          h('p', { className: 'acp-sub' }, t('intro')),
          h(
            'div',
            { className: 'acp-toolbar' },
            h('button', { type: 'button', className: 'acp-btn', disabled: busy === 'detect', onClick: detectAgain }, busy === 'detect' ? t('testing') : t('detect')),
            h('button', { type: 'button', className: 'acp-btn', disabled: busy === 'registry', onClick: refreshRegistry }, busy === 'registry' ? t('updating') : t('refreshRegistry')),
            h('button', { type: 'button', className: 'acp-btn', onClick: () => void load() }, t('refresh')),
            state
              ? h(
                  'span',
                  { className: 'acp-toolbar-info' },
                  state.at ? t('updated', { time: formatTime(state.at) }) : '',
                  state.runtime ? ` · ${t('runtimeInfo', { providers: state.runtime.providers, active: state.runtime.activeRuns })}` : '',
                )
              : null,
          ),
        ),
        h(Notice, { notice, onClose: () => setNotice(null) }),
        loading ? h('div', { className: 'acp-loading' }, t('loadingPage')) : null,
        h(
          'section',
          { className: 'acp-section' },
          h(
            'div',
            { className: 'acp-section-head' },
            h('span', { className: 'acp-section-title' }, t('sectionConnected')),
            h('span', { className: 'acp-count' }, t('count', { count: agents.length })),
            h('span', { className: 'acp-section-note' }, t('defaultHelp')),
          ),
          agents.length === 0
            ? h('div', { className: 'acp-empty' }, t('emptyConnected'))
            : agents.map((agent) =>
                h(AgentCard, {
                  key: agent.id,
                  t,
                  agent,
                  isDefault: state && state.config.defaultAgent === agent.id,
                  busy,
                  editing: editing !== null && editing.id === agent.id,
                  draft: editing !== null && editing.id === agent.id ? editing.draft : null,
                  setDraft: (patch) => {
                    setEditing((current) =>
                      current === null || current.id !== agent.id ? current : { ...current, draft: { ...current.draft, ...patch } },
                    );
                  },
                  models: [],
                  onToggle,
                  onTest,
                  onEdit,
                  onCancelEdit: () => setEditing(null),
                  onSaveEdit,
                  onRemove,
                  onDefault,
                  onModel,
                }),
              ),
        ),
        h(
          'section',
          { className: 'acp-section' },
          h(
            'div',
            { className: 'acp-section-head' },
            h('span', { className: 'acp-section-title' }, t('sectionLocal')),
            h('span', { className: 'acp-count' }, t('count', { count: localCandidates.length })),
          ),
          localCandidates.length === 0
            ? h('div', { className: 'acp-empty' }, t('emptyLocal'))
            : h(
                'div',
                { className: 'acp-candidate-list' },
                localCandidates.map((candidate) =>
                  h(
                    'div',
                    { key: candidate.key, className: 'acp-candidate' },
                    h(
                      'div',
                      { className: 'acp-candidate-main' },
                      h('span', { className: 'acp-name' }, candidate.name),
                      h('code', { className: 'acp-id acp-mono' }, candidate.executable || candidate.command),
                    ),
                    h(
                      'button',
                      { type: 'button', className: 'acp-btn', disabled: busy === `save:${candidate.name}`, onClick: () => void addCandidate(candidate) },
                      t('add'),
                    ),
                  ),
                ),
              ),
        ),
        h(
          'section',
          { className: 'acp-section' },
          h(
            'div',
            { className: 'acp-section-head' },
            h('span', { className: 'acp-section-title' }, t('sectionRegistry')),
            registry ? h('span', { className: 'acp-count' }, t('registryVersion', { version: registry.version, count: registry.agents.length })) : null,
            h(
              'a',
              { className: 'acp-link acp-section-link', href: 'https://agentclientprotocol.com/get-started/registry', target: '_blank', rel: 'noreferrer noopener' },
              t('registrySite'),
            ),
          ),
          registryStatus && registryStatus.loading ? h('div', { className: 'acp-empty' }, t('registryLoading')) : null,
          registryStatus && registryStatus.error
            ? h('div', { className: 'acp-empty acp-empty-error' }, t('registryError', { error: registryStatus.error }))
            : null,
          registryStatus && registryStatus.stale && !registryStatus.loading
            ? h('div', { className: 'acp-empty acp-empty-warn' }, t('registryStale'))
            : null,
          registry !== null
            ? h('input', {
                className: 'acp-input acp-search',
                value: query,
                placeholder: t('placeholderSearch'),
                'aria-label': t('registrySearchPlaceholder'),
                onChange: (event) => {
                  setQuery(event.target.value);
                  setShowAll(false);
                },
              })
            : null,
          registry !== null && filteredRegistry.length === 0 ? h('div', { className: 'acp-empty' }, t('emptySearch')) : null,
          registry !== null
            ? h(
                'div',
                { className: 'acp-registry-list' },
                visibleRegistry.map((entry) => {
                  const candidate = byRegistryId.get(entry.id) || null;
                  return h(RegistryRow, {
                    key: entry.id,
                    t,
                    entry,
                    candidate,
                    added: isAdded(entry, candidate),
                    busy: busy === `save:${entry.name}`,
                    onAdd: addRegistry,
                  });
                }),
              )
            : null,
          registry !== null && filteredRegistry.length > 12
            ? h(
                'button',
                { type: 'button', className: 'acp-link acp-more', onClick: () => setShowAll((value) => !value) },
                showAll ? t('showLess') : t('showAll', { count: filteredRegistry.length }),
              )
            : null,
        ),
        h(
          'section',
          { className: 'acp-section' },
          h(
            'div',
            { className: 'acp-section-head' },
            h('span', { className: 'acp-section-title' }, t('sectionManual')),
            manual === null
              ? h(
                  'button',
                  { type: 'button', className: 'acp-link', onClick: () => setManual({ name: '', command: '', argsText: '', envText: '', model: '', cwd: '' }) },
                  t('addManual'),
                )
              : null,
          ),
          manual === null
            ? null
            : h(
                'div',
                { className: 'acp-card' },
                h(AgentEditor, {
                  t,
                  draft: { ...manual, enabled: true, permission: 'allow' },
                  setDraft: (patch) => setManual((current) => (current === null ? current : { ...current, ...patch })),
                  models: [],
                  busy: busy === `save:${manual.name || 'new'}`,
                  onSave: () => void saveManual(),
                  onCancel: () => setManual(null),
                }),
              ),
        ),
        h(
          'footer',
          { className: 'acp-foot' },
          h('div', { className: 'acp-foot-block' }, h('strong', null, t('securityTitle')), h('p', null, t('securityBody'))),
          state && state.dataDir
            ? h('div', { className: 'acp-foot-block' }, h('strong', null, t('dataTitle')), h('p', null, t('dataBody', { dir: state.dataDir })))
            : null,
        ),
      );
    }

    /* ------------------------------------------------------------------ */
    /* Styles                                                              */
    /* ------------------------------------------------------------------ */

    const CSS = `
.acp-root{display:flex;flex-direction:column;gap:16px;min-width:0;padding:2px 0 24px;color:var(--dsw-alias-label-primary,#1f2329);font-size:13px;line-height:1.5}
.acp-head{display:flex;flex-direction:column;gap:6px;min-width:0}
.acp-title{margin:0;font-size:16px;font-weight:600;line-height:1.3}
.acp-sub{margin:0;color:var(--dsw-alias-label-secondary,#6b7280);font-size:12.5px;max-width:72ch}
.acp-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:4px}
.acp-toolbar-info{margin-left:auto;color:var(--dsw-alias-label-secondary,#6b7280);font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:42ch}
.acp-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;box-sizing:border-box;height:30px;padding:0 11px;border:1px solid var(--dsw-alias-border-l1,#d9dde3);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2329);font:inherit;font-size:12.5px;line-height:1;white-space:nowrap;cursor:pointer;transition:background-color .12s ease,border-color .12s ease}
.acp-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2,#f3f4f6)}
.acp-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#3b82f6);outline-offset:2px}
.acp-btn:disabled{opacity:.55;cursor:default}
.acp-btn[data-variant="primary"]{background:var(--dsw-alias-brand-primary,#3b82f6);border-color:transparent;color:#fff}
.acp-btn[data-variant="primary"]:hover:not(:disabled){filter:brightness(1.05)}
.acp-btn[data-variant="danger"]{color:var(--dsw-alias-state-error-primary,#d92d20)}
.acp-link{border:0;background:none;padding:0;color:var(--dsw-alias-brand-primary,#3b82f6);font:inherit;font-size:12px;cursor:pointer;text-decoration:none}
.acp-link:hover{text-decoration:underline}
.acp-section{display:flex;flex-direction:column;gap:8px;min-width:0}
.acp-section-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;padding:2px 2px 0}
.acp-section-title{font-size:11.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-secondary,#6b7280)}
.acp-count{font-size:11.5px;color:var(--dsw-alias-label-secondary,#6b7280)}
.acp-section-note{font-size:11.5px;color:var(--dsw-alias-label-secondary,#6b7280);opacity:.85}
.acp-section-link{margin-left:auto}
.acp-card{display:flex;flex-direction:column;gap:8px;min-width:0;padding:12px 14px;border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:10px;background:var(--dsw-alias-bg-layer-1,#fff)}
.acp-card[data-disabled]{opacity:.72}
.acp-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;min-width:0}
.acp-card-title{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-width:0}
.acp-card-head-actions{display:flex;align-items:center;gap:10px;flex:none}
.acp-name{font-size:13.5px;font-weight:600;line-height:1.3;overflow-wrap:anywhere}
.acp-id{font-size:11px;color:var(--dsw-alias-label-secondary,#6b7280);overflow-wrap:anywhere}
.acp-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace}
.acp-chip{display:inline-flex;align-items:center;height:19px;padding:0 7px;border-radius:999px;background:var(--dsw-alias-bg-layer-2,#f3f4f6);color:var(--dsw-alias-label-secondary,#6b7280);font-size:10.5px;font-weight:500;white-space:nowrap}
.acp-chip[data-tone="brand"]{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#3b82f6) 14%,transparent);color:var(--dsw-alias-brand-primary,#3b82f6)}
.acp-chip[data-tone="ok"]{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#12b76a) 14%,transparent);color:var(--dsw-alias-state-success-primary,#12b76a)}
.acp-cmd{display:block;box-sizing:border-box;width:100%;padding:5px 8px;border-radius:6px;background:var(--dsw-alias-bg-layer-2,#f3f4f6);color:var(--dsw-alias-label-secondary,#6b7280);font-size:11.5px;overflow-wrap:anywhere}
.acp-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-width:0;font-size:12px}
.acp-meta-sep{color:var(--dsw-alias-label-secondary,#6b7280);opacity:.6}
.acp-status{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.acp-dot{width:7px;height:7px;border-radius:50%;flex:none;background:var(--dsw-alias-state-idle-primary,#9aa4b2)}
.acp-dot[data-tone="ok"]{background:var(--dsw-alias-state-success-primary,#12b76a)}
.acp-dot[data-tone="warn"]{background:var(--dsw-alias-state-warn-primary,#f79009)}
.acp-dot[data-tone="bad"]{background:var(--dsw-alias-state-error-primary,#d92d20)}
.acp-test{color:var(--dsw-alias-label-secondary,#6b7280);overflow-wrap:anywhere;min-width:0}
.acp-test-bad{color:var(--dsw-alias-state-error-primary,#d92d20)}
.acp-subline{font-size:11px;color:var(--dsw-alias-label-secondary,#6b7280);opacity:.8}
.acp-inline-field{display:flex;flex-direction:column;gap:4px;max-width:340px}
.acp-card-actions{display:flex;flex-wrap:wrap;gap:8px;padding-top:2px}
.acp-switch{position:relative;flex:none;width:32px;height:18px;padding:0;border:1px solid var(--dsw-alias-border-l2,#cbd2dc);border-radius:999px;background:var(--dsw-alias-bg-layer-2,#f3f4f6);cursor:pointer;transition:background-color .12s ease,border-color .12s ease}
.acp-switch[data-on]{background:var(--dsw-alias-brand-primary,#3b82f6);border-color:transparent}
.acp-switch:disabled{opacity:.5;cursor:default}
.acp-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#3b82f6);outline-offset:2px}
.acp-switch-knob{position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .12s ease}
.acp-switch[data-on] .acp-switch-knob{transform:translateX(14px)}
.acp-form{display:flex;flex-direction:column;gap:8px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l1,#e5e7eb)}
.acp-form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}
.acp-form-row{display:flex;flex-wrap:wrap;align-items:center;gap:14px}
.acp-form-actions{display:flex;justify-content:flex-end;gap:8px;padding-top:2px}
.acp-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.acp-field-label{font-size:11.5px;color:var(--dsw-alias-label-secondary,#6b7280)}
.acp-field-hint{font-size:11px;color:var(--dsw-alias-label-secondary,#6b7280);opacity:.82;overflow-wrap:anywhere}
.acp-input,.acp-textarea,.acp-select{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l1,#d9dde3);border-radius:7px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#1f2329);font:inherit;font-size:12.5px;padding:6px 8px;outline:none}
.acp-textarea{resize:vertical;min-height:56px}
.acp-input:focus,.acp-textarea:focus,.acp-select:focus{border-color:var(--dsw-alias-brand-primary,#3b82f6);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-brand-primary,#3b82f6) 18%,transparent)}
.acp-choice{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-primary,#1f2329);cursor:pointer}
.acp-choice input{accent-color:var(--dsw-alias-brand-primary,#3b82f6)}
.acp-candidate-list{display:flex;flex-direction:column;gap:6px}
.acp-candidate{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0;padding:8px 12px;border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:9px;background:var(--dsw-alias-bg-layer-1,#fff)}
.acp-candidate-main{display:flex;flex-direction:column;gap:2px;min-width:0}
.acp-registry-list{display:flex;flex-direction:column;gap:6px}
.acp-registry-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;min-width:0;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:9px;background:var(--dsw-alias-bg-layer-1,#fff)}
.acp-registry-main{display:flex;flex-direction:column;gap:3px;min-width:0}
.acp-registry-title{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-width:0}
.acp-package{opacity:.8}
.acp-registry-desc{margin:0;font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280);overflow-wrap:anywhere}
.acp-registry-side{display:flex;align-items:center;gap:6px;flex:none;padding-top:2px}
.acp-registry-install{display:flex;align-items:center;gap:6px}
.acp-search{max-width:320px}
.acp-more{align-self:flex-start;font-size:12px}
.acp-empty{padding:12px 14px;border:1px dashed var(--dsw-alias-border-l2,#cbd2dc);border-radius:9px;color:var(--dsw-alias-label-secondary,#6b7280);font-size:12px;background:var(--dsw-alias-bg-layer-1,#fff)}
.acp-empty-error{border-color:var(--dsw-alias-state-error-primary,#d92d20);color:var(--dsw-alias-state-error-primary,#d92d20)}
.acp-empty-warn{border-color:var(--dsw-alias-state-warn-primary,#f79009)}
.acp-loading{font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280)}
.acp-notice{display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:8px;font-size:12px;background:var(--dsw-alias-bg-layer-2,#f3f4f6)}
.acp-notice[data-tone="error"]{border-color:var(--dsw-alias-state-error-primary,#d92d20);color:var(--dsw-alias-state-error-primary,#d92d20)}
.acp-notice[data-tone="ok"]{border-color:var(--dsw-alias-state-success-primary,#12b76a)}
.acp-notice-text{flex:1 1 auto;overflow-wrap:anywhere}
.acp-notice-close{border:0;background:none;color:inherit;font-size:16px;line-height:1;cursor:pointer;padding:0 2px;opacity:.7}
.acp-foot{display:flex;flex-direction:column;gap:10px;margin-top:6px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l1,#e5e7eb)}
.acp-foot-block{font-size:11.5px;color:var(--dsw-alias-label-secondary,#6b7280)}
.acp-foot-block strong{display:block;margin-bottom:2px;color:var(--dsw-alias-label-primary,#1f2329);font-size:11.5px}
.acp-foot-block p{margin:0;max-width:76ch}
@media (max-width:640px){.acp-toolbar-info{display:none}.acp-registry-row{flex-direction:column}.acp-registry-side{padding-top:0}}
`;

    const PICKER_CSS = `
.acp-pick-btn-composer{position:relative;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:var(--dsw-radius-sm,8px);background:transparent;color:var(--dsw-alias-label-secondary,#8b90a0);cursor:pointer;transition:background .15s ease,color .15s ease}
.acp-pick-btn-composer:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary,#e9ecf5)}
.acp-pick-btn-composer:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#3b82f6);outline-offset:-2px}
.acp-pick-btn-composer[data-open]{color:var(--dsw-alias-brand-primary,#3b82f6)}
.acp-pick-presence{position:absolute;top:4px;right:4px;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary,#12b76a);box-shadow:0 0 0 2px var(--dsw-alias-bg-base,#fff)}
.acp-pick-backdrop{position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(8,12,20,.46);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}
.acp-pick-dialog{display:flex;flex-direction:column;gap:12px;box-sizing:border-box;width:min(460px,100%);max-height:min(84vh,760px);overflow:auto;padding:16px;border:1px solid var(--dsw-alias-border-l2,#cbd2dc);border-radius:14px;background:var(--dsw-alias-bg-overlay,#1b1f27);color:var(--dsw-alias-label-primary,#e9ecf5);box-shadow:0 24px 64px rgba(0,0,0,.45);font-size:13px;line-height:1.5}
.acp-pick-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;min-width:0}
.acp-pick-heading{display:flex;flex-direction:column;gap:2px;min-width:0}
.acp-pick-title{font-size:15px;font-weight:600;line-height:1.3}
.acp-pick-sub{font-size:12px;color:var(--dsw-alias-label-secondary,#8b90a0)}
.acp-pick-close{flex:none;border:0;background:none;color:var(--dsw-alias-label-secondary,#8b90a0);font-size:20px;line-height:1;cursor:pointer;padding:0 2px}
.acp-pick-close:hover{color:var(--dsw-alias-label-primary,#e9ecf5)}
.acp-pick-list{display:flex;flex-direction:column;gap:6px;max-height:34vh;overflow:auto;padding:1px}
.acp-pick-agent{display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid var(--dsw-alias-border-l1,#d9dde3);border-radius:10px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;font:inherit;text-align:left;cursor:pointer}
.acp-pick-agent:hover{background:var(--dsw-alias-bg-layer-2,#f3f4f6)}
.acp-pick-agent:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#3b82f6);outline-offset:1px}
.acp-pick-agent[data-selected]{border-color:var(--dsw-alias-brand-primary,#3b82f6);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#3b82f6) 10%,var(--dsw-alias-bg-layer-1,#fff))}
.acp-pick-agent-dot{width:7px;height:7px;border-radius:50%;flex:none;background:var(--dsw-alias-state-idle-primary,#9aa4b2)}
.acp-pick-agent-dot[data-tone="ok"]{background:var(--dsw-alias-state-success-primary,#12b76a)}
.acp-pick-agent-dot[data-tone="warn"]{background:var(--dsw-alias-state-warn-primary,#f79009)}
.acp-pick-agent-text{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 auto}
.acp-pick-agent-line{display:flex;align-items:center;gap:6px;min-width:0}
.acp-pick-agent-name{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.acp-pick-agent-meta{font-size:11px;color:var(--dsw-alias-label-secondary,#8b90a0);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.acp-pick-chip{display:inline-flex;align-items:center;height:18px;padding:0 6px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-brand-primary,#3b82f6) 14%,transparent);color:var(--dsw-alias-brand-primary,#3b82f6);font-size:10px;font-weight:500;white-space:nowrap}
.acp-pick-radio{display:inline-flex;align-items:center;justify-content:center;flex:none;width:16px;height:16px;box-sizing:border-box;border:1.5px solid var(--dsw-alias-border-l2,#cbd2dc);border-radius:50%}
.acp-pick-radio[data-on]{border-color:var(--dsw-alias-brand-primary,#3b82f6)}
.acp-pick-radio-dot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-brand-primary,#3b82f6)}
.acp-pick-task{display:flex;flex-direction:column;gap:8px;padding-top:2px}
.acp-pick-textarea{box-sizing:border-box;width:100%;min-height:92px;max-height:240px;resize:vertical;border:1px solid var(--dsw-alias-border-l1,#d9dde3);border-radius:9px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#1f2329);font:inherit;font-size:13px;padding:9px 10px;outline:none}
.acp-pick-textarea:focus{border-color:var(--dsw-alias-brand-primary,#3b82f6);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-brand-primary,#3b82f6) 18%,transparent)}
.acp-pick-hint{font-size:11.5px;color:var(--dsw-alias-label-secondary,#8b90a0)}
.acp-pick-actions{display:flex;justify-content:flex-end;gap:8px}
.acp-pick-btn{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;height:32px;padding:0 13px;border:1px solid var(--dsw-alias-border-l1,#d9dde3);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2329);font:inherit;font-size:12.5px;line-height:1;white-space:nowrap;cursor:pointer}
.acp-pick-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2,#f3f4f6)}
.acp-pick-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#3b82f6);outline-offset:2px}
.acp-pick-btn:disabled{opacity:.55;cursor:default}
.acp-pick-btn[data-variant="primary"]{background:var(--dsw-alias-brand-primary,#3b82f6);border-color:transparent;color:#fff}
.acp-pick-error{padding:8px 10px;border:1px solid var(--dsw-alias-state-error-primary,#d92d20);border-radius:8px;color:var(--dsw-alias-state-error-primary,#d92d20);font-size:12px;overflow-wrap:anywhere}
.acp-pick-success{display:flex;align-items:flex-start;gap:8px;padding:12px;border:1px solid var(--dsw-alias-state-success-primary,#12b76a);border-radius:9px;color:var(--dsw-alias-state-success-primary,#12b76a);font-size:12.5px}
.acp-pick-success-mark{flex:none;font-weight:700}
.acp-pick-empty,.acp-pick-loading{padding:14px;border:1px dashed var(--dsw-alias-border-l2,#cbd2dc);border-radius:9px;color:var(--dsw-alias-label-secondary,#8b90a0);font-size:12px;text-align:center}
@media (max-width:640px){.acp-pick-backdrop{align-items:flex-end;padding:0}.acp-pick-dialog{width:100%;max-width:none;max-height:88vh;border-radius:16px 16px 0 0;padding:16px 16px 20px}.acp-pick-list{max-height:28vh}}
`;

    const CASCADE_CSS = `
.acp-cas-trigger{position:relative;display:inline-flex;align-items:center;gap:5px;box-sizing:border-box;height:28px;padding:0 9px;border:1px solid var(--dsw-alias-border-l1,#d9dde3);border-radius:999px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-secondary,#8b90a0);font:inherit;font-size:11px;line-height:1;white-space:nowrap;cursor:pointer;max-width:168px}
.acp-cas-trigger:hover{background:var(--dsw-alias-bg-layer-2,#f3f4f6);color:var(--dsw-alias-label-primary,#e9ecf5)}
.acp-cas-trigger:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#3b82f6);outline-offset:2px}
.acp-cas-trigger[data-active]{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary,#3b82f6) 45%,transparent);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#3b82f6) 9%,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-label-primary,#e9ecf5)}
.acp-cas-trigger-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.acp-cas-trigger-caret{flex:none;color:var(--dsw-alias-label-secondary,#8b90a0);font-size:8px;line-height:1}
.acp-cas-trigger .acp-pick-presence{position:static;flex:none;margin-left:1px;box-shadow:none}
.acp-pick-btn-composer[data-active]{color:var(--dsw-alias-brand-primary,#3b82f6)}
@media (max-width:560px){.acp-cas-trigger{padding:0 7px;max-width:124px}.acp-cas-trigger-label{max-width:70px}}
.acp-cas-crumbs{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:2px 2px 0;min-width:0}
.acp-cas-crumb{border:0;background:none;padding:2px 4px;border-radius:6px;color:var(--dsw-alias-label-secondary,#8b90a0);font:inherit;font-size:11.5px;cursor:pointer;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.acp-cas-crumb[data-active]{color:var(--dsw-alias-label-primary,#e9ecf5);background:var(--dsw-alias-bg-layer-2,#f3f4f6)}
.acp-cas-crumb:disabled{opacity:.45;cursor:default}
.acp-cas-sep{color:var(--dsw-alias-label-secondary,#8b90a0);opacity:.5;font-size:10px}
.acp-cas-list{display:flex;flex-direction:column;gap:6px;max-height:42vh;overflow:auto;padding:1px}
.acp-cas-list-sm{max-height:24vh}
.acp-cas-row{display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid var(--dsw-alias-border-l1,#d9dde3);border-radius:10px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;font:inherit;text-align:left;cursor:pointer}
.acp-cas-row:hover:not([data-disabled]){background:var(--dsw-alias-bg-layer-2,#f3f4f6)}
.acp-cas-row[data-selected]{border-color:var(--dsw-alias-brand-primary,#3b82f6);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#3b82f6) 10%,var(--dsw-alias-bg-layer-1,#fff))}
.acp-cas-row[data-disabled]{opacity:.45;cursor:default}
.acp-cas-main{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 auto}
.acp-cas-line{display:flex;align-items:center;gap:6px;min-width:0}
.acp-cas-meta{font-size:10.5px;color:var(--dsw-alias-label-secondary,#8b90a0);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.acp-cas-chevron{margin-left:auto;color:var(--dsw-alias-label-secondary,#8b90a0);font-size:16px;line-height:1;flex:none}
.acp-cas-summary{display:flex;flex-wrap:wrap;gap:4px;padding:9px 10px;border:1px solid var(--dsw-alias-border-l1,#d9dde3);border-radius:9px;background:var(--dsw-alias-bg-layer-2,#f3f4f6);font-size:11.5px;color:var(--dsw-alias-label-secondary,#8b90a0)}
.acp-cas-summary b{color:var(--dsw-alias-label-primary,#e9ecf5);font-weight:600}
.acp-cas-title{margin:4px 2px 0;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-secondary,#8b90a0)}
.acp-cas-hint{font-size:10.5px;line-height:1.5;color:var(--dsw-alias-label-secondary,#8b90a0);opacity:.85}
.acp-cas-radio{display:inline-flex;align-items:center;justify-content:center;flex:none;width:16px;height:16px;box-sizing:border-box;border:1.5px solid var(--dsw-alias-border-l2,#cbd2dc);border-radius:50%}
.acp-cas-radio[data-on]{border-color:var(--dsw-alias-brand-primary,#3b82f6)}
.acp-cas-actions{display:flex;justify-content:flex-end;gap:8px;padding-top:2px}
`;

    const STATUS_CSS = `
.acp-status-dialog{width:min(420px,100%);gap:8px}
.acp-status-body{display:flex;flex-direction:column;gap:2px;max-height:min(68vh,600px);overflow:auto;padding-right:2px}
.acp-status-section{display:flex;flex-direction:column;gap:4px;padding:9px 2px 10px;border-top:1px solid var(--dsw-alias-border-l1,#e4e7ec)}
.acp-status-section:first-child{border-top:0;padding-top:2px}
.acp-status-title{margin-bottom:2px;font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-secondary,#8b90a0)}
.acp-status-row{display:flex;align-items:baseline;justify-content:space-between;gap:12px;min-width:0;font-size:12px;line-height:1.55}
.acp-status-label{flex:none;color:var(--dsw-alias-label-secondary,#8b90a0)}
.acp-status-value{min-width:0;overflow-wrap:anywhere;text-align:right;color:var(--dsw-alias-label-primary,#e9ecf5)}
.acp-status-bar{height:6px;border-radius:999px;overflow:hidden;background:var(--dsw-alias-bg-layer-2,#f3f4f6)}
.acp-status-bar>span{display:block;height:100%;border-radius:999px;background:var(--dsw-alias-brand-primary,#3b82f6);transition:width .3s ease}
.acp-status-meta{font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary,#8b90a0)}
.acp-status-list{display:flex;flex-direction:column;gap:3px}
.acp-status-item{display:flex;align-items:flex-start;gap:6px;min-width:0;font-size:12px;line-height:1.5}
.acp-status-icon{flex:none;width:12px;text-align:center;color:var(--dsw-alias-label-secondary,#8b90a0)}
.acp-status-icon[data-state="completed"]{color:var(--dsw-alias-state-success-primary,#12b76a)}
.acp-status-icon[data-state="failed"]{color:var(--dsw-alias-state-error-primary,#d92d20)}
.acp-status-icon[data-state="in_progress"]{color:var(--dsw-alias-brand-primary,#3b82f6)}
.acp-status-item-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary,#e9ecf5)}
.acp-status-chips{display:flex;flex-wrap:wrap;gap:4px}
.acp-status-chip{display:inline-flex;align-items:center;max-width:100%;padding:1px 7px;border-radius:999px;background:var(--dsw-alias-bg-layer-2,#f3f4f6);color:var(--dsw-alias-label-secondary,#8b90a0);font-size:10.5px;line-height:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.acp-cas-trigger .acp-pick-presence[data-state="idle"]{background:var(--dsw-alias-state-idle-primary,#9aa4b2)}
.acp-cas-trigger .acp-pick-presence[data-state="off"]{background:var(--dsw-alias-state-error-primary,#d92d20)}
.acp-status-pending{display:flex;flex-direction:column;gap:4px;padding:14px 12px;border:1px dashed var(--dsw-alias-border-l2,#cbd2dc);border-radius:9px;color:var(--dsw-alias-label-secondary,#8b90a0);font-size:12px;line-height:1.6}
.acp-status-pending-title{font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary,#e9ecf5)}
.acp-status-missing{padding:8px 2px 2px;border-top:1px solid var(--dsw-alias-border-l1,#e4e7ec);font-size:11.5px;color:var(--dsw-alias-label-secondary,#8b90a0)}
.acp-status-missing>summary{cursor:pointer;user-select:none;padding:2px 0;color:var(--dsw-alias-label-secondary,#8b90a0)}
.acp-status-missing>summary:hover{color:var(--dsw-alias-label-primary,#e9ecf5)}
.acp-status-missing>summary:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#3b82f6);outline-offset:2px;border-radius:4px}
.acp-status-missing-list{display:flex;flex-direction:column;gap:3px;padding-top:4px}
.acp-status-unreported{font-style:italic;color:var(--dsw-alias-label-secondary,#8b90a0);opacity:.85}
`;

    const STATUS_STYLE = PICKER_CSS + CASCADE_CSS + STATUS_CSS;

    const SEAT_CSS = `
.acp-ms-root{position:relative;display:inline-flex;min-width:0;max-width:360px}
.acp-ms-trigger{display:flex;align-items:center;gap:6px;box-sizing:border-box;height:28px;max-width:360px;min-width:0;padding:0 5px 0 7px;border:0;border-radius:var(--dsw-radius-sm,8px);background:transparent;color:var(--dsw-alias-label-secondary,#a4a9b4);font:inherit;font-size:13px;font-weight:400;line-height:20px;cursor:pointer;outline:none}
.acp-ms-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}
.acp-ms-trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4c8dff))}
.acp-ms-trigger:disabled{opacity:.55;cursor:default}
.acp-ms-mode{flex:none;padding:1px 5px;border-radius:5px;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.14));color:var(--dsw-alias-label-caption,#858b96);font-size:10.5px;font-weight:600;letter-spacing:.02em;line-height:15px}
.acp-ms-mode[data-lane="acp"]{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4c8dff) 16%,transparent);color:var(--dsw-alias-brand-primary,#4c8dff)}
.acp-ms-text{display:var(--dsh-composer-model-text-display,flex);align-items:center;gap:6px;min-width:0}
.acp-ms-icon{display:var(--dsh-composer-model-icon-display,none);place-items:center;flex:none;color:var(--dsw-alias-label-caption,#858b96)}
.acp-ms-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.acp-ms-meta{flex:none;color:var(--dsw-alias-label-caption,#858b96);font-size:12px;line-height:20px}
.acp-ms-caret{flex:none;display:grid;place-items:center;width:12px;height:12px;color:var(--dsw-alias-label-caption,#858b96);transition:transform .14s ease}
.acp-ms-trigger[aria-expanded="true"] .acp-ms-caret{transform:rotate(180deg)}
.acp-ms-panel{position:fixed;z-index:1200;display:flex;flex-direction:column;box-sizing:border-box;padding:4px;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.2));border-radius:12px;background:var(--dsw-alias-bg-overlay,#232429);color:var(--dsw-alias-label-primary,#e8eaf0);box-shadow:var(--dsw-elevation-prominent,0 18px 48px rgba(0,0,0,.5));backdrop-filter:blur(18px);overflow:hidden;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2,rgba(127,127,127,.3));--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2,rgba(127,127,127,.5))}
.acp-ms-pane-head{display:flex;align-items:center;gap:4px;flex:none;height:32px;padding:0 2px 3px;margin-bottom:2px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.18))}
.acp-ms-back{display:grid;place-items:center;width:24px;height:24px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#a4a9b4);cursor:pointer}
.acp-ms-back:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary,#e8eaf0)}
.acp-ms-pane-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary,#a4a9b4);font-size:12px;font-weight:600}
.acp-ms-list{display:flex;flex:1 1 auto;flex-direction:column;min-height:0;overflow:auto;padding:0 1px}
.acp-ms-cell{display:flex;align-items:center;gap:8px;box-sizing:border-box;width:100%;height:34px;padding:0 8px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary,#e8eaf0);font:inherit;font-size:13px;line-height:20px;text-align:left;cursor:pointer;outline:none}
.acp-ms-cell:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}
.acp-ms-cell:focus-visible{box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2,rgba(127,127,127,.4))}
.acp-ms-cell-label{flex:none;white-space:nowrap}
.acp-ms-cell-value{flex:1;min-width:0;text-align:right;color:var(--dsw-alias-label-tertiary,#8a909b);font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.acp-ms-cell-chevron{display:grid;place-items:center;flex:none;width:12px;height:12px;color:var(--dsw-alias-label-caption,#858b96)}
.acp-ms-caption{padding:7px 8px 3px;color:var(--dsw-alias-label-caption,#858b96);font-size:11px;font-weight:600;letter-spacing:.05em;line-height:16px}
.acp-ms-option{display:flex;align-items:center;gap:8px;box-sizing:border-box;width:100%;min-height:34px;padding:5px 8px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary,#e8eaf0);font:inherit;font-size:13px;line-height:18px;text-align:left;cursor:pointer;outline:none}
.acp-ms-option:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}
.acp-ms-option:focus-visible{box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2,rgba(127,127,127,.4))}
.acp-ms-option[data-selected]{background:var(--dsw-alias-interactive-bg-selected,rgba(127,127,127,.18))}
.acp-ms-option:disabled{opacity:.5;cursor:default}
.acp-ms-option-main{display:flex;flex-direction:column;gap:1px;flex:1;min-width:0}
.acp-ms-option-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.acp-ms-option-sub{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-caption,#858b96);font-size:11px;line-height:15px}
.acp-ms-check{display:grid;place-items:center;flex:0 0 14px;width:14px;height:14px;color:var(--dsw-alias-label-primary,#e8eaf0)}
.acp-ms-dot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary,#3fbf7f)}
.acp-ms-dot[data-tone="warn"]{background:var(--dsw-alias-state-warn-primary,#e0a53c)}
.acp-ms-search{display:flex;align-items:center;box-sizing:border-box;height:29px;margin:1px 2px 4px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.16));border-radius:7px;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.1))}
.acp-ms-search input{width:100%;border:0;outline:none;background:transparent;color:var(--dsw-alias-label-primary,#e8eaf0);font:inherit;font-size:12px;line-height:18px}
.acp-ms-search input::placeholder{color:var(--dsw-alias-label-caption,#858b96)}
.acp-ms-empty{padding:10px 9px;color:var(--dsw-alias-label-caption,#858b96);font-size:12px;line-height:18px}
.acp-ms-status{flex:none;padding:5px 8px 3px;margin-top:2px;border-top:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.18));color:var(--dsw-alias-state-error-primary,#ef6b6b);font-size:11px;line-height:15px}
.acp-ms-status[data-busy]{color:var(--dsw-alias-label-caption,#858b96)}
@media (max-width:560px){.acp-ms-trigger{max-width:250px}}
`;

    const WORKSPACE_CSS = `
.acp-ws-overlay{position:fixed;inset:0;z-index:1300;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-0,#0b0f16);color:var(--dsw-alias-label-primary,#e8ecf4);font-family:inherit}
.acp-ws-shell{display:flex;flex-direction:column;flex:1 1 auto;width:100%;max-width:980px;min-height:0;margin:0 auto;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}
.acp-ws-head{display:flex;align-items:flex-start;gap:10px;padding:16px 20px 10px}
.acp-ws-head-main{display:flex;align-items:flex-start;gap:10px;min-width:0;flex:1 1 auto}
.acp-ws-back{flex:none;width:30px;height:30px;border:1px solid var(--dsw-alias-border-l1,#d9dde3);border-radius:9px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;font-size:16px;line-height:1;cursor:pointer}
.acp-ws-back:hover{background:var(--dsw-alias-bg-layer-2,#f3f4f6)}
.acp-ws-titles{min-width:0;flex:1 1 auto}
.acp-ws-title{margin:0;font-size:17px;font-weight:650;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.acp-ws-sub{margin:4px 0 0;font-size:11px;line-height:1.4;color:var(--dsw-alias-label-secondary,#8b90a0);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.acp-ws-close{flex:none;width:32px;height:32px;border:0;border-radius:9px;background:transparent;color:var(--dsw-alias-label-secondary,#8b90a0);font-size:21px;line-height:1;cursor:pointer}
.acp-ws-close:hover{background:var(--dsw-alias-bg-layer-2,#f3f4f6);color:var(--dsw-alias-label-primary,#1f2328)}
.acp-ws-controls{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:0 20px 12px;border-bottom:1px solid var(--dsw-alias-border-l1,#d9dde3)}
.acp-ws-menu{position:relative;display:inline-flex;min-width:0}
.acp-ws-chip{display:inline-flex;align-items:center;gap:6px;height:28px;max-width:240px;padding:0 9px;border:1px solid var(--dsw-alias-border-l1,#d9dde3);border-radius:999px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-secondary,#8b90a0);font:inherit;font-size:11px;line-height:1;white-space:nowrap;cursor:pointer;min-width:0}
.acp-ws-chip:hover{background:var(--dsw-alias-bg-layer-2,#f3f4f6);color:var(--dsw-alias-label-primary,#1f2328)}
.acp-ws-chip:disabled{opacity:.5;cursor:default}
.acp-ws-chip b{font-weight:600;color:var(--dsw-alias-label-primary,#1f2328);overflow:hidden;text-overflow:ellipsis}
.acp-ws-caret{font-size:8px;opacity:.65}
.acp-ws-pop{position:absolute;top:calc(100% + 6px);left:0;z-index:10;min-width:190px;max-width:310px;max-height:min(48vh,340px);overflow:auto;padding:5px;border:1px solid var(--dsw-alias-border-l1,#d9dde3);border-radius:11px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 16px 40px rgba(0,0,0,.22)}
.acp-ws-opt{display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;padding:8px 9px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary,#1f2328);font:inherit;font-size:12px;text-align:left;cursor:pointer}
.acp-ws-opt:hover{background:var(--dsw-alias-bg-layer-2,#f3f4f6)}
.acp-ws-opt[data-on]{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#3b82f6) 12%,var(--dsw-alias-bg-layer-1,#fff))}
.acp-ws-opt:disabled{opacity:.45;cursor:default}
.acp-ws-opt-main{display:flex;flex-direction:column;gap:1px;min-width:0}
.acp-ws-opt-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.acp-ws-opt-meta{font-size:10px;color:var(--dsw-alias-label-secondary,#8b90a0);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.acp-ws-body{flex:1 1 auto;min-height:0;overflow:auto;padding:18px 20px 10px;overscroll-behavior:contain}
.acp-ws-list{display:flex;flex-direction:column;gap:16px;max-width:820px;margin:0 auto}
.acp-ws-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-height:42vh;color:var(--dsw-alias-label-secondary,#8b90a0);text-align:center;font-size:12.5px;line-height:1.6;padding:20px}
.acp-ws-msg{display:flex;gap:10px;align-items:flex-start;min-width:0}
.acp-ws-msg[data-role=user]{justify-content:flex-end}
.acp-ws-bubble{max-width:min(78%,680px);padding:10px 13px;border-radius:14px;background:var(--dsw-alias-bg-layer-2,#f3f4f6);color:var(--dsw-alias-label-primary,#1f2328);font-size:13px;line-height:1.65;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere}
.acp-ws-msg[data-role=user] .acp-ws-bubble{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#3b82f6) 16%,var(--dsw-alias-bg-layer-1,#fff));border-bottom-right-radius:5px}
.acp-ws-msg[data-role=assistant] .acp-ws-bubble{background:transparent;padding:2px 0;max-width:100%;flex:1 1 auto;min-width:0}
.acp-ws-avatar{flex:none;width:26px;height:26px;display:grid;place-items:center;border-radius:8px;background:var(--dsw-alias-bg-layer-2,#f3f4f6);color:var(--dsw-alias-label-secondary,#8b90a0);margin-top:1px}
.acp-ws-text{font-size:13.5px;line-height:1.7;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere}
.acp-ws-cursor{display:inline-block;width:6px;height:14px;margin-left:2px;border-radius:2px;background:var(--dsw-alias-brand-primary,#3b82f6);vertical-align:-2px;animation:acp-ws-blink 1s steps(2,start) infinite}
@keyframes acp-ws-blink{to{visibility:hidden}}
.acp-ws-thinking{margin:8px 0 0;border:1px solid var(--dsw-alias-border-l1,#d9dde3);border-radius:9px;background:var(--dsw-alias-bg-layer-1,#fff);font-size:11.5px;color:var(--dsw-alias-label-secondary,#8b90a0)}
.acp-ws-thinking summary{padding:6px 9px;cursor:pointer;user-select:none}
.acp-ws-thinking div{padding:0 9px 8px;white-space:pre-wrap;line-height:1.55;word-break:break-word}
.acp-ws-tools{display:flex;flex-direction:column;gap:5px;margin-top:9px}
.acp-ws-tool{display:flex;align-items:center;gap:7px;padding:6px 9px;border:1px solid var(--dsw-alias-border-l1,#d9dde3);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);font-size:11px;color:var(--dsw-alias-label-secondary,#8b90a0);min-width:0}
.acp-ws-tool-mark{flex:none;width:15px;text-align:center;color:var(--dsw-alias-label-secondary,#8b90a0)}
.acp-ws-tool[data-status=completed] .acp-ws-tool-mark{color:#2fac6a}
.acp-ws-tool[data-status=failed] .acp-ws-tool-mark{color:#e05252}
.acp-ws-tool-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.acp-ws-composer{padding:10px 20px calc(14px + env(safe-area-inset-bottom));border-top:1px solid var(--dsw-alias-border-l1,#d9dde3);background:var(--dsw-alias-bg-layer-0,#0b0f16)}
.acp-ws-input-wrap{display:flex;align-items:flex-end;gap:8px;max-width:820px;margin:0 auto;padding:8px 8px 8px 12px;border:1px solid var(--dsw-alias-border-l1,#d9dde3);border-radius:16px;background:var(--dsw-alias-bg-layer-1,#fff)}
.acp-ws-input{flex:1 1 auto;min-height:24px;max-height:150px;resize:none;border:0;outline:none;background:transparent;color:var(--dsw-alias-label-primary,#1f2328);font:inherit;font-size:13.5px;line-height:1.55;padding:3px 0}
.acp-ws-input::placeholder{color:var(--dsw-alias-label-secondary,#8b90a0)}
.acp-ws-send{flex:none;width:34px;height:34px;border:0;border-radius:11px;background:var(--dsw-alias-brand-primary,#3b82f6);color:#fff;font-size:16px;line-height:1;cursor:pointer;display:grid;place-items:center}
.acp-ws-send:disabled{opacity:.35;cursor:default}
.acp-ws-send[data-stop]{background:var(--dsw-alias-bg-layer-2,#f3f4f6);color:var(--dsw-alias-label-primary,#1f2328);font-size:12px}
.acp-ws-hint{max-width:820px;margin:6px auto 0;font-size:10px;color:var(--dsw-alias-label-secondary,#8b90a0);text-align:center}
.acp-ws-error{max-width:820px;margin:0 auto 8px;padding:8px 10px;border:1px solid color-mix(in srgb,#e05252 45%,transparent);border-radius:9px;background:color-mix(in srgb,#e05252 10%,transparent);color:#d94b4b;font-size:11.5px;line-height:1.5;word-break:break-word}
.acp-ws-notice{max-width:820px;margin:0 auto 8px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1,#d9dde3);border-radius:9px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-secondary,#8b90a0);font-size:11.5px}
.acp-ws-setup{max-width:620px;margin:0 auto;display:flex;flex-direction:column;gap:16px;padding:8px 0 18px}
.acp-ws-label{font-size:10.5px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--dsw-alias-label-secondary,#8b90a0);margin:0 2px}
.acp-ws-agents{display:flex;flex-direction:column;gap:8px}
.acp-ws-agent{display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid var(--dsw-alias-border-l1,#d9dde3);border-radius:12px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;font:inherit;text-align:left;cursor:pointer}
.acp-ws-agent:hover{background:var(--dsw-alias-bg-layer-2,#f3f4f6)}
.acp-ws-agent[data-on]{border-color:var(--dsw-alias-brand-primary,#3b82f6);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#3b82f6) 9%,var(--dsw-alias-bg-layer-1,#fff))}
.acp-ws-agent-main{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 auto}
.acp-ws-agent-name{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.acp-ws-agent-meta{font-size:10.5px;color:var(--dsw-alias-label-secondary,#8b90a0);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.acp-ws-agent-radio{flex:none;width:16px;height:16px;border-radius:50%;border:1.5px solid var(--dsw-alias-border-l2,#cbd2dc);display:grid;place-items:center}
.acp-ws-agent[data-on] .acp-ws-agent-radio{border-color:var(--dsw-alias-brand-primary,#3b82f6)}
.acp-ws-agent[data-on] .acp-ws-agent-radio i{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-brand-primary,#3b82f6);display:block}
.acp-ws-setup-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.acp-ws-start{align-self:flex-start;height:38px;padding:0 18px;border:0;border-radius:11px;background:var(--dsw-alias-brand-primary,#3b82f6);color:#fff;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.acp-ws-start:disabled{opacity:.5;cursor:default}
.acp-ws-setup-cwd{font-size:10.5px;color:var(--dsw-alias-label-secondary,#8b90a0);line-height:1.5;word-break:break-all}
.acp-ws-launcher{display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;padding:8px 10px;border:0;border-radius:9px;background:transparent;color:inherit;font:inherit;font-size:12.5px;text-align:left;cursor:pointer;min-width:0}
.acp-ws-launcher:hover{background:var(--dsw-alias-bg-layer-2,#f3f4f6)}
.acp-ws-launcher-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.acp-ws-quick{display:inline-grid;place-items:center;flex:none;width:28px;height:28px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#8b90a0);cursor:pointer}
.acp-ws-quick:hover{background:var(--dsw-alias-bg-layer-2,#f3f4f6);color:var(--dsw-alias-label-primary,#1f2328)}
.acp-ws-quick:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#3b82f6);outline-offset:1px}
@media (max-width:600px){
  .acp-ws-head{padding:12px 13px 8px}
  .acp-ws-controls{padding:0 13px 9px;gap:6px;flex-wrap:wrap;overflow:visible}
  .acp-ws-chip{max-width:180px;flex:none}
  .acp-ws-body{padding:13px 13px 8px}
  .acp-ws-composer{padding:8px 13px calc(10px + env(safe-area-inset-bottom))}
  .acp-ws-bubble{max-width:88%}
  .acp-ws-title{font-size:15.5px}
  .acp-ws-pop{max-width:min(78vw,300px)}
}
`;

    /* ------------------------------------------------------------------ */
    /* Plugin body                                                         */
    /* ------------------------------------------------------------------ */

    /* ------------------------------------------------------------------ */
    /* ACP workspace                                                       */
    /* ------------------------------------------------------------------ */

    const workspaceOpenState = { value: false, listeners: new Set() };

    function setWorkspaceOpen(value) {
      if (workspaceOpenState.value === value) return;
      workspaceOpenState.value = value;
      for (const listener of [...workspaceOpenState.listeners]) {
        try {
          listener(value);
        } catch {
          /* ignore */
        }
      }
    }

    function useWorkspaceOpen() {
      const [value, setValue] = useState(workspaceOpenState.value);
      useEffect(() => {
        const listener = (next) => setValue(next);
        workspaceOpenState.listeners.add(listener);
        setValue(workspaceOpenState.value);
        return () => workspaceOpenState.listeners.delete(listener);
      }, []);
      return value;
    }

    function AcpWorkspaceLauncher(props) {
      const t = typeof props.t === 'function' ? props.t : fallbackTranslate;
      return h(
        'button',
        {
          type: 'button',
          className: 'acp-ws-launcher',
          title: t('workspaceTitle'),
          onClick: () => setWorkspaceOpen(true),
        },
        h(AgentGlyph, { size: 15 }),
        h('span', { className: 'acp-ws-launcher-label' }, t('workspaceNav')),
      );
    }

    function AcpWorkspaceComposerButton(props) {
      const t = typeof props.t === 'function' ? props.t : fallbackTranslate;
      return h(
        'button',
        {
          type: 'button',
          className: 'acp-ws-quick',
          title: t('workspaceTitle'),
          'aria-label': t('workspaceTitle'),
          onClick: () => setWorkspaceOpen(true),
        },
        h(AgentGlyph, { size: 16 }),
      );
    }

    function normalizeModelOptions(t, list) {
      const out = [{ value: 'default', name: t('workspaceDefaultModel'), meta: '' }];
      const seen = new Set(['default']);
      for (const entry of Array.isArray(list) ? list : []) {
        const value = typeof entry.value === 'string' ? entry.value : typeof entry.id === 'string' ? entry.id : '';
        if (value.length === 0 || seen.has(value)) continue;
        seen.add(value);
        out.push({ value, name: entry.name || value, meta: value });
      }
      return out;
    }

    function modeOptionFor(configOptions) {
      if (!Array.isArray(configOptions)) return null;
      const select = configOptions.find(
        (option) => option && (option.category === 'mode' || option.id === 'mode'),
      );
      if (!select || !Array.isArray(select.values)) return null;
      return { id: select.id, current: select.currentValue || '', values: select.values };
    }

    function permissionOptions(t) {
      return [
        { value: 'allow', name: t('workspaceAllow'), meta: '' },
        { value: 'deny', name: t('workspaceDeny'), meta: '' },
        { value: 'ask', name: t('workspaceAsk'), meta: '', disabled: true },
      ];
    }

    function WsMenu(props) {
      const [open, setOpen] = useState(false);
      const rootRef = useRef(null);
      const options = Array.isArray(props.options) ? props.options : [];
      const selected = options.find((option) => option.value === props.value) ?? options[0];
      useEffect(() => {
        if (!open) return undefined;
        const onPointer = (event) => {
          if (rootRef.current !== null && !rootRef.current.contains(event.target)) setOpen(false);
        };
        document.addEventListener('mousedown', onPointer);
        return () => document.removeEventListener('mousedown', onPointer);
      }, [open]);
      return h(
        'div',
        { className: 'acp-ws-menu', ref: rootRef },
        h(
          'button',
          {
            type: 'button',
            className: 'acp-ws-chip',
            disabled: props.disabled === true || options.length === 0,
            title: selected ? `${props.label}: ${selected.name}` : props.label,
            onClick: () => setOpen((current) => !current),
          },
          h('span', null, props.label),
          selected ? h('b', null, selected.name) : null,
          h('span', { className: 'acp-ws-caret' }, '▾'),
        ),
        open
          ? h(
              'div',
              { className: 'acp-ws-pop', role: 'menu' },
              options.map((option) =>
                h(
                  'button',
                  {
                    key: option.value,
                    type: 'button',
                    className: 'acp-ws-opt',
                    'data-on': option.value === props.value ? '1' : undefined,
                    disabled: option.disabled === true,
                    onClick: () => {
                      if (option.disabled === true) return;
                      setOpen(false);
                      props.onSelect(option.value);
                    },
                  },
                  h(
                    'span',
                    { className: 'acp-ws-opt-main' },
                    h('span', { className: 'acp-ws-opt-name' }, option.name),
                    option.meta ? h('span', { className: 'acp-ws-opt-meta' }, option.meta) : null,
                  ),
                  option.value === props.value ? h('span', null, '✓') : null,
                ),
              ),
            )
          : null,
      );
    }

    function AcpWorkspaceOverlay(props) {
      const t = typeof props.t === 'function' ? props.t : fallbackTranslate;
      const open = useWorkspaceOpen();
      const [phase, setPhase] = useState('loading');
      const [agents, setAgents] = useState([]);
      const [cwd, setCwd] = useState('');
      const [activeChat, setActiveChat] = useState(null);
      const [messages, setMessages] = useState([]);
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState(null);
      const [notice, setNotice] = useState(null);
      const [draft, setDraft] = useState('');
      const [setupAgent, setSetupAgent] = useState(null);
      const [setupModel, setSetupModel] = useState('default');
      const [setupPermission, setSetupPermission] = useState('allow');
      const [setupMode, setSetupMode] = useState('');
      const [starting, setStarting] = useState(false);
      const bodyRef = useRef(null);
      const sourceRef = useRef(null);

      const request = useCallback(async (path, body) => {
        const response = await fetch(`${API}${path}`, {
          method: body === undefined ? 'GET' : 'POST',
          credentials: 'same-origin',
          headers: body === undefined
            ? { accept: 'application/json' }
            : { 'content-type': 'application/json', accept: 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        let payload = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }
        if (!response.ok || payload === null || payload.ok === false) {
          throw new Error(payload && payload.error ? String(payload.error) : `HTTP ${response.status}`);
        }
        return payload;
      }, []);

      const selectChat = useCallback((chat) => {
        setActiveChat(chat);
        setBusy(chat?.busy === true);
        setMessages([]);
        setError(null);
        setNotice(null);
        setDraft('');
        setPhase('chat');
      }, []);

      const chooseSetupAgent = useCallback((agent) => {
        setSetupAgent(agent);
        setSetupModel('default');
        setSetupPermission(agent?.permission === 'deny' ? 'deny' : 'allow');
        setSetupMode(modeOptionFor(agent?.lastTest?.configOptions)?.current || '');
      }, []);

      const load = useCallback(async () => {
        setPhase('loading');
        setError(null);
        setNotice(null);
        try {
          const [agentPayload, statePayload] = await Promise.all([
            request('/agents'),
            request('/workspace/state'),
          ]);
          const enabled = Array.isArray(agentPayload.agents)
            ? agentPayload.agents.filter((agent) => agent.enabled === true)
            : [];
          setAgents(enabled);
          setCwd(typeof statePayload.cwd === 'string' ? statePayload.cwd : '');
          const chats = Array.isArray(statePayload.chats) ? statePayload.chats : [];
          const latest = chats.length > 0 ? chats[chats.length - 1] : null;
          if (latest !== null) {
            selectChat(latest);
          } else {
            const preferred =
              enabled.find((agent) => agent.id === agentPayload.defaultAgent) ?? enabled[0] ?? null;
            chooseSetupAgent(preferred);
            setPhase('setup');
          }
        } catch (loadError) {
          setError(t('workspaceError', { error: loadError.message }));
          setPhase('error');
        }
      }, [request, selectChat, chooseSetupAgent]);

      useEffect(() => {
        if (open) void load();
      }, [open, load]);

      useEffect(() => {
        if (!open) return undefined;
        const onKey = (event) => {
          if (event.key === 'Escape') setWorkspaceOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [open]);

      useEffect(() => {
        if (!open || activeChat === null) return undefined;
        const source = new EventSource(
          `${API}/workspace/events?chatId=${encodeURIComponent(activeChat.id)}`,
        );
        sourceRef.current = source;
        source.onmessage = (event) => {
          try {
            handleEvent(JSON.parse(event.data));
          } catch {
            /* ignore malformed events */
          }
        };
        return () => {
          source.close();
          if (sourceRef.current === source) sourceRef.current = null;
        };
      }, [open, activeChat?.id]);

      useEffect(() => {
        const element = bodyRef.current;
        if (element !== null) element.scrollTop = element.scrollHeight;
      }, [messages, busy]);

      function updateAssistant(mutator) {
        setMessages((previous) => {
          const next = [...previous];
          let index = -1;
          for (let cursor = next.length - 1; cursor >= 0; cursor -= 1) {
            if (next[cursor].role === 'assistant') {
              index = cursor;
              break;
            }
          }
          if (index === -1 || next[index].done === true) {
            next.push({ role: 'assistant', text: '', thoughts: [], tools: [], done: false });
            index = next.length - 1;
          }
          next[index] = mutator(next[index]);
          return next;
        });
      }

      function handleEvent(event) {
        if (event === null || typeof event !== 'object') return;
        switch (event.kind) {
          case 'user':
            setMessages((previous) => [...previous, { role: 'user', text: String(event.text ?? '') }]);
            break;
          case 'assistant':
            updateAssistant((message) => ({ ...message, text: message.text + String(event.delta ?? '') }));
            break;
          case 'thought':
            updateAssistant((message) => ({
              ...message,
              thoughts: [...message.thoughts, String(event.delta ?? '')],
            }));
            break;
          case 'tool':
            updateAssistant((message) => {
              const tools = [...message.tools];
              const index = tools.findIndex((tool) => tool.id === event.id);
              const next = { id: String(event.id ?? '') };
              if (typeof event.title === 'string' && event.title.length > 0) next.title = event.title;
              if (typeof event.status === 'string' && event.status.length > 0) next.status = event.status;
              if (index === -1) {
                tools.push({ title: 'tool', status: 'pending', ...next });
              } else {
                tools[index] = { ...tools[index], ...next };
              }
              return { ...message, tools };
            });
            break;
          case 'state':
            setBusy(event.busy === true);
            setActiveChat((current) =>
              current === null
                ? current
                : {
                    ...current,
                    busy: event.busy === true,
                    model: typeof event.model === 'string' ? event.model : current.model,
                    permission: typeof event.permission === 'string' ? event.permission : current.permission,
                    mode: typeof event.mode === 'string' ? event.mode : current.mode,
                  },
            );
            break;
          case 'done':
            setBusy(false);
            setMessages((previous) => {
              const next = [...previous];
              for (let cursor = next.length - 1; cursor >= 0; cursor -= 1) {
                if (next[cursor].role === 'assistant') {
                  next[cursor] = { ...next[cursor], done: true };
                  break;
                }
              }
              return next;
            });
            if (event.error) setError(String(event.error));
            else if (Array.isArray(event.warnings) && event.warnings.length > 0) {
              setNotice(event.warnings.join('；'));
            }
            break;
          case 'closed':
            setBusy(false);
            setNotice(t('workspaceClosed'));
            if (sourceRef.current !== null) sourceRef.current.close();
            break;
          default:
            break;
        }
      }

      async function startChat() {
        if (setupAgent === null || starting) return;
        setStarting(true);
        setError(null);
        setNotice(null);
        try {
          const chat = await request('/workspace/open', {
            agentId: setupAgent.id,
            model: setupModel,
            permission: setupPermission,
            mode: setupMode,
          });
          selectChat(chat);
          if (Array.isArray(chat.warnings) && chat.warnings.length > 0) {
            setNotice(chat.warnings.join('；'));
          }
        } catch (startError) {
          setError(t('workspaceError', { error: startError.message }));
        } finally {
          setStarting(false);
        }
      }

      async function applyChatOption(patch) {
        if (activeChat === null) return;
        const previous = activeChat;
        setActiveChat({ ...activeChat, ...patch });
        try {
          const result = await request('/workspace/options', { chatId: activeChat.id, ...patch });
          if (result.chat) setActiveChat(result.chat);
        } catch (optionError) {
          setActiveChat(previous);
          setError(t('workspaceError', { error: optionError.message }));
        }
      }

      async function sendMessage() {
        const value = draft.trim();
        if (value.length === 0 || activeChat === null || busy) return;
        setDraft('');
        setError(null);
        setNotice(null);
        try {
          await request('/workspace/send', { chatId: activeChat.id, text: value });
        } catch (sendError) {
          setDraft(value);
          setError(t('workspaceError', { error: sendError.message }));
        }
      }

      async function stopMessage() {
        if (activeChat === null) return;
        try {
          await request('/workspace/cancel', { chatId: activeChat.id });
        } catch (cancelError) {
          setError(t('workspaceError', { error: cancelError.message }));
        }
      }

      function newChat() {
        setActiveChat(null);
        setMessages([]);
        setBusy(false);
        setError(null);
        setNotice(null);
        setDraft('');
        setPhase('setup');
        const preferred =
          agents.find((agent) => agent.id === setupAgent?.id) ??
          agents.find((agent) => agent.enabled === true) ??
          null;
        chooseSetupAgent(preferred);
      }

      if (!open) return null;

      const setupModels = setupAgent === null
        ? []
        : normalizeModelOptions(t, setupAgent.lastTest?.models);
      const setupModeOption = modeOptionFor(setupAgent?.lastTest?.configOptions);
      const chatModels = normalizeModelOptions(t, activeChat?.models);
      const chatModeOption = modeOptionFor(activeChat?.configOptions);
      const chatModeValues = chatModeOption
        ? chatModeOption.values
        : [];

      const header = h(
        'div',
        { className: 'acp-ws-head' },
        h(
          'div',
          { className: 'acp-ws-head-main' },
          phase === 'chat'
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'acp-ws-back',
                  title: t('workspaceNew'),
                  'aria-label': t('workspaceNew'),
                  onClick: newChat,
                },
                '←',
              )
            : null,
          h(
            'div',
            { className: 'acp-ws-titles' },
            h('h1', { className: 'acp-ws-title' }, phase === 'chat' ? activeChat?.agentName ?? t('workspaceTitle') : t('workspaceTitle')),
            h(
              'p',
              { className: 'acp-ws-sub' },
              phase === 'chat'
                ? `${activeChat?.cwd ?? ''} · ${t('workspaceIndependent')}`
                : t('workspaceSub'),
            ),
          ),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'acp-ws-close',
            title: t('pickerClose'),
            'aria-label': t('pickerClose'),
            onClick: () => setWorkspaceOpen(false),
          },
          '×',
        ),
      );

      const controls = phase === 'chat'
        ? h(
            'div',
            { className: 'acp-ws-controls' },
            h(WsMenu, {
              label: t('workspaceModel'),
              value: activeChat?.model ?? 'default',
              options: chatModels,
              onSelect: (value) => void applyChatOption({ model: value }),
            }),
            h(WsMenu, {
              label: t('workspacePermission'),
              value: activeChat?.permission ?? 'allow',
              options: permissionOptions(t),
              onSelect: (value) => void applyChatOption({ permission: value }),
            }),
            chatModeOption !== null && chatModeValues.length > 0
              ? h(WsMenu, {
                  label: t('workspaceMode'),
                  value: activeChat?.mode ?? '',
                  options: chatModeValues.map((entry) => ({
                    value: entry.value,
                    name: entry.name || entry.value,
                    meta: '',
                  })),
                  onSelect: (value) => void applyChatOption({ mode: value }),
                })
              : null,
            h(
              'button',
              {
                type: 'button',
                className: 'acp-ws-chip',
                onClick: newChat,
              },
              '+ ',
              t('workspaceNew'),
            ),
          )
        : null;

      let body = null;
      if (phase === 'loading') {
        body = h('div', { className: 'acp-ws-empty' }, t('workspaceLoading'));
      } else if (phase === 'error') {
        body = h(
          'div',
          { className: 'acp-ws-empty' },
          h('div', { className: 'acp-ws-error' }, error),
          h('button', { type: 'button', className: 'acp-ws-start', onClick: () => void load() }, t('refresh')),
        );
      } else if (phase === 'setup') {
        const startDisabled = setupAgent === null || starting;
        body = h(
          'div',
          { className: 'acp-ws-body' },
          h(
            'div',
            { className: 'acp-ws-setup' },
            error !== null ? h('div', { className: 'acp-ws-error' }, error) : null,
            agents.length === 0
              ? h(
                  'div',
                  { className: 'acp-ws-empty' },
                  h('div', null, t('workspaceNoAgents')),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'acp-ws-start',
                      onClick: () => {
                        setWorkspaceOpen(false);
                      },
                    },
                    t('workspaceSettings'),
                  ),
                )
              : h(
                  React.Fragment,
                  null,
                  h('div', { className: 'acp-ws-label' }, t('workspaceAgent')),
                  h(
                    'div',
                    { className: 'acp-ws-agents' },
                    agents.map((agent) =>
                      h(
                        'button',
                        {
                          key: agent.id,
                          type: 'button',
                          className: 'acp-ws-agent',
                          'data-on': agent.id === setupAgent?.id ? '1' : undefined,
                          onClick: () => chooseSetupAgent(agent),
                        },
                        h(
                          'span',
                          { className: 'acp-ws-agent-main' },
                          h('span', { className: 'acp-ws-agent-name' }, agent.name),
                          h(
                            'span',
                            { className: 'acp-ws-agent-meta' },
                            `${agent.available ? t('pickerInstalled') : t('pickerMissing')} · ${
                              Array.isArray(agent.lastTest?.models) ? agent.lastTest.models.length : 0
                            } ${t('cascadeModel')}`,
                          ),
                        ),
                        h('span', { className: 'acp-ws-agent-radio' }, agent.id === setupAgent?.id ? h('i') : null),
                      ),
                    ),
                  ),
                  h('div', { className: 'acp-ws-label' }, t('workspaceModel')),
                  h(WsMenu, {
                    label: t('workspaceModel'),
                    value: setupModel,
                    options: setupModels,
                    disabled: starting,
                    onSelect: setSetupModel,
                  }),
                  h('div', { className: 'acp-ws-label' }, t('workspacePermission')),
                  h(WsMenu, {
                    label: t('workspacePermission'),
                    value: setupPermission,
                    options: permissionOptions(t),
                    disabled: starting,
                    onSelect: setSetupPermission,
                  }),
                  setupModeOption !== null && setupModeOption.values.length > 0
                    ? h(
                        React.Fragment,
                        null,
                        h('div', { className: 'acp-ws-label' }, t('workspaceMode')),
                        h(WsMenu, {
                          label: t('workspaceMode'),
                          value: setupMode,
                          options: setupModeOption.values.map((entry) => ({
                            value: entry.value,
                            name: entry.name || entry.value,
                            meta: '',
                          })),
                          disabled: starting,
                          onSelect: setSetupMode,
                        }),
                      )
                    : null,
                  h(
                    'div',
                    { className: 'acp-ws-setup-cwd' },
                    h('b', null, `${t('workspaceCwd')}: `),
                    setupAgent?.cwd ?? cwd,
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'acp-ws-start',
                      disabled: startDisabled,
                      onClick: () => void startChat(),
                    },
                    starting ? t('workspaceStarting') : t('workspaceStart'),
                  ),
                ),
          ),
        );
      } else if (phase === 'chat') {
        body = h(
          'div',
          { className: 'acp-ws-body', ref: bodyRef },
          h(
            'div',
            { className: 'acp-ws-list' },
            error !== null ? h('div', { className: 'acp-ws-error' }, error) : null,
            notice !== null ? h('div', { className: 'acp-ws-notice' }, notice) : null,
            messages.length === 0
              ? h('div', { className: 'acp-ws-empty' }, t('workspaceEmpty', { name: activeChat?.agentName ?? '' }))
              : messages.map((message, index) =>
                  message.role === 'user'
                    ? h(
                        'div',
                        { key: `user-${index}`, className: 'acp-ws-msg', 'data-role': 'user' },
                        h('div', { className: 'acp-ws-bubble' }, message.text),
                      )
                    : h(
                        'div',
                        { key: `assistant-${index}`, className: 'acp-ws-msg', 'data-role': 'assistant' },
                        h('div', { className: 'acp-ws-avatar' }, h(AgentGlyph, { size: 15 })),
                        h(
                          'div',
                          { className: 'acp-ws-bubble' },
                          message.thoughts.length > 0
                            ? h(
                                'details',
                                { className: 'acp-ws-thinking' },
                                h('summary', null, `${t('workspaceThought')} · ${message.thoughts.join('').length}`),
                                h('div', null, message.thoughts.join('')),
                              )
                            : null,
                          message.text.length > 0
                            ? h(
                                'div',
                                { className: 'acp-ws-text' },
                                message.text,
                                busy && message.done !== true ? h('span', { className: 'acp-ws-cursor' }) : null,
                              )
                            : null,
                          message.tools.length > 0
                            ? h(
                                'div',
                                { className: 'acp-ws-tools' },
                                message.tools.map((tool, toolIndex) =>
                                  h(
                                    'div',
                                    {
                                      key: `${tool.id || toolIndex}`,
                                      className: 'acp-ws-tool',
                                      'data-status': tool.status,
                                    },
                                    h(
                                      'span',
                                      { className: 'acp-ws-tool-mark' },
                                      tool.status === 'completed'
                                        ? '✓'
                                        : tool.status === 'failed'
                                          ? '×'
                                          : tool.status === 'in_progress'
                                            ? '◐'
                                            : '○',
                                    ),
                                    h('span', { className: 'acp-ws-tool-title' }, tool.title),
                                  ),
                                ),
                              )
                            : null,
                          message.done === true && message.text.length === 0 && message.tools.length === 0
                            ? h('div', { className: 'acp-ws-text' }, '—')
                            : null,
                        ),
                      ),
                ),
            busy ? h('div', { className: 'acp-ws-empty', style: { minHeight: 'auto', padding: '4px', fontSize: '11px' } }, t('workspaceBusy')) : null,
          ),
        );
      }

      const composer = phase === 'chat'
        ? h(
            'div',
            { className: 'acp-ws-composer' },
            h(
              'div',
              { className: 'acp-ws-input-wrap' },
              h('textarea', {
                className: 'acp-ws-input',
                rows: 1,
                value: draft,
                placeholder: t('workspaceInput', { name: activeChat?.agentName ?? '' }),
                onChange: (event) => setDraft(event.target.value),
                onKeyDown: (event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent?.isComposing) {
                    event.preventDefault();
                    void sendMessage();
                  }
                },
              }),
              busy
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'acp-ws-send',
                      'data-stop': '1',
                      title: t('workspaceStop'),
                      onClick: () => void stopMessage(),
                    },
                    '■',
                  )
                : h(
                    'button',
                    {
                      type: 'button',
                      className: 'acp-ws-send',
                      title: t('workspaceSend'),
                      disabled: draft.trim().length === 0,
                      onClick: () => void sendMessage(),
                    },
                    '↑',
                  ),
            ),
            h('div', { className: 'acp-ws-hint' }, t('workspaceHint')),
          )
        : null;

      return h(
        React.Fragment,
        null,
        h('style', null, WORKSPACE_CSS),
        h(
          'div',
          { className: 'acp-ws-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('workspaceTitle') },
          h('div', { className: 'acp-ws-shell' }, header, controls, body, composer),
        ),
      );
    }

    /* ------------------------------------------------------------------ */
    /* Composer model seat: native / ACP                                   */
    /* ------------------------------------------------------------------ */

    const EMPTY_MODEL_STATE = {
      current: null,
      groups: [],
      failures: [],
      status: 'idle',
      pending: null,
      error: null,
    };

    async function seatRequest(path, body) {
      const response = await fetch(`${API}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        credentials: 'same-origin',
        headers: body === undefined
          ? { accept: 'application/json' }
          : { 'content-type': 'application/json', accept: 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok || payload === null || payload.ok === false) {
        throw new Error(payload && payload.error ? String(payload.error) : `HTTP ${response.status}`);
      }
      return payload;
    }

    function seatAgentId(provider) {
      return typeof provider === 'string' && provider.startsWith('acp-') ? provider.slice(4) : null;
    }

    function seatStripModelId(id) {
      const value = typeof id === 'string' ? id : '';
      const at = value.indexOf('[');
      return at > 0 ? value.slice(0, at) : value;
    }

    function seatModelOf(groups, provider, model) {
      const group = Array.isArray(groups) ? groups.find((entry) => entry.id === provider) : null;
      return group !== null && group !== undefined && Array.isArray(group.models)
        ? group.models.find((entry) => entry.id === model) ?? null
        : null;
    }

    function seatDisplayModelName(model, t) {
      if (model === null || model === undefined) return '';
      if (model.id === 'default') return t('seatDefaultModel');
      return typeof model.name === 'string' && model.name.length > 0 ? model.name : seatStripModelId(model.id);
    }

    /** First ACP draft for a route: agent, model, permission, config defaults. */
    function seatDraftFrom(current, agents, fallbackAgentId) {
      const enabled = (Array.isArray(agents) ? agents : []).filter((agent) => agent.enabled !== false);
      const routedId = current !== null && current !== undefined ? seatAgentId(current.provider) : null;
      const routed = routedId === null ? null : enabled.find((agent) => agent.id === routedId) ?? null;
      const agent = routed
        ?? enabled.find((entry) => entry.id === fallbackAgentId)
        ?? enabled[0]
        ?? null;
      const currentOptions = current !== null && current !== undefined && current.options !== null && typeof current.options === 'object'
        ? current.options
        : null;
      const config = {};
      if (currentOptions !== null && currentOptions.config !== null && typeof currentOptions.config === 'object') {
        for (const [key, value] of Object.entries(currentOptions.config)) {
          if (typeof value === 'string') config[key] = value;
        }
      }
      if (agent !== null) {
        const options = Array.isArray(agent.lastTest?.configOptions) ? agent.lastTest.configOptions : [];
        for (const option of options) {
          if (option === null || typeof option !== 'object' || option.type !== 'select') continue;
          if (option.category === 'model' || option.id === 'model') continue;
          if (config[option.id] === undefined) {
            config[option.id] = option.currentValue ?? option.values?.[0]?.value ?? '';
          }
        }
      }
      return {
        agentId: agent === null ? null : agent.id,
        model: routed !== null && typeof current.model === 'string' && current.model.length > 0 ? current.model : 'default',
        permission: currentOptions?.permission === 'deny' || (currentOptions === null && agent?.permission === 'deny') ? 'deny' : 'allow',
        config,
      };
    }

    function SeatCheckIcon() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
        h('path', {
          d: 'M3.4 8.2l3.1 3.1 6.2-6.4',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      );
    }

    function SeatCaret() {
      return h(
        'svg',
        { viewBox: '0 0 12 12', width: 12, height: 12, fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
        h('path', {
          d: 'M2.6 4.4L6 7.8l3.4-3.4',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      );
    }

    function SeatModelIcon() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
        h('rect', { x: 3.2, y: 3.2, width: 9.6, height: 9.6, rx: 2.2, stroke: 'currentColor', strokeWidth: 1.2 }),
        h('path', {
          d: 'M6 1.7v1.5M10 1.7v1.5M6 12.8v1.5M10 12.8v1.5M1.7 6h1.5M1.7 10h1.5M12.8 6h1.5M12.8 10h1.5',
          stroke: 'currentColor',
          strokeWidth: 1.2,
          strokeLinecap: 'round',
        }),
      );
    }

    function SeatChevronRight() {
      return h(
        'svg',
        { viewBox: '0 0 12 12', width: 12, height: 12, fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
        h('path', {
          d: 'M4.4 2.6L7.8 6l-3.4 3.4',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      );
    }

    function SeatBackIcon() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 16, height: 16, fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
        h('path', {
          d: 'M9.6 3.4L5 8l4.6 4.6',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      );
    }

    function AcpModelSeatControl(props) {
      const t = typeof props.t === 'function' ? props.t : fallbackTranslate;
      const sessionId = props.sessionId;
      const locked = props.locked === true;
      const modelsService = props.modelsService ?? null;
      const sessions = props.sessions ?? null;
      const triggerRef = useRef(null);
      const panelRef = useRef(null);
      const [open, setOpen] = useState(false);
      const [pos, setPos] = useState(null);
      const [route, setRoute] = useState(null);
      const [agents, setAgents] = useState([]);
      const [agentsLoaded, setAgentsLoaded] = useState(false);
      const [defaultAgent, setDefaultAgent] = useState(null);
      const [draft, setDraft] = useState(null);
      const [lane, setLane] = useState('native');
      const [query, setQuery] = useState('');
      const [error, setError] = useState(null);
      const [pending, setPending] = useState(false);
      const [pane, setPane] = useState('root');
      const [paramId, setParamId] = useState(null);
      const [lastNative, setLastNative] = useState(null);
      const [selection, setSelection] = useState(null);
      const restoredRef = useRef('');

      const directory = useMemo(() => {
        if (modelsService === null || sessionId === undefined || sessionId === null) return null;
        try {
          return modelsService.directoryFor(sessionId);
        } catch {
          return null;
        }
      }, [modelsService, sessionId]);

      const subscribe = useCallback((notify) => {
        if (directory === null) return () => {};
        return directory.store.subscribe(notify);
      }, [directory]);
      const snapshot = useCallback(() => {
        if (directory === null) return EMPTY_MODEL_STATE;
        return directory.store.getSnapshot();
      }, [directory]);
      const modelState = React.useSyncExternalStore(subscribe, snapshot, snapshot);

      const groups = useMemo(() => (Array.isArray(modelState.groups) ? modelState.groups : []), [modelState.groups]);
      const nativeGroups = useMemo(() => groups.filter((group) => !String(group.id).startsWith('acp-')), [groups]);

      useEffect(() => {
        setRoute(null);
        setDraft(null);
        restoredRef.current = '';
      }, [sessionId]);

      /** Persist one side of the remembered choice; the Host merges the rest. */
      async function recordSelection(patch) {
        try {
          const payload = await seatRequest('/selection', patch);
          if (payload.selection !== null && payload.selection !== undefined) setSelection(payload.selection);
        } catch {
          /* preference persistence is best effort */
        }
      }

      /** Apply the remembered choice to a fresh session, once per session. */
      async function restoreSelection(saved) {
        if (saved === null || restoredRef.current === String(sessionId)) return;
        try {
          if (saved.lane === 'acp' && saved.acp !== null) {
            const payload = await seatRequest('/session/restore', { sessionId: String(sessionId) });
            if (payload.restored !== true) return;
            restoredRef.current = String(sessionId);
            setRoute({
              provider: typeof payload.provider === 'string' ? payload.provider : null,
              model: typeof payload.model === 'string' ? payload.model : null,
              options: payload.options !== null && typeof payload.options === 'object' ? payload.options : null,
            });
            setLane('acp');
            return;
          }
          if (saved.lane === 'native' && saved.native !== null && directory !== null) {
            const { provider, model, reasoningEffort } = saved.native;
            const result = await directory.select({
              provider,
              model,
              ...(typeof reasoningEffort === 'string' && reasoningEffort.length > 0 ? { reasoningEffort } : {}),
            });
            if (result !== null && result !== undefined && result.ok === false) return;
            restoredRef.current = String(sessionId);
            setRoute({ provider, model, reasoningEffort: reasoningEffort || undefined, options: null });
            setLane('native');
          }
        } catch {
          /* a fresh session may not be live yet; the next loadRoute retries */
        }
      }

      const loadRoute = useCallback(async () => {
        if (sessionId === undefined || sessionId === null) return;
        try {
          const payload = await seatRequest(`/session?sessionId=${encodeURIComponent(String(sessionId))}`);
          setRoute({
            provider: typeof payload.provider === 'string' ? payload.provider : null,
            model: typeof payload.model === 'string' ? payload.model : null,
            options: payload.options !== null && typeof payload.options === 'object' ? payload.options : null,
          });
          const saved = payload.selection !== null && typeof payload.selection === 'object' ? payload.selection : null;
          setSelection(saved);
          if (payload.explicit !== true && saved !== null) await restoreSelection(saved);
        } catch {
          /* keep the catalog route */
        }
      }, [sessionId]);

      useEffect(() => {
        void loadRoute();
      }, [loadRoute]);

      const loadAgents = useCallback(async () => {
        try {
          const payload = await seatRequest('/agents');
          setAgents(Array.isArray(payload.agents) ? payload.agents : []);
          setDefaultAgent(typeof payload.defaultAgent === 'string' ? payload.defaultAgent : null);
        } catch (loadError) {
          setError(loadError.message);
        } finally {
          setAgentsLoaded(true);
        }
      }, []);

      const current = route ?? (modelState.current === null || modelState.current === undefined
        ? null
        : {
            provider: modelState.current.provider,
            model: modelState.current.model,
            reasoningEffort: modelState.current.reasoningEffort,
            options: null,
          });
      const currentIsAcp = current !== null && typeof current.provider === 'string' && current.provider.startsWith('acp-');
      const currentAgentId = currentIsAcp ? seatAgentId(current.provider) : null;
      const currentAgent = currentAgentId === null
        ? null
        : agents.find((agent) => agent.id === currentAgentId) ?? null;
      const draftAgent = draft === null ? null : agents.find((agent) => agent.id === draft.agentId) ?? null;
      const enabledAgents = useMemo(() => agents.filter((agent) => agent.enabled !== false), [agents]);
      const draftGroup = draftAgent === null ? null : groups.find((group) => group.id === `acp-${draftAgent.id}`) ?? null;

      const draftModels = useMemo(() => {
        if (draftAgent === null) return [];
        const seen = new Set();
        const list = [];
        const push = (id, name) => {
          if (typeof id !== 'string' || id.length === 0 || seen.has(id)) return;
          seen.add(id);
          list.push({ id, name });
        };
        if (draftGroup !== null && Array.isArray(draftGroup.models) && draftGroup.models.length > 0) {
          for (const model of draftGroup.models) push(model.id, seatDisplayModelName(model, t));
        } else {
          push('default', t('seatDefaultModel'));
          const tested = Array.isArray(draftAgent.lastTest?.models) ? draftAgent.lastTest.models : [];
          for (const model of tested) {
            push(model.value || model.id, model.name || model.value || model.id);
          }
        }
        if (list.length === 0) push('default', t('seatDefaultModel'));
        return list;
      }, [draftAgent, draftGroup, t]);

      const currentModels = useMemo(() => {
        if (!currentIsAcp || current === null) return [];
        const group = groups.find((entry) => entry.id === current.provider);
        if (group !== null && group !== undefined && Array.isArray(group.models)) {
          return group.models.map((model) => ({ id: model.id, name: seatDisplayModelName(model, t) }));
        }
        return [];
      }, [currentIsAcp, current, groups, t]);

      const currentModelName = useMemo(() => {
        if (current === null) return '';
        if (currentIsAcp) {
          const found = currentModels.find((model) => model.id === current.model);
          if (found !== undefined) return found.name;
          if (current.model === 'default') return t('seatDefaultModel');
          return seatStripModelId(current.model) || t('seatDefaultModel');
        }
        const model = seatModelOf(groups, current.provider, current.model);
        return seatDisplayModelName(model, t) || seatStripModelId(current.model);
      }, [current, currentIsAcp, currentModels, groups, t]);

      const currentNativeModel = current !== null && !currentIsAcp
        ? seatModelOf(groups, current.provider, current.model)
        : null;
      const currentEffortId = current?.reasoningEffort ?? currentNativeModel?.reasoning?.defaultEffort ?? null;
      const currentEffortName = currentNativeModel?.reasoning === undefined || currentNativeModel?.reasoning === null
        ? undefined
        : (currentEffortId === null
            ? t('seatDefault')
            : currentNativeModel.reasoning.efforts.find((effort) => effort.id === currentEffortId)?.name ?? currentEffortId);

      const nativeSelection = currentIsAcp ? (lastNative ?? selection?.native ?? null) : current;
      const nativeModel = nativeSelection === null || nativeSelection === undefined
        ? null
        : seatModelOf(groups, nativeSelection.provider, nativeSelection.model);
      const nativeEffortId = nativeSelection?.reasoningEffort ?? nativeModel?.reasoning?.defaultEffort ?? null;
      const nativeEffortName = nativeModel?.reasoning === undefined || nativeModel?.reasoning === null
        ? undefined
        : (nativeEffortId === null
            ? t('seatDefault')
            : nativeModel.reasoning.efforts.find((effort) => effort.id === nativeEffortId)?.name ?? nativeEffortId);

      const permission = current?.options?.permission === 'deny'
        ? 'deny'
        : current?.options?.permission === 'allow'
          ? 'allow'
          : currentAgent?.permission === 'deny' ? 'deny' : 'allow';
      const permissionName = permission === 'deny' ? t('seatDeny') : t('seatAllow');

      useEffect(() => {
        if (current === null || currentIsAcp) return;
        setLastNative({
          provider: current.provider,
          model: current.model,
          reasoningEffort: current.reasoningEffort,
        });
      }, [current?.provider, current?.model, current?.reasoningEffort, currentIsAcp]);

      const configOptions = useMemo(() => {
        const options = Array.isArray(draftAgent?.lastTest?.configOptions) ? draftAgent.lastTest.configOptions : [];
        return options.filter((option) => {
          if (option === null || typeof option !== 'object' || option.type !== 'select') return false;
          if (option.category === 'model' || option.id === 'model') return false;
          return Array.isArray(option.values) && option.values.length > 0;
        });
      }, [draftAgent]);

      useEffect(() => {
        if (locked) setOpen(false);
      }, [locked]);

      useEffect(() => {
        if (!open) return undefined;
        const update = () => {
          const trigger = triggerRef.current;
          if (trigger === null) return;
          const rect = trigger.getBoundingClientRect();
          const width = Math.min(300, Math.max(240, window.innerWidth - 16));
          const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
          const bottom = Math.max(8, window.innerHeight - rect.top + 8);
          const maxHeight = Math.min(470, Math.max(200, rect.top - 16));
          setPos({ left, bottom, width, maxHeight });
        };
        update();
        window.addEventListener('resize', update);
        window.addEventListener('scroll', update, true);
        return () => {
          window.removeEventListener('resize', update);
          window.removeEventListener('scroll', update, true);
        };
      }, [open]);

      useEffect(() => {
        if (!open) return undefined;
        const onPointerDown = (event) => {
          if (triggerRef.current?.contains(event.target) === true) return;
          if (panelRef.current?.contains(event.target) === true) return;
          setOpen(false);
        };
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            if (pane !== 'root') setPane('root');
            else setOpen(false);
          }
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
          document.removeEventListener('mousedown', onPointerDown);
          document.removeEventListener('keydown', onKeyDown);
        };
      }, [open, pane]);

      useEffect(() => {
        if (!open) return;
        setDraft((previous) => {
          if (previous !== null && previous.agentId !== null) return previous;
          const next = seatDraftFrom(current, agents, defaultAgent);
          return next.agentId === null ? previous : next;
        });
      }, [open, agents, defaultAgent]);

      function toggleOpen() {
        if (locked) return;
        const next = !open;
        setOpen(next);
        if (next) {
          setQuery('');
          setPane('root');
          setParamId(null);
          setError(null);
          setLane(currentIsAcp ? 'acp' : 'native');
          setDraft(seatDraftFrom(current, agents, defaultAgent));
          void loadAgents();
          void loadRoute();
          if (directory !== null) directory.load().catch(() => {});
        }
      }

      async function chooseNative(provider, model, reasoningEffort) {
        if (directory === null) {
          setError(t('seatNoSession'));
          return;
        }
        setPending(true);
        setError(null);
        try {
          const result = await directory.select({
            provider,
            model,
            ...(typeof reasoningEffort === 'string' && reasoningEffort.length > 0 ? { reasoningEffort } : {}),
          });
          if (result !== null && result !== undefined && result.ok === false) {
            throw new Error(result.error?.message ?? `HTTP ${result.error?.code ?? 'error'}`);
          }
          setRoute({ provider, model, reasoningEffort: reasoningEffort || undefined, options: null });
          setLane('native');
          void recordSelection({
            lane: 'native',
            native: {
              provider,
              model,
              ...(typeof reasoningEffort === 'string' && reasoningEffort.length > 0 ? { reasoningEffort } : {}),
            },
          });
        } catch (selectError) {
          setError(t('seatError', { error: String(selectError.message || selectError) }));
        } finally {
          setPending(false);
        }
      }

      async function applyAcp(nextDraft) {
        if (nextDraft === null || nextDraft.agentId === null) return;
        if (sessionId === undefined || sessionId === null) {
          setError(t('seatNoSession'));
          return;
        }
        const config = { ...nextDraft.config };
        for (const option of configOptions) {
          if (config[option.id] === undefined) {
            config[option.id] = option.currentValue ?? option.values?.[0]?.value ?? '';
          }
        }
        setPending(true);
        setError(null);
        try {
          const payload = await seatRequest('/session/apply', {
            sessionId: String(sessionId),
            agentId: nextDraft.agentId,
            model: nextDraft.model || 'default',
            permission: nextDraft.permission === 'deny' ? 'deny' : 'allow',
            config,
          });
          setRoute({
            provider: typeof payload.provider === 'string' ? payload.provider : `acp-${nextDraft.agentId}`,
            model: typeof payload.model === 'string' ? payload.model : nextDraft.model,
            options: payload.options !== null && typeof payload.options === 'object' ? payload.options : null,
          });
          setLane('acp');
          setSelection(payload.selection ?? null);
        } catch (applyError) {
          setError(t('seatError', { error: String(applyError.message || applyError) }));
        } finally {
          setPending(false);
        }
      }

      function chooseAgent(agent) {
        if (agent === null || pending) return;
        if (draft !== null && draft.agentId === agent.id) {
          setPane('root');
          return;
        }
        const config = {};
        const options = Array.isArray(agent.lastTest?.configOptions) ? agent.lastTest.configOptions : [];
        for (const option of options) {
          if (option === null || typeof option !== 'object' || option.type !== 'select') continue;
          if (option.category === 'model' || option.id === 'model') continue;
          config[option.id] = option.currentValue ?? option.values?.[0]?.value ?? '';
        }
        const next = {
          agentId: agent.id,
          model: 'default',
          permission: agent.permission === 'deny' ? 'deny' : 'allow',
          config,
        };
        setDraft(next);
        setLane('acp');
        void applyAcp(next);
      }

      function chooseModel(modelId) {
        if (draft === null || pending) return;
        const next = { ...draft, model: modelId };
        setDraft(next);
        void applyAcp(next);
      }

      function choosePermission(value) {
        if (draft === null || pending) return;
        const next = { ...draft, permission: value };
        setDraft(next);
        void applyAcp(next);
      }

      function chooseConfig(optionId, value) {
        if (draft === null || pending) return;
        const next = { ...draft, config: { ...draft.config, [optionId]: value } };
        setDraft(next);
        void applyAcp(next);
      }

      function agentModelCount(agent) {
        const group = groups.find((entry) => entry.id === `acp-${agent.id}`);
        if (group !== null && group !== undefined && Array.isArray(group.models) && group.models.length > 0) {
          return group.models.length;
        }
        const tested = Array.isArray(agent.lastTest?.models) ? agent.lastTest.models.length : 0;
        return tested + 1;
      }

      const subagent = (() => {
        if (sessions === null || typeof sessions.subagentAddress !== 'function') return undefined;
        try {
          return sessions.subagentAddress(sessionId);
        } catch {
          return undefined;
        }
      })();
      if (sessionId === undefined || sessionId === null || subagent !== undefined) return null;

      const triggerMode = currentIsAcp ? t('seatAcp') : t('seatNative');
      const triggerMeta = currentIsAcp ? permissionName : currentEffortName;
      const triggerName = current === null ? t('seatLoading') : currentModelName;
      const triggerAgent = currentIsAcp && currentAgent !== null ? ` · ${currentAgent.name}` : '';
      const title = `${triggerMode}${triggerAgent} · ${triggerName}${triggerMeta === undefined ? '' : ` · ${triggerMeta}`}`;

      const availableModels = query.trim().length === 0
        ? draftModels
        : draftModels.filter((model) => `${model.name} ${model.id}`.toLowerCase().includes(query.trim().toLowerCase()));

      function row(model, selected, onClick, sub) {
        return h(
          'button',
          {
            key: model.id,
            type: 'button',
            className: 'acp-ms-row acp-ms-model-row',
            'data-selected': selected ? '1' : undefined,
            'aria-pressed': selected ? 'true' : 'false',
            disabled: pending,
            onClick,
          },
          h(
            'span',
            { className: 'acp-ms-row-main' },
            h('span', { className: 'acp-ms-row-name' }, model.name),
            sub === undefined || sub === null || sub.length === 0
              ? null
              : h('span', { className: 'acp-ms-row-sub' }, sub),
          ),
          selected ? h('span', { className: 'acp-ms-check' }, h(SeatCheckIcon)) : null,
        );
      }

      function configOptionLabel(option) {
        return option.category === 'mode' || option.id === 'mode' ? t('cascadeMode') : option.name || option.id;
      }

      function configOptionValue(option) {
        const active = draft?.config?.[option.id] ?? option.currentValue ?? option.values?.[0]?.value ?? '';
        const found = option.values.find((value) => value.value === active);
        return found?.name || active;
      }

      function cellRow(label, value, onClick, key) {
        return h(
          'button',
          {
            key: key === undefined ? label : key,
            type: 'button',
            className: 'acp-ms-cell',
            onClick,
          },
          h('span', { className: 'acp-ms-cell-label' }, label),
          h('span', { className: 'acp-ms-cell-value' }, value),
          h('span', { className: 'acp-ms-cell-chevron' }, h(SeatChevronRight)),
        );
      }

      function optionRow(label, selected, onClick, sub, key) {
        return h(
          'button',
          {
            key: key === undefined ? label : key,
            type: 'button',
            className: 'acp-ms-option',
            'data-selected': selected ? '1' : undefined,
            'aria-pressed': selected ? 'true' : 'false',
            disabled: pending,
            onClick,
          },
          h(
            'span',
            { className: 'acp-ms-option-main' },
            h('span', { className: 'acp-ms-option-label' }, label),
            sub === undefined || sub === null || sub.length === 0
              ? null
              : h('span', { className: 'acp-ms-option-sub' }, sub),
          ),
          selected ? h('span', { className: 'acp-ms-check' }, h(SeatCheckIcon)) : null,
        );
      }

      function emptyRow(text) {
        return h('div', { className: 'acp-ms-empty' }, text);
      }

      const draftModelName = draft === null
        ? t('seatModel')
        : draftModels.find((model) => model.id === draft.model)?.name ?? t('seatDefaultModel');
      const draftPermissionName = draft?.permission === 'deny' ? t('seatDeny') : t('seatAllow');
      const nativeValueName = nativeSelection === null || nativeSelection === undefined
        ? t('seatChooseModel')
        : (seatDisplayModelName(nativeModel, t) || seatStripModelId(nativeSelection.model));

      const rootRows = [];
      rootRows.push(cellRow(t('seatMode'), lane === 'acp' ? t('seatAcp') : t('seatNative'), () => setPane('mode'), 'row:mode'));
      if (lane === 'native') {
        rootRows.push(cellRow(t('seatModel'), nativeValueName, () => { setQuery(''); setPane('model'); }, 'row:model'));
        if (nativeModel?.reasoning !== undefined && nativeModel?.reasoning !== null) {
          rootRows.push(cellRow(t('seatEffort'), nativeEffortName ?? t('seatDefault'), () => setPane('effort'), 'row:effort'));
        }
      } else {
        rootRows.push(cellRow(
          t('seatAgent'),
          draftAgent?.name ?? (agentsLoaded ? t('seatNoAgentsShort') : t('seatLoading')),
          () => setPane('agent'),
          'row:agent',
        ));
        rootRows.push(cellRow(t('seatModel'), draftModelName, () => { setQuery(''); setPane('model'); }, 'row:model'));
        rootRows.push(cellRow(t('seatPermission'), draftPermissionName, () => setPane('permission'), 'row:permission'));
        if (configOptions.length > 0) {
          rootRows.push(h('div', { key: 'more', className: 'acp-ms-caption' }, t('seatMore')));
          for (const option of configOptions) {
            rootRows.push(cellRow(
              configOptionLabel(option),
              configOptionValue(option),
              () => { setParamId(option.id); setPane('param'); },
              `param:${option.id}`,
            ));
          }
        }
      }

      const paneOption = paramId === null
        ? null
        : configOptions.find((option) => option.id === paramId) ?? null;
      const paneTitle = pane === 'mode'
        ? t('seatMode')
        : pane === 'agent'
          ? t('seatAgent')
          : pane === 'model'
            ? t('seatModel')
            : pane === 'effort'
              ? t('seatEffort')
              : pane === 'permission'
                ? t('seatPermission')
                : pane === 'param'
                  ? (paneOption === null ? t('seatMore') : configOptionLabel(paneOption))
                  : '';

      const paneBody = (() => {
        if (pane === 'mode') {
          return [
            { id: 'native', label: t('seatNative') },
            { id: 'acp', label: t('seatAcp') },
          ].map((choice) => optionRow(
            choice.label,
            lane === choice.id,
            () => {
              setLane(choice.id);
              setPane('root');
              if (choice.id === 'acp') {
                if (draft !== null && draft.agentId !== null) void applyAcp(draft);
                return;
              }
              const group = nativeGroups[0] ?? null;
              const target = nativeSelection ?? (group !== null && group.models[0] !== undefined
                ? { provider: group.id, model: group.models[0].id, reasoningEffort: undefined }
                : null);
              if (target !== null && target !== undefined) {
                void chooseNative(target.provider, target.model, target.reasoningEffort);
              }
            },
            undefined,
            choice.id,
          ));
        }
        if (pane === 'agent') {
          if (!agentsLoaded) return emptyRow(t('seatLoading'));
          if (enabledAgents.length === 0) return emptyRow(t('seatNoAgents'));
          return enabledAgents.map((agent) => h(
            'button',
            {
              key: agent.id,
              type: 'button',
              className: 'acp-ms-option',
              'data-selected': draft !== null && draft.agentId === agent.id ? '1' : undefined,
              'aria-pressed': draft !== null && draft.agentId === agent.id ? 'true' : 'false',
              disabled: pending,
              onClick: () => { chooseAgent(agent); setPane('root'); },
            },
            h('span', { className: 'acp-ms-dot', 'data-tone': agent.available === false ? 'warn' : undefined }),
            h(
              'span',
              { className: 'acp-ms-option-main' },
              h('span', { className: 'acp-ms-option-label' }, agent.name),
              h(
                'span',
                { className: 'acp-ms-option-sub' },
                agent.lastTest?.ok === true
                  ? t('seatModelCount', { count: agentModelCount(agent) })
                  : t('pickerUntested'),
              ),
            ),
            draft !== null && draft.agentId === agent.id
              ? h('span', { className: 'acp-ms-check' }, h(SeatCheckIcon))
              : null,
          ));
        }
        if (pane === 'model') {
          if (lane === 'native') {
            if (nativeGroups.length === 0) {
              return emptyRow(modelState.status === 'loading' ? t('seatLoading') : t('seatNoNative'));
            }
            const nodes = [];
            for (const group of nativeGroups) {
              nodes.push(h('div', { key: `g:${group.id}`, className: 'acp-ms-caption' }, group.name));
              for (const model of group.models) {
                nodes.push(optionRow(
                  seatDisplayModelName(model, t),
                  nativeSelection !== null
                    && nativeSelection !== undefined
                    && nativeSelection.provider === group.id
                    && nativeSelection.model === model.id,
                  () => { void chooseNative(group.id, model.id, undefined); setPane('root'); },
                  undefined,
                  `${group.id}:${model.id}`,
                ));
              }
            }
            return nodes;
          }
          if (!agentsLoaded) return emptyRow(t('seatLoading'));
          if (draftAgent === null) return emptyRow(t('seatNoAgents'));
          const nodes = [];
          if (draftModels.length > 6) {
            nodes.push(h(
              'div',
              { key: 'search', className: 'acp-ms-search' },
              h('input', {
                type: 'text',
                value: query,
                placeholder: t('seatSearchModel'),
                'aria-label': t('seatSearchModel'),
                onChange: (event) => setQuery(event.target.value),
              }),
            ));
          }
          if (availableModels.length === 0) {
            nodes.push(emptyRow(t('seatNoModels')));
          } else {
            for (const model of availableModels) {
              nodes.push(optionRow(
                model.name,
                draft !== null && draft.model === model.id,
                () => { chooseModel(model.id); setPane('root'); },
                undefined,
                model.id,
              ));
            }
          }
          return nodes;
        }
        if (pane === 'effort') {
          if (nativeSelection === null || nativeSelection === undefined) return emptyRow(t('seatNoModels'));
          if (nativeModel?.reasoning === undefined || nativeModel?.reasoning === null) return emptyRow(t('seatNoModels'));
          const choices = nativeModel.reasoning.defaultEffort === undefined
            ? [{ id: '', label: t('seatDefault') }, ...nativeModel.reasoning.efforts]
            : nativeModel.reasoning.efforts;
          return choices.map((effort) => optionRow(
            effort.name ?? effort.label ?? t('seatDefault'),
            (nativeEffortId ?? '') === effort.id,
            () => {
              void chooseNative(nativeSelection.provider, nativeSelection.model, effort.id || undefined);
              setPane('root');
            },
            undefined,
            effort.id || 'default',
          ));
        }
        if (pane === 'permission') {
          return [
            { id: 'allow', label: t('seatAllow') },
            { id: 'deny', label: t('seatDeny') },
          ].map((choice) => optionRow(
            choice.label,
            (draft?.permission ?? 'allow') === choice.id,
            () => { choosePermission(choice.id); setPane('root'); },
            undefined,
            choice.id,
          ));
        }
        if (pane === 'param') {
          if (paneOption === null) return emptyRow(t('seatNoModels'));
          const active = draft?.config?.[paneOption.id] ?? paneOption.currentValue ?? paneOption.values?.[0]?.value ?? '';
          return paneOption.values.map((value) => optionRow(
            value.name || value.value,
            active === value.value,
            () => { chooseConfig(paneOption.id, value.value); setPane('root'); },
            undefined,
            value.value,
          ));
        }
        return null;
      })();

      const paneHeader = pane === 'root'
        ? null
        : h(
            'div',
            { className: 'acp-ms-pane-head' },
            h(
              'button',
              {
                type: 'button',
                className: 'acp-ms-back',
                'aria-label': t('cascadeBack'),
                onClick: () => setPane('root'),
              },
              h(SeatBackIcon),
            ),
            h('span', { className: 'acp-ms-pane-title' }, paneTitle),
          );

      const panel = open && pos !== null
        ? reactDom.createPortal(
            h(
              'div',
              {
                ref: panelRef,
                className: 'acp-ms-panel',
                role: 'dialog',
                'aria-label': t('seatMode'),
                style: {
                  left: `${pos.left}px`,
                  bottom: `${pos.bottom}px`,
                  width: `${pos.width}px`,
                  maxHeight: `${pos.maxHeight}px`,
                },
              },
              paneHeader,
              h(
                'div',
                { className: 'acp-ms-list scrollable' },
                pane === 'root' ? rootRows : paneBody,
              ),
              error !== null || pending
                ? h(
                    'div',
                    { className: 'acp-ms-status', 'data-busy': error === null ? '1' : undefined },
                    error ?? t('seatApplying'),
                  )
                : null,
            ),
            document.body,
          )
        : null;

      return h(
        React.Fragment,
        null,
        h('style', null, SEAT_CSS),
        h(
          'div',
          { className: 'acp-ms-root' },
          h(
            'button',
            {
              ref: triggerRef,
              type: 'button',
              className: 'acp-ms-trigger',
              disabled: locked,
              title,
              'aria-haspopup': 'dialog',
              'aria-expanded': open ? 'true' : 'false',
              'aria-label': title,
              onClick: toggleOpen,
            },
            h('span', { className: 'acp-ms-icon' }, h(SeatModelIcon)),
            h(
              'span',
              { className: 'acp-ms-text' },
              h('span', { className: 'acp-ms-mode', 'data-lane': currentIsAcp ? 'acp' : 'native' }, triggerMode),
              h('span', { className: 'acp-ms-name' }, triggerName),
              triggerMeta === undefined ? null : h('span', { className: 'acp-ms-meta' }, triggerMeta),
            ),
            h('span', { className: 'acp-ms-caret' }, h(SeatCaret)),
          ),
          panel,
        ),
      );
    }

    /* ------------------------------------------------------------------ */
    /* Composer seat label                                                 */
    /* ------------------------------------------------------------------ */

    const ACP_PROVIDER_PREFIX = 'acp-';

    function isAcpProvider(provider) {
      return (
        provider !== null
        && typeof provider === 'object'
        && typeof provider.id === 'string'
        && provider.id.startsWith(ACP_PROVIDER_PREFIX)
      );
    }

    function titleCaseWords(value) {
      return String(value).replace(/(^|\s)([a-z])/g, (match, space, letter) => `${space}${letter.toUpperCase()}`);
    }

    /** "Cursor Agent (ACP)" → "Cursor", falling back to the provider id. */
    function acpAgentShortLabel(provider) {
      const name =
        provider !== null && typeof provider === 'object' && typeof provider.name === 'string'
          ? provider.name
          : '';
      const trimmed = name
        .replace(/\s*\(ACP\)\s*$/i, '')
        .replace(/\s+Agent$/i, '')
        .trim();
      if (trimmed.length > 0) return trimmed;
      const id =
        provider !== null && typeof provider === 'object' && typeof provider.id === 'string'
          ? provider.id
          : '';
      const fromId = id.replace(/^acp-/i, '').replace(/-agent$/i, '').replace(/[-_]+/g, ' ').trim();
      return fromId.length > 0 ? titleCaseWords(fromId) : 'Agent';
    }

    function badgeTextFor(model) {
      const badge = model !== null && typeof model === 'object' ? model.badge : null;
      if (badge === null || typeof badge !== 'object') return null;
      const value = badge.text;
      if (typeof value === 'string') return value;
      if (value === null || typeof value !== 'object') return null;
      const lang =
        typeof document === 'undefined'
          ? ''
          : String((document.documentElement && document.documentElement.lang) || '').toLowerCase();
      if (lang && typeof value[lang] === 'string') return value[lang];
      if (typeof value.zh === 'string') return value.zh;
      if (typeof value.en === 'string') return value.en;
      const first = Object.values(value).find((entry) => typeof entry === 'string');
      return typeof first === 'string' ? first : null;
    }

    /**
     * Model seat label. The composer trigger names the ACP agent ("ACP:Cursor")
     * so the composer says which external agent answers, while menus keep the
     * model name the user is choosing.
     */
    function AcpModelSeatLabel(props) {
      const provider = props !== null && typeof props === 'object' ? props.provider : null;
      const model = props !== null && typeof props === 'object' ? props.model : null;
      const placement = props !== null && typeof props === 'object' ? props.placement : undefined;
      const name =
        model !== null && typeof model === 'object' && typeof model.name === 'string' ? model.name : '';
      if (isAcpProvider(provider) && placement === 'trigger') {
        return h('span', { className: 'acp-seat-label' }, `ACP:${acpAgentShortLabel(provider)}`);
      }
      const badge = badgeTextFor(model);
      if (badge === null) return h('span', null, name);
      const pill = h('span', { className: 'acp-seat-badge' }, badge);
      return placement === 'trigger'
        ? h('span', null, pill, ' ', name)
        : h('span', null, name, ' ', pill);
    }

    const inject = ['slots', 'locale'];

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'acp-agents: dictionaries');
      const t = ctx.locale.bind(NS);
      ctx.slots.inject('settings.section', () =>
        ctx.slots.register(
          {
            name: 'settings.section',
            id: 'external-agents',
            order: 30,
            label: () => t('nav'),
            locale: NS,
          },
          AcpPanel,
        ),
      );
      ctx.slots.inject('conversation.session.header.utilities', () =>
        ctx.slots.register(
          {
            name: 'conversation.session.header.utilities',
            id: 'acp-session-settings',
            order: 20,
            label: () => t('cascadeAgent'),
            locale: NS,
          },
          AcpSessionHeader,
        ),
      );
      ctx.slots.inject('conversation.input.model.label', () =>
        ctx.slots.register(
          {
            name: 'conversation.input.model.label',
            id: 'acp-model-seat-label',
            order: 10,
            locale: NS,
          },
          AcpModelSeatLabel,
        ),
      );
      ctx.inject(['modelDirectories', 'sessions'], (scope) => {
        const modelsService = scope.modelDirectories;
        const sessions = scope.sessions;
        ctx.slots.inject('conversation.input.model', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.model',
              locale: NS,
            },
            (props) => h(AcpModelSeatControl, { ...props, modelsService, sessions, t }),
          ),
        );
      });
    }

    return { inject, apply };
  },
});


