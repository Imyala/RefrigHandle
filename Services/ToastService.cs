namespace RefrigHandle.Services;

public enum ToastKind { Info, Success, Error }

public record Toast(Guid Id, string Message, ToastKind Kind);

public class ToastService
{
    private readonly List<Toast> _toasts = new();
    public IReadOnlyList<Toast> Toasts => _toasts;
    public event Action? OnChange;

    public void Show(string message, ToastKind kind = ToastKind.Info, int durationMs = 3500)
    {
        var t = new Toast(Guid.NewGuid(), message, kind);
        _toasts.Add(t);
        OnChange?.Invoke();
        _ = Task.Delay(durationMs).ContinueWith(_ =>
        {
            _toasts.Remove(t);
            OnChange?.Invoke();
        });
    }
}
