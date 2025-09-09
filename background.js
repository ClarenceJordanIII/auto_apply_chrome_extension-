// Background script for Indeed job auto-apply extension

let jobQueue = [];
let failedJobs = [];
let currentJob = null;
let processing = false;

const JOB_TIMEOUT = 50000; // 50 seconds per job (less than content script timeout)
const JOB_THROTTLE = 3000; // 3 seconds between jobs (prevent rate limiting)

// Load job queue from storage on startup
chrome.storage.local.get(['jobQueue', 'failedJobs'], (result) => {
  if (result.jobQueue) jobQueue = result.jobQueue;
  if (result.failedJobs) failedJobs = result.failedJobs;
  logQueueStatus();
});
// TODO add this to an html  when done
function saveQueueState() {
  chrome.storage.local.set({ jobQueue, failedJobs });
}

function clearQueueState() {
  chrome.storage.local.remove(['jobQueue', 'failedJobs']);
}

function logQueueStatus() {
  console.log(`Queue: ${jobQueue.length} pending, ${failedJobs.length} failed`);
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
    // Add jobs to queue with pending status
    jobQueue = jobQueue.concat(message.jobs.map(job => ({ ...job, status: "pending" })));
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
//  add retry logic for failed jobs 
function processNextJob() {
  if (jobQueue.length === 0) {
    processing = false;
    console.log("All jobs processed.");
    if (failedJobs.length > 0) {
      console.log(`${failedJobs.length} jobs failed and will not be retried.`);
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
      failedJobs.push(currentJob);
      setTimeout(processNextJob, JOB_THROTTLE);
      return;
    }

    const tabId = tab.id;
    let tabClosed = false;
    let jobCompleted = false;

    // Increased timeout for complex applications
    let timeoutId = setTimeout(() => {
      if (!jobCompleted) {
        console.log("Job timed out after 60 seconds:", currentJob);
        jobCompleted = true;
        currentJob.status = "fail_timeout";
        failedJobs.push(currentJob);
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
        if (msg.result === "pass") {
          console.log("✅ Job succeeded:", currentJob.jobTitle);
        } else {
          failedJobs.push(currentJob);
          console.log("❌ Job failed:", currentJob.jobTitle, "- Reason:", msg.result);
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
