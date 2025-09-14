// ═══════════════════════════════════════════════════════════════════════════
// 🚫 PREVENT BACK/FORWARD CACHE - Keep page active to prevent caching
// ═══════════════════════════════════════════════════════════════════════════

// ⚠️ DOMAIN CHECK - Only run on Indeed websites
// Use var instead of const to allow redeclaration on extension reload
if (typeof ALLOWED_DOMAINS === 'undefined') {
  var ALLOWED_DOMAINS = [
    'indeed.com',
    'www.indeed.com',
    'indeed.ca', 
    'www.indeed.ca',
    'indeed.co.uk',
    'www.indeed.co.uk'
  ];
}

// Prevent redeclaration errors on extension reload
if (typeof currentDomain === 'undefined') {
  var currentDomain = window.location.hostname.toLowerCase();
}
if (typeof isIndeedSite === 'undefined') {
  var isIndeedSite = ALLOWED_DOMAINS.some(domain => currentDomain.includes(domain));
}

if (!isIndeedSite) {
  console.log(`🚫 Extension disabled - Not an Indeed site (${currentDomain})`);
} else {
  // ⚡ MAIN EXTENSION CODE - Only runs on Indeed sites
  console.log("🚀 Content script loaded on Indeed - preventing cache...");

// Check if content script was previously injected
if (window.indeedAutoApplyLoaded) {
  console.log("🔄 Content script reinjected after context loss - recovering state...");
  // Check for any stored job results to send
  try {
    const keys = Object.keys(localStorage).filter(key => key.startsWith('jobResult_'));
    if (keys.length > 0) {
      console.log(`📬 Found ${keys.length} stored job results to send...`);
      keys.forEach(key => {
        try {
          const storedResult = JSON.parse(localStorage.getItem(key));
          if (storedResult && Date.now() - storedResult.timestamp < 300000) { // 5 minutes
            console.log(`📤 Sending stored result for job: ${storedResult.jobTitle}`);
            chrome.runtime.sendMessage({
              action: "jobResult",
              jobId: storedResult.jobId,
              result: storedResult.result
            }, () => {
              if (!chrome.runtime.lastError) {
                localStorage.removeItem(key);
                console.log(`✅ Sent and cleared stored result for ${storedResult.jobTitle}`);
              }
            });
          } else {
            // Remove old results
            localStorage.removeItem(key);
          }
        } catch (e) {
          console.error("Error processing stored result:", e.message);
          localStorage.removeItem(key);
        }
      });
    }
  } catch (e) {
    console.error("Error checking stored results:", e.message);
  }
} else {
  window.indeedAutoApplyLoaded = true;
  console.log("🆕 First time content script load");
}

// Prevent page from being cached by browser
window.addEventListener('pageshow', function(event) {
  if (event.persisted) {
    console.log('⚠️ Page loaded from cache, reloading to ensure fresh state...');
    window.location.reload();
  }
});

// Keep connection alive to prevent caching
if (!window.keepAliveInterval) {
  window.keepAliveInterval = setInterval(() => {
    if (isExtensionContextValid()) {
      // Send periodic heartbeat to background
      try {
        chrome.runtime.sendMessage({ action: "heartbeat" }, () => {
          if (chrome.runtime.lastError) {
            console.log("Background connection lost:", chrome.runtime.lastError.message);
          }
        });
      } catch (e) {
        console.log("Heartbeat failed:", e.message);
      }
    } else {
      clearInterval(window.keepAliveInterval);
      window.keepAliveInterval = null;
    }
  }, 5000); // Every 5 seconds
}

// Global error handler for extension context issues
window.addEventListener("error", function (event) {
  if (
    event.error &&
    event.error.message &&
    event.error.message.includes("Extension context invalidated")
  ) {
    console.log(
      "Extension context invalidated detected. Please refresh the page to continue."
    );
    // Optionally show a user-friendly message
    if (document.body) {
      const notice = document.createElement("div");
      notice.style.cssText =
        "position:fixed;top:10px;right:10px;background:#ff4444;color:white;padding:10px;border-radius:5px;z-index:99999;font-family:Arial,sans-serif;";
      notice.textContent = "Extension updated - Please refresh the page";
      document.body.appendChild(notice);
      setTimeout(() => notice.remove(), 5000);
    }
  }
});

// Global emergency stop flag
window.emergencyStopFlag = false;

// Emergency stop function - can be called from anywhere
function triggerEmergencyStop() {
  console.log("🚨 EMERGENCY STOP TRIGGERED");
  window.emergencyStopFlag = true;
  
  // Send message to background to stop everything
  safeSendMessage({ action: 'emergencyStop' });
  
  // Stop any running automation
  processing = false;
  
  // Show user notification
  if (document.body) {
    const notice = document.createElement("div");
    notice.style.cssText = `
      position: fixed !important;
      top: 20px !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      background: #dc3545 !important;
      color: white !important;
      padding: 15px 25px !important;
      border-radius: 8px !important;
      z-index: 999999 !important;
      font-family: Arial, sans-serif !important;
      font-size: 16px !important;
      font-weight: bold !important;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
    `;
    notice.textContent = "🛑 AUTOMATION STOPPED - All processes halted";
    document.body.appendChild(notice);
    setTimeout(() => notice.remove(), 5000);
  }
}

// Keyboard shortcut for emergency stop (Ctrl+Shift+X)
document.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.shiftKey && event.key === 'X') {
    event.preventDefault();
    triggerEmergencyStop();
  }
});

// Console command for emergency stop (developers can type: stopAutomation() in console)
window.stopAutomation = triggerEmergencyStop;

document.addEventListener("click", () => {
  console.log("Content script clicked!");
});

// ═══════════════════════════════════════════════════════════════════════════
// � QUESTIONS CONFIGURATION MANAGEMENT - Load/Save JSON Configuration
// ═══════════════════════════════════════════════════════════════════════════

let questionsConfig = null;

/**
 * Load questions configuration from JSON file
 */
async function loadQuestionsConfig() {
  try {
    if (questionsConfig) {
      return questionsConfig; // Return cached config
    }

    // Fetch the JSON configuration file
    const response = await fetch(chrome.runtime.getURL('questions_config.json'));
    if (!response.ok) {
      throw new Error(`Failed to load config: ${response.status}`);
    }
    
    questionsConfig = await response.json();
    console.log('📄 Questions configuration loaded successfully');
    console.log(`📊 Loaded ${questionsConfig.textInputPatterns?.length || 0} text patterns, ${questionsConfig.numberInputPatterns?.length || 0} number patterns`);
    
    return questionsConfig;
  } catch (error) {
    console.error('❌ Failed to load questions configuration:', error);
    // Return fallback config
    return {
      textInputPatterns: [],
      numberInputPatterns: [],
      textareaPatterns: [],
      radioPatterns: [],
      selectPatterns: [],
      defaultValues: {
        textInput: "Available upon request",
        numberInput: "1",
        textarea: "I am interested in this position and believe I would be a valuable addition to your team."
      },
      learnedData: {
        patterns: [],
        lastUpdated: null,
        version: "1.0"
      }
    };
  }
}

/**
 * Save learned patterns to the questions configuration
 */
async function saveLearnedPatternsToConfig(patterns) {
  try {
    const config = await loadQuestionsConfig();
    
    // Update the learned data section
    config.learnedData.patterns = patterns;
    config.learnedData.lastUpdated = new Date().toISOString();
    
    // Since we can't write to the JSON file directly from content script,
    // we'll save to localStorage with a backup mechanism
    localStorage.setItem('questionsConfig_learnedData', JSON.stringify(config.learnedData));
    
    console.log(`💾 Saved ${patterns.length} learned patterns to configuration`);
    
    // Also send to background script for potential file writing
    if (isExtensionContextValid()) {
      chrome.runtime.sendMessage({
        action: 'saveLearnedPatterns',
        learnedData: config.learnedData
      }).catch(error => {
        console.log('Background save failed (not critical):', error.message);
      });
    }
    
    return true;
  } catch (error) {
    console.error('❌ Failed to save learned patterns to config:', error);
    return false;
  }
}

/**
 * Load learned patterns from configuration (with localStorage fallback)
 */
async function loadLearnedPatternsFromConfig() {
  try {
    const config = await loadQuestionsConfig();
    
    // Check for localStorage updates first (most recent)
    const localLearnedData = localStorage.getItem('questionsConfig_learnedData');
    if (localLearnedData) {
      try {
        const parsedLocal = JSON.parse(localLearnedData);
        if (parsedLocal.patterns && Array.isArray(parsedLocal.patterns)) {
          console.log(`📚 Loaded ${parsedLocal.patterns.length} learned patterns from localStorage`);
          return parsedLocal.patterns;
        }
      } catch (e) {
        console.warn('⚠️ Invalid localStorage learned data, falling back to config file');
      }
    }
    
    // Fallback to config file
    if (config.learnedData && config.learnedData.patterns) {
      console.log(`📚 Loaded ${config.learnedData.patterns.length} learned patterns from config file`);
      return config.learnedData.patterns;
    }
    
    return [];
  } catch (error) {
    console.error('❌ Failed to load learned patterns from config:', error);
    return [];
  }
}

/**
 * Find matching pattern from configuration based on keywords
 */
function findPatternMatch(patterns, labelText, excludeKeywords = []) {
  const text = labelText.toLowerCase();
  
  for (const pattern of patterns) {
    // Check if ALL keywords in the pattern exist in the label text
    const matchesAllKeywords = pattern.keywords.every(keyword => 
      text.includes(keyword.toLowerCase())
    );
    
    // Check if any excluded keywords are present
    const hasExcludedKeywords = excludeKeywords.some(excluded =>
      text.includes(excluded.toLowerCase())
    );
    
    if (matchesAllKeywords && !hasExcludedKeywords) {
      console.log(`✅ Found pattern match for "${labelText}": ${pattern.keywords.join(', ')} -> "${pattern.value}"`);
      return pattern;
    }
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// �🛠️ ASYNC UTILITY FUNCTIONS - Wait for elements to be mounted
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Wait for an element to be mounted in the DOM
 * @param {string} selector - CSS selector for the element
 * @param {number} timeout - Maximum time to wait in milliseconds (default: 10000)
 * @param {number} checkInterval - How often to check in milliseconds (default: 100)
 * @returns {Promise<Element|null>} - Resolves with element or null if timeout
 */
async function waitForElement(selector, timeout = 10000, checkInterval = 100) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    const checkForElement = () => {
      // Check extension context before continuing
      if (!isExtensionContextValid()) {
        console.log(`⚠️ Extension context invalidated while waiting for ${selector}`);
        resolve(null);
        return;
      }
      
      const element = document.querySelector(selector);
      
      if (element) {
        console.log(`✅ Element found: ${selector} - Text: "${element.textContent || element.value || 'N/A'}"`);
        resolve(element);
        return;
      }
      
      // Check if timeout exceeded
      if (Date.now() - startTime > timeout) {
        console.log(`⏰ Timeout waiting for element: ${selector}`);
        resolve(null);
        return;
      }
      
      // Check again after interval
      setTimeout(checkForElement, checkInterval);
    };
    
    checkForElement();
  });
}

/**
 * Wait for multiple elements with fallback selectors
 * @param {string[]} selectors - Array of CSS selectors to try
 * @param {number} timeout - Maximum time to wait in milliseconds
 * @returns {Promise<Element|null>} - Resolves with first found element or null
 */
async function waitForAnyElement(selectors, timeout = 10000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    const checkForElements = () => {
      // Check extension context before continuing
      if (!isExtensionContextValid()) {
        console.log(`⚠️ Extension context invalidated while waiting for elements`);
        resolve(null);
        return;
      }
      
      // Try each selector
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          console.log(`✅ Element found with selector: ${selector} - Text: "${element.textContent || element.value || 'N/A'}"`);
          resolve(element);
          return;
        }
      }
      
      // Check if timeout exceeded
      if (Date.now() - startTime > timeout) {
        console.log(`⏰ Timeout waiting for any element from selectors:`, selectors);
        resolve(null);
        return;
      }
      
      // Check again after interval
      setTimeout(checkForElements, 100);
    };
    
    checkForElements();
  });
}

/**
 * Wait for element and ensure it's clickable (visible and enabled)
 * @param {string} selector - CSS selector for the element
 * @param {number} timeout - Maximum time to wait in milliseconds
 * @returns {Promise<Element|null>} - Resolves with clickable element or null
 */
async function waitForClickableElement(selector, timeout = 10000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    const checkForClickable = () => {
      // Check if extension context is still valid
      if (!isExtensionContextValid()) {
        console.log('🔄 Extension context invalidated during waitForClickableElement');
        showExtensionReloadNotice();
        resolve(null);
        return;
      }
      
      const element = document.querySelector(selector);
      
      if (element && 
          element.offsetParent !== null && // Element is visible
          !element.disabled && // Element is not disabled
          element.style.display !== 'none' && // Not hidden with display:none
          element.style.visibility !== 'hidden') { // Not hidden with visibility:hidden
        
        console.log(`✅ Clickable element found: ${selector} - Text: "${element.textContent || element.value || 'N/A'}"`);
        resolve(element);
        return;
      }
      
      // Check if timeout exceeded
      if (Date.now() - startTime > timeout) {
        console.log(`⏰ Timeout waiting for clickable element: ${selector}`);
        console.log(`Element exists: ${!!element}, Visible: ${element?.offsetParent !== null}, Enabled: ${!element?.disabled}`);
        resolve(null);
        return;
      }
      
      // Check again after interval
      setTimeout(checkForClickable, 100);
    };
    
    checkForClickable();
  });
}

/**
 * Wait for element by text content
 * @param {string[]} textOptions - Array of text strings to search for
 * @param {number} timeout - Maximum time to wait in milliseconds
 * @returns {Promise<Element|null>} - Resolves with element containing text or null
 */
async function waitForElementByText(textOptions, timeout = 10000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    const checkForText = () => {
      // Check extension context before continuing
      if (!isExtensionContextValid()) {
        console.log(`⚠️ Extension context invalidated while waiting for text elements`);
        resolve(null);
        return;
      }
      
      const allClickable = document.querySelectorAll('button, a, input[type="button"], input[type="submit"]');
      
      for (const element of allClickable) {
        const text = (element.textContent || element.value || element.getAttribute('aria-label') || '').toLowerCase();
        for (const searchText of textOptions) {
          if (text.includes(searchText.toLowerCase()) && !text.includes('applied')) {
            console.log(`✅ Text-based element found: "${searchText}" - Text: "${element.textContent || element.value}"`);
            resolve(element);
            return;
          }
        }
      }
      
      // Check if timeout exceeded
      if (Date.now() - startTime > timeout) {
        console.log(`⏰ Timeout waiting for element with text:`, textOptions);
        resolve(null);
        return;
      }
      
      // Check again after interval
      setTimeout(checkForText, 100);
    };
    
    checkForText();
  });
}

/**
 * Debug function to log all clickable elements on page
 */
function debugClickableElements() {
  console.log("🔍 DEBUG: All clickable elements on page:");
  const allClickable = document.querySelectorAll('button, a, input[type="button"], input[type="submit"]');
  allClickable.forEach((el, i) => {
    const text = (el.textContent || el.value || '').trim();
    const id = el.id || 'no-id';
    const classes = el.className || 'no-class';
    const dataAttrs = Array.from(el.attributes)
      .filter(attr => attr.name.startsWith('data-'))
      .map(attr => `${attr.name}="${attr.value}"`)
      .join(' ');
    
    console.log(`  ${i+1}. ${el.tagName} - Text: "${text.slice(0, 100)}" - ID: "${id}" - Class: "${classes.slice(0, 50)}" - Data: "${dataAttrs.slice(0, 100)}"`);
  });
}

/**
 * Show user-friendly notification when extension context is invalidated
 */
function showExtensionReloadNotice() {
  // Remove any existing notice
  const existingNotice = document.getElementById('extensionReloadNotice');
  if (existingNotice) {
    existingNotice.remove();
  }
  
  const notice = document.createElement('div');
  notice.id = 'extensionReloadNotice';
  notice.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    max-width: 300px;
    animation: slideIn 0.3s ease-out;
  `;
  
  notice.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px;">
      <div style="font-size: 20px;">🔄</div>
      <div>
        <div style="font-weight: bold; margin-bottom: 5px;">Extension Updated</div>
        <div style="font-size: 13px; opacity: 0.9;">Please refresh the page to continue using the job application automation.</div>
      </div>
    </div>
    <button onclick="window.location.reload()" style="
      margin-top: 10px;
      background: rgba(255,255,255,0.2);
      border: 1px solid rgba(255,255,255,0.3);
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      width: 100%;
    ">Refresh Page</button>
  `;
  
  // Add CSS animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(notice);
  
  // Auto-remove after 10 seconds
  setTimeout(() => {
    if (notice.parentNode) {
      notice.style.animation = 'slideIn 0.3s ease-out reverse';
      setTimeout(() => notice.remove(), 300);
    }
  }, 10000);
}

// ═══════════════════════════════════════════════════════════════════════════
// 🧠 QUESTION LEARNING SYSTEM - Watch user input and learn from it
// ═══════════════════════════════════════════════════════════════════════════

class QuestionLearningSystem {
  constructor() {
    this.watchedQuestions = new Map();
    this.learnedPatterns = new Map();
    this.initialized = false;
    this.autoDetectionActive = false;
    this.observedContainers = new Set();
    this.initAsync();
    console.log('🧠 Question Learning System initializing...');
  }

  /**
   * Asynchronous initialization
   */
  async initAsync() {
    try {
      await this.loadLearnedPatterns();
      this.initialized = true;
      console.log(`🧠 Question Learning System initialized successfully with ${this.learnedPatterns.size} patterns`);
      
      // Start auto-detection after a brief delay
      setTimeout(() => {
        this.startAutoDetection();
      }, 2000);
    } catch (error) {
      console.error('❌ Question Learning System initialization failed:', error);
      this.initialized = true; // Continue with empty patterns
    }
  }

