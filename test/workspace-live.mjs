/* Real-Agent smoke test for the independent ACP workspace (no HTTP).
 *
 * Usage: node test/workspace-live.mjs
 *   ACP_SMOKE_AGENT  agent id to prefer (default: cursor-agent, else the first enabled one)
 *   ACP_SMOKE_CWD    working directory handed to the agent (default: process.cwd())
 *   ACP_CONFIG       config file to read (default: $DSH_HOME/acp-agents/config.json)
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createAcpWorkspace } from '../workspace.js';
import { createLocalSubprocess } from './local-subprocess.js';

const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh');
const configPath = process.env.ACP_CONFIG ?? join(dshHome, 'acp-agents', 'config.json');
const cwd = process.env.ACP_SMOKE_CWD ?? process.cwd();
const preferredAgent = process.env.ACP_SMOKE_AGENT ?? 'cursor-agent';

const config = JSON.parse(readFileSync(configPath, 'utf8'));
const agents = (config.agents ?? []).filter((agent) => agent.enabled);
const agent = agents.find((entry) => entry.id === preferredAgent) ?? agents[0];
if (!agent) throw new Error(`no enabled agent in ${configPath}`);

const logs = [];
const workspace = createAcpWorkspace({
  ctx: {
    get(name) {
      if (name === 'workingDirectory') return { defaultDirectory: cwd };
      return undefined;
    },
  },
  subprocess: createLocalSubprocess(),
  logger: { info() {}, warn() {}, debug() {} },
  readAgents: () => agents,
  defaultCwd: () => cwd,
  onOptions: () => {},
});

const chat = await workspace.open({ agentId: agent.id, permission: 'allow' });
console.log('opened', chat.id, chat.agentName, 'models', chat.models.length, 'cwd', chat.cwd);
const events = [];
const unsubscribe = workspace.subscribe(chat.id, 0, (event) => {
  events.push(event);
  if (event.kind === 'assistant') logs.push(event.delta);
  if (event.kind === 'tool') console.log('tool', event.status, event.title);
});
await workspace.send({ chatId: chat.id, text: 'Reply with exactly: workspace-pong' });
const started = Date.now();
while (!events.some((event) => event.kind === 'done')) {
  if (Date.now() - started > 120000) throw new Error('timeout');
  await new Promise((resolve) => setTimeout(resolve, 100));
}
console.log('text:', logs.join('').trim());
console.log('done:', events.find((event) => event.kind === 'done'));
unsubscribe();
await workspace.close({ chatId: chat.id });
await workspace.dispose();
