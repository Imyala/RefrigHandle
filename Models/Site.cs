namespace RefrigHandle.Models;

public class Site
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Name { get; set; } = "";
    public string? Client { get; set; }
    public string? Address { get; set; }
    public string? Notes { get; set; }
    public string CreatedAt { get; set; } = DateTime.UtcNow.ToString("o");
}
