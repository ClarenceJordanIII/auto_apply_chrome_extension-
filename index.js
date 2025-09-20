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

  // Listen for console logs from content script/background - ENHANCED
  if (request.greeting === "consoleLog") {
    // Also log to popup's console for debugging
    const logMethod = {
      'ERROR': console.error,
      'WARN': console.warn,
      'INFO': console.info,
      'DEBUG': console.debug,
      'LOG': console.log
    }[request.level] || console.log;
    
    logMethod("📡 Content Script:", request.message);
    
      const feed = document.getElementById('feed-container');
      if (feed) {
        // Check if this log level should be displayed
        const logLevelFilter = getLogLevelFilter();
        if (!shouldShowLogLevel(request.level || 'LOG', logLevelFilter)) {
          return; // Skip this log message
        }
        
        const logMessage = document.createElement('div');
        logMessage.className = 'timeline-item';
        logMessage.setAttribute('data-log-level', request.level || 'LOG');      // Enhanced icon styling based on log level
      const iconDiv = document.createElement('div');
      const iconClass = {
        'ERROR': 'red',
        'WARN': 'yellow', 
        'INFO': 'blue',
        'DEBUG': 'gray',
        'LOG': 'green'
      }[request.level] || 'blue';
      
      iconDiv.className = `timeline-icon ${iconClass}`;
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
      
      // Enhanced text styling with proper colors and icons
      const levelInfo = {
        'ERROR': { color: '#ef4444', prefix: '❌' },
        'WARN': { color: '#f59e0b', prefix: '⚠️' },
        'INFO': { color: '#3b82f6', prefix: 'ℹ️' },
        'DEBUG': { color: '#6b7280', prefix: '🔍' },
        'LOG': { color: '#10b981', prefix: '📝' }
      };
      
      const level = request.level || 'LOG';
      const info = levelInfo[level] || levelInfo.LOG;
      
      textDiv.innerHTML = `<strong>${info.prefix} [${level}]</strong> ${request.message}`;
      textDiv.style.color = info.color;
      
      // Add special formatting for specific message types
      if (request.message.includes('SUCCESS') || request.message.includes('✅')) {
        textDiv.style.backgroundColor = '#dcfce7';
        textDiv.style.padding = '4px 8px';
        textDiv.style.borderRadius = '4px';
        textDiv.style.border = '1px solid #bbf7d0';
      } else if (level === 'ERROR') {
        textDiv.style.backgroundColor = '#fef2f2';
        textDiv.style.padding = '4px 8px';
        textDiv.style.borderRadius = '4px';
        textDiv.style.border = '1px solid #fecaca';
      } else if (level === 'WARN') {
        textDiv.style.backgroundColor = '#fffbeb';
        textDiv.style.padding = '4px 8px';
        textDiv.style.borderRadius = '4px';
        textDiv.style.border = '1px solid #fed7aa';
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




// Initialize feedHistory array
let feedHistory = [];

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
    
    // First, resume background automation if stopped
    chrome.runtime.sendMessage({
      action: "startAutomation"
    }, (bgResponse) => {
      console.log("🔧 Background automation response:", bgResponse);
      
      // Then send to content script on active tab
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
    });
  }
});
// Stop button event listener
stopBtn.addEventListener("click", (e) => {
  if (e.target && e.target.id === 'stop-btn') {
    console.log("Stop button clicked");
    
    // Show confirmation dialog
    if (!confirm("⚠️ Are you sure you want to stop the automation?\n\nThis will halt all job applications in progress.")) {
      console.log("❌ Stop cancelled by user");
      return;
    }
    
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
          
          // Show success notification
          alert("✅ SUCCESS!\n\nAutomation has been completely stopped.\nAll job applications have been halted.");
        }
        if (chrome.runtime.lastError) {
          console.error("Error stopping background script:", chrome.runtime.lastError.message);
          // Still update UI even if there was an error
          liveTogle(false, "⚠️ Stop attempted");
          
          // Show fallback notification
          alert("⚠️ STOP ATTEMPTED\n\nAutomation stop initiated.\nSome processes may still be finishing.");
        } else if (!response || response.status !== "stopped") {
          // Show fallback notification if no proper response
          liveTogle(false, "⚠️ Stop signal sent");
          alert("📤 STOP SIGNAL SENT\n\nStop command has been sent to all processes.\nAutomation should halt shortly.");
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
  chrome.storage.local.get(['extensionStatus', 'userStopped'], (result) => {
    if (chrome.runtime.lastError) {
      console.error("Failed to restore status:", chrome.runtime.lastError);
      return;
    }
    
    const savedStatus = result.extensionStatus;
    const userStopped = result.userStopped;
    
    // If user stopped automation, always show stopped state regardless of saved status
    if (userStopped) {
      console.log("🛑 User previously stopped automation - showing stopped state");
      liveTogle(false, "✅ Automation stopped by user");
      return;
    }
    
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

// ═══════════════════════════════════════════════════════════════════════════
// 📊 LOG FILTERING SYSTEM - Control what logs are displayed
// ═══════════════════════════════════════════════════════════════════════════

// Get current log level filter setting
function getLogLevelFilter() {
  return localStorage.getItem('logLevelFilter') || 'INFO'; // Default to INFO and above
}

// Set log level filter
function setLogLevelFilter(level) {
  localStorage.setItem('logLevelFilter', level);
  applyLogLevelFilter();
}

// Check if a log level should be shown based on filter
function shouldShowLogLevel(messageLevel, filterLevel) {
  const levels = ['DEBUG', 'LOG', 'INFO', 'WARN', 'ERROR'];
  const messageLevelIndex = levels.indexOf(messageLevel);
  const filterLevelIndex = levels.indexOf(filterLevel);
  
  // Show if message level is at or above filter level
  return messageLevelIndex >= filterLevelIndex;
}

// Apply log level filter to existing messages
function applyLogLevelFilter() {
  const filter = getLogLevelFilter();
  const logMessages = document.querySelectorAll('[data-log-level]');
  
  logMessages.forEach(message => {
    const messageLevel = message.getAttribute('data-log-level');
    if (shouldShowLogLevel(messageLevel, filter)) {
      message.style.display = '';
    } else {
      message.style.display = 'none';
    }
  });
}

// Add log filter controls (call after DOM is ready)
function addLogFilterControls() {
  const feed = document.getElementById('feed-container');
  if (feed) {
    // Create filter controls container
    const filterContainer = document.createElement('div');
    filterContainer.style.cssText = `
      padding: 8px;
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    `;
    
    const label = document.createElement('span');
    label.textContent = 'Log Level:';
    label.style.fontWeight = '500';
    filterContainer.appendChild(label);
    
    // Create filter dropdown
    const select = document.createElement('select');
    select.style.cssText = `
      padding: 2px 6px;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      font-size: 12px;
    `;
    
    const levels = [
      { value: 'DEBUG', label: '🔍 All (Debug+)' },
      { value: 'LOG', label: '📝 Log+' },
      { value: 'INFO', label: 'ℹ️ Info+' },
      { value: 'WARN', label: '⚠️ Warnings+' },
      { value: 'ERROR', label: '❌ Errors Only' }
    ];
    
    levels.forEach(level => {
      const option = document.createElement('option');
      option.value = level.value;
      option.textContent = level.label;
      if (level.value === getLogLevelFilter()) {
        option.selected = true;
      }
      select.appendChild(option);
    });
    
    select.addEventListener('change', (e) => {
      setLogLevelFilter(e.target.value);
    });
    
    filterContainer.appendChild(select);
    
    // Insert filter controls before the feed
    feed.parentElement.insertBefore(filterContainer, feed);
  }
}

// Debug Logs Functionality
let currentLogs = [];
let logLevelFilter = '';
let logCategoryFilter = '';

function loadDebugLogs() {
  // Get active tab and request debug logs from content script
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "getDebugLogs"
      }, (response) => {
        if (chrome.runtime.lastError) {
          displayDebugLogs([]);
          console.log("Could not load debug logs:", chrome.runtime.lastError.message);
        } else if (response && response.logs) {
          currentLogs = response.logs;
          displayDebugLogs(currentLogs);
        } else {
          displayDebugLogs([]);
        }
      });
    }
  });
}

