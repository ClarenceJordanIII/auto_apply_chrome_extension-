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
let keepAliveInterval = setInterval(() => {
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
    clearInterval(keepAliveInterval);
  }
}, 5000); // Every 5 seconds

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
          console.log("❌ STEP 1 FAILED: No apply button found");
          result = "fail_no_apply_button";
          return;
        }

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
        const formAppeared = document.querySelector('#mosaic-contactInfoModule') || 
                           document.querySelector('form') ||
                           document.querySelector('[data-testid*="form"]') ||
                           window.location.href !== job.jobLink;
        
        if (!formAppeared) {
          console.log("❌ STEP 1 FAILED: Apply button clicked but no form appeared");
          result = "fail_form_not_loaded";
          return;
        }
        
        console.log("✅ STEP 1 SUCCESS: Apply button clicked, form loaded");

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
          
          // Look for continue buttons
          const continueSelectors = [
            'button:contains("Continue")',
            'button:contains("Next")', 
            'button:contains("Submit")',
            'input[type="submit"]',
            'button[type="submit"]'
          ];
          
          // Try text-based search for continue buttons
          const allButtons = document.querySelectorAll('button, input[type="submit"], input[type="button"]');
          for (const btn of allButtons) {
            const text = (btn.textContent || btn.value || '').toLowerCase();
            if (text.includes('continue') || text.includes('next') || text.includes('proceed')) {
              continueBtn = btn;
              break;
            }
          }
          
          if (continueBtn) break;
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
        // 🚀 STEP 4: SUBMIT APPLICATION & CHECK SUCCESS - Final submission and validation
        // ═══════════════════════════════════════════════════════════════════════════
        console.log("� STEP 4: Final application submission and success check");
        
        // Look for final submit button
        let submitBtn = null;
        attempts = 0;
        
        while (!submitBtn && attempts < 10) {
          await new Promise(r => setTimeout(r, 1000));
          attempts++;
          
          const allButtons = document.querySelectorAll('button, input[type="submit"], input[type="button"]');
          for (const btn of allButtons) {
            const text = (btn.textContent || btn.value || '').toLowerCase();
            if (text.includes('submit') || text.includes('apply') || text.includes('send application')) {
              submitBtn = btn;
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
