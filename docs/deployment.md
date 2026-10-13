# Deployment

The central CanadaLogin release pipeline v1.2.4 builds
`multi-rp-simulator/Dockerfile` once in dev and deploys the image by digest to
dev, test and staging. Existing release manifests and deployment approvals remain
unchanged.

Before merging, apply the migration simulator ECR immutability change in
`gc-signin-terraform` and configure the GitHub environment variables required by
the central pipeline. Use the existing `github_action_push_ecr_ecs-migration-rp-sim`
role and `gc-signin-migration-rp-sim` repository in each account.

Dev follows main. Release-please updates `.deployed_versions/test.json` when a
release is made. Promote staging by changing `.deployed_versions/staging.json`
to a released version through the existing reviewed PR process.

Run **Release pipeline** on main for manual deployments. Select an environment
(or `all`). Select **rebuild** if the desired SHA image is missing.
**force-redeploy** targets every enabled environment, regardless of the selected
environment.

## Legacy image cutover

The old workflow published SHA and `latest` image tags, but not release tags.
For an existing SHA image, pipeline v1.2.4 requires its corresponding release
tag to already exist and reference the same digest; **rebuild** does not repair
a missing release tag in that case.

Before rebuilding an older release, backfill its `v<version>` ECR tag in dev
onto the existing SHA image manifest, preserving the digest. In particular,
check the currently pinned test `v1.3.5` and staging `v1.3.2` images. If a release
tag already exists with a different digest, stop and investigate instead of
overwriting or deleting immutable images. When no SHA image exists, **rebuild**
can publish both tags normally.

Replication does not backfill existing images. Confirm the desired SHA tag and
digest are present in the target account before deployment; backfill missing
destination tags from the same image manifest when necessary. The workflow
migration does not modify live ECR images.