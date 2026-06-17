# QA Orchestrator — Detailed Data Flow Documentation

This document explains exactly how the React frontend receives, parses, and displays data from n8n.

---

## Table of Contents

1. [What We Send (Request Payloads)](#1-what-we-send-request-payloads)
2. [What We Receive (n8n Response Shapes)](#2-what-we-receive-n8n-response-shapes)
3. [How We Extract the Test Cases Array](#3-how-we-extract-the-test-cases-array)
4. [How We Extract Each Test Case Object](#4-how-we-extract-each-test-case-object)
5. [The TestCase Structure We Expect](#5-the-testcase-structure-we-expect)
6. [How the Table Renders the Data](#6-how-the-table-renders-the-data)
7. [Flow Diagram](#7-flow-diagram)

---

## 1. What We Send (Request Payloads)

### A. Generate Test Cases (`POST /webhook/qa-orchestrator`)

**When user selects Manual Text or Jira Link**, we send JSON:

```json
{
  "Domain": "E-commerce",
  "Platform": "Magento",
  "Jira Story ID": "AC-515",
  "Notes": "Focus on security",
  "Input Method": "Manual Text",
  "Jira Link": "",
  "Requirements": "As a user I want to login with email and password..."
}
```

| Variable       | Source in React | When Manual Text      | When Jira Link              |
|----------------|-----------------|------------------------|-----------------------------|
| `Domain`       | `domain` state  | from select           | from select                 |
| `Platform`     | `platform` state| from select           | from select                 |
| `Jira Story ID`| `jiraStoryId`   | from input            | from input or auto-extracted|
| `Notes`        | `notes` state   | from textarea         | from textarea               |
| `Input Method` | `inputMethod`   | `"Manual Text"`       | `"Jira Link"`                |
| `Jira Link`    | `jiraLink`      | `""`                  | full URL                    |
| `Requirements` | `requirements`  | user-typed text       | fetched text or `""`        |

**When user selects Document Upload**, we send FormData (not JSON) with the same field names plus `file`.

---

### B. Jira Fetch (`POST /webhook/jira-fetch`)

```json
{
  "Jira Link": "https://company.atlassian.net/browse/AC-515",
  "Jira Story ID": "AC-515"
}
```

| Variable       | Source in React |
|----------------|-----------------|
| `Jira Link`    | `jiraLink` state |
| `Jira Story ID`| `jiraStoryId` or extracted from URL |

---

## 2. What We Receive (n8n Response Shapes)

n8n can return the test cases in many different formats. Here are all the shapes we handle.

### Shape 1: Raw Array (direct)

```json
[
  { "ID": "SMK-001", "Test case Title": "...", "Test Step": "...", "Test Data": "...", "Expected Result": "...", "Jira id": "AC-515" },
  { "ID": "SMK-002", ... }
]
```

- **How we detect:** `Array.isArray(data)` is `true`
- **What we use:** `data` directly as the array

---

### Shape 2: Wrapped in `data`

```json
{
  "data": [
    { "ID": "SMK-001", ... },
    { "ID": "SMK-002", ... }
  ]
}
```

- **Variable we look for:** `data.data`
- **Condition:** `data?.data && Array.isArray(data.data)`

---

### Shape 3: Wrapped in `test_cases`

```json
{
  "test_cases": [
    { "ID": "SMK-001", ... },
    { "ID": "SMK-002", ... }
  ]
}
```

- **Variable we look for:** `data.test_cases`
- **Condition:** `data?.test_cases && Array.isArray(data.test_cases)`

---

### Shape 4: Nested Array `data[0]`

```json
[
  [
    { "ID": "SMK-001", ... },
    { "ID": "SMK-002", ... }
  ]
]
```

- **Variable we look for:** `data[0]`
- **Condition:** `data?.[0] && Array.isArray(data[0])`
- **What we use:** `data[0]` as the array

---

### Shape 5: Wrapped in `body`, `output`, or `result`

```json
{ "body": [ {...}, {...} ] }
{ "output": [ {...}, {...} ] }
{ "result": [ {...}, {...} ] }
```

- **Variables we look for:** `data.body`, `data.output`, `data.result`
- **Condition:** Each must be an array

---

### Shape 6: n8n Item Format (one per test case)

When the n8n Code node returns `parsedData.test_cases.map(tc => ({ json: tc }))`, the Respond to Webhook may pass through:

```json
[
  { "json": { "ID": "SMK-001", "Test case Title": "...", "Test Step": "...", "Test Data": "...", "Expected Result": "...", "Jira id": "AC-515" } },
  { "json": { "ID": "SMK-002", ... } }
]
```

- **Variable we look for:** `item.json` inside each array element
- **Logic:** If `item` has a `json` property and it's an object, we use `item.json`; otherwise we use `item` itself

---

### Shape 7: Single Item (Respond to Webhook "First Item" mode)

```json
{
  "json": {
    "ID": "SMK-001",
    "Test case Title": "...",
    "Test Step": "...",
    "Test Data": "...",
    "Expected Result": "...",
    "Jira id": "AC-515"
  }
}
```

- **How we detect:** `arr.length === 0` after extraction, but `data` is an object with a `json` key
- **What we do:** Wrap `data` in an array: `[data]`, then process normally (so we treat it as a 1-row table)

---

### Shape 8: CSV String (legacy)

```json
{
  "csv": "ID,\"Test case Title\",\"Test Step\",\"Test Data\",\"Expected Result\",\"Jira id\"\nSMK-001,\"Login with...\",\"1. Navigate...\",\"...\",\"...\",\"AC-515\"\n..."
}
```

- **Variable we look for:** `data.csv`
- **What we do:** Pass to `parseCSVToTestCases(data.csv)` which parses CSV line-by-line

---

### Shape 9: Error from n8n Code Node

```json
{
  "error": "AI response was missing the test_cases array.",
  "raw": "..."
}
```

or inside an item:

```json
{ "json": { "error": "Failed to parse AI output.", "details": "...", "raw": "..." } }
```

- **Variable we look for:** `data.error` or `tc.error`
- **What we do:** Throw an error so the user sees the message instead of a broken table

---

## 3. How We Extract the Test Cases Array

**Order of checks** (in `parseResponse`):

```
1. Parse response text as JSON → data
2. If data.csv exists → use parseCSVToTestCases(data.csv), done
3. If data.error exists → throw Error(data.error)
4. Extract array:
   - If Array.isArray(data)           → arr = data
   - Else if data.data is array      → arr = data.data
   - Else if data.test_cases is array→ arr = data.test_cases
   - Else if data[0] is array        → arr = data[0]
   - Else if data.body is array      → arr = data.body
   - Else if data.output is array    → arr = data.output
   - Else if data.result is array    → arr = data.result
   - Else                            → arr = []
5. If arr is empty AND data has "json" key → arr = [data]
6. Map over arr to normalize each item (see next section)
```

---

## 4. How We Extract Each Test Case Object

For each element `item` in the array:

```
1. Check: Does item have a "json" property that is an object?
   - YES → tc = item.json
   - NO  → tc = item

2. Check: Does tc have an "error" property (string)?
   - YES → throw Error(tc.error)
   - NO  → continue

3. Normalize: return { ...EMPTY_TEST_CASE, ...tc }
   - EMPTY_TEST_CASE ensures all 6 keys exist with "" as default
   - tc overwrites with actual values
```

---

## 5. The TestCase Structure We Expect

Every test case object is normalized to this shape:

| Key                 | Type   | Example                                                    |
|---------------------|--------|------------------------------------------------------------|
| `ID`                | string | `"SMK-001"`                                                |
| `Test case Title`   | string | `"Login with valid email and password"`                    |
| `Test Step`         | string | `"1. Navigate to homepage. 2. Click Login..."`             |
| `Test Data`         | string | `"email: user@example.com, password: ValidPass123!"`       |
| `Expected Result`   | string | `"User is authenticated and redirected to dashboard."`      |
| `Jira id`        | string | `"AC-515"`                                                 |

**Why bracket notation in JSX?** Keys like `Test case Title` and `Jira id` have spaces; `tc["Test case Title"]` works, `tc.Test case Title` does not.

---

## 6. How the Table Renders the Data

```jsx
{(testCases ?? []).map((tc, idx) => (
  <tr key={idx}>
    ...
    <input value={tc["ID"] || ""} ... />
    <input value={tc["Test case Title"] || ""} ... />
    <textarea value={tc["Test Step"] || ""} ... />
    <input value={tc["Test Data"] || ""} ... />
    <textarea value={tc["Expected Result"] || ""} ... />
    <input value={tc["Jira id"] || ""} ... />
  </tr>
))}
```

| Cell              | Bracket Notation          | Fallback | Reason                                      |
|-------------------|---------------------------|----------|---------------------------------------------|
| ID                | `tc["ID"]`                | `|| ""`  | Safe if undefined/null                      |
| Test case Title   | `tc["Test case Title"]`   | `|| ""`  | Space in key; controlled components         |
| Test Step         | `tc["Test Step"]`         | `|| ""`  | Same                                        |
| Test Data         | `tc["Test Data"]`         | `|| ""`  | Same                                        |
| Expected Result   | `tc["Expected Result"]`   | `|| ""`  | Same                                        |
| Jira id        | `tc["Jira id"]`        | `|| ""`  | Space in key; safe fallback                 |

---

## 7. Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│ USER clicks "Generate Test Cases"                                        │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ handleSubmit()                                                           │
│ - Builds payload: { Domain, Platform, Jira Story ID, Notes,             │
│   Input Method, Jira Link, Requirements }                               │
│ - POST to WEBHOOK_URL                                                    │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ n8n Webhook → Switch → (Jira or Manual) → AI Agent → Code → Respond      │
│ Returns: JSON array or wrapped object                                    │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ parseResponse(response)                                                  │
│ 1. response.text() → raw string                                          │
│ 2. JSON.parse(text) → data                                                │
│ 3. Find array: data | data.data | data.test_cases | data[0] | ...       │
│ 4. For each item: extract tc = item.json ?? item                         │
│ 5. Normalize: { ...EMPTY_TEST_CASE, ...tc }                              │
│ 6. Return TestCase[]                                                      │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ setTestCases(filledCases)                                                │
│ - filledCases = cases from parseResponse, with Jira id filled         │
│ - setStep("review")                                                       │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ RENDER: (testCases ?? []).map((tc, idx) => <tr>...)                     │
│ - Each row binds tc["ID"], tc["Test case Title"], etc. to inputs        │
│ - User can edit, delete rows, add rows                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Quick Reference: Variables the Frontend Looks For

| Context            | Variable / Path                     | What we do                         |
|--------------------|-------------------------------------|------------------------------------|
| Response root     | `data` (if array)                   | Use as test cases array            |
| Response object   | `data.data`                         | Use if array                       |
| Response object   | `data.test_cases`                   | Use if array                       |
| Response array    | `data[0]`                           | Use if array (nested)              |
| Response object   | `data.body`                         | Use if array                       |
| Response object   | `data.output`                       | Use if array                       |
| Response object   | `data.result`                       | Use if array                       |
| Response object   | `data.csv`                          | Parse as CSV                       |
| Response object   | `data.error`                        | Throw error                        |
| Per item          | `item.json`                         | Use as test case if present        |
| Per item          | `item` (no json)                    | Use as test case                   |
| Per item          | `tc.error`                          | Throw error                        |
| Test case object  | `ID`, `Test case Title`, `Test Step`, `Test Data`, `Expected Result`, `Jira id` | Render in table |
