<script>
import { STEVE } from '@shell/config/types';
import ModalWithCard from '@shell/components/ModalWithCard';
import { RcButton } from '@components/RcButton';
import { escapeHtml } from '@shell/utils/string';
import { allHash } from '@shell/utils/promise';
import KeyTable from '@novnc/novnc/core/input/keysym';
import * as KeyboardUtil from '@novnc/novnc/core/input/util';
import { HCI } from '../../types';
import NovncConsole, { CONSOLE_STATUS } from './NovncConsole';
import NovncConsoleCustomKeys from './NovncConsoleCustomKeys';
import NovncConnectionStatus from './NovncConnectionStatus';
import NovncIcon from './NovncIcon';
import NovncShortcutKeysMenu from './NovncShortcutKeysMenu';
import NovncViewOptions, { VIEW_MODE } from './NovncViewOptions';
import { normalizeShortcut } from './shortcuts';
import { normalizeZoom } from './ZoomableRFB';

const CONSOLE_SETTINGS_KEY = 'harvester-vnc-console-settings';
const PREFERED_SHORTCUT_KEYS = 'prefered-shortcut-keys';

export const CONFIRM_ACTION = {
  CTRL_ALT_DEL: 'ctrlAltDel',
  SOFT_REBOOT:  'softReboot',
};

const DEFAULT_SETTINGS = {
  viewMode:         VIEW_MODE.SCALE,
  zoomPercent:      100,
  qualityLevel:     6,
  compressionLevel: 2,
};

const SHORT_KEYS = {
  ControlLeft: {
    label: 'Ctrl',
    value: KeyTable.XK_Control_L,
  },
  AltLeft: {
    label: 'Alt',
    value: KeyTable.XK_Alt_L,
  }
};

const FUNCTION_KEYS = {
  PrintScreen: {
    label: 'Print Screen',
    value: KeyTable.XK_Print,
  },
};

const F_KEYS = {
  F1: {
    label: 'F1',
    value: KeyTable.XK_F1,
  },
  F2: {
    label: 'F2',
    value: KeyTable.XK_F2,
  },
  F3: {
    label: 'F3',
    value: KeyTable.XK_F3,
  },
  F4: {
    label: 'F4',
    value: KeyTable.XK_F4,
  },
  F5: {
    label: 'F5',
    value: KeyTable.XK_F5,
  },
  F6: {
    label: 'F6',
    value: KeyTable.XK_F6,
  },
  F7: {
    label: 'F7',
    value: KeyTable.XK_F7,
  },
  F8: {
    label: 'F8',
    value: KeyTable.XK_F8,
  },
  F9: {
    label: 'F9',
    value: KeyTable.XK_F9,
  },
  F10: {
    label: 'F10',
    value: KeyTable.XK_F10,
  },
  F11: {
    label: 'F11',
    value: KeyTable.XK_F11,
  },
  F12: {
    label: 'F12',
    value: KeyTable.XK_F12,
  },
};