  /**
   * Start automatic question detection
   */
  startAutoDetection() {
    if (this.autoDetectionActive) return;
    
    this.autoDetectionActive = true;
    console.log('🔍 Started auto-detection of unknown questions');
    
    // Set up mutation observer to watch for new form elements
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.checkForNewQuestions(node);
          }
        });
      });
    });
    
    // Start observing
    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // Also check existing content
    this.checkForNewQuestions(document.body);
  }

  /**
   * Check if new node contains unknown questions
   */
  checkForNewQuestions(node) {
    if (!node.querySelectorAll) return;
    
    // Look for form containers with questions
    const containers = node.querySelectorAll('div, fieldset, label, li');
    
    containers.forEach(container => {
      if (this.observedContainers.has(container)) return;
      
      const inputs = container.querySelectorAll('input, select, textarea');
      if (inputs.length === 0) return;
      
      // Look for question text in various locations
      const questionText = this.extractQuestionText(container);
      if (!questionText || questionText.length < 5) return;
      
      // Check if we already know how to answer this question
      const knownAnswer = this.findKnownAnswer(questionText);
      
      if (!knownAnswer) {
        // This is an unknown question - start learning
        console.log(`🔍 Auto-detected unknown question: "${questionText}"`);
        this.startWatching(container, questionText, inputs);
      } else {
        // We know this question - try to answer it automatically
        console.log(`✅ Auto-detected known question: "${questionText}" - Applying learned answer`);
        this.applyKnownAnswer(container, knownAnswer, inputs[0]);
      }
      
      this.observedContainers.add(container);
    });
  }

  /**
   * Extract question text from a container
   */
  extractQuestionText(container) {
    // Try various methods to get question text
    const selectors = [
      'label', 
      '[data-testid*="label"]', 
      '.question', 
      '.form-label',
      'legend',
      'h1, h2, h3, h4, h5, h6',
      'span, div, p'
    ];
    
    for (const selector of selectors) {
      const element = container.querySelector(selector);
      if (element) {
        const text = element.textContent.trim();
        if (text.length > 5 && text.includes('?')) {
          return text;
        }
      }
    }
    
    // Fallback: get the container's text content
    const containerText = container.textContent.trim();
    if (containerText.length > 5 && containerText.includes('?')) {
      // Take the part before the first input
      const input = container.querySelector('input, select, textarea');
      if (input && containerText.indexOf(input.textContent || '') > 0) {
        return containerText.substring(0, containerText.indexOf(input.textContent || '')).trim();
      }
      return containerText;
    }
    
    return null;
  }

  /**
   * Find if we have a known answer for this question
   */
  findKnownAnswer(questionText) {
    const parsedQuestion = this.parseQuestionComponents(questionText);
    const patternKey = this.generatePatternKey(parsedQuestion);
    
    // Check for exact match
    if (this.learnedPatterns.has(patternKey)) {
      return this.learnedPatterns.get(patternKey);
    }
    
    // Check for similar matches
    for (const [key, pattern] of this.learnedPatterns) {
      const similarity = this.calculateSimilarity(parsedQuestion, pattern.parsedComponents);
      if (similarity > 0.8) { // 80% similarity for auto-application
        return pattern;
      }
    }
    
    return null;
  }

  /**
   * Apply a known answer automatically
   */
  async applyKnownAnswer(container, knownPattern, inputElement) {
    try {
      const success = await this.applyLearnedAnswer(container, knownPattern.answer.value || knownPattern.answer.text || knownPattern.answer, knownPattern.inputType);
      
      if (success) {
        // Update usage statistics
        knownPattern.timesUsed = (knownPattern.timesUsed || 0) + 1;
        knownPattern.lastUsed = Date.now();
        await this.saveLearnedPatterns();
        
        console.log(`🎯 Successfully auto-applied learned answer for: "${knownPattern.originalQuestion}"`);
        this.showMatchIndicator(container, knownPattern, 1.0);
      }
    } catch (error) {
      console.warn('⚠️ Failed to auto-apply known answer:', error);
    }
  }

  /**
   * Start watching a question container for manual user input
   */
  startWatching(container, questionText, inputElements) {
    const watchId = `watch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`👀 Started watching unknown question: "${questionText}"`);
    console.log(`🔍 Watch ID: ${watchId}`);
    
    const questionData = {
      id: watchId,
      questionText: questionText,
      container: container,
      inputElements: Array.from(inputElements),
      startTime: Date.now(),
      userInteracted: false,
      finalAnswer: null
    };
    
    this.watchedQuestions.set(watchId, questionData);
    
    // Add visual indicator that we're learning
    this.addLearningIndicator(container, watchId);
    
    // Set up event listeners for user interaction
    this.setupInputWatchers(questionData);
    
    // Auto-stop watching after 30 seconds
    setTimeout(() => {
      if (this.watchedQuestions.has(watchId)) {
        this.stopWatching(watchId, 'timeout');
      }
    }, 30000);
    
    return watchId;
  }

  /**
   * Add visual indicator that we're learning from this question
   */
  addLearningIndicator(container, watchId) {
    const indicator = document.createElement('div');
    indicator.id = `learning-indicator-${watchId}`;
    indicator.style.cssText = `
      position: absolute;
      top: -5px;
      right: -5px;
      background: linear-gradient(45deg, #4CAF50, #45a049);
      color: white;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: bold;
      z-index: 1000;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      animation: learningPulse 2s infinite;
    `;
    indicator.textContent = '🧠 LEARNING';
    
    // Add CSS animation if not exists
    if (!document.getElementById('learning-animation-style')) {
      const style = document.createElement('style');
      style.id = 'learning-animation-style';
      style.textContent = `
        @keyframes learningPulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
          100% { opacity: 1; transform: scale(1); }
        }
      `;
      document.head.appendChild(style);
    }
    
    // Make container relative if not already
    const containerStyle = window.getComputedStyle(container);
    if (containerStyle.position === 'static') {
      container.style.position = 'relative';
    }
    
    container.appendChild(indicator);
  }

  /**
   * Set up event listeners to detect user interaction
   */
  setupInputWatchers(questionData) {
    const { id, inputElements } = questionData;
    
    inputElements.forEach((element, index) => {
      // Watch for changes
      const changeHandler = (event) => {
        console.log(`📝 User interacted with question: ${questionData.questionText}`);
        questionData.userInteracted = true;
        
        // Capture the answer
        this.captureUserAnswer(questionData, element, event);
      };
      
      // Add event listeners
      element.addEventListener('change', changeHandler);
      element.addEventListener('input', changeHandler);
      element.addEventListener('click', changeHandler);
      
      // Store cleanup function
      if (!questionData.cleanupFunctions) {
        questionData.cleanupFunctions = [];
      }
      
      questionData.cleanupFunctions.push(() => {
        element.removeEventListener('change', changeHandler);
        element.removeEventListener('input', changeHandler);
        element.removeEventListener('click', changeHandler);
      });
    });
  }

  /**
   * Capture the user's answer when they interact with the form
   */
  captureUserAnswer(questionData, element, event) {
    let answer = null;
    
    // Determine answer based on input type
    switch (element.type) {
      case 'radio':
        if (element.checked) {
          answer = {
            type: 'radio',
            value: element.value,
            text: this.getRadioButtonText(element)
          };
        }
        break;
        
      case 'checkbox':
        answer = {
          type: 'checkbox',
          checked: element.checked,
          value: element.value,
          text: this.getCheckboxText(element)
        };
        break;
        
      case 'text':
      case 'email':
      case 'tel':
      case 'number':
        if (element.value.trim()) {
          answer = {
            type: element.type,
            value: element.value.trim(),
            text: element.value.trim()
          };
        }
        break;
        
      default:
        if (element.tagName === 'SELECT') {
          answer = {
            type: 'select',
            value: element.value,
            text: element.options[element.selectedIndex]?.textContent || element.value
          };
        } else if (element.tagName === 'TEXTAREA') {
          if (element.value.trim()) {
            answer = {
              type: 'textarea',
              value: element.value.trim(),
              text: element.value.trim()
            };
          }
        }
        break;
    }
    
    if (answer) {
      questionData.finalAnswer = answer;
      console.log(`💡 Captured answer for "${questionData.questionText}":`, answer);
      
      // Wait a bit then process the learning
      setTimeout(() => {
        this.processLearning(questionData);
      }, 1000);
    }
  }

  /**
   * Get the text associated with a radio button
   */
  getRadioButtonText(radioElement) {
    // Try various methods to get the label text
    const label = radioElement.closest('label');
    if (label) {
      return label.textContent.trim();
    }
    
    // Look for next sibling text
    if (radioElement.nextSibling && radioElement.nextSibling.textContent) {
      return radioElement.nextSibling.textContent.trim();
    }
    
    // Look for parent text
    if (radioElement.parentElement && radioElement.parentElement.textContent) {
      const parentText = radioElement.parentElement.textContent.trim();
      if (parentText !== radioElement.value) {
        return parentText;
      }
    }
    
    return radioElement.value;
  }

  /**
   * Get the text associated with a checkbox
   */
  getCheckboxText(checkboxElement) {
    return this.getRadioButtonText(checkboxElement); // Same logic
  }

  /**
   * Process the learning and save the pattern
   */
  async processLearning(questionData) {
    const { questionText, finalAnswer } = questionData;
    
    if (!finalAnswer) {
      console.log(`⚠️ No answer captured for question: ${questionText}`);
      this.stopWatching(questionData.id, 'no_answer');
      return;
    }
    
    // Parse the question using the auto-correct algorithm
    const parsedQuestion = this.parseQuestionComponents(questionText);
    
    // Generate pattern key using parsed components
    const patternKey = this.generatePatternKey(parsedQuestion);
    
    // Check if we already have this pattern (avoid duplicates)
    const existingPattern = this.learnedPatterns.get(patternKey);
    
    if (existingPattern) {
      // Update existing pattern with new usage
      existingPattern.timesEncountered = (existingPattern.timesEncountered || 1) + 1;
      existingPattern.lastEncountered = Date.now();
      existingPattern.confidence = Math.min(0.98, existingPattern.confidence + 0.01); // Slightly increase confidence
      
      console.log(`🔄 Updated existing pattern (encountered ${existingPattern.timesEncountered} times): "${questionText}"`);
    } else {
      // Create new learning pattern
      const learnedPattern = {
        id: `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        originalQuestion: questionText,
        normalizedQuestion: questionText.toLowerCase().trim(),
        parsedComponents: parsedQuestion,
        patternKey: patternKey,
        answer: finalAnswer,
        inputType: this.detectInputType(questionData.inputElements[0]),
        confidence: 0.95, // High confidence since user provided it
        learnedAt: Date.now(),
        lastEncountered: Date.now(),
        timesEncountered: 1,
        timesUsed: 0,
        url: window.location.href,
        company: this.extractCompanyName(),
        domain: window.location.hostname
      };
      
      // Save the learned pattern
      this.learnedPatterns.set(patternKey, learnedPattern);
      
      console.log(`🎓 LEARNED NEW PATTERN:`);
      console.log(`   Question: "${questionText}"`);
      console.log(`   Pattern Key: "${patternKey}"`);
      console.log(`   Answer:`, finalAnswer);
      console.log(`   Input Type: "${learnedPattern.inputType}"`);
      console.log(`   Components:`, parsedQuestion);
    }
    
    // Save patterns asynchronously
    await this.saveLearnedPatterns();
    
    // Show success indicator
    this.showLearningSuccess(questionData);
    
    // Stop watching
    this.stopWatching(questionData.id, 'learned');
  }

  /**
   * Detect the input type from element
   */
  detectInputType(element) {
    if (!element) return 'unknown';
    
    if (element.tagName === 'SELECT') return 'select';
    if (element.tagName === 'TEXTAREA') return 'textarea';
    if (element.type) return element.type;
    
    return 'text';
  }

  /**
   * Parse question into components using auto-correct style algorithm
   */
  parseQuestionComponents(questionText) {
    const text = questionText.toLowerCase().trim();
    
    return {
      prefix: this.extractPrefix(text),
      verbs: this.extractVerbs(text),
      subjects: this.extractSubjects(text),
      keywords: this.extractKeywords(text),
      length: text.split(' ').length
    };
  }

  /**
   * Extract prefix (first few words)
   */
  extractPrefix(text) {
    const words = text.split(' ');
    return words.slice(0, Math.min(4, words.length)).join(' ');
  }

  /**
   * Extract verbs from question
   */
  extractVerbs(text) {
    const commonVerbs = [
      'are', 'is', 'do', 'can', 'will', 'have', 'would', 'could', 'should',
      'work', 'commute', 'travel', 'start', 'need', 'require', 'want',
      'able', 'available', 'authorized', 'eligible', 'willing'
    ];
    
    return commonVerbs.filter(verb => text.includes(verb));
  }

  /**
   * Extract subjects/topics from question
   */
  extractSubjects(text) {
    const subjects = {
      authorization: ['authorized', 'authorization', 'legal', 'visa', 'permit', 'eligible'],
      location: ['commute', 'location', 'address', 'distance', 'miles', 'relocate'],
      experience: ['experience', 'years', 'background', 'worked', 'expertise'],
      education: ['education', 'degree', 'diploma', 'school', 'university', 'graduated'],
      salary: ['salary', 'pay', 'compensation', 'wage', 'money', 'expected'],
      schedule: ['schedule', 'hours', 'shift', 'time', 'availability', 'flexible'],
      skills: ['skills', 'knowledge', 'familiar', 'proficient', 'programming'],
      preferences: ['prefer', 'like', 'interest', 'motivated', 'reason']
    };
    
    const foundSubjects = [];
    for (const [subject, keywords] of Object.entries(subjects)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        foundSubjects.push(subject);
      }
    }
    
    return foundSubjects;
  }

  /**
   * Extract important keywords
   */
  extractKeywords(text) {
    const words = text.split(' ');
    const stopWords = ['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can'];
    
    return words.filter(word => 
      word.length > 2 && 
      !stopWords.includes(word) &&
      /^[a-z]+$/.test(word)
    );
  }

  /**
   * Generate a pattern key for matching similar questions
   */
  generatePatternKey(parsedComponents) {
    const { prefix, verbs, subjects } = parsedComponents;
    
    // Create a key that focuses on the most important components
    const keyParts = [];
    
    if (prefix) keyParts.push(prefix);
    if (subjects.length > 0) keyParts.push(`subj:${subjects.sort().join(',')}`);
    if (verbs.length > 0) keyParts.push(`verb:${verbs.sort().join(',')}`);
    
    return keyParts.join('|');
  }

  /**
   * Check if we can answer a question based on learned patterns
   */
  canAnswerQuestion(questionText) {
    const parsedQuestion = this.parseQuestionComponents(questionText);
    const patternKey = this.generatePatternKey(parsedQuestion);
    
    // Exact match
    if (this.learnedPatterns.has(patternKey)) {
      const pattern = this.learnedPatterns.get(patternKey);
      console.log(`🎯 Found exact pattern match for: "${questionText}"`);
      return { confidence: pattern.confidence, answer: pattern.answer, source: 'exact' };
    }
    
    // Fuzzy matching - look for similar patterns
    for (const [key, pattern] of this.learnedPatterns) {
      const similarity = this.calculateSimilarity(parsedQuestion, pattern.parsedComponents);
      if (similarity > 0.7) { // 70% similarity threshold
        console.log(`🎯 Found similar pattern match (${Math.round(similarity * 100)}%) for: "${questionText}"`);
        return { 
          confidence: pattern.confidence * similarity, 
          answer: pattern.answer, 
          source: 'fuzzy',
          similarity: similarity 
        };
      }
    }
    
    return null;
  }

  /**
   * Calculate similarity between two parsed questions
   */
  calculateSimilarity(parsed1, parsed2) {
    let score = 0;
    let maxScore = 0;
    
    // Compare prefixes (high weight)
    if (parsed1.prefix && parsed2.prefix) {
      maxScore += 0.4;
      const prefixSimilarity = this.stringSimilarity(parsed1.prefix, parsed2.prefix);
      score += prefixSimilarity * 0.4;
    }
    
    // Compare subjects (high weight)
    maxScore += 0.4;
    const subjectOverlap = this.arrayOverlap(parsed1.subjects, parsed2.subjects);
    score += subjectOverlap * 0.4;
    
    // Compare verbs (medium weight)
    maxScore += 0.2;
    const verbOverlap = this.arrayOverlap(parsed1.verbs, parsed2.verbs);
    score += verbOverlap * 0.2;
    
    return maxScore > 0 ? score / maxScore : 0;
  }

  /**
   * Calculate string similarity (simple)
   */
  stringSimilarity(str1, str2) {
    const words1 = str1.split(' ');
    const words2 = str2.split(' ');
    const common = words1.filter(word => words2.includes(word));
    return common.length / Math.max(words1.length, words2.length);
  }

  /**
   * Calculate array overlap
   */
  arrayOverlap(arr1, arr2) {
    if (arr1.length === 0 && arr2.length === 0) return 1;
    if (arr1.length === 0 || arr2.length === 0) return 0;
    
    const common = arr1.filter(item => arr2.includes(item));
    return common.length / Math.max(arr1.length, arr2.length);
  }

  /**
   * Show learning success indicator
   */
  showLearningSuccess(questionData) {
    const indicator = document.getElementById(`learning-indicator-${questionData.id}`);
    if (indicator) {
      indicator.textContent = '✅ LEARNED';
      indicator.style.background = 'linear-gradient(45deg, #2196F3, #1976D2)';
      indicator.style.animation = 'none';
      
      setTimeout(() => {
        if (indicator.parentNode) {
          indicator.style.transition = 'opacity 0.3s, transform 0.3s';
          indicator.style.opacity = '0';
          indicator.style.transform = 'scale(0.8)';
          setTimeout(() => indicator.remove(), 300);
        }
      }, 2000);
    }
  }

  /**
   * Stop watching a question
   */
  stopWatching(watchId, reason) {
    const questionData = this.watchedQuestions.get(watchId);
    if (!questionData) return;
    
    console.log(`🛑 Stopped watching question (${reason}): "${questionData.questionText}"`);
    
    // Clean up event listeners
    if (questionData.cleanupFunctions) {
      questionData.cleanupFunctions.forEach(cleanup => cleanup());
    }
    
    // Remove learning indicator
    const indicator = document.getElementById(`learning-indicator-${watchId}`);
    if (indicator) {
      indicator.remove();
    }
    
    this.watchedQuestions.delete(watchId);
  }

  /**
   * Extract company name from page
   */
  extractCompanyName() {
    const selectors = [
      '[data-testid="inlineHeader-companyName"]',
      '.jobsearch-InlineCompanyRating',
      '.jobsearch-CompanyReview--heading',
      'h1', 'h2', '.company-name'
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        return element.textContent.trim();
      }
    }
    
    return 'Unknown Company';
  }

  /**
   * Save learned patterns to localStorage and JSON config
   */
  async saveLearnedPatterns() {
    try {
      const patternsArray = Array.from(this.learnedPatterns.values());
      
      // Save to JSON configuration
      const success = await saveLearnedPatternsToConfig(patternsArray);
      
      if (success) {
        console.log(`💾 Successfully saved ${patternsArray.length} learned patterns to JSON configuration`);
        
        // Also save to localStorage as backup
        localStorage.setItem('questionLearningPatterns_backup', JSON.stringify(Array.from(this.learnedPatterns.entries())));
        
        // Notify background script of successful learning
        if (isExtensionContextValid()) {
          chrome.runtime.sendMessage({
            action: 'patternLearned',
            count: patternsArray.length,
            latestPattern: patternsArray[patternsArray.length - 1]
          }).catch(error => {
            console.log('Background notification failed (not critical):', error.message);
          });
        }
      } else {
        throw new Error('JSON config save failed');
      }
    } catch (error) {
      console.error('❌ Failed to save learned patterns to JSON config:', error);
      
      // Enhanced fallback to localStorage with timestamp
      try {
        const patternsWithMeta = {
          patterns: Array.from(this.learnedPatterns.entries()),
          lastSaved: Date.now(),
          version: '2.0'
        };
        localStorage.setItem('questionLearningPatterns', JSON.stringify(patternsWithMeta));
        console.log(`💾 Fallback: Saved ${this.learnedPatterns.size} learned patterns to localStorage with metadata`);
      } catch (fallbackError) {
        console.error('❌ Fallback save also failed:', fallbackError);
      }
    }
  }

  /**
   * Load learned patterns from JSON configuration (with localStorage fallback)
   */
  async loadLearnedPatterns() {
    try {
      const patterns = await loadLearnedPatternsFromConfig();
      
      // Convert array back to Map using generated pattern key
      this.learnedPatterns = new Map();
      patterns.forEach((pattern) => {
        // Generate consistent pattern key for matching
        const patternKey = pattern.patternKey || this.generatePatternKey(pattern.parsedComponents || this.parseQuestionComponents(pattern.originalQuestion));
        pattern.patternKey = patternKey; // Ensure pattern has key for future use
        this.learnedPatterns.set(patternKey, pattern);
      });
      
      console.log(`📚 Loaded ${this.learnedPatterns.size} learned patterns from JSON configuration`);
      
      // Also check for localStorage patterns and merge if newer
      await this.mergeLocalStoragePatterns();
      
    } catch (error) {
      console.error('❌ Failed to load learned patterns from JSON config:', error);
      await this.loadFromLocalStorageFallback();
    }
  }

  /**
   * Merge patterns from localStorage if they're newer or additional
   */
  async mergeLocalStoragePatterns() {
    try {
      const stored = localStorage.getItem('questionLearningPatterns');
      if (stored) {
        const localData = JSON.parse(stored);
        
        // Handle both old format (array) and new format (with metadata)
        const patternsArray = localData.patterns || localData;
        let mergedCount = 0;
        
        if (Array.isArray(patternsArray)) {
          patternsArray.forEach(([key, pattern]) => {
            // Only merge if not exists or if localStorage version is newer
            const existingPattern = this.learnedPatterns.get(key);
            if (!existingPattern || 
                (pattern.learnedAt && existingPattern.learnedAt && pattern.learnedAt > existingPattern.learnedAt)) {
              this.learnedPatterns.set(key, pattern);
              mergedCount++;
            }
          });
        }
        
        if (mergedCount > 0) {
          console.log(`🔄 Merged ${mergedCount} additional/newer patterns from localStorage`);
          // Save merged patterns back to config
          await this.saveLearnedPatterns();
        }
      }
    } catch (error) {
      console.warn('⚠️ Could not merge localStorage patterns:', error.message);
    }
  }

  /**
   * Fallback to load from localStorage only
   */
  async loadFromLocalStorageFallback() {
    try {
      const stored = localStorage.getItem('questionLearningPatterns');
      if (stored) {
        const localData = JSON.parse(stored);
        const patternsArray = localData.patterns || localData;
        
        if (Array.isArray(patternsArray)) {
          this.learnedPatterns = new Map(patternsArray);
          console.log(`📚 Fallback: Loaded ${this.learnedPatterns.size} learned patterns from localStorage`);
        } else {
          this.learnedPatterns = new Map();
        }
      } else {
        this.learnedPatterns = new Map();
        console.log('📚 No stored patterns found, starting fresh');
      }
    } catch (fallbackError) {
      console.error('❌ Fallback load also failed:', fallbackError);
      this.learnedPatterns = new Map();
    }
  }

  /**
   * Check if we have learned patterns that match the current question
   */
  async checkLearnedPatterns(questionText, container) {
    // Wait for initialization to complete
    if (!this.initialized) {
      console.log('🧠 Waiting for learning system initialization...');
      let attempts = 0;
      while (!this.initialized && attempts < 50) { // Wait up to 5 seconds
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
    }

    if (this.learnedPatterns.size === 0) {
      return null;
    }

    console.log(`🧠 Checking learned patterns for: "${questionText}"`);
    
    // Parse the current question
    const currentParsed = this.parseQuestion(questionText);
    console.log(`🔍 Current question parsed:`, currentParsed);
    
    let bestMatch = null;
    let highestSimilarity = 0;
    const SIMILARITY_THRESHOLD = 0.7; // 70% similarity required

    // Check against all learned patterns
    for (const [patternId, pattern] of this.learnedPatterns.entries()) {
      const similarity = this.calculateQuestionSimilarity(currentParsed, pattern.parsedQuestion);
      
      console.log(`📊 Similarity with "${pattern.originalQuestion}": ${(similarity * 100).toFixed(1)}%`);
      
      if (similarity > highestSimilarity && similarity >= SIMILARITY_THRESHOLD) {
        highestSimilarity = similarity;
        bestMatch = pattern;
      }
    }

    if (bestMatch) {
      console.log(`✅ Found matching learned pattern (${(highestSimilarity * 100).toFixed(1)}% similarity)`);
      console.log(`🎯 Original question: "${bestMatch.originalQuestion}"`);
      console.log(`💡 Learned answer: "${bestMatch.answer}"`);
      
      // Try to fill the answer using the learned pattern
      const success = await this.applyLearnedAnswer(container, bestMatch.answer, bestMatch.inputType);
      
      if (success) {
        // Update usage statistics
        bestMatch.timesUsed = (bestMatch.timesUsed || 0) + 1;
        bestMatch.lastUsed = Date.now();
        this.saveLearnedPatterns();
        
        // Show success indicator
        this.showMatchIndicator(container, bestMatch, highestSimilarity);
        
        return bestMatch.answer;
      }
    }

    console.log(`❌ No matching learned patterns found (threshold: ${(SIMILARITY_THRESHOLD * 100)}%)`);
    return null;
  }

  /**
   * Apply a learned answer to the appropriate input element
   */
  async applyLearnedAnswer(container, answer, inputType) {
    try {
      let input = null;
      
      // Find the appropriate input based on the learned input type
      switch (inputType) {
        case 'number':
          input = container.querySelector('input[type="number"], input[inputmode="numeric"], input[inputmode="text"][min]');
          break;
        case 'text':
          input = container.querySelector('input[type="text"], input:not([type]), input[data-testid*="input"]:not([min])');
          break;
        case 'textarea':
          input = container.querySelector('textarea');
          break;
        case 'select':
          input = container.querySelector('select');
          break;
        case 'radio':
          // For radio buttons, find the one that matches the answer
          const radios = container.querySelectorAll('input[type="radio"]');
          for (const radio of radios) {
            const label = radio.closest('label') || container.querySelector(`label[for="${radio.id}"]`);
            const labelText = label ? label.textContent.trim().toLowerCase() : '';
            if (labelText.includes(answer.toLowerCase()) || radio.value.toLowerCase() === answer.toLowerCase()) {
              input = radio;
              break;
            }
          }
          break;
        case 'checkbox':
          input = container.querySelector('input[type="checkbox"]');
          break;
      }

      if (!input) {
        // Fallback: try to find any input
        input = container.querySelector('input, textarea, select');
      }

      if (input) {
        console.log(`🎯 Applying learned answer "${answer}" to ${input.tagName}[type="${input.type}"]`);
        
        if (input.type === 'radio' || input.type === 'checkbox') {
          input.click();
        } else if (input.tagName === 'SELECT') {
          // Find matching option
          const options = input.querySelectorAll('option');
          for (const option of options) {
            if (option.textContent.toLowerCase().includes(answer.toLowerCase()) || 
                option.value.toLowerCase() === answer.toLowerCase()) {
              input.value = option.value;
              input.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
          }
        } else {
          // Text input or textarea
          input.focus();
          input.value = answer;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.blur();
        }
        
        return true;
      }
      
      console.warn(`⚠️ Could not find appropriate input element for learned answer`);
      return false;
    } catch (error) {
      console.error('❌ Error applying learned answer:', error);
      return false;
    }
  }

  /**
   * Show a visual indicator when a learned pattern is matched
   */
  showMatchIndicator(container, pattern, similarity) {
    const indicator = document.createElement('div');
    indicator.className = 'learning-match-indicator';
    indicator.innerHTML = `
      <div style="
        position: absolute;
        top: -25px;
        right: 0;
        background: linear-gradient(45deg, #4CAF50, #45a049);
        color: white;
        padding: 4px 8px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: bold;
        z-index: 10000;
        box-shadow: 0 2px 8px rgba(76, 175, 80, 0.3);
        animation: learningMatchPulse 2s ease-in-out;
        pointer-events: none;
      ">
        🎯 Learned (${(similarity * 100).toFixed(0)}%)
      </div>
    `;
    
    // Add CSS animation if not already present
    if (!document.getElementById('learning-match-styles')) {
      const style = document.createElement('style');
      style.id = 'learning-match-styles';
      style.textContent = `
        @keyframes learningMatchPulse {
          0% { transform: scale(0.8); opacity: 0; }
          20% { transform: scale(1.1); opacity: 1; }
          80% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }
    
    container.style.position = container.style.position || 'relative';
    container.appendChild(indicator);
    
    // Remove indicator after animation
    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
      }
    }, 2000);
  }

  /**
   * Get statistics about learned patterns
   */
  getStats() {
    return {
      totalPatterns: this.learnedPatterns.size,
      currentlyWatching: this.watchedQuestions.size,
      patterns: Array.from(this.learnedPatterns.values()).map(p => ({
        question: p.originalQuestion,
        answer: p.answer,
        confidence: p.confidence,
        learnedAt: new Date(p.learnedAt).toLocaleString(),
        company: p.company,
        timesUsed: p.timesUsed || 0,
        lastUsed: p.lastUsed ? new Date(p.lastUsed).toLocaleString() : 'Never'
      }))
    };
  }
}

// Initialize the learning system
window.questionLearningSystem = new QuestionLearningSystem();

const startIndeed = () => {
  startScriptButton();

  // non searching page
  const getJobCards = document.getElementById("mosaic-provider-jobcards-1");
  // searching page
  const searchJobCards = document.getElementById("mosaic-jobResults");
  // make conditional to check which page we are on
  const btn = document.getElementById("startbtn");

  btn.addEventListener("click", () => {
    // Log the job cards container
    console.log(getJobCards);

    // Dynamically get job card data
    // Search vs non search page logic
    if (getJobCards) {
      // if they don't search for a job ( scrapes the home page)
      jobCardScrape(getJobCards);
    } else if (searchJobCards) {
      // if they search for a job (scrapes the search results page)
      autoScrollToBottom(() => {
        console.log("You have hit the bottom of the webpage!");
        jobCardScrape(searchJobCards);
      });
    }
  });
  // searching page logic
  // mosaic-jobResults search id
};

function indeedMain() {
  new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 100; // 10 seconds max wait

    const checkExist = setInterval(() => {
      attempts++;
      if (document.getElementById("MosaicProviderRichSearchDaemon")) {
        clearInterval(checkExist);
        resolve();
      } else if (attempts >= maxAttempts) {
        clearInterval(checkExist);
        reject(
          new Error(
            "MosaicProviderRichSearchDaemon element not found after 10 seconds"
          )
        );
      }
    }, 100);
  })
    .then(() => {
      startIndeed();
    })
    .catch((err) => {
      console.log("Error in indeedMain:", err);
    });
}

setTimeout(() => {
  indeedMain();
}, 2000);

// sgets job card data
// ...existing code...
const jobCardScrape = async (getJobCards) => {
  console.log("Starting jobCardScrape...");
  const jobs = scrapePage(getJobCards);
  console.log("Current page jobs:", jobs);

  // Here you can implement any additional logic you need before sending the jobs data
  //  TODO : add open page to check for apply on company website

  // Send the jobs data to the background script
  if (jobs.length > 0) {
    if (isExtensionContextValid()) {
      try {
        console.log("📤 Attempting to send jobs to background script...");
        chrome.runtime.sendMessage(
          { action: "queueJobs", jobs },
          (response) => {
            if (chrome.runtime.lastError) {
              const errorMsg = chrome.runtime.lastError.message;
              console.error("Chrome runtime error:", errorMsg);
              
              if (errorMsg.includes("Extension context invalidated")) {
                console.log("🔄 Extension was reloaded. Showing user notification...");
                showExtensionReloadNotice();
                return;
              }
              
              if (errorMsg.includes("receiving end does not exist")) {
                console.log("🔄 Background script not ready. Will retry...");
                return;
              }
              
              return;
            }
            if (response && response.status === "fail") {
              console.error(
                `Background script failed to queue jobs. ID: ${
                  response.id
                }, Status: ${response.status}, Reason: ${
                  response.reason || "No reason provided"
                }`
              );
            } else {
              console.log("Response from background script:", response);
            }
          }
        );
      } catch (error) {
        console.error(
          "Failed to send message to background script:",
          error.message
        );
      }
    } else {
      console.error(
        "Extension context invalidated before sending jobs. Please refresh the page."
      );
    }
  } else {
    console.log("No jobs to send to background script.");
  }
};
// ...existing code...
const startScriptButton = () => {
  const searchForm = document.getElementById("MosaicProviderRichSearchDaemon");
  const startbtn = document.createElement("button");
  startbtn.innerText = "Start";
  startbtn.style.height = "30px";
  startbtn.style.width = "60px";
  startbtn.style.backgroundColor = "blue";
  startbtn.style.color = "white";
  startbtn.style.borderRadius = "5px";
  startbtn.style.border = "none";
  startbtn.style.cursor = "pointer";
  startbtn.style.marginLeft = "10px";
  startbtn.id = "startbtn";
  searchForm.appendChild(startbtn);
};

const scrapePage = (getJobCards) => {
  console.log("scrapePage called...");
  const jobCards = getJobCards?.querySelectorAll("ul > li");
  if (!jobCards) {
    console.log("No job cards found on this page.");
    return [];
  }
  const jobs = [];
  jobCards.forEach((card, idx) => {
    // Get job title
    const jobTitle =
      card.querySelector("h2.jobTitle span")?.textContent?.trim() || null;
    // Get company name
    const companyName =
      card.querySelector('[data-testid="company-name"]')?.textContent?.trim() ||
      null;
    // Get location
    const location =
      card
        .querySelector('[data-testid="text-location"]')
        ?.textContent?.trim() || null;
    // Get company description
    const companyDesc =
      card.querySelector(".jobMetaDataGroup")?.innerText?.trim() || null;
    // Get job link and id
    const jobLinkEl = card.querySelector("h2.jobTitle a");
    let jobLink = jobLinkEl?.href || null;
    const jobId = jobLinkEl?.getAttribute("data-jk") || jobLinkEl?.id || null;
    
    // Validate and fix job URL to ensure it goes to the right page
    if (jobLink) {
      // Ensure the URL is absolute
      if (jobLink.startsWith('/')) {
        jobLink = 'https://www.indeed.com' + jobLink;
      }
      
      // Make sure it's a viewjob URL, not a search URL
      if (!jobLink.includes('/viewjob?') && !jobLink.includes('/jobs/view/')) {
        // If we have a job ID, construct the proper viewjob URL
        if (jobId) {
          jobLink = `https://www.indeed.com/viewjob?jk=${jobId}`;
          console.log(`🔧 Fixed job URL for ${jobTitle}: ${jobLink}`);
        } else {
          console.log(`⚠️ Invalid job URL for ${jobTitle}: ${jobLink}`);
          jobLink = null; // This will cause the job to be skipped
        }
      }
    }

    // Check if this is an "Easily apply" job - ONLY queue these jobs
    const easyApplyElement = card.querySelector('[data-testid="indeedApply"]');
    const jobType = easyApplyElement?.textContent?.trim() === "Easily apply" ? "Easily apply" : null;
    
    // Skip jobs that are NOT "Easily apply"
    if (!jobType) {
      console.log(`Skipping job at index ${idx} - Not an "Easily apply" job. Apply type: "${easyApplyElement?.textContent?.trim() || 'N/A'}"`);
      return;
    }
    if (
      [
        jobTitle,
        companyName,
        location,
        companyDesc,
        jobLink,
        jobId,
        jobType,
      ].some((val) => val === null || val === undefined)
    ) {
      console.log(`Skipping incomplete job card at index ${idx}.`);
      return;
    }
    jobs.push({
      jobTitle,
      companyName,
      location,
      companyDesc,
      jobLink,
      jobId,
      jobType,
    });
    console.log(`Job card ${idx} scraped:`, jobs[jobs.length - 1]);
  });
  console.log(`scrapePage finished. ${jobs.length} jobs found.`);
  return jobs;
};

