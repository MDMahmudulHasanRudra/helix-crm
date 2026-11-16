using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HelixCrm.Api.Migrations
{
    /// <inheritdoc />
    public partial class FilteredCustomFieldKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CustomFieldDefinitions_OrganizationId_EntityType_Key",
                table: "CustomFieldDefinitions");

            migrationBuilder.CreateIndex(
                name: "IX_CustomFieldDefinitions_OrganizationId_EntityType_Key",
                table: "CustomFieldDefinitions",
                columns: new[] { "OrganizationId", "EntityType", "Key" },
                unique: true,
                filter: "\"IsDeleted\" = false");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CustomFieldDefinitions_OrganizationId_EntityType_Key",
                table: "CustomFieldDefinitions");

            migrationBuilder.CreateIndex(
                name: "IX_CustomFieldDefinitions_OrganizationId_EntityType_Key",
                table: "CustomFieldDefinitions",
                columns: new[] { "OrganizationId", "EntityType", "Key" },
                unique: true);
        }
    }
}
