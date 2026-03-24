import express from 'express';
import createError from 'http-errors';
import { Issuer } from 'openid-client';
import expressSession from 'express-session';
import passport from 'passport';
import { authExtraParameters, oidc_clients, pageClientConfig, sessionSecret, ui_config } from '../config';
import { locales_en, locales_fr } from './locales/translations';

import { OpenIDConnectStrategy } from './strategy';


export const DEFAULT_PORT = process.env.PORT || 8080;

// Public/base URL used to construct redirect URIs when running behind a proxy or in deployed environments.
// Prefer setting PUBLIC_BASE_URL (e.g., https://rpsim.example.gc.ca) in your .env.
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL;

function inferBaseUrl(req: express.Request): string | undefined {
  const xfProto = (req.headers['x-forwarded-proto'] as string | undefined);
  const xfHost = (req.headers['x-forwarded-host'] as string | undefined);
  const proto = (xfProto || (req as any).protocol) as string | undefined;
  const host = (xfHost || req.get('host')) as string | undefined;
  if (!proto || !host) return undefined;
  return `${proto}://${host}`;
}

function computeBaseUrl(req: express.Request, port: string | number): string {
  return (
    PUBLIC_BASE_URL ||
    inferBaseUrl(req) ||
    `http://localhost:${port}`
  );
}

function parseCsvUris(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr));
}
/**
 * Helper to resolve the Sign-In page link from env/config.
 */
function getLoginMigrationLink(lang?: string): string | undefined {
  const appendLang = (base: string): string => {
    if (!lang) return `${base}/en`;
    const trimmed = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${trimmed}/${lang}`;
  };

  // Prefer PUBLIC_BASE_URL when available; otherwise fall back to an in-app relative path.
  const fromEnv = process.env.PUBLIC_BASE_URL
    ? `${process.env.PUBLIC_BASE_URL}/rpsim/loginMigration`
    : '/rpsim/loginMigration';

  console.log("getLoginMigrationLink:" + appendLang(fromEnv));
  return appendLang(fromEnv);
}

function getSignInPageLink(lang?: string): string | undefined {
  const appendLang = (base: string): string => {
    if (!lang) return `${base}/en`;
    const trimmed = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${trimmed}/${lang}`;
  };

  // Prefer PUBLIC_BASE_URL when available; otherwise fall back to an in-app relative path.
  const fromEnv = process.env.PUBLIC_BASE_URL
    ? `${process.env.PUBLIC_BASE_URL}/rpsim/signinpage`
    : '/rpsim/signinpage';

  console.log("getSignInPageLink:" + appendLang(fromEnv));
  return appendLang(fromEnv);
}

function getHelpContentLink(lang?: string): string {
  const localized =
    (lang === 'fr' ? process.env.HELP_CONTENT_URL_FR : process.env.HELP_CONTENT_URL_EN) ||
    process.env.HELP_CONTENT_URL;

  if (localized && localized.trim().length > 0) {
    return localized.trim();
  }

  return lang === 'fr' ? '/rpsim/help-content/fr' : '/rpsim/help-content/en';
}

type SignInFlow = 'all' | 'no-interac';
type OidcClient = (typeof oidc_clients)[number];

function parseSignInFlow(flow: unknown): SignInFlow {
  const normalized = Array.isArray(flow) ? flow[0] : flow;
  return normalized === 'no-interac' ? 'no-interac' : 'all';
}

function parseBooleanQueryFlag(value: unknown): boolean | undefined {
  const normalized = Array.isArray(value) ? value[0] : value;

  if (typeof normalized === 'boolean') {
    return normalized;
  }

  if (typeof normalized !== 'string') {
    return undefined;
  }

  const trimmed = normalized.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(trimmed)) {
    return true;
  }

  if (['0', 'false', 'no', 'n'].includes(trimmed)) {
    return false;
  }

  return undefined;
}

function resolveConfiguredClientByName(name: string, context = 'configured'): OidcClient | undefined {
  const normalizedName = name && name.trim();
  if (!normalizedName) {
    return undefined;
  }

  const configuredClient = oidc_clients.find((item) => item.name === normalizedName);
  if (configuredClient) {
    return configuredClient;
  }

  console.warn(`[config] ${context} client "${normalizedName}" is not configured. Falling back.`);
  return undefined;
}

