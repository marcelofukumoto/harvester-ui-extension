import { mount as vtuMount, flushPromises } from '@vue/test-utils';
import { createStore } from 'vuex';
import { Checkbox } from '@components/Form/Checkbox';
import { HCI } from '../../../types';
import HealthSummaryTable from '../HealthSummaryTable.vue';
import ComponentChecksTable from '../ComponentChecksTable.vue';

const TYPES = {
  healthSummaries:  HCI.HEALTH_SUMMARY,
  componentHealths: HCI.COMPONENT_HEALTH,
  ignoreRules:      HCI.HEALTH_IGNORE_RULE,
};

// resources are fetched by the components themselves, so serve them from a mocked store
const opts = (props = {}) => {
  const store = createStore({
    getters: {
      'i18n/t':              () => (k) => k,
      'i18n/exists':         () => () => true,
      'prefs/get':           () => () => false,
      currentProduct:        () => ({ inStore: 'harvester' }),
      'harvester/schemaFor': () => () => ({}),
    },
    actions: {
      'growl/success':     jest.fn(),
      'harvester/findAll': (_, { type }) => {
        const key = Object.keys(TYPES).find((k) => TYPES[k] === type);

        return props[key] || [];
      },
    }
  });

  return { global: { plugins: [store], stubs: { 'v-dropdown': { template: '<div><slot /><slot name="popper" /></div>' } } } };
};

const toggleExpand = jest.fn();

// renders the summary rows with every sub-row open, and the checks of each sub-row
const summaryTable = {
  props: ['rows'],
  data() {
    return { headerSlotAtMount: !!this.$slots['header-left'] };
  },
  methods:  { toggleExpand, isExpanded: () => false },
  template: `<div>
    <span v-if="headerSlotAtMount" class="header-slot-at-mount" />
    <slot name="header-left" />
    <div class="summary">{{ rows.map(r => r.id + ":" + r.severityRank).join(",") }}</div>
    <div v-for="row in rows" :key="row.id" class="name"><slot name="cell:component" :row="row" /></div>
    <div v-for="row in rows" :key="row.id" :class="'sub-' + row.component"><slot name="sub-row" :row="row" :fullColspan="1" /></div>
  </div>`,
};

const checksTable = { props: ['rows'], template: '<div class="checks">{{ rows.map(r => r.id + ":" + r.severityRank).join(",") }}</div>' };

const mountSummary = async(props) => {
  const base = opts(props);
  const w = vtuMount(HealthSummaryTable, { ...base, global: { ...base.global, stubs: { ...base.global.stubs, SortableTable: summaryTable } } });

  await flushPromises();

  return w;
};

const mountChecks = (props, stubs = {}) => {
  const base = opts();

  return vtuMount(ComponentChecksTable, {
    ...base,
    props,
    global: {
      ...base.global,
      stubs: {
        ...base.global.stubs, SortableTable: checksTable, ...stubs
      }
    },
  });
};

const summaryOf = (components) => ({ id: 's', status: { components } });
const healthOf = (id, component, checks) => ({
  id, metadata: { name: id, labels: { 'health.harvesterhci.io/component': component } }, status: { checks }
});

