# Stock Market Simulation - Company Stock Listing Implementation

## Summary of Changes

I've implemented a complete feature that allows companies to register and list their stocks on the market. Here's what was modified:

---

## 1. **Database Schema Updates** (`db/init.sql`)

### Changes:
- **Users Table**: Added `company_id` field (INT) with foreign key reference to companies table
- **Companies Table**: Added `created_at` and `updated_at` timestamp fields

These changes link users to their company profile, allowing each company representative to manage their stocks.

---

## 2. **Backend Authentication Route** (`src/routes/auth.js`)

### Enhanced Registration:
- When a user registers with role = `'company'`, they must provide:
  - `company_name` (required)
  - `sector` (optional)
  - `website` (optional)
  - `description` (optional)
  
- The system automatically:
  1. Creates a company profile in the companies table
  2. Links the user to that company via `user.company_id`
  3. Creates a wallet for the user

### Example Request:
```json
{
  "username": "techcorp",
  "name": "Tech Corp Representative",
  "email": "admin@techcorp.com",
  "password": "password123",
  "role": "company",
  "company_name": "Tech Innovation Corp",
  "sector": "Technology",
  "website": "https://techcorp.com",
  "description": "Leading software development company"
}
```

---

## 3. **Backend Company Routes** (`src/routes/company.js`)

### New Endpoints:

#### 1. **GET /company/info** (Authenticated)
- Retrieves company information for the logged-in user
- Returns company details if user is associated with a company
- Requires JWT token in Authorization header

#### 2. **POST /company/listStock** (Authenticated)
- Allows a company to list a new stock
- Required fields:
  - `current_price` - Stock's initial trading price
  - `total_shares` - Total number of shares to issue
  - `available_shares` - Shares available for trading
  - `lot_size` (optional) - Minimum shares per transaction (default: 1)

- Returns:
  ```json
  {
    "success": true,
    "stock_id": 1,
    "company_id": 5,
    "message": "Stock listed successfully"
  }
  ```

#### 3. **GET /company/stocks** (Authenticated)
- Lists all stocks created by the authenticated company user
- Returns array of stock objects

#### 4. **POST /company/approveCompany** (Admin)
- Updates company approval status
- Used by admins to approve pending companies

---

## 4. **Frontend - Stock Listing Form** (`public/list.html`)

### Features:
A professional HTML form designed for companies to list their stocks with the following fields:

#### Form Fields:
1. **Stock Price** (Decimal input)
   - The initial trading price per share
   - Step: 0.01, Min: 0

2. **Total Shares to Issue** (Integer input)
   - Total number of shares to be issued
   - Min: 1

3. **Available Shares for Trading** (Integer input)
   - Number of shares available for investors to purchase
   - Min: 1
   - Cannot exceed total shares

4. **Lot Size** (Integer input)
   - Minimum shares per transaction
   - Default: 1
   - Optional field

### Company Information Display:
- Shows authenticated company's name and sector
- Auto-populated from company profile
- Validates user is a company before allowing form submission

### Form Validation:
- Client-side validation:
  - All required fields must be filled
  - Stock price must be > 0
  - Available shares cannot exceed total shares
  - Shares must be positive integers
  
- Server-side validation:
  - JWT token verification
  - Company association check
  - Database constraints

### User Experience:
- Beautiful gradient design matching the project theme
- Loading indicator during submission
- Success/error message display
- Auto-redirect to dashboard after successful listing
- Links to navigate back to dashboard or home

---

## 5. **Frontend - Enhanced Signup Form** (`public/signup.html`)

### New Functionality:
- **Role-based Form Display**:
  - When "Investor" is selected: Shows only investor fields
  - When "Company" is selected: Shows additional company fields

### Company Registration Fields (Conditional):
1. **Company Name** (Required for companies)
2. **Sector** (Optional) - e.g., Technology, Finance, Healthcare
3. **Website** (Optional) - URL for company website
4. **Description** (Optional) - Brief company description

### Form Behavior:
- Company fields are hidden by default
- Appear when user selects "Company" role
- Company name becomes required when company role is selected
- Form submission includes company details when registering as company

