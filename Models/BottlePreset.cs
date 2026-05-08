namespace RefrigHandle.Models;

public class BottlePreset
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Label { get; set; } = "";
    public string? LabelKg { get; set; }
    public string? LabelLb { get; set; }
    public double TareKg { get; set; }
    public double? WaterCapacityKg { get; set; }
    public double? SafeFillKg { get; set; }
    public bool? Custom { get; set; }
}