export default {
  name:       'NovncConsoleWrapper',
  components: {
    ModalWithCard, RcButton, NovncConsole, NovncConsoleCustomKeys, NovncConnectionStatus, NovncIcon, NovncShortcutKeysMenu, NovncViewOptions
  },

  async fetch() {
    const _hash = { vmResource: this.$store.dispatch('harvester/find', { type: HCI.VM, id: this.value.id }) };

    const hash = await allHash(_hash);

    this.vmResource = hash.vmResource;
  },

  props: {
    value: {
      type:     Object,
      required: true,
      default:  () => {
        return {};
      }
    }
  },

  data() {
    return {
      vmResource:        {},
      renderKeysModal:   false,
      settings:          { ...DEFAULT_SETTINGS },
      capabilities:      {},
      isFullscreen:      false,
      confirmAction:     null,
      consoleStatus:     {
        status:            'connecting',
        retryTimes:        0,
        maximumRetryTimes: 0,
        desktopName:       '',
      },
    };
  },

  computed: {
    preference() {
      return this.$store.getters['management/all'](STEVE.PREFERENCE)?.[0];
    },

    // Custom keys are stored in the user preference, which is not available everywhere.
    hideCustomKeysBar() {
      return !this.preference?.data;
    },

    savedShortcutKeys() {
      const preferedShortcutKeys = this.preference?.data?.[PREFERED_SHORTCUT_KEYS];

      if (!preferedShortcutKeys) {
        return [];
      }

      try {
        return JSON.parse(preferedShortcutKeys);
      } catch (err) {
        return [];
      }
    },

    preferredShortcutKeys() {
      return (this.savedShortcutKeys || []).map(normalizeShortcut).filter((shortcut) => shortcut.keys.length);
    },

    isConnected() {
      return this.consoleStatus.status === CONSOLE_STATUS.CONNECTED;
    },

    canSendKeys() {
      return this.isConnected;
    },

    vmName() {
      return this.value?.metadata?.name || '';
    },

    vmNamespace() {
      return this.value?.metadata?.namespace || '';
    },

    isDown() {
      return this.isEmpty(this.value);
    },

    preserveSession() {
      return !!this.$store.getters['harvester-common/getFeatureEnabled']('vncPreserveSession');
    },

    vmRunning() {
      return this.value?.status?.phase === 'Running';
    },

    url() {
      const ip = `${ window.location.hostname }:${ window.location.port }`;

      return `wss://${ ip }${ this.value?.getVMIApiPath }`;
    },

    allKeys() {
      return {
        ...SHORT_KEYS,
        ...FUNCTION_KEYS,
        ...F_KEYS,
      };
    },

    hasSoftRebootAction() {
      return !!this.vmResource?.actions?.softreboot;
    },

    rfbSettings() {
      return {
        scaleViewport:    this.settings.viewMode === VIEW_MODE.SCALE,
        zoomPercent:      normalizeZoom(this.settings.zoomPercent),
        resizeSession:    false,
        clipViewport:     false,
        dragViewport:     false,
        qualityLevel:     this.settings.qualityLevel,
        compressionLevel: this.settings.compressionLevel,
      };
    },

    // The pill has one label per state it shows; retries are counted on the console overlay.
    statusLabel() {
      const { status } = this.consoleStatus;

      if (status === CONSOLE_STATUS.RECONNECTING) {
        return this.t('harvester.virtualMachine.detail.console.status.connecting');
      }

      if (status === CONSOLE_STATUS.FAILED) {
        return this.t('harvester.virtualMachine.detail.console.status.disconnected');
      }

      return this.t(`harvester.virtualMachine.detail.console.status.${ status }`);
    },
  },

  watch: {
    settings: {
      deep: true,
      handler(neu) {
        window.localStorage.setItem(CONSOLE_SETTINGS_KEY, JSON.stringify(neu));
      }
    },
  },

  mounted() {
    this.loadSettings();
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
  },

  beforeUnmount() {
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
  },

  methods: {
    isEmpty(o) {
      return o !== undefined && Object.keys(o).length === 0;
    },

    close() {
      this.$refs.novncConsole.disconnect();
    },

    // Press the keys in order, then release them in reverse, e.g. Ctrl+Alt+F2.
    sendKeys(keys) {
      if (!this.canSendKeys || !this.$refs.novncConsole) {
        return;
      }

      keys.forEach((key) => {
        this.$refs.novncConsole.sendKey(this.allKeys[key].value, key, true);
      });

      [...keys].reverse().forEach((key) => {
        this.$refs.novncConsole.sendKey(this.allKeys[key].value, key, false);
      });

      this.focusConsole();
    },

    sendCustomKeys(keys) {
      if (!this.canSendKeys || !this.$refs.novncConsole) {
        return;
      }

      const keyList = [].concat(keys);

      keyList.forEach((K) => {
        this.$refs.novncConsole.sendKey(KeyboardUtil.getKeysym(K), KeyboardUtil.getKeycode(K), true);
      });

      [...keyList].reverse().forEach((K) => {
        this.$refs.novncConsole.sendKey(KeyboardUtil.getKeysym(K), KeyboardUtil.getKeycode(K), false);
      });

      this.focusConsole();
    },

    // The shortcut menu hands focus back to its trigger as it closes, so take it on the next tick.
    focusConsole() {
      this.$nextTick(() => this.$refs.novncConsole?.focus());
    },

    showKeysModal() {
      this.renderKeysModal = true;
    },

    hideKeysModal() {
      this.renderKeysModal = false;
    },

    reconnect() {
      this.$refs.novncConsole.reconnect();
    },

    loadSettings() {
      try {
        const saved = JSON.parse(window.localStorage.getItem(CONSOLE_SETTINGS_KEY) || '{}');

        this.settings = {
          viewMode:         Object.values(VIEW_MODE).includes(saved?.viewMode) ? saved.viewMode : DEFAULT_SETTINGS.viewMode,
          zoomPercent:      normalizeZoom(saved?.zoomPercent ?? DEFAULT_SETTINGS.zoomPercent),
          qualityLevel:     saved?.qualityLevel ?? DEFAULT_SETTINGS.qualityLevel,
          compressionLevel: saved?.compressionLevel ?? DEFAULT_SETTINGS.compressionLevel,
        };
      } catch (err) {
        this.settings = { ...DEFAULT_SETTINGS };
      }
    },

    updateSettings(settings) {
      this.settings = settings;
    },

    resetSettings() {
      this.settings = { ...DEFAULT_SETTINGS };
    },

    onStatusChanged(info) {
      this.consoleStatus = info;
    },

    onCapabilities(capabilities) {
      this.capabilities = capabilities;
    },

    // Both can restart the VM with one click (Ctrl+Alt+Del reboots most Linux guests), so ask first.
    ctrlAltDelete() {
      if (this.canSendKeys) {
        this.confirmAction = CONFIRM_ACTION.CTRL_ALT_DEL;
      }
    },

    softReboot() {
      this.confirmAction = CONFIRM_ACTION.SOFT_REBOOT;
    },

    // The modal returns focus to the console canvas (return-focus-selector) once it closes.
    cancelConfirm() {
      this.confirmAction = null;
    },

    runConfirmedAction() {
      const action = this.confirmAction;

      this.confirmAction = null;

      if (action === CONFIRM_ACTION.CTRL_ALT_DEL && this.canSendKeys) {
        this.$refs.novncConsole?.ctrlAltDelete();
      } else if (action === CONFIRM_ACTION.SOFT_REBOOT) {
        this.vmResource.doSoftReboot();
      }
    },

    async toggleFullscreen() {
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        } else {
          await this.$refs.consoleContainer.requestFullscreen();
          // Keyboard lock lets shortcuts such as Ctrl+W and F11 reach the guest.
          await navigator.keyboard?.lock?.(['KeyW', 'F11']);
        }
      } catch (err) {
        this.$store.dispatch('growl/fromError', {
          title: this.t('generic.notification.title.error', { name: escapeHtml(this.value.metadata.name) }),
          err,
        }, { root: true });
      }
    },

    onFullscreenChange() {
      this.isFullscreen = !!document.fullscreenElement;

      if (!this.isFullscreen) {
        navigator.keyboard?.unlock?.();
      }
    },

  }
};
</script>

