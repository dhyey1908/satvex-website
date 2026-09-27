# SATVEX — Initial Seed Data

## Initial Product
Create one initial product:

Name:
Butterfly

Category:
Beauty / Fashion Accessory

## Initial Colors
Create these 8 variants:

1. Pink
2. Blue
3. Purple
4. Red
5. Green
6. Yellow
7. White
8. Black

Each should have:
- stable ID
- color name
- color code
- image placeholder/reference
- active=true

Do not invent fake image URLs.

If actual images are not available, use a clearly documented local asset placeholder that can be replaced.

## Selling Options
Create:
- Single
- Combo of 2
- Combo of 3

Example configuration:
Single:
quantity=1

Combo of 2:
quantity=2

Combo of 3:
quantity=3

Prices must be configurable and must not be duplicated throughout frontend code.

## Duplicate Colors
Initial recommended behavior:
- Single: one selection
- Combo of 2: duplicate colors disabled
- Combo of 3: duplicate colors disabled

Make this configurable through admin.

## Seed Requirements
Seed data should be safe to run in development.
Do not create duplicate records every time the seed runs.

## Admin
Provide a documented way to create the first admin account.
Never commit a production admin password.