---

## How It Works: Complete Flow

### Registration Flow:
1. User goes to signup.html
2. Fills basic details (username, email, password, etc.)
3. Selects "Company" as account type
4. Fills company information (name, sector, website, description)
5. Submits form → Creates user and company in database
6. Redirected to login page

### Stock Listing Flow:
1. Company user logs in → Gets JWT token
2. Navigates to list.html
3. System fetches company info via `/company/info` endpoint
4. Displays company information for confirmation
5. Company fills stock details:
   - Initial stock price
   - Total shares to issue
   - Available shares for trading
   - Lot size (optional)
6. Submits form
7. Backend validates and creates:
   - Stock entry in `stocks` table
   - Stock listing in `stock_listings` table
8. Success message with Stock ID
9. Redirects to dashboard

---

## Database Schema Relationships

```
users (company_id) ──── companies (company_id)
                             │
                             └──── stocks (company_id)
                                     │
                                     ├──── stock_listings
                                     ├──── daily_prices
                                     └──── orders (stock_id)
```

---

## API Authentication

All protected endpoints require JWT token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

The token is obtained from login response and stored in browser's localStorage.

---

## Field Mapping to Database Tables

### Stocks Table Fields:
- `stock_id` - Auto-generated Primary Key
- `company_id` - FK to companies table (taken from authenticated user)
- `listing_date` - Set to current date (CURDATE())
- `lot_size` - From form input (default: 1)
- `current_price` - From form (Stock Price)
- `total_shares` - From form
- `available_shares` - From form

### Stock Listings Table Fields:
- `listing_id` - Auto-generated Primary Key
- `company_id` - From authenticated user
- `stock_id` - From newly created stock
- `quantity` - From available_shares
- `price` - From current_price
- `listed_at` - Set to current timestamp

---

## Files Modified/Created

✅ **Modified:**
- `db/init.sql` - Added company_id to users, timestamps to companies
- `src/routes/auth.js` - Enhanced registration with company profile creation
- `src/routes/company.js` - Added 4 new endpoints for stock management
- `public/signup.html` - Added conditional company fields and logic

✅ **Created:**
- `public/list.html` - New stock listing form for companies

---

## Testing the Feature

### Step 1: Register as Company
```bash
POST /auth/register
{
  "username": "testcompany",
  "name": "Test Company Admin",
  "email": "admin@test.com",
  "password": "test123",
  "role": "company",
  "company_name": "Test Trading Inc",
  "sector": "Finance",
  "website": "https://test.com",
  "description": "Test trading company"
}
```

### Step 2: Login
```bash
POST /auth/login
{
  "username": "testcompany",
  "password": "test123"
}
```
Response includes JWT token.

### Step 3: Get Company Info
```bash
GET /company/info
Headers: Authorization: Bearer <token>
```

### Step 4: List a Stock
```bash
POST /company/listStock
Headers: Authorization: Bearer <token>
{
  "current_price": 100.50,
  "total_shares": 10000,
  "available_shares": 5000,
  "lot_size": 10
}
```

---

## Security Features

✅ JWT authentication on all company endpoints
✅ Role-based access control (only company users can list stocks)
✅ Company association verification
✅ Server-side validation of all inputs
✅ Foreign key constraints in database
✅ Password hashing with bcryptjs

---

## Next Steps (Optional Enhancements)

1. Add company approval workflow (approval notifications)
2. Implement stock price update mechanics
3. Add buy/sell order matching engine integration
4. Create company dashboard showing all listed stocks
5. Implement IPO (Initial Public Offering) workflows
6. Add stock delisting functionality
7. Create admin panel for company management
8. Add company details editing capability

---

## Important Notes

- Default JWT_SECRET is "devsecret" (should be changed in production)
- All timestamps are in UTC (database timezone)
- Decimal precision for prices: 18 digits total, 4 decimal places
- Shares are stored as BIGINT (up to 9 quintillion shares)
- The system maintains referential integrity through foreign keys

