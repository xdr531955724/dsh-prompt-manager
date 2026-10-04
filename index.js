/**
 * Host half of @local/dsh-prompt-manager.
 *
 * Owns the two things the browser must not own: the outbound LLM call and the
 * API credential. It registers three loopback JSON routes on the harness
 * Web server (`ctx.webServer`), which the Client half reaches with a plain
 * relative `fetch('/api/prompt-manager/…')` — the same route shape the pet and
 * sidebar plugins use, and the reason no CORS story is needed.
 *
 *   GET  /api/prompt-manager/config    → sanitized settings (never the key)
 *   POST /api/prompt-manager/config    → save settings
 *   POST /api/prompt-manager/optimize  → rewrite one prompt through the provider
 *
 * Settings live in `$DSH_HOME/prompt-manager.json`. The key is either a
 * literal in that file, or a credential *name* resolved from the environment
 * or `$DSH_HOME/.credentials.yaml` — so reusing an already-configured
 * credential (e.g. `ZHIPU_API_KEY`) needs no copy of the secret.
 *
 * This file imports `node:` builtins only: the plugin is linked into the
 * profile from outside it, so bare DSH package specifiers would not resolve.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** The Web server is the carrier for every route below. */
export const inject = ['webServer'];

/** Route prefix owned by this plugin. */
const API_PREFIX = '/api/prompt-manager';
/** Settings file name under the harness home. */
const CONFIG_FILE = 'prompt-manager.json';
/** Largest accepted request body (a prompt is small; anything else is abuse). */
const MAX_BODY_BYTES = 128 * 1024;
/** Per-request ceiling for the provider call. */
const REQUEST_TIMEOUT_MS = 90_000;

/**
 * Defaults target a free, China-reachable provider (智谱 GLM Flash) so the
 * feature works from a DSH that already holds a `ZHIPU_API_KEY`. Every field
 * is editable in the panel; nothing here is a hard requirement.
 */
const DEFAULTS = {
  baseURL: 'https://open.bigmodel.cn/api/paas/v4',
  model: 'glm-4.5-flash',
  keyRef: 'ZHIPU_API_KEY',
  apiKey: '',
  autoReplace: false,
  temperature: 0.3,
};

/** The meta-prompt: the whole quality of this feature lives here. */
const SYSTEM_PROMPT = [
  '你是提示词改写器。用户给你一段他准备发给 AI 编程助手（DeepSeek Harness）的话。',
  '你的唯一任务是把它改写成更清晰、更可执行、不丢信息的版本——作为「用户对助手说的话」，可以直接发送。',
  '',
  '铁律：',
  '1. 只输出改写后的文本本身：不要解释、不要前言、不要 Markdown 代码围栏、不要“优化后：”之类的标签、不要复述原文。',
  '2. 保持原意、语言和语气：原文是中文就输出中文，是英文就输出英文，中英混排照旧。',
  '3. 说话人始终是用户，收件人始终是助手。绝不要写成助手对用户说的话，也绝不要在文本里向用户索要信息或列“请提供以下信息”；确实缺必要信息时，写成指示助手的句子，例如「如果缺少报错全文，先向我要」。',
  '4. 不要发明用户没有提供的事实、文件路径、命令、数字、版本或需求。信息缺失处用简短占位（例如 <报错全文>）或保持原本的开放描述，绝不编造。',
  '5. 原样保留代码片段、命令、路径、报错文本、标识符、URL、@ 引用，不要翻译、不要改写。',
  '6. 只在有助于表达时才补结构（目标、产出物与验收标准、关键约束／明确不要做什么、需先确认的疑点）；不要为了好看而套模板、加标题。',
  '7. 长度以“够用”为限：原文短就写短，删掉口头语、重复、情绪化表达和无效寒暄。',
  '8. 不要替用户执行任务，也不要回答任务本身的问题。',
].join('\n');

/** Resolve the harness home exactly as the rest of the harness does. */
function homeDir() {
  const configured = process.env.DSH_HOME;
  if (typeof configured === 'string' && configured.trim() !== '') return configured.trim();
  return join(homedir(), '.dsh');
}

