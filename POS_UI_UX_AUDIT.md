# POS UI/UX AUDIT — AXON MOBILE ERP
**Module:** Point of Sale (POS) Counter Terminal Interface  
**Design Reference:** SAP Business One POS / High-Speed Counter Terminal  
**Audit Date:** November 2026  
**Auditor:** Senior Enterprise UI/UX Designer & Retail Systems Specialist  

---

## 1. Visual Layout & Ergonomics Audit

The current POS workspace (`src/components/sales/pos-workspace.tsx`) provides a solid base with high contrast and dark console styling. However, retail counter cashier workflows require several ergonomic upgrades:

### Strengths:
- **High-Contrast Scanner Console:** Prominent dark background (`bg-slate-950`) with emerald pulse indicator for active gun scanner status.
- **Audio Feedback (`playScanBeep`):** High-pitch sine wave (1760 Hz) on successful scan; low-pitch sawtooth buzz (220 Hz) on scan error.
- **Dual-SIM Badge Display:** Shows both `IMEI1 / IMEI2` prominently in the cart under each handset row.
- **Change Calculator:** High-contrast emerald card showing exact cash change to return to the customer.

### Deficiencies Identified:
1. **No Multi-Tender Split Payment Matrix:** The payment panel only has 4 toggle buttons (`cash`, `card`, `wallet`, `credit`). If a customer wants to pay Rs. 30,000 cash and Rs. 50,000 card, the cashier cannot input this on the counter screen.
2. **Missing F6 / F9 / F10 Keyboard Shortcuts:** F2, F3, F4, F8, and Ctrl+Enter exist, but F6 (Salesperson), F9 (Hold / Park), and F10 (Focus Tender) are missing from the global hotkey listener.
3. **Customer Credit Profile Banner:** Could display real-time available credit (`Credit Limit - Current AR Outstanding`) more prominently.
4. **Shift & Cash Drawer Console:** No visual indicator showing current shift status, opening float, or quick shift close action.

---

## 2. Counter Terminal Area Breakdown (Target Architecture)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ AREA 1: TOP HEADER BAR (Compact Enterprise Toolbar)                                     │
│ Branch: HZR-MAIN | Warehouse: Main Dispatch | Cashier: Qasim Ali | Terminal: POS-01    │
│ Hotkeys: F2 Search | F3 Scanner | F4 Customer | F6 Staff | F8 Clear | F9 Hold | F10 Pay │
├───────────────────────────────────────────────────────┬────────────────────────────────┤
│ AREA 2 & 3: SCANNER & CART ITEMS                      │ AREA 4: TENDER & TOTALS        │
│ ┌───────────────────────────────────────────────────┐ │ ┌────────────────────────────┐ │
│ │ ● BARCODE SCANNER ACTIVE [Auto-Add: ON]           │ │ │ TENDER ALLOCATION MATRIX   │ │
│ │ [ Scan IMEI1, IMEI2, Barcode, or SKU...        ]  │ │ │ 💵 Cash:   [ 20,000 ]      │ │
│ └───────────────────────────────────────────────────┘ │ │ 💳 Card:   [ 50,000 ]      │ │
│ Cart Table:                                           │ │ │ 📱 Wallet: [ 10,000 ]      │ │
│ - Samsung S24 (IMEI1 / IMEI2)       1 x 224,999       │ │ │ ⏱️ Credit: [ 20,000 ]      │ │
│ - Anker 20W Charger (ANK-A2633)     2 x 4,799         │ │ ├────────────────────────────┤ │
│                                                       │ │ │ Subtotal:    Rs. 95,000    │ │
│                                                       │ │ │ Discount:   -Rs.  2,000    │ │
│                                                       │ │ │ Tax (0%):    Rs.      0    │ │
│                                                       │ │ │ GRAND TOTAL: Rs. 93,000    │ │
│                                                       │ │ ├────────────────────────────┤ │
│                                                       │ │ │ ⚡ COMPLETE SALE & POST    │ │
│                                                       │ │ │ (Ctrl+Enter)               │ │
│                                                       │ │ └────────────────────────────┘ │
└───────────────────────────────────────────────────────┴────────────────────────────────┘
```

---

## 3. Keyboard Shortcut Matrix

| Key | Action | Scope |
|---|---|---|
| **F2** | Open Catalog Search Modal | Anywhere in POS |
| **F3** | Focus Barcode Scanner Input | Anywhere in POS |
| **F4** | Focus Customer Selector | Anywhere in POS |
| **F6** | Focus Salesperson Selector | Anywhere in POS |
| **F8** | Clear Cart (Requires confirmation if cart > 0) | Anywhere in POS |
| **F9** | Park / Hold Current Sale | Anywhere in POS |
| **F10** | Focus Primary Tender Input | Anywhere in POS |
| **Ctrl + Enter** | Quick Tender & Complete Sale | Anywhere in POS |
| **Esc** | Close active dialog / modal | Modals |

---
© 2026 Copyright Reserved · Qasim Ali · 0315-5049489
