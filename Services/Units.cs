using RefrigHandle.Models;

namespace RefrigHandle.Services;

public static class Units
{
    public const double KgPerLb = 0.45359237;

    public static double KgToDisplay(double kg, WeightUnit unit)
        => unit == WeightUnit.Kg ? kg : kg / KgPerLb;

    public static double DisplayToKg(double value, WeightUnit unit)
        => unit == WeightUnit.Kg ? value : value * KgPerLb;

    // 1g resolution
    public static double RoundKg(double kg) => Math.Round(kg * 1000) / 1000.0;

    public static string Label(WeightUnit unit) => unit == WeightUnit.Kg ? "kg" : "lb";

    public static string FormatWeight(double kg, WeightUnit unit, int decimals = 2)
    {
        var v = KgToDisplay(kg, unit);
        return v.ToString("F" + decimals) + " " + Label(unit);
    }
}
