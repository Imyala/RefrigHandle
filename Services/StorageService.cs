using System.Text.Json;
using RefrigHandle.Models;

namespace RefrigHandle.Services;

public enum LoadStatus { Ok, Empty, Corrupted }

public record LoadResult(AppState State, LoadStatus Status, string? CorruptedBackupPath);

public class StorageService
{
    private const string FileName = "refrighandle.v1.json";

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    };

    private static readonly JsonSerializerOptions JsonOptsPretty = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    };

    private string Path => System.IO.Path.Combine(FileSystem.AppDataDirectory, FileName);

    public LoadResult Load()
    {
        try
        {
            if (!File.Exists(Path))
                return new LoadResult(new AppState(), LoadStatus.Empty, null);

            var json = File.ReadAllText(Path);
            if (string.IsNullOrWhiteSpace(json))
                return new LoadResult(new AppState(), LoadStatus.Empty, null);

            var state = JsonSerializer.Deserialize<AppState>(json, JsonOpts);
            return state is null
                ? new LoadResult(new AppState(), LoadStatus.Empty, null)
                : new LoadResult(state, LoadStatus.Ok, null);
        }
        catch
        {
            var stamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH-mm-ss-fffZ");
            var backup = Path + ".corrupted." + stamp;
            try { File.Move(Path, backup); } catch { /* best effort */ }
            return new LoadResult(new AppState(), LoadStatus.Corrupted, backup);
        }
    }

    public void Save(AppState state)
    {
        Directory.CreateDirectory(FileSystem.AppDataDirectory);
        var json = JsonSerializer.Serialize(state, JsonOpts);
        File.WriteAllText(Path, json);
    }

    public string ExportJson(AppState state) =>
        JsonSerializer.Serialize(state, JsonOptsPretty);

    public AppState? ImportJson(string json) =>
        JsonSerializer.Deserialize<AppState>(json, JsonOpts);

    public string ExportFileName()
    {
        var stamp = DateTime.UtcNow.ToString("yyyy-MM-ddTHH-mm-ssZ");
        return $"refrighandle-{stamp}.json";
    }
}
