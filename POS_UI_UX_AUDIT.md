# AXON MOBILE ERP — POS UI/UX AUDIT & ERGONOMIC TERMINAL REVIEW
## Counter Speed, Keyboard-First Workflow & Cash Register Ergonomics

**Date:** November 2026  
**Auditor:** Senior ERP UI/UX Architect & Counter Terminal Engineer  
**Reference:** SAP Business One POS / High-Velocity Retail Counter

---

## 1. Terminal Layout & Viewport Hierarchy

The Axon Mobile ERP POS terminal is engineered as a split-pane, high-contrast, keyboard-first workstation optimized for continuous 8-12 hour cashier shifts:

```
+-----------------------------------------------------------------------------------------------+
| TOP BAR: [Logo/Title] [Counter Terminal Badge] [Parked Sales] | [F2 Catalog] [F4 Cust] [F8 Clear] [Ctrl+Enter] |
+-------------------------------------------------------------+---------------------------------+
| LEFT MAIN PANE:                                             | RIGHT SIDEBAR (380-410px):      |
| 1. Config Bar: Branch, Warehouse, Customer, Salesperson     | 1. Tender Mode: Cash, Card,     |
| 2. Customer Credit & Profile Strip                          |    Wallet, Credit               |
| 3. High-Contrast Scan Input (IMEI1, IMEI2, Barcode, SKU)     | 2. Tender Inputs / Quick Chips  |
| 4. Cart Table: Items, Line Disc, IMEI Chips, Stock Status   | 3. Change Return / Shortage     |
|                                                             | 4. Financial Grand Totals Card  |
|                                                             | 5. ⚡ Complete Sale & Post      |
|                                                             |    Park / Save as Draft         |
+-------------------------------------------------------------+---------------------------------+
```

---

## 2. Keyboard Accelerators & Fast-Tender Evaluation

| Keybinding | Action | Usability Impact |
|---|---|---|
| **F2** | Global Catalog Search Modal | Cashiers can browse inventory, check variant stock levels, and search by IMEI or name without touching the mouse. |
| **F3** | Focus Scan Input Box | Re-focuses the scanner line immediately if cashier clicked elsewhere. |
| **F4** | Focus Customer Selector | Instant switch between Walk-In and trade credit customers. |
| **F8** | Clear / Empty Cart | Fast reset between abandoned counter inquiries. |
| **Ctrl + Enter** | ⚡ Quick Tender & Post | Instantly commits, decrements inventory, posts GL entries, records payment, and opens thermal receipt. |
| **Escape** | Dismiss Modal | Closes search dialogs or popovers back to active counter. |

---

## 3. High-Velocity Scanner Design

- **Auto-Clear on Scan:** Barcode scanner gun input emits an automatic newline / carriage return, resolving the code in real-time, injecting the line into the cart, playing an auditory beep confirmation, and instantly clearing the input for consecutive scans.
- **Physical Device Badging:** Serialized devices display their dual identifiers (IMEI1 / IMEI2) in a dedicated badge below the product name so the cashier can visually inspect the phone box during customer handover.
- **Instant Change Calculation:** Large, high-visibility green indicator card computes exact customer change return in real-time as denominations are clicked or cash tendered is typed.
- **Quick Denomination Chips:** Exact, +500, +1,000, +5,000, +10,000 buttons eliminate mental arithmetic during peak counter rush.

---

## 4. UI/UX Verification Checklist

- [x] High-contrast dark scanner console prevents screen glare under harsh retail lighting.
- [x] Clear visual distinction between serialized handsets (IMEI badge) and bulk accessories (quantity spinner).
- [x] Real-time credit terms banner showing customer terms days and approved credit limit.
- [x] One-click Park & Recall workflow so cashiers can hold customer carts during indecision.
- [x] Thermal 80mm receipt generation and A4 PDF printing built into checkout completion.