function getSignInFlowClients(flow: SignInFlow) {
  const flowClientName = flow === 'no-interac'
    ? pageClientConfig.flowNoInteracClient
    : pageClientConfig.flowAllClient;
  const flowClient = resolveConfiguredClientByName(flowClientName, 'flow') || oidc_clients[0];

  return {
    registerClient: flowClient,
    gcSigninClient: flowClient,
    gcKeyClient: flowClient,
    interacClient: flowClient,
  };
}

function getSignInMenuLink(page: string, lang: string, flow: SignInFlow, fallback: string): string {
  switch (page) {
    case 'testflows':
    case 'FCACHomePage':
      // Default to Flow A when no specific flow has been selected yet.
      return `/rpsim/flow-all/${lang}`;
    case 'flow-all-home':
    case 'flow-all':
      return `/rpsim/flow-all/${lang}`;
    case 'flow-no-interac-home':
    case 'flow-no-interac':
      return `/rpsim/flow-no-interac/${lang}`;
    case 'signinpage':
      return flow === 'no-interac'
        ? `/rpsim/flow-no-interac/${lang}`
        : `/rpsim/flow-all/${lang}`;
    default:
      return fallback;
  }
}

/**

/**
 * Returns the redirect URIs list to be used for the sector_identifier_uri document.
 *
 * This is intentionally NOT provider-specific: for pairwise/sector calculations,
 * OPs commonly expect the complete list of redirect URIs in the same sector.
 *
 * Configure in .env as a single comma-separated list:
 *   SECTOR_REDIRECT_URIS=https://.../auth/callback/sic,https://.../auth/callback/gckey,...
 */
function getSectorRedirectUris(req: express.Request, port: string | number): string[] {
  const fromEnv = parseCsvUris(process.env.SECTOR_REDIRECT_URIS);
  if (fromEnv.length) return uniq(fromEnv);

  // Fallback: union all configured redirect_uris from oidc client config.
  const collected: string[] = [];
  try {
    for (const c of (oidc_clients as any[])) {
      const configured = (c?.config?.redirect_uris || []) as string[];
      collected.push(...configured);
    }
  } catch {
    // ignore
  }
  if (collected.length) return uniq(collected);

  // Last resort: build a default callback per configured client.
  const baseUrl = computeBaseUrl(req, port);
  const defaults: string[] = [];
  try {
    for (const c of (oidc_clients as any[])) {
      if (c?.name) defaults.push(`${baseUrl}/auth/callback/${c.name}`);
    }
  } catch {
    // ignore
  }
  return uniq(defaults);
}

// Kept for backwards compatibility with existing call sites, but now returns the full sector list.
function getSectorRedirectUrisForClient(cli: any, req: express.Request, port: string | number): string[] {
  return getSectorRedirectUris(req, port);
}

interface RequestWithUserSession extends express.Request {
  user?: any,
  session?: any
}

type BackChannelLogoutClaims = {
  iss: string
  sid?: string
  sub?: string
  events: Record<string, unknown>
  nonce?: string
}

const BACKCHANNEL_LOGOUT_EVENT = 'http://schemas.openid.net/event/backchannel-logout';
const logoutIndexByKey = new Map<string, Set<string>>();
const logoutKeysBySessionId = new Map<string, string[]>();

function buildBackChannelLogoutKeys(provider: string, issuer: string, sid?: string, sub?: string): string[] {
  const normalizedProvider = provider && provider.trim();
  const normalizedIssuer = issuer && issuer.trim();
  const keys: string[] = [];

  if (!normalizedProvider || !normalizedIssuer) {
    return keys;
  }

  if (sid) {
    keys.push(`${normalizedProvider}|${normalizedIssuer}|sid|${sid}`);
  }

  if (sub) {
    keys.push(`${normalizedProvider}|${normalizedIssuer}|sub|${sub}`);
  }

  return keys;
}

function clearSessionFromBackChannelIndex(sessionId?: string) {
  if (!sessionId) {
    return;
  }

  const keys = logoutKeysBySessionId.get(sessionId) || [];

  for (const key of keys) {
    const sessions = logoutIndexByKey.get(key);
    if (!sessions) {
      continue;
    }

    sessions.delete(sessionId);
    if (sessions.size === 0) {
      logoutIndexByKey.delete(key);
    }
  }

  logoutKeysBySessionId.delete(sessionId);
}