function autoScrollToBottom(callback) {
  let lastScrollTop = -1;
  let scrollingDown = true;
  function scrollStep() {
    if (scrollingDown) {
      window.scrollBy(0, 100);
      const scrollTop = window.scrollY;
      const windowHeight = window.innerHeight;
      const documentHeight = document.body.offsetHeight;
      if (
        scrollTop + windowHeight >= documentHeight - 5 ||
        scrollTop === lastScrollTop
      ) {
        // At bottom or can't scroll further
        scrollingDown = false;
        lastScrollTop = -1;
        setTimeout(scrollStep, 80);
        return;
      }
      lastScrollTop = scrollTop;
      setTimeout(scrollStep, 80);
    } else {
      window.scrollBy(0, -100);
      const scrollTop = window.scrollY;
      if (scrollTop <= 0 || scrollTop === lastScrollTop) {
        // At top or can't scroll further
        if (typeof callback === "function") callback();
        return;
      }
      lastScrollTop = scrollTop;
      setTimeout(scrollStep, 80);
    }
  }
  scrollStep();
}

function isExtensionContextValid() {
  try {
    // Check for basic extension context validity
    if (typeof chrome === "undefined" || !chrome.runtime) {
      return false;
    }

    // Check if extension context is invalidated
    if (chrome.runtime.lastError) {
      console.log(
        "Chrome runtime error detected:",
        chrome.runtime.lastError.message
      );
      return false;
    }

    // Try to access extension ID - this will throw if context is invalid
    const extensionId = chrome.runtime.id;
    if (!extensionId) {
      return false;
    }

    return !!window.document;
  } catch (error) {
    // Extension context invalidated or other error
    console.log("Extension context validation failed:", error.message);
    return false;
  }
}

/**
 * Check if automation should run - only on main Indeed search/jobs pages
 */
function shouldRunAutomation() {
  try {
    const url = window.location.href;
    const hostname = window.location.hostname;
    
    // Must be on Indeed domain
    if (!hostname.includes('indeed.com')) {
      console.log("❌ Not on Indeed domain - automation disabled");
      return false;
    }
    
    // Allow automation on job search/results pages AND any job application pages
    const isJobSearchPage = url.includes('/jobs?') || url.includes('/viewjob?') || url.includes('/jobs/');
    const isApplicationPage = url.includes('smartapply.indeed.com') || 
                            url.includes('form/profile') ||
                            url.includes('apply/resume') ||
                            url.includes('/apply') ||
                            url.includes('indeed.com/m/jobs') ||
                            document.querySelector('#mosaic-contactInfoModule') ||
                            document.querySelector('[data-testid="profile-location-page"]') ||
                            document.querySelector('form[method="post"]');
    
    if (!isJobSearchPage && !isApplicationPage) {
      console.log("❌ Not on job search or application page - automation disabled");
      console.log("Current URL:", url);
      return false;
    }
    
    // Check if we're in a valid context
    if (!isExtensionContextValid()) {
      console.log("❌ Extension context invalid - automation disabled");
      return false;
    }
    
    return true;
  } catch (error) {
    console.error("❌ Error checking if automation should run:", error.message);
    return false;
  }
}

/**
 * Safely send message to background script with proper error handling
 * Prevents "message channel closed" and "back/forward cache" errors
 */
function safeSendMessage(message, callback = null) {
  if (!isExtensionContextValid()) {
    console.log("⚠️ Cannot send message - extension context invalid");
    return false;
  }
  
  try {
    if (callback) {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          console.log("📢 Message response error (expected on page navigation):", chrome.runtime.lastError.message);
        } else {
          callback(response);
        }
      });
    } else {
      chrome.runtime.sendMessage(message, () => {
        if (chrome.runtime.lastError) {
          console.log("📢 Message send error (expected on page navigation):", chrome.runtime.lastError.message);
        }
      });
    }
    return true;
  } catch (error) {
    console.log("📢 Message send failed (extension context lost):", error.message);
    return false;
  }
}

async function scrollDownUp() {
  // Check if extension context is still valid
  if (!isExtensionContextValid()) {
    console.log('🔄 Extension context invalidated during scrollDownUp');
    showExtensionReloadNotice();
    return;
  }
  
  // Scroll down
  let lastScrollTop = -1;
  for (let i = 0; i < 30; i++) {
    // Check context validity during loop
    if (!isExtensionContextValid()) {
      console.log('🔄 Extension context invalidated during scroll down');
      showExtensionReloadNotice();
      return;
    }
    
    window.scrollBy(0, 100);
    await new Promise((r) => setTimeout(r, 40));
    const scrollTop = window.scrollY;
    if (scrollTop === lastScrollTop) break;
    lastScrollTop = scrollTop;
  }
  
  // Scroll up
  lastScrollTop = -1;
  for (let i = 0; i < 30; i++) {
    // Check context validity during loop
    if (!isExtensionContextValid()) {
      console.log('🔄 Extension context invalidated during scroll up');
      showExtensionReloadNotice();
      return;
    }
    
    window.scrollBy(0, -100);
    await new Promise((r) => setTimeout(r, 40));
    const scrollTop = window.scrollY;
    if (scrollTop === lastScrollTop || scrollTop <= 0) break;
    lastScrollTop = scrollTop;
  }
}

async function fillContactInfo(job) {
  console.log("Filling contact info for job:", job);

  // Check if extension context is still valid
  if (!isExtensionContextValid()) {
    console.log('🔄 Extension context invalidated during fillContactInfo');
    showExtensionReloadNotice();
    return false;
  }

  // Fill phone number (common field)
  const phoneSelectors = [
    'input[name*="phone"]',
    'input[data-testid*="phone"]',
    'input[placeholder*="phone"]',
    'input[id*="phone"]',
  ];
  for (const selector of phoneSelectors) {
    const phoneInput = document.querySelector(selector);
    if (phoneInput && !phoneInput.value) {
      phoneInput.value = "555-123-4567"; // Default phone
      phoneInput.dispatchEvent(new Event("input", { bubbles: true }));
      phoneInput.dispatchEvent(new Event("change", { bubbles: true }));
      console.log("Filled phone number");
      break;
    }
  }

  // Fill zip code
  const zipSelectors = [
    'input[data-testid="location-fields-postal-code-input"]',
    'input[name="location-postal-code"]',
    'input[name*="zip"]',
    'input[name*="postal"]',
    'input[placeholder*="zip"]',
  ];
  if (job.location) {
    const zipMatch = job.location.match(/\b\d{5}\b/);
    if (zipMatch) {
      for (const selector of zipSelectors) {
        const zipInput = document.querySelector(selector);
        if (zipInput && !zipInput.value) {
          zipInput.value = zipMatch[0];
          zipInput.dispatchEvent(new Event("input", { bubbles: true }));
          zipInput.dispatchEvent(new Event("change", { bubbles: true }));
          console.log("Filled zip code with:", zipMatch[0]);
          break;
        }
      }
    }
  }

  // Fill city/state
  const citySelectors = [
    'input[data-testid="location-fields-locality-input"]',
    'input[name="location-locality"]',
    'input[name*="city"]',
    'input[name*="location"]',
    'input[placeholder*="city"]',
  ];
  if (job.location) {
    for (const selector of citySelectors) {
      const cityInput = document.querySelector(selector);
      if (cityInput && !cityInput.value) {
        cityInput.value = job.location;
        cityInput.dispatchEvent(new Event("input", { bubbles: true }));
        cityInput.dispatchEvent(new Event("change", { bubbles: true }));
        console.log("Filled city/state with:", job.location);
        break;
      }
    }
  }

  // Fill street address
  const addressSelectors = [
    'input[data-testid="location-fields-address-input"]',
    'input[name="location-address"]',
    'input[name*="address"]',
    'input[name*="street"]',
    'input[placeholder*="address"]',
  ];
  for (const selector of addressSelectors) {
    const addressInput = document.querySelector(selector);
    if (addressInput && !addressInput.value) {
      addressInput.value = "123 Main St";
      addressInput.dispatchEvent(new Event("input", { bubbles: true }));
      addressInput.dispatchEvent(new Event("change", { bubbles: true }));
      console.log("Filled street address");
      break;
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "applyJob" && message.job) {
    console.log("📨 Received applyJob message, starting async processing...");
    
    // ═══════════════════════════════════════════════════════════════════════════
    // 🚀 MAIN JOB APPLICATION WORKFLOW - MULTI-STEP PROCESS
    // ═══════════════════════════════════════════════════════════════════════════
    
    let responseSent = false;
    let timeoutId;
    
    const safeResponse = (response) => {
      if (!responseSent && sendResponse) {
        try {
          responseSent = true;
          if (timeoutId) clearTimeout(timeoutId);
          sendResponse(response);
          console.log("📤 Response sent:", response);
        } catch (error) {
          console.error("Error sending response:", error.message);
        }
      }
    };
    
    // Failsafe timeout - always send response within 45 seconds (reduced from 90)
    timeoutId = setTimeout(() => {
      if (!responseSent) {
        console.log("⏰ Job application timeout - sending failure response");
        safeResponse({ status: "timeout", result: "fail_timeout" });
      }
    }, 75000); // 75 seconds timeout (less than background script timeout)
    
    // Wrap in promise to ensure proper error handling
    const executeJob = async () => {
      try {
      const job = message.job;

      // ─────────────────────────────────────────────────────────────────────────
      // STEP 0: VALIDATION - Ensure job has required data
      // ─────────────────────────────────────────────────────────────────────────
      if (!job.jobId) {
        console.error("Job missing required jobId:", job);
        if (isExtensionContextValid()) {
          try {
            chrome.runtime.sendMessage({
              action: "jobResult",
              jobId: null,
              result: "fail_validation",
            });
          } catch (error) {
            console.error("Failed to send validation result:", error.message);
          }
        }
        safeResponse({ status: "error", message: "Invalid job data" });
        return;
      }

      console.log(
        "🎯 Starting job application for:",
        job.jobTitle,
        "at",
        job.companyName
      );
      let result = "pending";
      try {
        // ═══════════════════════════════════════════════════════════════════════════
        // 🚀 DYNAMIC WORKFLOW SYSTEM - Handles unlimited question pages automatically
        // ═══════════════════════════════════════════════════════════════════════════
        result = await runDynamicApplicationWorkflow();

      } catch (err) {
        // ─────────────────────────────────────────────────────────────────────────
        // ERROR HANDLING: Catch any unexpected errors during application process
        // ─────────────────────────────────────────────────────────────────────────
        console.log("💥 EXCEPTION during job application:", err.message);
        result = "fail";
      }

      // ─────────────────────────────────────────────────────────────────────────
      // STEP 6: REPORT RESULTS - Send final result back to background script
      // ─────────────────────────────────────────────────────────────────────────
      console.log(`📊 Final Result for ${job.jobTitle}: ${result}`);
      
      // Function to safely send job result with retry logic
      const sendJobResult = (attempt = 1) => {
        if (!isExtensionContextValid()) {
          console.error("Extension context invalid, cannot send result");
          return;
        }
        
        try {
          chrome.runtime.sendMessage(
            { action: "jobResult", jobId: job.jobId, result },
            (response) => {
              if (chrome.runtime.lastError) {
                const errorMsg = chrome.runtime.lastError.message;
                console.error(`Attempt ${attempt} - Error sending job result:`, errorMsg);
                
                // Handle specific context invalidation errors
                if ((errorMsg.includes("back/forward cache") ||
                     errorMsg.includes("receiving end does not exist") ||
                     errorMsg.includes("message channel is closed") ||
                     errorMsg.includes("Extension context invalidated")) && 
                    attempt < 3) {
                  
                  console.log(`🔄 Retrying job result (attempt ${attempt + 1}/3)...`);
                  setTimeout(() => sendJobResult(attempt + 1), 1000);
                } else {
                  console.error("❌ Failed to send job result after all attempts");
                  // Store result locally as fallback
                  try {
                    localStorage.setItem(`jobResult_${job.jobId}`, JSON.stringify({
                      jobId: job.jobId,
                      result: result,
                      timestamp: Date.now(),
                      jobTitle: job.jobTitle
                    }));
                    console.log("💾 Job result stored locally as fallback");
                  } catch (e) {
                    console.error("Failed to store result locally:", e.message);
                  }
                }
              } else {
                console.log("✅ Successfully reported result to background script");
              }
            }
          );
        } catch (error) {
          console.error("Failed to send job result:", error.message);
          // Store result locally as fallback
          try {
            localStorage.setItem(`jobResult_${job.jobId}`, JSON.stringify({
              jobId: job.jobId,
              result: result,
              timestamp: Date.now(),
              jobTitle: job.jobTitle
            }));
            console.log("💾 Job result stored locally as fallback");
          } catch (e) {
            console.error("Failed to store result locally:", e.message);
          }
        }
      };
      
        // Execute the send function
        sendJobResult();
        
        safeResponse({ status: "completed", result });
      
      // Execute the send function
      sendJobResult();
      
      safeResponse({ status: "completed", result });
      } catch (error) {
        console.error("💥 Fatal error in job application workflow:", error);
        safeResponse({ status: "error", message: error.message, result: "fail_exception" });
      }
    };
    
    // Execute the job with additional error handling
    executeJob().catch((error) => {
      console.error("💥 Unhandled error in job execution:", error);
      safeResponse({ status: "error", message: error.message, result: "fail_exception" });
    });
    
    return true; // Keep message channel open for async operation
  }
  
  // Handle other message types
  if (message.action === "heartbeat") {
    sendResponse({ status: "alive" });
    return true;
  }
  
  // Default response for unknown actions
  sendResponse({ status: "unknown_action" });
  return false;
});

// Show a modal popup to notify user of CAPTCHA and pause automation
function showCaptchaModal() {
  if (document.getElementById("autoApplyCaptchaModal")) return;
  const modal = document.createElement("div");
  modal.id = "autoApplyCaptchaModal";
  modal.style.position = "fixed";
  modal.style.top = "0";
  modal.style.left = "0";
  modal.style.width = "100vw";
  modal.style.height = "100vh";
  modal.style.background = "rgba(0,0,0,0.7)";
  modal.style.zIndex = "99999";
  modal.style.display = "flex";
  modal.style.flexDirection = "column";
  modal.style.justifyContent = "center";
  modal.style.alignItems = "center";
  modal.innerHTML = `
      <div style="background:#fff;padding:2em;border-radius:8px;text-align:center;max-width:400px;">
        <h2 style="margin-bottom:1em;">CAPTCHA Detected</h2>
        <p style="margin-bottom:1em;">Please complete the CAPTCHA challenge to continue the application process.</p>
        <button id="autoApplyResumeBtn" style="padding:0.5em 2em;">Resume Automation</button>
      </div>
    `;
  document.body.appendChild(modal);
  document.getElementById("autoApplyResumeBtn").onclick = () => {
    modal.remove();
    window.autoApplyPaused = false;
  };
  window.autoApplyPaused = true;
}

// Detect Cloudflare CAPTCHA and show modal
function detectCloudflareCaptcha() {
  // Look for Cloudflare challenge elements
  if (
    document.querySelector(
      '.hcaptcha-box, .cf-captcha-container, iframe[src*="turnstile"], iframe[src*="hcaptcha"]'
    )
  ) {
    showCaptchaModal();
    return true;
  }
  return false;
}

// Listen for tab close (unload) and notify background
window.addEventListener("beforeunload", function () {
  if (isExtensionContextValid()) {
    try {
      chrome.runtime.sendMessage({ action: "indeedTabClosed" });
    } catch (error) {
      // Ignore errors on tab close - extension may already be invalidated
      console.log(
        "Tab close message failed (expected on extension reload):",
        error.message
      );
    }
  }
});

