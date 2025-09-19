chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.greeting === "helloworld") {
    console.log("Message received in content script");
    sendResponse({ farewell: "goodbye" });
  }
  
  // Listen for status updates from background script
  if (request.greeting === "statusUpdate") {
    console.log("📢 STATUS UPDATE:", request.status);
    console.log("🕐 Time:", request.timestamp);

    const feed = document.getElementById('feed-container');
    if (feed) {
      const statusMessage = document.createElement('div');
      statusMessage.className = 'timeline-item' 
      const seconddiv = document.createElement('div');
      seconddiv.className = 'timeline-icon gray';
      statusMessage.appendChild(seconddiv);
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", "24");
      svg.setAttribute("height", "24");
      svg.setAttribute("viewBox", "0 0 20 20");
      svg.setAttribute("fill", "currentColor");

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("fill-rule", "evenodd");
      path.setAttribute("clip-rule", "evenodd");
      path.setAttribute("d", "M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z");

      svg.appendChild(path);
      seconddiv.appendChild(svg);
      const timelineDiv = document.createElement('div');
      timelineDiv.className = 'timeline-content';
      statusMessage.appendChild(timelineDiv);
      const timelineContext = document.createElement('div');
      timelineContext.className = 'timeline-text'
      timelineContext.textContent = request.status;
      timelineDiv.appendChild(timelineContext);
      const timeElement = document.createElement('time');
      timeElement.setAttribute('datetime', request.timestamp);
      timeElement.textContent = new Date(request.timestamp).toLocaleTimeString();
      timelineDiv.appendChild(timeElement);
      feed.appendChild(statusMessage);
    }





    
    // You can display this status in your UI here
    // For example, update a status element:
    const statusElement = document.getElementById('status');
    if (statusElement) {
      statusElement.textContent = request.status;
      statusElement.setAttribute('data-timestamp', request.timestamp);
    }
    
    // Check if this is a completion or stop message
    if (request.isComplete || request.isStopped || 
        request.status.includes('completed') || request.status.includes('All job applications completed') ||
        request.status.includes('stopped') || request.status.includes('halted')) {
      console.log("� Detected automation end - updating status indicators");
      liveTogle(false, request.status);
    }
    
    sendResponse({ status: "received" });
    
    // Save appropriate status (true if still running, false if completed)
    const isStillRunning = !request.isComplete && !request.status.includes('completed');
    saveExtensionStatus(isStillRunning, request.status, getFeedHistory());
  }

  // Listen for console logs from content script/background
  if (request.greeting === "consoleLog") {
    console.log("Console log from content script:", request.message);
    
    const feed = document.getElementById('feed-container');
    if (feed) {
      const logMessage = document.createElement('div');
      logMessage.className = 'timeline-item';
      
      const iconDiv = document.createElement('div');
      iconDiv.className = `timeline-icon ${request.level === 'ERROR' ? 'red' : request.level === 'WARN' ? 'yellow' : 'blue'}`;
      logMessage.appendChild(iconDiv);
      
      // Console icon
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", "24");
      svg.setAttribute("height", "24");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "currentColor");
      
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M20 3H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h3l2 3 2-3h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v3zm0-3H6V6h12v3z");
      
      svg.appendChild(path);
      iconDiv.appendChild(svg);
      
      const contentDiv = document.createElement('div');
      contentDiv.className = 'timeline-content';
      logMessage.appendChild(contentDiv);
      
      const textDiv = document.createElement('div');
      textDiv.className = 'timeline-text';
      textDiv.innerHTML = `<strong>[${request.level || 'LOG'}]</strong> ${request.message}`;
      if (request.level === 'ERROR') {
        textDiv.style.color = '#ef4444';
      } else if (request.level === 'WARN') {
        textDiv.style.color = '#f59e0b';
      }
      contentDiv.appendChild(textDiv);
      
      const timeElement = document.createElement('time');
      timeElement.setAttribute('datetime', request.timestamp);
      timeElement.textContent = new Date(request.timestamp).toLocaleTimeString();
      contentDiv.appendChild(timeElement);
      
      feed.appendChild(logMessage);
      
      // Auto-scroll to bottom
      feed.scrollTop = feed.scrollHeight;
    }
    
    sendResponse({ status: "log_received" });
    
    // Save updated feed history to storage
    saveExtensionStatus(
      statusIndicatorRed.style.display === 'inline-block', 
      statusElement.textContent, 
      getFeedHistory()
    );
  }
});




const statusIndicatorRed = document.getElementById('status-indicator-red');
const statusIndicatorGrey = document.getElementById('status-indicator-grey');
const statusElement = document.getElementById('status');

// liveToggle function is defined below with persistence functionality