/** @returns the absolute settings-file path. */
function configPath() {
  return join(homeDir(), CONFIG_FILE);
}

/** @returns the stored settings merged over the defaults. */
async function loadConfig() {
  try {
    const raw = await readFile(configPath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return { ...DEFAULTS };
    return { ...DEFAULTS, ...parsed };
  } catch (_error) {
    return { ...DEFAULTS };
  }
}

/** @param config - complete settings document to persist. */
async function saveConfig(config) {
  const path = configPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

/**
 * Read one credential name from the process environment, falling back to the
 * harness credential store. The store is a small YAML document whose `refs:`
 * map holds one `NAME: value` line per credential; a targeted line match is
 * enough here and keeps this plugin free of a YAML dependency.
 * @param name - credential name, e.g. `ZHIPU_API_KEY`.
 * @returns the secret, or an empty string when it is not configured.
 */
async function credentialValue(name) {
  const fromEnv = process.env[name];
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv.trim();
  try {
    const raw = await readFile(join(homeDir(), '.credentials.yaml'), 'utf8');
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`^\\s*${escaped}\\s*:\\s*(.+?)\\s*$`, 'm').exec(raw);
    if (match === null) return '';
    return match[1].replace(/^["']|["']$/g, '').trim();
  } catch (_error) {
    return '';
  }
}

/**
 * Resolve the effective API key: an explicit literal wins, then the named
 * credential, then the two credential names this plugin knows are commonly
 * already present in this harness home.
 * @param config - stored settings.
 * @returns the key and where it came from.
 */
async function resolveKey(config) {
  const literal = typeof config.apiKey === 'string' ? config.apiKey.trim() : '';
  if (literal !== '') return { key: literal, source: 'literal' };
  const ref = typeof config.keyRef === 'string' ? config.keyRef.trim() : '';
  if (ref !== '') {
    const value = await credentialValue(ref);
    if (value !== '') return { key: value, source: ref };
    return { key: '', source: '', missing: ref };
  }
  return { key: '', source: '' };
}

/** Settings shape handed to the browser: the secret never crosses this line. */
function publicConfig(config, key) {
  return {
    baseURL: config.baseURL,
    model: config.model,
    keyRef: config.keyRef,
    autoReplace: config.autoReplace === true,
    temperature: config.temperature,
    hasKey: key.key !== '',
    keySource: key.source,
    keyMissing: key.missing ?? '',
  };
}

/** An expected failure carrying the HTTP status the route should answer. */
class RouteError extends Error {
  /** @param status - HTTP status. @param message - user-facing reason. */
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** @param res - server response. @param status - HTTP status. @param body - JSON body. */
function writeJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

/** @param req - incoming request. @returns the parsed JSON body object. */
async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new RouteError(413, '请求体过大');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.trim() === '') return {};
  try {
    const parsed = JSON.parse(text);
    return parsed !== null && typeof parsed === 'object' ? parsed : {};
  } catch (_error) {
    throw new RouteError(400, '请求体不是合法 JSON');
  }
}

/** @param req - incoming request. @returns whether it arrived over loopback. */
function isLoopback(req) {
  const address = req.socket?.remoteAddress ?? '';
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

/** Strip a fence that wraps the whole answer, and trim surrounding whitespace. */
function cleanOutput(text) {
  let value = text.trim();
  const fenced = /^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n?```$/.exec(value);
  if (fenced !== null) value = fenced[1].trim();
  return value;
}

/** Shorten a provider message so it fits one panel line pair. */
function brief(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 400 ? `${text.slice(0, 400)}…` : text;
}

/**
 * Rewrite one prompt through the configured OpenAI-compatible provider.
 * @param text - the prompt currently in the composer.
 * @returns the optimized prompt plus usage metadata.
 */
async function optimize(text) {
  const config = await loadConfig();
  const key = await resolveKey(config);
  if (key.key === '') {
    throw new RouteError(
      400,
      key.missing === undefined
        ? '还没有可用的 API Key：点「设置」填入，或填一个凭据名（如 ZHIPU_API_KEY）。'
        : `找不到凭据 ${key.missing}：请在「设置」里填入 API Key，或换一个已配置的凭据名。`,
    );
  }
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (trimmed === '') throw new RouteError(400, '输入框是空的，先写点内容再优化。');
  const url = `${String(config.baseURL).replace(/\/+$/, '')}/chat/completions`;
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key.key}` },
      body: JSON.stringify({
        model: config.model,
        temperature: config.temperature,
        stream: false,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: trimmed },
        ],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new RouteError(502, `请求 ${url} 失败：${brief(error instanceof Error ? error.message : String(error))}`);
  }
  const raw = await response.text();
  let body = null;
  try {
    body = JSON.parse(raw);
  } catch (_error) {
    body = null;
  }
  if (!response.ok) {
    const detail = body?.error?.message ?? body?.message ?? raw;
    throw new RouteError(502, `服务商返回 ${response.status}：${brief(detail)}`);
  }
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim() === '') {
    throw new RouteError(502, `服务商没有返回内容：${brief(raw)}`);
  }
  return {
    text: cleanOutput(content),
    model: config.model,
    usage: body?.usage ?? null,
  };
}

