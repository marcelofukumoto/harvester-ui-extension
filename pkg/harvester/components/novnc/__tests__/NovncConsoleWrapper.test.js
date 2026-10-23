import { shallowMount } from '@vue/test-utils';
import NovncConsoleWrapper, { CONFIRM_ACTION } from '../NovncConsoleWrapper.vue';

jest.mock('../ZoomableRFB', () => ({ normalizeZoom: (value) => value }));
jest.mock('@novnc/novnc/core/input/keysym', () => ({}), { virtual: true });
jest.mock('@novnc/novnc/core/input/util', () => ({}), { virtual: true });

const consoleRef = {
  ctrlAltDelete: jest.fn(),
  focus:         jest.fn(),
};

const mountWrapper = () => {
  consoleRef.ctrlAltDelete.mockClear();
  consoleRef.focus.mockClear();

  const wrapper = shallowMount(NovncConsoleWrapper, {
    props: {
      value: {
        id: 'default/vm', metadata: { name: 'vm' }, status: { phase: 'Running' }
      }
    },
    global: {
      mocks: {
        $store: {
          getters: {
            'management/all':                     () => [],
            'harvester-common/getFeatureEnabled': () => true,
          },
        },
        $fetchState: { pending: false },
      },
      stubs: {
        NovncConsole: {
          template: '<div />',
          methods:  {
            ctrlAltDelete: consoleRef.ctrlAltDelete,
            focus:         consoleRef.focus,
          },
        },
      },
    },
  });

  wrapper.vm.onStatusChanged({ status: 'connected' });

  return wrapper;
};

describe('component: NovncConsoleWrapper', () => {
  it('should only send Ctrl+Alt+Del after it is confirmed', async() => {
    const wrapper = mountWrapper();

    wrapper.vm.ctrlAltDelete();
    expect(wrapper.vm.confirmAction).toBe(CONFIRM_ACTION.CTRL_ALT_DEL);
    expect(consoleRef.ctrlAltDelete).not.toHaveBeenCalled();

    wrapper.vm.runConfirmedAction();

    expect(consoleRef.ctrlAltDelete).toHaveBeenCalledTimes(1);
    expect(wrapper.vm.confirmAction).toBeNull();
  });

  it('should not send Ctrl+Alt+Del when the confirmation is cancelled', () => {
    const wrapper = mountWrapper();

    wrapper.vm.ctrlAltDelete();
    wrapper.vm.cancelConfirm();

    expect(consoleRef.ctrlAltDelete).not.toHaveBeenCalled();
    expect(wrapper.vm.confirmAction).toBeNull();
  });

  it('should only soft reboot after it is confirmed', () => {
    const wrapper = mountWrapper();
    const doSoftReboot = jest.fn();

    wrapper.vm.vmResource = { doSoftReboot };

    wrapper.vm.softReboot();
    expect(doSoftReboot).not.toHaveBeenCalled();

    wrapper.vm.runConfirmedAction();
    expect(doSoftReboot).toHaveBeenCalledTimes(1);
  });

  it('should keep the shortcut menu open to use while keys cannot be sent, and say why', () => {
    const wrapper = mountWrapper();

    wrapper.vm.onStatusChanged({ status: 'reconnecting' });

    expect(wrapper.vm.shortcutMenuProps.canSend).toBe(false);
    expect(wrapper.vm.sendBlockedReason).toBe('%harvester.virtualMachine.detail.console.shortcutMenu.blockedDisconnected%');
    // Without a user preference there is nothing to manage either, so only then is it disabled.
    expect(wrapper.vm.shortcutMenuProps.disabled).toBe(true);

    wrapper.vm.onStatusChanged({ status: 'connected' });
    wrapper.vm.setViewOnly(true);

    expect(wrapper.vm.sendBlockedReason).toBe('%harvester.virtualMachine.detail.console.shortcutMenu.blockedViewOnly%');
  });

  it('should not send keys while view only is on', () => {
    const wrapper = mountWrapper();

    wrapper.vm.setViewOnly(true);

    expect(wrapper.vm.canSendKeys).toBe(false);
    expect(wrapper.vm.statusLabel).toBe('%harvester.virtualMachine.detail.console.status.connectedViewOnly%');
  });

  it('should not ask to send Ctrl+Alt+Del while keys cannot be sent', () => {
    const wrapper = mountWrapper();

    wrapper.vm.onStatusChanged({ status: 'reconnecting' });
    wrapper.vm.ctrlAltDelete();

    expect(wrapper.vm.confirmAction).toBeNull();
  });
});
