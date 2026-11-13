/* Durable state for the ACP agents plugin.
 *
 * Configuration and the registry snapshot live under `$DSH_HOME/acp-agents/`,
 * not in the user's cordis patch: the settings page edits its own document
 * through the authenticated Host routes, and the file survives upgrades of
 * this bundle. Writes are serialized by the manager and published by rename.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

const CONFIG_FILE = 'config.json';
const REGISTRY_FILE = 'registry.json';
const SESSION_FILE = 'sessions.json';
const CONFIG_VERSION = 1;
const SESSION_VERSION = 1;
export const MAX_SESSION_RECORDS = 500;
const MAX_SESSION_KEY_LENGTH = 120;
const MAX_SESSION_ID_LENGTH = 300;
const MAX_SESSION_CWD_LENGTH = 1_000;
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,47}$/;

export const DEFAULT_MAX_IDLE_CONNECTIONS = 5;
const MAX_IDLE_CONNECTIONS = 50;

export function acpDataDir() {
  const home = process.env.DSH_HOME && process.env.DSH_HOME.length > 0 ? process.env.DSH_HOME : join(homedir(), '.dsh');
  return join(home, 'acp-agents');
}

export function configPath() {
  return join(acpDataDir(), CONFIG_FILE);
}

export function registryPath() {
  return join(acpDataDir(), REGISTRY_FILE);
}

export function sessionStorePath() {
  return join(acpDataDir(), SESSION_FILE);
}

export async function readJsonFile(path, fallback) {
  try {
    const text = await readFile(path, 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback;
    throw error;
  }
}

export async function writeJsonFile(path, value) {
  await mkdir(acpDataDir(), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, path);
}

function text(value) {
  return typeof value === 'string' ? value : '';
}

function slugify(value) {
  const slug = text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug.length > 0 ? slug : 'agent';
}

export function uniqueId(base, taken) {
  const stem = ID_PATTERN.test(base) ? base : slugify(base);
  if (!taken.has(stem)) return stem;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${stem}-${index}`.slice(0, 48);
    if (!taken.has(candidate)) return candidate;
  }
  return `${stem}-${Date.now().toString(36)}`.slice(0, 48);
}

function stringArray(value, label) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`${label} must be an array of strings`);
  return value.map((entry) => {
    if (typeof entry !== 'string') throw new Error(`${label} must be an array of strings`);
    return entry;
  });
}

function stringRecord(value, label) {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object of strings`);
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') throw new Error(`${label}.${key} must be a string`);
    if (key.length > 0) result[key] = entry;
  }
  return result;
}

function boundedString(value, max) {
  const result = text(value).trim().slice(0, max);
  return result.length > 0 ? result : null;
}

function normalizeNativeSelection(value) {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return null;
  const provider = boundedString(value.provider, 200);
  const model = boundedString(value.model, 200);
  if (provider === null || model === null) return null;
  const reasoningEffort = boundedString(value.reasoningEffort, 80);
  return { provider, model, ...(reasoningEffort === null ? {} : { reasoningEffort }) };
}

function normalizeAcpSelection(value) {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return null;
  const agentId = boundedString(value.agentId, 80);
  if (agentId === null) return null;
  const model = boundedString(value.model, 200) ?? 'default';
  const permission = value.permission === 'deny' ? 'deny' : 'allow';
  const config = {};
  if (value.config !== null && typeof value.config === 'object' && !Array.isArray(value.config)) {
    for (const [key, entry] of Object.entries(value.config).slice(0, 64)) {
      if (key.length === 0 || key.length > 80 || typeof entry !== 'string' || entry.length > 200) continue;
      config[key] = entry;
    }
  }
  return { agentId, model, permission, config };
}

/** Last composer selection, persisted so a new conversation reuses it. */
export function normalizeSelection(value) {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return null;
  const lane = value.lane === 'acp' || value.lane === 'native' ? value.lane : null;
  if (lane === null) return null;
  const native = normalizeNativeSelection(value.native);
  const acp = normalizeAcpSelection(value.acp);
  if (lane === 'native' && native === null) return null;
  if (lane === 'acp' && acp === null) return null;
  return { lane, native, acp };
}

