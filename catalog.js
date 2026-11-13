/* Catalog: the built-in launch knowledge for ACP-capable agents, the official
 * ACP Registry client, and local detection.
 *
 * The registry (https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json)
 * is the authoritative list of agents and their distribution. A small built-in
 * table supplies launch arguments for the agents people most often install
 * globally, because an `npx` entry alone does not name the local binary.
 */

import { basename } from 'node:path';

export const REGISTRY_URL = 'https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json';

/**
 * Local launch knowledge for agents that are commonly installed as a CLI.
 * `registryId` links a row to its registry description and icon.
 */
export const KNOWN_AGENTS = [
  {
    id: 'opencode',
    name: 'OpenCode',
    description: 'The open source coding agent.',
    command: 'opencode',
    args: ['acp'],
    registryId: 'opencode',
    website: 'https://opencode.ai',
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    description: "Google's official CLI for Gemini.",
    command: 'gemini',
    args: ['--acp'],
    registryId: 'gemini',
    website: 'https://geminicli.com',
  },
  {
    id: 'codex-acp',
    name: 'Codex',
    description: "ACP adapter for OpenAI's coding assistant.",
    command: 'codex-acp',
    args: [],
    registryId: 'codex-acp',
    website: 'https://github.com/agentclientprotocol/codex-acp',
  },
  {
    id: 'claude-agent-acp',
    name: 'Claude Agent',
    description: "ACP wrapper for Anthropic's Claude.",
    command: 'claude-agent-acp',
    args: [],
    registryId: 'claude-acp',
    website: 'https://github.com/agentclientprotocol/claude-agent-acp',
  },
  {
    id: 'cursor-agent',
    name: 'Cursor Agent',
    description: "Cursor's coding agent CLI.",
    command: 'cursor-agent',
    args: ['acp'],
    registryId: 'cursor',
    website: 'https://cursor.com/docs/cli/acp',
  },
  {
    id: 'qwen',
    name: 'Qwen Code',
    description: "Alibaba's Qwen coding assistant.",
    command: 'qwen',
    args: ['--acp', '--experimental-skills'],
    registryId: 'qwen-code',
    website: 'https://qwenlm.github.io/qwen-code-docs/en/users/overview',
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    description: "GitHub's AI pair programmer CLI.",
    command: 'copilot',
    args: ['--acp'],
    registryId: 'github-copilot-cli',
    website: 'https://github.com/features/copilot/cli/',
  },
  {
    id: 'cline',
    name: 'Cline',
    description: 'Autonomous coding agent CLI with ACP support.',
    command: 'cline',
    args: ['--acp'],
    registryId: 'cline',
    website: 'https://cline.bot/cli',
  },
  {
    id: 'auggie',
    name: 'Auggie CLI',
    description: "Augment Code's software agent.",
    command: 'auggie',
    args: ['--acp'],
    env: { AUGMENT_DISABLE_AUTO_UPDATE: '1' },
    registryId: 'auggie',
    website: 'https://www.augmentcode.com/',
  },
  {
    id: 'kimi',
    name: 'Kimi',
    description: "Moonshot AI's coding agent.",
    command: 'kimi',
    args: ['acp'],
    registryId: 'kimi-code',
    website: 'https://moonshotai.github.io/kimi-code/',
  },
  {
    id: 'goose',
    name: 'Goose',
    description: 'A local, extensible, open source AI agent.',
    command: 'goose',
    args: ['acp'],
    registryId: 'goose',
    website: 'https://block.github.io/goose/',
  },
  {
    id: 'droid',
    name: 'Factory Droid',
    description: 'AI coding agent powered by Factory AI.',
    command: 'droid',
    args: ['exec', '--output-format', 'acp-daemon'],
    registryId: 'factory-droid',
    website: 'https://factory.ai/product/cli',
  },
  {
    id: 'amp-acp',
    name: 'Amp',
    description: 'ACP wrapper for Amp.',
    command: 'amp-acp',
    args: [],
    registryId: 'amp-acp',
    website: 'https://github.com/tao12345666333/amp-acp',
  },
  {
    id: 'kiro-cli',
    name: 'Kiro CLI',
    description: 'The Kiro coding agent.',
    command: 'kiro-cli',
    args: ['acp', '--agent-engine=v3'],
    registryId: 'kiro',
    website: 'https://kiro.dev/docs/cli/acp/',
  },
  {
    id: 'devin',
    name: 'Devin',
    description: 'Devin CLI coding agent by Cognition.',
    command: 'devin',
    args: ['acp'],
    registryId: 'devin',
    website: 'https://docs.devin.ai/cli',
  },
  {
    id: 'junie',
    name: 'Junie',
    description: 'AI Coding Agent by JetBrains.',
    command: 'junie',
    args: ['--acp=true'],
    registryId: 'junie',
    website: 'https://junie.jetbrains.com',
  },
  {
    id: 'vibe-acp',
    name: 'Mistral Vibe',
    description: "Mistral's open-source coding assistant.",
    command: 'vibe-acp',
    args: [],
    registryId: 'mistral-vibe',
    website: 'https://mistral.ai/products/vibe',
  },
  {
    id: 'dsh',
    name: 'DeepSeek Harness',
    description: 'Run a second DeepSeek Harness process in its ACP automation profile.',
    command: 'dsh',
    args: ['--profile', 'acp'],
    registryId: null,
    website: 'https://github.com/deepseek-ai/deepseek-harness',
  },
];