// Main workflow function with CAPTCHA pause
async function completeApplicationWorkflow() {
  // Check for emergency stop before starting
  if (window.emergencyStopFlag) {
    console.log("🚨 Emergency stop - workflow cancelled");
    return { success: false, reason: "Emergency stop triggered" };
  }
  
  const results = [];
  try {
    results.push(await fillContactFieldsAsync());
    results.push(await fillScreenerQuestionsAsync());
    results.push(await fillResumeSectionAsync());
    results.push(await fillSupportingDocumentsAsync());
    results.push(await acceptLegalDisclaimerAsync());
    // Detect CAPTCHA and pause if needed
    if (detectCloudflareCaptcha()) {
      console.warn("CAPTCHA detected, pausing automation.");
      let pauseAttempts = 0;
      while (window.autoApplyPaused && pauseAttempts < 300) {
        // Max 5 minutes pause
        await new Promise((r) => setTimeout(r, 1000));
        if (!isExtensionContextValid()) {
          console.log("Extension context invalidated during pause. Aborting.");
          return;
        }
        pauseAttempts++;
      }
    }
    // Click any relevant button (apply, continue, review, next, submit)
    results.push(await clickRelevantButton(["apply"], "apply"));
    results.push(
      await clickRelevantButton(
        ["continue", "review", "next"],
        "continue/review/next"
      )
    );
    results.push(
      await clickRelevantButton(["submit your application", "submit"], "submit")
    );
  } catch (err) {
    results.push({
      success: false,
      step: "exception",
      error: `Exception: ${err.message}`,
    });
  }
  // Error reporting
  const errorSteps = results.filter((r) => !r.success);
  if (errorSteps.length > 0) {
    errorSteps.forEach((e) => {
      if (e.error && e.error.includes("not found")) {
        console.error(`Step '${e.step}' failed: ${e.error}`);
      } else if (e.error && e.error.includes("Exception")) {
        console.error(`Step '${e.step}' encountered an exception: ${e.error}`);
      } else {
        console.error(`Step '${e.step}' failed: ${e.error || "Unknown error"}`);
      }
    });
    return false;
  }
  return true;
}

// Utility to wrap actions in a Promise with error handling
function safePromise(fn, stepName = "") {
  return new Promise((resolve) => {
    try {
      const result = fn();
      resolve({ success: true, step: stepName, result });
    } catch (error) {
      console.error(`Error in step: ${stepName}`, error);
      resolve({ success: false, step: stepName, error });
    }
  });
}

// Fill contact fields with Promise and error handling
// --- MISSING FUNCTION STUBS ---
function fillContactFields() {
  console.log("Filling contact fields...");
  let filled = 0;

  // Helper function to fill input and trigger events
  const fillInput = (input, value, fieldName) => {
    if (input && !input.value) {
      input.focus();
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new Event("blur", { bubbles: true }));
      console.log(`Filled ${fieldName}: ${value}`);
      filled++;
      return true;
    }
    return false;
  };

  // Fill name with multiple selectors
  const nameSelectors = [
    'input[name="name"]',
    'input[name="fullName"]',
    'input[name="full-name"]',
    'input[placeholder*="Name" i]',
    'input[placeholder*="Full name" i]',
    'input[data-testid*="name"]',
  ];
  for (const selector of nameSelectors) {
    const nameInput = document.querySelector(selector);
    if (fillInput(nameInput, "John Smith", "name")) break;
  }

  // Fill email with multiple selectors
  const emailSelectors = [
    'input[name="email"]',
    'input[type="email"]',
    'input[name="emailAddress"]',
    'input[placeholder*="email" i]',
    'input[data-testid*="email"]',
  ];
  for (const selector of emailSelectors) {
    const emailInput = document.querySelector(selector);
    if (fillInput(emailInput, "john.smith.jobs@gmail.com", "email")) break;
  }

  // Fill phone with multiple selectors
  const phoneSelectors = [
    'input[name*="phone" i]',
    'input[type="tel"]',
    'input[placeholder*="phone" i]',
    'input[data-testid*="phone"]',
  ];
  for (const selector of phoneSelectors) {
    const phoneInput = document.querySelector(selector);
    if (fillInput(phoneInput, "555-123-4567", "phone")) break;
  }

  // Fill address
  const addressSelectors = [
    'input[name*="address" i]',
    'input[placeholder*="address" i]',
    'input[name*="street" i]',
    'input[data-testid*="address"]',
  ];
  for (const selector of addressSelectors) {
    const addressInput = document.querySelector(selector);
    if (fillInput(addressInput, "123 Main Street", "address")) break;
  }

  // Fill city
  const citySelectors = [
    'input[name*="city" i]',
    'input[placeholder*="city" i]',
    'input[data-testid*="city"]',
  ];
  for (const selector of citySelectors) {
    const cityInput = document.querySelector(selector);
    if (fillInput(cityInput, "New York", "city")) break;
  }

  // Fill state
  const stateSelectors = [
    'input[name*="state" i]',
    'input[placeholder*="state" i]',
    'select[name*="state" i]',
    'input[data-testid*="state"]',
  ];
  for (const selector of stateSelectors) {
    const stateInput = document.querySelector(selector);
    if (stateInput && stateInput.tagName === "SELECT") {
      stateInput.value = "NY";
      stateInput.dispatchEvent(new Event("change", { bubbles: true }));
      console.log("Filled state dropdown: NY");
      filled++;
    } else if (fillInput(stateInput, "NY", "state")) {
      break;
    }
  }

  // Fill zip
  const zipSelectors = [
    'input[name*="zip" i]',
    'input[name*="postal" i]',
    'input[placeholder*="zip" i]',
    'input[data-testid*="postal"]',
  ];
  for (const selector of zipSelectors) {
    const zipInput = document.querySelector(selector);
    if (fillInput(zipInput, "10001", "zip")) break;
  }

  console.log(`Contact fields filled: ${filled} fields`);
  return filled > 0;
}

