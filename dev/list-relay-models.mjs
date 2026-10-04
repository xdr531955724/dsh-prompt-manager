/**
 * Print the model ids one OpenAI-compatible endpoint exposes, so the panel can
 * be pointed at a model that actually exists on that provider.
 *
 *   node dev/list-relay-models.mjs ZHIPU_API_KEY https://open.bigmodel.cn/api/paas/v4
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const [ref, baseURL] = process.argv.slice(2);
if (ref === undefined || baseURL === undefined) {
  console.error('usage: node dev/list-relay-models.mjs <credential-name> <base-url>');
  process.exit(1);
}
const home = process.env.DSH_HOME?.trim() !== undefined && process.env.DSH_HOME.trim() !== '' ? process.env.DSH_HOME.trim() : join(homedir(), '.dsh');
const raw = await readFile(join(home, '.credentials.yaml'), 'utf8');
const match = new RegExp(`^\\s*${ref}\\s*:\\s*(.+?)\\s*$`, 'm').exec(raw);
if (match === null) {
  console.error(`credential ${ref} not found`);
  process.exit(1);
}
const key = match[1].replace(/^["']|["']$/g, '').trim();

try {
  const response = await fetch(`${baseURL.replace(/\/+$/, '')}/models`, { headers: { authorization: `Bearer ${key}` } });
  const body = await response.json();
  const ids = Array.isArray(body?.data) ? body.data.map((item) => item.id) : [];
  console.log(`HTTP ${response.status}, ${ids.length} models`);
  const interesting = ids.filter((id) => /flash|mini|gemini|gpt-|glm|qwen|free|claude|deepseek/i.test(id));
  console.log((interesting.length > 0 ? interesting : ids).sort().join('\n'));
} catch (error) {
  console.error('list failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
