using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HelixCrm.Api.Migrations
{
    /// <inheritdoc />
    public partial class EmailLayer : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "EmailDailyLimit",
                table: "Organizations",
                type: "integer",
                nullable: false,
                defaultValue: 300);

            migrationBuilder.AddColumn<Guid>(
                name: "EmailMessageId",
                table: "Activities",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "EmailAccounts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    FromName = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    FromAddress = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    ReplyToAddress = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: true),
                    SmtpHost = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    SmtpPort = table.Column<int>(type: "integer", nullable: false),
                    SmtpSecurity = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    SmtpUsername = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    SmtpPasswordCipher = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    ImapHost = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ImapPort = table.Column<int>(type: "integer", nullable: false),
                    ImapSecurity = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ImapUsername = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    ImapPasswordCipher = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    ImapFolder = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ImapEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    LastImapUid = table.Column<long>(type: "bigint", nullable: true),
                    LastImapSyncAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    IsDefault = table.Column<bool>(type: "boolean", nullable: false),
                    LastVerifiedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastError = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedById = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedById = table.Column<Guid>(type: "uuid", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EmailAccounts", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "EmailSuppressions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    Reason = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedById = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedById = table.Column<Guid>(type: "uuid", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EmailSuppressions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "EmailMessages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EmailAccountId = table.Column<Guid>(type: "uuid", nullable: true),
                    Direction = table.Column<string>(type: "character varying(12)", maxLength: 12, nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    FromAddress = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    FromName = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    ToAddress = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    ToName = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Cc = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    Bcc = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    Subject = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: false),
                    TextBody = table.Column<string>(type: "text", nullable: true),
                    HtmlBody = table.Column<string>(type: "text", nullable: true),
                    MessageId = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: true),
                    InReplyTo = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: true),
                    References = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    RelatedType = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    RelatedId = table.Column<Guid>(type: "uuid", nullable: true),
                    ContactId = table.Column<Guid>(type: "uuid", nullable: true),
                    ActivityId = table.Column<Guid>(type: "uuid", nullable: true),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    MaxAttempts = table.Column<int>(type: "integer", nullable: false),
                    NextAttemptAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    SentAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    FailureReason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    NeedsReview = table.Column<bool>(type: "boolean", nullable: false),
                    ImapFolder = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ImapUid = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    ReceivedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedById = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedById = table.Column<Guid>(type: "uuid", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EmailMessages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EmailMessages_EmailAccounts_EmailAccountId",
                        column: x => x.EmailAccountId,
                        principalTable: "EmailAccounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Activities_OrganizationId_EmailMessageId",
                table: "Activities",
                columns: new[] { "OrganizationId", "EmailMessageId" });

            migrationBuilder.CreateIndex(
                name: "IX_EmailAccounts_OrganizationId_IsActive",
                table: "EmailAccounts",
                columns: new[] { "OrganizationId", "IsActive" });

            migrationBuilder.CreateIndex(
                name: "IX_EmailMessages_EmailAccountId",
                table: "EmailMessages",
                column: "EmailAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_EmailMessages_OrganizationId_Direction_Status",
                table: "EmailMessages",
                columns: new[] { "OrganizationId", "Direction", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_EmailMessages_OrganizationId_EmailAccountId_ImapFolder_Imap~",
                table: "EmailMessages",
                columns: new[] { "OrganizationId", "EmailAccountId", "ImapFolder", "ImapUid" },
                unique: true,
                filter: "\"ImapUid\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_EmailMessages_OrganizationId_MessageId",
                table: "EmailMessages",
                columns: new[] { "OrganizationId", "MessageId" },
                unique: true,
                filter: "\"MessageId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_EmailMessages_OrganizationId_NextAttemptAt",
                table: "EmailMessages",
                columns: new[] { "OrganizationId", "NextAttemptAt" });

            migrationBuilder.CreateIndex(
                name: "IX_EmailMessages_OrganizationId_RelatedType_RelatedId",
                table: "EmailMessages",
                columns: new[] { "OrganizationId", "RelatedType", "RelatedId" });

            migrationBuilder.CreateIndex(
                name: "IX_EmailSuppressions_OrganizationId_Email",
                table: "EmailSuppressions",
                columns: new[] { "OrganizationId", "Email" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EmailMessages");

            migrationBuilder.DropTable(
                name: "EmailSuppressions");

            migrationBuilder.DropTable(
                name: "EmailAccounts");

            migrationBuilder.DropIndex(
                name: "IX_Activities_OrganizationId_EmailMessageId",
                table: "Activities");

            migrationBuilder.DropColumn(
                name: "EmailDailyLimit",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "EmailMessageId",
                table: "Activities");
        }
    }
}
