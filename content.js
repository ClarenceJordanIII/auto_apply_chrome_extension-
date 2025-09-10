// ═══════════════════════════════════════════════════════════════════════════
// 🚫 PREVENT BACK/FORWARD CACHE - Keep page active to prevent caching
// ═══════════════════════════════════════════════════════════════════════════
console.log("🚀 Content script loaded - preventing cache...");

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

document.addEventListener("click", () => {
  console.log("Content script clicked!");
});

// ═══════════════════════════════════════════════════════════════════════════
// 🛠️ ASYNC UTILITY FUNCTIONS - Wait for elements to be mounted
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
    const jobLink = jobLinkEl?.href || null;
    const jobId = jobLinkEl?.getAttribute("data-jk") || jobLinkEl?.id || null;

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

function acceptLegalDisclaimer() {
  // Check all checkboxes for legal acceptance
  const checkboxes = document.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach((checkbox) => {
    if (!checkbox.checked) {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
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
async function completeApplicationWorkflow() {
  const results = [];
  try {
    results.push(await fillContactFieldsAsync());
    results.push(await fillScreenerQuestionsAsync());
    results.push(await fillResumeSectionAsync());
    results.push(await fillSupportingDocumentsAsync());
    results.push(await acceptLegalDisclaimerAsync());
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

// Listen for message to trigger full workflow
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "completeApplicationWorkflow") {
    completeApplicationWorkflow().then((success) => {
      sendResponse({ success });
    });
    return true; // Indicates async response
  }
});

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
 * Wait for a single element to be present in the DOM
 */
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    function checkForElement() {
      const element = document.querySelector(selector);
      if (element) {
        console.log(`✅ Found element with selector: ${selector}`);
        resolve(element);
      } else if (Date.now() - startTime > timeout) {
        console.log(`⏰ Timeout waiting for element: ${selector}`);
        resolve(null);
      } else {
        setTimeout(checkForElement, 100);
      }
    }
    
    checkForElement();
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
  console.log("🎓 Handling education question...");
  
  // Handle selects for degree levels
  const selectInput = pageData.selects.find(select => select.label === question.label);
  if (selectInput) {
    const educationValue = getEducationValue(question.label);
    selectInput.element.value = educationValue;
    selectInput.element.dispatchEvent(new Event('change', { bubbles: true }));
    console.log(`✅ Selected education: ${educationValue}`);
    return true;
  }
  
  // Handle text inputs for school names, etc.
  const textInput = pageData.textInputs.find(input => input.label === question.label);
  if (textInput) {
    const educationText = getEducationText(question.label);
    textInput.element.value = educationText;
    textInput.element.dispatchEvent(new Event('input', { bubbles: true }));
    textInput.element.dispatchEvent(new Event('change', { bubbles: true }));
    console.log(`✅ Filled education: ${educationText}`);
    return true;
  }
  
  console.log("⚠️ Could not find education input field");
  return false;
}

async function handleGenericQuestion(question, pageData) {
  console.log("❓ Handling generic question...");
  
  // Try radio buttons first
  const radioGroup = Object.values(pageData.radioGroups).find(group => 
    group.label === question.label
  );
  
  if (radioGroup && radioGroup.options.length > 0) {
    // Try to select a reasonable option (Yes > first option)
    const yesOption = radioGroup.options.find(opt => 
      opt.element.value.toLowerCase() === 'yes' || 
      opt.element.value === '1'
    ) || radioGroup.options[0];
    
    await clickRadioButton(yesOption.element);
    console.log("✅ Selected option for generic question");
    return true;
  }
  
  // Try text inputs
  const textInput = pageData.textInputs.find(input => input.label === question.label);
  if (textInput) {
    textInput.element.value = 'N/A';
    textInput.element.dispatchEvent(new Event('input', { bubbles: true }));
    console.log("✅ Filled generic text input");
    return true;
  }
  
  console.log("⚠️ Could not handle generic question");
  return false;
}

async function fillEmployerQuestions() {
  console.log("📝 NEW APPROACH: Starting employer questions with page scraping...");
  
  try {
    // Step 1: Scrape the entire page to map all elements
    const pageData = await scrapePageElements();
    
    // Step 2: Process using VERSION 2.0 aggressive filtering with starter patterns
    const processed = await processScrapedElementsV2(pageData);
    
    for (let i = 0; i < questionContainers.length; i++) {
      const container = questionContainers[i];
      console.log(`\n🔍 Processing question ${i + 1}/${questionContainers.length}`);
      
      try {
        // Wait for question label/text to be available using multiple dynamic selectors
        console.log("⏳ Waiting for question label...");
        const labelElement = await waitForElementInContainer(container, 'label, legend, [data-testid*="label"], [data-testid*="rich-text"], span[data-testid*="rich-text"]');
        const labelText = labelElement ? 
          (labelElement.textContent || labelElement.innerText || '').toLowerCase().trim() : '';
        
        console.log(`📝 Question label: "${labelText}"`);
        
        if (labelText) {
          // Check for different input types and fill accordingly
          await fillQuestionByType(container, labelText);
          filledCount++;
        } else {
          console.log("⚠️ No label found for question container");
        }
        
        // Small delay between questions
        await new Promise(r => setTimeout(r, 300));
        
      } catch (questionError) {
        console.error(`❌ Error processing question ${i + 1}:`, questionError.message);
      }
    }
    
    console.log(`✅ Successfully filled ${filledCount} questions`);
    
    // After filling all questions, look for and click the continue button
    console.log("🔍 Looking for Continue button after filling questions...");
    
    const continueSelectors = [
      // Generic selectors that should work across different pages
      'button[data-testid*="continue"]',
      'button.mosaic-provider-module-apply-questions-6xgesl', // Questions page continue button
      'button[type="submit"]',
      // Look for buttons in the questions container
      '.ia-Questions button[type="button"]',
      '.mosaic-provider-module-apply-questions button[type="button"]',
      '[class*="apply-questions"] button',
      'button[class*="6xgesl"]' // Dynamic class pattern for continue buttons
    ];
    
    let continueButton = null;
    
    // Wait for Continue button to be available using promises
    console.log("⏳ Waiting for Continue button to be available...");
    for (const selector of continueSelectors) {
      try {
        continueButton = await waitForElement(selector, 3000);
        if (continueButton) {
          console.log(`✅ Found Continue button with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Ignore selector errors and try next selector
     
      }
    }
    
    // If no button found, wait for buttons to load and search by text content
    if (!continueButton) {
      console.log("⏳ Waiting for buttons to load for text-based search...");
      await new Promise(r => setTimeout(r, 1000)); // Wait for buttons to render
      
      const allButtons = document.querySelectorAll('button, input[type="submit"], input[type="button"]');
      for (const btn of allButtons) {
        const text = (btn.textContent || btn.value || '').toLowerCase().trim();
        if (text.includes('continue') || text.includes('next') || text.includes('proceed') || text.includes('apply anyway')) {
          continueButton = btn;
          console.log(`✅ Found Continue button by text: "${text}"`);
          break;
        }
      }
    }
    
    if (continueButton) {
      // Scroll to the button to ensure it's visible
      continueButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise(r => setTimeout(r, 500));
      
      console.log("🔄 Clicking Continue button after questions...");
      continueButton.click();
      console.log("✅ Clicked Continue button");
      
      // Wait to see if the page changes
      await new Promise(r => setTimeout(r, 2500));
    } else {
      console.log("❌ Could not find Continue button after filling questions");
    }
    
  } catch (error) {
    console.error("❌ Error in fillEmployerQuestions:", error.message);
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
  
  // 1. NUMBER INPUTS (years of experience, age, etc.) - Check first since they're also text inputs
  console.log("⏳ Waiting for number input...");
  const numberInput = await waitForElementInContainer(container, 'input[type="number"], input[inputmode="numeric"], input[inputmode="text"][min], input[id*="number-input"], input[data-testid*="input"][min]');
  if (numberInput) {
    console.log(`📝 Found number input for: "${labelText}", current value: "${numberInput.value}"`);
    if (!numberInput.value) {
      const value = getNumberInputValue(labelText);
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
      const value = getTextInputValue(labelText);
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
      const value = getTextareaValue(labelText);
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
function getTextInputValue(labelText) {
  const text = labelText.toLowerCase();
  
  // Address fields
  if (text.includes('address') || text.includes('street')) {
    return '123 Main Street';
  }
  if (text.includes('city')) {
    return 'Dallas';
  }
  if (text.includes('state') || text.includes('province')) {
    return 'TX';
  }
  if (text.includes('zip') || text.includes('postal')) {
    return '75201';
  }
  
  // Contact info
  if (text.includes('phone') || text.includes('mobile') || text.includes('cell')) {
    return '(555) 123-4567';
  }
  if (text.includes('email')) {
    return 'john.doe.jobs@gmail.com';
  }
  if (text.includes('emergency contact')) {
    return 'Jane Doe - (555) 987-6543';
  }
  
  // Professional info
  if (text.includes('linkedin')) {
    return 'https://www.linkedin.com/in/johndoe';
  }
  if (text.includes('website') || text.includes('portfolio') || text.includes('blog')) {
    return 'https://johndoe-portfolio.com';
  }
  if (text.includes('github')) {
    return 'https://github.com/johndoe';
  }
  if (text.includes('referred') || text.includes('referral') || text.includes('how did you hear')) {
    return 'Online job search';
  }
  if(text.includes("How many years ")){
    return "4"
  }
  // Salary/compensation
  if (text.includes('salary') || text.includes('wage') || text.includes('pay') || text.includes('compensation')) {
    return 'Competitive/Negotiable';
  }
  
  // Previous employer info
  if (text.includes('previous employer') || text.includes('last company') || text.includes('current employer')) {
    return 'ABC Company';
  }
  if (text.includes('supervisor') || text.includes('manager') || text.includes('boss')) {
    return 'John Smith';
  }
  
  // Education
  if (text.includes('school') || text.includes('university') || text.includes('college')) {
    return 'State University';
  }
  if (text.includes('major') || text.includes('degree field')) {
    return 'Business Administration';  
  }
  if (text.includes('gpa')) {
    return '3.5';
  }
  
  // Certifications and licenses
  if (text.includes('certification') || text.includes('license number')) {
    return 'Valid - Details available upon request';
  }
  
  // Skills and tools
  if (text.includes('software') || text.includes('tools') || text.includes('programs')) {
    return 'Microsoft Office, Google Workspace';
  }
  if (text.includes('programming') || text.includes('coding')) {
    return 'JavaScript, Python, HTML/CSS';
  }
  
  // Work preferences
  if (text.includes('notice period') || text.includes('availability date')) {
    return '2 weeks';
  }
  if (text.includes('start date')) {
    return 'Immediately';
  }
  
  // Generic text field
  return 'Available upon request';
}

/**
 * Get appropriate value for textarea based on label
 */
function getTextareaValue(labelText) {
  const text = labelText.toLowerCase();
  
  if (text.includes('desired pay') || text.includes('salary') || text.includes('wage') || text.includes('compensation')) {
    return 'Competitive salary based on experience and market standards';
  }
  if (text.includes('cover letter')) {
    return 'I am excited to apply for this position and believe my skills and experience make me a great fit for your team. I am eager to contribute to your organization and grow professionally.';
  }
  
  // Visa/sponsorship questions in textarea format
  if (text.includes('visa') || text.includes('sponsorship') || text.includes('h-1b') || text.includes('work authorization')) {
    return 'No, I do not require sponsorship for employment visa status. I am authorized to work in the United States.';
  }
  
  if (text.includes('why do you want') || text.includes('why are you interested')) {
    return 'This role aligns perfectly with my career goals and offers the opportunity to utilize my skills while contributing to a dynamic team.';
  }
  
  // Indeed's "Reason for applying" question
  if (text.includes('reason for applying') || text.includes('reason for') || text.includes('applying')) {
    return 'I am drawn to this position because it offers an excellent opportunity to utilize my skills and experience while contributing to a growing organization. The role aligns with my career goals and I am excited about the potential to make a meaningful impact on the team.';
  }
  
  if (text.includes('experience') || text.includes('background') || text.includes('relevant')) {
    return 'I have relevant experience in this field with a proven track record of success. I am committed to delivering quality results and continuous learning.';
  }
  if (text.includes('strength') || text.includes('skills')) {
    return 'My key strengths include strong communication skills, problem-solving abilities, attention to detail, and the ability to work effectively both independently and as part of a team.';
  }
  if (text.includes('goal') || text.includes('objective') || text.includes('career')) {
    return 'My goal is to contribute to a successful team while developing my professional skills and advancing my career in this field.';
  }
  if (text.includes('challenge') || text.includes('difficult situation')) {
    return 'I approach challenges with a positive attitude and systematic problem-solving approach. I believe in learning from every experience and adapting to find effective solutions.';
  }
  if (text.includes('additional') || text.includes('anything else') || text.includes('comments')) {
    return 'I am enthusiastic about this opportunity and would welcome the chance to discuss how my background and skills can contribute to your team. Thank you for your consideration.';
  }
  if (text.includes('availability') || text.includes('schedule')) {
    return 'I am flexible with scheduling and available to work various shifts as needed. I can start immediately or with appropriate notice period.';
  }
  if (text.includes('education') || text.includes('qualifications')) {
    return 'I have the necessary educational background and qualifications for this role, with a commitment to ongoing professional development.';
  }
  
  return 'I am highly motivated and believe I would be a valuable addition to your team. I look forward to the opportunity to contribute to your organization.';
}

/**
 * Get appropriate value for number inputs (years of experience, etc.)
 */
function getNumberInputValue(labelText) {
  const text = labelText.toLowerCase();
  
  // Years of experience questions
  if (text.includes('years') && text.includes('experience')) {
    // Technical leadership
    if (text.includes('technical') && (text.includes('leader') || text.includes('lead'))) {
      return '3'; // 3 years technical leadership experience
    }
    // iOS development
    if (text.includes('ios') || text.includes('swift')) {
      return '5'; // 5 years iOS development
    }
    // Android development
    if (text.includes('android') || text.includes('kotlin') || text.includes('java')) {
      return '4'; // 4 years Android development
    }
    // Web development
    if (text.includes('web') || text.includes('javascript') || text.includes('react') || text.includes('angular')) {
      return '6'; // 6 years web development
    }
    // Python experience
    if (text.includes('python')) {
      return '4'; // 4 years Python
    }
    // Java experience
    if (text.includes('java') && !text.includes('javascript')) {
      return '5'; // 5 years Java
    }
    // Management experience
    if (text.includes('management') || text.includes('manager') || text.includes('managing')) {
      return '2'; // 2 years management
    }
    // Sales experience
    if (text.includes('sales') || text.includes('selling')) {
      return '3'; // 3 years sales
    }
    // Customer service
    if (text.includes('customer') || text.includes('service') || text.includes('support')) {
      return '4'; // 4 years customer service
    }
    // Generic experience
    return '3'; // Default 3 years for any experience question
  }
  
  // Age questions
  if (text.includes('age') || text.includes('old')) {
    return '25'; // 25 years old
  }
  
  // Salary expectations (in thousands)
  if (text.includes('salary') || text.includes('wage') || text.includes('pay')) {
    return '65'; // $65k expectation
  }
  
  // Hours per week
  if (text.includes('hours') && text.includes('week')) {
    return '40'; // 40 hours per week
  }
  
  // Default number
  return '1';
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
 * Get appropriate radio button selection
 */
function getRadioValue(labelText, radioButtons) {
  const text = labelText.toLowerCase();
  const radios = Array.from(radioButtons);
  
  // For yes/no questions, prefer "yes"
  if (text.includes('eligible') || text.includes('authorized') || text.includes('available')) {
    const yesRadio = radios.find(radio => {
      const label = radio.parentElement?.textContent?.toLowerCase() || '';
      return label.includes('yes') || label.includes('authorized') || label.includes('eligible');
    });
    if (yesRadio) return yesRadio;
  }
  
  // For experience questions, select middle option or "some experience"
  if (text.includes('experience') || text.includes('years')) {
    const expRadio = radios.find(radio => {
      const label = radio.parentElement?.textContent?.toLowerCase() || '';
      return label.includes('2-5') || label.includes('some') || label.includes('moderate');
    });
    if (expRadio) return expRadio;
  }
  
  // Default to first option
  return radios[0];
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
  console.log("🚀 Starting dynamic application workflow...");
  
  try {
    // Step 1: Click Apply button if not already on form
    if (!window.location.href.includes('smartapply.indeed.com')) {
      await clickApplyButton();
    }
    
    // Step 2: Run the unlimited workflow loop
    await runUnlimitedWorkflowLoop();
    
    // Step 3: Check for final success
    const success = await checkApplicationSuccess();
    return success ? "pass" : "fail_no_success_confirmation";
    
  } catch (error) {
    console.error("❌ Dynamic workflow failed:", error);
    return "fail_workflow_error";
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
  console.log("🔄 Starting unlimited workflow loop...");
  
  let pageCount = 0;
  let maxPages = 20; // Safety limit to prevent infinite loops
  let consecutiveFailures = 0;
  
  while (pageCount < maxPages && consecutiveFailures < 3) {
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
      console.error(`❌ Error on page ${pageCount}:`, error);
      consecutiveFailures++;
      
      // Try to recover by proceeding to next page
      try {
        await proceedToNextPage();
        await new Promise(r => setTimeout(r, 2000));
      } catch (recoverError) {
        console.error("❌ Recovery failed:", recoverError);
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
}

/**
 * Process the current page by filling forms and answering questions
 */
async function processCurrentPage() {
  console.log("🔍 Analyzing current page...");
  
  let processedSomething = false;
  
  try {
    // Fill contact information if present
    if (await hasContactInfo()) {
      console.log("📝 Processing contact information...");
      await fillContactInfo();
      processedSomething = true;
    }
    
    // Fill employer questions if present  
    if (await hasEmployerQuestions()) {
      console.log("📝 Processing employer questions...");
      await fillEmployerQuestions();
      processedSomething = true;
    }
    
    // Handle resume selection if present
    if (await hasResumeSelection()) {
      console.log("📝 Processing resume selection...");
      await selectResume();
      processedSomething = true;
    }
    
    // Handle document uploads if present
    if (await hasDocumentUploads()) {
      console.log("📝 Processing document uploads...");
      await handleDocumentUploads();
      processedSomething = true;
    }
    
    // Accept legal disclaimers if present
    if (await hasLegalDisclaimer()) {
      console.log("📝 Processing legal disclaimers...");
      await acceptLegalDisclaimer();
      processedSomething = true;
    }
    
    console.log(`📊 Page processing complete - processed: ${processedSomething}`);
    return processedSomething;
    
  } catch (error) {
    console.error("❌ Error processing page:", error);
    return false;
  }
}

/**
 * Try to proceed to the next page by clicking Continue/Submit buttons
 */
async function proceedToNextPage() {
  console.log("🔍 Looking for Continue/Submit buttons...");
  
  // Look for Continue buttons first
  const continueButton = await findContinueButton();
  if (continueButton) {
    console.log("🖱️ Clicking Continue button...");
    continueButton.click();
    await new Promise(r => setTimeout(r, 1000));
    return true;
  }
  
  // Look for Submit buttons
  const submitButton = await findSubmitButton();
  if (submitButton) {
    console.log("🖱️ Clicking Submit button...");
    submitButton.click();
    await new Promise(r => setTimeout(r, 1000));
    return true;
  }
  
  // Try pressing Enter key as fallback
  console.log("⌨️ Trying Enter key as fallback...");
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13 }));
  await new Promise(r => setTimeout(r, 1000));
  
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
async function isSuccessPage() {
  const pageText = document.body.textContent.toLowerCase();
  const successKeywords = [
    'application submitted',
    'thank you for applying',
    'successfully applied', 
    'application received',
    'we have received your application'
  ];
  
  const successSelectors = [
    '.success',
    '.confirmation',
    '[data-testid*="success"]',
    '[data-testid*="confirmation"]'
  ];
  
  // Check text content
  if (successKeywords.some(keyword => pageText.includes(keyword))) {
    return true;
  }
  
  // Check CSS selectors
  if (successSelectors.some(sel => document.querySelector(sel))) {
    return true;
  }
  
  return false;
}

/**
 * Final success check with timeout
 */
async function checkApplicationSuccess() {
  console.log("🔍 Checking for application success...");
  
  let attempts = 0;
  while (attempts < 15) {
    if (await isSuccessPage()) {
      console.log("🎉 Application submitted successfully!");
      return true;
    }
    
    await new Promise(r => setTimeout(r, 1000));
    attempts++;
    console.log(`🔄 Checking success... ${attempts}/15`);
  }
  
  console.log("❌ No success confirmation found");
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

/**
 * Simplified form filling functions for dynamic workflow
 */
async function fillContactInfo() {
  // Fill basic contact fields
  const nameInput = await waitForElement('input[name*="name"], input[placeholder*="name"]', 2000);
  if (nameInput && !nameInput.value) {
    await fillInputSafely(nameInput, 'John Smith', 'name');
  }
  
  const emailInput = await waitForElement('input[name*="email"], input[type="email"]', 2000);
  if (emailInput && !emailInput.value) {
    await fillInputSafely(emailInput, 'john.smith@email.com', 'email');
  }
  
  const phoneInput = await waitForElement('input[name*="phone"], input[type="tel"]', 2000);
  if (phoneInput && !phoneInput.value) {
    await fillInputSafely(phoneInput, '555-123-4567', 'phone');
  }
}

async function selectResume() {
  const resumeRadio = await waitForElement('input[type="radio"][name*="resume"]', 2000);
  if (resumeRadio && !resumeRadio.checked) {
    resumeRadio.checked = true;
    resumeRadio.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

async function handleDocumentUploads() {
  // Skip file uploads for now - would need actual file handling
  console.log("📄 Skipping document uploads");
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