/**
 * Register the three routes. Each registration is owned by this plugin's
 * effect scope, so disabling or unloading the plugin removes them.
 * @param ctx - host plugin context (carries `webServer`).
 */
export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: `${API_PREFIX}/config`,
        handler: (req, res) => {
          if (req.method !== 'GET' && req.method !== 'POST') {
            return writeJson(res, 405, { ok: false, error: 'method-not-allowed' });
          }
          if (!isLoopback(req)) return writeJson(res, 403, { ok: false, error: 'forbidden: loopback-only' });
          const work =
            req.method === 'GET'
              ? loadConfig().then(async (config) => ({ config, key: await resolveKey(config) }))
              : readJsonBody(req).then(async (body) => {
                  const current = await loadConfig();
                  const next = { ...current };
                  if (typeof body.baseURL === 'string' && body.baseURL.trim() !== '') next.baseURL = body.baseURL.trim();
                  if (typeof body.model === 'string' && body.model.trim() !== '') next.model = body.model.trim();
                  if (typeof body.keyRef === 'string') next.keyRef = body.keyRef.trim();
                  if (typeof body.apiKey === 'string' && body.apiKey.trim() !== '') next.apiKey = body.apiKey.trim();
                  if (body.clearApiKey === true) next.apiKey = '';
                  if (typeof body.autoReplace === 'boolean') next.autoReplace = body.autoReplace;
                  if (typeof body.temperature === 'number' && Number.isFinite(body.temperature)) {
                    next.temperature = Math.min(2, Math.max(0, body.temperature));
                  }
                  await saveConfig(next);
                  return { config: next, key: await resolveKey(next) };
                });
          return work
            .then(({ config, key }) => writeJson(res, 200, { ok: true, config: publicConfig(config, key) }))
            .catch((error) => {
              const status = error instanceof RouteError ? error.status : 500;
              writeJson(res, status, { ok: false, error: brief(error instanceof Error ? error.message : String(error)) });
            });
        },
      }),
    'prompt-manager: config route',
  );

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: `${API_PREFIX}/optimize`,
        handler: (req, res) => {
          if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'method-not-allowed' });
          if (!isLoopback(req)) return writeJson(res, 403, { ok: false, error: 'forbidden: loopback-only' });
          return readJsonBody(req)
            .then((body) => optimize(body.text))
            .then((result) => writeJson(res, 200, { ok: true, ...result }))
            .catch((error) => {
              const status = error instanceof RouteError ? error.status : 500;
              writeJson(res, status, { ok: false, error: brief(error instanceof Error ? error.message : String(error)) });
            });
        },
      }),
    'prompt-manager: POST optimize',
  );
}
