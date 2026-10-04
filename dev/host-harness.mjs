/**
 * Standalone exercise of the plugin's host half.
 *
 * The running harness keeps its own module cache, so host code changes only
 * reach it on restart. This harness mounts the very same `apply()` against a
 * minimal fake cordis context and a real loopback HTTP server, then drives the
 * three routes — including a real provider call — so the host logic can be
 * verified without touching the running DSH process.
 *
 *   node dev/host-harness.mjs                 # GET config + one optimize call
 *   node dev/host-harness.mjs "要优化的文本"
 */
import { createServer } from 'node:http';
import { apply } from '../index.js';

const routes = [];
const ctx = {
  effect: (fn) => {
    const disposer = fn();
    return typeof disposer === 'function' ? disposer : () => {};
  },
  webServer: {
    register: (route) => {
      routes.push(route);
      return () => {
        const index = routes.indexOf(route);
        if (index >= 0) routes.splice(index, 1);
      };
    },
  },
};

apply(ctx, {});
console.log(`registered routes: ${routes.map((route) => `${route.kind} ${route.path}`).join(', ')}`);

const server = createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://127.0.0.1');
  const route = routes.find((entry) => entry.path === pathname);
  if (route === undefined) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'no-such-route' }));
    return;
  }
  Promise.resolve(route.handler(req, res)).catch((error) => {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: String(error) }));
  });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const config = await (await fetch(`${base}/api/prompt-manager/config`)).json();
console.log('GET /config ->', JSON.stringify(config));

// Optional provider override so several models can be compared in one run.
const override = {
  baseURL: process.env.PM_BASE_URL,
  model: process.env.PM_MODEL,
  keyRef: process.env.PM_KEY_REF,
};
if (override.baseURL !== undefined || override.model !== undefined || override.keyRef !== undefined) {
  const saved = await (
    await fetch(`${base}/api/prompt-manager/config`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(override),
    })
  ).json();
  console.log('override response ->', JSON.stringify(saved));
  console.log('override applied ->', JSON.stringify(saved.config));
}

const text = process.argv[2] ?? '帮我看看这个报错，顺便优化一下';
const started = Date.now();
const response = await fetch(`${base}/api/prompt-manager/optimize`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ text }),
});
const body = await response.json();
console.log(`POST /optimize -> HTTP ${response.status} in ${Date.now() - started} ms`);
if (body.ok === true) {
  console.log(`model=${body.model} usage=${JSON.stringify(body.usage)}`);
  console.log('--- optimized ---');
  console.log(body.text);
} else {
  console.log('error:', body.error);
}

server.close();
