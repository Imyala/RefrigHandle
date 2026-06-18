# RefrigHandle

**RefrigHandle** is a mobile and desktop-friendly refrigerant management
and compliance app for Australian HVAC/R technicians and businesses.

It tracks refrigerant cylinders, logs every charge and recovery, and keeps
the audit records an ARC Refrigerant Trading Authorisation requires —
designed to be filled in on a phone at the job, not back at the office.

> **Australia only.** RefrigHandle is built around the Australian scheme:
> ARC Refrigerant Handling Licences (RHL), Refrigerant Trading
> Authorisations (RTA), the ABN, AS 2030 cylinder testing, AS/NZS 5149 and
> the ANZ Refrigerant Handling Code of Practice. It is not set up for
> other jurisdictions.

Built as an installable **Progressive Web App (PWA)**, it runs from a
single codebase on:

* iPhone & iPad
* Android phones & tablets
* Windows, macOS, and Linux desktops

---

## Features

### Cylinder management

* Cylinder ID / serial, refrigerant type, and kind (standard or pump-down)
* Tare, gross, and live net weight, with a status of In stock, On site,
  Returned, or Empty
* Safe-fill awareness — net is checked against the cylinder's water
  capacity × the refrigerant's filling ratio, with an overfill warning
* **AS 2030 hydrostatic test tracking** — last-tested / next-due dates,
  "due soon" and "overdue" alerts, and a "sent for retest" state
* Supplier and invoice/docket captured on intake for the paper trail
* Barcode scanning to find or enter a cylinder by its number

### Sites, clients & equipment

* Sites with client/owner, address, and Australian state/town pickers
* Units (equipment) per site — type, refrigerant, factory charge,
  manufacturer/model/serial, install date
* Decommission and reactivate equipment without losing its history
* Printable **equipment logbook** per unit (service history, GWP / CO₂-e,
  leak status, signatures)

### Refrigerant logging

Record every movement: **charge** into equipment, **recover** from
equipment or bottle-to-bottle, **transfer** to a site, **return** to a
store/supplier, **intake** of a new cylinder, and manual **adjustments**.

* Enter the amount directly, or weigh the cylinder and let the app derive
  it ("scale entry"), with hose/decant loss tracked automatically
* Records date/time, technician + RHL, business + RTA, reason, and an
  explicit leak-test Yes/No
* Sanity guards catch gross typos; refrigerant mismatches between cylinder
  and equipment are flagged before you save
* Attach photos (docket, gauges, nameplate) and capture an on-device
  **customer signature**

### Compliance & audit

* **Tamper-evident change log** — every edit is sealed into a per-device
  cryptographic hash chain, verifiable from Settings
* Append-only **corrections** — a wrong entry is re-stated, never quietly
  overwritten, and both rows stay on the record
* **Soft-delete with restore** — removed log entries are kept for the audit
  trail and recoverable by an owner/supervisor
* **ARC quarterly record** — refrigerant bought, charged, recovered and
  returned per quarter, printable to PDF
* Alerts for RHL / RTA expiry and overdue cylinder tests
* GWP and tonnes-CO₂-e from IPCC AR4 values

### Technicians & roles

* Per-technician profiles, each with their own RHL and expiry, stamped
  (frozen) onto every transaction they log
* Roles — owner, supervisor, lead technician, technician, apprentice — each
  managing only people below their own tier
* A password lock guards switching profiles on a shared device
  (PBKDF2-hashed, stored locally). New passwords favour length over
  complexity and are screened against common and known-breached
  passwords (via the Have I Been Pwned k-anonymity API)

### Backup, export & sync

* Full **JSON backup** (including photos and signatures) and **CSV log
  export** with an optional date range, plus import/restore
* Backup reminders and persistent-storage requests so records aren't lost
  to a browser eviction
* **Offline-first** — everything works with no connection; data lives on
  the device
* Optional self-hosted **cloud sync** for multi-device teams via Supabase
  (one-time setup — see [`SYNC.md`](./SYNC.md))

---

## Planned

* Server-backed team accounts with per-technician sign-in and enforced
  role permissions
* Turnkey cloud backup (without self-hosting)
* Native iOS / Android builds

---

## Technology

React + TypeScript + Vite, Tailwind CSS, and `vite-plugin-pwa`. All data
is stored locally in the browser (IndexedDB / localStorage); the optional
sync layer uses Supabase.

---

## Goal

Make refrigerant tracking quick on a phone, keep inventory accurate, and
produce clear, defensible audit records for Australian refrigerant
compliance.
