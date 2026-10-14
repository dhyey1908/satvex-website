# SATVEX

Premium beauty/fashion accessories ecommerce site. React frontend, Express-on-Lambda backend, DynamoDB, S3 + CloudFront — a minimum-cost serverless stack.

## Specification

This project was built from a modular spec pack, read in this order:

1. [01-project-overview.md](01-project-overview.md)
2. [02-ui-ux-design.md](02-ui-ux-design.md)
3. [03-frontend.md](03-frontend.md)
4. [04-product-system.md](04-product-system.md)
5. [05-cart-wishlist.md](05-cart-wishlist.md)
6. [06-authentication.md](06-authentication.md)
7. [07-checkout-orders.md](07-checkout-orders.md)
8. [08-admin-panel.md](08-admin-panel.md)
9. [09-backend-api.md](09-backend-api.md)
10. [10-dynamodb.md](10-dynamodb.md)
11. [11-s3-media.md](11-s3-media.md)
12. [12-aws-architecture.md](12-aws-architecture.md)
13. [13-security.md](13-security.md)
14. [14-seo-performance.md](14-seo-performance.md)
15. [15-seed-data.md](15-seed-data.md)
16. [16-deployment.md](16-deployment.md)
17. [17-implementation-rules.md](17-implementation-rules.md)

## Prerequisites

- Node.js 20+ and npm
- An AWS account with credentials configured (`aws configure`) — needed for deployment, not for local dev
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) — for deploying the backend
- Docker — only needed if you want to use `sam local invoke`/`sam local start-api`

## Project Structure

```
backend/    Express API (runs locally with node, deploys to Lambda)
frontend/   React app (Vite)
```

## Local Development

### Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in JWT_SECRET at minimum for local dev
npm run dev             # http://localhost:4000
```

Local development talks to **real AWS DynamoDB/S3/SES** (there is no local DynamoDB emulator in this setup) — so most endpoints will return errors until you've deployed the infrastructure (see below) and pointed `.env` at the real table/bucket names and your AWS credentials are available (e.g. via `aws configure` or `AWS_PROFILE`).

### Frontend

```bash
cd frontend
npm install
cp .env.example .env   # VITE_API_URL should point at your backend
npm run dev             # http://localhost:5173
```

## Environment Configuration

- `backend/.env.example` — API URL, DynamoDB table names, S3 bucket, JWT secret, SES sender email. Copy to `.env` and fill in.
- `frontend/.env.example` — `VITE_API_URL`. Copy to `.env` and fill in.

Never commit real `.env` files — only `.env.example`.

## AWS Deployment

The backend infrastructure (7 DynamoDB tables, Lambda, HTTP API, media S3 bucket + CloudFront, frontend S3 bucket + CloudFront) is defined in [backend/template.yaml](backend/template.yaml) using AWS SAM.

**One-time setup**: configure an AWS CLI profile with credentials that can create the required resources (`aws configure --profile satvex`), and verify your SES sender email/domain in the SES console (password-reset emails will fail to send otherwise — SES starts in sandbox mode, so it can only send to verified recipients until you request production access).

### 1. Deploy the backend

```bash
cd backend
npm install
cp samconfig.toml.example samconfig.toml   # fill in profile, JwtSecret, SesSenderEmail, FrontendOrigin
npm run deploy          # = sam build && sam deploy — the [default] section of samconfig.toml = PRODUCTION (stack satvex-backend-prod, Stage=prod)
```

> **Production is the only stack** (`default` in `samconfig.toml`, `Stage=prod`). Every table/Lambda/bucket is named `…_prod` / `…-prod`. The original `dev` stack was deleted on 2026-10-14. Local `npm run dev` needs `TABLE_*` in `backend/.env` to point at a throw-away sandbox stack — never at prod.
- `FrontendOrigin` inside `samconfig.toml` is **comma-separated** — include every origin that will call this API (local dev, the CloudFront domain, and later your custom domain). The first deploy won't know the CloudFront domain yet; deploy once with just `http://localhost:5173`, read the `FrontendDistributionDomain` output, add `https://<that-domain>` to `FrontendOrigin` in `samconfig.toml`, and deploy again.
- Note the stack outputs (`ApiUrl`, `FrontendBucketName`, `FrontendDistributionDomain`, `MediaBucketName`, `MediaDistributionDomain`, table names) — you'll need them below.

### 2. Seed data / admin account

Point `backend/.env`'s table names, `S3_MEDIA_BUCKET`, `CLOUDFRONT_MEDIA_URL`, `JWT_SECRET`, and `SES_SENDER_EMAIL` at the real values from the stack outputs (same values used in `samconfig.toml` above), plus set `ADMIN_BOOTSTRAP_EMAIL`/`ADMIN_BOOTSTRAP_PASSWORD`, then:

```bash
cd backend
npm run seed          # creates the Butterfly product with 8 colors + 3 selling options (safe to re-run)
npm run create-admin  # creates the first admin account
```