function fillScreenerQuestions() {
  // Fill all radio buttons with first option
  const radios = document.querySelectorAll('input[type="radio"]');
  radios.forEach((radio, idx) => {
    if (idx === 0 || radio.name !== radios[idx - 1]?.name) {
      radio.checked = true;
      radio.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  // Fill all select dropdowns with first option
  const selects = document.querySelectorAll("select");
  selects.forEach((select) => {
    if (select.options.length > 1) {
      select.selectedIndex = 1;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  // Fill all textareas with generic answer
  const textareas = document.querySelectorAll("textarea");
  textareas.forEach((textarea) => {
    textarea.value = "Yes";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return true;
}

function fillResumeSection() {
  // Try to select the first resume option if available
  const resumeOption = document.querySelector(
    'input[type="radio"][name*="resume"]'
  );
  if (resumeOption) {
    resumeOption.checked = true;
    resumeOption.dispatchEvent(new Event("change", { bubbles: true }));
  }
  // If file upload is present, skip (cannot automate file upload without user interaction)
  return true;
}

function fillSupportingDocuments() {
  // Try to select the first supporting document option if available
  const docOption = document.querySelector(
    'input[type="radio"][name*="document"]'
  );
  if (docOption) {
    docOption.checked = true;
    docOption.dispatchEvent(new Event("change", { bubbles: true }));
  }
  // If file upload is present, skip (cannot automate file upload without user interaction)
  return true;
}

function fillContactFieldsAsync() {
  return safePromise(fillContactFields, "fillContactFields");
}

function fillScreenerQuestionsAsync() {
  return safePromise(fillScreenerQuestions, "fillScreenerQuestions");
}

function fillResumeSectionAsync() {
  return safePromise(fillResumeSection, "fillResumeSection");
}

function fillSupportingDocumentsAsync() {
  return safePromise(fillSupportingDocuments, "fillSupportingDocuments");
}

function acceptLegalDisclaimerAsync() {
  return safePromise(acceptLegalDisclaimer, "acceptLegalDisclaimer");
}

function clickButtonAsync(selector, regex, stepName) {
  return new Promise((resolve) => {
    try {
      let btn = Array.from(document.querySelectorAll(selector)).find((el) => {
        const text = el.textContent || el.value || "";
        return regex.test(text);
      });
      if (btn) {
        btn.click();
        setTimeout(() => resolve({ success: true, step: stepName }), 500);
      } else {
        resolve({ success: false, step: stepName, error: "Button not found" });
      }
    } catch (error) {
      console.error(`Error in step: ${stepName}`, error);
      resolve({ success: false, step: stepName, error });
    }
  });
}

// Improved function to reliably click any relevant button (apply, continue, review, next, submit)
async function clickRelevantButton(keywords, stepName) {
  const regex = new RegExp(keywords.join("|"), "i");
  let btn = Array.from(
    document.querySelectorAll(
      'button, input[type="button"], input[type="submit"]'
    )
  ).find((el) => {
    const text = el.textContent || el.value || "";
    return regex.test(text);
  });
  if (btn) {
    btn.click();
    console.log(`Clicked ${stepName} button.`);
    await new Promise((r) => setTimeout(r, 1000));
    return { success: true, step: stepName };
  } else {
    const errorMsg = `${stepName} button not found (keywords: ${keywords.join(
      ", "
    )})`;
    console.warn(errorMsg);
    return { success: false, step: stepName, error: errorMsg };
  }
}

// Main workflow function with improved error specificity


// ═══════════════════════════════════════════════════════════════════════════
// 🎯 EMPLOYER QUESTIONS HANDLER - Dynamic form filling for any question types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fill employer questions dynamically based on question type and label
 */
/**
 * Wait for elements to be present in the DOM
 */
function waitForElements(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    function checkForElements() {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        console.log(`✅ Found ${elements.length} elements with selector: ${selector}`);
        resolve(elements);
      } else if (Date.now() - startTime > timeout) {
        console.log(`⏰ Timeout waiting for elements: ${selector}`);
        resolve(document.querySelectorAll(selector)); // Return empty NodeList
      } else {
        setTimeout(checkForElements, 100);
      }
    }
    
    checkForElements();
  });
}

/**
 * 🔍 PAGE SCRAPER - Map all form elements and their types
 * This scrapes the page first to understand what we're dealing with
 */
async function scrapePageElements() {
  console.log("🔍 ENHANCED SCRAPING: Analyzing page for all form elements with better classification...");
  
  const pageData = {
    questions: [],
    radioGroups: {},
    textInputs: [],
    textareas: [],
    selects: [],
    checkboxes: [],
    dateInputs: [],
    buttons: [],
    relevantTypes: new Set() // Track only types we actually find
  };
  
  // Wait for elements to load
  await new Promise(r => setTimeout(r, 1000));
  
  // Find all question containers with enhanced selectors
  const containers = document.querySelectorAll('.ia-Questions-item, [id^="q_"], [data-testid*="input-q_"], [class*="Questions-item"], .application-question, [class*="question"]');
  
  containers.forEach((container, index) => {
    console.log(`📋 Analyzing container ${index + 1}...`);
    
    // Enhanced label detection
    const labelElement = container.querySelector('label, legend, [data-testid*="label"], [data-testid*="rich-text"], span[data-testid*="rich-text"], .question-text, [class*="question-label"]');
    const labelText = labelElement ? (labelElement.textContent || labelElement.innerText || '').toLowerCase().trim() : '';
    
    // Find input elements in this container with better detection
    const inputs = container.querySelectorAll('input, textarea, select');
    
    inputs.forEach(input => {
      const inputType = input.type || input.tagName.toLowerCase();
      const elementData = {
        container: index,
        label: labelText,
        element: input,
        type: inputType,
        name: input.name || '',
        id: input.id || '',
        value: input.value || '',
        checked: input.checked || false,
        placeholder: input.placeholder || '',
        required: input.required || false
      };
      
      // Track relevant types we actually find
      pageData.relevantTypes.add(inputType);
      
      // Enhanced categorization with better input type detection
      switch(inputType) {
        case 'radio':
          if (!pageData.radioGroups[input.name]) {
            pageData.radioGroups[input.name] = {
              label: labelText,
              options: [],
              questionType: classifyQuestionType(labelText)
            };
          }
          pageData.radioGroups[input.name].options.push(elementData);
          break;
          
        case 'text':
        case 'email':
        case 'tel':
        case 'number':
          pageData.textInputs.push({
            ...elementData,
            questionType: classifyQuestionType(labelText)
          });
          break;
          
        case 'date':
          pageData.dateInputs.push({
            ...elementData,
            questionType: classifyQuestionType(labelText)
          });
          break;
          
        case 'checkbox':
          pageData.checkboxes.push({
            ...elementData,
            questionType: classifyQuestionType(labelText)
          });
          break;
          
        default:
          if (input.tagName.toLowerCase() === 'textarea') {
            pageData.textareas.push({
              ...elementData,
              questionType: classifyQuestionType(labelText)
            });
          } else if (input.tagName.toLowerCase() === 'select') {
            pageData.selects.push({
              ...elementData,
              questionType: classifyQuestionType(labelText)
            });
          }
      }
      
      // Check for date inputs by placeholder or pattern
      if (inputType === 'text' && (
        input.placeholder?.includes('MM/DD/YYYY') || 
        input.placeholder?.includes('date') ||
        labelText.includes('date') ||
        labelText.includes('available') ||
        labelText.includes('start')
      )) {
        pageData.dateInputs.push({
          ...elementData,
          questionType: 'DATE_INPUT'
        });
      }
    });
    
    // Add to questions array only if we have relevant content
    if (labelText && inputs.length > 0) {
      const questionType = classifyQuestionType(labelText);
      pageData.questions.push({
        container: index,
        label: labelText,
        inputTypes: Array.from(inputs).map(i => i.type || i.tagName.toLowerCase()),
        questionType: questionType,
        priority: getQuestionPriority(questionType) // Add priority for processing order
      });
    }
  });
  
  // Sort questions by priority (handle high-priority questions first)
  pageData.questions.sort((a, b) => b.priority - a.priority);
  
  // Find all buttons
  const buttons = document.querySelectorAll('button, input[type="submit"], input[type="button"]');
  buttons.forEach(btn => {
    pageData.buttons.push({
      element: btn,
      text: (btn.textContent || btn.value || '').toLowerCase().trim(),
      type: btn.type || 'button',
      classes: btn.className || ''
    });
  });
  
  // Enhanced logging with relevancy info
  console.log("📊 ENHANCED SCRAPE RESULTS:");
  console.log(`   Questions: ${pageData.questions.length}`);
  console.log(`   Radio Groups: ${Object.keys(pageData.radioGroups).length}`);
  console.log(`   Text Inputs: ${pageData.textInputs.length}`);
  console.log(`   Date Inputs: ${pageData.dateInputs.length}`);
  console.log(`   Textareas: ${pageData.textareas.length}`);
  console.log(`   Selects: ${pageData.selects.length}`);
  console.log(`   Checkboxes: ${pageData.checkboxes.length}`);
  console.log(`   Buttons: ${pageData.buttons.length}`);
  console.log(`   Relevant Types Found: ${Array.from(pageData.relevantTypes).join(', ')}`);
  
  return pageData;
}

/**
 * 🔥 VERSION 2.0 - AGGRESSIVE PROCESSOR with starter pattern filtering
 */
async function processScrapedElementsV2(pageData) {
  console.log("🔥 VERSION 2.0 PROCESSING: Aggressive filtering with question starter patterns...");
  
  let processed = 0;
  let skipped = 0;
  let filtered_out = 0;
  
  // 🚫 AGGRESSIVE FILTERING - Only process questions that match our starter patterns
  const knownTypes = new Set([
    'WORK_AUTHORIZATION', 'COMMUTE', 'EXPERIENCE', 'DATE_INPUT', 
    'SALARY', 'REASON_APPLYING', 'EDUCATION'
  ]);
  
  // Filter out UNKNOWN questions completely - won't even try to process them
  const matchedQuestions = pageData.questions.filter(q => {
    if (q.questionType === 'UNKNOWN') {
      filtered_out++;
      console.log(`🚫 FILTERED OUT: "${q.label}" - doesn't match any starter pattern`);
      return false;
    }
    return knownTypes.has(q.questionType);
  });
  
  console.log(`📊 FILTERING RESULTS:`);
  console.log(`   Total questions found: ${pageData.questions.length}`);
  console.log(`   Matched starter patterns: ${matchedQuestions.length}`);
  console.log(`   Filtered out (unknown): ${filtered_out}`);
  console.log(`   Will process: ${matchedQuestions.length} questions`);
  
  // Process only the questions that matched our starter patterns
  for (const question of matchedQuestions) {
    console.log(`\n🎯 Processing [Priority ${question.priority}]: "${question.label}"`);
    console.log(`🏷️ Matched pattern: ${question.questionType}`);
    
    try {
      // 🔥 SERIES OF SWITCH CASES - Only handle confirmed pattern matches
      switch(question.questionType) {
        case 'WORK_AUTHORIZATION':
          console.log('💼 Running WORK_AUTHORIZATION handler...');
          if (await handleWorkAuthorization(question, pageData)) processed++;
          else skipped++;
          break;
          
        case 'COMMUTE':
          console.log('🚗 Running COMMUTE handler...');
          if (await handleCommuteQuestion(question, pageData)) processed++;
          else skipped++;
          break;
          
        case 'EXPERIENCE':
          console.log('📈 Running EXPERIENCE handler...');
          if (await handleExperienceQuestion(question, pageData)) processed++;
          else skipped++;
          break;
          
        case 'DATE_INPUT':
          console.log('📅 Running DATE_INPUT handler...');
          if (await handleDateInput(question, pageData)) processed++;
          else skipped++;
          break;
          
        case 'SALARY':
          console.log('💰 Running SALARY handler...');
          if (await handleSalaryQuestion(question, pageData)) processed++;
          else skipped++;
          break;
          
        case 'REASON_APPLYING':
          console.log('📝 Running REASON_APPLYING handler...');
          if (await handleReasonApplying(question, pageData)) processed++;
          else skipped++;
          break;
          
        case 'EDUCATION':
          console.log('🎓 Running EDUCATION handler...');
          if (await handleEducationQuestion(question, pageData)) processed++;
          else skipped++;
          break;
          
        default:
          // This should never happen with our aggressive filtering
          console.log(`❌ UNEXPECTED: Question type ${question.questionType} made it through filtering`);
          skipped++;
      }
      
      // Small delay between questions
      await new Promise(r => setTimeout(r, 200));
      
    } catch (error) {
      console.error(`❌ Error processing question "${question.label}":`, error.message);
      skipped++;
    }
  }
  
  console.log(`\n🔥 VERSION 2.0 RESULTS:`);
  console.log(`✅ Successfully processed: ${processed} questions`);
  console.log(`⚠️ Failed to process: ${skipped} questions`);
  console.log(`🚫 Filtered out (no pattern match): ${filtered_out} questions`);
  console.log(`⚡ Processing efficiency: ${((processed / (processed + skipped)) * 100).toFixed(1)}% success rate`);
  console.log(`🎯 Overall efficiency: ${((processed / pageData.questions.length) * 100).toFixed(1)}% of all questions handled`);
  
  return processed;
}

/**
 * 🎯 SMART PROCESSOR - Use switch cases to handle different question types
 */
async function processScrapedElements(pageData) {
  console.log("🎯 OPTIMIZED PROCESSING: Using filtered switch cases for relevant question types...");
  
  let processed = 0;
  let skipped = 0;
  
  // Filter out only the question types we can actually handle to cut out unnecessary cases
  const handledTypes = new Set([
    'WORK_AUTHORIZATION', 'COMMUTE', 'EXPERIENCE', 'DATE_INPUT', 
    'SALARY', 'REASON_APPLYING', 'SKILLS', 'EDUCATION'
  ]);
  
  const relevantQuestions = pageData.questions.filter(q => 
    handledTypes.has(q.questionType) || q.questionType === 'GENERIC'
  );
  
  console.log(`� Processing ${relevantQuestions.length} relevant questions (skipping ${pageData.questions.length - relevantQuestions.length} irrelevant ones)`);
  
  // Process each relevant question using optimized switch cases
  for (const question of relevantQuestions) {
    console.log(`\n📝 Processing [Priority ${question.priority}]: "${question.label}"`);
    console.log(`🏷️ Type: ${question.questionType}`);
    
    try {
      // Optimized switch case - only handle types we know we need
      switch(question.questionType) {
        case 'WORK_AUTHORIZATION':
          if (await handleWorkAuthorization(question, pageData)) processed++;
          break;
          
        case 'COMMUTE':
          if (await handleCommuteQuestion(question, pageData)) processed++;
          break;
          
        case 'EXPERIENCE':
          if (await handleExperienceQuestion(question, pageData)) processed++;
          break;
          
        case 'DATE_INPUT':
          if (await handleDateInput(question, pageData)) processed++;
          break;
          
        case 'SALARY':
          if (await handleSalaryQuestion(question, pageData)) processed++;
          break;
          
        case 'REASON_APPLYING':
          if (await handleReasonApplying(question, pageData)) processed++;
          break;
          
        case 'SKILLS':
          if (await handleSkillsQuestion(question, pageData)) processed++;
          break;
          
        case 'EDUCATION':
          if (await handleEducationQuestion(question, pageData)) processed++;
          break;
          
        case 'GENERIC':
          if (await handleGenericQuestion(question, pageData)) processed++;
          break;
          
        default:
          console.log(`⏭️ Skipping unsupported question type: ${question.questionType}`);
          skipped++;
      }
      
      // Small delay between questions
      await new Promise(r => setTimeout(r, 200));
      
    } catch (error) {
      console.error(`❌ Error processing question "${question.label}":`, error.message);
      skipped++;
    }
  }
  
  console.log(`✅ Successfully processed ${processed} questions, skipped ${skipped} questions`);
  console.log(`⚡ Algorithm efficiency: ${((processed / (processed + skipped)) * 100).toFixed(1)}% success rate`);
  
  return processed;
}

/**
 * � VERSION 2.0 - SMART QUESTION CLASSIFIER with question starters and generic patterns
 * Uses question beginnings to match patterns regardless of specific details
 */
function classifyQuestionType(label) {
  const text = label.toLowerCase().trim();
  
  // 🔥 QUESTION STARTER PATTERNS - Match beginnings regardless of specifics
  
  // Work authorization - matches any country
  if (text.startsWith('are you authorized to work') || 
      text.startsWith('do you have authorization to work') ||
      text.startsWith('are you legally authorized') ||
      text.includes('visa') || text.includes('sponsorship') || text.includes('work permit')) {
    return 'WORK_AUTHORIZATION';
  }
  
  // Commute questions - matches any location/distance
  if (text.startsWith('will you be able to reliably commute') ||
      text.startsWith('are you able to commute') ||
      text.startsWith('can you reliably commute') ||
      text.startsWith('are you willing to commute') ||
      text.startsWith('do you have reliable transportation')) {
    return 'COMMUTE';
  }
  
  // Generic "How many years" questions - matches any topic after "years"
  if (text.startsWith('how many years') || 
      text.startsWith('how many total years') ||
      (text.includes('years') && text.includes('experience'))) {
    return 'EXPERIENCE';
  }
  
  // Availability/start date questions
  if (text.startsWith('when are you available') ||
      text.startsWith('when can you start') ||
      text.startsWith('what is your availability') ||
      text.includes('available to start') ||
      text.includes('start date')) {
    return 'DATE_INPUT';
  }
  
  // Salary/compensation questions
  if (text.startsWith('what is your desired salary') ||
      text.startsWith('what are your salary expectations') ||
      text.startsWith('what is your expected salary') ||
      text.includes('compensation') || text.includes('pay rate')) {
    return 'SALARY';
  }
  
  // Reason for applying questions
  if (text.startsWith('why are you interested') ||
      text.startsWith('why do you want') ||
      text.startsWith('what interests you') ||
      text.includes('reason for applying') ||
      text.includes('cover letter')) {
    return 'REASON_APPLYING';
  }
  
  // Education questions
  if (text.startsWith('what is your highest level') ||
      text.startsWith('what is your education') ||
      text.startsWith('do you have a') && (text.includes('degree') || text.includes('diploma'))) {
    return 'EDUCATION';
  }
  
  // 🚫 AGGRESSIVE FILTERING - If it doesn't match our patterns, skip it
  return 'UNKNOWN';
}

/**
 * 🎯 PRIORITY SYSTEM - Assign priority scores to question types for optimal processing order
 */
function getQuestionPriority(questionType) {
  const priorities = {
    'WORK_AUTHORIZATION': 10, // Highest priority - often required
    'COMMUTE': 9,            // High priority - location-based
    'EXPERIENCE': 7,         // Medium-high priority
    'DATE_INPUT': 6,         // Medium priority
    'SKILLS': 5,             // Medium priority
    'EDUCATION': 4,          // Medium-low priority
    'SALARY': 3,             // Low priority
    'REASON_APPLYING': 2,    // Low priority
    'GENERIC': 1             // Lowest priority
  };
  
  return priorities[questionType] || 1;
}

/**
 * 🏷️ LEGACY CLASSIFIER - Keep for backward compatibility
 */
function classifyQuestion(label) {
  return classifyQuestionType(label);
}

/**
 * 🎯 QUESTION HANDLERS - Switch case handlers for each question type
 */
async function handleWorkAuthorization(question, pageData) {
  console.log("🏢 Handling work authorization question...");
  
  // Find radio buttons for this question and select "Yes"
  const radioGroup = Object.values(pageData.radioGroups).find(group => 
    group.label === question.label
  );
  
  if (radioGroup) {
    const yesOption = radioGroup.options.find(opt => 
      opt.element.value.toLowerCase() === 'yes' || 
      opt.element.value === '1' ||
      opt.element.nextElementSibling?.textContent?.toLowerCase().includes('yes')
    );
    
    if (yesOption) {
      await clickRadioButton(yesOption.element);
      console.log("✅ Selected YES for work authorization");
      return true;
    }
  }
  
  console.log("⚠️ Could not find work authorization radio buttons");
  return false;
}

async function handleCommuteQuestion(question, pageData) {
  console.log("🚗 Handling commute question...");
  
  const radioGroup = Object.values(pageData.radioGroups).find(group => 
    group.label === question.label
  );
  
  if (radioGroup) {
    const yesOption = radioGroup.options.find(opt => 
      opt.element.value.toLowerCase() === 'yes' || 
      opt.element.value === '1' ||
      opt.element.nextElementSibling?.textContent?.toLowerCase().includes('yes')
    );
    
    if (yesOption) {
      await clickRadioButton(yesOption.element);
      console.log("✅ Selected YES for commute question");
      return true;
    }
  }
  
  console.log("⚠️ Could not find commute radio buttons");
  return false;
}

async function handleExperienceQuestion(question, pageData) {
  console.log("💼 Handling experience question...");
  
  // Handle number inputs for years of experience
  const textInput = pageData.textInputs.find(input => 
    input.label === question.label && (input.type === 'number' || input.type === 'text')
  );
  
  if (textInput) {
    const experienceValue = getExperienceValue(question.label);
    textInput.element.value = experienceValue;
    textInput.element.dispatchEvent(new Event('input', { bubbles: true }));
    textInput.element.dispatchEvent(new Event('change', { bubbles: true }));
    console.log(`✅ Filled experience: ${experienceValue} years`);
    return true;
  }
  
  console.log("⚠️ Could not find experience input field");
  return false;
}

async function handleDateInput(question, pageData) {
  console.log("📅 Handling date input question...");
  
  // Look for date inputs in multiple ways
  const dateInput = pageData.dateInputs.find(input => 
    input.label === question.label
  ) || pageData.textInputs.find(input => 
    input.label === question.label && (
      input.placeholder?.includes('date') || 
      input.placeholder?.includes('MM/DD/YYYY')
    )
  );
  
  if (dateInput) {
    const dateValue = getSmartDateValue(question.label, dateInput.type);
    dateInput.element.value = dateValue;
    dateInput.element.dispatchEvent(new Event('input', { bubbles: true }));
    dateInput.element.dispatchEvent(new Event('change', { bubbles: true }));
    console.log(`✅ Filled date: ${dateValue}`);
    return true;
  }
  
  console.log("⚠️ Could not find date input field");
  return false;
}
async function handleSalaryQuestion(question, pageData) {
  console.log("💰 Handling salary question...");
  
  const textInput = pageData.textInputs.find(input => input.label === question.label);
  if (textInput) {
    const salaryValue = getSalaryValue(question.label);
    textInput.element.value = salaryValue;
    textInput.element.dispatchEvent(new Event('input', { bubbles: true }));
    textInput.element.dispatchEvent(new Event('change', { bubbles: true }));
    console.log(`✅ Filled salary: ${salaryValue}`);
    return true;
  }
  
  console.log("⚠️ Could not find salary input field");
  return false;
}

async function handleReasonApplying(question, pageData) {
  console.log("📝 Handling reason for applying...");
  
  const textarea = pageData.textareas.find(ta => ta.label === question.label);
  if (textarea) {
    const reasonText = getReasonText(question.label);
    textarea.element.value = reasonText;
    textarea.element.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.element.dispatchEvent(new Event('change', { bubbles: true }));
    console.log("✅ Filled reason for applying");
    return true;
  }
  
  console.log("⚠️ Could not find reason textarea");
  return false;
}

async function handleSkillsQuestion(question, pageData) {
  console.log("🛠️ Handling skills question...");
  
  const textarea = pageData.textareas.find(ta => ta.label === question.label) ||
                   pageData.textInputs.find(input => input.label === question.label);
  
  if (textarea) {
    const skillsText = getSkillsText(question.label);
    textarea.element.value = skillsText;
    textarea.element.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.element.dispatchEvent(new Event('change', { bubbles: true }));
    console.log("✅ Filled skills information");
    return true;
  }
  
  console.log("⚠️ Could not find skills input field");
  return false;
}

async function handleEducationQuestion(question, pageData) {
  try {
    if (!isExtensionContextValid()) {
      console.log("❌ Extension context invalid - skipping education question");
      return false;
    }
    
    console.log("🎓 Handling education question...");
    
    // Handle selects for degree levels
    const selectInput = pageData.selects.find(select => select.label === question.label);
    if (selectInput && selectInput.element) {
      try {
        const educationValue = getEducationValue(question.label);
        selectInput.element.value = educationValue;
        selectInput.element.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`✅ Selected education: ${educationValue}`);
        return true;
      } catch (selectError) {
        console.error("❌ Error with education select:", selectError.message);
      }
    }
    
    // Handle text inputs for school names, etc.
    const textInput = pageData.textInputs.find(input => input.label === question.label);
    if (textInput && textInput.element) {
      try {
        const educationText = getEducationText(question.label);
        textInput.element.value = educationText;
        textInput.element.dispatchEvent(new Event('input', { bubbles: true }));
        textInput.element.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`✅ Filled education: ${educationText}`);
        return true;
      } catch (inputError) {
        console.error("❌ Error with education text input:", inputError.message);
      }
    }
    
    console.log("⚠️ Could not find education input field");
    return false;
  } catch (error) {
    console.error("❌ Error in handleEducationQuestion:", error.message);
    return false;
  }
}

async function handleGenericQuestion(question, pageData) {
  try {
    if (!isExtensionContextValid()) {
      console.log("❌ Extension context invalid - skipping generic question");
      return false;
    }
    
    console.log("❓ Handling generic question...");
    
    // Try radio buttons first
    const radioGroup = Object.values(pageData.radioGroups).find(group => 
      group.label === question.label
    );
    
    if (radioGroup && radioGroup.options.length > 0) {
      try {
        // Try to select a reasonable option (Yes > first option)
        const yesOption = radioGroup.options.find(opt => 
          opt.element && (opt.element.value.toLowerCase() === 'yes' || 
          opt.element.value === '1')
        ) || radioGroup.options[0];
        
        if (yesOption && yesOption.element) {
          await clickRadioButton(yesOption.element);
          console.log("✅ Selected option for generic question");
          return true;
        }
      } catch (radioError) {
        console.error("❌ Error with generic radio button:", radioError.message);
      }
    }
    
    // Try text inputs
    const textInput = pageData.textInputs.find(input => input.label === question.label);
    if (textInput && textInput.element) {
      try {
        textInput.element.value = 'N/A';
        textInput.element.dispatchEvent(new Event('input', { bubbles: true }));
        console.log("✅ Filled generic text input");
        return true;
      } catch (inputError) {
        console.error("❌ Error with generic text input:", inputError.message);
      }
    }
    
    console.log("⚠️ Could not handle generic question");
    return false;
  } catch (error) {
    console.error("❌ Error in handleGenericQuestion:", error.message);
    return false;
  }
}



/**
 * Fill individual question based on its type and content
 */
/**
 * Wait for element within a container
 */
function waitForElementInContainer(container, selector, timeout = 3000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    function checkForElement() {
      const element = container.querySelector(selector);
      if (element) {
        resolve(element);
      } else if (Date.now() - startTime > timeout) {
        resolve(null);
      } else {
        setTimeout(checkForElement, 50);
      }
    }
    
    checkForElement();
  });
}

async function fillQuestionByType(container, labelText) {
  console.log(`🔍 Analyzing question container for: "${labelText}"`);
  
  // 🧠 FIRST: Check learned patterns before processing normally
  if (window.questionLearningSystem) {
    const learnedAnswer = await window.questionLearningSystem.checkLearnedPatterns(labelText, container);
    if (learnedAnswer) {
      console.log(`✅ Found learned answer for: "${labelText}" -> "${learnedAnswer}"`);
      return; // Pattern matched and filled, we're done
    }
  }
  
  // 1. NUMBER INPUTS (years of experience, age, etc.) - Check first since they're also text inputs
  console.log("⏳ Waiting for number input...");
  const numberInput = await waitForElementInContainer(container, 'input[type="number"], input[inputmode="numeric"], input[inputmode="text"][min], input[id*="number-input"], input[data-testid*="input"][min]');
  if (numberInput) {
    console.log(`📝 Found number input for: "${labelText}", current value: "${numberInput.value}"`);
    if (!numberInput.value) {
      const value = await getNumberInputValue(labelText);
      if (value) {
        await fillInputSafely(numberInput, value, labelText);
        return;
      }
    } else {
      console.log(`⚠️ Number input already has value: "${numberInput.value}"`);
      return;
    }
  }

  // 2. TEXT INPUTS (address, city, state, zip, etc.)
  console.log("⏳ Waiting for text input...");
  const textInput = await waitForElementInContainer(container, 'input[type="text"], input:not([type]), input[data-testid*="input"]:not([min])');
  if (textInput) {
    console.log(`📝 Found text input for: "${labelText}", current value: "${textInput.value}"`);
    if (!textInput.value) {
      const value = await getTextInputValue(labelText);
      if (value) {
        await fillInputSafely(textInput, value, labelText);
        return;
      }
    } else {
      console.log(`⚠️ Text input already has value: "${textInput.value}"`);
      return;
    }
  }
  
  // 3. TEXTAREA (visa questions, cover letter text, etc.)
  console.log("⏳ Waiting for textarea...");
  const textarea = await waitForElementInContainer(container, 'textarea, input[id*="rich-text-question"]');
  if (textarea) {
    console.log(`📝 Found textarea for: "${labelText}", current value: "${textarea.value}"`);
    if (!textarea.value) {
      const value = await getTextareaValue(labelText);
      if (value) {
        await fillInputSafely(textarea, value, labelText);
        return;
      }
    } else {
      console.log(`⚠️ Textarea already has value: "${textarea.value}"`);
      return;
    }
  }
  
  // 4. SELECT DROPDOWNS (country, state, etc.)
  console.log("⏳ Waiting for select dropdown...");
  const select = await waitForElementInContainer(container, 'select');
  if (select) {
    console.log(`📝 Found select dropdown for: "${labelText}", current value: "${select.value}"`);
    if (!select.value || select.value === '') {
      const value = getSelectValue(labelText, select);
      if (value) {
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`✅ Selected "${value}" for ${labelText}`);
        return;
      }
    } else {
      console.log(`⚠️ Select already has value: "${select.value}"`);
      return;
    }
  }
  
  // 5. RADIO BUTTONS (including single-select questions)
  console.log("⏳ Waiting for radio buttons...");
  await new Promise(r => setTimeout(r, 200)); // Small delay for radio buttons to render
  const radioButtons = container.querySelectorAll('input[type="radio"], input[id*="single-select-question"]');
  if (radioButtons.length > 0) {
    console.log(`📝 Found ${radioButtons.length} radio buttons for: "${labelText}"`);
    // Check if any radio is already selected
    const alreadySelected = Array.from(radioButtons).find(radio => radio.checked);
    if (!alreadySelected) {
      const selectedValue = getRadioValue(labelText, radioButtons);
      if (selectedValue) {
        selectedValue.checked = true;
        selectedValue.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`✅ Selected radio option for ${labelText}`);
        return;
      }
    } else {
      console.log(`⚠️ Radio button already selected for: "${labelText}"`);
      return;
    }
  }
  
  // 6. CHECKBOXES
  console.log("⏳ Waiting for checkboxes...");
  await new Promise(r => setTimeout(r, 200)); // Small delay for checkboxes to render
  const checkboxes = container.querySelectorAll('input[type="checkbox"]');
  if (checkboxes.length > 0) {
    const shouldCheck = getCheckboxValue(labelText);
    checkboxes.forEach(checkbox => {
      if (shouldCheck) {
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    if (shouldCheck) {
      console.log(`✅ Checked boxes for ${labelText}`);
      return;
    }
  }
  
  // 7. DATE INPUTS
  console.log("⏳ Waiting for date inputs...");
  const dateInput = await waitForElementInContainer(container, 'input[placeholder*="MM/DD/YYYY"], input[type="date"]');
  if (dateInput && !dateInput.value) {
    const dateValue = getDateValue(labelText);
    if (dateValue) {
      await fillInputSafely(dateInput, dateValue, labelText);
      return;
    }
  }
  
  // 8. FILE UPLOADS (skip for now - can't automate file uploads without user interaction)
  const fileInput = container.querySelector('input[type="file"]');
  if (fileInput) {
    console.log(`⚠️ Skipping file upload for: ${labelText} (requires user interaction)`);
    return;
  }
  
  // Log what elements we found for debugging
  const allInputs = container.querySelectorAll('input, textarea, select');
  console.log(`⚠️ Unknown question type for: "${labelText}"`);
  console.log(`🔍 Found ${allInputs.length} input elements:`, Array.from(allInputs).map(el => `${el.tagName}[type="${el.type}"]`));
  
  // 🧠 LEARNING SYSTEM - Watch for manual user input and learn from it
  if (window.questionLearningSystem) {
    window.questionLearningSystem.startWatching(container, labelText, allInputs);
  }
}

/**
 * Safely fill input with proper event handling
 */
async function fillInputSafely(input, value, labelText) {
  try {
    // Wait for element to be ready
    if (!input.offsetParent && input.style.display === 'none') {
      console.log(`⚠️ Input not visible for: ${labelText}`);
      return false;
    }
    
    // Focus, fill, and trigger events
    input.focus();
    input.value = value;
    
    // Trigger all relevant events
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    
    console.log(`✅ Filled "${value}" for ${labelText}`);
    return true;
  } catch (error) {
    console.error(`❌ Error filling input for ${labelText}:`, error.message);
    return false;
  }
}

/**
 * Get appropriate value for text inputs based on label
 */
async function getTextInputValue(labelText) {
  try {
    const config = await loadQuestionsConfig();
    
    // Find matching pattern from JSON configuration
    const matchedPattern = findPatternMatch(config.textInputPatterns || [], labelText);
    if (matchedPattern) {
      return matchedPattern.value;
    }
    
    // Fallback to default value
    return config.defaultValues?.textInput || 'Available upon request';
  } catch (error) {
    console.error('❌ Error getting text input value from config:', error);
    // Fallback to hardcoded default
    return 'Available upon request';
  }
}

/**
 * Get appropriate value for textarea based on label
 */
async function getTextareaValue(labelText) {
  try {
    const config = await loadQuestionsConfig();
    
    // Find matching pattern from JSON configuration
    const matchedPattern = findPatternMatch(config.textareaPatterns || [], labelText);
    if (matchedPattern) {
      return matchedPattern.value;
    }
    
    // Fallback to default value
    return config.defaultValues?.textarea || 'I am interested in this position and believe I would be a valuable addition to your team.';
  } catch (error) {
    console.error('❌ Error getting textarea value from config:', error);
    // Fallback to hardcoded default
    return 'I am highly motivated and believe I would be a valuable addition to your team. I look forward to the opportunity to contribute to your organization.';
  }
}

/**
 * Get appropriate value for number inputs (years of experience, etc.)
 */
async function getNumberInputValue(labelText) {
  try {
    const config = await loadQuestionsConfig();
    
    // Find matching pattern from JSON configuration
    // For number patterns, we need special handling for experience questions with exclusions
    const text = labelText.toLowerCase();
    
    // Find the most specific match (pattern with most matching keywords)
    let bestMatch = null;
    let maxMatches = 0;
    
    for (const pattern of config.numberInputPatterns || []) {
      const matchedKeywords = pattern.keywords.filter(keyword => 
        text.includes(keyword.toLowerCase())
      );
      
      // Special handling for Java vs JavaScript
      if (pattern.keywords.includes('java') && !pattern.keywords.includes('javascript') && text.includes('javascript')) {
        continue; // Skip Java pattern if text contains JavaScript
      }
      
      if (matchedKeywords.length === pattern.keywords.length && matchedKeywords.length > maxMatches) {
        maxMatches = matchedKeywords.length;
        bestMatch = pattern;
      }
    }
    
    if (bestMatch) {
      console.log(`🔢 Found number pattern match: ${bestMatch.keywords.join(', ')} -> "${bestMatch.value}"`);
      return bestMatch.value;
    }
    
    // Fallback to default value
    return config.defaultValues?.numberInput || '1';
  } catch (error) {
    console.error('❌ Error getting number input value from config:', error);
    // Fallback to hardcoded default
    return '1';
  }
}

/**
 * Get appropriate radio button selection based on label text
 */
function getRadioValue(labelText, radioButtons) {
  const text = labelText.toLowerCase();
  
  // Work authorization / visa questions - specifically about sponsorship needs
  if (text.includes('visa') || text.includes('sponsorship') || text.includes('h-1b') || text.includes('opt') || 
      (text.includes('work authorization') && text.includes('sponsor'))) {
    // For visa/sponsorship questions, usually answer "No" (don't need sponsorship)
    const noOption = Array.from(radioButtons).find(radio => 
      radio.value === '2' || radio.value.toLowerCase() === 'no' || 
      radio.nextElementSibling?.textContent?.toLowerCase().includes('no')
    );
    return noOption || radioButtons[1]; // Default to second option if "No" not found
  }
  
  // Location/commute questions
  if (text.includes('able to') || text.includes('report for') || text.includes('work in') || text.includes('commute') || 
      text.includes('relocate') || text.includes('travel') || text.includes('on-site') || text.includes('in-person') ||
      text.includes('reliably commute') || text.includes('commute to')) {
    // For work location questions, usually answer "Yes"
    const yesOption = Array.from(radioButtons).find(radio => 
      radio.value === '1' || radio.value.toLowerCase() === 'yes' || 
      radio.nextElementSibling?.textContent?.toLowerCase().includes('yes')
    );
    return yesOption || radioButtons[0]; // Default to first option if "Yes" not found
  }

  if(text.includes("Will you be able to reliably commute")){
    const yesOption = Array.from(radioButtons).find(radio => 
      radio.value === '1' || radio.value.toLowerCase() === 'yes' || 
      radio.nextElementSibling?.textContent?.toLowerCase().includes('yes')
    );
    return yesOption || radioButtons[0];
  }
  if(text.includes("Are you authorized to work in the?")){
    const yesOption = Array.from(radioButtons).find(radio => 
      radio.value === '1' || radio.value.toLowerCase() === 'yes' || 
      radio.nextElementSibling?.textContent?.toLowerCase().includes('yes')
    );
    return yesOption || radioButtons[0];
  }
  
  // Age/eligibility questions - including employment eligibility
  if (text.includes('18') || text.includes('age') || text.includes('eligible') || text.includes('legally authorized') ||
      text.includes('employment eligibility') || text.includes('authorized to work')) {
    // For age/eligibility questions, usually answer "Yes"
    const yesOption = Array.from(radioButtons).find(radio => 
      radio.value === '1' || radio.value.toLowerCase() === 'yes' || 
      radio.nextElementSibling?.textContent?.toLowerCase().includes('yes')
    );
    return yesOption || radioButtons[0];
  }
  
  // Background check / drug test questions
  if (text.includes('background') || text.includes('drug') || text.includes('test') || text.includes('screening') || text.includes('criminal')) {
    // For background/drug test questions, usually answer "Yes" (willing to comply)
    const yesOption = Array.from(radioButtons).find(radio => 
      radio.value.toLowerCase() === 'yes' || 
      radio.nextElementSibling?.textContent?.toLowerCase().includes('yes')
    );
    return yesOption || radioButtons[0];
  }
  
  // Schedule/availability questions
  if (text.includes('available') || text.includes('start') || text.includes('schedule') || text.includes('shift') || 
      text.includes('weekend') || text.includes('overtime') || text.includes('flexible')) {
    // For availability questions, usually answer "Yes"
    const yesOption = Array.from(radioButtons).find(radio => 
      radio.value.toLowerCase() === 'yes' || 
      radio.nextElementSibling?.textContent?.toLowerCase().includes('yes')
    );
    return yesOption || radioButtons[0];
  }
  
  // Experience/qualification questions
  if (text.includes('experience') || text.includes('years') || text.includes('qualification') || text.includes('skill')) {
    // For experience questions, usually answer "Yes" 
    const yesOption = Array.from(radioButtons).find(radio => 
      radio.value.toLowerCase() === 'yes' || 
      radio.nextElementSibling?.textContent?.toLowerCase().includes('yes')
    );
    return yesOption || radioButtons[0];
  }
  
  // Driver's license questions
  if (text.includes('license') || text.includes('driver') || text.includes('driving') || text.includes('vehicle')) {
    // For license questions, usually answer "Yes"
    const yesOption = Array.from(radioButtons).find(radio => 
      radio.value.toLowerCase() === 'yes' || 
      radio.nextElementSibling?.textContent?.toLowerCase().includes('yes')
    );
    return yesOption || radioButtons[0];
  }
  
  // Education questions
  if (text.includes('degree') || text.includes('diploma') || text.includes('education') || text.includes('graduate')) {
    // For education questions, usually answer "Yes"
    const yesOption = Array.from(radioButtons).find(radio => 
      radio.value.toLowerCase() === 'yes' || 
      radio.nextElementSibling?.textContent?.toLowerCase().includes('yes')
    );
    return yesOption || radioButtons[0];
  }
  
  // Default to first option (usually "Yes")
  return radioButtons[0];
}

/**
 * Get appropriate value for select dropdowns
 */
function getSelectValue(labelText, selectElement) {
  const text = labelText.toLowerCase();
  const options = Array.from(selectElement.options);
  
  if (text.includes('country')) {
    // Find "United States" option
    const usOption = options.find(opt => 
      opt.textContent.toLowerCase().includes('united states') || 
      opt.value === '1'
    );
    return usOption ? usOption.value : options[1]?.value;
  }
  
  if (text.includes('state') || text.includes('province')) {
    // Find Texas or first reasonable state
    const txOption = options.find(opt => 
      opt.textContent.toLowerCase().includes('texas') ||
      opt.textContent.toLowerCase().includes('tx')
    );
    return txOption ? txOption.value : options[1]?.value;
  }
  
  // Default to first non-empty option
  return options.find(opt => opt.value && opt.value !== '')?.value || options[1]?.value;
}

/**
 * Determine if checkboxes should be checked
 */
function getCheckboxValue(labelText) {
  const text = labelText.toLowerCase();
  
  // Generally check boxes for agreements, terms, etc.
  if (text.includes('agree') || text.includes('terms') || text.includes('conditions') || 
      text.includes('policy') || text.includes('consent') || text.includes('authorize') ||
      text.includes('acknowledge') || text.includes('accept') || text.includes('confirm')) {
    return true;
  }
  
  // Marketing and communication preferences
  if (text.includes('marketing') || text.includes('newsletter') || text.includes('promotional') ||
      text.includes('updates') || text.includes('communications')) {
    return false; // Usually don't want marketing emails
  }
  
  // Opt-out statements - don't check these
  if (text.includes('opt out') || text.includes('do not') || text.includes("don't want") || 
      text.includes('unsubscribe') || text.includes('decline')) {
    return false;
  }
  
  // Work preferences - usually check these
  if (text.includes('available') || text.includes('willing') || text.includes('able to') ||
      text.includes('interested in') || text.includes('open to')) {
    return true;
  }
  
  // Background check and screening - check these
  if (text.includes('background check') || text.includes('drug test') || text.includes('screening') ||
      text.includes('verification') || text.includes('reference check')) {
    return true;
  }
  
  // Legal authorization - check these
  if (text.includes('authorized to work') || text.includes('legal right') || text.includes('eligible') ||
      text.includes('18 years') || text.includes('age requirement')) {
    return true;
  }
  
  // Don't check boxes for negative statements
  if (text.includes("don't") || text.includes('not interested') || text.includes('no thanks')) {
    return false;
  }
  
  // Default to checking boxes (most are agreements or confirmations)
  return true;
}

/**
 * Get appropriate date value
 */
/**
 * 📅 ENHANCED DATE HANDLER - Generate appropriate dates based on context
 */
function getSmartDateValue(labelText, inputType = 'text') {
  const text = labelText.toLowerCase();
  const today = new Date();
  
  // Start date / Available date - typically 1-2 weeks from now for job applications
  if (text.includes('available') || text.includes('start') || text.includes('when can you start')) {
    const startDate = new Date(today);
    startDate.setDate(today.getDate() + 10); // 10 days from now (business-friendly)
    return formatDateForInput(startDate, inputType);
  }
  
  // Birth date - reasonable default for job applications
  if (text.includes('birth') || text.includes('dob') || text.includes('date of birth')) {
    const birthDate = new Date(1990, 0, 15); // January 15, 1990 (32+ years old)
    return formatDateForInput(birthDate, inputType);
  }
  
  // Education dates (graduation, etc.)
  if (text.includes('graduation') || text.includes('completed') || text.includes('finished')) {
    const gradDate = new Date(2020, 4, 15); // May 15, 2020
    return formatDateForInput(gradDate, inputType);
  }
  
  // Employment history dates
  if (text.includes('employment') || text.includes('worked') || text.includes('job')) {
    if (text.includes('start') || text.includes('began')) {
      const startDate = new Date(2021, 0, 1); // January 1, 2021
      return formatDateForInput(startDate, inputType);
    }
    if (text.includes('end') || text.includes('left') || text.includes('finish')) {
      const endDate = new Date(2023, 11, 31); // December 31, 2023
      return formatDateForInput(endDate, inputType);
    }
  }
  
  // Default to today's date
  return formatDateForInput(today, inputType);
}

/**
 * 🔧 DATE FORMATTER - Format date appropriately for different input types
 */
function formatDateForInput(date, inputType) {
  switch(inputType) {
    case 'date':
      // HTML5 date inputs expect YYYY-MM-DD format
      return date.toISOString().split('T')[0];
      
    case 'text':
    default:
      // Text inputs typically expect MM/DD/YYYY format in US
      return date.toLocaleDateString('en-US', { 
        month: '2-digit', 
        day: '2-digit', 
        year: 'numeric' 
      });
  }
}

// Legacy function for backward compatibility
function getDateValue(labelText) {
  return getSmartDateValue(labelText, 'text');
}

/**
 * 🎯 SMART VALUE GENERATORS - Generate appropriate responses based on question context
 */
function getExperienceValue(labelText) {
  const text = labelText.toLowerCase();
  
  // Extract any specific technology or skill mentioned
  if (text.includes('specific') || text.includes('relevant')) {
    return '2'; // Conservative for specific experience
  }
  if (text.includes('total') || text.includes('overall')) {
    return '5'; // More generous for total experience
  }
  
  return '3'; // Default safe value
}

function getSalaryValue(labelText) {
  const text = labelText.toLowerCase();
  
  if (text.includes('expected') || text.includes('desired')) {
    return 'Competitive salary based on market rates';
  }
  if (text.includes('minimum') || text.includes('lowest')) {
    return 'Open to discussion';
  }
  if (text.includes('range')) {
    return '$50,000 - $80,000';
  }
  
  return 'Competitive';
}

function getReasonText(labelText) {
  const reasons = [
    'I am excited about this opportunity and believe my skills align well with the role requirements.',
    'This position matches my career goals and I am eager to contribute to your team.',
    'I am passionate about the work you do and would love to be part of your organization.',
    'My background and experience make me a strong candidate for this role.'
  ];
  
  // Return a random reason to appear more natural
  return reasons[Math.floor(Math.random() * reasons.length)];
}

function getSkillsText(labelText) {
  const text = labelText.toLowerCase();
  
  if (text.includes('technical') || text.includes('programming')) {
    return 'JavaScript, Python, HTML/CSS, React, Node.js, SQL, Git';
  }
  if (text.includes('soft') || text.includes('communication')) {
    return 'Strong communication, teamwork, problem-solving, and project management skills';
  }
  if (text.includes('relevant')) {
    return 'Relevant skills and experience as detailed in my resume';
  }
  
  return 'Please see resume for detailed skills and qualifications';
}

function getEducationValue(labelText) {
  const text = labelText.toLowerCase();
  
  if (text.includes('level') || text.includes('degree')) {
    return "Bachelor's degree"; // Most common requirement
  }
  if (text.includes('field') || text.includes('major')) {
    return 'Computer Science';
  }
  
  return "Bachelor's";
}

function getEducationText(labelText) {
  const text = labelText.toLowerCase();
  
  if (text.includes('school') || text.includes('university')) {
    return 'State University';
  }
  if (text.includes('gpa')) {
    return '3.5';
  }
  if (text.includes('year') && text.includes('graduation')) {
    return '2020';
  }
  
  return 'As listed on resume';
}

/**
 * 🔧 ENHANCED RADIO BUTTON CLICKER - Better radio button interaction
 */
async function clickRadioButton(radioElement) {
  try {
    // Focus the element first
    radioElement.focus();
    await new Promise(r => setTimeout(r, 100));
    
    // Set checked property
    radioElement.checked = true;
    
    // Click the element
    radioElement.click();
    
    // Dispatch events to ensure proper handling
    radioElement.dispatchEvent(new Event('change', { bubbles: true }));
    radioElement.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Small delay to let changes register
    await new Promise(r => setTimeout(r, 200));
    
    return true;
    
  } catch (error) {
    console.error('Error clicking radio button:', error.message);
    return false;
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🚀 DYNAMIC APPLICATION WORKFLOW SYSTEM
 * ═══════════════════════════════════════════════════════════════════════════
 * Handles unlimited question pages and workflows automatically
 */

/**
 * Main dynamic workflow that handles unlimited question pages
 */
async function runDynamicApplicationWorkflow() {
  console.log("🚀 Starting enhanced dynamic application workflow...");
  
  // Initialize tracking
  window.pageLoadTime = Date.now();
  window.formInteractionCount = 0;
  
  try {
    // Step 1: Click Apply button if not already on form
    if (!window.location.href.includes('smartapply.indeed.com')) {
      console.log("📍 Step 1: Navigating to application form");
      await clickApplyButton();
    } else {
      console.log("✅ Already on application form");
    }
    
    // Step 2: Run the unlimited workflow loop with detailed tracking
    console.log("📍 Step 2: Processing application forms");
    const workflowResult = await runUnlimitedWorkflowLoop();
    
    // Step 3: Comprehensive success verification
    console.log("📍 Step 3: Verifying application submission");
    const successResult = await checkApplicationSuccess();
    
    // Step 4: Generate detailed result
    const interactionCount = window.formInteractionCount || 0;
    console.log(`📊 Application Summary:`);
    console.log(`   • Form interactions: ${interactionCount}`);
    console.log(`   • Workflow completed: ${workflowResult.completed}`);
    console.log(`   • Success confidence: ${successResult ? 'HIGH' : 'LOW'}`);
    
    // Determine result based on multiple factors
    if (successResult && interactionCount > 0) {
      return "pass"; // High confidence success with form interactions
    } else if (successResult && interactionCount === 0) {
      return "pass_no_forms_needed"; // Success but no forms to fill
    } else if (!successResult && interactionCount > 0) {
      return "fail_forms_filled_no_confirmation"; // Filled forms but no success confirmation
    } else if (!successResult && interactionCount === 0) {
      return "fail_no_forms_no_confirmation"; // No forms filled and no success
    } else {
      return "fail_unknown_state"; // Unclear state
    }
    
  } catch (error) {
    console.error("❌ Dynamic workflow failed:", error);
    const interactionCount = window.formInteractionCount || 0;
    
    if (interactionCount > 0) {
      return "fail_exception_after_forms"; // Had interactions before failing
    } else {
      return "fail_exception_before_forms"; // Failed before any interactions
    }
  }
}

/**
 * Click the Apply button on job posting page
 */
async function clickApplyButton() {
  console.log("🖱️ STEP 1: Finding and clicking Apply button");
  
  await new Promise(r => setTimeout(r, 3000));
  
  const easyApplySelectors = [
    '#indeedApplyButton',
    'button[data-testid="indeedApplyButton-test"]', 
    'button[aria-label*="Apply now"]',
    'button.css-jiauqs',
    '.ia-IndeedApplyButton button',
    'button:has(.jobsearch-IndeedApplyButton-newDesign)',
    'button[title=""][aria-label*="Apply"]'
  ];
  
  let applyBtn = await waitForAnyElement(easyApplySelectors, 10000);
  if (!applyBtn) {
    applyBtn = await waitForElementByText(['apply now', 'easily apply', 'apply anyway'], 5000);
  }

  if (!applyBtn) {
    const isAlreadyOnForm = document.querySelector('#mosaic-contactInfoModule') ||
                           document.querySelector('[data-testid="profile-location-page"]') ||
                           window.location.href.includes('smartapply.indeed.com');
    
    if (isAlreadyOnForm) {
      console.log("✅ Already on application form (direct redirect)");
      return;
    } else {
      throw new Error("No apply button found");
    }
  }

  // Validate and click the apply button
  if (applyBtn.tagName !== 'BUTTON') {
    const buttonInside = applyBtn.querySelector('button');
    if (buttonInside) {
      applyBtn = buttonInside;
    } else {
      throw new Error("Found element is not clickable button");
    }
  }

  if (!applyBtn.offsetParent || applyBtn.disabled) {
    throw new Error("Button found but not clickable");
  }

  console.log("🖱️ Clicking apply button...");
  applyBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await new Promise(r => setTimeout(r, 500));
  applyBtn.click();
  
  // Wait for form to load
  await new Promise(r => setTimeout(r, 3000));
  
  const isApplicationPage = window.location.href.includes('smartapply.indeed.com') ||
                           window.location.href.includes('form/profile') ||
                           document.querySelector('#mosaic-contactInfoModule') ||
                           document.querySelector('[data-testid="profile-location-page"]') ||
                           document.querySelector('form');
  
  if (!isApplicationPage) {
    throw new Error("Apply button clicked but no form appeared");
  }
  
  console.log("✅ STEP 1 SUCCESS: Apply button clicked, form loaded");
}

/**
 * The unlimited workflow loop that handles any number of pages
 */
async function runUnlimitedWorkflowLoop() {
  // CRITICAL: Check if automation should run before starting
  if (!shouldRunAutomation()) {
    console.log("🛑 Automation blocked - not on valid Indeed page");
    return { success: false, reason: "Not on valid Indeed page" };
  }
  
  console.log("🔄 Starting unlimited workflow loop...");
  
  let pageCount = 0;
  let maxPages = 20; // Safety limit to prevent infinite loops
  let consecutiveFailures = 0;
  
  while (pageCount < maxPages && consecutiveFailures < 3) {
    // Check for emergency stop
    if (window.emergencyStopFlag) {
      console.log("🚨 Emergency stop detected - halting workflow");
      return { success: false, reason: "Emergency stop triggered" };
    }
    
    // Check if we should still be running automation
    if (!shouldRunAutomation()) {
      console.log("🛑 Automation stopped - no longer on valid Indeed page");
      return { success: false, reason: "Left valid Indeed page" };
    }
    
    pageCount++;
    console.log(`\n📄 Processing page ${pageCount}...`);
    
    try {
      // Check if we've reached the final success page
      if (await isSuccessPage()) {
        console.log("🎉 Reached success page - workflow complete!");
        return;
      }
      
      // Process current page
      const pageProcessed = await processCurrentPage();
      
      if (pageProcessed) {
        consecutiveFailures = 0;
        
        // Try to proceed to next page
        const proceededToNext = await proceedToNextPage();
        
        if (!proceededToNext) {
          console.log("⚠️ Could not proceed to next page - might be final page");
          break;
        }
        
        // Wait for next page to load
        await new Promise(r => setTimeout(r, 2000));
        
      } else {
        consecutiveFailures++;
        console.log(`⚠️ Page ${pageCount} not processed (failure ${consecutiveFailures}/3)`);
        
        // Try to proceed anyway
        const proceededToNext = await proceedToNextPage();
        if (!proceededToNext) {
          break;
        }
        await new Promise(r => setTimeout(r, 2000));
      }
      
    } catch (error) {
      // Handle different types of exceptions gracefully
      if (error instanceof DOMException) {
        console.error(`❌ DOM Error on page ${pageCount}: ${error.name} - ${error.message}`);
      } else if (error.message && error.message.includes('Extension context invalidated')) {
        console.error(`❌ Extension context lost on page ${pageCount}`);
        break; // Stop processing if extension context is lost
      } else {
        console.error(`❌ Error on page ${pageCount}:`, error.message || error);
      }
      
      consecutiveFailures++;
      
      // Check if extension context is still valid before trying to recover
      if (!isExtensionContextValid()) {
        console.error("❌ Extension context invalidated - stopping workflow");
        break;
      }
      
      // Try to recover by proceeding to next page
      try {
        await proceedToNextPage();
        await new Promise(r => setTimeout(r, 2000));
      } catch (recoverError) {
        if (recoverError instanceof DOMException) {
          console.error("❌ DOM Recovery failed:", recoverError.name, recoverError.message);
        } else {
          console.error("❌ Recovery failed:", recoverError.message || recoverError);
        }
        break;
      }
    }
  }
  
  if (pageCount >= maxPages) {
    console.log("⚠️ Reached maximum page limit");
  }
  
  if (consecutiveFailures >= 3) {
    console.log("⚠️ Too many consecutive failures");
  }
  
  console.log(`✅ Workflow loop completed - processed ${pageCount} pages`);
  
  return {
    completed: true,
    pagesProcessed: pageCount,
    consecutiveFailures: consecutiveFailures,
    reachedMaxPages: pageCount >= maxPages,
    tooManyFailures: consecutiveFailures >= 3
  };
}

/**
 * Process the current page by filling forms and answering questions
 */
async function processCurrentPage() {
  console.log("🔍 Analyzing current page...");
  
  let processedSomething = false;
  let interactionCount = 0;
  
  // Initialize form interaction tracking
  if (!window.formInteractionCount) {
    window.formInteractionCount = 0;
  }
  
  try {
    // Check extension context before processing
    if (!isExtensionContextValid()) {
      console.log("⚠️ Extension context invalid - skipping page processing");
      return false;
    }
    
    // Fill contact information if present
    try {
      if (await hasContactInfo()) {
        console.log("📝 Processing contact information...");
        const contactResult = await fillContactInfo();
        if (contactResult && contactResult.filled > 0) {
          processedSomething = true;
          interactionCount += contactResult.filled;
          console.log(`✅ Filled ${contactResult.filled} contact fields`);
        }
      }
    } catch (contactError) {
      console.error("⚠️ Contact info processing failed:", contactError.message || contactError);
    }
    
    // Fill employer questions if present  
    try {
      if (await hasEmployerQuestions()) {
        console.log("📝 Processing employer questions...");
        const questionResult = await fillEmployerQuestions();
        if (questionResult && questionResult.filled > 0) {
          processedSomething = true;
          interactionCount += questionResult.filled;
          console.log(`✅ Answered ${questionResult.filled} employer questions`);
        }
      }
    } catch (questionError) {
      console.error("⚠️ Employer questions processing failed:", questionError.message || questionError);
    }
    
    // Handle resume selection if present
    try {
      if (await hasResumeSelection()) {
        console.log("📝 Processing resume selection...");
        const resumeResult = await selectResume();
        if (resumeResult && resumeResult.selected) {
          processedSomething = true;
          interactionCount += 1;
          console.log(`✅ Selected resume`);
        }
      }
    } catch (resumeError) {
      console.error("⚠️ Resume selection failed:", resumeError.message || resumeError);
    }
    
    // Handle document uploads if present
    try {
      if (await hasDocumentUploads()) {
        console.log("📝 Processing document uploads...");
        await handleDocumentUploads();
        processedSomething = true;
      }
    } catch (uploadError) {
      console.error("⚠️ Document upload processing failed:", uploadError.message || uploadError);
    }
    
    // Accept legal disclaimers if present
    try {
      if (await hasLegalDisclaimer()) {
        console.log("📝 Processing legal disclaimers...");
        await acceptLegalDisclaimer();
        processedSomething = true;
      }
    } catch (legalError) {
      console.error("⚠️ Legal disclaimer processing failed:", legalError.message || legalError);
    }
    
    console.log(`📊 Page processing complete - processed: ${processedSomething}`);
    return processedSomething;
    
  } catch (error) {
    if (error instanceof DOMException) {
      console.error("❌ DOM Error processing page:", error.name, error.message);
    } else if (error.message && error.message.includes('Extension context invalidated')) {
      console.error("❌ Extension context lost during page processing");
    } else {
      console.error("❌ Error processing page:", error.message || error);
    }
    return false;
  }
}

/**
 * Try to proceed to the next page by clicking Continue/Submit buttons
 */
async function proceedToNextPage() {
  console.log("🔍 Looking for Continue/Submit buttons...");
  
  try {
    // Check extension context before proceeding
    if (!isExtensionContextValid()) {
      console.log("⚠️ Extension context invalid - cannot proceed to next page");
      return false;
    }
    
    // Look for Continue buttons first
    const continueButton = await findContinueButton();
    if (continueButton) {
      console.log("🖱️ Clicking Continue button...");
      try {
        continueButton.click();
        await new Promise(r => setTimeout(r, 1000));
        return true;
      } catch (clickError) {
        console.error("❌ Error clicking Continue button:", clickError.message);
      }
    }
    
    // Look for Submit buttons
    const submitButton = await findSubmitButton();
    if (submitButton) {
      console.log("🖱️ Clicking Submit button...");
      try {
        submitButton.click();
        await new Promise(r => setTimeout(r, 1000));
        return true;
      } catch (clickError) {
        console.error("❌ Error clicking Submit button:", clickError.message);
      }
    }
  } catch (error) {
    console.error("❌ Error in proceedToNextPage:", error.message);
  }
  
  // Try pressing Enter key as fallback
  try {
    console.log("⌨️ Trying Enter key as fallback...");
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13 }));
    await new Promise(r => setTimeout(r, 1000));
  } catch (keyError) {
    console.error("❌ Error with Enter key fallback:", keyError.message);
  }
  
  return false;
}

/**
 * Find Continue button with multiple strategies
 */
async function findContinueButton() {
  const continueSelectors = [
    'button[data-testid*="continue"]',
    'button.mosaic-provider-module-apply-questions-6xgesl',
    'button[type="submit"]',
    '.ia-Questions button[type="button"]',
    '.mosaic-provider-module-apply-questions button[type="button"]',
    '[class*="apply-questions"] button',
    'button[class*="6xgesl"]'
  ];
  
  // Try CSS selectors first
  for (const selector of continueSelectors) {
    try {
      const button = await waitForElement(selector, 1000);
      if (button) return button;
    } catch (e) {
      // Continue to next selector
    }
  }
  
  // Try text-based search
  await new Promise(r => setTimeout(r, 500));
  const allButtons = document.querySelectorAll('button, input[type="submit"], input[type="button"]');
  for (const btn of allButtons) {
    const text = (btn.textContent || btn.value || '').toLowerCase().trim();
    if (text.includes('continue') || text.includes('next') || text.includes('proceed')) {
      return btn;
    }
  }
  
  return null;
}

/**
 * Find Submit button with multiple strategies  
 */
async function findSubmitButton() {
  const submitSelectors = [
    'button[type="submit"]',
    '.ia-BasePage-footer button',
    '.ia-Review button', 
    '[class*="footer"] button',
    '[class*="submit"] button',
    'button[class*="primary"]',
    'main button',
    'footer button'
  ];
  
  // Try CSS selectors first
  for (const selector of submitSelectors) {
    try {
      const button = await waitForElement(selector, 1000);
      if (button) return button;
    } catch (e) {
      // Continue to next selector
    }
  }
  
  // Try text-based search
  const allButtons = document.querySelectorAll('button, input[type="submit"], input[type="button"]');
  for (const btn of allButtons) {
    const text = (btn.textContent || btn.value || '').toLowerCase().trim();
    if (text.includes('submit your application') || text.includes('submit application') ||
        text.includes('submit') || text.includes('apply now') || text.includes('send application')) {
      return btn;
    }
  }
  
  return null;
}

/**
 * Check if current page is the success page
 */
/**
 * Comprehensive multi-level success verification
 * Returns confidence score (0-1) and evidence array
 */
async function performSuccessVerification() {
  const evidence = [];
  let confidence = 0;
  
  // LEVEL 1: Strong Success Indicators (High Confidence)
  console.log("🔍 Level 1: Strong Success Indicators");
  
  const strongSuccessKeywords = [
    'application submitted',
    'thank you for applying',
    'successfully applied',
    'application received',
    'we have received your application',
    'application complete',
    'submission successful',
    'you have successfully applied'
  ];
  
  const pageText = document.body.textContent.toLowerCase();
  const strongMatches = strongSuccessKeywords.filter(keyword => pageText.includes(keyword));
  
  if (strongMatches.length > 0) {
    confidence += 0.6;
    evidence.push(`Strong success text: ${strongMatches.join(', ')}`);
  }
  
  // Check for Indeed-specific success URLs
  if (window.location.href.includes('indeed.com/viewjob') && 
      (pageText.includes('applied') || pageText.includes('thank you'))) {
    confidence += 0.3;
    evidence.push('Indeed success URL pattern with confirmation text');
  }
  
  // LEVEL 2: Visual Success Elements (Medium Confidence)
  console.log("🔍 Level 2: Visual Success Elements");
  
  const successSelectors = [
    '.success', '.confirmation', '.complete', '.submitted',
    '[data-testid*="success"]', '[data-testid*="confirmation"]',
    '[class*="success"]', '[class*="confirmation"]',
    '.checkmark', '.check-circle', '.fa-check'
  ];
  
  const foundSuccessElements = successSelectors.filter(sel => document.querySelector(sel));
  if (foundSuccessElements.length > 0) {
    confidence += 0.2 * Math.min(foundSuccessElements.length, 3);
    evidence.push(`Success UI elements: ${foundSuccessElements.join(', ')}`);
  }
  
  // LEVEL 3: Form State Analysis (Medium Confidence)
  console.log("🔍 Level 3: Form State Analysis");
  
  // Check if all forms are gone (submitted)
  const remainingForms = document.querySelectorAll('form');
  const remainingInputs = document.querySelectorAll('input[type="text"], input[type="email"], textarea');
  const submitButtons = document.querySelectorAll('button[type="submit"], button:contains("submit"), button:contains("apply")');
  
  if (remainingForms.length === 0 && remainingInputs.length === 0) {
    confidence += 0.25;
    evidence.push('All forms and inputs removed (submitted)');
  }
  
  // Check for disabled/hidden submit buttons (indicates completion)
  const disabledSubmits = Array.from(submitButtons).filter(btn => 
    btn.disabled || btn.style.display === 'none' || !btn.offsetParent
  );
  
  if (disabledSubmits.length > 0) {
    confidence += 0.15;
    evidence.push('Submit buttons disabled/hidden');
  }
  
  // LEVEL 4: URL Pattern Analysis (Low-Medium Confidence)
  console.log("🔍 Level 4: URL Pattern Analysis");
  
  const successUrlPatterns = [
    'success', 'complete', 'confirmation', 'submitted', 'thank-you',
    'applied', 'application-sent', 'done'
  ];
  
  const currentUrl = window.location.href.toLowerCase();
  const urlMatches = successUrlPatterns.filter(pattern => currentUrl.includes(pattern));
  
  if (urlMatches.length > 0) {
    confidence += 0.2;
    evidence.push(`Success URL patterns: ${urlMatches.join(', ')}`);
  }
  
  // LEVEL 5: Error Detection (Negative Indicators)
  console.log("🔍 Level 5: Error Detection");
  
  const errorKeywords = [
    'error', 'invalid', 'required', 'missing', 'failed', 'unsuccessful',
    'please fill', 'this field is required', 'cannot be blank'
  ];
  
  const errorMatches = errorKeywords.filter(keyword => pageText.includes(keyword));
  const errorElements = document.querySelectorAll('.error, .invalid, [class*="error"]');
  
  if (errorMatches.length > 0 || errorElements.length > 0) {
    confidence -= 0.3;
    evidence.push(`Errors detected: ${errorMatches.join(', ')} | ${errorElements.length} error elements`);
  }
  
  // LEVEL 6: Interaction Verification (Medium Confidence)
  console.log("🔍 Level 6: Interaction Verification");
  
  // Check if we actually filled out forms
  const formInteractionCount = window.formInteractionCount || 0;
  if (formInteractionCount > 0) {
    confidence += 0.1;
    evidence.push(`Form interactions completed: ${formInteractionCount}`);
  }
  
  // Check for recently filled inputs (still have our values)
  const filledInputs = Array.from(document.querySelectorAll('input, textarea')).filter(input => 
    input.value && input.value.length > 0
  );
  
  if (filledInputs.length > 3) {
    confidence += 0.1;
    evidence.push(`${filledInputs.length} inputs contain data`);
  }
  
  // LEVEL 7: Time-based Analysis (Low Confidence)
  console.log("🔍 Level 7: Time-based Analysis");
  
  // If we've been on this page for a while without forms, likely success
  const pageLoadTime = window.pageLoadTime || Date.now();
  const timeOnPage = Date.now() - pageLoadTime;
  
  if (timeOnPage > 5000 && remainingForms.length === 0) {
    confidence += 0.1;
    evidence.push('Extended time on page without active forms');
  }
  
  // Cap confidence at 1.0
  confidence = Math.min(confidence, 1.0);
  
  console.log(`📊 Success Verification Complete: ${(confidence * 100).toFixed(1)}% confidence`);
  console.log(`📝 Evidence: ${evidence.length} indicators found`);
  
  return { confidence, evidence };
}

/**
 * Legacy success page check (kept for compatibility)
 */
async function isSuccessPage() {
  const verification = await performSuccessVerification();
  return verification.confidence >= 0.6;
}

/**
 * Final success check with timeout
 */
async function checkApplicationSuccess() {
  console.log("🔍 Starting comprehensive application success verification...");
  
  let attempts = 0;
  let lastPageUrl = window.location.href;
  let formInteractionCount = window.formInteractionCount || 0;
  
  while (attempts < 20) { // Increased attempts for thorough checking
    // Multi-level success verification
    const successLevel = await performSuccessVerification();
    
    if (successLevel.confidence >= 0.8) {
      console.log(`🎉 HIGH CONFIDENCE SUCCESS (${(successLevel.confidence * 100).toFixed(1)}%): Application submitted!`);
      console.log(`📊 Success Evidence:`, successLevel.evidence);
      return true;
    }
    
    if (successLevel.confidence >= 0.6) {
      console.log(`⚠️ MEDIUM CONFIDENCE (${(successLevel.confidence * 100).toFixed(1)}%): Likely success, continuing verification...`);
    }
    
    // Check for page changes (indicates progression)
    const currentUrl = window.location.href;
    if (currentUrl !== lastPageUrl) {
      console.log(`📍 Page changed: ${lastPageUrl} → ${currentUrl}`);
      lastPageUrl = currentUrl;
    }
    
    await new Promise(r => setTimeout(r, 1000));
    attempts++;
    
    if (attempts % 5 === 0) {
      console.log(`🔄 Success verification progress: ${attempts}/20 (${(successLevel.confidence * 100).toFixed(1)}% confidence)`);
    }
  }
  
  // Final verification with relaxed criteria
  const finalCheck = await performSuccessVerification();
  if (finalCheck.confidence >= 0.5) {
    console.log(`✅ MODERATE SUCCESS (${(finalCheck.confidence * 100).toFixed(1)}%): Application likely submitted`);
    console.log(`📊 Final Evidence:`, finalCheck.evidence);
    return true;
  }
  
  console.log(`❌ LOW CONFIDENCE (${(finalCheck.confidence * 100).toFixed(1)}%): Application submission unclear`);
  console.log(`📊 Final Evidence:`, finalCheck.evidence);
  return false;
}

/**
 * Helper functions to detect page content
 */
async function hasContactInfo() {
  return !!(await waitForElement('#mosaic-contactInfoModule, [data-testid="profile-location-page"], input[name*="name"], input[name*="email"], input[name*="phone"]', 1000));
}

async function hasEmployerQuestions() {
  return !!(await waitForElement('.ia-Questions-item, [id^="q_"], [data-testid*="input-q_"], h1[data-testid="questions-heading"]', 1000));
}

async function hasResumeSelection() {
  return !!(await waitForElement('.ia-Resume, input[type="radio"][name*="resume"], [data-testid*="resume"]', 1000));
}

async function hasDocumentUploads() {
  return !!(await waitForElement('input[type="file"], [data-testid*="upload"], .upload', 1000));
}

async function hasLegalDisclaimer() {
  return !!(await waitForElement('input[type="checkbox"][name*="legal"], input[type="checkbox"][name*="terms"], input[type="checkbox"][name*="agree"]', 1000));
}


async function selectResume() {
  const resumeRadio = await waitForElement('input[type="radio"][name*="resume"]', 2000);
  if (resumeRadio && !resumeRadio.checked) {
    resumeRadio.checked = true;
    resumeRadio.dispatchEvent(new Event('change', { bubbles: true }));
    window.formInteractionCount = (window.formInteractionCount || 0) + 1;
    return { selected: true };
  }
  return { selected: false };
}

async function fillEmployerQuestions() {
  let filled = 0;
  
  // Find all question containers
  const questionContainers = document.querySelectorAll('.ia-Questions-item, [id^="q_"], [data-testid*="input-q_"]');
  
  console.log(`📝 Found ${questionContainers.length} employer questions to process`);
  
  for (const container of questionContainers) {
    try {
      // Extract question text
      const questionText = container.textContent || container.innerText || '';
      if (questionText.trim().length === 0) continue;
      
      console.log(`❓ Processing question: "${questionText.substring(0, 100)}..."`);
      
      // Use the existing fillQuestionByType function
      const success = await fillQuestionByType(container, questionText);
      if (success) {
        filled++;
        console.log(`✅ Successfully filled question`);
      } else {
        console.log(`⚠️ Could not fill question`);
      }
      
      // Small delay between questions
      await new Promise(r => setTimeout(r, 500));
      
    } catch (error) {
      console.error(`❌ Error processing question:`, error);
    }
  }
  
  window.formInteractionCount = (window.formInteractionCount || 0) + filled;
  return { filled };
}

async function handleDocumentUploads() {
  // Skip file uploads for now - would need actual file handling
  console.log("📄 Skipping document uploads");
  return { uploaded: 0 };
}

async function acceptLegalDisclaimer() {
  const checkboxes = document.querySelectorAll('input[type="checkbox"][name*="legal"], input[type="checkbox"][name*="terms"], input[type="checkbox"][name*="agree"]');
  for (const checkbox of checkboxes) {
    if (!checkbox.checked) {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
}







// Nouns (things , titles, concepts, places, people)

const nouns = [
    "Ability",
    "Account",
    "Achievement",
    "Application",
    "Assessment",
    "Benefit",
    "Candidate",
    "Career",
    "Certification",
    "Challenge",
    "Client",
    "Communication",
    "Company",
    "Compensation",
    "Contract",
    "Culture",
    "Deadline",
    "Degree",
    "Department",
    "Description",
    "Development",
    "Education",
    "Employer",
    "Employment",
    "Environment",
    "Experience",
    "Goal",
    "Interview",
    "Job",
    "Location",
    "Manager",
    "Mistake",
    "Opportunity",
    "Organization",
    "Pay",
    "Position",
    "Posting",
    "Problem",
    "Project",
    "Qualification",
    "Reference",
    "Requirement",
    "Responsibility",
    "Resume",
    "Role",
    "Salary",
    "Schedule",
    "Skill",
    "Staff",
    "Strength",
    "Task",
    "Team",
    "Technology",
    "Training",
    "Weakness",
    "Work"
];


// Verbs (actions, occurrences, states of being)
const verbs = [
    "Achieve",
    "Adapt",
    "Analyze",
    "Apply",
    "Assist",
    "Build",
    "Collaborate",
    "Communicate",
    "Complete",
    "Coordinate",
    "Create",
    "Deliver",
    "Demonstrate",
    "Develop",
    "Earn",
    "Execute",
    "Explain",
    "Facilitate",
    "Handle",
    "Implement",
    "Improve",
    "Lead",
    "Learn",
    "Manage",
    "Organize",
    "Oversee",
    "Perform",
    "Plan",
    "Prioritize",
    "Provide",
    "Recruit",
    "Report",
    "Research",
    "Resolve",
    "Respond",
    "Review",
    "Support",
    "Train",
    "Troubleshoot",
    "Utilize",
    "Work"
];

// propernouns (specific names of people, places, or organizations)

const propernouns = [
    "Adobe",
    "Amazon",
    "Apple",
    "Bachelor’s Degree",
    "Google",
    "Indeed",
    "Java",
    "LinkedIn",
    "Microsoft",
    "MongoDB",
    "Oracle",
    "Python",
    "Salesforce",
    "SQL",
    "Tableau",
    "Twitter (X)",
    "United States",
    "Visa",
    "Zoom"
];

// subjects (topics, themes, or areas of interest)
const subjects = [
    "Applicant",
    "Candidate",
    "Client",
    "Employee",
    "Employer",
    "Graduate",
    "Hiring Manager",
    "Individual",
    "Intern",
    "Job Seeker",
    "Manager",
    "Professional",
    "Recruiter",
    "Student",
    "Supervisor",
    "Team Member",
    "Worker"
];

const userShortResponce = [
    "Agree",
    "Answer",
    "Approve",
    "Complete",
    "Confirm",
    "Decline",
    "Deny",
    "Enter",
    "Finish",
    "Mark",
    "Select",
    "Submit",
    "Toggle",
    "Yes",
    "No"
];

const actionWorkds = [
    "Checked",
    "Chosen",
    "Completed",
    "Filled",
    "Ignored",
    "Opted",
    "Selected",
    "Started",
    "Submitted",
    "Updated"
];

// Function to normalize text for better matching
function normalizeText(text) {
    return text.toLowerCase()
               .replace(/[.,!?;:]/g, '')  // Remove punctuation
               .replace(/\s+/g, ' ')      // Normalize whitespace
               .trim();
}

/**
 * Multi-Modal Weighted Semantic Similarity Algorithm
 * 
 * Formula: S(Q,A) = Σ(Wi × Mi) + B(Q,A) + C(Q)
 * 
 * Where:
 * - S(Q,A) = Similarity score between Question Q and Answer A
 * - Wi = Weight for linguistic category i
 * - Mi = |category_i(Q) ∩ category_i(A)| (intersection cardinality)
 * - B(Q,A) = Σ(15 × δ(proper_noun_i, Q, A)) (exact phrase bonuses)
 * - C(Q) = ⌊confidence(Q) × 10⌋ (category coherence bonus)
 * 
 * Weights: W₁=12(ProperNouns), W₂=6(Nouns), W₃=4(Verbs), W₄=3(Subjects), 
 *          W₅=8(ShortResponse), W₆=5(Actions), W₇=1(Direct)
 * 
 * Time Complexity: O(|Q| × |A| × |W|)
 * Space Complexity: O(|Q| + |A| + |W|)
 */
function calculateScore(qustion, answer, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds) {
    // turns qustions into array of words
    const qustionWords = normalizeText(qustion).split(" ");
    const answerWords = normalizeText(answer).split(" ");

    // Extract word types for question
    const qustionNouns = qustionWords.filter(word => nouns.map(n => n.toLowerCase()).includes(word));
    const qustionVerbs = qustionWords.filter(word => verbs.map(v => v.toLowerCase()).includes(word));
    const qustionProperNouns = qustionWords.filter(word => propernouns.map(p => p.toLowerCase()).includes(word));
    const qustionSubjects = qustionWords.filter(word => subjects.map(s => s.toLowerCase()).includes(word));
    const qustionShortResponse = qustionWords.filter(word => userShortResponce.map(r => r.toLowerCase()).includes(word));
    const qustionActions = qustionWords.filter(word => actionWorkds.map(a => a.toLowerCase()).includes(word));

    // Extract word types for answer
    const answerNouns = answerWords.filter(word => nouns.map(n => n.toLowerCase()).includes(word));
    const answerVerbs = answerWords.filter(word => verbs.map(v => v.toLowerCase()).includes(word));
    const answerProperNouns = answerWords.filter(word => propernouns.map(p => p.toLowerCase()).includes(word));
    const answerSubjects = answerWords.filter(word => subjects.map(s => s.toLowerCase()).includes(word));
    const answerShortResponse = answerWords.filter(word => userShortResponce.map(r => r.toLowerCase()).includes(word));
    const answerActions = answerWords.filter(word => actionWorkds.map(a => a.toLowerCase()).includes(word));

    // Initialize score
    let score = 0;
    
    // Dynamic category detection for better scoring
    const questionCategory = detectQuestionCategory(qustion, propernouns, nouns, verbs);
    
    // Weighted scoring based on linguistic feature matching
    // Formula component: Σ(Wi × |categoryi(Q) ∩ categoryi(A)|)
    
    const properNounMatches = qustionProperNouns.filter(word => answerProperNouns.includes(word));
    score += properNounMatches.length * 12;  // W₁ = 12 (highest semantic value)
    
    const nounMatches = qustionNouns.filter(word => answerNouns.includes(word));
    score += nounMatches.length * 6;  // W₂ = 6 (high concept matching)
    
    const verbMatches = qustionVerbs.filter(word => answerVerbs.includes(word));
    score += verbMatches.length * 4;  // W₃ = 4 (action alignment)
    
    const subjectMatches = qustionSubjects.filter(word => answerSubjects.includes(word));
    score += subjectMatches.length * 3;  // W₄ = 3 (entity recognition)
    
    const shortResponseMatches = qustionShortResponse.filter(word => answerShortResponse.includes(word));
    score += shortResponseMatches.length * 8;  // W₅ = 8 (intent matching)
    
    const actionMatches = qustionActions.filter(word => answerActions.includes(word));
    score += actionMatches.length * 5;  // W₆ = 5 (status understanding)
    
    const directMatches = qustionWords.filter(word => answerWords.includes(word));
    score += directMatches.length * 1;  // W₇ = 1 (fallback similarity)
    
    // Bonus scoring: B(Q,A) = Σ(15 × δ(pi, Q, A))
    const lowerQuestion = qustion.toLowerCase();
    const lowerAnswer = answer.toLowerCase();
    
    // Exact phrase matching bonus (δ function: 1 if phrase exists in both, 0 otherwise)
    propernouns.forEach(prop => {
        const propLower = prop.toLowerCase();
        if (lowerQuestion.includes(propLower) && lowerAnswer.includes(propLower)) {
            score += 15; // Technology/certification exact match bonus
        }
    });
    
    // Category coherence bonus: C(Q) = ⌊confidence(Q) × 10⌋
    if (questionCategory.confidence > 0.7) {
        score += Math.floor(questionCategory.confidence * 10);
    }
    
    return {
        score,
        category: questionCategory,
        details: {
            properNounMatches,
            nounMatches,
            verbMatches,
            subjectMatches,
            shortResponseMatches,
            actionMatches,
            directMatches
        }
    };
}

// Main function to find the best matching answer for a question
function findBestAnswer(question, answerArray, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds) {
    let bestAnswer = "";
    let highestScore = 0;
    let bestDetails = {};
    
    answerArray.forEach(answer => {
        const result = calculateScore(question, answer, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds);
        
        if (result.score > highestScore) {
            highestScore = result.score;
            bestAnswer = answer;
            bestDetails = result.details;
        }
    });
    
    return {
        question,
        bestAnswer,
        score: highestScore,
        confidence: Math.min(highestScore / 10, 1), // Normalize to 0-1 range
        details: bestDetails
    };
}

/**
 * Find All Relevant Answers (Many-to-Many Algorithm Extension)
 * 
 * Returns multiple answers that meet minimum similarity threshold
 * Supports one question → multiple answers relationship
 * 
 * @param {string} question - The input question
 * @param {Array} answerArray - Array of possible answers
 * @param {number} minThreshold - Minimum similarity score (default: 5)
 * @param {number} maxResults - Maximum number of results (default: 5)
 * @returns {Array} Sorted array of matching answers with confidence scores
 */
function findAllRelevantAnswers(question, answerArray, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds, minThreshold = 5, maxResults = 5) {
    const allMatches = [];
    
    answerArray.forEach(answer => {
        const result = calculateScore(question, answer, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds);
        
        // Only include answers above minimum threshold
        if (result.score >= minThreshold) {
            allMatches.push({
                answer: answer,
                score: result.score,
                confidence: Math.min(result.score / 10, 1), // Normalize to 0-1 range
                details: result.details,
                relevanceLevel: result.score >= 15 ? 'high' : result.score >= 10 ? 'medium' : 'low'
            });
        }
    });
    
    // Sort by score (descending) and limit results
    return allMatches
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults)
        .map((match, index) => ({
            ...match,
            rank: index + 1,
            question: question
        }));
}

/**
 * Reverse Lookup: Find Questions for Answer (Many-to-Many Extension)
 * 
 * Given an answer, find all questions that could lead to it
 * Supports one answer → multiple questions relationship
 * 
 * @param {string} targetAnswer - The answer to find questions for
 * @param {Array} questionArray - Array of possible questions
 * @param {number} minThreshold - Minimum similarity score (default: 5)
 * @returns {Array} Questions that could lead to this answer
 */
function findQuestionsForAnswer(targetAnswer, questionArray, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds, minThreshold = 5) {
    const matchingQuestions = [];
    
    questionArray.forEach(question => {
        const result = calculateScore(question, targetAnswer, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds);
        
        if (result.score >= minThreshold) {
            matchingQuestions.push({
                question: question,
                score: result.score,
                confidence: Math.min(result.score / 10, 1),
                details: result.details,
                targetAnswer: targetAnswer
            });
        }
    });
    
    return matchingQuestions.sort((a, b) => b.score - a.score);
}

// Function to process multiple questions against multiple answers
function processQuestionAnswerPairs(questionArray, answerArray, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds) {
    return questionArray.map(question => 
        findBestAnswer(question, answerArray, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds)
    );
}

/**
 * Many-to-Many Question-Answer Processing
 * 
 * Processes multiple questions and finds all relevant answers for each
 * Creates comprehensive mapping of questions to multiple valid answers
 * 
 * @param {Array} questionArray - Array of questions to process
 * @param {Array} answerArray - Array of possible answers
 * @param {Object} options - Processing options {minThreshold, maxAnswers, includeReverse}
 * @returns {Object} Complete many-to-many mapping results
 */
function processMultipleAnswers(questionArray, answerArray, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds, options = {}) {
    const {
        minThreshold = 5,
        maxAnswers = 5,
        includeReverse = false
    } = options;
    
    const questionToAnswers = questionArray.map(question => ({
        question: question,
        matches: findAllRelevantAnswers(
            question, 
            answerArray, 
            nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds,
            minThreshold, 
            maxAnswers
        )
    }));
    
    const results = {
        questionToAnswers: questionToAnswers,
        summary: {
            totalQuestions: questionArray.length,
            questionsWithMatches: questionToAnswers.filter(q => q.matches.length > 0).length,
            questionsWithMultipleMatches: questionToAnswers.filter(q => q.matches.length > 1).length,
            averageMatchesPerQuestion: questionToAnswers.reduce((sum, q) => sum + q.matches.length, 0) / questionArray.length
        }
    };
    
    // Optional: Include reverse mapping (answer → questions)
    if (includeReverse) {
        const answerToQuestions = answerArray.map(answer => ({
            answer: answer,
            matchingQuestions: findQuestionsForAnswer(
                answer, 
                questionArray, 
                nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds,
                minThreshold
            )
        }));
        
        results.answerToQuestions = answerToQuestions;
        results.summary.totalAnswers = answerArray.length;
        results.summary.answersWithMatches = answerToQuestions.filter(a => a.matchingQuestions.length > 0).length;
        results.summary.answersWithMultipleMatches = answerToQuestions.filter(a => a.matchingQuestions.length > 1).length;
    }
    
    return results;
}

/**
 * Format Multiple Answers for Different Input Types
 * 
 * Takes multiple answer matches and formats them appropriately
 * for different UI input types (radio, dropdown, checkbox, text)
 */
function formatMultipleAnswerResponse(matches, inputType, options = {}) {
    const {
        combineAnswers = true,
        includeConfidence = true,
        maxLength = 200
    } = options;
    
    if (!matches || matches.length === 0) {
        return { formattedResponse: "No suitable answers found", inputType, matches: [] };
    }
    
    switch (inputType) {
        case inputTypes.RADIO:
            // For radio buttons, provide the top match but show alternatives
            return {
                formattedResponse: matches[0].answer,
                primaryChoice: matches[0].answer,
                alternatives: matches.slice(1).map(m => m.answer),
                confidence: matches[0].confidence,
                inputType,
                matches
            };
            
        case inputTypes.DROPDOWN:
            // For dropdown, list all options with primary selection
            return {
                formattedResponse: matches[0].answer,
                dropdownOptions: matches.map(m => ({
                    value: m.answer,
                    label: m.answer,
                    confidence: m.confidence,
                    selected: m.rank === 1
                })),
                inputType,
                matches
            };
            
        case inputTypes.CHECKBOX:
            // For checkboxes, user can select multiple relevant answers
            return {
                formattedResponse: matches.map(m => m.answer).join("; "),
                checkboxOptions: matches.map(m => ({
                    value: m.answer,
                    label: m.answer,
                    confidence: m.confidence,
                    checked: m.relevanceLevel === 'high'
                })),
                inputType,
                matches
            };
            
        case inputTypes.TEXT:
        default:
            // For text input, combine or list multiple answers
            if (combineAnswers && matches.length > 1) {
                const combined = matches
                    .filter(m => m.relevanceLevel !== 'low')
                    .map(m => includeConfidence ? 
                        `${m.answer} (${Math.round(m.confidence * 100)}% match)` : 
                        m.answer
                    )
                    .join(" | ");
                    
                return {
                    formattedResponse: combined.length > maxLength ? 
                        combined.substring(0, maxLength) + "..." : 
                        combined,
                    inputType,
                    matches,
                    combinedAnswer: true
                };
            } else {
                return {
                    formattedResponse: matches[0].answer,
                    alternatives: matches.slice(1),
                    inputType,
                    matches
                };
            }
    }
}

// Input type definitions and their answer formats
const inputTypes = {
    TEXT: 'text',
    RADIO: 'radio', 
    DROPDOWN: 'dropdown',
    CHECKBOX: 'checkbox'
};

// Dynamic response data storage
let storedResponses = new Map(); // Store user responses for consistency
let questionCategories = new Map(); // Store categorized questions
let answerPatterns = new Map(); // Store answer patterns for reuse

// Dynamic category detection based on keywords
function detectQuestionCategory(question, propernouns, nouns, verbs) {
    const lowerQ = question.toLowerCase();
    const words = lowerQ.split(/\s+/);
    
    let category = 'general';
    let confidence = 0;
    
    // Check for specific technologies/certifications in propernouns
    const techWords = propernouns.filter(prop => 
        words.some(word => prop.toLowerCase().includes(word) || word.includes(prop.toLowerCase()))
    );
    
    // Check for experience/time-related words
    const experienceWords = ['year', 'years', 'experience', 'month', 'months'];
    const hasExperience = words.some(word => experienceWords.includes(word));
    
    // Check for yes/no question patterns
    const yesNoWords = ['do', 'are', 'have', 'can', 'will', 'would', 'is'];
    const isYesNo = words.some(word => yesNoWords.includes(word));
    
    if (techWords.length > 0) {
        category = hasExperience ? `${techWords[0]}_experience` : `${techWords[0]}_knowledge`;
        confidence = 0.8;
    } else if (hasExperience) {
        category = 'experience_general';
        confidence = 0.6;
    } else if (isYesNo) {
        category = 'yes_no_question';
        confidence = 0.5;
    }
    
    return { category, confidence, detectedTerms: techWords };
}

// Generate dynamic response based on answer content and input type
function generateDynamicResponse(answer, inputType, userShortResponce, actionWorkds) {
    const lowerAnswer = answer.toLowerCase();
    
    switch (inputType) {
        case 'radio':
            // Extract key info for radio buttons
            if (lowerAnswer.includes('yes')) return 'Yes';
            if (lowerAnswer.includes('no')) return 'No';
            if (lowerAnswer.match(/\d+\s*years?/)) {
                const years = lowerAnswer.match(/(\d+)\s*years?/)[1];
                return `${years} years`;
            }
            // Use userShortResponce for concise answers
            const shortResponse = userShortResponce.find(resp => 
                lowerAnswer.includes(resp.toLowerCase())
            );
            return shortResponse || answer.split('.')[0]; // First sentence
            
        case 'dropdown':
            // More descriptive for dropdowns
            if (lowerAnswer.match(/\d+\s*years?.*experience/)) {
                const years = lowerAnswer.match(/(\d+)\s*years?/)[1];
                const tech = extractTechnology(answer);
                return tech ? `${years} years - ${tech}` : `${years} years experience`;
            }
            return answer.length > 50 ? answer.substring(0, 47) + '...' : answer;
            
        case 'checkbox':
            // Boolean or action-based for checkboxes
            const hasAction = actionWorkds.some(action => 
                lowerAnswer.includes(action.toLowerCase())
            );
            if (hasAction) return true;
            return lowerAnswer.includes('yes') || lowerAnswer.includes('have') || 
                   lowerAnswer.includes('can') || !lowerAnswer.includes('no');
            
        default: // text
            return answer;
    }
}

// Extract technology/skill names from text
function extractTechnology(text) {
    const commonTech = ['javascript', 'python', 'java', 'react', 'node', 'aws', 'sql', 'css', 'html'];
    const words = text.toLowerCase().split(/\s+/);
    return commonTech.find(tech => words.some(word => word.includes(tech)));
}

// Enhanced matching function that handles input types dynamically
function findAnswerWithInputType(question, answerArray, inputType, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds) {
    // First find the best semantic match
    const baseResult = findBestAnswer(question, answerArray, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds);
    
    // Generate dynamic response based on answer content and input type
    const formattedAnswer = generateDynamicResponse(baseResult.bestAnswer, inputType, userShortResponce, actionWorkds);
    
    // Store this response for consistency across similar questions
    const questionKey = question.toLowerCase().replace(/[^\w\s]/g, '').trim();
    if (!storedResponses.has(questionKey)) {
        storedResponses.set(questionKey, {
            originalAnswer: baseResult.bestAnswer,
            formattedResponses: { [inputType]: formattedAnswer },
            category: baseResult.category
        });
    } else {
        // Update with new input type response
        const stored = storedResponses.get(questionKey);
        stored.formattedResponses[inputType] = formattedAnswer;
    }
    
    return {
        ...baseResult,
        inputType,
        formattedAnswer,
        originalAnswer: baseResult.bestAnswer,
        isConsistent: checkResponseConsistency(questionKey, inputType, formattedAnswer)
    };
}

// Check if response is consistent with previous responses to similar questions
function checkResponseConsistency(questionKey, inputType, newResponse) {
    const stored = storedResponses.get(questionKey);
    if (!stored) return true;
    
    // Check if the core meaning is consistent across input types
    const responses = Object.values(stored.formattedResponses);
    if (responses.length === 0) return true;
    
    // Simple consistency check - look for contradictions
    const hasYes = responses.some(r => String(r).toLowerCase().includes('yes') || r === true);
    const hasNo = responses.some(r => String(r).toLowerCase().includes('no') || r === false);
    
    const newHasYes = String(newResponse).toLowerCase().includes('yes') || newResponse === true;
    const newHasNo = String(newResponse).toLowerCase().includes('no') || newResponse === false;
    
    // Flag inconsistency if yes/no conflicts
    return !(hasYes && newHasNo) && !(hasNo && newHasYes);
}

// Batch process with input types
function processWithInputTypes(questionArray, answerArray, inputTypeArray, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds) {
    return questionArray.map((question, index) => {
        const inputType = inputTypeArray[index] || inputTypes.TEXT;
        return findAnswerWithInputType(question, answerArray, inputType, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds);
    });
}

// Data storage and retrieval functions
function saveResponseData(filename = 'responses.json') {
    // Convert Maps to serializable objects with full details
    const serializedResponses = Array.from(storedResponses.entries()).map(([question, data]) => ({
        question,
        originalAnswer: data.originalAnswer,
        formattedResponses: data.formattedResponses,
        category: data.category || null
    }));
    
    const data = {
        storedResponses: serializedResponses,
        questionCategories: Array.from(questionCategories.entries()),
        answerPatterns: Array.from(answerPatterns.entries()),
        totalQuestions: storedResponses.size,
        timestamp: new Date().toISOString()
    };
    
    // In a real implementation, you'd save to file
    console.log(`\nData would be saved to ${filename}:`);
    console.log(JSON.stringify(data, null, 2));
    return data;
}

function loadResponseData(data) {
    if (data.storedResponses) {
        storedResponses = new Map(data.storedResponses);
    }
    if (data.questionCategories) {
        questionCategories = new Map(data.questionCategories);
    }
    if (data.answerPatterns) {
        answerPatterns = new Map(data.answerPatterns);
    }
    console.log('Data loaded successfully');
}

// Get all stored responses for analysis
function getStoredResponses() {
    return {
        totalQuestions: storedResponses.size,
        responses: Array.from(storedResponses.entries()),
        categories: Array.from(questionCategories.entries())
    };
}

// Find similar questions that have been answered before
function findSimilarQuestions(newQuestion, threshold = 0.6) {
    const similar = [];
    
    for (const [storedQ, data] of storedResponses.entries()) {
        const similarity = calculateTextSimilarity(newQuestion.toLowerCase(), storedQ);
        if (similarity > threshold) {
            similar.push({
                question: storedQ,
                similarity,
                storedData: data
            });
        }
    }
    
    return similar.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Jaccard Similarity Index
 * Formula: J(A,B) = |A ∩ B| / |A ∪ B|
 * Range: [0,1] where 1 = identical, 0 = no similarity
 */
function calculateTextSimilarity(text1, text2) {
    const words1 = new Set(text1.split(/\s+/));
    const words2 = new Set(text2.split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size; // |A ∩ B| / |A ∪ B|
}


// Comprehensive test data organized by categories
const testQuestions = [
    // 🚛 Trucking / License Questions
    "Do you have a valid Class A license?",
    "Are you currently licensed to drive commercial vehicles with Class A?",
    "How many years have you been driving with a Class A CDL?",
    
    // 💻 Tech Experience
    "How many years of JavaScript experience do you have?",
    "Have you worked professionally with JavaScript, and if so for how long?",
    "Rate your JavaScript proficiency and years of use.",
    
    // 🗣 Certification & Credentials
    "Do you currently hold a CompTIA Security+ certification?",
    "Have you obtained your AWS Solutions Architect Associate certification?",
    "Which certifications do you currently hold in IT security?",
    
    // 🕒 Availability
    "Are you available to work full-time?",
    "Would you be open to part-time or contract work?",
    "How soon can you start working if hired?",
    
    // 📍 Location / Relocation
    "Are you authorized to work in the United States?",
    "Do you require visa sponsorship now or in the future?",
    "Would you be willing to relocate for this role?",
    
    // 🎓 Education / Training
    "Do you have a high school diploma or GED?",
    "What is your highest level of education completed?",
    "Have you completed any technical bootcamps or training programs?",
    
    // ⚙️ Skills (general)
    "How many years of experience do you have with Python?",
    "Do you have backend development experience with Node.js?",
    "Have you worked with cloud platforms like AWS or Azure?",
    
    // 🧰 Soft Skills / Extras
    "Do you have leadership or management experience?",
    "Are you comfortable training or mentoring junior staff?",
    "Do you have experience working in agile or scrum environments?",
    
    // 🏗 Extra Variations (to test paraphrasing)
    "Have you worked as a professional truck driver with a CDL?",
    "Are you certified or licensed to operate commercial trucks?",
    "How many years of professional coding experience do you have overall?",
    "Do you currently hold any active technical certifications?",
    "What's your availability for starting a new position?",
    "Can you commit to 40 hours per week?"
];

const testAnswers = [
    // 🚛 Trucking / License Answers
    "Yes, I have a Class A license.",
    "Yes, I hold a Class A license.",
    "3 years of Class A CDL experience.",
    
    // 💻 Tech Experience Answers
    "2 years of JavaScript experience.",
    "2 years of professional JavaScript experience.",
    "Intermediate, 2 years of experience.",
    
    // 🗣 Certification & Credentials Answers
    "Yes, I am Security+ certified.",
    "Yes, AWS Solutions Architect Associate certified.",
    "CompTIA Security+, AWS Solutions Architect Associate.",
    
    // 🕒 Availability Answers
    "Yes, available full-time.",
    "Yes, open to part-time or contract roles.",
    "Available to start immediately.",
    
    // 📍 Location / Relocation Answers
    "Yes, authorized to work in the U.S.",
    "No, I do not require sponsorship.",
    "Yes, willing to relocate.",
    
    // 🎓 Education / Training Answers
    "Yes, I have a high school diploma.",
    "Completed Software Engineering program (equivalent to college-level training).",
    "Yes, completed Per Scholas Software Engineering program.",
    
    // ⚙️ Skills (general) Answers
    "3 years of Python experience.",
    "Yes, backend experience with Node.js.",
    "Yes, AWS experience.",
    
    // 🧰 Soft Skills / Extras Answers
    "Yes, led a small development team.",
    "Yes, experienced in mentoring teammates.",
    "Yes, experienced with Agile/Scrum.",
    
    // 🏗 Extra Variations Answers
    "Yes, 3 years Class A CDL experience.",
    "Yes, licensed Class A CDL.",
    "4 years of coding experience.",
    "Yes, Security+ and AWS Solutions Architect Associate.",
    "Available immediately.",
    "Yes, full-time availability."
];

// Test the system
console.log("=== Question-Answer Matching System Test ===\n");

testQuestions.forEach((question, index) => {
    const result = findBestAnswer(question, testAnswers, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds);
    
    console.log(`Question ${index + 1}: ${question}`);
    console.log(`Best Answer: ${result.bestAnswer}`);
    console.log(`Score: ${result.score}`);
    console.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    console.log(`Matches: ${JSON.stringify(result.details, null, 2)}`);
    console.log("---");
});

// Batch processing test
console.log("\n=== Batch Processing Test ===");
const batchResults = processQuestionAnswerPairs(testQuestions.slice(0, 5), testAnswers, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds);
batchResults.forEach((result, index) => {
    console.log(`${index + 1}. Q: "${result.question}"`);
    console.log(`   A: "${result.bestAnswer}" (Score: ${result.score})`);
});

// Input type consistency test
console.log("\n=== Input Type Consistency Test ===");
const testQuestion = "Do you have a valid Class A license?";
const inputTypesTest = [inputTypes.TEXT, inputTypes.RADIO, inputTypes.DROPDOWN, inputTypes.CHECKBOX];

inputTypesTest.forEach(type => {
    const result = findAnswerWithInputType(testQuestion, testAnswers, type, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds);
    console.log(`${type.toUpperCase()}: ${result.formattedAnswer}`);
});

// Batch test with different input types
console.log("\n=== Mixed Input Types Test ===");
const mixedInputTypes = [inputTypes.TEXT, inputTypes.RADIO, inputTypes.DROPDOWN, inputTypes.TEXT, inputTypes.RADIO];
const mixedResults = processWithInputTypes(testQuestions.slice(0, 5), testAnswers, mixedInputTypes, nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds);

mixedResults.forEach((result, index) => {
    console.log(`${index + 1}. [${result.inputType.toUpperCase()}] Q: "${result.question}"`);
    console.log(`   Formatted A: "${result.formattedAnswer}"`);
    console.log(`   Original A: "${result.originalAnswer}"`);
    console.log(`   Category: ${result.responseCategory || 'general'}`);
});

// Data Storage Test
console.log("\n=== Data Storage Test ===");
const newQuestion = "Do you currently have AWS certification?";
const newResult = findAnswerWithInputType(newQuestion, testAnswers, 'radio', nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds);
console.log(`New Question: ${newQuestion}`);
console.log(`Answer: ${newResult.formattedAnswer}`);
console.log(`Consistent: ${newResult.isConsistent}`);

// Show stored data
console.log("\n=== Stored Response Data ===");
const storedData = getStoredResponses();
console.log(`Total stored questions: ${storedData.totalQuestions}`);
storedData.responses.slice(0, 5).forEach(([key, data], index) => {
    console.log(`\n${index + 1}. Question: "${key}"`);
    console.log(`   Original Answer: "${data.originalAnswer}"`);
    console.log(`   Formatted Responses:`);
    Object.entries(data.formattedResponses).forEach(([inputType, response]) => {
        console.log(`     ${inputType}: "${response}"`);
    });
    if (data.category) {
        console.log(`   Category: ${data.category.category} (confidence: ${(data.category.confidence * 100).toFixed(1)}%)`);
    }
});

// Similar questions test
console.log("\n=== Similar Questions Test ===");
const similarQuestions = findSimilarQuestions("Do you possess a Class A driving license?", 0.4);
console.log("Similar questions found:", similarQuestions.length);
similarQuestions.slice(0, 2).forEach((similar, index) => {
    console.log(`${index + 1}. "${similar.question}" (similarity: ${(similar.similarity * 100).toFixed(1)}%)`);
});

// Save data demonstration
console.log("\n=== Save Data Demo ===");
const savedData = saveResponseData('test_responses.json');
console.log(`Saved ${savedData.storedResponses.length} responses`);

// Single test case
console.log("\n=== Single Test Case ===");
const singleResult = findBestAnswer(
    "Do you have a valid Class A license", 
    testAnswers, 
    nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds
);
console.log("Result:", singleResult);

const jobqustions = findAnswerWithInputType(newQuestion, testAnswers, 'radio', nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds);

// ===================================================
// MANY-TO-MANY RELATIONSHIP DEMONSTRATIONS
// ===================================================

console.log("\n" + "=".repeat(80));
console.log("🔄 MANY-TO-MANY ALGORITHM DEMONSTRATIONS");
console.log("=".repeat(80));

// Test 1: One Question → Multiple Relevant Answers
console.log("\n📋 TEST 1: Finding Multiple Answers for One Question");
console.log("─".repeat(60));

const questionWithMultipleAnswers = "What qualifications do you have?";
console.log(`Question: "${questionWithMultipleAnswers}"`);

const multipleAnswers = findAllRelevantAnswers(
    questionWithMultipleAnswers, 
    testAnswers, 
    nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds,
    3,  // minimum threshold
    6   // max results
);

console.log(`\nFound ${multipleAnswers.length} relevant answers:`);
multipleAnswers.forEach((match, i) => {
    console.log(`  ${i+1}. [Score: ${match.score}, ${match.relevanceLevel.toUpperCase()}] ${match.answer}`);
    console.log(`     Confidence: ${Math.round(match.confidence * 100)}%`);
});

// Test 2: Format Multiple Answers for Different Input Types
console.log("\n🎛️ TEST 2: Formatting for Different Input Types");
console.log("─".repeat(60));

const inputTypesToTest = ['text', 'radio', 'dropdown', 'checkbox'];
inputTypesToTest.forEach(inputType => {
    const formatted = formatMultipleAnswerResponse(multipleAnswers, inputType);
    console.log(`\n${inputType.toUpperCase()} Format:`);
    console.log(`  Primary Response: ${formatted.formattedResponse}`);
    
    if (formatted.alternatives) {
        console.log(`  Alternatives: ${formatted.alternatives.length} options`);
    }
    if (formatted.dropdownOptions) {
        console.log(`  Dropdown Options: ${formatted.dropdownOptions.length} choices`);
    }
    if (formatted.checkboxOptions) {
        console.log(`  Checkbox Options: ${formatted.checkboxOptions.length} selectable`);
    }
});

// Test 3: Comprehensive Many-to-Many Processing
console.log("\n🔄 TEST 3: Full Many-to-Many Processing");
console.log("─".repeat(60));

const questionsForManyToMany = [
    "Do you have truck driving experience?",
    "What certifications do you hold?", 
    "Are you available for work?",
    "What's your education background?",
    "Where are you located?"
];

const manyToManyResults = processMultipleAnswers(
    questionsForManyToMany, 
    testAnswers, 
    nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds,
    { minThreshold: 3, maxAnswers: 5, includeReverse: true }
);

console.log(`\nProcessed ${manyToManyResults.summary.totalQuestions} questions:`);
console.log(`✅ Questions with matches: ${manyToManyResults.summary.questionsWithMatches}`);
console.log(`🔢 Questions with multiple matches: ${manyToManyResults.summary.questionsWithMultipleMatches}`);
console.log(`📊 Average matches per question: ${manyToManyResults.summary.averageMatchesPerQuestion.toFixed(2)}`);

manyToManyResults.questionToAnswers.forEach(qa => {
    if (qa.matches.length > 0) {
        console.log(`\nQ: "${qa.question}"`);
        console.log(`   → ${qa.matches.length} answer(s):`);
        qa.matches.forEach(match => {
            console.log(`     • ${match.answer} (${Math.round(match.confidence * 100)}%)`);
        });
    }
});

// Test 4: Reverse Lookup (Answer → Questions)
console.log("\n🔍 TEST 4: Reverse Lookup - Answer to Questions");
console.log("─".repeat(60));

if (manyToManyResults.answerToQuestions) {
    console.log(`\nProcessed ${manyToManyResults.summary.totalAnswers} answers:`);
    console.log(`✅ Answers with matches: ${manyToManyResults.summary.answersWithMatches}`);
    console.log(`🔢 Answers with multiple matches: ${manyToManyResults.summary.answersWithMultipleMatches}`);
    
    manyToManyResults.answerToQuestions
        .filter(aq => aq.matchingQuestions.length > 1)  // Only show answers with multiple question matches
        .slice(0, 3)  // Show top 3 examples
        .forEach(aq => {
            console.log(`\nA: "${aq.answer}"`);
            console.log(`   ← ${aq.matchingQuestions.length} question(s) lead to this:`);
            aq.matchingQuestions.forEach(match => {
                console.log(`     • "${match.question}" (${Math.round(match.confidence * 100)}%)`);
            });
        });
}

// Test 5: Edge Cases and Performance
console.log("\n⚡ TEST 5: Edge Cases and Performance Analysis");
console.log("─".repeat(60));

const edgeQuestions = [
    "Tell me everything about trucking",  // Broad question
    "CDL",  // Very short question
    "Do you have experience with JavaScript programming and machine learning?",  // Outside domain
    ""  // Empty question
];

console.log("\nEdge case analysis:");
edgeQuestions.forEach(question => {
    if (question === "") {
        console.log(`Empty question → Skipped`);
        return;
    }
    
    const results = findAllRelevantAnswers(
        question, 
        testAnswers, 
        nouns, verbs, propernouns, subjects, userShortResponce, actionWorkds,
        2  // Lower threshold for edge cases
    );
    
    console.log(`"${question}"`);
    console.log(`  → Found ${results.length} matches (threshold ≥ 2)`);
    if (results.length > 0) {
        const topMatch = results[0];
        console.log(`  → Best: "${topMatch.answer}" (score: ${topMatch.score})`);
    }
});

// Test 6: Save Many-to-Many Results
console.log("\n💾 TEST 6: Saving Many-to-Many Data");
console.log("─".repeat(60));

console.log("\nSaving comprehensive many-to-many results...");
manyToManyResults.questionToAnswers.slice(0, 3).forEach(qa => {
    if (qa.matches.length > 0) {
        const response = {
            question: qa.question,
            multipleAnswers: qa.matches,
            timestamp: new Date().toISOString(),
            algorithmType: "many-to-many-weighted-similarity"
        };
        
        const serialized = {
            question: response.question,
            answerCount: response.multipleAnswers.length,
            answers: response.multipleAnswers.map(m => ({
                text: m.answer,
                score: m.score,
                confidence: Math.round(m.confidence * 100),
                relevance: m.relevanceLevel,
                rank: m.rank
            })),
            metadata: {
                timestamp: response.timestamp,
                algorithm: response.algorithmType
            }
        };
        
        console.log(`\n📄 Saved Response:`, JSON.stringify(serialized, null, 2));
    }
});

} // End of Indeed site check - closes the main conditional block



























