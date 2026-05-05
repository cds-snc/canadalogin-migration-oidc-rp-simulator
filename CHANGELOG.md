# Changelog

## [1.3.3](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/compare/v1.3.2...v1.3.3) (2026-05-05)


### Bug Fixes

* **feature:** add skip migraiotn to auth toggles for testing purposes ([#65](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/issues/65)) ([adccb88](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/commit/adccb88a5f1976243bf53bf0bc4f507ecb3f1fe6))

## [1.3.2](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/compare/v1.3.1...v1.3.2) (2026-04-15)


### Bug Fixes

* **lang:** fixed missed french translations ([#62](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/issues/62)) ([75f9ffd](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/commit/75f9ffdbbcd99c70a9fd756b35065d69ad1e29ad))
* **lang:** fixed misspelt french word ([#61](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/issues/61)) ([0463d82](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/commit/0463d8200c1bcf9f7d186579f900b8ea5029a80e))

## [1.3.1](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/compare/v1.3.0...v1.3.1) (2026-03-25)


### Bug Fixes

* **fallbackCode:** added fallback urls formanage profile link and updated .env.example for this value ([#59](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/issues/59)) ([235d2b8](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/commit/235d2b88ae4bae8e6fb102b4d4825d8ef4ef293c))

## [1.3.0](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/compare/v1.2.5...v1.3.0) (2026-03-24)


### Features

* **dashboard:** added different view for dashboard. ([#57](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/issues/57)) ([7e07ddb](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/commit/7e07ddb1e505b06058aa46a243546eb05251b00f))


### Bug Fixes

* **feature:** add custom redirect post authentication to support UX t… ([#54](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/issues/54)) ([c26cb6b](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/commit/c26cb6b01232130466bd02aa41ce3b47986272cc))
* **language:** fixed language from ibm and response page to display claims ([#56](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/issues/56)) ([5f4fa25](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/commit/5f4fa2522f6a88da9acc9ff9c8de89d0307913fa))

## [1.2.5](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/compare/v1.2.4...v1.2.5) (2026-03-20)


### Bug Fixes

* **feature:** added new client for passkey testing with UX team, also cleaned up how clients are added and managed since was sorta hardcoded ([#52](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/issues/52)) ([d268682](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/commit/d268682d86da1f3dff2e148bb5768e798d10b0a8))

## [1.2.4](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/compare/v1.2.3...v1.2.4) (2026-03-19)


### Bug Fixes

* **dashboard:** make dashboard page match figma better ([#50](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/issues/50)) ([7993ec2](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/commit/7993ec258288b4770c07a7fee7f012bb955fc0d4))
* **extraParam:** support for extra params to be sent for RPs that have them for their initial auth request ([#49](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/issues/49)) ([31065ea](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/commit/31065ea2d1b04d061472e9b263984ac3595ab759))

## [1.2.3](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/compare/v1.2.2...v1.2.3) (2026-03-12)


### Bug Fixes

* **flows:** fixed which client was matched to which configuration ([#47](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/issues/47)) ([cbf94b1](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/commit/cbf94b1b9b69750f516e1e7df40bc4e644474501))

## [1.2.2](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/compare/v1.2.1...v1.2.2) (2026-03-11)


### Bug Fixes

* Feature/support for gckey only flow ([#42](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/issues/42)) ([d63ece4](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/commit/d63ece4420ea5a2bee8f9a8ba5c887be7a80933e))
* **wcag:** added some alerting for the cred selector page ([#44](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/issues/44)) ([38650c1](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/commit/38650c1b7d560c6eac5b6397d34cac2a402f4852))
* **wcag:** set alert funcitonaity properly ([#46](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/issues/46)) ([7df7d00](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/commit/7df7d000d012c57e9e51683a866aa3d7614c2dff))

## [1.2.1](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/compare/v1.2.0...v1.2.1) (2026-03-06)


### Bug Fixes

* **wcag:** added some alerting for the cred selector page ([#40](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/issues/40)) ([fb461d4](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/commit/fb461d424782628431f034ede17b8b3fb8881df9))

## [1.2.0](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/compare/v1.1.5...v1.2.0) (2026-02-26)


### Features

* deploy RP Sim to staging ([e915a9d](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/commit/e915a9d5cb2172703cb3e86e36e078db1e987bfa))
* Deploy RP Sim to staging ([69fbbbb](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/commit/69fbbbb4e4d8af55f61d42b5701b05c588e902d0))
* Merge pull request [#36](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/issues/36) from cds-snc/copilot/update-release-pipeline-staging ([69fbbbb](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/commit/69fbbbb4e4d8af55f61d42b5701b05c588e902d0))

## [1.1.5](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/compare/v1.1.4...v1.1.5) (2026-02-25)


### Bug Fixes

* **deps:** fix issue 123, and a few other ([#33](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/issues/33)) ([cb4e8e7](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/commit/cb4e8e73ce53dc5b957c8aa49474fc675fd0f668))

## [1.1.4](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/compare/v1.1.3...v1.1.4) (2026-02-24)


### Bug Fixes

* **deps:** Update README with commit message guidelines ([#31](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/issues/31)) ([4677c67](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/commit/4677c674365155d3bd1516dd33c6d6646918ace2))

## [1.1.3](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/compare/v1.1.2...v1.1.3) (2026-02-18)


### Bug Fixes

* **deps:** properly support logout ([#26](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/issues/26)) ([83ce8c5](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/commit/83ce8c59eedc7d4e47d387b09ed90b2903bb39e9))

## [1.1.2](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/compare/v1.1.1...v1.1.2) (2026-02-16)


### Bug Fixes

* **deps:** added support for multi flows for testing and backchannel logout ([#23](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/issues/23)) ([ba58f43](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/commit/ba58f43665ade0006434801f412cfd4be0de5902))

## [1.1.1](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/compare/v1.1.0...v1.1.1) (2026-02-09)


### Bug Fixes

* Cause release ([97cfdcd](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/commit/97cfdcd188520497e6118ade9235eb68ff8c52c8))
* Cause release ([#15](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/issues/15)) ([e764d6f](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/commit/e764d6f7011c4d9165a158b8b3ec41ffcee62255))

## [1.1.0](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/compare/v1.0.0...v1.1.0) (2026-02-05)


### Features

* enable release please ([58d9ddf](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/commit/58d9ddf5ebc7bf6e731c9e66ea2d2e03a7d8102a))
* enable release please ([3e69d4e](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/commit/3e69d4ed8fc2e1cf6f17085ec03892afa8f8ea8c))


### Bug Fixes

* Add necessary release-please manifests ([d9cfde7](https://github.com/cds-snc/gc-signin-migration-oidc-rp-simulator/commit/d9cfde72ce32c0590322e9536ce5229721b5da8f))
