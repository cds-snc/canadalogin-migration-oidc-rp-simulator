const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');
const { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { dirname, join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const vm = require('node:vm');
const { Issuer } = require('openid-client');
const { importJWK, jwtVerify } = require('jose');

// Exercise the installed client's assertion builder without sending a token request.
const { authFor } = require(join(dirname(require.resolve('openid-client')), 'helpers/client.js'));
const root = resolve(__dirname, '..');
const configSource = readFileSync(join(root, 'build/config.js'), 'utf8');
const generator = join(__dirname, 'generate-private-jwt-client-keys.js');
const issuer = new Issuer({
  issuer: 'https://issuer.example',
  token_endpoint: 'https://issuer.example/token',
});

function rsa(kid) {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { ...privateKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };
}

const firstKey = rsa('first');
const secondKey = rsa('second');
const ecKey = {
  ...generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'jwk' }),
  kid: 'ec', use: 'sig',
};

function loadConfig(env = {}) {
  const module = { exports: {} };
  vm.runInNewContext(configSource, {
    module, exports: module.exports, __dirname: join(root, 'build'),
    require: (id) => id === 'dotenv' ? { config() {} } : require(id),
    process: { env: { SESSION_SECRET: 'offline-test-session', ...env } },
    console: { log() {} },
  });
  return JSON.parse(JSON.stringify(module.exports));
}

function privateConfig(keys = [firstKey], overrides = {}) {
  return loadConfig({
    CLIENT6_URL: issuer.issuer,
    CLIENT6_CLIENT_ID: 'test-client6',
    CLIENT6_TOKEN_ENDPOINT_AUTH_METHOD: 'private_key_jwt',
    CLIENT6_PRIVATE_JWKS: JSON.stringify({ keys }),
    ...overrides,
  });
}

async function verifyAssertion(config, expectedKid, alg = 'RS256') {
  const entry = config.oidc_clients.find((client) => client.name === 'client6');
  const client = new issuer.Client(entry.config, entry.privateJwks);
  const { form } = await authFor.call(client, 'token');
  assert.equal(form.client_assertion_type, 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
  assert.equal(form.client_secret, undefined);
  const jwks = config.privateJwtClientPublicJwks.jwks;
  for (const key of jwks.keys) {
    for (const field of ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth']) {
      assert.equal(key[field], undefined);
    }
  }
  const publicKey = await importJWK(jwks.keys.find((key) => key.kid === expectedKid), alg);
  const { payload, protectedHeader } = await jwtVerify(form.client_assertion, publicKey, {
    issuer: 'test-client6', subject: 'test-client6', audience: issuer.token_endpoint, algorithms: [alg],
  });
  assert.equal(protectedHeader.kid, expectedKid);
  assert.equal(payload.exp - payload.iat, 60);
  assert.ok(payload.jti);
}

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'rp-private-jwt-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function generate(out, args = []) {
  return spawnSync(process.execPath, [generator, '--client=client6', `--out=${out}`, ...args], {
    cwd: root, encoding: 'utf8',
  });
}

test('default RS256 assertion verifies against public-only JWKS', async () => {
  await verifyAssertion(privateConfig(), 'first');
});

test('pinned key signs while all public keys remain available', async () => {
  const config = privateConfig([firstKey, secondKey], { CLIENT6_PRIVATE_JWT_SIGNING_KID: 'second' });
  assert.deepEqual(config.oidc_clients[0].privateJwks.keys.map((key) => key.kid), ['second']);
  assert.deepEqual(config.privateJwtClientPublicJwks.jwks.keys.map((key) => key.kid), ['first', 'second']);
  await verifyAssertion(config, 'second');
});

test('incompatible pinned key fails instead of falling back to RSA', () => {
  assert.throws(() => privateConfig([firstKey, ecKey], { CLIENT6_PRIVATE_JWT_SIGNING_KID: 'ec' }), /compatible with RS256/);
});

test('key selection checks curve, algorithm, use, and key operations', () => {
  assert.throws(() => privateConfig([ecKey], { CLIENT6_TOKEN_ENDPOINT_AUTH_SIGNING_ALG: 'ES384' }), /compatible with ES384/);
  for (const metadata of [{ alg: 'PS256' }, { use: 'enc' }, { key_ops: ['verify'] }]) {
    assert.throws(() => privateConfig([{ ...firstKey, ...metadata }]), /compatible with RS256/);
  }
  assert.throws(() => privateConfig([firstKey], { CLIENT6_TOKEN_ENDPOINT_AUTH_SIGNING_ALG: 'RS999' }), /compatible with RS999/);
});

test('algorithm-compatible keys are selected without counting incompatible keys', async () => {
  await verifyAssertion(privateConfig([ecKey, firstKey]), 'first');
  await verifyAssertion(privateConfig([ecKey], { CLIENT6_TOKEN_ENDPOINT_AUTH_SIGNING_ALG: 'ES256' }), 'ec', 'ES256');
});

