# SATVEX — Project Overview

## Brand
- Brand: SATVEX
- Product category: beauty/fashion accessories
- Current flagship product: Butterfly accessory
- Current variants: 8 different colors
- Future-ready for additional products and categories.

## Primary Goal
Build a production-ready, premium, mobile-first full-stack ecommerce website that feels like a real consumer brand rather than a CRUD/demo application.

## Core Customer Features
- Browse website without login
- Home page
- Shop/product listing
- Product detail page
- Color variants
- Single/combo purchasing
- Wishlist
- Cart
- Login/signup
- Checkout
- Order creation
- Order history
- About Us
- Contact Us

## Login Rule
Browsing is public.
Login is mandatory for:
- Add to cart
- Wishlist
- Checkout
- Order placement
- Order history/account

## Admin
Simple admin panel focused on:
- Product CRUD
- Product images
- Color/variant management
- Selling/combo options
- Orders
- Basic customers
- Basic dashboard statistics

Do NOT build stock/inventory management.

## Current Product Model
The same butterfly product can be sold as:
- Single
- Combo of 2
- Combo of 3

The system must be configurable so future combo quantities can be added without code changes.

## Technology Direction
Frontend:
- React
- Modern responsive UI

Backend:
- Node.js
- Express.js
- AWS Lambda

AWS:
- API Gateway
- Lambda
- DynamoDB
- S3
- CloudFront where useful

Authentication:
- Custom-built authentication (bcrypt password hashing + JWT sessions). Users stored directly in a DynamoDB users table. No Firebase/Cognito.

## Cost Priority
Use a serverless/minimum-cost architecture.
Avoid:
- EC2
- ECS
- RDS
- Redis
- ElastiCache
- Microservices
- unnecessary AWS services

## Important
This is a real ecommerce foundation, not a static mockup. Implement working frontend, backend, database, authentication, media handling, cart, wishlist, checkout and admin functionality.
