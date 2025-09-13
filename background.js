// Background script for Indeed job auto-apply extension

let jobQueue = [];
let failedJobs = [];
let retryQueue = [];
let currentJob = null;
let processing = false;

const JOB_TIMEOUT = 500000; // 90 seconds per job (more time for complex applications)
const JOB_THROTTLE = 3000; // 3 seconds between jobs (prevent rate limiting)
const MAX_RETRIES = 5; // Maximum retry attempts per job

// Load job queue from storage on startup
chrome.storage.local.get(['jobQueue', 'failedJobs', 'retryQueue'], (result) => {
  if (result.jobQueue) jobQueue = result.jobQueue;
  if (result.failedJobs) failedJobs = result.failedJobs;
  if (result.retryQueue) retryQueue = result.retryQueue;
  logQueueStatus();
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
  try {
    console.log("Background received message:", message.action);
  } catch (error) {
    console.error("Error logging message:", error.message);
  }
  
  // Handle job queue from Indeed page
  if (message.action === "queueJobs" && message.jobs && Array.isArray(message.jobs)) {
    console.log("Received jobs to queue:", message.jobs.length);
    // Add jobs to queue with pending status and retry count
    jobQueue = jobQueue.concat(message.jobs.map(job => ({ 
      ...job, 
      status: "pending",
      retryCount: 0,
      originalAttemptTime: Date.now()
    })));
    sendResponse({ status: "queued", queueLength: jobQueue.length });
    logQueueStatus();
    saveQueueState(); // Save state after adding jobs
    if (!processing) processNextJob();
    return true; // Keep message channel open
  }

  // Handle job results from content script
  if (message.action === "jobResult") {
    console.log("Received job result:", message.result, "for job:", message.jobId);
    sendResponse({ status: "received" });
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

  // Handle unknown actions
  console.warn("Unknown message action:", message.action);
  sendResponse({ status: "error", message: "Unknown action" });
  return true;
});
/**
 * Add job to retry queue if it hasn't exceeded max retries
 */
function addToRetryQueue(job, reason) {
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
function processNextJob() {
  // First, check if there are jobs in retry queue (prioritize retries)
  if (retryQueue.length > 0 && jobQueue.length === 0) {
    console.log(`🔄 Processing ${retryQueue.length} jobs from retry queue...`);
    jobQueue = [...retryQueue];
    retryQueue = [];
    saveQueueState();
  }
  
  if (jobQueue.length === 0) {
    processing = false;
    console.log("All jobs processed.");
    
    if (retryQueue.length > 0) {
      console.log(`🔄 ${retryQueue.length} jobs in retry queue will be processed next cycle.`);
      // Process retry queue
      setTimeout(() => {
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
      });
    }
    logQueueStatus();
    clearQueueState(); // Clear storage when done
    return;
  }
  processing = true;
  currentJob = jobQueue.shift();
  currentJob.status = "processing";
  logQueueStatus();
  console.log("Processing job:", currentJob);

  chrome.tabs.create({ url: currentJob.jobLink, active: false }, (tab) => {
    if (chrome.runtime.lastError) {
      console.error("Failed to create tab:", chrome.runtime.lastError.message);
      currentJob.status = "fail_tab_creation";
      
      const shouldRetry = addToRetryQueue(currentJob, "fail_tab_creation");
      if (!shouldRetry) {
        console.log("❌ Tab creation permanently failed for:", currentJob.jobTitle);
      }
      
      setTimeout(processNextJob, JOB_THROTTLE);
      return;
    }

    const tabId = tab.id;
    let tabClosed = false;
    let jobCompleted = false;

    // Increased timeout for complex applications
    let timeoutId = setTimeout(() => {
      if (!jobCompleted) {
        console.log("Job timed out after 90 seconds:", currentJob);
        jobCompleted = true;
        currentJob.status = "fail_timeout";
        
        const shouldRetry = addToRetryQueue(currentJob, "fail_timeout");
        if (!shouldRetry) {
          console.log("❌ Job timeout permanently failed for:", currentJob.jobTitle);
        }
        
        logQueueStatus();
        
        // Safely close tab
        if (!tabClosed) {
          chrome.tabs.remove(tabId, () => {
            if (chrome.runtime.lastError) {
              console.log("Tab already closed or invalid:", chrome.runtime.lastError.message);
            }
            tabClosed = true;
          });
        }
        
        setTimeout(processNextJob, JOB_THROTTLE);
      }
    }, JOB_TIMEOUT); // Use constant timeout

    // Listen for job result from content.js
    const jobResultListener = (msg, sender, resp) => {
      if (msg.action === "jobResult" && msg.jobId === currentJob.jobId && !jobCompleted) {
        console.log("📋 Received job result:", msg.result, "for job:", currentJob.jobTitle);
        jobCompleted = true;
        clearTimeout(timeoutId);
        
        currentJob.status = msg.result;
        
        // Enhanced result categorization with retry logic
        if (msg.result === "pass" || msg.result === "pass_no_forms_needed") {
          console.log("✅ Job succeeded:", currentJob.jobTitle, "- Result:", msg.result);
          
          // Save successful job to storage
          chrome.storage.local.get(['successfulJobs'], (result) => {
            const successfulJobs = result.successfulJobs || [];
            successfulJobs.push({
              ...currentJob,
              successTime: Date.now(),
              finalResult: msg.result
            });
            chrome.storage.local.set({ successfulJobs });
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
        logQueueStatus();
        
        // Safely close tab
        if (!tabClosed) {
          chrome.tabs.remove(tabId, () => {
            if (chrome.runtime.lastError) {
              console.log("Tab already closed:", chrome.runtime.lastError.message);
            }
            tabClosed = true;
          });
        }
        
        chrome.runtime.onMessage.removeListener(jobResultListener);
        setTimeout(processNextJob, JOB_THROTTLE);
        resp({ status: "received" });
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
            
            try {
              console.log(`📤 Sending job to content script: ${currentJob.jobTitle}`);
              chrome.tabs.sendMessage(tabId, { action: "applyJob", job: currentJob }, (response) => {
                if (chrome.runtime.lastError) {
                  const errorMsg = chrome.runtime.lastError.message;
                  console.error("❌ Error sending message to tab:", errorMsg);
                  
                  // Handle specific error cases
                  if (errorMsg.includes("back/forward cache") || 
                      errorMsg.includes("receiving end does not exist") ||
                      errorMsg.includes("message channel is closed") ||
                      errorMsg.includes("Extension context invalidated")) {
                    
                    if (!jobCompleted) {
                      console.log("🔄 Extension context lost, attempting recovery...");
                      jobCompleted = true;
                      clearTimeout(timeoutId);
                      chrome.runtime.onMessage.removeListener(jobResultListener);
                      
                      // Check if tab still exists and try to reinject content script
                      chrome.tabs.get(tabId, (tabInfo) => {
                        if (chrome.runtime.lastError) {
                          console.log("Tab no longer exists, marking job as failed");
                          currentJob.status = "fail_tab_lost";
                          failedJobs.push(currentJob);
                          setTimeout(processNextJob, JOB_THROTTLE);
                          return;
                        }
                        
                        // Tab exists, try to reinject content script
                        console.log("🔧 Reinjecting content script...");
                        chrome.scripting.executeScript({
                          target: { tabId: tabId },
                          files: ['content.js']
                        }, () => {
                          if (chrome.runtime.lastError) {
                            console.error("Failed to reinject content script:", chrome.runtime.lastError.message);
                            currentJob.status = "fail_reinject";
                            failedJobs.push(currentJob);
                            chrome.tabs.remove(tabId, () => tabClosed = true);
                            setTimeout(processNextJob, JOB_THROTTLE);
                            return;
                          }
                          
                          // Wait a moment then retry sending the job
                          setTimeout(() => {
                            console.log("🔄 Retrying job after content script reinjection...");
                            chrome.tabs.sendMessage(tabId, { action: "applyJob", job: currentJob }, (retryResponse) => {
                              if (chrome.runtime.lastError) {
                                console.error("Retry also failed:", chrome.runtime.lastError.message);
                                currentJob.status = "fail_retry_failed";
                                failedJobs.push(currentJob);
                                chrome.tabs.remove(tabId, () => tabClosed = true);
                                setTimeout(processNextJob, JOB_THROTTLE);
                              } else {
                                console.log("✅ Retry successful, job restarted");
                                // Job is now running, reset timeout and listeners
                                timeoutId = setTimeout(() => {
                                  if (!jobCompleted) {
                                    jobCompleted = true;
                                    currentJob.status = "fail_timeout";
                                    failedJobs.push(currentJob);
                                    chrome.tabs.remove(tabId, () => tabClosed = true);
                                    setTimeout(processNextJob, JOB_THROTTLE);
                                  }
                                }, JOB_TIMEOUT);
                                chrome.runtime.onMessage.addListener(jobResultListener);
                                jobCompleted = false; // Reset completion flag
                              }
                            });
                          }, 2000);
                        });
                      });
                    }
                  } else {
                    // Other communication errors
                    if (!jobCompleted) {
                      jobCompleted = true;
                      clearTimeout(timeoutId);
                      currentJob.status = "fail_communication";
                      failedJobs.push(currentJob);
                      chrome.runtime.onMessage.removeListener(jobResultListener);
                      chrome.tabs.remove(tabId, () => tabClosed = true);
                      setTimeout(processNextJob, JOB_THROTTLE);
                    }
                  }
                } else {
                  console.log("✅ Message sent successfully to content script");
                }
              });
            } catch (error) {
              console.error("❌ Exception sending message:", error.message);
              if (!jobCompleted) {
                jobCompleted = true;
                clearTimeout(timeoutId);
                currentJob.status = "fail_exception";
                failedJobs.push(currentJob);
                chrome.runtime.onMessage.removeListener(jobResultListener);
                chrome.tabs.remove(tabId, () => tabClosed = true);
                setTimeout(processNextJob, JOB_THROTTLE);
              }
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
        console.log("🚪 Tab was closed externally");
        jobCompleted = true;
        tabClosed = true;
        clearTimeout(timeoutId);
        currentJob.status = "fail_tab_closed";
        failedJobs.push(currentJob);
        chrome.runtime.onMessage.removeListener(jobResultListener);
        chrome.tabs.onRemoved.removeListener(tabRemovedListener);
        setTimeout(processNextJob, JOB_THROTTLE);
      }
    };
    
    chrome.tabs.onRemoved.addListener(tabRemovedListener);
  });
}
