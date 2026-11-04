/**
 * Headless render check for the prompt-library panel.
 *
 * No real React is involved: this stands in a tiny hooks shim so the component
 * can be called outside a browser. It catches undefined identifiers, wrong prop
 * names and wrong list contents — the failures that would otherwise only show
 * as a blank popover in the live UI.
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
  const localStorage = {
    getItem: () => stored,
    setItem: () => {},
    removeItem: () => {},
  };
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
  const React = shim.React;
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
    }, overrides);
  };
  const resetHooks = () => {
    shim.session.hook = 0;
    shim.session.overrides = {};
  };
  return { render, resetHooks, React, zh, en };
}

function collectPanel(tree, React) {
  const rows = [];
  const tabs = [];
  walk(tree, (element) => {
    const cls = typeof element.props.className === 'string' ? element.props.className : '';
    if (cls === 'dsh-pm-row') {
      const star = element.children.find((child) => child?.props?.className === 'dsh-pm-star');
      rows.push({ active: element.props['data-active'], starred: star?.props['data-on'], title: textOf(element) });
    }
    if (cls === 'dsh-pm-tab') tabs.push({ on: element.props['data-on'], label: textOf(element) });
  });
  return { rows, tabs, text: textOf(tree) };
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

let failures = 0;
const check = (label, condition, extra) => {
  if (condition) return;
  failures += 1;
  console.log(`FAIL ${label}${extra === undefined ? '' : ` :: ${JSON.stringify(extra)}`}`);
};

// --- 0: the two dictionaries must stay in lockstep ------------------------------
{
  const { zh, en } = await loadPlugin(null);
  const zhKeys = Object.keys(zh).sort();
  const enKeys = Object.keys(en).sort();
  const onlyZh = zhKeys.filter((key) => !enKeys.includes(key));
  const onlyEn = enKeys.filter((key) => !zhKeys.includes(key));
  check('dict keys identical', onlyZh.length === 0 && onlyEn.length === 0, { onlyZh, onlyEn });
  check('empty keys removed', !('panel.restore' in zh) && !('panel.restore' in en), null);
  check('fav keys present', 'panel.tabFav' in zh && 'action.favorite' in zh && 'form.duplicate' in zh, null);
}

// --- A: fresh install, 全部 tab -------------------------------------------------
{
  const { render, React } = await loadPlugin(null);
  // open(#1)=true, tab stays 'all'
  const tree = render({ 1: true });
  const view = collectPanel(tree, React);
  check('A rows=4 seeds', view.rows.length === 4, view.rows.length);
  check('A no restore button', !view.text.includes('恢复默认'), view.text.slice(0, 200));
  check('A tabs present', view.tabs.length === 2, view.tabs);
  check('A all tab on', view.tabs[0]?.on === 'true', view.tabs[0]);
  check('A no stars yet', view.rows.every((row) => row.starred === 'false'), view.rows.map((r) => r.starred));
  check('A first row highlighted', view.rows[0]?.active === 'true', view.rows.map((r) => r.active));
}

// --- B: 3 stored prompts, 2 starred, 收藏 tab -----------------------------------
const stored = {
  version: 1,
  insertMode: 'insert',
  prompts: [
    { id: 'a', title: '定时任务', text: '今天定时任务的报告你看一下', fav: true },
    { id: 'b', title: '更新', text: '请检查我的所有的插件', fav: false },
    { id: 'c', title: '小满', text: '你看着办', fav: true },
  ],
};
{
  const { render, React } = await loadPlugin(stored);
  // open(#1)=true, tab(#3)='fav'
  const tree = render({ 1: true, 3: 'fav' });
  const view = collectPanel(tree, React);
  check('B fav tab filters to 2', view.rows.length === 2, view.rows.length);
  check('B fav rows all starred', view.rows.every((row) => row.starred === 'true'), view.rows.map((r) => r.starred));
  check('B fav tab on', view.tabs[1]?.on === 'true', view.tabs[1]);
  check('B fav count shown', view.text.includes('2'), view.text.slice(0, 160));
}
{
  const { render, React } = await loadPlugin(stored);
  const view = collectPanel(render({ 1: true }), React);
  check('C all tab shows 3', view.rows.length === 3, view.rows.length);
  check('C exactly 2 stars', view.rows.filter((row) => row.starred === 'true').length === 2, view.rows.map((r) => r.starred));
}

// --- D: the edit form offers a copy action, and it carries the open dialog -------
{
  const { render, resetHooks } = await loadPlugin(stored);
  // open(#1)=true, editing(#5)=an existing prompt
  const tree = render({ 1: true, 5: { id: 'b', title: '更新', text: '请检查我的所有的插件' } });
  check('D panel title', textOf(tree).includes('编辑提示词'), textOf(tree).slice(0, 120));
  const form = renderChild(tree, (el) => typeof el.props.onSaveAsCopy === 'function', resetHooks);
  const text = form === null ? '' : textOf(form);
  check('D form renders', form !== null, text.slice(0, 240));
  check('D form shows save', text.includes('保存'), text.slice(0, 240));
  check('D form shows copy', text.includes('另存副本'), text.slice(0, 240));
  check('D form hides list rows', !textOf(tree).includes('今天定时任务的报告你看一下'), text.slice(0, 240));
}
{
  const { render, resetHooks } = await loadPlugin(stored);
  // open(#1)=true, editing(#5)=a new prompt: no copy action
  const tree = render({ 1: true, 5: { title: '', text: '' } });
  const form = renderChild(tree, (el) => typeof el.props.onSaveAsCopy === 'function', resetHooks);
  const text = form === null ? '' : textOf(form);
  check('D new form has no copy action', !text.includes('另存副本'), text.slice(0, 240));
  check('D new form keeps save', text.includes('保存'), text.slice(0, 240));
  check('D new form title', textOf(tree).includes('新建提示词'), textOf(tree).slice(0, 240));
}

console.log(failures === 0 ? 'PASS all render checks' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
