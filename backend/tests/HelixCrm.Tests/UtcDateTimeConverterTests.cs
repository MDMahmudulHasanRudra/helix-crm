using System.Text;
using System.Text.Json;
using HelixCrm.Api.Common;

namespace HelixCrm.Tests;

public class UtcDateTimeConverterTests
{
    private static readonly JsonSerializerOptions Options = new()
    {
        Converters = { new UtcDateTimeConverter(), new NullableUtcDateTimeConverter() }
    };

    [Fact]
    public void Deserialize_ConvertsOffsetsToUtc()
    {
        var value = JsonSerializer.Deserialize<DateTime>("\"2026-11-13T16:21:35+06:00\"", Options);

        Assert.Equal(DateTimeKind.Utc, value.Kind);
        Assert.Equal(new DateTime(2026, 11, 13, 10, 21, 35, DateTimeKind.Utc), value);
    }

    [Fact]
    public void Deserialize_TreatsMissingOffsetAsUtc()
    {
        var value = JsonSerializer.Deserialize<DateTime>("\"2026-11-13T10:21:35\"", Options);

        Assert.Equal(DateTimeKind.Utc, value.Kind);
        Assert.Equal(new DateTime(2026, 11, 13, 10, 21, 35, DateTimeKind.Utc), value);
    }

    [Fact]
    public void Deserialize_HandlesZuluAndNullableValues()
    {
        var value = JsonSerializer.Deserialize<DateTime?>("\"2026-11-13T10:21:35Z\"", Options);
        var missing = JsonSerializer.Deserialize<DateTime?>("null", Options);

        Assert.Equal(DateTimeKind.Utc, value!.Value.Kind);
        Assert.Equal(2026, value.Value.Year);
        Assert.Null(missing);
    }

    [Fact]
    public void Serialize_WritesUtcTimestamps()
    {
        var local = new DateTime(2026, 11, 13, 16, 21, 35, DateTimeKind.Local);
        var json = JsonSerializer.Serialize(local, Options);

        Assert.Contains("2026-11-13T", json);
        Assert.EndsWith("Z\"", json);
    }
}
