# Miss V Business Frontend

The React frontend for Miss V Business, an owner-operated piggery and karenderiya management application. It gives the owner a responsive dashboard for recording cash flow, pigs, feed, slaughter, inventory, recipes, cooking batches, and sales in Philippine pesos.

This project is an independent client application. It communicates with the Miss V Business API through REST and never imports backend Mongoose models or connects directly to MongoDB.

## Features

- Unique-business registration, email verification, and super-admin approval gates
- Numeric named roles, employee accounts, and QR/link-based sub-account registration
- Email/password and Philippine mobile number/MPIN sign-in
- Automatic access-token refresh and logout
- Cash accounts, cash in/out, expenses, and payment tracking
- Pig acquisition, current status, weight history, batches, and accumulated cost
- Feed receipts, feed usage, inventory lots, and movement history
- Slaughter yield, meat-part weights, charges, and production cost per kilogram
- Meat transfer from the piggery to karenderiya inventory
- Piggery meat and live-pig sales
- Menu recipes, ingredient costing, target food cost, and selling-price guidance
- Cooking batches and daily karenderiya sales
- Dashboard summaries, reports, business settings, and searchable activity history
- Owner landing-page builder with custom sections, responsive component placement, variants, live preview, and publishing
- Lazy-loaded application pages, loading skeletons, query errors, and an application error boundary

## Technology

- React 19 and TypeScript
- Vite
- Tailwind CSS
- Radix-based reusable UI components
- TanStack Query and TanStack Table
- React Router
- React Hook Form and Valibot
- Recharts, Framer Motion, Iconify, and Sonner
- Biome

## Requirements

- Node.js 22.12 or newer; Node.js 20.19 is also supported by the current Vite version
- npm
- The Miss V Business API running locally or available at a configured URL

## Local setup

1. Start the backend API. Its default address is `http://localhost:4000`.

2. Create the frontend environment file:

   ```bash
   cp .env.example .env
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open `http://localhost:5173`.

Vite proxies local requests from `/api` to `http://localhost:4000`, so the default environment works without a separate API origin.

## Environment variable

| Variable | Purpose | Default/example |
| --- | --- | --- |
| `VITE_API_URL` | Base URL prepended to every backend request | `/api` |
| `VITE_PUBLIC_SITE_BASE_DOMAIN` | Wildcard base domain used for published business sites | unset locally; `yourdomain.com` in production |

Use `/api` for local development or a same-origin production deployment. If the API is hosted separately, set the complete public API base URL before running the production build.

Example:

```env
VITE_API_URL=https://api.example.com/api
```

Only variables prefixed with `VITE_` are exposed to browser code. Never place secrets in the frontend environment file.

## Authentication flow

1. Registration creates a unique business and a role-0 user.
2. The user opens the emailed verification link, which routes to `/verify-email`.
3. Direct business registrations wait at an approval gate until the role-99 super admin approves them.
4. Approved users sign in with email/password or Philippine mobile number/MPIN.
5. The access token is stored in browser local storage and attached to protected requests.
6. The HTTP-only refresh cookie is used to renew an expired access token automatically.
7. If refresh fails, the local access token is cleared and the owner must sign in again.
8. Forgotten passwords and MPINs are reset through a single-use link sent to the verified email; a successful reset revokes existing sessions.

For local development, the backend's console email provider prints the verification URL in its terminal.

## Application routes

| Route | Page | Purpose |
| --- | --- | --- |
| `/login` | Owner sign in | Password or MPIN authentication |
| `/register` | Business registration | Create a unique company and its initial role-0 user |
| `/verify-email` | Email verification | Activate the owner account from a token |
| `/reset-credential` | Credential recovery | Set a new password or MPIN from an emailed reset link |
| `/` | Dashboard | Cash, piggery, karenderiya, inventory, and activity summaries |
| `/cash-flow` | Cash flow | Expenses, payments, deposits, withdrawals, and balances |
| `/pigs` | Pig records | Acquisition, current weight, status, and accumulated cost |
| `/operations` | Piggery operations | Feed use, measurements, batches, and piggery sales |
| `/slaughter` | Slaughter | Yield, meat parts, costs, corrections, and reversals |
| `/inventory` | Inventory | Items, receipts, lots, current stock, and movements |
| `/karenderiya` | Karenderiya | Recipes, menu pricing, cooking batches, and daily sales |
| `/reports` | Reports | Date-filtered financial, costing, yield, and stock reports |
| `/activity-log` | Activity log | Searchable owner and data-change audit history |
| `/settings` | Settings | Business details, defaults, contacts, and slaughter setup |
| `/employees` | Employee management | Highest-role accounts, named roles, and QR registration links |
| `/admin` | Super admin | Role-99 account approval queue |
| `/join/:tokenId` | Invited registration | Create a sub-account from an opaque registration link |
| `/landing-page` | Landing-page builder | Arrange custom sections and components, create variants, and publish the public site |
| `/catalog` | Product catalog | Category sections and filters, product selection, variants, prices, availability, and scheduled percentage/fixed discounts |
| `/orders` | Customer orders | Review and process pending orders submitted through the public landing page |
| `/site/:slug` | Public landing page | Local/fallback route when a wildcard domain is not configured |

