// Background script for Indeed job auto-apply extension

let jobQueue = [];
let failedJobs = [];
let retryQueue = [];
let currentJob = null;
let processing = false;
let activeJobTabId = null; // Track the current job tab

const JOB_TIMEOUT = 200000; // 200 seconds (3.3 minutes) per job - GENEROUS TIME FOR COMPLEX FORMS  
const JOB_THROTTLE = 12000; // 12 seconds between jobs (increased for more human-like pacing)
const MAX_RETRIES = 5; // Maximum retry attempts per job
const MAX_CONCURRENT_TABS = 1; // Only allow 1 job tab at a time
const MAX_TOTAL_TABS = 10; // Emergency brake - never have more than 10 tabs total

// Load job queue from storage on startup
chrome.storage.local.get(['jobQueue', 'failedJobs', 'retryQueue'], (result) => {
  if (result.jobQueue) jobQueue = result.jobQueue;
  if (result.failedJobs) failedJobs = result.failedJobs;
  if (result.retryQueue) retryQueue = result.retryQueue;
  
  // CRASH PREVENTION: Limit queue sizes to prevent memory issues
  const MAX_QUEUE_SIZE = 50;
  if (jobQueue.length > MAX_QUEUE_SIZE) {
    console.warn(`⚠️ Job queue too large (${jobQueue.length}), truncating to ${MAX_QUEUE_SIZE}`);
    jobQueue = jobQueue.slice(0, MAX_QUEUE_SIZE);
  }
  
  if (retryQueue.length > MAX_QUEUE_SIZE) {
    console.warn(`⚠️ Retry queue too large (${retryQueue.length}), truncating to ${MAX_QUEUE_SIZE}`);
    retryQueue = retryQueue.slice(0, MAX_QUEUE_SIZE);
  }
  
  logQueueStatus();
});

// Global error handler to prevent crashes
chrome.runtime.onStartup.addListener(() => {
  console.log('🔄 Extension startup - cleaning up any leftover tabs');
  preventCrash();
});

// Track main Indeed tab and stop everything when it closes
let mainIndeedTabId = null;

// Listen for tab removal (when user closes tabs)
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  console.log(`🗂️ Tab ${tabId} was closed`);
  
  // If the main Indeed tab is closed, STOP EVERYTHING
  if (tabId === mainIndeedTabId) {
    console.log('🛑 MAIN INDEED TAB CLOSED - STOPPING ALL AUTOMATION');
    emergencyStopAllAutomation();
    mainIndeedTabId = null;
  }
  
  // If any job tab is closed, clean up
  if (tabId === activeJobTabId) {
    console.log('🗂️ Active job tab was closed');
    activeJobTabId = null;
  }
});

// Listen for tab updates to detect navigation away from Indeed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === mainIndeedTabId && changeInfo.url) {
    // Check if user navigated away from Indeed
    if (!changeInfo.url.includes('indeed.com')) {
      console.log('🛑 NAVIGATED AWAY FROM INDEED - STOPPING ALL AUTOMATION');
      emergencyStopAllAutomation();
      mainIndeedTabId = null;
    }
  }
});

// Emergency stop function - completely halts all automation
function emergencyStopAllAutomation() {
  console.log('🚨 EMERGENCY STOP - CLEARING EVERYTHING');
  
  // Stop all processing
  processing = false;
  currentJob = null;
  
  // Clear ALL queues
  jobQueue = [];
  retryQueue = [];
  failedJobs = [];
  
  // Save empty queues to storage
  chrome.storage.local.set({
    jobQueue: [],
    retryQueue: [],
    failedJobs: []
  });
  
  // Close any active job tabs
  if (activeJobTabId) {
    chrome.tabs.remove(activeJobTabId).catch(() => {});
    activeJobTabId = null;
  }
  
  console.log('✅ All automation stopped and queues cleared');
}