const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
// Start button event listener
startBtn.addEventListener("click", (e) => {
  if (e.target && e.target.id === 'start-btn') {
    console.log("Start button clicked");
    liveTogle(true);
    
    // Send directly to content script on active tab
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "startProcess"
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error:", chrome.runtime.lastError.message);
          liveTogle(false); // Reset status on error
        } else if (response && response.status === "automation_started") {
          console.log("✅ Automation started successfully");
        }
      });
    });
  }
});
// Stop button event listener
stopBtn.addEventListener("click", (e) => {
  if (e.target && e.target.id === 'stop-btn') {
    console.log("Stop button clicked");
    
    // Clear logs and messages immediately
    clearLogsAndMessages();
    
    // Immediately show stopped status
    liveTogle(false, "🛑 AUTOMATION STOPPED");

    // Send stop message to content script AND background script
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      console.log("🔍 Found tabs:", tabs.length);
      
      if (!tabs || tabs.length === 0) {
        console.error("❌ No active tabs found");
        return;
      }
      
      // Stop content script
      console.log(`📤 Sending stop message to tab ${tabs[0].id}`);
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "stopProcess"
      }, (response) => {
        console.log("📥 Content script response:", response);
        if (response && response.status === "automation_stopped") {
          console.log("✅ Content script automation stopped.");
        }
        if (chrome.runtime.lastError) {
          console.error("❌ Error stopping content script:", chrome.runtime.lastError.message);
        }
      });
      
      // Stop background script job processing
      chrome.runtime.sendMessage({
        action: "emergencyStop"
      }, (response) => {
        if (response && response.status === "stopped") {
          console.log("Background script job queue stopped.");
          // Confirm full stop with updated message
          liveTogle(false, "✅ All automation stopped");
        }
        if (chrome.runtime.lastError) {
          console.error("Error stopping background script:", chrome.runtime.lastError.message);
          // Still update UI even if there was an error
          liveTogle(false, "⚠️ Stop attempted");
        }
      });
      
      console.log("✅ Stop button processed - all automation should be stopping");
      
      // FALLBACK: If active tab detection fails, try to broadcast stop to all tabs
      setTimeout(() => {
        console.log("🔄 Sending fallback stop broadcast to all tabs...");
        chrome.tabs.query({}, (allTabs) => {
          allTabs.forEach(tab => {
            if (tab.url && (tab.url.includes('indeed.com') || tab.url.includes('localhost'))) {
              chrome.tabs.sendMessage(tab.id, { action: "stopProcess" }, () => {
                if (chrome.runtime.lastError) {
                  console.log(`Tab ${tab.id} not responsive (expected):`, chrome.runtime.lastError.message);
                }
              });
            }
          });
        });
      }, 1000);
    });
  }
});

/**
 * Clear all stored logs and frontend messages when stopping
 */
function clearLogsAndMessages() {
  console.log("🧹 Clearing logs and messages...");
  
  // Clear the visual feed immediately
  const feedContainer = document.getElementById("feed");
  if (feedContainer) {
    feedContainer.innerHTML = `
      <div class="feed-item">
        <div class="timeline-dot success"></div>
        <div class="content">🧹 Logs cleared - Ready to start fresh</div>
      </div>
    `;
  }
  
  // Clear feedHistory array completely
  feedHistory.length = 0;
  
  // Update stored status with cleared feed
  const statusData = {
    isRunning: false,
    statusText: "Stopped",
    feedHistory: [], // Clear stored feed history
    timestamp: new Date().toISOString()
  };
  
  chrome.storage.local.set({ 
    extensionStatus: statusData 
  }, () => {
    if (chrome.runtime.lastError) {
      console.error("Failed to clear stored logs:", chrome.runtime.lastError);
    } else {
      console.log("✅ Logs and messages cleared successfully");
    }
  });
  
  // Also clear any console logs stored in background script
  chrome.runtime.sendMessage({
    action: "clearLogs"
  });
}

// Listen for automation stopped status from content script

// ============== STATUS PERSISTENCE FUNCTIONALITY ==============

// Save current status to chrome storage
function saveExtensionStatus(isRunning, statusText, feedHistory = []) {
  const statusData = {
    isRunning: isRunning,
    statusText: statusText,
    feedHistory: feedHistory,
    timestamp: new Date().toISOString()
  };
  
  chrome.storage.local.set({ 
    extensionStatus: statusData 
  }, () => {
    if (chrome.runtime.lastError) {
      console.error("Failed to save status:", chrome.runtime.lastError);
    } else {
      console.log("✅ Status saved:", statusData);
    }
  });
}

