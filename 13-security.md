# SATVEX — Security Requirements

## Authentication
Custom-built authentication (bcrypt + JWT). Since there is no managed provider handling this, the backend is fully responsible for correct implementation:
- bcrypt with an adequate cost factor for password hashing
- signed JWTs with reasonable expiry, verified on every protected request
- reset tokens hashed at rest and single-use with expiry

Never:
- store plaintext passwords
- expose credentials
- place AWS keys in frontend
- trust client-provided user IDs

## Authorization
Backend verifies:
- authenticated user
- admin access for admin APIs

Every customer-owned resource must be scoped to the authenticated user.

## Input Validation
Validate:
- request body
- query params
- path params
- emails
- phone numbers
- pincode
- product IDs
- combo selection
- quantity

## Product/Order Security
Do not trust frontend:
- price
- total
- product availability
- combo configuration

Backend must re-check data.

## CORS
Allow only configured frontend origins in production.

## Headers
Use secure HTTP headers where compatible.

## Rate Limiting
Add reasonable rate limiting to:
- authentication endpoints (including forgot/reset password)
- contact endpoint
- sensitive admin endpoints
- upload/presigned URL endpoints

## XSS
Sanitize user-generated content where HTML can be submitted.
Avoid rendering unsafe HTML.

## No Sensitive Logs
Never log:
- passwords
- auth tokens
- AWS credentials
- unnecessary customer information

## S3
Do not expose AWS access keys.
Use IAM roles and presigned URLs.

## Admin
Admin UI protection is not enough.
Admin APIs must independently enforce authorization.

## Secrets
Use environment variables/secrets management.
Commit only .env.example.
