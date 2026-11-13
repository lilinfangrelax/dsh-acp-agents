/* Manual probe against a real local agent. Usage:
 *   node test/real-probe.mjs <id> <command> [args...]
 *
 * Not part of the shipped bundle; it exists so a real CLI can be checked
 * against the same client code the Host uses. */

import { createAcpRunner } from '../acp-client.js';
import { createLocalSubprocess } from './local-subprocess.js';

const [id, command, ...args] = process.argv.slice(2);
if (id === undefined || command === undefined) {
  console.error('usage: node test/real-probe.mjs <id> <command> [args...]');
  process.exit(2);
}
const runner = createAcpRunner({ subprocess: createLocalSubprocess(), logger: console });
try {
  const result = await runner.probe(
    { id, name: id, command, args, env: {}, permission: 'allow', model: null, cwd: process.cwd() },
    { cwd: process.cwd() },
  );
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = 0;
} catch (error) {
  console.error(`probe failed: ${error && error.message ? error.message : String(error)}`);
  if (error && error.detail) console.error(JSON.stringify(error.detail).slice(0, 2000));
  process.exitCode = 1;
} finally {
  await runner.dispose();
}
