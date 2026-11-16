using HelixCrm.Api.Common;
using HelixCrm.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace HelixCrm.Api.Data;

public static class DbInitializer
{
    public static async Task InitializeAsync(IServiceProvider services, ILogger logger, IConfiguration configuration)
    {
        for (var attempt = 1; attempt <= 15; attempt++)
        {
            try
            {
                using var scope = services.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<HelixDbContext>();
                await db.Database.MigrateAsync();
                await DbSeeder.SeedAsync(db, logger);
                return;
            }
            catch (Exception ex) when (attempt < 15)
            {
                logger.LogWarning("Database not ready (attempt {Attempt}/15): {Message}", attempt, ex.Message);
                await Task.Delay(TimeSpan.FromSeconds(2));
            }
        }
    }
}

public static class DbSeeder
{
    public static async Task SeedAsync(HelixDbContext db, ILogger logger)
    {
        if (await db.Organizations.AnyAsync()) return;

        db.AuditEnabled = false;
        var now = DateTime.UtcNow;
        var random = new Random(42);

        var organization = new Organization
        {
            Name = "Northstar Labs",
            Slug = "northstar-labs",
            Currency = "USD",
            TimeZone = "America/Los_Angeles",
            CreatedAt = now.AddMonths(-14),
            AutonomousEnabled = true,
            AutoRouteLeads = true,
            StaleDealDays = 14,
            StaleDealProbabilityPenalty = 15,
            DataFreshnessDays = 180,
            LeadScoreRoutingThreshold = 75
        };
        db.Organizations.Add(organization);

        var users = new List<User>
        {
            NewUser(organization.Id, "avery@helixcrm.dev", "Avery", "Morgan", "VP Revenue", Roles.Admin, "Admin@123", now),
            NewUser(organization.Id, "jordan@helixcrm.dev", "Jordan", "Lee", "Sales Manager", Roles.Manager, "Demo@123", now),
            NewUser(organization.Id, "sofia@helixcrm.dev", "Sofia", "Ramirez", "Account Executive", Roles.Rep, "Demo@123", now),
            NewUser(organization.Id, "noah@helixcrm.dev", "Noah", "Chen", "Account Executive", Roles.Rep, "Demo@123", now),
            NewUser(organization.Id, "maya@helixcrm.dev", "Maya", "Patel", "Customer Success Lead", Roles.Rep, "Demo@123", now)
        };
        db.Users.AddRange(users);

        var salesPipeline = new Pipeline
        {
            OrganizationId = organization.Id,
            Name = "Sales Pipeline",
            IsDefault = true,
            CreatedAt = now.AddMonths(-14)
        };
        var enterprisePipeline = new Pipeline
        {
            OrganizationId = organization.Id,
            Name = "Enterprise Deals",
            IsDefault = false,
            CreatedAt = now.AddMonths(-10)
        };
        var salesStages = new List<Stage>
        {
            NewStage(organization.Id, salesPipeline, "Qualification", 0, 10, "#6366f1", now),
            NewStage(organization.Id, salesPipeline, "Discovery", 1, 25, "#8b5cf6", now),
            NewStage(organization.Id, salesPipeline, "Proposal", 2, 45, "#f59e0b", now),
            NewStage(organization.Id, salesPipeline, "Negotiation", 3, 70, "#ec4899", now),
            NewStage(organization.Id, salesPipeline, "Closed Won", 4, 100, "#10b981", now, isWon: true),
            NewStage(organization.Id, salesPipeline, "Closed Lost", 5, 0, "#ef4444", now, isLost: true)
        };
        var enterpriseStages = new List<Stage>
        {
            NewStage(organization.Id, enterprisePipeline, "Prospecting", 0, 10, "#0ea5e9", now),
            NewStage(organization.Id, enterprisePipeline, "Technical Validation", 1, 35, "#6366f1", now),
            NewStage(organization.Id, enterprisePipeline, "Business Case", 2, 55, "#8b5cf6", now),
            NewStage(organization.Id, enterprisePipeline, "Procurement", 3, 80, "#f59e0b", now),
            NewStage(organization.Id, enterprisePipeline, "Closed Won", 4, 100, "#10b981", now, isWon: true),
            NewStage(organization.Id, enterprisePipeline, "Closed Lost", 5, 0, "#ef4444", now, isLost: true)
        };
        salesPipeline.Stages = salesStages;
        enterprisePipeline.Stages = enterpriseStages;
        db.Pipelines.AddRange(salesPipeline, enterprisePipeline);

        var accountSeeds = new[]
        {
            new AccountSeed("Northwind Traders", "northwindtraders.com", "Retail", 850, 42_000_000m, "Seattle", "United States", "Strategic", ["Enterprise", "Renewal"], 420),
            new AccountSeed("Acme Corporation", "acme.com", "Manufacturing", 4200, 780_000_000m, "Chicago", "United States", "Strategic", ["Enterprise", "Global"], 510),
            new AccountSeed("Globex Industries", "globex.io", "Technology", 1200, 210_000_000m, "Austin", "United States", "Active", ["Expansion"], 300),
            new AccountSeed("Initech", "initech.com", "Financial Services", 380, 64_000_000m, "New York", "United States", "Active", ["SMB"], 180),
            new AccountSeed("Umbrella Health", "umbrellahealth.org", "Healthcare", 2600, 310_000_000m, "Boston", "United States", "Active", ["Enterprise", "Compliance"], 365),
            new AccountSeed("Vertex Analytics", "vertexanalytics.com", "Data & Analytics", 240, 38_000_000m, "Denver", "United States", "Active", ["High growth"], 220),
            new AccountSeed("Blue Harbor Logistics", "blueharbor.com", "Logistics", 1400, 155_000_000m, "Rotterdam", "Netherlands", "Active", ["EMEA"], 275),
            new AccountSeed("Lumen Financial", "lumenfinancial.com", "Financial Services", 900, 480_000_000m, "London", "United Kingdom", "Active", ["Enterprise", "Regulated"], 390),
            new AccountSeed("Redwood Retail", "redwoodretail.com", "Retail", 620, 92_000_000m, "Portland", "United States", "Active", ["Multi-store"], 160),
            new AccountSeed("Cobalt Systems", "cobaltsystems.dev", "Technology", 150, 19_000_000m, "Toronto", "Canada", "Active", ["Startup"], 130),
            new AccountSeed("Beacon Media", "beaconmedia.co", "Media", 310, 27_000_000m, "Sydney", "Australia", "Active", ["APAC"], 200),
            new AccountSeed("Atlas Manufacturing", "atlasmfg.com", "Manufacturing", 1900, 260_000_000m, "Detroit", "United States", "Active", ["Enterprise", "Field service"], 340)
        };

        var accounts = new List<Account>();
        for (var i = 0; i < accountSeeds.Length; i++)
        {
            var s = accountSeeds[i];
            var owner = users[i % users.Count];
            var accountUpdatedAt = now.AddDays(-random.Next(0, 12));
            var account = new Account
            {
                OrganizationId = organization.Id,
                Name = s.Name,
                Domain = s.Domain,
                Website = $"https://{s.Domain}",
                Industry = s.Industry,
                Employees = s.Employees,
                AnnualRevenue = s.Revenue,
                Phone = $"+1 (415) 555-{1000 + i:0000}",
                Email = $"hello@{s.Domain}",
                Street = $"{100 + i * 17} Market Street",
                City = s.City,
                State = "",
                PostalCode = $"9{4000 + i}",
                Country = s.Country,
                Status = "Active",
                Description = $"{s.Name} is a {s.Industry.ToLowerInvariant()} company. {s.Name} has been a valued relationship since {now.AddMonths(-s.AgeDays / 30).ToString("MMMM yyyy")}.",
                OwnerId = owner.Id,
                TagsJson = Json.Serialize(s.Tags),
                CustomDataJson = "{}",
                EnrichmentDataJson = i % 4 == 0
                    ? Json.Serialize(new
                    {
                        source = "Autonomous enrichment",
                        confidence = 0.86,
                        employeeRange = s.Employees > 1000 ? "1000+" : "200-1000",
                        lastEnrichedAt = now.AddDays(-3)
                    })
                    : "{}",
                DataFreshnessScore = Math.Clamp(
                    100 - (int)Math.Round((now - accountUpdatedAt).TotalDays * 100 / organization.DataFreshnessDays),
                    0, 100),
                CreatedAt = now.AddDays(-s.AgeDays),
                UpdatedAt = accountUpdatedAt
            };
            accounts.Add(account);
        }
        db.Accounts.AddRange(accounts);

        var firstNames = new[] { "Priya", "Marcus", "Elena", "Daniel", "Aisha", "Tom", "Grace", "Liam", "Nina", "Oscar", "Hannah", "Diego", "Zara", "Felix", "Amara", "Jonas", "Leila", "Sam", "Rina", "Ethan", "Chloe", "Ravi", "Talia", "Ben" };
        var lastNames = new[] { "Nair", "Webb", "Petrova", "Kim", "Rahman", "Fisher", "Okafor", "Murphy", "Rossi", "Lindqvist", "Bauer", "Alvarez", "Hussain", "Wagner", "Diallo", "Berg", "Haddad", "Turner", "Sato", "Cole", "Dubois", "Iyer", "Cohen", "Brooks" };
        var titles = new[] { "VP Operations", "Head of Revenue", "CTO", "Procurement Lead", "Director of Sales", "COO", "Finance Director", "IT Manager", "Head of Customer Success", "CEO", "VP Marketing", "Plant Director" };
        var contacts = new List<Contact>();
        for (var i = 0; i < accounts.Count; i++)
        {
            for (var j = 0; j < 2; j++)
            {
                var nameIndex = i * 2 + j;
                var account = accounts[i];
                var first = firstNames[nameIndex];
                var last = lastNames[nameIndex];
                var contactUpdatedAt = now.AddDays(-random.Next(0, 20));
                contacts.Add(new Contact
                {
                    OrganizationId = organization.Id,
                    FirstName = first,
                    LastName = last,
                    Email = $"{first.ToLowerInvariant()}.{last.ToLowerInvariant()}@{accountSeeds[i].Domain}",
                    Phone = $"+1 (415) 555-{2000 + nameIndex:0000}",
                    Mobile = $"+1 (415) 555-{3000 + nameIndex:0000}",
                    Title = titles[nameIndex % titles.Length],
                    Department = j == 0 ? "Leadership" : "Operations",
                    AccountId = account.Id,
                    OwnerId = account.OwnerId,
                    LinkedInUrl = $"https://linkedin.com/in/{first.ToLowerInvariant()}-{last.ToLowerInvariant()}",
                    City = account.City,
                    Country = account.Country,
                    IsPrimary = j == 0,
                    TagsJson = "[]",
                    CustomDataJson = "{}",
                    CreatedAt = account.CreatedAt.AddDays(3),
                    UpdatedAt = contactUpdatedAt,
                    DataFreshnessScore = Math.Clamp(
                        100 - (int)Math.Round((now - contactUpdatedAt).TotalDays * 100 / organization.DataFreshnessDays),
                        0, 100)
                });
            }
        }
        db.Contacts.AddRange(contacts);

        // Two deliberately stale contacts so the freshness worker has visible work.
        foreach (var staleIndex in new[] { 5, 17 })
        {
            var stale = contacts[staleIndex];
            stale.UpdatedAt = now.AddDays(-(organization.DataFreshnessDays + 30 + staleIndex));
            stale.DataFreshnessScore = 0;
            stale.IsStale = true;
        }

        // A near-duplicate account/contact pair gives the hygiene worker demo material.
        var acme = accounts[1];
        var duplicateAccount = new Account
        {
            OrganizationId = organization.Id,
            Name = "Acme Corp.",
            Domain = "acme.com",
            Website = "https://acme.com",
            Industry = acme.Industry,
            Employees = acme.Employees,
            AnnualRevenue = acme.AnnualRevenue,
            Phone = acme.Phone,
            Email = "info@acme.com",
            City = acme.City,
            Country = acme.Country,
            Status = "Active",
            Description = "Legacy account record created before the CRM was consolidated.",
            OwnerId = users[2].Id,
            TagsJson = "[\"Legacy\"]",
            CustomDataJson = "{}",
            CreatedAt = now.AddDays(-120),
            UpdatedAt = now.AddDays(-4),
            DataFreshnessScore = 98
        };
        db.Accounts.Add(duplicateAccount);

        var acmePrimary = contacts.First(c => c.AccountId == acme.Id && c.IsPrimary);
        var duplicateContact = new Contact
        {
            OrganizationId = organization.Id,
            FirstName = "Samantha",
            LastName = acmePrimary.LastName,
            Email = acmePrimary.Email,
            Phone = acmePrimary.Phone,
            Title = acmePrimary.Title,
            Department = acmePrimary.Department,
            AccountId = duplicateAccount.Id,
            OwnerId = users[2].Id,
            IsPrimary = true,
            TagsJson = "[]",
            CustomDataJson = "{}",
            CreatedAt = now.AddDays(-90),
            UpdatedAt = now.AddDays(-6),
            DataFreshnessScore = 97
        };
        contacts.Add(duplicateContact);
        db.Contacts.Add(duplicateContact);

        var leadSeeds = new[]
        {
            new LeadSeed("Priya", "Nair", "Vertex Analytics", "priya.nair@vertexanalytics.com", "Director of RevOps", "Website", LeadStatus.Converted, 92, 72000m, 0),
            new LeadSeed("Marcus", "Webb", "Acme Corporation", "marcus.webb@acme.com", "VP Procurement", "Outbound", LeadStatus.Converted, 88, 240000m, 1),
            new LeadSeed("Elena", "Petrova", "NovaGrid", "elena@novagrid.io", "COO", "Referral", LeadStatus.Qualified, 84, 56000m, 2),
            new LeadSeed("Daniel", "Kim", "Harbor Pay", "daniel.kim@harborpay.com", "Head of Sales", "Website", LeadStatus.Qualified, 79, 42000m, 3),
            new LeadSeed("Aisha", "Rahman", "Greenline Energy", "aisha@greenline.energy", "CEO", "Event", LeadStatus.Contacted, 71, 88000m, 0),
            new LeadSeed("Tom", "Fisher", "Fisher & Co", "tom@fisherco.com", "Managing Partner", "Partner", LeadStatus.New, 64, 18000m, 1),
            new LeadSeed("Grace", "Okafor", "Meridian Health", "grace.okafor@meridian.health", "CIO", "LinkedIn Ads", LeadStatus.Contacted, 76, 120000m, 2),
            new LeadSeed("Liam", "Murphy", "Brightpath", "liam@brightpath.edu", "Director of IT", "Website", LeadStatus.New, 58, 26000m, 3),
            new LeadSeed("Nina", "Rossi", "Aster Labs", "nina@asterlabs.ai", "Founder", "Outbound", LeadStatus.Qualified, 81, 39000m, 0),
            new LeadSeed("Oscar", "Lindqvist", "Nordic Freight", "oscar@nordicfreight.se", "VP Operations", "Event", LeadStatus.Unqualified, 32, 15000m, 1),
            new LeadSeed("Hannah", "Bauer", "Kite Insurance", "hannah.bauer@kite.io", "Head of CX", "Partner", LeadStatus.Contacted, 68, 64000m, 2),
            new LeadSeed("Diego", "Alvarez", "Solstice Retail", "diego@solstice.mx", "COO", "Website", LeadStatus.New, 61, 31000m, 3),
            new LeadSeed("Zara", "Hussain", "Crescent Bank", "zara@crescentbank.com", "Transformation Lead", "Outbound", LeadStatus.Qualified, 86, 145000m, 0),
            new LeadSeed("Felix", "Wagner", "Wagner Logistics", "felix@wagnerlog.de", "Operations Director", "Referral", LeadStatus.Contacted, 55, 22000m, 1),
            new LeadSeed("Amara", "Diallo", "Sahara Fintech", "amara@saharafin.com", "VP Product", "LinkedIn Ads", LeadStatus.New, 73, 47000m, 2),
            new LeadSeed("Jonas", "Berg", "Fjord Analytics", "jonas@fjordanalytics.no", "CTO", "Website", LeadStatus.Unqualified, 41, 12000m, 3)
        };

        var leads = new List<Lead>();
        foreach (var s in leadSeeds)
        {
            var owner = users[s.OwnerIndex % users.Count];
            leads.Add(new Lead
            {
                OrganizationId = organization.Id,
                FirstName = s.FirstName,
                LastName = s.LastName,
                Company = s.Company,
                Email = s.Email,
                Phone = $"+1 (415) 555-{4000 + leads.Count:0000}",
                Title = s.Title,
                Website = $"https://{s.Email.Split('@')[1]}",
                Source = s.Source,
                Status = s.Status,
                Score = s.Score,
                EstimatedValue = s.Value,
                OwnerId = owner.Id,
                Notes = s.Status == LeadStatus.Qualified ? "Strong fit. Budget confirmed for this quarter." : null,
                TagsJson = "[]",
                CustomDataJson = "{}",
                RoutingState = LeadRoutingState.Assigned,
                CreatedAt = now.AddDays(-random.Next(2, 80)),
                UpdatedAt = now.AddDays(-random.Next(0, 5))
            });
        }
        db.Leads.AddRange(leads);

        // Leave two strong inbound leads unowned so the autonomous router has work.
        foreach (var (index, score) in new[] { (7, 88), (14, 79) })
        {
            leads[index].OwnerId = null;
            leads[index].Score = score;
            leads[index].RoutingState = LeadRoutingState.Unrouted;
        }

        var dealSeeds = new[]
        {
            new DealSeed("Northwind — Commerce platform renewal", 0, 4, 84000m, -5, 0, "Existing customer", true),
            new DealSeed("Acme — Global rollout", 1, 3, 240000m, 18, 1, "Outbound", true),
            new DealSeed("Globex — Data warehouse migration", 2, 2, 125000m, 25, 2, "Partner", true),
            new DealSeed("Initech — Sales automation", 3, 1, 46000m, 32, 3, "Website", true),
            new DealSeed("Umbrella Health — Patient CRM", 4, 3, 190000m, 12, 1, "Referral", true),
            new DealSeed("Vertex Analytics — Enterprise expansion", 5, 2, 72000m, 40, 0, "Existing customer", true),
            new DealSeed("Blue Harbor — Logistics visibility", 6, 1, 38000m, 22, 2, "Outbound", true),
            new DealSeed("Lumen Financial — Wealth suite", 7, 4, 156000m, -12, 1, "Existing customer", true),
            new DealSeed("Redwood Retail — Store operations", 8, 2, 96000m, 35, 3, "Event", true),
            new DealSeed("Cobalt Systems — Platform license", 9, 0, 28000m, 60, 2, "Website", true),
            new DealSeed("Beacon Media — Audience CRM", 10, 1, 54000m, 28, 0, "Outbound", true),
            new DealSeed("Atlas Manufacturing — Field service", 11, 3, 205000m, 9, 1, "Referral", true),
            new DealSeed("Northwind — Loyalty add-on", 0, 4, 32000m, -18, 3, "Existing customer", true),
            new DealSeed("Acme — Premium support", 1, 4, 48000m, -2, 2, "Existing customer", true),
            new DealSeed("Globex — Analytics add-on", 2, 5, 60000m, -30, 0, "Existing customer", true),
            new DealSeed("Initech — Migration services", 3, 5, 27000m, -45, 3, "Partner", true),
            new DealSeed("Umbrella Health — Compliance module", 4, 2, 88000m, 20, 2, "Outbound", true),
            new DealSeed("Blue Harbor — Fleet tracking", 6, 0, 41000m, 55, 3, "Website", true),
            new DealSeed("Lumen Financial — Onboarding package", 7, 4, 24000m, -95, 0, "Existing customer", true),
            new DealSeed("Redwood Retail — POS integration", 8, 4, 110000m, -75, 1, "Referral", true),
            new DealSeed("Cobalt Systems — Security review", 9, 1, 67000m, 30, 0, "Outbound", true),
            new DealSeed("Vertex Analytics — AI forecasting", 5, 3, 135000m, 15, 2, "Existing customer", true),
            new DealSeed("Beacon Media — Enterprise CRM", 10, 1, 150000m, 45, 1, "Outbound", false),
            new DealSeed("Atlas Manufacturing — Plant maintenance", 11, 2, 220000m, 30, 0, "Referral", false),
            new DealSeed("Globex — Global instance", 2, 0, 300000m, 90, 1, "Existing customer", false)
        };

        var deals = new List<Deal>();
        var dealIndex = -1;
        foreach (var s in dealSeeds)
        {
            dealIndex++;
            var account = accounts[s.AccountIndex];
            var primary = contacts.First(c => c.AccountId == account.Id && c.IsPrimary);
            var pipeline = s.Sales ? salesPipeline : enterprisePipeline;
            var stage = (s.Sales ? salesStages : enterpriseStages)[s.StageIndex];
            var status = stage.IsWon ? DealStatus.Won : stage.IsLost ? DealStatus.Lost : DealStatus.Open;
            var closeOffset = s.CloseOffsetDays;
            var closedAt = status == DealStatus.Open ? (DateTime?)null : now.AddDays(Math.Min(closeOffset, -1));
            var stageMovedAt = status == DealStatus.Open
                ? now.AddDays(-random.Next(1, 36))
                : (closedAt ?? now.AddDays(-10));
            var stalled = status == DealStatus.Open && dealIndex is 10 or 17 or 24;
            if (stalled) stageMovedAt = now.AddDays(-35);
            var healthIndex = stalled
                ? 38
                : Math.Clamp(100 - (int)Math.Round((now - stageMovedAt).TotalDays * 1.5), 45, 100);
            deals.Add(new Deal
            {
                OrganizationId = organization.Id,
                Name = s.Name,
                AccountId = account.Id,
                PrimaryContactId = primary.Id,
                Amount = s.Amount,
                Currency = "USD",
                PipelineId = pipeline.Id,
                StageId = stage.Id,
                Probability = stage.Probability,
                ExpectedCloseDate = status == DealStatus.Open ? now.AddDays(Math.Max(closeOffset, 1)) : now.AddDays(closeOffset),
                ClosedAt = closedAt,
                Status = status,
                Source = s.Source,
                Description = $"{s.Name} — {s.Amount:C0} opportunity tracked in the {pipeline.Name}.",
                NextStep = status == DealStatus.Open ? NextStepFor(s.StageIndex) : null,
                OwnerId = users[s.OwnerIndex % users.Count].Id,
                TagsJson = "[]",
                CustomDataJson = "{}",
                LastStageMovedAt = stageMovedAt,
                IsStalled = stalled,
                HealthIndex = healthIndex,
                CreatedAt = now.AddDays(-random.Next(20, 160)),
                UpdatedAt = now.AddDays(-random.Next(0, 6))
            });
        }
        db.Deals.AddRange(deals);

        // Custom field definitions (Twenty/Espo-style metadata layer)
        var accountTier = new CustomFieldDefinition
        {
            OrganizationId = organization.Id,
            EntityType = EntityTypes.Account,
            Key = "account_tier",
            Label = "Account tier",
            FieldType = "select",
            OptionsJson = Json.Serialize(new[] { "Strategic", "Enterprise", "Mid-market", "SMB" }),
            SortOrder = 1,
            Placeholder = "Select a tier"
        };
        var renewalDate = new CustomFieldDefinition
        {
            OrganizationId = organization.Id,
            EntityType = EntityTypes.Account,
            Key = "renewal_date",
            Label = "Renewal date",
            FieldType = "date",
            SortOrder = 2,
            HelpText = "Next contract renewal date."
        };
        var competitor = new CustomFieldDefinition
        {
            OrganizationId = organization.Id,
            EntityType = EntityTypes.Deal,
            Key = "competitor",
            Label = "Primary competitor",
            FieldType = "text",
            SortOrder = 1,
            Placeholder = "e.g. Salesforce"
        };
        var decisionTimeline = new CustomFieldDefinition
        {
            OrganizationId = organization.Id,
            EntityType = EntityTypes.Deal,
            Key = "decision_timeline",
            Label = "Decision timeline",
            FieldType = "select",
            OptionsJson = Json.Serialize(new[] { "This month", "This quarter", "Next quarter", "No timeline" }),
            SortOrder = 2
        };
        var campaign = new CustomFieldDefinition
        {
            OrganizationId = organization.Id,
            EntityType = EntityTypes.Lead,
            Key = "campaign",
            Label = "Campaign",
            FieldType = "text",
            SortOrder = 1,
            Placeholder = "e.g. Q3 Webinar"
        };
        var preferredChannel = new CustomFieldDefinition
        {
            OrganizationId = organization.Id,
            EntityType = EntityTypes.Contact,
            Key = "preferred_channel",
            Label = "Preferred channel",
            FieldType = "select",
            OptionsJson = Json.Serialize(new[] { "Email", "Phone", "WhatsApp", "LinkedIn" }),
            SortOrder = 1
        };
        db.CustomFieldDefinitions.AddRange(accountTier, renewalDate, competitor, decisionTimeline, campaign, preferredChannel);

        var tiers = new[] { "Strategic", "Strategic", "Enterprise", "Mid-market", "Enterprise", "Mid-market", "Enterprise", "Strategic", "Mid-market", "SMB", "Mid-market", "Enterprise" };
        for (var i = 0; i < accounts.Count; i++)
        {
            accounts[i].CustomDataJson = Json.Serialize(new Dictionary<string, string?>
            {
                ["account_tier"] = tiers[i],
                ["renewal_date"] = now.AddDays(60 + i * 23).ToString("yyyy-MM-dd")
            });
        }
        for (var i = 0; i < deals.Count; i++)
        {
            var competitorName = new[] { "Salesforce", "HubSpot", "Microsoft Dynamics", "None", "Pipedrive" }[i % 5];
            deals[i].CustomDataJson = Json.Serialize(new Dictionary<string, string?>
            {
                ["competitor"] = competitorName,
                ["decision_timeline"] = new[] { "This month", "This quarter", "Next quarter" }[i % 3]
            });
        }
        for (var i = 0; i < leads.Count; i++)
        {
            leads[i].CustomDataJson = Json.Serialize(new Dictionary<string, string?>
            {
                ["campaign"] = new[] { "Q3 Webinar", "Product Hunt", "Founder outbound", "Partner co-sell" }[i % 4]
            });
        }
        for (var i = 0; i < contacts.Count; i++)
        {
            contacts[i].CustomDataJson = Json.Serialize(new Dictionary<string, string?>
            {
                ["preferred_channel"] = new[] { "Email", "Phone", "WhatsApp", "LinkedIn" }[i % 4]
            });
        }

        // Link two converted leads to real records
        var convertedPairs = new[] { (0, 5), (1, 1) };
        foreach (var (leadIndex, accountIndex) in convertedPairs)
        {
            var lead = leads[leadIndex];
            var account = accounts[accountIndex];
            var contact = contacts.First(c => c.AccountId == account.Id && c.IsPrimary);
            var deal = deals.First(d => d.AccountId == account.Id);
            lead.ConvertedAccountId = account.Id;
            lead.ConvertedContactId = contact.Id;
            lead.ConvertedDealId = deal.Id;
            lead.ConvertedAt = now.AddDays(-random.Next(5, 30));
        }

        // Activities across accounts, contacts, leads and deals
        var activities = new List<Activity>();
        var activityTypes = new[] { ActivityType.Call, ActivityType.Email, ActivityType.Meeting, ActivityType.Task, ActivityType.Note };

        var openDeals = deals.Where(d => d.Status == DealStatus.Open).ToList();
        for (var i = 0; i < 8; i++)
        {
            var deal = openDeals[i % openDeals.Count];
            var ownerId = users[i % users.Count].Id;
            activities.Add(new Activity
            {
                OrganizationId = organization.Id,
                Type = activityTypes[i % 4],
                Subject = new[] { "Discovery call", "Follow-up email", "Technical deep dive", "Send proposal", "Check-in" }[i % 5],
                Body = "Discussed requirements, timeline and the evaluation process.",
                DueAt = now.AddDays(i - 1).Date.AddHours(15),
                Status = i < 4 ? ActivityStatus.Completed : ActivityStatus.Open,
                CompletedAt = i < 4 ? now.AddDays(i - 3) : null,
                Priority = i % 3 == 0 ? "High" : "Normal",
                RelatedType = EntityTypes.Deal,
                RelatedId = deal.Id,
                OwnerId = ownerId,
                DurationMinutes = i % 4 == 1 ? null : 30,
                Outcome = i < 4 ? "Positive — next step agreed." : null,
                CreatedAt = now.AddDays(-10 + i),
                UpdatedAt = now.AddDays(-10 + i)
            });
        }

        for (var i = 0; i < 6; i++)
        {
            var account = accounts[i];
            activities.Add(new Activity
            {
                OrganizationId = organization.Id,
                Type = ActivityType.Note,
                Subject = "QBR notes",
                Body = $"{account.Name} quarterly review: adoption is strong, expansion opportunity in Q4.",
                Status = ActivityStatus.Completed,
                CompletedAt = now.AddDays(-random.Next(2, 20)),
                Priority = "Normal",
                RelatedType = EntityTypes.Account,
                RelatedId = account.Id,
                OwnerId = account.OwnerId,
                CreatedAt = now.AddDays(-random.Next(3, 25)),
                UpdatedAt = now.AddDays(-random.Next(1, 3))
            });
        }

        for (var i = 0; i < 10; i++)
        {
            var lead = leads[i];
            activities.Add(new Activity
            {
                OrganizationId = organization.Id,
                Type = i % 3 == 0 ? ActivityType.Email : ActivityType.Task,
                Subject = i % 3 == 0 ? "Intro email sent" : "Qualify inbound lead",
                Body = i % 3 == 0 ? "Sent a personalised intro with the relevant case study." : "Confirm budget, authority, need and timeline.",
                DueAt = now.AddDays((i % 4) - 1).Date.AddHours(11),
                Status = i % 3 == 0 ? ActivityStatus.Completed : (i % 4 == 0 ? ActivityStatus.Open : ActivityStatus.Completed),
                CompletedAt = i % 3 == 0 || i % 4 != 0 ? now.AddDays(-random.Next(1, 9)) : null,
                Priority = i % 2 == 0 ? "High" : "Normal",
                RelatedType = EntityTypes.Lead,
                RelatedId = lead.Id,
                OwnerId = lead.OwnerId,
                CreatedAt = now.AddDays(-random.Next(2, 18)),
                UpdatedAt = now.AddDays(-random.Next(0, 2))
            });
        }

        for (var i = 0; i < 5; i++)
        {
            var contact = contacts[i * 2];
            activities.Add(new Activity
            {
                OrganizationId = organization.Id,
                Type = ActivityType.Call,
                Subject = "Relationship check-in",
                Body = "Quick call to keep the relationship warm and surface new initiatives.",
                DueAt = now.AddDays(i + 1).Date.AddHours(10),
                Status = ActivityStatus.Open,
                Priority = i == 0 ? "High" : "Normal",
                RelatedType = EntityTypes.Contact,
                RelatedId = contact.Id,
                OwnerId = contact.OwnerId ?? users[0].Id,
                DurationMinutes = 20,
                CreatedAt = now.AddDays(-3),
                UpdatedAt = now.AddDays(-1)
            });
        }

        foreach (var deal in deals.Where(d => d.Status == DealStatus.Won).Take(4))
        {
            activities.Add(new Activity
            {
                OrganizationId = organization.Id,
                Type = ActivityType.Note,
                Subject = "Deal won 🎉",
                Body = "Contract signed. Handed over to onboarding and customer success.",
                Status = ActivityStatus.Completed,
                CompletedAt = deal.ClosedAt ?? now.AddDays(-10),
                RelatedType = EntityTypes.Deal,
                RelatedId = deal.Id,
                OwnerId = deal.OwnerId,
                CreatedAt = deal.ClosedAt ?? now.AddDays(-10),
                UpdatedAt = deal.ClosedAt ?? now.AddDays(-10)
            });
        }

        // Give the demo admin a few tasks due today / tomorrow
        foreach (var (subject, offset) in new[] { ("Review enterprise pipeline", 0), ("Approve Northwind renewal", 1), ("Prepare board forecast", 2) })
        {
            activities.Add(new Activity
            {
                OrganizationId = organization.Id,
                Type = ActivityType.Task,
                Subject = subject,
                Body = "Auto-created demo task for the revenue team.",
                DueAt = now.AddDays(offset).Date.AddHours(16),
                Status = ActivityStatus.Open,
                Priority = offset == 0 ? "High" : "Normal",
                RelatedType = EntityTypes.Account,
                RelatedId = accounts[offset].Id,
                OwnerId = users[0].Id,
                CreatedAt = now.AddDays(-2),
                UpdatedAt = now.AddDays(-1)
            });
        }
        db.Activities.AddRange(activities);

        // Support tickets
        var ticketSeeds = new[]
        {
            new TicketSeed("Payment gateway failing on checkout", 0, TicketStatus.Resolved, "Urgent", "Email", 4, 6, "Multiple customers cannot complete checkout. Error 502 from the gateway."),
            new TicketSeed("SSO configuration for new region", 1, TicketStatus.Open, "High", "Email", 2, 1, "Setting up SAML for the APAC region. Need the metadata URL and attribute mapping."),
            new TicketSeed("Dashboard export returns empty file", 2, TicketStatus.Pending, "Normal", "Chat", 3, 3, "CSV export downloads but contains only headers."),
            new TicketSeed("Incorrect tax calculation on invoices", 4, TicketStatus.Open, "Urgent", "Phone", 1, 2, "VAT is applied twice on invoices for the EU entity."),
            new TicketSeed("Add seats to annual plan", 3, TicketStatus.Resolved, "Low", "Email", 4, 10, "Customer wants to add 25 seats effective next month."),
            new TicketSeed("API rate limit increase request", 5, TicketStatus.Open, "High", "Web", 2, 4, "Integration needs 600 requests/min for nightly sync."),
            new TicketSeed("Onboarding session reschedule", 6, TicketStatus.Pending, "Normal", "Chat", 3, 5, "Requesting to move the onboarding workshop by one week."),
            new TicketSeed("Data deletion request (GDPR)", 7, TicketStatus.Open, "Urgent", "Email", 0, 1, "Legal has asked for confirmation of data erasure within 30 days."),
            new TicketSeed("Report scheduling not triggering", 8, TicketStatus.Pending, "Normal", "Email", 4, 7, "Weekly pipeline report did not send on Monday."),
            new TicketSeed("Mobile app login loop", 9, TicketStatus.Open, "High", "Chat", 2, 2, "Users are redirected back to login after SSO on iOS."),
            new TicketSeed("Custom domain SSL pending", 10, TicketStatus.Resolved, "Normal", "Email", 1, 12, "SSL certificate validation is stuck in pending state."),
            new TicketSeed("Billing address update", 11, TicketStatus.Closed, "Low", "Phone", 3, 15, "Updated billing entity and VAT number for renewals.")
        };

        var tickets = new List<Ticket>();
        for (var i = 0; i < ticketSeeds.Length; i++)
        {
            var s = ticketSeeds[i];
            var account = accounts[s.AccountIndex];
            var contact = contacts.First(c => c.AccountId == account.Id);
            var assignee = users[s.AssigneeIndex % users.Count];
            var createdAt = now.AddDays(-s.AgeDays);
            var resolvedAt = s.Status is TicketStatus.Resolved or TicketStatus.Closed ? createdAt.AddHours(5 + i) : (DateTime?)null;
            var slaDueAt = createdAt.AddHours(s.Priority is "Urgent" or "High" ? 24 : 72);
            var slaBreached = s.Status is TicketStatus.Open or TicketStatus.Pending && now > slaDueAt;
            tickets.Add(new Ticket
            {
                OrganizationId = organization.Id,
                Number = $"T-{1001 + i}",
                Subject = s.Subject,
                Description = s.Description,
                Status = s.Status,
                Priority = s.Priority,
                Channel = s.Channel,
                AccountId = account.Id,
                ContactId = contact.Id,
                AssigneeId = assignee.Id,
                FirstResponseAt = createdAt.AddHours(1 + i % 4),
                ResolvedAt = resolvedAt,
                SlaDueAt = slaDueAt,
                SlaBreached = slaBreached,
                EscalationLevel = slaBreached ? 2 : 0,
                TagsJson = Json.Serialize(s.Priority == "Urgent" ? new[] { "escalated" } : Array.Empty<string>()),
                CreatedAt = createdAt,
                UpdatedAt = resolvedAt ?? now.AddHours(-i)
            });
        }
        db.Tickets.AddRange(tickets);

        foreach (var ticket in tickets.Take(4))
        {
            var customer = contacts.First(c => c.Id == ticket.ContactId);
            db.Activities.AddRange(
                new Activity
                {
                    OrganizationId = organization.Id,
                    Type = ActivityType.Note,
                    Subject = "Customer message",
                    Body = ticket.Description,
                    Status = ActivityStatus.Completed,
                    CompletedAt = ticket.CreatedAt,
                    RelatedType = EntityTypes.Ticket,
                    RelatedId = ticket.Id,
                    OwnerId = ticket.AssigneeId,
                    CreatedAt = ticket.CreatedAt,
                    UpdatedAt = ticket.CreatedAt
                },
                new Activity
                {
                    OrganizationId = organization.Id,
                    Type = ActivityType.Note,
                    Subject = "Reply from support",
                    Body = $"Thanks {customer.FirstName}, we're on it and will update you shortly.",
                    Status = ActivityStatus.Completed,
                    CompletedAt = ticket.CreatedAt.AddMinutes(45),
                    RelatedType = EntityTypes.Ticket,
                    RelatedId = ticket.Id,
                    OwnerId = ticket.AssigneeId,
                    CreatedAt = ticket.CreatedAt.AddMinutes(45),
                    UpdatedAt = ticket.CreatedAt.AddMinutes(45)
                });
        }

        // Products & quotes
        var products = new[]
        {
            new Product { OrganizationId = organization.Id, Name = "Helix Platform — Growth", Sku = "HLX-GROW", Description = "Annual platform subscription for up to 50 seats.", UnitPrice = 24000m, TaxRate = 0, Category = "Subscription", Currency = "USD" },
            new Product { OrganizationId = organization.Id, Name = "Helix Platform — Enterprise", Sku = "HLX-ENT", Description = "Annual platform subscription with unlimited seats.", UnitPrice = 96000m, TaxRate = 0, Category = "Subscription", Currency = "USD" },
            new Product { OrganizationId = organization.Id, Name = "Onboarding package", Sku = "HLX-ONB", Description = "Guided implementation and data migration.", UnitPrice = 12000m, TaxRate = 0, Category = "Services", Currency = "USD" },
            new Product { OrganizationId = organization.Id, Name = "Premium support", Sku = "HLX-SUP", Description = "24/7 support with a 1-hour response SLA.", UnitPrice = 18000m, TaxRate = 0, Category = "Support", Currency = "USD" },
            new Product { OrganizationId = organization.Id, Name = "Analytics add-on", Sku = "HLX-ANL", Description = "Advanced reporting, forecasting and dashboards.", UnitPrice = 7200m, TaxRate = 0, Category = "Add-on", Currency = "USD" },
            new Product { OrganizationId = organization.Id, Name = "Additional seat", Sku = "HLX-SEAT", Description = "Additional platform seat, billed annually.", UnitPrice = 480m, TaxRate = 0, Category = "Subscription", Currency = "USD" }
        };
        db.Products.AddRange(products);

        var quoteSeeds = new[]
        {
            new QuoteSeed(0, 0, QuoteStatus.Accepted, -20, 90, new[] { (1, 1m), (2, 1m), (3, 1m) }),
            new QuoteSeed(1, 1, QuoteStatus.Sent, -8, 30, new[] { (1, 2m), (2, 1m), (4, 1m) }),
            new QuoteSeed(4, 4, QuoteStatus.Sent, -4, 45, new[] { (1, 1m), (2, 1m) }),
            new QuoteSeed(7, 7, QuoteStatus.Draft, -1, 60, new[] { (1, 1m), (3, 1m), (4, 2m) }),
            new QuoteSeed(2, 2, QuoteStatus.Declined, -40, 10, new[] { (0, 2m), (2, 1m) }),
            new QuoteSeed(10, 22, QuoteStatus.Draft, -2, 60, new[] { (0, 1m), (5, 25m), (4, 1m) })
        };

        var quotes = new List<Quote>();
        for (var i = 0; i < quoteSeeds.Length; i++)
        {
            var s = quoteSeeds[i];
            var account = accounts[s.AccountIndex];
            var quote = new Quote
            {
                OrganizationId = organization.Id,
                Number = $"Q-{1001 + i}",
                AccountId = account.Id,
                DealId = deals[s.DealIndex].Id,
                ContactId = contacts.First(c => c.AccountId == account.Id).Id,
                Status = s.Status,
                IssueDate = now.AddDays(s.IssueOffset),
                ExpiryDate = now.AddDays(s.IssueOffset + s.ValidDays),
                Currency = "USD",
                DiscountPercent = i == 1 ? 5 : 0,
                TaxPercent = 8.5m,
                Notes = "Prices valid for 30 days. Payment terms: net 30.",
                OwnerId = account.OwnerId,
                CreatedAt = now.AddDays(s.IssueOffset),
                UpdatedAt = now.AddDays(-random.Next(0, 3))
            };
            foreach (var (productIndex, qty) in s.Lines)
            {
                var product = products[productIndex];
                quote.Lines.Add(new QuoteLine
                {
                    OrganizationId = organization.Id,
                    ProductId = product.Id,
                    Description = product.Name,
                    Quantity = qty,
                    UnitPrice = product.UnitPrice,
                    DiscountPercent = 0,
                    LineTotal = Math.Round(product.UnitPrice * qty, 2)
                });
            }
            quote.Subtotal = Math.Round(quote.Lines.Sum(l => l.LineTotal), 2);
            var afterDiscount = quote.Subtotal * (1 - quote.DiscountPercent / 100m);
            quote.TaxTotal = Math.Round(afterDiscount * quote.TaxPercent / 100m, 2);
            quote.Total = Math.Round(afterDiscount + quote.TaxTotal, 2);
            quotes.Add(quote);
        }
        db.Quotes.AddRange(quotes);

        // Notifications for the demo users
        db.Notifications.AddRange(
            new Notification
            {
                OrganizationId = organization.Id,
                UserId = users[0].Id,
                Title = "Deal won — Northwind renewal",
                Body = "The $84,000 renewal moved to Closed Won.",
                Link = $"/deals/{deals[0].Id}",
                Type = "success",
                CreatedAt = now.AddHours(-2)
            },
            new Notification
            {
                OrganizationId = organization.Id,
                UserId = users[0].Id,
                Title = "3 tasks are due today",
                Body = "Review the enterprise pipeline before the forecast call.",
                Link = "/activities",
                Type = "warning",
                CreatedAt = now.AddHours(-5)
            },
            new Notification
            {
                OrganizationId = organization.Id,
                UserId = users[0].Id,
                Title = "New lead assigned — Zara Hussain",
                Body = "Crescent Bank · Score 86 · Enterprise",
                Link = $"/leads/{leads[12].Id}",
                Type = "info",
                CreatedAt = now.AddHours(-9)
            },
            new Notification
            {
                OrganizationId = organization.Id,
                UserId = users[1].Id,
                Title = "Deal moved to Negotiation",
                Body = "Acme global rollout is now in Negotiation.",
                Link = $"/deals/{deals[1].Id}",
                Type = "info",
                CreatedAt = now.AddHours(-3)
            },
            new Notification
            {
                OrganizationId = organization.Id,
                UserId = users[2].Id,
                Title = "Task overdue",
                Body = "Follow up with Vertex Analytics.",
                Link = "/activities",
                Type = "warning",
                CreatedAt = now.AddHours(-1)
            });

        db.AuditLogs.AddRange(
            new AuditLog { OrganizationId = organization.Id, EntityType = "Deal", EntityId = deals[0].Id, Action = "updated", ActorName = "Jordan Lee", ChangesJson = "{\"Stage\":[\"Negotiation\",\"Closed Won\"],\"Status\":[\"Open\",\"Won\"]}", CreatedAt = now.AddDays(-5), UpdatedAt = now.AddDays(-5) },
            new AuditLog { OrganizationId = organization.Id, EntityType = "Account", EntityId = accounts[1].Id, Action = "updated", ActorName = "Avery Morgan", ChangesJson = "{\"OwnerId\":[\"Sofia Ramirez\",\"Jordan Lee\"]}", CreatedAt = now.AddDays(-9), UpdatedAt = now.AddDays(-9) },
            new AuditLog { OrganizationId = organization.Id, EntityType = "Lead", EntityId = leads[2].Id, Action = "created", ActorName = "Sofia Ramirez", ChangesJson = "{\"Name\":\"Elena Petrova\"}", CreatedAt = now.AddDays(-4), UpdatedAt = now.AddDays(-4) });

        // Seed Canned Responses (Chatwoot & DeskcommCRM)
        db.CannedResponses.AddRange(
            new CannedResponse { OrganizationId = organization.Id, Title = "Welcome & Discovery Demo", Shortcut = "/intro", Category = "Sales", Content = "Hi there,\n\nThanks for reaching out! We'd love to learn more about your team's workflow and discuss how our CRM system can streamline your operations. Do you have 15 minutes this week for a brief walkthrough?" },
            new CannedResponse { OrganizationId = organization.Id, Title = "Password Reset Instructions", Shortcut = "/reset", Category = "Support", Content = "Hello,\n\nTo reset your workspace password, navigate to Settings -> Profile -> Change Password, or follow the password recovery link on the sign-in page.\n\nLet us know if you encounter any difficulties!" },
            new CannedResponse { OrganizationId = organization.Id, Title = "Pricing & Plans Overview", Shortcut = "/pricing", Category = "Sales", Content = "Hello,\n\nOur pricing is simple and transparent: our Professional workspace includes unlimited contacts, configurable sales pipelines, automated email sequences, and shared support inboxes.\n\nFeel free to ask for a tailored proposal!" },
            new CannedResponse { OrganizationId = organization.Id, Title = "Issue Resolved Confirmation", Shortcut = "/resolved", Category = "Support", Content = "Hi,\n\nWe have verified that this issue has now been resolved on our end. Please verify that everything is working as expected in your workspace.\n\nFeel free to reply if you need any further assistance!" },
            new CannedResponse { OrganizationId = organization.Id, Title = "Standard Refund Policy", Shortcut = "/refund", Category = "Billing", Content = "Hello,\n\nOur subscription comes with a 30-day money-back guarantee. If you are not completely satisfied, we process full refunds within 3-5 business days upon request." });

        // Seed Automation Rules (EspoCRM & SuiteCRM)
        db.AutomationRules.AddRange(
            new AutomationRule { OrganizationId = organization.Id, Name = "Auto-create qualification task for new leads", EventType = "LeadCreated", ActionType = "CreateTask", ActionConfigJson = "{\"taskSubject\":\"Qualify new lead: {title}\",\"durationDays\":1}", IsActive = true, ExecutionCount = 14 },
            new AutomationRule { OrganizationId = organization.Id, Name = "Onboarding task on Deal Won", EventType = "DealWon", ActionType = "CreateTask", ActionConfigJson = "{\"taskSubject\":\"Prepare invoice & onboarding for {title}\",\"durationDays\":2}", IsActive = true, ExecutionCount = 8 },
            new AutomationRule { OrganizationId = organization.Id, Name = "Notification on support ticket created", EventType = "TicketCreated", ActionType = "SendNotification", ActionConfigJson = "{}", IsActive = true, ExecutionCount = 23 },
            new AutomationRule { OrganizationId = organization.Id, Name = "Generate invoice task on Quote Accepted", EventType = "QuoteAccepted", ActionType = "CreateTask", ActionConfigJson = "{\"taskSubject\":\"Generate formal invoice for {title}\",\"durationDays\":1}", IsActive = true, ExecutionCount = 6 });

        // Seed Invoices (ERPNext & Dolibarr)
        var invoices = new List<Invoice>();
        var sampleInvoices = new[]
        {
            (AccIdx: 0, DealIdx: 0, Number: "INV-2026-0001", Status: InvoiceStatus.Paid, Subtotal: 45000m, Tax: 3600m, Total: 48600m, Paid: 48600m, DueOffset: -10, IssueOffset: -40, Terms: "Net 30"),
            (AccIdx: 1, DealIdx: 1, Number: "INV-2026-0002", Status: InvoiceStatus.Paid, Subtotal: 30000m, Tax: 2400m, Total: 32400m, Paid: 32400m, DueOffset: -5, IssueOffset: -35, Terms: "Net 30"),
            (AccIdx: 2, DealIdx: 2, Number: "INV-2026-0003", Status: InvoiceStatus.PartiallyPaid, Subtotal: 18000m, Tax: 1440m, Total: 19440m, Paid: 10000m, DueOffset: 12, IssueOffset: -18, Terms: "Net 30"),
            (AccIdx: 3, DealIdx: 3, Number: "INV-2026-0004", Status: InvoiceStatus.Sent, Subtotal: 12000m, Tax: 960m, Total: 12960m, Paid: 0m, DueOffset: 15, IssueOffset: -15, Terms: "Net 30"),
            (AccIdx: 4, DealIdx: 4, Number: "INV-2026-0005", Status: InvoiceStatus.Overdue, Subtotal: 24000m, Tax: 1920m, Total: 25920m, Paid: 0m, DueOffset: -8, IssueOffset: -38, Terms: "Net 30"),
            (AccIdx: 5, DealIdx: 5, Number: "INV-2026-0006", Status: InvoiceStatus.Draft, Subtotal: 15000m, Tax: 1200m, Total: 16200m, Paid: 0m, DueOffset: 25, IssueOffset: -2, Terms: "Net 30"),
        };

        foreach (var invSeed in sampleInvoices)
        {
            var inv = new Invoice
            {
                OrganizationId = organization.Id,
                Number = invSeed.Number,
                AccountId = accounts[invSeed.AccIdx].Id,
                DealId = deals[invSeed.DealIdx].Id,
                Status = invSeed.Status,
                IssueDate = now.AddDays(invSeed.IssueOffset),
                DueDate = now.AddDays(invSeed.DueOffset),
                Currency = "USD",
                Subtotal = invSeed.Subtotal,
                TaxPercent = 8.0m,
                TaxTotal = invSeed.Tax,
                Total = invSeed.Total,
                AmountPaid = invSeed.Paid,
                BalanceDue = Math.Max(0, invSeed.Total - invSeed.Paid),
                PaymentTerms = invSeed.Terms,
                OwnerId = users[0].Id,
                Notes = "Thank you for partnering with Northstar Labs. Payment is due as per agreed terms."
            };

            inv.Lines.Add(new InvoiceLine
            {
                OrganizationId = organization.Id,
                Description = "Enterprise Platform License — Annual Subscription",
                Quantity = 1,
                UnitPrice = invSeed.Subtotal,
                DiscountPercent = 0,
                LineTotal = invSeed.Subtotal
            });

            if (invSeed.Paid > 0)
            {
                inv.Payments.Add(new InvoicePayment
                {
                    OrganizationId = organization.Id,
                    Amount = invSeed.Paid,
                    PaymentDate = now.AddDays(invSeed.IssueOffset + 15),
                    PaymentMethod = "Bank Wire (ACH)",
                    Reference = $"WIRE-{random.Next(100000, 999999)}",
                    Notes = "Payment received and reconciled."
                });
            }

            invoices.Add(inv);
        }
        db.Invoices.AddRange(invoices);

        await db.SaveChangesAsync();
        logger.LogInformation("Seeded Northstar Labs demo workspace with {Accounts} accounts, {Contacts} contacts, {Leads} leads and {Deals} deals.",
            accounts.Count, contacts.Count, leads.Count, deals.Count);
    }

