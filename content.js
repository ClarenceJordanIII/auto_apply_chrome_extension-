// Global error handler for extension context issues
window.addEventListener('error', function(event) {
  if (event.error && event.error.message && event.error.message.includes('Extension context invalidated')) {
    console.log('Extension context invalidated detected. Please refresh the page to continue.');
    // Optionally show a user-friendly message
    if (document.body) {
      const notice = document.createElement('div');
      notice.style.cssText = 'position:fixed;top:10px;right:10px;background:#ff4444;color:white;padding:10px;border-radius:5px;z-index:99999;font-family:Arial,sans-serif;';
      notice.textContent = 'Extension updated - Please refresh the page';
      document.body.appendChild(notice);
      setTimeout(() => notice.remove(), 5000);
    }
  }
});

document.addEventListener("click", () => {
  console.log("Content script clicked!");
});

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
        reject(new Error('MosaicProviderRichSearchDaemon element not found after 10 seconds'));
      }
    }, 100);
  })
    .then(() => {
      startIndeed();
    })
    .catch((err) => {
      console.log('Error in indeedMain:', err);
    });
}

setTimeout(() => {
  indeedMain();
}, 2000);

// sgets job card data
// ...existing code...
const jobCardScrape = async (getJobCards) => {
  console.log('Starting jobCardScrape...');
  const jobs = scrapePage(getJobCards);
  console.log('Current page jobs:', jobs);

  // Here you can implement any additional logic you need before sending the jobs data
//  TODO : add open page to check for apply on company website
  

  // Send the jobs data to the background script
  if (jobs.length > 0) {
    if (isExtensionContextValid()) {
      try {
        chrome.runtime.sendMessage({ action: "queueJobs", jobs }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Chrome runtime error:', chrome.runtime.lastError.message);
            if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
              console.log('Extension was reloaded or updated. Please refresh the page.');
            }
            return;
          }
          if (response && response.status === "fail") {
            console.error(`Background script failed to queue jobs. ID: ${response.id}, Status: ${response.status}, Reason: ${response.reason || 'No reason provided'}`);
          } else {
            console.log('Response from background script:', response);
          }
        });
      } catch (error) {
        console.error('Failed to send message to background script:', error.message);
      }
    } else {
      console.error('Extension context invalidated before sending jobs. Please refresh the page.');
    }
  } else {
    console.log('No jobs to send to background script.');
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
  console.log('scrapePage called...');
  const jobCards = getJobCards?.querySelectorAll("ul > li");
  if (!jobCards) {
    console.log('No job cards found on this page.');
    return [];
  }
  const jobs = [];
  jobCards.forEach((card, idx) => {
    // Get job title
    const jobTitle = card.querySelector("h2.jobTitle span")?.textContent?.trim() || null;
    // Get company name
    const companyName = card.querySelector('[data-testid="company-name"]')?.textContent?.trim() || null;
    // Get location
    const location = card.querySelector('[data-testid="text-location"]')?.textContent?.trim() || null;
    // Get company description
    const companyDesc = card.querySelector(".jobMetaDataGroup")?.innerText?.trim() || null;
    // Get job link and id
    const jobLinkEl = card.querySelector("h2.jobTitle a");
    const jobLink = jobLinkEl?.href || null;
    const jobId = jobLinkEl?.getAttribute("data-jk") || jobLinkEl?.id || null;
    
    // TOD0 : get rid of job type change null to apply using company website
    const jobType = card.querySelector('[data-testid="indeedApply"]')?.textContent?.trim() === "Easily apply" || null;
    if ([jobTitle, companyName, location, companyDesc, jobLink, jobId,jobType].some((val) => val === null || val === undefined)) {
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
      jobType: jobType === "Easily apply"
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
      if (scrollTop + windowHeight >= documentHeight - 5 || scrollTop === lastScrollTop) {
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
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      return false;
    }
    
    // Check if extension context is invalidated
    if (chrome.runtime.lastError) {
      console.log('Chrome runtime error detected:', chrome.runtime.lastError.message);
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
    console.log('Extension context validation failed:', error.message);
    return false;
  }
}

async function scrollDownUp() {
  // Scroll down
  let lastScrollTop = -1;
  for (let i = 0; i < 30; i++) {
    window.scrollBy(0, 100);
    await new Promise(r => setTimeout(r, 40));
    const scrollTop = window.scrollY;
    if (scrollTop === lastScrollTop) break;
    lastScrollTop = scrollTop;
  }
  // Scroll up
  lastScrollTop = -1;
  for (let i = 0; i < 30; i++) {
    window.scrollBy(0, -100);
    await new Promise(r => setTimeout(r, 40));
    const scrollTop = window.scrollY;
    if (scrollTop === lastScrollTop || scrollTop <= 0) break;
    lastScrollTop = scrollTop;
  }
}

async function fillContactInfo(job) {
  console.log("Filling contact info for job:", job);
  
  // Fill phone number (common field)
  const phoneSelectors = [
    'input[name*="phone"]',
    'input[data-testid*="phone"]',
    'input[placeholder*="phone"]',
    'input[id*="phone"]'
  ];
  for (const selector of phoneSelectors) {
    const phoneInput = document.querySelector(selector);
    if (phoneInput && !phoneInput.value) {
      phoneInput.value = "555-123-4567"; // Default phone
      phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
      phoneInput.dispatchEvent(new Event('change', { bubbles: true }));
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
    'input[placeholder*="zip"]'
  ];
  if (job.location) {
    const zipMatch = job.location.match(/\b\d{5}\b/);
    if (zipMatch) {
      for (const selector of zipSelectors) {
        const zipInput = document.querySelector(selector);
        if (zipInput && !zipInput.value) {
          zipInput.value = zipMatch[0];
          zipInput.dispatchEvent(new Event('input', { bubbles: true }));
          zipInput.dispatchEvent(new Event('change', { bubbles: true }));
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
    'input[placeholder*="city"]'
  ];
  if (job.location) {
    for (const selector of citySelectors) {
      const cityInput = document.querySelector(selector);
      if (cityInput && !cityInput.value) {
        cityInput.value = job.location;
        cityInput.dispatchEvent(new Event('input', { bubbles: true }));
        cityInput.dispatchEvent(new Event('change', { bubbles: true }));
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
    'input[placeholder*="address"]'
  ];
  for (const selector of addressSelectors) {
    const addressInput = document.querySelector(selector);
    if (addressInput && !addressInput.value) {
      addressInput.value = "123 Main St";
      addressInput.dispatchEvent(new Event('input', { bubbles: true }));
      addressInput.dispatchEvent(new Event('change', { bubbles: true }));
      console.log("Filled street address");
      break;
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "applyJob" && message.job) {
    // ═══════════════════════════════════════════════════════════════════════════
    // 🚀 MAIN JOB APPLICATION WORKFLOW - MULTI-STEP PROCESS
    // ═══════════════════════════════════════════════════════════════════════════
    (async () => {
      const job = message.job;
      
      // ─────────────────────────────────────────────────────────────────────────
      // STEP 0: VALIDATION - Ensure job has required data
      // ─────────────────────────────────────────────────────────────────────────
      if (!job.jobId) {
        console.error("Job missing required jobId:", job);
        if (isExtensionContextValid()) {
          try {
            chrome.runtime.sendMessage({ action: "jobResult", jobId: null, result: "fail_validation" });
          } catch (error) {
            console.error('Failed to send validation result:', error.message);
          }
        }
        sendResponse({ status: "error", message: "Invalid job data" });
        return;
      }
    
    console.log("🎯 Starting job application for:", job.jobTitle, "at", job.companyName);
    let result = "pending";
    try {
      // ─────────────────────────────────────────────────────────────────────────
      // STEP 1: PAGE PREPARATION - Scroll to trigger rendering & load all elements
      // ─────────────────────────────────────────────────────────────────────────
      console.log("📜 Step 1: Preparing page - scrolling to load all elements");
      await scrollDownUp();
      
      // ─────────────────────────────────────────────────────────────────────────
      // STEP 2: INITIAL FORM FILLING - Fill basic contact/location info
      // ─────────────────────────────────────────────────────────────────────────
      console.log("📝 Step 2: Filling initial contact/location information");
      await fillContactInfo(job);
      
      // Fill company name if field exists
      const companyInput = document.querySelector('input[name*="company"], input[placeholder*="Company"], input[type="text"]');
      if (companyInput && job.companyName) {
        companyInput.value = job.companyName;
        companyInput.dispatchEvent(new Event('input', { bubbles: true }));
        console.log("✅ Filled company input with:", job.companyName);
      }
      
      // Fill location if field exists
      const locationInput = document.querySelector('input[name*="location"], input[placeholder*="Location"], input[type="text"]');
      if (locationInput && job.location) {
        locationInput.value = job.location;
        locationInput.dispatchEvent(new Event('input', { bubbles: true }));
        console.log("✅ Filled location input with:", job.location);
      }
      
      // Fill any remaining empty text fields with placeholder
      const allInputs = document.querySelectorAll('input[type="text"]');
      allInputs.forEach(input => {
        if (!input.value) {
          input.value = "N/A";
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
      
      // ─────────────────────────────────────────────────────────────────────────
      // STEP 3: CLICK APPLY BUTTON - Find and click the main "Apply" button
      // ─────────────────────────────────────────────────────────────────────────
      console.log("🖱️ Step 3: Looking for and clicking main Apply button");
      let applyBtn = document.getElementById('indeedApplyButton') 
      
      if (applyBtn) {
        applyBtn.click();
        console.log("✅ Clicked main Apply button:", applyBtn.textContent);
        // ─────────────────────────────────────────────────────────────────────────
        // STEP 4: CONTACT INFO FORM - Wait for contact info page to load and continue
        // ─────────────────────────────────────────────────────────────────────────
        console.log("📋 Step 4: Looking for Contact Info form and Continue button");
        let continueBtn = null;
        for (let i = 0; i < 10; i++) { // Try for up to 10 seconds
          await new Promise(r => setTimeout(r, 1000));
          if (!isExtensionContextValid()) {
            console.log('Extension context invalidated during continue button wait. Aborting.');
            return;
          }
          
          // Look for the contact info module (consistent ID across pages)
          const form = document.getElementById("mosaic-contactInfoModule");
          continueBtn = null;
          
          if (form) {
            // First try to find regular button
            continueBtn = form.querySelector("button");
            
            // If no regular button, try submit button (as you mentioned)
            if (!continueBtn) {
              continueBtn = form.querySelector('input[type="submit"], button[type="submit"]');
            }
            
            console.log("🔍 Found button in contact info module:", continueBtn?.textContent || continueBtn?.value);
          }

          // Fallback: check all buttons for continue/submit text if not found in form
          if (!continueBtn) {
            const allButtons = document.querySelectorAll('button, input[type="submit"], input[type="button"]');
            for (const btn of allButtons) {
              const text = (btn.textContent || btn.value || '').toLowerCase();
              if (text.includes('continue') || text.includes('next') || text.includes('submit') || text.includes('proceed')) {
                continueBtn = btn;
                console.log("🔍 Found fallback continue/submit button:", btn.textContent || btn.value);
                break;
              }
            }
          }
          
          if (continueBtn) {
            continueBtn.click();
            console.log("✅ Clicked Continue/Submit button:", continueBtn.textContent || continueBtn.value);
            break;
          }
        }
        
        // ─────────────────────────────────────────────────────────────────────────
        // STEP 5: RESUME/SCREENING FORMS - Handle additional forms that may appear
        // ─────────────────────────────────────────────────────────────────────────
        console.log("📄 Step 5: Checking for additional forms (resume, screening questions, etc.)");
        
        // Wait a moment for next page to load
        await new Promise(r => setTimeout(r, 2000));
        
        // Look for additional submit buttons on screening/resume pages
        for (let attempts = 0; attempts < 5; attempts++) {
          await new Promise(r => setTimeout(r, 1000));
          
          const additionalSubmit = document.querySelector('input[type="submit"], button[type="submit"]');
          if (additionalSubmit) {
            const buttonText = (additionalSubmit.textContent || additionalSubmit.value || '').toLowerCase();
            if (buttonText.includes('continue') || buttonText.includes('submit') || buttonText.includes('next') || buttonText.includes('review')) {
              additionalSubmit.click();
              console.log("✅ Clicked additional submit button:", additionalSubmit.textContent || additionalSubmit.value);
              await new Promise(r => setTimeout(r, 1000)); // Wait after click
              break;
            }
          }
        }
        // ─────────────────────────────────────────────────────────────────────────
        // STEP 6: RESULT DETECTION - Wait for and detect success/failure messages
        // ─────────────────────────────────────────────────────────────────────────
        console.log("🔍 Step 6: Waiting for application result (success/failure)");
        let attempts = 0;
        let found = false;
        while (attempts < 30 && !found) { // up to 30 attempts, 1s apart
          await new Promise(r => setTimeout(r, 1000));
          if (!isExtensionContextValid()) {
            console.log('Extension context invalidated during result wait. Aborting.');
            return;
          }
          attempts++;
          
          // Look for success indicators (CSS selectors)
          const successIndicators = [
            '.success', '.applied', '.confirmation',
            '[data-testid="application-success"]',
            '[data-testid="confirmation"]',
            '.alert-success', '.message-success'
          ];
          
          // Look for failure indicators (CSS selectors)
          const failureIndicators = [
            '.error', '.failed', '.alert-danger',
            '[data-testid="application-fail"]',
            '[data-testid="error"]',
            '.message-error', '.alert-error'
          ];
          
          // Check page text content for success/failure keywords
          const pageText = document.body.textContent.toLowerCase();
          const successKeywords = ['application submitted', 'successfully applied', 'thank you for applying', 'application received'];
          const errorKeywords = ['application failed', 'error', 'unable to submit', 'please try again'];
          
          // Check all detection methods
          const successMsg = successIndicators.some(sel => document.querySelector(sel));
          const failMsg = failureIndicators.some(sel => document.querySelector(sel));
          const successText = successKeywords.some(keyword => pageText.includes(keyword));
          const errorText = errorKeywords.some(keyword => pageText.includes(keyword));
          
          if (successMsg || successText) {
            result = "pass";
            found = true;
            console.log("🎉 Application SUCCESS detected!");
          } else if (failMsg || errorText) {
            result = "fail";
            found = true;
            console.log("❌ Application FAILURE detected!");
          } else if (pageText.includes('captcha') || document.querySelector('[data-sitekey]')) {
            result = "fail_captcha";
            found = true;
            console.log("🤖 CAPTCHA detected, marking as failed!");
          }
          
          console.log(`🔄 Attempt ${attempts}/30 - Still waiting for result...`);
        }
        if (!found) {
          result = "fail_timeout";
          console.log("⏰ TIMEOUT: No application result detected after 30 seconds");
        }
      } else {
        // ─────────────────────────────────────────────────────────────────────────
        // ERROR: APPLY BUTTON NOT FOUND
        // ─────────────────────────────────────────────────────────────────────────
        console.log("❌ ERROR: Main Apply button not found on page!");
        result = "fail";
      }
    } catch (err) {
      // ─────────────────────────────────────────────────────────────────────────
      // ERROR HANDLING: Catch any unexpected errors during application process
      // ─────────────────────────────────────────────────────────────────────────
      console.log("💥 EXCEPTION during job application:", err.message);
      result = "fail";
      }
      
      // ─────────────────────────────────────────────────────────────────────────
      // STEP 7: REPORT RESULTS - Send final result back to background script
      // ─────────────────────────────────────────────────────────────────────────
      console.log(`📊 Final Result for ${job.jobTitle}: ${result}`);
      if (isExtensionContextValid()) {
        try {
          chrome.runtime.sendMessage({ action: "jobResult", jobId: job.jobId, result }, (response) => {
            if (chrome.runtime.lastError) {
              console.error('Error sending job result:', chrome.runtime.lastError.message);
            } else {
              console.log("✅ Successfully reported result to background script");
            }
          });
        } catch (error) {
          console.error('Failed to send job result:', error.message);
        }
      } else {
        console.log('Extension context invalidated before sending result. Please refresh the page.');
      }
      sendResponse({ status: "completed", result });
    })();
    return true; // Keep message channel open for async operation
  }
});

// Show a modal popup to notify user of CAPTCHA and pause automation
function showCaptchaModal() {
    if (document.getElementById('autoApplyCaptchaModal')) return;
    const modal = document.createElement('div');
    modal.id = 'autoApplyCaptchaModal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(0,0,0,0.7)';
    modal.style.zIndex = '99999';
    modal.style.display = 'flex';
    modal.style.flexDirection = 'column';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.innerHTML = `
      <div style="background:#fff;padding:2em;border-radius:8px;text-align:center;max-width:400px;">
        <h2 style="margin-bottom:1em;">CAPTCHA Detected</h2>
        <p style="margin-bottom:1em;">Please complete the CAPTCHA challenge to continue the application process.</p>
        <button id="autoApplyResumeBtn" style="padding:0.5em 2em;">Resume Automation</button>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('autoApplyResumeBtn').onclick = () => {
        modal.remove();
        window.autoApplyPaused = false;
    };
    window.autoApplyPaused = true;
}

// Detect Cloudflare CAPTCHA and show modal
function detectCloudflareCaptcha() {
    // Look for Cloudflare challenge elements
    if (document.querySelector('.hcaptcha-box, .cf-captcha-container, iframe[src*="turnstile"], iframe[src*="hcaptcha"]')) {
        showCaptchaModal();
        return true;
    }
    return false;
}

// Listen for tab close (unload) and notify background
window.addEventListener('beforeunload', function () {
    if (isExtensionContextValid()) {
        try {
            chrome.runtime.sendMessage({ action: 'indeedTabClosed' });
        } catch (error) {
            // Ignore errors on tab close - extension may already be invalidated
            console.log('Tab close message failed (expected on extension reload):', error.message);
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
            console.warn('CAPTCHA detected, pausing automation.');
            let pauseAttempts = 0;
            while (window.autoApplyPaused && pauseAttempts < 300) { // Max 5 minutes pause
                await new Promise(r => setTimeout(r, 1000));
                if (!isExtensionContextValid()) {
                    console.log('Extension context invalidated during pause. Aborting.');
                    return;
                }
                pauseAttempts++;
            }
        }
        // Click any relevant button (apply, continue, review, next, submit)
        results.push(await clickRelevantButton(['apply'], 'apply'));
        results.push(await clickRelevantButton(['continue', 'review', 'next'], 'continue/review/next'));
        results.push(await clickRelevantButton(['submit your application', 'submit'], 'submit'));
    } catch (err) {
        results.push({ success: false, step: 'exception', error: `Exception: ${err.message}` });
    }
    // Error reporting
    const errorSteps = results.filter(r => !r.success);
    if (errorSteps.length > 0) {
        errorSteps.forEach(e => {
            if (e.error && e.error.includes('not found')) {
                console.error(`Step '${e.step}' failed: ${e.error}`);
            } else if (e.error && e.error.includes('Exception')) {
                console.error(`Step '${e.step}' encountered an exception: ${e.error}`);
            } else {
                console.error(`Step '${e.step}' failed: ${e.error || 'Unknown error'}`);
            }
        });
        return false;
    }
    return true;
}

// Utility to wrap actions in a Promise with error handling
function safePromise(fn, stepName = '') {
    return new Promise(resolve => {
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
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
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
    'input[data-testid*="name"]'
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
    'input[data-testid*="email"]'
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
    'input[data-testid*="phone"]'
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
    'input[data-testid*="address"]'
  ];
  for (const selector of addressSelectors) {
    const addressInput = document.querySelector(selector);
    if (fillInput(addressInput, "123 Main Street", "address")) break;
  }
  
  // Fill city
  const citySelectors = [
    'input[name*="city" i]',
    'input[placeholder*="city" i]',
    'input[data-testid*="city"]'
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
    'input[data-testid*="state"]'
  ];
  for (const selector of stateSelectors) {
    const stateInput = document.querySelector(selector);
    if (stateInput && stateInput.tagName === 'SELECT') {
      stateInput.value = "NY";
      stateInput.dispatchEvent(new Event('change', { bubbles: true }));
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
    'input[data-testid*="postal"]'
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
      radio.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  // Fill all select dropdowns with first option
  const selects = document.querySelectorAll('select');
  selects.forEach(select => {
    if (select.options.length > 1) {
      select.selectedIndex = 1;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  // Fill all textareas with generic answer
  const textareas = document.querySelectorAll('textarea');
  textareas.forEach(textarea => {
    textarea.value = "Yes";
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return true;
}

function fillResumeSection() {
  // Try to select the first resume option if available
  const resumeOption = document.querySelector('input[type="radio"][name*="resume"]');
  if (resumeOption) {
    resumeOption.checked = true;
    resumeOption.dispatchEvent(new Event('change', { bubbles: true }));
  }
  // If file upload is present, skip (cannot automate file upload without user interaction)
  return true;
}

function fillSupportingDocuments() {
  // Try to select the first supporting document option if available
  const docOption = document.querySelector('input[type="radio"][name*="document"]');
  if (docOption) {
    docOption.checked = true;
    docOption.dispatchEvent(new Event('change', { bubbles: true }));
  }
  // If file upload is present, skip (cannot automate file upload without user interaction)
  return true;
}

function acceptLegalDisclaimer() {
  // Check all checkboxes for legal acceptance
  const checkboxes = document.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach(checkbox => {
    if (!checkbox.checked) {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  return true;
}

function fillContactFieldsAsync() {
  return safePromise(fillContactFields, 'fillContactFields');
}

function fillScreenerQuestionsAsync() {
  return safePromise(fillScreenerQuestions, 'fillScreenerQuestions');
}

function fillResumeSectionAsync() {
  return safePromise(fillResumeSection, 'fillResumeSection');
}

function fillSupportingDocumentsAsync() {
  return safePromise(fillSupportingDocuments, 'fillSupportingDocuments');
}

function acceptLegalDisclaimerAsync() {
  return safePromise(acceptLegalDisclaimer, 'acceptLegalDisclaimer');
}

function clickButtonAsync(selector, regex, stepName) {
    return new Promise(resolve => {
        try {
            let btn = Array.from(document.querySelectorAll(selector)).find(el => {
                const text = el.textContent || el.value || '';
                return regex.test(text);
            });
            if (btn) {
                btn.click();
                setTimeout(() => resolve({ success: true, step: stepName }), 500);
            } else {
                resolve({ success: false, step: stepName, error: 'Button not found' });
            }
        } catch (error) {
            console.error(`Error in step: ${stepName}`, error);
            resolve({ success: false, step: stepName, error });
        }
    });
}

// Improved function to reliably click any relevant button (apply, continue, review, next, submit)
async function clickRelevantButton(keywords, stepName) {
    const regex = new RegExp(keywords.join('|'), 'i');
    let btn = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]')).find(el => {
        const text = el.textContent || el.value || '';
        return regex.test(text);
    });
    if (btn) {
        btn.click();
        console.log(`Clicked ${stepName} button.`);
        await new Promise(r => setTimeout(r, 1000));
        return { success: true, step: stepName };
    } else {
        const errorMsg = `${stepName} button not found (keywords: ${keywords.join(', ')})`;
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
        results.push(await clickRelevantButton(['apply'], 'apply'));
        results.push(await clickRelevantButton(['continue', 'review', 'next'], 'continue/review/next'));
        results.push(await clickRelevantButton(['submit your application', 'submit'], 'submit'));
    } catch (err) {
        results.push({ success: false, step: 'exception', error: `Exception: ${err.message}` });
    }
    // Error reporting
    const errorSteps = results.filter(r => !r.success);
    if (errorSteps.length > 0) {
        errorSteps.forEach(e => {
            if (e.error && e.error.includes('not found')) {
                console.error(`Step '${e.step}' failed: ${e.error}`);
            } else if (e.error && e.error.includes('Exception')) {
                console.error(`Step '${e.step}' encountered an exception: ${e.error}`);
            } else {
                console.error(`Step '${e.step}' failed: ${e.error || 'Unknown error'}`);
            }
        });
        return false;
    }
    return true;
}

// Listen for message to trigger full workflow
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'completeApplicationWorkflow') {
        completeApplicationWorkflow().then(success => {
            sendResponse({ success });
        });
        return true; // Indicates async response
    }
});
