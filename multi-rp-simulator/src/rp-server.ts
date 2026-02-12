import express from 'express';
import createError from 'http-errors';
import { Issuer } from 'openid-client';
import expressSession from 'express-session';
import passport from 'passport';
import { oidc_clients, sessionSecret, ui_config } from '../config';
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

  // Prefer env var for local/dev/prod deployments
  const fromEnv = process.env.PUBLIC_BASE_URL + "/rpsim/loginMigration";

  console.log("getLoginMigrationLink:" + appendLang(fromEnv));
  return appendLang(fromEnv);
}

function getSignInPageLink(lang?: string): string | undefined {
  const appendLang = (base: string): string => {
    if (!lang) return `${base}/en`;
    const trimmed = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${trimmed}/${lang}`;
  };

  // Prefer env var for local/dev/prod deployments
  const fromEnv = process.env.PUBLIC_BASE_URL + "/rpsim/signinpage";

  console.log("getSignInPageLink:" + appendLang(fromEnv));
  return appendLang(fromEnv);
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
      res.redirect('/rpsim/FCACHomePage/en');
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
      console.log("========= rpsim endpoint ====== ")
      console.log(req.params.page)

      switch (req.params.page) {
        case 'login':
          data = {
            ...data,
            signInPageLink: getSignInPageLink(req.params.lang),
            loginMigrationLoginLink: getLoginMigrationLink(req.params.lang),
            oidc_clients: oidc_clients.map((item) => { return { name: item.name, description: item.description, sic: item.sic } })
          }
          res.render('login', data)
          break;
        case 'loginMigration':
          data = {
            ...data,
            signInPageLink: getSignInPageLink(req.params.lang),
            loginMigrationLoginLink: getLoginMigrationLink(req.params.lang),
            oidc_clients: oidc_clients.map((item) => { return { name: item.name, description: item.description, sic: item.sic } })
          }
          res.render('loginMigration', data)
          break;
        case 'FCACHomePage':
          data = {
            ...data,
            signInPageLink: getSignInPageLink(req.params.lang),
            loginMigrationLoginLink: getLoginMigrationLink(req.params.lang),
            oidc_clients: oidc_clients.map((item) => { return { name: item.name, description: item.description, sic: item.sic } })
          }
          res.render('FCACHomePage', data)
          break;
        case 'signinpage':
          data = {
            ...data,
            signInPageLink: getSignInPageLink(req.params.lang),
            loginMigrationLoginLink: getLoginMigrationLink(req.params.lang),
            oidc_clients: oidc_clients.map((item) => { return { name: item.name, description: item.description, sic: item.sic } })
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
        default:
          data = {
            ...data,
            signInPageLink: getSignInPageLink(req.params.lang),
            loginMigrationLoginLink: getLoginMigrationLink(req.params.lang),
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

      const toSkip = clientSelected
        ? clientSelected.skip 
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
      // save teh current provider in req.session for the logout
      req.session.provider = provider

      console.log(" ========= /success/:provider")
      console.log(provider)
      
      
      const rawLocale = getLocale(req);

      const currentLocale = rawLocale && rawLocale !== "undefined" ? rawLocale : "en";

      const baseUrl = computeBaseUrl(req, resolvedPort);
      this.publicBaseUrl = baseUrl;

      const redirectUri = `${baseUrl}/rpsim/response/${currentLocale}`;
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
      const provider = req.session.provider
      let params = {}

      if (!provider) res.status(400).send('No Session')
      else {
        const strategy = passport._strategy(provider)
        const client = strategy._client
        const locale = req.params.locale
        const hint = req.params.hint
        params = {
          client_id: client.client_id
        }

        if (hint && hint == 'true') {
          params = {
            ...params,
            id_token_hint: req.session.tokenSet.id_token
          }
        }

        if (locale && req.session) {
          if (!req.session.userinfo) req.session.userinfo = {}
          req.session.userinfo.locale = locale
        }

        res.redirect(client.endSessionUrl(params));
      }
    });

    app.get('/logout/callback', (req: RequestWithUserSession, res) => {
      const locale = getLocale(req);

      (req as any).logout();
      req.session.destroy((err) => {
        if (err) res.status(500).render('error', { err: err });
        res.redirect(`/rpsim/login/${locale}`);
      });
    });

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
      new OpenIDConnectStrategy({ client, params, passReqToCallback: true }, (req, tokenSet, userinfo, done) => {
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
  const locale = (userinfo && userinfo.locale ? userinfo.locale.substring(0, 2) : (reqParams && reqParams.ui_locales ? reqParams.ui_locales.substring(0, 2) : 'undefined'))

  return locale
}

new ServerExpress().start();
