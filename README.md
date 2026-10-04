# dsh-prompt-manager

给 **DeepSeek Harness（DSH）** 输入框加两件事：**提示词库**（一键把收藏的提示词写进输入框）和**提示词优化**（用大模型把输入框里正在写的东西改写得更清晰可执行，满意就一键替换）。

一个 bundle，Host 半边 + Client 半边，纯 JavaScript、无构建步骤、无依赖（Host 只用 `node:` 内置模块）。

## 功能

### 提示词库（工具栏「提示词」按钮）

- **一键写入**：点列表条目 → 通过 composer 的 `inputActions` 写入草稿区（不碰编辑器 DOM）。
- **两种写入方式**（面板底部切换，跟随保存）：`插入`（光标处写入，输入框为空即整段写入）/ `替换`（覆盖输入框全部内容）。
- **管理**：新建 / 编辑 / 删除（二次确认）/「恢复默认」/「清空输入框」。
- **搜索**：按名称与内容过滤。
- **持久化**：本机 `localStorage`（键 `dsh.prompt-manager.v1`）。首次安装预置 4 条。

### 提示词优化（工具栏「优化」按钮）

- 取当前输入框内容 → 交给配置好的大模型改写 → 面板里给出**原文 / 优化后**对照。
- 默认**先预览**，点「替换输入框」才写入；也可在设置里打开「优化后直接替换输入框」，成功即替换（面板里仍可「撤销替换」回去）。
- 「再优化一次」「测试连接」；接口地址 / 模型 / Key / 自动替换都在面板的「设置」里改，不用改配置文件。
- 改写用一条固定的中文元提示词（见 [index.js](index.js) 的 `SYSTEM_PROMPT`），规则：只改写不回答任务、不编造事实、原样保留代码/路径/命令/报错、缺信息写成「先向我要」而不是向用户索要、长度以够用为限（原文短就不膨胀）。

## 架构

**Host 半边负责出网调用与凭据，Client 半边只做 UI** —— 浏览器侧因此不需要 CORS，API Key 也不进浏览器：

| 路由（仅本机回环可访问） | 作用 |
|---|---|
| `GET  /api/prompt-manager/config` | 读设置；**永不返回 Key**，只返回是否可用及来源 |
| `POST /api/prompt-manager/config` | 存设置（接口地址 / 模型 / 凭据名 / Key / 自动替换 / 温度） |
| `POST /api/prompt-manager/optimize` | 用配置的服务商改写一段文本 |

- 设置文件：`$DSH_HOME/prompt-manager.json`（默认 `~/.dsh/prompt-manager.json`），每次请求重新读取，改配置不用重启。
- **Key 解析顺序**：设置里的字面 Key → 环境变量 `keyRef` → `~/.dsh/.credentials.yaml` 里同名的凭据。所以复用 DSH 里已经配好的凭据（例如 `ZHIPU_API_KEY`）不必再复制一份密钥。
- Client 半边注册进 `conversation.input.left`（输入框左下工具栏），两个条目：`prompt-manager`（提示词库）与 `prompt-optimizer`（优化）。

## 安装

前提：DSH 0.2.0-rc.x（`ctx.slots`、composer 的 `inputActions`、`ctx.webServer`）。

```text
git clone <本仓库> dsh-prompt-manager
```

然后在 DSH 里用内置插件管理器安装（把 `target` 换成本机 clone 的**绝对路径**）：

```text
plugin_manager  install_bundle  target = /abs/path/to/dsh-prompt-manager
plugin_manager  remove_bundle   target = @local/dsh-prompt-manager
```

- profile 会以链接方式挂载本目录，**改源码即改插件本体**。
- **Client 半边（`client.js`）热更新**；**Host 半边（`index.js`）需要重启一次 DSH**（宿主模块只在新进程启动时加载）。重启前点「优化」会看到「插件的宿主半边要重启一次 DSH 才会生效」的提示。
- 手工挂载同样可以：把 `cordis.patch.yml` 里的那一行合并进 profile 的 `cordis.patch.yml`。

## 配置服务商

任何 **OpenAI 兼容**的 `/chat/completions` 端点都能用。面板「设置」里有几个预设：