describe('health components', () => {
  it('ranks the health summary rows by severity', async() => {
    const w = await mountSummary({
      healthSummaries: [{
        id:     'a',
        status: {
          components: {
            x: { errorCount: 1 }, y: {}, z: { warningCount: 2 }
          }
        }
      }]
    });

    expect(w.find('.summary').text()).toBe('a/x:0,a/y:2,a/z:1');
  });
  it('opens a row from the component name, which takes the keyboard focus', async() => {
    toggleExpand.mockClear();

    const w = await mountSummary({ healthSummaries: [summaryOf({ x: {} })] });
    const name = w.find('.name button');

    expect(name.text()).toBe('x');
    expect(name.attributes('aria-expanded')).toBe('false');

    await name.trigger('click');

    expect(toggleExpand.mock.calls.map(([row]) => row.component)).toStrictEqual(['x']);
  });
  it('shows the checks of a component in its sub-row', async() => {
    const w = await mountSummary({
      healthSummaries:  [summaryOf({ x: { errorCount: 1 }, y: { warningCount: 1 } })],
      componentHealths: [
        healthOf('h1', 'x', { a: { severity: 'Error' } }),
        healthOf('h2', 'y', { b: { severity: 'Warning' } }),
        healthOf('h3', 'x', { c: { severity: 'Error' } }),
      ],
    });
    const rowsOf = (component) => w.findAllComponents(ComponentChecksTable).find((c) => c.element.closest(`.sub-${ component }`)).props('rows').map((r) => r.id);

    expect(rowsOf('x')).toStrictEqual(['h1/a', 'h3/c']);
    expect(rowsOf('y')).toStrictEqual(['h2/b']);
  });
  it('ranks the checks Error, Warning, Info', async() => {
    const w = await mountSummary({
      healthSummaries:  [summaryOf({ x: { errorCount: 1 } })],
      componentHealths: [healthOf('h', 'x', {
        a: { severity: 'Info' }, b: { severity: 'Error' }, c: { severity: 'Warning' }
      })],
    });

    expect(w.findComponent(ComponentChecksTable).props('rows').map((r) => `${ r.id }:${ r.severityRank }`)).toStrictEqual(['h/a:2', 'h/b:0', 'h/c:1']);
  });
  it('passes the header slot before the rows arrive, the table only reads its slots once', async() => {
    const w = await mountSummary({ healthSummaries: [summaryOf({ x: {} })] });

    expect(w.find('.header-slot-at-mount').exists()).toBe(true);
    expect(w.text()).toContain('componentHealth.filter');
  });
  it('filters the checks of every component and keeps their rows', async() => {
    const w = await mountSummary({
      healthSummaries:  [summaryOf({ x: { errorCount: 1 }, y: { errorCount: 1, warningCount: 1 } })],
      componentHealths: [
        healthOf('h1', 'x', { a: { severity: 'Error' } }),
        healthOf('h2', 'y', { b: { severity: 'Error' }, c: { severity: 'Warning' } }),
      ],
    });

    // the first filter is Error
    await w.findAllComponents(Checkbox)[0].vm.$emit('update:value', false);

    const tables = w.findAllComponents(ComponentChecksTable);

    expect(tables.map((c) => c.props('rows').map((r) => r.id))).toStrictEqual([[], ['h2/c']]);
    expect(tables[0].props('hasChecks')).toBe(true);
  });
  it('only offers the ignored checks when there are some', async() => {
    const w = await mountSummary({
      healthSummaries:  [summaryOf({ x: { warningCount: 1 } })],
      componentHealths: [healthOf('h', 'x', { a: { severity: 'Error', ignored: true }, b: { severity: 'Warning' } })],
    });
    const shownRows = () => w.findComponent(ComponentChecksTable).props('rows').map((r) => r.id);

    expect(shownRows()).toStrictEqual(['h/b']);
    expect(w.text()).toContain('showIgnored');

    // the filters come first, then the checkbox that shows the ignored checks
    await w.findAllComponents(Checkbox).at(-1).vm.$emit('update:value', true);

    expect(shownRows()).toStrictEqual(['h/a', 'h/b']);

    const clean = await mountSummary({
      healthSummaries:  [summaryOf({ x: { warningCount: 1 } })],
      componentHealths: [healthOf('h', 'x', { b: { severity: 'Warning' } })],
    });

    expect(clean.text()).not.toContain('showIgnored');
  });
  it('expands a long message', async() => {
    const message = 'x'.repeat(150);
    const table = { props: ['rows'], template: '<div><slot name="cell:message" :row="rows[0]" :value="rows[0].message" /></div>' };
    const w = mountChecks({ rows: [{ id: 'a', message }], hasChecks: true }, { SortableTable: table });

    expect(w.text()).not.toContain(message);

    await w.find('button.role-link').trigger('click');

    expect(w.text()).toContain(message);
  });
  it('tells an empty filter result from a report without checks', () => {
    expect(mountChecks({ rows: [], hasChecks: true }).text()).toContain('noMatchingChecks');
    expect(mountChecks({ rows: [], hasChecks: false }).text()).toContain('noIssues');
  });
});