Protected pages render inside the application shell and redirect unauthenticated visitors to `/login`.

In Product Catalog, select individual products, a category, or all filtered products and choose
**Set discount**. Choose a percentage or fixed peso reduction, preview all affected variant
prices, and set start/end times in Philippine time (UTC+08:00). **Manage discounts** supports
editing, deactivation, and reactivation. Conflicting enabled promotions are blocked.

Countdowns display total hours, minutes, and seconds (`125:04:09`, never days). Scheduled
promotions show both start and end countdowns; active promotions show time until expiry.
The storefront updates prices at schedule boundaries, checks for manual changes every 30
seconds and on focus, and refreshes before checkout. If prices change, customers must review
the updated total before submitting. The backend remains authoritative, including for old carts.

## Business workflow

```text
Acquire pig -> Record feed and weights -> Slaughter -> Create meat inventory
                                                        |
                                                        +-> Piggery sale
                                                        |
                                                        +-> Transfer to karenderiya
                                                            -> Cook menu recipe
                                                            -> Record daily sale
```

The UI sends all transaction-sensitive changes to backend operation endpoints. It does not calculate or write authoritative cash balances, inventory balances, or accumulated pig costs by itself.

## Important interface behavior

- Currency is displayed in Philippine pesos.
- Quantities and weights are entered in kilograms where applicable.
- Forms show backend validation and transaction errors without silently treating the change as saved.
- TanStack Query refreshes connected pages after successful operations.
- Slaughter edit and delete controls remain subject to backend dependency checks.
- Menu and recipe details are saved through one combined backend operation.
- Internal meat transfers display inventory cost movement but do not appear as cash income or expenses.
- Reports are calculated from posted backend records for the selected date range.
- Public landing pages can feature food and general products in one cart with guest pickup or delivery checkout.
- Each landing-page variant has Cart & Checkout settings for ordering availability, button placement, pickup/delivery, minimum orders, delivery fees, and customer instructions.
- Checkout creates a pending request; it does not post cash or operational inventory until the owner handles fulfillment through the appropriate workflow.

## Source layout

```text
src/
├── api/          # Fetch client, access-token storage, and session refresh
├── components/   # Shared cards, feedback, and reusable UI controls
├── layout/       # Public authentication shell and protected app shell
├── lib/          # Frontend utilities
├── pages/        # Route-level application modules
├── types/        # REST and domain types
├── App.tsx       # Lazy-loaded routes and authentication boundary
├── main.tsx      # React application entry
└── styles.css    # Tailwind theme and global styles
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run check` | Run Biome and TypeScript validation |
| `npm run typecheck` | Run the TypeScript project build check |
| `npm run build` | Create the production bundle in `dist/` |
| `npm run preview` | Preview the production bundle locally |
| `npm run format` | Apply Biome formatting and safe fixes |

## Validation

Run before handing off or deploying frontend changes:

```bash
npm run check
npm run build
```

A passing build validates compilation and bundling, but transaction workflows should also be checked against a running API in the browser.

## Production deployment

1. Set `VITE_API_URL` to the deployed API base URL when the API is not served under the same `/api` origin.
2. Set `VITE_PUBLIC_SITE_BASE_DOMAIN` to the domain whose wildcard subdomains will host published pages.
3. Run `npm install`, `npm run check`, and `npm run build`.
4. Deploy the generated `dist/` directory to a static host.
5. Configure the host to serve `index.html` as the fallback for client-side routes.
6. Add wildcard DNS and hosting for `*.yourdomain.com`, pointing every business subdomain to this frontend deployment with wildcard TLS enabled.
7. Use HTTPS and ensure the backend `FRONTEND_URL` exactly matches the owner application's deployed origin.
8. Set the backend `PUBLIC_SITE_BASE_DOMAIN` to the same domain. When the API is hosted separately, use an absolute `VITE_API_URL` such as `https://api.yourdomain.com/api`.

## Current scope

The interface supports multiple unique businesses, business-scoped numeric roles, and employee sub-accounts. Point-of-sale hardware, payroll, employee timekeeping, foreign currency, and full accounting remain outside the current scope.