function displayDebugLogs(logs) {
  const debugLogsContainer = document.getElementById('debug-logs');
  if (!debugLogsContainer) return;

  if (!logs || logs.length === 0) {
    debugLogsContainer.innerHTML = '<div class="log-empty">No debug logs available</div>';
    return;
  }

  // Filter logs based on current filters
  const filteredLogs = logs.filter(log => {
    const levelMatch = !logLevelFilter || log.level === logLevelFilter;
    const categoryMatch = !logCategoryFilter || log.category === logCategoryFilter;
    return levelMatch && categoryMatch;
  });

  if (filteredLogs.length === 0) {
    debugLogsContainer.innerHTML = '<div class="log-empty">No logs match current filters</div>';
    return;
  }

  // Display filtered logs (show most recent first)
  const logsHTML = filteredLogs.slice(-50).reverse().map(log => {
    const timestamp = new Date(log.timestamp).toLocaleTimeString();
    return `
      <div class="log-entry ${log.level || 'INFO'}">
        <div class="log-timestamp">${timestamp}</div>
        <div>
          <span class="log-category">[${log.category || 'GENERAL'}]</span>
          <span class="log-level">[${log.level || 'INFO'}]</span>
        </div>
        <div class="log-message">${escapeHtml(log.message)}</div>
      </div>
    `;
  }).join('');

  debugLogsContainer.innerHTML = logsHTML;
  
  // Auto-scroll to bottom to show latest logs
  debugLogsContainer.scrollTop = debugLogsContainer.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function clearDebugLogs() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "clearDebugLogs"
      }, (response) => {
        loadDebugLogs(); // Refresh the display
      });
    }
  });
}

