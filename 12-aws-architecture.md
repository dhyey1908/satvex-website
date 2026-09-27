# SATVEX — AWS Minimum-Cost Architecture

## Target Architecture

Customer
  ↓
CloudFront
  ↓
S3 Static Frontend

Frontend
  ↓
API Gateway
  ↓
AWS Lambda (Node.js + Express)
  ↓
DynamoDB

Media:
Frontend/Admin
  ↓
Authorized upload
  ↓
S3
  ↓
CloudFront

## Services
Required/core:
- S3
- API Gateway
- Lambda
- DynamoDB

Recommended:
- CloudFront
- SES (transactional email — password reset only)

Authentication:
- Custom-built (bcrypt + JWT), no managed auth provider. Users stored in DynamoDB.

## Cost Philosophy
Prefer pay-per-use/serverless.

Avoid:
- EC2
- ECS
- RDS
- Redis
- ElastiCache
- OpenSearch
- unnecessary queues
- unnecessary services

## Lambda
Use Node.js runtime.
Wrap Express using a Lambda-compatible adapter.

Keep functions simple.
One Lambda/API deployment is acceptable for the first version if cleanly structured.

Do not create dozens of tiny Lambda functions without a reason.

## DynamoDB
Prefer PAY_PER_REQUEST for early-stage unpredictable traffic.

Avoid unnecessary indexes.

## S3
Use S3 for:
- frontend assets
- product media
- branding

## CloudFront
Use for:
- frontend delivery
- product image/media caching
- HTTPS/custom domain integration

## API Gateway
Expose REST APIs to frontend.

## Domain
Keep deployment architecture compatible with a custom domain later.

## Infrastructure as Code
Use AWS SAM or CDK.
Choose whichever produces the simplest maintainable deployment.

## Important
Do not over-engineer.
The goal is a real ecommerce application with the lowest practical AWS complexity and cost.
