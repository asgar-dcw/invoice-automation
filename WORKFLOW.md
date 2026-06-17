# QA Automation Orchestrator — Complete Workflow Documentation

## Overview

The application is a two-step wizard:
1. **Step 1 (Form):** User enters project metadata and requirements.
2. **Step 2 (Review):** User reviews, edits, and exports AI-generated test cases.

Data flows: **React App** → **n8n Webhook** → **AI (Groq)** → **Response** → **React App**.

---

## Endpoint

| Environment | URL |
|-------------|-----|
| Development (Vite proxy) | `http://localhost:5173/webhook/qa-orchestrator` |
| Production | `https://hr.n8n.dcw.dev/webhook/qa-orchestrator` |

**Method:** `POST`  
**Content-Type:** `application/json` (for manual/link) or `multipart/form-data` (for document upload)

---

## Request Formats

### Option A: JSON (Manual Text or Jira Link)

When the user selects **Manual Text** or **Jira Link**, the app sends JSON.

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "Domain": "E-commerce",
  "Platform": "Magento",
  "Jira Story ID": "SMK-123",
  "Requirements": "As a user I want to login...",
  "Notes": "Additional context or special requirements"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `Domain` | string | Yes | One of: `E-commerce`, `B2B Portal`, `SaaS` |
| `Platform` | string | Yes | One of: `Magento`, `Shopify`, `Custom Web` |
| `Jira Story ID` | string | Yes | e.g. `SMK-123`, `PROJ-456` |
| `Requirements` | string | Yes | For **Manual**: pasted text. For **Link**: Jira issue URL |
| `Notes` | string | No | Extra context, constraints, or notes |

---

### Option B: FormData (Document Upload)

When the user selects **Upload Document**, the app sends `multipart/form-data` with a file.

**Form fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `Domain` | string | Yes | Same as above |
| `Platform` | string | Yes | Same as above |
| `Jira Story ID` | string | Yes | Same as above |
| `Requirements` | string | Yes | For documents: usually `Notes` value (document content is in file) |
| `Notes` | string | No | Same as above |
| `file` | File | Yes | PDF (`.pdf`), Word (`.doc`, `.docx`) |

**Example (form fields only):**
```
Domain: E-commerce
Platform: Magento
Jira Story ID: SMK-123
Requirements: (context from notes)
Notes: Focus on checkout flow
file: [binary PDF/DOC/DOCX]
```

---

## What n8n Expects (Webhook → AI Agent)

The n8n **Webhook** node receives the request. The **AI Agent** uses these values:

| n8n Expression | Source | Description |
|----------------|--------|-------------|
| `$json.body.Domain` | Request body | Domain (e.g. E-commerce) |
| `$json.body.Platform` | Request body | Platform (e.g. Magento) |
| `$json.body['Jira Story ID']` | Request body | Jira Story ID |
| `$json.body.Requirements` | Request body | Main requirements text or Jira URL |
| `$json.body.Notes` | Request body | Additional notes |

**AI Prompt (simplified):**
- Analyze requirements for `Platform` application in `Domain` domain.
- Use `Requirements` (or `Notes`) as the main input.
- Include `Jira Story ID` in output.
- Return JSON with a `test_cases` array.

---

## AI Output Format (What n8n Asks For)

The AI Agent prompt requires this structure:

```json
{
  "test_cases": [
    {
      "ID": "SMK-001",
      "Test case Title": "Login with valid credentials",
      "Test Step": "1. Navigate to login; 2. Enter credentials; 3. Click Login",
      "Test Data": "username: test@example.com, password: Test@123",
      "Expected Result": "User is authenticated and redirected to dashboard",
      "Jira id": "SMK-123"
    }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ID` | string | Yes | Test case ID (e.g. SMK-001) |
| `Test case Title` | string | Yes | Title of the test case |
| `Test Step` | string | Yes | Step-by-step actions |
| `Test Data` | string | Yes | Test data used (empty if not applicable) |
| `Expected Result` | string | Yes | Expected outcome |
| `Jira id` | string | Yes | Jira Story ID from the request |

---

## Response Formats (What the React App Accepts)

The React app can parse any of these response types.

### 1. JSON Array (Preferred)

```json
[
  {
    "ID": "SMK-001",
    "Test case Title": "Login with valid credentials",
    "Test Step": "1. Navigate...",
    "Test Data": "username: test@example.com",
    "Expected Result": "User is authenticated",
    "Jira id": "SMK-123"
  }
]
```

### 2. JSON Object with `test_cases` Array

```json
{
  "test_cases": [
    {
      "ID": "SMK-001",
      "Test case Title": "...",
      "Test Step": "...",
      "Test Data": "...",
      "Expected Result": "...",
      "Jira id": "SMK-123"
    }
  ]
}
```

### 3. JSON Object with `data` Array

```json
{
  "data": [
    { "ID": "SMK-001", "Test case Title": "...", ... }
  ]
}
```

### 4. JSON Object with `csv` String

```json
{
  "csv": "ID,\"Test case Title\",\"Test Step\",\"Test Data\",\"Expected Result\",\"Jira id\"\nSMK-001,\"Login with valid credentials\",\"...\",\"...\",\"...\",\"SMK-123\""
}
```

### 5. Raw CSV (text/csv or plain text)

```
ID,"Test case Title","Test Step","Test Data","Expected Result","Jira id"
SMK-001,"Login with valid credentials","1. Navigate...","username: test@example.com","User is authenticated","SMK-123"
SMK-002,"Login with invalid password","...","...","...","SMK-123"
```

