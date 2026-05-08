using System.Security.Cryptography;
using System.Text;

namespace RefrigHandle.Services;

public static class Auth
{
    public static string HashPassword(string technicianId, string password)
    {
        var input = Encoding.UTF8.GetBytes($"{technicianId}:{password}");
        var hash = SHA256.HashData(input);
        var sb = new StringBuilder(hash.Length * 2);
        foreach (var b in hash) sb.Append(b.ToString("x2"));
        return sb.ToString();
    }

    public static bool VerifyPassword(string technicianId, string password, string hash)
        => string.Equals(HashPassword(technicianId, password), hash, StringComparison.Ordinal);
}
