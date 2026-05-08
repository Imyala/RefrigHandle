using RefrigHandle.Models;

namespace RefrigHandle.Services;

/// <summary>
/// Application state container. All mutations are performed here so we can
/// persist after every change and notify subscribed components to re-render.
/// Mirrors the React `useStore()` API.
/// </summary>
public class AppStateService
{
    private readonly StorageService _storage;
    public AppState State { get; private set; } = new();
    public LoadStatus LoadStatus { get; private set; } = LoadStatus.Empty;
    public string? CorruptedBackupPath { get; private set; }

    public event Action? OnChange;

    public AppStateService(StorageService storage)
    {
        _storage = storage;
        var result = _storage.Load();
        State = MigrateLegacy(result.State);
        LoadStatus = result.Status;
        CorruptedBackupPath = result.CorruptedBackupPath;
    }

    private void Notify() { _storage.Save(State); OnChange?.Invoke(); }

    private static AppState MigrateLegacy(AppState s)
    {
        // Seed a tech profile from legacy single-tech fields if none exist.
        if (s.Technicians.Count == 0 &&
            !string.IsNullOrWhiteSpace(s.Technician) &&
            !string.IsNullOrWhiteSpace(s.ArcLicenceNumber))
        {
            var t = new Technician
            {
                Name = s.Technician,
                ArcLicenceNumber = s.ArcLicenceNumber,
            };
            s.Technicians.Add(t);
            s.ActiveTechnicianId ??= t.Id;
        }
        return s;
    }

    public Technician? ActiveTechnician =>
        State.Technicians.FirstOrDefault(t => t.Id == State.ActiveTechnicianId);

    // ---------- Bottles ----------
    public void AddBottle(Bottle b)
    {
        b.CreatedAt = DateTime.UtcNow.ToString("o");
        b.UpdatedAt = b.CreatedAt;
        var tech = ActiveTechnician;
        b.CreatedBy ??= tech?.Name ?? State.Technician;
        b.CreatedByLicence ??= tech?.ArcLicenceNumber ?? State.ArcLicenceNumber;
        State.Bottles.Add(b);
        Notify();
    }

    public void UpdateBottle(Bottle b)
    {
        b.UpdatedAt = DateTime.UtcNow.ToString("o");
        var i = State.Bottles.FindIndex(x => x.Id == b.Id);
        if (i >= 0) State.Bottles[i] = b;
        Notify();
    }

    public void DeleteBottle(string id)
    {
        State.Bottles.RemoveAll(b => b.Id == id);
        Notify();
    }

    // ---------- Sites ----------
    public void AddSite(Site s) { State.Sites.Add(s); Notify(); }
    public void UpdateSite(Site s)
    {
        var i = State.Sites.FindIndex(x => x.Id == s.Id);
        if (i >= 0) State.Sites[i] = s;
        Notify();
    }
    public void DeleteSite(string id)
    {
        State.Sites.RemoveAll(s => s.Id == id);
        State.Units.RemoveAll(u => u.SiteId == id);
        Notify();
    }

    // ---------- Units ----------
    public void AddUnit(Unit u) { State.Units.Add(u); Notify(); }
    public void UpdateUnit(Unit u)
    {
        var i = State.Units.FindIndex(x => x.Id == u.Id);
        if (i >= 0) State.Units[i] = u;
        Notify();
    }
    public void DeleteUnit(string id) { State.Units.RemoveAll(u => u.Id == id); Notify(); }
    public void DecommissionUnit(string id, string? reason)
    {
        var u = State.Units.FirstOrDefault(x => x.Id == id);
        if (u is null) return;
        u.Status = UnitStatus.Decommissioned;
        u.DecommissionedAt = DateTime.UtcNow.ToString("o");
        u.DecommissionedReason = reason;
        Notify();
    }
    public void ReactivateUnit(string id)
    {
        var u = State.Units.FirstOrDefault(x => x.Id == id);
        if (u is null) return;
        u.Status = UnitStatus.Active;
        u.DecommissionedAt = null;
        u.DecommissionedReason = null;
        Notify();
    }

    // ---------- Transactions ----------
    public void AddTransaction(Transaction t)
    {
        var bottle = State.Bottles.FirstOrDefault(b => b.Id == t.BottleId);
        if (bottle is null) return;

        var tech = ActiveTechnician;
        t.Technician ??= tech?.Name ?? State.Technician;
        t.TechnicianLicence ??= tech?.ArcLicenceNumber ?? State.ArcLicenceNumber;
        t.BusinessName ??= State.BusinessName;
        t.ArcAuthorisationNumber ??= State.ArcAuthorisationNumber;
        if (string.IsNullOrEmpty(t.Date)) t.Date = DateTime.UtcNow.ToString("o");

        t.WeightBefore = bottle.GrossWeight;
        var (newGross, newStatus, newSite) = BusinessLogic.ApplyToBottle(bottle, t);
        t.WeightAfter = newGross;
        bottle.GrossWeight = newGross;
        bottle.Status = newStatus;
        bottle.CurrentSiteId = newSite;
        bottle.UpdatedAt = DateTime.UtcNow.ToString("o");

        // Bottle-to-bottle recover: also debit source bottle.
        if (t.Kind == TransactionKind.Recover && !string.IsNullOrEmpty(t.SourceBottleId))
        {
            var src = State.Bottles.FirstOrDefault(b => b.Id == t.SourceBottleId);
            if (src is not null)
            {
                t.SourceWeightBefore = src.GrossWeight;
                src.GrossWeight = Math.Max(0, Units.RoundKg(src.GrossWeight - t.Amount));
                t.SourceWeightAfter = src.GrossWeight;
                var net = Math.Max(0, src.GrossWeight - src.TareWeight);
                if (net <= 0.01 && src.Status != BottleStatus.Returned)
                    src.Status = BottleStatus.Empty;
                src.UpdatedAt = DateTime.UtcNow.ToString("o");
            }
        }

        State.Transactions.Add(t);
        Notify();
    }

