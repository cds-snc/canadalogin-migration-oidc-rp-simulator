
  import { createPrivateKey, createPublicKey } from 'crypto';
  import { existsSync, readFileSync } from 'fs';
  import { basename, resolve } from 'path';
  import { config } from 'dotenv';
  import { ClientAuthMethod, ClientMetadata } from 'openid-client';
  import { URLSearchParams } from 'url';

  config();

  type Jwk = Record<string, any>;
  type Jwks = { keys: Jwk[] };

  const PRIVATE_KEY_JWT = 'private_key_jwt';
  const PRIVATE_JWK_FIELDS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'];
  const simulatorRoot = basename(__dirname) === 'build' ? resolve(__dirname, '..') : __dirname;

  const env = (key: string, fallback?: string) => {
    const value = process.env[key];
    return value !== undefined ? value : fallback;
  };

  const envBool = (key: string, fallback = false) => {
    const value = process.env[key];
    if (value === undefined) {
      return fallback;
    }
    return ['1', 'true', 'yes', 'y'].includes(value.toLowerCase());
  };

  const envList = (key: string, fallback: string[] = []) => {
    const value = env(key);
    if (!value) {
      return fallback;
    }
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  };

  const envQueryParams = (key: string) => {
    const value = env(key);
    if (!value) {
      return {};
    }

    const normalized = value.trim().replace(/^\?/, '');
    if (!normalized) {
      return {};
    }

    const params: Record<string, string> = {};
    const searchParams = new URLSearchParams(normalized);

    searchParams.forEach((paramValue, paramKey) => {
      if (!paramKey) {
        return;
      }

      params[paramKey] = paramValue;
    });

    return params;
  };

  const envTrimmed = (key: string) => {
    const value = env(key);
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    return trimmed.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  };

  const hasConfiguredValue = (value?: string) => typeof value === 'string' && value.trim().length > 0;

  const parseJwks = (value: string, source: string): Jwks => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch (error) {
      throw new Error(`[config] ${source} must be valid JSON`);
    }

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !Array.isArray((parsed as Jwks).keys) ||
      (parsed as Jwks).keys.length === 0 ||
      (parsed as Jwks).keys.some((key) => !key || typeof key !== 'object' || typeof key.kty !== 'string')
    ) {
      throw new Error(`[config] ${source} must be a JWKS object with a non-empty keys array`);
    }

    return {
      keys: (parsed as Jwks).keys.map((key) => ({ ...key })),
    };
  };

  const resolveConfigPath = (value: string) => resolve(simulatorRoot, value);

  const readJwksFile = (path: string, source: string): Jwks => {
    try {
      return parseJwks(readFileSync(path, 'utf8'), source);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('[config]')) {
        throw error;
      }

      throw new Error(`[config] could not read ${source}: ${(error as Error).message}`);
    }
  };

  const getDefaultPrivateJwksPath = (clientName: string) => resolve(simulatorRoot, '.local', clientName, 'private_jwks.json');

  const loadPrivateJwks = (prefix: string, clientName: string, authMethod: ClientAuthMethod): Jwks | undefined => {
    if (authMethod !== PRIVATE_KEY_JWT) {
      return undefined;
    }

    const inlineJwks = envTrimmed(`${prefix}_PRIVATE_JWKS`);
    if (inlineJwks) {
      return parseJwks(inlineJwks, `${prefix}_PRIVATE_JWKS`);
    }

    const configuredPath = envTrimmed(`${prefix}_PRIVATE_JWKS_PATH`);
    const privateJwksPath = configuredPath
      ? resolveConfigPath(configuredPath)
      : getDefaultPrivateJwksPath(clientName);

    if (!existsSync(privateJwksPath)) {
      throw new Error(
        `[config] ${clientName} uses private_key_jwt but no private JWKS was found. ` +
        `Set ${prefix}_PRIVATE_JWKS or ${prefix}_PRIVATE_JWKS_PATH. Expected path: ${privateJwksPath}`
      );
    }

    return readJwksFile(privateJwksPath, `${prefix}_PRIVATE_JWKS_PATH`);
  };

  const isSigningCandidate = (key: Jwk, signingAlg: string) => {
    if (key.use !== undefined && key.use !== 'sig') {
      return false;
    }

    if (key.alg !== undefined && key.alg !== signingAlg) {
      return false;
    }

    if (key.key_ops !== undefined && (!Array.isArray(key.key_ops) || !key.key_ops.includes('sign'))) {
      return false;
    }

    if (typeof key.d !== 'string' || key.d.length === 0) {
      return false;
    }

    if (/^(RS|PS)(256|384|512)$/.test(signingAlg)) {
      return key.kty === 'RSA';
    }

    const ecCurves: Record<string, string> = {
      ES256: 'P-256', ES384: 'P-384', ES512: 'P-521', ES256K: 'secp256k1',
    };
    if (Object.prototype.hasOwnProperty.call(ecCurves, signingAlg)) {
      return key.kty === 'EC' && key.crv === ecCurves[signingAlg];
    }

    return signingAlg === 'EdDSA' && key.kty === 'OKP' && ['Ed25519', 'Ed448'].includes(key.crv);
  };

  const selectSigningKey = (jwks: Jwks, signingAlg: string, signingKid?: string): Jwks => {
    const candidates = jwks.keys.filter((key) => signingKid
      ? key.kid === signingKid
      : isSigningCandidate(key, signingAlg));

    if (candidates.length === 0) {
      throw new Error(signingKid
        ? `[config] private_key_jwt signing kid "${signingKid}" was not found in private JWKS`
        : `[config] private_key_jwt private JWKS does not contain a signing key compatible with ${signingAlg}`
      );
    }

    if (candidates.length > 1) {
      throw new Error(signingKid
        ? `[config] private_key_jwt signing kid "${signingKid}" matches multiple keys; each kid must be unique`
        : '[config] private_key_jwt private JWKS has multiple signing keys. Set CLIENTn_PRIVATE_JWT_SIGNING_KID.'
      );
    }

    const selectedKey = candidates[0];
    if (!isSigningCandidate(selectedKey, signingAlg)) {
      throw new Error(`[config] private_key_jwt signing kid "${signingKid}" is not a signing key compatible with ${signingAlg}`);
    }

    // Keep other keys in the public JWKS, but prevent the client library from choosing a different signing key.
    return {
      keys: [{ ...selectedKey }],
    };
  };

  const toPublicJwk = (privateJwk: Jwk): Jwk => {
    if (privateJwk.kty === 'oct') {
      throw new Error('[config] private_key_jwt JWKS must use asymmetric keys');
    }

    let publicJwk: Jwk;
    try {
      const privateKey = createPrivateKey({ key: privateJwk, format: 'jwk' } as any);
      publicJwk = createPublicKey(privateKey).export({ format: 'jwk' } as any) as Jwk;
    } catch (error) {
      throw new Error(`[config] could not derive public JWK for kid "${privateJwk.kid || 'unknown'}": ${(error as Error).message}`);
    }

    for (const metadataKey of ['kid', 'use', 'alg', 'x5c', 'x5t', 'x5t#S256']) {
      if (privateJwk[metadataKey] !== undefined) {
        publicJwk[metadataKey] = privateJwk[metadataKey];
      }
    }

    for (const privateField of PRIVATE_JWK_FIELDS) {
      delete publicJwk[privateField];
    }

    return publicJwk;
  };

  const buildPublicJwks = (privateJwks: Jwks): Jwks => ({
    keys: privateJwks.keys.map(toPublicJwk),
  });

  const createClient = (index: number) => {
    const prefix = `CLIENT${index}`;
    const clientName = `client${index}`;
    const ap = env(`${prefix}_URL`);
    const authMethod = (env(`${prefix}_TOKEN_ENDPOINT_AUTH_METHOD`, 'client_secret_post') as ClientAuthMethod);
    const signingAlg = envTrimmed(`${prefix}_TOKEN_ENDPOINT_AUTH_SIGNING_ALG`) || (authMethod === PRIVATE_KEY_JWT ? 'RS256' : undefined);
    const privateJwks = hasConfiguredValue(ap)
      ? loadPrivateJwks(prefix, clientName, authMethod)
      : undefined;
    const signingKid = envTrimmed(`${prefix}_PRIVATE_JWT_SIGNING_KID`);
    const clientJwks = privateJwks
      ? selectSigningKey(privateJwks, signingAlg, signingKid)
      : undefined;
    const clientConfig: ClientMetadata = {
      client_id: env(`${prefix}_CLIENT_ID`),
      client_secret: env(`${prefix}_CLIENT_SECRET`),
      grant_types: ['refresh_token', 'authorization_code', 'openid'],
      redirect_uris: envList(`${prefix}_REDIRECT_URIS`, [`http://localhost:8080/auth/callback/${clientName}`]),
      post_logout_redirect_uris: envList(`${prefix}_POST_LOGOUT_REDIRECT_URIS`, ['http://localhost:8080/logout/callback']),
      token_endpoint_auth_method: authMethod,
    };

    if (signingAlg) {
      clientConfig.token_endpoint_auth_signing_alg = signingAlg;
    }

    return {
      name: clientName,
      description: env(`${prefix}_DESCRIPTION`, clientName),
      autoLogoutAfterLogin: envBool(`${prefix}_AUTO_LOGOUT_AFTER_LOGIN`, false),
      skip: envBool(`${prefix}_SKIP`, false),
      sic: envBool(`${prefix}_SIC`, false),
      ap,
      customRedirectUrl: envTrimmed(`${prefix}_CUSTOM_REDIRECT_URL`),
      customLogoutRedirectUrl: envTrimmed(`${prefix}_CUSTOM_LOGOUT_REDIRECT_URL`),
      config: clientConfig,
      privateJwks: clientJwks,
      publicJwks: privateJwks ? buildPublicJwks(privateJwks) : undefined,
    };
  };

  export const sessionSecret = env('SESSION_SECRET') as string;
  export const authExtraParameters = envQueryParams('AUTH_EXTRA_PARAMETERS');

  // Print the session secret length.
  console.log(`XXXXXXXXXXX Session secret length: ${sessionSecret.length}`);


  // The redirect URI for the RP simulator has to have a the name in the callback URL
  // Name is client1, client2, etc.
  // Reduct URI example: ...../callback/client1
  // http://localhost:8080/auth/callback/client1
  const client1 = createClient(1);

  const client2 = createClient(2);

  const client3 = createClient(3);

  const client4 = createClient(4);

  const client5 = createClient(5);

  const client6 = createClient(6);

  export const oidc_clients = [client1, client2, client3, client4, client5, client6].filter((client) => hasConfiguredValue(client.ap));

  const privateJwtClients = oidc_clients.filter((client) => client.config.token_endpoint_auth_method === PRIVATE_KEY_JWT);
  if (privateJwtClients.length > 1) {
    throw new Error('[config] only one private_key_jwt client is supported by the shared JWKS endpoint');
  }

  export const privateJwtClientPublicJwks = privateJwtClients[0]
    ? {
        clientName: privateJwtClients[0].name,
        jwks: privateJwtClients[0].publicJwks,
      }
    : undefined;

  export const pageClientConfig = {
    flowAllClient: env('FLOW_ALL_CLIENT', 'client1'),
    flowNoInteracClient: env('FLOW_NO_INTERAC_CLIENT', 'client2'),
    loginMigrationRegisterClient: env('LOGIN_MIGRATION_REGISTER_CLIENT', 'client3')
  };

  export const ui_config = {
    client_label: 'RP1',
    title_en: 'OIDC RP Simulator',
    title_fr: 'Simulateur OIDC de la partie utilisatrice',
    wet_cdts_hosturl: 'https://www.canada.ca/etc/designs/canada/cdts/gcweb',
    wet_cdts_version: 'v5_0_5',
    jquery_version: '2.2.4'
  };
