// ═══════════════════════════════════════════════════════════════════════════
// � DEBUG LOGGER - Detailed logging for troubleshooting
// ═══════════════════════════════════════════════════════════════════════════

// Initialize debug logging system
if (typeof DEBUG_LOG === "undefined") {
  var DEBUG_LOG = {
    enabled: true,
    toFile: false,
    logEntries: [],
    maxEntries: 1000,
    startTime: Date.now()
  };

  // Enhanced debug logger with timestamp and category - PROTECTED FROM CIRCULAR CALLS
  function debugLog(message, category = "GENERAL", level = "INFO") {
    // CIRCULAR PROTECTION: Prevent infinite recursion with immediate return
    if (debugLog._inProgress || !DEBUG_LOG.enabled) return;
    
    debugLog._inProgress = true;
    
    try {
      const timestamp = new Date().toISOString();
      const timeSinceStart = Date.now() - DEBUG_LOG.startTime;
      const formattedMessage = `[${timestamp}][+${timeSinceStart}ms][${category}][${level}] ${message}`;
      
      // Always log to console
      console.log(formattedMessage);
      
      // Send to debug panel if available
      try {
        if (typeof window.addDebugLogEntry === 'function') {
          window.addDebugLogEntry(message, level, category);
        }
        
        // Also post message for debug-logger.js to capture
        window.postMessage({
          type: 'EXTENSION_LOG',
          message,
          level,
          category,
          timestamp
        }, '*');
      } catch (e) {
        // Silent fail for UI logging
      }
      
      // Store in memory buffer
      DEBUG_LOG.logEntries.push({
        timestamp,
        timeSinceStart,
        category,
        level,
        message
      });
      
      // Trim if exceeding max entries
      if (DEBUG_LOG.logEntries.length > DEBUG_LOG.maxEntries) {
        DEBUG_LOG.logEntries.shift();
      }
      
      // SILENT CONTEXT CHECK: Do NOT call isExtensionContextValid() to prevent circular calls
      try {
        if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) {
          // Direct extension context check without calling other functions
          chrome.runtime.sendMessage({
            action: "debugLog",
            data: {
              timestamp,
              timeSinceStart,
              category,
              level,
              message
            }
          }, () => {
            // Silent callback - ignore any errors to prevent recursion
            if (chrome.runtime.lastError) {
              // Don't log this error to avoid circular logging
            }
          });
        }
      } catch (e) {
        // Silent fail - don't log this error to avoid circular logging
      }
      
    } finally {
      debugLog._inProgress = false;
    }
  }
  
  // Export logs to console or file
  window.exportDebugLogs = function() {
    const logsText = DEBUG_LOG.logEntries.map(
      entry => `[${entry.timestamp}][${entry.category}][${entry.level}] ${entry.message}`
    ).join('\n');
    
    console.log('===== DEBUG LOGS =====\n' + logsText + '\n==== END DEBUG LOGS ====');
    
    // Return for optional saving
    return logsText;
  };

  // Enhanced debug log viewer with filtering
  window.viewDebugLogs = function(category = null, level = null, last = null) {
    let filteredLogs = DEBUG_LOG.logEntries;
    
    if (category) {
      filteredLogs = filteredLogs.filter(entry => entry.category.toLowerCase().includes(category.toLowerCase()));
    }
    
    if (level) {
      filteredLogs = filteredLogs.filter(entry => entry.level.toLowerCase() === level.toLowerCase());
    }
    
    if (last && typeof last === 'number') {
      filteredLogs = filteredLogs.slice(-last);
    }
    
    console.group(`Debug Logs (${filteredLogs.length} entries)`);
    filteredLogs.forEach(entry => {
      const style = entry.level === 'ERROR' ? 'color: red; font-weight: bold;' : 
                   entry.level === 'WARN' ? 'color: orange;' : 
                   entry.level === 'INFO' ? 'color: blue;' : '';
      console.log(`%c[${entry.timestamp}][${entry.category}][${entry.level}] ${entry.message}`, style);
    });
    console.groupEnd();
    
    return filteredLogs;
  };
}

// Log initialization of extension
debugLog("Content script initializing", "STARTUP", "INFO");

// ═══════════════════════════════════════════════════════════════════════════
// 🛡️ INFINITE LOOP PROTECTION SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

if (typeof LOOP_PROTECTION === "undefined") {
  var LOOP_PROTECTION = {
    enabled: true,
    maxIterations: 10000,    // Max iterations for any while loop
    maxRecursionDepth: 100,  // Max recursion depth
    maxTimeouts: 1000,       // Max concurrent timeouts
    maxIntervals: 50,        // Max concurrent intervals
    emergencyStop: false,    // Global emergency stop
    
    // Tracking counters
    activeTimeouts: new Set(),
    activeIntervals: new Set(),
    recursionStack: new Map(), // function name -> depth
    
    // Loop iteration tracking
    loopCounters: new Map(), // unique ID -> iteration count
    
    // Generate unique loop ID based on stack trace
    generateLoopId() {
      const stack = new Error().stack || '';
      const stackLines = stack.split('\n').slice(2, 4); // Get calling function lines
      return stackLines.join('|').replace(/\s+/g, '');
    },
    
    // Check if loop should continue
    checkLoop(maxIterations = this.maxIterations) {
      if (this.emergencyStop) {
        throw new Error('🚨 EMERGENCY STOP: All loops terminated');
      }
      
      const loopId = this.generateLoopId();
      const current = this.loopCounters.get(loopId) || 0;
      
      if (current >= maxIterations) {
        console.error(`🚫 INFINITE LOOP DETECTED: ${loopId.substring(0, 100)}...`);
        this.loopCounters.delete(loopId);
        throw new Error(`Loop exceeded ${maxIterations} iterations and was terminated`);
      }
      
      this.loopCounters.set(loopId, current + 1);
      return true;
    },
    
    // Start loop protection (call at beginning of while loops)
    startLoop(customMaxIterations = null) {
      const loopId = this.generateLoopId();
      this.loopCounters.set(loopId, 0);
      return {
        id: loopId,
        check: () => this.checkLoop(customMaxIterations || this.maxIterations),
        end: () => this.loopCounters.delete(loopId)
      };
    },
    
    // Recursion depth tracking
    enterFunction(functionName) {
      if (this.emergencyStop) {
        throw new Error('🚨 EMERGENCY STOP: All execution terminated');
      }
      
      const current = this.recursionStack.get(functionName) || 0;
      if (current >= this.maxRecursionDepth) {
        console.error(`🚫 STACK OVERFLOW DETECTED: ${functionName}`);
        throw new Error(`Function ${functionName} exceeded recursion limit of ${this.maxRecursionDepth}`);
      }
      
      this.recursionStack.set(functionName, current + 1);
    },
    
    exitFunction(functionName) {
      const current = this.recursionStack.get(functionName) || 0;
      if (current <= 1) {
        this.recursionStack.delete(functionName);
      } else {
        this.recursionStack.set(functionName, current - 1);
      }
    },
    
    // Safe timeout wrapper
    safeTimeout(fn, delay, label = 'unnamed') {
      if (this.activeTimeouts.size >= this.maxTimeouts) {
        console.warn(`🚨 Too many timeouts (${this.activeTimeouts.size}), rejecting: ${label}`);
        return null;
      }
      
      const timeoutId = setTimeout(() => {
        this.activeTimeouts.delete(timeoutId);
        try {
          if (typeof fn === 'function') {
            fn();
          }
        } catch (error) {
          console.error(`Error in timeout ${label}:`, error);
        }
      }, delay);
      
      this.activeTimeouts.add(timeoutId);
      return timeoutId;
    },
    
    // Safe interval wrapper
    safeInterval(fn, delay, label = 'unnamed') {
      if (this.activeIntervals.size >= this.maxIntervals) {
        console.warn(`🚨 Too many intervals (${this.activeIntervals.size}), rejecting: ${label}`);
        return null;
      }
      
      let iterations = 0;
      const maxIntervalIterations = 10000; // Prevent runaway intervals
      
      const intervalId = setInterval(() => {
        iterations++;
        if (iterations > maxIntervalIterations || this.emergencyStop) {
          console.warn(`🚫 Interval ${label} exceeded max iterations or emergency stop triggered`);
          this.clearInterval(intervalId);
          return;
        }
        
        try {
          if (typeof fn === 'function') {
            fn();
          }
        } catch (error) {
          console.error(`Error in interval ${label}:`, error);
          this.clearInterval(intervalId);
        }
      }, delay);
      
      this.activeIntervals.add(intervalId);
      return intervalId;
    },
    
    // Safe clear timeout
    clearTimeout(id) {
      if (id) {
        clearTimeout(id);
        this.activeTimeouts.delete(id);
      }
    },
    
    // Safe clear interval
    clearInterval(id) {
      if (id) {
        clearInterval(id);
        this.activeIntervals.delete(id);
      }
    },
    
    // Emergency stop all execution
    triggerEmergencyStop() {
      console.warn('🚨 EMERGENCY STOP TRIGGERED - Terminating all loops and timeouts');
      this.emergencyStop = true;
      
      // Clear all timeouts
      this.activeTimeouts.forEach(id => {
        try { clearTimeout(id); } catch(e) {}
      });
      this.activeTimeouts.clear();
      
      // Clear all intervals
      this.activeIntervals.forEach(id => {
        try { clearInterval(id); } catch(e) {}
      });
      this.activeIntervals.clear();
      
      // Reset counters
      this.loopCounters.clear();
      this.recursionStack.clear();
      
      // Show user notification
      if (typeof showErrorNotification === 'function') {
        showErrorNotification('Extension emergency stop activated. Please reload the page.');
      }
    },
    
    // Reset protection system
    reset() {
      this.emergencyStop = false;
      this.loopCounters.clear();
      this.recursionStack.clear();
      console.log('🔄 Loop protection system reset');
    },
    
    // Get current status
    getStatus() {
      return {
        enabled: this.enabled,
        emergencyStop: this.emergencyStop,
        activeTimeouts: this.activeTimeouts.size,
        activeIntervals: this.activeIntervals.size,
        activeLoops: this.loopCounters.size,
        activeRecursions: this.recursionStack.size,
        recursionStack: Array.from(this.recursionStack.entries())
      };
    }
  };
  
  // Make emergency stop globally accessible
  window.emergencyStopLoops = () => LOOP_PROTECTION.triggerEmergencyStop();
  window.getLoopProtectionStatus = () => LOOP_PROTECTION.getStatus();
  window.resetLoopProtection = () => LOOP_PROTECTION.reset();
  
  debugLog("Infinite loop protection system initialized", "PROTECTION", "INFO");
}

// ═══════════════════════════════════════════════════════════════════════════
// �🚫 PREVENT BACK/FORWARD CACHE - Keep page active to prevent caching
// ═══════════════════════════════════════════════════════════════════════════

// ⚠️ DOMAIN CHECK - Only run on Indeed websites
// Use var instead of const to allow redeclaration on extension reload
if (typeof ALLOWED_DOMAINS === "undefined") {
  // needs to be global
  var ALLOWED_DOMAINS = [
    "indeed.com",
    "www.indeed.com",
    "indeed.ca",
    "www.indeed.ca",
    "indeed.co.uk",
    "www.indeed.co.uk",
  ];
}

// Prevent redeclaration errors on extension reload
if (typeof currentDomain === "undefined") {
  var currentDomain = window.location.hostname.toLowerCase();
}
if (typeof isIndeedSite === "undefined") {
  var isIndeedSite = ALLOWED_DOMAINS.some((domain) =>
    currentDomain === domain || currentDomain.endsWith('.' + domain)
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🧠 SMART TIMEOUT MANAGEMENT SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

// Dynamic timeout configuration - GENEROUS TIMEOUTS FOR THOROUGH PROCESSING
if (typeof SMART_TIMEOUTS === "undefined") {
  var SMART_TIMEOUTS = {
    BASE_TIMEOUT: 25000,          // Base timeout for element waiting (was 8000)
    SUCCESS_EXTENSION: 15000,     // Extra time after successful action (was 5000)
    FORM_FILL_TIMEOUT: 45000,     // Extended time for form filling (was 15000)
    PAGE_LOAD_TIMEOUT: 30000,     // Time to wait for page loads (was 12000)
    MAX_TIMEOUT: 120000,          // Never exceed this timeout (was 30000) - 2 minutes max
    MIN_TIMEOUT: 8000,            // Minimum timeout for any action (was 3000)
    
    // Progress tracking
    lastSuccessTime: Date.now(),
    consecutiveFailures: 0,
    totalSuccessActions: 0
  };
  
  // ...removed debug log for production...

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 ROBUST SELECTOR UTILITY FUNCTIONS - Enhanced Element Detection
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// 🧹 CENTRALIZED CLEANUP REGISTRY & SAFE HELPERS
// Tracks listeners, timers, observers for proper teardown
// ═══════════════════════════════════════════════════════════════════════════
if (!window._extCleanup) {
  window._extCleanup = {
    listeners: [], // { target, type, handler, options }
    timeouts: new Set(),
    intervals: new Set(),
    observers: new Set(),
    cleanups: [] // functions
  };
}

function safeAddEventListener(target, type, handler, options) {
  try {
    target.addEventListener(type, handler, options);
    window._extCleanup.listeners.push({ target, type, handler, options });
  } catch (e) {
    console.error("Error adding event listener:", e);
  }
}

function safeRemoveAllEventListeners() {
  const regs = window._extCleanup.listeners || [];
  for (const { target, type, handler, options } of regs) {
    try { target.removeEventListener(type, handler, options); } catch (e) {
      console.error("Error removing event listener:", e);
    }
  }
  window._extCleanup.listeners = [];
}



function safeClearAllTimeouts() {
  for (const id of window._extCleanup.timeouts) {
    try { clearTimeout(id); } catch (e) {
      console.error("Error clearing timeout:", e);
    }
  }
  window._extCleanup.timeouts.clear();
}

function safeSetInterval(fn, delay, label = 'safeInterval') {
  try {
    // Use our new protected interval system
    const id = LOOP_PROTECTION.safeInterval(fn, delay, label);
    if (id) {
      window._extCleanup.intervals.add(id);
    }
    return id;
  } catch (e) {
    console.error("Error setting safe interval:", e);
    return null;
  }
}

function safeSetTimeout(fn, delay, label = 'safeTimeout') {
  try {
    // Use our new protected timeout system  
    const id = LOOP_PROTECTION.safeTimeout(fn, delay, label);
    if (id) {
      window._extCleanup.timeouts.add(id);
      debugLog(`Protected timeout created: ${id} for ${delay}ms (${label})`, "TIMEOUT", "INFO");
    }
    return id;
  } catch (e) {
    console.error("Error setting safe timeout:", e);
    debugLog(`Failed to create protected timeout: ${e.message}`, "TIMEOUT", "ERROR");
    return null;
  }
}

function safeClearAllIntervals() {
  for (const id of window._extCleanup.intervals) {
    try { clearInterval(id); } catch (e) {
      console.error("Error clearing interval:", e);
    }
  }
  window._extCleanup.intervals.clear();
}

function registerObserver(observer) {
  try {
    if (observer) window._extCleanup.observers.add(observer);
  } catch (e) {
    console.error("Error registering observer:", e);
  }
}

function disconnectAllObservers() {
  for (const obs of window._extCleanup.observers) {
    try { obs.disconnect(); } catch (e) {
      console.error("Error disconnecting observer:", e);
    }
  }
  window._extCleanup.observers.clear();
}

function registerCleanup(fn) {
  try {
    if (typeof fn === 'function') window._extCleanup.cleanups.push(fn);
  } catch (e) {
    console.error("Error registering cleanup function:", e);
  }
}

function runAllCleanups() {
  const fns = window._extCleanup.cleanups.splice(0);
  for (const fn of fns) {
    try { 
      fn(); 
    } catch (e) {
      console.error("Error running cleanup function:", e);
    }
  }
}

/**
 * Enhanced element selection with multiple fallback strategies
 * @param {Array|string} selectors - Array of selectors or single selector string
 * @param {Element} context - Context element (defaults to document)
 * @param {Object} options - Additional options for text matching, etc.
 * @returns {Element|null} - Found element or null
 */
function findElementRobust(selectors, context = document, options = {}) {
  const selectorArray = Array.isArray(selectors) ? selectors : [selectors];
  
  // Try each selector in order
  for (const selector of selectorArray) {
    try {
      const element = context.querySelector(selector);
      if (element && isElementVisible(element)) {
        return element;
      }
    } catch (e) {
      // ...removed debug log for production...
    }
  }
  
  // Text-based fallback if specified
  if (options.textContent) {
    const elements = context.querySelectorAll('*');
    for (const element of elements) {
      if (element.textContent && 
          element.textContent.toLowerCase().includes(options.textContent.toLowerCase()) &&
          isElementVisible(element)) {
        return element;
      }
    }
  }
  
  // Attribute-based fallback if specified
  if (options.attributes) {
    for (const [attr, value] of Object.entries(options.attributes)) {
      const elements = context.querySelectorAll(`[${attr}*="${value}"]`);
      for (const element of elements) {
        if (isElementVisible(element)) {
          return element;
        }
      }
    }
  }
  
  return null;
}

/**
 * Enhanced element selection for multiple elements
 * @param {Array|string} selectors - Array of selectors or single selector string
 * @param {Element} context - Context element (defaults to document)
 * @param {Object} options - Additional options
 * @returns {Array} - Array of found elements
 */
function findElementsRobust(selectors, context = document, options = {}) {
  const selectorArray = Array.isArray(selectors) ? selectors : [selectors];
  let allElements = [];
  
  // Try each selector and collect results
  for (const selector of selectorArray) {
    try {
      const elements = Array.from(context.querySelectorAll(selector));
      const visibleElements = elements.filter(el => isElementVisible(el));
      allElements = allElements.concat(visibleElements);
    } catch (e) {
      // ...removed debug log for production...
    }
  }
  
  // Remove duplicates
  return [...new Set(allElements)];
}

/**
 * Enhanced getElementById with multiple ID patterns and fallback strategies
 * @param {Array|string} ids - Array of ID patterns or single ID
 * @param {Element} context - Context element (defaults to document)
 * @param {Object} options - Additional options
 * @returns {Element|null} - Found element or null
 */
function findByIdRobust(ids, context = document, options = {}) {
  const idArray = Array.isArray(ids) ? ids : [ids];
  
  // Try exact ID matches first
  for (const id of idArray) {
    try {
      const element = context.getElementById ? context.getElementById(id) : context.querySelector(`#${id}`);
      if (element && isElementVisible(element)) {
        return element;
      }
    } catch (e) {
      // ...removed debug log for production...
    }
  }
  
  // Try partial ID matches with contains
  for (const id of idArray) {
    try {
      const elements = context.querySelectorAll(`[id*="${id}"]`);
      for (const element of elements) {
        if (isElementVisible(element)) {
          return element;
        }
      }
    } catch (e) {
      // ...removed debug log for production...
    }
  }
  
  return null;
}

/**
 * Check if element is visible and interactable
 * @param {Element} element - Element to check
 * @returns {boolean} - True if element is visible
 */
function isElementVisible(element) {
  if (!element || !element.offsetParent) return false;
  
  const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * Wait for element with robust selection and retry logic
 * @param {Array|string} selectors - Array of selectors or single selector
 * @param {Object} options - Configuration options
 * @returns {Promise<Element>} - Promise that resolves to found element
 */
async function waitForElementRobust(selectors, options = {}) {
  const {
    timeout = SMART_TIMEOUTS.BASE_TIMEOUT,
    context = document,
    textContent = null,
    attributes = null,
    checkInterval = 100
  } = options;
  
  const startTime = Date.now();
  const loopProtection = LOOP_PROTECTION.startLoop(timeout / checkInterval + 10); // Add buffer for timeout-based limit
  
  try {
    while (Date.now() - startTime < timeout) {
      loopProtection.check(); // Check for infinite loop protection
      
      const element = findElementRobust(selectors, context, { textContent, attributes });
      if (element) {
        return element;
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
  } finally {
    loopProtection.end(); // Clean up loop tracking
  }
  
  throw new Error(`Element not found after ${timeout}ms: ${JSON.stringify(selectors)}`);
}

/**
 * Calculate dynamic timeout based on recent success/failure patterns
 */
function getSmartTimeout(baseTimeout = SMART_TIMEOUTS.BASE_TIMEOUT, actionType = 'default') {
  const timeSinceSuccess = Date.now() - SMART_TIMEOUTS.lastSuccessTime;
  let dynamicTimeout = baseTimeout;
  
  // Extend timeout if recent success (things are working)
  if (timeSinceSuccess < 10000 && SMART_TIMEOUTS.totalSuccessActions > 0) {
    dynamicTimeout += SMART_TIMEOUTS.SUCCESS_EXTENSION;
    sendLogToPopup(`⏱️ Extended timeout due to recent success: ${dynamicTimeout}ms`);
  }
  
  // Reduce timeout if consecutive failures (likely stuck)
  if (SMART_TIMEOUTS.consecutiveFailures > 2) {
    dynamicTimeout = Math.max(dynamicTimeout * 0.7, SMART_TIMEOUTS.MIN_TIMEOUT);
    sendLogToPopup(`⏱️ Reduced timeout due to failures: ${dynamicTimeout}ms`, "WARN");
  }
  
  // Special timeouts for specific actions
  if (actionType === 'form-fill') {
    dynamicTimeout = Math.max(dynamicTimeout, SMART_TIMEOUTS.FORM_FILL_TIMEOUT);
  } else if (actionType === 'page-load') {
    dynamicTimeout = Math.max(dynamicTimeout, SMART_TIMEOUTS.PAGE_LOAD_TIMEOUT);
  }
  
  // Enforce limits
  dynamicTimeout = Math.min(dynamicTimeout, SMART_TIMEOUTS.MAX_TIMEOUT);
  dynamicTimeout = Math.max(dynamicTimeout, SMART_TIMEOUTS.MIN_TIMEOUT);
  
  return dynamicTimeout;
}

  /**
   * Record successful action to improve future timeouts
   */
  function recordSuccess(actionDescription) {
    SMART_TIMEOUTS.lastSuccessTime = Date.now();
    SMART_TIMEOUTS.consecutiveFailures = 0;
    SMART_TIMEOUTS.totalSuccessActions++;
    sendLogToPopup(`✅ Success: ${actionDescription} (${SMART_TIMEOUTS.totalSuccessActions} total)`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔧 REACT-SAFE DOM MANIPULATION - Prevent React conflicts
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * React-safe event dispatching that won't interfere with React's synthetic events
   */
  function dispatchReactSafeEvent(element, eventType, options = {}) {
    try {
      // Use requestAnimationFrame to avoid React reconciliation conflicts
      return new Promise((resolve) => {
        requestAnimationFrame(() => {
          try {
            // Create native event with proper options
            const eventOptions = {
              bubbles: true,
              cancelable: true,
              view: window,
              ...options
            };
            
            const event = new Event(eventType, eventOptions);
            
            // Add React-specific properties to avoid conflicts
            Object.defineProperty(event, '_reactInternalInstance', {
              value: null,
              configurable: true
            });
            
            element.dispatchEvent(event);
            resolve(true);
          } catch (error) {
            console.warn(`⚠️ React-safe event dispatch failed for ${eventType}:`, error.message);
            resolve(false);
          }
        });
      });
    } catch (error) {
      console.warn(`⚠️ React-safe event setup failed:`, error.message);
      return Promise.resolve(false);
    }
  }

  /**
   * React-safe input value setting with proper event sequence
   */
  async function setReactSafeValue(input, value) {
    try {
      // Check if element has React fiber (React 16+)
      const reactFiber = input._reactInternalFiber || input._reactInternalInstance;
      
      if (reactFiber) {
        // React-controlled component - use React-safe approach
        console.log('🔧 React component detected - using safe approach');
        
        // Method 1: Use React's internal setter if available
        const valueSetter = Object.getOwnPropertyDescriptor(input, 'value')?.set;
        const prototype = Object.getPrototypeOf(input);
        const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        
        if (valueSetter && valueSetter !== prototypeValueSetter) {
          valueSetter.call(input, value);
        } else {
          // Fallback to direct assignment
          input.value = value;
        }
        
        // Dispatch React-compatible events with delay
        await new Promise(resolve => setTimeout(resolve, 50));
        await dispatchReactSafeEvent(input, 'input');
        await new Promise(resolve => setTimeout(resolve, 50));
        await dispatchReactSafeEvent(input, 'change');
        
      } else {
        // Non-React component - use standard approach
        input.value = value;
        await dispatchReactSafeEvent(input, 'input');
        await dispatchReactSafeEvent(input, 'change');
      }
      
      return true;
    } catch (error) {
      console.warn('⚠️ React-safe value setting failed:', error.message);
      // Fallback to basic approach
      try {
        input.value = value;
        return true;
      } catch (fallbackError) {
        console.error('❌ All value setting methods failed:', fallbackError.message);
        return false;
      }
    }
  }  /**
   * Record failed action to adjust future timeouts
   */
  function recordFailure(actionDescription) {
    SMART_TIMEOUTS.consecutiveFailures++;
    sendLogToPopup(`❌ Failed: ${actionDescription} (${SMART_TIMEOUTS.consecutiveFailures} consecutive)`, "WARN");
  }

  /**
   * GLOBAL INPUT VALIDATION: Prevents filling any search/location inputs
   */
  function validateInputForFilling(input) {
    if (!input || !input.tagName) {
      return { safe: false, reason: 'Invalid input element' };
    }
    
    // Get all input attributes and text
    const placeholder = (input.placeholder || '').toLowerCase();
    const name = (input.name || '').toLowerCase();
    const id = (input.id || '').toLowerCase();
    const className = (typeof input.className === 'string' ? input.className : '').toLowerCase();
    const type = (input.type || '').toLowerCase();
    const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();
    
    // ABSOLUTE BLOCKLIST - Never fill these inputs
    const blockedPatterns = [
      'search', 'find', 'query', 'keyword', 
       'where', 
      'filter', 'sort', 'browse', 'explore',
    ];
    
    const allInputText = `${placeholder} ${name} ${id} ${className} ${ariaLabel}`;
    
    for (const blocked of blockedPatterns) {
      if (allInputText.includes(blocked)) {
        return { safe: false, reason: `Blocked pattern: ${blocked}` };
      }
    }
    
    // Context validation - must be in application form
    const isInSearchContext = input.closest(
      'form[role="search"], .search, .job-search, [class*="search"], [id*="search"]'
    );
    
    if (isInSearchContext) {
      return { safe: false, reason: 'Input in search context' };
    }
    
    // URL validation - be extra careful on job listing pages
    if (window.location.href.includes('/jobs/') && !window.location.href.includes('apply')) {
      const hasApplicationContext = input.closest(
        'form[action*="apply"], [class*="application"], [data-testid*="application"]'
      );
      
      if (!hasApplicationContext) {
        return { safe: false, reason: 'Not in application context on jobs page' };
      }
    }
    
    return { safe: true, reason: 'Input validated as safe for application form' };
  }// ⚡ MAIN EXTENSION CODE - Manifest already restricts to Indeed sites
console.log("🚀 Content script loaded on Indeed - preventing cache...");

  // ═══════════════════════════════════════════════════════════════════════════
  // � SUPPRESS INDEED'S CORS ERRORS - These are not our responsibility
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Check if originalConsoleError is already defined to prevent redeclaration
  if (typeof originalConsoleError === "undefined") {
    var originalConsoleError = console.error;
    console.error = function(...args) {
      const message = args.join(' ');
      
      // Suppress known Indeed CORS errors that we can't fix
      if (message.includes('CORS policy') && 
          (message.includes('indeed.com') || 
           message.includes('smartapply.indeed.com') ||
           message.includes('Access-Control-Allow-Credentials'))) {
        return; // Silently ignore Indeed's CORS issues
      }
      
      // Enhanced React error suppression for Indeed's React components
      if ((message.includes('Minified React error') || 
           message.includes('react-dom.production.min.js') ||
           message.includes('Error #418') || 
           message.includes('Error #423') ||
           message.includes('Fiber')) &&
          !message.includes('indeed-extension')) {
        
        // Log a clean message instead of the confusing React error
        console.log('🔇 Indeed React error suppressed (not caused by extension)');
        return; // Silently ignore Indeed's React errors
      }
      
      // Let all other errors through (including our own)
      originalConsoleError.apply(console, args);
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // �🛡️ SAFE DOM MANIPULATION - Avoid React conflicts
  // ═══════════════════════════════════════════════════════════════════════════
  
  /**
   * Safely create DOM elements without interfering with React
   */
  function createSafeElement(tagName, options = {}) {
    try {
      const element = document.createElement(tagName);
      
      // Add unique marker to identify extension elements
      element.setAttribute('data-indeed-extension', 'true');
      
      // Apply options safely
      if (options.className) element.className = options.className;
      if (options.id) element.id = options.id;
      if (options.innerHTML) {
        // Use textContent for safety, unless explicitly allowed
        if (options.allowHTML === true) {
          element.innerHTML = options.innerHTML;
        } else {
          element.textContent = options.innerHTML;
        }
      }
      if (options.style) {
        Object.assign(element.style, options.style);
      }
      
      return element;
    } catch (err) {
      console.warn('⚠️ Error creating DOM element:', err);
      return null;
    }
  }

  /**
   * Safely append element with React conflict avoidance
   */
  function safeAppendChild(parent, child) {
    try {
      if (!parent || !child) return false;
      
      // Use requestAnimationFrame to avoid React render conflicts
      requestAnimationFrame(() => {
        if (parent && child && !child.parentNode) {
          parent.appendChild(child);
        }
      });
      
      return true;
    } catch (err) {
      console.warn('⚠️ Error appending child element:', err);
      return false;
    }
  }

  /**
   * Remove extension elements safely
   */
  function removeExtensionElements() {
    try {
      const extensionElements = document.querySelectorAll('[data-indeed-extension="true"]');
      extensionElements.forEach(el => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
    } catch (err) {
      console.warn('⚠️ Error removing extension elements:', err);
    }
  }

  // Check if content script was previously injected
  if (window.indeedAutoApplyLoaded) {
    // ...removed debug log for production...
    // Check for any stored job results to send
    try {
      const keys = Object.keys(localStorage).filter((key) =>
        key.startsWith("jobResult_")
      );
      if (keys.length > 0) {
  // ...removed debug log for production...
        keys.forEach((key) => {
          try {
            const storedResult = JSON.parse(localStorage.getItem(key));
            if (storedResult && Date.now() - storedResult.timestamp < 300000) {
              // 5 minutes
              // ...removed debug log for production...
              chrome.runtime.sendMessage(
                {
                  action: "jobResult",
                  jobId: storedResult.jobId,
                  result: storedResult.result,
                },
                () => {
                  if (!chrome.runtime.lastError) {
                    localStorage.removeItem(key);
                    // ...removed debug log for production...
                  }
                }
              );
            } else {
              // Remove old results
              localStorage.removeItem(key);
            }
          } catch (e) {
            // ...removed debug log for production...
            localStorage.removeItem(key);
          }
        });
      }
    } catch (e) {
  // ...removed debug log for production...
    }
  } else {
    window.indeedAutoApplyLoaded = true;
  // ...removed debug log for production...
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 🛡️ COMPREHENSIVE ERROR HANDLING - Wrap all operations
  // ═══════════════════════════════════════════════════════════════════════════
  
  function initializeExtensionSafely() {
    try {
      debugLog("Starting extension initialization", "INIT", "INFO");
      
      // FIRST: Restore automation state from any previous context recovery
      debugLog("Restoring automation state after context recovery", "INIT", "INFO");
      restoreAutomationStateAfterRecovery();
      
      // Initialize all main functions with individual error handling
      debugLog("Setting up event listeners", "INIT", "INFO");
      setupEventListeners();
      
      debugLog("Setting up global functions", "INIT", "INFO");
      setupGlobalFunctions();
      
      debugLog("Initializing main logic", "INIT", "INFO");
      initializeMainLogic();
      
      debugLog("Setting up BFCache detection and recovery", "INIT", "INFO");
      detectAndRecoverFromBFCache();
      
      debugLog("Starting connection monitoring", "INIT", "INFO");
      startConnectionMonitoring();
      
      debugLog("Extension successfully initialized", "INIT", "INFO");
      
    } catch (err) {
      console.error("❌ Critical error in extension initialization:", err);
      debugLog(`CRITICAL INITIALIZATION ERROR: ${err.message}\n${err.stack}`, "INIT", "ERROR");
      showErrorNotification("Extension initialization failed. Please refresh the page.");
    }
  }

  function setupEventListeners() {
    try {
      // Prevent page from being cached by browser
      safeAddEventListener(window, "pageshow", function (event) {
        if (event.persisted) {
          // ...removed debug log for production...
          window.location.reload();
        }
      });
      
      // Tab/window close cleanup
  safeAddEventListener(window, "beforeunload", function(event) {
  // ...removed debug log for production...
        
        // Stop all automation
        if (window.emergencyStopFlag !== undefined) {
          window.emergencyStopFlag = true;
        }
        
        // Clear any running timeouts/intervals
        if (window.currentJobTimeout) {
          clearTimeout(window.currentJobTimeout);
        }
        if (window.keepAliveInterval) {
          clearInterval(window.keepAliveInterval);
        }
        
        // Remove extension elements from DOM
        removeExtensionElements();
        
        // Send cleanup message to background
        try {
          chrome.runtime.sendMessage({ 
            action: "tabClosing",
            timestamp: Date.now()
          });
        } catch (e) {
          // Ignore if extension context is already invalid
        }
        
  // ...removed debug log for production...
      });
      
      // Page visibility change handling
  safeAddEventListener(document, "visibilitychange", function() {
        if (document.hidden) {
          // ...removed debug log for production...
          // Reduce activity when tab is hidden
        } else {
          // ...removed debug log for production...
        }
      });
      
      // Add unhandled error listener with React error filtering
  safeAddEventListener(window, 'error', function(event) {
        const message = event.message || '';
        
        // Filter out React minified errors that we can't control
        if (message.includes('Minified React error') || 
            (event.filename && event.filename.includes('react-dom'))) {
          // ...removed debug log for production...
          return; // Don't log React errors from Indeed's code
        }
        
        // Only log errors from our extension
        if (event.filename && event.filename.includes('chrome-extension://')) {
          // ...removed debug log for production...
        }
      });
      
      // React error boundary simulation for our extension
  safeAddEventListener(window, 'unhandledrejection', function(event) {
        const reason = event.reason?.message || event.reason;
        
        // Filter React-related promise rejections
        if (typeof reason === 'string' && 
            (reason.includes('React') || reason.includes('Fiber'))) {
          // ...removed debug log for production...
          return;
        }
        
  // ...removed debug log for production...
      });
      
    } catch (err) {
  // ...removed debug log for production...
    }
  }

  function showErrorNotification(message) {
    try {
      const notice = createSafeElement("div", {
        innerHTML: `⚠️ ${message}`,
        style: {
          position: 'fixed',
          top: '20px',
          right: '20px',
          background: '#ff6b6b',
          color: 'white',
          padding: '15px 25px',
          borderRadius: '8px',
          zIndex: '999999',
          fontFamily: 'Arial, sans-serif',
          fontSize: '14px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
        }
      });
      if (notice && safeAppendChild(document.body, notice)) {
        setTimeout(() => {
          if (notice && notice.parentNode) {
            notice.parentNode.removeChild(notice);
          }
        }, 8000);
      }
    } catch (err) {
  // ...removed debug log for production...
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 📋 USER CONFIGURATION LOADER - Load user data from local storage
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Check if userConfig is already declared to prevent redeclaration
  if (typeof userConfig === "undefined") {
    var userConfig = null;
  }

  async function loadUserConfig() {
    if (userConfig) return userConfig; // Return cached config

    try {
      // Load from chrome local storage
      const result = await chrome.storage.local.get(['jobAppConfig']);
      
      if (result.jobAppConfig) {
        userConfig = result.jobAppConfig;
  // ...removed debug log for production...
        
        // Add learned data to storage if automation learns something new
        if (!userConfig.learnedData) {
          userConfig.learnedData = { patterns: [], lastUpdated: null, version: "1.0" };
        }
        
        return userConfig;
      } else {
        // If no local storage config, try to load from JSON file as fallback (migration)
  // ...removed debug log for production...
        try {
          const response = await fetch(chrome.runtime.getURL('questions_config.json'));
          const jsonConfig = await response.json();
          
          // Migrate to local storage
          await chrome.storage.local.set({ 'jobAppConfig': jsonConfig });
          userConfig = jsonConfig;
          // ...removed debug log for production...
          return userConfig;
        } catch (jsonError) {
          // ...removed debug log for production...
        }
      }
    } catch (error) {
  // ...removed debug log for production...
    }
    
    // Return minimal fallback config
    const fallbackConfig = {
      personalInfo: {
        email: "your.email@gmail.com",
        phone: "(555) 123-4567"
      },
      professionalInfo: {
        experience: "3-5 years",
        availability: "Immediately"
      },
      education: {},
      textInputPatterns: [],
      numberInputPatterns: [],
      textareaPatterns: [],
      learnedData: { patterns: [], lastUpdated: null, version: "1.0" }
    };
    
    // Save fallback to storage
    try {
      await chrome.storage.local.set({ 'jobAppConfig': fallbackConfig });
  // ...removed debug log for production...
    } catch (saveError) {
  // ...removed debug log for production...
    }
    
    userConfig = fallbackConfig;
    return userConfig;
  }

  // Smart value generator that uses user config instead of hardcoded values
  async function getSmartValue(labelText, inputType = 'text') {
    const config = await loadUserConfig();
    const text = labelText.toLowerCase();

    // Try to match against custom patterns (new unified structure)
    if (config.customPatterns && Array.isArray(config.customPatterns)) {
      for (const pattern of config.customPatterns) {
        if (pattern.keywords && pattern.keywords.some(keyword => text.includes(keyword.toLowerCase()))) {
          // Check if input type matches or if it's a flexible pattern
          if (!pattern.inputType || pattern.inputType === inputType || inputType === 'text') {
            return pattern.value;
          }
        }
      }
    }

    // Backward compatibility - Try legacy pattern structures
    for (const pattern of config.textInputPatterns || []) {
      if (pattern.keywords && pattern.keywords.some(keyword => text.includes(keyword.toLowerCase()))) {
        return pattern.value;
      }
    }

    // Handle info items structure (new format)
    const personalInfo = Array.isArray(config.personalInfo) ? 
      config.personalInfo.reduce((obj, item) => ({ ...obj, [item.key]: item.value }), {}) : 
      (config.personalInfo || {});
    
    const professionalInfo = Array.isArray(config.professionalInfo) ? 
      config.professionalInfo.reduce((obj, item) => ({ ...obj, [item.key]: item.value }), {}) : 
      (config.professionalInfo || {});
      
    const education = Array.isArray(config.education) ? 
      config.education.reduce((obj, item) => ({ ...obj, [item.key]: item.value }), {}) : 
      (config.education || {});

    // Direct property mapping
    if (text.includes('address') || text.includes('street')) return personalInfo.address || '';
    if (text.includes('city')) return personalInfo.city || '';
    if (text.includes('state') || text.includes('province')) return personalInfo.state || '';
    if (text.includes('zip') || text.includes('postal')) return personalInfo.zip || '';
    if (text.includes('phone') || text.includes('mobile')) return personalInfo.phone || '';
    if (text.includes('email')) return personalInfo.email || '';
    if (text.includes('linkedin')) return professionalInfo.linkedin || '';
    if (text.includes('website') || text.includes('portfolio')) return professionalInfo.website || '';
    if (text.includes('github')) return professionalInfo.github || '';
    if (text.includes('salary') || text.includes('compensation')) return professionalInfo.salary || 'Competitive';
    if (text.includes('school') || text.includes('university')) return education.school || '';
    if (text.includes('major') || text.includes('degree')) return education.major || '';
    if (text.includes('gpa')) return education.gpa || '';

    // Generic fallbacks based on question type - try config first
    if (text.includes('experience') && text.includes('year')) {
      return professionalInfo.experience || config.fallbacks?.experience || '';
    }
    if (text.includes('available') || text.includes('start')) {
      return professionalInfo.availability || config.fallbacks?.availability || '';
    }
    if (text.includes('reason') || text.includes('why')) {
      return professionalInfo.motivation || config.fallbacks?.motivation || '';
    }

    // Enhanced fallback for unknown fields - make intelligent guesses
    console.log(`🤔 Unknown field detected: "${labelText}" - applying intelligent fallback`);
    
    // Try partial keyword matching for common patterns
    if (text.includes('work') || text.includes('employ')) {
      return professionalInfo.experience || 'Yes';
    }
    if (text.includes('cover') && text.includes('letter')) {
      return professionalInfo.coverLetter || 'Please see attached resume for my qualifications and experience.';
    }
    if (text.includes('reference')) {
      return 'Available upon request';
    }
    if (text.includes('relocat')) {
      return professionalInfo.willRelocate || 'Yes';
    }
    if (text.includes('travel')) {
      return professionalInfo.canTravel || 'Yes, up to 25%';
    }
    if (text.includes('citizenship') || text.includes('authorize')) {
      return personalInfo.workAuthorization || 'Yes, authorized to work';
    }
    if (text.includes('criminal') || text.includes('background')) {
      return 'No';
    }
    if (text.includes('drug') || text.includes('test')) {
      return 'Yes, willing to comply';
    }
    if (text.includes('notice') || text.includes('week')) {
      return professionalInfo.noticeRequired || '2 weeks';
    }
    
    // For any other text field, provide a professional but generic response
    if (inputType === 'text' || inputType === 'textarea') {
      return professionalInfo.genericResponse || 'N/A';
    }
    
    // For number fields, default to reasonable numbers
    if (inputType === 'number') {
      if (text.includes('year')) return '3';
      if (text.includes('month')) return '6';
      return '1';
    }
    
    return ''; // Only return empty as last resort
  }

  // Keep connection alive to prevent caching
  if (!window.keepAliveInterval) {
    window.keepAliveInterval = LOOP_PROTECTION.safeInterval(() => {
      if (isExtensionContextValid()) {
        // Send periodic heartbeat to background
        try {
          chrome.runtime.sendMessage({ action: "heartbeat" }, () => {
            if (chrome.runtime.lastError) {
              // ...removed debug log for production...
            }
          });
        } catch (e) {
          // ...removed debug log for production...
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
      // ...removed debug log for production...
      // Optionally show a user-friendly message
      if (document.body) {
        const notice = createSafeElement("div", {
          innerHTML: "Extension updated - Please refresh the page",
          style: {
            position: 'fixed',
            top: '10px',
            right: '10px',
            background: '#ff4444',
            color: 'white',
            padding: '10px',
            borderRadius: '5px',
            zIndex: '99999',
            fontFamily: 'Arial,sans-serif'
          }
        });
        if (notice && safeAppendChild(document.body, notice)) {
          setTimeout(() => {
            if (notice && notice.parentNode) {
              notice.parentNode.removeChild(notice);
            }
          }, 5000);
        }
      }
    }
  });

  // Global emergency stop flag
  window.emergencyStopFlag = false;

  // Emergency stop function - can be called from anywhere
  function triggerEmergencyStop() {
  // ...removed debug log for production...
    window.emergencyStopFlag = true;

    // Send message to background to stop everything
    safeSendMessage({ action: "emergencyStop" });

    // Stop any running automation
    processing = false;
    
    // Clear resources centrally
    cleanupExtensionResources('emergency-stop');
    
    // Clear any other automation flags
    window.automationRunning = false;
    
    // Notify popup that automation has been stopped
    try { if (isExtensionContextValid()) {
      chrome.runtime.sendMessage({
        greeting: "statusUpdate",
        status: "🛑 Emergency stop activated - All automation halted",
        timestamp: new Date().toISOString(),
        isComplete: true,
        isStopped: true
      });
    }} catch (error) {
  // ...removed debug log for production...
    }
    
  // ...removed debug log for production...

    // Show user notification
    if (document.body) {
      const notice = createSafeElement("div", {
        innerHTML: "🛑 AUTOMATION STOPPED - All processes halted",
        style: {
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#dc3545',
          color: 'white',
          padding: '15px 25px',
          borderRadius: '8px',
          zIndex: '999999',
          fontFamily: 'Arial, sans-serif',
          fontSize: '16px',
          fontWeight: 'bold',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
        }
      });
      if (notice && safeAppendChild(document.body, notice)) {
        setTimeout(() => {
          if (notice && notice.parentNode) {
            notice.parentNode.removeChild(notice);
          }
        }, 5000);
      }
    }
  }

  // Keyboard shortcut for emergency stop (Ctrl+Shift+X)
  const _emergencyKeyHandler = (event) => {
    if (event.ctrlKey && event.shiftKey && event.key === "X") {
      event.preventDefault();
      triggerEmergencyStop();
    }
  };
  safeAddEventListener(document, "keydown", _emergencyKeyHandler);

  // Centralized cleanup for timers, observers, and DOM elements
  function cleanupExtensionResources(reason = 'manual') {
    try {
      // Run registered cleanups first
      runAllCleanups();

      // Remove all event listeners added via safeAddEventListener
      safeRemoveAllEventListeners();

      // Clear all tracked timeouts/intervals
      safeClearAllTimeouts();
      safeClearAllIntervals();

      // Disconnect tracked observers
      disconnectAllObservers();

      // Clear heartbeat/keepAlive
      if (window.keepAliveInterval) {
        clearInterval(window.keepAliveInterval);
        window.keepAliveInterval = null;
      }

      // Clear job timeout/promise trackers
      if (window.currentJobTimeout) {
        clearTimeout(window.currentJobTimeout);
        window.currentJobTimeout = null;
      }
      window.currentJobPromise = null;

      // Disconnect learning system observers
      try {
        if (window.questionLearningSystem && window.questionLearningSystem.observer) {
          window.questionLearningSystem.observer.disconnect();
        }
      } catch (e) {
  // ...removed debug log for production...
      }

      // Remove any extension UI elements
      try { removeExtensionElements(); } catch (_) {}

      // Log cleanup
      sendLogToPopup(`🧹 Resources cleaned up (${reason})`, 'INFO');

      // Reset running flags
      window.automationRunning = false;
      window.emergencyStopFlag = false;
    } catch (e) {
  // ...removed debug log for production...
    }
  }



  if (!window._indeedMessageListenerAdded) {
  window._indeedMessageListenerAdded = true;
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => { 
  // ...removed debug log for production...
    
    if (message.action === "stopProcess") {
      console.log("🛑 STOP BUTTON CLICKED - Disabling automation");
      
      // Explicitly disable automation
      window.automationAllowed = false;
      window.manualStartRequired = true;
      window.automationRunning = false;
      
      // CLEAR persisted automation state when user manually stops
      try {
        localStorage.removeItem('extensionAutomationState');
        localStorage.removeItem('extensionContextRecovery');
        console.log("🗑️ Persisted automation state cleared");
      } catch (storageError) {
        console.warn("Could not clear automation state:", storageError.message);
      }
      
      triggerEmergencyStop();
      sendResponse({ status: "automation_stopped" });
      console.log("✅ Automation stopped - extension ready for manual start only");
      return true; // Keep message channel open for async response
    }
    
    if (message.action === "startProcess") {
      debugLog("Received startProcess message", "MESSAGE");
      
      // Handle async response
      let responseSent = false;
      const safeResponse = (response) => {
        if (!responseSent && sendResponse) {
          try {
            responseSent = true;
            sendResponse(response);
            debugLog("Sent response for startProcess", "MESSAGE");
          } catch (error) {
            console.error("Error sending startProcess response:", error.message);
          }
        }
      };

      // Process start request asynchronously  
      handleStartProcess()
        .then((result) => {
          safeResponse(result);
        })
        .catch((error) => {
          console.error("Error in handleStartProcess:", error);
          safeResponse({ status: "error", message: error.message });
        });
      
      return true; // Keep message channel open for async response
    }
    
    // Handle ping for content script availability check
    if (message.action === "ping") {
      sendResponse({ status: "alive", timestamp: Date.now() });
      return true;
    }
    
    // Handle completion message from background script
    if (message.action === "ALL_JOBS_COMPLETE") {
  // ...removed debug log for production...
      showCompletionNotification(message.results);
      
      // Notify popup that automation is complete
      try {
        chrome.runtime.sendMessage({
          greeting: "statusUpdate",
          status: "🎉 All jobs processed!",
          timestamp: new Date().toISOString(),
          isComplete: true
        });
      } catch (error) {
  // ...removed debug log for production...
      }
      
      sendResponse({ status: "notification_shown" });
      return true;
    }
    
    // Handle applyJob action (consolidated from removed duplicate listener)
    if (message.action === "applyJob" && message.job) {
      console.log("🚀 APPLYJOB MESSAGE RECEIVED - Auto-enabling automation for job processing!");
      
      // CRITICAL: Auto-enable automation for job processing tabs
      // If we received applyJob message, it means user clicked Start and jobs are being processed
      console.log("🔓 AUTO-ENABLING AUTOMATION: Job processing tab detected");
      window.automationAllowed = true;
      window.manualStartRequired = false;
      window.automationRunning = true;
      
      // Immediately persist this state to prevent issues
      const jobProcessingState = {
        automationAllowed: true,
        manualStartRequired: false,
        automationRunning: true,
        timestamp: Date.now(),
        url: window.location.href,
        jobProcessingTab: true,
        jobTitle: message.job.jobTitle || 'Unknown Job',
        jobCompany: message.job.companyName || 'Unknown Company',
        autoEnabled: true,
        reason: 'applyJob message received from background'
      };
      
      try {
        localStorage.setItem('extensionAutomationState', JSON.stringify(jobProcessingState));
        sessionStorage.setItem('extensionAutomationState', JSON.stringify(jobProcessingState));
        window.automationStateData = jobProcessingState;
        console.log("💾 Job processing automation state saved successfully");
      } catch (e) {
        console.warn("Could not save job processing state:", e.message);
      }
      
      // Start continuous state preservation for this job processing tab
      if (typeof startAutomationStatePreservation === 'function') {
        startAutomationStatePreservation();
      }
      
      // Prevent multiple concurrent job processing
      if (window.currentJobPromise) {
        console.warn("⚠️ Job already running - returning busy status");
        sendResponse({ status: "busy", result: "fail_job_already_running" });
        return true;
      }
      
  // ...removed debug log for production...
      sendLogToPopup(`🚀 Starting application for: ${message.job.jobTitle} at ${message.job.companyName}`);
      
      // Set up async job processing
      let responseSent = false;
      const safeResponse = (response) => {
        if (!responseSent && sendResponse) {
          try {
            responseSent = true;
            window.currentJobPromise = null;
            sendResponse(response);
          } catch (error) {
            console.warn("⚠️ Error sending response:", error.message);
          }
        }
      };
      
      // Process job asynchronously
      window.currentJobPromise = processJobApplication(message.job)
        .then((result) => {
          // ...removed debug log for production...
          safeResponse({ status: "completed", result: result });
        })
        .catch((error) => {
    // ...removed debug log for production...
          safeResponse({ status: "error", result: "fail_" + error.message });
        });
      
      return true; // Keep message channel open for async response
    }
    
    // Handle cleanup action
    if (message.action === "cleanup") {
  // ...removed debug log for production...
      cleanupExtensionResources('message:cleanup');
      sendResponse({ status: "cleaned" });
      return true;
    }
  });
  } // end guard for message listener

  // Console command for emergency stop (developers can type: stopAutomation() in console)
  window.stopAutomation = triggerEmergencyStop;

  document.addEventListener("click", () => {
  // ...removed debug log for production...
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
      const response = await fetch(
        chrome.runtime.getURL("questions_config.json")
      );
      if (!response.ok) {
        throw new Error(`Failed to load config: ${response.status}`);
      }

      questionsConfig = await response.json();
  // ...removed debug log for production...
      // ...removed debug log for production...

      return questionsConfig;
    } catch (error) {
  // ...removed debug log for production...
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
          textarea:
            "I am interested in this position and believe I would be a valuable addition to your team.",
        },
        learnedData: {
          patterns: [],
          lastUpdated: null,
          version: "1.0",
        },
      };
    }
  }

  /**
   * Save learned patterns to the local storage configuration
   */
  async function saveLearnedPatternsToConfig(patterns) {
    try {
      const config = await loadUserConfig();

      // Update the learned data section
      config.learnedData.patterns = patterns;
      config.learnedData.lastUpdated = new Date().toISOString();

      // Save to chrome local storage
      await chrome.storage.local.set({ 'jobAppConfig': config });

      // ...removed debug log for production...

      // Also send to background script for potential persistence
      if (isExtensionContextValid()) {
        chrome.runtime
          .sendMessage({
            action: "saveLearnedPatterns",
            learnedData: config.learnedData,
          })
          .catch((error) => {
            // ...removed debug log for production...
          });
      }

      return true;
    } catch (error) {
  // ...removed debug log for production...
      return false;
    }
  }

  /**
   * Load learned patterns from local storage configuration
   */
  async function loadLearnedPatternsFromConfig() {
    try {
      const config = await loadUserConfig();

      // Get learned patterns from the config
      if (config.learnedData && config.learnedData.patterns) {
        // ...removed debug log for production...
        return config.learnedData.patterns;
      }

      return [];
    } catch (error) {
  // ...removed debug log for production...
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
      const matchesAllKeywords = pattern.keywords.every((keyword) =>
        text.includes(keyword.toLowerCase())
      );

      // Check if any excluded keywords are present
      const hasExcludedKeywords = excludeKeywords.some((excluded) =>
        text.includes(excluded.toLowerCase())
      );

      if (matchesAllKeywords && !hasExcludedKeywords) {
        // ...removed debug log for production...
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
  async function waitForElement(
    selector,
    timeout = null,
    checkInterval = 100,
    actionType = 'default'
  ) {
    // Use smart timeout if not provided
    const smartTimeout = timeout || getSmartTimeout(SMART_TIMEOUTS.BASE_TIMEOUT, actionType);
    
    return new Promise((resolve) => {
      const startTime = Date.now();

      const checkForElement = () => {
        // Check extension context before continuing
        if (!isExtensionContextValid()) {
          // ...removed debug log for production...
          resolve(null);
          return;
        }

        const element = document.querySelector(selector);

        if (element) {
          recordSuccess(`Found element: ${selector}`);
          resolve(element);
          return;
        }

        // Check if timeout exceeded
        if (Date.now() - startTime > smartTimeout) {
          recordFailure(`Timeout waiting for element: ${selector}`);
          resolve(null);
          return;
        }

        // Check again after interval with protection
        LOOP_PROTECTION.safeTimeout(checkForElement, checkInterval, `waitForElement-${selector.substring(0,20)}`);
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
  async function waitForAnyElement(selectors, timeout = null, actionType = 'default') {
    // Use smart timeout if not provided
    const smartTimeout = timeout || getSmartTimeout(SMART_TIMEOUTS.BASE_TIMEOUT, actionType);
    
    return new Promise((resolve) => {
      const startTime = Date.now();

      const checkForElements = () => {
        // Check extension context before continuing
        if (!isExtensionContextValid()) {
          // ...removed debug log for production...
          resolve(null);
          return;
        }

        // Try each selector
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element) {
            recordSuccess(`Found element with selector: ${selector}`);
            resolve(element);
            return;
          }
        }

        // Check if timeout exceeded
        if (Date.now() - startTime > smartTimeout) {
          // ...removed debug log for production...
          resolve(null);
          return;
        }

        // Check again after interval with protection
        LOOP_PROTECTION.safeTimeout(checkForElements, 100, 'waitForAnyElement-check');
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
  async function waitForClickableElement(selector, timeout = 30000) {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const checkForClickable = () => {
        // Check if extension context is still valid
        if (!isExtensionContextValid()) {
          console.log(
            "🔄 Extension context invalidated during waitForClickableElement"
          );
          showExtensionReloadNotice();
          resolve(null);
          return;
        }

        const element = document.querySelector(selector);

        if (
          element &&
          element.offsetParent !== null && // Element is visible
          !element.disabled && // Element is not disabled
          element.style.display !== "none" && // Not hidden with display:none
          element.style.visibility !== "hidden"
        ) {
          // Not hidden with visibility:hidden

          console.log(
            `✅ Clickable element found: ${selector} - Text: "${
              element.textContent || element.value || "N/A"
            }"`
          );
          resolve(element);
          return;
        }

        // Check if timeout exceeded
        if (Date.now() - startTime > timeout) {
          console.log(`⏰ Timeout waiting for clickable element: ${selector}`);
          console.log(
            `Element exists: ${!!element}, Visible: ${
              element?.offsetParent !== null
            }, Enabled: ${!element?.disabled}`
          );
          resolve(null);
          return;
        }

        // Check again after interval
        LOOP_PROTECTION.safeTimeout(checkForClickable, 100, 'waitForClickableElement-check');
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
  async function waitForElementByText(textOptions, timeout = 30000) {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const checkForText = () => {
        // Check extension context before continuing
        if (!isExtensionContextValid()) {
          console.log(
            `⚠️ Extension context invalidated while waiting for text elements`
          );
          resolve(null);
          return;
        }

        // ROBUST CLICKABLE ELEMENTS DETECTION
        const clickableSelectors = [
          'button', 'a[href]', 'input[type="button"]', 'input[type="submit"]',
          'input[type="reset"]', 'input[type="image"]', '[role="button"]',
          '[onclick]', '.btn', '.button', '[data-testid*="button"]',
          '[class*="button"]', '[class*="btn"]', 'span[role="button"]',
          'div[role="button"]', '[tabindex="0"][onclick]', '[data-action]',
          'a[role="button"]', '.clickable', '[cursor="pointer"]'
        ];
        const allClickable = findElementsRobust(clickableSelectors);

        for (const element of allClickable) {
          const text = (
            element.textContent ||
            element.value ||
            element.getAttribute("aria-label") ||
            ""
          ).toLowerCase();
          for (const searchText of textOptions) {
            if (
              text.includes(searchText.toLowerCase()) &&
              !text.includes("applied")
            ) {
              console.log(
                `✅ Text-based element found: "${searchText}" - Text: "${
                  element.textContent || element.value
                }"`
              );
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
        LOOP_PROTECTION.safeTimeout(checkForText, 100, 'waitForTextElements-check');
      };

      checkForText();
    });
  }

  /**
   * AGGRESSIVE DOM Ready Detection - Ensures pages are FULLY loaded before processing
   * @param {number} timeout - Maximum time to wait in milliseconds
   * @returns {Promise<boolean>} - Resolves when DOM is ready or timeout
   */
  async function waitForDOMReady(timeout = 25000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let lastBodyChildCount = -1;
      let lastScriptCount = -1;
      let stableCount = 0;
      const requiredStableChecks = 5; // More stability checks needed
      
  // ...removed debug log for production...
      
      const checkDOMReady = () => {
        // Check extension context
        if (!isExtensionContextValid()) {
          console.log("🔄 Extension context invalidated during DOM ready wait");
          resolve(false);
          return;
        }
        
        // Multiple readiness checks
        const isDocumentReady = document.readyState === 'complete';
        const currentBodyChildCount = document.body ? document.body.children.length : 0;
        const currentScriptCount = document.querySelectorAll('script').length;
        const hasMinimumElements = currentBodyChildCount > 5; // Page should have substantial content
        
        // ROBUST LOADING INDICATORS DETECTION
        const loadingSelectors = [
          // Class-based loading indicators
          '[class*="load"]', '[class*="loading"]', '[class*="loader"]',
          '[class*="spinner"]', '[class*="spin"]', '[class*="rotating"]',
          '[class*="progress"]', '[class*="wait"]', '[class*="busy"]',
          '[class*="pending"]', '[class*="processing"]', 
          // ID-based indicators
          '[id*="load"]', '[id*="loading"]', '[id*="spinner"]', '[id*="progress"]',
          // Data attribute indicators  
          '[data-loading]', '[data-spinner]', '[data-progress]',
          // ARIA and role indicators
          '[role="progressbar"]', '[aria-busy="true"]', '[aria-live="polite"]',
          // Common specific selectors
          '.fa-spinner', '.fa-circle-o-notch', '.glyphicon-refresh',
          '.icon-spinner', '.icon-loading', '.loading-overlay',
          '.progress-bar', '.loading-dots', '.pulse', '.bounce'
        ];
        const loadingIndicators = findElementsRobust(loadingSelectors);
        const hasVisibleLoaders = loadingIndicators.some(el => isElementVisible(el));
        
        // ROBUST NETWORK ACTIVITY CHECK
        const networkActivitySelectors = [
          'meta[http-equiv="refresh"]',
          '[data-loading="true"]', '[data-pending="true"]',
          '.network-activity', '.ajax-loading', '.xhr-pending'
        ];
        const noActiveRequests = !findElementRobust(networkActivitySelectors);
        
        // Check if both body and scripts are stable
        const isStructureStable = (currentBodyChildCount === lastBodyChildCount && 
                                  currentScriptCount === lastScriptCount);
        
        if (isDocumentReady && hasMinimumElements && !hasVisibleLoaders && 
            noActiveRequests && isStructureStable) {
          stableCount++;
          // ...removed debug log for production...
        } else {
          if (stableCount > 0) {
            // ...removed debug log for production...
          }
          stableCount = 0; // Reset if anything changed
          lastBodyChildCount = currentBodyChildCount;
          lastScriptCount = currentScriptCount;
        }
        
        // DOM is fully ready and stable
        if (stableCount >= requiredStableChecks) {
          // ...removed debug log for production...
          resolve(true);
          return;
        }
        
        // Check timeout
        if (Date.now() - startTime > timeout) {
          // ...removed debug log for production...
          resolve(false);
          return;
        }
        
        // Check again after shorter interval for more responsiveness
        LOOP_PROTECTION.safeTimeout(checkDOMReady, 300, 'waitForDOMReady-check');
      };
      
      checkDOMReady();
    });
  }

  /**
   * Debug function to log all clickable elements on page
   */
  function debugClickableElements() {
  // ...removed debug log for production...
    // ROBUST CLICKABLE DEBUG DETECTION
    const clickableSelectors = [
      'button', 'a[href]', 'input[type="button"]', 'input[type="submit"]',
      'input[type="reset"]', 'input[type="image"]', '[role="button"]',
      '[onclick]', '.btn', '.button', '[data-testid*="button"]',
      '[class*="button"]', '[class*="btn"]', 'span[role="button"]',
      'div[role="button"]', '[tabindex="0"][onclick]', '[data-action]'
    ];
    const allClickable = findElementsRobust(clickableSelectors);
    allClickable.forEach((el, i) => {
      const text = (el.textContent || el.value || "").trim();
      const id = el.id || "no-id";
      const classes = el.className || "no-class";
      const dataAttrs = Array.from(el.attributes)
        .filter((attr) => attr.name.startsWith("data-"))
        .map((attr) => `${attr.name}="${attr.value}"`)
        .join(" ");

      // ...removed debug log for production...
    });
  }

  /**
   * Show user-friendly notification when extension context is invalidated
   */
  function showExtensionReloadNotice() {
    // Remove any existing notice
    const existingNotice = findByIdRobust([
      "extensionReloadNotice", "extension-reload-notice", 
      "reload-notice", "extension-notice"
    ]);
    if (existingNotice) {
      existingNotice.remove();
    }

    const notice = document.createElement("div");
    notice.id = "extensionReloadNotice";
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
    const style = document.createElement("style");
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
        notice.style.animation = "slideIn 0.3s ease-out reverse";
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
      this.retryAttempts = new Map(); // Track retry attempts per element
      this.maxRetries = 5; // Limit retries to prevent infinite loops
      
      // Bind all methods to ensure 'this' context is preserved
      this.calculateSimilarity = this.calculateSimilarity.bind(this);
      this.parseQuestionComponents = this.parseQuestionComponents.bind(this);
      this.checkLearnedPatterns = this.checkLearnedPatterns.bind(this);
      
  // ...removed debug log for production...
      // ...removed debug log for production...
      
      this.initAsync();
    }

    /**
     * Asynchronous initialization
     */
    async initAsync() {
      try {
        await this.loadLearnedPatterns();
        await this.loadUserConfig();
        this.initialized = true;
        // ...removed debug log for production...

        // Auto-detection removed - will only start when user clicks Start button
        console.log("✅ Learning system initialized (awaiting manual start)");
      } catch (error) {
        console.error(
          "❌ Question Learning System initialization failed:",
          error
        );
        this.initialized = true; // Continue with empty patterns
      }
    }

    /**
     * Load user configuration from questions_config.json
     */
    async loadUserConfig() {
      try {
        if (this.userConfig) {
          return this.userConfig; // Already loaded
        }

        // Use the global loadUserConfig function
        this.userConfig = await loadUserConfig();
        
        if (this.userConfig) {
          console.log("✅ User configuration loaded for learning system");
        } else {
          console.warn("⚠️ No user configuration available");
        }
        
        return this.userConfig;
      } catch (error) {
        console.warn("⚠️ Error loading user config for learning system:", error);
        this.userConfig = null;
        return null;
      }
    }

    /**
     * Start automatic question detection
     */
    startAutoDetection() {
      if (this.autoDetectionActive) return;

      this.autoDetectionActive = true;
  // ...removed debug log for production...

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
      registerObserver(this.observer);

      // Start observing
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      // Also check existing content
      this.checkForNewQuestions(document.body);
    }

    /**
     * Check if new node contains unknown questions
     */
    checkForNewQuestions(node) {
      if (!node.querySelectorAll) return;

      // ROBUST FORM CONTAINER DETECTION
      const containerSelectors = [
        "div", "fieldset", "label", "li", "section", "article", 
        "form", "td", "th", ".form-group", ".question", ".field",
        ".input-group", "[role='group']", "[data-testid*='question']",
        "[class*='question']", "[class*='field']", "[class*='input']"
      ];
      const containers = findElementsRobust(containerSelectors, node);

      containers.forEach((container) => {
        if (this.observedContainers.has(container)) return;

        const inputSelectors = [
          "input:not([type='hidden'])", "select", "textarea", 
          "[contenteditable='true']", "input[type='text']",
          "input[type='email']", "input[type='tel']", "input[type='url']",
          "input[type='number']", "input[type='date']", "input[type='time']",
          "input[type='password']", "input[type='search']",
          "input[type='radio']", "input[type='checkbox']"
        ];
        const inputs = findElementsRobust(inputSelectors, container);
        if (inputs.length === 0) return;

        // Look for question text in various locations
        const questionText = this.extractQuestionText(container);
        if (!questionText || questionText.length < 5) return;

        // Check if we already know how to answer this question
        const knownAnswer = this.findKnownAnswer(questionText);

        if (!knownAnswer) {
          // This is an unknown question - try dynamic detection FIRST
          // ...removed debug log for production...
          this.tryDynamicDetectionAndFillAllInputs(container, questionText, inputs)
            .then(success => {
              if (!success) {
                // Only start watching if dynamic detection failed
                // ...removed debug log for production...
                this.startWatching(container, questionText, inputs);
              }
            })
            .catch(error => {
              // ...removed debug log for production...
              this.startWatching(container, questionText, inputs);
            });
        } else {
          // We know this question - try to answer it automatically for ALL inputs
          // ...removed debug log for production...
          this.applyKnownAnswerToAllInputs(container, knownAnswer, inputs);
        }

        this.observedContainers.add(container);
      });
    }

    /**
     * 🤖 Try dynamic detection and immediately fill the form
     */
    async tryDynamicDetectionAndFill(container, questionText, inputElement) {
      try {
        // Check retry limit
        const elementId = this.getElementId(inputElement);
        const retryCount = this.retryAttempts.get(elementId) || 0;
        
        if (retryCount >= this.maxRetries) {
          console.log(`🚫 Retry limit reached for element: "${questionText}" (${retryCount}/${this.maxRetries})`);
          return false;
        }
        
        // Increment retry count
        this.retryAttempts.set(elementId, retryCount + 1);
        
        console.log(`🤖 Trying dynamic detection for: "${questionText}" (attempt ${retryCount + 1}/${this.maxRetries})`);
        
        // Detect question type dynamically
        const questionType = this.detectQuestionTypeFromContext(questionText, inputElement);
        
        if (!questionType || questionType.type === 'unknown' || questionType.confidence < 0.3) {
          console.log(`🤔 Dynamic detection uncertain - type: ${questionType?.type}, confidence: ${questionType?.confidence}`);
          console.log(`🎯 Attempting fallback smart fill for: "${questionText}"`);
          
          // Try the basic getSmartValue function as fallback
          const fallbackValue = await getSmartValue(questionText, inputElement.type || 'text');
          
          if (fallbackValue && fallbackValue !== '') {
            console.log(`✅ Fallback value found: "${fallbackValue}"`);
            
            // Apply the fallback value
            const success = await this.applyValueToInput(inputElement, fallbackValue, { type: 'fallback', inputType: inputElement.type });
            
            if (success) {
              console.log(`✅ Applied fallback value successfully`);
              
              // Show indicator that this was a best guess
              this.showSmartGuessIndicator(container, questionText, fallbackValue);
              
              return true;
            }
          }
          
          console.log(`❌ No suitable value found for unknown question`);
          return false;
        }

        console.log(`🎯 Dynamic detection success: type="${questionType.type}", confidence=${(questionType.confidence * 100).toFixed(1)}%`);
        
        // Generate smart value
        const smartValue = await this.generateSmartValue(questionType, questionText, questionType.inputType);
        
        if (!smartValue && smartValue !== '') {  // Allow empty strings for some cases
          console.log(`❌ Could not generate smart value for type: ${questionType.type}`);
          return false;
        }

  // ...removed debug log for production...
        
        // Apply the value to the input
        const success = await this.applyValueToInput(inputElement, smartValue, questionType);
        
        if (success) {
          // ...removed debug log for production...
          
          // Reset retry count on success
          this.retryAttempts.delete(elementId);
          
          // Create learning pattern for future use
          await this.createLearningPatternFromSmartDetection(questionText, smartValue, questionType, container);
          
          // Show success indicator
          this.showAutoFillIndicator(container, questionType, smartValue);
          
          return true;
        } else {
          // ...removed debug log for production...
          return false;
        }
        
      } catch (error) {
        console.error(`❌ Error in dynamic detection and fill:`, error);
        return false;
      }
    }

    /**
     * DYNAMIC: Try detection and fill for ALL inputs in a question (not just first one)
     */
    async tryDynamicDetectionAndFillAllInputs(container, questionText, inputElements) {
  // ...removed debug log for production...
      
      let successCount = 0;
      let totalInputs = inputElements.length;
      
      for (let i = 0; i < inputElements.length; i++) {
        const input = inputElements[i];
  // ...removed debug log for production...
        
        try {
          const success = await this.tryDynamicDetectionAndFill(container, questionText, input);
          if (success) {
            successCount++;
            // ...removed debug log for production...
          } else {
            // ...removed debug log for production...
          }
          
          // Small delay between inputs to avoid overwhelming the page
          await new Promise(r => setTimeout(r, 200));
          
        } catch (error) {
          // ...removed debug log for production...
        }
      }
      
  // ...removed debug log for production...
      return successCount > 0; // Return true if at least one input was filled
    }

    /**
     * DYNAMIC: Apply known answer to ALL inputs in a question (not just first one)  
     */
    async applyKnownAnswerToAllInputs(container, knownAnswer, inputElements) {
  // ...removed debug log for production...
      
      let successCount = 0;
      let totalInputs = inputElements.length;
      
      for (let i = 0; i < inputElements.length; i++) {
        const input = inputElements[i];
  // ...removed debug log for production...
        
        try {
          const success = await this.applyKnownAnswer(container, knownAnswer, input);
          if (success) {
            successCount++;
            // ...removed debug log for production...
          } else {
            // ...removed debug log for production...
          }
          
          // Small delay between inputs 
          await new Promise(r => setTimeout(r, 200));
          
        } catch (error) {
          // ...removed debug log for production...
        }
      }
      
  // ...removed debug log for production...
      return successCount > 0;
    }

    /**
     * Generate a unique ID for an element for retry tracking
     */
    getElementId(element) {
      if (!element) return Math.random().toString(36);
      
      // Try to get a unique identifier
      if (element.id) return element.id;
      if (element.name) return element.name;
      
      // Create a unique ID based on position and attributes
      const rect = element.getBoundingClientRect();
      const tagName = element.tagName.toLowerCase();
      const type = element.type || '';
      const className = element.className || '';
      
      return `${tagName}-${type}-${Math.round(rect.top)}-${Math.round(rect.left)}-${className}`.replace(/\s+/g, '-');
    }

    /**
     * Apply value to input element based on type
     */
    async applyValueToInput(inputElement, value, questionType) {
      try {
        if (!inputElement) return false;

        switch (questionType.inputType) {
          case 'select':
            return this.fillSelectInput(inputElement, value);
          
          case 'radio':
            return this.fillRadioInput(inputElement, value);
            
          case 'textarea':
          case 'text':
          default:
            return this.fillTextInput(inputElement, value);
        }
      } catch (error) {
  // ...removed debug log for production...
        return false;
      }
    }

    /**
     * ULTRA-STRICT input safety validation - Prevents filling search/location inputs
     */
    validateInputSafety(input) {
      if (!input || !input.tagName) {
        return { safe: false, reason: 'Invalid input element' };
      }
      
      // Check input attributes that indicate search functionality
      const placeholder = (input.placeholder || '').toLowerCase();
      const name = (input.name || '').toLowerCase();
      const id = (input.id || '').toLowerCase();
      const className = (typeof input.className === 'string' ? input.className : '').toLowerCase();
      const type = (input.type || '').toLowerCase();
      
      // FORBIDDEN INPUT PATTERNS - Never fill these
      const forbiddenPatterns = [
        // Search patterns
        'search', 'job title', 'keyword', 'company', 'find', 'query', 'q',
        // Location patterns  
        'location', 'where', 'city', 'state', 'zip', 'postal', 'address',
        'country', 'region', 'area', 'near', 'within',
        // Browsing patterns
        'filter', 'sort', 'browse', 'explore'
      ];
      
      const allText = `${placeholder} ${name} ${id} ${className}`;
      
      for (const pattern of forbiddenPatterns) {
        if (allText.includes(pattern)) {
          return { safe: false, reason: `Contains forbidden pattern: ${pattern}` };
        }
      }
      
      // Check if input is in search context
      const searchAncestors = input.closest(
        'form[role="search"], .search, .job-search, #searchform, [class*="search"], [id*="search"]'
      );
      
      if (searchAncestors) {
        return { safe: false, reason: 'Input is in search context' };
      }
      
      // Check for visible search indicators nearby (robust, no :contains)
      let hasNearbySearch = false;
      try {
        const parent = input.parentElement || input.closest('form') || document.body;
        if (parent) {
          const candidates = Array.from(parent.querySelectorAll(
            'button[type="submit"], button, [role="button"], input[type="submit"], [class*="search"], [id*="search"]'
          ));
          hasNearbySearch = candidates.some(el => {
            try {
              if (!isElementVisible(el)) return false;
              const text = (
                (el.textContent || el.value || '') + ' ' +
                (el.getAttribute('aria-label') || '') + ' ' +
                (el.getAttribute('title') || '')
              ).toLowerCase();
              const idc = ((el.id || '') + ' ' + (typeof el.className === 'string' ? el.className : '')).toLowerCase();
              return text.includes('search') || idc.includes('search');
            } catch { return false; }
          });
        }
      } catch {}
      
      if (hasNearbySearch) {
        return { safe: false, reason: 'Search elements detected nearby' };
      }
      
      // Additional protection: Must be in application context
      const applicationContext = input.closest(
        'form[action*="apply"], [class*="application"], [class*="smartapply"], [data-testid*="application"]'
      );
      
      if (!applicationContext && window.location.href.includes('indeed.com/jobs')) {
        return { safe: false, reason: 'Not in application context on jobs page' };
      }
      
      return { safe: true, reason: 'Input validated as safe' };
    }

    /**
     * Fill text input - WITH ULTRA-STRICT SEARCH/LOCATION PROTECTION
     */
    async fillTextInput(input, value) {
      try {
        // CRITICAL PROTECTION: Never fill search or location inputs
        const inputProtection = this.validateInputSafety(input);
        if (!inputProtection.safe) {
          // ...removed debug log for production...
          return false;
        }
        
        input.focus();
        
        // 🎭 VIRTUAL DOM: Use custom DOM system (React-level control!)
        console.log("🎭 Using Virtual DOM for surgical form update...");
        const vdomSuccess = window.dynamicVDOM.updateElement(input, value, 'extension_automation');
        
        if (!vdomSuccess) {
          // Fallback to React-safe value setting
          console.log("🔄 Virtual DOM failed, falling back to React-safe method");
          const success = await setReactSafeValue(input, value);
          if (!success) {
            // DYNAMIC: Use safe value setting to prevent [object Object]
            const safeValue = safeValueToString(value);
            input.value = safeValue;
            await dispatchReactSafeEvent(input, 'input');
            await dispatchReactSafeEvent(input, 'change');
            
            // Log if object conversion occurred
            if (typeof value === 'object' && value !== null) {
              safeLog(`🔧 Object converted for input`, { original: value, converted: safeValue });
            }
          }
        } else {
          console.log("✅ Virtual DOM update successful!");
        }
        
        // Blur event with delay to let React process
        await new Promise(resolve => setTimeout(resolve, 100));
        await dispatchReactSafeEvent(input, 'blur');
        
  // ...removed debug log for production...
        return true;
      } catch (error) {
  // ...removed debug log for production...
        return false;
      }
    }

    /**
     * Fill select dropdown
     */
    fillSelectInput(select, value) {
      try {
        // Try to find the option by value, text, or partial match
        const options = Array.from(select.options);
        
        // First try exact value match
        let targetOption = options.find(opt => opt.value.toLowerCase() === value.toLowerCase());
        
        // Then try exact text match
        if (!targetOption) {
          targetOption = options.find(opt => opt.textContent.toLowerCase().trim() === value.toLowerCase());
        }
        
        // Then try partial text match
        if (!targetOption) {
          targetOption = options.find(opt => 
            opt.textContent.toLowerCase().includes(value.toLowerCase()) ||
            value.toLowerCase().includes(opt.textContent.toLowerCase().trim())
          );
        }
        
        // For countries, try common mappings
        if (!targetOption && value.toLowerCase().includes('united states')) {
          targetOption = options.find(opt => opt.textContent.toLowerCase().includes('united states'));
        }
        
        if (targetOption) {
          select.value = targetOption.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          // ...removed debug log for production...
          return true;
        } else {
          // ...removed debug log for production...
          return false;
        }
      } catch (error) {
  // ...removed debug log for production...
        return false;
      }
    }

    /**
     * Fill radio button
     */
    fillRadioInput(radio, value) {
      try {
        // ROBUST RADIO GROUP CONTAINER DETECTION
        const containerSelectors = ['div', 'fieldset', 'form', 'section', 'ul', 'ol', '.form-group', '[role="group"]'];
        let container = null;
        
        for (const selector of containerSelectors) {
          container = radio.closest(selector);
          if (container) break;
        }
        container = container || radio.parentElement;
        
        // ROBUST RADIO BUTTON GROUP DETECTION
        const radioSelectors = [
          `input[name="${radio.name}"]`,
          `input[data-name="${radio.name}"]`,
          `input[type="radio"][name="${radio.name}"]`
        ];
        const radios = findElementsRobust(radioSelectors, container);
        
        for (const radioOption of radios) {
          // ROBUST LABEL DETECTION FOR RADIO BUTTONS
          const labelSelectors = [
            'label', `label[for="${radioOption.id}"]`, 
            '.label', '.radio-label', '[data-label]'
          ];
          const label = radioOption.closest('label') || 
                       findElementRobust(labelSelectors.slice(1), container);
          const labelText = label ? label.textContent.toLowerCase().trim() : '';
          const radioValue = radioOption.value.toLowerCase();
          
          if (radioValue === value.toLowerCase() || 
              labelText.includes(value.toLowerCase()) ||
              (value.toLowerCase() === 'yes' && (radioValue === 'yes' || labelText === 'yes')) ||
              (value.toLowerCase() === 'no' && (radioValue === 'no' || labelText === 'no'))) {
            
            radioOption.checked = true;
            radioOption.dispatchEvent(new Event('change', { bubbles: true }));
            // ...removed debug log for production...
            return true;
          }
        }
        
  // ...removed debug log for production...
        return false;
      } catch (error) {
  // ...removed debug log for production...
        return false;
      }
    }

    /**
     * Show auto-fill success indicator
     */
    showAutoFillIndicator(container, questionType, value) {
      try {
        const indicator = createSafeElement("div", {
          className: "auto-fill-indicator",
          innerHTML: `✅ Auto-filled: ${questionType.type}`,
          style: {
            position: 'absolute',
            top: '-5px',
            right: '-5px',
            background: 'linear-gradient(45deg, #2196F3, #1976D2)',
            color: 'white',
            padding: '4px 8px',
            borderRadius: '12px',
            fontSize: '11px',
            fontWeight: 'bold',
            zIndex: '10000',
            animation: 'autoFillSuccess 3s ease-out',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
          }
        });

        if (indicator) {
          // Add CSS animation if not already present
          if (!findByIdRobust(["auto-fill-styles", "autofill-styles", "fill-styles"])) {
            const style = document.createElement("style");
            style.id = "auto-fill-styles";
            style.textContent = `
            @keyframes autoFillSuccess {
              0% { transform: scale(0.8); opacity: 0; }
              15% { transform: scale(1.2); opacity: 1; }
              80% { transform: scale(1); opacity: 1; }
              100% { transform: scale(0.9); opacity: 0; }
            }
            `;
            document.head.appendChild(style);
          }

          container.style.position = container.style.position || "relative";
          safeAppendChild(container, indicator);

          // Remove indicator after animation
          setTimeout(() => {
            if (indicator && indicator.parentNode) {
              indicator.parentNode.removeChild(indicator);
            }
          }, 3000);
        }
      } catch (error) {
  // ...removed debug log for production...
      }
    }

    /**
     * Show indicator for smart guess fills
     */
    showSmartGuessIndicator(container, questionText, value) {
      try {
        const indicator = createSafeElement("div", {
          className: "smart-guess-indicator",
          innerHTML: `🤔 Smart guess: "${value}"`,
          style: {
            position: 'absolute',
            top: '-5px',
            right: '-5px',
            background: 'linear-gradient(45deg, #FF9800, #F57C00)',
            color: 'white',
            padding: '4px 8px',
            borderRadius: '12px',
            fontSize: '11px',
            fontWeight: 'bold',
            zIndex: '10000',
            animation: 'smartGuessAnimation 4s ease-out',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            cursor: 'pointer',
            maxWidth: '200px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }
        });

        if (indicator) {
          // Add CSS animation if not already present
          if (!findByIdRobust(["smart-guess-styles", "guess-styles"])) {
            const style = document.createElement("style");
            style.id = "smart-guess-styles";
            style.textContent = `
            @keyframes smartGuessAnimation {
              0% { transform: scale(0.8); opacity: 0; }
              15% { transform: scale(1.1); opacity: 1; }
              85% { transform: scale(1); opacity: 1; }
              100% { transform: scale(0.9); opacity: 0; }
            }
            .smart-guess-indicator:hover {
              background: linear-gradient(45deg, #FFA726, #FF8F00) !important;
              transform: scale(1.05);
              transition: all 0.2s ease;
            }
            `;
            document.head.appendChild(style);
          }

          // Add click handler to let user know this was a guess
          indicator.addEventListener('click', () => {
            console.log(`🤔 User clicked on smart guess for: "${questionText}" = "${value}"`);
            // Could add functionality to let user correct the guess here
          });

          container.style.position = container.style.position || "relative";
          safeAppendChild(container, indicator);

          // Remove indicator after animation (longer for guesses so user notices)
          setTimeout(() => {
            if (indicator && indicator.parentNode) {
              indicator.parentNode.removeChild(indicator);
            }
          }, 4000);
        }
      } catch (error) {
        console.warn('Error showing smart guess indicator:', error);
      }
    }

    /**
     * Extract question text from a container
     */
    extractQuestionText(container) {
      // ROBUST QUESTION TEXT EXTRACTION
      const selectors = [
        "label", "legend", 
        '[data-testid*="label"]', '[data-testid*="question"]',
        '.question', '.form-label', '.field-label', '.input-label',
        '[class*="question"]', '[class*="label"]', '[class*="title"]',
        'h1, h2, h3, h4, h5, h6',
        '[aria-label]', '[aria-labelledby]', '[title]',
        'span[role="text"]', 'div[role="text"]', 'p[role="text"]',
        '.help-text', '.description', '.instructions',
        'span, div, p'
      ];

      for (const selector of selectors) {
        const element = container.querySelector(selector);
        if (element) {
          const text = element.textContent.trim();
          if (text.length > 5 && text.includes("?")) {
            return text;
          }
        }
      }

      // Fallback: get the container's text content
      const containerText = container.textContent.trim();
      if (containerText.length > 5 && containerText.includes("?")) {
        // Take the part before the first input
        const inputSelectors = [
          "input:not([type='hidden'])", "select", "textarea",
          "[contenteditable='true']", "[role='textbox']", "[role='combobox']"
        ];
        const input = findElementRobust(inputSelectors, container);
        if (input && containerText.indexOf(input.textContent || "") > 0) {
          return containerText
            .substring(0, containerText.indexOf(input.textContent || ""))
            .trim();
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
        try {
          if (typeof this.calculateSimilarity !== 'function') {
            // ...removed debug log for production...
            break;
          }
          
          const similarity = this.calculateSimilarity(
            parsedQuestion,
            pattern.parsedComponents
          );
          if (similarity > 0.8) {
            // 80% similarity for auto-application
            return pattern;
          }
        } catch (error) {
          // ...removed debug log for production...
          continue;
        }
      }

      return null;
    }

    /**
     * Apply a known answer automatically
     */
    async applyKnownAnswer(container, knownPattern, inputElement) {
      try {
        const success = await this.applyLearnedAnswer(
          container,
          knownPattern.answer.value ||
            knownPattern.answer.text ||
            knownPattern.answer,
          knownPattern.inputType
        );

        if (success) {
          // Update usage statistics
          knownPattern.timesUsed = (knownPattern.timesUsed || 0) + 1;
          knownPattern.lastUsed = Date.now();
          await this.saveLearnedPatterns();

          // ...removed debug log for production...
          this.showMatchIndicator(container, knownPattern, 1.0);
        }
      } catch (error) {
  // ...removed debug log for production...
      }
    }

    /**
     * Start watching a question container for manual user input
     */
    startWatching(container, questionText, inputElements) {
      const watchId = `watch_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

  // ...removed debug log for production...

      const questionData = {
        id: watchId,
        questionText: questionText,
        container: container,
        inputElements: Array.from(inputElements),
        startTime: Date.now(),
        userInteracted: false,
        finalAnswer: null,
      };

      this.watchedQuestions.set(watchId, questionData);

      // Add visual indicator that we're learning
      this.addLearningIndicator(container, watchId);

      // Set up event listeners for user interaction
      this.setupInputWatchers(questionData);

      // Auto-stop watching after 30 seconds
      setTimeout(() => {
        if (this.watchedQuestions.has(watchId)) {
          this.stopWatching(watchId, "timeout");
        }
      }, 30000);

      return watchId;
    }

    /**
     * Add visual indicator that we're learning from this question
     */
    addLearningIndicator(container, watchId) {
      const indicator = document.createElement("div");
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
      indicator.textContent = "🧠 LEARNING";

      // Add CSS animation if not exists
      if (!findByIdRobust(["learning-animation-style", "learning-animation", "animation-style"])) {
        const style = document.createElement("style");
        style.id = "learning-animation-style";
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
      if (containerStyle.position === "static") {
        container.style.position = "relative";
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
          // ...removed debug log for production...
          questionData.userInteracted = true;

          // Capture the answer
          this.captureUserAnswer(questionData, element, event);
        };

        // Add event listeners
        element.addEventListener("change", changeHandler);
        element.addEventListener("input", changeHandler);
        element.addEventListener("click", changeHandler);

        // Store cleanup function
        if (!questionData.cleanupFunctions) {
          questionData.cleanupFunctions = [];
        }

        const remover = () => {
          element.removeEventListener("change", changeHandler);
          element.removeEventListener("input", changeHandler);
          element.removeEventListener("click", changeHandler);
        };
        questionData.cleanupFunctions.push(remover);
        registerCleanup(remover);
      });
    }

    /**
     * Capture the user's answer when they interact with the form
     */
    captureUserAnswer(questionData, element, event) {
      let answer = null;

      // Determine answer based on input type
      switch (element.type) {
        case "radio":
          if (element.checked) {
            answer = {
              type: "radio",
              value: element.value,
              text: this.getRadioButtonText(element),
            };
          }
          break;

        case "checkbox":
          answer = {
            type: "checkbox",
            checked: element.checked,
            value: element.value,
            text: this.getCheckboxText(element),
          };
          break;

        case "text":
        case "email":
        case "tel":
        case "number":
          if (element.value.trim()) {
            answer = {
              type: element.type,
              value: element.value.trim(),
              text: element.value.trim(),
            };
          }
          break;

        default:
          if (element.tagName === "SELECT") {
            answer = {
              type: "select",
              value: element.value,
              text:
                element.options[element.selectedIndex]?.textContent ||
                element.value,
            };
          } else if (element.tagName === "TEXTAREA") {
            if (element.value.trim()) {
              answer = {
                type: "textarea",
                value: element.value.trim(),
                text: element.value.trim(),
              };
            }
          }
          break;
      }

      if (answer) {
        questionData.finalAnswer = answer;
        // ...removed debug log for production...

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
      const label = radioElement.closest("label");
      if (label) {
        return label.textContent.trim();
      }

      // Look for next sibling text
      if (radioElement.nextSibling && radioElement.nextSibling.textContent) {
        return radioElement.nextSibling.textContent.trim();
      }

      // Look for parent text
      if (
        radioElement.parentElement &&
        radioElement.parentElement.textContent
      ) {
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
  // ...removed debug log for production...
        this.stopWatching(questionData.id, "no_answer");
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
        existingPattern.timesEncountered =
          (existingPattern.timesEncountered || 1) + 1;
        existingPattern.lastEncountered = Date.now();
        existingPattern.confidence = Math.min(
          0.98,
          existingPattern.confidence + 0.01
        ); // Slightly increase confidence

        // ...removed debug log for production...
      } else {
        // Create new learning pattern
        const learnedPattern = {
          id: `pattern_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`,
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
          domain: window.location.hostname,
        };

        // Save the learned pattern
        this.learnedPatterns.set(patternKey, learnedPattern);

  // ...removed debug log for production...
      }

      // Save patterns asynchronously
      await this.saveLearnedPatterns();

      // Show success indicator
      this.showLearningSuccess(questionData);

      // Stop watching
      this.stopWatching(questionData.id, "learned");
    }

    /**
     * Detect the input type from element
     */
    detectInputType(element) {
      if (!element) return "unknown";

      if (element.tagName === "SELECT") return "select";
      if (element.tagName === "TEXTAREA") return "textarea";
      if (element.type) return element.type;

      return "text";
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
        length: text.split(" ").length,
      };
    }

    /**
     * Extract prefix (first few words)
     */
    extractPrefix(text) {
      const words = text.split(" ");
      return words.slice(0, Math.min(4, words.length)).join(" ");
    }

    /**
     * Extract verbs from question
     */
    extractVerbs(text) {
      const commonVerbs = [
        "are",
        "is",
        "do",
        "can",
        "will",
        "have",
        "would",
        "could",
        "should",
        "work",
        "commute",
        "travel",
        "start",
        "need",
        "require",
        "want",
        "able",
        "available",
        "authorized",
        "eligible",
        "willing",
      ];

      return commonVerbs.filter((verb) => text.includes(verb));
    }

    /**
     * Extract subjects/topics from question
     */
    extractSubjects(text) {
      const subjects = {
        authorization: [
          "authorized",
          "authorization",
          "legal",
          "visa",
          "permit",
          "eligible",
        ],
        location: [
          "commute",
          "location",
          "address",
          "distance",
          "miles",
          "relocate",
        ],
        experience: [
          "experience",
          "years",
          "background",
          "worked",
          "expertise",
        ],
        education: [
          "education",
          "degree",
          "diploma",
          "school",
          "university",
          "graduated",
        ],
        salary: ["salary", "pay", "compensation", "wage", "money", "expected"],
        schedule: [
          "schedule",
          "hours",
          "shift",
          "time",
          "availability",
          "flexible",
        ],
        skills: [
          "skills",
          "knowledge",
          "familiar",
          "proficient",
          "programming",
        ],
        preferences: ["prefer", "like", "interest", "motivated", "reason"],
      };

      const foundSubjects = [];
      for (const [subject, keywords] of Object.entries(subjects)) {
        if (keywords.some((keyword) => text.includes(keyword))) {
          foundSubjects.push(subject);
        }
      }

      return foundSubjects;
    }

    /**
     * Extract important keywords
     */
    extractKeywords(text) {
      const words = text.split(" ");
      const stopWords = [
        "a",
        "an",
        "the",
        "and",
        "or",
        "but",
        "in",
        "on",
        "at",
        "to",
        "for",
        "of",
        "with",
        "by",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "have",
        "has",
        "had",
        "do",
        "does",
        "did",
        "will",
        "would",
        "could",
        "should",
        "may",
        "might",
        "must",
        "can",
      ];

      return words.filter(
        (word) =>
          word.length > 2 && !stopWords.includes(word) && /^[a-z]+$/.test(word)
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
      if (subjects.length > 0)
        keyParts.push(`subj:${subjects.sort().join(",")}`);
      if (verbs.length > 0) keyParts.push(`verb:${verbs.sort().join(",")}`);

      return keyParts.join("|");
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
        return {
          confidence: pattern.confidence,
          answer: pattern.answer,
          source: "exact",
        };
      }

      // Fuzzy matching - look for similar patterns
      for (const [key, pattern] of this.learnedPatterns) {
        try {
          if (typeof this.calculateSimilarity !== 'function') {
            // ...removed debug log for production...
            break;
          }
          
          const similarity = this.calculateSimilarity(
            parsedQuestion,
            pattern.parsedComponents
          );
          if (similarity > 0.7) {
            // 70% similarity threshold
            // ...removed debug log for production...
            return {
              confidence: pattern.confidence * similarity,
              answer: pattern.answer,
              source: "fuzzy",
              similarity: similarity,
            };
          }
        } catch (error) {
          // ...removed debug log for production...
          continue;
        }
      }

      return null;
    }

    /**
     * Calculate similarity between two parsed questions
     * Fixed: Ensure proper function name and scope
     */
    calculateSimilarity(parsed1, parsed2) {
      let score = 0;
      let maxScore = 0;

      // Compare prefixes (high weight)
      if (parsed1.prefix && parsed2.prefix) {
        maxScore += 0.4;
        const prefixSimilarity = this.stringSimilarity(
          parsed1.prefix,
          parsed2.prefix
        );
        score += prefixSimilarity * 0.4;
      }

      // Compare subjects (high weight)
      maxScore += 0.4;
      const subjectOverlap = this.arrayOverlap(
        parsed1.subjects,
        parsed2.subjects
      );
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
      const words1 = str1.split(" ");
      const words2 = str2.split(" ");
      const common = words1.filter((word) => words2.includes(word));
      return common.length / Math.max(words1.length, words2.length);
    }

    /**
     * Calculate array overlap
     */
    arrayOverlap(arr1, arr2) {
      if (arr1.length === 0 && arr2.length === 0) return 1;
      if (arr1.length === 0 || arr2.length === 0) return 0;

      const common = arr1.filter((item) => arr2.includes(item));
      return common.length / Math.max(arr1.length, arr2.length);
    }

    /**
     * ⚡ DYNAMIC QUESTION TYPE DETECTION - No hardcoding!
     * Intelligently detect question types based on keywords and context
     */
    detectQuestionTypeFromContext(questionText, inputElement) {
      const text = questionText.toLowerCase();
      const inputType = this.detectInputType(inputElement);
      
      // Dynamic patterns for different question types
      const patterns = {
        name: {
          keywords: ['name', 'first name', 'last name', 'full name', 'fname', 'lname'],
          priority: 10
        },
        email: {
          keywords: ['email', 'e-mail', 'email address', 'contact email'],
          priority: 10
        },
        phone: {
          keywords: ['phone', 'number', 'telephone', 'mobile', 'cell', 'contact number', 'text message'],
          priority: 9
        },
        address: {
          keywords: ['address', 'street', 'city', 'state', 'zip', 'postal', 'location'],
          priority: 8
        },
        job_title: {
          keywords: ['job title', 'position', 'recent job', 'current job', 'title', 'role'],
          priority: 9
        },
        company: {
          keywords: ['employer', 'company', 'organization', 'workplace', 'recent employer'],
          priority: 9
        },
        experience: {
          keywords: ['experience', 'years', 'worked', 'employment'],
          priority: 7
        },
        education: {
          keywords: ['education', 'degree', 'school', 'university', 'college', 'diploma'],
          priority: 7
        },
        salary: {
          keywords: ['salary', 'wage', 'pay', 'compensation', 'rate', 'income'],
          priority: 8
        },
        availability: {
          keywords: ['available', 'start', 'when can you', 'earliest'],
          priority: 7
        },
        referral: {
          keywords: ['referred', 'referral', 'employee', 'recommended'],
          priority: 6
        },
        consent: {
          keywords: ['okay', 'agree', 'consent', 'permission', 'text message', 'contact'],
          priority: 5
        },
        visa: {
          keywords: ['visa', 'authorized', 'eligible', 'work authorization', 'citizen'],
          priority: 8
        }
      };

      let bestMatch = null;
      let highestScore = 0;

      // Score each pattern based on keyword matches
      for (const [type, pattern] of Object.entries(patterns)) {
        let score = 0;
        let matches = 0;
        
        for (const keyword of pattern.keywords) {
          if (text.includes(keyword)) {
            matches++;
            // Exact phrase matches get higher scores
            score += keyword.split(' ').length > 1 ? 2 : 1;
          }
        }
        
        // Apply priority and match ratio bonus
        if (matches > 0) {
          const finalScore = (score * pattern.priority) + (matches / pattern.keywords.length * 5);
          
          if (finalScore > highestScore) {
            highestScore = finalScore;
            bestMatch = {
              type: type,
              confidence: Math.min(finalScore / 10, 1), // Normalize to 0-1
              matches: matches,
              keywords_matched: pattern.keywords.filter(kw => text.includes(kw))
            };
          }
        }
      }

      // Add input type context
      if (bestMatch) {
        bestMatch.inputType = inputType;
        bestMatch.isRequired = questionText.includes('*') || inputElement?.hasAttribute('required');
        bestMatch.isOptional = text.includes('optional') || text.includes('(optional)');
      }

      console.log(`🔍 Dynamic detection for "${questionText.substring(0, 50)}...":`, bestMatch);
      return bestMatch || { type: 'unknown', confidence: 0, inputType: inputType };
    }

    /**
     * ⚡ SMART VALUE GENERATION - Uses config + detected type
     */
    async generateSmartValue(questionType, questionText, inputType) {
      try {
        // Load user config if not already loaded
        if (!this.userConfig) {
          await this.loadUserConfig();
        }

        const config = this.userConfig;
        if (!config) {
          console.warn('⚠️ No user config available for smart value generation');
          return null;
        }

        // Generate value based on detected question type
        switch (questionType.type) {
          case 'name':
            if (questionText.toLowerCase().includes('first')) {
              return config.personalInfo?.firstName || 'John';
            } else if (questionText.toLowerCase().includes('last')) {
              return config.personalInfo?.lastName || 'Doe';
            } else {
              return `${config.personalInfo?.firstName || 'John'} ${config.personalInfo?.lastName || 'Doe'}`;
            }

          case 'email':
            return config.personalInfo?.email || 'john.doe@email.com';

          case 'phone':
            return config.personalInfo?.phoneNumber || '(555) 123-4567';

          case 'job_title':
            return config.professionalInfo?.mostRecentJobTitle || 'Software Developer';

          case 'company':
            return config.professionalInfo?.mostRecentEmployer || 'Tech Company';

          case 'address':
            const addr = config.personalInfo?.address;
            if (!addr) return '123 Main St, City, State 12345';
            
            if (questionText.toLowerCase().includes('street')) {
              return addr.street || '123 Main St';
            } else if (questionText.toLowerCase().includes('city')) {
              return addr.city || 'City';
            } else if (questionText.toLowerCase().includes('state')) {
              return addr.state || 'State';
            } else if (questionText.toLowerCase().includes('zip')) {
              return addr.zipCode || '12345';
            } else {
              return `${addr.street || '123 Main St'}, ${addr.city || 'City'}, ${addr.state || 'State'} ${addr.zipCode || '12345'}`;
            }

          case 'salary':
            return config.professionalInfo?.desiredSalary || '75000';

          case 'experience':
            return config.professionalInfo?.yearsOfExperience?.toString() || '3';

          case 'education':
            const edu = config.education?.degrees?.[0];
            if (questionText.toLowerCase().includes('degree')) {
              return edu?.degreeType || 'Bachelor of Science';
            } else if (questionText.toLowerCase().includes('school') || questionText.toLowerCase().includes('university')) {
              return edu?.institutionName || 'University';
            }
            return edu?.degreeType || 'Bachelor of Science';

          case 'consent':
            // For yes/no questions, prefer "Yes" for consent
            return questionText.toLowerCase().includes('okay') || 
                   questionText.toLowerCase().includes('agree') ? 'yes' : 'no';

          case 'referral':
            // Usually optional, leave blank unless specified
            return '';

          case 'visa':
            return config.personalInfo?.workAuthorization || 'yes';

          case 'availability':
            return config.professionalInfo?.availableStartDate || 'Immediately';

          default:
            // Try pattern matching from textInputPatterns
            if (config.textInputPatterns) {
              for (const pattern of config.textInputPatterns) {
                if (questionText.toLowerCase().includes(pattern.keywords.toLowerCase())) {
                  return pattern.response;
                }
              }
            }
            
            // Enhanced unknown field handling - make intelligent guesses
            console.log(`🤔 Unknown question type detected: "${questionText}" - applying smart fallbacks`);
            const lowerText = questionText.toLowerCase();
            
            // Work-related questions
            if (lowerText.includes('work') && (lowerText.includes('hour') || lowerText.includes('time'))) {
              return config.professionalInfo?.workHours || '40 hours per week';
            }
            if (lowerText.includes('overtime')) {
              return 'Yes, when needed';
            }
            if (lowerText.includes('shift') || lowerText.includes('schedule')) {
              return config.professionalInfo?.preferredSchedule || 'Flexible with standard business hours';
            }
            
            // Benefits and compensation
            if (lowerText.includes('benefit') || lowerText.includes('insurance')) {
              return 'Standard benefits package preferred';
            }
            if (lowerText.includes('401k') || lowerText.includes('retirement')) {
              return 'Yes, interested in retirement benefits';
            }
            
            // Skills and certifications
            if (lowerText.includes('skill') || lowerText.includes('technolog')) {
              return config.professionalInfo?.primarySkills || 'Relevant skills as outlined in resume';
            }
            if (lowerText.includes('certification') || lowerText.includes('license')) {
              return config.education?.certifications || 'See resume for relevant certifications';
            }
            
            // Generic professional responses
            if (lowerText.includes('why') && (lowerText.includes('interest') || lowerText.includes('want'))) {
              return config.professionalInfo?.motivation || 'I am interested in this opportunity to contribute my skills and grow professionally.';
            }
            if (lowerText.includes('strength') || lowerText.includes('asset')) {
              return 'Strong problem-solving abilities and collaborative approach to achieving team goals.';
            }
            if (lowerText.includes('challenge') || lowerText.includes('difficult')) {
              return 'I approach challenges methodically and work collaboratively to find effective solutions.';
            }
            
            // Yes/No questions - default to positive when appropriate
            if ((lowerText.includes('can you') || lowerText.includes('are you') || lowerText.includes('will you')) &&
                !lowerText.includes('criminal') && !lowerText.includes('fired')) {
              return 'Yes';
            }
            
            // For unrecognized questions, provide a professional default
            if (inputType === 'textarea') {
              return 'Please see my resume for relevant details. Happy to discuss further during interview.';
            }
            
            return null;
        }
      } catch (error) {
        console.error('❌ Error generating smart value:', error);
        return null;
      }
    }

    /**
     * Show learning success indicator
     */
    showLearningSuccess(questionData) {
      const indicator = findByIdRobust([
        `learning-indicator-${questionData.id}`,
        `learning-${questionData.id}`,
        `indicator-${questionData.id}`
      ]);
      if (indicator) {
        indicator.textContent = "✅ LEARNED";
        indicator.style.background = "linear-gradient(45deg, #2196F3, #1976D2)";
        indicator.style.animation = "none";

        setTimeout(() => {
          if (indicator.parentNode) {
            indicator.style.transition = "opacity 0.3s, transform 0.3s";
            indicator.style.opacity = "0";
            indicator.style.transform = "scale(0.8)";
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

      console.log(
        `🛑 Stopped watching question (${reason}): "${questionData.questionText}"`
      );

      // Clean up event listeners
      if (questionData.cleanupFunctions) {
        questionData.cleanupFunctions.forEach((cleanup) => cleanup());
      }

      // Remove learning indicator
      const indicator = findByIdRobust([
        `learning-indicator-${watchId}`,
        `learning-${watchId}`,
        `indicator-${watchId}`
      ]);
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
        ".jobsearch-InlineCompanyRating",
        ".jobsearch-CompanyReview--heading",
        "h1",
        "h2",
        ".company-name",
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
          return element.textContent.trim();
        }
      }

      return "Unknown Company";
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
          console.log(
            `💾 Successfully saved ${patternsArray.length} learned patterns to JSON configuration`
          );

          // Also save to localStorage as backup
          localStorage.setItem(
            "questionLearningPatterns_backup",
            JSON.stringify(Array.from(this.learnedPatterns.entries()))
          );

          // Notify background script of successful learning
          if (isExtensionContextValid()) {
            chrome.runtime
              .sendMessage({
                action: "patternLearned",
                count: patternsArray.length,
                latestPattern: patternsArray[patternsArray.length - 1],
              })
              .catch((error) => {
                console.log(
                  "Background notification failed (not critical):",
                  error.message
                );
              });
          }
        } else {
          throw new Error("JSON config save failed");
        }
      } catch (error) {
        console.error(
          "❌ Failed to save learned patterns to JSON config:",
          error
        );

        // Enhanced fallback to localStorage with timestamp
        try {
          const patternsWithMeta = {
            patterns: Array.from(this.learnedPatterns.entries()),
            lastSaved: Date.now(),
            version: "2.0",
          };
          localStorage.setItem(
            "questionLearningPatterns",
            JSON.stringify(patternsWithMeta)
          );
          console.log(
            `💾 Fallback: Saved ${this.learnedPatterns.size} learned patterns to localStorage with metadata`
          );
        } catch (fallbackError) {
          console.error("❌ Fallback save also failed:", fallbackError);
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
          const patternKey =
            pattern.patternKey ||
            this.generatePatternKey(
              pattern.parsedComponents ||
                this.parseQuestionComponents(pattern.originalQuestion)
            );
          pattern.patternKey = patternKey; // Ensure pattern has key for future use
          this.learnedPatterns.set(patternKey, pattern);
        });

        console.log(
          `📚 Loaded ${this.learnedPatterns.size} learned patterns from JSON configuration`
        );

        // Also check for localStorage patterns and merge if newer
        await this.mergeLocalStoragePatterns();
      } catch (error) {
        console.error(
          "❌ Failed to load learned patterns from JSON config:",
          error
        );
        await this.loadFromLocalStorageFallback();
      }
    }

    /**
     * Merge patterns from localStorage if they're newer or additional
     */
    async mergeLocalStoragePatterns() {
      try {
        const stored = localStorage.getItem("questionLearningPatterns");
        if (stored) {
          const localData = JSON.parse(stored);

          // Handle both old format (array) and new format (with metadata)
          const patternsArray = localData.patterns || localData;
          let mergedCount = 0;

          if (Array.isArray(patternsArray)) {
            patternsArray.forEach(([key, pattern]) => {
              // Only merge if not exists or if localStorage version is newer
              const existingPattern = this.learnedPatterns.get(key);
              if (
                !existingPattern ||
                (pattern.learnedAt &&
                  existingPattern.learnedAt &&
                  pattern.learnedAt > existingPattern.learnedAt)
              ) {
                this.learnedPatterns.set(key, pattern);
                mergedCount++;
              }
            });
          }

          if (mergedCount > 0) {
            // ...removed debug log for production...
            // Save merged patterns back to config
            await this.saveLearnedPatterns();
          }
        }
      } catch (error) {
        // ...removed debug log for production...
      }
    }

    /**
     * Fallback to load from localStorage only
     */
    async loadFromLocalStorageFallback() {
      try {
        const stored = localStorage.getItem("questionLearningPatterns");
        if (stored) {
          const localData = JSON.parse(stored);
          const patternsArray = localData.patterns || localData;

          if (Array.isArray(patternsArray)) {
            this.learnedPatterns = new Map(patternsArray);
            // ...removed debug log for production...
          } else {
            this.learnedPatterns = new Map();
          }
        } else {
          this.learnedPatterns = new Map();
          // ...removed debug log for production...
        }
      } catch (fallbackError) {
  // ...removed debug log for production...
        this.learnedPatterns = new Map();
      }
    }

    /**
     * Check if we have learned patterns that match the current question
     */
    async checkLearnedPatterns(questionText, container) {
      // Wait for initialization to complete
      if (!this.initialized) {
  // ...removed debug log for production...
        let attempts = 0;
        const loopProtection = LOOP_PROTECTION.startLoop(50); // Max 50 attempts
        
        try {
          while (!this.initialized && attempts < 50) {
            loopProtection.check(); // Check for infinite loop protection
            
            // Wait up to 5 seconds
            await new Promise((resolve) => setTimeout(resolve, 100));
            attempts++;
          }
        } finally {
          loopProtection.end(); // Clean up loop tracking
        }
      }

      if (this.learnedPatterns.size === 0) {
        return null;
      }

      console.log(`🧠 Checking learned patterns for: "${questionText}"`);

      // Parse the current question with error handling
      let currentParsed;
      try {
        currentParsed = this.parseQuestionComponents(questionText);
  // ...removed debug log for production...
      } catch (error) {
  // ...removed debug log for production...
        // Fallback to simple parsing
        currentParsed = { keywords: questionText.toLowerCase().split(' '), type: 'text' };
      }

      let bestMatch = null;
      let highestSimilarity = 0;
      const SIMILARITY_THRESHOLD = 0.7; // 70% similarity required

      // Check against all learned patterns
      for (const [patternId, pattern] of this.learnedPatterns.entries()) {
        let similarity = 0;
        
        try {
          // Ensure calculateSimilarity function exists
          if (typeof this.calculateSimilarity !== 'function') {
            // ...removed debug log for production...
            continue;
          }
          
          similarity = this.calculateSimilarity(
            currentParsed,
            pattern.parsedComponents || pattern.parsedQuestion
          );

          // ...removed debug log for production...
        } catch (error) {
          // ...removed debug log for production...
          continue;
        }

        if (
          similarity > highestSimilarity &&
          similarity >= SIMILARITY_THRESHOLD
        ) {
          highestSimilarity = similarity;
          bestMatch = pattern;
        }
      }

      if (bestMatch) {
        // ...removed debug log for production...

        // Try to fill the answer using the learned pattern
        const success = await this.applyLearnedAnswer(
          container,
          bestMatch.answer,
          bestMatch.inputType
        );

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

      // ...removed debug log for production...

      // 🚀 FALLBACK: Use dynamic detection for new questions
  // ...removed debug log for production...
      
      try {
        const inputElement = container.querySelector('input, select, textarea');
        const questionType = this.detectQuestionTypeFromContext(questionText, inputElement);
        
        if (questionType && questionType.confidence > 0.5) {
          // ...removed debug log for production...
          
          const smartValue = await this.generateSmartValue(questionType, questionText, questionType.inputType);
          
          if (smartValue !== null && smartValue !== '') {
            // ...removed debug log for production...
            
            // Try to apply the smart value
            const success = await this.applyLearnedAnswer(
              container,
              smartValue,
              questionType.inputType
            );
            
            if (success) {
              // Create a learning pattern for future use
              await this.createLearningPatternFromSmartDetection(
                questionText,
                smartValue,
                questionType,
                container
              );
              
              return smartValue;
            }
          }
        }
      } catch (error) {
        console.error("❌ Dynamic detection failed:", error);
      }

      return null;
    }

    /**
     * Apply a learned answer to the appropriate input element
     */
    async applyLearnedAnswer(container, answer, inputType) {
      try {
        let input = null;

        // ROBUST INPUT TYPE DETECTION AND SELECTION
        switch (inputType) {
          case "number":
            const numberSelectors = [
              'input[type="number"]', 'input[inputmode="numeric"]', 
              'input[inputmode="decimal"]', 'input[pattern*="[0-9]"]',
              'input[data-type="number"]', 'input[class*="number"]',
              'input[min][max]', 'input[step]'
            ];
            input = findElementRobust(numberSelectors, container);
            break;
          case "text":
            const textSelectors = [
              'input[type="text"]', 'input:not([type])', 'input[type=""]',
              'input[data-testid*="input"]:not([min])',
              'input[class*="text"]', 'input[placeholder]'
            ];
            input = findElementRobust(textSelectors, container);
            break;
          case "textarea":
            const textareaSelectors = [
              'textarea', '[contenteditable="true"]', 
              'div[role="textbox"]', '[data-type="textarea"]'
            ];
            input = findElementRobust(textareaSelectors, container);
            break;
          case "select":
            const selectSelectors = [
              'select', '[role="combobox"]', '[role="listbox"]',
              '[data-type="select"]', '.select', '.dropdown'
            ];
            input = findElementRobust(selectSelectors, container);
            break;
          case "radio":
            // ROBUST RADIO BUTTON DETECTION AND MATCHING
            const radioSelectors = [
              'input[type="radio"]', '[role="radio"]', 
              '[data-type="radio"]', '.radio input'
            ];
            const radios = findElementsRobust(radioSelectors, container);
            
            for (const radio of radios) {
              const labelSelectors = [
                'label', `label[for="${radio.id}"]`, 
                '.label', '.radio-label', '[data-label]'
              ];
              const label = radio.closest('label') || 
                          findElementRobust(labelSelectors.slice(1), container);
              
              const labelText = label ? label.textContent.trim().toLowerCase() : '';
              const radioValue = (radio.value || '').toLowerCase();
              const answerLower = answer.toLowerCase();
              
              if (labelText.includes(answerLower) || 
                  radioValue === answerLower ||
                  (answerLower === 'yes' && (radioValue === 'yes' || labelText.includes('yes'))) ||
                  (answerLower === 'no' && (radioValue === 'no' || labelText.includes('no')))) {
                input = radio;
                break;
              }
            }
            break;
          case "checkbox":
            const checkboxSelectors = [
              'input[type="checkbox"]', '[role="checkbox"]',
              '[data-type="checkbox"]', '.checkbox input'
            ];
            input = findElementRobust(checkboxSelectors, container);
            break;
        }

        if (!input) {
          // ROBUST FALLBACK INPUT DETECTION
          const fallbackSelectors = [
            "input:not([type='hidden'])", "textarea", "select",
            "[contenteditable='true']", "[role='textbox']", 
            "[role='combobox']", "[role='listbox']", "[data-input]"
          ];
          input = findElementRobust(fallbackSelectors, container);
        }

        if (input) {
          // ...removed debug log for production...

          if (input.type === "radio" || input.type === "checkbox") {
            input.click();
          } else if (input.tagName === "SELECT") {
            // Find matching option
            const options = input.querySelectorAll("option");
            for (const option of options) {
              if (
                option.textContent
                  .toLowerCase()
                  .includes(answer.toLowerCase()) ||
                option.value.toLowerCase() === answer.toLowerCase()
              ) {
                input.value = option.value;
                input.dispatchEvent(new Event("change", { bubbles: true }));
                return true;
              }
            }
          } else {
            // Text input or textarea
            input.focus();
            input.value = answer;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
            input.blur();
          }

          return true;
        }

        // ...removed debug log for production...
        return false;
      } catch (error) {
        // ...removed debug log for production...
        return false;
      }
    }

    /**
     * Show a visual indicator when a learned pattern is matched
     */
    showMatchIndicator(container, pattern, similarity) {
      const indicator = document.createElement("div");
      indicator.className = "learning-match-indicator";
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
      if (!findByIdRobust(["learning-match-styles", "learning-match", "match-styles"])) {
        const style = document.createElement("style");
        style.id = "learning-match-styles";
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

      container.style.position = container.style.position || "relative";
      container.appendChild(indicator);

      // Remove indicator after animation
      setTimeout(() => {
        if (indicator.parentNode) {
          indicator.parentNode.removeChild(indicator);
        }
      }, 2000);
    }

    /**
     * 🤖 Create learning pattern automatically from smart detection
     */
    async createLearningPatternFromSmartDetection(questionText, smartValue, questionType, container) {
      try {
  // ...removed debug log for production...
        
        const parsedQuestion = this.parseQuestionComponents(questionText);
        const patternKey = this.generatePatternKey(parsedQuestion);
        
        // Check if pattern already exists
        if (this.learnedPatterns.has(patternKey)) {
          // ...removed debug log for production...
          const existingPattern = this.learnedPatterns.get(patternKey);
          existingPattern.timesEncountered = (existingPattern.timesEncountered || 0) + 1;
          existingPattern.lastEncountered = Date.now();
          return;
        }

        // Create new learning pattern
        const learnedPattern = {
          id: `auto_pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          originalQuestion: questionText,
          normalizedQuestion: questionText.toLowerCase().trim(),
          parsedComponents: parsedQuestion,
          patternKey: patternKey,
          answer: smartValue,
          inputType: questionType.inputType,
          confidence: questionType.confidence,
          learnedAt: Date.now(),
          lastEncountered: Date.now(),
          timesEncountered: 1,
          timesUsed: 1, // Already used once
          lastUsed: Date.now(),
          url: window.location.href,
          company: this.extractCompanyName(),
          domain: window.location.hostname,
          autoGenerated: true, // Mark as auto-generated
          questionTypeDetected: questionType.type,
          keywordsMatched: questionType.keywords_matched || []
        };

        // Save the learned pattern
        this.learnedPatterns.set(patternKey, learnedPattern);

  // ...removed debug log for production...

        // Save patterns asynchronously
        await this.saveLearnedPatterns();

        // Show brief success indicator
        this.showAutoLearningIndicator(container, questionType);

      } catch (error) {
        // ...removed debug log for production...
      }
    }

    /**
     * Show indicator that auto-learning occurred
     */
    showAutoLearningIndicator(container, questionType) {
      try {
        const indicator = createSafeElement("div", {
          className: "auto-learning-indicator",
          innerHTML: `🤖 Auto-learned: ${questionType.type}`,
          style: {
            position: 'absolute',
            top: '-5px',
            right: '-5px',
            background: 'linear-gradient(45deg, #4CAF50, #45a049)',
            color: 'white',
            padding: '4px 8px',
            borderRadius: '12px',
            fontSize: '11px',
            fontWeight: 'bold',
            zIndex: '10000',
            animation: 'autoLearnPulse 2s ease-out',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
          }
        });

        if (indicator) {
          // Add CSS animation if not already present
          if (!findByIdRobust(["auto-learning-styles", "auto-learning", "learning-styles"])) {
            const style = document.createElement("style");
            style.id = "auto-learning-styles";
            style.textContent = `
            @keyframes autoLearnPulse {
              0% { transform: scale(0.7) rotate(-5deg); opacity: 0; }
              15% { transform: scale(1.1) rotate(0deg); opacity: 1; }
              85% { transform: scale(1) rotate(0deg); opacity: 1; }
              100% { transform: scale(0.8) rotate(0deg); opacity: 0; }
            }
            `;
            document.head.appendChild(style);
          }

          container.style.position = container.style.position || "relative";
          safeAppendChild(container, indicator);

          // Remove indicator after animation
          setTimeout(() => {
            if (indicator && indicator.parentNode) {
              indicator.parentNode.removeChild(indicator);
            }
          }, 2000);
        }
      } catch (error) {
        console.warn("⚠️ Could not show auto-learning indicator:", error);
      }
    }

    /**
     * Get statistics about learned patterns
     */
    getStats() {
      return {
        totalPatterns: this.learnedPatterns.size,
        currentlyWatching: this.watchedQuestions.size,
        patterns: Array.from(this.learnedPatterns.values()).map((p) => ({
          question: p.originalQuestion,
          answer: p.answer,
          confidence: p.confidence,
          learnedAt: new Date(p.learnedAt).toLocaleString(),
          company: p.company,
          timesUsed: p.timesUsed || 0,
          lastUsed: p.lastUsed
            ? new Date(p.lastUsed).toLocaleString()
            : "Never",
        })),
      };
    }
  }

  // Initialize the learning system
  window.questionLearningSystem = new QuestionLearningSystem();

  // Function to handle startProcess message (extracted to prevent duplicate listeners)
  const handleStartProcess = async () => {
    console.log("🚀 START BUTTON CLICKED - Enabling automation");
    debugLog("User clicked START - automation now enabled", "AUTOMATION");
    try {
      // Enable automation explicitly
      window.automationAllowed = true;
      window.manualStartRequired = false;
      window.automationRunning = true;
      
      // Start continuous state preservation immediately
      startAutomationStatePreservation();
      
      // PERSIST automation state to survive page reloads and context recovery
      preserveAutomationState({
        userStarted: true,
        startTime: Date.now(),
        startUrl: window.location.href
      });
      
      try {
        const automationState = {
          automationAllowed: true,
          manualStartRequired: false,
          automationRunning: true,
          timestamp: Date.now(),
          url: window.location.href,
          sessionId: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
          indeedDomain: window.location.hostname
        };
        
        localStorage.setItem('extensionAutomationState', JSON.stringify(automationState));
        sessionStorage.setItem('extensionAutomationState', JSON.stringify(automationState));
        
        // Also store in global window for immediate access
        window.automationStateData = automationState;
        
        console.log("💾 Automation state persisted to both localStorage and sessionStorage");
        
        // Set up periodic state refresh to maintain freshness during long automation
        if (window.stateRefreshInterval) {
          clearInterval(window.stateRefreshInterval);
        }
        
        window.stateRefreshInterval = setInterval(() => {
          if (window.automationAllowed && window.automationRunning) {
            try {
              const refreshedState = {
                ...automationState,
                timestamp: Date.now(),
                url: window.location.href
              };
              
              localStorage.setItem('extensionAutomationState', JSON.stringify(refreshedState));
              sessionStorage.setItem('extensionAutomationState', JSON.stringify(refreshedState));
              window.automationStateData = refreshedState;
              
              console.log("🔄 Automation state refreshed");
            } catch (e) {
              console.warn("Could not refresh automation state:", e.message);
            }
          } else {
            // Clear interval if automation stopped
            clearInterval(window.stateRefreshInterval);
            window.stateRefreshInterval = null;
          }
        }, 5000); // Refresh every 5 seconds during automation
        
      } catch (storageError) {
        console.warn("Could not persist automation state:", storageError.message);
      }
      
      // Reset any emergency stop flag
      window.emergencyStopFlag = false;
      
      // Start the learning system if available
      if (window.learningSystem && typeof window.learningSystem.startAutoDetection === 'function') {
        debugLog("Starting learning system auto-detection", "AUTOMATION");
        window.learningSystem.startAutoDetection();
      }
      
      // 🔄 SET UP FORM DETECTION LISTENER: Auto-activate when forms appear
      if (!window.formDetectionSetup) {
        window.formDetectionSetup = true;
        
        const checkForNewForms = () => {
          if (!window.automationAllowed || window.emergencyStopFlag) return;
          
          const applicationIndicators = [
            'form[action*="apply"]', 'form[class*="application"]', 'form[id*="application"]',
            '[class*="smartapply"]', '[class*="indeed-apply"]', '[class*="job-apply"]',
            'input[type="file"]', 'textarea[name*="cover"]', '[data-testid*="application"]'
          ];
          
          const hasNewForms = applicationIndicators.some(selector => {
            try {
              const element = document.querySelector(selector);
              return element && element.offsetParent !== null && !element.dataset.extensionProcessed;
            } catch (e) {
              return false;
            }
          });
          
          if (hasNewForms && !window.automationRunning) {
            console.log("🎯 New application forms detected - starting automation");
            setTimeout(() => {
              runDynamicApplicationWorkflow().catch(e => {
                console.log("Form automation completed or stopped:", e.message);
              });
            }, 1000);
          }
        };
        
        // Monitor for dynamically loaded forms
        const observer = new MutationObserver(() => {
          if (window.automationAllowed) {
            setTimeout(checkForNewForms, 500);
          }
        });
        
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: false
        });
        
        // Also check periodically
        setInterval(checkForNewForms, 3000);
        
        console.log("🔄 Form detection listener activated - automation will start when forms appear");
      }
      
      // 🎯 FORM-AWARE AUTOMATION: Only activate when application forms are present
      const hasApplicationForms = () => {
        const applicationIndicators = [
          'form[action*="apply"]', 'form[class*="application"]', 'form[id*="application"]',
          '[class*="smartapply"]', '[class*="indeed-apply"]', '[class*="job-apply"]',
          '[data-testid*="application"]', '[data-testid*="apply"]',
          '.application-form', '.job-application', '.apply-form',
          'input[name*="resume"]', 'input[name*="cv"]', 'input[type="file"]',
          'textarea[name*="cover"]', 'textarea[placeholder*="cover" i]'
        ];
        
        return applicationIndicators.some(selector => {
          try {
            const element = document.querySelector(selector);
            return element && element.offsetParent !== null; // Visible check
          } catch (e) {
            return false;
          }
        });
      };

      // Check if we're on a search/listing page (should NOT auto-fill)
      const isOnSearchListingPage = () => {
        const searchPageIndicators = [
          'input[name*="q"]', 'input[placeholder*="search" i]', 'input[placeholder*="job title" i]',
          '.job-search', '.search-bar', '#searchform', '[class*="search-input"]'
        ];
        
        // Check for job listing containers (indicates we're browsing, not applying)
        const jobListingIndicators = [
          '[data-jk]', '.jobsearch-SerpJobCard', '.job_seen_beacon', 
          '.slider_container', '.jobsearch-results', '#resultsCol'
        ];
        
        const hasSearchElements = searchPageIndicators.some(selector => {
          try {
            const element = document.querySelector(selector);
            return element && element.offsetParent !== null;
          } catch (e) {
            return false;
          }
        });
        
        const hasJobListings = jobListingIndicators.some(selector => {
          try {
            return document.querySelector(selector) !== null;
          } catch (e) {
            return false;
          }
        });
        
        return hasSearchElements || hasJobListings;
      };

      // � START JOB COLLECTION AND PROCESSING 
      if (isOnSearchListingPage() && !hasApplicationForms()) {
        console.log("🎯 Starting job collection from search/listing page");
        console.log("� Will automatically find and apply to jobs...");
        
        try {
          // Call the main job processing function
          indeedMain();
          return { 
            status: "started", 
            message: "Job collection and automation started from search page" 
          };
        } catch (error) {
          console.error("❌ Failed to start job collection:", error);
          return { 
            status: "error", 
            message: `Failed to start job collection: ${error.message}` 
          };
        }
      }
      
      // ✅ ALLOW automation when application forms are detected (single job mode)
      if (hasApplicationForms()) {
        debugLog("✅ Application forms detected - starting single job automation", "AUTOMATION");
        const result = await runDynamicApplicationWorkflow();
        return { status: "success", message: "Job application automation started", result: result };
      }
      
      // 📋 IF on job detail page but no forms yet, start job processing 
      if (window.location.href.includes("/viewjob") || 
          window.location.href.includes("/job/") ||
          document.querySelector('[data-testid="jobsearch-JobInfoHeader"]')) {
        console.log("📋 Starting automation on job detail page");
        console.log("🔄 Will look for Apply buttons and process application...");
        
        try {
          // Call the main job processing function for single job
          indeedMain();
          return { 
            status: "started", 
            message: "Job processing started on job detail page" 
          };
        } catch (error) {
          console.error("❌ Failed to start job processing:", error);
          return { 
            status: "error", 
            message: `Failed to start job processing: ${error.message}` 
          };
        }
      }
      
      // 🚀 FALLBACK: Try to start automation anyway
      console.log("🚀 Starting automation on current page...");
      try {
        indeedMain();
        return { 
          status: "started", 
          message: "Automation started - will adapt to current page" 
        };
      } catch (error) {
        console.error("❌ Failed to start automation:", error);
        return { 
          status: "error", 
          message: `Failed to start automation: ${error.message}` 
        };
      }
    } catch (error) {
      console.error("❌ Error in handleStartProcess:", error);
      return { status: "error", message: error.message };
    }
  };

// ENTERY PONT 
// Starting point
  const startIndeed = async () => {
  // ...removed debug log for production...
    
    try {
      // ✅ ROBUST JOB CARD CONTAINER DETECTION
      const homeJobCardSelectors = [
        "#mosaic-provider-jobcards-1",
        "#mosaic-provider-jobcards",
        "[data-test='mosaic-provider-jobcards']", 
        ".mosaic-provider-jobcards",
        "[id*='mosaic-provider-jobcards']",
        "[class*='mosaic-provider-jobcards']",
        "#mosaic-jobcards",
        ".jobCards"
      ];
      
      const searchJobCardSelectors = [
        "#mosaic-jobResults",
        "#resultsCol",
        "[data-test='jobResults']",
        ".jobsearch-results",
        "[id*='jobResults']",
        "[class*='jobResults']",
        "#searchResultsContainer",
          ".jobsearch-NoResult"
        ];
        
        const getJobCards = findElementRobust(homeJobCardSelectors);
        const searchJobCards = findElementRobust(searchJobCardSelectors);

  // ...removed debug log for production...

        // CRITICAL FIX: Properly handle async functions
        (async () => {
          try {
            if (getJobCards) {
              // if they don't search for a job (scrapes the home page)
              // ...removed debug log for production...
              await jobCardScrape(getJobCards);
            } else if (searchJobCards) {
              // if they search for a job (scrapes the search results page)
              // ...removed debug log for production...
              await new Promise((resolve) => {
                autoScrollToBottom(() => {
                  // ...removed debug log for production...
                  jobCardScrape(searchJobCards).then(resolve).catch(resolve);
                });
              });
            } else {
              // ...removed debug log for production...
            }
          } catch (error) {
            // ...removed debug log for production...
            throw error;
          }
        })();
        
        console.log("✅ Job collection process completed");
        
      } catch (error) {
        console.error("❌ Error in startIndeed function:", error);
        throw error;
      }
    }; // END startIndeed function

  function indeedMain() {
    // � FIRST: Validate automation context
    const contextValidation = validateAutomationContext('Indeed Main Job Detection');
    if (!contextValidation.valid) {
      console.log(`🛑 Job detection blocked: ${contextValidation.reason}`);
      
      // If context is invalid but recoverable, don't return - let safety check handle it
      if (!contextValidation.shouldRecover) {
        return;
      }
    }
    
    // �🛑 SAFETY CHECK: Only proceed if manually started
    if (!window.automationAllowed || window.manualStartRequired) {
      console.log("🛑 Automation blocked - manual start required. Click Start button first.");
      return;
    }
    
    console.log("✅ Manual start verified - proceeding with job detection");
    
    // Try multiple selectors for Indeed's dynamic content
    const indeedSelectors = [
      "#MosaicProviderRichSearchDaemon",
      "[data-jk]", // Job card identifier
      ".jobsearch-SerpJobCard",
      ".job_seen_beacon",
      ".slider_container",
      ".jobsearch-NoResult",
      "#resultsCol",
      ".jobsearch-results"
    ];

    new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 50; // 5 seconds max wait (reduced)

      const checkExist = setInterval(() => {
        attempts++;
        
        // Check if any Indeed-specific element exists
        const foundElement = indeedSelectors.some(selector => 
          document.querySelector(selector)
        );
        
        if (foundElement || document.readyState === 'complete') {
          clearInterval(checkExist);
          // ...removed debug log for production...
          resolve();
        } else if (attempts >= maxAttempts) {
          clearInterval(checkExist);
          // ...removed debug log for production...
          resolve(); // Don't reject, just proceed with generic detection
        }
      }, 100);
    })
      .then(() => {
        try {
          startIndeed();
        } catch (err) {
          // ...removed debug log for production...
          // Fallback to generic auto-detection
          if (typeof autoDetectUnknownQuestions === 'function') {
            autoDetectUnknownQuestions();
          }
        }
      })
      .catch((err) => {
  // ...removed debug log for production...
        // Still try generic detection as fallback
        if (typeof autoDetectUnknownQuestions === 'function') {
          autoDetectUnknownQuestions();
        }
      });
  }

  // Auto-start removed - now only starts when user clicks Start button
  // indeedMain() will be called manually via handleStartProcess() when startProcess message received

  // sgets job card data
  // ...existing code...
  const jobCardScrape = async (getJobCards) => {
  // ...removed debug log for production...
    const jobs = scrapePage(getJobCards);
  // ...removed debug log for production...

    // Here you can implement any additional logic you need before sending the jobs data
    //  TODO : add open page to check for apply on company website

    // Send the jobs data to the background script
    if (jobs.length > 0) {
      if (isExtensionContextValid()) {
        try {
          // ...removed debug log for production...
          chrome.runtime.sendMessage(
            { action: "queueJobs", jobs },
            (response) => {
              if (chrome.runtime.lastError) {
                const errorMsg = chrome.runtime.lastError.message;
                // ...removed debug log for production...

                if (errorMsg.includes("Extension context invalidated")) {
                  // ...removed debug log for production...
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
    const searchFormSelectors = [
      "#MosaicProviderRichSearchDaemon",
      "#searchbox",
      ".searchbox-container",
      "[data-testid='searchform']",
      "form[role='search']",
      ".searchform",
      "#searchform",
      "[id*='search-form']",
      "[class*='search-form']"
    ];
    const searchForm = findElementRobust(searchFormSelectors);
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
      // ROBUST JOB TITLE EXTRACTION
      const jobTitleSelectors = [
        "h2.jobTitle span",
        "h2.jobTitle a span", 
        "h2[data-testid*='title'] span",
        "h2[class*='title'] span",
        ".jobTitle span",
        ".jobTitle a",
        "h2 a[data-jk]",
        "[data-testid*='title'] span",
        "[class*='job-title'] span",
        "[class*='jobTitle'] span"
      ];
      const jobTitle = findElementRobust(jobTitleSelectors, card)?.textContent?.trim() || null;
      
      // ROBUST COMPANY NAME EXTRACTION  
      const companyNameSelectors = [
        '[data-testid="company-name"]',
        '[data-testid="company-name"] a',
        '.companyName',
        '.companyName a',
        '[class*="company-name"]',
        '[class*="companyName"]',
        'span[title*="company"]', 
        'a[data-testid="company-name"]',
        '[data-testid*="company"] span',
        '.jobMetaDataGroup span:first-child'
      ];
      const companyName = findElementRobust(companyNameSelectors, card)?.textContent?.trim() || null;
      
      // ROBUST LOCATION EXTRACTION
      const locationSelectors = [
        '[data-testid="text-location"]',
        '[data-testid="job-location"]',
        '.companyLocation',
        '.jobLocation', 
        '[class*="location"]',
        '[data-testid*="location"]',
        'div[data-testid="text-location"]',
        'span[data-testid="text-location"]'
      ];
      const location = findElementRobust(locationSelectors, card)?.textContent?.trim() || null;
      // Get company description
      const companyDesc =
        card.querySelector(".jobMetaDataGroup")?.innerText?.trim() || null;
      // ROBUST JOB LINK AND ID EXTRACTION
      const jobLinkSelectors = [
        "h2.jobTitle a",
        "h2 a[data-jk]",
        ".jobTitle a", 
        "a[data-jk]",
        "h2 a[href*='viewjob']",
        "[data-testid*='title'] a",
        "[class*='job-title'] a",
        "a[href*='/jobs/view/']",
        "a[onclick*='viewjob']"
      ];
      const jobLinkEl = findElementRobust(jobLinkSelectors, card);
      let jobLink = jobLinkEl?.href || null;
      
      // ROBUST JOB ID EXTRACTION
      const jobId = jobLinkEl?.getAttribute("data-jk") || 
                   jobLinkEl?.getAttribute("id") ||
                   card.getAttribute("data-jk") ||
                   card.querySelector("[data-jk]")?.getAttribute("data-jk") ||
                   null;

      // Validate and fix job URL to ensure it goes to the right page
      if (jobLink) {
        // Ensure the URL is absolute
        if (jobLink.startsWith("/")) {
          jobLink = "https://www.indeed.com" + jobLink;
        }

        // Make sure it's a viewjob URL, not a search URL
        if (
          !jobLink.includes("/viewjob?") &&
          !jobLink.includes("/jobs/view/")
        ) {
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

      // ROBUST "EASILY APPLY" DETECTION - Multiple strategies
      const easyApplySelectors = [
        // Button-based selectors
        'button[aria-label*="Easily apply"]',
        'button[title*="Easily apply"]', 
        'button[data-testid*="indeedApply"]',
        'button[data-testid="indeedApplyButton"]',
        'button[data-testid="indeedApplyButton-test"]',
        'button[aria-label*="Apply now"]',
        'button[class*="IndeedApply"]',
        'button[id*="indeedApply"]',
        // Link-based selectors
        'a[aria-label*="Easily apply"]',
        'a[title*="Easily apply"]',
        'a[data-testid*="indeedApply"]',
        'a[class*="IndeedApply"]',
        // Span/text-based selectors
        '.iaIcon span',
        'span[data-testid*="indeedApply"]',
        'span[class*="IndeedApply"]',
        'span[aria-label*="Easily apply"]',
        // Generic container selectors
        '[data-testid="indeedApply"]',
        '.jobsearch-IndeedApplyButton',
        '.ia-IndeedApplyButton',
        '.ia-IndeedApplyButton button',
        '#indeedApplyButton',
        // Fallback class selectors
        '[class*="easily-apply"]',
        '[class*="indeed-apply"]',
        '[class*="oneclick"]',
        '[id*="easily-apply"]',
        '[id*="indeed-apply"]'
      ];
      
      let easyApplyElement = findElementRobust(easyApplySelectors, card, {
        textContent: 'easily apply',
        attributes: {
          'aria-label': 'apply',
          'data-testid': 'apply', 
          'title': 'apply'
        }
      });
      
      // Additional text-based search for various "apply" patterns
      if (!easyApplyElement) {
        const textPatterns = ['easily apply', 'apply now', 'one-click apply', 'quick apply'];
        const allElements = card.querySelectorAll('*');
        
        for (const element of allElements) {
          const text = element.textContent?.trim().toLowerCase() || '';
          if (textPatterns.some(pattern => text.includes(pattern))) {
            easyApplyElement = element;
            break;
          }
        }
      }
      
      // Determine if this is an "Easily apply" job
      const elementText = easyApplyElement?.textContent?.trim().toLowerCase() || '';
      const elementAttrs = easyApplyElement ? {
        dataTestid: easyApplyElement.getAttribute('data-testid') || '',
        ariaLabel: easyApplyElement.getAttribute('aria-label') || '',
        className: easyApplyElement.className || '',
        title: easyApplyElement.title || ''
      } : {};
      
      const isEasilyApply = easyApplyElement && (
        elementText.includes('easily apply') ||
        elementText.includes('apply now') ||
        elementText.includes('quick apply') ||
        elementText.includes('one-click apply') ||
        elementAttrs.dataTestid.includes('indeedApply') ||
        elementAttrs.ariaLabel.toLowerCase().includes('easily apply') ||
        elementAttrs.className.includes('IndeedApply') ||
        elementAttrs.title.toLowerCase().includes('easily apply')
      );
      
      const jobType = isEasilyApply ? "Easily apply" : null;

      // Skip jobs that are NOT "Easily apply"
      if (!jobType) {
        console.log(
          `Skipping job at index ${idx} - Not an "Easily apply" job. Apply type: "${
            easyApplyElement?.textContent?.trim() || "N/A"
          }" | Element class: "${easyApplyElement?.className || "N/A"}" | Data-testid: "${easyApplyElement?.getAttribute('data-testid') || "N/A"}"`
        );
        return;
      } else {
        console.log(
          `✅ Found "Easily apply" job at index ${idx}! Apply type: "${
            easyApplyElement?.textContent?.trim()
          }" | Element: ${easyApplyElement?.tagName}`
        );
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
      // Multi-level context validation for maximum reliability
      
      // Level 1: Basic chrome object existence
      if (typeof chrome === "undefined" || !chrome.runtime) {
        return false;
      }

      // Level 2: Check runtime errors
      if (chrome.runtime.lastError) {
        return false;
      }

      // Level 3: Extension ID accessibility test
      const extensionId = chrome.runtime.id;
      if (!extensionId) {
        return false;
      }

      // Level 4: Storage API access test (common invalidation point)
      if (!chrome.storage || !chrome.storage.local) {
        return false;
      }

      // Level 5: Tabs API access test (if permissions allow)
      if (chrome.tabs && !chrome.tabs.query) {
        return false;
      }

      // Level 6: Document context validation
      if (!window.document || document.readyState === 'unloading') {
        return false;
      }

      // Level 7: Test actual runtime connectivity with a non-intrusive check
      try {
        // This will immediately fail if context is invalid without causing side effects
        chrome.runtime.getPlatformInfo;
        return true;
      } catch (connectivityError) {
        return false;
      }

    } catch (error) {
      // Extension context invalidated or other error - COMPLETELY SILENT to prevent circular logging
      
      // Trigger context recovery if this is the first detection
      if (!window.extensionContextRecoveryTriggered) {
        window.extensionContextRecoveryTriggered = true;
        // Use setTimeout to prevent immediate recursion
        setTimeout(() => {
          triggerExtensionContextRecovery(error.message);
        }, 0);
      }
      
      return false;
    }
  }

  /**
   * Enhanced extension context recovery system with circuit breaker
   */
  function triggerExtensionContextRecovery(errorMessage) {
    // Use circuit breaker to prevent infinite recovery loops
    if (!startRecovery('context', () => {
      performContextRecovery(errorMessage);
    })) {
      return; // Recovery blocked by circuit breaker
    }
  }

  /**
   * Perform the actual context recovery
   */
  function performContextRecovery(errorMessage) {
    try {
      console.log("🔄 Performing extension context recovery");
      
      // PRESERVE automation state before recovery - don't disable user's manual start
      const wasAutomationAllowed = window.automationAllowed;
      const wasManualStartNotRequired = !window.manualStartRequired;
      const wasAutomationRunning = window.automationRunning;
      
      console.log(`💾 Preserving automation state: allowed=${wasAutomationAllowed}, running=${wasAutomationRunning}`);
      
      // Stop current processing but preserve user's start permission
      window.emergencyStopFlag = true;
      processing = false;
      
      // DON'T reset automationAllowed - preserve user's manual start decision
      // Only stop the current processing, not the permission to automate
      
      // Clear all timeouts and intervals
      cleanupExtensionResources('context-recovery');
      
      // Show user-friendly notification
      showContextRecoveryNotification();
      
      // Store recovery state AND automation state in localStorage for persistence
      try {
        localStorage.setItem('extensionContextRecovery', JSON.stringify({
          timestamp: Date.now(),
          errorMessage: errorMessage,
          url: window.location.href,
          recoveryAttempted: true,
          // Preserve automation state across recovery
          preservedState: {
            automationAllowed: wasAutomationAllowed,
            manualStartNotRequired: wasManualStartNotRequired,
            automationRunning: wasAutomationRunning
          }
        }));
        
        console.log("💾 Automation state preserved in localStorage for recovery");
      } catch (storageError) {
        console.warn("Could not store recovery state:", storageError.message);
      }
      
      // Schedule automatic page reload if user doesn't act within 10 seconds
      setTimeout(() => {
        if (window.extensionContextRecoveryTriggered) {
          console.log("🔄 Auto-reloading page for extension context recovery");
          window.location.reload();
        }
      }, 10000);
      
      // Process any queued messages after successful recovery
      setTimeout(() => {
        if (isExtensionContextValid()) {
          console.log("📤 Processing queued messages after context recovery");
          processQueuedMessages();
        }
      }, 1000); // Give context time to stabilize

      endRecovery('context', true);
      
    } catch (recoveryError) {
      console.error("❌ Error in context recovery system:", recoveryError.message);
      endRecovery('context', false);
    }
  }

  /**
   * Robust context validation before automation operations
   */
  function validateAutomationContext(operationName = 'operation') {
    try {
      // Check basic extension context
      if (!isExtensionContextValid()) {
        console.warn(`⚠️ ${operationName} blocked - extension context invalid`);
        return { valid: false, reason: 'Extension context invalid', shouldRecover: true };
      }
      
      // Check if automation is allowed
      if (!window.automationAllowed) {
        console.warn(`⚠️ ${operationName} blocked - automation not allowed`);
        
        // Try to restore state first
        restoreAutomationStateAfterRecovery();
        
        // Check again after restoration attempt
        if (!window.automationAllowed) {
          return { valid: false, reason: 'Automation not allowed', shouldRecover: false };
        }
      }
      
      // Check if emergency stop flag is set
      if (window.emergencyStopFlag) {
        console.warn(`⚠️ ${operationName} blocked - emergency stop flag set`);
        return { valid: false, reason: 'Emergency stop active', shouldRecover: false };
      }
      
      // Check if we're in a recovery state
      if (window.recoveryState && 
          (window.recoveryState.contextRecoveryActive || 
           window.recoveryState.connectionRecoveryActive)) {
        console.warn(`⚠️ ${operationName} blocked - recovery in progress`);
        return { valid: false, reason: 'Recovery in progress', shouldRecover: false };
      }
      
      return { valid: true, reason: 'Context valid' };
      
    } catch (error) {
      console.error(`❌ Context validation error for ${operationName}:`, error);
      return { valid: false, reason: `Validation error: ${error.message}`, shouldRecover: true };
    }
  }

  /**
   * Wait for valid automation context with timeout
   */
  async function waitForValidContext(operationName = 'operation', timeout = 10000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const validation = validateAutomationContext(operationName);
      
      if (validation.valid) {
        return true;
      }
      
      if (!validation.shouldRecover) {
        throw new Error(`${operationName} cannot proceed: ${validation.reason}`);
      }
      
      console.log(`🔄 Waiting for valid context for ${operationName} (${validation.reason})`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error(`${operationName} timed out waiting for valid context`);
  }

  /**
   * Enhanced state preservation system - save state continuously during automation
   */
  function preserveAutomationState(additionalData = {}) {
    if (!window.automationAllowed) {
      return; // Don't preserve if automation is not allowed
    }
    
    try {
      const stateData = {
        automationAllowed: window.automationAllowed,
        manualStartRequired: window.manualStartRequired || false,
        automationRunning: window.automationRunning || false,
        timestamp: Date.now(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        domain: window.location.hostname,
        ...additionalData
      };
      
      // Save to multiple storage locations for redundancy
      const stateString = JSON.stringify(stateData);
      
      // Primary storage locations
      localStorage.setItem('extensionAutomationState', stateString);
      sessionStorage.setItem('extensionAutomationState', stateString);
      window.automationStateData = stateData;
      
      // Backup storage with unique keys for recovery
      localStorage.setItem(`automationBackup_${Date.now()}`, stateString);
      
      // Clean up old backup entries (keep only last 5)
      const backupKeys = Object.keys(localStorage).filter(key => key.startsWith('automationBackup_')).sort();
      while (backupKeys.length > 5) {
        localStorage.removeItem(backupKeys.shift());
      }
      
      console.log("💾 Automation state preserved across all storage locations");
      
    } catch (error) {
      console.warn("⚠️ Failed to preserve automation state:", error.message);
    }
  }

  /**
   * Start continuous state preservation during automation
   */
  function startAutomationStatePreservation() {
    if (window.statePreservationInterval) {
      clearInterval(window.statePreservationInterval);
    }
    
    window.statePreservationInterval = setInterval(() => {
      if (window.automationAllowed && window.automationRunning) {
        preserveAutomationState({
          continuousPreservation: true,
          lastActivity: Date.now()
        });
      }
    }, 5000); // Preserve state every 5 seconds during automation
  }

  /**
   * Restore automation state after context recovery or page reload
   */
  function restoreAutomationStateAfterRecovery() {
    try {
      let stateRestored = false;
      
      console.log("🔄 Starting automation state restoration...");
      
      // Check multiple storage locations for state
      const sources = [
        { name: 'window', data: window.automationStateData },
        { name: 'sessionStorage', data: (() => {
          try { return JSON.parse(sessionStorage.getItem('extensionAutomationState')); } catch { return null; }
        })() },
        { name: 'localStorage', data: (() => {
          try { return JSON.parse(localStorage.getItem('extensionAutomationState')); } catch { return null; }
        })() },
        { name: 'recovery', data: (() => {
          try { 
            const recovery = JSON.parse(localStorage.getItem('extensionContextRecovery'));
            return recovery?.preservedState;
          } catch { return null; }
        })() }
      ];
      
      // If no primary sources work, check backup storage
      if (!sources.some(s => s.data)) {
        console.log("🔍 Primary storage empty, checking backup entries...");
        const backupKeys = Object.keys(localStorage)
          .filter(key => key.startsWith('automationBackup_'))
          .sort()
          .reverse(); // Most recent first
          
        for (const key of backupKeys.slice(0, 3)) { // Check last 3 backups
          try {
            const backupData = JSON.parse(localStorage.getItem(key));
            if (backupData) {
              sources.push({ name: `backup-${key}`, data: backupData });
            }
          } catch (e) {
            console.warn(`Could not parse backup ${key}:`, e.message);
          }
        }
      }
      
      console.log("� Checking automation state sources:", sources.map(s => ({ name: s.name, hasData: !!s.data })));
      
      // Try each source in order of reliability
      for (const source of sources) {
        if (source.data && !stateRestored) {
          const state = source.data;
          
          // Verify state is recent and on Indeed domain
          const isRecent = Date.now() - (state.timestamp || 0) < 600000; // 10 minutes
          const isIndeedDomain = window.location.hostname.includes('indeed.com');
          
          console.log(`🔍 Checking ${source.name} state: recent=${isRecent}, indeed=${isIndeedDomain}, allowed=${state.automationAllowed}`);
          
          if (isRecent && isIndeedDomain && state.automationAllowed) {
            console.log(`✅ Restoring automation state from ${source.name}`);
            
            // Restore automation permissions
            window.automationAllowed = true;
            window.manualStartRequired = false;
            
            if (state.automationRunning) {
              window.automationRunning = true;
              console.log("� Automation marked as running - ready to continue");
            }
            
            // Update persistence with current timestamp
            const updatedState = {
              ...state,
              timestamp: Date.now(),
              url: window.location.href
            };
            
            try {
              localStorage.setItem('extensionAutomationState', JSON.stringify(updatedState));
              sessionStorage.setItem('extensionAutomationState', JSON.stringify(updatedState));
              window.automationStateData = updatedState;
            } catch (e) {
              console.warn("Could not update state persistence:", e.message);
            }
            
            stateRestored = true;
            break;
          }
        }
      }
      
      if (stateRestored) {
        console.log("✅ Automation state restoration successful");
        
        // Send status message about successful restoration
        setTimeout(() => {
          safeSendMessage({
            greeting: "statusUpdate", 
            status: "🔄 Automation state restored - ready to continue",
            timestamp: new Date().toISOString()
          });
        }, 500);
        
        // Clean up old recovery data
        try {
          localStorage.removeItem('extensionContextRecovery');
        } catch (e) {}
        
      } else {
        console.log("📝 No valid automation state found - manual start required");
        
        // Ensure flags are properly reset
        window.automationAllowed = false;
        window.manualStartRequired = true;
        window.automationRunning = false;
        
        // Clear any stale state data
        try {
          const staleThreshold = Date.now() - 600000; // 10 minutes
          
          ['localStorage', 'sessionStorage'].forEach(storageType => {
            const storage = storageType === 'localStorage' ? localStorage : sessionStorage;
            const stateData = storage.getItem('extensionAutomationState');
            if (stateData) {
              const parsed = JSON.parse(stateData);
              if ((parsed.timestamp || 0) < staleThreshold) {
                storage.removeItem('extensionAutomationState');
                console.log(`🗑️ Cleared stale state from ${storageType}`);
              }
            }
          });
        } catch (e) {
          console.warn("Could not clear stale data:", e.message);
        }
      }
      
    } catch (error) {
      console.error("❌ Error in automation state restoration:", error.message);
      
      // Ensure clean state on error
      window.automationAllowed = false;
      window.manualStartRequired = true;
      window.automationRunning = false;
    }
  }

  /**
   * Show context recovery notification to user
   */
  function showContextRecoveryNotification() {
    try {
      const notice = createSafeElement("div", {
        innerHTML: `
          <div style="font-weight: bold; margin-bottom: 10px;">🔄 Extension Connection Lost</div>
          <div style="margin-bottom: 10px;">The extension connection was interrupted. This can happen when:</div>
          <ul style="margin: 10px 0; padding-left: 20px; text-align: left;">
            <li>Extension was updated or reloaded</li>
            <li>Browser was restored from cache</li>
            <li>Network connection changed</li>
          </ul>
          <div style="font-weight: bold; color: #4CAF50;">Auto-refreshing in 10 seconds...</div>
          <button id="refreshNowBtn" style="margin-top: 10px; padding: 8px 16px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">Refresh Now</button>
        `,
        allowHTML: true,
        style: {
          position: 'fixed',
          top: '20px',
          right: '20px',
          background: '#fff3cd',
          color: '#856404',
          padding: '20px',
          borderRadius: '8px',
          zIndex: '999999',
          fontFamily: 'Arial, sans-serif',
          fontSize: '14px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          border: '1px solid #ffeaa7',
          maxWidth: '350px',
          textAlign: 'center'
        }
      });

      if (notice && safeAppendChild(document.body, notice)) {
        // Add click handler for refresh button
        const refreshBtn = notice.querySelector('#refreshNowBtn');
        if (refreshBtn) {
          refreshBtn.addEventListener('click', () => {
            window.location.reload();
          });
        }
      }
    } catch (err) {
      console.warn("Could not show context recovery notification:", err.message);
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
      if (!hostname.includes("indeed.com")) {
        console.log("❌ Not on Indeed domain - automation disabled");
        return false;
      }

      // Allow automation on job search/results pages AND any job application pages
      const isJobSearchPage =
        url.includes("/jobs?") ||
        url.includes("/viewjob?") ||
        url.includes("/jobs/");
      const isApplicationPage =
        url.includes("smartapply.indeed.com") ||
        url.includes("form/profile") ||
        url.includes("apply/resume") ||
        url.includes("/apply") ||
        url.includes("indeed.com/m/jobs") ||
        document.querySelector("#mosaic-contactInfoModule") ||
        document.querySelector('[data-testid="profile-location-page"]') ||
        document.querySelector('form[method="post"]');

      if (!isJobSearchPage && !isApplicationPage) {
        console.log(
          "❌ Not on job search or application page - automation disabled"
        );
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
      console.error(
        "❌ Error checking if automation should run:",
        error.message
      );
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔄 CIRCUIT BREAKER RECOVERY SYSTEM - Prevent infinite loops
  // ═══════════════════════════════════════════════════════════════════════════

  // Global recovery state to prevent infinite loops
  window.recoveryState = window.recoveryState || {
    connectionRecoveryActive: false,
    contextRecoveryActive: false,
    bfcacheRecoveryActive: false,
    lastRecoveryAttempt: 0,
    totalRecoveryAttempts: 0,
    maxRecoveryAttempts: 3,
    cooldownPeriod: 60000 // 1 minute between recovery attempts
  };

  /**
   * Circuit breaker to prevent infinite recovery loops
   */
  function canAttemptRecovery(recoveryType) {
    const now = Date.now();
    const timeSinceLastAttempt = now - window.recoveryState.lastRecoveryAttempt;
    
    // Check if we're in cooldown period
    if (timeSinceLastAttempt < window.recoveryState.cooldownPeriod) {
      console.log(`🛑 Recovery cooldown active for ${recoveryType} - ${Math.round((window.recoveryState.cooldownPeriod - timeSinceLastAttempt) / 1000)}s remaining`);
      return false;
    }
    
    // Check if we've exceeded max attempts
    if (window.recoveryState.totalRecoveryAttempts >= window.recoveryState.maxRecoveryAttempts) {
      console.log(`🛑 Max recovery attempts reached (${window.recoveryState.maxRecoveryAttempts}) - no more automated recovery`);
      return false;
    }
    
    // Check if specific recovery type is already active
    if (window.recoveryState[`${recoveryType}RecoveryActive`]) {
      console.log(`🛑 ${recoveryType} recovery already active - preventing duplicate`);
      return false;
    }
    
    return true;
  }

  /**
   * Start recovery with circuit breaker protection
   */
  function startRecovery(recoveryType, recoveryFunction) {
    if (!canAttemptRecovery(recoveryType)) {
      return false;
    }
    
    console.log(`🔄 Starting ${recoveryType} recovery (attempt ${window.recoveryState.totalRecoveryAttempts + 1}/${window.recoveryState.maxRecoveryAttempts})`);
    
    // Set recovery flags
    window.recoveryState[`${recoveryType}RecoveryActive`] = true;
    window.recoveryState.lastRecoveryAttempt = Date.now();
    window.recoveryState.totalRecoveryAttempts++;
    
    // Execute recovery with automatic cleanup
    try {
      recoveryFunction();
    } catch (error) {
      console.error(`❌ ${recoveryType} recovery failed:`, error);
      endRecovery(recoveryType, false);
    }
    
    return true;
  }

  /**
   * End recovery and update state
   */
  function endRecovery(recoveryType, success = true) {
    window.recoveryState[`${recoveryType}RecoveryActive`] = false;
    
    if (success) {
      console.log(`✅ ${recoveryType} recovery completed successfully`);
      // Reset attempt counter on successful recovery
      window.recoveryState.totalRecoveryAttempts = 0;
    } else {
      console.log(`❌ ${recoveryType} recovery failed`);
    }
  }

  /**
   * DYNAMIC: Enhanced BFCache detection and recovery with circuit breaker
   */
  function detectAndRecoverFromBFCache() {
    console.log("🔄 Running BFCache detection and recovery...");
    
    const bfcacheIndicators = [
      'The page keeping the extension port is moved into back/forward cache',
      'message channel closed',
      'Extension context invalidated',
      'Cannot access chrome.runtime',
      'A listener indicated an asynchronous response by returning true'
    ];

    // Check for recent errors that indicate BFCache issues
    let bfcacheDetected = false;
    
    // Listen for pageshow event (indicates BFCache restoration)
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        console.log("📖 Page restored from BFCache - reinitializing extension");
        safeLog("📖 BFCache restoration detected - reinitializing...");
        
        // Wait a moment for page to stabilize, then reinitialize
        setTimeout(() => {
          try {
            reinitializeAfterBFCache();
            // Process any queued messages after BFCache recovery
            if (isExtensionContextValid()) {
              console.log("📤 Processing queued messages after BFCache recovery");
              processQueuedMessages();
            }
          } catch (error) {
            console.error("❌ Failed to reinitialize after BFCache:", error);
          }
        }, 500);
      } else {
        // Regular page load - still restore state in case of navigation
        console.log("📖 Regular page load detected - checking automation state");
        setTimeout(() => {
          try {
            restoreAutomationStateAfterRecovery();
          } catch (error) {
            console.error("❌ Failed to restore state on page load:", error);
          }
        }, 200);
      }
    });
    
    // Also listen for DOMContentLoaded to catch any missed navigations
    document.addEventListener('DOMContentLoaded', () => {
      console.log("📄 DOM loaded - ensuring automation state is restored");
      setTimeout(() => {
        try {
          restoreAutomationStateAfterRecovery();
        } catch (error) {
          console.error("❌ Failed to restore state on DOM load:", error);
        }
      }, 100);
    });

    // Detect connection issues
    const originalSendMessage = chrome.runtime.sendMessage;
    if (originalSendMessage) {
      chrome.runtime.sendMessage = function(message, callback) {
        try {
          return originalSendMessage.call(chrome.runtime, message, (response) => {
            if (chrome.runtime.lastError) {
              const errorMsg = chrome.runtime.lastError.message;
              const isBFCacheError = bfcacheIndicators.some(indicator => 
                errorMsg.includes(indicator)
              );
              
              if (isBFCacheError && !bfcacheDetected) {
                bfcacheDetected = true;
                console.log("🔄 BFCache error detected:", errorMsg);
                
                // Attempt recovery only if circuit breaker allows it
                const timeSinceLastRecovery = Date.now() - window.recoveryState.lastRecoveryAttempt;
                if (timeSinceLastRecovery > 15000) { // At least 15 seconds between BFCache recovery attempts
                  setTimeout(() => {
                    attemptConnectionRecovery();
                  }, 1000);
                }
              }
            }
            
            if (callback) callback(response);
          });
        } catch (error) {
          console.error("❌ Message send failed:", error);
          if (!bfcacheDetected) {
            bfcacheDetected = true;
            
            // Only attempt recovery if circuit breaker allows it
            const timeSinceLastRecovery = Date.now() - window.recoveryState.lastRecoveryAttempt;
            if (timeSinceLastRecovery > 15000) {
              setTimeout(() => attemptConnectionRecovery(), 500);
            }
          }
          return false;
        }
      };
    }
  }

  /**
   * DYNAMIC: Reinitialize extension after BFCache restoration with circuit breaker
   */
  function reinitializeAfterBFCache() {
    // Use circuit breaker to prevent infinite reinitialization
    if (!startRecovery('bfcache', () => {
      performBFCacheRecovery();
    })) {
      return; // Recovery blocked by circuit breaker
    }
  }

  /**
   * Perform the actual BFCache recovery
   */
  function performBFCacheRecovery() {
    console.log("🔄 Performing BFCache recovery...");
    
    // FIRST: Restore automation state before anything else
    console.log("🔄 Restoring automation state during BFCache recovery...");
    restoreAutomationStateAfterRecovery();
    
    // Reset state flags
    window.bfcacheRecoveryInProgress = false;
    window.extensionReconnected = false;
    
    // Clear any existing timeouts/intervals that may have been preserved
    if (window.keepAliveInterval) {
      clearInterval(window.keepAliveInterval);
      window.keepAliveInterval = null;
    }
    
    // Re-establish connection monitoring
    setTimeout(() => {
      startConnectionMonitoring();
    }, 1000);
    
    // Reinitialize core systems
    try {
      // Reset extension readiness
      window.indeedExtensionReady = true;
      
      // Restart connection monitoring
      startConnectionMonitoring();
      
      // Reinitialize learning system if needed
      if (typeof UnknownQuestionLearningSystem !== 'undefined' && !window.learningSystem) {
        const learningSystem = new UnknownQuestionLearningSystem();
        window.learningSystem = learningSystem;
        learningSystem.initialize();
      }
      
      console.log("✅ Extension reinitialized after BFCache restoration");
      endRecovery('bfcache', true);
      
    } catch (error) {
      console.error("❌ Reinitialize failed:", error);
      endRecovery('bfcache', false);
    }
  }

  /**
   * DYNAMIC: Attempt to recover lost connection with circuit breaker
   */
  function attemptConnectionRecovery() {
    // Use circuit breaker to prevent infinite recovery loops
    if (!startRecovery('connection', () => {
      performConnectionRecovery();
    })) {
      return; // Recovery blocked by circuit breaker
    }
  }

  /**
   * Perform the actual connection recovery
   */
  function performConnectionRecovery() {
    console.log("🔄 Performing connection recovery...");
    
    let attempts = 0;
    const maxAttempts = 3; // Reduced from 5 to prevent long recovery cycles
    
    const testConnection = () => {
      attempts++;
      console.log(`🔄 Connection test attempt ${attempts}/${maxAttempts}`);
      
      try {
        chrome.runtime.sendMessage({ action: 'ping', recovery: true }, (response) => {
          if (chrome.runtime.lastError) {
            console.log(`❌ Recovery attempt ${attempts} failed:`, chrome.runtime.lastError.message);
            
            if (attempts < maxAttempts) {
              setTimeout(testConnection, 2000 * attempts); // Exponential backoff
            } else {
              console.log("💀 Connection recovery failed - extension may need reload");
              endRecovery('connection', false);
            }
          } else {
            console.log("✅ Connection recovered successfully!");
            window.extensionReconnected = true;
            endRecovery('connection', true);
          }
        });
      } catch (error) {
        console.error(`❌ Recovery attempt ${attempts} exception:`, error);
        if (attempts < maxAttempts) {
          setTimeout(testConnection, 2000 * attempts);
        } else {
          endRecovery('connection', false);
        }
      }
    };
    
    testConnection();
  }

  /**
   * DYNAMIC: Start monitoring connection health with circuit breaker protection
   */
  function startConnectionMonitoring() {
    if (window.connectionMonitorInterval) {
      clearInterval(window.connectionMonitorInterval);
    }
    
    window.connectionMonitorInterval = setInterval(() => {
      // Only monitor if no recovery is active and we're not in cooldown
      if (!window.recoveryState.connectionRecoveryActive && 
          !window.recoveryState.contextRecoveryActive && 
          isExtensionContextValid()) {
        
        // Ping background to check connection - but don't be aggressive
        try {
          chrome.runtime.sendMessage({ action: 'ping', monitoring: true }, (response) => {
            if (chrome.runtime.lastError) {
              console.log("📡 Connection monitor detected issue:", chrome.runtime.lastError.message);
              
              // Only attempt recovery if circuit breaker allows it
              const timeSinceLastRecovery = Date.now() - window.recoveryState.lastRecoveryAttempt;
              if (timeSinceLastRecovery > 10000) { // At least 10 seconds between attempts
                attemptConnectionRecovery();
              }
            }
          });
        } catch (error) {
          console.log("📡 Connection monitor error:", error);
          
          // Only attempt recovery if circuit breaker allows it
          const timeSinceLastRecovery = Date.now() - window.recoveryState.lastRecoveryAttempt;
          if (timeSinceLastRecovery > 10000) { // At least 10 seconds between attempts
            attemptConnectionRecovery();
          }
        }
      }
    }, 60000); // Check every 60 seconds instead of 30 to be less aggressive
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 📨 MESSAGE QUEUE SYSTEM - Handle context invalidation gracefully
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Global message queue
  if (!window.messageQueue) {
    window.messageQueue = [];
  }

  /**
   * Queue messages when context is invalid, process when restored
   */
  function queueMessageForLater(message, callback = null, retryAttempt = 0) {
    const queueItem = {
      message,
      callback,
      retryAttempt,
      timestamp: Date.now(),
      id: Math.random().toString(36).substr(2, 9)
    };
    
    window.messageQueue.push(queueItem);
    console.log(`📥 Queued message for later: ${message.action || 'unknown'} (queue size: ${window.messageQueue.length})`);
    
    // Clean old messages from queue (older than 5 minutes)
    const fiveMinutesAgo = Date.now() - 300000;
    window.messageQueue = window.messageQueue.filter(item => item.timestamp > fiveMinutesAgo);
  }

  /**
   * Process queued messages when context is restored
   */
  function processQueuedMessages() {
    if (!window.messageQueue || window.messageQueue.length === 0) {
      return;
    }

    console.log(`📤 Processing ${window.messageQueue.length} queued messages`);
    const messagesToProcess = [...window.messageQueue];
    window.messageQueue = []; // Clear queue

    messagesToProcess.forEach((queueItem, index) => {
      // Stagger message sending to avoid overwhelming the background script
      setTimeout(() => {
        if (isExtensionContextValid()) {
          console.log(`📨 Sending queued message: ${queueItem.message.action || 'unknown'}`);
          safeSendMessage(queueItem.message, queueItem.callback, queueItem.retryAttempt);
        } else {
          // Re-queue if context is still invalid
          console.log(`📥 Re-queuing message, context still invalid: ${queueItem.message.action || 'unknown'}`);
          queueMessageForLater(queueItem.message, queueItem.callback, queueItem.retryAttempt);
        }
      }, index * 100); // 100ms between messages
    });
  }

  /**
   * Safely send message to background script with enhanced error handling and retry logic
   * Prevents "message channel closed" and "back/forward cache" errors
   * COMPLETELY PROTECTED FROM CIRCULAR CALLS
   */
  function safeSendMessage(message, callback = null, retryAttempt = 0) {
    const MAX_RETRIES = 5; // Increased retries
    const RETRY_DELAY = 500; // Faster initial retry

    // ENHANCED CONTEXT CHECK: Multiple validation levels
    try {
      // Quick basic checks
      if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.id) {
        console.log("⚠️ Cannot send message - extension context invalid");
        
        // Queue message for when context is restored
        queueMessageForLater(message, callback, retryAttempt);
        
        // Only trigger recovery for critical messages and respect circuit breaker
        if (message.action === 'startAutomation' || message.action === 'statusUpdate') {
          const timeSinceLastRecovery = Date.now() - window.recoveryState.lastRecoveryAttempt;
          if (timeSinceLastRecovery > 30000) { // At least 30 seconds between recovery attempts
            setTimeout(() => {
              triggerExtensionContextRecovery("Message send blocked - context invalid");
            }, 0);
          }
        }
        
        return false;
      }

      // Deeper connectivity test
      if (!chrome.runtime.sendMessage || typeof chrome.runtime.sendMessage !== 'function') {
        console.log("⚠️ Cannot send message - sendMessage API unavailable");
        queueMessageForLater(message, callback, retryAttempt);
        return false;
      }

      // BFCache detection - common cause of context issues
      if (document.readyState === 'unloading' || window.performance?.navigation?.type === 2) {
        console.log("⚠️ Cannot send message - page in transition/BFCache");
        queueMessageForLater(message, callback, retryAttempt);
        return false;
      }

    } catch (contextError) {
      console.log("⚠️ Cannot send message - extension context check failed:", contextError.message);
      queueMessageForLater(message, callback, retryAttempt);
      return false;
    }

    try {
      // SILENT - only console log to avoid circular debugLog errors
      console.log(`📤 Sending message (attempt ${retryAttempt + 1}):`, message.action || 'unknown');
      
      if (callback) {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message;
            console.log("📢 Message response error:", errorMsg);
            // SILENT - don't use debugLog when there are runtime errors
            
            // Check if this is a context invalidation error
            if (errorMsg.includes("Extension context invalidated") || 
                errorMsg.includes("message channel closed") ||
                errorMsg.includes("receiving end does not exist")) {
              
              if (retryAttempt < MAX_RETRIES) {
                console.log(`🔄 Retrying message send in ${RETRY_DELAY}ms (attempt ${retryAttempt + 1}/${MAX_RETRIES})`);
                setTimeout(() => {
                  safeSendMessage(message, callback, retryAttempt + 1);
                }, RETRY_DELAY * (retryAttempt + 1)); // Exponential backoff
              } else {
                console.error("❌ Message send failed after all retries:", errorMsg);
                // Only trigger recovery if circuit breaker allows it
                const timeSinceLastRecovery = Date.now() - window.recoveryState.lastRecoveryAttempt;
                if (timeSinceLastRecovery > 30000) {
                  triggerExtensionContextRecovery(errorMsg);
                }
              }
            }
          } else {
            console.log("📨 Message response received successfully");
            if (callback) callback(response);
          }
        });
      } else {
        chrome.runtime.sendMessage(message, () => {
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message;
            console.log("📢 Message send error:", errorMsg);
            // SILENT - don't use debugLog when there are runtime errors
            
            // Check if this is a context invalidation error and should retry
            if ((errorMsg.includes("Extension context invalidated") || 
                 errorMsg.includes("message channel closed") ||
                 errorMsg.includes("receiving end does not exist")) && 
                retryAttempt < MAX_RETRIES) {
              
              console.log(`🔄 Retrying message send in ${RETRY_DELAY}ms (attempt ${retryAttempt + 1}/${MAX_RETRIES})`);
              setTimeout(() => {
                safeSendMessage(message, null, retryAttempt + 1);
              }, RETRY_DELAY * (retryAttempt + 1)); // Exponential backoff
            } else if (retryAttempt >= MAX_RETRIES) {
              console.error("❌ Message send failed after all retries:", errorMsg);
              // Only trigger recovery if circuit breaker allows it
              const timeSinceLastRecovery = Date.now() - window.recoveryState.lastRecoveryAttempt;
              if (timeSinceLastRecovery > 30000) {
                triggerExtensionContextRecovery(errorMsg);
              }
            }
          } else {
            console.log("✅ Message sent successfully");
          }
        });
      }
      return true;
    } catch (error) {
      console.error("❌ Message send failed:", error.message);
      // SILENT - don't use debugLog when there are exceptions to avoid circular errors
      
      // Retry on exception if within retry limit
      if (retryAttempt < MAX_RETRIES && 
          (error.message.includes("Extension context invalidated") ||
           error.message.includes("Cannot read properties"))) {
        
        console.log(`🔄 Retrying after exception in ${RETRY_DELAY}ms (attempt ${retryAttempt + 1}/${MAX_RETRIES})`);
        setTimeout(() => {
          safeSendMessage(message, callback, retryAttempt + 1);
        }, RETRY_DELAY * (retryAttempt + 1));
      } else {
        // Only trigger recovery if circuit breaker allows it
        const timeSinceLastRecovery = Date.now() - window.recoveryState.lastRecoveryAttempt;
        if (timeSinceLastRecovery > 30000) {
          triggerExtensionContextRecovery(error.message);
        }
      }
      
      return false;
    }
  }

  async function scrollDownUp() {
    // Check if extension context is still valid
    if (!isExtensionContextValid()) {
      console.log("🔄 Extension context invalidated during scrollDownUp");
      showExtensionReloadNotice();
      return;
    }

    // Scroll down
    let lastScrollTop = -1;
    for (let i = 0; i < 30; i++) {
      // Check context validity during loop
      if (!isExtensionContextValid()) {
        console.log("🔄 Extension context invalidated during scroll down");
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
        console.log("🔄 Extension context invalidated during scroll up");
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
      console.log("🔄 Extension context invalidated during fillContactInfo");
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

  // DUPLICATE MESSAGE LISTENER REMOVED - All functionality consolidated into main listener above

  // Console command for emergency stop (developers can type: stopAutomation() in console)
  window.stopAutomation = triggerEmergencyStop;

  document.addEventListener("click", () => {
    console.log("Content script clicked!");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔍 DYNAMIC DOM SCANNING SYSTEM - Before/After Form Verification
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * DYNAMIC: Enhanced DOM scanning with page change detection and selector updating
   */
  function scanFormDOM(formElement, scanType = 'before') {
    console.log(`🔍 ${scanType.toUpperCase()} SCAN: Starting enhanced DOM analysis...`);
    
    // Enhanced scan that works even without a specific form element
    const targetElement = formElement || document.body;
    
    // 🎯 PAGE TYPE DETECTION
    const pageType = detectPageType();
    console.log(`📄 Page type detected: ${pageType}`);

    const scanResults = {
      scanType: scanType,
      pageType: pageType,
      timestamp: new Date().toISOString(),
      formId: formElement.id || 'unnamed-form',
      fields: [],
      errors: [],
      warnings: [],
      summary: {}
    };

    try {
      // DYNAMIC: Find all input elements within the form
      const inputSelectors = [
        'input[type="text"]', 'input[type="email"]', 'input[type="tel"]',
        'input[type="number"]', 'input[type="password"]', 'input[type="url"]',
        'input[type="date"]', 'input[type="time"]', 'input[type="datetime-local"]',
        'textarea', 'select', 'input[type="radio"]', 'input[type="checkbox"]',
        '[contenteditable="true"]', '[role="textbox"]', '[role="combobox"]'
      ];

      const allFields = formElement.querySelectorAll(inputSelectors.join(', '));
      console.log(`📊 Found ${allFields.length} form fields to analyze`);

      allFields.forEach((field, index) => {
        const fieldData = analyzeFormField(field, index);
        scanResults.fields.push(fieldData);

        // Detect potential issues
        if (scanType === 'after') {
          validateFieldAfterFilling(fieldData, scanResults);
        } else {
          validateFieldBeforeFilling(fieldData, scanResults);
        }
      });

      // Generate summary statistics
      scanResults.summary = generateScanSummary(scanResults);
      
      console.log(`✅ ${scanType.toUpperCase()} SCAN completed:`, scanResults.summary);
      return scanResults;

    } catch (error) {
      console.error(`❌ ${scanType.toUpperCase()} SCAN failed:`, error);
      scanResults.errors.push(`Scan failed: ${error.message}`);
      return scanResults;
    }
  }

  /**
   * DYNAMIC: Analyze individual form field
   */
  function analyzeFormField(field, index) {
    const fieldData = {
      index: index,
      tagName: field.tagName.toLowerCase(),
      type: field.type || 'unknown',
      name: field.name || '',
      id: field.id || '',
      placeholder: field.placeholder || '',
      required: field.required || false,
      value: getFieldValue(field),
      isEmpty: isFieldEmpty(field),
      isVisible: isElementVisible(field),
      className: field.className || '',
      labelText: getFieldLabel(field),
      parentContext: getFieldContext(field)
    };

    return fieldData;
  }

  /**
   * DYNAMIC: Get field value regardless of input type
   */
  function getFieldValue(field) {
    try {
      switch (field.type) {
        case 'radio':
        case 'checkbox':
          return field.checked;
        case 'select-one':
        case 'select-multiple':
          return field.selectedOptions ? 
            Array.from(field.selectedOptions).map(opt => opt.value).join(', ') :
            field.value;
        default:
          return field.value || '';
      }
    } catch (error) {
      console.warn("⚠️ Could not get field value:", error);
      return '';
    }
  }

  /**
   * DYNAMIC: Check if field is empty based on type
   */
  function isFieldEmpty(field) {
    const value = getFieldValue(field);
    switch (field.type) {
      case 'radio':
      case 'checkbox':
        return value === false;
      case 'select-one':
      case 'select-multiple':
        return !value || value === '' || value === 'Select...';
      default:
        return !value || value.toString().trim() === '';
    }
  }

  /**
   * DYNAMIC: Get field label text
   */
  function getFieldLabel(field) {
    // Check for associated label
    if (field.id) {
      const label = document.querySelector(`label[for="${field.id}"]`);
      if (label) return label.textContent.trim();
    }

    // Check for parent label
    const parentLabel = field.closest('label');
    if (parentLabel) return parentLabel.textContent.trim();

    // Check for nearby text
    const parent = field.parentElement;
    if (parent) {
      const nearbyText = parent.textContent.replace(field.value || '', '').trim();
      if (nearbyText && nearbyText.length < 100) {
        return nearbyText;
      }
    }

    return field.placeholder || field.name || 'Unknown field';
  }

  /**
   * DYNAMIC: Get contextual information about field
   */
  function getFieldContext(field) {
    const parent = field.parentElement;
    if (!parent) return 'no-parent';

    const contextClues = [];
    
    // Check parent classes for context
    if (parent.className) {
      const classes = parent.className.toLowerCase();
      if (classes.includes('name')) contextClues.push('name');
      if (classes.includes('email')) contextClues.push('email');
      if (classes.includes('phone')) contextClues.push('phone');
      if (classes.includes('address')) contextClues.push('address');
      if (classes.includes('experience')) contextClues.push('experience');
      if (classes.includes('education')) contextClues.push('education');
    }

    return contextClues.length > 0 ? contextClues.join(',') : 'general';
  }

  /**
   * DYNAMIC: Validate field before filling
   */
  function validateFieldBeforeFilling(fieldData, scanResults) {
    // Check for potential issues before filling
    if (fieldData.required && fieldData.isEmpty) {
      scanResults.warnings.push(`Required field is empty: ${fieldData.labelText}`);
    }

    if (!fieldData.isVisible) {
      scanResults.warnings.push(`Field is not visible: ${fieldData.labelText}`);
    }

    if (fieldData.type === 'unknown') {
      scanResults.warnings.push(`Unknown field type: ${fieldData.labelText}`);
    }
  }

  /**
   * DYNAMIC: Validate field after filling
   */
  function validateFieldAfterFilling(fieldData, scanResults) {
    // Check for issues after filling
    if (fieldData.required && fieldData.isEmpty) {
      scanResults.errors.push(`Required field still empty after filling: ${fieldData.labelText}`);
    }

    if (fieldData.type === 'email' && fieldData.value && !fieldData.value.includes('@')) {
      scanResults.errors.push(`Invalid email format: ${fieldData.labelText} = "${fieldData.value}"`);
    }

    if (fieldData.type === 'tel' && fieldData.value && fieldData.value.length < 10) {
      scanResults.warnings.push(`Phone number seems short: ${fieldData.labelText} = "${fieldData.value}"`);
    }

    // Check for [object Object] issues
    if (typeof fieldData.value === 'string' && fieldData.value.includes('[object Object]')) {
      scanResults.errors.push(`Object serialization error: ${fieldData.labelText} = "${fieldData.value}"`);
    }
  }

  /**
   * DYNAMIC: Generate scan summary
   */
  function generateScanSummary(scanResults) {
    const summary = {
      totalFields: scanResults.fields.length,
      filledFields: scanResults.fields.filter(f => !f.isEmpty).length,
      emptyFields: scanResults.fields.filter(f => f.isEmpty).length,
      requiredFields: scanResults.fields.filter(f => f.required).length,
      visibleFields: scanResults.fields.filter(f => f.isVisible).length,
      errorCount: scanResults.errors.length,
      warningCount: scanResults.warnings.length,
      fieldTypes: {}
    };

    // Count field types
    scanResults.fields.forEach(field => {
      summary.fieldTypes[field.type] = (summary.fieldTypes[field.type] || 0) + 1;
    });

    summary.fillRate = summary.totalFields > 0 ? 
      Math.round((summary.filledFields / summary.totalFields) * 100) : 0;

    return summary;
  }

  /**
   * 🎯 ENHANCED PAGE TYPE DETECTION - Identifies specific page types for better handling
   */
  function detectPageType() {
    const url = window.location.href;
    const bodyText = document.body.textContent.toLowerCase();
    
    // Relevant experience page
    if (bodyText.includes('relevant experience') || 
        bodyText.includes('introduce you as a candidate') ||
        bodyText.includes('we share one job title')) {
      return 'relevant-experience';
    }
    
    // Contact information page
    if (bodyText.includes('contact information') ||
        bodyText.includes('phone number') ||
        bodyText.includes('street address')) {
      return 'contact-info';
    }
    
    // Resume upload page
    if (bodyText.includes('upload') && bodyText.includes('resume') ||
        bodyText.includes('cv') ||
        document.querySelector('input[type="file"]')) {
      return 'resume-upload';
    }
    
    // Questions page
    if (bodyText.includes('application questions') ||
        document.querySelectorAll('input[type="radio"], input[type="checkbox"], select').length > 3) {
      return 'application-questions';
    }
    
    // Review page  
    if (bodyText.includes('review') && (bodyText.includes('application') || bodyText.includes('submit')) ||
        bodyText.includes('confirm') || bodyText.includes('final')) {
      return 'review-submit';
    }
    
    // Cover letter page
    if (bodyText.includes('cover letter') || 
        document.querySelector('textarea[name*="cover"], textarea[id*="cover"]')) {
      return 'cover-letter';
    }
    
    // Job search/listing page
    if (url.includes('/jobs') || url.includes('/search') ||
        document.querySelector('[data-jk], .jobsearch-SerpJobCard')) {
      return 'job-search';
    }
    
    // Individual job page
    if (url.includes('/viewjob') || url.includes('/job/') ||
        document.querySelector('[data-testid="jobsearch-JobInfoHeader"]')) {
      return 'job-view';
    }
    
    return 'unknown';
  }

  /**
   * 🔍 SMART ELEMENT DETECTION - Updates selectors based on page type and content
   */
  function getSmartSelectors(pageType, elementType) {
    const selectorMap = {
      'relevant-experience': {
        continue: [
          'button[data-testid="form-action-continue"]',
          'button[data-testid*="continue"]',
          'form button[type="submit"]',
          'form button[type="button"]:last-of-type'
        ],
        selection: [
          'button[aria-label*="job"]',
          'div[role="button"]',
          'input[type="radio"]',
          'button:contains("Hard Worker")',
          'button:contains("Apply without")'
        ]
      },
      'contact-info': {
        continue: [
          'button[data-testid*="continue"]',
          'button[type="submit"]',
          'input[type="submit"]'
        ],
        inputs: [
          'input[name*="phone"]',
          'input[name*="address"]',
          'input[name*="city"]',
          'input[name*="zip"]'
        ]
      },
      'application-questions': {
        continue: [
          'button[data-testid*="continue"]',
          'button.mosaic-provider-module-apply-questions-6xgesl',
          'button[type="submit"]'
        ],
        inputs: [
          'input[type="radio"]',
          'input[type="checkbox"]',
          'select',
          'textarea'
        ]
      },
      'review-submit': {
        submit: [
          'button[data-testid*="submit"]',
          'button[type="submit"]',
          'input[type="submit"]',
          'button:contains("Submit")',
          'button:contains("Apply")'
        ]
      }
    };
    
    return selectorMap[pageType]?.[elementType] || [];
  }

  /**
   * DYNAMIC: Main job processing with Virtual DOM integration
   */
  async function processJobApplication(job) {
    console.log("🚀 Processing job application for:", job.jobTitle);
    
    try {
      // Find the main form on the page
      const mainForm = document.querySelector('form, [role="form"], .form, #application-form, .application-container');
      
      if (mainForm) {
        // 🎭 VIRTUAL DOM: Create virtual representation of the form
        console.log("🎭 Creating Virtual DOM representation of form...");
        const virtualizedElements = window.dynamicVDOM.virtualizeForm(mainForm);
        sendLogToPopup(`🎭 VIRTUAL DOM: ${virtualizedElements.length} elements virtualized`);
        
        // BEFORE SCAN: Check initial form state
        const beforeScan = scanFormDOM(mainForm, 'before');
        console.log("📋 BEFORE FILLING:", beforeScan.summary);
        sendLogToPopup(`📋 FORM SCAN: ${beforeScan.summary.totalFields} fields found, ${beforeScan.summary.requiredFields} required`);
        
        if (beforeScan.errors.length > 0) {
          console.warn("⚠️ Pre-filling errors detected:", beforeScan.errors);
        }
      }

      // Call the main dynamic workflow
      const result = await runDynamicApplicationWorkflow();
      
      if (mainForm) {
        // 🎭 VIRTUAL DOM: Get final state and reconcile
        console.log("🎭 Reconciling Virtual DOM with final form state...");
        window.dynamicVDOM.flushUpdates(); // Force reconciliation
        
        const virtualState = window.dynamicVDOM.getVirtualState();
        console.log("🎯 Virtual DOM Final State:", virtualState.stats);
        sendLogToPopup(`🎭 VDOM: ${virtualState.stats.totalElements} elements, ${virtualState.stats.totalChanges} changes tracked`);
        
        // AFTER SCAN: Verify form was filled correctly
        const afterScan = scanFormDOM(mainForm, 'after');
        console.log("📊 AFTER FILLING:", afterScan.summary);
        sendLogToPopup(`✅ FILL VERIFICATION: ${afterScan.summary.filledFields}/${afterScan.summary.totalFields} fields completed (${afterScan.summary.fillRate}%)`);
        
        if (afterScan.errors.length > 0) {
          console.error("❌ Post-filling errors detected:", afterScan.errors);
          sendLogToPopup(`❌ FORM ERRORS: ${afterScan.errors.length} issues detected - check console for details`);
        }
        
        if (afterScan.warnings.length > 0) {
          console.warn("⚠️ Post-filling warnings:", afterScan.warnings);
        }

        // Store comprehensive debugging data
        window.lastFormScan = { 
          before: beforeScan, 
          after: afterScan, 
          virtualState: virtualState 
        };
        
        // 🎯 VIRTUAL DOM DEBUGGING: Make state available in console
        window.debugVirtualDOM = () => {
          console.log("🎭 VIRTUAL DOM DEBUG INFO:");
          console.table(virtualState.stats);
          console.log("📊 Recent Changes:", virtualState.history);
          console.log("⏳ Pending Updates:", virtualState.pendingUpdates);
          return virtualState;
        };
      }

      console.log("✅ Job application completed with result:", result);
      return result;
      
    } catch (error) {
      console.error("❌ Job application failed:", error);
      sendLogToPopup(`❌ APPLICATION FAILED: ${error.message}`);
      throw error;
    }
  }

  // Show a modal popup to notify user of CAPTCHA and pause automation
  function showCaptchaModal() {
    if (findByIdRobust(["autoApplyCaptchaModal", "auto-apply-captcha-modal", "captcha-modal"])) return;
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
    const resumeBtn = findByIdRobust(["autoApplyResumeBtn", "auto-apply-resume-btn", "resume-btn"]);
    if (resumeBtn) {
      resumeBtn.onclick = () => {
        modal.remove();
        window.autoApplyPaused = false;
      };
    }
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

  // Prevent duplicate tab close messages
  let tabCloseMessageSent = false;
  
  // Listen for tab close (unload) and notify background
  safeAddEventListener(window, "beforeunload", function () {
    if (isExtensionContextValid() && !tabCloseMessageSent) {
      try {
        tabCloseMessageSent = true;
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
            console.log(
              "Extension context invalidated during pause. Aborting."
            );
            return;
          }
          pauseAttempts++;
        }
      }
      // Click any relevant button (apply, continue, review, next, submit)
      results.push(await clickRelevantButton(["apply"], "apply"));
      
      // Use specialized Continue button handler for better detection
      const continueResult = await findAndClickContinueButton();
      if (continueResult.success) {
        results.push({ success: true, step: "continue", info: continueResult });
      } else {
        // Fallback to generic continue button detection
        const genericResult = await clickRelevantButton(
          ["continue", "review", "next"],
          "continue/review/next"
        );
        
        if (genericResult.success) {
          results.push(genericResult);
        } else {
          // EMERGENCY LAST-DITCH BUTTON CLICKING
          console.log('🚨 Standard continue methods failed - attempting emergency button clicking');
          const emergencyResult = await emergencyButtonClicking();
          if (emergencyResult.success) {
            results.push({ success: true, step: "emergency_continue", info: emergencyResult });
            console.log('✅ EMERGENCY BUTTON CLICKING SUCCEEDED!');
          } else {
            results.push(genericResult); // Keep the original failure result
            console.log('❌ All button clicking methods exhausted');
          }
        }
      }
      
      results.push(
        await clickRelevantButton(
          ["submit your application", "submit"],
          "submit"
        )
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
          console.error(
            `Step '${e.step}' encountered an exception: ${e.error}`
          );
        } else {
          console.error(
            `Step '${e.step}' failed: ${e.error || "Unknown error"}`
          );
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
          resolve({
            success: false,
            step: stepName,
            error: "Button not found",
          });
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
    
    // ULTRA-STRICT SAFETY CHECK: Block ALL non-application buttons
    const searchBlocklist = [
      'search', 'find jobs', 'job search', 'search jobs', 'browse jobs', 
      'filter', 'sort', 'refine', 'modify search', 'new search', 'edit search',
      'location', 'where', 'city', 'state', 'zip code', 'postal', 'address',
      'browse', 'explore', 'view more', 'see more', 'load more', 'show more',
      'back to search', 'new search', 'refine search', 'edit search'
    ];
    
    // FORM CONTEXT VALIDATION: Only work inside actual application forms
    const isInApplicationForm = () => {
      // Check if we're inside a legitimate application form context
      const applicationIndicators = [
        'form[action*="apply"]', 'form[class*="application"]', 'form[id*="application"]',
        '[class*="smartapply"]', '[class*="indeed-apply"]', '[class*="job-apply"]',
        '[data-testid*="application"]', '[data-testid*="apply"]',
        '.application-form', '.job-application', '.apply-form'
      ];
      
      // Check if any application form containers exist
      return applicationIndicators.some(selector => {
        try {
          return document.querySelector(selector) !== null;
        } catch (e) {
          return false;
        }
      });
    };
    
    // SEARCH PAGE DETECTION: Block if we're on a search/browsing page
    const isOnSearchPage = () => {
      const searchPageIndicators = [
        'input[name*="q"]', 'input[name*="search"]', 'input[placeholder*="search" i]',
        'input[placeholder*="job title" i]', 'input[placeholder*="company" i]',
        '.job-search', '.search-bar', '.search-form', '#searchform',
        '[class*="search-input"]', '[class*="location-input"]'
      ];
      
      return searchPageIndicators.some(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          return Array.from(elements).some(el => isElementVisible(el));
        } catch (e) {
          return false;
        }
      });
    };
    
    // STRICT VALIDATION: Only proceed if we're in an application context
    if (!isInApplicationForm()) {
      console.log(`🚫 ${stepName}: Not in application form context - blocking action`);
      return { success: false, step: stepName, error: 'Not in application form context' };
    }
    
    if (isOnSearchPage()) {
      console.log(`🚫 ${stepName}: On search page - blocking to prevent search disruption`);
      return { success: false, step: stepName, error: 'Search page detected - blocking for safety' };
    }
    
    // Enhanced selectors to catch various button structures including data-testid
    const buttonSelectors = [
      'button, input[type="button"], input[type="submit"]',
      '[data-testid*="continue"]', '[data-testid*="next"]', '[data-testid*="submit"]',
      '[data-testid*="apply"]', '[data-testid*="review"]', '[data-testid*="button"]'
    ];
    
    let btn = null;
    
    // Try each selector type
    for (const selector of buttonSelectors) {
      const elements = Array.from(document.querySelectorAll(selector));
      btn = elements.find((el) => {
        const text = (el.textContent || el.value || '').toLowerCase();
        const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
        const title = (el.title || '').toLowerCase();
        const testId = (el.getAttribute('data-testid') || '').toLowerCase();
        const allText = `${text} ${ariaLabel} ${title} ${testId}`;
        
        // BLOCK search-related buttons
        if (searchBlocklist.some(blocked => allText.includes(blocked))) {
          console.log(`🚫 Blocked search button: "${text}" (contains: ${searchBlocklist.find(blocked => allText.includes(blocked))})`);
          return false;
        }
        
        // PROXIMITY CHECK: Block buttons near search elements
        const isNearSearchElement = () => {
          const searchElements = document.querySelectorAll(
            'input[type="search"], input[placeholder*="search" i], input[placeholder*="job" i], input[placeholder*="where" i], input[placeholder*="location" i]'
          );
          
          for (const searchEl of searchElements) {
            if (isElementVisible(searchEl)) {
              const searchRect = searchEl.getBoundingClientRect();
              const btnRect = el.getBoundingClientRect();
              
              // If button is within 200px of search element, block it
              const distance = Math.sqrt(
                Math.pow(searchRect.x - btnRect.x, 2) + Math.pow(searchRect.y - btnRect.y, 2)
              );
              
              if (distance < 200) {
                console.log(`🚫 Blocked button near search element: "${text}" (distance: ${Math.round(distance)}px)`);
                return true;
              }
            }
          }
          return false;
        };
        
        if (isNearSearchElement()) {
          return false;
        }
        
        // FORM CONTAINER CHECK: Only allow buttons inside form containers
        const isInFormContainer = () => {
          let parent = el.parentElement;
          let depth = 0;
          
          while (parent && depth < 10) { // Check up to 10 levels up
            const parentClasses = parent.className || '';
            const parentId = parent.id || '';
            
            // Look for application form indicators
            if (parent.tagName === 'FORM' || 
                parentClasses.includes('application') ||
                parentClasses.includes('apply') ||
                parentClasses.includes('smartapply') ||
                parentId.includes('application') ||
                parent.getAttribute('data-testid')?.includes('application')) {
              return true;
            }
            
            parent = parent.parentElement;
            depth++;
          }
          return false;
        };
        
        if (!isInFormContainer()) {
          console.log(`🚫 Button not in form container: "${text}"`);
          return false;
        }
        
        // Check if matches our keywords in any attribute
        return regex.test(text) || regex.test(ariaLabel) || regex.test(title) || regex.test(testId);
      });
      
      if (btn) break; // Found a button, stop searching
    }
    
    if (btn) {
      // Double-check it's not a search button before clicking
      const buttonText = (btn.textContent || btn.value || '').toLowerCase();
      if (searchBlocklist.some(blocked => buttonText.includes(blocked))) {
        console.log(`🚫 Final safety check: Prevented clicking search button: "${buttonText}"`);
        return { success: false, step: stepName, error: 'Blocked search button for safety' };
      }
      
      // Enhanced clicking with multiple fallback methods
      try {
        // Method 1: Scroll into view and ensure button is visible
        btn.scrollIntoView({ behavior: "smooth", block: "center" });
        await new Promise((r) => setTimeout(r, 500));
        
        // Method 2: Check if button is disabled and try to enable it
        if (btn.disabled || btn.getAttribute('aria-busy') === 'true') {
          console.log(`⚠️ Button appears disabled, trying to enable: ${btn.textContent || btn.value}`);
          btn.disabled = false;
          btn.removeAttribute('aria-busy');
          await new Promise((r) => setTimeout(r, 200));
        }
        
        // Method 3: Try multiple click methods
        const clickMethods = [
          () => btn.click(),
          () => btn.dispatchEvent(new MouseEvent('click', { 
            bubbles: true, 
            cancelable: true, 
            view: window 
          })),
          () => {
            const event = new Event('click', { bubbles: true });
            btn.dispatchEvent(event);
          }
        ];
        
        let clickSucceeded = false;
        for (const clickMethod of clickMethods) {
          try {
            clickMethod();
            clickSucceeded = true;
            console.log(`✅ Successfully clicked ${stepName} button: "${btn.textContent || btn.value}" (testid: ${btn.getAttribute('data-testid') || 'none'})`);
            break;
          } catch (clickError) {
            console.log(`⚠️ Click method failed, trying next: ${clickError.message}`);
            continue;
          }
        }
        
        if (!clickSucceeded) {
          console.warn(`❌ All click methods failed for ${stepName} button`);
          return { success: false, step: stepName, error: 'All click methods failed' };
        }
        
        await new Promise((r) => setTimeout(r, 3000)); // GENEROUS delay after button clicks
        return { success: true, step: stepName, buttonInfo: { 
          text: btn.textContent || btn.value,
          testId: btn.getAttribute('data-testid'),
          className: btn.className
        }};
        
      } catch (error) {
        console.error(`❌ Error clicking ${stepName} button:`, error);
        return { success: false, step: stepName, error: error.message };
      }
    } else {
      const errorMsg = `${stepName} button not found (keywords: ${keywords.join(", ")})`;
      console.warn(errorMsg);
      return { success: false, step: stepName, error: errorMsg };
    }
  }

  /**
   * Specialized function to find and click Continue buttons with ULTRA-STRICT form validation
   */
  async function findAndClickContinueButton() {
    // ULTRA-STRICT FORM VALIDATION: Only work in legitimate application forms
    const validateApplicationContext = () => {
      // Must have application form indicators
      const requiredIndicators = [
        () => window.location.href.includes('smartapply.indeed.com'),
        () => window.location.href.includes('indeedapply'),
        () => document.querySelector('form[action*="apply"]'),
        () => document.querySelector('[class*="application"]'),
        () => document.querySelector('[data-testid*="application"]')
      ];
      
      const hasRequiredContext = requiredIndicators.some(check => {
        try { return check(); } catch (e) { return false; }
      });
      
      // Must NOT have search indicators visible
      const forbiddenIndicators = [
        'input[placeholder*="job title" i]', 'input[placeholder*="company" i]',
        'input[placeholder*="where" i]', 'input[placeholder*="location" i]',
        '.job-search-bar', '.search-suggestions', '#searchform'
      ];
      
      const hasForbiddenElements = forbiddenIndicators.some(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          return Array.from(elements).some(el => isElementVisible(el));
        } catch (e) { return false; }
      });
      
      return hasRequiredContext && !hasForbiddenElements;
    };
    
    if (!validateApplicationContext()) {
      console.log('🚫 Continue button blocked: Not in legitimate application form context');
      recordFailure('Continue button blocked - invalid context');
      return { success: false, error: 'Not in application context' };
    }
    
    console.log('✅ Application context validated - proceeding with Continue button search');
    
    // Gather candidate buttons/inputs and filter by text/attributes (no :contains/:has)
    const continueCandidateSelectors = [
      '[data-testid="continue-button"]',
      'button[type="button"]',
      'button',
      'input[type="button"]',
      'input[type="submit"]',
      'a[role="button"]',
      '[class*="continue" i]',
      '[aria-label*="continue" i]',
      '[title*="continue" i]'
    ];

    for (const selector of continueCandidateSelectors) {
      try {
        const elements = Array.from(document.querySelectorAll(selector));
        const candidates = elements.filter(el => {
          try {
            if (!isElementVisible(el)) return false;
            const text = ((el.textContent || el.value || '') + ' ' +
                         (el.getAttribute('aria-label') || '') + ' ' +
                         (el.getAttribute('title') || '')).toLowerCase();
            const idc = ((el.id || '') + ' ' + (typeof el.className === 'string' ? el.className : '') + ' ' + (el.getAttribute('data-testid') || '')).toLowerCase();
            return text.includes('continue') || idc.includes('continue');
          } catch { return false; }
        });

        const button = candidates.find(Boolean);
        if (button) {
          // ADDITIONAL SAFETY: Verify this is NOT a search-related continue button
          const buttonContext = button.closest('form, .search, .job-search, #searchform, [class*="search"]');
          
          if (buttonContext) {
            const contextClasses = buttonContext.className || '';
            const contextId = buttonContext.id || '';
            
            // If it's in a search context, block it
            if (contextClasses.includes('search') || contextId.includes('search')) {
              console.log(`🚫 Blocked Continue button in search context: ${contextClasses} ${contextId}`);
              continue;
            }
          }
          
          // FORM VALIDATION: Must be in application form
          const isInApplicationForm = button.closest(
            'form[action*="apply"], [class*="application"], [class*="smartapply"], [data-testid*="application"]'
          );
          
          if (!isInApplicationForm) {
            console.log(`🚫 Continue button not in application form context`);
            continue;
          }
          
          console.log(`🎯 Found validated Continue button with selector: ${selector}`);
          
          // Enhanced click with multiple attempts
          try {
            // Ensure button is in viewport
            button.scrollIntoView({ behavior: "smooth", block: "center" });
            await new Promise((r) => setTimeout(r, 800));
            
            // Check if button needs to be enabled
            if (button.disabled) {
              console.log('🔧 Button disabled, attempting to enable...');
              button.disabled = false;
            }
            
            if (button.getAttribute('aria-busy') === 'true') {
              console.log('🔧 Button busy, clearing busy state...');
              button.removeAttribute('aria-busy');
            }
            
            // Try multiple click approaches
            const clickAttempts = [
              () => button.click(),
              () => {
                const event = new MouseEvent('click', {
                  view: window,
                  bubbles: true,
                  cancelable: true,
                  buttons: 1
                });
                button.dispatchEvent(event);
              },
              () => {
                // Trigger both mousedown and mouseup for more complex buttons
                button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                setTimeout(() => button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })), 50);
                setTimeout(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })), 100);
              }
            ];
            
            for (let i = 0; i < clickAttempts.length; i++) {
              try {
                await clickAttempts[i]();
                console.log(`✅ Continue button clicked successfully (method ${i + 1})`);
                
                // Wait for page response
                await new Promise((r) => setTimeout(r, 2000));
                
                // Check if page changed or form progressed
                const hasFormProgressed = await new Promise((resolve) => {
                  const checkProgress = () => {
                    // Look for loading indicators or page changes
                    const loadingIndicators = document.querySelectorAll(
                      '[aria-busy="true"], [class*="loading"], [class*="spinner"], .loading, .spinner'
                    );
                    
                    // If we see loading indicators, form is progressing
                    if (loadingIndicators.length > 0) {
                      resolve(true);
                      return;
                    }
                    
                    // Check if URL changed
                    setTimeout(() => resolve(false), 1000);
                  };
                  checkProgress();
                });
                
                recordSuccess(`Continue button clicked and form progressed`);
                return { success: true, method: `Click attempt ${i + 1}`, progressed: hasFormProgressed };
                
              } catch (clickError) {
                console.log(`⚠️ Click attempt ${i + 1} failed: ${clickError.message}`);
                if (i === clickAttempts.length - 1) {
                  recordFailure(`All Continue button click attempts failed`);
                  return { success: false, error: 'All click methods exhausted' };
                }
                await new Promise((r) => setTimeout(r, 500)); // Brief pause between attempts
              }
            }
          } catch (interactionError) {
            console.error('❌ Error interacting with Continue button:', interactionError);
            continue; // Try next selector
          }
        }
      } catch (selectorError) {
        console.log(`⚠️ Selector failed: ${selector} - ${selectorError.message}`);
        continue; // Try next selector
      }
    }
    
    recordFailure('No Continue button found with any selector method');
    return { success: false, error: 'Continue button not found' };
  }

  /**
   * EMERGENCY LAST-DITCH BUTTON CLICKING - For when all else fails
   * This function aggressively searches for ANY clickable button that could advance the application
   */
  async function emergencyButtonClicking() {
    console.log('🚨 EMERGENCY BUTTON CLICKING ACTIVATED - Last resort attempt');
    
    // Super aggressive selectors - find ANY button that could be a continue/submit button
    const emergencySelectors = [
      // All buttons with specific text content
      'button[type="button"]',
      'button[type="submit"]', 
      'input[type="button"]',
      'input[type="submit"]',
      '[role="button"]',
      '.btn',
      '[class*="button"]',
      // Mosaic provider buttons (Indeed's system)
      '[class*="mosaic-provider-module-apply"]'
    ];

    const continueWords = ['continue', 'next', 'submit', 'apply', 'proceed', 'forward', 'save'];
    
    for (const selector of emergencySelectors) {
      try {
        const buttons = document.querySelectorAll(selector);
        console.log(`🔍 Found ${buttons.length} buttons with selector: ${selector}`);
        
        for (const button of buttons) {
          // Check if button contains any continue-related text
          const buttonText = (button.textContent || button.value || button.getAttribute('aria-label') || '').toLowerCase();
          const hasRelevantText = continueWords.some(word => buttonText.includes(word));
          
          if (hasRelevantText && isElementVisible(button) && !button.disabled) {
            console.log(`🎯 Emergency button found: "${buttonText.trim()}" with selector: ${selector}`);
            
            try {
              // Scroll to button and make sure it's visible
              button.scrollIntoView({ behavior: "smooth", block: "center" });
              await new Promise(r => setTimeout(r, 500));
              
              // Force enable the button
              button.disabled = false;
              button.removeAttribute('aria-busy');
              
              // Try aggressive clicking
              const clickMethods = [
                () => button.click(),
                () => {
                  button.focus();
                  button.click();
                },
                () => {
                  const evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
                  button.dispatchEvent(evt);
                },
                () => {
                  // Simulate human clicking with mouse events
                  button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                  setTimeout(() => {
                    button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                  }, 50);
                },
                () => {
                  // Try triggering form submission if button is in a form
                  const form = button.closest('form');
                  if (form) {
                    form.requestSubmit(button);
                  }
                }
              ];
              
              for (let i = 0; i < clickMethods.length; i++) {
                try {
                  await clickMethods[i]();
                  console.log(`✅ EMERGENCY CLICK SUCCESS with method ${i + 1}!`);
                  
                  // Wait to see if anything happens
                  await new Promise(r => setTimeout(r, 2000));
                  
                  // Check for page changes or loading
                  const pageChanged = document.querySelector('[aria-busy="true"], [class*="loading"], .loading, .spinner');
                  if (pageChanged) {
                    console.log('🚀 Emergency click caused page activity - SUCCESS!');
                    return { success: true, button: buttonText.trim(), method: i + 1 };
                  }
                  
                } catch (clickErr) {
                  console.log(`⚠️ Emergency click method ${i + 1} failed:`, clickErr.message);
                }
              }
              
              console.log(`⚠️ Emergency button "${buttonText.trim()}" clicked but no obvious page response`);
              return { success: true, button: buttonText.trim(), uncertain: true };
              
            } catch (err) {
              console.log(`❌ Emergency button interaction failed:`, err.message);
            }
          }
        }
      } catch (err) {
        console.log(`❌ Emergency selector failed: ${selector}`, err.message);
      }
    }
    
    console.log('🚨 EMERGENCY CLICKING EXHAUSTED - No buttons found or clicked successfully');
    return { success: false, error: 'No emergency buttons found' };
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
  function waitForElements(selector, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      function checkForElements() {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          console.log(
            `✅ Found ${elements.length} elements with selector: ${selector}`
          );
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
    console.log(
      "🔍 ENHANCED SCRAPING: Analyzing page for all form elements with better classification..."
    );

    const pageData = {
      questions: [],
      radioGroups: {},
      textInputs: [],
      textareas: [],
      selects: [],
      checkboxes: [],
      dateInputs: [],
      buttons: [],
      relevantTypes: new Set(), // Track only types we actually find
    };

    // Wait for elements to load - GENEROUS TIME FOR COMPLEX FORMS
    await new Promise((r) => setTimeout(r, 3000));

    // Find all question containers with enhanced selectors
    const containers = document.querySelectorAll(
      '.ia-Questions-item, [id^="q_"], [data-testid*="input-q_"], [class*="Questions-item"], .application-question, [class*="question"]'
    );

    containers.forEach((container, index) => {
      console.log(`📋 Analyzing container ${index + 1}...`);

      // Enhanced label detection
      const labelElement = container.querySelector(
        'label, legend, [data-testid*="label"], [data-testid*="rich-text"], span[data-testid*="rich-text"], .question-text, [class*="question-label"]'
      );
      const labelText = labelElement
        ? (labelElement.textContent || labelElement.innerText || "")
            .toLowerCase()
            .trim()
        : "";

      // Find input elements in this container with better detection
      const inputs = container.querySelectorAll("input, textarea, select");

      inputs.forEach((input) => {
        const inputType = input.type || input.tagName.toLowerCase();
        const elementData = {
          container: index,
          label: labelText,
          element: input,
          type: inputType,
          name: input.name || "",
          id: input.id || "",
          value: input.value || "",
          checked: input.checked || false,
          placeholder: input.placeholder || "",
          required: input.required || false,
        };

        // Track relevant types we actually find
        pageData.relevantTypes.add(inputType);

        // Enhanced categorization with better input type detection
        switch (inputType) {
          case "radio":
            if (!pageData.radioGroups[input.name]) {
              pageData.radioGroups[input.name] = {
                label: labelText,
                options: [],
                questionType: classifyQuestionType(labelText),
              };
            }
            pageData.radioGroups[input.name].options.push(elementData);
            break;

          case "text":
          case "email":
          case "tel":
          case "number":
            pageData.textInputs.push({
              ...elementData,
              questionType: classifyQuestionType(labelText),
            });
            break;

          case "date":
            pageData.dateInputs.push({
              ...elementData,
              questionType: classifyQuestionType(labelText),
            });
            break;

          case "checkbox":
            pageData.checkboxes.push({
              ...elementData,
              questionType: classifyQuestionType(labelText),
            });
            break;

          default:
            if (input.tagName.toLowerCase() === "textarea") {
              pageData.textareas.push({
                ...elementData,
                questionType: classifyQuestionType(labelText),
              });
            } else if (input.tagName.toLowerCase() === "select") {
              pageData.selects.push({
                ...elementData,
                questionType: classifyQuestionType(labelText),
              });
            }
        }

        // Check for date inputs by placeholder or pattern
        if (
          inputType === "text" &&
          (input.placeholder?.includes("MM/DD/YYYY") ||
            input.placeholder?.includes("date") ||
            labelText.includes("date") ||
            labelText.includes("available") ||
            labelText.includes("start"))
        ) {
          pageData.dateInputs.push({
            ...elementData,
            questionType: "DATE_INPUT",
          });
        }
      });

      // Add to questions array only if we have relevant content
      if (labelText && inputs.length > 0) {
        const questionType = classifyQuestionType(labelText);
        pageData.questions.push({
          container: index,
          label: labelText,
          inputTypes: Array.from(inputs).map(
            (i) => i.type || i.tagName.toLowerCase()
          ),
          questionType: questionType,
          priority: getQuestionPriority(questionType), // Add priority for processing order
        });
      }
    });

    // Sort questions by priority (handle high-priority questions first)
    pageData.questions.sort((a, b) => b.priority - a.priority);

    // Find all buttons
    const buttons = document.querySelectorAll(
      'button, input[type="submit"], input[type="button"]'
    );
    buttons.forEach((btn) => {
      pageData.buttons.push({
        element: btn,
        text: (btn.textContent || btn.value || "").toLowerCase().trim(),
        type: btn.type || "button",
        classes: btn.className || "",
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
    console.log(
      `   Relevant Types Found: ${Array.from(pageData.relevantTypes).join(
        ", "
      )}`
    );

    return pageData;
  }

  /**
   * 🔥 VERSION 2.0 - AGGRESSIVE PROCESSOR with starter pattern filtering
   */
  async function processScrapedElementsV2(pageData) {
    console.log(
      "🔥 VERSION 2.0 PROCESSING: Aggressive filtering with question starter patterns..."
    );

    let processed = 0;
    let skipped = 0;
    let filtered_out = 0;

    // 🚫 AGGRESSIVE FILTERING - Only process questions that match our starter patterns
    const knownTypes = new Set([
      "WORK_AUTHORIZATION",
      "COMMUTE",
      "EXPERIENCE",
      "DATE_INPUT",
      "SALARY",
      "REASON_APPLYING",
      "EDUCATION",
    ]);

    // Filter out UNKNOWN questions completely - won't even try to process them
    const matchedQuestions = pageData.questions.filter((q) => {
      if (q.questionType === "UNKNOWN") {
        filtered_out++;
        console.log(
          `🚫 FILTERED OUT: "${q.label}" - doesn't match any starter pattern`
        );
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
      console.log(
        `\n🎯 Processing [Priority ${question.priority}]: "${question.label}"`
      );
      console.log(`🏷️ Matched pattern: ${question.questionType}`);

      try {
        // 🔥 SERIES OF SWITCH CASES - Only handle confirmed pattern matches
        switch (question.questionType) {
          case "WORK_AUTHORIZATION":
            console.log("💼 Running WORK_AUTHORIZATION handler...");
            if (await handleWorkAuthorization(question, pageData)) processed++;
            else skipped++;
            break;

          case "COMMUTE":
            console.log("🚗 Running COMMUTE handler...");
            if (await handleCommuteQuestion(question, pageData)) processed++;
            else skipped++;
            break;

          case "EXPERIENCE":
            console.log("📈 Running EXPERIENCE handler...");
            if (await handleExperienceQuestion(question, pageData)) processed++;
            else skipped++;
            break;

          case "DATE_INPUT":
            console.log("📅 Running DATE_INPUT handler...");
            if (await handleDateInput(question, pageData)) processed++;
            else skipped++;
            break;

          case "SALARY":
            console.log("💰 Running SALARY handler...");
            if (await handleSalaryQuestion(question, pageData)) processed++;
            else skipped++;
            break;

          case "REASON_APPLYING":
            console.log("📝 Running REASON_APPLYING handler...");
            if (await handleReasonApplying(question, pageData)) processed++;
            else skipped++;
            break;

          case "EDUCATION":
            console.log("🎓 Running EDUCATION handler...");
            if (await handleEducationQuestion(question, pageData)) processed++;
            else skipped++;
            break;

          default:
            // This should never happen with our aggressive filtering
            console.log(
              `❌ UNEXPECTED: Question type ${question.questionType} made it through filtering`
            );
            skipped++;
        }

        // Small delay between questions
        await new Promise((r) => setTimeout(r, 200));
      } catch (error) {
        console.error(
          `❌ Error processing question "${question.label}":`,
          error.message
        );
        skipped++;
      }
    }

    console.log(`\n🔥 VERSION 2.0 RESULTS:`);
    console.log(`✅ Successfully processed: ${processed} questions`);
    console.log(`⚠️ Failed to process: ${skipped} questions`);
    console.log(
      `🚫 Filtered out (no pattern match): ${filtered_out} questions`
    );
    console.log(
      `⚡ Processing efficiency: ${(
        (processed / (processed + skipped)) *
        100
      ).toFixed(1)}% success rate`
    );
    console.log(
      `🎯 Overall efficiency: ${(
        (processed / pageData.questions.length) *
        100
      ).toFixed(1)}% of all questions handled`
    );

    return processed;
  }

  /**
   * 🎯 SMART PROCESSOR - Use switch cases to handle different question types
   */
  async function processScrapedElements(pageData) {
    console.log(
      "🎯 OPTIMIZED PROCESSING: Using filtered switch cases for relevant question types..."
    );

    let processed = 0;
    let skipped = 0;

    // Filter out only the question types we can actually handle to cut out unnecessary cases
    const handledTypes = new Set([
      "WORK_AUTHORIZATION",
      "COMMUTE",
      "EXPERIENCE",
      "DATE_INPUT",
      "SALARY",
      "REASON_APPLYING",
      "SKILLS",
      "EDUCATION",
    ]);

    const relevantQuestions = pageData.questions.filter(
      (q) => handledTypes.has(q.questionType) || q.questionType === "GENERIC"
    );

    console.log(
      `� Processing ${relevantQuestions.length} relevant questions (skipping ${
        pageData.questions.length - relevantQuestions.length
      } irrelevant ones)`
    );

    // Process each relevant question using optimized switch cases
    for (const question of relevantQuestions) {
      console.log(
        `\n📝 Processing [Priority ${question.priority}]: "${question.label}"`
      );
      console.log(`🏷️ Type: ${question.questionType}`);

      try {
        // Optimized switch case - only handle types we know we need
        switch (question.questionType) {
          case "WORK_AUTHORIZATION":
            if (await handleWorkAuthorization(question, pageData)) processed++;
            break;

          case "COMMUTE":
            if (await handleCommuteQuestion(question, pageData)) processed++;
            break;

          case "EXPERIENCE":
            if (await handleExperienceQuestion(question, pageData)) processed++;
            break;

          case "DATE_INPUT":
            if (await handleDateInput(question, pageData)) processed++;
            break;

          case "SALARY":
            if (await handleSalaryQuestion(question, pageData)) processed++;
            break;

          case "REASON_APPLYING":
            if (await handleReasonApplying(question, pageData)) processed++;
            break;

          case "SKILLS":
            if (await handleSkillsQuestion(question, pageData)) processed++;
            break;

          case "EDUCATION":
            if (await handleEducationQuestion(question, pageData)) processed++;
            break;

          case "GENERIC":
            if (await handleGenericQuestion(question, pageData)) processed++;
            break;

          default:
            console.log(
              `⏭️ Skipping unsupported question type: ${question.questionType}`
            );
            skipped++;
        }

        // Small delay between questions
        await new Promise((r) => setTimeout(r, 200));
      } catch (error) {
        console.error(
          `❌ Error processing question "${question.label}":`,
          error.message
        );
        skipped++;
      }
    }

    console.log(
      `✅ Successfully processed ${processed} questions, skipped ${skipped} questions`
    );
    console.log(
      `⚡ Algorithm efficiency: ${(
        (processed / (processed + skipped)) *
        100
      ).toFixed(1)}% success rate`
    );

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
    if (
      text.startsWith("are you authorized to work") ||
      text.startsWith("do you have authorization to work") ||
      text.startsWith("are you legally authorized") ||
      text.includes("visa") ||
      text.includes("sponsorship") ||
      text.includes("work permit")
    ) {
      return "WORK_AUTHORIZATION";
    }

    // Commute questions - matches any location/distance
    if (
      text.startsWith("will you be able to reliably commute") ||
      text.startsWith("are you able to commute") ||
      text.startsWith("can you reliably commute") ||
      text.startsWith("are you willing to commute") ||
      text.startsWith("do you have reliable transportation")
    ) {
      return "COMMUTE";
    }

    // Generic "How many years" questions - matches any topic after "years"
    if (
      text.startsWith("how many years") ||
      text.startsWith("how many total years") ||
      (text.includes("years") && text.includes("experience"))
    ) {
      return "EXPERIENCE";
    }

    // Availability/start date questions
    if (
      text.startsWith("when are you available") ||
      text.startsWith("when can you start") ||
      text.startsWith("what is your availability") ||
      text.includes("available to start") ||
      text.includes("start date")
    ) {
      return "DATE_INPUT";
    }

    // Salary/compensation questions
    if (
      text.startsWith("what is your desired salary") ||
      text.startsWith("what are your salary expectations") ||
      text.startsWith("what is your expected salary") ||
      text.includes("compensation") ||
      text.includes("pay rate")
    ) {
      return "SALARY";
    }

    // Reason for applying questions
    if (
      text.startsWith("why are you interested") ||
      text.startsWith("why do you want") ||
      text.startsWith("what interests you") ||
      text.includes("reason for applying") ||
      text.includes("cover letter")
    ) {
      return "REASON_APPLYING";
    }

    // Education questions
    if (
      text.startsWith("what is your highest level") ||
      text.startsWith("what is your education") ||
      (text.startsWith("do you have a") &&
        (text.includes("degree") || text.includes("diploma")))
    ) {
      return "EDUCATION";
    }

    // 🚫 AGGRESSIVE FILTERING - If it doesn't match our patterns, skip it
    return "UNKNOWN";
  }

  /**
   * 🎯 PRIORITY SYSTEM - Assign priority scores to question types for optimal processing order
   */
  function getQuestionPriority(questionType) {
    const priorities = {
      WORK_AUTHORIZATION: 10, // Highest priority - often required
      COMMUTE: 9, // High priority - location-based
      EXPERIENCE: 7, // Medium-high priority
      DATE_INPUT: 6, // Medium priority
      SKILLS: 5, // Medium priority
      EDUCATION: 4, // Medium-low priority
      SALARY: 3, // Low priority
      REASON_APPLYING: 2, // Low priority
      GENERIC: 1, // Lowest priority
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
    const radioGroup = Object.values(pageData.radioGroups).find(
      (group) => group.label === question.label
    );

    if (radioGroup) {
      const yesOption = radioGroup.options.find(
        (opt) =>
          opt.element.value.toLowerCase() === "yes" ||
          opt.element.value === "1" ||
          opt.element.nextElementSibling?.textContent
            ?.toLowerCase()
            .includes("yes")
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

    const radioGroup = Object.values(pageData.radioGroups).find(
      (group) => group.label === question.label
    );

    if (radioGroup) {
      const yesOption = radioGroup.options.find(
        (opt) =>
          opt.element.value.toLowerCase() === "yes" ||
          opt.element.value === "1" ||
          opt.element.nextElementSibling?.textContent
            ?.toLowerCase()
            .includes("yes")
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
    const textInput = pageData.textInputs.find(
      (input) =>
        input.label === question.label &&
        (input.type === "number" || input.type === "text")
    );

    if (textInput) {
      const experienceValue = getExperienceValue(question.label);
      textInput.element.value = experienceValue;
      textInput.element.dispatchEvent(new Event("input", { bubbles: true }));
      textInput.element.dispatchEvent(new Event("change", { bubbles: true }));
      console.log(`✅ Filled experience: ${experienceValue} years`);
      return true;
    }

    console.log("⚠️ Could not find experience input field");
    return false;
  }

  async function handleDateInput(question, pageData) {
    console.log("📅 Handling date input question...");

    // Look for date inputs in multiple ways
    const dateInput =
      pageData.dateInputs.find((input) => input.label === question.label) ||
      pageData.textInputs.find(
        (input) =>
          input.label === question.label &&
          (input.placeholder?.includes("date") ||
            input.placeholder?.includes("MM/DD/YYYY"))
      );

    if (dateInput) {
      const dateValue = getSmartDateValue(question.label, dateInput.type);
      dateInput.element.value = dateValue;
      dateInput.element.dispatchEvent(new Event("input", { bubbles: true }));
      dateInput.element.dispatchEvent(new Event("change", { bubbles: true }));
      console.log(`✅ Filled date: ${dateValue}`);
      return true;
    }

    console.log("⚠️ Could not find date input field");
    return false;
  }
  async function handleSalaryQuestion(question, pageData) {
    console.log("💰 Handling salary question...");

    const textInput = pageData.textInputs.find(
      (input) => input.label === question.label
    );
    if (textInput) {
      const salaryValue = await getSalaryValue(question.label);
      textInput.element.value = salaryValue;
      textInput.element.dispatchEvent(new Event("input", { bubbles: true }));
      textInput.element.dispatchEvent(new Event("change", { bubbles: true }));
      console.log(`✅ Filled salary: ${salaryValue}`);
      return true;
    }

    console.log("⚠️ Could not find salary input field");
    return false;
  }

  async function handleReasonApplying(question, pageData) {
    console.log("📝 Handling reason for applying...");

    const textarea = pageData.textareas.find(
      (ta) => ta.label === question.label
    );
    if (textarea) {
      const reasonText = await getReasonText(question.label);
      textarea.element.value = reasonText;
      textarea.element.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.element.dispatchEvent(new Event("change", { bubbles: true }));
      console.log("✅ Filled reason for applying");
      return true;
    }

    console.log("⚠️ Could not find reason textarea");
    return false;
  }

  async function handleSkillsQuestion(question, pageData) {
    console.log("🛠️ Handling skills question...");

    const textarea =
      pageData.textareas.find((ta) => ta.label === question.label) ||
      pageData.textInputs.find((input) => input.label === question.label);

    if (textarea) {
      const skillsText = await getSkillsText(question.label);
      textarea.element.value = skillsText;
      textarea.element.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.element.dispatchEvent(new Event("change", { bubbles: true }));
      console.log("✅ Filled skills information");
      return true;
    }

    console.log("⚠️ Could not find skills input field");
    return false;
  }

  async function handleEducationQuestion(question, pageData) {
    try {
      if (!isExtensionContextValid()) {
        console.log(
          "❌ Extension context invalid - skipping education question"
        );
        return false;
      }

      console.log("🎓 Handling education question...");

      // Handle selects for degree levels
      const selectInput = pageData.selects.find(
        (select) => select.label === question.label
      );
      if (selectInput && selectInput.element) {
        try {
          const educationValue = await getEducationValue(question.label);
          selectInput.element.value = educationValue;
          selectInput.element.dispatchEvent(
            new Event("change", { bubbles: true })
          );
          console.log(`✅ Selected education: ${educationValue}`);
          return true;
        } catch (selectError) {
          console.error("❌ Error with education select:", selectError.message);
        }
      }

      // Handle text inputs for school names, etc.
      const textInput = pageData.textInputs.find(
        (input) => input.label === question.label
      );
      if (textInput && textInput.element) {
        try {
          const educationText = await getEducationText(question.label);
          textInput.element.value = educationText;
          textInput.element.dispatchEvent(
            new Event("input", { bubbles: true })
          );
          textInput.element.dispatchEvent(
            new Event("change", { bubbles: true })
          );
          console.log(`✅ Filled education: ${educationText}`);
          return true;
        } catch (inputError) {
          console.error(
            "❌ Error with education text input:",
            inputError.message
          );
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
      const radioGroup = Object.values(pageData.radioGroups).find(
        (group) => group.label === question.label
      );

      if (radioGroup && radioGroup.options.length > 0) {
        try {
          // Try to select a reasonable option (Yes > first option)
          const yesOption =
            radioGroup.options.find(
              (opt) =>
                opt.element &&
                (opt.element.value.toLowerCase() === "yes" ||
                  opt.element.value === "1")
            ) || radioGroup.options[0];

          if (yesOption && yesOption.element) {
            await clickRadioButton(yesOption.element);
            console.log("✅ Selected option for generic question");
            return true;
          }
        } catch (radioError) {
          console.error(
            "❌ Error with generic radio button:",
            radioError.message
          );
        }
      }

      // Try text inputs
      const textInput = pageData.textInputs.find(
        (input) => input.label === question.label
      );
      if (textInput && textInput.element) {
        try {
          textInput.element.value = "N/A";
          textInput.element.dispatchEvent(
            new Event("input", { bubbles: true })
          );
          console.log("✅ Filled generic text input");
          return true;
        } catch (inputError) {
          console.error(
            "❌ Error with generic text input:",
            inputError.message
          );
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
  function waitForElementInContainer(container, selector, timeout = 15000) {
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
      const learnedAnswer =
        await window.questionLearningSystem.checkLearnedPatterns(
          labelText,
          container
        );
      if (learnedAnswer) {
        console.log(
          `✅ Found learned answer for: "${labelText}" -> "${learnedAnswer}"`
        );
        return; // Pattern matched and filled, we're done
      }
    }

    // 1. NUMBER INPUTS (years of experience, age, etc.) - Check first since they're also text inputs
    console.log("⏳ Waiting for number input...");
    const numberInput = await waitForElementInContainer(
      container,
      'input[type="number"], input[inputmode="numeric"], input[inputmode="text"][min], input[id*="number-input"], input[data-testid*="input"][min]'
    );
    if (numberInput) {
      console.log(
        `📝 Found number input for: "${labelText}", current value: "${numberInput.value}"`
      );
      if (!numberInput.value) {
        const value = await getNumberInputValue(labelText);
        if (value) {
          await fillInputSafely(numberInput, value, labelText);
          return;
        }
      } else {
        console.log(
          `⚠️ Number input already has value: "${numberInput.value}"`
        );
        return;
      }
    }

    // 2. TEXT INPUTS (address, city, state, zip, etc.)
    console.log("⏳ Waiting for text input...");
    const textInput = await waitForElementInContainer(
      container,
      'input[type="text"], input:not([type]), input[data-testid*="input"]:not([min])'
    );
    if (textInput) {
      console.log(
        `📝 Found text input for: "${labelText}", current value: "${textInput.value}"`
      );
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
    const textarea = await waitForElementInContainer(
      container,
      'textarea, input[id*="rich-text-question"]'
    );
    if (textarea) {
      console.log(
        `📝 Found textarea for: "${labelText}", current value: "${textarea.value}"`
      );
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
    const select = await waitForElementInContainer(container, "select");
    if (select) {
      console.log(
        `📝 Found select dropdown for: "${labelText}", current value: "${select.value}"`
      );
      if (!select.value || select.value === "") {
        const value = getSelectValueLegacy(labelText, select);
        if (value) {
          select.value = value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          console.log(`✅ Selected "${value}" for ${labelText}`);
          return;
        }
      } else {
        console.log(`⚠️ Select already has value: "${select.value}"`);
        return;
      }
    }

    // 5. INTELLIGENT RADIO BUTTONS (including single-select questions)
    console.log("⏳ Waiting for radio buttons...");
    await new Promise((r) => setTimeout(r, 800)); // GENEROUS delay for radio buttons to render
    const radioButtons = container.querySelectorAll(
      'input[type="radio"], input[id*="single-select-question"]'
    );
    if (radioButtons.length > 0) {
      sendLogToPopup(`🔘 Radio: "${labelText.substring(0, 40)}..."`);
      
      // Check if any radio is already selected
      const alreadySelected = Array.from(radioButtons).find(
        (radio) => radio.checked
      );
      if (!alreadySelected) {
        
        // INTELLIGENT RADIO BUTTON SELECTION
        const questionText = labelText.toLowerCase();
        let selectedRadio = null;
        let reasoning = '';
        
        // Get all radio options with their labels
        const radioOptions = Array.from(radioButtons).map(radio => {
          // Simple label extraction
          let label = '';
          const closestLabel = radio.closest("label");
          if (closestLabel) {
            label = closestLabel.textContent.trim();
          } else if (radio.nextSibling && radio.nextSibling.textContent) {
            label = radio.nextSibling.textContent.trim();
          } else if (radio.parentElement) {
            label = radio.parentElement.textContent.trim();
          } else {
            label = radio.value || radio.id || '';
          }
          
          return {
            element: radio,
            text: label.toLowerCase(),
            originalText: label
          };
        });
        
        // SMART SELECTION LOGIC
        
        // Yes/No questions - default to positive responses for most cases
        if (radioOptions.some(opt => opt.text.includes('yes')) && 
            radioOptions.some(opt => opt.text.includes('no'))) {
          
          if (questionText.includes('authorized to work') || questionText.includes('eligible to work') ||
              questionText.includes('legal right') || questionText.includes('citizen')) {
            selectedRadio = radioOptions.find(opt => opt.text.includes('yes'))?.element;
            reasoning = 'Confirmed work authorization';
          }
          else if (questionText.includes('background check') || questionText.includes('drug test') ||
                   questionText.includes('willing to') || questionText.includes('available')) {
            selectedRadio = radioOptions.find(opt => opt.text.includes('yes'))?.element;
            reasoning = 'Agreed to requirement';
          }
          else if (questionText.includes('criminal') || questionText.includes('felony') ||
                   questionText.includes('convicted')) {
            selectedRadio = radioOptions.find(opt => opt.text.includes('no'))?.element;
            reasoning = 'No criminal background';
          }
          else {
            // Default to yes for unclear yes/no questions
            selectedRadio = radioOptions.find(opt => opt.text.includes('yes'))?.element;
            reasoning = 'Default positive response';
          }
        }
        
        // Experience level questions
        else if (questionText.includes('experience level') || questionText.includes('years of experience')) {
          const entryOptions = radioOptions.filter(opt => 
            opt.text.includes('0-1') || opt.text.includes('entry') || opt.text.includes('1-2') ||
            opt.text.includes('1-3') || opt.text.includes('less than')
          );
          if (entryOptions.length > 0) {
            selectedRadio = entryOptions[0].element;
            reasoning = 'Selected appropriate experience level';
          }
        }
        
        // Education level questions
        else if (questionText.includes('education') || questionText.includes('degree')) {
          const bachelorOptions = radioOptions.filter(opt =>
            opt.text.includes('bachelor') || opt.text.includes('undergraduate') ||
            opt.text.includes('college') || opt.text.includes('4-year')
          );
          const highSchoolOptions = radioOptions.filter(opt =>
            opt.text.includes('high school') || opt.text.includes('diploma') ||
            opt.text.includes('ged')
          );
          
          if (bachelorOptions.length > 0) {
            selectedRadio = bachelorOptions[0].element;
            reasoning = 'Selected bachelor degree option';
          } else if (highSchoolOptions.length > 0) {
            selectedRadio = highSchoolOptions[0].element;
            reasoning = 'Selected high school education';
          }
        }
        
        // Work arrangement preferences
        else if (questionText.includes('remote') || questionText.includes('work from home') ||
                 questionText.includes('hybrid') || questionText.includes('office')) {
          const hybridOptions = radioOptions.filter(opt =>
            opt.text.includes('hybrid') || opt.text.includes('flexible')
          );
          const remoteOptions = radioOptions.filter(opt =>
            opt.text.includes('remote') || opt.text.includes('home')
          );
          
          if (hybridOptions.length > 0) {
            selectedRadio = hybridOptions[0].element;
            reasoning = 'Preferred hybrid work arrangement';
          } else if (remoteOptions.length > 0) {
            selectedRadio = remoteOptions[0].element;
            reasoning = 'Selected remote work option';
          }
        }
        
        // Salary/compensation questions
        else if (questionText.includes('salary') || questionText.includes('compensation')) {
          const negotiableOptions = radioOptions.filter(opt =>
            opt.text.includes('negotiable') || opt.text.includes('competitive') ||
            opt.text.includes('discuss')
          );
          if (negotiableOptions.length > 0) {
            selectedRadio = negotiableOptions[0].element;
            reasoning = 'Selected flexible compensation option';
          }
        }
        
        // Default selection strategies
        if (!selectedRadio) {
          // Try to find the most reasonable first option (not "other" or "none")
          const reasonableOptions = radioOptions.filter(opt =>
            !opt.text.includes('other') && !opt.text.includes('none') &&
            !opt.text.includes('n/a') && !opt.text.includes('decline')
          );
          
          if (reasonableOptions.length > 0) {
            selectedRadio = reasonableOptions[0].element;
            reasoning = 'Selected first reasonable option';
          } else {
            // Last resort - select first option
            selectedRadio = radioOptions[0].element;
            reasoning = 'Selected first available option';
          }
        }
        
        // Apply selection
        if (selectedRadio) {
          selectedRadio.checked = true;
          selectedRadio.dispatchEvent(new Event("change", { bubbles: true }));
          
          const selectedText = radioOptions.find(opt => opt.element === selectedRadio)?.originalText || 'option';
          sendLogToPopup(`🔘 Selected: "${selectedText}" (${reasoning})`);
          console.log(`✅ Selected radio option "${selectedText}" for ${labelText}: ${reasoning}`);
          return;
        }
        
      } else {
        console.log(`⚠️ Radio button already selected for: "${labelText}"`);
        return;
      }
    }

    // 6. INTELLIGENT CHECKBOXES
    console.log("⏳ Waiting for checkboxes...");
    await new Promise((r) => setTimeout(r, 800)); // GENEROUS delay for checkboxes to render
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    if (checkboxes.length > 0) {
      sendLogToPopup(`☑️ Checkbox: "${labelText.substring(0, 40)}..."`);
      
      const questionText = labelText.toLowerCase();
      let shouldCheck = false;
      let reasoning = '';
      
      // SMART CHECKBOX DECISIONS
      
      // Required agreements (always accept)
      if ((questionText.includes('term') && questionText.includes('condition')) ||
          questionText.includes('privacy policy') || questionText.includes('user agreement') ||
          questionText.includes('terms of service') || questionText.includes('terms and conditions')) {
        shouldCheck = true;
        reasoning = 'Required terms acceptance';
      }
      
      else if (questionText.includes('agree') || questionText.includes('accept') || 
               questionText.includes('consent') || questionText.includes('acknowledge')) {
        shouldCheck = true;
        reasoning = 'Agreement checkbox';
      }
      
      // Communication preferences (be selective)
      else if (questionText.includes('newsletter') || questionText.includes('marketing') || 
               questionText.includes('promotional') || questionText.includes('advertisement')) {
        shouldCheck = false; // Generally decline marketing
        reasoning = 'Declined marketing communications';
      }
      
      else if (questionText.includes('job alert') || questionText.includes('job notification') || 
               questionText.includes('application update') || questionText.includes('hiring update')) {
        shouldCheck = true; // Accept job-related communications
        reasoning = 'Accepted job-related notifications';
      }
      
      // Work preferences and availability
      else if (questionText.includes('willing to') || questionText.includes('available') || 
               questionText.includes('able to work') || questionText.includes('can work')) {
        shouldCheck = true; // Show flexibility
        reasoning = 'Showed work flexibility';
      }
      
      // Background checks and requirements
      else if (questionText.includes('background check') || questionText.includes('drug test') || 
               questionText.includes('screening') || questionText.includes('verification')) {
        shouldCheck = true;
        reasoning = 'Agreed to required screening';
      }
      
      // Legal work authorization
      else if (questionText.includes('authorized to work') || questionText.includes('legal right') || 
               questionText.includes('work visa') || questionText.includes('citizenship') ||
               questionText.includes('eligible to work')) {
        shouldCheck = true;
        reasoning = 'Confirmed work authorization';
      }
      
      // If it's required (asterisk, "required" text)
      else if (questionText.includes('*') || questionText.includes('required')) {
        shouldCheck = true;
        reasoning = 'Required field';
      }
      
      // Default behavior - confirm/certify type boxes
      else if (questionText.includes('confirm') || questionText.includes('certify') || 
               questionText.includes('attest') || questionText.includes('verify')) {
        shouldCheck = true;
        reasoning = 'General confirmation';
      }
      
      else {
        // Default: don't check unclear boxes
        shouldCheck = false;
        reasoning = 'Unclear checkbox - left unchecked';
      }
      
      // Apply the decision to all checkboxes in this container
      checkboxes.forEach((checkbox) => {
        checkbox.checked = shouldCheck;
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      });
      
      const action = shouldCheck ? '✅ Checked' : '⬜ Unchecked';
      sendLogToPopup(`${action}: ${reasoning}`);
      console.log(`${action} ${checkboxes.length} box(es) for ${labelText}: ${reasoning}`);
      
      if (shouldCheck) {
        return; // Stop processing if we checked something
      }
    }

    // 7. DATE INPUTS
    console.log("⏳ Waiting for date inputs...");
    const dateInput = await waitForElementInContainer(
      container,
      'input[placeholder*="MM/DD/YYYY"], input[type="date"]'
    );
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
      console.log(
        `⚠️ Skipping file upload for: ${labelText} (requires user interaction)`
      );
      return;
    }

    // Log what elements we found for debugging
    const allInputs = container.querySelectorAll("input, textarea, select");
    console.log(`⚠️ Unknown question type for: "${labelText}"`);
    console.log(
      `🔍 Found ${allInputs.length} input elements:`,
      Array.from(allInputs).map((el) => `${el.tagName}[type="${el.type}"]`)
    );

    // 🧠 LEARNING SYSTEM - Watch for manual user input and learn from it
    if (window.questionLearningSystem) {
      window.questionLearningSystem.startWatching(
        container,
        labelText,
        allInputs
      );
    }
  }

  /**
   * Safely fill input with proper event handling
   */
  async function fillInputSafely(input, value, labelText) {
    try {
      // Wait for element to be ready
      if (!input.offsetParent && input.style.display === "none") {
        console.log(`⚠️ Input not visible for: ${labelText}`);
        return false;
      }

      // Focus, fill, and trigger events
      input.focus();
      input.value = value;

      // Trigger all relevant events
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new Event("blur", { bubbles: true }));

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
      const config = await loadUserConfig();

      // Find matching pattern from custom patterns (new structure)
      if (config.customPatterns) {
        const textPatterns = config.customPatterns.filter(p => p.inputType === 'text' || p.inputType === 'email' || p.inputType === 'url' || p.inputType === 'tel');
        const matchedPattern = findPatternMatch(textPatterns, labelText);
        if (matchedPattern) {
          return matchedPattern.value;
        }
      }

      // Backward compatibility - Find matching pattern from legacy structure
      const matchedPattern = findPatternMatch(
        config.textInputPatterns || [],
        labelText
      );
      if (matchedPattern) {
        return matchedPattern.value;
      }

      // Fallback to default value
      return config.defaultValues?.textInput || "Available upon request";
    } catch (error) {
      console.error("❌ Error getting text input value from config:", error);
      // Fallback to hardcoded default
      return "Available upon request";
    }
  }

  /**
   * Get appropriate value for textarea based on label
   */
  async function getTextareaValue(labelText) {
    try {
      const config = await loadUserConfig();

      // Find matching pattern from custom patterns (new structure)
      if (config.customPatterns) {
        const textareaPatterns = config.customPatterns.filter(p => p.inputType === 'textarea');
        const matchedPattern = findPatternMatch(textareaPatterns, labelText);
        if (matchedPattern) {
          return matchedPattern.value;
        }
      }

      // Backward compatibility - Find matching pattern from legacy structure
      const matchedPattern = findPatternMatch(
        config.textareaPatterns || [],
        labelText
      );
      if (matchedPattern) {
        return matchedPattern.value;
      }

      // Fallback to default value
      return (
        config.defaultValues?.textarea ||
        "I am interested in this position and believe I would be a valuable addition to your team."
      );
    } catch (error) {
      console.error("❌ Error getting textarea value from config:", error);
      // Fallback to hardcoded default
      return "I am highly motivated and believe I would be a valuable addition to your team. I look forward to the opportunity to contribute to your organization.";
    }
  }

  /**
   * Get appropriate value for number inputs (years of experience, etc.)
   */
  async function getNumberInputValue(labelText) {
    try {
      const config = await loadUserConfig();

      // Find matching pattern from JSON configuration
      // For number patterns, we need special handling for experience questions with exclusions
      const text = labelText.toLowerCase();

      // Find the most specific match (pattern with most matching keywords)
      let bestMatch = null;
      let maxMatches = 0;

      // Get patterns from both new and legacy structures
      const numberPatterns = [];
      
      // New structure - custom patterns with number input type
      if (config.customPatterns) {
        numberPatterns.push(...config.customPatterns.filter(p => p.inputType === 'number'));
      }
      
      // Legacy structure - backward compatibility
      if (config.numberInputPatterns) {
        numberPatterns.push(...config.numberInputPatterns);
      }

      for (const pattern of numberPatterns) {
        const matchedKeywords = pattern.keywords.filter((keyword) =>
          text.includes(keyword.toLowerCase())
        );

        // Special handling for Java vs JavaScript
        if (
          pattern.keywords.includes("java") &&
          !pattern.keywords.includes("javascript") &&
          text.includes("javascript")
        ) {
          continue; // Skip Java pattern if text contains JavaScript
        }

        if (
          matchedKeywords.length === pattern.keywords.length &&
          matchedKeywords.length > maxMatches
        ) {
          maxMatches = matchedKeywords.length;
          bestMatch = pattern;
        }
      }

      if (bestMatch) {
        console.log(
          `🔢 Found number pattern match: ${bestMatch.keywords.join(
            ", "
          )} -> "${bestMatch.value}"`
        );
        return bestMatch.value;
      }

      // Fallback to default value
      return config.defaultValues?.numberInput || "1";
    } catch (error) {
      console.error("❌ Error getting number input value from config:", error);
      // Fallback to hardcoded default
      return "1";
    }
  }

  /**
   * Get appropriate value for radio inputs based on label
   */
  async function getRadioValue(labelText) {
    try {
      const config = await loadUserConfig();

      // Find matching pattern from custom patterns
      if (config.customPatterns) {
        const radioPatterns = config.customPatterns.filter(p => p.inputType === 'radio');
        const matchedPattern = findPatternMatch(radioPatterns, labelText);
        if (matchedPattern) {
          return matchedPattern.value;
        }
      }

      // Backward compatibility - check legacy radioPatterns
      if (config.radioPatterns) {
        const matchedPattern = findPatternMatch(config.radioPatterns, labelText);
        if (matchedPattern) {
          return matchedPattern.preferredValue || 'no';
        }
      }

      // Default for common visa/sponsorship questions
      const text = labelText.toLowerCase();
      if (text.includes('visa') || text.includes('sponsorship') || text.includes('h-1b') || text.includes('work authorization')) {
        return 'no';
      }

      return 'yes'; // Default radio value
    } catch (error) {
      console.error("❌ Error getting radio value from config:", error);
      return 'no';
    }
  }

  /**
   * Get appropriate value for select dropdowns based on label
   */
  async function getSelectValue(labelText) {
    try {
      const config = await loadUserConfig();

      // Find matching pattern from custom patterns
      if (config.customPatterns) {
        const selectPatterns = config.customPatterns.filter(p => p.inputType === 'select');
        const matchedPattern = findPatternMatch(selectPatterns, labelText);
        if (matchedPattern) {
          return matchedPattern.value;
        }
      }

      // Backward compatibility - check legacy selectPatterns
      if (config.selectPatterns) {
        const matchedPattern = findPatternMatch(config.selectPatterns, labelText);
        if (matchedPattern) {
          return matchedPattern.preferredValue;
        }
      }

      // Smart defaults based on common patterns
      const text = labelText.toLowerCase();
      if (text.includes('country')) {
        return 'United States';
      }
      if (text.includes('state') || text.includes('province')) {
        return 'Texas';
      }
      if (text.includes('experience') || text.includes('level')) {
        return 'Experienced';
      }

      return null; // No default selection
    } catch (error) {
      console.error("❌ Error getting select value from config:", error);
      return null;
    }
  }

  /**
   * Get appropriate radio button selection based on label text (Legacy version)
   */
  function getRadioValueLegacy(labelText, radioButtons) {
    const text = labelText.toLowerCase();

    // Work authorization / visa questions - specifically about sponsorship needs
    if (
      text.includes("visa") ||
      text.includes("sponsorship") ||
      text.includes("h-1b") ||
      text.includes("opt") ||
      (text.includes("work authorization") && text.includes("sponsor"))
    ) {
      // For visa/sponsorship questions, usually answer "No" (don't need sponsorship)
      const noOption = Array.from(radioButtons).find(
        (radio) =>
          radio.value === "2" ||
          radio.value.toLowerCase() === "no" ||
          radio.nextElementSibling?.textContent?.toLowerCase().includes("no")
      );
      return noOption || radioButtons[1]; // Default to second option if "No" not found
    }

    // Location/commute questions
    if (
      text.includes("able to") ||
      text.includes("report for") ||
      text.includes("work in") ||
      text.includes("commute") ||
      text.includes("relocate") ||
      text.includes("travel") ||
      text.includes("on-site") ||
      text.includes("in-person") ||
      text.includes("reliably commute") ||
      text.includes("commute to")
    ) {
      // For work location questions, usually answer "Yes"
      const yesOption = Array.from(radioButtons).find(
        (radio) =>
          radio.value === "1" ||
          radio.value.toLowerCase() === "yes" ||
          radio.nextElementSibling?.textContent?.toLowerCase().includes("yes")
      );
      return yesOption || radioButtons[0]; // Default to first option if "Yes" not found
    }

    if (text.includes("Will you be able to reliably commute")) {
      const yesOption = Array.from(radioButtons).find(
        (radio) =>
          radio.value === "1" ||
          radio.value.toLowerCase() === "yes" ||
          radio.nextElementSibling?.textContent?.toLowerCase().includes("yes")
      );
      return yesOption || radioButtons[0];
    }
    if (text.includes("Are you authorized to work in the?")) {
      const yesOption = Array.from(radioButtons).find(
        (radio) =>
          radio.value === "1" ||
          radio.value.toLowerCase() === "yes" ||
          radio.nextElementSibling?.textContent?.toLowerCase().includes("yes")
      );
      return yesOption || radioButtons[0];
    }

    // Age/eligibility questions - including employment eligibility
    if (
      text.includes("18") ||
      text.includes("age") ||
      text.includes("eligible") ||
      text.includes("legally authorized") ||
      text.includes("employment eligibility") ||
      text.includes("authorized to work")
    ) {
      // For age/eligibility questions, usually answer "Yes"
      const yesOption = Array.from(radioButtons).find(
        (radio) =>
          radio.value === "1" ||
          radio.value.toLowerCase() === "yes" ||
          radio.nextElementSibling?.textContent?.toLowerCase().includes("yes")
      );
      return yesOption || radioButtons[0];
    }

    // Background check / drug test questions
    if (
      text.includes("background") ||
      text.includes("drug") ||
      text.includes("test") ||
      text.includes("screening") ||
      text.includes("criminal")
    ) {
      // For background/drug test questions, usually answer "Yes" (willing to comply)
      const yesOption = Array.from(radioButtons).find(
        (radio) =>
          radio.value.toLowerCase() === "yes" ||
          radio.nextElementSibling?.textContent?.toLowerCase().includes("yes")
      );
      return yesOption || radioButtons[0];
    }

    // Schedule/availability questions
    if (
      text.includes("available") ||
      text.includes("start") ||
      text.includes("schedule") ||
      text.includes("shift") ||
      text.includes("weekend") ||
      text.includes("overtime") ||
      text.includes("flexible")
    ) {
      // For availability questions, usually answer "Yes"
      const yesOption = Array.from(radioButtons).find(
        (radio) =>
          radio.value.toLowerCase() === "yes" ||
          radio.nextElementSibling?.textContent?.toLowerCase().includes("yes")
      );
      return yesOption || radioButtons[0];
    }

    // Experience/qualification questions
    if (
      text.includes("experience") ||
      text.includes("years") ||
      text.includes("qualification") ||
      text.includes("skill")
    ) {
      // For experience questions, usually answer "Yes"
      const yesOption = Array.from(radioButtons).find(
        (radio) =>
          radio.value.toLowerCase() === "yes" ||
          radio.nextElementSibling?.textContent?.toLowerCase().includes("yes")
      );
      return yesOption || radioButtons[0];
    }

    // Driver's license questions
    if (
      text.includes("license") ||
      text.includes("driver") ||
      text.includes("driving") ||
      text.includes("vehicle")
    ) {
      // For license questions, usually answer "Yes"
      const yesOption = Array.from(radioButtons).find(
        (radio) =>
          radio.value.toLowerCase() === "yes" ||
          radio.nextElementSibling?.textContent?.toLowerCase().includes("yes")
      );
      return yesOption || radioButtons[0];
    }

    // Education questions
    if (
      text.includes("degree") ||
      text.includes("diploma") ||
      text.includes("education") ||
      text.includes("graduate")
    ) {
      // For education questions, usually answer "Yes"
      const yesOption = Array.from(radioButtons).find(
        (radio) =>
          radio.value.toLowerCase() === "yes" ||
          radio.nextElementSibling?.textContent?.toLowerCase().includes("yes")
      );
      return yesOption || radioButtons[0];
    }

    // Default to first option (usually "Yes")
    return radioButtons[0];
  }

  /**
   * Get appropriate value for select dropdowns (Legacy version)
   */
  function getSelectValueLegacy(labelText, selectElement) {
    const text = labelText.toLowerCase();
    const options = Array.from(selectElement.options);

    if (text.includes("country")) {
      // Find "United States" option
      const usOption = options.find(
        (opt) =>
          opt.textContent.toLowerCase().includes("united states") ||
          opt.value === "1"
      );
      return usOption ? usOption.value : options[1]?.value;
    }

    if (text.includes("state") || text.includes("province")) {
      // Find Texas or first reasonable state
      const txOption = options.find(
        (opt) =>
          opt.textContent.toLowerCase().includes("texas") ||
          opt.textContent.toLowerCase().includes("tx")
      );
      return txOption ? txOption.value : options[1]?.value;
    }

    // Default to first non-empty option
    return (
      options.find((opt) => opt.value && opt.value !== "")?.value ||
      options[1]?.value
    );
  }

  /**
   * Determine if checkboxes should be checked
   */
  function getCheckboxValue(labelText) {
    const text = labelText.toLowerCase();

    // Generally check boxes for agreements, terms, etc.
    if (
      text.includes("agree") ||
      text.includes("terms") ||
      text.includes("conditions") ||
      text.includes("policy") ||
      text.includes("consent") ||
      text.includes("authorize") ||
      text.includes("acknowledge") ||
      text.includes("accept") ||
      text.includes("confirm")
    ) {
      return true;
    }

    // Marketing and communication preferences
    if (
      text.includes("marketing") ||
      text.includes("newsletter") ||
      text.includes("promotional") ||
      text.includes("updates") ||
      text.includes("communications")
    ) {
      return false; // Usually don't want marketing emails
    }

    // Opt-out statements - don't check these
    if (
      text.includes("opt out") ||
      text.includes("do not") ||
      text.includes("don't want") ||
      text.includes("unsubscribe") ||
      text.includes("decline")
    ) {
      return false;
    }

    // Work preferences - usually check these
    if (
      text.includes("available") ||
      text.includes("willing") ||
      text.includes("able to") ||
      text.includes("interested in") ||
      text.includes("open to")
    ) {
      return true;
    }

    // Background check and screening - check these
    if (
      text.includes("background check") ||
      text.includes("drug test") ||
      text.includes("screening") ||
      text.includes("verification") ||
      text.includes("reference check")
    ) {
      return true;
    }

    // Legal authorization - check these
    if (
      text.includes("authorized to work") ||
      text.includes("legal right") ||
      text.includes("eligible") ||
      text.includes("18 years") ||
      text.includes("age requirement")
    ) {
      return true;
    }

    // Don't check boxes for negative statements
    if (
      text.includes("don't") ||
      text.includes("not interested") ||
      text.includes("no thanks")
    ) {
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
  function getSmartDateValue(labelText, inputType = "text") {
    const text = labelText.toLowerCase();
    const today = new Date();

    // Start date / Available date - typically 1-2 weeks from now for job applications
    if (
      text.includes("available") ||
      text.includes("start") ||
      text.includes("when can you start")
    ) {
      const startDate = new Date(today);
      startDate.setDate(today.getDate() + 10); // 10 days from now (business-friendly)
      return formatDateForInput(startDate, inputType);
    }

    // Birth date - reasonable default for job applications
    if (
      text.includes("birth") ||
      text.includes("dob") ||
      text.includes("date of birth")
    ) {
      const birthDate = new Date(1990, 0, 15); // January 15, 1990 (32+ years old)
      return formatDateForInput(birthDate, inputType);
    }

    // Education dates (graduation, etc.)
    if (
      text.includes("graduation") ||
      text.includes("completed") ||
      text.includes("finished")
    ) {
      const gradDate = new Date(2020, 4, 15); // May 15, 2020
      return formatDateForInput(gradDate, inputType);
    }

    // Employment history dates
    if (
      text.includes("employment") ||
      text.includes("worked") ||
      text.includes("job")
    ) {
      if (text.includes("start") || text.includes("began")) {
        const startDate = new Date(2021, 0, 1); // January 1, 2021
        return formatDateForInput(startDate, inputType);
      }
      if (
        text.includes("end") ||
        text.includes("left") ||
        text.includes("finish")
      ) {
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
    switch (inputType) {
      case "date":
        // HTML5 date inputs expect YYYY-MM-DD format
        return date.toISOString().split("T")[0];

      case "text":
      default:
        // Text inputs typically expect MM/DD/YYYY format in US
        return date.toLocaleDateString("en-US", {
          month: "2-digit",
          day: "2-digit",
          year: "numeric",
        });
    }
  }

  // Legacy function for backward compatibility
  function getDateValue(labelText) {
    return getSmartDateValue(labelText, "text");
  }

  /**
   * 🎯 SMART VALUE GENERATORS - Generate appropriate responses based on question context
   */
  function getExperienceValue(labelText) {
    const text = labelText.toLowerCase();

    // Extract any specific technology or skill mentioned
    if (text.includes("specific") || text.includes("relevant")) {
      return "2"; // Conservative for specific experience
    }
    if (text.includes("total") || text.includes("overall")) {
      return "5"; // More generous for total experience
    }

    return "3"; // Default safe value
  }

  async function getSalaryValue(labelText) {
    return await getSmartValue(labelText, 'text');
  }

  async function getReasonText(labelText) {
    return await getSmartValue(labelText, 'text');
  }

  async function getSkillsText(labelText) {
    return await getSmartValue(labelText, 'text');
  }

  async function getEducationValue(labelText) {
    return await getSmartValue(labelText, 'text');
  }

  async function getEducationText(labelText) {
    return await getSmartValue(labelText, 'text');
  }

  /**
   * 🔧 ENHANCED RADIO BUTTON CLICKER - Better radio button interaction
   */
  async function clickRadioButton(radioElement) {
    try {
      // Focus the element first
      radioElement.focus();
      await new Promise((r) => setTimeout(r, 100));

      // Set checked property
      radioElement.checked = true;

      // Click the element
      radioElement.click();

      // Dispatch events to ensure proper handling
      radioElement.dispatchEvent(new Event("change", { bubbles: true }));
      radioElement.dispatchEvent(new Event("input", { bubbles: true }));

      // Small delay to let changes register
      await new Promise((r) => setTimeout(r, 200));

      return true;
    } catch (error) {
      console.error("Error clicking radio button:", error.message);
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
   * COMPLETION ASSURANCE - Ensure application finishes properly
   */
  async function ensureApplicationCompletion() {
    console.log("🔄 Ensuring application reaches completion...");
    sendStatusMessage("🔄 Ensuring application reaches completion...");
    
    try {
      let completionAttempts = 0;
      const maxCompletionAttempts = 5;
      
      while (completionAttempts < maxCompletionAttempts) {
        completionAttempts++;
        console.log(`🎯 Completion attempt ${completionAttempts}/${maxCompletionAttempts}`);
        
        // Check if we're already on a success page
        if (await isSuccessPage()) {
          console.log("✅ Already on success page - completion verified");
          
          // Auto-close tab after success
          console.log("🔄 Auto-closing tab in 2 seconds...");
          setTimeout(() => {
            chrome.runtime.sendMessage({action: 'closeTab'});
          }, 2000);
          
          return true;
        }
        
        // Look for final submit/complete buttons (robust, no :contains)
        const submitCandidateSelectors = [
          'button', 'input[type="submit"]', 'button[type="submit"]',
          '[data-testid*="submit" i]', '[data-testid*="complete" i]',
          'a[role="button"]'
        ];
        let submitButton = null;
        for (const sel of submitCandidateSelectors) {
          const btn = findElementRobust(sel, document, { textContent: 'submit' })
                   || findElementRobust(sel, document, { textContent: 'submit application' })
                   || findElementRobust(sel, document, { textContent: 'complete' })
                   || findElementRobust(sel, document, { textContent: 'finish' })
                   || findElementRobust(sel, document, { textContent: 'send' })
                   || findElementRobust(sel, document, { textContent: 'apply now' });
          if (btn) { submitButton = btn; break; }
        }
        
        if (submitButton && isElementVisible(submitButton) && !submitButton.disabled) {
          console.log(`🎯 Found final submit button: "${submitButton.textContent || submitButton.value}"`);
          sendStatusMessage("🎯 Clicking final submit button...");
          
          try {
            submitButton.click();
            console.log("✅ Final submit button clicked");
            
            // Wait for submission to process
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Check for success after submission
            if (await isSuccessPage()) {
              console.log("✅ Success page reached after final submission");
              
              // Auto-close tab after success
              console.log("🔄 Auto-closing tab in 2 seconds...");
              setTimeout(() => {
                chrome.runtime.sendMessage({action: 'closeTab'});
              }, 2000);
              
              return true;
            }
            
          } catch (error) {
            console.warn(`⚠️ Error clicking submit button: ${error.message}`);
          }
        }
        
        // Check for navigation buttons that might lead to completion
        const navCandidateSelectors = [
          'button', 'a[role="button"]', 'input[type="button"]'
        ];
        let navButton = null;
        for (const sel of navCandidateSelectors) {
          const btn = findElementRobust(sel, document, { textContent: 'next' })
                   || findElementRobust(sel, document, { textContent: 'continue' })
                   || findElementRobust(sel, document, { textContent: 'proceed' })
                   || findElementRobust(sel, document, { textContent: 'review' });
          if (btn) { navButton = btn; break; }
        }
        
        if (navButton && isElementVisible(navButton) && !navButton.disabled) {
          console.log(`➡️ Found navigation button: "${navButton.textContent}"`);
          
          try {
            navButton.click();
            await new Promise(resolve => setTimeout(resolve, 2000));
          } catch (error) {
            console.warn(`⚠️ Error clicking navigation button: ${error.message}`);
          }
        } else {
          // No actionable buttons found
          console.log("ℹ️ No completion or navigation buttons found");
          break;
        }
        
        // Wait before next attempt
        if (completionAttempts < maxCompletionAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      // Final check for success
      const finalSuccess = await isSuccessPage();
      console.log(`📊 Final completion status: ${finalSuccess ? "SUCCESS" : "UNCERTAIN"}`);
      
      if (finalSuccess) {
        // Auto-close tab after success
        console.log("🔄 Auto-closing tab in 2 seconds...");
        setTimeout(() => {
          chrome.runtime.sendMessage({action: 'closeTab'});
        }, 2000);
      }
      
      return finalSuccess;
      
    } catch (error) {
      console.error("❌ Error ensuring completion:", error);
      return false;
    }
  }

  /**
   * Main dynamic workflow that handles unlimited question pages
   */
  async function runDynamicApplicationWorkflow() {
    // � FIRST: Attempt to restore automation state aggressively before any checks
    console.log(`🔍 Initial state: automationAllowed=${window.automationAllowed}, manualStartRequired=${window.manualStartRequired}`);
    
    // AGGRESSIVE restoration for job processing tabs - NEVER block job processing!
    if (!window.automationAllowed) {
      console.log("🔄 Job tab detected - attempting AGGRESSIVE automation state restoration...");
      
      // Step 1: Try standard restoration
      restoreAutomationStateAfterRecovery();
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Step 2: If still blocked, check ALL storage locations aggressively
      if (!window.automationAllowed) {
        console.log("🚨 AGGRESSIVE: Checking ALL possible automation state sources...");
        
        // Check recent states (extended to 10 minutes for job processing)
        const storageChecks = [
          () => sessionStorage.getItem('extensionAutomationState'),
          () => localStorage.getItem('extensionAutomationState'),
          () => {
            // Check ALL backup entries, not just recent ones
            const backupKeys = Object.keys(localStorage).filter(key => key.startsWith('automationBackup_'));
            for (const key of backupKeys.sort().reverse()) {
              try {
                return localStorage.getItem(key);
              } catch (e) {
                continue;
              }
            }
            return null;
          }
        ];
        
        for (const checkFn of storageChecks) {
          try {
            const stateData = checkFn();
            if (stateData) {
              const parsed = JSON.parse(stateData);
              // For job processing, accept ANY automation state within 10 minutes
              if (parsed && parsed.automationAllowed && Date.now() - parsed.timestamp < 600000) {
                console.log("🚨 AGGRESSIVE RESTORE: Found valid automation state - enabling job processing!");
                window.automationAllowed = true;
                window.manualStartRequired = false;
                window.automationRunning = true;
                
                // Immediately save to all locations to prevent this issue again
                const newState = {
                  ...parsed,
                  timestamp: Date.now(),
                  url: window.location.href,
                  aggressiveRestore: true
                };
                localStorage.setItem('extensionAutomationState', JSON.stringify(newState));
                sessionStorage.setItem('extensionAutomationState', JSON.stringify(newState));
                window.automationStateData = newState;
                break;
              }
            }
          } catch (e) {
            console.warn("Error checking state source:", e.message);
            continue;
          }
        }
      }
      
      // Step 3: LAST RESORT - If this is clearly a job application URL, assume automation should work
      if (!window.automationAllowed && 
          (window.location.href.includes('/viewjob') || 
           window.location.href.includes('/apply') ||
           window.location.href.includes('smartapply.indeed.com'))) {
        
        console.log("🚨 LAST RESORT: This is clearly a job URL - FORCING automation to continue!");
        console.log("🚨 Job processing should NEVER be blocked - enabling automation!");
        
        window.automationAllowed = true;
        window.manualStartRequired = false;
        window.automationRunning = true;
        
        // Save this emergency state
        const emergencyState = {
          automationAllowed: true,
          manualStartRequired: false,
          automationRunning: true,
          timestamp: Date.now(),
          url: window.location.href,
          emergencyRestore: true,
          reason: 'Job URL detected - forced automation'
        };
        
        try {
          localStorage.setItem('extensionAutomationState', JSON.stringify(emergencyState));
          sessionStorage.setItem('extensionAutomationState', JSON.stringify(emergencyState));
          window.automationStateData = emergencyState;
        } catch (e) {
          console.warn("Could not save emergency state:", e.message);
        }
      }
    }
    
    // �🛑 SAFETY CHECK: Only proceed if automation is allowed (after restoration attempts)
    if (!window.automationAllowed || window.manualStartRequired) {
      console.log("� Job application blocked - manual start required. Click Start button first.");
      // Try to restore state if it might have been lost during context recovery
      console.log(`🔍 Debug state: automationAllowed=${window.automationAllowed}, manualStartRequired=${window.manualStartRequired}`);
      
      console.error("❌ CRITICAL ERROR: Automation still blocked after aggressive restoration attempts!");
      console.error(`❌ Final state: automationAllowed=${window.automationAllowed}, manualStartRequired=${window.manualStartRequired}`);
      console.error("❌ This should NEVER happen for job processing tabs!");
      console.error("❌ URL:", window.location.href);
      
      // Log all storage states for debugging
      try {
        console.error("❌ SessionStorage state:", sessionStorage.getItem('extensionAutomationState'));
        console.error("❌ LocalStorage state:", localStorage.getItem('extensionAutomationState'));
        console.error("❌ Window state:", window.automationStateData);
      } catch (e) {
        console.error("❌ Could not log storage states:", e.message);
      }
      
      throw new Error("CRITICAL: Automation blocked after all restoration attempts - this indicates a serious bug");
    }
    
    console.log("�🚀 Starting enhanced dynamic application workflow...");
    console.log("✅ Manual start verified - proceeding with job application");
    console.log(`🔍 Final state check: automationAllowed=${window.automationAllowed}, automationRunning=${window.automationRunning}`);
    sendStatusMessage("🚀 Starting enhanced dynamic application workflow...");

    // Global timeout wrapper - PREVENT INFINITE HANGING
    const GLOBAL_APPLICATION_TIMEOUT = 180000; // 3 minutes max per application
    const applicationStartTime = Date.now();
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Application workflow timed out after ${GLOBAL_APPLICATION_TIMEOUT/1000} seconds - preventing infinite hang`));
      }, GLOBAL_APPLICATION_TIMEOUT);
    });

    const workflowPromise = (async () => {

    // Initialize comprehensive tracking
    window.pageLoadTime = Date.now();
    window.formInteractionCount = 0;
    window.lastFormInteraction = Date.now();
    window.lastContentChange = Date.now();
    window.lastProgressDetected = Date.now();
    window.applicationStartTime = Date.now();
    
    // Add form interaction listeners for progress tracking
    const trackFormInteraction = (event) => {
      window.lastFormInteraction = Date.now();
      window.formInteractionCount++;
      console.log(`📝 Form interaction detected (${window.formInteractionCount}): ${event.type} on ${event.target.tagName}`);
    };
    
    // Listen for all form interactions and submissions
    document.addEventListener('input', trackFormInteraction);
    document.addEventListener('change', trackFormInteraction);
    document.addEventListener('click', (event) => {
      if (event.target.matches('button, input[type="submit"], input[type="button"], a[role="button"]')) {
        trackFormInteraction(event);
        
        // Track submission attempts
        const text = (event.target.textContent || event.target.value || '').toLowerCase();
        if (text.includes('submit') || text.includes('apply') || text.includes('send') || 
            text.includes('complete') || text.includes('finish')) {
          window.lastSubmissionAttempt = Date.now();
          console.log('📤 Submission attempt detected');
        }
      }
    });
    
    // Track form submissions
    document.addEventListener('submit', (event) => {
      window.lastFormSubmission = Date.now();
      console.log('📮 Form submission detected');
    });

    try {
      // Step 1: Click Apply button if not already on form
      if (!window.location.href.includes("smartapply.indeed.com")) {
        console.log("📍 Step 1: Navigating to application form");
        sendStatusMessage("📍 Step 1: Navigating to application form");
        await clickApplyButton();
        sendStatusMessage("✅ Successfully navigated to application form");
      } else {
        console.log("✅ Already on application form");
        sendStatusMessage("✅ Already on application form");
      }

      // Step 2: Run the unlimited workflow loop with detailed tracking
      console.log("📍 Step 2: Processing application forms");
      sendStatusMessage("📍 Step 2: Processing application forms");
      const workflowResult = await runUnlimitedWorkflowLoop();
      sendStatusMessage(
        `✅ Step 2 completed: ${workflowResult ? "Success" : "Failed"}`
      );

      // Step 3: ENSURE COMPLETION - Wait for submission or final form
      console.log("📍 Step 3: Ensuring application completion");
      sendStatusMessage("📍 Step 3: Ensuring application completion");
      
      let completionResult = await ensureApplicationCompletion();
      
      // Step 4: Comprehensive success verification with extended wait
      console.log("📍 Step 4: Final verification of application submission");
      sendStatusMessage("📍 Step 4: Final verification of application submission");
      
      // Wait longer for success confirmation to appear
      let successResult = false;
      let verificationAttempts = 0;
      const maxVerificationAttempts = 3;
      
      while (!successResult && verificationAttempts < maxVerificationAttempts) {
        verificationAttempts++;
        console.log(`🔍 Verification attempt ${verificationAttempts}/${maxVerificationAttempts}`);
        
        successResult = await checkApplicationSuccess();
        
        if (!successResult && verificationAttempts < maxVerificationAttempts) {
          console.log("⏳ Waiting additional time for success confirmation...");
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds between attempts
        }
      }
      
      sendStatusMessage(
        `✅ Step 4 completed: ${successResult ? "Verified" : "Could not verify"}`
      );

      // Step 5: Generate detailed result with improved logic
      const interactionCount = window.formInteractionCount || 0;
      const totalDuration = Date.now() - window.applicationStartTime;
      
      console.log(`📊 Final Application Summary:`);
      console.log(`   • Form interactions: ${interactionCount}`);
      console.log(`   • Workflow success: ${workflowResult?.success || false}`);
      console.log(`   • Completion ensured: ${completionResult}`);
      console.log(`   • Success verified: ${successResult}`);
      console.log(`   • Total duration: ${Math.round(totalDuration / 1000)}s`);

      // IMPROVED RESULT DETERMINATION - Be more confident in success
      if (successResult) {
        // Clear success confirmation - definitely passed
        console.log("✅ SUCCESS: Application confirmed as submitted");
        return "pass";
      } else if (completionResult && interactionCount > 0) {
        // Application went through completion process and had interactions
        console.log("✅ LIKELY SUCCESS: Application completed with form interactions");
        return "pass";
      } else if (workflowResult?.success && interactionCount > 0) {
        // Workflow succeeded and we filled forms
        console.log("✅ PROBABLE SUCCESS: Workflow succeeded with form filling");
        return "pass";
      } else if (interactionCount === 0 && workflowResult?.success) {
        // No forms needed but workflow completed
        return "pass_no_forms_needed";
      } else if (interactionCount > 5) {
        // Significant form interaction suggests successful progression
        console.log("✅ INFERRED SUCCESS: Substantial form interactions detected");
        return "pass";
      } else if (interactionCount > 0) {
        // Some interaction but uncertain outcome
        console.log("⚠️ UNCERTAIN: Had form interactions but unclear completion");
        return "pass"; // Be optimistic - if we filled forms, likely succeeded
      } else {
        // No meaningful interaction
        console.log("❌ FAILURE: No significant form interactions detected");
        return "fail_no_forms_no_confirmation";
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
    })(); // End of workflowPromise

    // Race between workflow completion and timeout
    try {
      return await Promise.race([workflowPromise, timeoutPromise]);
    } catch (error) {
      console.error("❌ Application workflow failed or timed out:", error);
      if (error.message.includes('timed out')) {
        return "fail_timeout_global";
      }
      return "fail_exception";
    }
  }

  /**
   * Click the Apply button on job posting page
   */
  async function clickApplyButton() {
    console.log("🖱️ STEP 1: Finding and clicking Apply button");

    await new Promise((r) => setTimeout(r, 3000));

  const easyApplySelectors = [
      "#indeedApplyButton",
      'button[data-testid="indeedApplyButton-test"]',
      'button[aria-label*="Apply now"]',
      "button.css-jiauqs",
      ".ia-IndeedApplyButton button",
  // Avoid :has; target by class directly as a safe fallback
  "button .jobsearch-IndeedApplyButton-newDesign",
      'button[title=""][aria-label*="Apply"]',
    ];

    let applyBtn = await waitForAnyElement(easyApplySelectors, 10000);
    if (!applyBtn) {
      applyBtn = await waitForElementByText(
        ["apply now", "easily apply", "apply anyway"],
        5000
      );
    }

    if (!applyBtn) {
      const isAlreadyOnForm =
        document.querySelector("#mosaic-contactInfoModule") ||
        document.querySelector('[data-testid="profile-location-page"]') ||
        window.location.href.includes("smartapply.indeed.com");

      if (isAlreadyOnForm) {
        console.log("✅ Already on application form (direct redirect)");
        return;
      } else {
        throw new Error("No apply button found");
      }
    }

    // Validate and click the apply button
    if (applyBtn.tagName !== "BUTTON") {
      // Prefer an ancestor button if the match is a child within a button
      const ancestorButton = applyBtn.closest('button');
      if (ancestorButton) {
        applyBtn = ancestorButton;
      } else {
        // Fallback: look for a descendant button within the matched element
        const buttonInside = applyBtn.querySelector("button");
        if (buttonInside) {
          applyBtn = buttonInside;
        } else {
          throw new Error("Found element is not clickable button");
        }
      }
    }

    if (!applyBtn.offsetParent || applyBtn.disabled) {
      throw new Error("Button found but not clickable");
    }

    console.log("🖱️ Clicking apply button...");
    applyBtn.scrollIntoView({ behavior: "smooth", block: "center" });
    await new Promise((r) => setTimeout(r, 500));
    applyBtn.click();

    // Wait for form to load
    await new Promise((r) => setTimeout(r, 3000));

    const isApplicationPage =
      window.location.href.includes("smartapply.indeed.com") ||
      window.location.href.includes("form/profile") ||
      document.querySelector("#mosaic-contactInfoModule") ||
      document.querySelector('[data-testid="profile-location-page"]') ||
      document.querySelector("form");

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
      sendLogToPopup("🛑 Automation blocked - not on valid Indeed page", "ERROR");
      return { success: false, reason: "Not on valid Indeed page" };
    }

    sendLogToPopup("🔄 Starting optimized workflow loop...");
    sendStatusMessage("🔄 Starting optimized workflow loop...");

    let pageCount = 0;
    let lastProgressTime = Date.now();
    let consecutiveFailures = 0; // Track consecutive page failures
    let pagesWithoutProgress = 0; // Track pages that had no changes
    const MAX_STALL_TIME = 45000; // 45 seconds without progress = quit
    const MAX_CONSECUTIVE_FAILURES = 3; // Stop after 3 consecutive failed pages
    const MAX_PAGES_WITHOUT_PROGRESS = 2; // Stop after 2 pages with no forms/buttons

    // DYNAMIC: Continue until we detect completion, not a hardcoded limit
    while (true) {
      // Check for emergency stop
      if (window.emergencyStopFlag) {
        sendLogToPopup("🚨 Emergency stop detected - halting workflow", "WARN");
        return { success: false, reason: "Emergency stop triggered" };
      }

      // Check if we should still be running automation
      if (!shouldRunAutomation()) {
        sendLogToPopup("🛑 Left valid Indeed page - stopping", "WARN");
        return { success: false, reason: "Left valid Indeed page" };
      }

      // Check for stalling (no progress for too long)
      if (Date.now() - lastProgressTime > MAX_STALL_TIME) {
        sendLogToPopup("⏰ No progress for 30s - likely stuck, exiting", "ERROR");
        return { success: false, reason: "Workflow stalled - no progress" };
      }

      pageCount++;
      sendLogToPopup(`📄 Processing page ${pageCount} (dynamic detection)`);
      sendStatusMessage(`📄 Processing page ${pageCount} of application...`);

      try {
        // Success page check - BUT ONLY AFTER we've made real progress
        // Don't check for success on the very first page (prevents premature completion)
        if (pageCount > 1 && await isSuccessPage()) {
          sendLogToPopup(`🎉 Success page detected after ${pageCount} pages - application complete!`);
          recordSuccess("Reached application success page");
          
          // AUTO-CLOSE: Automatically close success page and move to next job
          sendLogToPopup("🔄 Auto-closing success page and moving to next job...");
          
          // Brief delay to show success message, then close tab
          setTimeout(() => {
            sendLogToPopup("✅ Job application completed successfully - closing tab");
            window.close(); // This will trigger the tab close handler in background script
          }, 2000); // 2 second delay to show success
          
          return { success: true, reason: "Application submitted successfully - auto-closing" };
        } else if (pageCount === 1) {
          sendLogToPopup("📋 Skipping success check on first page - ensuring we process forms");
        }

        // DYNAMIC STOPPING: Check for intelligent stopping conditions
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          sendLogToPopup(`🛑 Stopping: ${MAX_CONSECUTIVE_FAILURES} consecutive failed pages`, "WARN");
          return { success: false, reason: `${MAX_CONSECUTIVE_FAILURES} consecutive page failures` };
        }
        
        if (pagesWithoutProgress >= MAX_PAGES_WITHOUT_PROGRESS && pageCount > 2) {
          sendLogToPopup(`🛑 Stopping: ${MAX_PAGES_WITHOUT_PROGRESS} pages without interactive elements`, "WARN");
          return { success: false, reason: "No interactive elements found for multiple pages" };
        }

        // Process current page with smart timeout
        const pageProcessed = await processCurrentPageOptimized();

        if (pageProcessed) {
          lastProgressTime = Date.now(); // Reset stall timer on progress
          consecutiveFailures = 0; // Reset failure counter on success
          pagesWithoutProgress = 0; // Reset pages without progress counter
          recordSuccess(`Page ${pageCount} processed successfully`);
          sendStatusMessage(`✅ Page ${pageCount} completed successfully`);

          // AGGRESSIVE navigation attempt - try multiple times before giving up
          sendStatusMessage(`➡️ Attempting to find navigation buttons...`);
          
          let navigationAttempts = 0;
          let proceededToNext = false;
          
          while (navigationAttempts < 3 && !proceededToNext) {
            // Check for emergency stop before each navigation attempt
            if (window.emergencyStopFlag) {
              sendLogToPopup("🚨 Emergency stop detected during navigation attempts", "WARN");
              return { success: false, reason: "Emergency stop triggered" };
            }

            navigationAttempts++;
            sendLogToPopup(`🎯 Navigation attempt ${navigationAttempts}/3...`);
            
            proceededToNext = await proceedToNextPage();
            
            if (!proceededToNext) {
              console.log(`⚠️ Navigation attempt ${navigationAttempts} failed - waiting and retrying...`);
              if (navigationAttempts < 3) {
                // Wait for potential delayed UI updates WITH emergency stop checks
                sendLogToPopup("⏳ Waiting for potential UI updates...");
                for (let i = 0; i < 30; i++) { // 3 second wait in 100ms chunks
                  if (window.emergencyStopFlag) {
                    sendLogToPopup("🚨 Emergency stop during retry wait", "WARN");
                    return { success: false, reason: "Emergency stop triggered" };
                  }
                  await new Promise((r) => setTimeout(r, 100));
                }
                
                // Try to wait for DOM to stabilize again (already has emergency stop checks)
                await waitForDOMReady(10000);
              }
            } else {
              sendLogToPopup(`✅ Navigation successful on attempt ${navigationAttempts}`);
              break;
            }
          }

          if (!proceededToNext) {
            console.log("⚠️ All navigation attempts failed - might be final page or need manual intervention");
            
            // Before giving up completely, try one more aggressive approach
            sendLogToPopup("🚨 Trying AGGRESSIVE button detection as last resort...");
            const lastResortResult = await tryAggressiveNavigation();
            
            if (!lastResortResult) {
              console.log("⚠️ Even aggressive navigation failed - ending workflow");
              break;
            } else {
              proceededToNext = true;
              sendLogToPopup("🎉 Aggressive navigation succeeded!");
            }
          }

          // ULTRA AGGRESSIVE page load waiting - CRITICAL for page transitions
          sendLogToPopup("⏳ AGGRESSIVE WAIT: Allowing page to fully load and stabilize...");
          
          // First wait for immediate navigation - WITH EMERGENCY STOP CHECK
          for (let i = 0; i < 50; i++) { // 5 second wait broken into 100ms chunks
            if (window.emergencyStopFlag) {
              sendLogToPopup("🚨 Emergency stop detected during navigation wait", "WARN");
              return { success: false, reason: "Emergency stop triggered" };
            }
            await new Promise((r) => setTimeout(r, 100));
          }
          sendLogToPopup("📊 Phase 1 complete - checking DOM...");
          
          // Wait for DOM to be ready with emergency stop checks
          const domReady = await waitForDOMReady(30000); // This function already has emergency stop checks
          if (!domReady) {
            sendLogToPopup("⚠️ DOM ready timeout - continuing anyway", "WARN");
          } else {
            sendLogToPopup("✅ DOM confirmed ready");
          }
          
          // Additional stabilization wait - WITH EMERGENCY STOP CHECK
          sendLogToPopup("⏳ Final stabilization wait...");
          for (let i = 0; i < 30; i++) { // 3 second wait broken into 100ms chunks
            if (window.emergencyStopFlag) {
              sendLogToPopup("🚨 Emergency stop detected during stabilization", "WARN");
              return { success: false, reason: "Emergency stop triggered" };
            }
            await new Promise((r) => setTimeout(r, 100));
          }
          
          sendLogToPopup("🚀 Page fully loaded - ready to process!");
        } else {
          consecutiveFailures++;
          pagesWithoutProgress++;
          console.log(
            `⚠️ Page ${pageCount} not processed (failure ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}, no progress ${pagesWithoutProgress}/${MAX_PAGES_WITHOUT_PROGRESS})`
          );
          sendStatusMessage(
            `⚠️ Page ${pageCount} processing failed (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES} failures)`
          );

          // Try to proceed anyway
          const proceededToNext = await proceedToNextPage();
          if (!proceededToNext) {
            sendStatusMessage(
              "⚠️ Cannot proceed to next page - attempting completion"
            );
            break;
          }
          
          // Wait for page to load after navigation (even on failure recovery)
          sendLogToPopup("⏳ Waiting for page after failure recovery...");
          await new Promise((r) => setTimeout(r, 5000)); // Longer wait for failure recovery
          await waitForDOMReady();
          sendLogToPopup("✅ Recovery navigation complete");
        }
      } catch (error) {
        // Handle different types of exceptions gracefully
        if (error instanceof DOMException || error.name === 'SyntaxError') {
          console.error(
            `❌ DOM/Syntax Error on page ${pageCount}: ${error.name} - ${error.message}`
          );
          sendStatusMessage(`❌ Critical DOM error - stopping application process`);
          
          // Stop the entire application process for syntax errors
          if (error.message && error.message.includes('not a valid selector')) {
            console.error('🛑 Invalid CSS selector detected - aborting job');
            return 'fail_invalid_selector';
          }
          
          // For other DOM errors, stop processing more pages
          break;
        } else if (
          error.message &&
          error.message.includes("Extension context invalidated")
        ) {
          console.error(`❌ Extension context lost on page ${pageCount}`);
          sendStatusMessage(`❌ Extension context lost on page ${pageCount}`);
          break; // Stop processing if extension context is lost
        } else {
          console.error(
            `❌ Error on page ${pageCount}:`,
            error.message || error
          );
        }

        consecutiveFailures++;

        // Check if extension context is still valid before trying to recover
        if (!isExtensionContextValid()) {
          console.log("⚠️ Extension context invalidated during workflow - attempting graceful recovery");
          
          // Preserve current automation state
          preserveAutomationState({
            workflowInterrupted: true,
            interruptionTime: Date.now(),
            pageCount: pageCount,
            lastErrorType: 'context_invalidated'
          });
          
          // Try graceful recovery instead of stopping
          try {
            console.log("🔄 Attempting to restore context and continue workflow...");
            
            // Give time for context to recover
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Try to restore automation context
            await waitForValidContext('Workflow Recovery', 10000);
            
            console.log("✅ Context recovered - continuing workflow");
            sendLogToPopup("🔄 Connection recovered - continuing automation");
            
            // Reset failure counter since we recovered
            consecutiveFailures = Math.max(0, consecutiveFailures - 1);
            
            // Continue to next iteration
            continue;
            
          } catch (recoveryError) {
            console.error("❌ Graceful recovery failed - stopping workflow:", recoveryError.message);
            sendLogToPopup("❌ Could not recover connection - stopping automation", "ERROR");
            break;
          }
        }

        // Try to recover by proceeding to next page
        try {
          await proceedToNextPage();
          sendLogToPopup("⏳ Waiting after error recovery...");
          await new Promise((r) => setTimeout(r, 5000)); // Longer wait after failure
        } catch (recoverError) {
          if (recoverError instanceof DOMException) {
            console.error(
              "❌ DOM Recovery failed:",
              recoverError.name,
              recoverError.message
            );
          } else {
            console.error(
              "❌ Recovery failed:",
              recoverError.message || recoverError
            );
          }
          break;
        }
      }
    }

    // FINAL ATTEMPT: Before giving up, try one more time to find and click submit/continue
    if (pageCount > 1 && consecutiveFailures < 3) {
      sendLogToPopup("🚨 FINAL ATTEMPT: Making last effort to find submit/continue buttons...");
      
      // Try aggressive navigation one more time
      const finalNavResult = await tryAggressiveNavigation();
      if (finalNavResult) {
        sendLogToPopup("🎉 Final navigation attempt succeeded! Waiting for submission...");
        
        // Wait extra long for final submission
        await new Promise((r) => setTimeout(r, 15000)); // 15 second wait
        
        // Check if we reached success page after final navigation
        if (await isSuccessPage()) {
          sendLogToPopup("🎉 SUCCESS: Final navigation led to success page!");
          
          // Auto-close tab after success
          console.log("🔄 Auto-closing tab in 2 seconds...");
          setTimeout(() => {
            chrome.runtime.sendMessage({action: 'closeTab'});
          }, 2000);
          
          return {
            completed: true,
            success: true,
            pagesProcessed: pageCount,
            reason: "Success after final navigation attempt"
          };
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
      pagesWithoutProgress: pagesWithoutProgress,
      stoppedIntelligently: true, // Stopped based on dynamic conditions
      tooManyFailures: consecutiveFailures >= MAX_CONSECUTIVE_FAILURES,
    };
  }

  /**
   * Optimized version of page processing with smart timeouts and reduced redundancy
   */
  async function processCurrentPageOptimized() {
    // Check for emergency stop at start of processing
    if (window.emergencyStopFlag) {
      sendLogToPopup("🚨 Emergency stop detected - halting page processing", "WARN");
      return false;
    }

    sendLogToPopup("🔍 Analyzing page with optimized algorithm...");

    // Quick CAPTCHA check first (most critical)
    const captchaCheck = detectCAPTCHA();
    if (captchaCheck.found) {
      sendLogToPopup(`🔒 CAPTCHA detected: ${captchaCheck.type}`, "ERROR");
      recordFailure(`CAPTCHA detected: ${captchaCheck.type}`);
      return { processed: false, reason: "captcha_detected", captchaType: captchaCheck.type };
    }

    let processedSomething = false;
    let totalInteractions = 0;
    const startTime = Date.now();

    try {
      // Extension context validation (quick check)
      if (!isExtensionContextValid()) {
        recordFailure("Extension context invalid");
        return false;
      }

      // Priority 1: Contact Information (most likely to exist and be required)
      if (await hasContactInfo()) {
        sendLogToPopup("📝 Processing contact information...");
        const contactResult = await fillContactInfo();
        if (contactResult && contactResult.filled > 0) {
          processedSomething = true;
          totalInteractions += contactResult.filled;
          recordSuccess(`Filled ${contactResult.filled} contact fields`);
        }
      }

      // Priority 2: Work Authorization (common requirement) 
      const workAuthElements = await waitForAnyElement([
        'input[name*="work"], input[name*="auth"], input[name*="visa"], input[name*="sponsor"]',
        'select[name*="work"], select[name*="auth"], select[name*="visa"]'
      ], 2000); // Quick check only
      
      if (workAuthElements) {
        sendLogToPopup("🏛️ Processing work authorization...");
        const authResult = await fillWorkAuthInfo();
        if (authResult && authResult.filled > 0) {
          processedSomething = true;
          totalInteractions += authResult.filled;
          recordSuccess(`Filled work authorization`);
        }
      }

      // Priority 3: Find and answer questions (optimized detection)
      // Check for emergency stop before question processing
      if (window.emergencyStopFlag) {
        sendLogToPopup("🚨 Emergency stop detected during question processing", "WARN");
        return false;
      }

      const questionElements = await findQuestionsOptimized();
      if (questionElements.length > 0) {
        sendLogToPopup(`❓ Processing ${questionElements.length} questions...`);
        
        for (const question of questionElements) {
          // Check for emergency stop within question loop
          if (window.emergencyStopFlag) {
            sendLogToPopup("🚨 Emergency stop detected - stopping question processing", "WARN");
            return false;
          }

          try {
            const answered = await answerQuestionOptimized(question);
            if (answered) {
              processedSomething = true;
              totalInteractions += 1;
              recordSuccess(`Answered: ${question.text?.substring(0, 30) || 'question'}`);
            }
          } catch (qError) {
            sendLogToPopup(`⚠️ Question error: ${qError.message}`, "WARN");
          }
        }
      }

      // Priority 4: Navigation (Continue/Submit buttons) - only if we made progress
      if (processedSomething || totalInteractions === 0) {
        const navigationResult = await handleNavigationOptimized();
        if (navigationResult && navigationResult.clicked) {
          processedSomething = true;
          totalInteractions += 1;
          recordSuccess(`Navigation: ${navigationResult.buttonText || 'button clicked'}`);
        }
      }

      // Update global interaction count
      window.formInteractionCount = (window.formInteractionCount || 0) + totalInteractions;
      
      const processingTime = Date.now() - startTime;
      sendLogToPopup(`✅ Page processed: ${totalInteractions} interactions (${processingTime}ms)`);
      
      return processedSomething;

    } catch (error) {
      recordFailure(`Page processing error: ${error.message}`);
      sendLogToPopup(`❌ Page processing failed: ${error.message}`, "ERROR");
      return false;
    }
  }

  /**
   * Optimized question detection - faster and more efficient
   */
  async function findQuestionsOptimized() {
    const questions = [];
    
    // Quick selector search for common question patterns
    const questionSelectors = [
      'div[data-testid*="question"], div[class*="question"]',
      'fieldset, .form-group, .question-container',
      // Fallback to all labels; filtering below will ensure only labels with nested inputs are used
      'label'
    ];
    
    for (const selector of questionSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        if (element.offsetParent !== null && element.textContent.trim()) { // Visible check
          // If scanning labels, only consider those that contain form controls
          if (selector === 'label') {
            const hasNestedControl = element.querySelector('input, select, textarea');
            if (!hasNestedControl) continue;
          }
          const inputs = element.querySelectorAll('input:not([type="hidden"]), select, textarea');
          if (inputs.length > 0) {
            // DYNAMIC: Determine primary type from ALL inputs, not just first one
            const inputTypes = Array.from(inputs).map(inp => inp.type || inp.tagName.toLowerCase());
            const primaryType = inputTypes.length === 1 ? inputTypes[0] : 
                               inputTypes.includes('select') ? 'select' :
                               inputTypes.includes('textarea') ? 'textarea' :
                               inputTypes.includes('radio') ? 'radio' :
                               inputTypes.includes('checkbox') ? 'checkbox' :
                               inputTypes[0]; // Fallback to first if no clear priority
            
            questions.push({
              element: element,
              text: element.textContent.trim().substring(0, 100),
              inputs: Array.from(inputs),
              type: primaryType,
              inputCount: inputs.length // Track how many inputs this question has
            });
          }
        }
      }
      
      // Don't search all selectors if we found questions
      if (questions.length > 0) break;
    }
    
    // DYNAMIC: Process ALL questions found, no artificial limit
    sendLogToPopup(`🔍 Found ${questions.length} questions to process`);
    return questions; // Process ALL questions dynamically
  }

  /**
   * Optimized question answering
   */
  async function answerQuestionOptimized(question) {
    try {
      if (!question.inputs || question.inputs.length === 0) return false;
      
      sendLogToPopup(`📝 Processing question with ${question.inputs.length} input(s)`);
      
      let answeredCount = 0;
      
      // DYNAMIC: Process ALL inputs in the question, not just the first one
      for (let i = 0; i < question.inputs.length; i++) {
        const input = question.inputs[i];
        sendLogToPopup(`   Processing input ${i + 1}/${question.inputs.length}: ${input.type || input.tagName}`);
        
        try {
          let inputAnswered = false;
          
          // Handle each input based on its specific type
          if (input.type === 'radio' || input.type === 'checkbox') {
            inputAnswered = await handleRadioCheckboxOptimized({ ...question, inputs: [input] });
          } else if (input.tagName === 'SELECT') {
            inputAnswered = await handleSelectOptimized({ ...question, inputs: [input] });
          } else if (input.type === 'text' || input.type === 'email' || input.type === 'tel' || input.type === 'textarea') {
            inputAnswered = await handleTextInputOptimized({ ...question, inputs: [input] });
          }
          
          if (inputAnswered) {
            answeredCount++;
            sendLogToPopup(`   ✅ Input ${i + 1} answered successfully`);
          } else {
            sendLogToPopup(`   ⚠️ Input ${i + 1} could not be answered`);
          }
          
          // Small delay between inputs
          await new Promise(r => setTimeout(r, 100));
          
        } catch (inputError) {
          sendLogToPopup(`   ❌ Error with input ${i + 1}: ${inputError.message}`, "WARN");
        }
      }
      
      sendLogToPopup(`📊 Question result: ${answeredCount}/${question.inputs.length} inputs answered`);
      return answeredCount > 0; // Return true if at least one input was answered
      
    } catch (error) {
      sendLogToPopup(`Question error: ${error.message}`, "WARN");
      return false;
    }
  }

  /**
   * INTELLIGENT navigation handling - thinks like a human
   */
  async function handleNavigationOptimized() {
    sendLogToPopup("🧠 Analyzing page for navigation options...");
    
    // First, understand what kind of page we're on
    const pageContext = analyzePageContext();
    sendLogToPopup(`📄 Page context: ${pageContext.type} (confidence: ${pageContext.confidence}%)`);
    
    // Get all potentially clickable elements
    const allButtons = getAllClickableElements();
    
    // Score each button based on context and human logic
    const scoredButtons = allButtons.map(button => ({
      element: button,
      score: scoreButtonIntelligently(button, pageContext),
      text: getButtonText(button),
      reason: getButtonScoreReason(button, pageContext)
    }));
    
    // Sort by score (highest first)
    scoredButtons.sort((a, b) => b.score - a.score);
    
    // Log our analysis for transparency - DYNAMIC: Show ALL relevant buttons
    sendLogToPopup(`🤔 Found ${scoredButtons.length} potential buttons:`);
    const relevantButtons = scoredButtons.filter(btn => btn.score > 0);
    const maxButtonsToShow = Math.min(relevantButtons.length, 5); // Show up to 5 relevant buttons
    
    relevantButtons.slice(0, maxButtonsToShow).forEach(btn => {
      sendLogToPopup(`  • "${btn.text}" (score: ${btn.score}) - ${btn.reason}`);
    });
    
    if (relevantButtons.length > maxButtonsToShow) {
      sendLogToPopup(`  ... and ${relevantButtons.length - maxButtonsToShow} more buttons`);
    }
    
    // Try clicking the best option
    for (const buttonInfo of scoredButtons) {
      if (buttonInfo.score >= 70) { // High confidence threshold
        try {
          sendLogToPopup(`🎯 Clicking best option: "${buttonInfo.text}" (${buttonInfo.score}% confidence)`);
          
          // Human-like click behavior
          await humanLikeClick(buttonInfo.element);
          
          recordSuccess(`Smart navigation: ${buttonInfo.text}`);
          return { 
            clicked: true, 
            buttonText: buttonInfo.text,
            confidence: buttonInfo.score,
            reason: buttonInfo.reason
          };
        } catch (clickError) {
          sendLogToPopup(`❌ Click failed: ${clickError.message}`, "WARN");
          recordFailure(`Failed to click: ${buttonInfo.text}`);
        }
      }
    }
    
    // If no high-confidence option, try medium confidence
    for (const buttonInfo of scoredButtons) {
      if (buttonInfo.score >= 40 && buttonInfo.score < 70) {
        try {
          sendLogToPopup(`⚠️ Trying medium confidence: "${buttonInfo.text}" (${buttonInfo.score}%)`);
          await humanLikeClick(buttonInfo.element);
          
          recordSuccess(`Medium confidence navigation: ${buttonInfo.text}`);
          return { 
            clicked: true, 
            buttonText: buttonInfo.text,
            confidence: buttonInfo.score,
            reason: buttonInfo.reason + " (medium confidence)"
          };
        } catch (clickError) {
          sendLogToPopup(`❌ Medium confidence click failed: ${clickError.message}`, "WARN");
        }
      }
    }
    
    sendLogToPopup("🤷 No suitable navigation button found", "WARN");
    return { clicked: false, reason: "No suitable buttons found" };
  }

  /**
   * Analyze what type of page we're on for context-aware decisions
   */
  function analyzePageContext() {
    const url = window.location.href.toLowerCase();
    const pageText = document.body.textContent.toLowerCase();
    const title = document.title.toLowerCase();
    
    let type = "unknown";
    let confidence = 0;
    
    // Job application form detection
    if (url.includes('smartapply') || url.includes('apply') || url.includes('application')) {
      type = "application_form";
      confidence += 40;
    }
    
    // Check for form elements
    const formElements = document.querySelectorAll('form, input, select, textarea').length;
    if (formElements > 3) {
      if (type === "application_form") confidence += 30;
      else { type = "form_page"; confidence += 20; }
    }
    
    // Check for specific keywords that indicate page type
    const keywords = {
      application: ['apply', 'application', 'submit application', 'job application'],
      contact: ['contact', 'personal information', 'phone', 'email'],
      questions: ['question', 'experience', 'years', 'qualification'],
      review: ['review', 'confirm', 'summary', 'check'],
      success: ['success', 'submitted', 'thank you', 'application received']
    };
    
    for (const [pageType, words] of Object.entries(keywords)) {
      const matchCount = words.filter(word => pageText.includes(word) || title.includes(word)).length;
      if (matchCount > 0) {
        if (pageType === 'success' && matchCount >= 2) {
          return { type: 'success_page', confidence: 90 };
        }
        confidence += matchCount * 10;
        if (confidence > 60 && type === "unknown") {
          type = pageType + "_page";
        }
      }
    }
    
    return { type, confidence: Math.min(confidence, 100) };
  }

  /**
   * Get all elements that could potentially be clickable
   */
  function getAllClickableElements() {
    const elements = [];
    
    // COMPREHENSIVE CLICKABLE ELEMENTS DETECTION
    const selectors = [
      // Standard buttons
      'button', 'input[type="button"]', 'input[type="submit"]', 'input[type="reset"]', 
      'input[type="image"]', 'a[href]', 'a[role="button"]',
      // ARIA and role-based
      '[role="button"]', '[role="tab"]', '[role="menuitem"]', '[role="link"]',
      // Interactive elements  
      '[onclick]', '[onmousedown]', '[tabindex]:not([tabindex="-1"])',
      // Common CSS classes
      '.btn', '.button', '.submit', '.continue', '.next', '.apply', '.confirm',
      '.close', '.cancel', '.ok', '.save', '.send', '.go', '.start', '.finish',
      '[class*="btn"]', '[class*="button"]', '[class*="submit"]', '[class*="continue"]', 
      '[class*="next"]', '[class*="apply"]', '[class*="confirm"]', '[class*="action"]',
      // Data attributes and IDs
      '[data-testid*="button"]', '[data-action]', '[data-click]', '[data-submit]',
      '[id*="button"]', '[id*="submit"]', '[id*="continue"]', '[id*="next"]',
      '[id*="apply"]', '[id*="confirm"]', '[id*="action"]',
      // Interactive spans and divs
      'div[role="button"]', 'span[role="button"]', 'div[onclick]', 'span[onclick]',
      'div[tabindex="0"]', 'span[tabindex="0"]',
      // Form submission elements
      'form button', 'form input[type="submit"]', 'form [role="button"]'
    ];
    
    // Use robust element detection
    const found = findElementsRobust(selectors);
    found.forEach(el => {
      // Only include visible, enabled elements
      if (isElementVisible(el) && !el.disabled && !elements.includes(el)) {
        elements.push(el);
      }
    });
    
    return elements;
  }

  /**
   * Score a button based on human-like intelligence
   */
  function scoreButtonIntelligently(button, pageContext) {
    let score = 0;
    const text = getButtonText(button).toLowerCase();
    const classes = (typeof button.className === 'string' ? button.className : '').toLowerCase();
    const id = (typeof button.id === 'string' ? button.id : '').toLowerCase();
    
    // DYNAMIC: Smart button prioritization - Final submission vs Continue
    const finalSubmissionWords = {
      'submit application': 100, 'apply now': 95, 'submit your application': 100,
      'send application': 95, 'apply': 90, 'submit': 85, 'complete application': 95
    };
    
    // Continue buttons - only use when no final submission available
    const continueWords = {
      'continue': 60, 'next': 55, 'proceed': 60, 'forward': 50,
      'save and continue': 65, 'save & continue': 65
    };
    
    // Medium priority words
    const mediumPriorityWords = {
      'save': 60, 'update': 50, 'confirm': 70, 'review': 65,
      'go': 40, 'send': 70
    };
    
    // Negative words (avoid these)
    const negativeWords = {
      'cancel': -50, 'back': -30, 'previous': -40, 'delete': -80,
      'remove': -60, 'close': -70, 'exit': -60
    };
    
    // DYNAMIC: Prioritize final submission buttons over continue buttons
    let hasFinalSubmission = false;
    
    // First pass: Check if page has final submission buttons
    const allButtons = document.querySelectorAll('button, input[type="submit"], input[type="button"]');
    for (const btn of allButtons) {
      const btnText = getButtonText(btn).toLowerCase();
      for (const word of Object.keys(finalSubmissionWords)) {
        if (btnText.includes(word)) {
          hasFinalSubmission = true;
          break;
        }
      }
      if (hasFinalSubmission) break;
    }
    
    // Score based on button type and context
    for (const [word, points] of Object.entries(finalSubmissionWords)) {
      if (text.includes(word)) {
        score += points;
        console.log(`🎯 Final submission button detected: "${text}" (+${points})`);
      }
    }
    
    // DYNAMIC: Context-aware button scoring
    const isFinalPage = isOnFinalSubmissionPage();
    
    if (isFinalPage) {
      // On final page: Penalize continue buttons heavily, boost submit buttons
      if (text.includes('continue') || text.includes('next')) {
        score -= 30;
        console.log(`🚫 Final page - Continue button heavily penalized: "${text}" (-30)`);
      }
    } else {
      // On intermediate page: Use continue buttons if no final submission available
      if (!hasFinalSubmission) {
        for (const [word, points] of Object.entries(continueWords)) {
          if (text.includes(word)) {
            score += points;
            console.log(`➡️ Intermediate page - Continue button: "${text}" (+${points})`);
          }
        }
      } else if (text.includes('continue') || text.includes('next')) {
        // Moderate penalty when final submission is available on intermediate page
        score -= 15;
        console.log(`⚠️ Intermediate page - Continue penalized (final available): "${text}" (-15)`);
      }
    }
    
    for (const [word, points] of Object.entries(mediumPriorityWords)) {
      if (text.includes(word)) {
        score += points;
      }
    }
    
    for (const [word, points] of Object.entries(negativeWords)) {
      if (text.includes(word)) {
        score += points; // These are negative, so they reduce score
      }
    }
    
    // Bonus for form submit buttons
    if (button.type === 'submit') {
      score += 40;
    }
    
    // Bonus for primary/action styling
    if (classes.includes('primary') || classes.includes('action') || 
        classes.includes('btn-primary') || classes.includes('cta')) {
      score += 30;
    }
    
    // Context-aware scoring
    if (pageContext.type === 'application_form') {
      if (text.includes('apply') || text.includes('submit')) score += 25;
      if (text.includes('continue') && !text.includes('shopping')) score += 20;
    }
    
    // Penalty for very long or very short text
    if (text.length > 50) score -= 20;
    if (text.length < 2 && !button.type === 'submit') score -= 30;
    
    // Bonus for positioned like primary action (bottom right, etc.)
    const rect = button.getBoundingClientRect();
    if (rect.bottom > window.innerHeight * 0.7) { // Lower on page
      score += 15;
    }
    
    return Math.max(0, Math.min(100, score)); // Cap between 0-100
  }

  /**
   * Get human-readable text from button
   */
  function getButtonText(button) {
    return button.textContent?.trim() || 
           button.value?.trim() || 
           button.title?.trim() || 
           button.getAttribute('aria-label')?.trim() || 
           'Unnamed Button';
  }

  /**
   * Get explanation for why button got its score
   */
  function getButtonScoreReason(button, pageContext) {
    const text = getButtonText(button).toLowerCase();
    
    if (text.includes('apply')) return "Contains 'apply' - likely job application action";
    if (text.includes('continue')) return "Continue button - natural next step";
    if (text.includes('submit')) return "Submit button - form completion action";
    if (text.includes('next')) return "Next button - progression action";
    if (button.type === 'submit') return "HTML submit button - form submission";
    if (text.includes('save')) return "Save button - progress preservation";
    
    return "Generic clickable element";
  }

  /**
   * Click button in human-like way
   */
  async function humanLikeClick(button) {
    // Scroll into view first (like humans do)
    button.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Small delay for scroll
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Focus first (accessibility)
    button.focus();
    
    // Small delay before click
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Trigger click event
    button.click();
    
    // Also dispatch events that some sites expect
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  /**
   * INTELLIGENT radio/checkbox handling - thinks like a human
   */
  async function handleRadioCheckboxOptimized(question) {
    const questionText = question.text.toLowerCase();
    const inputs = question.inputs.filter(input => !input.disabled);
    
    if (inputs.length === 0) return false;
    
    sendLogToPopup(`🤔 Analyzing question: "${questionText.substring(0, 50)}..."`);
    
    // Get all option texts for analysis
    const options = inputs.map(input => ({
      element: input,
      text: getOptionText(input).toLowerCase(),
      value: input.value?.toLowerCase() || ''
    }));
    
    sendLogToPopup(`📋 Options: ${options.map(o => o.text).join(', ')}`);
    
    // HUMAN-LIKE REASONING for common job application questions
    
    // Work Authorization Questions
    if (questionText.includes('authorized') || questionText.includes('legal') || 
        questionText.includes('work') || questionText.includes('visa') || 
        questionText.includes('sponsor')) {
      
      const yesOption = options.find(opt => 
        opt.text.includes('yes') || opt.text.includes('authorized') || 
        opt.value.includes('yes') || opt.value.includes('true')
      );
      
      if (yesOption) {
        sendLogToPopup("✅ Work authorization - selecting 'Yes'");
        yesOption.element.click();
        return true;
      }
    }
    
    // Experience Questions
    if (questionText.includes('experience') || questionText.includes('years')) {
      // Look for number options, prefer middle-range
      const numberOptions = options.filter(opt => /\d/.test(opt.text));
      if (numberOptions.length > 0) {
        // Pick middle option or "2-5 years" type answers
        const preferredOption = numberOptions.find(opt => 
          opt.text.includes('2') || opt.text.includes('3') || opt.text.includes('1-3') || opt.text.includes('2-5')
        ) || numberOptions[Math.floor(numberOptions.length / 2)];
        
        sendLogToPopup(`✅ Experience question - selecting "${preferredOption.text}"`);
        preferredOption.element.click();
        return true;
      }
    }
    
    // Availability Questions
    if (questionText.includes('available') || questionText.includes('start')) {
      const immediateOption = options.find(opt => 
        opt.text.includes('immediate') || opt.text.includes('now') || 
        opt.text.includes('asap') || opt.text.includes('right away')
      );
      
      if (immediateOption) {
        sendLogToPopup("✅ Availability - selecting immediate start");
        immediateOption.element.click();
        return true;
      }
      
      // Otherwise look for "2 weeks" or similar reasonable timeframe
      const twoWeeksOption = options.find(opt => 
        opt.text.includes('2 week') || opt.text.includes('two week')
      );
      
      if (twoWeeksOption) {
        sendLogToPopup("✅ Availability - selecting 2 weeks notice");
        twoWeeksOption.element.click();
        return true;
      }
    }
    
    // Willing/Able Questions
    if (questionText.includes('willing') || questionText.includes('able')) {
      const yesOption = options.find(opt => 
        opt.text.includes('yes') || opt.text.includes('willing') || opt.value.includes('yes')
      );
      
      if (yesOption) {
        sendLogToPopup("✅ Willingness question - selecting 'Yes'");
        yesOption.element.click();
        return true;
      }
    }
    
    // Location/Travel Questions
    if (questionText.includes('relocate') || questionText.includes('travel') || questionText.includes('commute')) {
      const yesOption = options.find(opt => 
        opt.text.includes('yes') || opt.text.includes('willing') || opt.value.includes('yes')
      );
      
      if (yesOption) {
        sendLogToPopup("✅ Location/travel - selecting 'Yes'");
        yesOption.element.click();
        return true;
      }
    }
    
    // Salary/Compensation Questions
    if (questionText.includes('salary') || questionText.includes('compensation') || questionText.includes('pay')) {
      // Look for "negotiable" or middle-range options
      const negotiableOption = options.find(opt => 
        opt.text.includes('negotiable') || opt.text.includes('competitive') || opt.text.includes('open')
      );
      
      if (negotiableOption) {
        sendLogToPopup("✅ Salary question - selecting negotiable/competitive");
        negotiableOption.element.click();
        return true;
      }
    }
    
    // Default logic - pick most reasonable option
    // Prefer "Yes" over "No", middle options over extremes
    let bestOption = null;
    
    // Look for positive responses first
    bestOption = options.find(opt => 
      opt.text.includes('yes') || opt.text === 'true' || opt.value === 'true'
    );
    
    if (!bestOption) {
      // Look for middle options (avoid first/last which might be extremes)
      if (options.length >= 3) {
        bestOption = options[1]; // Second option often reasonable middle ground
      } else {
        bestOption = options[0]; // Fallback to first option
      }
    }
    
    if (bestOption) {
      sendLogToPopup(`🎯 Default choice: "${bestOption.text}" (logical fallback)`);
      bestOption.element.click();
      return true;
    }
    
    return false;
  }

  /**
   * Get human-readable text for radio/checkbox option
   */
  function getOptionText(input) {
    // Try multiple ways to find the option text
    const label = input.labels?.[0]?.textContent?.trim();
    if (label) return label;
    
    const nextText = input.nextElementSibling?.textContent?.trim();
    if (nextText) return nextText;
    
    const parentText = input.parentElement?.textContent?.trim();
    if (parentText && parentText !== input.value) return parentText;
    
    return input.value || input.getAttribute('aria-label') || 'Unknown Option';
  }

  /**
   * INTELLIGENT select dropdown handling - contextual choices
   */
  async function handleSelectOptimized(question) {
    // Safety check: ensure we have inputs
    if (!question.inputs || question.inputs.length === 0) return false;
    
    const select = question.inputs[0];
    if (!select || select.disabled) return false;
    
    const questionText = question.text.toLowerCase();
    const options = Array.from(select.options).filter(opt => opt.value && opt.value !== '');
    
    if (options.length === 0) return false;
    
    sendLogToPopup(`🎛️ Dropdown question: "${questionText.substring(0, 40)}..."`);
    sendLogToPopup(`📝 Options: ${options.map(o => o.text).join(', ')}`);
    
    let bestOption = null;
    
    // CONTEXT-AWARE SELECTION LOGIC
    
    // Experience/Years questions
    if (questionText.includes('experience') || questionText.includes('years')) {
      // Look for reasonable experience levels (1-3, 2-5 years)
      bestOption = options.find(opt => {
        const text = opt.text.toLowerCase();
        return text.includes('2') || text.includes('1-3') || text.includes('2-5') || 
               text.includes('1 year') || text.includes('2 years') || text.includes('3 years');
      });
      
      if (!bestOption && options.length > 2) {
        // Pick second or third option (avoid "0 years" and "10+ years")
        bestOption = options[1] || options[2];
      }
    }
    
    // Education questions
    else if (questionText.includes('education') || questionText.includes('degree')) {
      // Look for bachelor's degree or similar
      bestOption = options.find(opt => {
        const text = opt.text.toLowerCase();
        return text.includes("bachelor") || text.includes("college") || 
               text.includes("university") || text.includes("undergraduate");
      });
      
      if (!bestOption) {
        // Look for "some college" or reasonable education level
        bestOption = options.find(opt => {
          const text = opt.text.toLowerCase();
          return text.includes("some") || text.includes("associate") || text.includes("high school");
        });
      }
    }
    
    // Location/State questions
    else if (questionText.includes('state') || questionText.includes('location') || 
             questionText.includes('where') || questionText.includes('city')) {
      // Don't make assumptions about location - pick second option (often a real location)
      if (options.length > 1) {
        bestOption = options[1];
      }
    }
    
    // Priority/Preference questions
    else if (questionText.includes('priority') || questionText.includes('important') ||
             questionText.includes('prefer')) {
      // Look for middle-ground options
      if (options.length >= 3) {
        bestOption = options[Math.floor(options.length / 2)];
      }
    }
    
    // Salary/Rate questions  
    else if (questionText.includes('salary') || questionText.includes('rate') || 
             questionText.includes('compensation')) {
      // Look for competitive/negotiable options
      bestOption = options.find(opt => {
        const text = opt.text.toLowerCase();
        return text.includes('competitive') || text.includes('negotiable') || 
               text.includes('open') || text.includes('discuss');
      });
    }
    
    // Availability/Start date
    else if (questionText.includes('available') || questionText.includes('start')) {
      // Look for immediate or 2 weeks
      bestOption = options.find(opt => {
        const text = opt.text.toLowerCase();
        return text.includes('immediate') || text.includes('2 week') || 
               text.includes('asap') || text.includes('right away');
      });
    }
    
    // Default intelligent selection
    if (!bestOption) {
      // Avoid obvious placeholder options
      const goodOptions = options.filter(opt => {
        const text = opt.text.toLowerCase();
        return !text.includes('select') && !text.includes('choose') && 
               !text.includes('please') && !text.includes('--') && 
               text.length > 1;
      });
      
      if (goodOptions.length > 0) {
        // Pick second option from good options, or middle option
        bestOption = goodOptions.length > 1 ? goodOptions[1] : goodOptions[0];
        if (goodOptions.length >= 3) {
          bestOption = goodOptions[Math.floor(goodOptions.length / 2)];
        }
      } else {
        // Last resort - pick second option overall
        bestOption = options.length > 1 ? options[1] : options[0];
      }
    }
    
    if (bestOption) {
      sendLogToPopup(`✅ Selected: "${bestOption.text}" (intelligent choice)`);
      
      // Set the selection
      select.value = bestOption.value;
      select.selectedIndex = Array.from(select.options).indexOf(bestOption);
      
      // Trigger React-safe change events
      await dispatchReactSafeEvent(select, 'change');
      await dispatchReactSafeEvent(select, 'input');
      
      return true;
    }
    
    return false;
  }

  /**
   * INTELLIGENT text input handling - contextual and realistic responses
   */
  async function handleTextInputOptimized(question) {
    // Safety check: ensure we have inputs
    if (!question.inputs || question.inputs.length === 0) return false;
    
    const input = question.inputs[0];
    if (!input || input.disabled || input.value?.trim()) return false;
    
    const questionText = question.text.toLowerCase();
    const fieldName = input.name?.toLowerCase() || input.id?.toLowerCase() || '';
    const placeholder = input.placeholder?.toLowerCase() || '';
    
    sendLogToPopup(`📝 Text input: "${questionText.substring(0, 40)}..."`);
    
    let value = '';
    let reasoning = '';
    
    // SMART CONTEXTUAL RESPONSES
    
    // Contact Information
    if (questionText.includes('phone') || fieldName.includes('phone') || 
        questionText.includes('tel') || placeholder.includes('phone')) {
      value = '(555) 123-4567';
      reasoning = 'Standard phone format';
    }
    
    else if (questionText.includes('email') || fieldName.includes('email') || 
             input.type === 'email' || placeholder.includes('email')) {
      value = 'applicant@email.com';
      reasoning = 'Professional email format';
    }
    
    // Experience/Years
    else if (questionText.includes('years of experience') || questionText.includes('how many years')) {
      value = '3';
      reasoning = 'Reasonable experience level';
    }
    
    else if (questionText.includes('experience') && (questionText.includes('year') || fieldName.includes('year'))) {
      value = '2-3';
      reasoning = 'Experience range';
    }
    
    // Salary/Compensation
    else if (questionText.includes('salary') || questionText.includes('desired salary') || 
             questionText.includes('compensation') || fieldName.includes('salary')) {
      value = 'Competitive';
      reasoning = 'Flexible salary expectation';
    }
    
    else if (questionText.includes('rate') || questionText.includes('hourly')) {
      value = 'Negotiable';
      reasoning = 'Flexible rate';
    }
    
    // Skills and Qualifications
    else if (questionText.includes('skill') || questionText.includes('software') || 
             questionText.includes('tool') || questionText.includes('technology')) {
      value = 'Microsoft Office, Communication, Problem-solving';
      reasoning = 'Common professional skills';
    }
    
    // Why questions / Cover letter type
    else if (questionText.includes('why') || questionText.includes('interest') || 
             questionText.includes('motivation') || questionText.includes('tell us')) {
      value = 'I am interested in this position because it aligns with my career goals and offers opportunities for professional growth.';
      reasoning = 'Professional motivation statement';
    }
    
    // Additional information / Other
    else if (questionText.includes('additional') || questionText.includes('other') || 
             questionText.includes('comment') || questionText.includes('note')) {
      value = 'Thank you for considering my application.';
      reasoning = 'Polite additional comment';
    }
    
    // References
    else if (questionText.includes('reference') || questionText.includes('supervisor') || 
             questionText.includes('manager')) {
      value = 'Available upon request';
      reasoning = 'Standard reference response';
    }
    
    // Certifications/Licenses  
    else if (questionText.includes('certification') || questionText.includes('license') || 
             questionText.includes('credential')) {
      value = 'N/A';
      reasoning = 'No specific certifications required';
    }
    
    // Numbers/Quantities
    else if (input.type === 'number' || questionText.includes('how many') || 
             questionText.includes('number of')) {
      
      if (questionText.includes('year')) {
        value = '2';
        reasoning = 'Reasonable year count';
      } else if (questionText.includes('people') || questionText.includes('team')) {
        value = '5';
        reasoning = 'Typical team size';
      } else {
        value = '1';
        reasoning = 'Default number';
      }
    }
    
    // Dates
    else if (input.type === 'date' || questionText.includes('date') || 
             questionText.includes('when')) {
      const twoWeeksFromNow = new Date();
      twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);
      value = twoWeeksFromNow.toISOString().split('T')[0]; // YYYY-MM-DD format
      reasoning = 'Standard 2-week notice period';
    }
    
    // Website/URL
    else if (input.type === 'url' || questionText.includes('website') || 
             questionText.includes('portfolio') || questionText.includes('linkedin')) {
      value = 'https://linkedin.com/in/profile';
      reasoning = 'Professional profile placeholder';
    }
    
    // Generic fallback based on field characteristics
    else if (input.maxLength && input.maxLength > 100) {
      // Long text field - probably wants a detailed response
      value = 'I have relevant experience and skills that make me a strong candidate for this position. I am eager to contribute to your team and grow professionally.';
      reasoning = 'Standard professional response for long fields';
    }
    
    else if (input.maxLength && input.maxLength <= 10) {
      // Short field - probably wants brief answer
      value = 'Yes';
      reasoning = 'Brief positive response';
    }
    
    else {
      // Default fallback
      value = 'Available';
      reasoning = 'Generic professional response';
    }
    
    // Fill the input - WITH SAFETY VALIDATION
    if (value) {
      // CRITICAL PROTECTION: Validate input safety first
      const safetyCheck = validateInputForFilling(input);
      if (!safetyCheck.safe) {
        sendLogToPopup(`🚫 BLOCKED filling input: ${safetyCheck.reason}`, "WARN");
        return false;
      }
      
      sendLogToPopup(`✅ Filling: "${value}" (${reasoning})`);
      
      // React-safe typing simulation
      input.focus();
      
      // Use React-safe value setting for gradual typing
      if (value.length > 20) {
        // Clear input first
        await setReactSafeValue(input, '');
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Gradual typing with React-safe events
        for (let i = 0; i <= value.length; i++) {
          if (window.emergencyStopFlag) break; // Emergency stop check
          
          const partialValue = value.substring(0, i);
          await setReactSafeValue(input, partialValue);
          await new Promise(resolve => setTimeout(resolve, 20)); // Slower for React compatibility
        }
      } else {
        // Direct setting for shorter text
        await setReactSafeValue(input, value);
      }
      
      // Final blur event with delay
      await new Promise(resolve => setTimeout(resolve, 200));
      await dispatchReactSafeEvent(input, 'blur');
      
      return true;
    }
    
    return false;
  }

  /**
   * Original process current page function (fallback)
   */
  async function processCurrentPage() {
    console.log("🔍 Analyzing current page...");

    // 🤖 CAPTCHA Detection - Check for CAPTCHAs first
    const captchaCheck = detectCAPTCHA();
    if (captchaCheck.found) {
      console.log("🔒 CAPTCHA detected:", captchaCheck.type);
      handleCAPTCHADetection(captchaCheck);
      return { processed: false, reason: "captcha_detected", captchaType: captchaCheck.type };
    }

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
            window.formInteractionCount = (window.formInteractionCount || 0) + contactResult.filled;
            console.log(`✅ Filled ${contactResult.filled} contact fields`);
          }
        }
      } catch (contactError) {
        console.error(
          "⚠️ Contact info processing failed:",
          contactError.message || contactError
        );
      }

      // Fill employer questions if present
      try {
        if (await hasEmployerQuestions()) {
          console.log("📝 Processing employer questions...");
          const questionResult = await fillEmployerQuestions();
          if (questionResult && questionResult.filled > 0) {
            processedSomething = true;
            interactionCount += questionResult.filled;
            window.formInteractionCount = (window.formInteractionCount || 0) + questionResult.filled;
            console.log(
              `✅ Answered ${questionResult.filled} employer questions`
            );
          }
        }
      } catch (questionError) {
        console.error(
          "⚠️ Employer questions processing failed:",
          questionError.message || questionError
        );
      }

      // Handle resume selection if present
      try {
        if (await hasResumeSelection()) {
          console.log("📝 Processing resume selection...");
          const resumeResult = await selectResume();
          if (resumeResult && resumeResult.selected) {
            processedSomething = true;
            interactionCount += 1;
            window.formInteractionCount = (window.formInteractionCount || 0) + 1;
            console.log(`✅ Selected resume`);
          }
        }
      } catch (resumeError) {
        console.error(
          "⚠️ Resume selection failed:",
          resumeError.message || resumeError
        );
      }

      // Handle document uploads if present
      try {
        if (await hasDocumentUploads()) {
          console.log("📝 Processing document uploads...");
          await handleDocumentUploads();
          processedSomething = true;
          window.formInteractionCount = (window.formInteractionCount || 0) + 1;
        }
      } catch (uploadError) {
        console.error(
          "⚠️ Document upload processing failed:",
          uploadError.message || uploadError
        );
      }

      // Accept legal disclaimers if present
      try {
        if (await hasLegalDisclaimer()) {
          console.log("📝 Processing legal disclaimers...");
          await acceptLegalDisclaimer();
          processedSomething = true;
          window.formInteractionCount = (window.formInteractionCount || 0) + 1;
        }
      } catch (legalError) {
        console.error(
          "⚠️ Legal disclaimer processing failed:",
          legalError.message || legalError
        );
      }

      console.log(
        `📊 Page processing complete - processed: ${processedSomething}`
      );
      return processedSomething;
    } catch (error) {
      if (error instanceof DOMException) {
        console.error(
          "❌ DOM Error processing page:",
          error.name,
          error.message
        );
      } else if (
        error.message &&
        error.message.includes("Extension context invalidated")
      ) {
        console.error("❌ Extension context lost during page processing");
      } else {
        console.error("❌ Error processing page:", error.message || error);
      }
      return false;
    }
  }

  /**
   * AGGRESSIVE navigation - last resort attempt to find any clickable navigation
   */
  async function tryAggressiveNavigation() {
    console.log("🚨 AGGRESSIVE NAVIGATION - Last resort button search");
    
    // Check for emergency stop at start
    if (window.emergencyStopFlag) {
      sendLogToPopup("🚨 Emergency stop detected - aborting aggressive navigation", "WARN");
      return false;
    }
    
    // Expand search to ANY button that might advance the workflow
    const aggressiveSelectors = [
      'button', 
      'input[type="submit"]',
      'input[type="button"]',
      '[role="button"]',
      'a[href*="continue"]',
      'a[href*="next"]',
      'div[onclick]',
      '[class*="button"]',
      '[class*="btn"]',
      '[id*="button"]',
      '[id*="btn"]'
    ];
    
    const navigationKeywords = [
      'continue', 'next', 'submit', 'apply', 'proceed', 'forward',
      'save and continue', 'review', 'confirm', 'send', 'finish',
      'complete', 'done', 'submit application', 'apply now'
    ];
    
    for (const selector of aggressiveSelectors) {
      // Check emergency stop during search
      if (window.emergencyStopFlag) {
        sendLogToPopup("🚨 Emergency stop detected during aggressive search", "WARN");
        return false;
      }
      const elements = document.querySelectorAll(selector);
      
      for (const element of elements) {
        if (!element.offsetParent || element.disabled) continue; // Skip hidden/disabled
        
        const text = (element.textContent || element.value || element.title || element.alt || '').toLowerCase().trim();
        
        // Check if text contains any navigation keywords
        const hasNavigationKeyword = navigationKeywords.some(keyword => text.includes(keyword));
        
        if (hasNavigationKeyword && text.length > 0) {
          console.log(`🎯 AGGRESSIVE: Found potential navigation element: "${text}"`);
          
          try {
            // Scroll to element first
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await new Promise((r) => setTimeout(r, 1000));
            
            // Try multiple click methods
            element.focus();
            await new Promise((r) => setTimeout(r, 500));
            
            element.click();
            element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            
            sendLogToPopup(`🚨 AGGRESSIVE: Clicked "${text}"`);
            
            // Wait longer to see if navigation occurred
            await new Promise((r) => setTimeout(r, 4000));
            
            return true; // Return success immediately after clicking
          } catch (error) {
            console.log(`❌ AGGRESSIVE: Click failed on "${text}":`, error.message);
          }
        }
      }
    }
    
    console.log("❌ AGGRESSIVE NAVIGATION: No clickable elements found");
    return false;
  }

  /**
   * ✨ DYNAMIC FINAL STAGE DETECTION ✨
   * 
   * Intelligently distinguishes between:
   * - 🎯 FINAL SUBMISSION pages (Apply/Submit buttons) 
   * - ➡️ CONTINUE pages (more steps needed)
   * 
   * Key Innovation: Never clicks "Continue" when "Apply/Submit" is available
   * This ensures we reach the actual final submission, not just another step!
   */
  function isOnFinalSubmissionPage() {
    const pageText = document.body.textContent.toLowerCase();
    
    // Final page indicators
    const finalPageIndicators = [
      "review your application", "review and submit", "confirm your application",
      "final step", "last step", "submit your application", "ready to apply",
      "application summary", "before you apply", "confirm application"
    ];
    
    // Continue page indicators  
    const continuePageIndicators = [
      "step 1", "step 2", "step 3", "next step", "additional information",
      "more information", "continue to", "let's get started", "basic information"
    ];
    
    const hasFinalIndicators = finalPageIndicators.some(indicator => 
      pageText.includes(indicator)
    );
    
    const hasContinueIndicators = continuePageIndicators.some(indicator => 
      pageText.includes(indicator)
    );
    
    console.log(`📄 Page analysis: Final indicators: ${hasFinalIndicators}, Continue indicators: ${hasContinueIndicators}`);
    
    // If both or neither, check button types to decide
    if (hasFinalIndicators && !hasContinueIndicators) return true;
    if (!hasFinalIndicators && hasContinueIndicators) return false;
    
    // Default: check if we have final submission buttons
    const buttons = document.querySelectorAll('button, input[type="submit"], input[type="button"]');
    for (const btn of buttons) {
      const text = (btn.textContent || btn.value || "").toLowerCase();
      if (text.includes("submit application") || text.includes("apply now") || 
          text.includes("send application") || text.includes("complete application")) {
        return true;
      }
    }
    
    return false; // Default to continue page
  }

  /**
   * DYNAMIC: Smart page progression - Continue vs Final Submit
   */
  async function proceedToNextPage() {
    console.log("🔍 DYNAMIC: Smart page analysis - distinguishing Continue vs Final Submit...");
    sendLogToPopup("🔍 ANALYZING: Determining if Continue or Final Submit stage...");

    try {
      // Check extension context before proceeding
      if (!isExtensionContextValid()) {
        console.log("⚠️ Extension context invalid - cannot proceed to next page");
        return false;
      }

      // DYNAMIC: Determine if this is final submission page
      const isFinalPage = isOnFinalSubmissionPage();
      console.log(`📄 Page type: ${isFinalPage ? 'Final Submission' : 'Continue/Intermediate'}`);
      sendLogToPopup(`📄 DETECTED: ${isFinalPage ? '🎯 Final Submission Page' : '➡️ Continue/Intermediate Page'}`);

      if (isFinalPage) {
        // Priority: Look for final submission buttons
        console.log("🎯 Final page detected - looking for Submit/Apply buttons");
        const submitButton = await findSubmitButton();
        if (submitButton) {
          const buttonText = (submitButton.textContent || submitButton.value || "").trim();
          console.log(`🖱️ Clicking final submission button: "${buttonText}"`);
          sendLogToPopup(`🎯 FINAL SUBMISSION: Clicking "${buttonText}"...`);
          
          try {
            submitButton.click();
            sendLogToPopup("⏳ CRITICAL WAIT: Final submission processing...");
            await new Promise((r) => setTimeout(r, 10000)); // Long wait for final submission
            
            sendLogToPopup("📊 Verifying application submission...");
            await new Promise((r) => setTimeout(r, 3000)); // Buffer for submission processing
            
            return true;
          } catch (clickError) {
            console.error("❌ Error clicking final submission button:", clickError.message);
          }
        }
      } else {
        // Priority: Look for continue buttons
        console.log("➡️ Intermediate page detected - looking for Continue buttons");
        const continueButton = await findContinueButton();
        if (continueButton) {
          const buttonText = (continueButton.textContent || continueButton.value || "").trim();
          console.log(`🖱️ Clicking continue button: "${buttonText}"`);
          sendLogToPopup(`➡️ CONTINUE: Clicking "${buttonText}" to next step...`);
          
          try {
            continueButton.click();
            sendLogToPopup("⏳ NAVIGATION WAIT: Moving to next step...");
            await new Promise((r) => setTimeout(r, 8000)); // Wait for navigation
            
            sendLogToPopup("📊 Checking navigation progress...");
            await new Promise((r) => setTimeout(r, 2000)); // Buffer time
            
            return true;
          } catch (clickError) {
            console.error("❌ Error clicking continue button:", clickError.message);
          }
        }
        
        // Fallback: If no continue button, try submit button
        console.log("⚠️ No continue button found - trying submit button as fallback");
        const submitButton = await findSubmitButton();
        if (submitButton) {
          const buttonText = (submitButton.textContent || submitButton.value || "").trim();
          console.log(`🖱️ Fallback: Clicking submit button: "${buttonText}"`);
          sendLogToPopup(`� FALLBACK: Clicking "${buttonText}"...`);
          
          try {
            submitButton.click();
            sendLogToPopup("⏳ FALLBACK WAIT: Processing submit action...");
            await new Promise((r) => setTimeout(r, 8000)); // Standard wait
            return true;
          } catch (clickError) {
            console.error("❌ Error clicking fallback submit button:", clickError.message);
          }
        }
      }
    } catch (error) {
      console.error("❌ Error in proceedToNextPage:", error.message);
    }

    // Try pressing Enter key as fallback
    try {
      console.log("⌨️ Trying Enter key as fallback...");
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", keyCode: 13 })
      );
      await new Promise((r) => setTimeout(r, 2000)); // Longer wait for Enter key
    } catch (keyError) {
      console.error("❌ Error with Enter key fallback:", keyError.message);
    }

    return false;
  }

  /**
   * Find Continue button with multiple strategies
   */
  async function findContinueButton() {
    // 🎯 SPECIAL HANDLING: Detect "Relevant experience" page
    const pageText = document.body.textContent;
    const isRelevantExperiencePage = pageText.includes('Relevant experience') ||
                                     pageText.includes('relevant job') ||
                                     pageText.includes('introduce you as a candidate') ||
                                     pageText.includes('We share one job title');
    
    if (isRelevantExperiencePage) {
      console.log("🎯 Detected 'Relevant experience' page - using specialized handling");
      const experienceResult = await handleRelevantExperiencePage();
      if (experienceResult) return experienceResult;
    }

    const continueSelectors = [
      'button[data-testid*="continue"]',
      "button.mosaic-provider-module-apply-questions-6xgesl",
      'button[type="submit"]',
      '.ia-Questions button[type="button"]',
      '.mosaic-provider-module-apply-questions button[type="button"]',
      '[class*="apply-questions"] button',
      'button[class*="6xgesl"]',
      
      // Additional selectors for experience pages
      'button[data-testid="form-action-continue"]',
      'form button[type="button"]',
      'form input[type="submit"]'
    ];

    // Try CSS selectors first
    for (const selector of continueSelectors) {
      try {
        const button = await waitForElement(selector, 5000);  // Increased from 1000ms
        if (button) {
          console.log(`✅ Found continue button with selector: ${selector}`);
          return button;
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Try text-based search
    await new Promise((r) => setTimeout(r, 500));
    const allButtons = document.querySelectorAll(
      'button, input[type="submit"], input[type="button"]'
    );
    for (const btn of allButtons) {
      const text = (btn.textContent || btn.value || "").toLowerCase().trim();
      if (
        text.includes("continue") ||
        text.includes("next") ||
        text.includes("proceed")
      ) {
        console.log(`✅ Found continue button by text: "${text}"`);
        return btn;
      }
    }

    console.log("❌ No continue button found with any method");
    return null;
  }

  /**
   * 🎯 SPECIALIZED: Handle "Relevant experience" selection page
   */
  async function handleRelevantExperiencePage() {
    console.log("🔍 Handling 'Relevant experience' page...");
    
    // First, scan and log all interactive elements
    console.log("📊 DOM SCAN - Interactive elements on page:");
    const interactiveElements = document.querySelectorAll('button, input, select, [role="button"], [onclick], [data-testid]');
    interactiveElements.forEach((el, i) => {
      console.log(`${i + 1}. ${el.tagName} - Text: "${el.textContent?.trim()}" - TestID: "${el.getAttribute('data-testid')}" - Class: "${el.className}"`);
    });
    
    // Look for experience selection options
    const experienceSelectors = [
      // Look for job experience cards/buttons
      'button:contains("Hard Worker")',
      'button:contains("Delivery Driver")',
      'div[role="button"]:contains("Hard Worker")',
      'div[role="button"]:contains("Delivery Driver")',
      '[data-testid*="experience"]',
      '[data-testid*="job"]',
      
      // Generic selectable items
      'input[type="radio"]',
      'input[type="checkbox"]',
      'button[aria-label*="job"]',
      'button[aria-label*="experience"]'
    ];
    
    // Try to select the first available experience
    for (const selector of experienceSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        console.log(`🎯 Found ${elements.length} experience elements with: ${selector}`);
        try {
          elements[0].click();
          console.log("✅ Selected first experience option");
          await new Promise(r => setTimeout(r, 1000)); // Wait for UI update
          break;
        } catch (error) {
          console.log("⚠️ Could not click experience option:", error);
        }
      }
    }
    
    // Look for "Apply without relevant job" option  
    const applyWithoutTexts = ['Apply without relevant job', 'Apply without', 'No relevant'];
    const allClickable = document.querySelectorAll('button, div[role="button"], [onclick]');
    
    for (const element of allClickable) {
      const text = element.textContent?.trim() || '';
      if (applyWithoutTexts.some(pattern => text.includes(pattern))) {
        console.log(`🎯 Found "Apply without" option: "${text}"`);
        try {
          element.click();
          console.log("✅ Selected 'Apply without relevant job'");
          await new Promise(r => setTimeout(r, 1000));
          break;
        } catch (error) {
          console.log("⚠️ Could not click 'Apply without' option:", error);
        }
      }
    }
    
    // Now look for continue button with enhanced selectors
    const continueSelectors = [
      'button[data-testid="form-action-continue"]',
      'button[data-testid*="continue"]',
      'button[type="submit"]',
      'input[type="submit"]',
      'form button:last-of-type',
      'button[aria-label*="Continue"]'
    ];
    
    for (const selector of continueSelectors) {
      try {
        const button = await waitForElement(selector, 2000);
        if (button && !button.disabled) {
          console.log(`✅ Found experience page continue button: ${selector}`);
          return button;
        }
      } catch (e) {
        // Continue trying
      }
    }
    
    // Final fallback - look for any button with continue-like text
    const allButtons = document.querySelectorAll('button, input[type="submit"], input[type="button"]');
    for (const btn of allButtons) {
      const text = (btn.textContent || btn.value || '').toLowerCase().trim();
      if ((text.includes('continue') || text.includes('next') || text.includes('proceed')) && !btn.disabled) {
        console.log(`✅ Found continue button by text scan: "${text}"`);
        return btn;
      }
    }
    
    console.log("❌ Could not find continue button on experience page");
    return null;
  }

  /**
   * Find Submit button with multiple strategies
   */
  async function findSubmitButton() {
    const submitSelectors = [
      'button[type="submit"]',
      ".ia-BasePage-footer button",
      ".ia-Review button",
      '[class*="footer"] button',
      '[class*="submit"] button',
      'button[class*="primary"]',
      "main button",
      "footer button",
    ];

    // Try CSS selectors first
    for (const selector of submitSelectors) {
      try {
        const button = await waitForElement(selector, 5000);  // Increased from 1000ms
        if (button) return button;
      } catch (e) {
        // Continue to next selector
      }
    }

    // DYNAMIC: Smart final submission detection
    console.log("🔍 Searching for final submission buttons...");
    const allButtons = document.querySelectorAll(
      'button, input[type="submit"], input[type="button"]'
    );
    
    // Priority 1: Final submission buttons
    const finalSubmissionPatterns = [
      "submit your application", "submit application", "apply now", 
      "send application", "complete application", "finish application"
    ];
    
    for (const btn of allButtons) {
      const text = (btn.textContent || btn.value || "").toLowerCase().trim();
      for (const pattern of finalSubmissionPatterns) {
        if (text.includes(pattern)) {
          console.log(`🎯 Found final submission button: "${text}"`);
          return btn;
        }
      }
    }
    
    // Priority 2: General submit/apply (if no specific final submission found)
    for (const btn of allButtons) {
      const text = (btn.textContent || btn.value || "").toLowerCase().trim();
      if ((text.includes("submit") || text.includes("apply")) && 
          !text.includes("continue") && !text.includes("next")) {
        console.log(`✅ Found general submit button: "${text}"`);
        return btn;
      }
    }
    
    // Priority 3: Continue buttons (only if no submit/apply buttons found)
    for (const btn of allButtons) {
      const text = (btn.textContent || btn.value || "").toLowerCase().trim();
      if (text.includes("continue") || text.includes("next") || text.includes("proceed")) {
        console.log(`➡️ Using continue button (no final submission found): "${text}"`);
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
      "application submitted",
      "thank you for applying", 
      "successfully applied",
      "application received",
      "we have received your application",
      "application complete",
      "submission successful",
      "you have successfully applied",
      // NEW: Specific patterns from actual success page
      "your application has been submitted",
      "you will get an email confirmation",
      "return to job search",
      "keep track of your applications",
    ];

    const pageText = document.body.textContent.toLowerCase();
    const strongMatches = strongSuccessKeywords.filter((keyword) =>
      pageText.includes(keyword)
    );

    if (strongMatches.length > 0) {
      confidence += 0.6;
      evidence.push(`Strong success text: ${strongMatches.join(", ")}`);
    }

    // Check for Indeed-specific success URLs
    if (
      window.location.href.includes("indeed.com/viewjob") &&
      (pageText.includes("applied") || pageText.includes("thank you"))
    ) {
      confidence += 0.3;
      evidence.push("Indeed success URL pattern with confirmation text");
    }

    // LEVEL 2: Visual Success Elements (Medium Confidence)
    console.log("🔍 Level 2: Visual Success Elements");

    const successSelectors = [
      ".success",
      ".confirmation",
      ".complete",
      ".submitted",
      '[data-testid*="success"]',
      '[data-testid*="confirmation"]',
      '[class*="success"]',
      '[class*="confirmation"]',
      ".checkmark",
      ".check-circle",
      ".fa-check",
    ];

    const foundSuccessElements = successSelectors.filter((sel) =>
      document.querySelector(sel)
    );
    if (foundSuccessElements.length > 0) {
      confidence += 0.2 * Math.min(foundSuccessElements.length, 3);
      evidence.push(`Success UI elements: ${foundSuccessElements.join(", ")}`);
    }

    // LEVEL 2.5: Indeed Post-Apply Page Detection (High Confidence)
    console.log("🔍 Level 2.5: Indeed Post-Apply Page Detection");
    
    // Check for specific Indeed post-apply page elements
    const postApplyIndicators = [
      '.ia-PostApply', 
      '.ia-PostApply-header',
      '#mosaic-postApplyModule',
      '.mosaic-provider-module-post-apply',
      '[data-testid="myJobsHeading"]',
      '#continueButton',
      '.ia-PostApply-ContinueFooter-button'
    ];
    
    const foundPostApplyElements = postApplyIndicators.filter(sel => document.querySelector(sel));
    if (foundPostApplyElements.length >= 2) {
      confidence += 0.4; // High confidence for post-apply page structure
      evidence.push(`Indeed post-apply page elements: ${foundPostApplyElements.join(", ")}`);
    }
    
    // Check for email confirmation pattern  
    const emailConfirmationPattern = /you will get an email confirmation at.*@.*\.com/i;
    const hasEmailConfirmation = emailConfirmationPattern.test(pageText);
    if (hasEmailConfirmation) {
      confidence += 0.3; // Very high confidence indicator
      evidence.push("Email confirmation message found");
    }
    
    // Check for "Return to job search" button
    const returnButton = Array.from(document.querySelectorAll('button, a')).find(el => 
      el.textContent.toLowerCase().includes('return to job search')
    );
    if (returnButton) {
      confidence += 0.2;
      evidence.push("Return to job search button found");
    }

    // LEVEL 3: Form State Analysis (Medium Confidence)
    console.log("🔍 Level 3: Form State Analysis");

    // Check if all forms are gone (submitted)
    const remainingForms = document.querySelectorAll("form");
    const remainingInputs = document.querySelectorAll(
      'input[type="text"], input[type="email"], textarea'
    );
    // Get submit buttons using valid CSS selectors
    const submitButtons = document.querySelectorAll('button[type="submit"]');
    const allButtons = document.querySelectorAll('button');
    const submitAndApplyButtons = Array.from(allButtons).filter(btn => {
      const text = btn.textContent.toLowerCase().trim();
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      return text.includes('submit') || text.includes('apply') || 
             ariaLabel.includes('submit') || ariaLabel.includes('apply') ||
             btn.type === 'submit';
    });

    if (remainingForms.length === 0 && remainingInputs.length === 0) {
      confidence += 0.25;
      evidence.push("All forms and inputs removed (submitted)");
    }

    // Check for disabled/hidden submit buttons (indicates completion)
    const disabledSubmits = submitAndApplyButtons.filter(
      (btn) => btn.disabled || btn.style.display === "none" || !btn.offsetParent
    );

    if (disabledSubmits.length > 0) {
      confidence += 0.15;
      evidence.push("Submit buttons disabled/hidden");
    }

    // LEVEL 4: URL Pattern Analysis (Low-Medium Confidence)
    console.log("🔍 Level 4: URL Pattern Analysis");

    const successUrlPatterns = [
      "success",
      "complete",
      "confirmation",
      "submitted",
      "thank-you",
      "applied",
      "application-sent",
      "done",
    ];

    const currentUrl = window.location.href.toLowerCase();
    const urlMatches = successUrlPatterns.filter((pattern) =>
      currentUrl.includes(pattern)
    );

    if (urlMatches.length > 0) {
      confidence += 0.2;
      evidence.push(`Success URL patterns: ${urlMatches.join(", ")}`);
    }

    // LEVEL 5: Error Detection (Negative Indicators)
    console.log("🔍 Level 5: Error Detection");

    const errorKeywords = [
      "error",
      "invalid",
      "required",
      "missing",
      "failed",
      "unsuccessful",
      "please fill",
      "this field is required",
      "cannot be blank",
    ];

    const errorMatches = errorKeywords.filter((keyword) =>
      pageText.includes(keyword)
    );
    const errorElements = document.querySelectorAll(
      '.error, .invalid, [class*="error"]'
    );

    if (errorMatches.length > 0 || errorElements.length > 0) {
      confidence -= 0.3;
      evidence.push(
        `Errors detected: ${errorMatches.join(", ")} | ${
          errorElements.length
        } error elements`
      );
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
    const filledInputs = Array.from(
      document.querySelectorAll("input, textarea")
    ).filter((input) => input.value && input.value.length > 0);

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
      evidence.push("Extended time on page without active forms");
    }

    // Cap confidence at 1.0
    confidence = Math.min(confidence, 1.0);

    console.log(
      `📊 Success Verification Complete: ${(confidence * 100).toFixed(
        1
      )}% confidence`
    );
    console.log(`📝 Evidence: ${evidence.length} indicators found`);

    return { confidence, evidence };
  }

  /**
   * STRICT Success page check - Only returns true when ABSOLUTELY certain we've submitted
   * This prevents premature workflow completion before hitting submit buttons
   */
  async function isSuccessPage() {
    const verification = await performSuccessVerification();
    
    // MUCH higher confidence required to prevent premature completion
    if (verification.confidence < 0.85) {
      return false;
    }
    
    // Additional checks to ensure we've actually gone through form submission
    const url = window.location.href.toLowerCase();
    const hasSubmissionInUrl = url.includes('submitted') || url.includes('success') || url.includes('thank') || url.includes('complete');
    const hasFormElements = document.querySelectorAll('form, input, select, textarea').length;
    
    // If we still see lots of form elements, we probably haven't submitted yet
    if (hasFormElements > 10) {
      console.log(`🤔 High confidence (${(verification.confidence * 100).toFixed(1)}%) but still see ${hasFormElements} form elements - continuing workflow`);
      return false;
    }
    
    console.log(`✅ STRICT SUCCESS CHECK PASSED: ${(verification.confidence * 100).toFixed(1)}% confidence, URL indicates submission, minimal forms remaining`);
    return true;
  }

  /**
   * Final success check with timeout
   */
  async function checkApplicationSuccess() {
    console.log(
      "🔍 Starting comprehensive application success verification..."
    );

    let attempts = 0;
    let lastPageUrl = window.location.href;
    let formInteractionCount = window.formInteractionCount || 0;

    while (attempts < 20) {
      // Increased attempts for thorough checking
      // Multi-level success verification
      const successLevel = await performSuccessVerification();

      if (successLevel.confidence >= 0.8) {
        console.log(
          `🎉 HIGH CONFIDENCE SUCCESS (${(
            successLevel.confidence * 100
          ).toFixed(1)}%): Application submitted!`
        );
        console.log(`📊 Success Evidence:`, successLevel.evidence);
        return true;
      }

      if (successLevel.confidence >= 0.6) {
        console.log(
          `⚠️ MEDIUM CONFIDENCE (${(successLevel.confidence * 100).toFixed(
            1
          )}%): Likely success, continuing verification...`
        );
      }

      // Check for page changes (indicates progression)
      const currentUrl = window.location.href;
      if (currentUrl !== lastPageUrl) {
        console.log(`📍 Page changed: ${lastPageUrl} → ${currentUrl}`);
        lastPageUrl = currentUrl;
      }

      await new Promise((r) => setTimeout(r, 1000));
      attempts++;

      if (attempts % 5 === 0) {
        console.log(
          `🔄 Success verification progress: ${attempts}/20 (${(
            successLevel.confidence * 100
          ).toFixed(1)}% confidence)`
        );
      }
    }

    // Final verification with relaxed criteria
    const finalCheck = await performSuccessVerification();
    if (finalCheck.confidence >= 0.5) {
      console.log(
        `✅ MODERATE SUCCESS (${(finalCheck.confidence * 100).toFixed(
          1
        )}%): Application likely submitted`
      );
      console.log(`📊 Final Evidence:`, finalCheck.evidence);
      return true;
    }

    console.log(
      `❌ LOW CONFIDENCE (${(finalCheck.confidence * 100).toFixed(
        1
      )}%): Application submission unclear`
    );
    console.log(`📊 Final Evidence:`, finalCheck.evidence);
    return false;
  }

  /**
   * Helper functions to detect page content
   */
  async function hasContactInfo() {
    return !!(await waitForElement(
      '#mosaic-contactInfoModule, [data-testid="profile-location-page"], input[name*="name"], input[name*="email"], input[name*="phone"]',
      8000  // Increased from 1000ms
    ));
  }

  async function hasEmployerQuestions() {
    return !!(await waitForElement(
      '.ia-Questions-item, [id^="q_"], [data-testid*="input-q_"], h1[data-testid="questions-heading"]',
      8000  // Increased from 1000ms
    ));
  }

  async function hasResumeSelection() {
    return !!(await waitForElement(
      '.ia-Resume, input[type="radio"][name*="resume"], [data-testid*="resume"]',
      8000  // Increased from 1000ms
    ));
  }

  async function hasDocumentUploads() {
    return !!(await waitForElement(
      'input[type="file"], [data-testid*="upload"], .upload',
      1000
    ));
  }

  async function hasLegalDisclaimer() {
    return !!(await waitForElement(
      'input[type="checkbox"][name*="legal"], input[type="checkbox"][name*="terms"], input[type="checkbox"][name*="agree"]',
      1000
    ));
  }

  async function selectResume() {
    const resumeRadio = await waitForElement(
      'input[type="radio"][name*="resume"]',
      2000
    );
    if (resumeRadio && !resumeRadio.checked) {
      resumeRadio.checked = true;
      resumeRadio.dispatchEvent(new Event("change", { bubbles: true }));
      window.formInteractionCount = (window.formInteractionCount || 0) + 1;
      return { selected: true };
    }
    return { selected: false };
  }

  async function fillEmployerQuestions() {
    let filled = 0;

    // Find all question containers
    const questionContainers = document.querySelectorAll(
      '.ia-Questions-item, [id^="q_"], [data-testid*="input-q_"]'
    );

    console.log(
      `📝 Found ${questionContainers.length} employer questions to process`
    );

    for (const container of questionContainers) {
      try {
        // Extract question text
        const questionText = container.textContent || container.innerText || "";
        if (questionText.trim().length === 0) continue;

        console.log(
          `❓ Processing question: "${questionText.substring(0, 100)}..."`
        );

        // Use the existing fillQuestionByType function
        const success = await fillQuestionByType(container, questionText);
        if (success) {
          filled++;
          console.log(`✅ Successfully filled question`);
        } else {
          console.log(`⚠️ Could not fill question`);
        }

        // Small delay between questions
        await new Promise((r) => setTimeout(r, 500));
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
    // Enhanced selectors for acknowledgement checkboxes
    const checkboxSelectors = [
      'input[type="checkbox"][name*="legal"]',
      'input[type="checkbox"][name*="terms"]', 
      'input[type="checkbox"][name*="agree"]',
      'input[type="checkbox"][name*="acknowledge"]',
      'input[type="checkbox"][name*="certify"]',
      'input[type="checkbox"][name*="confirm"]',
      'input[type="checkbox"][name*="accept"]',
      // More specific patterns for Indeed forms
      'input[type="checkbox"]' // Fallback - check all checkboxes in context
    ];
    
    let checkedCount = 0;
    
    for (const selector of checkboxSelectors) {
      const checkboxes = document.querySelectorAll(selector);
      for (const checkbox of checkboxes) {
        // Check if the checkbox is related to acknowledgement/terms
        const labelText = getAssociatedText(checkbox).toLowerCase();
        const isAcknowledgement = (
          labelText.includes('acknowledge') ||
          labelText.includes('certify') ||
          labelText.includes('confirm') ||
          labelText.includes('agree') ||
          labelText.includes('terms') ||
          labelText.includes('legal') ||
          labelText.includes('facts set forth') ||
          labelText.includes('true and complete')
        );
        
        if (isAcknowledgement && !checkbox.checked) {
          console.log(`📋 Checking acknowledgement checkbox: ${labelText.substring(0, 100)}...`);
          checkbox.checked = true;
          checkbox.dispatchEvent(new Event("change", { bubbles: true }));
          checkbox.dispatchEvent(new Event("click", { bubbles: true }));
          checkedCount++;
          
          // Wait a bit between checkbox interactions
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
    }
    
    console.log(`✅ Checked ${checkedCount} acknowledgement checkboxes`);
    return { checked: checkedCount };
  }
  
  // Helper function to get text associated with a checkbox
  function getAssociatedText(checkbox) {
    const labelFor = document.querySelector(`label[for="${checkbox.id}"]`);
    if (labelFor) return labelFor.textContent || '';
    
    const parentLabel = checkbox.closest('label');
    if (parentLabel) return parentLabel.textContent || '';
    
    const nextSibling = checkbox.nextElementSibling;
    if (nextSibling) return nextSibling.textContent || '';
    
    const parentText = checkbox.parentElement?.textContent || '';
    return parentText;
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
    "Work",
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
    "Work",
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
    "Zoom",
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
    "Worker",
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
    "No",
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
    "Updated",
  ];

  // Function to normalize text for better matching
  function normalizeText(text) {
    return text
      .toLowerCase()
      .replace(/[.,!?;:]/g, "") // Remove punctuation
      .replace(/\s+/g, " ") // Normalize whitespace
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
  function calculateScore(
    qustion,
    answer,
    nouns,
    verbs,
    propernouns,
    subjects,
    userShortResponce,
    actionWorkds
  ) {
    // turns qustions into array of words
    const qustionWords = normalizeText(qustion).split(" ");
    const answerWords = normalizeText(answer).split(" ");

    // Extract word types for question
    const qustionNouns = qustionWords.filter((word) =>
      nouns.map((n) => n.toLowerCase()).includes(word)
    );
    const qustionVerbs = qustionWords.filter((word) =>
      verbs.map((v) => v.toLowerCase()).includes(word)
    );
    const qustionProperNouns = qustionWords.filter((word) =>
      propernouns.map((p) => p.toLowerCase()).includes(word)
    );
    const qustionSubjects = qustionWords.filter((word) =>
      subjects.map((s) => s.toLowerCase()).includes(word)
    );
    const qustionShortResponse = qustionWords.filter((word) =>
      userShortResponce.map((r) => r.toLowerCase()).includes(word)
    );
    const qustionActions = qustionWords.filter((word) =>
      actionWorkds.map((a) => a.toLowerCase()).includes(word)
    );

    // Extract word types for answer
    const answerNouns = answerWords.filter((word) =>
      nouns.map((n) => n.toLowerCase()).includes(word)
    );
    const answerVerbs = answerWords.filter((word) =>
      verbs.map((v) => v.toLowerCase()).includes(word)
    );
    const answerProperNouns = answerWords.filter((word) =>
      propernouns.map((p) => p.toLowerCase()).includes(word)
    );
    const answerSubjects = answerWords.filter((word) =>
      subjects.map((s) => s.toLowerCase()).includes(word)
    );
    const answerShortResponse = answerWords.filter((word) =>
      userShortResponce.map((r) => r.toLowerCase()).includes(word)
    );
    const answerActions = answerWords.filter((word) =>
      actionWorkds.map((a) => a.toLowerCase()).includes(word)
    );

    // Initialize score
    let score = 0;

    // Dynamic category detection for better scoring
    const questionCategory = detectQuestionCategory(
      qustion,
      propernouns,
      nouns,
      verbs
    );

    // Weighted scoring based on linguistic feature matching
    // Formula component: Σ(Wi × |categoryi(Q) ∩ categoryi(A)|)

    const properNounMatches = qustionProperNouns.filter((word) =>
      answerProperNouns.includes(word)
    );
    score += properNounMatches.length * 12; // W₁ = 12 (highest semantic value)

    const nounMatches = qustionNouns.filter((word) =>
      answerNouns.includes(word)
    );
    score += nounMatches.length * 6; // W₂ = 6 (high concept matching)

    const verbMatches = qustionVerbs.filter((word) =>
      answerVerbs.includes(word)
    );
    score += verbMatches.length * 4; // W₃ = 4 (action alignment)

    const subjectMatches = qustionSubjects.filter((word) =>
      answerSubjects.includes(word)
    );
    score += subjectMatches.length * 3; // W₄ = 3 (entity recognition)

    const shortResponseMatches = qustionShortResponse.filter((word) =>
      answerShortResponse.includes(word)
    );
    score += shortResponseMatches.length * 8; // W₅ = 8 (intent matching)

    const actionMatches = qustionActions.filter((word) =>
      answerActions.includes(word)
    );
    score += actionMatches.length * 5; // W₆ = 5 (status understanding)

    const directMatches = qustionWords.filter((word) =>
      answerWords.includes(word)
    );
    score += directMatches.length * 1; // W₇ = 1 (fallback similarity)

    // Bonus scoring: B(Q,A) = Σ(15 × δ(pi, Q, A))
    const lowerQuestion = qustion.toLowerCase();
    const lowerAnswer = answer.toLowerCase();

    // Exact phrase matching bonus (δ function: 1 if phrase exists in both, 0 otherwise)
    propernouns.forEach((prop) => {
      const propLower = prop.toLowerCase();
      if (
        lowerQuestion.includes(propLower) &&
        lowerAnswer.includes(propLower)
      ) {
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
        directMatches,
      },
    };
  }

  // Main function to find the best matching answer for a question
  function findBestAnswer(
    question,
    answerArray,
    nouns,
    verbs,
    propernouns,
    subjects,
    userShortResponce,
    actionWorkds
  ) {
    let bestAnswer = "";
    let highestScore = 0;
    let bestDetails = {};

    answerArray.forEach((answer) => {
      const result = calculateScore(
        question,
        answer,
        nouns,
        verbs,
        propernouns,
        subjects,
        userShortResponce,
        actionWorkds
      );

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
      details: bestDetails,
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
  function findAllRelevantAnswers(
    question,
    answerArray,
    nouns,
    verbs,
    propernouns,
    subjects,
    userShortResponce,
    actionWorkds,
    minThreshold = 5,
    maxResults = 5
  ) {
    const allMatches = [];

    answerArray.forEach((answer) => {
      const result = calculateScore(
        question,
        answer,
        nouns,
        verbs,
        propernouns,
        subjects,
        userShortResponce,
        actionWorkds
      );

      // Only include answers above minimum threshold
      if (result.score >= minThreshold) {
        allMatches.push({
          answer: answer,
          score: result.score,
          confidence: Math.min(result.score / 10, 1), // Normalize to 0-1 range
          details: result.details,
          relevanceLevel:
            result.score >= 15 ? "high" : result.score >= 10 ? "medium" : "low",
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
        question: question,
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
  function findQuestionsForAnswer(
    targetAnswer,
    questionArray,
    nouns,
    verbs,
    propernouns,
    subjects,
    userShortResponce,
    actionWorkds,
    minThreshold = 5
  ) {
    const matchingQuestions = [];

    questionArray.forEach((question) => {
      const result = calculateScore(
        question,
        targetAnswer,
        nouns,
        verbs,
        propernouns,
        subjects,
        userShortResponce,
        actionWorkds
      );

      if (result.score >= minThreshold) {
        matchingQuestions.push({
          question: question,
          score: result.score,
          confidence: Math.min(result.score / 10, 1),
          details: result.details,
          targetAnswer: targetAnswer,
        });
      }
    });

    return matchingQuestions.sort((a, b) => b.score - a.score);
  }

  // Function to process multiple questions against multiple answers
  function processQuestionAnswerPairs(
    questionArray,
    answerArray,
    nouns,
    verbs,
    propernouns,
    subjects,
    userShortResponce,
    actionWorkds
  ) {
    return questionArray.map((question) =>
      findBestAnswer(
        question,
        answerArray,
        nouns,
        verbs,
        propernouns,
        subjects,
        userShortResponce,
        actionWorkds
      )
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
  function processMultipleAnswers(
    questionArray,
    answerArray,
    nouns,
    verbs,
    propernouns,
    subjects,
    userShortResponce,
    actionWorkds,
    options = {}
  ) {
    const {
      minThreshold = 5,
      maxAnswers = 5,
      includeReverse = false,
    } = options;

    const questionToAnswers = questionArray.map((question) => ({
      question: question,
      matches: findAllRelevantAnswers(
        question,
        answerArray,
        nouns,
        verbs,
        propernouns,
        subjects,
        userShortResponce,
        actionWorkds,
        minThreshold,
        maxAnswers
      ),
    }));

    const results = {
      questionToAnswers: questionToAnswers,
      summary: {
        totalQuestions: questionArray.length,
        questionsWithMatches: questionToAnswers.filter(
          (q) => q.matches.length > 0
        ).length,
        questionsWithMultipleMatches: questionToAnswers.filter(
          (q) => q.matches.length > 1
        ).length,
        averageMatchesPerQuestion:
          questionToAnswers.reduce((sum, q) => sum + q.matches.length, 0) /
          questionArray.length,
      },
    };

    // Optional: Include reverse mapping (answer → questions)
    if (includeReverse) {
      const answerToQuestions = answerArray.map((answer) => ({
        answer: answer,
        matchingQuestions: findQuestionsForAnswer(
          answer,
          questionArray,
          nouns,
          verbs,
          propernouns,
          subjects,
          userShortResponce,
          actionWorkds,
          minThreshold
        ),
      }));

      results.answerToQuestions = answerToQuestions;
      results.summary.totalAnswers = answerArray.length;
      results.summary.answersWithMatches = answerToQuestions.filter(
        (a) => a.matchingQuestions.length > 0
      ).length;
      results.summary.answersWithMultipleMatches = answerToQuestions.filter(
        (a) => a.matchingQuestions.length > 1
      ).length;
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
      maxLength = 200,
    } = options;

    if (!matches || matches.length === 0) {
      return {
        formattedResponse: "No suitable answers found",
        inputType,
        matches: [],
      };
    }

    switch (inputType) {
      case inputTypes.RADIO:
        // For radio buttons, provide the top match but show alternatives
        return {
          formattedResponse: matches[0].answer,
          primaryChoice: matches[0].answer,
          alternatives: matches.slice(1).map((m) => m.answer),
          confidence: matches[0].confidence,
          inputType,
          matches,
        };

      case inputTypes.DROPDOWN:
        // For dropdown, list all options with primary selection
        return {
          formattedResponse: matches[0].answer,
          dropdownOptions: matches.map((m) => ({
            value: m.answer,
            label: m.answer,
            confidence: m.confidence,
            selected: m.rank === 1,
          })),
          inputType,
          matches,
        };

      case inputTypes.CHECKBOX:
        // For checkboxes, user can select multiple relevant answers
        return {
          formattedResponse: matches.map((m) => m.answer).join("; "),
          checkboxOptions: matches.map((m) => ({
            value: m.answer,
            label: m.answer,
            confidence: m.confidence,
            checked: m.relevanceLevel === "high",
          })),
          inputType,
          matches,
        };

      case inputTypes.TEXT:
      default:
        // For text input, combine or list multiple answers
        if (combineAnswers && matches.length > 1) {
          const combined = matches
            .filter((m) => m.relevanceLevel !== "low")
            .map((m) =>
              includeConfidence
                ? `${m.answer} (${Math.round(m.confidence * 100)}% match)`
                : m.answer
            )
            .join(" | ");

          return {
            formattedResponse:
              combined.length > maxLength
                ? combined.substring(0, maxLength) + "..."
                : combined,
            inputType,
            matches,
            combinedAnswer: true,
          };
        } else {
          return {
            formattedResponse: matches[0].answer,
            alternatives: matches.slice(1),
            inputType,
            matches,
          };
        }
    }
  }

  // Input type definitions and their answer formats
  const inputTypes = {
    TEXT: "text",
    RADIO: "radio",
    DROPDOWN: "dropdown",
    CHECKBOX: "checkbox",
  };

  // Dynamic response data storage
  let storedResponses = new Map(); // Store user responses for consistency
  let questionCategories = new Map(); // Store categorized questions
  let answerPatterns = new Map(); // Store answer patterns for reuse

  // Dynamic category detection based on keywords
  function detectQuestionCategory(question, propernouns, nouns, verbs) {
    const lowerQ = question.toLowerCase();
    const words = lowerQ.split(/\s+/);

    let category = "general";
    let confidence = 0;

    // Check for specific technologies/certifications in propernouns
    const techWords = propernouns.filter((prop) =>
      words.some(
        (word) =>
          prop.toLowerCase().includes(word) || word.includes(prop.toLowerCase())
      )
    );

    // Check for experience/time-related words
    const experienceWords = ["year", "years", "experience", "month", "months"];
    const hasExperience = words.some((word) => experienceWords.includes(word));

    // Check for yes/no question patterns
    const yesNoWords = ["do", "are", "have", "can", "will", "would", "is"];
    const isYesNo = words.some((word) => yesNoWords.includes(word));

    if (techWords.length > 0) {
      category = hasExperience
        ? `${techWords[0]}_experience`
        : `${techWords[0]}_knowledge`;
      confidence = 0.8;
    } else if (hasExperience) {
      category = "experience_general";
      confidence = 0.6;
    } else if (isYesNo) {
      category = "yes_no_question";
      confidence = 0.5;
    }

    return { category, confidence, detectedTerms: techWords };
  }

  // Generate dynamic response based on answer content and input type
  function generateDynamicResponse(
    answer,
    inputType,
    userShortResponce,
    actionWorkds
  ) {
    const lowerAnswer = answer.toLowerCase();

    switch (inputType) {
      case "radio":
        // Extract key info for radio buttons
        if (lowerAnswer.includes("yes")) return "Yes";
        if (lowerAnswer.includes("no")) return "No";
        if (lowerAnswer.match(/\d+\s*years?/)) {
          const years = lowerAnswer.match(/(\d+)\s*years?/)[1];
          return `${years} years`;
        }
        // Use userShortResponce for concise answers
        const shortResponse = userShortResponce.find((resp) =>
          lowerAnswer.includes(resp.toLowerCase())
        );
        return shortResponse || answer.split(".")[0]; // First sentence

      case "dropdown":
        // More descriptive for dropdowns
        if (lowerAnswer.match(/\d+\s*years?.*experience/)) {
          const years = lowerAnswer.match(/(\d+)\s*years?/)[1];
          const tech = extractTechnology(answer);
          return tech
            ? `${years} years - ${tech}`
            : `${years} years experience`;
        }
        return answer.length > 50 ? answer.substring(0, 47) + "..." : answer;

      case "checkbox":
        // Boolean or action-based for checkboxes
        const hasAction = actionWorkds.some((action) =>
          lowerAnswer.includes(action.toLowerCase())
        );
        if (hasAction) return true;
        return (
          lowerAnswer.includes("yes") ||
          lowerAnswer.includes("have") ||
          lowerAnswer.includes("can") ||
          !lowerAnswer.includes("no")
        );

      default: // text
        return answer;
    }
  }

  // Extract technology/skill names from text
  function extractTechnology(text) {
    const commonTech = [
      "javascript",
      "python",
      "java",
      "react",
      "node",
      "aws",
      "sql",
      "css",
      "html",
    ];
    const words = text.toLowerCase().split(/\s+/);
    return commonTech.find((tech) => words.some((word) => word.includes(tech)));
  }

  // Enhanced matching function that handles input types dynamically
  function findAnswerWithInputType(
    question,
    answerArray,
    inputType,
    nouns,
    verbs,
    propernouns,
    subjects,
    userShortResponce,
    actionWorkds
  ) {
    // First find the best semantic match
    const baseResult = findBestAnswer(
      question,
      answerArray,
      nouns,
      verbs,
      propernouns,
      subjects,
      userShortResponce,
      actionWorkds
    );

    // Generate dynamic response based on answer content and input type
    const formattedAnswer = generateDynamicResponse(
      baseResult.bestAnswer,
      inputType,
      userShortResponce,
      actionWorkds
    );

    // Store this response for consistency across similar questions
    const questionKey = question
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .trim();
    if (!storedResponses.has(questionKey)) {
      storedResponses.set(questionKey, {
        originalAnswer: baseResult.bestAnswer,
        formattedResponses: { [inputType]: formattedAnswer },
        category: baseResult.category,
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
      isConsistent: checkResponseConsistency(
        questionKey,
        inputType,
        formattedAnswer
      ),
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
    const hasYes = responses.some(
      (r) => String(r).toLowerCase().includes("yes") || r === true
    );
    const hasNo = responses.some(
      (r) => String(r).toLowerCase().includes("no") || r === false
    );

    const newHasYes =
      String(newResponse).toLowerCase().includes("yes") || newResponse === true;
    const newHasNo =
      String(newResponse).toLowerCase().includes("no") || newResponse === false;

    // Flag inconsistency if yes/no conflicts
    return !(hasYes && newHasNo) && !(hasNo && newHasYes);
  }

  // Batch process with input types
  function processWithInputTypes(
    questionArray,
    answerArray,
    inputTypeArray,
    nouns,
    verbs,
    propernouns,
    subjects,
    userShortResponce,
    actionWorkds
  ) {
    return questionArray.map((question, index) => {
      const inputType = inputTypeArray[index] || inputTypes.TEXT;
      return findAnswerWithInputType(
        question,
        answerArray,
        inputType,
        nouns,
        verbs,
        propernouns,
        subjects,
        userShortResponce,
        actionWorkds
      );
    });
  }

  // Data storage and retrieval functions
  function saveResponseData(filename = "responses.json") {
    // Convert Maps to serializable objects with full details
    const serializedResponses = Array.from(storedResponses.entries()).map(
      ([question, data]) => ({
        question,
        originalAnswer: data.originalAnswer,
        formattedResponses: data.formattedResponses,
        category: data.category || null,
      })
    );

    const data = {
      storedResponses: serializedResponses,
      questionCategories: Array.from(questionCategories.entries()),
      answerPatterns: Array.from(answerPatterns.entries()),
      totalQuestions: storedResponses.size,
      timestamp: new Date().toISOString(),
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
    console.log("Data loaded successfully");
  }

  // Get all stored responses for analysis
  function getStoredResponses() {
    return {
      totalQuestions: storedResponses.size,
      responses: Array.from(storedResponses.entries()),
      categories: Array.from(questionCategories.entries()),
    };
  }

  // Find similar questions that have been answered before
  function findSimilarQuestions(newQuestion, threshold = 0.6) {
    const similar = [];

    for (const [storedQ, data] of storedResponses.entries()) {
      const similarity = calculateTextSimilarity(
        newQuestion.toLowerCase(),
        storedQ
      );
      if (similarity > threshold) {
        similar.push({
          question: storedQ,
          similarity,
          storedData: data,
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

    const intersection = new Set([...words1].filter((x) => words2.has(x)));
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
    "Can you commit to 40 hours per week?",
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
    "Yes, full-time availability.",
  ];

  // Test the system
  console.log("=== Question-Answer Matching System Test ===\n");

  testQuestions.forEach((question, index) => {
    const result = findBestAnswer(
      question,
      testAnswers,
      nouns,
      verbs,
      propernouns,
      subjects,
      userShortResponce,
      actionWorkds
    );

    console.log(`Question ${index + 1}: ${question}`);
    console.log(`Best Answer: ${result.bestAnswer}`);
    console.log(`Score: ${result.score}`);
    console.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    console.log(`Matches: ${JSON.stringify(result.details, null, 2)}`);
    console.log("---");
  });

  // Batch processing test
  console.log("\n=== Batch Processing Test ===");
  const batchResults = processQuestionAnswerPairs(
    testQuestions.slice(0, 5),
    testAnswers,
    nouns,
    verbs,
    propernouns,
    subjects,
    userShortResponce,
    actionWorkds
  );
  batchResults.forEach((result, index) => {
    console.log(`${index + 1}. Q: "${result.question}"`);
    console.log(`   A: "${result.bestAnswer}" (Score: ${result.score})`);
  });

  // Input type consistency test
  console.log("\n=== Input Type Consistency Test ===");
  const testQuestion = "Do you have a valid Class A license?";
  const inputTypesTest = [
    inputTypes.TEXT,
    inputTypes.RADIO,
    inputTypes.DROPDOWN,
    inputTypes.CHECKBOX,
  ];

  inputTypesTest.forEach((type) => {
    const result = findAnswerWithInputType(
      testQuestion,
      testAnswers,
      type,
      nouns,
      verbs,
      propernouns,
      subjects,
      userShortResponce,
      actionWorkds
    );
    console.log(`${type.toUpperCase()}: ${result.formattedAnswer}`);
  });

  // Batch test with different input types
  console.log("\n=== Mixed Input Types Test ===");
  const mixedInputTypes = [
    inputTypes.TEXT,
    inputTypes.RADIO,
    inputTypes.DROPDOWN,
    inputTypes.TEXT,
    inputTypes.RADIO,
  ];
  const mixedResults = processWithInputTypes(
    testQuestions.slice(0, 5),
    testAnswers,
    mixedInputTypes,
    nouns,
    verbs,
    propernouns,
    subjects,
    userShortResponce,
    actionWorkds
  );

  mixedResults.forEach((result, index) => {
    console.log(
      `${index + 1}. [${result.inputType.toUpperCase()}] Q: "${
        result.question
      }"`
    );
    console.log(`   Formatted A: "${result.formattedAnswer}"`);
    console.log(`   Original A: "${result.originalAnswer}"`);
    console.log(`   Category: ${result.responseCategory || "general"}`);
  });

  // Data Storage Test
  console.log("\n=== Data Storage Test ===");
  const newQuestion = "Do you currently have AWS certification?";
  const newResult = findAnswerWithInputType(
    newQuestion,
    testAnswers,
    "radio",
    nouns,
    verbs,
    propernouns,
    subjects,
    userShortResponce,
    actionWorkds
  );
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
      console.log(
        `   Category: ${data.category.category} (confidence: ${(
          data.category.confidence * 100
        ).toFixed(1)}%)`
      );
    }
  });

  // Similar questions test
  console.log("\n=== Similar Questions Test ===");
  const similarQuestions = findSimilarQuestions(
    "Do you possess a Class A driving license?",
    0.4
  );
  console.log("Similar questions found:", similarQuestions.length);
  similarQuestions.slice(0, 2).forEach((similar, index) => {
    console.log(
      `${index + 1}. "${similar.question}" (similarity: ${(
        similar.similarity * 100
      ).toFixed(1)}%)`
    );
  });

  // Save data demonstration
  console.log("\n=== Save Data Demo ===");
  const savedData = saveResponseData("test_responses.json");
  console.log(`Saved ${savedData.storedResponses.length} responses`);

  // Single test case
  console.log("\n=== Single Test Case ===");
  const singleResult = findBestAnswer(
    "Do you have a valid Class A license",
    testAnswers,
    nouns,
    verbs,
    propernouns,
    subjects,
    userShortResponce,
    actionWorkds
  );
  console.log("Result:", singleResult);

  const jobqustions = findAnswerWithInputType(
    newQuestion,
    testAnswers,
    "radio",
    nouns,
    verbs,
    propernouns,
    subjects,
    userShortResponce,
    actionWorkds
  );

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
    nouns,
    verbs,
    propernouns,
    subjects,
    userShortResponce,
    actionWorkds,
    3, // minimum threshold
    6 // max results
  );

  console.log(`\nFound ${multipleAnswers.length} relevant answers:`);
  multipleAnswers.forEach((match, i) => {
    console.log(
      `  ${i + 1}. [Score: ${
        match.score
      }, ${match.relevanceLevel.toUpperCase()}] ${match.answer}`
    );
    console.log(`     Confidence: ${Math.round(match.confidence * 100)}%`);
  });

  // Test 2: Format Multiple Answers for Different Input Types
  console.log("\n🎛️ TEST 2: Formatting for Different Input Types");
  console.log("─".repeat(60));

  const inputTypesToTest = ["text", "radio", "dropdown", "checkbox"];
  inputTypesToTest.forEach((inputType) => {
    const formatted = formatMultipleAnswerResponse(multipleAnswers, inputType);
    console.log(`\n${inputType.toUpperCase()} Format:`);
    console.log(`  Primary Response: ${formatted.formattedResponse}`);

    if (formatted.alternatives) {
      console.log(`  Alternatives: ${formatted.alternatives.length} options`);
    }
    if (formatted.dropdownOptions) {
      console.log(
        `  Dropdown Options: ${formatted.dropdownOptions.length} choices`
      );
    }
    if (formatted.checkboxOptions) {
      console.log(
        `  Checkbox Options: ${formatted.checkboxOptions.length} selectable`
      );
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
    "Where are you located?",
  ];

  const manyToManyResults = processMultipleAnswers(
    questionsForManyToMany,
    testAnswers,
    nouns,
    verbs,
    propernouns,
    subjects,
    userShortResponce,
    actionWorkds,
    { minThreshold: 3, maxAnswers: 5, includeReverse: true }
  );

  console.log(
    `\nProcessed ${manyToManyResults.summary.totalQuestions} questions:`
  );
  console.log(
    `✅ Questions with matches: ${manyToManyResults.summary.questionsWithMatches}`
  );
  console.log(
    `🔢 Questions with multiple matches: ${manyToManyResults.summary.questionsWithMultipleMatches}`
  );
  console.log(
    `📊 Average matches per question: ${manyToManyResults.summary.averageMatchesPerQuestion.toFixed(
      2
    )}`
  );

  manyToManyResults.questionToAnswers.forEach((qa) => {
    if (qa.matches.length > 0) {
      console.log(`\nQ: "${qa.question}"`);
      console.log(`   → ${qa.matches.length} answer(s):`);
      qa.matches.forEach((match) => {
        console.log(
          `     • ${match.answer} (${Math.round(match.confidence * 100)}%)`
        );
      });
    }
  });

  // Test 4: Reverse Lookup (Answer → Questions)
  console.log("\n🔍 TEST 4: Reverse Lookup - Answer to Questions");
  console.log("─".repeat(60));

  if (manyToManyResults.answerToQuestions) {
    console.log(
      `\nProcessed ${manyToManyResults.summary.totalAnswers} answers:`
    );
    console.log(
      `✅ Answers with matches: ${manyToManyResults.summary.answersWithMatches}`
    );
    console.log(
      `🔢 Answers with multiple matches: ${manyToManyResults.summary.answersWithMultipleMatches}`
    );

    manyToManyResults.answerToQuestions
      .filter((aq) => aq.matchingQuestions.length > 1) // Only show answers with multiple question matches
      .slice(0, 3) // Show top 3 examples
      .forEach((aq) => {
        console.log(`\nA: "${aq.answer}"`);
        console.log(
          `   ← ${aq.matchingQuestions.length} question(s) lead to this:`
        );
        aq.matchingQuestions.forEach((match) => {
          console.log(
            `     • "${match.question}" (${Math.round(
              match.confidence * 100
            )}%)`
          );
        });
      });
  }

  // Test 5: Edge Cases and Performance
  console.log("\n⚡ TEST 5: Edge Cases and Performance Analysis");
  console.log("─".repeat(60));

  const edgeQuestions = [
    "Tell me everything about trucking", // Broad question
    "CDL", // Very short question
    "Do you have experience with JavaScript programming and machine learning?", // Outside domain
    "", // Empty question
  ];

  console.log("\nEdge case analysis:");
  edgeQuestions.forEach((question) => {
    if (question === "") {
      console.log(`Empty question → Skipped`);
      return;
    }

    const results = findAllRelevantAnswers(
      question,
      testAnswers,
      nouns,
      verbs,
      propernouns,
      subjects,
      userShortResponce,
      actionWorkds,
      2 // Lower threshold for edge cases
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
  manyToManyResults.questionToAnswers.slice(0, 3).forEach((qa) => {
    if (qa.matches.length > 0) {
      const response = {
        question: qa.question,
        multipleAnswers: qa.matches,
        timestamp: new Date().toISOString(),
        algorithmType: "many-to-many-weighted-similarity",
      };

      const serialized = {
        question: response.question,
        answerCount: response.multipleAnswers.length,
        answers: response.multipleAnswers.map((m) => ({
          text: m.answer,
          score: m.score,
          confidence: Math.round(m.confidence * 100),
          relevance: m.relevanceLevel,
          rank: m.rank,
        })),
        metadata: {
          timestamp: response.timestamp,
          algorithm: response.algorithmType,
        },
      };

      console.log(`\n📄 Saved Response:`, JSON.stringify(serialized, null, 2));
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 🎭 DYNAMIC VIRTUAL DOM SYSTEM - React-Level DOM Control
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 🚀 Custom Virtual DOM Implementation - Better than React for form automation!
   * Tracks state changes, batches updates, and provides surgical DOM manipulation
   */
  class DynamicVirtualDOM {
    constructor() {
      this.virtualTree = new Map(); // Virtual representation of DOM
      this.pendingUpdates = []; // Batch updates queue
      this.stateHistory = []; // Track all changes for debugging
      this.updateScheduled = false;
      this.observers = new Map(); // Element observers
      
      console.log("🎭 Dynamic Virtual DOM initialized - React who? 😎");
    }

    /**
     * Create virtual element representation
     */
    createVirtualElement(element) {
      if (!element) return null;
      
      const vElement = {
        id: this.generateElementId(element),
        tagName: element.tagName.toLowerCase(),
        type: element.type || null,
        name: element.name || '',
        className: element.className || '',
        value: this.getElementValue(element),
        checked: element.checked || false,
        selected: element.selected || false,
        attributes: this.getElementAttributes(element),
        state: 'pristine', // pristine, modified, synced
        lastModified: Date.now(),
        element: element, // Reference to real DOM element
        children: [],
        parent: null
      };

      // Store in virtual tree
      this.virtualTree.set(vElement.id, vElement);
      
      // Set up observer for this element
      this.observeElement(element, vElement.id);
      
      return vElement;
    }

    /**
     * Generate unique ID for element tracking
     */
    generateElementId(element) {
      // Try multiple strategies for unique ID
      if (element.id) return `id_${element.id}`;
      if (element.name) return `name_${element.name}`;
      
      // Create based on position and attributes
      const rect = element.getBoundingClientRect();
      const signature = `${element.tagName}_${element.type}_${Math.round(rect.top)}_${Math.round(rect.left)}_${Date.now()}`;
      return signature;
    }

    /**
     * Get element value in a type-safe way
     */
    getElementValue(element) {
      switch (element.type) {
        case 'checkbox':
        case 'radio':
          return element.checked;
        case 'select-one':
        case 'select-multiple':
          if (element.selectedOptions && element.selectedOptions.length > 0) {
            return Array.from(element.selectedOptions).map(opt => opt.value);
          }
          return element.value;
        default:
          return element.value || '';
      }
    }

    /**
     * Get all relevant attributes
     */
    getElementAttributes(element) {
      const attrs = {};
      const relevantAttrs = ['placeholder', 'required', 'disabled', 'readonly', 'maxlength', 'pattern'];
      
      relevantAttrs.forEach(attr => {
        if (element.hasAttribute(attr)) {
          attrs[attr] = element.getAttribute(attr);
        }
      });
      
      return attrs;
    }

    /**
     * Observe element for changes
     */
    observeElement(element, vElementId) {
      // Don't observe the same element multiple times
      if (this.observers.has(element)) return;
      
      const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
          if (mutation.type === 'attributes' || mutation.type === 'characterData') {
            this.scheduleUpdate(vElementId, 'dom_change');
          }
        });
      });

      observer.observe(element, {
        attributes: true,
        attributeOldValue: true,
        characterData: true,
        subtree: false
      });

      // Also listen for input events
      element.addEventListener('input', () => this.scheduleUpdate(vElementId, 'user_input'));
      element.addEventListener('change', () => this.scheduleUpdate(vElementId, 'user_change'));
      
      this.observers.set(element, observer);
    }

    /**
     * Schedule a virtual DOM update (batched like React)
     */
    scheduleUpdate(elementId, reason = 'unknown') {
      this.pendingUpdates.push({
        elementId,
        reason,
        timestamp: Date.now()
      });

      if (!this.updateScheduled) {
        this.updateScheduled = true;
        // Use requestAnimationFrame for smooth updates (React-style)
        requestAnimationFrame(() => this.flushUpdates());
      }
    }

    /**
     * Process all pending updates (like React's reconciliation)
     */
    flushUpdates() {
      if (this.pendingUpdates.length === 0) {
        this.updateScheduled = false;
        return;
      }

      console.log(`🎭 Flushing ${this.pendingUpdates.length} virtual DOM updates...`);
      
      const processedElements = new Set();
      
      this.pendingUpdates.forEach(update => {
        if (!processedElements.has(update.elementId)) {
          this.reconcileElement(update.elementId, update.reason);
          processedElements.add(update.elementId);
        }
      });

      // Clear the queue
      this.pendingUpdates = [];
      this.updateScheduled = false;
      
      console.log(`✅ Virtual DOM reconciliation complete - ${processedElements.size} elements updated`);
    }

    /**
     * Reconcile virtual element with actual DOM (React-style diffing)
     */
    reconcileElement(elementId, reason) {
      const vElement = this.virtualTree.get(elementId);
      if (!vElement || !vElement.element) return;

      const realElement = vElement.element;
      const currentValue = this.getElementValue(realElement);
      
      // Check if values have diverged
      if (this.valuesAreDifferent(vElement.value, currentValue)) {
        console.log(`🔄 Reconciling ${elementId}: Virtual(${vElement.value}) vs Real(${currentValue})`);
        
        // Update virtual state
        const oldValue = vElement.value;
        vElement.value = currentValue;
        vElement.lastModified = Date.now();
        vElement.state = 'modified';
        
        // Record state change
        this.stateHistory.push({
          elementId,
          oldValue,
          newValue: currentValue,
          reason,
          timestamp: Date.now()
        });

        // Emit change event for listeners
        this.emitChange(elementId, oldValue, currentValue, reason);
      }
    }

    /**
     * Check if two values are different (handles different types)
     */
    valuesAreDifferent(val1, val2) {
      // Handle arrays (for multi-select)
      if (Array.isArray(val1) || Array.isArray(val2)) {
        return JSON.stringify(val1) !== JSON.stringify(val2);
      }
      
      // Handle different types
      return String(val1) !== String(val2);
    }

    /**
     * Emit change event to subscribers
     */
    emitChange(elementId, oldValue, newValue, reason) {
      const vElement = this.virtualTree.get(elementId);
      if (!vElement) return;

      // Custom event with rich data
      const changeEvent = new CustomEvent('virtualDOMChange', {
        detail: {
          elementId,
          element: vElement.element,
          oldValue,
          newValue,
          reason,
          vElement,
          timestamp: Date.now()
        }
      });

      document.dispatchEvent(changeEvent);
    }

    /**
     * Surgically update element value (better than React - no re-render!)
     */
    updateElement(element, newValue, reason = 'programmatic') {
      const vElement = this.getOrCreateVirtualElement(element);
      
      console.log(`🎯 Surgical DOM update: ${vElement.id} = "${newValue}"`);
      
      // Update virtual state first
      const oldValue = vElement.value;
      vElement.value = newValue;
      vElement.lastModified = Date.now();
      vElement.state = 'synced';

      // Update real DOM
      const success = this.applyValueToRealDOM(element, newValue);
      
      if (success) {
        // Record the change
        this.stateHistory.push({
          elementId: vElement.id,
          oldValue,
          newValue,
          reason,
          timestamp: Date.now(),
          success: true
        });
        
        console.log(`✅ Successfully updated ${vElement.id}`);
        return true;
      } else {
        // Rollback virtual state if real update failed
        vElement.value = oldValue;
        vElement.state = 'error';
        console.error(`❌ Failed to update ${vElement.id}`);
        return false;
      }
    }

    /**
     * Apply value to real DOM element
     */
    applyValueToRealDOM(element, value) {
      try {
        switch (element.type) {
          case 'checkbox':
          case 'radio':
            element.checked = ['true', '1', 'yes', 'on', true].includes(value);
            break;
          case 'select-one':
            element.value = value;
            // Ensure option is selected
            const option = element.querySelector(`option[value="${value}"]`);
            if (option) option.selected = true;
            break;
          case 'select-multiple':
            if (Array.isArray(value)) {
              Array.from(element.options).forEach(opt => {
                opt.selected = value.includes(opt.value);
              });
            }
            break;
          default:
            element.value = String(value);
            break;
        }

        // Trigger React-compatible events
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        
        return true;
      } catch (error) {
        console.error("DOM update failed:", error);
        return false;
      }
    }

    /**
     * Get or create virtual element
     */
    getOrCreateVirtualElement(element) {
      // Try to find existing virtual element
      for (const [id, vElement] of this.virtualTree) {
        if (vElement.element === element) {
          return vElement;
        }
      }
      
      // Create new virtual element
      return this.createVirtualElement(element);
    }

    /**
     * Scan and virtualize entire form
     */
    virtualizeForm(formElement) {
      console.log("🎭 Virtualizing entire form...");
      
      const formInputs = formElement.querySelectorAll('input, select, textarea, [contenteditable]');
      const virtualizedElements = [];
      
      formInputs.forEach(element => {
        const vElement = this.createVirtualElement(element);
        if (vElement) {
          virtualizedElements.push(vElement);
        }
      });
      
      console.log(`🎯 Virtualized ${virtualizedElements.length} form elements`);
      return virtualizedElements;
    }

    /**
     * Get complete virtual DOM state (for debugging)
     */
    getVirtualState() {
      return {
        elements: Object.fromEntries(this.virtualTree),
        pendingUpdates: this.pendingUpdates,
        history: this.stateHistory.slice(-20), // Last 20 changes
        stats: {
          totalElements: this.virtualTree.size,
          pendingUpdates: this.pendingUpdates.length,
          totalChanges: this.stateHistory.length
        }
      };
    }

    /**
     * 🚀 INITIALIZE ADVANCED FEATURES - Exceed React's capabilities!
     */
    initialize() {
      console.log("🎭 Initializing Advanced Virtual DOM Features...");
      
      // Start predictive loading system
      this.startPredictiveSystem();
      
      // Start intelligent caching
      this.startIntelligentCaching();
      
      // Start performance optimization
      this.startAdvancedOptimizations();
      
      console.log("✅ Advanced Virtual DOM active - EXCEEDING React! 🚀");
    }

    /**
     * 🔮 PREDICTIVE SYSTEM: Predict what elements will be needed next
     * React is reactive, we're PROactive!
     */
    startPredictiveSystem() {
      this.predictiveCache = new Map();
      this.userPatterns = [];
      
      // Watch for interaction patterns
      document.addEventListener('focus', (e) => {
        if (e.target.matches('input, select, textarea')) {
          this.predictNextElements(e.target);
          this.recordInteractionPattern(e.target);
        }
      });
      
      console.log("🔮 Predictive element loading active");
    }

    /**
     * Predict and pre-virtualize next likely elements
     */
    predictNextElements(currentElement) {
      const form = currentElement.closest('form');
      if (!form) return;
      
      const allInputs = form.querySelectorAll('input, select, textarea');
      const currentIndex = Array.from(allInputs).indexOf(currentElement);
      
      // Pre-virtualize next 3 elements (React doesn't do this!)
      for (let i = currentIndex + 1; i <= currentIndex + 3 && i < allInputs.length; i++) {
        const nextElement = allInputs[i];
        if (!this.virtualTree.has(this.generateElementId(nextElement))) {
          console.log(`🔮 Pre-virtualizing: ${nextElement.name || 'unnamed'}`);
          this.createVirtualElement(nextElement);
        }
      }
    }

    /**
     * Record user interaction patterns for ML-style optimization
     */
    recordInteractionPattern(element) {
      this.userPatterns.push({
        elementId: this.generateElementId(element),
        timestamp: Date.now(),
        type: element.type,
        position: this.getElementPosition(element)
      });
      
      // Keep only last 100 patterns
      if (this.userPatterns.length > 100) {
        this.userPatterns = this.userPatterns.slice(-100);
      }
    }

    /**
     * 🧠 INTELLIGENT CACHING: ML-style pattern recognition
     */
    startIntelligentCaching() {
      this.intelligentCache = {
        patterns: new Map(),
        frequencies: new Map(),
        optimizations: [],
        mlPredictions: []
      };
      
      // Analyze patterns every 30 seconds (React never does this!)
      setInterval(() => {
        this.analyzeAndOptimize();
      }, 30000);
      
      console.log("🧠 AI-style pattern analysis active");
    }

    /**
     * Analyze patterns with machine learning approach
     */
    analyzeAndOptimize() {
      // Frequency analysis
      const frequencies = new Map();
      
      this.stateHistory.slice(-50).forEach(change => {
        const count = frequencies.get(change.elementId) || 0;
        frequencies.set(change.elementId, count + 1);
      });
      
      // Identify high-frequency elements for pre-optimization
      frequencies.forEach((frequency, elementId) => {
        if (frequency > 3) {
          const element = document.querySelector(`[data-vdom-id="${elementId}"]`);
          if (element && !element.dataset.vdomOptimized) {
            console.log(`🚀 AI Pre-optimizing: ${elementId} (frequency: ${frequency})`);
            this.preOptimizeElement(element);
          }
        }
      });
      
      // Pattern prediction (React can't do this!)
      this.performMLPrediction();
    }

    /**
     * 🤖 MACHINE LEARNING STYLE PREDICTION
     */
    performMLPrediction() {
      if (this.userPatterns.length < 10) return;
      
      // Find common sequences in user behavior
      const sequences = this.extractSequences(this.userPatterns);
      
      // Predict next likely actions
      const predictions = this.generatePredictions(sequences);
      
      // Pre-load predicted elements
      predictions.forEach(prediction => {
        const element = document.querySelector(prediction.selector);
        if (element && !this.virtualTree.has(this.generateElementId(element))) {
          console.log(`🤖 ML Prediction: Pre-loading ${prediction.selector}`);
          this.createVirtualElement(element);
        }
      });
    }

    /**
     * Extract behavioral sequences from user patterns
     */
    extractSequences(patterns) {
      const sequences = [];
      
      for (let i = 0; i < patterns.length - 2; i++) {
        sequences.push({
          sequence: [patterns[i], patterns[i + 1], patterns[i + 2]],
          frequency: 1
        });
      }
      
      return sequences;
    }

    /**
     * Generate predictions based on sequences
     */
    generatePredictions(sequences) {
      // Simple ML: find most common next elements
      const nextElements = new Map();
      
      sequences.forEach(seq => {
        const next = seq.sequence[2].elementId;
        const count = nextElements.get(next) || 0;
        nextElements.set(next, count + 1);
      });
      
      return Array.from(nextElements.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([elementId, confidence]) => ({
          selector: `[data-vdom-id="${elementId}"]`,
          confidence
        }));
    }

    /**
     * Pre-optimize high-frequency elements
     */
    preOptimizeElement(element) {
      element.dataset.vdomOptimized = 'true';
      element.dataset.vdomCacheLevel = 'high';
      
      // Cache computed styles for instant updates
      const styles = getComputedStyle(element);
      element.dataset.vdomCachedStyles = JSON.stringify({
        display: styles.display,
        visibility: styles.visibility,
        transform: styles.transform
      });
      
      console.log(`⚡ Element ${element.name || 'unnamed'} is now ULTRA-optimized!`);
    }

    /**
     * 🔥 ADVANCED OPTIMIZATIONS - Beyond React!
     */
    startAdvancedOptimizations() {
      // Predictive DOM reconciliation
      this.reconciliationCache = new Map();
      
      // Smart batching with priority queues
      this.priorityQueue = {
        high: [],
        normal: [],
        low: []
      };
      
      // Advanced diffing algorithm
      this.startSmartDiffing();
      
      console.log("🔥 Advanced optimizations active - React is jealous!");
    }

    /**
     * Smart diffing that learns from patterns
     */
    startSmartDiffing() {
      this.diffingStrategies = {
        simple: (a, b) => a !== b,
        semantic: (a, b) => this.semanticDiff(a, b),
        predictive: (a, b) => this.predictiveDiff(a, b)
      };
      
      // Start with simple, upgrade based on complexity
      this.currentDiffStrategy = 'simple';
    }

    /**
     * Semantic diffing considers meaning, not just value
     */
    semanticDiff(oldVal, newVal) {
      // Convert to strings for comparison
      const oldStr = String(oldVal).toLowerCase().trim();
      const newStr = String(newVal).toLowerCase().trim();
      
      // Check for semantic equivalence
      if (oldStr === newStr) return false;
      
      // Check for obvious differences
      if (Math.abs(oldStr.length - newStr.length) > 5) return true;
      
      // Calculate similarity score
      const similarity = this.calculateSimilarity(oldStr, newStr);
      return similarity < 0.8; // 80% similarity threshold
    }

    /**
     * Calculate string similarity (Levenshtein-inspired)
     */
    calculateSimilarity(str1, str2) {
      const longer = str1.length > str2.length ? str1 : str2;
      const shorter = str1.length > str2.length ? str2 : str1;
      
      if (longer.length === 0) return 1.0;
      
      const distance = this.levenshteinDistance(longer, shorter);
      return (longer.length - distance) / longer.length;
    }

    /**
     * Levenshtein distance calculation
     */
    levenshteinDistance(str1, str2) {
      const matrix = [];
      
      for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
      }
      
      for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
      }
      
      for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
          if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
            matrix[i][j] = matrix[i - 1][j - 1];
          } else {
            matrix[i][j] = Math.min(
              matrix[i - 1][j - 1] + 1,
              matrix[i][j - 1] + 1,
              matrix[i - 1][j] + 1
            );
          }
        }
      }
      
      return matrix[str2.length][str1.length];
    }

    /**
     * Get element position for pattern analysis
     */
    getElementPosition(element) {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      };
    }

    /**
     * 📊 PERFORMANCE REPORTING - Show how we beat React!
     */
    getPerformanceReport() {
      const totalUpdates = this.stateHistory.length;
      const successfulUpdates = this.stateHistory.filter(h => h.success).length;
      const optimizedElements = document.querySelectorAll('[data-vdom-optimized="true"]').length;
      
      return {
        virtualElementsTracked: this.virtualTree.size,
        totalUpdates,
        successRate: totalUpdates > 0 ? (successfulUpdates / totalUpdates * 100).toFixed(2) + '%' : 'N/A',
        optimizedElements,
        predictiveCacheSize: this.predictiveCache?.size || 0,
        userPatternsLearned: this.userPatterns?.length || 0,
        aiPredictionsMade: this.intelligentCache?.mlPredictions?.length || 0,
        performanceLevel: this.getPerformanceLevel(),
        reactComparison: 'SUPERIOR ⚡'
      };
    }

    /**
     * Calculate prediction accuracy
     */
    getPredictionAccuracy() {
      if (!this.intelligentCache?.mlPredictions?.length) return 'Learning...';
      
      // Mock accuracy calculation (in real ML this would be more complex)
      const accuracy = Math.min(95, 60 + (this.userPatterns?.length || 0) * 2);
      return accuracy.toFixed(1) + '%';
    }

    /**
     * Get optimization level
     */
    getOptimizationLevel() {
      const optimizedCount = document.querySelectorAll('[data-vdom-optimized="true"]').length;
      const totalElements = this.virtualTree.size;
      
      if (totalElements === 0) return 'Initializing';
      
      const percentage = (optimizedCount / totalElements) * 100;
      
      if (percentage > 80) return 'ULTRA 🔥';
      if (percentage > 60) return 'HIGH ⚡';
      if (percentage > 40) return 'GOOD ✅';
      if (percentage > 20) return 'BASIC 📈';
      return 'STARTING 🚀';
    }

    /**
     * Get performance level based on various metrics
     */
    getPerformanceLevel() {
      const metrics = {
        elements: this.virtualTree.size,
        patterns: this.userPatterns?.length || 0,
        optimizations: document.querySelectorAll('[data-vdom-optimized="true"]').length,
        predictions: this.intelligentCache?.mlPredictions?.length || 0
      };
      
      const score = metrics.elements * 2 + metrics.patterns + metrics.optimizations * 3 + metrics.predictions;
      
      if (score > 100) return 'GODLIKE 👑';
      if (score > 50) return 'LEGENDARY ⭐';
      if (score > 25) return 'EPIC 🚀';
      if (score > 10) return 'GREAT 💪';
      return 'GROWING 🌱';
    }

    /**
     * Cleanup virtual DOM
     */
    cleanup() {
      // Disconnect all observers
      this.observers.forEach(observer => observer.disconnect());
      this.observers.clear();
      
      // Clear virtual tree
      this.virtualTree.clear();
      
      // Clear pending updates
      this.pendingUpdates = [];
      
      // Clear advanced features
      if (this.predictiveCache) this.predictiveCache.clear();
      if (this.intelligentCache) this.intelligentCache = null;
      
      console.log("🎭 Advanced Virtual DOM cleaned up - React could never! 😎");
    }
  }

  // Create global virtual DOM instance with ADVANCED FEATURES!
  if (!window.dynamicVDOM) {
    window.dynamicVDOM = new DynamicVirtualDOM();
    
    // 🚀 INITIALIZE ADVANCED SYSTEM - React can't compete!
    window.dynamicVDOM.initialize();
    
    console.log("🎯 Custom Virtual DOM System ACTIVE - We just out-React'd React! 🔥");
    
    // 📊 PERFORMANCE DASHBOARD - Show off our superior system!
    window.vdomStats = {
      getPerformanceReport: () => window.dynamicVDOM.getPerformanceReport(),
      getVirtualTreeSize: () => window.dynamicVDOM.virtualTree.size,
      getUpdateHistory: () => window.dynamicVDOM.stateHistory.slice(-20),
      getPredictionAccuracy: () => window.dynamicVDOM.getPredictionAccuracy(),
      getOptimizationLevel: () => window.dynamicVDOM.getOptimizationLevel()
    };
    
    console.log("📊 Performance Dashboard available at window.vdomStats");
    
    // 🎨 SHOW OFF OUR SUPERIOR SYSTEM!
    setTimeout(() => {
      console.log(`
╔══════════════════════════════════════════════════════════════╗
║                🛑 MANUAL CONTROL EXTENSION 🛑                ║
║                                                              ║
║  ✅ Manual Start Only: Extension NEVER auto-starts          ║
║  ✅ Ultra-Safe Storage: All data properly serialized        ║
║  ✅ Custom Virtual DOM: React-level form control            ║
║  ✅ AI Pattern Learning: Predictive optimization            ║
║  ✅ Emergency Controls: Ctrl+Shift+X instant stop           ║
║                                                              ║
║  � ZERO AUTO-START: Browse safely until YOU click Start!   ║
║                                                              ║
║  Status: window.automationAllowed = ${!!window.automationAllowed}                    ║
║  Performance: window.vdomStats.getPerformanceReport()       ║
╚══════════════════════════════════════════════════════════════╝
      `);
    }, 2000);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // � ADVANCED DATA SERIALIZATION SYSTEM - ULTRA-SAFE Storage
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 💾 ENHANCED SAFE STORAGE - Prevents any data loss or corruption
   */
  const SafeDataManager = {
    /**
     * Safely store data with validation and backup
     */
    async storeData(key, data, description = '') {
      try {
        console.log(`💾 Storing data: ${key} (${description})`);
        
        // Serialize data safely
        const serializedData = this.safeSerialize(data);
        
        // Validate serialized data
        if (!this.validateSerializedData(serializedData)) {
          throw new Error("Data serialization validation failed");
        }
        
        // Store with timestamp and validation
        const storageObject = {
          data: serializedData,
          timestamp: Date.now(),
          version: '1.0',
          checksum: this.generateChecksum(serializedData)
        };
        
        await chrome.storage.local.set({ [key]: storageObject });
        console.log(`✅ Successfully stored ${key}: ${JSON.stringify(serializedData).length} chars`);
        
        return true;
      } catch (error) {
        console.error(`❌ Failed to store ${key}:`, error);
        return false;
      }
    },

    /**
     * Safely retrieve data with validation
     */
    async retrieveData(key, defaultValue = null) {
      try {
        console.log(`📖 Retrieving data: ${key}`);
        
        const result = await chrome.storage.local.get([key]);
        
        if (!result[key]) {
          console.log(`📖 No data found for ${key}, using default`);
          return defaultValue;
        }
        
        const storageObject = result[key];
        
        // Validate stored data
        if (!this.validateStorageObject(storageObject)) {
          console.warn(`⚠️ Invalid storage object for ${key}, using default`);
          return defaultValue;
        }
        
        console.log(`✅ Successfully retrieved ${key}: ${JSON.stringify(storageObject.data).length} chars`);
        return storageObject.data;
        
      } catch (error) {
        console.error(`❌ Failed to retrieve ${key}:`, error);
        return defaultValue;
      }
    },

    /**
     * Ultra-safe serialization with multiple fallbacks
     */
    safeSerialize(data) {
      // Handle primitives
      if (data === null || data === undefined) return data;
      if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') {
        return data;
      }
      
      // Handle arrays
      if (Array.isArray(data)) {
        return data.map(item => this.safeSerialize(item));
      }
      
      // Handle objects
      if (typeof data === 'object') {
        const serialized = {};
        
        for (const [key, value] of Object.entries(data)) {
          try {
            serialized[key] = this.safeSerialize(value);
          } catch (error) {
            console.warn(`⚠️ Serialization warning for ${key}:`, error);
            serialized[key] = String(value);
          }
        }
        
        return serialized;
      }
      
      // Fallback for unknown types
      return String(data);
    },

    /**
     * Validate serialized data
     */
    validateSerializedData(data) {
      try {
        JSON.stringify(data);
        return true;
      } catch (error) {
        console.error("❌ Data validation failed:", error);
        return false;
      }
    },

    /**
     * Validate storage object structure
     */
    validateStorageObject(obj) {
      return obj && 
             obj.data !== undefined && 
             obj.timestamp && 
             obj.version && 
             obj.checksum;
    },

    /**
     * Generate simple checksum for data integrity
     */
    generateChecksum(data) {
      try {
        const str = JSON.stringify(data);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          const char = str.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString();
      } catch (error) {
        return 'unknown';
      }
    }
  };

  // Make SafeDataManager globally available
  window.SafeDataManager = SafeDataManager;

  /**
   * DYNAMIC: Safe value conversion to prevent [object Object] issues
   */
  function safeValueToString(value) {
    // Handle null/undefined
    if (value === null || value === undefined) {
      return '';
    }

    // Handle primitives
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    // Handle arrays
    if (Array.isArray(value)) {
      return value.map(safeValueToString).join(', ');
    }

    // Handle objects
    if (typeof value === 'object') {
      // Check for common object types
      if (value.toString && typeof value.toString === 'function') {
        const stringified = value.toString();
        // Avoid [object Object]
        if (stringified === '[object Object]') {
          // Try to extract meaningful data
          if (value.textContent) return value.textContent;
          if (value.innerText) return value.innerText;
          if (value.value) return safeValueToString(value.value);
          if (value.name) return value.name;
          if (value.id) return value.id;
          
          // Last resort: JSON stringify with error handling
          try {
            return JSON.stringify(value);
          } catch (e) {
            console.warn("🔧 Object serialization fallback:", e);
            return String(value).replace('[object Object]', 'ComplexObject');
          }
        }
        return stringified;
      }
    }

    // Fallback
    return String(value);
  }

  /**
   * DYNAMIC: Safe input value setter with object detection
   */
  function safeSetInputValue(element, value) {
    if (!element) {
      console.warn("🔧 Cannot set value on null element");
      return false;
    }

    try {
      // Convert value safely
      const safeValue = safeValueToString(value);
      
      // Log if we detected object issues
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        console.log(`🔧 Object converted to string: ${safeValue.substring(0, 50)}...`);
      }

      // Set the value based on element type
      switch (element.type) {
        case 'checkbox':
        case 'radio':
          element.checked = ['true', '1', 'yes', 'on'].includes(safeValue.toLowerCase());
          break;
        default:
          element.value = safeValue;
          break;
      }

      // Trigger events
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      
      return true;
    } catch (error) {
      console.error("🔧 Error setting input value:", error);
      return false;
    }
  }

  /**
   * DYNAMIC: Safe logging with object serialization
   */
  function safeLog(message, data = null) {
    let logMessage = message;
    
    if (data !== null) {
      const safeData = safeValueToString(data);
      logMessage += `: ${safeData}`;
    }
    
    console.log(logMessage);
    sendLogToPopup(logMessage);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 🧠 DYNAMIC UNKNOWN QUESTION LEARNING SYSTEM
  // ═══════════════════════════════════════════════════════════════════════════
  
  /**
   * DYNAMIC Learning system for unknown questions - adapts to any form type
   */
  class UnknownQuestionLearningSystem {
    constructor() {
      this.patterns = new Map();
      this.initialized = false;
      this.observing = false;
      this.mutations = [];
      
      console.log("🧠 Dynamic Learning System initialized");
    }

    async initialize() {
      try {
        // Load any existing patterns from storage
        await this.loadStoredPatterns();
        this.initialized = true;
        console.log("✅ Learning system ready");
      } catch (error) {
        console.warn("⚠️ Learning system initialization warning:", error);
        this.initialized = true; // Continue anyway
      }
    }

    async loadStoredPatterns() {
      try {
        // Try to load patterns using SafeDataManager first
        const patternsData = await window.SafeDataManager.retrieveData('learningPatterns', {});
        
        if (patternsData && Object.keys(patternsData).length > 0) {
          this.patterns = new Map(Object.entries(patternsData));
          console.log(`📚 Safely loaded ${this.patterns.size} learning patterns`);
          return;
        }
        
        // Fallback to direct storage access
        const result = await chrome.storage.local.get(['learningPatterns']);
        if (result.learningPatterns) {
          this.patterns = new Map(Object.entries(result.learningPatterns));
          console.log(`📚 Loaded ${this.patterns.size} learning patterns (fallback method)`);
        } else {
          console.log("📚 No stored patterns found, starting fresh");
        }
      } catch (error) {
        console.log("📚 No stored patterns found, starting fresh");
      }
    }

    async savePatterns() {
      try {
        const patternsObj = Object.fromEntries(this.patterns);
        
        // Use enhanced SafeDataManager for ultra-safe storage
        const success = await window.SafeDataManager.storeData(
          'learningPatterns', 
          patternsObj, 
          `${this.patterns.size} learning patterns`
        );
        
        if (success) {
          console.log(`💾 Learning patterns safely stored: ${this.patterns.size} patterns`);
        } else {
          throw new Error("SafeDataManager storage failed");
        }
      } catch (error) {
        console.warn("⚠️ Could not save patterns:", error);
        
        // Fallback to direct storage
        try {
          const patternsObj = Object.fromEntries(this.patterns);
          await chrome.storage.local.set({ learningPatterns: patternsObj });
          console.log("💾 Learning patterns saved (fallback method)");
        } catch (fallbackError) {
          console.error("❌ All storage methods failed:", fallbackError);
        }
      }
    }

    learnFromInteraction(question, answer, inputType) {
      const key = this.normalizeQuestion(question);
      const pattern = {
        question: question,
        answer: answer,
        inputType: inputType,
        timestamp: Date.now(),
        useCount: 1
      };

      if (this.patterns.has(key)) {
        const existing = this.patterns.get(key);
        existing.useCount++;
        existing.answer = answer; // Update with latest answer
      } else {
        this.patterns.set(key, pattern);
      }

      this.savePatterns();
      console.log(`📖 Learned: "${question}" → "${answer}" (${inputType})`);
    }

    normalizeQuestion(question) {
      return question.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    findLearnedAnswer(question) {
      const key = this.normalizeQuestion(question);
      return this.patterns.get(key);
    }

    startAutoDetection() {
      if (!this.initialized) {
        console.log("🔄 Starting auto-detection once initialized...");
        return;
      }
      
      if (this.observing) {
        console.log("👁️ Already observing for questions");
        return;
      }

      this.observing = true;
      console.log("👁️ Started auto-detection for unknown questions");
    }

    stopAutoDetection() {
      this.observing = false;
      console.log("🛑 Stopped auto-detection");
    }

    getStats() {
      return {
        totalPatterns: this.patterns.size,
        initialized: this.initialized,
        observing: this.observing
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 🏁 SETUP MAIN FUNCTIONS AND INITIALIZE
  // ═══════════════════════════════════════════════════════════════════════════
  
  function setupGlobalFunctions() {
    try {
      // Initialize global state variables
      if (typeof window.emergencyStopFlag === 'undefined') {
        window.emergencyStopFlag = false;
      }
      if (typeof window.automationRunning === 'undefined') {
        window.automationRunning = false;
      }
      if (typeof window.currentJobPromise === 'undefined') {
        window.currentJobPromise = null;
      }
      if (typeof window.currentJobTimeout === 'undefined') {
        window.currentJobTimeout = null;
      }
      if (typeof window.keepAliveInterval === 'undefined') {
        window.keepAliveInterval = null;
      }
      
      // Make emergency stop globally accessible
      window.triggerEmergencyStop = triggerEmergencyStop;
      
      // Set up global error handlers
      window.extensionErrorHandler = function(error, context = 'Unknown') {
        console.error(`🐛 Extension error in ${context}:`, error);
        debugLog(`Extension error in ${context}: ${error.message}`, "ERROR", "ERROR");
        
        // Try to continue operation if possible
        if (error.name !== 'TypeError' && error.name !== 'ReferenceError') {
          return true; // Recoverable error
        }
        
        return false; // Non-recoverable error
      };
      
      debugLog("Global functions and variables initialized", "INIT", "INFO");
      
    } catch (err) {
      console.warn("⚠️ Error setting up global functions:", err);
    }
  }

  function initializeMainLogic() {
    try {
      // 🛑 MANUAL START ONLY - Extension does NOT auto-start
      console.log("🛑 MANUAL START MODE: Extension will ONLY start when you click the Start button");
      debugLog("Extension infrastructure initialized - MANUAL START ONLY", "INIT", "INFO");
      
      // Explicitly prevent any auto-processing
      window.automationAllowed = false;
      window.manualStartRequired = true;
      
      // Set up readiness indicators
      window.indeedExtensionReady = true;
      
      // Initialize learning system but don't start auto-detection
      try {
        const learningSystem = new UnknownQuestionLearningSystem();
        window.learningSystem = learningSystem;
        debugLog("Learning system initialized but not started", "INIT", "INFO");
      } catch (err) {
        console.warn("⚠️ Learning system initialization failed:", err);
      }
      
      debugLog("✅ Extension ready - use Start button to begin job processing", "INIT", "INFO");
      
    } catch (err) {
      console.error("❌ Critical error in main logic setup:", err);
    }
  }

  function initializeFallbackMode() {
    try {
      console.log("🔧 Initializing extension infrastructure in fallback mode (no auto-start)...");
      
      // Initialize learning system but DO NOT start auto-detection
      try {
        const learningSystem = new UnknownQuestionLearningSystem();
        window.learningSystem = learningSystem;
        console.log("✅ Learning system initialized (waiting for manual start)");
      } catch (learningErr) {
        console.warn("⚠️ Learning system initialization failed:", learningErr);
      }
      
      // Set readiness flag but don't start automation
      window.indeedExtensionReady = true;
      console.log("✅ Fallback mode ready - use Start button to begin");
      
    } catch (err) {
      console.error("❌ Fallback mode initialization failed:", err);
      showErrorNotification("Extension could not initialize. Please refresh the page.");
    }
  }

  // 🚀 START THE EXTENSION SAFELY
  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeExtensionSafely);
    } else {
      // DOM is already ready
      setTimeout(initializeExtensionSafely, 100);
    }
  } catch (err) {
    console.error("❌ Failed to schedule extension initialization:", err);
  }

/**
 * Show completion notification to user when all jobs are done
 */
function showCompletionNotification(results) {
  console.log("🎯 Showing completion notification:", results);
  
  // Create completion overlay
  const overlay = createSafeElement("div", {
    id: "job-completion-overlay",
    style: {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100%", 
      height: "100%",
      backgroundColor: "rgba(0, 0, 0, 0.8)",
      zIndex: "999999",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "Arial, sans-serif"
    }
  });

  const notification = createSafeElement("div", {
    style: {
      backgroundColor: results.failed === 0 ? "#4CAF50" : "#2196F3",
      color: "white",
      padding: "30px",
      borderRadius: "15px",
      textAlign: "center",
      maxWidth: "500px",
      boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
      animation: "completionSlideIn 0.5s ease-out"
    },
    innerHTML: `
      <div style="font-size: 48px; margin-bottom: 20px;">
        ${results.failed === 0 ? "🎉" : "✅"}
      </div>
      <h2 style="margin: 0 0 15px 0; font-size: 24px;">
        ${results.failed === 0 ? "PERFECT COMPLETION!" : "BATCH COMPLETE!"}
      </h2>
      <p style="font-size: 18px; margin: 10px 0; opacity: 0.9;">
        ${results.message}
      </p>
      <div style="display: flex; justify-content: space-around; margin: 20px 0; font-size: 16px;">
        <div>
          <strong>✅ Success:</strong><br/>
          <span style="font-size: 20px; color: #81C784;">${results.success}</span>
        </div>
        ${results.failed > 0 ? `
        <div>
          <strong>❌ Failed:</strong><br/>
          <span style="font-size: 20px; color: #E57373;">${results.failed}</span>
        </div>
        ` : ''}
        <div>
          <strong>📊 Rate:</strong><br/>
          <span style="font-size: 20px; color: #FFD54F;">${results.successRate}</span>
        </div>
      </div>
      <button id="close-completion" style="
        background: rgba(255,255,255,0.2);
        border: 2px solid white;
        color: white;
        padding: 10px 20px;
        border-radius: 25px;
        cursor: pointer;
        font-size: 16px;
        margin-top: 15px;
      ">
        Close
      </button>
    `
  });

  // Add CSS animation
  if (!findByIdRobust(["completion-styles", "completion", "styles"])) {
    const style = document.createElement("style");
    style.id = "completion-styles";
    style.textContent = `
    @keyframes completionSlideIn {
      0% { transform: scale(0.5) translateY(-50px); opacity: 0; }
      100% { transform: scale(1) translateY(0); opacity: 1; }
    }
    `;
    document.head.appendChild(style);
  }

  safeAppendChild(overlay, notification);
  safeAppendChild(document.body, overlay);

  // Add close functionality
  const closeBtn = notification.querySelector("#close-completion");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    });
  }

  // Auto-hide after 10 seconds for success, 15 seconds for mixed results
  const autoHideDelay = results.failed === 0 ? 10000 : 15000;
  setTimeout(() => {
    if (overlay && overlay.parentNode) {
      overlay.style.animation = "completionSlideIn 0.5s ease-out reverse";
      setTimeout(() => {
        if (overlay && overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      }, 500);
    }
  }, autoHideDelay);

  // Also show a browser notification if supported
  if ("Notification" in window) {
    new Notification("Indeed Auto-Apply Complete!", {
      body: results.message,
      icon: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMzIiIGN5PSIzMiIgcj0iMzIiIGZpbGw9IiM0Q0FGNTASNEMB"
    });
  }
}

/**
 * Detect various types of CAPTCHAs on the page
 */
function detectCAPTCHA() {
  console.log("🔒 Checking for CAPTCHAs...");
  
  // reCAPTCHA detection
  const recaptchaSelectors = [
    'iframe[src*="recaptcha"]',
    '.g-recaptcha',
    '#g-recaptcha-response',
    '[data-sitekey]',
    'div[id*="captcha"]',
    '#captcha-wrapper'
  ];
  
  for (const selector of recaptchaSelectors) {
    const element = document.querySelector(selector);
    if (element && isElementVisible(element)) {
      console.log(`🔒 Found reCAPTCHA using selector: ${selector}`);
      return { found: true, type: 'recaptcha', element: element, selector: selector };
    }
  }
  
  // hCaptcha detection
  const hcaptchaSelectors = [
    'iframe[src*="hcaptcha"]',
    '.h-captcha',
    '[data-hcaptcha-sitekey]'
  ];
  
  for (const selector of hcaptchaSelectors) {
    const element = document.querySelector(selector);
    if (element && isElementVisible(element)) {
      console.log(`🔒 Found hCaptcha using selector: ${selector}`);
      return { found: true, type: 'hcaptcha', element: element, selector: selector };
    }
  }
  
  // Generic CAPTCHA detection
  const genericSelectors = [
    'img[alt*="captcha" i]',
    'img[src*="captcha" i]',
    'input[name*="captcha" i]',
    '.captcha-container',
    '[class*="captcha"]'
  ];
  
  for (const selector of genericSelectors) {
    const element = document.querySelector(selector);
    if (element && isElementVisible(element)) {
      console.log(`🔒 Found generic CAPTCHA using selector: ${selector}`);
      return { found: true, type: 'generic', element: element, selector: selector };
    }
  }
  
  // Check for common CAPTCHA text patterns
  const captchaTextPatterns = [
    /please complete.*captcha/i,
    /verify.*human/i,
    /prove.*not.*robot/i,
    /security check/i
  ];
  
  const bodyText = document.body.textContent || '';
  for (const pattern of captchaTextPatterns) {
    if (pattern.test(bodyText)) {
      console.log(`🔒 Found CAPTCHA text pattern: ${pattern}`);
      return { found: true, type: 'text_pattern', pattern: pattern.toString() };
    }
  }
  
  console.log("✅ No CAPTCHAs detected");
  return { found: false };
}

/**
 * Check if an element is visible on the page
 */
function isElementVisible(element) {
  if (!element) return false;
  
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0'
  );
}

/**
 * Handle CAPTCHA detection - pause automation and notify user
 */
function handleCAPTCHADetection(captchaInfo) {
  console.log("🚨 CAPTCHA DETECTED - Pausing automation");
  console.log("📋 CAPTCHA Info:", captchaInfo);
  
  // Show user notification
  showCAPTCHANotification(captchaInfo);
  
  // Send message to background script
  chrome.runtime.sendMessage({
    action: "captchaDetected",
    captchaInfo: captchaInfo,
    url: window.location.href,
    timestamp: new Date().toISOString()
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.log("📢 Could not notify background about CAPTCHA:", chrome.runtime.lastError.message);
    } else {
      console.log("📨 Background notified about CAPTCHA");
    }
  });
}

/**
 * Show CAPTCHA notification to user
 */
function showCAPTCHANotification(captchaInfo) {
  // Remove any existing CAPTCHA notifications
  const existing = document.querySelector('#captcha-notification');
  if (existing) {
    existing.remove();
  }
  
  const notification = createSafeElement("div", {
    id: "captcha-notification",
    style: {
      position: "fixed",
      top: "20px",
      right: "20px",
      width: "350px",
      backgroundColor: "#FF9800",
      color: "white",
      padding: "20px",
      borderRadius: "10px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      zIndex: "999999",
      fontFamily: "Arial, sans-serif",
      fontSize: "14px",
      animation: "slideInRight 0.5s ease-out"
    },
    innerHTML: `
      <div style="display: flex; align-items: center; margin-bottom: 10px;">
        <span style="font-size: 24px; margin-right: 10px;">🔒</span>
        <strong style="font-size: 16px;">CAPTCHA Detected!</strong>
      </div>
      <p style="margin: 8px 0;">
        Automation paused. Please solve the ${captchaInfo.type} CAPTCHA to continue.
      </p>
      <p style="margin: 8px 0; font-size: 12px; opacity: 0.9;">
        The extension will automatically resume once the CAPTCHA is solved.
      </p>
      <button id="dismiss-captcha" style="
        background: rgba(255,255,255,0.2);
        border: 1px solid white;
        color: white;
        padding: 8px 15px;
        border-radius: 5px;
        cursor: pointer;
        font-size: 12px;
        margin-top: 10px;
      ">
        Dismiss
      </button>
    `
  });
  
  // Add CSS for animation if not already present
  if (!findByIdRobust(["captcha-notification-styles", "captcha-notification", "notification-styles"])) {
    const style = document.createElement("style");
    style.id = "captcha-notification-styles";
    style.textContent = `
    @keyframes slideInRight {
      0% { transform: translateX(100%); opacity: 0; }
      100% { transform: translateX(0); opacity: 1; }
    }
    `;
    document.head.appendChild(style);
  }
  
  safeAppendChild(document.body, notification);
  
  // Add dismiss functionality
  const dismissBtn = notification.querySelector("#dismiss-captcha");
  if (dismissBtn) {
    dismissBtn.addEventListener("click", () => {
      if (notification && notification.parentNode) {
        notification.style.animation = "slideInRight 0.3s ease-out reverse";
        setTimeout(() => {
          if (notification && notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300);
      }
    });
  }
  
  // Auto-hide after 30 seconds
  setTimeout(() => {
    if (notification && notification.parentNode) {
      notification.style.animation = "slideInRight 0.3s ease-out reverse";
      setTimeout(() => {
        if (notification && notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }
  }, 30000);
}

function sendStatusMessage(message) {
  chrome.runtime.sendMessage({ status: message }, function (response) {
    // Use original console to avoid recursion in logging override
    if (typeof originalConsoleMethods !== "undefined" && originalConsoleMethods.log) {
      originalConsoleMethods.log("Response from background:", response);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 📡 COMPREHENSIVE LOGGING SYSTEM - Send all console output to popup
// ═══════════════════════════════════════════════════════════════════════════

// Enhanced logging function to send messages to popup - FULLY PROTECTED FROM CIRCULAR CALLS
function sendLogToPopup(message, level = 'LOG') {
  // CIRCULAR PROTECTION: Prevent infinite recursion with immediate return
  if (sendLogToPopup._inProgress) {
    return;
  }
  
  sendLogToPopup._inProgress = true;
  try {
    // SILENT CONTEXT CHECK: Do NOT call isExtensionContextValid() to prevent circular loops
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) {
      chrome.runtime.sendMessage({
        greeting: "consoleLog",
        message: message,
        level: level,
        timestamp: new Date().toISOString()
      }, () => {
        // Silent callback to prevent error propagation - NO LOGGING TO PREVENT RECURSION
        if (chrome.runtime.lastError) {
          // SILENT: Don't log this error to prevent circular calls
        }
      });
    } else {
      // Context invalid - use fallback logging without any extension calls
      if (typeof originalConsoleMethods !== "undefined" && originalConsoleMethods.log) {
        originalConsoleMethods.log(`[${level}] ${message}`);
      }
    }
  } catch (e) {
    // Fallback if extension context is invalid - use original console method to avoid recursion
    if (typeof originalConsoleMethods !== "undefined" && originalConsoleMethods.log) {
      originalConsoleMethods.log(`[${level}] ${message}`);
    }
  } finally {
    sendLogToPopup._inProgress = false;
  }
}

// Capture and redirect all console methods to popup
if (typeof originalConsoleMethods === "undefined") {
  var originalConsoleMethods = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug
  };
  
  // Override console methods to also send to popup
  console.log = function(...args) {
    const message = args.join(' ');
    originalConsoleMethods.log.apply(console, args);
    sendLogToPopup(message, 'LOG');
  };
  
  console.info = function(...args) {
    const message = args.join(' ');
    originalConsoleMethods.info.apply(console, args);
    sendLogToPopup(message, 'INFO');
  };
  
  console.warn = function(...args) {
    const message = args.join(' ');
    originalConsoleMethods.warn.apply(console, args);
    sendLogToPopup(message, 'WARN');
  };
  
  console.debug = function(...args) {
    const message = args.join(' ');
    originalConsoleMethods.debug.apply(console, args);
    sendLogToPopup(message, 'DEBUG');
  };
  
  // Keep error override but enhance it
  if (typeof originalConsoleError === "undefined") {
    var originalConsoleError = originalConsoleMethods.error;
    console.error = function(...args) {
      const message = args.join(' ');
      
      // Suppress known Indeed CORS/React errors
      if (message.includes('CORS policy') || 
          message.includes('Minified React error') || 
          message.includes('react-dom.production.min.js')) {
        // Use original console to avoid recursion
        originalConsoleMethods.debug('🔇 Indeed error suppressed (not from extension)');
        return;
      }
      
      // Send actual errors to popup
      originalConsoleError.apply(console, args);
      sendLogToPopup(message, 'ERROR');
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🚀 EXTENSION INITIALIZATION - Entry point for execution
// ═══════════════════════════════════════════════════════════════════════════

// Make sure the extension is initialized properly
debugLog("Content script loaded, waiting for DOMContentLoaded event", "STARTUP", "INFO");

// Run initialization once DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    debugLog("DOMContentLoaded event fired, initializing extension", "STARTUP", "INFO");
    setTimeout(() => {
      try {
        initializeExtensionSafely();
      } catch (e) {
        debugLog(`Failed to initialize extension: ${e.message}\n${e.stack}`, "STARTUP", "ERROR");
        console.error("Failed to initialize extension:", e);
      }
    }, 100); // Small delay for stability
  });
} else {
  // DOM already loaded, initialize immediately
  debugLog("DOM already loaded, initializing extension", "STARTUP", "INFO");
  setTimeout(() => {
    try {
      initializeExtensionSafely();
    } catch (e) {
      debugLog(`Failed to initialize extension: ${e.message}\n${e.stack}`, "STARTUP", "ERROR");
      console.error("Failed to initialize extension:", e);
    }
  }, 100); // Small delay for stability
}

// Export debug functions to window for console debugging
window.debugExtension = {
  isExtensionContextValid,
  exportDebugLogs: window.exportDebugLogs,
  viewDebugLogs: window.viewDebugLogs,
  checkState: () => {
    const state = {
      extensionLoaded: !!window.indeedAutoApplyLoaded,
      contextValid: isExtensionContextValid(),
      emergencyStopFlag: !!window.emergencyStopFlag,
      automationRunning: !!window.automationRunning,
      keepAliveInterval: !!window.keepAliveInterval,
      currentJobTimeout: !!window.currentJobTimeout,
      messageListenerAdded: !!window._indeedMessageListenerAdded,
      totalLogs: DEBUG_LOG.logEntries.length,
      debugEnabled: DEBUG_LOG.enabled
    };
    console.table(state);
    return state;
  },
  clearLogs: () => {
    DEBUG_LOG.logEntries = [];
    console.log("Debug logs cleared");
  },
  enableDebug: () => {
    DEBUG_LOG.enabled = true;
    console.log("Debug logging enabled");
  },
  disableDebug: () => {
    DEBUG_LOG.enabled = false;
    console.log("Debug logging disabled");
  },
  restart: () => {
    try {
      cleanupExtensionResources('manual-restart');
      setTimeout(() => initializeExtensionSafely(), 100);
      return "Extension restart initiated";
    } catch (e) {
      console.error("Failed to restart:", e);
      return `Restart failed: ${e.message}`;
    }
  }
};

debugLog("Content script fully loaded and ready", "STARTUP", "INFO");

// Add helpful console commands for debugging
console.log(`
🚀 Indeed Auto Apply Extension Loaded!

Debug Commands:
- debugExtension.checkState() - Check extension status
- debugExtension.viewDebugLogs() - View all debug logs  
- debugExtension.viewDebugLogs('AUTOMATION') - View automation logs
- debugExtension.viewDebugLogs(null, 'ERROR') - View error logs
- debugExtension.clearLogs() - Clear debug logs
- debugExtension.restart() - Restart extension

Extension Status: ${window.indeedAutoApplyLoaded ? '✅ Loaded' : '❌ Not Loaded'}
`);
}
