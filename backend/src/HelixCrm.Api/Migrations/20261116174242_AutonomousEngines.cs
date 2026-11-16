using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HelixCrm.Api.Migrations
{
    /// <inheritdoc />
    public partial class AutonomousEngines : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "EscalationLevel",
                table: "Tickets",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "SlaBreached",
                table: "Tickets",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "SlaWarnedAt",
                table: "Tickets",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "AutoRouteLeads",
                table: "Organizations",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "AutonomousEnabled",
                table: "Organizations",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<int>(
                name: "DataFreshnessDays",
                table: "Organizations",
                type: "integer",
                nullable: false,
                defaultValue: 180);

            migrationBuilder.AddColumn<int>(
                name: "LeadScoreRoutingThreshold",
                table: "Organizations",
                type: "integer",
                nullable: false,
                defaultValue: 75);

            migrationBuilder.AddColumn<int>(
                name: "StaleDealDays",
                table: "Organizations",
                type: "integer",
                nullable: false,
                defaultValue: 14);

            migrationBuilder.AddColumn<int>(
                name: "StaleDealProbabilityPenalty",
                table: "Organizations",
                type: "integer",
                nullable: false,
                defaultValue: 15);

            migrationBuilder.AddColumn<string>(
                name: "RoutingState",
                table: "Leads",
                type: "text",
                nullable: false,
                defaultValue: "Unrouted");

            migrationBuilder.AddColumn<string>(
                name: "ScoreBreakdownJson",
                table: "Leads",
                type: "text",
                nullable: false,
                defaultValue: "{}");

            migrationBuilder.AddColumn<DateTime>(
                name: "ScoreUpdatedAt",
                table: "Leads",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "HealthIndex",
                table: "Deals",
                type: "integer",
                nullable: false,
                defaultValue: 100);

            migrationBuilder.AddColumn<bool>(
                name: "IsStalled",
                table: "Deals",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastStageMovedAt",
                table: "Deals",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LostReason",
                table: "Deals",
                type: "character varying(60)",
                maxLength: 60,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "DataFreshnessScore",
                table: "Contacts",
                type: "integer",
                nullable: false,
                defaultValue: 100);

            migrationBuilder.AddColumn<bool>(
                name: "IsDuplicateCandidate",
                table: "Contacts",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsStale",
                table: "Contacts",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "DataFreshnessScore",
                table: "Accounts",
                type: "integer",
                nullable: false,
                defaultValue: 100);

            migrationBuilder.AddColumn<string>(
                name: "EnrichmentDataJson",
                table: "Accounts",
                type: "text",
                nullable: false,
                defaultValue: "{}");

            migrationBuilder.AddColumn<bool>(
                name: "IsDuplicateCandidate",
                table: "Accounts",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            // Backfill existing rows so the autonomous workers have sane anchors
            // instead of treating every historical deal as stalled on day one.
            migrationBuilder.Sql("UPDATE \"Deals\" SET \"LastStageMovedAt\" = \"UpdatedAt\" WHERE \"LastStageMovedAt\" IS NULL;");
            migrationBuilder.Sql("UPDATE \"Leads\" SET \"RoutingState\" = 'Assigned' WHERE \"OwnerId\" IS NOT NULL AND \"RoutingState\" = 'Unrouted';");

            migrationBuilder.CreateTable(
                name: "DuplicateCandidates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EntityType = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    PrimaryId = table.Column<Guid>(type: "uuid", nullable: false),
                    DuplicateId = table.Column<Guid>(type: "uuid", nullable: false),
                    Similarity = table.Column<double>(type: "double precision", nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Reason = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedById = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedById = table.Column<Guid>(type: "uuid", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DuplicateCandidates", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Tickets_OrganizationId_SlaBreached",
                table: "Tickets",
                columns: new[] { "OrganizationId", "SlaBreached" });

            migrationBuilder.CreateIndex(
                name: "IX_Deals_OrganizationId_IsStalled",
                table: "Deals",
                columns: new[] { "OrganizationId", "IsStalled" });

            migrationBuilder.CreateIndex(
                name: "IX_Contacts_OrganizationId_IsStale",
                table: "Contacts",
                columns: new[] { "OrganizationId", "IsStale" });

            migrationBuilder.CreateIndex(
                name: "IX_DuplicateCandidates_OrganizationId_EntityType_PrimaryId_Dup~",
                table: "DuplicateCandidates",
                columns: new[] { "OrganizationId", "EntityType", "PrimaryId", "DuplicateId" });

            migrationBuilder.CreateIndex(
                name: "IX_DuplicateCandidates_OrganizationId_Status",
                table: "DuplicateCandidates",
                columns: new[] { "OrganizationId", "Status" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DuplicateCandidates");

            migrationBuilder.DropIndex(
                name: "IX_Tickets_OrganizationId_SlaBreached",
                table: "Tickets");

            migrationBuilder.DropIndex(
                name: "IX_Deals_OrganizationId_IsStalled",
                table: "Deals");

            migrationBuilder.DropIndex(
                name: "IX_Contacts_OrganizationId_IsStale",
                table: "Contacts");

            migrationBuilder.DropColumn(
                name: "EscalationLevel",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "SlaBreached",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "SlaWarnedAt",
                table: "Tickets");

            migrationBuilder.DropColumn(
                name: "AutoRouteLeads",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "AutonomousEnabled",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "DataFreshnessDays",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "LeadScoreRoutingThreshold",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "StaleDealDays",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "StaleDealProbabilityPenalty",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "RoutingState",
                table: "Leads");

            migrationBuilder.DropColumn(
                name: "ScoreBreakdownJson",
                table: "Leads");

            migrationBuilder.DropColumn(
                name: "ScoreUpdatedAt",
                table: "Leads");

            migrationBuilder.DropColumn(
                name: "HealthIndex",
                table: "Deals");

            migrationBuilder.DropColumn(
                name: "IsStalled",
                table: "Deals");

            migrationBuilder.DropColumn(
                name: "LastStageMovedAt",
                table: "Deals");

            migrationBuilder.DropColumn(
                name: "LostReason",
                table: "Deals");

            migrationBuilder.DropColumn(
                name: "DataFreshnessScore",
                table: "Contacts");

            migrationBuilder.DropColumn(
                name: "IsDuplicateCandidate",
                table: "Contacts");

            migrationBuilder.DropColumn(
                name: "IsStale",
                table: "Contacts");

            migrationBuilder.DropColumn(
                name: "DataFreshnessScore",
                table: "Accounts");

            migrationBuilder.DropColumn(
                name: "EnrichmentDataJson",
                table: "Accounts");

            migrationBuilder.DropColumn(
                name: "IsDuplicateCandidate",
                table: "Accounts");
        }
    }
}
