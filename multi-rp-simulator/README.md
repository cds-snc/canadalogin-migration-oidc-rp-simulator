# OIDC-RP-Simulator

Source code and configuration for the Sign in Canada OIDC Relying Party Simulator.

Copy `.env.example` to `.env` and fill in required values.

To append debug values to every authorize request, set `AUTH_EXTRA_PARAMETERS` in `.env` as a query-string fragment, for example `fakeparam1=adasdasd&fakeparam2=adasdafdfshfd`.

Demo portal branding lives in `src/locales/portalBranding.ts` so demo text changes do not require environment or Terraform updates.

Local (non-Docker):
- `npm i`
- `npm run build`
- `npm run start:prod`

Local (Docker):
- `docker build -t rp-simulator .`
- `docker run --rm -p 8080:8080 --env-file .env rp-simulator`

`npm test` to run e2e tests.

See the complementary project at https://github.com/sign-in-canada/oidc-provider

By default, sign-in test flow pages use these clients:
- `/rpsim/flow-all/*` uses `client1`
- `/rpsim/flow-no-interac/*` uses `client2`

Optional page-level overrides are available in `.env` when you need a dedicated UX/testing client:
- `FLOW_ALL_CLIENT`
- `FLOW_NO_INTERAC_CLIENT`
- `LOGIN_MIGRATION_REGISTER_CLIENT`

Client allocation (provider settings come from `.env` locally or the deployment environment):

| Client | Purpose | Default page assignment |
| --- | --- | --- |
| `client1` | GC SIC Migration - 1 | `/rpsim/flow-all/*` |
| `client2` | GC SIC Migration | `/rpsim/flow-no-interac/*` |
| `client3` | GC SIC Migration with skip migration enabled | Login migration registration |
| `client4` | SIC without IBM Verify | General simulator login |
| `client5` | UX / passkey testing | General simulator login |
| `client6` | Direct GCCF connection | General simulator login |
| `client7` | GCCF RP simulator in IBM test - 1 | General simulator login |
| `client8` | GCCF RP simulator in IBM test - 2 | General simulator login |

Only clients with a non-empty `CLIENTn_URL` are loaded. The new `client6`–`client8` entries stay inactive until configured and appear on `/rpsim/login/en` and `/rpsim/login/fr` once enabled.

To configure each GCCF client, copy its block from `.env.example` into your local `.env` or deployment environment and set its provider URL, registered client ID, secret, and registered callback/logout URLs. Set `CLIENTn_TOKEN_ENDPOINT_AUTH_METHOD` to the method used by that registration; the example uses the app's default, `client_secret_post`. Give the two IBM test registrations distinct descriptions.

`CLIENTn_URL` currently accepts a provider base URL: discovery appends `/oauth2/.well-known/openid-configuration`, or just `/.well-known/openid-configuration` when the base already ends in `/oauth2` or `/oxauth`. Do not put a complete discovery-document URL in this field.

Each configured client should use a callback URI that matches its provider route, for example:
- `client1 -> /auth/callback/client1`
- `client2 -> /auth/callback/client2`
- `client5 -> /auth/callback/client5`
- `client6 -> /auth/callback/client6`
- `client7 -> /auth/callback/client7`
- `client8 -> /auth/callback/client8`

For deployed clients, replace `http://localhost:8080` in the example callback/logout URLs with the simulator's public base URL. The post-logout callback is shared at `/logout/callback`. If the deployment explicitly sets `SECTOR_REDIRECT_URIS`, include the new callback URLs there as well; otherwise the sector identifier endpoint derives them from the configured clients.

Optional post-login redirect:
- Set `CLIENT5_CUSTOM_REDIRECT_URL` when you want `client5` to redirect the browser to an external URL immediately after successful sign-in.

Optional post-logout redirect:
- Set `CLIENT5_CUSTOM_LOGOUT_REDIRECT_URL` when you want `client5` to redirect the browser to an external URL after logout completes and the local session is destroyed.

Optional auto-logout demo mode:
- Set `CLIENT5_AUTO_LOGOUT_AFTER_LOGIN=true` when you want `client5` to immediately enter the logout flow after successful sign-in.
- When combined with `CLIENT5_CUSTOM_LOGOUT_REDIRECT_URL`, the user signs in, is logged out, and is then sent back to the configured starting page.

Back-channel logout:
- Register a provider-specific back-channel logout URI with your OP, for example:
  - `http://localhost:8080/backchannel-logout/client1`
- The RP accepts `POST` requests to:
  - `/backchannel-logout/:provider`
  - `/backchannel_logout/:provider` (alias)
- Send `logout_token` in the request body (`application/x-www-form-urlencoded` or JSON).
