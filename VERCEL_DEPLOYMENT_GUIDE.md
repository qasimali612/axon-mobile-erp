# Axon Mobile ERP — Vercel & Production Deployment Guide

This guide walks you through deploying **Axon Mobile ERP** to [Vercel](https://vercel.com) with a production-grade PostgreSQL database (such as **Neon**, **Supabase**, **Vercel Postgres**, or **Railway**).

---

## 1. Push to Your GitHub Repository

The local repository is already cleanly initialized and committed with 0 demo data. To push it to your GitHub account:

```bash
# 1. Add your GitHub remote (replace with your repo URL)
git remote add origin https://github.com/<your-username>/<your-repo-name>.git

# 2. Set the main branch name
git branch -M main

# 3. Push your code to GitHub
git push -u origin main
```

*(Note: If the remote repository already has an initial README, you can run `git push -u origin main --force` or pull with rebase).*

---

## 2. Set Up a Cloud PostgreSQL Database

Vercel functions run in a serverless environment and require an external PostgreSQL database. You can create a free database on any of these providers:

- **[Neon](https://neon.tech)** (Recommended for serverless Next.js / Prisma)
- **[Supabase](https://supabase.com)**
- **[Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres)**

Copy your PostgreSQL connection string:
```text
postgresql://user:password@ep-sample-123456.us-east-1.aws.neon.tech/neondb?sslmode=require
```

---

## 3. Deploy to Vercel

1. Log in to **[Vercel](https://vercel.com)**.
2. Click **Add New...** → **Project**.
3. Import your GitHub repository (`axon-mobile-erp`).
4. In **Build and Output Settings**:
   - Framework Preset: **Next.js**
   - Build Command: `npm run build` *(auto-detected)*
   - Output Directory: `.next` *(auto-detected)*
   - Install Command: `npm install` *(auto-detected, runs `prisma generate` via postinstall)*

### 5. Environment Variables in Vercel

Under **Environment Variables**, add the following:

| Key | Example Value | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://...` | Connection string to your cloud PostgreSQL database |
| `DIRECT_DATABASE_URL` | `postgresql://...` | Direct connection string for schema migrations |
| `APP_SECRET` | `a39f1c7e92b8d4f06124589c3e17b84a` | 32+ character random string for session tokens |
| `APP_URL` | `https://your-project.vercel.app` | Your deployed Vercel domain |
| `DEMO_SEED` | `false` | Keeps production database 100% clean of demo fixtures |
| `NODE_ENV` | `production` | Production environment flag |
| `ADMIN_EMAIL` | `owner@axonmobile.com` | Initial Owner / Admin email |
| `ADMIN_NAME` | `Company Owner` | Initial Owner name |
| `ADMIN_PASSWORD` | `YourSecurePassword123!` | Strong password for first admin login |
| `ADMIN_COMPANY_CODE` | `AXON` | Company code (e.g. AXON) |
| `ADMIN_COMPANY_NAME` | `Axon Mobile Distribution` | Full legal company name |

Click **Deploy**.

---

## 4. Initialize Your Cloud Database (First Time Setup)

Once the Vercel deployment builds, apply your database migrations and create your admin account on the cloud database.

From your local machine or CI/CD terminal (pointing to the cloud `DATABASE_URL`):

```bash
# 1. Apply all PostgreSQL migrations to the cloud DB
DATABASE_URL="<your-cloud-database-url>" npx prisma migrate deploy

# 2. Seed the system permission catalog (154 security permissions)
DATABASE_URL="<your-cloud-database-url>" npm run db:seed

# 3. Bootstrap your initial Super Admin owner account
DATABASE_URL="<your-cloud-database-url>" npm run admin:init
```

Once complete:
1. Open your Vercel URL: `https://your-project.vercel.app/login`
2. Sign in with your `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
3. Your ERP is live with **clean Chart of Accounts**, **universal Walk-in POS support**, **Barcode Studio**, and **0 demo transactions**!

---

## 5. Maintenance Commands

- **Wipe / Reset Demo Data Anytime**:
  ```bash
  npm run db:clean
  ```
  *(Safely truncates all demo products, IMEIs, invoices, journals, and receipts while preserving your Chart of Accounts, users, and branches).*

- **Run Type Checks**:
  ```bash
  npm run typecheck
  ```

- **Run Test Suite**:
  ```bash
  npm test
  ```
