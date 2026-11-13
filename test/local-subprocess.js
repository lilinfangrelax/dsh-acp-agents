/* Local stand-in for DSH's `ctx.subprocess` seam, used only by the plugin's
 * Node-level tests so the ACP client can be exercised without booting a Host. */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, extname, isAbsolute, join, resolve } from 'node:path';

function candidatesFor(command) {
  if (isAbsolute(command)) return [command];
  const extensions = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', '.com', ''] : [''];
  const directories = (process.env.PATH || '').split(delimiter).filter(Boolean);
  const result = [];
  for (const directory of directories) {
    for (const extension of extensions) result.push(join(directory, command + extension));
  }
  return result;
}

export function createLocalSubprocess() {
  return {
    async resolveExecutable(command) {
      for (const candidate of candidatesFor(command)) {
        if (existsSync(candidate)) return resolve(candidate);
      }
      throw new Error(`command ${JSON.stringify(command)} was not found on PATH`);
    },
    spawn(spec) {
      const [file, ...args] = spec.argv;
      const child = spawn(file, args, {
        cwd: spec.cwd,
        env: { ...process.env, ...(spec.env || {}) },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      const done = new Promise((settle, fail) => {
        child.once('error', fail);
        child.once('exit', (exitCode, signal) => settle({ exitCode, signal }));
      });
      const exit = done.then(() => undefined, () => undefined);
      return {
        stdin: child.stdin,
        stdout: child.stdout,
        stderr: child.stderr,
        done,
        terminate() {
          if (process.platform === 'win32') {
            try {
              spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
            } catch {
              child.kill();
            }
          } else {
            child.kill('SIGTERM');
          }
        },
        waitForExit() {
          return exit;
        },
      };
    },
  };
}
