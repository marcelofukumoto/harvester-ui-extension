// Saved custom shortcuts live in the user preference as a JSON list. Older entries are a bare list of
// recorded keydown events; newer ones are { name, keys } so the shortcut can carry a name.

const KEY_LABELS = {
  Control: 'Ctrl',
  Escape:  'Esc',
  Delete:  'Del',
  ' ':     'Space',
};

export function keyLabel(key = '') {
  if (KEY_LABELS[key]) {
    return KEY_LABELS[key];
  }

  return key.length === 1 ? key.toUpperCase() : key;
}

export function normalizeShortcut(item) {
  if (Array.isArray(item)) {
    return { name: '', keys: item };
  }

  return { name: item?.name || '', keys: Array.isArray(item?.keys) ? item.keys : [] };
}

export function shortcutLabels(shortcut) {
  return (shortcut?.keys || []).map((K) => keyLabel(K.key));
}

// Two shortcuts are the same when they press the same keys, whatever they are called.
export function shortcutId(shortcut) {
  return (shortcut?.keys || []).map((K) => K.code || K.key).join('+');
}
