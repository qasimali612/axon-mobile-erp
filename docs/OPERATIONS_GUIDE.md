# Roles, scanners and printers

## User and role configuration

1. Sign in as an owner/administrator with `access.user.*` and `access.role.*` grants.
2. Review a system role under **Roles & access**.
3. For exceptions, create a custom role instead of broadening a system baseline.
4. Grant only required actions; sensitive dots identify posting, cost, profit, refund, export or recovery controls.
5. Create the user, choose role and optional branch/warehouse scope, and communicate the generated temporary password through a separate secure channel.
6. Confirm forced password replacement and review the audit event.
7. Suspend company membership immediately when access ends; active company sessions are revoked.

Use separate accounts for every operator. Shared cashier or warehouse passwords destroy accountability.

## USB/Bluetooth scanner setup

Most handheld scanners operate as keyboard wedges:

1. Configure scanner keyboard layout to match the client PC.
2. Configure a suffix such as Enter only where the target form expects it.
3. Test EAN-13, Code 128 and 15-digit IMEI input in a non-production record.
4. Disable scanner-added prefixes unless mapped by the application.
5. For Bluetooth, prevent power-saving disconnects during stocktake.
6. Never use a scanner configuration that truncates leading zeroes.

Camera scanning and IMEI workflows arrive with Phase 2. A scanner will populate focused fields, but the server still validates identifier, company uniqueness, status and eligibility.

## Receipt printers

For 80 mm thermal printers:

- Install the manufacturer driver on each client or print-server host.
- Set paper width to 80 mm, margins to minimum supported, scale 100%, and disable browser headers/footers.
- Use a dedicated receipt template; do not shrink A4 invoices.
- Test long product names, split payments, tax lines, returns and duplicate-copy watermark.

## Label printers

- Record model, DPI (203/300), label width/height, gap/black-mark mode and darkness.
- Calibrate media after changing rolls.
- Map application template size exactly to driver size; disable “fit to page.”
- Test barcode quiet zone and scan from the actual printed label.
- Restrict full-IMEI label reprints to `label.reprint_sensitive`.
- Public QR content should use an opaque lookup token rather than full IMEI unless policy explicitly authorizes exposure.

Label and receipt templates are scheduled for later phases; printer setup does not imply those templates are active now.

## Local client PCs

- Use supported Chrome/Edge with automatic security updates.
- Open only the HTTPS server hostname, not a raw database port.
- Keep workstation clock synchronized.
- Restrict browser password storage on shared counters.
- Lock the OS session when unattended.
- Test scanner/printer after driver, browser or Windows updates.