// Emergency stop mechanism
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'emergencyStop') {
    console.log('🛑 EMERGENCY STOP ACTIVATED');
    processing = false;
    jobQueue = [];
    retryQueue = [];
    currentJob = null;
    safelyCloseJobTab();
    clearQueueState();
    sendResponse({ status: 'stopped' });
    return true;
  }
  
  if (message.action === 'clearLogs') {
    console.log('🧹 Clearing background logs and storage');
    
    // Clear any console logs or message history stored in background
    // Remove stored console logs from storage if they exist
    chrome.storage.local.remove(['consoleLogs', 'messageHistory', 'logHistory'], () => {
      if (chrome.runtime.lastError) {
        console.error("Error clearing logs:", chrome.runtime.lastError);
      } else {
        console.log("✅ Background logs cleared successfully");
      }
    });
    
    sendResponse({ status: 'logs_cleared' });
    return true;
  }
});
// TODO add this to an html  when done
function saveQueueState() {
  chrome.storage.local.set({ jobQueue, failedJobs, retryQueue });
}

function clearQueueState() {
  chrome.storage.local.remove(['jobQueue', 'failedJobs', 'retryQueue']);
}

function logQueueStatus() {
  console.log(`Queue: ${jobQueue.length} pending, ${retryQueue.length} retrying, ${failedJobs.length} permanently failed`);
  
  // Enhanced failure statistics
  if (failedJobs.length > 0) {
    const failureStats = {};
    failedJobs.forEach(job => {
      const category = job.failureCategory || 'unknown';
      failureStats[category] = (failureStats[category] || 0) + 1;
    });
    
    console.log(`📊 Failure breakdown:`, failureStats);
  }
  
  // Show retry statistics
  if (retryQueue.length > 0) {
    const retryStats = {};
    retryQueue.forEach(job => {
      const attempts = job.retryCount || 0;
      const key = `${attempts} attempts`;
      retryStats[key] = (retryStats[key] || 0) + 1;
    });
    
    console.log(`🔄 Retry breakdown:`, retryStats);
  }
}

/**
 * Send completion message to the main Indeed tab
 */
function sendCompletionMessageToMainTab(successCount, failedCount, totalCount, successRate) {
  if (!mainIndeedTabId) {
    console.log("⚠️ Cannot send completion message - main Indeed tab not found");
    return;
  }
  
  // Don't show completion popup if no jobs were actually processed
  if (totalCount === 0) {
    console.log("ℹ️ No jobs to complete - skipping completion notification");
    return;
  }
  
  const completionMessage = {
    action: "ALL_JOBS_COMPLETE",
    results: {
      success: successCount,
      failed: failedCount,
      total: totalCount,
      successRate: successRate + "%",
      timestamp: new Date().toISOString(),
      message: failedCount === 0 
        ? `🎉 PERFECT! All ${totalCount} jobs completed successfully!` 
        : `✅ DONE! ${successCount}/${totalCount} jobs completed (${successRate}% success rate)`
    }
  };
  
  console.log("🎯 Sending completion message to main Indeed tab:", completionMessage);
  
  chrome.tabs.sendMessage(mainIndeedTabId, completionMessage, (response) => {
    if (chrome.runtime.lastError) {
      console.log("📢 Main tab may be closed or navigated away:", chrome.runtime.lastError.message);
    } else {
      console.log("✅ Completion message sent successfully");
    }
  });
}

/**
 * Categorize failure types for better debugging and statistics
 */
function categorizeFailure(result) {
  // System/Technical failures
  if (result.includes('timeout') || result.includes('exception') || result.includes('communication')) {
    return 'TECHNICAL';
  }
  
  // Form interaction failures  
  if (result.includes('forms_filled_no_confirmation')) {
    return 'FORM_SUBMITTED_UNCLEAR';
  }
  
  if (result.includes('no_forms_no_confirmation')) {
    return 'NO_INTERACTION';
  }
  
  // Navigation failures
  if (result.includes('tab') || result.includes('button') || result.includes('workflow')) {
    return 'NAVIGATION';
  }
  
  // Validation failures
  if (result.includes('validation')) {
    return 'VALIDATION';
  }
  
  // Success detection failures (forms filled but couldn't confirm submission)
  if (result.includes('after_forms')) {
    return 'SUCCESS_DETECTION';
  }
  
  return 'OTHER';
}

