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

## 4. Dynamic Application Workflow (NEW!)
- **chrome.runtime.onMessage:** Listens for messages from the background script to start applying for a job.
- **runDynamicApplicationWorkflow():** NEW! Main dynamic workflow that handles unlimited question pages:
  - Clicks Apply button if not already on form
  - Runs unlimited workflow loop to handle any number of pages
  - Processes each page dynamically (contact info, questions, resume, documents, legal)
  - Automatically detects and clicks Continue/Submit buttons
  - Handles success detection with multiple strategies
  - No hardcoded step limits - adapts to any workflow length
- **runUnlimitedWorkflowLoop():** Core loop that processes unlimited pages until success or failure
- **processCurrentPage():** Smart page detection and form filling for current page type
- **proceedToNextPage():** Dynamic button detection and clicking to advance workflow

## 5. Form Filling Functions
- **fillContactFields:** Fills out name, email, phone, address, city, state, zip fields.
- **fillScreenerQuestions:** Selects first radio/option for each screener, fills textareas with "Yes".
- **fillResumeSection:** Selects first resume radio option if present.
- **runDynamicApplicationWorkflow:** NEW! Handles unlimited question pages automatically
- **runUnlimitedWorkflowLoop:** Processes any number of workflow pages (questions, forms, etc.)
- **processCurrentPage:** Detects and fills forms on current page (contact info, questions, resume, etc.)
- **proceedToNextPage:** Finds and clicks Continue/Submit buttons to advance workflow
- **fillEmployerQuestions:** Enhanced with promise-based element detection for dynamic question types
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
- **Dynamic Workflow Issues:** Check runDynamicApplicationWorkflow and runUnlimitedWorkflowLoop
- **Page Detection Problems:** Check processCurrentPage and the has* helper functions (hasContactInfo, hasEmployerQuestions, etc.)
- **Button Clicking Issues:** Check proceedToNextPage, findContinueButton, and findSubmitButton
- **Form Filling Issues:** Check the relevant fill* function (e.g., fillContactInfo, fillEmployerQuestions)
- **Element Detection Problems:** Check promise-based functions (waitForElement, waitForElements, waitForElementInContainer)
- **Success Detection Issues:** Check isSuccessPage and checkApplicationSuccess
- **Job Scraping Issues:** Check jobCardScrape and scrapePage
- **CAPTCHA Problems:** Check showCaptchaModal and detectCloudflareCaptcha
- **Tab/Queue Issues:** Check background.js for tab management and job queue logic

---

## How to Extend
- **Add new form fields:** Update the relevant fill* function (e.g., fillContactInfo, fillEmployerQuestions)
- **Add new page types:** Update processCurrentPage and add new has* detection functions
- **Add new input types:** Update fillEmployerQuestions and fillQuestionByType with new selectors
- **Improve button detection:** Update findContinueButton and findSubmitButton with new selectors
- **Add new success patterns:** Update isSuccessPage with new success indicators
- **Change scraping logic:** Update scrapePage
- **Improve error handling:** Update error handling in runDynamicApplicationWorkflow

## 📍 Q&A Logic Locations (Adding More Questions & Answers)

### 1. **TEXT INPUT ANSWERS** (Line 1755)
```javascript
function getTextInputValue(labelText) {
```
**What it handles:** Address, phone, email, LinkedIn, salary text, company names, etc.
**To add more:** Add new `if` statements checking for keywords in `labelText`
```javascript
if (text.includes('your new question keyword')) {
  return 'Your answer here';
}
```

### 2. **TEXTAREA ANSWERS** (Line 1849) 
```javascript
function getTextareaValue(labelText) {
```
**What it handles:** Cover letters, visa questions, "why do you want this job", motivations, etc.
**To add more:** Add new `if` statements for longer text responses
```javascript
if (text.includes('motivation') || text.includes('why interested')) {
  return 'Your detailed response here...';
}
```

### 3. **NUMBER INPUT ANSWERS** (Line 1895)
```javascript
function getNumberInputValue(labelText) {
```
**What it handles:** Years of experience, age, salary numbers, hours per week, etc.
**To add more:** Add new `if` statements returning numeric strings
```javascript
if (text.includes('years of') && text.includes('management')) {
  return '5'; // 5 years management experience
}
```

### 4. **RADIO BUTTON ANSWERS** (Line 1962)
```javascript
function getRadioValue(labelText, radioButtons) {
```
**What it handles:** Yes/No questions, visa sponsorship, work authorization, availability, etc.
**To add more:** Add new `if` statements that return the appropriate radio button element
```javascript
if (text.includes('willing to relocate')) {
  // Find and return the "Yes" radio button
  return Array.from(radioButtons).find(radio => 
    radio.value.toLowerCase() === 'yes' || 
    radio.nextElementSibling?.textContent?.toLowerCase().includes('yes')
  );
}
```

### 5. **SELECT DROPDOWN ANSWERS** (Line ~2100)
```javascript
function getSelectValue(labelText, selectElement) {
```
**What it handles:** Country, state, education level, experience level dropdowns, etc.
**To add more:** Add new `if` statements returning option values

## Key Improvements in Dynamic System
- **Promise-based element detection:** All selectors now wait for elements to be mounted on DOM
- **Unlimited page handling:** No hardcoded step limits - handles any number of question pages
- **Smart page detection:** Automatically detects page type and fills appropriate forms
- **Dynamic button finding:** Multiple strategies to find Continue/Submit buttons
- **Robust error recovery:** Continues workflow even if individual pages fail
- **Success detection:** Multiple methods to detect successful application submission

---

This map should help you quickly locate the right section for bug fixes or enhancements without reading the whole file.
