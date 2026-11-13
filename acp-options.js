/* Shared ACP session-config helpers for the workspace and model routes. */

function text(value) {
  return typeof value === 'string' ? value : '';
}

/** Flatten a select option's values, including grouped values. */
export function valuesOf(options) {
  const values = [];
  for (const entry of Array.isArray(options) ? options : []) {
    if (Array.isArray(entry?.options)) {
      for (const nested of entry.options) {
        if (nested && typeof nested.value === 'string') {
          values.push({ value: nested.value, name: text(nested.name) || nested.value });
        }
      }
    } else if (entry && typeof entry.value === 'string') {
      values.push({ value: entry.value, name: text(entry.name) || entry.value });
    }
  }
  return values;
}

export function modelOptionOf(configOptions) {
  if (!Array.isArray(configOptions)) return null;
  const selects = configOptions.filter((option) => option && option.type === 'select');
  const option =
    selects.find((entry) => entry.category === 'model') ??
    selects.find((entry) => entry.id === 'model') ??
    selects.find((entry) => /model/i.test(text(entry.name)) || /model/i.test(text(entry.id)));
  if (!option) return null;
  return {
    configId: text(option.id),
    currentValue: text(option.currentValue),
    models: valuesOf(option.options),
  };
}

export function modeOptionOf(configOptions) {
  if (!Array.isArray(configOptions)) return null;
  const selects = configOptions.filter((option) => option && option.type === 'select');
  const option =
    selects.find((entry) => entry.category === 'mode') ??
    selects.find((entry) => entry.id === 'mode') ??
    selects.find((entry) => /mode/i.test(text(entry.name)) || /mode/i.test(text(entry.id)));
  if (!option) return null;
  return {
    configId: text(option.id),
    currentValue: text(option.currentValue),
    name: text(option.name) || 'Mode',
    values: valuesOf(option.options),
  };
}

export function compactConfigOptions(configOptions) {
  if (!Array.isArray(configOptions)) return [];
  const out = [];
  for (const option of configOptions) {
    if (!option || option.type !== 'select') continue;
    out.push({
      id: text(option.id),
      name: text(option.name),
      type: 'select',
      category: option.category ?? null,
      currentValue: option.currentValue ?? null,
      values: valuesOf(option.options),
    });
  }
  return out;
}

export function pickAllowOption(options) {
  if (!Array.isArray(options)) return null;
  for (const kind of ['allow_once', 'allow_always']) {
    const found = options.find((option) => option && option.kind === kind && typeof option.optionId === 'string');
    if (found !== undefined) return found;
  }
  return null;
}
