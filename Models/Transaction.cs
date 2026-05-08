namespace RefrigHandle.Models;

public class RefrigerantMismatch
{
    public string BottleType { get; set; } = "";
    public string UnitType { get; set; } = "";
}

public class Transaction
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string BottleId { get; set; } = "";
    public string? SourceBottleId { get; set; }
    public double? SourceWeightBefore { get; set; }
    public double? SourceWeightAfter { get; set; }
    public string? SiteId { get; set; }
    public string? UnitId { get; set; }
    public TransactionKind Kind { get; set; }
    public double Amount { get; set; }
    public double? BottleAmount { get; set; }
    public double WeightBefore { get; set; }
    public double WeightAfter { get; set; }
    public string Date { get; set; } = DateTime.UtcNow.ToString("o");
    public string? Technician { get; set; }
    public string? TechnicianLicence { get; set; }
    public string? BusinessName { get; set; }
    public string? ArcAuthorisationNumber { get; set; }
    public string? Equipment { get; set; }
    public TransactionReason? Reason { get; set; }
    public string? Notes { get; set; }
    public string? ReturnDestination { get; set; }
    public RefrigerantMismatch? RefrigerantMismatch { get; set; }
    public string? DeletedAt { get; set; }
    public string? DeletedBy { get; set; }
    public string? DeletedByLicence { get; set; }
    public string? DeletedReason { get; set; }
}
