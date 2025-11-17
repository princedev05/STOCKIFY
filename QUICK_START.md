# Quick Start Guide - Company Stock Listing

## For End Users

### 1️⃣ Register as a Company

**URL:** `http://localhost:4000/signup.html`

**Steps:**
1. Fill in your personal details
2. Select **"Company (List Stocks)"** from Account Type dropdown
3. New company fields will appear:
   - Company Name (required)
   - Sector (optional)
   - Website (optional)
   - Description (optional)
4. Click **"Sign Up"**
5. You'll be redirected to login page

### 2️⃣ Log In

**URL:** `http://localhost:4000/login.html`

**Steps:**
1. Enter your username/email
2. Enter your password
3. Click **"Login"**
4. You'll receive a JWT token (stored in browser)

### 3️⃣ List Your First Stock

**URL:** `http://localhost:4000/list.html`

**Steps:**
1. Your company information will be displayed
2. Fill in the stock details:
   - **Stock Price**: Initial price per share (e.g., 100.50)
   - **Total Shares**: How many shares you want to issue (e.g., 10000)
   - **Available Shares**: How many are for sale (e.g., 5000)
   - **Lot Size**: Minimum shares per transaction (default: 1)
3. Click **"List Stock"**
4. Success message shows your new Stock ID
5. Redirected to dashboard

---

## For Developers - API Quick Reference

### Authentication Endpoints

#### Register Company
```bash
POST /auth/register
Content-Type: application/json

{
  "username": "techcorp",
  "name": "Tech Corp Admin",
  "email": "admin@techcorp.com",
  "password": "password123",
  "role": "company",
  "company_name": "Tech Innovation Corp",
  "sector": "Technology",
  "website": "https://techcorp.com",
  "description": "Tech company"
}

Response:
{
  "user_id": 1,
  "company_id": 5
}
```

#### Login
```bash
POST /auth/login
Content-Type: application/json

{
  "username": "techcorp",
  "password": "password123"
}

Response:
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### Company Endpoints (Authenticated)

#### Get Company Info
```bash
GET /company/info
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

Response:
{
  "user_id": 1,
  "username": "techcorp",
  "company_id": 5,
  "company_name": "Tech Innovation Corp",
  "sector": "Technology",
  "website": "https://techcorp.com",
  "description": "Tech company",
  "approved": 0,
  "created_at": "2025-11-17 10:30:00",
  "updated_at": "2025-11-17 10:30:00"
}
```

#### List Stock
```bash
POST /company/listStock
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "current_price": 100.50,
  "total_shares": 10000,
  "available_shares": 5000,
  "lot_size": 10
}

Response:
{
  "success": true,
  "stock_id": 1,
  "company_id": 5,
  "message": "Stock listed successfully"
}
```

#### Get Company Stocks
```bash
GET /company/stocks
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

Response:
[
  {
    "stock_id": 1,
    "company_id": 5,
    "listing_date": "2025-11-17",
    "lot_size": 10,
    "current_price": "100.5000",
    "total_shares": 10000,
    "available_shares": 5000
  }
]
```

---

## Database Schema

### Users Table (Modified)
```sql
+--------------+---------+
| Column       | Type    |
+--------------+---------+
| user_id      | INT PK  |
| username     | VARCHAR |
| email        | VARCHAR |
| password_hash| VARCHAR |
| role         | ENUM    | (investor, company)
| company_id   | INT FK  | ← NEW
| created_at   | TIMESTAMP|
| status       | ENUM    |
| last_login   | TIMESTAMP|
| updated_at   | TIMESTAMP|
+--------------+---------+
```

### Companies Table (Modified)
```sql
+-----------------+----------+
| Column          | Type     |
+-----------------+----------+
| company_id      | INT PK   |
| company_name    | VARCHAR  |
| sector          | VARCHAR  |
| description     | TEXT     |
| website         | VARCHAR  |
| approved        | TINYINT  |
| created_at      | TIMESTAMP| ← NEW
| updated_at      | TIMESTAMP| ← NEW
+-----------------+----------+
```

### Stocks Table (Referenced)
```sql
+------------------+----------+
| Column           | Type     |
+------------------+----------+
| stock_id         | INT PK   |
| company_id       | INT FK   |
| listing_date     | DATE     |
| lot_size         | INT      |
| current_price    | DECIMAL  |
| total_shares     | BIGINT   |
| available_shares | BIGINT   |
+------------------+----------+
```

---

## Error Codes & Solutions

### 400 Bad Request
```json
{"error": "Missing fields"}
```
**Solution:** Check all required fields are provided

### 401 Unauthorized
```json
{"error": "No token provided"}
```
**Solution:** Add JWT token to Authorization header

### 403 Forbidden
```json
{"error": "Only companies can list stocks"}
```
**Solution:** Log in as company user, not investor

### 404 Not Found
```json
{"error": "User not found"}
```
**Solution:** Check user credentials

### 500 Internal Server Error
```json
{"error": "Duplicate entry for key 'username'"}
```
**Solution:** Username already exists, choose a different one

---

## File Locations

| File | Purpose |
|------|---------|
| `db/init.sql` | Database schema with modified users & companies tables |
| `src/routes/auth.js` | Authentication with company registration |
| `src/routes/company.js` | Company management & stock listing endpoints |
| `public/signup.html` | Signup form with company fields |
| `public/list.html` | Stock listing form for companies |

---

## Development Tips

1. **Test Company Registration:**
   ```bash
   curl -X POST http://localhost:4000/auth/register \
     -H "Content-Type: application/json" \
     -d '{"username":"testco","name":"Test","email":"test@co.com","password":"pass","role":"company","company_name":"TestCo","sector":"Tech"}'
   ```

2. **Check Stock in Database:**
   ```sql
   SELECT * FROM stocks WHERE company_id = 5;
   ```

3. **View Stock Listings:**
   ```sql
   SELECT * FROM stock_listings WHERE company_id = 5;
   ```

4. **Clear Session:**
   ```javascript
   localStorage.removeItem('token');
   ```

---

## Troubleshooting

### "Company not found" error
- Ensure company was created during registration
- Check `users.company_id` is not NULL

### Stock not appearing after listing
- Refresh the page
- Check browser console for errors
- Verify token is still valid

### Form fields not showing
- Clear browser cache
- Hard refresh (Ctrl+F5)
- Check browser console for JavaScript errors

---