test('ambiguous, duplicate, and missing key selections fail', () => {
  assert.throws(() => privateConfig([firstKey, secondKey]), /multiple signing keys/);
  assert.throws(() => privateConfig([firstKey, { ...secondKey, kid: 'first' }], {
    CLIENT6_PRIVATE_JWT_SIGNING_KID: 'first',
  }), /matches multiple keys/);
  assert.throws(() => privateConfig([firstKey], { CLIENT6_PRIVATE_JWT_SIGNING_KID: 'missing' }), /not found/);
});

test('inactive private-JWT clients do not load keys', () => {
  const config = loadConfig({ CLIENT6_TOKEN_ENDPOINT_AUTH_METHOD: 'private_key_jwt', CLIENT6_PRIVATE_JWKS: 'invalid' });
  assert.equal(config.oidc_clients.length, 0);
  assert.equal(config.privateJwtClientPublicJwks, undefined);
});

test('malformed and empty JWKS fail at startup', () => {
  assert.throws(() => privateConfig([], { CLIENT6_PRIVATE_JWKS: 'invalid' }), /valid JSON/);
  assert.throws(() => privateConfig([]), /non-empty keys array/);
});

test('only one private-JWT client may be active', () => {
  assert.throws(() => privateConfig([firstKey], {
    CLIENT5_URL: issuer.issuer,
    CLIENT5_CLIENT_ID: 'test-client5',
    CLIENT5_TOKEN_ENDPOINT_AUTH_METHOD: 'private_key_jwt',
    CLIENT5_PRIVATE_JWKS: JSON.stringify({ keys: [firstKey] }),
  }), /only one private_key_jwt client/);
});

test('existing client-secret authentication is unchanged', async () => {
  const config = loadConfig({ CLIENT1_URL: issuer.issuer, CLIENT1_CLIENT_ID: 'legacy', CLIENT1_CLIENT_SECRET: 'test-secret' });
  const client = new issuer.Client(config.oidc_clients[0].config);
  assert.deepEqual((await authFor.call(client, 'token')).form, { client_id: 'legacy', client_secret: 'test-secret' });
  assert.equal(config.privateJwtClientPublicJwks, undefined);
});

test('generated files sign successfully and cannot be overwritten', async (t) => {
  const dir = tempDir(t);
  const result = generate(dir, ['--kid=generated']);
  assert.equal(result.status, 0, result.stderr);
  const privatePath = join(dir, 'private_jwks.json');
  const publicPath = join(dir, 'jwks.json');
  const privateBefore = readFileSync(privatePath);
  const publicBefore = readFileSync(publicPath);
  assert.equal(statSync(privatePath).mode & 0o777, 0o600);
  const config = privateConfig([], { CLIENT6_PRIVATE_JWKS: '', CLIENT6_PRIVATE_JWKS_PATH: privatePath });
  assert.deepEqual(config.privateJwtClientPublicJwks.jwks, JSON.parse(publicBefore));
  await verifyAssertion(config, 'generated');
  const repeat = generate(dir);
  assert.notEqual(repeat.status, 0);
  assert.match(repeat.stderr, /Refusing to overwrite/);
  assert.ok(readFileSync(privatePath).equals(privateBefore), 'Private key must remain unchanged');
  assert.ok(readFileSync(publicPath).equals(publicBefore), 'Public key must remain unchanged');
});

test('either existing output file prevents generating the other file', (t) => {
  for (const file of ['jwks.json', 'private_jwks.json']) {
    const dir = tempDir(t);
    writeFileSync(join(dir, file), 'existing');
    const result = generate(dir);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Refusing to overwrite/);
    assert.equal(readFileSync(join(dir, file), 'utf8'), 'existing');
    const other = file === 'jwks.json' ? 'private_jwks.json' : 'jwks.json';
    assert.equal(existsSync(join(dir, other)), false);
  }
});

test('non-RSA and invalid algorithms are rejected before writing files', (t) => {
  const dir = tempDir(t);
  for (const alg of ['ES256', 'EdDSA', 'HS256', 'RS999']) {
    const out = join(dir, alg);
    const result = generate(out, [`--alg=${alg}`]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must be an RSA signing algorithm/);
    assert.equal(existsSync(out), false);
  }
});

test('PS256 generator output can sign PS256 assertions', async (t) => {
  const dir = tempDir(t);
  const result = generate(dir, ['--alg=PS256', '--kid=ps256']);
  assert.equal(result.status, 0, result.stderr);
  const config = privateConfig([], {
    CLIENT6_PRIVATE_JWKS: '',
    CLIENT6_PRIVATE_JWKS_PATH: join(dir, 'private_jwks.json'),
    CLIENT6_TOKEN_ENDPOINT_AUTH_SIGNING_ALG: 'PS256',
  });
  await verifyAssertion(config, 'ps256', 'PS256');
});
