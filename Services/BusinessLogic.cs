using RefrigHandle.Models;

namespace RefrigHandle.Services;

public record LeakState(LeakLevel Level, double TopUpKg, double Fraction, int WindowDays);
public record HydroState(HydroStatus Status, int? DaysUntilDue);

public static class BusinessLogic
{
    public const double LeakWatchFraction = 0.05;       // 5%
    public const double LeakSuspectedFraction = 0.10;   // 10%
    public const int LeakTrailingDays = 365;
    public const int HydroDueSoonDays = 60;

    public static double NetWeight(Bottle b) => Math.Max(0, b.GrossWeight - b.TareWeight);

    public static double TransactionLoss(Transaction t) => t.Kind switch
    {
        TransactionKind.Charge =>
            Math.Max(0, (t.BottleAmount ?? t.Amount) - t.Amount),     // left in hoses
        TransactionKind.Recover =>
            Math.Max(0, t.Amount - (t.BottleAmount ?? t.Amount)),     // didn't make it in
        _ => 0,
    };

    public static LeakState LeakStatusFor(Unit unit, IEnumerable<Transaction> transactions, DateTime? now = null)
    {
        var n = now ?? DateTime.UtcNow;
        var since = n.AddDays(-LeakTrailingDays);
        double topUpKg = 0;
        foreach (var t in transactions)
        {
            if (t.UnitId != unit.Id) continue;
            if (t.Kind != TransactionKind.Charge) continue;
            if (t.Reason == TransactionReason.Install) continue;   // commissioning isn't a top-up
            if (t.DeletedAt is not null) continue;
            if (!DateTime.TryParse(t.Date, out var d)) continue;
            if (d < since) continue;
            topUpKg += t.Amount;
        }
        var charge = unit.RefrigerantCharge ?? 0;
        if (charge <= 0)
        {
            return new LeakState(
                topUpKg > 0 ? LeakLevel.Unknown : LeakLevel.Ok,
                topUpKg, 0, LeakTrailingDays);
        }
        var fraction = topUpKg / charge;
        var level = fraction >= LeakSuspectedFraction ? LeakLevel.Suspected
                  : fraction >= LeakWatchFraction ? LeakLevel.Watch
                  : LeakLevel.Ok;
        return new LeakState(level, topUpKg, fraction, LeakTrailingDays);
    }

    public static HydroState HydroStatusFor(Bottle bottle, DateTime? now = null)
    {
        if (string.IsNullOrEmpty(bottle.NextHydroTestDate))
            return new HydroState(HydroStatus.Unknown, null);

        if (!DateTime.TryParse(bottle.NextHydroTestDate, out var due))
            return new HydroState(HydroStatus.Unknown, null);

        var n = (now ?? DateTime.UtcNow).Date;
        var diff = (int)(due.Date - n).TotalDays;
        if (diff < 0) return new HydroState(HydroStatus.Overdue, diff);
        if (diff <= HydroDueSoonDays) return new HydroState(HydroStatus.DueSoon, diff);
        return new HydroState(HydroStatus.Ok, diff);
    }

    /// <summary>Total kg / count grouped by refrigerant type.</summary>
    public static Dictionary<string, (int Count, double NetKg)> TotalsByType(IEnumerable<Bottle> bottles)
    {
        var totals = new Dictionary<string, (int Count, double NetKg)>(StringComparer.OrdinalIgnoreCase);
        foreach (var b in bottles)
        {
            totals.TryGetValue(b.RefrigerantType, out var cur);
            totals[b.RefrigerantType] = (cur.Count + 1, cur.NetKg + NetWeight(b));
        }
        return totals;
    }

    /// <summary>Apply a transaction's bottle-side effects, returning the new gross weight and updated status.</summary>
    public static (double NewGross, BottleStatus NewStatus, string? NewSiteId) ApplyToBottle(
        Bottle bottle, Transaction t)
    {
        var gross = bottle.GrossWeight;
        var status = bottle.Status;
        var site = bottle.CurrentSiteId;

        switch (t.Kind)
        {
            case TransactionKind.Charge:
                gross -= t.BottleAmount ?? t.Amount;
                break;
            case TransactionKind.Recover:
                gross += t.BottleAmount ?? t.Amount;
                break;
            case TransactionKind.Adjust:
                gross += t.Amount; // signed
                break;
            case TransactionKind.Transfer:
                if (!string.IsNullOrEmpty(t.SiteId))
                {
                    status = BottleStatus.OnSite;
                    site = t.SiteId;
                }
                break;
            case TransactionKind.Station:
                if (!string.IsNullOrEmpty(t.SiteId))
                {
                    status = BottleStatus.Stationed;
                    site = t.SiteId;
                }
                break;
            case TransactionKind.Return:
                status = BottleStatus.Returned;
                site = null;
                break;
        }

        gross = Math.Max(0, Units.RoundKg(gross));
        var net = Math.Max(0, gross - bottle.TareWeight);
        if (net <= 0.01 && status != BottleStatus.Returned)
            status = BottleStatus.Empty;

        return (gross, status, site);
    }
}
