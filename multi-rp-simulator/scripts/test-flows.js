#!/usr/bin/env node

// Exercise the real routes without reading .env or contacting an external OP.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { mkdtemp, rm } = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const clients = [1, 2, 3, 4, 5, 6, 7, 8];
const childProcesses = new Set();

function attributes(source) {
  return Object.fromEntries(Array.from(source.matchAll(/([\w-]+)="([^"]*)"/g), ([, name, value]) => [
    name, value.replace(/&amp;/g, '&').replace(/&#34;/g, '"').replace(/&#39;/g, "'")
  ]));
}

function elements(html, tag) {
  return Array.from(html.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, 'g')), ([, source]) => attributes(source));
}

function links(html) {
  return elements(html, 'a');
}

function hasLink(html, href) {
  assert.ok(links(html).some((link) => link.href === href), `Missing link: ${href}`);
}

function actionLink(html, id) {
  const link = links(html).find((item) => item.id === id);
  assert.ok(link, `Missing authentication action: ${id}`);
  return link.href;
}

function disabledButtonCount(html) {
  return Array.from(html.matchAll(/<button\b[^>]*\bdisabled(?:\s|=|>)/g)).length;
}

async function request(baseUrl, route) {
  return fetch(new URL(route, baseUrl), { redirect: 'manual', signal: AbortSignal.timeout(10000) });
}

async function page(baseUrl, route) {
  const response = await request(baseUrl, route);
  const html = await response.text();
  assert.equal(response.status, 200, `${route}: ${html.slice(0, 500)}`);
  return html;
}

async function stopChild(child) {
  childProcesses.delete(child);
  if (child.exitCode !== null || child.signalCode !== null) return;
  const stopped = once(child, 'exit');
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
  try {
    await stopped;
  } finally {
    clearTimeout(timer);
  }
}

async function startSimulator(mockUrl, configuredClients = clients, overrides = {}) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'rp-flow-tests-'));
  // Deliberately do not inherit application settings, secrets, NODE_OPTIONS or dotenv overrides.
  const env = {
    PATH: process.env.PATH,
    TMPDIR: os.tmpdir(),
    PORT: '0',
    SESSION_SECRET: 'flow-regression-test-session-secret',
    TS_NODE_PROJECT: path.join(projectRoot, 'tsconfig.json'),
    ...overrides
  };
  for (const index of configuredClients) {
    const prefix = `CLIENT${index}`;
    env[`${prefix}_URL`] = `${mockUrl}/client${index}/oauth2`;
    env[`${prefix}_CLIENT_ID`] = `registered-client${index}`;
    env[`${prefix}_CLIENT_SECRET`] = `synthetic-secret-${index}`;
    env[`${prefix}_REDIRECT_URIS`] = `http://127.0.0.1/auth/callback/client${index}`;
    env[`${prefix}_SKIP`] = 'false';
  }

  // The app normally listens on all interfaces. Constrain only this test process,
  // use an OS-assigned port, and report it via IPC without modifying the server.
  const bootstrap = `
    const net = require('node:net');
    const listen = net.Server.prototype.listen;
    net.Server.prototype.listen = function (port, ...args) {
      this.once('listening', () => process.send({ port: this.address().port }));
      return listen.call(this, { port: Number(port), host: '127.0.0.1' }, ...args);
    };
    require(${JSON.stringify(require.resolve('ts-node/register'))});
    require(${JSON.stringify(path.join(projectRoot, 'src/rp-server.ts'))});
  `;
  const child = spawn(process.execPath, ['-e', bootstrap], {
    cwd, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });
  childProcesses.add(child);
  let output = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => { output = (output + chunk).slice(-12000); });
  }
  const close = async () => {
    await stopChild(child);
    await rm(cwd, { recursive: true, force: true });
  };
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Server startup timed out.\n${output}`)), 20000);
      const finish = (error, value) => {
        clearTimeout(timer);
        child.off('message', onMessage);
        child.off('exit', onExit);
        child.off('error', onError);
        error ? reject(error) : resolve(value);
      };
      const onMessage = (message) => finish(null, message.port);
      const onExit = (code) => finish(new Error(`Server exited (${code}).\n${output}`));
      const onError = (error) => finish(error);
      child.once('message', onMessage);
      child.once('exit', onExit);
      child.once('error', onError);
    });
    return { baseUrl: `http://127.0.0.1:${port}`, close, output: () => output };
  } catch (error) {
    await close();
    throw error;
  }
}

