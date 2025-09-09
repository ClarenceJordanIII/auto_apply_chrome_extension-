# content.js Code Map & Explanation

This file automates job applications on Indeed using a Chrome extension. Below is a breakdown of the main sections and their purpose, so you can quickly locate and fix bugs or add features without reading all the code.

---

## 1. Event Listeners & Startup
- **Click Listener:** Logs when the content script is clicked (for debugging).
- **Startup Logic:** Adds a "Start" button to the Indeed search form. When clicked, it scrapes job cards from the page (home or search results).
- **Main Entrypoint:** Uses a timeout and a DOM check to ensure the page is ready before starting.

## 2. Job Card Scraping
- **jobCardScrape(getJobCards):** Extracts job info from the page and sends it to the background script for queueing.
- **scrapePage(getJobCards):** Helper to parse job cards and collect job details (title, company, location, etc.).

## 3. Scrolling Utility
- **autoScrollToBottom(callback):** Scrolls the page down and up to trigger lazy loading, then calls a callback.

## 4. Application Workflow
- **chrome.runtime.onMessage:** Listens for messages from the background script to start applying for a job.
- **completeApplicationWorkflow():** Main function that runs all automation steps in order:
  - Fill contact fields
  - Answer screener questions
  - Fill resume section
  - Fill supporting documents
  - Accept legal disclaimers
  - Click relevant buttons (apply, continue, submit)
  - Handles CAPTCHA detection and pauses automation if needed
  - Reports errors for each step

## 5. Form Filling Functions
- **fillContactFields:** Fills out name, email, phone, address, city, state, zip fields.
- **fillScreenerQuestions:** Selects first radio/option for each screener, fills textareas with "Yes".
- **fillResumeSection:** Selects first resume radio option if present.
- **fillSupportingDocuments:** Selects first supporting document radio option if present.
- **acceptLegalDisclaimer:** Checks all checkboxes for legal acceptance.

## 6. Utility Functions
- **safePromise(fn, stepName):** Wraps a function in a Promise for error handling and reporting.
- **Async Wrappers:** Each form filling function has an async wrapper (e.g., fillContactFieldsAsync) for use in the workflow.
- **clickRelevantButton(keywords, stepName):** Finds and clicks buttons matching keywords (apply, continue, submit).

## 7. CAPTCHA Handling
- **showCaptchaModal():** Displays a modal if a CAPTCHA is detected, pausing automation until the user resumes.
- **detectCloudflareCaptcha():** Checks for CAPTCHA elements on the page.

## 8. Tab Management
- **beforeunload Listener:** Notifies the background script when the tab is closed.

---

## Where to Fix Bugs
- **Form Filling Issues:** Check the relevant fill* function (e.g., fillContactFields, fillScreenerQuestions).
- **Button Clicking Issues:** Check clickRelevantButton and clickButtonAsync.
- **Job Scraping Issues:** Check jobCardScrape and scrapePage.
- **CAPTCHA Problems:** Check showCaptchaModal and detectCloudflareCaptcha.
- **Workflow/Step Errors:** Check completeApplicationWorkflow and safePromise.
- **Tab/Queue Issues:** Check background.js for tab management and job queue logic.

---

## How to Extend
- Add new form fields: Update the relevant fill* function.
- Add new workflow steps: Add to completeApplicationWorkflow.
- Change scraping logic: Update scrapePage.
- Improve error handling: Update safePromise and error reporting in completeApplicationWorkflow.

---

This map should help you quickly locate the right section for bug fixes or enhancements without reading the whole file.