// Listen for messages from content.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle undefined, null, or invalid messages
  if (!message || typeof message !== 'object') {
    console.warn("⚠️ Background received invalid message:", message);
    sendResponse({ error: 'Invalid message format' });
    return false;
  }

  try {
    // Log the message action if available
    if (message.action) {
      console.log("Background received message:", message.action);
    } else {
      console.log("Background received message without action:", Object.keys(message));
    }
  } catch (error) {
    console.error("Error logging message:", error.message);
  }
  
  // Handle job queue from Indeed page
  if (message.action === "queueJobs" && message.jobs && Array.isArray(message.jobs)) {
    console.log("🎯 Received jobs to queue:", message.jobs.length);
    
    // Track the main Indeed tab - this is where jobs came from
    if (sender.tab && sender.tab.id) {
      mainIndeedTabId = sender.tab.id;
      console.log(`📍 Main Indeed tab set to: ${mainIndeedTabId}`);
    }
    
    // CLEAR existing queues first - only process jobs from THIS page
    console.log("🧹 Clearing existing queues - only processing current page jobs");
    jobQueue = [];
    retryQueue = [];
    failedJobs = [];
    processing = false; // Reset processing flag
    
    // Add jobs to queue with pending status and retry count
    jobQueue = message.jobs.map((job, index) => ({ 
      ...job, 
      status: "pending",
      retryCount: 0,
      originalAttemptTime: Date.now(),
      queuePosition: index + 1
    }));
    
    console.log(`📋 Queued ${jobQueue.length} jobs for processing:`);
    jobQueue.forEach((job, i) => {
      console.log(`  ${i + 1}. ${job.jobTitle} - ${job.company}`);
    });
    
    sendResponse({ status: "queued", queueLength: jobQueue.length });
    logQueueStatus();
    saveQueueState(); // Save state after adding jobs
    
    // Start processing immediately if not already processing
    if (!processing && jobQueue.length > 0) {
      console.log("🚀 Starting job processing...");
      setTimeout(() => {
        processNextJob();
      }, 2000); // Small delay to ensure everything is set up
    }
    return true; // Keep message channel open
  }

  // Handle CAPTCHA detection from content script
  if (message.action === "captchaDetected") {
    console.log("🔒 CAPTCHA detected on job application:", message.captchaInfo);
    console.log("🛑 Pausing job processing due to CAPTCHA");
    
    // Mark current job as CAPTCHA-blocked and retry later
    if (currentJob) {
      currentJob.status = "captcha_blocked";
      currentJob.captchaInfo = message.captchaInfo;
      currentJob.captchaTimestamp = message.timestamp;
      
      console.log(`🔄 Moving job to retry queue due to CAPTCHA: ${currentJob.title}`);
      
      // Add to retry queue with longer delay for CAPTCHA
      retryQueue.push({
        ...currentJob,
        retryCount: (currentJob.retryCount || 0) + 1,
        retryReason: "captcha_detected",
        nextRetryTime: Date.now() + (JOB_THROTTLE * 5) // Wait 5x longer for CAPTCHA retries
      });
    }
    
    // Reset processing state
    processing = false;
    currentJob = null;
    
    // Close the job tab to avoid continued CAPTCHA issues
    safelyCloseJobTab();
    
    // Wait longer before trying next job to let CAPTCHA cool down
    setTimeout(() => {
      console.log("🔄 Resuming job processing after CAPTCHA cooldown...");
      processNextJob();
    }, JOB_THROTTLE * 3); // Triple delay after CAPTCHA
    
    sendResponse({ status: "captcha_handled" });
    return true;
  }

  // Handle job results from content script
  if (message.action === "jobResult") {
    console.log("📊 Received job result:", message.result, "for job:", message.jobId);
    console.log(`📈 Queue status: ${jobQueue.length} remaining, processing: ${processing}`);
    sendResponse({ status: "received" });
    return true;
  }
  
  // Add manual job processing controls for debugging
  if (message.action === "getQueueStatus") {
    console.log("📋 Queue Status Request:");
    console.log(`  - Job Queue: ${jobQueue.length} jobs`);
    console.log(`  - Retry Queue: ${retryQueue.length} jobs`);  
    console.log(`  - Failed Jobs: ${failedJobs.length} jobs`);
    console.log(`  - Processing: ${processing}`);
    console.log(`  - Current Job: ${currentJob ? currentJob.jobTitle : 'None'}`);
    console.log(`  - Active Tab: ${activeJobTabId || 'None'}`);
    
    sendResponse({
      status: "queue_status",
      jobQueue: jobQueue.length,
      retryQueue: retryQueue.length,
      failedJobs: failedJobs.length,
      processing: processing,
      currentJob: currentJob ? currentJob.jobTitle : null,
      activeTabId: activeJobTabId
    });
    return true;
  }
  
  if (message.action === "forceProcessNext") {
    console.log("🔧 Force processing next job requested");
    if (!processing && jobQueue.length > 0) {
      setTimeout(() => {
        processNextJob();
      }, 1000);
      sendResponse({ status: "force_started" });
    } else {
      sendResponse({ 
        status: "cannot_force", 
        reason: processing ? "Already processing" : "No jobs in queue"
      });
    }
    return true;
  }

  // Ensure only one Indeed tab is open at a time and close tabs after application
  if (message.action === 'indeedTabClosed') {
    // Remove job from queue, clean up, and process next job
    console.log('Indeed tab closed, processing next job...');
    setTimeout(processNextJob, JOB_THROTTLE);
    sendResponse({ success: true });
    return true;
  }

  // Handle heartbeat to keep connection alive
  if (message.action === 'heartbeat') {
    sendResponse({ status: "alive" });
    return true;
  }

  // Handle learning pattern messages (acknowledge but don't process for now)
  if (message.action === 'saveLearnedPatterns' || message.action === 'patternLearned') {
    console.log(`📚 Pattern learning message received: ${message.action}`);
    sendResponse({ status: "acknowledged" });
    return true;
  }

  // Handle status messages from content script and forward to frontend
  if (message.status) {
    console.log("📢 Status update:", message.status);
    
    // Forward status to all tabs AND to popup if it exists
    const statusMessage = {
      greeting: "statusUpdate",
      status: message.status,
      timestamp: new Date().toISOString()
    };
    
    // Send to tabs (for content scripts)
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, statusMessage, () => {
          // Ignore errors - not all tabs will have listeners
          if (chrome.runtime.lastError) {
            // Silently handle the error
          }
        });
      });
    });
    
    // Also try to send to popup (if it's open)
    chrome.runtime.sendMessage(statusMessage, () => {
      if (chrome.runtime.lastError) {
        // Popup might not be open, that's fine
        console.log("ℹ️ Popup not open to receive status update");
      }
    });
    
    sendResponse({ status: "received" });
    return true;
  }

  // Handle unknown actions
  console.warn("Unknown message action:", message.action);
  sendResponse({ status: "error", message: "Unknown action" });
  return true;
});
/**
 * Emergency crash prevention - Close excess tabs
 */