/** Partial update; absent fields keep their previous value, null clears one. */
export function normalizeSelectionPatch(value) {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return {};
  const patch = {};
  if (value.lane === 'native' || value.lane === 'acp') patch.lane = value.lane;
  if (value.native !== undefined) patch.native = normalizeNativeSelection(value.native);
  if (value.acp !== undefined) patch.acp = normalizeAcpSelection(value.acp);
  return patch;
}

/** How many idle ACP connections stay loaded; 0 releases every turn. */
export function normalizeMaxIdleConnections(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_MAX_IDLE_CONNECTIONS;
  return Math.min(MAX_IDLE_CONNECTIONS, Math.max(0, Math.trunc(number)));
}

/**
 * One Harness session → ACP session mapping used for resume.
 *
 * Only the launch fingerprint is stored, never the agent record itself: the
 * agent's `env` may carry credentials and must not reach this file.
 */
export function normalizeSessionRecord(value, key) {
  const id = text(key).trim();
  if (id.length === 0 || id.length > MAX_SESSION_KEY_LENGTH || id.startsWith('acp-ephemeral-')) return null;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const acpSessionId = text(value.acpSessionId).trim().slice(0, MAX_SESSION_ID_LENGTH);
  const agentId = text(value.agentId).trim().slice(0, 80);
  const snapshotKey = text(value.snapshotKey).trim().slice(0, 64);
  const cwd = text(value.cwd).trim().slice(0, MAX_SESSION_CWD_LENGTH);
  if (acpSessionId.length === 0 || agentId.length === 0 || snapshotKey.length === 0 || cwd.length === 0) return null;
  const method = value.method === 'session/resume' || value.method === 'session/load' ? value.method : null;
  const updatedAt = Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : 0;
  return { acpSessionId, agentId, snapshotKey, cwd, ...(method === null ? {} : { method }), updatedAt };
}

/** Missing or corrupt files degrade to "no resumable sessions". */
export async function loadSessionRecords() {
  const raw = await readJsonFile(sessionStorePath(), null).catch(() => null);
  const records = new Map();
  const sessions = raw && typeof raw === 'object' && raw.sessions !== null && typeof raw.sessions === 'object' ? raw.sessions : null;
  if (sessions === null) return records;
  for (const [key, value] of Object.entries(sessions)) {
    const record = normalizeSessionRecord(value, key);
    if (record !== null) records.set(key, record);
  }
  return records;
}

export async function saveSessionRecords(records) {
  const entries = [...records.entries()].sort((left, right) => right[1].updatedAt - left[1].updatedAt).slice(0, MAX_SESSION_RECORDS);
  const sessions = {};
  for (const [key, record] of entries) sessions[key] = record;
  await writeJsonFile(sessionStorePath(), { version: SESSION_VERSION, sessions });
}

/**
 * Validate one incoming agent edit and produce the durable record.
 *
 * `existing` is the record being edited (or undefined for a new agent);
 * `taken` is the set of every other id in the document.
 */
export function normalizeAgent(input, { existing, taken, now = Date.now() } = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('agent must be an object');
  }
  const command = text(input.command).trim();
  if (command.length === 0) throw new Error('command is required');
  if (!isAbsolute(command)) {
    if (command.includes('/') || command.includes('\\')) {
      throw new Error('command must be a bare program name found on PATH or an absolute path');
    }
    if (/\s/.test(command)) throw new Error('command must not contain whitespace');
  }
  const requestedId = text(input.id).trim();
  let id;
  if (existing !== undefined) {
    id = existing.id;
  } else if (requestedId.length > 0) {
    id = ID_PATTERN.test(requestedId) ? requestedId : slugify(requestedId);
    if (taken.has(id)) throw new Error(`agent id "${id}" already exists`);
  } else {
    id = uniqueId(slugify(text(input.name) || command), taken);
  }
  const name = text(input.name).trim().slice(0, 80) || id;
  const cwd = text(input.cwd).trim();
  if (cwd.length > 0 && !isAbsolute(cwd)) throw new Error('cwd must be an absolute path');
  const model = text(input.model).trim();
  const source = ['builtin', 'registry', 'detected', 'manual'].includes(input.source)
    ? input.source
    : existing?.source ?? 'manual';
  const registryId = text(input.registryId).trim() || existing?.registryId || null;
  return {
    id,
    name,
    command,
    args: stringArray(input.args, 'args'),
    env: stringRecord(input.env, 'env'),
    enabled: input.enabled === undefined ? existing?.enabled ?? true : input.enabled === true,
    permission: input.permission === 'deny' ? 'deny' : input.permission === 'allow' ? 'allow' : existing?.permission ?? 'allow',
    model: model.length > 0 ? model : null,
    cwd: cwd.length > 0 ? cwd : existing?.cwd ?? null,
    source,
    registryId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastTest: existing?.lastTest ?? null,
  };
}

