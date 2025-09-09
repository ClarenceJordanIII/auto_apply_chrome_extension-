// Background script for Indeed job auto-apply extension

let jobQueue = [];
let failedJobs = [];
let currentJob = null;
let processing = false;

const JOB_TIMEOUT = 30000; // 30 seconds per job
const JOB_THROTTLE = 2000; // 2 seconds between jobs

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
    const tabId = tab.id;
    let timeoutId = setTimeout(() => {
      // Timeout: mark as failed and close tab
      chrome.tabs.remove(tabId);
      currentJob.status = "fail_timeout";
      failedJobs.push(currentJob);
      console.log("Job timed out:", currentJob);
      logQueueStatus();
      setTimeout(processNextJob, JOB_THROTTLE);
    }, JOB_TIMEOUT);

    // Listen for job result from content.js
    chrome.runtime.onMessage.addListener(function jobResultListener(msg, sender, resp) {
      if (msg.action === "jobResult" && msg.jobId === currentJob.jobId) {
        clearTimeout(timeoutId);
        chrome.tabs.remove(tabId);
        currentJob.status = msg.result;
        if (msg.result === "pass") {
          console.log("Job succeeded:", currentJob);
        } else {
          failedJobs.push(currentJob);
          console.log("Job failed:", currentJob);
        }
        logQueueStatus();
        chrome.runtime.onMessage.removeListener(jobResultListener);
        setTimeout(processNextJob, JOB_THROTTLE);
      }
    });

    // Send job to content.js in the new tab
    chrome.tabs.onUpdated.addListener(function tabUpdateListener(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === "complete") {
        try {
          chrome.tabs.sendMessage(tabId, { action: "applyJob", job: currentJob }, (response) => {
            if (chrome.runtime.lastError) {
              console.error("Error sending message to tab:", chrome.runtime.lastError.message);
              // Mark job as failed if we can't communicate with content script
              currentJob.status = "fail_communication";
              failedJobs.push(currentJob);
              chrome.tabs.remove(tabId);
              setTimeout(processNextJob, JOB_THROTTLE);
            }
          });
        } catch (error) {
          console.error("Failed to send message to content script:", error.message);
          currentJob.status = "fail_communication";
          failedJobs.push(currentJob);
          chrome.tabs.remove(tabId);
          setTimeout(processNextJob, JOB_THROTTLE);
        }
        chrome.tabs.onUpdated.removeListener(tabUpdateListener);
      }
    });

    // When a job page is opened, click the Indeed Apply button if present
    function clickIndeedApplyButton(tabId) {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          const btn = document.getElementById('indeedApplyButton');
          if (btn) {
            btn.click();
            console.log('Clicked Indeed Apply button.');
          } else {
            console.warn('Indeed Apply button not found.');
          }
        }
      });
    }

    // Example usage: call clickIndeedApplyButton(tabId) after opening a job tab
    clickIndeedApplyButton(tabId);
  });
}
