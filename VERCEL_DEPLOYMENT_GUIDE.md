# Axon Mobile ERP — Vercel & Production Database Setup Guide

This guide walks you through setting up your **cloud PostgreSQL database** and deploying **Axon Mobile ERP** to [Vercel](https://vercel.com) with 0 demo data.

---

## ⚡ Quick Summary: 3 Simple Steps

1. **Create Free Cloud PostgreSQL** on [Neon.tech](https://neon.tech) (takes 60 seconds).
2. **Run 1-Line Setup Command** from your terminal to initialize tables & admin account:
   ```powershell
   $env:DATABASE_URL="<your-neon-url>"; npm run db:setup
   ```
3. **Deploy to Vercel** and add `DATABASE_URL` in Vercel Settings.

---

## 1. Get a Free Cloud PostgreSQL Database (Neon)

Vercel functions are serverless and need a live hosted database connection.

1. Go to **[Neon.tech](https://neon.tech)** and sign in with GitHub or Google.
2. Click **Create Project**:
   - Name: `axon-erp`
   - Region: Any (e.g. Frankfurt, Singapore, or US East)
   - Postgres version: 16 or 17
3. Copy your connection string from the Neon dashboard. It looks like:
   ```text
   postgresql://axon_owner:password@ep-green-sample-123456.us-east-1.aws.neon.tech/neondb?sslmode=require
   ```

*(Alternative: You can also use [Supabase](https://supabase.com), [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres), or [Railway](https://railway.app)).*

---

## 2. Initialize Your Cloud Database (1 Command)

Before signing in on Vercel, initialize your database with the complete clean production schema (all 41 migrations, 154 system permissions, primary branches, warehouses, universal Walk-in POS customer, and Chart of Accounts).

Open PowerShell in your project folder (`d:\Inventory Managment Software`) and run:

### Windows PowerShell:
```powershell
$env:DATABASE_URL="<paste-your-neon-url-here>"
npm run db:setup
```

### Windows Command Prompt (cmd):
```cmd
set DATABASE_URL=<paste-your-neon-url-here>
npm run db:setup
```

### Mac / Linux:
```bash
DATABASE_URL="<paste-your-neon-url-here>" npm run db:setup
```

### Optional Custom Admin Credentials:
If you want to customize your admin email and password during setup:
```powershell
$env:DATABASE_URL="<paste-your-neon-url-here>"
$env:ADMIN_EMAIL="owner@axonmobile.local"
$env:ADMIN_PASSWORD="Inventory!2026"
$env:ADMIN_NAME="Ahsan Malik"
npm run db:setup
```

---

## 3. Deploy to Vercel

1. Go to **[Vercel Dashboard](https://vercel.com/dashboard)**.
2. Click **Add New...** → **Project**.
3. Import your GitHub repository: `qasimali612/axon-mobile-erp`.
4. In **Build & Development Settings**:
   - Framework Preset: **Next.js** (auto-detected)
   - Build Command: `npm run build` (auto-detected)
   - Output Directory: `.next` (auto-detected)
   - Install Command: `npm install` (auto-detected)

5. Under **Environment Variables**, add:

| Variable Name | Value | Note |
|---|---|---|
| `DATABASE_URL` | `<your-cloud-database-url>` | Paste your Neon/Supabase PostgreSQL connection string |
| `APP_SECRET` | `015d85540dd31ecd95b16e60077ab023a5b4bc5578ea8d6f67cc91d9fd56a1a2` | Random 32+ character secret |
| `APP_URL` | `https://your-project.vercel.app` | Your Vercel domain |
| `NODE_ENV` | `production` | Production environment flag |
| `DEMO_SEED` | `false` | Keeps production 100% clean of demo handsets/IMEIs |

6. Click **Deploy**.

---

## 4. Verify & Sign In

### Step 1: Health Diagnostic Check
Open `https://your-project.vercel.app/api/system/health` in your browser.
You should see:
```json
{
  "status": "ok",
  "database": "reachable",
  "diagnostics": {
    "tablesMigrated": true,
    "companies": 1,
    "users": 1,
    "branches": 2,
    "readyForLogin": true
  }
}
```

### Step 2: Open Sign In Portal
Go to `https://your-project.vercel.app/login` and sign in:
- **Email**: `owner@axonmobile.local` *(or your custom ADMIN_EMAIL)*
- **Password**: `Inventory!2026` *(or your custom ADMIN_PASSWORD)*

---

## 5. What Was Created in the Clean Production Slate

- **0 Demo Transactions**: 0 fake handsets, 0 dummy purchase receipts, 0 test sales invoices, 0 dummy journals.
- **113 Chart of Accounts**: Standard commercial ledger accounts with 0.00 balances.
- **2 Branches**: `Hazro Central` (Head Office) and `Islamabad` (Retail Store).
- **2 Warehouses**: `Hazro Main Warehouse` and `Blue Area Retail Stockroom`.
- **1 Walk-in Customer**: `WALK-IN` universal counter customer for POS.
- **154 System Permissions**: Complete granular role-based access control.
- **1 Super Admin Account**: Fully authenticated Owner/Director with full authority.
