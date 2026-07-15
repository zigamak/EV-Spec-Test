# Test Fixtures — Data Handling Rule

Golden test set = 15–20 real client enquiries + expected parsed briefs + quotes.

- fixtures/raw/ is GITIGNORED. Real enquiry emails live here, local only.
- fixtures/anonymized/ is committed. Before committing, every fixture must have:
  names → fake names; emails/phones → fake; company names → fictional;
  venue names KEPT (they're the business data being tested);
  dates/guest counts/budgets/event types KEPT (they're the parsing targets).
- The golden test runs against anonymized/. CI never touches raw/.
- Rationale: enquiries contain personal data under HK PDPO. Git history is
  forever; the repo lives under the client org and may gain collaborators.
