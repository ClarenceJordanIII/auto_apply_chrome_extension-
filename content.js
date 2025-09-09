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
    }, 45000); // 45 seconds timeout (less than background script timeout)
    
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
        // 🚀 STEP 1: CLICK APPLY BUTTON - Find and click the "Apply now" button
        // ═══════════════════════════════════════════════════════════════════════════
        console.log("🖱️ STEP 1: Finding and clicking Apply button");
        
        // Wait for page to load
        await new Promise(r => setTimeout(r, 3000));
        
        const easyApplySelectors = [
          '#indeedApplyButton',                      // The actual button ID from your HTML
          'button[data-testid="indeedApplyButton-test"]', // Button with test ID
          'button[aria-label*="Apply now"]',         // Button with Apply now aria-label
          'button.css-jiauqs',                       // Button with that specific class
          '.ia-IndeedApplyButton button',            // Button inside the wrapper
          'button:has(.jobsearch-IndeedApplyButton-newDesign)', // Button containing the span
          'button[title=""][aria-label*="Apply"]'    // Button matching your exact structure
        ];
        
        let applyBtn = await waitForAnyElement(easyApplySelectors, 10000);
        if (!applyBtn) {
          applyBtn = await waitForElementByText(['apply now', 'easily apply'], 5000);
        }

        if (!applyBtn) {
          // Check if we're already on the application form (sometimes the page redirects directly)
          const isAlreadyOnForm = document.querySelector('#mosaic-contactInfoModule') ||
                                 document.querySelector('[data-testid="profile-location-page"]') ||
                                 window.location.href.includes('smartapply.indeed.com');
          
          if (isAlreadyOnForm) {
            console.log("✅ STEP 1 SUCCESS: Already on application form (direct redirect)");
            // Skip to step 2
          } else {
            console.log("❌ STEP 1 FAILED: No apply button found");
            result = "fail_no_apply_button";
            return;
          }
        } else {

        // Click the apply button
        console.log("�️ Clicking apply button...");
        // Validate the element before clicking
        console.log("🔍 Found element details:", {
          tagName: applyBtn.tagName,
          id: applyBtn.id,
          className: applyBtn.className,
          textContent: applyBtn.textContent?.trim(),
          isButton: applyBtn.tagName === 'BUTTON',
          isVisible: applyBtn.offsetParent !== null,
          isEnabled: !applyBtn.disabled
        });

        // Make sure we found an actual button element
        if (applyBtn.tagName !== 'BUTTON') {
          console.log("⚠️ Found element is not a button, looking for button inside...");
          const buttonInside = applyBtn.querySelector('button');
          if (buttonInside) {
            applyBtn = buttonInside;
            console.log("✅ Found actual button inside wrapper:", buttonInside);
          } else {
            console.log("❌ STEP 1 FAILED: Found element is not clickable button");
            result = "fail_not_clickable_element";
            return;
          }
        }

        // Ensure button is clickable
        if (!applyBtn.offsetParent || applyBtn.disabled) {
          console.log("❌ STEP 1 FAILED: Button found but not clickable", {
            visible: applyBtn.offsetParent !== null,
            enabled: !applyBtn.disabled
          });
          result = "fail_button_not_clickable";
          return;
        }

        // Click the apply button with better targeting
        console.log("🖱️ Clicking apply button...");
        applyBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(r => setTimeout(r, 500));
        applyBtn.click();
        
        // ✅ STEP 1 VALIDATION: Wait for application form to appear
        await new Promise(r => setTimeout(r, 3000));
        
        // Check if we're on an Indeed application form page
        const isApplicationPage = window.location.href.includes('smartapply.indeed.com') ||
                                 window.location.href.includes('form/profile') ||
                                 document.querySelector('#mosaic-contactInfoModule') ||
                                 document.querySelector('[data-testid="profile-location-page"]') ||
                                 document.querySelector('form') ||
                                 window.location.href !== job.jobLink;
        
        if (!isApplicationPage) {
          console.log("❌ STEP 1 FAILED: Apply button clicked but no form appeared");
          result = "fail_form_not_loaded";
          return;
        }
        
          console.log("✅ STEP 1 SUCCESS: Apply button clicked, form loaded");
          console.log("📍 Current URL:", window.location.href);
        }

        // ═══════════════════════════════════════════════════════════════════════════
        // 🚀 STEP 2: FILL LOCATION & EXPERIENCE - Fill out basic job info
        // ═══════════════════════════════════════════════════════════════════════════
        console.log("� STEP 2: Filling location and experience information");
        
        // Fill location fields
        await fillContactInfo(job);
        
        // Look for experience/previous work fields dynamically by labels
        const allInputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], textarea, select');
        for (const input of allInputs) {
          // Get label text to understand what field this is
          let labelText = '';
          const label = input.closest('label') || document.querySelector(`label[for="${input.id}"]`);
          if (label) {
            labelText = label.textContent.toLowerCase();
          }
          
          // Check placeholder and name attributes too
          const placeholder = (input.placeholder || '').toLowerCase();
          const name = (input.name || '').toLowerCase();
          const allText = `${labelText} ${placeholder} ${name}`;
          
          // Fill based on field type
          if (allText.includes('company') && !input.value) {
            input.value = job.companyName || 'Previous Company';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            console.log("✅ Filled company field");
          } else if (allText.includes('location') && !input.value) {
            input.value = job.location || 'Previous Location';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            console.log("✅ Filled location field");
          } else if (allText.includes('experience') && !input.value) {
            input.value = '3+ years of relevant experience';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            console.log("✅ Filled experience field");
          } else if (allText.includes('salary') && !input.value) {
            input.value = 'Competitive';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            console.log("✅ Filled salary field");
          } else if (!input.value && input.type === 'text') {
            input.value = 'N/A';
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
        
        console.log("✅ STEP 2 SUCCESS: Location and experience fields filled");

        // ═══════════════════════════════════════════════════════════════════════════
        // 🚀 STEP 3: CONTINUE WITH RESUME - Click continue to use existing Indeed resume
        // ═══════════════════════════════════════════════════════════════════════════
        console.log("📋 STEP 3: Looking for Continue button to proceed with resume");
        
        let continueBtn = null;
        let attempts = 0;
        
        while (!continueBtn && attempts < 10) {
          await new Promise(r => setTimeout(r, 1000));
          attempts++;
          
          // Check if we're on the contact info page or resume selection page
          const isResumeSelectionPage = document.querySelector('h1') && 
            document.querySelector('h1').textContent.includes('Choose how to apply');
          
          if (isResumeSelectionPage) {
            console.log("📋 On resume selection page - looking for resume Continue button");
            
            // Try the resume selection page Continue button first
            continueBtn = document.querySelector('button[data-testid="continue-button"]');
            if (continueBtn) {
              console.log("✅ Found resume selection Continue button");
              break;
            }
            
            // Fallback for resume selection page
            continueBtn = document.querySelector('button.mosaic-provider-module-apply-resume-selection-6xgesl');
            if (continueBtn) {
              console.log("✅ Found resume selection Continue button with CSS class");
              break;
            }
          } else {
            console.log("📝 On contact info page - looking for contact info Continue button");
            
            // Try more stable selectors for contact info page
            const contactInfoSelectors = [
              'button[data-testid*="continue"]',
              'button.mosaic-provider-module-apply-contact-info-krg1j8',
              'form button[type="submit"]',
              'form button:not([type="button"])',
              '.mosaic-provider-module button:contains("Continue")'
            ];
            
            for (const selector of contactInfoSelectors) {
              continueBtn = document.querySelector(selector);
              if (continueBtn) {
                console.log(`✅ Found contact info Continue button with selector: ${selector}`);
                break;
              }
            }
          }
          
          // Generic fallback - try text-based search for continue buttons
          const allButtons = document.querySelectorAll('button, input[type="submit"], input[type="button"]');
          for (const btn of allButtons) {
            const text = (btn.textContent || btn.value || '').toLowerCase();
            if (text.includes('continue') || text.includes('next') || text.includes('proceed')) {
              continueBtn = btn;
              console.log("✅ Found Continue button via text search:", text);
              break;
            }
          }
          
          if (continueBtn) break;
          
          console.log(`🔄 Attempt ${attempts}/10 - Continue button not found yet...`);
        }
        
        if (!continueBtn) {
          console.log("❌ STEP 3 FAILED: No continue button found");
          result = "fail_no_continue_button";
          return;
        }
        
        console.log("🖱️ Clicking Continue button...");
        continueBtn.click();
        
        // ✅ STEP 3 VALIDATION: Wait for next page/form to load
        await new Promise(r => setTimeout(r, 3000));
        console.log("✅ STEP 3 SUCCESS: Continue button clicked");

        // ═══════════════════════════════════════════════════════════════════════════
        // 🚀 STEP 3.5: HANDLE EMPLOYER QUESTIONS - Fill out any employer questionnaire
        // ═══════════════════════════════════════════════════════════════════════════
        
        // Wait and check if we're now on a questions page
        await new Promise(r => setTimeout(r, 2000));
        
        // Check if we're on the employer questions page
        const isQuestionsPage = document.querySelector('h1[data-testid="questions-heading"]') ||
                               document.querySelector('.ia-Questions') ||
                               document.querySelector('[id^="mosaic-provider-module-apply-questions"]');
        
        if (isQuestionsPage) {
          console.log("📝 STEP 3.5: Detected employer questions page - filling out questions");
          await fillEmployerQuestions();
          
          // Look for Continue button on questions page with multiple strategies
          let questionsContinueBtn = null;
          attempts = 0;
          
          while (!questionsContinueBtn && attempts < 8) {
            await new Promise(r => setTimeout(r, 1000));
            attempts++;
            
            // Try various continue button selectors for questions page
            const questionsContinueSelectors = [
              'button[data-testid*="Continue"]',
              'button[class*="continue"]',
              'form button[type="submit"]',
              'button.mosaic-provider-module-apply-questions-6xgesl' // From your HTML
            ];
            
            for (const selector of questionsContinueSelectors) {
              questionsContinueBtn = document.querySelector(selector);
              if (questionsContinueBtn) {
                console.log(`✅ Found questions Continue button with selector: ${selector}`);
                break;
              }
            }
            
            // Fallback: text-based search
            if (!questionsContinueBtn) {
              const allButtons = document.querySelectorAll('button');
              for (const btn of allButtons) {
                const text = (btn.textContent || '').toLowerCase().trim();
                if (text === 'continue' || text === 'next' || text === 'proceed') {
                  questionsContinueBtn = btn;
                  console.log(`✅ Found Continue button via text search: "${text}"`);
                  break;
                }
              }
            }
            
            if (questionsContinueBtn) break;
            console.log(`🔄 Attempt ${attempts}/8 - Questions Continue button not found yet...`);
          }
          
          if (questionsContinueBtn) {
            console.log("🖱️ Clicking Continue button on questions page...");
            questionsContinueBtn.click();
            await new Promise(r => setTimeout(r, 3000));
            console.log("✅ STEP 3.5 SUCCESS: Questions filled and continued");
          } else {
            console.log("⚠️ No Continue button found on questions page, proceeding anyway...");
          }
        }

        // ═══════════════════════════════════════════════════════════════════════════
        // 🚀 STEP 4: SUBMIT APPLICATION & CHECK SUCCESS - Final submission and validation
        // ═══════════════════════════════════════════════════════════════════════════
        console.log("� STEP 4: Final application submission and success check");
        
        // Look for final submit button
        let submitBtn = null;
        attempts = 0;
        
        // Check if we're on the review page first
        const isReviewPage = document.querySelector('.ia-Review') || document.body.textContent.includes('Please review your application');
        if (isReviewPage) {
          console.log("📋 Detected application review page");
        }
        
        while (!submitBtn && attempts < 10) {
          await new Promise(r => setTimeout(r, 1000));
          attempts++;
          
          // Try dynamic selectors for the submit button
          const submitSelectors = [
            // Look for buttons in common submit areas
            '.ia-BasePage-footer button',
            '.ia-Review button',
            '[class*="footer"] button',
            '[class*="submit"] button',
            // Look for buttons with submit-like styling
            'button[class*="primary"]',
            'button[class*="cta"]',
            'button[class*="action"]',
            // Generic button containers
            'main button',
            'footer button'
          ];
          
          for (const selector of submitSelectors) {
            try {
              submitBtn = document.querySelector(selector);
              if (submitBtn) {
                console.log(`✅ Found submit button with selector: ${selector}`);
                break;
              }
            } catch (e) {
              // Ignore selector errors
            }
          }
          
          if (submitBtn) break;
          
          // Fallback: search all buttons by text content
          const allButtons = document.querySelectorAll('button, input[type="submit"], input[type="button"]');
          for (const btn of allButtons) {
            const text = (btn.textContent || btn.value || '').toLowerCase().trim();
            if (text.includes('submit your application') || text.includes('submit application') || 
                text.includes('submit') || text.includes('apply now') || text.includes('send application')) {
              submitBtn = btn;
              console.log(`✅ Found submit button by text: "${text}"`);
              break;
            }
          }
          
          if (submitBtn) break;
        }
        
        if (submitBtn) {
          console.log("🖱️ Clicking final submit button...");
          submitBtn.click();
          await new Promise(r => setTimeout(r, 2000));
        }
        
        // ✅ STEP 4 VALIDATION: Check for success page/message
        console.log("🔍 Checking for application success...");
        let successFound = false;
        attempts = 0;
        
        while (!successFound && attempts < 15) {
          await new Promise(r => setTimeout(r, 1000));
          attempts++;
          
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
            successFound = true;
            result = "pass";
            console.log("🎉 STEP 4 SUCCESS: Application submitted successfully!");
            break;
          }
          
          // Check CSS selectors
          if (successSelectors.some(sel => document.querySelector(sel))) {
            successFound = true;
            result = "pass";
            console.log("🎉 STEP 4 SUCCESS: Success page detected!");
            break;
          }
          
          console.log(`🔄 Attempt ${attempts}/15 - Still checking for success...`);
        }
        
        if (!successFound) {
          console.log("❌ STEP 4 TIMEOUT: No success confirmation found");
          result = "fail_no_success_confirmation";
        }


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
async function fillEmployerQuestions() {
  console.log("📝 Starting to fill employer questions...");
  
  // Wait for questions to be fully loaded
  await new Promise(r => setTimeout(r, 1000));
  
  let filledCount = 0;
  
  try {
    // Find all question containers
    const questionContainers = document.querySelectorAll('.ia-Questions-item, [id^="q_"]');
    console.log(`📋 Found ${questionContainers.length} question containers`);
    
    for (let i = 0; i < questionContainers.length; i++) {
      const container = questionContainers[i];
      console.log(`\n🔍 Processing question ${i + 1}/${questionContainers.length}`);
      
      try {
        // Get question label/text
        const labelElement = container.querySelector('label, legend, [data-testid*="label"]');
        const labelText = labelElement ? 
          (labelElement.textContent || labelElement.innerText || '').toLowerCase().trim() : '';
        
        console.log(`📝 Question label: "${labelText}"`);
        
        // Check for different input types and fill accordingly
        await fillQuestionByType(container, labelText);
        filledCount++;
        
        // Small delay between questions
        await new Promise(r => setTimeout(r, 200));
        
      } catch (questionError) {
        console.error(`❌ Error processing question ${i + 1}:`, questionError.message);
      }
    }
    
    console.log(`✅ Successfully filled ${filledCount} questions`);
    
    // After filling all questions, look for and click the continue button
    console.log("🔍 Looking for Continue button after filling questions...");
    
    // Wait a moment for any dynamic updates
    await new Promise(r => setTimeout(r, 1000));
    
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
    
    // First try CSS selectors
    for (const selector of continueSelectors) {
      try {
        continueButton = document.querySelector(selector);
        if (continueButton) {
          console.log(`✅ Found Continue button with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Ignore selector errors
      }
    }
    
    // If no button found, search by text content
    if (!continueButton) {
      const allButtons = document.querySelectorAll('button, input[type="submit"], input[type="button"]');
      for (const btn of allButtons) {
        const text = (btn.textContent || btn.value || '').toLowerCase().trim();
        if (text.includes('continue') || text.includes('next') || text.includes('proceed')) {
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
async function fillQuestionByType(container, labelText) {
  console.log(`🔍 Analyzing question container for: "${labelText}"`);
  
  // 1. TEXT INPUTS (address, city, state, zip, etc.)
  const textInput = container.querySelector('input[type="text"], input:not([type]), input[data-testid*="input"]');
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
  
  // 2. TEXTAREA (desired pay, cover letter text, etc.)
  const textarea = container.querySelector('textarea');
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
  
  // 3. SELECT DROPDOWNS (country, state, etc.)
  const select = container.querySelector('select');
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
  
  // 4. RADIO BUTTONS
  const radioButtons = container.querySelectorAll('input[type="radio"]');
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
  
  // 5. CHECKBOXES
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
  
  // 6. DATE INPUTS
  const dateInput = container.querySelector('input[placeholder*="MM/DD/YYYY"], input[type="date"]');
  if (dateInput && !dateInput.value) {
    const dateValue = getDateValue(labelText);
    if (dateValue) {
      await fillInputSafely(dateInput, dateValue, labelText);
      return;
    }
  }
  
  // 7. FILE UPLOADS (skip for now - can't automate file uploads without user interaction)
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
  if (text.includes('why do you want') || text.includes('why are you interested')) {
    return 'This role aligns perfectly with my career goals and offers the opportunity to utilize my skills while contributing to a dynamic team.';
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
 * Get appropriate radio button selection based on label text
 */
function getRadioValue(labelText, radioButtons) {
  const text = labelText.toLowerCase();
  
  // Work authorization / visa questions
  if (text.includes('visa') || text.includes('sponsorship') || text.includes('h-1b') || text.includes('opt') || text.includes('work authorization')) {
    // For visa/sponsorship questions, usually answer "No" (don't need sponsorship)
    const noOption = Array.from(radioButtons).find(radio => 
      radio.value.toLowerCase() === 'no' || 
      radio.nextElementSibling?.textContent?.toLowerCase().includes('no')
    );
    return noOption || radioButtons[1]; // Default to second option if "No" not found
  }
  
  // Location/commute questions
  if (text.includes('able to') || text.includes('report for') || text.includes('work in') || text.includes('commute') || 
      text.includes('relocate') || text.includes('travel') || text.includes('on-site') || text.includes('in-person')) {
    // For work location questions, usually answer "Yes"
    const yesOption = Array.from(radioButtons).find(radio => 
      radio.value.toLowerCase() === 'yes' || 
      radio.nextElementSibling?.textContent?.toLowerCase().includes('yes')
    );
    return yesOption || radioButtons[0]; // Default to first option if "Yes" not found
  }
  
  // Age/eligibility questions
  if (text.includes('18') || text.includes('age') || text.includes('eligible') || text.includes('legally authorized')) {
    // For age questions, usually answer "Yes"
    const yesOption = Array.from(radioButtons).find(radio => 
      radio.value.toLowerCase() === 'yes' || 
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
function getDateValue(labelText) {
  const text = labelText.toLowerCase();
  
  if (text.includes('available') || text.includes('start')) {
    // Available to start immediately or within 2 weeks
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 14); // 2 weeks from now
    return startDate.toLocaleDateString('en-US', { 
      month: '2-digit', 
      day: '2-digit', 
      year: 'numeric' 
    });
  }
  
  if (text.includes('birth') || text.includes('dob')) {
    return '01/01/1990'; // Generic DOB
  }
  
  return new Date().toLocaleDateString('en-US', { 
    month: '2-digit', 
    day: '2-digit', 
    year: 'numeric' 
  });
}