async function preventCrash() {
  try {
    const tabs = await chrome.tabs.query({});
    
    if (tabs.length > MAX_TOTAL_TABS) {
      console.warn(`🚨 CRASH PREVENTION: Too many tabs (${tabs.length}), closing excess tabs`);
      
      // Close tabs that aren't the active job tab or important system tabs
      for (let i = 0; i < tabs.length; i++) {
        const tab = tabs[i];
        
        // Don't close active tab, new tab page, or current job tab
        if (tab.id !== activeJobTabId && 
            !tab.active && 
            !tab.url.includes('chrome://') && 
            !tab.url.includes('chrome-extension://')) {
          
          try {
            await chrome.tabs.remove(tab.id);
            console.log(`🗑️ Closed excess tab: ${tab.url}`);
            
            // Stop after closing enough tabs
            if (tabs.length - i <= MAX_TOTAL_TABS) break;
          } catch (error) {
            console.warn('Failed to close tab:', error.message);
          }
        }
      }
    }
  } catch (error) {
    console.error('Crash prevention failed:', error);
  }
}

/**
 * Safely close the current job tab
 */
async function safelyCloseJobTab() {
  if (activeJobTabId) {
    try {
      await chrome.tabs.remove(activeJobTabId);
      console.log(`✅ Closed job tab: ${activeJobTabId}`);
    } catch (error) {
      console.log(`Tab ${activeJobTabId} already closed or invalid`);
    } finally {
      activeJobTabId = null;
    }
  }
}

/**
 * Add job to retry queue if it hasn't exceeded max retries
 */
