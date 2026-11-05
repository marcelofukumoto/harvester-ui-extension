<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { HCI } from '../../types';
import { useStore } from 'vuex';
import { useI18n } from '@shell/composables/useI18n';
import SortableTable from '@shell/components/SortableTable';
import { BadgeState } from '@components/BadgeState';
import { Checkbox } from '@components/Form/Checkbox';
import TableViewQueryInput from '@shell/components/TableViews/TableViewQueryInput.vue';
import { applyQueryExpression } from '@shell/utils/table-views/filter-rows';
import { parseQueryExpression } from '@shell/utils/table-views/query';
import ComponentChecksTable from './ComponentChecksTable.vue';
import {
  COMPONENT_HEALTH_SEVERITIES, HEALTH_SUMMARY_SEVERITY_RANK, NODE_LABEL, activeAffectedResourceNames, allAffectedResourceNames,
  componentOf, healthSummarySeverity, severityColor
} from '../../utils/component-health';

const store = useStore();
const { t } = useI18n(store);
const table = ref(null);
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
const query = ref('');

function queryField(id, labelKey, value) {
  return {
    id,
    label:   t(`harvester.dashboard.sections.componentHealth.${ labelKey }`),
    isLabel: false,
    header:  { name: id, value },
  };
}

// what the filter box can search on a check, which is what the rows hold the rest of the data in
const suggestedQueryFields = [
  queryField('severity', 'severity', 'severity'),
  queryField('component', 'component', 'component'),
  queryField('check', 'check', 'checkName'),
  queryField('message', 'message', 'message'),
  queryField('resource', 'affectedCount', (check) => allAffectedResourceNames(check)),
  queryField('node', 'node', 'node'),
];

// the box's placeholder gives state:error as its example, here that is the severity
const queryFields = [...suggestedQueryFields, { ...queryField('state', 'severity', 'severity'), queryOnly: true }];

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

const matchingChecks = computed(() => applyQueryExpression(shownChecks.value, parseQueryExpression(query.value, queryFields), queryFields));

const rows = computed(() => {
  const result = [];

  (healthSummaries.value || []).forEach((healthSummary) => {
    const components = healthSummary?.status?.components || {};
    const lastUpdatedAt = healthSummary?.status?.lastUpdatedAt;

    Object.entries(components).forEach(([component, counts]) => {
      const checks = matchingChecks.value.filter((check) => check.component === component);

      if (query.value && !checks.length) {
        return;
      }

      const row = {
        id:           `${ healthSummary.id }/${ component }`,
        component,
        errorCount:   counts?.errorCount || 0,
        warningCount: counts?.warningCount || 0,
        lastUpdatedAt,
        checks,
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

// a closed row would hide what the filter found
watch(query, (value) => {
  if (value) {
    rows.value.filter((row) => !table.value?.isExpanded(row)).forEach((row) => table.value?.toggleExpand(row));
  }
});
</script>

<template>
  <SortableTable
    ref="table"
    :rows="rows"
    :headers="headers"
    :loading="loading"
    :no-rows-key="query ? 'harvester.dashboard.sections.componentHealth.noMatchingChecks' : undefined"
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
        v-if="healthSummaries.length"
        class="component-health-filter"
      >
        <TableViewQueryInput
          v-model:value="query"
          :fields="queryFields"
          :filter-fields="suggestedQueryFields"
          :rows="shownChecks"
        />
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
    <!-- the table's chevron can't take the keyboard focus, this opens the row from the keyboard -->
    <template #cell:component="{row}">
      <button
        type="button"
        class="btn btn-sm role-link component-name"
        :aria-expanded="!!table?.isExpanded(row)"
        @click="table.toggleExpand(row)"
      >
        {{ row.component }}
      </button>
    </template>
    <template #sub-row="{row, fullColspan}">
      <tr class="sub-row">
        <td :colspan="fullColspan">
          <ComponentChecksTable
            class="sub-table"
            :rows="row.checks"
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

  // a small button is taller than the table's rows
  .component-name {
    min-height: 0;
    line-height: inherit;
    padding: 0;
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