/** Map Node's platform/arch names to the registry's distribution keys. */
export function platformKey(platform = process.platform, arch = process.arch) {
  const normalizedArch =
    arch === 'x64' ? 'x86_64' : arch === 'arm64' ? 'aarch64' : arch === 'ia32' ? 'x86' : arch;
  return `${platform}-${normalizedArch}`;
}

function text(value) {
  return typeof value === 'string' ? value : '';
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [];
}

function stringRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') result[key] = entry;
  }
  return result;
}

function binaryCommand(cmd) {
  const name = basename(text(cmd).replace(/\\/g, '/'));
  return name.replace(/\.(exe|cmd|bat|com)$/i, '');
}

/**
 * Normalize one registry agent into the shape the settings page consumes.
 * `launch` is the local command plan used for detection and for adding the
 * agent; it is null when this platform has no runnable distribution.
 */
export function normalizeRegistryAgent(raw, platform = platformKey()) {
  if (raw === null || typeof raw !== 'object') return null;
  const id = text(raw.id);
  const name = text(raw.name);
  if (id.length === 0 || name.length === 0) return null;
  const distribution = raw.distribution !== null && typeof raw.distribution === 'object' ? raw.distribution : {};
  let kind = null;
  let launch = null;
  let packageName = null;
  let archive = null;

  if (distribution.npx !== null && typeof distribution.npx === 'object') {
    kind = 'npx';
    packageName = text(distribution.npx.package);
    const args = ['-y'];
    if (packageName.length > 0) args.push(packageName);
    args.push(...stringArray(distribution.npx.args));
    launch = {
      kind: 'npx',
      command: 'npx',
      args,
      env: stringRecord(distribution.npx.env),
      package: packageName,
    };
  } else if (distribution.uvx !== null && typeof distribution.uvx === 'object') {
    kind = 'uvx';
    packageName = text(distribution.uvx.package);
    const args = [];
    if (packageName.length > 0) args.push(packageName);
    args.push(...stringArray(distribution.uvx.args));
    launch = {
      kind: 'uvx',
      command: 'uvx',
      args,
      env: stringRecord(distribution.uvx.env),
      package: packageName,
    };
  } else if (distribution.binary !== null && typeof distribution.binary === 'object') {
    kind = 'binary';
    const entry = distribution.binary[platform];
    if (entry !== null && typeof entry === 'object') {
      const command = binaryCommand(entry.cmd);
      if (command.length > 0) {
        launch = {
          kind: 'binary',
          command,
          args: stringArray(entry.args),
          env: {},
          archive: text(entry.archive),
        };
      }
      archive = text(entry.archive);
    }
  }

  return {
    id,
    name,
    version: text(raw.version),
    description: text(raw.description),
    website: text(raw.website) || text(raw.repository),
    repository: text(raw.repository),
    license: text(raw.license),
    authors: stringArray(raw.authors),
    icon: text(raw.icon),
    distributionKind: kind,
    package: packageName,
    archive,
    launch,
  };
}

