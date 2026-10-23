import { shallowMount } from '@vue/test-utils';
import NovncKeyRecorder from '../NovncKeyRecorder.vue';

const key = (k, code, extra = {}) => ({
  key: k, code, keyCode: 0, location: 0, charCode: 0, repeat: false, preventDefault: jest.fn(), stopPropagation: jest.fn(), ...extra
});

describe('component: NovncKeyRecorder', () => {
  it('should hold modifiers until another key ends the combination', () => {
    const wrapper = shallowMount(NovncKeyRecorder);

    wrapper.vm.start();
    wrapper.vm.onKeydown(key('Control', 'ControlLeft'));
    wrapper.vm.onKeydown(key('Shift', 'ShiftLeft'));
    wrapper.vm.onKeydown(key('Control', 'ControlLeft', { repeat: true }));
    wrapper.vm.onKeydown(key('Escape', 'Escape'));

    expect(wrapper.emitted('update:value')[0][0].map((K) => K.code)).toStrictEqual(['ControlLeft', 'ShiftLeft', 'Escape']);
    expect(wrapper.vm.recording).toBe(false);
  });

  it('should keep the browser from acting on keys while recording', () => {
    const wrapper = shallowMount(NovncKeyRecorder);
    const event = key('w', 'KeyW');

    wrapper.vm.start();
    wrapper.vm.onKeydown(event);

    expect(event.preventDefault).toHaveBeenCalledWith();
  });

  it('should drop a combination of modifiers only when it loses focus', () => {
    const wrapper = shallowMount(NovncKeyRecorder);

    wrapper.vm.start();
    wrapper.vm.onKeydown(key('Alt', 'AltLeft'));
    wrapper.vm.stop();

    expect(wrapper.emitted('update:value')).toBeUndefined();
    expect(wrapper.vm.state).toBe('empty');
  });

  it('should stop recording on Esc or Tab alone, without recording them', () => {
    const wrapper = shallowMount(NovncKeyRecorder);
    const tab = key('Tab', 'Tab');

    wrapper.vm.start();
    wrapper.vm.onKeydown(key('Escape', 'Escape'));
    expect(wrapper.vm.recording).toBe(false);

    wrapper.vm.start();
    wrapper.vm.onKeydown(tab);
    expect(wrapper.vm.recording).toBe(false);
    expect(tab.preventDefault).not.toHaveBeenCalled();
    expect(wrapper.emitted('update:value')).toBeUndefined();
  });
});
