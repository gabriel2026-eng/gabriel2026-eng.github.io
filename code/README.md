# Demo code

Two small automations built for a fictional woodworking shop ("Oak & Form Woodworks"). All names, orders and email addresses are invented; every address ends in `.example`. The scripts contain no keys and send nothing on their own.

## `sheets-automation.js` — order automation in Google Sheets

Google Apps Script. When a customer submits the order form, the script validates the answers (email, quantity, product in the catalogue, address), numbers the order, writes a clean row in the **Orders** sheet, emails the customer a confirmation, alerts the owner with a link to the row, tracks the status with colours and sends a daily digest of orders still "New" after 24 hours. `orders-sample.csv` shows what the sheet looks like after a couple of weeks.

Install: paste the file into **Extensions → Apps Script** of a spreadsheet linked to a Google Form with the seven questions listed in `FIELDS`, set the owner email in `SETTINGS`, run `setupSheet` once, then `installTriggers`. (Identifiers in the code are still in Romanian; comments and all user-facing texts are English.)

## `email-assistant.py` — AI assistant that drafts replies to customer emails

Python 3.10+. Reads customer emails, and for each one prepares a category, a priority with its reason, a summary and a draft reply in the customer's language, using the Claude API with a structured JSON schema. The assistant uses only the company context in the script and never invents prices or promises; what a person must verify goes into a "To check" note. Nothing is sent: the output is a Markdown report.

- Demo mode, no API key: `python email-assistant.py --demo` (uses `emails-sample.json` and the pre-written `replies-demo.json`, writes `email-assistant-report.md`).
- Real mode: `pip install anthropic`, set `ANTHROPIC_API_KEY` in the environment, then `python email-assistant.py --limit 1`.

For a real client the same logic connects to Gmail (Apps Script or Gmail API) or Outlook (Power Automate or Microsoft Graph), always creating drafts, never sending.
