namespace RefrigHandle.Models;

public class LocationSettings
{
    public string Country { get; set; } = "Australia";
    public string Region { get; set; } = "";
    public string City { get; set; } = "";
    public string Timezone { get; set; } = "Australia/Sydney";
}

public class SyncSettings
{
    public bool Enabled { get; set; }
    public string TeamId { get; set; } = "";
}

public class AppState
{
    public List<Bottle> Bottles { get; set; } = new();
    public List<Site> Sites { get; set; } = new();
    public List<Unit> Units { get; set; } = new();
    public List<Transaction> Transactions { get; set; } = new();
    public List<string> CustomRefrigerants { get; set; } = new();
    public List<string> FavoriteRefrigerants { get; set; } = new();
    public List<BottlePreset> CustomBottlePresets { get; set; } = new();
    public List<string> FavoriteBottlePresets { get; set; } = new();
    public List<Technician> Technicians { get; set; } = new();
    public string? ActiveTechnicianId { get; set; }

    public string Technician { get; set; } = "";
    public string ArcLicenceNumber { get; set; } = "";
    public string ArcAuthorisationNumber { get; set; } = "";
    public string BusinessName { get; set; } = "";
    public LocationSettings Location { get; set; } = new();
    public WeightUnit Unit { get; set; } = WeightUnit.Kg;
    public ThemePreference Theme { get; set; } = ThemePreference.System;
    public ClockFormat Clock { get; set; } = ClockFormat.TwentyFourHour;
    public SyncSettings Sync { get; set; } = new();
}
