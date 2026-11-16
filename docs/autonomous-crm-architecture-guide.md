# Autonomous CRM Architecture Guide: Self-Driving & Self-Improving Systems

This technical guide specifies the architectural design, background daemons, event bus, and algorithms necessary to transform a standard CRM into an **autonomous, self-healing system**.

---

## 1. System Architecture Overview

An autonomous CRM operates on an **event-driven outbox pattern** combined with continuous background daemons. Rather than requiring users to manually execute data entry and administrative follow-ups, autonomous software agents listen to domain events and execute tasks asynchronously.

```
       +-------------------------------------------------------------+
       |                     API Gateway / Controllers               |
       +-------------------------------------------------------------+
                                      |
                           Domain Event Dispatcher
                                      |
         +----------------------------+----------------------------+
         |                                                         |
         v                                                         v
+------------------+                                     +-------------------+
|  HelixDbContext  |                                     | Continuous Daemon |
| (PostgreSQL 17)  |                                     |    Engine         |
+------------------+                                     +-------------------+
         |                                                         |
         +----------------------------+----------------------------+
                                      |
                        +---------------------------+
                        |   Autonomous AI Workers   |
                        +---------------------------+
                        | 1. Auto-Enrichment        |
                        | 2. Fuzzy Deduplication    |
                        | 3. Smart Routing & Scores |
                        | 4. SLA & Velocity Monitors|
                        | 5. Continuous Audit Loop  |
                        +---------------------------+
```

---

## 2. The Five Autonomous Workers

### Worker 1: Automated Data Enrichment (The Identity Engine)
- **Trigger:** Event `LeadCreated` or `AccountCreated`.
- **Functionality:**
  1. Inspects the email domain or website URL (e.g. `anthropic.com`).
  2. Queries enrichment APIs (or waterfall fallback APIs).
  3. Appends structured attributes without overwriting user-customized fields:
     - `Company.Employees`
     - `Company.AnnualRevenue`
     - `Company.Industry`
     - `Company.Country` / `Company.City`
     - `Contact.LinkedInUrl`
     - `Contact.Title`
  4. Records an entry in `AuditLog` stating `ActorName: "Autonomous Enrichment Worker"`.

### Worker 2: Self-Healing Data Hygiene & Fuzzy Deduplication
- **Trigger:** Scheduled cron (every hour) + immediate post-ingestion hook.
- **Algorithm (Jaro-Winkler + Exact Match):**
  - **Account Matching:** Normalizes company names (removes "Inc", "LLC", "Ltd", "Corp", punctuation) and computes string similarity index:
    $$\text{Similarity}(A, B) \ge 0.90 \implies \text{Potential Duplicate}$$
  - **Contact Matching:** Evaluates matching email addresses, or combination of `(NormalizedLastName + Phone)` or `(NormalizedLastName + AccountId)`.
- **Survivorship & Auto-Merge Rules:**
  - If match confidence $\ge 98\%$: Automatically merge records. Keep oldest `CreatedById` and newest interaction history. Append unique tags and linked deals.
  - If match confidence between $85\%$ and $97\%$: Flag records with `IsDuplicateCandidate = true` and present a 1-click merge notification on the manager dashboard.

### Worker 3: Autonomous Lead Scoring & Smart Routing
- **Trigger:** Event `LeadCreated` or `LeadUpdated`.
- **Dynamic Scoring Matrix:**
  $$\text{Score} = \text{Base} + w_{\text{firmographic}} + w_{\text{seniority}} + w_{\text{engagement}}$$
  - **Firmographics ($+0 \text{ to } 40$):** Matching target industry ($+20$), employee count $>100$ ($+20$).
  - **Seniority ($+0 \text{ to } 30$):** Title contains "VP", "Director", "Chief", "Head" ($+30$).
  - **Completeness ($+0 \text{ to } 30$):** Valid phone ($+15$), corporate email address ($+15$).
- **Autonomous Routing:**
  - Leads with $\text{Score} \ge 75$: Immediately assigned to Account Executives via round-robin within the territory.
  - Leads with $\text{Score} < 75$: Assigned to Inbound SDR queue with an automated qualification drip sequence.

### Worker 4: Pipeline Velocity & Stagnant Deal Escalation
- **Trigger:** Daily midnight cron job (`0 0 * * *`).
- **Logic:**
  1. Scans all open deals where `Status == "Open"`.
  2. Computes duration in current stage: $\Delta t = \text{UtcNow} - \text{LastStageMovedAt}$.
  3. If $\Delta t > \text{Stage.StaleThresholdDays}$ (default 14 days) and no activity recorded in the past 7 days:
     - Automatically applies warning badge `Stalled`.
     - Reduces probability by $20\%$ to ensure forecast accuracy.
     - Automatically generates a task for the owner: *"Urgent: Re-engage deal or update stage"*.
     - If $\Delta t > 30$ days, alerts the sales manager.