**CSV Rules:**
- First row: headers matching the keys above
- Use quoted values for fields with commas
- Escape `"` as `""`

---

## Jira Fetch Endpoint (Preview Requirements)

When the user selects **Jira Link** and enters a URL, the app can fetch the issue content and display it before generating test cases.

**Endpoint:** `POST /webhook/jira-fetch`  
**URL:** Same base as main webhook (e.g. `https://hr.n8n.dcw.dev/webhook/jira-fetch`)

**Request:**
```json
{
  "Jira Link": "https://company.atlassian.net/browse/AC-515",
  "Jira Story ID": "AC-515"
}
```

**Expected Response:**
```json
{
  "requirements": "Description and acceptance criteria text from the Jira issue...",
  "jiraStoryId": "AC-515"
}
```

If your n8n has Jira extraction logic, create a workflow that:
1. Receives the webhook with `Jira Link` and `Jira Story ID`
2. Uses the Jira node or HTTP Request to fetch the issue
3. Extracts `summary`, `description`, and acceptance criteria
4. Returns `{ requirements, jiraStoryId }`

Set `VITE_JIRA_FETCH_URL` in Vercel if the path differs from `/webhook/jira-fetch`.

---

## Current n8n Workflow

1. **Webhook** — Receives POST at `/webhook/qa-orchestrator`, parses body.
2. **AI Agent** — Sends prompt to Groq with body fields.
3. **Groq Chat Model** — `openai/gpt-oss-120b`.
4. **Code Node** — Reads AI output, strips markdown, parses JSON, builds CSV, returns `{ csv }`.

**Note:** The Code node outputs `{ json: { csv } }`. A **Respond to Webhook** node is needed to return this to the client. If missing, the workflow may not respond correctly.

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ USER (React App)                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Fill form (Domain, Platform, Jira ID, Requirements, Notes)                │
│ 2. Choose: Manual Text | Jira Link | Document Upload                         │
│ 3. Click "Generate Test Cases"                                               │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │ POST
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ n8n WEBHOOK                                                                  │
│   - Path: /webhook/qa-orchestrator                                           │
│   - Method: POST                                                             │
│   - Body: JSON or FormData (see Request Formats above)                        │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ AI AGENT (Groq)                                                              │
│   - Input: $json.body.Domain, Platform, Jira Story ID, Requirements, Notes   │
│   - Output: { "test_cases": [ {...}, {...} ] }                               │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ CODE NODE                                                                    │
│   - Parse AI JSON (handle markdown blocks)                                   │
│   - Extract test_cases array                                                 │
│   - Convert to CSV                                                          │
│   - Output: { csv: "ID,...\nSMK-001,..." }                                  │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ RESPOND TO WEBHOOK (needed in n8n)                                           │
│   - Send CSV or JSON back to client                                          │
│   - Content-Type: text/csv or application/json                               │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ USER (React App)                                                             │
│   - Receives response                                                        │
│   - Parses JSON or CSV → testCases state                                     │
│   - Shows Review screen (editable table)                                     │
│   - User can: Edit, Delete rows, Add rows                                    │
│   - Actions: Export CSV | Back to Form | Submit Final Cases                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Validation Rules (React App)

| Rule | When |
|------|------|
| Jira Story ID required | Always |
| Manual text required | When input method = manual |
| Jira link required | When input method = link |
| Document required | When input method = document |

---

## Example: Full Request → Response

### Request
```bash
curl -X POST https://hr.n8n.dcw.dev/webhook/qa-orchestrator \
  -H "Content-Type: application/json" \
  -d '{
    "Domain": "E-commerce",
    "Platform": "Magento",
    "Jira Story ID": "SMK-456",
    "Requirements": "As a customer I want to log in with email and password. Acceptance criteria: valid credentials redirect to dashboard, invalid shows error.",
    "Notes": "Focus on happy path and error handling"
  }'
```

### Expected Response (CSV — current n8n behavior)
```
ID,"Test case Title","Test Step","Test Data","Expected Result","Jira id"
SMK-001,"Login with valid credentials","1. Go to login; 2. Enter email and password; 3. Click Login","email: user@test.com, password: ValidPass1","Redirect to dashboard","SMK-456"
SMK-002,"Login with invalid password","...","...","Error message shown","SMK-456"
```

### Or (JSON — preferred for direct parsing)
```json
{
  "test_cases": [
    {
      "ID": "SMK-001",
      "Test case Title": "Login with valid credentials",
      "Test Step": "1. Go to login; 2. Enter email and password; 3. Click Login",
      "Test Data": "email: user@test.com, password: ValidPass1",
      "Expected Result": "Redirect to dashboard",
      "Jira id": "SMK-456"
    }
  ]
}
```

---

## Summary Table

| Item | Format |
|------|--------|
| **Request (manual/link)** | `application/json` with `Domain`, `Platform`, `Jira Story ID`, `Requirements`, `Notes` |
| **Request (document)** | `multipart/form-data` with same fields + `file` |
| **n8n body access** | `$json.body.Domain`, `$json.body.Platform`, etc. |
| **AI output** | `{ "test_cases": [ {...} ] }` |
| **Response accepted** | JSON array, `{ test_cases: [...] }`, `{ data: [...] }`, `{ csv: "..." }`, or raw CSV |
| **Test case keys** | `ID`, `Test case Title`, `Test Step`, `Test Data`, `Expected Result`, `Jira id` |
