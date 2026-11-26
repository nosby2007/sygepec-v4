# Assurance testing scenarios

Put one JSON file per scenario here. `npm run ats` runs them, with the built-in InnovaTax
reference cases, and writes the package to `ats-out/<date>/` (not committed).

The official IRS scenarios (Publication 1436, Test Package for Electronic Filers of
Individual Income Tax Returns, for the tax year) are released to e-file applicants. Enter
them from the official publication only. Never write them from memory or from a third-party copy.

```json
{
  "id": "ATS-2026-1",
  "source": "IRS_ATS",
  "reference": "Pub. 1436 (Rev. ...), tax year 2026, scenario 1",
  "title": "Short description",
  "taxYear": 2026,
  "jurisdictions": ["US"],
  "intake": { "personal": { "firstName": "...", "lastName": "...", "ssnLast4": "...", "state": "GA" }, "filingStatus": "SINGLE", "forms": [] },
  "supplement": {},
  "expected": { "US": { "1040.11": 0, "1040.24": 0 } }
}
```

- `intake` uses the questionnaire format (`lib/intake-schema.js`), so the scenario also
  tests the questionnaire mapping.
- `expected` lists line figures by InnovaTax line id (`1040.11`, `500.16`...), in whole
  dollars, taken from the scenario's expected return.
- The ATS scenarios use IRS test identification numbers. Never put a real taxpayer's
  details in a scenario file.
- Passing here is not ATS. ATS means sending these returns to the IRS ATS environment
  with the official schema and getting IRS acknowledgements.