### Worker 5: Continuous SLA Auto-Escalation & Support Triage
- **Trigger:** Every 5 minutes background check.
- **Logic:**
  1. Inspects tickets where `Status in ("Open", "Pending")` and `SlaDueAt != null`.
  2. Calculates remaining SLA percentage:
     $$P_{\text{remaining}} = \frac{\text{SlaDueAt} - \text{UtcNow}}{\text{SlaDueAt} - \text{CreatedAt}}$$
  3. Escalation Tiers:
     - $P_{\text{remaining}} \le 0.25$ (75% time elapsed): Sends warning notification to assignee.
     - $P_{\text{remaining}} \le 0.00$ (SLA Breached): Updates priority to `Urgent`, assigns to tier-2 escalation queue, and marks `SlaBreached = true`.

---

## 3. Self-Improving Accuracy: The Closed-Loop Feedback Engine

To ensure the CRM becomes more accurate over time, the system implements continuous feedback loops:

```
[ Historical Deals / Outcomes ] 
              │
              ▼
   [ Win/Loss Machine Learning ] ──► Recalibrate Lead Score Weights
              │
              ▼
   [ Predictive Deal Forecasts ] ──► Accurate Revenue Expectations
              │
              ▼
   [ Anomaly Integrity Scans  ] ──► Auto-Detect & Fix False Forecasts
```

### 1. Win/Loss Feature Weight Recalibration
- At the end of each fiscal month, the system analyzes all deals closed won vs closed lost.
- Computes correlation coefficients between win rates and initial lead sources, industries, and deal sizes.
- Automatically adjusts lead scoring parameters so future incoming leads are scored according to what **actually** closed, not gut feeling.

### 2. Zero-Touch Activity Logging
- Sales representatives often omit logging notes. The CRM connects directly to mail exchange (IMAP/SMTP/Microsoft Graph) and calendar APIs.
- Automatically matches inbound/outbound communication against known contact email addresses and appends them to the account activity stream in real time.

### 3. Continuous Data Freshness Verification
- Any record untouched for $>180$ days is flagged with a `Data Decay Warning`.
- If an outbound message receives an SMTP bounce (hard bounce `550`), the contact's email is marked invalid, and an automated task is dispatched to locate the updated contact details.

---

## 4. Database Schema Extensions for Autonomous Operations

```sql
-- Dynamic Data Hygiene & Enrichment
ALTER TABLE "Accounts" ADD COLUMN "EnrichmentDataJson" jsonb DEFAULT '{}';
ALTER TABLE "Accounts" ADD COLUMN "DataFreshnessScore" integer DEFAULT 100;
ALTER TABLE "Accounts" ADD COLUMN "IsDuplicateCandidate" boolean DEFAULT false;

-- Autonomous Pipeline Velocity
ALTER TABLE "Deals" ADD COLUMN "LastStageMovedAt" timestamp with time zone DEFAULT NOW();
ALTER TABLE "Deals" ADD COLUMN "IsStalled" boolean DEFAULT false;
ALTER TABLE "Deals" ADD COLUMN "HealthIndex" integer DEFAULT 100;

-- SLA & Autonomous Escalations
ALTER TABLE "Tickets" ADD COLUMN "SlaBreached" boolean DEFAULT false;
ALTER TABLE "Tickets" ADD COLUMN "EscalationLevel" integer DEFAULT 0;

-- Automation Rules Store
CREATE TABLE "AutomationRules" (
    "Id" uuid PRIMARY KEY,
    "OrganizationId" uuid NOT NULL,
    "Name" varchar(150) NOT NULL,
    "EventType" varchar(50) NOT NULL,
    "ActionType" varchar(50) NOT NULL,
    "ActionConfigJson" jsonb DEFAULT '{}',
    "IsActive" boolean DEFAULT true,
    "ExecutionCount" integer DEFAULT 0,
    "CreatedAt" timestamp with time zone DEFAULT NOW(),
    "UpdatedAt" timestamp with time zone DEFAULT NOW(),
    "IsDeleted" boolean DEFAULT false
);

CREATE TABLE "CannedResponses" (
    "Id" uuid PRIMARY KEY,
    "OrganizationId" uuid NOT NULL,
    "Title" varchar(120) NOT NULL,
    "Shortcut" varchar(40) NOT NULL,
    "Content" text NOT NULL,
    "Category" varchar(60) DEFAULT 'General',
    "CreatedAt" timestamp with time zone DEFAULT NOW(),
    "UpdatedAt" timestamp with time zone DEFAULT NOW(),
    "IsDeleted" boolean DEFAULT false
);
```

---

## 5. Summary of Autonomous Benefits

1. **85% Reduction in Manual Admin Work:** Reps spend time selling and resolving tickets rather than manually copying and pasting information.
2. **Elimination of Stale Data:** The self-healing hygiene daemon continually purges duplicates and flags outdated contacts.
3. **Guaranteed SLA Compliance:** Escalation engines intercept slow tickets before contractual breaches occur.
4. **Predictable Forecasting:** Stalled deals are automatically penalized, eliminating "pipeline fluff" from board presentations.
