/* Render-check the settings panel outside Chrome.
 *
 * The Web bundle needs `window.__ModuleLoader__` and a `react` module table
 * entry. This script provides both, calls the plugin's apply(), captures the
 * registered settings-section component, and server-renders it once. Effects
 * do not run during server rendering, so this checks module shape, locale
 * registration, slot registration, and the initial render tree. */

import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(process.env.TEMP || '/tmp', 'acp-react-check', 'package.json'));
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

let capturedFactory = null;
globalThis.window = {
  __ModuleLoader__: {
    load(record) {
      capturedFactory = record;
    },
  },
};

const source = await readFile(join(here, '..', 'client.js'), 'utf8');
await import(`${pathToFileURL(join(here, '..', 'client.js')).href}?t=${Date.now()}`);
if (capturedFactory === null) throw new Error('the bundle did not call window.__ModuleLoader__.load');
if (capturedFactory.id !== 'dsh-acp-agents') throw new Error(`unexpected module id ${capturedFactory.id}`);

const plugin = capturedFactory.factory((request) => {
  if (request === 'react') return React;
  if (request === 'react-dom') return { createPortal: (node) => node };
  throw new Error(`unexpected require(${request})`);
});
if (typeof plugin.apply !== 'function') throw new Error('the factory returned no apply');
if (!Array.isArray(plugin.inject) || !plugin.inject.includes('slots') || !plugin.inject.includes('locale')) {
  throw new Error(`unexpected inject list ${JSON.stringify(plugin.inject)}`);
}

const dictionaries = new Map();
const registrations = new Map();
let translate = (key, params) => {
  const template = dictionaries.get('zh')?.[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
};
const disposers = [];
const ctx = {
  effect(fn) {
    const dispose = fn();
    if (typeof dispose === 'function') disposers.push(dispose);
    return dispose;
  },
  locale: {
    register(namespace, dicts) {
      for (const [locale, dict] of Object.entries(dicts)) {
        dictionaries.set(locale, dict);
      }
      return () => {};
    },
    bind(namespace) {
      translate = (key, params) => {
        const template = dictionaries.get('zh')?.[key] ?? key;
        if (!params) return template;
        return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
      };
      return translate;
    },
  },
  slots: {
    inject(name, callback) {
      callback();
      return () => {};
    },
    register(options, Component) {
      registrations.set(options.name, { options, Component });
      return () => {};
    },
  },
  inject(names, callback) {
    const directory = {
      store: {
        subscribe: () => () => {},
        getSnapshot: () => ({ current: null, groups: [], failures: [], status: 'idle', pending: null, error: null }),
      },
      load: async () => ({}),
      select: async () => ({ ok: true }),
    };
    const scope = {
      slots: ctx.slots,
      modelDirectories: { directoryFor: () => directory },
      sessions: { subagentAddress: () => undefined },
    };
    const dispose = callback(scope);
    if (typeof dispose === 'function') disposers.push(dispose);
    return () => {};
  },
};

plugin.apply(ctx);
const settings = registrations.get('settings.section');
if (settings === undefined) throw new Error('the settings section was not registered');
if (settings.options.id !== 'external-agents') throw new Error(`unexpected section id ${settings.options.id}`);
const header = registrations.get('conversation.session.header.utilities');
if (header === undefined) throw new Error('the ACP session header control was not registered');
if (header.options.id !== 'acp-session-settings') throw new Error(`unexpected header id ${header.options.id}`);
const label = settings.options.label();
console.log('nav label:', label);
console.log('dict keys:', Object.keys(dictionaries.get('zh')).length, 'zh /', Object.keys(dictionaries.get('en')).length, 'en');
const missing = Object.keys(dictionaries.get('zh')).filter((key) => !(key in dictionaries.get('en')));
const extra = Object.keys(dictionaries.get('en')).filter((key) => !(key in dictionaries.get('zh')));
console.log('dictionary delta:', { missing, extra });

const html = renderToStaticMarkup(React.createElement(settings.Component, { t: translate }));
console.log('settings bytes:', Buffer.byteLength(html));
if (!html.includes('外部 Agent（ACP）')) throw new Error('the rendered panel is missing its title');
if (!html.includes('acp-root')) throw new Error('the rendered panel is missing its root class');
if (!html.includes('已接入的 Agent')) throw new Error('the rendered panel is missing the connected section');

const headerHtml = renderToStaticMarkup(
  React.createElement(header.Component, { t: translate, sessionId: 'live-session', testActive: true }),
);
console.log('header bytes:', Buffer.byteLength(headerHtml));
if (!headerHtml.includes('acp-cas-trigger')) throw new Error('the ACP session header chip is missing');
if (!headerHtml.includes('acp-pick-presence')) throw new Error('the ACP status dot is missing');

const seat = registrations.get('conversation.input.model.label');
if (seat === undefined) throw new Error('the composer seat label was not registered');
const control = registrations.get('conversation.input.model');
if (control === undefined) throw new Error('the composer model seat was not registered');
const controlHtml = renderToStaticMarkup(
  React.createElement(control.Component, { t: translate, sessionId: 'live-session', locked: false }),
);
console.log('seat control bytes:', Buffer.byteLength(controlHtml));
if (!controlHtml.includes('acp-ms-trigger')) throw new Error(`the composer model seat is missing its trigger: ${controlHtml}`);
if (!controlHtml.includes('原生')) throw new Error('the composer model seat is missing its native label');
const renderSeat = (props) => renderToStaticMarkup(React.createElement(seat.Component, props));
const acpProvider = { id: 'acp-cursor-agent', name: 'Cursor Agent (ACP)' };
const acpModel = {
  id: 'default[]',
  name: 'Auto',
  badge: { text: { en: 'ACP:Cursor', zh: 'ACP:Cursor' }, tone: 'info' },
};

const seatTrigger = renderSeat({ provider: acpProvider, model: acpModel, placement: 'trigger', selected: true });
console.log('seat trigger:', seatTrigger);
if (!seatTrigger.includes('ACP:Cursor')) throw new Error(`the trigger seat lost the ACP name: ${seatTrigger}`);
if (seatTrigger.includes('Auto')) throw new Error(`the trigger seat should not repeat the model name: ${seatTrigger}`);

const seatMenu = renderSeat({ provider: acpProvider, model: acpModel, placement: 'menu', selected: true });
console.log('seat menu:', seatMenu);
if (!seatMenu.includes('Auto')) throw new Error(`the menu seat lost the model name: ${seatMenu}`);
if (!seatMenu.includes('ACP:Cursor')) throw new Error(`the menu seat lost the ACP badge: ${seatMenu}`);

const seatOther = renderSeat({
  provider: { id: 'deepseek-official', name: 'DeepSeek' },
  model: { id: 'deepseek-flash', name: 'deepseek-flash' },
  placement: 'trigger',
  selected: true,
});
console.log('seat other:', seatOther);
if (seatOther !== '<span>deepseek-flash</span>') throw new Error(`unexpected non-ACP trigger seat: ${seatOther}`);

const seatIdFallback = renderSeat({ provider: { id: 'acp-opencode-agent', name: '' }, model: acpModel, placement: 'trigger' });
console.log('seat id fallback:', seatIdFallback);
if (!seatIdFallback.includes('ACP:Opencode')) throw new Error(`unexpected id fallback: ${seatIdFallback}`);
console.log('ok');
for (const dispose of disposers.reverse()) dispose();
