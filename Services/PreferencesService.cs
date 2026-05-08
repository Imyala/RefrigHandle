namespace RefrigHandle.Services;

/// <summary>
/// Thin wrapper over <see cref="Microsoft.Maui.Storage.Preferences"/> for
/// UI-only state (filters, collapsed sections) that we want to survive
/// process restarts but not pollute the exported AppState.
/// </summary>
public class PreferencesService
{
    public string GetString(string key, string fallback = "") =>
        Preferences.Default.Get(key, fallback);

    public void SetString(string key, string value) =>
        Preferences.Default.Set(key, value);

    public bool GetBool(string key, bool fallback = false) =>
        Preferences.Default.Get(key, fallback);

    public void SetBool(string key, bool value) =>
        Preferences.Default.Set(key, value);
}