| 预设 | 接口 | 凭据名 |
|---|---|---|
| 智谱 `glm-4.5-flash` | `https://open.bigmodel.cn/api/paas/v4` | `ZHIPU_API_KEY` |
| 智谱 `glm-5.3-flash` | 同上 | 同上 |
| 阿里云百炼 `qwen-flash` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `DASHSCOPE_API_KEY` |
| Google `gemini-2.5-flash` | `https://generativelanguage.googleapis.com/v1beta/openai` | `GEMINI_API_KEY` |

模型 id 以服务商控制台为准，可直接在设置里改。

**实测对照**（Windows 桌面版 DSH 0.2.0-rc.2，同一句原文「我那个脚本跑不起来，报错 ModuleNotFoundError，帮我看看怎么回事」）：

- 智谱 `glm-4.5-flash`（免费）：约 8 s → `我的脚本运行时出现 ModuleNotFoundError 错误，请帮我分析原因并提供解决方案。`
- 智谱 `glm-5.3-flash`：约 10 s → `我的脚本运行失败，报错 ModuleNotFoundError。请帮我定位原因并修复。脚本代码和报错全文我还没有提供，需要的话先向我要 <脚本代码> 和 <报错全文>，再开始排查。`

需要走代理的服务商（Google / OpenRouter / Groq 等）：给 DSH 进程设 `HTTPS_PROXY` 与 `NODE_USE_ENV_PROXY=1` 再启动。

## 开发

```bash
node --check client.js && node --check index.js

# 不碰运行中的 DSH，用假 ctx + 真 HTTP 服务器跑通三条路由（含真实模型调用）
node dev/host-harness.mjs '帮我看看这个报错，顺便优化一下'
PM_MODEL=glm-5.3-flash node dev/host-harness.mjs '换模型对比'

# 列某个 OpenAI 兼容中转/服务商能用的模型 id
node dev/list-relay-models.mjs <凭据名> https://your-endpoint/v1
```

`dev/host-harness.mjs` 会读写 `$DSH_HOME/prompt-manager.json`；想隔离测试就把 `DSH_HOME` 指到一个临时目录。

## 结构

| 文件 | 作用 |
|---|---|
| `package.json` | bundle 清单：`dsh.bundle.patch` + `dsh.client`（`platform: web`, `immediately`）、`icon`、`exports["./client"]` |
| `cordis.patch.yml` | 唯一一条 Host 行（`id: prompt-manager`） |
| `index.js` | Host 半边：三条回环 JSON 路由 + 元提示词（只用 `node:` 内置模块，因为插件是链接进 profile 的，裸包名解析不到） |
| `client.js` | Client 半边：两个工具栏条目与各自的面板 |
| `dev/` | 自测脚本（不随 profile 加载） |
| `locale/{zh,en}.json` | 插件卡片标题与描述 |
| `icon.svg` | 插件图标 |

## 已知边界

- 词库、「自动替换」等设置是**浏览器本机**数据；换机器、清浏览器数据会丢。
- 优化是**改写，不是执行**：不会替你跑任务，也不回答任务本身。
- 输入框里若是 `@文件` 引用芯片，优化后按剪贴板文本（`@path`）写成纯文本，芯片结构不再保留。
- 只有浏览器侧 UI 与三条本机路由，没有面向模型的工具（tool）。
- 包名 `@local/...` 是按 DSH 本地 bundle 的惯例取的（工作区目录安装）。要发 npm 需要换个 scope 并重新安装。

## License

MIT，见 [LICENSE](LICENSE)。

---

## English (brief)

A DSH (DeepSeek Harness) bundle that adds two controls to the composer tool row:

1. **Prompt library** (`提示词`): a click-to-insert list of saved prompts, with create/edit/delete/search, persisted in the page's `localStorage`.
2. **Prompt optimizer** (`优化`): rewrites whatever is in the composer through any OpenAI-compatible `/chat/completions` endpoint and, after your confirmation (or automatically), replaces the draft. Host-side routes keep the API key out of the browser; the key is read from the plugin config, an environment variable, or `~/.dsh/.credentials.yaml`.

Install with the built-in plugin manager (`install_bundle` pointing at the cloned directory). The client half hot-reloads; the host half loads on the next DSH start. MIT licensed.
