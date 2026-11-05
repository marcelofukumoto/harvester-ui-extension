<script setup>
import { computed, onMounted, ref } from 'vue';
import { HCI } from '../../types';
import { useStore } from 'vuex';
import { useI18n } from '@shell/composables/useI18n';
import SortableTable from '@shell/components/SortableTable';
import { BadgeState } from '@components/BadgeState';
import { Checkbox } from '@components/Form/Checkbox';
import ComponentChecksTable from './ComponentChecksTable.vue';
import {
  COMPONENT_HEALTH_SEVERITIES, HEALTH_SUMMARY_SEVERITY_RANK, NODE_LABEL, activeAffectedResourceNames, allAffectedResourceNames,
  componentOf, healthSummarySeverity, severityColor
} from '../../utils/component-health';

const store = useStore();
const { t } = useI18n(store);
const loading = ref(true);
const healthSummaries = ref([]);
const componentHealths = ref([]);
const ignoreRules = ref([]);

const headers = [
  {
    name:     'severity',
    labelKey: 'harvester.dashboard.sections.healthSummary.severity',
    value:    'severityRank',
    sort:     'severityRank',
    width:    110,
  },
  {
    name:     'component',
    labelKey: 'harvester.dashboard.sections.healthSummary.component',
    value:    'component',
    sort:     'component',
  },
  {
    align:    'right',
    name:     'errorCount',
    labelKey: 'harvester.dashboard.sections.healthSummary.errorCount',
    value:    'errorCount',
    sort:     'errorCount',
    width:    120,
  },
  {
    align:    'right',
    name:     'warningCount',
    labelKey: 'harvester.dashboard.sections.healthSummary.warningCount',
    value:    'warningCount',
    sort:     'warningCount',
    width:    120,
  },
  {
    align:         'right',
    name:          'lastUpdatedAt',
    labelKey:      'harvester.dashboard.sections.healthSummary.lastUpdatedAt',
    value:         'lastUpdatedAt',
    sort:          'lastUpdatedAt:desc',
    formatter:     'LiveDate',
    formatterOpts: { addSuffix: true },
    width:         140,
  },
];

const showIgnored = ref(false);
const selectedSeverities = ref(COMPONENT_HEALTH_SEVERITIES);

const checks = computed(() => {
  const result = [];

  (componentHealths.value || []).forEach((componentHealth) => {
    const component = componentOf(componentHealth);
    const node = componentHealth?.metadata?.labels?.[NODE_LABEL] || '';
    const statusChecks = componentHealth?.status?.checks || {};
    const lastUpdatedAt = componentHealth?.status?.lastUpdatedAt;

    Object.entries(statusChecks).forEach(([checkName, check]) => {
      result.push({
        id:                  `${ componentHealth.id }/${ checkName }`,
        component,
        componentHealthName: componentHealth.metadata?.name,
        node,
        checkName,
        ignored:             !!check.ignored,
        ignoredBy:           check.ignoredBy,
        severity:            check.severity,
        // the table sorts on a row property, the severities are not in alphabetical order
        severityRank:        COMPONENT_HEALTH_SEVERITIES.indexOf(check.severity),
        message:             check.message,
        affectedCount:       check.affectedCount,
        affectedResources:   check.affectedResources,
        lastUpdatedAt,
      });
    });
  });

  return result;
});

const shownChecks = computed(() => checks.value.filter((check) => showIgnored.value || !check.ignored));

const hasIgnored = computed(() => {
  return checks.value.some((check) => check.ignored || allAffectedResourceNames(check).length !== activeAffectedResourceNames(check).length);
});

const filters = computed(() => COMPONENT_HEALTH_SEVERITIES.map((severity) => ({
  severity,
  count: shownChecks.value.filter((check) => check.severity === severity).length,
})));