### 3. Deploy the frontend

```bash
cd frontend
npm install
cp deploy.config.example.json deploy.config.json   # fill in apiUrl, siteUrl, s3Bucket, cloudfrontDistributionId, awsProfile
npm run deploy    # builds against apiUrl, syncs dist/ to S3, invalidates CloudFront — all in one command
```

`deploy.config.json` is the **production** site (gitignored) (holds account-specific values, same pattern as `samconfig.toml`). The CloudFront distribution ID (not the domain) is needed there — find it with:
```bash
aws cloudfront list-distributions --profile satvex \
  --query "DistributionList.Items[?DomainName=='<FrontendDistributionDomain-output>'].Id" --output text
```

### Redeploying after code changes

Backend code or `template.yaml` changed → `npm run deploy` in `backend/`. Frontend code changed → `npm run deploy` in `frontend/`. Both are safe to re-run — SAM only updates what changed, and the frontend script's S3 sync `--delete` flag keeps the bucket in sync with your latest build.

### Custom Domain Setup

1. Request/validate an ACM certificate (in `us-east-1`, required for CloudFront) for your domain.
2. Add the certificate ARN and your domain as CloudFront alternate domain names (`Aliases` + `ViewerCertificate`) on the `FrontendDistribution` (and `MediaDistribution` if you want a media subdomain) in `template.yaml`, then redeploy.
3. Point your domain's DNS (Route 53 or your registrar) at the CloudFront distribution via a CNAME/ALIAS record.

## Automated Deployment (CI/CD)

Pushing to `main` automatically deploys both backend and frontend via [.github/workflows/deploy.yml](.github/workflows/deploy.yml) — no AWS access keys are stored in GitHub; it authenticates via OpenID Connect (OIDC), where AWS trusts short-lived tokens issued by GitHub Actions for this specific repo.

### One-time setup

1. **Bootstrap the deploy role** — deploy [infra/github-oidc.yaml](infra/github-oidc.yaml) once, manually, from your machine:
   ```bash
   aws cloudformation deploy \
     --template-file infra/github-oidc.yaml \
     --stack-name satvex-github-oidc \
     --capabilities CAPABILITY_NAMED_IAM \
     --parameter-overrides GitHubOrg=dhyey1908 GitHubRepo=satvex-website AllowedBranch=main
   ```
   Then grab the role ARN:
   ```bash
   aws cloudformation describe-stacks --stack-name satvex-github-oidc \
     --query "Stacks[0].Outputs[0].OutputValue" --output text
   ```

2. **Add GitHub repo secrets** (Settings → Secrets and variables → Actions):

   | Secret | Value |
   |---|---|
   | `AWS_DEPLOY_ROLE_ARN` | ARN from step 1 |
   | `FRONTEND_ORIGIN` | Your production frontend URL (e.g. `https://satvex.com`) |
   | `JWT_SECRET` | A long random string |
   | `SES_SENDER_EMAIL` | Your verified SES sender address |
   | `SITE_URL` | Same as `FRONTEND_ORIGIN`, used for sitemap generation |

3. Push to `main` (or run the workflow manually from the Actions tab). The workflow deploys the backend stack first, reads its outputs (API URL, frontend bucket, CloudFront domain), then builds the frontend against that API URL and syncs it to S3 + invalidates CloudFront.

Everything in `infra/github-oidc.yaml`'s IAM policy is scoped to resources this project creates (`satvex-*` role/bucket names) — it cannot touch unrelated resources in your AWS account.

## Troubleshooting

- **401 on every request from the frontend**: check `VITE_API_URL` and that the backend's `FRONTEND_ORIGIN`/CORS config matches the frontend's actual origin exactly (including protocol).
- **500 errors from any DynamoDB-backed endpoint**: the table doesn't exist yet, or `.env`/Lambda env vars don't match the real table names — re-check the stack outputs.
- **Password reset emails never arrive**: your SES sender identity isn't verified, or (in sandbox mode) the recipient isn't a verified address.
- **Product images don't upload from the admin panel**: the media S3 bucket's CORS config only allows the exact `FrontendOrigin` configured at deploy time — update the parameter and redeploy if your frontend origin changed.
- **`sam local invoke` hangs / times out**: this is a known Docker-Desktop-on-Windows quirk with SAM's local Lambda emulator, unrelated to the app code — deploy and test against the real stack instead, or use `sam local start-api` if you need to debug locally.
- **GitHub Actions fails with "not authorized to perform sts:AssumeRoleWithWebIdentity"**: the OIDC bootstrap stack (`infra/github-oidc.yaml`) hasn't been deployed yet, `AWS_DEPLOY_ROLE_ARN` is wrong, or the workflow is running on a branch other than the one set in `AllowedBranch`.
- **Frontend deploy step can't find the CloudFront distribution**: the backend stack must deploy successfully first — check the `deploy-backend` job's logs/outputs before debugging `deploy-frontend`.
