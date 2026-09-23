# OIDC-RP-Simulator

Source code and configuration for the Sign in Canada OIDC Relying Party Simulator.

Copy `.env.example` to `.env` and fill in required values.

To append debug values to every authorize request, set `AUTH_EXTRA_PARAMETERS` in `.env` as a query-string fragment, for example `fakeparam1=adasdasd&fakeparam2=adasdafdfshfd`.

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

Only clients with a non-empty `CLIENTn_URL` are loaded, so placeholder entries like `client5` and `client6` stay inactive until configured.

Each configured client should use a callback URI that matches its provider route, for example:
- `client1 -> /auth/callback/client1`
- `client2 -> /auth/callback/client2`
- `client5 -> /auth/callback/client5`
- `client6 -> /auth/callback/client6`

Private key JWT client authentication:
- `client6` is reserved in `.env.example` for private JWT testing.
- Set `CLIENT6_TOKEN_ENDPOINT_AUTH_METHOD=private_key_jwt`.
- Set `CLIENT6_TOKEN_ENDPOINT_AUTH_SIGNING_ALG=RS256` unless the provider requires a different supported algorithm.
- Provide the signing private JWKS with either `CLIENT6_PRIVATE_JWKS` as inline JSON or `CLIENT6_PRIVATE_JWKS_PATH` as a file path. Relative paths resolve from the `multi-rp-simulator` directory.
- The default private JWKS path is `.local/client6/private_jwks.json`; `.local/` is ignored by git.
- Generate a local signing key with `npm run generate:private-jwt-client-keys -- --client=client6`.
- The generator defaults to RS256 and supports RSA signing algorithms (RS256/384/512 and PS256/384/512). It refuses to overwrite either existing JWKS file. For a future key rotation, generate a separate pair using `--out=.local/client6-next` and coordinate the new secret and signing kid before deployment.
- If the private JWKS contains more than one signing key, set `CLIENT6_PRIVATE_JWT_SIGNING_KID` to select the key used for the client assertion.
- The selected key must match the configured signing algorithm. Invalid or ambiguous selections fail at startup; the client never falls back to another signing key. All public keys remain available at the JWKS endpoint.
- Only one configured client may use `private_key_jwt`; the shared public JWKS endpoint is `/.well-known/jwks.json`.
- Configure the OP with the externally reachable RP JWKS URI, for example `https://<rp-sim-domain>/.well-known/jwks.json`.

Run `npm run test:private-jwt` for offline signing, configuration, and key-generation regression tests. These tests use temporary keys and do not load `.env` or contact an identity provider.

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
