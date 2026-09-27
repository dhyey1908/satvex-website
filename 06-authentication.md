# SATVEX — Authentication and Authorization

## Public Access
Users can browse without authentication:
- Home
- Shop
- Product detail
- About
- Contact

## Authentication Required
Login is mandatory for:
- Wishlist
- Add to Cart
- Checkout
- Order placement
- Order history
- Account/profile

## Authentication
Custom-built authentication. No Firebase/Cognito.

- Passwords hashed with bcrypt before storage.
- Sessions handled via signed JWTs (access token; refresh token if needed).
- Users stored in the `satvex_users` DynamoDB table (never store plaintext passwords).

Support:
- Signup
- Login
- Logout
- Forgot password (email-based reset via AWS SES — see below)
- Persistent session
- Current user

## Forgot Password Flow
1. User requests reset with their email.
2. Backend generates a short-lived, single-use reset token, stores its hash + expiry against the user record.
3. AWS SES sends an email containing a reset link/code (this is the one non-core service added specifically to support this flow).
4. User submits new password with the token; backend verifies token + expiry, hashes new password, invalidates the token.

Rate-limit the request-reset and reset-password endpoints.

## Authorization
There are two effective access levels:
- Customer
- Admin

Do not build a complex role-management system.

## Admin
Admin routes and APIs require admin authorization.

Normal users must never:
- View admin data
- Create products
- Edit products
- Delete products
- Change orders
- Access customer management

## Route Protection
Implement:
- ProtectedRoute for customer features
- AdminRoute for admin features

## API Protection
Do not rely only on frontend route protection.
Backend must verify identity and authorization.

## Security Rules
- No secrets in frontend
- Validate tokens server-side
- Validate request payloads
- Prevent user-to-user data access
- Use secure CORS configuration
