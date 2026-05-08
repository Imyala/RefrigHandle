namespace RefrigHandle.Models;

public class Technician
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Name { get; set; } = "";
    public string ArcLicenceNumber { get; set; } = "";
    public string? PasswordHash { get; set; }
    public string CreatedAt { get; set; } = DateTime.UtcNow.ToString("o");
}
