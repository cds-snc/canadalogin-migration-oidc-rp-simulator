
  import { config } from 'dotenv';
  import { ClientAuthMethod } from 'openid-client';
  import { URLSearchParams } from 'url';

  config();

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

  const createClient = (index: number) => {
    const prefix = `CLIENT${index}`;
    const clientName = `client${index}`;

    return {
      name: clientName,
      description: env(`${prefix}_DESCRIPTION`, clientName),
      skip: envBool(`${prefix}_SKIP`, false),
      sic: envBool(`${prefix}_SIC`, false),
      ap: env(`${prefix}_URL`),
      customRedirectUrl: envTrimmed(`${prefix}_CUSTOM_REDIRECT_URL`),
      config: {
        client_id: env(`${prefix}_CLIENT_ID`),
        client_secret: env(`${prefix}_CLIENT_SECRET`),
        grant_types: ['refresh_token', 'authorization_code', 'openid'],
        redirect_uris: envList(`${prefix}_REDIRECT_URIS`, [`http://localhost:8080/auth/callback/${clientName}`]),
        post_logout_redirect_uris: envList(`${prefix}_POST_LOGOUT_REDIRECT_URIS`, ['http://localhost:8080/logout/callback']),
        token_endpoint_auth_method: (env(`${prefix}_TOKEN_ENDPOINT_AUTH_METHOD`, 'client_secret_post') as ClientAuthMethod),
      }
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

  export const oidc_clients = [client1, client2, client3, client4, client5].filter((client) => hasConfiguredValue(client.ap));

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