    public void DeleteTransaction(string id, string? reason)
    {
        var t = State.Transactions.FirstOrDefault(x => x.Id == id);
        if (t is null) return;
        var tech = ActiveTechnician;
        t.DeletedAt = DateTime.UtcNow.ToString("o");
        t.DeletedBy = tech?.Name ?? State.Technician;
        t.DeletedByLicence = tech?.ArcLicenceNumber ?? State.ArcLicenceNumber;
        t.DeletedReason = reason;
        Notify();
    }

    public void RestoreTransaction(string id)
    {
        var t = State.Transactions.FirstOrDefault(x => x.Id == id);
        if (t is null) return;
        t.DeletedAt = null;
        t.DeletedBy = null;
        t.DeletedByLicence = null;
        t.DeletedReason = null;
        Notify();
    }

    // ---------- Technicians ----------
    public void AddTechnician(Technician t)
    {
        State.Technicians.Add(t);
        State.ActiveTechnicianId ??= t.Id;
        Notify();
    }
    public void UpdateTechnician(Technician t)
    {
        var i = State.Technicians.FindIndex(x => x.Id == t.Id);
        if (i >= 0) State.Technicians[i] = t;
        Notify();
    }
    public void DeleteTechnician(string id)
    {
        State.Technicians.RemoveAll(t => t.Id == id);
        if (State.ActiveTechnicianId == id)
            State.ActiveTechnicianId = State.Technicians.FirstOrDefault()?.Id;
        Notify();
    }
    public void SetActiveTechnicianId(string? id) { State.ActiveTechnicianId = id; Notify(); }

    // ---------- Settings ----------
    public void SetBusinessName(string v) { State.BusinessName = v; Notify(); }
    public void SetArcAuthorisationNumber(string v) { State.ArcAuthorisationNumber = v; Notify(); }
    public void SetLocation(LocationSettings v) { State.Location = v; Notify(); }
    public void SetWeightUnit(WeightUnit v) { State.Unit = v; Notify(); }
    public void SetTheme(ThemePreference v) { State.Theme = v; Notify(); }
    public void SetClock(ClockFormat v) { State.Clock = v; Notify(); }

    // ---------- Refrigerants ----------
    public void AddCustomRefrigerant(string code)
    {
        code = code.Trim().ToUpperInvariant();
        if (string.IsNullOrEmpty(code)) return;
        if (RefrigerantData.BuiltInTypes.Contains(code, StringComparer.OrdinalIgnoreCase)) return;
        if (!State.CustomRefrigerants.Contains(code, StringComparer.OrdinalIgnoreCase))
            State.CustomRefrigerants.Add(code);
        Notify();
    }
    public void RemoveCustomRefrigerant(string code)
    {
        State.CustomRefrigerants.RemoveAll(c => string.Equals(c, code, StringComparison.OrdinalIgnoreCase));
        Notify();
    }
    public void ToggleFavoriteRefrigerant(string code)
    {
        if (State.FavoriteRefrigerants.Contains(code, StringComparer.OrdinalIgnoreCase))
            State.FavoriteRefrigerants.RemoveAll(c => string.Equals(c, code, StringComparison.OrdinalIgnoreCase));
        else
            State.FavoriteRefrigerants.Add(code);
        Notify();
    }

    // ---------- Bottle presets ----------
    public void AddCustomBottlePreset(BottlePreset p) { p.Custom = true; State.CustomBottlePresets.Add(p); Notify(); }
    public void RemoveCustomBottlePreset(string id) { State.CustomBottlePresets.RemoveAll(p => p.Id == id); Notify(); }
    public void ToggleFavoriteBottlePreset(string id)
    {
        if (State.FavoriteBottlePresets.Contains(id))
            State.FavoriteBottlePresets.Remove(id);
        else
            State.FavoriteBottlePresets.Add(id);
        Notify();
    }

    // ---------- Bulk ----------
    public void ResetAll()
    {
        var techs = State.Technicians;
        var active = State.ActiveTechnicianId;
        var loc = State.Location;
        var unit = State.Unit;
        var theme = State.Theme;
        var clock = State.Clock;
        var biz = State.BusinessName;
        var rta = State.ArcAuthorisationNumber;
        State = new AppState
        {
            Technicians = techs,
            ActiveTechnicianId = active,
            Location = loc,
            Unit = unit,
            Theme = theme,
            Clock = clock,
            BusinessName = biz,
            ArcAuthorisationNumber = rta,
        };
        Notify();
    }

    public void ImportState(AppState incoming)
    {
        State = MigrateLegacy(incoming);
        Notify();
    }
}
