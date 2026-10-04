/**
 * Client half of @local/dsh-prompt-manager.
 *
 * Registers one entry in the composer tool row's left seat
 * (`conversation.input.left`) that renders a compact "提示词" trigger plus a
 * popover holding the saved prompt library. Clicking a row writes that prompt
 * into the composer through the slot's standard `inputActions` face
 * (`setDraft` / `insertText`), so no DOM of the editor is touched.
 *
 * The library is device-local data kept in `localStorage`; nothing leaves the
 * browser and no Host state is written.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-prompt-manager',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;

    /** Locale namespace owned by this plugin. */
    const NS = 'prompt-manager';
    /** Device-local storage key holding the whole library document. */
    const STORAGE_KEY = 'dsh.prompt-manager.v1';
    /** Popover width in CSS pixels; kept in sync with the stylesheet below. */
    const PANEL_WIDTH = 344;
    /** Style element id, so a reloaded module generation replaces its own sheet. */
    const STYLE_ID = 'dsh-prompt-manager-style';

    /** Simplified Chinese dictionary (the key-set source of truth). */
    const zh = {
      'trigger.label': '提示词',
      'trigger.title': '打开提示词库',
      'panel.title': '提示词库',
      'panel.count': '{n} 条',
      'panel.search': '搜索提示词…',
      'panel.new': '新建',
      'panel.empty': '还没有提示词，点「新建」添加一条。',
      'panel.noMatch': '没有匹配的提示词。',
      'panel.mode': '点击后',
      'panel.modeInsert': '插入',
      'panel.modeReplace': '替换',
      'panel.modeHintInsert': '把提示词插入到光标处（输入框为空时即整段写入）',
      'panel.modeHintReplace': '用提示词替换输入框里的全部内容',
      'action.edit': '编辑',
      'action.delete': '删除',
      'action.confirmDelete': '确认删除？',
      'form.newTitle': '新建提示词',
      'form.editTitle': '编辑提示词',
      'form.name': '名称',
      'form.namePlaceholder': '例：代码审查',
      'form.text': '内容',
      'form.textPlaceholder': '点击该条目时写入输入框的文本',
      'form.save': '保存',
      'form.cancel': '取消',
      'form.invalid': '名称和内容都不能为空。',
      'panel.restore': '恢复默认',
      'panel.clear': '清空输入框',
      'opt.trigger': '优化',
      'opt.triggerTitle': '用 AI 把输入框里的提示词改写得更清晰',
      'opt.title': '优化提示词',
      'opt.loading': '正在优化…',
      'opt.empty': '输入框是空的，先写点内容再优化。',
      'opt.original': '原文',
      'opt.optimized': '优化后',
      'opt.apply': '替换输入框',
      'opt.again': '再优化一次',
      'opt.close': '关闭',
      'opt.undo': '撤销替换',
      'opt.applied': '已替换输入框，可撤销。',
      'opt.settings': '设置',
      'opt.back': '返回',
      'opt.save': '保存',
      'opt.saved': '已保存。',
      'opt.test': '测试连接',
      'opt.testing': '正在测试…',
      'opt.testOk': '连接正常：{model} 返回 {n} 字。',
      'opt.preset': '预设',
      'opt.field.baseURL': '接口地址（OpenAI 兼容）',
      'opt.field.model': '模型',
      'opt.field.keyRef': '凭据名',
      'opt.field.keyRefHint': '从环境变量或 ~/.dsh/.credentials.yaml 读取，例如 ZHIPU_API_KEY',
      'opt.field.apiKey': 'API Key',
      'opt.field.apiKeyHint': '留空表示不改动已保存的 Key',
      'opt.field.autoReplace': '优化后直接替换输入框',
      'opt.field.autoReplaceHint': '关掉则先预览，再由你点「替换输入框」',
      'opt.key.none': '未配置 Key',
      'opt.key.literal': '已保存 Key',
      'opt.key.ref': '凭据 {name}',
      'opt.modelHint': '模型 id 以服务商控制台为准，可手动改。',
      'opt.restartHint': '插件的宿主半边要重启一次 DSH 才会生效；重启后这里就能用了。',
    };

    /** English dictionary, checked against the zh key set. */
    const en = {
      'trigger.label': 'Prompts',
      'trigger.title': 'Open the prompt library',
      'panel.title': 'Prompt library',
      'panel.count': '{n}',
      'panel.search': 'Search prompts…',
      'panel.new': 'New',
      'panel.empty': 'No prompts yet — click "New" to add one.',
      'panel.noMatch': 'No matching prompt.',
      'panel.mode': 'Click',
      'panel.modeInsert': 'Insert',
      'panel.modeReplace': 'Replace',
      'panel.modeHintInsert': 'Insert the prompt at the caret (fills the box when the draft is empty)',
      'panel.modeHintReplace': 'Replace everything in the composer with the prompt',
      'action.edit': 'Edit',
      'action.delete': 'Delete',
      'action.confirmDelete': 'Delete?',
      'form.newTitle': 'New prompt',
      'form.editTitle': 'Edit prompt',
      'form.name': 'Name',
      'form.namePlaceholder': 'e.g. Code review',
      'form.text': 'Text',
      'form.textPlaceholder': 'What gets written into the composer',
      'form.save': 'Save',
      'form.cancel': 'Cancel',
      'form.invalid': 'Name and text are both required.',
      'panel.restore': 'Restore defaults',
      'panel.clear': 'Clear draft',
      'opt.trigger': 'Optimize',
      'opt.triggerTitle': 'Rewrite the composer draft into a clearer prompt',
      'opt.title': 'Optimize prompt',
      'opt.loading': 'Optimizing…',
      'opt.empty': 'The composer is empty — write something first.',
      'opt.original': 'Original',
      'opt.optimized': 'Optimized',
      'opt.apply': 'Replace draft',
      'opt.again': 'Optimize again',
      'opt.close': 'Close',
      'opt.undo': 'Undo replace',
      'opt.applied': 'Draft replaced — undo is available.',
      'opt.settings': 'Settings',
      'opt.back': 'Back',
      'opt.save': 'Save',
      'opt.saved': 'Saved.',
      'opt.test': 'Test connection',
      'opt.testing': 'Testing…',
      'opt.testOk': 'Connected: {model} returned {n} characters.',
      'opt.preset': 'Preset',
      'opt.field.baseURL': 'Base URL (OpenAI-compatible)',
      'opt.field.model': 'Model',
      'opt.field.keyRef': 'Credential name',
      'opt.field.keyRefHint': 'Read from the environment or ~/.dsh/.credentials.yaml, e.g. ZHIPU_API_KEY',
      'opt.field.apiKey': 'API key',
      'opt.field.apiKeyHint': 'Leave blank to keep the saved key',
      'opt.field.autoReplace': 'Replace the draft right after optimizing',
      'opt.field.autoReplaceHint': 'Off: preview first, then click "Replace draft"',
      'opt.key.none': 'no key configured',
      'opt.key.literal': 'saved key',
      'opt.key.ref': 'credential {name}',
      'opt.modelHint': 'Use the model id from your provider console; it is editable.',
      'opt.restartHint': 'The host half of this plugin loads on the next DSH start; it works once DSH is restarted.',
    };

    /** First-run library, used only when this device holds no stored document. */
    const SEED_PROMPTS = [
      {
        id: 'seed-code-review',
        title: '代码审查',
        text: '请以资深工程师的视角审查这些改动：先列出真正的缺陷与风险（按严重程度排序，标明文件与行号），再给最小修复方案。不要重写无关代码，不要复述改动内容。',
      },
      {
        id: 'seed-clarify',
        title: '先澄清再动手',
        text: '先不要改任何文件。请先用三句话复述你对需求的理解，再列出 3-5 个会影响实现的关键疑问，等我确认后再开始。',
      },
      {
        id: 'seed-summarize',
        title: '压缩成要点',
        text: '把上面的内容压缩成要点清单：每条不超过 20 字，保留结论、数字、命令和待办，去掉过程与解释。',
      },
      {
        id: 'seed-fix-error',
        title: '修报错',
        text: '下面是完整报错与上下文。请先定位根因并说明证据，再给出最小改动方案，然后实施并验证；不要顺手重构其他代码。',
      },
    ];

    /** @returns a fresh collision-resistant prompt id. */
    function newId() {
      return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    }

    /** @param value - candidate stored row. @returns whether it can be a prompt. */
    function isStoredPrompt(value) {
      return value !== null && typeof value === 'object' && typeof value.text === 'string';
    }

    /** @param text - prompt body. @returns its first non-empty line, clipped. */
    function firstLine(text) {
      const line = String(text).split('\n').find((item) => item.trim() !== '');
      if (line === undefined) return '';
      const trimmed = line.trim();
      return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
    }

    /** @param raw - one stored row. @returns a normalized prompt. */
    function normalizePrompt(raw) {
      const text = raw.text;
      const title = typeof raw.title === 'string' && raw.title.trim() !== '' ? raw.title.trim() : firstLine(text) || '未命名';
      const id = typeof raw.id === 'string' && raw.id !== '' ? raw.id : newId();
      return { id, title, text };
    }

    /** @returns the stored library document, or null when this device has none. */
    function readDocument() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === null || raw === '') return null;
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object') return null;
        const rows = Array.isArray(parsed.prompts) ? parsed.prompts.filter(isStoredPrompt) : [];
        return {
          version: 1,
          insertMode: parsed.insertMode === 'replace' ? 'replace' : 'insert',
          prompts: rows.map(normalizePrompt),
        };
      } catch (_error) {
        return null;
      }
    }

    /** @param library - library document to persist. */
    function writeDocument(library) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, insertMode: library.insertMode, prompts: library.prompts }));
      } catch (_error) {
        /* storage unavailable or full: the session still works, it just will not persist */
      }
    }

    /** @returns the initial library document for this device. */
    function initialDocument() {
      const stored = readDocument();
      if (stored !== null) return stored;
      return { version: 1, insertMode: 'insert', prompts: SEED_PROMPTS.map(normalizePrompt) };
    }

    const CSS = `
.dsh-pm-trigger{display:inline-flex;align-items:center;gap:6px;height:28px;max-width:100%;padding:0 8px;border:0;border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:13px;line-height:20px;cursor:pointer;white-space:nowrap}
.dsh-pm-trigger:hover,.dsh-pm-trigger[data-open="true"]{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary)}
.dsh-pm-trigger:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dsh-pm-trigger svg{flex:none;display:block}
.dsh-pm-icon{width:16px;height:16px}
.dsh-pm-panel{position:fixed;z-index:60;display:flex;flex-direction:column;overflow:hidden;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-panel,0 10px 30px rgba(0,0,0,.18));font-family:inherit;font-size:13px;line-height:20px}
.dsh-pm-head{display:flex;align-items:center;gap:8px;padding:10px 10px 8px 12px;border-bottom:.5px solid var(--dsw-alias-border-l1)}
.dsh-pm-title{font-weight:600;font-size:13px}
.dsh-pm-count{color:var(--dsw-alias-label-secondary);font-size:12px}
.dsh-pm-head-actions{margin-left:auto;display:flex;align-items:center;gap:6px}
.dsh-pm-btn{display:inline-flex;align-items:center;justify-content:center;gap:4px;height:26px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;line-height:18px;cursor:pointer;white-space:nowrap}
.dsh-pm-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}
.dsh-pm-btn-primary{border-color:transparent;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-inverted,#fff)}
.dsh-pm-btn-primary:hover{opacity:.9;background:var(--dsw-alias-brand-primary)}
.dsh-pm-btn-danger{color:var(--dsw-alias-state-error-primary)}
.dsh-pm-search{margin:8px 12px 4px;height:28px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-2,transparent);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px}
.dsh-pm-search::placeholder{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
.dsh-pm-search:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}
.dsh-pm-list{overflow-y:auto;padding:4px 6px 8px;margin:0;list-style:none;display:flex;flex-direction:column;gap:2px}
.dsh-pm-row{position:relative;display:flex;align-items:flex-start;gap:8px;padding:7px 8px;border-radius:var(--dsw-radius-md,8px);cursor:pointer}
.dsh-pm-row:hover,.dsh-pm-row:focus-visible{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));outline:none}
.dsh-pm-row-main{min-width:0;flex:1}
.dsh-pm-row-title{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsh-pm-row-text{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsh-pm-row-actions{display:flex;align-items:center;gap:2px;flex:none;opacity:0;transition:opacity .1s ease}
.dsh-pm-row:hover .dsh-pm-row-actions,.dsh-pm-row:focus-within .dsh-pm-row-actions{opacity:1}
.dsh-pm-mini{height:22px;padding:0 6px;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12px;cursor:pointer}
.dsh-pm-mini:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.2));color:var(--dsw-alias-label-primary)}
.dsh-pm-mini-danger:hover{color:var(--dsw-alias-state-error-primary)}
.dsh-pm-empty{padding:16px 12px;color:var(--dsw-alias-label-secondary);text-align:center}
.dsh-pm-foot{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 12px 10px;border-top:.5px solid var(--dsw-alias-border-l1)}
.dsh-pm-foot-label{color:var(--dsw-alias-label-secondary);font-size:12px;margin-right:auto}
.dsh-pm-seg{display:inline-flex;padding:2px;border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12))}
.dsh-pm-seg button{height:22px;padding:0 10px;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12px;cursor:pointer}
.dsh-pm-seg button[data-on="true"]{background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-overlay));color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-soft,0 1px 2px rgba(0,0,0,.12))}
.dsh-pm-form{display:flex;flex-direction:column;gap:8px;padding:10px 12px 12px}
.dsh-pm-form label{color:var(--dsw-alias-label-secondary);font-size:12px}
.dsh-pm-input,.dsh-pm-textarea{width:100%;box-sizing:border-box;padding:6px 8px;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-2,transparent);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:20px}
.dsh-pm-textarea{min-height:140px;resize:vertical;white-space:pre-wrap}
.dsh-pm-input:focus,.dsh-pm-textarea:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}
.dsh-pm-error{color:var(--dsw-alias-state-error-primary);font-size:12px}
.dsh-pm-section{display:flex;flex-direction:column;gap:4px;padding:8px 12px 0}
.dsh-pm-label{color:var(--dsw-alias-label-secondary);font-size:12px}
.dsh-pm-pre{margin:0;padding:8px;max-height:120px;overflow:auto;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.08));color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word;font-family:inherit;font-size:12px;line-height:18px}
.dsh-pm-pre-result{max-height:240px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}
.dsh-pm-actions{display:flex;align-items:center;gap:8px;justify-content:flex-end;padding:10px 12px 12px}
.dsh-pm-note{color:var(--dsw-alias-state-success-primary);font-size:12px;margin-right:auto}
.dsh-pm-status{display:flex;align-items:center;gap:8px;padding:14px 12px;color:var(--dsw-alias-label-secondary)}
.dsh-pm-spinner{width:14px;height:14px;flex:none;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-brand-primary);border-radius:50%;animation:dsh-pm-spin .8s linear infinite}
@keyframes dsh-pm-spin{to{transform:rotate(360deg)}}
.dsh-pm-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain}
.dsh-pm-row-line{display:flex;align-items:center;gap:8px;padding:2px 12px}
.dsh-pm-row-line span{flex:none;color:var(--dsw-alias-label-secondary);font-size:12px}
.dsh-pm-row-line select{flex:1 1 auto;min-width:0}
.dsh-pm-row-line input[type="checkbox"]{width:14px;height:14px;accent-color:var(--dsw-alias-brand-primary)}
.dsh-pm-hint{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
`;

    /** Inline bookmark/chat glyph for the trigger button. */
    function TriggerIcon() {
      return h(
        'svg',
        {
          className: 'dsh-pm-icon',
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        h('path', { d: 'M4 5.5A1.5 1.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5V13a1.5 1.5 0 0 1-1.5 1.5H8.6L5.4 17.3A.5.5 0 0 1 4.5 17V5.5Z' }),
        h('path', { d: 'M7.5 8h5M7.5 11h3.5' }),
      );
    }

    /**
     * The composer tool-row control and its popover.
     * @param props - standard Session props (useInput, inputActions) plus the
     * `prompt-manager` locale dictionary.
     */
    function PromptManager(props) {
      const inputActions = props.inputActions;
      const useInput = props.useInput;
      const t = typeof props.t === 'function' ? props.t : (key) => key;
      const draft = useInput === undefined ? '' : useInput((value) => (value === undefined ? '' : value.draft));

      const [library, setLibrary] = React.useState(initialDocument);
      const [open, setOpen] = React.useState(false);
      const [query, setQuery] = React.useState('');
      const [editing, setEditing] = React.useState(null);
      const [confirmId, setConfirmId] = React.useState(null);
      const [position, setPosition] = React.useState(null);
      const buttonRef = React.useRef(null);
      const panelRef = React.useRef(null);
      const searchRef = React.useRef(null);

      React.useEffect(() => {
        writeDocument(library);
      }, [library]);

      React.useEffect(() => {
        if (!open) return undefined;
        const place = () => {
          const element = buttonRef.current;
          if (element === null) return;
          const rect = element.getBoundingClientRect();
          const left = Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 12));
          const bottom = Math.max(8, window.innerHeight - rect.top + 8);
          setPosition({ left, bottom });
        };
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => {
          window.removeEventListener('resize', place);
          window.removeEventListener('scroll', place, true);
        };
      }, [open]);

      React.useEffect(() => {
        if (!open) return undefined;
        const onPointerDown = (event) => {
          const panel = panelRef.current;
          const button = buttonRef.current;
          if (panel !== null && panel.contains(event.target)) return;
          if (button !== null && button.contains(event.target)) return;
          setOpen(false);
          setEditing(null);
          setConfirmId(null);
        };
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return;
          setOpen(false);
          setEditing(null);
          setConfirmId(null);
        };
        window.document.addEventListener('mousedown', onPointerDown, true);
        window.document.addEventListener('keydown', onKeyDown, true);
        return () => {
          window.document.removeEventListener('mousedown', onPointerDown, true);
          window.document.removeEventListener('keydown', onKeyDown, true);
        };
      }, [open]);

      React.useEffect(() => {
        if (open && editing === null && searchRef.current !== null) searchRef.current.focus();
      }, [open, editing]);

      const rows = React.useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (needle === '') return library.prompts;
        return library.prompts.filter(
          (prompt) => prompt.title.toLowerCase().includes(needle) || prompt.text.toLowerCase().includes(needle),
        );
      }, [library.prompts, query]);

      const toggle = () => {
        setOpen((value) => !value);
        setEditing(null);
        setConfirmId(null);
        if (open) setQuery('');
      };

      /** Write one prompt into the composer through the slot's input face. */
      const insert = (prompt) => {
        if (inputActions === undefined) return;
        const replace = library.insertMode === 'replace' || draft.trim() === '';
        if (replace) {
          inputActions.setDraft(prompt.text);
        } else {
          const span = inputActions.captureInsertion();
          if (!inputActions.insertText(prompt.text, span)) inputActions.setDraft(prompt.text);
        }
        setOpen(false);
        setEditing(null);
        setConfirmId(null);
        setQuery('');
      };

      const savePrompt = (form) => {
        const title = form.title.trim();
        const text = form.text.trim();
        if (title === '' || text === '') return false;
        setLibrary((current) => {
          if (form.id === undefined) {
            return { ...current, prompts: [{ id: newId(), title, text }, ...current.prompts] };
          }
          return {
            ...current,
            prompts: current.prompts.map((prompt) => (prompt.id === form.id ? { id: prompt.id, title, text } : prompt)),
          };
        });
        return true;
      };

      const removePrompt = (id) => {
        setLibrary((current) => ({ ...current, prompts: current.prompts.filter((prompt) => prompt.id !== id) }));
        setConfirmId(null);
      };

      const restoreDefaults = () => {
        setLibrary((current) => ({ ...current, prompts: SEED_PROMPTS.map(normalizePrompt) }));
        setConfirmId(null);
      };

      const setMode = (mode) => {
        setLibrary((current) => ({ ...current, insertMode: mode }));
      };

      const trigger = h(
        'button',
        {
          key: 'trigger',
          type: 'button',
          ref: buttonRef,
          className: 'dsh-pm-trigger',
          'data-open': open ? 'true' : 'false',
          title: t('trigger.title'),
          'aria-haspopup': 'dialog',
          'aria-expanded': open ? 'true' : 'false',
          onClick: toggle,
        },
        h(TriggerIcon, null),
        h('span', null, t('trigger.label')),
      );

      if (!open) return h(React.Fragment, null, h('style', { id: STYLE_ID, dangerouslySetInnerHTML: { __html: CSS } }), trigger);
      const header = h(
        'div',
        { className: 'dsh-pm-head', key: 'head' },
        h('span', { className: 'dsh-pm-title' }, editing === null ? t('panel.title') : editing.id === undefined ? t('form.newTitle') : t('form.editTitle')),
        editing === null ? h('span', { className: 'dsh-pm-count' }, t('panel.count', { n: rows.length })) : null,
        h(
          'span',
          { className: 'dsh-pm-head-actions' },
          editing === null
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-pm-btn',
                  onClick: () => {
                    setEditing({ title: '', text: '' });
                    setConfirmId(null);
                  },
                },
                t('panel.new'),
              )
            : null,
        ),
      );

      let body;
      if (editing !== null) {
        body = h(PromptForm, {
          key: 'form',
          value: editing,
          t,
          onCancel: () => setEditing(null),
          onSave: (form) => {
            if (savePrompt(form)) setEditing(null);
          },
        });
      } else {
        body = [
          h('input', {
            key: 'search',
            ref: searchRef,
            className: 'dsh-pm-search',
            type: 'search',
            value: query,
            placeholder: t('panel.search'),
            onChange: (event) => setQuery(event.target.value),
          }),
          rows.length === 0
            ? h('div', { key: 'empty', className: 'dsh-pm-empty' }, library.prompts.length === 0 ? t('panel.empty') : t('panel.noMatch'))
            : h(
                'div',
                { key: 'list', className: 'dsh-pm-list' },
                rows.map((prompt) =>
                  h(
                    'div',
                    {
                      key: prompt.id,
                      className: 'dsh-pm-row',
                      role: 'button',
                      tabIndex: 0,
                      title: prompt.text,
                      onClick: () => insert(prompt),
                      onKeyDown: (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          insert(prompt);
                        }
                      },
                    },
                    h(
                      'div',
                      { className: 'dsh-pm-row-main' },
                      h('div', { className: 'dsh-pm-row-title' }, prompt.title),
                      h('div', { className: 'dsh-pm-row-text' }, firstLine(prompt.text)),
                    ),
                    h(
                      'div',
                      { className: 'dsh-pm-row-actions' },
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'dsh-pm-mini',
                          title: t('action.edit'),
                          onClick: (event) => {
                            event.stopPropagation();
                            setEditing({ id: prompt.id, title: prompt.title, text: prompt.text });
                            setConfirmId(null);
                          },
                        },
                        t('action.edit'),
                      ),
                      confirmId === prompt.id
                        ? h(
                            'button',
                            {
                              type: 'button',
                              className: 'dsh-pm-mini dsh-pm-mini-danger',
                              onClick: (event) => {
                                event.stopPropagation();
                                removePrompt(prompt.id);
                              },
                            },
                            t('action.confirmDelete'),
                          )
                        : h(
                            'button',
                            {
                              type: 'button',
                              className: 'dsh-pm-mini dsh-pm-mini-danger',
                              title: t('action.delete'),
                              onClick: (event) => {
                                event.stopPropagation();
                                setConfirmId(prompt.id);
                              },
                            },
                            t('action.delete'),
                          ),
                    ),
                  ),
                ),
              ),
          h(
            'div',
            { key: 'foot', className: 'dsh-pm-foot' },
            h('span', { className: 'dsh-pm-foot-label' }, t('panel.mode')),
            h(
              'span',
              { className: 'dsh-pm-seg' },
              h(
                'button',
                {
                  type: 'button',
                  'data-on': library.insertMode === 'insert' ? 'true' : 'false',
                  title: t('panel.modeHintInsert'),
                  onClick: () => setMode('insert'),
                },
                t('panel.modeInsert'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  'data-on': library.insertMode === 'replace' ? 'true' : 'false',
                  title: t('panel.modeHintReplace'),
                  onClick: () => setMode('replace'),
                },
                t('panel.modeReplace'),
              ),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-pm-mini',
                onClick: () => {
                  if (inputActions !== undefined) inputActions.setDraft('');
                },
              },
              t('panel.clear'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-pm-mini',
                onClick: restoreDefaults,
              },
              t('panel.restore'),
            ),
          ),
        ];
      }

      const panel = h(
        'div',
        {
          key: 'panel',
          ref: panelRef,
          className: 'dsh-pm-panel',
          role: 'dialog',
          'aria-label': t('panel.title'),
          style: position === null ? { left: 8, bottom: 8, width: PANEL_WIDTH, maxHeight: '60vh' } : { left: position.left, bottom: position.bottom, width: PANEL_WIDTH, maxHeight: '60vh' },
        },
        header,
        h('div', { className: 'dsh-pm-body' }, body),
      );

      const sheet = h('style', { id: STYLE_ID, dangerouslySetInnerHTML: { __html: CSS } });
      const content = h(React.Fragment, null, sheet, panel);
      const host = typeof window !== 'undefined' ? window.document.body : null;
      const portaled = ReactDOM !== undefined && typeof ReactDOM.createPortal === 'function' && host !== null ? ReactDOM.createPortal(content, host) : content;
      return h(React.Fragment, null, trigger, portaled);
    }

    /** Inline create/edit form inside the popover. */
    function PromptForm(props) {
      const t = props.t;
      const [title, setTitle] = React.useState(props.value.title);
      const [text, setText] = React.useState(props.value.text);
      const [invalid, setInvalid] = React.useState(false);
      const save = () => {
        if (title.trim() === '' || text.trim() === '') {
          setInvalid(true);
          return;
        }
        props.onSave({ id: props.value.id, title, text });
      };
      return h(
        'div',
        { className: 'dsh-pm-form' },
        h('label', { htmlFor: 'dsh-pm-name' }, t('form.name')),
        h('input', {
          id: 'dsh-pm-name',
          className: 'dsh-pm-input',
          value: title,
          placeholder: t('form.namePlaceholder'),
          onChange: (event) => setTitle(event.target.value),
        }),
        h('label', { htmlFor: 'dsh-pm-text' }, t('form.text')),
        h('textarea', {
          id: 'dsh-pm-text',
          className: 'dsh-pm-textarea',
          value: text,
          placeholder: t('form.textPlaceholder'),
          onChange: (event) => setText(event.target.value),
        }),
        invalid ? h('div', { className: 'dsh-pm-error' }, t('form.invalid')) : null,
        h(
          'div',
          { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
          h('button', { type: 'button', className: 'dsh-pm-btn', onClick: props.onCancel }, t('form.cancel')),
          h('button', { type: 'button', className: 'dsh-pm-btn dsh-pm-btn-primary', onClick: save }, t('form.save')),
        ),
      );
    }

    /** Inline sparkle glyph for the optimize button. */
    function OptimizeIcon() {
      return h(
        'svg',
        {
          className: 'dsh-pm-icon',
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        h('path', { d: 'M12 3.5l1.6 4.4 4.4 1.6-4.4 1.6L12 15.5l-1.6-4.4L6 9.5l4.4-1.6z' }),
        h('path', { d: 'M18.4 15.2l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z' }),
      );
    }

    /** Starting points for the settings form; every field stays editable. */
    const OPTIMIZER_PRESETS = [
      {
        id: 'zhipu-free',
        label: '智谱 glm-4.5-flash（免费 · 国内直连）',
        baseURL: 'https://open.bigmodel.cn/api/paas/v4',
        model: 'glm-4.5-flash',
        keyRef: 'ZHIPU_API_KEY',
      },
      {
        id: 'zhipu-plan',
        label: '智谱 glm-5.3-flash（质量更好 · 走已有套餐）',
        baseURL: 'https://open.bigmodel.cn/api/paas/v4',
        model: 'glm-5.3-flash',
        keyRef: 'ZHIPU_API_KEY',
      },
      {
        id: 'qwen',
        label: '阿里云百炼 qwen-flash（免费额度 · 国内直连）',
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        model: 'qwen-flash',
        keyRef: 'DASHSCOPE_API_KEY',
      },
      {
        id: 'gemini',
        label: 'Google Gemini（免费额度 · 需代理 + 新 key）',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
        model: 'gemini-2.5-flash',
        keyRef: 'GEMINI_API_KEY',
      },
    ];

    /** @param error - thrown value. @returns a displayable message. */
    function errorText(error) {
      if (error instanceof Error && error.message !== '') return error.message;
      return String(error);
    }

    /**
     * Call one of this plugin's host routes.
     * @param path - route path.
     * @param init - optional fetch init.
     * @returns the parsed successful envelope.
     */
    async function optimizerApi(path, init) {
      const response = await fetch(path, {
        ...init,
        headers: { 'content-type': 'application/json', ...(init && init.headers ? init.headers : {}) },
      });
      let body = null;
      try {
        body = await response.json();
      } catch (_error) {
        body = null;
      }
      if (body === null || typeof body !== 'object') {
        const failure = new Error(`HTTP ${response.status}`);
        failure.status = response.status;
        throw failure;
      }
      if (body.ok !== true) {
        throw new Error(typeof body.error === 'string' && body.error !== '' ? body.error : `HTTP ${response.status}`);
      }
      return body;
    }

    /**
     * Composer tool-row control that rewrites the current draft through the
     * Host's provider call and (by default after confirmation) replaces it.
     * @param props - standard Session props plus the `prompt-manager` locale dictionary.
     */
    function PromptOptimizer(props) {
      const inputActions = props.inputActions;
      const useInput = props.useInput;
      const t = typeof props.t === 'function' ? props.t : (key) => key;
      const draft = useInput === undefined ? '' : useInput((value) => (value === undefined ? '' : value.draft));

      /** Add the actionable hint when the Host routes are not loaded yet. */
      const describe = (error) => {
        const text = errorText(error);
        const status = error !== null && typeof error === 'object' ? error.status : undefined;
        if (status === 401 || status === 404) return `${text} · ${t('opt.restartHint')}`;
        return text;
      };

      const [open, setOpen] = React.useState(false);
      const [phase, setPhase] = React.useState('idle');
      const [config, setConfig] = React.useState(null);
      const [original, setOriginal] = React.useState('');
      const [optimized, setOptimized] = React.useState('');
      const [applied, setApplied] = React.useState(false);
      const [message, setMessage] = React.useState('');
      const [notice, setNotice] = React.useState('');
      const [form, setForm] = React.useState(null);
      const [position, setPosition] = React.useState(null);
      const buttonRef = React.useRef(null);
      const panelRef = React.useRef(null);
      const abortRef = React.useRef(null);

      React.useEffect(() => {
        if (!open) return undefined;
        const place = () => {
          const element = buttonRef.current;
          if (element === null) return;
          const rect = element.getBoundingClientRect();
          const left = Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 12));
          const bottom = Math.max(8, window.innerHeight - rect.top + 8);
          setPosition({ left, bottom });
        };
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => {
          window.removeEventListener('resize', place);
          window.removeEventListener('scroll', place, true);
        };
      }, [open]);

      React.useEffect(() => {
        if (!open) return undefined;
        const onPointerDown = (event) => {
          const panel = panelRef.current;
          const button = buttonRef.current;
          if (panel !== null && panel.contains(event.target)) return;
          if (button !== null && button.contains(event.target)) return;
          setOpen(false);
        };
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return;
          setOpen(false);
        };
        window.document.addEventListener('mousedown', onPointerDown, true);
        window.document.addEventListener('keydown', onKeyDown, true);
        return () => {
          window.document.removeEventListener('mousedown', onPointerDown, true);
          window.document.removeEventListener('keydown', onKeyDown, true);
        };
      }, [open]);

      React.useEffect(
        () => () => {
          if (abortRef.current !== null) abortRef.current.abort();
        },
        [],
      );

      /** @returns the sanitized settings, or null when the route failed. */
      const refreshConfig = async () => {
        try {
          const body = await optimizerApi('/api/prompt-manager/config');
          setConfig(body.config);
          return body.config;
        } catch (error) {
          setMessage(describe(error));
          setPhase('error');
          return null;
        }
      };

      const toggle = () => {
        const next = !open;
        setOpen(next);
        setNotice('');
        setMessage('');
        if (next) {
          setPhase('idle');
          setOptimized('');
          setApplied(false);
          void refreshConfig();
        } else if (abortRef.current !== null) {
          abortRef.current.abort();
        }
      };

      const run = async () => {
        const text = draft;
        if (text.trim() === '') {
          setPhase('empty');
          return;
        }
        let settings = config;
        if (settings === null) settings = await refreshConfig();
        const controller = new AbortController();
        abortRef.current = controller;
        setOriginal(text);
        setOptimized('');
        setApplied(false);
        setMessage('');
        setNotice('');
        setPhase('loading');
        try {
          const body = await optimizerApi('/api/prompt-manager/optimize', {
            method: 'POST',
            body: JSON.stringify({ text }),
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          const result = typeof body.text === 'string' ? body.text : '';
          setOptimized(result);
          if (settings !== null && settings.autoReplace === true && inputActions !== undefined) {
            inputActions.setDraft(result);
            setApplied(true);
            setNotice(t('opt.applied'));
          }
          setPhase('result');
        } catch (error) {
          if (controller.signal.aborted) {
            setPhase('idle');
            return;
          }
          setMessage(describe(error));
          setPhase('error');
        } finally {
          if (abortRef.current === controller) abortRef.current = null;
        }
      };

      const applyResult = () => {
        if (inputActions === undefined || optimized === '') return;
        inputActions.setDraft(optimized);
        setApplied(true);
        setNotice(t('opt.applied'));
      };

      const undo = () => {
        if (inputActions !== undefined && original !== '') inputActions.setDraft(original);
        setApplied(false);
        setNotice('');
      };

      const openSettings = () => {
        const current = config === null ? {} : config;
        setForm({
          baseURL: typeof current.baseURL === 'string' ? current.baseURL : '',
          model: typeof current.model === 'string' ? current.model : '',
          keyRef: typeof current.keyRef === 'string' ? current.keyRef : '',
          apiKey: '',
          autoReplace: current.autoReplace === true,
        });
        setMessage('');
        setNotice('');
        setPhase('settings');
      };

      const saveSettings = async () => {
        if (form === null) return;
        try {
          const body = await optimizerApi('/api/prompt-manager/config', {
            method: 'POST',
            body: JSON.stringify({
              baseURL: form.baseURL,
              model: form.model,
              keyRef: form.keyRef,
              apiKey: form.apiKey,
              autoReplace: form.autoReplace,
            }),
          });
          setConfig(body.config);
          setForm({ ...form, apiKey: '' });
          setNotice(t('opt.saved'));
          setMessage('');
        } catch (error) {
          setNotice('');
          setMessage(describe(error));
        }
      };

      const testConnection = async () => {
        setNotice(t('opt.testing'));
        setMessage('');
        try {
          const body = await optimizerApi('/api/prompt-manager/optimize', {
            method: 'POST',
            body: JSON.stringify({ text: '测试连接' }),
          });
          setNotice(t('opt.testOk', { model: String(body.model ?? ''), n: String(body.text ?? '').length }));
        } catch (error) {
          setNotice('');
          setMessage(describe(error));
        }
      };

      const trigger = h(
        'button',
        {
          key: 'optimize-trigger',
          type: 'button',
          ref: buttonRef,
          className: 'dsh-pm-trigger',
          'data-open': open ? 'true' : 'false',
          title: t('opt.triggerTitle'),
          'aria-haspopup': 'dialog',
          'aria-expanded': open ? 'true' : 'false',
          onClick: toggle,
        },
        phase === 'loading' ? h('span', { className: 'dsh-pm-spinner' }) : h(OptimizeIcon, null),
        h('span', null, t('opt.trigger')),
      );

      const sheet = h('style', { key: 'opt-style', id: `${STYLE_ID}-optimizer`, dangerouslySetInnerHTML: { __html: CSS } });
      if (!open) return h(React.Fragment, null, sheet, trigger);

      const keyState =
        config === null || config.hasKey !== true
          ? t('opt.key.none')
          : config.keySource === 'literal'
            ? t('opt.key.literal')
            : t('opt.key.ref', { name: String(config.keySource ?? '') });

      let body;
      if (phase === 'settings' && form !== null) {
        body = h(
          'div',
          { key: 'settings', className: 'dsh-pm-form' },
          h('div', { className: 'dsh-pm-row-line' },
            h('span', null, t('opt.preset')),
            h(
              'select',
              {
                className: 'dsh-pm-input',
                value: '',
                onChange: (event) => {
                  const preset = OPTIMIZER_PRESETS.find((item) => item.id === event.target.value);
                  if (preset === undefined) return;
                  setForm({ ...form, baseURL: preset.baseURL, model: preset.model, keyRef: preset.keyRef });
                },
              },
              h('option', { value: '' }, '—'),
              OPTIMIZER_PRESETS.map((preset) => h('option', { key: preset.id, value: preset.id }, preset.label)),
            ),
          ),
          h('label', { htmlFor: 'dsh-pm-base' }, t('opt.field.baseURL')),
          h('input', {
            id: 'dsh-pm-base',
            className: 'dsh-pm-input',
            value: form.baseURL,
            onChange: (event) => setForm({ ...form, baseURL: event.target.value }),
          }),
          h('label', { htmlFor: 'dsh-pm-model' }, t('opt.field.model')),
          h('input', {
            id: 'dsh-pm-model',
            className: 'dsh-pm-input',
            value: form.model,
            onChange: (event) => setForm({ ...form, model: event.target.value }),
          }),
          h('div', { className: 'dsh-pm-hint' }, t('opt.modelHint')),
          h('label', { htmlFor: 'dsh-pm-keyref' }, t('opt.field.keyRef')),
          h('input', {
            id: 'dsh-pm-keyref',
            className: 'dsh-pm-input',
            value: form.keyRef,
            onChange: (event) => setForm({ ...form, keyRef: event.target.value }),
          }),
          h('div', { className: 'dsh-pm-hint' }, t('opt.field.keyRefHint')),
          h('label', { htmlFor: 'dsh-pm-key' }, t('opt.field.apiKey')),
          h('input', {
            id: 'dsh-pm-key',
            className: 'dsh-pm-input',
            type: 'password',
            value: form.apiKey,
            placeholder: keyState,
            onChange: (event) => setForm({ ...form, apiKey: event.target.value }),
          }),
          h('div', { className: 'dsh-pm-hint' }, t('opt.field.apiKeyHint')),
          h(
            'label',
            { className: 'dsh-pm-row-line', htmlFor: 'dsh-pm-auto' },
            h('input', {
              id: 'dsh-pm-auto',
              type: 'checkbox',
              checked: form.autoReplace === true,
              onChange: (event) => setForm({ ...form, autoReplace: event.target.checked }),
            }),
            h('span', null, t('opt.field.autoReplace')),
          ),
          h('div', { className: 'dsh-pm-hint' }, t('opt.field.autoReplaceHint')),
          message === '' ? null : h('div', { className: 'dsh-pm-error' }, message),
          notice === '' ? null : h('div', { className: 'dsh-pm-hint' }, notice),
          h(
            'div',
            { className: 'dsh-pm-actions' },
            h('button', { type: 'button', className: 'dsh-pm-btn', onClick: testConnection }, t('opt.test')),
            h('button', { type: 'button', className: 'dsh-pm-btn dsh-pm-btn-primary', onClick: saveSettings }, t('opt.save')),
          ),
        );
      } else if (phase === 'loading') {
        body = h(
          'div',
          { key: 'loading', className: 'dsh-pm-status' },
          h('span', { className: 'dsh-pm-spinner' }),
          h('span', null, t('opt.loading')),
        );
      } else if (phase === 'empty') {
        body = h('div', { key: 'empty', className: 'dsh-pm-empty' }, t('opt.empty'));
      } else if (phase === 'error') {
        body = h(
          'div',
          { key: 'error' },
          h('div', { className: 'dsh-pm-section' }, h('div', { className: 'dsh-pm-error' }, message)),
          h(
            'div',
            { className: 'dsh-pm-actions' },
            h('button', { type: 'button', className: 'dsh-pm-btn', onClick: () => { void run(); } }, t('opt.again')),
          ),
        );
      } else if (phase === 'result') {
        body = h(
          'div',
          { key: 'result' },
          h('div', { className: 'dsh-pm-section' }, h('span', { className: 'dsh-pm-label' }, t('opt.original')), h('pre', { className: 'dsh-pm-pre' }, original)),
          h('div', { className: 'dsh-pm-section' }, h('span', { className: 'dsh-pm-label' }, t('opt.optimized')), h('pre', { className: 'dsh-pm-pre dsh-pm-pre-result' }, optimized)),
          h(
            'div',
            { className: 'dsh-pm-actions' },
            notice === '' ? null : h('span', { className: 'dsh-pm-note' }, notice),
            applied
              ? h('button', { type: 'button', className: 'dsh-pm-btn', onClick: undo }, t('opt.undo'))
              : h('button', { type: 'button', className: 'dsh-pm-btn dsh-pm-btn-primary', onClick: applyResult }, t('opt.apply')),
            h('button', { type: 'button', className: 'dsh-pm-btn', onClick: () => { void run(); } }, t('opt.again')),
            h('button', { type: 'button', className: 'dsh-pm-btn', onClick: () => setOpen(false) }, t('opt.close')),
          ),
        );
      } else {
        body = h(
          'div',
          { key: 'idle' },
          h('div', { className: 'dsh-pm-section' }, h('span', { className: 'dsh-pm-label' }, t('opt.original')), h('pre', { className: 'dsh-pm-pre' }, draft === '' ? '—' : draft)),
          h('div', { className: 'dsh-pm-hint', style: { padding: '0 12px' } }, drafthintText(t, config)),
          h(
            'div',
            { className: 'dsh-pm-actions' },
            h('button', { type: 'button', className: 'dsh-pm-btn dsh-pm-btn-primary', onClick: () => { void run(); } }, t('opt.trigger')),
          ),
        );
      }

      const panel = h(
        'div',
        {
          key: 'optimizer-panel',
          ref: panelRef,
          className: 'dsh-pm-panel',
          role: 'dialog',
          'aria-label': t('opt.title'),
          style:
            position === null
              ? { left: 8, bottom: 8, width: PANEL_WIDTH, maxHeight: '60vh' }
              : { left: position.left, bottom: position.bottom, width: PANEL_WIDTH, maxHeight: '60vh' },
        },
        h(
          'div',
          { className: 'dsh-pm-head' },
          h('span', { className: 'dsh-pm-title' }, phase === 'settings' ? t('opt.settings') : t('opt.title')),
          h('span', { className: 'dsh-pm-count' }, keyState),
          h(
            'span',
            { className: 'dsh-pm-head-actions' },
            phase === 'settings'
              ? h('button', { type: 'button', className: 'dsh-pm-btn', onClick: () => { setPhase('idle'); setNotice(''); setMessage(''); } }, t('opt.back'))
              : h('button', { type: 'button', className: 'dsh-pm-btn', onClick: openSettings }, t('opt.settings')),
          ),
        ),
        h('div', { className: 'dsh-pm-body' }, body),
      );

      const content = h(React.Fragment, null, sheet, panel);
      const host = typeof window !== 'undefined' ? window.document.body : null;
      const portaled = ReactDOM !== undefined && typeof ReactDOM.createPortal === 'function' && host !== null ? ReactDOM.createPortal(content, host) : content;
      return h(React.Fragment, null, trigger, portaled);
    }

    /** @returns the one-line state hint under the idle preview. */
    function drafthintText(t, config) {
      if (config !== null && config.hasKey !== true) return t('opt.key.none');
      return t('opt.triggerTitle');
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'prompt-manager: dictionaries');
        ctx.slots.inject('conversation.input.left', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.left',
              id: 'prompt-manager',
              order: 40,
              locale: NS,
            },
            PromptManager,
          ),
        );
        ctx.slots.inject('conversation.input.left', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.left',
              id: 'prompt-optimizer',
              order: 41,
              locale: NS,
            },
            PromptOptimizer,
          ),
        );
      },
    };
  },
});
