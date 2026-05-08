# RefrigHandle

A **refrigerant inventory tracker** for HVAC/R technicians, rewritten as a
**.NET MAUI Blazor Hybrid** app. One C# codebase that ships as a native app
on iOS, Android, Windows, and macOS (Mac Catalyst), with the UI written in
Razor components.

## What it tracks

- **Bottles** — ID/serial, refrigerant type, tare/gross weight, status
  (in stock / on site / stationed / returned / empty), hydro test dates
- **Sites and units** — clients, addresses, equipment per site, factory
  charge, decommissioning
- **Transactions** — charge / recover / transfer / station / return / adjust,
  with before/after weights, technician + ARC RHL frozen for audit
- **Compliance** — leak monitoring (5% watch / 10% suspected, trailing 12 mo),
  AS 2030 hydrostatic test alerts, soft-deleted transactions kept for audit
- **Backup** — export/import the full state as JSON

Data is stored locally in the platform's app data directory
(`FileSystem.AppDataDirectory`) as a single JSON file. The app works fully
offline.

## Project layout

```
Models/                  Domain types (Bottle, Site, Unit, Transaction, …)
Services/                Storage, app state, refrigerant data, business logic
Components/
  Layout/                MainLayout + bottom-nav tabs
  Pages/                 Dashboard, Bottles, Sites, Transactions, Settings
  Shared/                Card, Pill, Modal, RefrigerantSelect, …
Platforms/               Per-platform entry points (Android, iOS, MacCatalyst, Windows)
Resources/               App icons, splash, fonts
wwwroot/                 Blazor host page + CSS
```

## Building

You need the .NET 9 SDK and the MAUI workload installed locally:

```bash
dotnet workload install maui
dotnet build
```

Targeted builds:

```bash
dotnet build -t:Run -f net9.0-android
dotnet build -t:Run -f net9.0-ios
dotnet build -t:Run -f net9.0-maccatalyst
dotnet build -t:Run -f net9.0-windows10.0.19041.0
```

iOS and Mac Catalyst builds require Xcode on a Mac. Windows builds require
Visual Studio with the MAUI workload on Windows.

## Roadmap

- Multi-device cloud sync (was Supabase in the React version; not yet ported)
- Equipment logbook printable view (AS/NZS 5149.4)
- Per-technician password lock with SHA-256 verification (helper exists in
  `Services/Auth.cs`; UI not yet wired)
