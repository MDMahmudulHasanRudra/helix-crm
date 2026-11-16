using System.Text;
using Microsoft.AspNetCore.Mvc;

namespace HelixCrm.Api.Common;

public static class CsvWriter
{
    public static FileContentResult Build(string fileName, string[] headers, IEnumerable<IEnumerable<string?>> rows)
    {
        var sb = new StringBuilder();
        sb.AppendLine(string.Join(',', headers.Select(Escape)));
        foreach (var row in rows)
            sb.AppendLine(string.Join(',', row.Select(Escape)));

        var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(sb.ToString())).ToArray();
        return new FileContentResult(bytes, "text/csv") { FileDownloadName = fileName };
    }

    private static string Escape(string? value)
    {
        var text = value ?? "";
        if (text.Contains(',') || text.Contains('"') || text.Contains('\n') || text.Contains('\r'))
            return $"\"{text.Replace("\"", "\"\"")}\"";
        return text;
    }
}
