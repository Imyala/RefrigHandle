namespace RefrigHandle.Models;

public class Unit
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string SiteId { get; set; } = "";
    public string Name { get; set; } = "";
    public UnitKind? Kind { get; set; }
    public string? RefrigerantType { get; set; }
    public double? RefrigerantCharge { get; set; }
    public string? Manufacturer { get; set; }
    public string? Model { get; set; }
    public string? Serial { get; set; }
    public string? InstallDate { get; set; }
    public UnitStatus Status { get; set; } = UnitStatus.Active;
    public string? DecommissionedAt { get; set; }
    public string? DecommissionedReason { get; set; }
    public string? Notes { get; set; }
    public string CreatedAt { get; set; } = DateTime.UtcNow.ToString("o");
}