    private static User NewUser(Guid orgId, string email, string first, string last, string title, string role, string password, DateTime now) => new()
    {
        OrganizationId = orgId,
        Email = email.ToLowerInvariant(),
        FirstName = first,
        LastName = last,
        Title = title,
        Role = role,
        PasswordHash = PasswordHasher.Hash(password),
        IsActive = true,
        LastLoginAt = now.AddDays(-1),
        CreatedAt = now.AddMonths(-14)
    };

    private static Stage NewStage(Guid orgId, Pipeline pipeline, string name, int sort, int probability, string color, DateTime now, bool isWon = false, bool isLost = false) => new()
    {
        OrganizationId = orgId,
        PipelineId = pipeline.Id,
        Name = name,
        SortOrder = sort,
        Probability = probability,
        Color = color,
        IsWon = isWon,
        IsLost = isLost,
        CreatedAt = now.AddMonths(-14)
    };

    private static string NextStepFor(int stageIndex) => stageIndex switch
    {
        0 => "Schedule discovery call",
        1 => "Confirm technical requirements",
        2 => "Send proposal and pricing",
        3 => "Finalise commercial terms",
        _ => "Confirm next action"
    };

    private record AccountSeed(string Name, string Domain, string Industry, int Employees, decimal Revenue, string City, string Country, string Tier, string[] Tags, int AgeDays);
    private record LeadSeed(string FirstName, string LastName, string Company, string Email, string Title, string Source, string Status, int Score, decimal Value, int OwnerIndex);
    private record DealSeed(string Name, int AccountIndex, int StageIndex, decimal Amount, int CloseOffsetDays, int OwnerIndex, string Source, bool Sales);
    private record TicketSeed(string Subject, int AccountIndex, string Status, string Priority, string Channel, int AssigneeIndex, int AgeDays, string Description);
    private record QuoteSeed(int AccountIndex, int DealIndex, string Status, int IssueOffset, int ValidDays, (int ProductIndex, decimal Qty)[] Lines);
}
