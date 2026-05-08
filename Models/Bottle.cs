namespace RefrigHandle.Models;

public class Bottle
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string BottleNumber { get; set; } = "";
    public string RefrigerantType { get; set; } = "R410A";
    public double TareWeight { get; set; }
    public double GrossWeight { get; set; }
    public double InitialNetWeight { get; set; }
    public BottleStatus Status { get; set; } = BottleStatus.InStock;
    public string? CurrentSiteId { get; set; }
    public string? Notes { get; set; }
    public string? LastHydroTestDate { get; set; }
    public string? NextHydroTestDate { get; set; }
    public string CreatedAt { get; set; } = DateTime.UtcNow.ToString("o");
    public string? CreatedBy { get; set; }
    public string? CreatedByLicence { get; set; }
    public string UpdatedAt { get; set; } = DateTime.UtcNow.ToString("o");
}