function indexSessionForBackChannelLogout(sessionId: string, provider: string, issuer: string, sid?: string, sub?: string) {
  clearSessionFromBackChannelIndex(sessionId);

  const keys = buildBackChannelLogoutKeys(provider, issuer, sid, sub);
  if (!keys.length) {
    return;
  }

  for (const key of keys) {
    const sessions = logoutIndexByKey.get(key) || new Set<string>();
    sessions.add(sessionId);
    logoutIndexByKey.set(key, sessions);
  }

  logoutKeysBySessionId.set(sessionId, keys);
}

function findSessionsForBackChannelLogout(provider: string, issuer: string, sid?: string, sub?: string): string[] {
  const matches = new Set<string>();

  for (const key of buildBackChannelLogoutKeys(provider, issuer, sid, sub)) {
    const sessionIds = logoutIndexByKey.get(key);
    if (!sessionIds) {
      continue;
    }

    sessionIds.forEach((sessionId) => {
      matches.add(sessionId);
    });
  }

  return Array.from(matches);
}

function resolveExpectedSigningAlg(client: any): string | undefined {
  if (client && typeof client.id_token_signed_response_alg === 'string') {
    return client.id_token_signed_response_alg;
  }

  const supportedAlgorithms = client && client.issuer && client.issuer.id_token_signing_alg_values_supported;
  if (Array.isArray(supportedAlgorithms) && typeof supportedAlgorithms[0] === 'string') {
    return supportedAlgorithms[0];
  }

  return undefined;
}

function getSessionTokenClaims(req: RequestWithUserSession) {
  const tokenSet = req.session && req.session.tokenSet;
  if (!tokenSet || typeof tokenSet.claims !== 'function') {
    return req.user;
  }

  try {
    return tokenSet.claims();
  } catch (error) {
    console.warn('[backchannel-logout] could not read token claims from session', error);
    return req.user;
  }
}

function resolveLogoutHint(req: RequestWithUserSession): string | undefined {
  const tokenClaims = getSessionTokenClaims(req) || {};

  if (tokenClaims && typeof tokenClaims.sid === 'string' && tokenClaims.sid.length > 0) {
    return tokenClaims.sid;
  }

  if (tokenClaims && typeof tokenClaims.sub === 'string' && tokenClaims.sub.length > 0) {
    return tokenClaims.sub;
  }

  if (tokenClaims && typeof tokenClaims.preferred_username === 'string' && tokenClaims.preferred_username.length > 0) {
    return tokenClaims.preferred_username;
  }

  if (tokenClaims && typeof tokenClaims.email === 'string' && tokenClaims.email.length > 0) {
    return tokenClaims.email;
  }

  const userinfo = req.session && req.session.userinfo;
  if (userinfo && typeof userinfo.sub === 'string' && userinfo.sub.length > 0) {
    return userinfo.sub;
  }

  if (userinfo && typeof userinfo.preferred_username === 'string' && userinfo.preferred_username.length > 0) {
    return userinfo.preferred_username;
  }

  if (userinfo && typeof userinfo.email === 'string' && userinfo.email.length > 0) {
    return userinfo.email;
  }

  return undefined;
}

async function validateBackChannelLogoutToken(client: any, logoutToken: string): Promise<BackChannelLogoutClaims> {
  const expectedAlg = resolveExpectedSigningAlg(client);
  if (!expectedAlg) {
    throw new Error('Could not determine expected signing algorithm');
  }

  const validated = await client.validateJWT(
    logoutToken,
    expectedAlg,
    ['iss', 'aud', 'iat', 'jti', 'events']
  );
  const payload = validated && validated.payload ? validated.payload : {};

  if (payload.nonce !== undefined) {
    throw new Error('logout_token must not contain nonce');
  }

  if (!payload.events || typeof payload.events !== 'object' || Array.isArray(payload.events)) {
    throw new Error('logout_token is missing events claim');
  }

  if (!(BACKCHANNEL_LOGOUT_EVENT in payload.events)) {
    throw new Error('logout_token is missing backchannel logout event');
  }

  if (typeof payload.iss !== 'string' || payload.iss.length === 0) {
    throw new Error('logout_token has invalid iss claim');
  }

  const sid = typeof payload.sid === 'string' ? payload.sid : undefined;
  const sub = typeof payload.sub === 'string' ? payload.sub : undefined;
  if (!sid && !sub) {
    throw new Error('logout_token must include sid or sub');
  }

  return {
    iss: payload.iss,
    sid,
    sub,
    events: payload.events,
    nonce: payload.nonce
  };
}

