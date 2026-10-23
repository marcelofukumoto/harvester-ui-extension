import { shallowMount } from '@vue/test-utils';
import NovncShortcutKeysMenu from '../NovncShortcutKeysMenu.vue';
import {
  keyLabel, normalizeShortcut, readShortcuts, shortcutLabels, writeShortcuts, SHORTCUTS_PREFERENCE, SHORTCUT_NAMES_PREFERENCE
} from '../shortcuts';

const mountMenu = (props = {}) => shallowMount(NovncShortcutKeysMenu, { props });

describe('component: NovncShortcutKeysMenu', () => {
  it('should send a key on its own when no modifier is held', () => {
    const wrapper = mountMenu();

    wrapper.vm.sendKey('F5');

    expect(wrapper.emitted('send-keys')).toStrictEqual([[['F5']]]);
  });

  it('should send held modifiers with the next key and then release them', () => {
    const wrapper = mountMenu();

    wrapper.vm.toggleModifier('AltLeft', true);
    wrapper.vm.toggleModifier('ControlLeft', true);
    expect(wrapper.vm.heldCombo).toBe('Ctrl+Alt');

    wrapper.vm.sendKey('F2');

    expect(wrapper.emitted('send-keys')).toStrictEqual([[['ControlLeft', 'AltLeft', 'F2']]]);
    expect(wrapper.vm.held).toStrictEqual([]);
  });

  it('should let held modifiers go when the menu closes without a key', () => {
    const wrapper = mountMenu();

    wrapper.vm.toggleModifier('ControlLeft', true);
    wrapper.vm.onOpen(false);

    expect(wrapper.vm.held).toStrictEqual([]);
  });

  it('should name saved shortcuts by their keys when they have no name', () => {
    const wrapper = mountMenu({
      shortcuts: [
        { name: 'Open terminal', keys: [{ key: 'Control' }, { key: 'Alt' }, { key: 't' }] },
        { name: '', keys: [{ key: 'Escape' }] },
      ]
    });

    expect(wrapper.vm.items.map(({ name, label }) => [name, label])).toStrictEqual([
      ['Open terminal', 'Ctrl+Alt+T'],
      ['Esc', 'Esc'],
    ]);
  });
});

describe('shortcuts', () => {
  it('should read both the old list format and the named format', () => {
    const keys = [{ key: 'Control', code: 'ControlLeft' }];

    expect(normalizeShortcut(keys)).toStrictEqual({ name: '', keys });
    expect(normalizeShortcut({ name: 'Task manager', keys })).toStrictEqual({ name: 'Task manager', keys });
    expect(normalizeShortcut({ name: 'Broken' })).toStrictEqual({ name: 'Broken', keys: [] });
  });

  it('should label keys the way the console menus show them', () => {
    expect(keyLabel('Control')).toBe('Ctrl');
    expect(keyLabel('a')).toBe('A');
    expect(keyLabel('F2')).toBe('F2');
    expect(shortcutLabels({ keys: [{ key: 'Shift' }, { key: ' ' }] })).toStrictEqual(['Shift', 'Space']);
    expect(shortcutLabels({ keys: [{ key: 'Alt', code: 'AltLeft' }, { key: '©', code: 'KeyG' }] })).toStrictEqual(['Alt', 'G']);
    // Real keys of other layouts stay as typed: AZERTY comma on KeyM, Windows AltGr (Ctrl+Alt) letters.
    expect(shortcutLabels({ keys: [{ key: 'Control', code: 'ControlLeft' }, { key: ',', code: 'KeyM' }] })).toStrictEqual(['Ctrl', ',']);
    expect(shortcutLabels({ keys: [{ key: 'Control', code: 'ControlLeft' }, { key: 'Alt', code: 'AltRight' }, { key: 'ą', code: 'KeyA' }] })).toStrictEqual(['Ctrl', 'Alt', 'Ą']);
    expect(shortcutLabels({ keys: [{ key: 'Alt', code: 'AltLeft' }, { key: 'Dead', code: 'KeyE' }] })).toStrictEqual(['Alt', 'E']);
  });

  it('should keep the key list in the format older versions read and store names apart', async() => {
    const keys = [{ key: 'Control', code: 'ControlLeft' }, { key: 't', code: 'KeyT' }];
    const preference = { data: {}, save: jest.fn().mockResolvedValue() };

    await writeShortcuts(preference, [{ name: 'Open terminal', keys }, { name: '', keys: [{ key: 'F2', code: 'F2' }] }]);

    expect(JSON.parse(preference.data[SHORTCUTS_PREFERENCE])).toStrictEqual([keys, [{ key: 'F2', code: 'F2' }]]);
    expect(JSON.parse(preference.data[SHORTCUT_NAMES_PREFERENCE])).toStrictEqual({ 'ControlLeft+KeyT': 'Open terminal' });
    expect(readShortcuts(preference).map((shortcut) => shortcut.name)).toStrictEqual(['Open terminal', '']);
  });

  it('should put the preference back when the save fails', async() => {
    const saved = JSON.stringify([[{ key: 'F2', code: 'F2' }]]);
    const preference = { data: { [SHORTCUTS_PREFERENCE]: saved }, save: jest.fn().mockRejectedValue(new Error('403')) };

    await expect(writeShortcuts(preference, [])).rejects.toThrow('403');

    expect(preference.data).toStrictEqual({ [SHORTCUTS_PREFERENCE]: saved });
  });

  it('should read nothing from a preference it cannot parse', () => {
    expect(readShortcuts({ data: { [SHORTCUTS_PREFERENCE]: '{not json' } })).toStrictEqual([]);
    expect(readShortcuts(undefined)).toStrictEqual([]);
  });
});
