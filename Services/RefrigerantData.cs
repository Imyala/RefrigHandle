using RefrigHandle.Models;

namespace RefrigHandle.Services;

public static class RefrigerantData
{
    public static readonly string[] BuiltInTypes =
    {
        // Legacy CFC / HCFC
        "R12", "R22", "R23", "R401A", "R402A", "R408A", "R409A", "R502",
        // Common HVAC HFC
        "R32", "R134A", "R404A", "R407A", "R407C", "R407F", "R410A",
        // Lower-GWP HFC/HFO blends
        "R448A", "R449A", "R450A", "R452A", "R452B", "R454B", "R455A", "R466A",
        // Refrigeration / low-temp
        "R507A", "R508B",
        // Hydrocarbons
        "R290", "R600", "R600A", "R1270",
        // HFO
        "R1234YF", "R1234ZE", "R1233ZD",
        // Naturals
        "R717", "R744",
    };

    public const double FallbackFr = 0.8;
    public const double SafeFillFraction = 0.8;

    // kg refrigerant per L water capacity (DOT/CFR-49 + AS 2030.5)
    public static readonly Dictionary<string, double> Fr = new(StringComparer.OrdinalIgnoreCase)
    {
        ["R32"] = 0.78, ["R134A"] = 1.04, ["R404A"] = 0.82,
        ["R407A"] = 0.94, ["R407C"] = 0.94, ["R407F"] = 0.95,
        ["R410A"] = 0.94,
        ["R448A"] = 0.94, ["R449A"] = 0.94, ["R450A"] = 1.04,
        ["R452A"] = 0.86, ["R452B"] = 0.91, ["R454B"] = 0.86,
        ["R455A"] = 0.78, ["R466A"] = 0.94,
        ["R507A"] = 0.86, ["R508B"] = 1.04,
        ["R12"] = 1.10, ["R22"] = 1.04, ["R23"] = 1.06,
        ["R401A"] = 1.06, ["R402A"] = 0.95, ["R408A"] = 0.96,
        ["R409A"] = 1.05, ["R502"] = 1.04,
        ["R290"] = 0.43, ["R600"] = 0.42, ["R600A"] = 0.42, ["R1270"] = 0.43,
        ["R1234YF"] = 1.04, ["R1234ZE"] = 1.04, ["R1233ZD"] = 1.20,
        ["R744"] = 0.68, ["R717"] = 0.53,
    };

    // GWP (IPCC AR4, 100-yr) — adopted by Australian Ozone Protection regs
    public static readonly Dictionary<string, double> Gwp = new(StringComparer.OrdinalIgnoreCase)
    {
        ["R12"] = 10900, ["R22"] = 1810, ["R23"] = 14800,
        ["R32"] = 675, ["R134A"] = 1430,
        ["R401A"] = 18, ["R402A"] = 2788, ["R404A"] = 3922,
        ["R407A"] = 2107, ["R407C"] = 1774, ["R407F"] = 1825,
        ["R408A"] = 3152, ["R409A"] = 1585, ["R410A"] = 2088,
        ["R448A"] = 1387, ["R449A"] = 1397, ["R450A"] = 605,
        ["R452A"] = 2141, ["R452B"] = 698, ["R454B"] = 466,
        ["R455A"] = 148, ["R466A"] = 733,
        ["R502"] = 4657, ["R507A"] = 3985, ["R508B"] = 13396,
        ["R290"] = 3, ["R600"] = 4, ["R600A"] = 3, ["R1270"] = 1.8,
        ["R1234YF"] = 4, ["R1234ZE"] = 7, ["R1233ZD"] = 1,
        ["R717"] = 0, ["R744"] = 1,
    };

    public static double SafeFillKgFor(double waterCapacityKg, string? refrigerant)
    {
        var fr = FallbackFr;
        if (!string.IsNullOrEmpty(refrigerant) && Fr.TryGetValue(refrigerant, out var v))
            fr = v;
        return Math.Round(waterCapacityKg * fr * 100) / 100;
    }

    public static double? TonnesCo2eFor(double kg, string? refrigerant)
    {
        if (string.IsNullOrEmpty(refrigerant)) return null;
        if (!Gwp.TryGetValue(refrigerant, out var gwp)) return null;
        return kg * gwp / 1000.0;
    }

    public static readonly HashSet<UnitKind> NonRefrigerantUnitKinds = new()
    {
        UnitKind.AirHandlerChw,
        UnitKind.ChilledWaterPump,
        UnitKind.CoolingTower,
        UnitKind.Boiler,
    };

    public static readonly BottlePreset[] BuiltInPresets =
    {
        new() { Id = "au-rec-11wc", Label = "11WC recovery (N Size)",
                LabelKg = "11WC recovery (N Size, ~10 kg R-410A)",
                LabelLb = "11WC recovery (N Size, ~22 lb R-410A)",
                TareKg = 6.25, WaterCapacityKg = 11 },
        new() { Id = "au-rec-22wc", Label = "22WC recovery (P Size / 50 lb)",
                LabelKg = "22WC recovery (P Size, ~20 kg R-410A)",
                LabelLb = "22WC recovery (50 lb, ~45 lb R-410A)",
                TareKg = 10, WaterCapacityKg = 22 },
        new() { Id = "au-rec-46wc", Label = "46WC recovery",
                LabelKg = "46WC recovery (~43 kg R-410A)",
                LabelLb = "46WC recovery (~95 lb R-410A)",
                TareKg = 21.2, WaterCapacityKg = 46 },
        new() { Id = "au-rec-65wc", Label = "65WC recovery (R Size)",
                LabelKg = "65WC recovery (R Size, ~61 kg R-410A)",
                LabelLb = "65WC recovery (R Size, ~134 lb R-410A)",
                TareKg = 31.3, WaterCapacityKg = 65 },
    };
}
