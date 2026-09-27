# SATVEX — Backend and API

## Stack
- Node.js
- Express.js
- AWS Lambda
- API Gateway

Do NOT use NestJS.

## Structure
backend/
  src/
    app.js
    routes/
    controllers/
    services/
    middleware/
    validators/
    utils/
    config/

## API Domains

### Auth
- POST /auth/register
- POST /auth/login
- POST /auth/logout
- GET /auth/me
- POST /auth/forgot-password (sends reset email via SES)
- POST /auth/reset-password

### Products
- GET /products
- GET /products/:id
- POST /products
- PUT /products/:id
- DELETE /products/:id

### Cart
- GET /cart
- POST /cart
- PUT /cart/:id
- DELETE /cart/:id

### Wishlist
- GET /wishlist
- POST /wishlist
- DELETE /wishlist/:id

### Orders
- POST /orders
- GET /orders
- GET /orders/:id

### Admin
- GET /admin/orders
- PUT /admin/orders/:id/status
- GET /admin/customers
- Product admin endpoints

### Contact
- POST /contact

Add endpoints only when genuinely needed.

## API Principles
- RESTful
- Validate all input
- Centralized error handling
- Consistent response format
- Authentication middleware
- Admin middleware
- No secrets in code
- Environment configuration

## Price Security
The client must not determine final order pricing.
Backend validates:
- product
- selling option
- selected colors
- price
- quantity

## Lambda
Keep the Express application Lambda-compatible.
Avoid unnecessary long-running processes.

## CORS
Configure allowed frontend origins through environment configuration.
Do not use unrestricted production CORS.

## Logging
Use useful structured logs without logging:
- passwords
- auth tokens
- unnecessary personal data