async function destroySessionById(sessionStore: any, sessionId: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    sessionStore.destroy(sessionId, (err: any) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

export class ServerExpress {
  static mounted: { [named: string]: string } = {};
  listener: import('http').Server;
  publicBaseUrl?: string;

  async start(port = DEFAULT_PORT) {
    const params = { scope: ['openid'] };
    const app = express();
    const resolvedPort = port;
    app.set('trust proxy', 1) // trust first proxy

    app.use(
      expressSession({
        secret: sessionSecret,
        resave: false,
        saveUninitialized: true,
        cookie: {
          maxAge: 600000
        }
      })
    );
    app.use(passport.initialize());
    app.use(passport.session());
    app.use(express.static(__dirname + '/public'));
    app.set('views', __dirname + '/views');
    app.set("view engine", "ejs");

    setupStrategies();

    app.get('/health', (req, res) => res.status(200).send('OK'));

    // Sector Identifier URI endpoint (used for OIDC pairwise subject identifier calculations).
    // Returns a JSON array of redirect URIs for the sector.
    // Configure as a full list via SECTOR_REDIRECT_URIS in .env.
    //
    // Recommended OP config: sector_identifier_uri = "https://.../sector-identifier"
    app.get('/sector-identifier', (req, res) => {
      const redirectUris = getSectorRedirectUris(req, resolvedPort);
      return res.status(200).json(redirectUris);
    });

    // Backwards-compatible alias (ignores provider and returns the same full list)
    app.get('/sector-identifier/:provider', (req, res) => {
      const redirectUris = getSectorRedirectUris(req, resolvedPort);
      return res.status(200).json(redirectUris);
    });

    //app.get('/', (req, res) => res.render('index', { ui_config: ui_config }));
    app.get('/', (req, res) => {
      res.redirect('/rpsim/testflows/en');
    });

    app.get('/rpsim/:page/:lang', (req: RequestWithUserSession, res) => {
      let template

      switch (req.params.lang) {
        case 'en':
          template = locales_en
          break;
        case 'fr':
          template = locales_fr
          break;
        default:
          return res.redirect('/');
      }

      let data = {
        ...template,
        page: req.params.page,
        ui_config: ui_config,
        isLoggedIn: req.user != undefined
      }
      const queryFlow = parseSignInFlow(req.query.flow);
      const signInFlow: SignInFlow = req.params.page === 'flow-no-interac'
        ? 'no-interac'
        : req.params.page === 'flow-all'
          ? 'all'
          : queryFlow;
      const flowClients = getSignInFlowClients(signInFlow);
      const loginMigrationLoginLink = getLoginMigrationLink(req.params.lang) || `/rpsim/loginMigration/${req.params.lang}`;
      const signInMenuLink = getSignInMenuLink(req.params.page, req.params.lang, signInFlow, loginMigrationLoginLink);
      data = {
        ...data,
        loginMigrationLoginLink: loginMigrationLoginLink,
        signInMenuLink: signInMenuLink,
        helpContentLink: getHelpContentLink(req.params.lang)
      }
      console.log("========= rpsim endpoint ====== ")
      console.log(req.params.page)

      switch (req.params.page) {
        case 'login':
          data = {
            ...data,
            signInPageLink: getSignInPageLink(req.params.lang),
            oidc_clients: oidc_clients.map((item) => { return { name: item.name, description: item.description, sic: item.sic } })
          }
          res.render('login', data)
          break;
        case 'loginMigration': {
          const loginMigrationRegisterClient = resolveConfiguredClientByName(
            pageClientConfig.loginMigrationRegisterClient,
            'login migration register'
          );
          data = {
            ...data,
            signInPageLink: getSignInPageLink(req.params.lang),
            oidc_clients: oidc_clients.map((item) => { return { name: item.name, description: item.description, sic: item.sic } }),
            registerLink: loginMigrationRegisterClient
              ? `/auth/${loginMigrationRegisterClient.name}/${req.params.lang}`
              : undefined
          }
          res.render('loginMigration', data)
          break;
        }
        case 'FCACHomePage':
        case 'testflows':
          data = {
            ...data,
            signInPageLink: getSignInPageLink(req.params.lang),
            oidc_clients: oidc_clients.map((item) => { return { name: item.name, description: item.description, sic: item.sic } }),
            flowAllPageLink: `/rpsim/flow-all/${req.params.lang}`,
            flowNoInteracPageLink: `/rpsim/flow-no-interac/${req.params.lang}`,
            manualClientSelectionLink: `/rpsim/login/${req.params.lang}`
          }
          res.render('FCACHomePage', data)
          break;
        case 'flow-all-home':
          res.redirect(`/rpsim/flow-all/${req.params.lang}`);
          break;
        case 'flow-no-interac-home':
          res.redirect(`/rpsim/flow-no-interac/${req.params.lang}`);
          break;
        case 'flow-all':
        case 'flow-no-interac': {
          const flowFromPage: SignInFlow = req.params.page === 'flow-no-interac' ? 'no-interac' : 'all';
          data = {
            ...data,
            signInPageLink: `/rpsim/signinpage/${req.params.lang}?flow=${flowFromPage}`,
            oidc_clients: oidc_clients.map((item) => { return { name: item.name, description: item.description, sic: item.sic } }),
            registerLink: flowClients.registerClient
              ? `/auth/${flowClients.registerClient.name}/${req.params.lang}?flow=${flowFromPage}&skipmigration=true`
              : undefined
          }
          res.render('flowSignRegister', data)
          break;
        }
        case 'signinpage':
          data = {
            ...data,
            signInPageLink: getSignInPageLink(req.params.lang),
            oidc_clients: oidc_clients.map((item) => { return { name: item.name, description: item.description, sic: item.sic } }),
            signInFlow: signInFlow,
            showInteracOption: signInFlow === 'all',
            gcSigninClient: flowClients.gcSigninClient,
            gcKeyClient: flowClients.gcKeyClient,
            interacClient: flowClients.interacClient
          }
          res.render('signInPage', data)
          break;
        case 'response':
          data = {
            ...data,
            reqParams: req.session.reqParams,
            user: req.user,
            tokenSet: req.session.tokenSet,
            userinfo: req.session.userinfo
          }
          res.render('response', data)
          break;
        case 'dashboard': {
          res.render('dashboard', data)
          break;
        }
        case 'help-content':
          res.render('helpContent', data)
          break;
        default:
          data = {
            ...data,
            signInPageLink: getSignInPageLink(req.params.lang),
            oidc_clients: oidc_clients.map((item) => { return { name: item.name, description: item.description } })
          }
          res.render('login', data)
      }
    });

    app.get('/auth/callback/:provider', async (req: RequestWithUserSession, res, next) => {
      const callbackProvider = req.params.provider;
      const sessionProvider = req.session?.authProvider;
      const provider = callbackProvider;
      if (sessionProvider) {
        delete req.session.authProvider;
      }
      req.session.requestedProvider = sessionProvider || callbackProvider;

      console.log(" ========= /auth/callback/:provider");
      console.log(provider);

      if (sessionProvider && sessionProvider !== callbackProvider) {
        console.warn(`[oidc] callback provider mismatch: path=${callbackProvider} session=${sessionProvider}. Ignoring session provider value.`);
      }

      if (!(await ensureStrategy(provider))) {
        return res.status(500).render('error', {
          err: `OIDC client not discovered for ${provider}. Please try again.`,
        });
      }

      passport.authenticate(provider, {
        successRedirect: `/success/${provider}`,
        failureRedirect: `/error?error=${req.query.error}: ${req.query.error_description}`,
      })(req, res, next);
    });

    app.get('/auth/:provider/:lang', async (req: RequestWithUserSession, res, next) => {
      const provider = req.params.provider

      const clientSelected = oidc_clients.find(item => item.name === provider)
      const skipMigrationOverride = parseBooleanQueryFlag(
        (req.query as any).skipMigration ?? (req.query as any).skipmigration
      );

      const toSkip = clientSelected
        ? (skipMigrationOverride ?? clientSelected.skip)
        : false;

      console.log(" ==== to skip =====")
      console.log(toSkip);

      let currentLocale = req.params.lang;
      console.log(" ==== local =====")

      console.log(currentLocale);
      if(currentLocale !== 'en' && currentLocale !== 'fr'){
        currentLocale = 'en';
      }
      
      console.log(" ==== local =====")

      console.log(currentLocale);

      if (!(await ensureStrategy(provider))) {
        return res.status(500).render('error', {
          err: `OIDC client not discovered for ${provider}. Please try again.`,
        });
      }

      const opts = {
        ...req.query,
        skipMigration: toSkip,
        lang: currentLocale       // <— your injected value
      };

      // Keep track of the selected provider so callback processing can use the same OIDC client.
      req.session.authProvider = provider;

      passport.authenticate(provider, opts as any)(req, res, next);
    });

  

    app.get('/success/:provider', (req: RequestWithUserSession, res) => {
      const provider = req.params.provider
      const requestedProvider = req.session.requestedProvider || provider
      // save teh current provider in req.session for the logout
      req.session.provider = provider
      req.session.requestedProvider = requestedProvider

      console.log(" ========= /success/:provider")
      console.log(provider)

      const sessionId = (req as any).sessionID as string | undefined;
      const tokenClaims = getSessionTokenClaims(req);

      if (
        sessionId &&
        tokenClaims &&
        typeof tokenClaims.iss === 'string' &&
        tokenClaims.iss.length > 0
      ) {
        const sid = typeof tokenClaims.sid === 'string' ? tokenClaims.sid : undefined;
        const sub = typeof tokenClaims.sub === 'string' ? tokenClaims.sub : undefined;
        indexSessionForBackChannelLogout(sessionId, provider, tokenClaims.iss, sid, sub);
      } else {
        clearSessionFromBackChannelIndex(sessionId);
      }

      
      const rawLocale = getLocale(req);

      const currentLocale = rawLocale === 'fr' ? 'fr' : 'en';

      const baseUrl = computeBaseUrl(req, resolvedPort);
      this.publicBaseUrl = baseUrl;

      const redirectClient = oidc_clients.find((item) => item.name === requestedProvider);
      if (redirectClient?.autoLogoutAfterLogin) {
        return res.redirect(`/logout/${currentLocale}/true`);
      }

      const customRedirectUrl = redirectClient?.customRedirectUrl;
      if (customRedirectUrl) {
        console.log(customRedirectUrl);
        return res.redirect(customRedirectUrl);
      }

      const redirectUri = `${baseUrl}/rpsim/dashboard/${currentLocale}`;
      console.log(redirectUri)

      res.redirect(redirectUri);
    });

    app.get('/error', (req, res) => res.status(500).render('error', { err: req.query.error }));

    app.get('/login', (req, res) => {
      res.set('content-type', 'text/html;charset=UTF-8')
      return res.status(200).send(`
        <html xmlns="http://www.w3.org/1999/xhtml">
          <script type="text/javascript">
            function redirectToLoginPage() {
              const locale = localStorage.getItem('lang_locale');
              const language = (locale ? locale.substring(0,2) : 'undefined');
              window.location.replace("/rpsim/login/" + language);
            }
          </script>
          <body onload="redirectToLoginPage()"/>
        </html>`
      )
    });

    app.get('/signout', (req: RequestWithUserSession, res) => {
      res.set('content-type', 'text/html;charset=UTF-8')
      return res.status(200).send(`
        <html xmlns="http://www.w3.org/1999/xhtml">
          <script type="text/javascript">
            function callLogoutAPI() {
              const locale = localStorage.getItem('lang_locale');
              const id_token_hint = localStorage.getItem('id_token_hint');
              const language = (locale ? locale.substring(0,2) : 'undefined');
              window.location.replace("/logout/" + language + "/" + id_token_hint);
            }
          </script>
          <body onload="callLogoutAPI()"/>
        </html>`
      )
    });

    app.get('/logout/:locale/:hint', (req: RequestWithUserSession, res) => {
      const provider = req.session && req.session.provider;
      const locale = req.params.locale === 'fr' ? 'fr' : 'en';
      const hint = req.params.hint;
      const sendIdTokenHint = hint === 'true';

      if (req.session) {
        if (!req.session.userinfo) req.session.userinfo = {};
        req.session.userinfo.locale = locale;
      }

      if (!provider) {
        return res.redirect('/logout/callback');
      }

      const strategy = passport._strategy(provider);
      const client = strategy && strategy._client;

      if (!client || typeof client.endSessionUrl !== 'function') {
        return res.redirect('/logout/callback');
      }

      const params: Record<string, string> = {
        client_id: client.client_id
      };

      const postLogoutRedirectUris = (client.post_logout_redirect_uris || (client.metadata && client.metadata.post_logout_redirect_uris));
      const postLogoutRedirectUri = Array.isArray(postLogoutRedirectUris) && typeof postLogoutRedirectUris[0] === 'string'
        ? postLogoutRedirectUris[0]
        : undefined;
      if (postLogoutRedirectUri) {
        params.post_logout_redirect_uri = postLogoutRedirectUri;
      }

      const logoutHint = resolveLogoutHint(req);
      if (logoutHint) {
        params.logout_hint = logoutHint;
      }

      if (sendIdTokenHint) {
        const idTokenHint = req.session && req.session.tokenSet && req.session.tokenSet.id_token;
        if (typeof idTokenHint === 'string' && idTokenHint.length > 0) {
          params.id_token_hint = idTokenHint;
        }
      }

      try {
        return res.redirect(client.endSessionUrl(params));
      } catch (error) {
        return res.redirect('/logout/callback');
      }
    });

    app.get('/logout/callback', (req: RequestWithUserSession, res) => {
      const locale = getLocale(req);
      const logoutRedirectProvider = req.session?.requestedProvider || req.session?.provider;
      const logoutRedirectClient = logoutRedirectProvider
        ? oidc_clients.find((item) => item.name === logoutRedirectProvider)
        : undefined;
      const customLogoutRedirectUrl = logoutRedirectClient?.customLogoutRedirectUrl;
      clearSessionFromBackChannelIndex((req as any).sessionID);

      const finishSessionCleanup = () => {
        if (!req.session || typeof req.session.destroy !== 'function') {
          if (customLogoutRedirectUrl) {
            return res.redirect(customLogoutRedirectUrl);
          }
          return res.redirect(`/rpsim/login/${locale}`);
        }

        return req.session.destroy((err) => {
          if (err) {
            console.error('[logout/callback] session destroy failed', err);
            return res.status(500).render('error', { err: err });
          }

          if (customLogoutRedirectUrl) {
            return res.redirect(customLogoutRedirectUrl);
          }

          return res.redirect(`/rpsim/login/${locale}`);
        });
      };

      return (req as any).logout((logoutErr: any) => {
        if (logoutErr) {
          console.error('[logout/callback] passport logout failed', logoutErr);
          return res.status(500).render('error', { err: logoutErr });
        }

        return finishSessionCleanup();
      });
    });

    const backChannelLogoutRequestParsers = [
      express.urlencoded({ extended: false }),
      express.json()
    ];

    const handleBackChannelLogout = async (req: RequestWithUserSession, res: express.Response) => {
      const provider = req.params.provider;
      const logoutToken = req.body && typeof req.body.logout_token === 'string'
        ? req.body.logout_token
        : undefined;

      if (!logoutToken) {
        return res.status(400).send('Missing logout_token');
      }

      if (!(await ensureStrategy(provider))) {
        return res.status(400).send(`Unknown provider: ${provider}`);
      }

      const strategy = passport._strategy(provider);
      const client = strategy && strategy._client;

      if (!client) {
        return res.status(500).send('OIDC client not initialized');
      }

      try {
        const claims = await validateBackChannelLogoutToken(client, logoutToken);
        const matchingSessionIds = findSessionsForBackChannelLogout(provider, claims.iss, claims.sid, claims.sub);
        const sessionStore = (req as any).sessionStore;

        if (!sessionStore || typeof sessionStore.destroy !== 'function') {
          return res.status(500).send('Session store does not support session destruction');
        }

        let destroyedSessions = 0;

        for (const sessionId of matchingSessionIds) {
          await destroySessionById(sessionStore, sessionId);
          clearSessionFromBackChannelIndex(sessionId);
          destroyedSessions += 1;
        }

        return res.status(200).send('OK');
      } catch (error) {
        console.warn('[backchannel-logout] request rejected');
        return res.status(400).send('Invalid logout_token');
      }
    };

    app.post('/backchannel-logout/:provider', ...backChannelLogoutRequestParsers, handleBackChannelLogout);
    app.post('/backchannel_logout/:provider', ...backChannelLogoutRequestParsers, handleBackChannelLogout);

    // invalid routes

    // catch 404 and forward to error handler
    app.use((req, res, next) => next(createError(404)));

    // error handler
    app.use((err, req, res, next) => {
      // set locals, only providing error in development
      res.locals.message = err.message;
      res.locals.error = req.app.get('env') === 'development' ? err : {};

      // render the error page
      res.status(err.status || 500);
      res.render('error', {
        err: err.message
      });
    });

    this.listener = await app.listen(port, () => console.log(`Server listening on port: ${resolvedPort}`));
  }
}

const registeredStrategies = new Set<string>();

async function setupStrategies() {
  const params = { scope: ['openid'] };

  for (const cli of oidc_clients) {
    try {
      await registerStrategy(cli, params);
    } catch (error) {
      console.log(`OPError: ${cli.ap} OIDC client not discovered successfully [Hint: OIDC client offline?].`);
    }
  }
}

async function ensureStrategy(provider: string) {
  if (registeredStrategies.has(provider)) {
    return true;
  }

  const client = oidc_clients.find((item) => item.name === provider);
  if (!client) {
    return false;
  }

  try {
    await registerStrategy(client, { scope: ['openid'] });
    return true;
  } catch (error) {
    console.log(`OPError: ${client.ap} OIDC client not discovered successfully [Hint: OIDC client offline?].`);
    return false;
  }
}

async function registerStrategy(cli, params) {
  const discoverUrl = buildWellKnownUrl(cli.ap);
  console.log(`[oidc] discover start: ${cli.name} -> ${discoverUrl}`);
  try {
    const issuer = await Issuer.discover(discoverUrl);
    console.log(`[oidc] issuer token auth methods: ${cli.name}`, issuer.token_endpoint_auth_methods_supported);
    console.log(`[oidc] register client config: ${cli.name}`, {
      client_id: cli.config?.client_id,
      redirect_uris: cli.config?.redirect_uris,
      token_endpoint_auth_method: cli.config?.token_endpoint_auth_method
    });
    const client = new issuer.Client(cli.config);
    passport.use(
      cli.name,
      new OpenIDConnectStrategy({ client, params, passReqToCallback: true, extraAuthorizationParams: authExtraParameters }, (req, tokenSet, userinfo, done) => {
        req.session.tokenSet = tokenSet;
        req.session.userinfo = userinfo;

        return done(null, tokenSet.claims());
      })
    );
    registeredStrategies.add(cli.name);
    console.log(`[oidc] discover success: ${cli.name}`);
  } catch (error) {
    logDiscoveryError(cli.name, discoverUrl, error);
    throw error;
  }
}

function logDiscoveryError(clientName: string, url: string, error: any) {
  const base = `[oidc] discover failed: ${clientName} -> ${url}`;
  if (error && typeof error === 'object') {
    const message = error.message ? ` message="${error.message}"` : '';
    const name = error.name ? ` name="${error.name}"` : '';
    console.error(`${base}${name}${message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    if (error.cause) {
      console.error(`[oidc] discover cause:`, error.cause);
    }
    if (error.response) {
      console.error(`[oidc] discover response:`, {
        status: error.response.status,
        headers: error.response.headers,
        body: error.response.body
      });
    }
    return;
  }
  console.error(`${base} error=${String(error)}`);
}

function buildWellKnownUrl(issuerUrl: string) {
  const [base, query] = issuerUrl.split('?', 2);
  const trimmedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const wellKnownPath = trimmedBase.endsWith('/oauth2') || trimmedBase.endsWith('/oxauth') 
    ? `${trimmedBase}/.well-known/openid-configuration`
    : `${trimmedBase}/oauth2/.well-known/openid-configuration`;

  if (!query) {
    return wellKnownPath;
  }

  return `${wellKnownPath}?${query}`;
}

function getLocale(req: RequestWithUserSession) {
  const userinfo = req.session && req.session.userinfo
  const reqParams = req.session && req.session.reqParams
  const locale = (userinfo && userinfo.locale ? userinfo.locale.substring(0, 2) : (reqParams && reqParams.ui_locales ? reqParams.ui_locales.substring(0, 2) : 'en'))

  return locale === 'fr' ? 'fr' : 'en'
}

new ServerExpress().start();