/**
 * Parse a registry payload. Returns null when the shape is not a registry.
 */
export function parseRegistry(payload, platform = platformKey()) {
  if (payload === null || typeof payload !== 'object' || !Array.isArray(payload.agents)) return null;
  const agents = [];
  for (const raw of payload.agents) {
    const normalized = normalizeRegistryAgent(raw, platform);
    if (normalized !== null) agents.push(normalized);
  }
  agents.sort((a, b) => a.name.localeCompare(b.name));
  return {
    version: text(payload.version) || 'unknown',
    fetchedAt: Date.now(),
    agents,
  };
}

/**
 * Build the detection/attachment candidates: built-in rows plus registry
 * binary distributions. Duplicates resolve toward the built-in row while
 * inheriting registry metadata.
 */
export function buildCandidates(registry) {
  const candidates = [];
  const byCommand = new Map();
  const registryById = new Map();
  if (registry !== null) {
    for (const agent of registry.agents) registryById.set(agent.id, agent);
  }

  for (const known of KNOWN_AGENTS) {
    const registryAgent = known.registryId === null ? null : registryById.get(known.registryId) ?? null;
    const candidate = {
      key: known.id,
      name: known.name,
      description: known.description || registryAgent?.description || '',
      command: known.command,
      args: [...known.args],
      env: { ...(known.env ?? {}), ...(registryAgent?.launch?.kind === 'binary' ? registryAgent.launch.env : {}) },
      source: 'builtin',
      registryId: known.registryId,
      website: known.website || registryAgent?.website || '',
      icon: registryAgent?.icon ?? '',
      distributionKind: 'local',
      package: null,
    };
    candidates.push(candidate);
    byCommand.set(candidate.command.toLowerCase(), candidate);
  }

  if (registry !== null) {
    for (const agent of registry.agents) {
      if (agent.launch === null || agent.launch.kind !== 'binary') continue;
      const command = agent.launch.command.toLowerCase();
      const existing = byCommand.get(command);
      if (existing !== undefined) {
        existing.registryId = existing.registryId ?? agent.id;
        existing.icon = existing.icon || agent.icon;
        existing.website = existing.website || agent.website;
        existing.description = existing.description || agent.description;
        continue;
      }
      const candidate = {
        key: agent.id,
        name: agent.name,
        description: agent.description,
        command: agent.launch.command,
        args: [...agent.launch.args],
        env: { ...agent.launch.env },
        source: 'registry',
        registryId: agent.id,
        website: agent.website,
        icon: agent.icon,
        distributionKind: 'binary',
        package: null,
      };
      candidates.push(candidate);
      byCommand.set(command, candidate);
    }
  }

  return candidates;
}

/**
 * Resolve every candidate's executable in parallel using the Host seam.
 * `resolveExecutable` throws for a PATH miss, which is the normal case.
 */
export async function detectCandidates(subprocess, candidates) {
  const results = new Map();
  await Promise.all(
    candidates.map(async (candidate) => {
      try {
        const executable = await subprocess.resolveExecutable(candidate.command);
        results.set(candidate.key, {
          available: true,
          executable,
          reason: null,
        });
      } catch (error) {
        results.set(candidate.key, {
          available: false,
          executable: null,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );
  return results;
}

/** Fetch the official registry JSON. Throws on network, status, or shape failure. */
export async function fetchRegistry({ url = REGISTRY_URL, timeoutMs = 20_000, fetchImpl = fetch, platform } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1_000, timeoutMs));
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': 'deepseek-harness-acp-agents/1.0' },
    });
    if (!response.ok) throw new Error(`ACP registry answered HTTP ${response.status}`);
    const payload = await response.json();
    const registry = parseRegistry(payload, platform);
    if (registry === null) throw new Error('ACP registry payload has no agents array');
    return registry;
  } finally {
    clearTimeout(timer);
  }
}
