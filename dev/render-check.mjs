/**
 * Headless render check for the prompt-library panel.
 *
 * No real React is involved: a tiny hooks shim stands in, so the component can be
 * called outside a browser. It catches undefined identifiers, wrong prop names,
 * wrong list contents and dictionary drift — the failures that would otherwise
 * only show up as a broken popover in the live UI.
 */
import { readFileSync } from 'node:fs';

const SOURCE = new URL('../client.js', import.meta.url);

/**
 * A hooks shim whose cursor and state overrides are reachable from the outside:
 * the module captures its `require('react')` object once, so a single React
 * object must serve every render. Overrides are keyed by useState call order.
 */
function makeShim() {
  const session = { hook: 0, overrides: {} };
  const flatten = (children) => children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false);
  const React = {
    Fragment: Symbol.for('react.fragment'),
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children: flatten(children) };
    },
    useState(initial) {
      const index = session.hook++;
      // React calls a function initialiser lazily; `initialDocument` is one.
      const base = typeof initial === 'function' ? initial() : initial;
      const value = Object.prototype.hasOwnProperty.call(session.overrides, index) ? session.overrides[index] : base;
      return [value, () => {}];
    },
    useRef(initial) {
      session.hook++;
      return { current: initial === undefined ? null : initial };
    },
    useMemo(fn) {
      session.hook++;
      return fn();
    },
    useEffect() {
      session.hook++;
    },
  };
  return { React, session };
}

function walk(node, visit) {
  if (node === null || node === undefined) return;
  if (typeof node === 'string') return;
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit));
    return;
  }
  visit(node);
  node.children.forEach((child) => walk(child, visit));
}

function textOf(node) {
  const parts = [];
  walk(node, (element) => {
    element.children.forEach((child) => {
      if (typeof child === 'string') parts.push(child);
    });
  });
  return parts.join(' ');
}

async function loadPlugin(doc) {
  const stored = doc === null ? null : JSON.stringify(doc);
  const localStorage = { getItem: () => stored, setItem: () => {}, removeItem: () => {} };
  globalThis.window = {
    localStorage,
    innerWidth: 1440,
    innerHeight: 900,
    addEventListener() {},
    removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, body: null },
  };
  const captured = { dictionaries: null, slots: [] };
  const shim = makeShim();
  let mod = null;
  globalThis.window.__ModuleLoader__ = {
    load(definition) {
      mod = definition.factory((name) => {
        if (name === 'react') return shim.React;
        // A react-dom without createPortal keeps the popover inline instead of
        // handing it to a portal this shim cannot render.
        return {};
      });
    },
  };
  const source = readFileSync(SOURCE, 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', 'globalThis', source)(globalThis.window, globalThis);

  const ctx = {
    effect: (fn) => fn(),
    locale: { register: (ns, dicts) => { captured.dictionaries = dicts; } },
    slots: {
      inject: (name, fn) => fn(),
      register: (definition, component) => { captured.slots.push({ definition, component }); },
    },
  };
  mod.apply(ctx);
  const library = captured.slots.find((slot) => slot.definition.id === 'prompt-manager');
  const zh = captured.dictionaries.zh;
  const en = captured.dictionaries.en;
  const t = (key, params) => {
    let out = typeof zh[key] === 'string' ? zh[key] : key;
    if (params !== undefined) for (const [k, v] of Object.entries(params)) out = out.replace(`{${k}}`, String(v));
    return out;
  };
  const render = (overrides) => {
    shim.session.hook = 0;
    shim.session.overrides = overrides;
    return library.component({
      t,
      useInput: (selector) => selector({ draft: '' }),
      inputActions: { setDraft() {}, captureInsertion: () => null, insertText: () => true },
    });
  };
  const resetHooks = () => {
    shim.session.hook = 0;
    shim.session.overrides = {};
  };
  return { render, resetHooks, React: shim.React, zh, en };
}

/** Function components are not invoked by the shim; call one explicitly. */
function renderChild(tree, matches, resetHooks) {
  let found = null;
  walk(tree, (element) => {
    if (found === null && typeof element.type === 'function' && matches(element)) found = element;
  });
  if (found === null) return null;
  resetHooks();
  return found.type(found.props);
}

function collectPanel(tree) {
  const rows = [];
  const chips = [];
  const rowTags = [];
  walk(tree, (element) => {
    const cls = typeof element.props.className === 'string' ? element.props.className : '';
    if (cls === 'dsh-pm-row') rows.push({ active: element.props['data-active'], text: textOf(element) });
    if (cls === 'dsh-pm-chip') chips.push({ on: element.props['data-on'], label: textOf(element) });
    if (cls === 'dsh-pm-row-tag') rowTags.push(textOf(element));
  });
  return { rows, chips, rowTags, text: textOf(tree) };
}

let failures = 0;
const check = (label, condition, extra) => {
  if (condition) return;
  failures += 1;
  console.log(`FAIL ${label}${extra === undefined ? '' : ` :: ${JSON.stringify(extra)}`}`);
};

// --- 0: dictionaries stay in lockstep --------------------------------------------
{
  const { zh, en } = await loadPlugin(null);
  const zhKeys = Object.keys(zh).sort();
  const enKeys = Object.keys(en).sort();
  check('dict keys identical', zhKeys.join() === enKeys.join(), {
    onlyZh: zhKeys.filter((key) => !enKeys.includes(key)),
    onlyEn: enKeys.filter((key) => !zhKeys.includes(key)),
  });
  check('star keys removed', !('panel.tabFav' in zh) && !('action.favorite' in zh) && !('panel.restore' in zh), null);
  check('tag keys present', 'panel.untagged' in zh && 'form.tags' in zh && 'form.duplicate' in zh, null);
}