function exportDebugLogs() {
  if (currentLogs.length === 0) {
    alert('No logs to export');
    return;
  }

  const logText = currentLogs.map(log => {
    const timestamp = new Date(log.timestamp).toISOString();
    return `[${timestamp}] [${log.category || 'GENERAL'}] [${log.level || 'INFO'}] ${log.message}`;
  }).join('\n');

  const blob = new Blob([logText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `indeed-extension-logs-${new Date().toISOString().split('T')[0]}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Initialize status restoration when popup loads
document.addEventListener('DOMContentLoaded', () => {
  console.log("🔄 Popup loaded - restoring status...");
  setTimeout(() => {
    restoreExtensionStatus();
    addLogFilterControls(); // Add log filtering controls
    applyLogLevelFilter(); // Apply current filter
    
    // Initialize debug logs
    loadDebugLogs();
    
    // Set up debug controls
    const refreshBtn = document.getElementById('refresh-logs-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', loadDebugLogs);
    }
    
    const clearBtn = document.getElementById('clear-logs-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', clearDebugLogs);
    }
    
    const exportBtn = document.getElementById('export-logs-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportDebugLogs);
    }
    
    // Set up filter controls
    const levelFilter = document.getElementById('log-level-filter');
    if (levelFilter) {
      levelFilter.addEventListener('change', (e) => {
        logLevelFilter = e.target.value;
        displayDebugLogs(currentLogs);
      });
    }
    
    const categoryFilter = document.getElementById('log-category-filter');
    if (categoryFilter) {
      categoryFilter.addEventListener('change', (e) => {
        logCategoryFilter = e.target.value;
        displayDebugLogs(currentLogs);
      });
    }
    
    // Auto-refresh logs every 5 seconds
    setInterval(loadDebugLogs, 5000);
    
  }, 100); // Small delay to ensure DOM is ready
});

