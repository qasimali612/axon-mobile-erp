# LAN, printer and scanner guide

**Status:** delivered. Covers workstation setup, barcode/IMEI scanning, label and document printing,
and the checks operators must run before a go-live.

---

## 1. Workstations

| Item | Requirement | Why |
| --- | --- | --- |
| Browser | Current Chrome, Edge or Firefox | Modern JS, print CSS, secure cookies |
| Screen | 1366×768 or larger; 1920×1080 for counters | Data-dense grids |
| Network | Wired where possible; stable Wi-Fi minimum 5 Mbps | Long-running posts must not drop |
| Time | Synced with the domain (NTP) | Sessions and document dates |
| Scale | 100% browser zoom | Scanner and keyboard flows assume it |

Bookmark the HTTPS hostname. Do **not** bookmark a raw IP or `localhost`; sessions and origin checks
are host-bound.

## 2. Keyboard-first operation

| Screen | Keys |
| --- | --- |
| Global search | `Ctrl`/`Cmd` + `K` |
| Any form | `Tab` / `Shift+Tab` move, `Enter` submits the focused form |
| Scanner input | The barcode field is focused on open; a scanner "keystrokes + Enter" resolves the product |
| Modals | `Esc` closes; focus returns to the trigger |

Scanners must be configured in **keyboard-wedge HID mode** with a trailing **Enter** (CR). Do not use
a scanner that emulates a serial port for the browser.

## 3. Barcode and IMEI scanning

1. Unknown barcodes never create products. The API returns a validation error and the operator is
   asked to select an active product or raise a catalogue request.
2. IMEI scanning validates length, prefix and checksum (Luhn) where the product requires it.
3. A dual-SIM handset records **IMEI 1 and IMEI 2 on one stock unit**; the second IMEI resolves to the
   same physical unit. Scanning two different units' IMEIs, or the same IMEI twice, is rejected.
4. Accessories and bulk products use quantity entry, not IMEI capture.
5. Print labels from the product/GRN screens; labels embed Code128 or QR SVG generated server-side.

## 4. Printing

All documents use the shared `print-document` CSS:

* A4 documents: purchase order, GRN, sales invoice, return, budget version, registers.
* The `no-print` class hides toolbars so the printed page contains only the document.
* Browsers print to PDF natively — there is no server-side PDF renderer, so no font or Arabic/Urdu
  shaping issues arise beyond the browser's own engine.

Steps for a print station:

1. Open the document → **Print / save PDF**.
2. Choose the printer, A4, margins *Default*, background graphics **on** (company header bar).
3. Save the settings as a printer preset named *Axon A4*.
4. For receipt printers, choose the 80 mm roll preset; the invoice layout reflows to a single column.

Checks before go-live:

* Header shows company legal name, address and tax number.
* Line table shows SKU, IMEI(s), quantity, price, tax and totals.
* Signature block shows prepared/approved/posted officers.
* Footer shows generated timestamp and record ID for audit traceability.

## 5. Scanner and printer acceptance script

Run once per station after setup:

| Step | Action | Pass criterion |
| --- | --- | --- |
| 1 | Sign in with the station's role | Menu shows only granted modules |
| 2 | `Ctrl+K`, search an invoice number | Result opens the invoice |
| 3 | Scan a phone barcode on the sales screen | Product, variant and price resolve; IMEI field appears |
| 4 | Scan both IMEIs of a dual-SIM unit | Both attach to one unit; a third IMEI is rejected |
| 5 | Scan an accessory barcode | Quantity line, no IMEI prompt |
| 6 | Print the invoice | Layout matches the preview, barcode scannable |
| 7 | Print a GRN label sheet | Labels align and scan into the same system |
| 8 | Idle the session past the timeout | Session expires and the login screen returns |
| 9 | Power-cycle the printer mid-print | Reprint from the preview, no duplicate posting |

## 6. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Scanner types into the wrong field | Focus moved | Click the barcode field or press `Tab` until it is focused |
| Characters missing from scanned code | Keyboard-wedge too fast | Lower the scanner inter-character delay to 10–20 ms |
| "Unknown barcode" | Catalog miss or archived variant | Search the catalog; never force-create |
| "IMEI already registered" | Duplicate capture or a resold unit | Check the device registry and the original sale |
| Print clips columns | Zoom not 100% or narrow page | Reset zoom; for 80 mm printers use the receipt preset |
| Labels drift on the sheet | Printer scaling | Disable "fit to page", set actual size |
| Nothing prints from a remote branch | Printer offline / queue stuck | Clear the spooler, verify the shared printer path |
| Session drops mid-entry | Network flap or sleep | Reconnect and re-enter; drafts are not auto-posted |

## 7. Offline note

There is no offline mode. If the LAN or the server is down, staff must not record transactions
elsewhere and re-enter them later without checking stock and IMEI availability first — the posting
service revalidates both, and a stale re-entry is refused rather than silently overselling.