// --- A: fresh install, one chip per seed tag -------------------------------------
{
  const { render } = await loadPlugin(null);
  const view = collectPanel(render({ 1: true }));
  check('A rows=4 seeds', view.rows.length === 4, view.rows.length);
  check('A no restore button', !view.text.includes('恢复默认'), view.text.slice(0, 200));
  check('A chips = 全部 + 3 tags', view.chips.length === 4, view.chips);
  check('A all chip on', view.chips[0]?.on === 'true', view.chips[0]);
  check('A 全部 count', view.chips[0]?.label.includes('4'), view.chips[0]?.label);
  check('A 代码 count 2', view.chips.some((chip) => chip.label.startsWith('代码') && chip.label.includes('2')), view.chips);
  check('A no untagged chip', !view.chips.some((chip) => chip.label.startsWith('未分组')), view.chips);
  check('A row tags rendered', view.rowTags.length === 4, view.rowTags);
  check('A first row highlighted', view.rows[0]?.active === 'true', view.rows.map((r) => r.active));
}

// --- B: tagged store, chip filtering, untagged bucket ----------------------------
const stored = {
  version: 1,
  insertMode: 'insert',
  prompts: [
    { id: 'a', title: '定时任务', text: '今天定时任务的报告你看一下', tags: ['小满', '报告'] },
    { id: 'b', title: '更新', text: '请检查我的所有的插件', tags: [] },
    { id: 'c', title: '小满检讨', text: '你看着办', tags: ['小满'] },
  ],
};
{
  const { render } = await loadPlugin(stored);
  const view = collectPanel(render({ 1: true }));
  check('B chips = 全部 + 2 tags + 未分组', view.chips.length === 4, view.chips);
  check('B 小满 has 2', view.chips.some((chip) => chip.label.startsWith('小满') && chip.label.includes('2')), view.chips);
  check('B 未分组 has 1', view.chips.some((chip) => chip.label.startsWith('未分组') && chip.label.includes('1')), view.chips);
  check('B rows = 3', view.rows.length === 3, view.rows.length);
}
{
  const { render } = await loadPlugin(stored);
  // open(#1)=true, tagFilter(#3)='小满'
  const view = collectPanel(render({ 1: true, 3: '小满' }));
  check('B tag filter to 2', view.rows.length === 2, view.rows.length);
  check('B filtered rows are the tagged ones', view.rows.every((row) => !row.text.includes('请检查我的所有的插件')), view.rows.map((r) => r.text));
  check('B active chip on', view.chips.find((chip) => chip.label.startsWith('小满'))?.on === 'true', view.chips);
}
{
  const { render } = await loadPlugin(stored);
  // tagFilter(#3)='' is the untagged bucket
  const view = collectPanel(render({ 1: true, 3: '' }));
  check('B untagged filter to 1', view.rows.length === 1, view.rows.length);
  check('B untagged row', view.rows[0]?.text.includes('请检查我的所有的插件'), view.rows.map((r) => r.text));
}

// --- C: search reaches into tags, and dirty tag text is cleaned ------------------
{
  const { render } = await loadPlugin({
    version: 1,
    insertMode: 'insert',
    prompts: [
      { id: 'x', title: '甲', text: '与标签无关的正文', tags: ['  小满 ，报告 ', '小满'] },
      { id: 'y', title: '乙', text: '另一条', tags: [] },
    ],
  });
  const view = collectPanel(render({ 1: true, 2: '小满' }));
  check('C search matches tag', view.rows.length === 1 && view.rows[0].text.includes('甲'), view.rows.map((r) => r.text));
  const all = collectPanel(render({ 1: true }));
  check('C tags normalised', all.chips.length === 4, all.chips); // 全部 + 小满 + 报告 + 未分组
  check('C duplicate tag collapsed', all.chips.filter((chip) => chip.label.startsWith('小满')).length === 1, all.chips);
}

// --- D: the edit form edits tags, and offers a copy action ----------------------
{
  const { render, resetHooks } = await loadPlugin(stored);
  const tree = render({ 1: true, 5: { id: 'a', title: '定时任务', text: '今天定时任务的报告你看一下', tags: ['小满', '报告'] } });
  check('D panel title', textOf(tree).includes('编辑提示词'), textOf(tree).slice(0, 120));
  const form = renderChild(tree, (el) => typeof el.props.onSaveAsCopy === 'function', resetHooks);
  check('D form renders', form !== null, null);
  const text = form === null ? '' : textOf(form);
  check('D form shows tags label', text.includes('标签'), text.slice(0, 240));
  check('D form shows save', text.includes('保存'), text.slice(0, 240));
  check('D form shows copy', text.includes('另存副本'), text.slice(0, 240));
  let tagInput = null;
  if (form !== null) walk(form, (el) => { if (el.props.id === 'dsh-pm-tags') tagInput = el; });
  check('D tag input prefilled', tagInput?.props.value === '小满, 报告', tagInput?.props.value);
}
{
  const { render, resetHooks } = await loadPlugin(stored);
  const tree = render({ 1: true, 5: { title: '', text: '', tags: [] } });
  const form = renderChild(tree, (el) => typeof el.props.onSaveAsCopy === 'function', resetHooks);
  const text = form === null ? '' : textOf(form);
  check('D new form has no copy action', !text.includes('另存副本'), text.slice(0, 240));
  check('D new form title', textOf(tree).includes('新建提示词'), textOf(tree).slice(0, 240));
}

console.log(failures === 0 ? 'PASS all render checks' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