const rows = computed(() => {
  const result = [];

  (healthSummaries.value || []).forEach((healthSummary) => {
    const components = healthSummary?.status?.components || {};
    const lastUpdatedAt = healthSummary?.status?.lastUpdatedAt;

    Object.entries(components).forEach(([component, counts]) => {
      const componentChecks = shownChecks.value.filter((check) => check.component === component);
      const row = {
        id:           `${ healthSummary.id }/${ component }`,
        component,
        errorCount:   counts?.errorCount || 0,
        warningCount: counts?.warningCount || 0,
        lastUpdatedAt,
        hasChecks:    componentChecks.length > 0,
        checks:       componentChecks.filter((check) => selectedSeverities.value.includes(check.severity)),
      };

      // the table sorts on a row property, so the severity has to be on the row
      row.severityRank = HEALTH_SUMMARY_SEVERITY_RANK[healthSummarySeverity(row)];

      result.push(row);
    });
  });

  return result;
});

onMounted(async() => {
  try {
    [healthSummaries.value, componentHealths.value, ignoreRules.value] = await Promise.all([
      store.dispatch('harvester/findAll', { type: HCI.HEALTH_SUMMARY }),
      store.dispatch('harvester/findAll', { type: HCI.COMPONENT_HEALTH }),
      store.dispatch('harvester/findAll', { type: HCI.HEALTH_IGNORE_RULE }),
    ]);
  } catch (err) {
    console.error('Failed fetching component health with error:', err); // eslint-disable-line no-console
  } finally {
    loading.value = false;
  }
});

function toggleSeverity(severity, enabled) {
  selectedSeverities.value = enabled ? [...selectedSeverities.value, severity] : selectedSeverities.value.filter((filter) => filter !== severity);
}
</script>

<template>
  <SortableTable
    :rows="rows"
    :headers="headers"
    :loading="loading"
    key-field="id"
    :search="false"
    :table-actions="false"
    :row-actions="false"
    :paging="true"
    :rows-per-page="10"
    :sub-rows="true"
    :sub-expandable="true"
    :sub-expand-column="true"
    default-sort-by="severity"
  >
    <!-- always passed, the table only reads its slots once, before the rows arrive -->
    <template #header-left>
      <div
        v-if="rows.length"
        class="component-health-filter"
      >
        <v-dropdown
          popper-class="component-health-filter-dropdown"
          :triggers="['click']"
          placement="bottom-start"
          :distance="20"
        >
          <button class="btn bg-primary">
            {{ t('harvester.dashboard.sections.componentHealth.filter') }}
          </button>

          <template #popper>
            <div class="filter-popup">
              <Checkbox
                v-for="filter in filters"
                :key="filter.severity"
                :value="selectedSeverities.includes(filter.severity)"
                type="checkbox"
                :label="`${ filter.severity } (${ filter.count })`"
                @update:value="toggleSeverity(filter.severity, $event)"
              />
            </div>
          </template>
        </v-dropdown>
        <Checkbox
          v-if="hasIgnored"
          v-model:value="showIgnored"
          class="ml-20"
          type="checkbox"
          :label="t('harvester.dashboard.sections.componentHealth.showIgnored')"
        />
      </div>
    </template>
    <template #cell:severity="{row}">
      <BadgeState
        :color="severityColor(healthSummarySeverity(row))"
        :label="healthSummarySeverity(row)"
      />
    </template>
    <template #sub-row="{row, fullColspan}">
      <tr class="sub-row">
        <td :colspan="fullColspan">
          <ComponentChecksTable
            class="sub-table"
            :rows="row.checks"
            :has-checks="row.hasChecks"
            :ignore-rules="ignoreRules"
            :show-ignored="showIgnored"
          />
        </td>
      </tr>
    </template>
  </SortableTable>
</template>

<style lang="scss" scoped>
  .component-health-filter {
    display: flex;
    align-items: center;
  }

  .component-health-filter-dropdown .filter-popup {
    display: grid;
    gap: 10px;
    padding: 10px;
  }

  // the shell has this look for a table in a sub-row from 3.0.15, this can go with that bump
  .sub-row {
    background-color: var(--body-bg) !important;

    > td:first-child {
      padding-left: 0;
      padding-right: 0;
    }

    .sub-table {
      padding: 16px 32px;
    }

    :deep(.sortable-table) {
      border: 0;
      border-radius: 0;
      outline: 0;
    }

    :deep(thead tr:hover) {
      background-color: var(--body-bg);
    }

    :deep(thead th) {
      font-weight: 600;
    }

    :deep(tbody tr) {
      border-bottom: 0;
    }
  }
</style>
