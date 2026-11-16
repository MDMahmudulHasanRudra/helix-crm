using System.Text;
using HelixCrm.Api.Common;

namespace HelixCrm.Tests;

public class CsvWriterTests
{
    [Fact]
    public void Build_WritesUtf8BomAndEscapesSpecialCharacters()
    {
        var result = CsvWriter.Build("accounts.csv",
            ["Name", "Notes"],
            [
                ["Acme, Inc.", "He said \"hello\""],
                ["Northwind", "line one\nline two"]
            ]);

        Assert.Equal("text/csv", result.ContentType);
        Assert.Equal("accounts.csv", result.FileDownloadName);

        var bytes = result.FileContents;
        Assert.Equal(Encoding.UTF8.GetPreamble(), bytes.Take(3));

        var text = Encoding.UTF8.GetString(bytes.Skip(3).ToArray());
        var lines = text.Split(Environment.NewLine, StringSplitOptions.RemoveEmptyEntries);

        Assert.Equal("Name,Notes", lines[0]);
        Assert.Equal("\"Acme, Inc.\",\"He said \"\"hello\"\"\"", lines[1]);
        Assert.Contains("line one", lines[2]);
    }

    [Fact]
    public void Build_EmitsHeaderForEmptyDataset()
    {
        var result = CsvWriter.Build("empty.csv", ["A", "B"], []);

        var text = Encoding.UTF8.GetString(result.FileContents.Skip(3).ToArray());
        Assert.Equal("A,B" + Environment.NewLine, text);
    }
}