async function checkAuthorization(baseUrl, route, client, lang, registration = false) {
  const response = await request(baseUrl, route);
  assert.equal(response.status, 302, `${route}: expected authorization redirect, got ${await response.text()}`);
  const authorization = new URL(response.headers.get('location'));
  assert.equal(authorization.hostname, '127.0.0.1');
  assert.equal(authorization.pathname, `/client${client}/authorize`);
  assert.equal(authorization.searchParams.get('client_id'), `registered-client${client}`);
  assert.equal(authorization.searchParams.get('redirect_uri'), `http://127.0.0.1/auth/callback/client${client}`);
  assert.equal(authorization.searchParams.get('lang'), lang);
  assert.equal(authorization.searchParams.get('ui_locales'), `${lang}-CA`);
  assert.equal(authorization.searchParams.get('skipmigration'), registration ? 'true' : null);
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(authorization.searchParams.get('state'));
}

async function checkFlow(baseUrl, { family, variant, client }, lang) {
  const prefix = family === 'gccf' ? 'gccf-' : '';
  const entryRoute = `/rpsim/${prefix}flow-${variant}/${lang}`;
  const signinRoute = `/rpsim/${prefix}signinpage/${lang}?flow=${variant}`;
  const otherLang = lang === 'en' ? 'fr' : 'en';
  const entry = await page(baseUrl, entryRoute);
  hasLink(entry, `/rpsim/${family}/${lang}`);
  hasLink(entry, `/rpsim/${prefix}flow-${variant}/${otherLang}`);
  hasLink(entry, signinRoute);
  const registrationLink = actionLink(entry, 'RegisterInApp');
  assert.equal(registrationLink, `/auth/client${client}/${lang}?flow=${variant}&skipmigration=true`);
  await checkAuthorization(baseUrl, registrationLink, client, lang, true);

  const signin = await page(baseUrl, signinRoute);
  hasLink(signin, `/rpsim/${family}/${lang}`);
  hasLink(signin, `/rpsim/${prefix}signinpage/${otherLang}?flow=${variant}`);
  const options = elements(signin, 'input').filter((input) => input.name === 'signin').map((input) => input.value);
  assert.deepEqual(options, variant === 'all' ? ['gc-signin', 'gckey', 'interac'] : ['gc-signin', 'gckey']);
  const authLinks = links(signin).filter((link) => link.href.startsWith('/auth/'));
  assert.equal(authLinks.length, variant === 'all' ? 3 : 2);
  for (const link of authLinks) {
    assert.equal(link.href, `/auth/client${client}/${lang}?flow=${variant}`);
    await checkAuthorization(baseUrl, link.href, client, lang);
  }
  assert.equal(signin.includes('id="panel-interac"'), variant === 'all');
}

async function withSimulator(mockUrl, configuredClients, overrides, check) {
  const simulator = await startSimulator(mockUrl, configuredClients, overrides);
  try {
    await check(simulator.baseUrl);
  } catch (error) {
    error.message += `\nSimulator output:\n${simulator.output()}`;
    throw error;
  } finally {
    await simulator.close();
  }
}