<template>
  <div id="app">
    <div
      ref="consoleContainer"
      class="vm-console"
    >
      <header class="console-toolbar">
        <div class="console-toolbar__identity">
          <div class="console-toolbar__vm">
            <span
              class="console-toolbar__vm-name"
              data-testid="vnc-vm-name"
            >{{ vmName }}</span>
            <span class="console-toolbar__vm-namespace">{{ vmNamespace }}</span>
          </div>

          <NovncConnectionStatus
            :status="consoleStatus.status"
            :label="statusLabel"
            :vm-name="vmName"
            @reconnect="reconnect"
          />
        </div>

        <div class="console-toolbar__group">
          <NovncShortcutKeysMenu
            :disabled="!canSendKeys"
            :shortcuts="preferredShortcutKeys"
            :can-manage="!hideCustomKeysBar"
            @send-keys="sendKeys"
            @send-shortcut="sendCustomKeys"
            @manage="showKeysModal"
          />
        </div>

        <span
          class="console-toolbar__divider"
          aria-hidden="true"
        />

        <div class="console-toolbar__group">
          <RcButton
            variant="tertiary"
            data-testid="vnc-ctrl-alt-del"
            :disabled="!canSendKeys"
            @click="ctrlAltDelete"
          >
            <template #before>
              <NovncIcon type="power" />
            </template>
            {{ t("harvester.virtualMachine.detail.console.ctrlAltDel") }}
          </RcButton>

          <RcButton
            v-if="hasSoftRebootAction"
            variant="tertiary"
            left-icon="refresh-alt"
            data-testid="vnc-soft-reboot"
            :disabled="!isConnected"
            @click="softReboot"
          >
            {{ t("harvester.virtualMachine.detail.console.softReboot") }}
          </RcButton>
        </div>

        <span class="console-toolbar__spacer" />

        <div class="console-toolbar__group">
          <v-dropdown
            placement="bottom-end"
            trigger="click"
            :container="false"
          >
            <RcButton
              variant="tertiary"
              left-icon="show"
              right-icon="chevron-down"
              data-testid="vnc-view"
            >
              {{ t("harvester.virtualMachine.detail.console.view") }}
            </RcButton>

            <template #popper>
              <NovncViewOptions
                :settings="settings"
                @update="updateSettings"
                @reset="resetSettings"
              />
            </template>
          </v-dropdown>

          <RcButton
            variant="tertiary"
            data-testid="vnc-fullscreen"
            @click="toggleFullscreen"
          >
            <template #before>
              <NovncIcon :type="isFullscreen ? 'minimize' : 'maximize'" />
            </template>
            {{ isFullscreen ? t('harvester.virtualMachine.detail.console.fullscreen.exit') : t('harvester.virtualMachine.detail.console.fullscreen.enter') }}
          </RcButton>
        </div>
      </header>

      <div class="console-area">
        <NovncConsole
          v-if="url && !isDown"
          ref="novncConsole"
          :url="url"
          :settings="rfbSettings"
          :preserve-session="preserveSession"
          :vm-running="vmRunning"
          @status-changed="onStatusChanged"
          @capabilities="onCapabilities"
        />
        <p v-if="isDown">
          {{ t("harvester.virtualMachine.detail.console.down") }}
        </p>
        <p class="console-area__hint">
          {{ t("harvester.virtualMachine.detail.console.hint") }}
        </p>
      </div>

      <ModalWithCard
        v-if="confirmAction"
        name="confirmConsoleAction"
        :width="480"
        return-focus-selector=".novnc-screen canvas"
        @finish="cancelConfirm"
      >
        <template #title>
          {{ t(`harvester.virtualMachine.detail.console.confirm.${ confirmAction }.title`) }}
        </template>

        <template #content>
          <p>{{ t(`harvester.virtualMachine.detail.console.confirm.${ confirmAction }.message`) }}</p>
        </template>

        <template #footer>
          <div class="confirm-actions">
            <button
              class="btn role-secondary mr-10"
              @click="cancelConfirm"
            >
              {{ t('generic.cancel') }}
            </button>
            <button
              class="btn role-primary"
              data-testid="vnc-confirm-action"
              @click="runConfirmedAction"
            >
              {{ t(`harvester.virtualMachine.detail.console.confirm.${ confirmAction }.button`) }}
            </button>
          </div>
        </template>
      </ModalWithCard>

      <NovncConsoleCustomKeys
        v-if="renderKeysModal"
        @close="hideKeysModal"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
  .vm-console {
    height: 100vh;
    height: 100dvh;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    background: var(--body-bg);
  }

  .console-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    background: var(--nav-bg);

    &__identity {
      display: flex;
      align-items: center;
      gap: 16px;
      padding-right: 8px;
    }

    &__vm {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    &__vm-name {
      color: var(--body-text);
      font-size: 14px;
      font-weight: 700;
      line-height: 21px;
    }

    &__vm-namespace {
      color: var(--muted);
      font-size: 12px;
      line-height: 18px;
    }

    &__group {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    &__divider {
      width: 1px;
      height: 24px;
      background: var(--border);
    }

    &__spacer {
      flex: 1;
    }
  }

  .console-area {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 0;
    padding: 24px;

    // vnc.vue stretches every nested div to the full height; the hint needs its row.
    > .novnc-console {
      flex: 1 1 auto;
      height: auto;
      min-height: 0;
    }

    &__hint {
      margin: 0;
      color: var(--muted);
      font-size: 12px;
      line-height: 18px;
      text-align: center;
    }
  }

  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    width: 100%;
  }
</style>

<style lang="scss">
  .vm-console .v-popper__arrow-container {
    display: none;
  }
  .vm-console .v-popper__popper{
    margin-top: 8px;
  }
  .vm-console .v-popper__inner{
    overflow-y: visible;
  }
</style>
