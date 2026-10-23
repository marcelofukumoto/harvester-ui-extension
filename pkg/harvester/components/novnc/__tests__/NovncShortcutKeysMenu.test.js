import { shallowMount } from '@vue/test-utils';
import NovncShortcutKeysMenu from '../NovncShortcutKeysMenu.vue';
import { keyLabel, normalizeShortcut, shortcutLabels } from '../shortcuts';

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
  });
});