function addToRetryQueue(job, reason) {
  // Safety check: ensure job is not null/undefined
  if (!job) {
    console.error("❌ Cannot add null/undefined job to retry queue. Reason:", reason);
    return false;
  }
  
  job.retryCount = (job.retryCount || 0) + 1;
  job.lastFailureReason = reason;
  job.lastRetryTime = Date.now();
  
  if (job.retryCount < MAX_RETRIES) {
    console.log(`🔄 Adding job to retry queue (attempt ${job.retryCount}/${MAX_RETRIES}): ${job.jobTitle}`);
    retryQueue.push(job);
    saveQueueState();
    return true;
  } else {
    console.log(`❌ Job exceeded max retries (${MAX_RETRIES}): ${job.jobTitle}`);
    job.failureCategory = categorizeFailure(reason);
    failedJobs.push(job);
    saveQueueState();
    return false;
  }
}

//  add retry logic for failed jobs 
async function processNextJob() {
  console.log(`🔄 processNextJob() called - Queue: ${jobQueue.length}, Processing: ${processing}, ActiveTab: ${activeJobTabId}`);
  
  // Send log to popup for testing
  sendLogToPopup(`Processing job queue - ${jobQueue.length} jobs remaining`);
  
  // CRASH PREVENTION: Check tab count before processing
  await preventCrash();
  
  // SAFETY CHECK: Don't process if already processing or have active job tab
  if (processing) {
    console.log("⚠️ Already processing a job, skipping...");
    return;
  }
  
  if (activeJobTabId) {
    console.log("⚠️ Job tab still active, waiting for completion...");
    // Check if the tab actually exists
    chrome.tabs.get(activeJobTabId, (tab) => {
      if (chrome.runtime.lastError) {
        console.log("🧹 Active job tab no longer exists, cleaning up...");
        activeJobTabId = null;
        setTimeout(() => {
          processNextJob();
        }, 1000);
      } else {
        console.log(`🔍 Active job tab ${activeJobTabId} still exists: ${tab.url}`);
      }
    });
    return;
  }
  
  // First, check if there are jobs in retry queue (prioritize retries)
  if (retryQueue.length > 0 && jobQueue.length === 0) {
    console.log(`🔄 Processing ${retryQueue.length} jobs from retry queue...`);
    jobQueue = [...retryQueue];
    retryQueue = [];
    saveQueueState();
  }
  
  if (jobQueue.length === 0) {
    processing = false;
    console.log("📭 All jobs processed from main queue.");
    console.log(`📊 Final counts - Retry queue: ${retryQueue.length}, Failed: ${failedJobs.length}`);
    
    // Ensure no job tab is left open
    await safelyCloseJobTab();
    
    if (retryQueue.length > 0) {
      console.log(`🔄 ${retryQueue.length} jobs in retry queue will be processed next cycle.`);
      // Process retry queue
      setTimeout(() => {
        console.log("🔄 Starting retry queue processing...");
        processNextJob();
      }, JOB_THROTTLE * 2); // Wait a bit longer before retries
      return;
    }
    
    if (failedJobs.length > 0) {
      console.log(`${failedJobs.length} jobs permanently failed after ${MAX_RETRIES} attempts each.`);
      
      // Detailed failure analysis for accuracy improvement
      console.log("\n📊 FINAL ACCURACY REPORT:");
      console.log("─".repeat(50));
      
      // Get success count from storage instead of localStorage (which doesn't exist in service worker)
      chrome.storage.local.get(['successfulJobs'], (result) => {
        const successJobs = result.successfulJobs || [];
        const totalJobs = successJobs.length + failedJobs.length;
        const successRate = totalJobs > 0 ? (successJobs.length / totalJobs * 100).toFixed(1) : 0;
        
        console.log(`📈 Success Rate: ${successRate}% (${successJobs.length}/${totalJobs})`);
        console.log(`✅ Successful Jobs: ${successJobs.length}`);
        console.log(`❌ Failed Jobs: ${failedJobs.length}`);
        
        if (failedJobs.length > 0) {
          console.log("\n🔍 FAILURE BREAKDOWN:");
          
          // Categorize failures for improvement insights
          const failureCategories = {};
          failedJobs.forEach(job => {
            const category = job.failureCategory || 'unknown';
            if (!failureCategories[category]) {
              failureCategories[category] = [];
            }
            failureCategories[category].push(job.status);
          });
          
          Object.entries(failureCategories).forEach(([category, failures]) => {
            console.log(`\n📋 ${category.toUpperCase()}: ${failures.length} jobs`);
            const uniqueReasons = [...new Set(failures)];
            uniqueReasons.forEach(reason => {
              const count = failures.filter(f => f === reason).length;
              console.log(`   • ${reason}: ${count} occurrences`);
            });
          });
        }
        
        console.log("\n" + "─".repeat(50));
        console.log("📊 Report Complete");
        
        // Send completion message to main Indeed tab
        sendCompletionMessageToMainTab(successJobs.length, failedJobs.length, totalJobs, successRate);
      });
    } else {
      // No failed jobs - perfect completion!
      console.log("🎉 ALL JOBS COMPLETED SUCCESSFULLY!");
      console.log("✨ FINAL STATUS: DONE - All jobs processed with 100% success rate!");
      chrome.storage.local.get(['successfulJobs'], (result) => {
        const successJobs = result.successfulJobs || [];
        console.log(`📈 COMPLETION SUMMARY: ${successJobs.length} jobs applied successfully!`);
        sendCompletionMessageToMainTab(successJobs.length, 0, successJobs.length, 100);
      });
    }
    logQueueStatus();
    clearQueueState(); // Clear storage when done
    return;
  }
  console.log("🚀 Starting to process next job...");
  processing = true;
  currentJob = jobQueue.shift();
  currentJob.status = "processing";
  
  const remainingJobs = jobQueue.length;
  const jobNumber = (currentJob.queuePosition || 'Unknown');
  
  console.log(`🎯 Processing job ${jobNumber}: ${currentJob.jobTitle}`);
  console.log(`📊 Jobs remaining in queue: ${remainingJobs}`);
  console.log(`🔗 Job URL: ${currentJob.jobLink}`);
  
  logQueueStatus();

  // SAFETY: Close any existing job tab before creating new one
  safelyCloseJobTab().then(() => {
    console.log("🔧 Creating new job tab...");
    createJobTab();
  });
}