async function main() {
  const unexpectedRequests = [];
  const mock = http.createServer((req, res) => {
    const match = req.url.match(/^\/(client[1-8])\/oauth2\/\.well-known\/openid-configuration$/);
    if (!match) {
      unexpectedRequests.push(req.url);
      res.writeHead(404).end();
      return;
    }
    const issuer = `http://127.0.0.1:${mock.address().port}/${match[1]}`;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      jwks_uri: `${issuer}/jwks`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: ['client_secret_post'],
      code_challenge_methods_supported: ['S256']
    }));
  });
  mock.listen(0, '127.0.0.1');
  await once(mock, 'listening');
  const mockUrl = `http://127.0.0.1:${mock.address().port}`;

  try {
    await withSimulator(mockUrl, clients, {}, async (baseUrl) => {
      const root = await request(baseUrl, '/');
      assert.equal(root.status, 302);
      assert.equal(root.headers.get('location'), '/rpsim/testflows/en');
      for (const lang of ['en', 'fr']) {
        const hub = await page(baseUrl, `/rpsim/testflows/${lang}`);
        hasLink(hub, `/rpsim/sic/${lang}`);
        hasLink(hub, `/rpsim/gccf/${lang}`);
        hasLink(hub, `/rpsim/login/${lang}`);
        for (const future of ['gckey', 'interac']) {
          const section = hub.match(new RegExp(`<section\\b[^>]*aria-labelledby="testing-${future}-heading"[^>]*>([\\s\\S]*?)<\\/section>`));
          assert.ok(section, `Missing future ${future} section`);
          assert.equal(links(section[1]).length, 0, `Future ${future} must not offer a launch link`);
        }
        const manual = await page(baseUrl, `/rpsim/login/${lang}`);
        for (const client of clients) hasLink(manual, `/auth/client${client}/${lang}`);

        for (const family of ['sic', 'gccf']) {
          const prefix = family === 'gccf' ? 'gccf-' : '';
          const selector = await page(baseUrl, `/rpsim/${family}/${lang}`);
          hasLink(selector, `/rpsim/${prefix}flow-all/${lang}`);
          hasLink(selector, `/rpsim/${prefix}flow-no-interac/${lang}`);
          hasLink(selector, `/rpsim/testflows/${lang}`);
          if (family === 'gccf') {
            hasLink(selector, `/auth/client6/${lang}`);
            await checkAuthorization(baseUrl, `/auth/client6/${lang}`, 6, lang);
          }
          for (const variant of ['all', 'no-interac']) {
            const client = (family === 'gccf' ? 7 : 1) + (variant === 'no-interac' ? 1 : 0);
            await checkFlow(baseUrl, { family, variant, client }, lang);
          }
        }
      }
      console.log('PASS: bilingual hub, selectors, migration options, registration, locale links and OIDC redirects');
    });

    await withSimulator(mockUrl, [1, 2, 6], {}, async (baseUrl) => {
      for (const lang of ['en', 'fr']) {
        const selector = await page(baseUrl, `/rpsim/gccf/${lang}`);
        assert.ok(!links(selector).some((link) => link.href.startsWith('/rpsim/gccf-flow-')));
        assert.equal(disabledButtonCount(selector), 2);
        hasLink(selector, `/auth/client6/${lang}`);
        for (const variant of ['all', 'no-interac']) {
          for (const route of [`/rpsim/gccf-flow-${variant}/${lang}`, `/rpsim/gccf-signinpage/${lang}?flow=${variant}`]) {
            const html = await page(baseUrl, route);
            assert.equal(links(html).filter((link) => link.href.startsWith('/auth/')).length, 0, `${route}: missing GCCF must not fall back to SIC/direct GCCF`);
            assert.ok(disabledButtonCount(html) >= 2, `${route}: missing clients must disable actions`);
          }
        }
        await checkFlow(baseUrl, { family: 'sic', variant: 'all', client: 1 }, lang);
      }
      console.log('PASS: missing GCCF clients disable actions without falling back to configured SIC or direct GCCF');
    });

    await withSimulator(mockUrl, clients, {
      FLOW_ALL_CLIENT: 'client2',
      FLOW_NO_INTERAC_CLIENT: 'client1',
      GCCF_FLOW_ALL_CLIENT: 'client8',
      GCCF_FLOW_NO_INTERAC_CLIENT: 'client7',
      GCCF_DIRECT_CLIENT: 'client5'
    }, async (baseUrl) => {
      for (const flow of [
        { family: 'sic', variant: 'all', client: 2 },
        { family: 'sic', variant: 'no-interac', client: 1 },
        { family: 'gccf', variant: 'all', client: 8 },
        { family: 'gccf', variant: 'no-interac', client: 7 }
      ]) await checkFlow(baseUrl, flow, 'en');
      const selector = await page(baseUrl, '/rpsim/gccf/en');
      hasLink(selector, '/auth/client5/en');
      assert.ok(!links(selector).some((link) => link.href.startsWith('/auth/client6/')));
      await checkAuthorization(baseUrl, '/auth/client5/en', 5, 'en');
      console.log('PASS: independent SIC, GCCF and direct GCCF client overrides');
    });
    assert.deepEqual(unexpectedRequests, [], 'Tests must only request mock discovery, never authorize/token endpoints');
  } finally {
    await Promise.all(Array.from(childProcesses, stopChild));
    await new Promise((resolve) => mock.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