// Restore status when popup opens
function restoreExtensionStatus() {
  chrome.storage.local.get(['extensionStatus'], (result) => {
    if (chrome.runtime.lastError) {
      console.error("Failed to restore status:", chrome.runtime.lastError);
      return;
    }
    
    const savedStatus = result.extensionStatus;
    if (savedStatus) {
      console.log("📥 Restoring saved status:", savedStatus);
      
      // Restore visual status indicators
      if (savedStatus.isRunning) {
        liveTogle(true);
      } else {
        liveTogle(false);
      }
      
      // Restore status text if different from default
      if (savedStatus.statusText && savedStatus.statusText !== 'Ready for job applications...') {
        const statusElement = document.getElementById('status');
        if (statusElement) {
          statusElement.textContent = savedStatus.statusText;
        }
      }
      
      // Restore feed history
      if (savedStatus.feedHistory && savedStatus.feedHistory.length > 0) {
        restoreFeedHistory(savedStatus.feedHistory);
      }
    } else {
      console.log("ℹ️ No saved status found - using defaults");
    }
  });
}

// Get current feed history for saving
function getFeedHistory() {
  const feed = document.getElementById('feed-container');
  const feedHistory = [];
  
  if (feed) {
    const timelineItems = feed.querySelectorAll('.timeline-item');
    timelineItems.forEach((item) => {
      const iconDiv = item.querySelector('.timeline-icon');
      const textDiv = item.querySelector('.timeline-text');
      const timeElement = item.querySelector('time');
      
      if (iconDiv && textDiv && timeElement) {
        const iconClass = iconDiv.className.includes('red') ? 'red' : 
                         iconDiv.className.includes('yellow') ? 'yellow' :
                         iconDiv.className.includes('blue') ? 'blue' : 'gray';
                         
        feedHistory.push({
          iconClass: iconClass,
          text: textDiv.textContent || textDiv.innerHTML,
          timestamp: timeElement.getAttribute('datetime') || new Date().toISOString(),
          displayTime: timeElement.textContent
        });
      }
    });
  }
  
  return feedHistory;
}

// Restore feed history from saved data
function restoreFeedHistory(feedHistory) {
  const feed = document.getElementById('feed-container');
  if (!feed || !feedHistory.length) return;
  
  console.log("📥 Restoring feed history:", feedHistory.length, "items");
  
  feedHistory.forEach((item) => {
    const statusMessage = document.createElement('div');
    statusMessage.className = 'timeline-item';
    
    const iconDiv = document.createElement('div');
    iconDiv.className = `timeline-icon ${item.iconClass}`;
    statusMessage.appendChild(iconDiv);
    
    // Create appropriate icon based on type
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "24");
    svg.setAttribute("height", "24");
    svg.setAttribute("fill", "currentColor");
    
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    
    if (item.iconClass === 'gray') {
      // Status update icon (person)
      svg.setAttribute("viewBox", "0 0 20 20");
      path.setAttribute("fill-rule", "evenodd");
      path.setAttribute("clip-rule", "evenodd");
      path.setAttribute("d", "M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z");
    } else {
      // Console log icon (terminal)
      svg.setAttribute("viewBox", "0 0 24 24");
      path.setAttribute("d", "M20 3H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h3l2 3 2-3h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v3zm0-3H6V6h12v3z");
    }
    
    svg.appendChild(path);
    iconDiv.appendChild(svg);
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'timeline-content';
    statusMessage.appendChild(contentDiv);
    
    const textDiv = document.createElement('div');
    textDiv.className = 'timeline-text';
    textDiv.innerHTML = item.text;
    contentDiv.appendChild(textDiv);
    
    const timeElement = document.createElement('time');
    timeElement.setAttribute('datetime', item.timestamp);
    timeElement.textContent = item.displayTime;
    contentDiv.appendChild(timeElement);
    
    feed.appendChild(statusMessage);
  });
  
  // Auto-scroll to bottom
  feed.scrollTop = feed.scrollHeight;
}

// Enhanced liveToggle that saves status
const liveTogle = (flag, customMessage = null) => {
  console.log(`🔄 Status update: ${flag ? 'ACTIVE' : 'INACTIVE'}${customMessage ? ` - ${customMessage}` : ''}`);
  
  // turns on live status indicator
  if (flag) {
    statusIndicatorRed.style.display = 'inline-block';
    statusIndicatorGrey.style.display = 'none';
    statusElement.textContent = customMessage || 'Currently applying .....';
  } 
  // turns off live status indicator
  else {
    statusIndicatorRed.style.display = 'none';
    statusIndicatorGrey.style.display = 'inline-block';
    statusElement.textContent = customMessage || 'Ready for job applications...';
  }
  
  // Update timestamp
  const timeElement = document.getElementById('status-time');
  if (timeElement) {
    timeElement.textContent = new Date().toLocaleTimeString();
  }
  
  // Save status whenever it changes
  saveExtensionStatus(flag, statusElement.textContent, getFeedHistory());
}

// Initialize status restoration when popup loads
document.addEventListener('DOMContentLoaded', () => {
  console.log("🔄 Popup loaded - restoring status...");
  setTimeout(restoreExtensionStatus, 100); // Small delay to ensure DOM is ready
});

