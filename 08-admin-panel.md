# SATVEX — Admin Panel

## Goal
Create a simple professional admin panel.

Do not build an enterprise ERP.

## Admin Sections
- Dashboard
- Products
- Orders
- Customers
- Settings

## Dashboard
Show simple metrics:
- Total products
- Active products
- Total orders
- Pending orders
- Completed orders
- Total customers

Avoid complex analytics.

## Product CRUD
Admin can:
- Create product
- Edit product
- Delete product
- Activate/deactivate product
- Mark featured
- Upload product images
- Add/edit/remove colors
- Add/edit/remove selling options

## Product Form
Fields:
- Name
- Slug
- Short description
- Description
- Base price
- Images
- Video URL if supported
- Variants/colors
- Selling options
- Featured
- Active

## Color Management
Each variant:
- Name
- Color name
- Color code
- Image
- Active/inactive

## Selling Option Management
Fields:
- Name
- Quantity
- Price
- Active
- Allow duplicate colors

## Orders
Admin:
- Search
- Filter
- View order
- Update status

## Customers
Display:
- Name
- Email
- Phone
- Registration date
- Number of orders

Do not expose sensitive authentication data.

## Settings
Allow simple management of:
- Contact phone
- Contact email
- Instagram URL
- Basic brand/site settings if useful

## Admin UX
Use:
- Sidebar
- Responsive layout
- Tables
- Search
- Filters
- Confirmation dialogs
- Toasts
- Loading states
- Empty states
