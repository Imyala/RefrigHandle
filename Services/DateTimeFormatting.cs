using RefrigHandle.Models;

namespace RefrigHandle.Services;

public static class DateTimeFormatting
{
    public static TimeZoneInfo ResolveZone(LocationSettings? loc)
    {
        if (loc is not null && !string.IsNullOrEmpty(loc.Timezone))
        {
            try { return TimeZoneInfo.FindSystemTimeZoneById(loc.Timezone); }
            catch { /* fall through */ }
        }
        return TimeZoneInfo.Local;
    }

    public static DateTime ToZone(DateTime utc, TimeZoneInfo zone) =>
        TimeZoneInfo.ConvertTimeFromUtc(
            utc.Kind == DateTimeKind.Utc ? utc : utc.ToUniversalTime(),
            zone);

    public static string FormatDateTime(string? iso, AppState state)
    {
        if (string.IsNullOrEmpty(iso) || !DateTime.TryParse(iso, out var dt)) return "";
        var zone = ResolveZone(state.Location);
        var local = ToZone(dt, zone);
        var pattern = state.Clock == ClockFormat.TwelveHour
            ? "yyyy-MM-dd h:mm tt"
            : "yyyy-MM-dd HH:mm";
        return local.ToString(pattern);
    }

    public static string FormatDate(string? iso) =>
        string.IsNullOrEmpty(iso) || !DateTime.TryParse(iso, out var dt)
            ? ""
            : dt.ToString("yyyy-MM-dd");

    /// <summary>Convert a "yyyy-MM-ddTHH:mm" local string in the configured TZ to UTC ISO.</summary>
    public static string LocalInputToIso(string localValue, AppState state)
    {
        if (string.IsNullOrEmpty(localValue)) return "";
        if (!DateTime.TryParse(localValue, out var local)) return localValue;
        var zone = ResolveZone(state.Location);
        var unspecified = DateTime.SpecifyKind(local, DateTimeKind.Unspecified);
        var utc = TimeZoneInfo.ConvertTimeToUtc(unspecified, zone);
        return utc.ToString("o");
    }

    /// <summary>Render an ISO timestamp into a "yyyy-MM-ddTHH:mm" local string in the configured TZ for &lt;input type="datetime-local"&gt;.</summary>
    public static string IsoToLocalInput(string? iso, AppState state)
    {
        if (string.IsNullOrEmpty(iso) || !DateTime.TryParse(iso, out var dt)) return "";
        var zone = ResolveZone(state.Location);
        var local = ToZone(dt, zone);
        return local.ToString("yyyy-MM-ddTHH:mm");
    }
}
