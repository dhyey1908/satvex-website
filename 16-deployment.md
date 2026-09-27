# SATVEX — Deployment

## Environments
Support at least:
- local/development
- production

## Frontend
Build React application.
Deploy static output to S3.
Serve through CloudFront.

## Backend
Deploy Node.js + Express application to Lambda.
Expose through API Gateway.

## Database
Create/configure DynamoDB resources.

## Media
Create S3 media storage.

## Authentication
Configure selected authentication provider.

## Infrastructure
Prefer AWS SAM or CDK.

## Environment Variables
Provide .env.example for local development.

Example categories:
- API URL
- AWS region
- S3 bucket
- CloudFront URL
- JWT secret/config
- SES sender email/region (password reset)

Never commit real secrets.

## Documentation
README must include:
1. prerequisites
2. install commands
3. local development
4. environment configuration
5. database setup
6. seed setup
7. AWS deployment
8. frontend deployment
9. custom domain setup
10. troubleshooting

## Suggested Commands
Document project-specific commands such as:
- npm install
- npm run dev
- npm run build
- npm run test
- npm run deploy

Use the actual package scripts created by the implementation.

## Deployment Principle
Keep deployment simple enough for a small team/developer to operate.
