# Dynamic Input Field Use Cases for Indeed Chrome Extension

This document outlines how the Chrome extension handles various dynamic input field patterns encountered on Indeed's SmartApply system, keeping IDs and selectors dynamic to adapt to Indeed's changing markup.

## 1. Radio Button Questions (Single Select)

### Use Case: Commute/Location Questions
**Pattern:** `"Will you be able to reliably commute to [Location] for this job?"`
```html
<input id="single-select-question-:r3:-0" type="radio" name="q_722315e52cbe4b18b58279a3a0abae28" 
       data-testid="input-q_722315e52cbe4b18b58279a3a0abae28-single-select-question-:r3:-0" 
       value="1">
```

**Dynamic Selectors Used:**
- `input[type="radio"]`
- `input[id*="single-select-question"]`
- `[data-testid*="input-q_"]`

**Logic:** Detects "commute", "reliably commute to", "report for", "work in" keywords and selects "Yes" (value="1")

### Use Case: Work Authorization Questions
**Pattern:** `"Are you authorized to work in the United States?"`
```html
<input id="single-select-question-:rf:-0" type="radio" name="q_c6e2f059212278264c4ee5fe4b8d5b30" 
       value="1">
```

**Logic:** Detects "authorized to work", "employment eligibility" keywords and selects "Yes" (value="1")

## 2. Textarea Questions (Rich Text)

### Use Case: Visa Sponsorship Questions
**Pattern:** `"Will you now or in the future require sponsorship for employment visa status (e.g., H-1B visa)?"`
```html
<textarea rows="3" id="rich-text-question-input-:r6:" name="q_e2715f2865fd3d071ed025f84bf8fc5d" 
          class="mosaic-provider-module-apply-questions-170di6b e1jgz0i2"></textarea>
```

**Dynamic Selectors Used:**
- `textarea`
- `input[id*="rich-text-question"]`
- `[name^="q_"]`

**Logic:** Detects "visa", "sponsorship", "H-1B" keywords and responds with "No sponsorship required"

## 3. Number Input Questions

### Use Case: Years of Experience
**Pattern:** `"How many years of [Technology] experience do you have?"`
```html
<input type="text" min="0" max="99" name="q_979750bd0db1e22a2a4b03c8eed9cd09" 
       inputmode="text" id="number-input-:r9:" 
       data-testid="input-q_979750bd0db1e22a2a4b03c8eed9cd09-input">
```

**Dynamic Selectors Used:**
- `input[type="number"]`
- `input[inputmode="numeric"]`
- `input[inputmode="text"][min]`
- `input[id*="number-input"]`
- `input[data-testid*="input"][min]`

**Logic:** Maps technology keywords to experience years:
- "iOS development" → 5 years
- "Technical leader" → 3 years
- "Software development" → 4 years
- Default → 1 year

## 4. Dynamic Container Detection

### Question Containers
The extension dynamically detects question containers using multiple selectors:
```javascript
const questionContainers = document.querySelectorAll(
  '.ia-Questions-item, [id^="q_"], [data-testid*="input-q_"], [class*="Questions-item"]'
);
```

**Patterns Handled:**
- `<div id="q_0" class="ia-Questions-item">`
- `<div data-testid="input-q_722315e52cbe4b18b58279a3a0abae28">`
- `<div class="mosaic-provider-module-apply-questions-1iqcevu">`

## 5. Dynamic Label Detection

### Question Text Extraction
Labels are extracted using flexible selectors that adapt to Indeed's markup changes:
```javascript
const labelElement = container.querySelector(
  'label, legend, [data-testid*="label"], [data-testid*="rich-text"], span[data-testid*="rich-text"]'
);
```

**Patterns Handled:**
- `<label id="single-select-question-label-single-select-question-:r3:">`
- `<span data-testid="input-q_722315e52cbe4b18b58279a3a0abae28-label">`
- `<span data-testid="rich-text" class="mosaic-provider-module-apply-questions-1oc3ga3">`

## 6. Input Value Detection Priority

The extension checks input types in this order to avoid conflicts:

1. **Number Inputs** (highest priority - checked first)
2. **Text Inputs** (excluding number inputs)
3. **Textareas** (rich text questions)
4. **Select Dropdowns**
5. **Radio Buttons**
6. **Checkboxes**
7. **Date Inputs** (lowest priority)

## 7. Error Handling and Fallbacks

### Dynamic ID Handling
- IDs like `:r3:` are React-generated and change between sessions
- Extension uses attribute selectors and partial matches instead of exact IDs
- Falls back to CSS class patterns when data-testid attributes are unavailable

### Input Detection Fallbacks
```javascript
// Primary: Specific input type
const numberInput = container.querySelector('input[type="number"]');

// Fallback: Input mode detection
const numberInput = container.querySelector('input[inputmode="numeric"]');

// Final fallback: ID pattern matching
const numberInput = container.querySelector('input[id*="number-input"]');
```

## 8. Real-World Implementation

### Complete Question Processing Flow
1. **Container Detection**: Find all question containers using multiple selectors
2. **Label Extraction**: Extract question text using flexible label selectors
3. **Input Type Detection**: Determine input type using priority-based checking
4. **Value Assignment**: Apply appropriate response based on question context
5. **Event Triggering**: Fire change/input events to notify Indeed's JavaScript

### Example: Processing Complete Form
```javascript
// Container found: <div id="q_0" class="ia-Questions-item">
// Label extracted: "will you be able to reliably commute to irving, tx 75039 for this job?"
// Input detected: Radio buttons with values "1" (Yes) and "0" (No)
// Logic applied: Commute question → Select "Yes" (value="1")
// Result: Radio button checked and change event fired
```

## 9. Benefits of Dynamic Approach

### Adaptability
- **No Hard-coded IDs**: Works with Indeed's changing React-generated IDs
- **Multiple Selector Strategies**: Falls back gracefully when markup changes
- **Content-Based Logic**: Uses question text rather than markup structure for decisions

### Maintainability
- **Single Logic Point**: All input detection logic centralized in `fillQuestionByType()`
- **Easy Extension**: New input patterns can be added without breaking existing logic
- **Debug Friendly**: Comprehensive logging shows exactly what elements are found and processed

### Reliability
- **Cross-Session Compatibility**: Works regardless of React component re-renders
- **Markup Change Resistant**: Continues working when Indeed updates their HTML structure
- **Multiple Detection Methods**: Uses both semantic and structural approaches for maximum coverage

This dynamic approach ensures the extension remains functional as Indeed's SmartApply system evolves, providing robust automation for job applications across various question formats and input types.
