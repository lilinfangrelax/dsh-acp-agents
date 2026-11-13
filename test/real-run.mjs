/* Manual end-to-end run against a real local agent. Usage:
 *   node test/real-run.mjs <id> <command> [args...] -- <task>
 *
 * Not part of the shipped bundle. Set ACP_TEST_MODEL to select a model. */

import { createAcpRunner } from '../acp-client.js';
import { createLocalSubprocess } from './local-subprocess.js';

const separator = process.argv.indexOf('--');
const argv = process.argv.slice(2);
const head = separator === -1 ? argv : argv.slice(0, separator - 2);
const task = separator === -1 ? 'Reply with the single word: pong. Do not call any tools.' : argv.slice(separator - 1).join(' ');
const [id, command, ...args] = head;
if (id === undefined || command === undefined) {
  console.error('usage: node test/real-run.mjs <id> <command> [args...] -- [task]');
  process.exit(2);
}
const runner = createAcpRunner({ subprocess: createLocalSubprocess(), logger: console });
const started = Date.now();
try {
  const run = await runner.start(
    {
      id,
      name: id,
      command,
      args,
      env: {},
      permission: 'allow',
      model: process.env.ACP_TEST_MODEL ?? null,
      cwd: process.cwd(),
    },
    {
      prompt: [{ type: 'text', text: task }],
      signal: new AbortController().signal,
    },
  );
  const result = await run.result;
  console.log(JSON.stringify({ elapsedMs: Date.now() - started, result }, null, 2));
  await run.dispose();
  process.exitCode = result.stopReason === 'completed' ? 0 : 1;
} catch (error) {
  console.error(`run failed: ${error && error.message ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await runner.dispose();
}
