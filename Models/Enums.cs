using System.Text.Json.Serialization;

namespace RefrigHandle.Models;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum BottleStatus
{
    [JsonStringEnumMemberName("in_stock")] InStock,
    [JsonStringEnumMemberName("on_site")] OnSite,
    [JsonStringEnumMemberName("stationed")] Stationed,
    [JsonStringEnumMemberName("returned")] Returned,
    [JsonStringEnumMemberName("empty")] Empty,
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum UnitStatus
{
    [JsonStringEnumMemberName("active")] Active,
    [JsonStringEnumMemberName("decommissioned")] Decommissioned,
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum UnitKind
{
    [JsonStringEnumMemberName("split")] Split,
    [JsonStringEnumMemberName("split_ducted")] SplitDucted,
    [JsonStringEnumMemberName("multi_head_split")] MultiHeadSplit,
    [JsonStringEnumMemberName("vrf_vrv")] VrfVrv,
    [JsonStringEnumMemberName("heat_pump")] HeatPump,
    [JsonStringEnumMemberName("package")] Package,
    [JsonStringEnumMemberName("chiller")] Chiller,
    [JsonStringEnumMemberName("air_handler_dx")] AirHandlerDx,
    [JsonStringEnumMemberName("air_handler_chw")] AirHandlerChw,
    [JsonStringEnumMemberName("refrigeration")] Refrigeration,
    [JsonStringEnumMemberName("chilled_water_pump")] ChilledWaterPump,
    [JsonStringEnumMemberName("cooling_tower")] CoolingTower,
    [JsonStringEnumMemberName("boiler")] Boiler,
    [JsonStringEnumMemberName("other")] Other,
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum TransactionKind
{
    [JsonStringEnumMemberName("charge")] Charge,
    [JsonStringEnumMemberName("recover")] Recover,
    [JsonStringEnumMemberName("transfer")] Transfer,
    [JsonStringEnumMemberName("station")] Station,
    [JsonStringEnumMemberName("return")] Return,
    [JsonStringEnumMemberName("adjust")] Adjust,
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum TransactionReason
{
    [JsonStringEnumMemberName("install")] Install,
    [JsonStringEnumMemberName("service")] Service,
    [JsonStringEnumMemberName("leak_repair")] LeakRepair,
    [JsonStringEnumMemberName("top_up")] TopUp,
    [JsonStringEnumMemberName("decommission")] Decommission,
    [JsonStringEnumMemberName("other")] Other,
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum WeightUnit
{
    [JsonStringEnumMemberName("kg")] Kg,
    [JsonStringEnumMemberName("lb")] Lb,
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ThemePreference
{
    [JsonStringEnumMemberName("system")] System,
    [JsonStringEnumMemberName("light")] Light,
    [JsonStringEnumMemberName("dark")] Dark,
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ClockFormat
{
    [JsonStringEnumMemberName("12h")] TwelveHour,
    [JsonStringEnumMemberName("24h")] TwentyFourHour,
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum LeakLevel
{
    [JsonStringEnumMemberName("ok")] Ok,
    [JsonStringEnumMemberName("watch")] Watch,
    [JsonStringEnumMemberName("suspected")] Suspected,
    [JsonStringEnumMemberName("unknown")] Unknown,
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum HydroStatus
{
    [JsonStringEnumMemberName("ok")] Ok,
    [JsonStringEnumMemberName("due_soon")] DueSoon,
    [JsonStringEnumMemberName("overdue")] Overdue,
    [JsonStringEnumMemberName("unknown")] Unknown,
}