function createJobTab() {
  chrome.tabs.create({ url: currentJob.jobLink, active: false }, async (tab) => {
    if (chrome.runtime.lastError) {
      console.error("Failed to create tab:", chrome.runtime.lastError.message);
      currentJob.status = "fail_tab_creation";
      processing = false; // Reset processing flag
      
      const shouldRetry = addToRetryQueue(currentJob, "fail_tab_creation");
      if (!shouldRetry) {
        console.log("❌ Tab creation permanently failed for:", currentJob.jobTitle);
      }
      
      setTimeout(processNextJob, JOB_THROTTLE);
      return;
    }

    const tabId = tab.id;
    activeJobTabId = tabId; // Track this as our active job tab
    console.log(`📋 Created job tab ${tabId} for: ${currentJob.jobTitle}`);
    let tabClosed = false;
    let jobCompleted = false;

    // Increased timeout for complex applications
    let timeoutId = setTimeout(async () => {
      if (!jobCompleted) {
        console.log(`⏰ Job timed out after ${JOB_TIMEOUT/1000} seconds:`, currentJob.jobTitle);
        jobCompleted = true;
        processing = false; // Reset processing flag
        currentJob.status = "fail_timeout";
        
        const shouldRetry = addToRetryQueue(currentJob, "fail_timeout");
        if (!shouldRetry) {
          console.log("❌ Job timeout permanently failed for:", currentJob.jobTitle);
        }
        
        logQueueStatus();
        
        // Safely close job tab
        await safelyCloseJobTab();
        tabClosed = true;
        
        setTimeout(processNextJob, JOB_THROTTLE);
      }
    }, JOB_TIMEOUT);

    // Listen for job result from content.js
    const jobResultListener = async (msg, sender, resp) => {
      if (msg.action === "jobResult" && msg.jobId === currentJob.jobId && !jobCompleted) {
        console.log("📋 Received job result:", msg.result, "for job:", currentJob.jobTitle);
        jobCompleted = true;
        processing = false; // Reset processing flag
        clearTimeout(timeoutId);
        
        currentJob.status = msg.result;
        
        // Send response immediately to prevent channel closing
        if (resp) {
          try {
            resp({ status: "received", timestamp: Date.now() });
          } catch (error) {
            console.log("📡 Response channel already closed, continuing...");
          }
        }
        
        // Enhanced result categorization with retry logic
        if (msg.result === "pass" || msg.result === "pass_no_forms_needed") {
          console.log("✅ Job succeeded:", currentJob.jobTitle, "- Result:", msg.result);
          console.log(`📈 Success! ${remainingJobs} jobs remaining in queue`);
          
          // Save successful job to storage
          chrome.storage.local.get(['successfulJobs'], (result) => {
            const successfulJobs = result.successfulJobs || [];
            successfulJobs.push({
              ...currentJob,
              successTime: Date.now(),
              finalResult: msg.result
            });
            chrome.storage.local.set({ successfulJobs });
            console.log(`💾 Saved successful job. Total successes: ${successfulJobs.length + 1}`);
          });
        } else {
          // Try to retry the job first
          const shouldRetry = addToRetryQueue(currentJob, msg.result);
          
          if (shouldRetry) {
            console.log("🔄 Job added to retry queue:", currentJob.jobTitle, "- Reason:", msg.result, "- Attempt:", currentJob.retryCount);
          } else {
            console.log("❌ Job permanently failed:", currentJob.jobTitle, "- Final reason:", msg.result);
          }
        }
        
        console.log(`📊 Processing complete. About to continue with remaining jobs...`);
        logQueueStatus();
        
        // Safely close job tab
        await safelyCloseJobTab();
        tabClosed = true;
        
        chrome.runtime.onMessage.removeListener(jobResultListener);
        
        console.log(`⏭️ Job completed. Waiting ${JOB_THROTTLE}ms before processing next job...`);
        console.log(`📊 Current status: ${jobQueue.length} jobs remaining, processing flag reset to false`);
        
        setTimeout(() => {
          console.log("⏰ Throttle delay complete, calling processNextJob()");
          processNextJob();
        }, JOB_THROTTLE);
      }
    };
    
    chrome.runtime.onMessage.addListener(jobResultListener);

    // Wait longer for page to fully load before sending message
    const tabUpdateListener = (updatedTabId, info) => {
      if (updatedTabId === tabId && info.status === "complete" && !jobCompleted) {
        console.log(`🌐 Tab ${tabId} loaded, waiting 3 seconds before sending job...`);
        
        // Wait 3 seconds for dynamic content to load
        setTimeout(() => {
          if (jobCompleted || tabClosed) return;
          
          // Verify tab still exists before sending message
          chrome.tabs.get(tabId, (tab) => {
            if (chrome.runtime.lastError) {
              console.error("Tab no longer exists:", chrome.runtime.lastError.message);
              if (!jobCompleted) {
                jobCompleted = true;
                clearTimeout(timeoutId);
                currentJob.status = "fail_tab_closed";
                failedJobs.push(currentJob);
                chrome.runtime.onMessage.removeListener(jobResultListener);
                setTimeout(processNextJob, JOB_THROTTLE);
              }
              return;
            }
            
            // Check if content script is already responsive before injecting
            console.log("🔧 Testing if content script is already active...");
            chrome.tabs.sendMessage(tabId, { action: "ping" }, (response) => {
              if (chrome.runtime.lastError || !response) {
                console.log("🔧 No response from content script, injecting fresh copy...");
                
                // Inject content script since there's no response
                chrome.scripting.executeScript({
                  target: { tabId: tabId },
                  files: ['content.js']
                }, () => {
                  if (chrome.runtime.lastError) {
                    console.error("❌ Failed to inject content script:", chrome.runtime.lastError.message);
                    if (!jobCompleted) {
                      jobCompleted = true;
                      clearTimeout(timeoutId);
                      currentJob.status = "fail_script_inject";
                      const shouldRetry = addToRetryQueue(currentJob, "fail_script_inject");
                      chrome.runtime.onMessage.removeListener(jobResultListener);
                      chrome.tabs.remove(tabId, () => tabClosed = true);
                      setTimeout(processNextJob, JOB_THROTTLE);
                    }
                    return;
                  }
                  
                  // Wait for fresh content script to initialize, then send job
                  setTimeout(() => {
                    sendJobWithRetry();
                  }, 4000); // Longer wait for fresh injection
                });
              } else {
                console.log("✅ Content script already active, sending job directly...");
                sendJobWithRetry();
              }
            });
            
            // Send job with retry logic for bfcache recovery
            function sendJobWithRetry() {
              let messageAttempts = 0;
              const maxMessageAttempts = 3;
              
              function attemptSendMessage() {
                messageAttempts++;
                console.log(`📤 Attempt ${messageAttempts}/${maxMessageAttempts}: Sending job to content script: ${currentJob.jobTitle}`);
                
                // First send a cleanup message to prevent duplicate processing
                chrome.tabs.sendMessage(tabId, { action: "cleanup" }, () => {
                  // Ignore cleanup response, just proceed with job
                  setTimeout(() => {
                    chrome.tabs.sendMessage(tabId, { action: "applyJob", job: currentJob }, (response) => {
                      if (chrome.runtime.lastError) {
                        const errorMsg = chrome.runtime.lastError.message;
                        console.error(`❌ Message attempt ${messageAttempts} failed:`, errorMsg);
                        
                        if (errorMsg.includes("back/forward cache") && messageAttempts < maxMessageAttempts) {
                          console.log("🔄 Bfcache detected, re-injecting content script and retrying...");
                          
                          // Re-inject and try again
                          chrome.scripting.executeScript({
                            target: { tabId: tabId },
                            files: ['content.js']
                          }, () => {
                            if (chrome.runtime.lastError) {
                              console.error("❌ Failed to re-inject content script:", chrome.runtime.lastError.message);
                              if (!jobCompleted) {
                                jobCompleted = true;
                                clearTimeout(timeoutId);
                                currentJob.status = "fail_script_reinject";
                                const shouldRetry = addToRetryQueue(currentJob, "fail_script_reinject");
                                chrome.runtime.onMessage.removeListener(jobResultListener);
                                chrome.tabs.remove(tabId, () => tabClosed = true);
                                setTimeout(processNextJob, JOB_THROTTLE);
                              }
                              return;
                            }
                            
                            // Wait and retry
                            setTimeout(() => {
                              attemptSendMessage();
                            }, 3000);
                          });
                        } else {
                          // Max attempts reached or different error
                          if (!jobCompleted) {
                            jobCompleted = true;
                            clearTimeout(timeoutId);
                            currentJob.status = "fail_communication_persistent";
                            const shouldRetry = addToRetryQueue(currentJob, "fail_communication_persistent");
                            chrome.runtime.onMessage.removeListener(jobResultListener);
                            chrome.tabs.remove(tabId, () => tabClosed = true);
                            setTimeout(processNextJob, JOB_THROTTLE);
                          }
                        }
                      } else {
                        console.log(`✅ Message sent successfully on attempt ${messageAttempts}`);
                      }
                    });
                  }, 500); // Small delay after cleanup
                });
              }
              
              attemptSendMessage();
            }
          });
        }, 3000); // Wait 3 seconds for Indeed's dynamic content
        
        chrome.tabs.onUpdated.removeListener(tabUpdateListener);
      }
    };
    
    chrome.tabs.onUpdated.addListener(tabUpdateListener);

    // Handle tab being closed externally
    const tabRemovedListener = (removedTabId) => {
      if (removedTabId === tabId && !jobCompleted) {
        console.log("🚪 Job tab was closed externally");
        jobCompleted = true;
        tabClosed = true;
        processing = false; // Reset processing flag
        activeJobTabId = null; // Clear active job tab
        clearTimeout(timeoutId);
        
        // Only try to retry if we have a valid currentJob
        if (currentJob) {
          const shouldRetry = addToRetryQueue(currentJob, "fail_tab_closed");
          if (!shouldRetry) {
            console.log("❌ Job permanently failed due to tab closure:", currentJob.jobTitle);
          }
        } else {
          console.log("⚠️ Tab closed but no current job to retry");
        }
        
        chrome.runtime.onMessage.removeListener(jobResultListener);
        chrome.tabs.onRemoved.removeListener(tabRemovedListener);
        setTimeout(processNextJob, JOB_THROTTLE);
      }
    };
    
    chrome.tabs.onRemoved.addListener(tabRemovedListener);
  });
}

// Helper function to send console logs to popup
function sendLogToPopup(message, level = 'LOG') {
  const logMessage = {
    greeting: "consoleLog",
    message: message,
    level: level,
    timestamp: new Date().toISOString()
  };
  
  // Send to all tabs (for content scripts)
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, logMessage, () => {
        if (chrome.runtime.lastError) {
          // Silently handle the error
        }
      });
    });
  });
  
  // Also send to popup (if it's open)
  chrome.runtime.sendMessage(logMessage, () => {
    if (chrome.runtime.lastError) {
      // Popup might not be open, that's fine
      console.log("ℹ️ Popup not open to receive console log");
    }
  });
}