export async function loadConfig() {
  const raw = await readJsonFile(configPath(), null);
  if (raw === null || typeof raw !== 'object' || !Array.isArray(raw.agents)) {
    return {
      version: CONFIG_VERSION,
      agents: [],
      defaultAgent: null,
      updatedAt: null,
      lastSelection: null,
      maxIdleConnections: DEFAULT_MAX_IDLE_CONNECTIONS,
    };
  }
  const agents = [];
  for (const entry of raw.agents) {
    if (entry === null || typeof entry !== 'object') continue;
    try {
      const normalized = normalizeAgent(entry, {
        existing: {
          id: ID_PATTERN.test(text(entry.id)) ? entry.id : slugify(text(entry.name) || text(entry.command)),
          source: entry.source,
          enabled: entry.enabled !== false,
          permission: entry.permission === 'deny' ? 'deny' : 'allow',
          cwd: text(entry.cwd) || null,
          registryId: text(entry.registryId) || null,
          createdAt: entry.createdAt,
          lastTest: entry.lastTest ?? null,
        },
        taken: new Set(agents.map((agent) => agent.id)),
      });
      agents.push(normalized);
    } catch {
      /* A single corrupt row must not hide the rest of the document. */
    }
  }
  const defaultAgent =
    typeof raw.defaultAgent === 'string' && agents.some((agent) => agent.id === raw.defaultAgent)
      ? raw.defaultAgent
      : agents[0]?.id ?? null;
  return {
    version: CONFIG_VERSION,
    agents,
    defaultAgent,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : null,
    lastSelection: normalizeSelection(raw.lastSelection),
    maxIdleConnections: normalizeMaxIdleConnections(raw.maxIdleConnections),
  };
}

export async function saveConfig(config) {
  const document = {
    version: CONFIG_VERSION,
    updatedAt: Date.now(),
    defaultAgent: config.defaultAgent ?? config.agents[0]?.id ?? null,
    agents: config.agents,
    lastSelection: config.lastSelection ?? null,
    maxIdleConnections: normalizeMaxIdleConnections(config.maxIdleConnections),
  };
  await writeJsonFile(configPath(), document);
  return { ...config, ...document };
}

export async function loadRegistryCache() {
  const raw = await readJsonFile(registryPath(), null);
  if (raw === null || typeof raw !== 'object' || !Array.isArray(raw.agents)) return null;
  return {
    version: text(raw.version) || 'unknown',
    fetchedAt: typeof raw.fetchedAt === 'number' ? raw.fetchedAt : 0,
    agents: raw.agents,
  };
}

export async function saveRegistryCache(registry) {
  await writeJsonFile(registryPath(), registry);
}

/** Compact registry row for the HTTP state payload. */
export function registrySummary(registry) {
  if (registry === null) return null;
  return {
    version: registry.version,
    fetchedAt: registry.fetchedAt,
    agents: registry.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      version: agent.version,
      description: agent.description,
      website: agent.website,
      repository: agent.repository,
      license: agent.license,
      icon: agent.icon,
      distributionKind: agent.distributionKind,
      package: agent.package,
      launchKind: agent.launch?.kind ?? null,
      command: agent.launch?.command ?? null,
      args: agent.launch?.args ?? null,
      env: agent.launch?.env ?? {},
    })),
  };
}
