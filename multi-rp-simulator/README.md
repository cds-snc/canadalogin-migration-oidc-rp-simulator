# OIDC-RP-Simulator

Source code and configuration for the Sign in Canada OIDC Relying Party Simulator.

Copy `.env.example` to `.env` and fill in required values.

Local (non-Docker):
- `npm i`
- `npm run build`
- `npm run start:prod`

Local (Docker):
- `docker build -t rp-simulator .`
- `docker run --rm -p 8080:8080 --env-file .env rp-simulator`

`npm test` to run e2e tests.

See the complementary project at https://github.com/sign-in-canada/oidc-provider

Back-channel logout:
- Register a provider-specific back-channel logout URI with your OP, for example:
  - `http://localhost:8080/backchannel-logout/client1`
- The RP accepts `POST` requests to:
  - `/backchannel-logout/:provider`
  - `/backchannel_logout/:provider` (alias)
- Send `logout_token` in the request body (`application/x-www-form-urlencoded` or JSON).
