namespace RefrigHandle.Services;

public record ConfirmRequest(
    string Message,
    string Title,
    string ConfirmLabel,
    string CancelLabel,
    bool Danger,
    TaskCompletionSource<bool> Completion);

public class ConfirmService
{
    public ConfirmRequest? Pending { get; private set; }
    public event Action? OnChange;

    public Task<bool> AskAsync(
        string message,
        string title = "Confirm",
        string confirmLabel = "Confirm",
        string cancelLabel = "Cancel",
        bool danger = false)
    {
        var tcs = new TaskCompletionSource<bool>();
        Pending = new ConfirmRequest(message, title, confirmLabel, cancelLabel, danger, tcs);
        OnChange?.Invoke();
        return tcs.Task;
    }

    public void Resolve(bool result)
    {
        var p = Pending;
        Pending = null;
        OnChange?.Invoke();
        p?.Completion.TrySetResult(result);
    }
}
