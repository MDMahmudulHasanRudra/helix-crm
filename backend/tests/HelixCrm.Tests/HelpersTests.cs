using HelixCrm.Api.Common;

namespace HelixCrm.Tests;

public class HelpersTests
{
    [Fact]
    public void Clean_TrimsAndTruncates()
    {
        Assert.Equal("hello", "  hello  ".Clean());
        Assert.Equal("abc", "abcdef".Clean(3));
        Assert.Equal("", ((string?)null).Clean());
    }

    [Fact]
    public void JsonStringList_HandlesMissingAndMalformedValues()
    {
        Assert.Empty(Json.StringList(null));
        Assert.Empty(Json.StringList(""));
        Assert.Empty(Json.StringList("not json"));
        Assert.Equal(["Enterprise", "Global"], Json.StringList("[\"Enterprise\",\"Global\"]"));
    }

    [Fact]
    public void JsonMap_RoundTripsCustomFields()
    {
        var map = Json.Map("{\"tier\":\"Gold\",\"region\":null}");
        Assert.Equal("Gold", map["tier"]);
        Assert.Null(map["region"]);
        Assert.Empty(Json.Map(null));
    }

    [Fact]
    public void PagedResult_ComputesNavigation()
    {
        var page = new PagedResult<int>([1, 2], 5, 1, 2);
        Assert.Equal(3, page.TotalPages);
        Assert.True(page.HasNext);
        Assert.False(page.HasPrevious);

        var last = new PagedResult<int>([5], 5, 3, 2);
        Assert.Equal(3, last.TotalPages);
        Assert.False(last.HasNext);
        Assert.True(last.HasPrevious);

        Assert.Equal(0, new PagedResult<int>([], 0, 1, 0).TotalPages);
    }

    [Fact]
    public void Page_ClampsOutOfRangeValues()
    {
        var values = Enumerable.Range(1, 50).AsQueryable();

        Assert.Equal([1, 2], values.Page(0, 2).ToArray());
        Assert.Equal([49, 50], values.Page(25, 2).ToArray());
        Assert.Equal(1, values.Page(1, 0).Count());
        Assert.Equal(50, values.Page(1, 10_000).Count());
    }

    [Fact]
    public void PasswordHasher_VerifiesOnlyTheOriginalPassword()
    {
        var hash = PasswordHasher.Hash("Admin@123");

        Assert.True(PasswordHasher.Verify("Admin@123", hash));
        Assert.False(PasswordHasher.Verify("admin@123", hash));
        Assert.False(PasswordHasher.Verify("Admin@123", "garbage"));
        Assert.False(PasswordHasher.Verify("Admin@123", "12.not-base64.not-base64"));
    }
}
