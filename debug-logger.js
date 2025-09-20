// Debug Logger for Chrome Extension
// This script adds a dedicated log panel to the page for real-time debugging

(function() {
  'use strict';
  
  // Configuration
  const config = {
    showLogPanel: true,
    logLevels: {
      ERROR: { color: '#ff5252', emoji: '❌' },
      WARN: { color: '#ffab40', emoji: '⚠️' },
      INFO: { color: '#2196f3', emoji: 'ℹ️' },
      LOG: { color: '#4caf50', emoji: '📝' },
      DEBUG: { color: '#9e9e9e', emoji: '🔍' }
    },
    maxLogs: 1000,
    panelStyle: {
      position: 'fixed',
      bottom: '10px',
      right: '10px',
      width: '400px',
      maxHeight: '300px',
      background: 'rgba(0, 0, 0, 0.8)',
      color: 'white',
      fontFamily: 'monospace',
      fontSize: '12px',
      zIndex: '99999999',
      overflow: 'auto',
      borderRadius: '5px',
      boxShadow: '0 0 10px rgba(0, 0, 0, 0.5)',
      padding: '5px'
    }
  };
  
  // Initialize logging system
  let logs = [];
  let logPanel = null;
  let logContainer = null;
  
  // Create log panel
  function createLogPanel() {
    // Create main panel
    logPanel = document.createElement('div');
    Object.assign(logPanel.style, config.panelStyle);
    
    // Add header
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; padding: 5px; border-bottom: 1px solid #444;';
    header.innerHTML = `
      <div style="font-weight: bold;">Auto Job Apply Debug Console</div>
      <div>
        <button id="clear-debug-log" style="margin-right: 5px; padding: 2px 5px; background: #333; color: white; border: none; border-radius: 3px;">Clear</button>
        <button id="export-debug-log" style="margin-right: 5px; padding: 2px 5px; background: #333; color: white; border: none; border-radius: 3px;">Export</button>
        <button id="hide-debug-log" style="padding: 2px 5px; background: #333; color: white; border: none; border-radius: 3px;">Hide</button>
      </div>
    `;
    
    // Create log container
    logContainer = document.createElement('div');
    logContainer.style.cssText = 'max-height: 270px; overflow-y: auto; padding: 5px;';
    
    // Assemble panel
    logPanel.appendChild(header);
    logPanel.appendChild(logContainer);
    
    // Add event listeners
    logPanel.querySelector('#clear-debug-log').addEventListener('click', clearLogs);
    logPanel.querySelector('#export-debug-log').addEventListener('click', exportLogs);
    logPanel.querySelector('#hide-debug-log').addEventListener('click', toggleLogPanel);
    
    // Add to page
    document.body.appendChild(logPanel);
    
    // Show existing logs
    renderLogs();
  }
  
  // Add a log entry
  window.addDebugLogEntry = function(message, level = 'INFO', category = 'GENERAL') {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, level, message, category };
    
    // Add to memory
    logs.push(logEntry);
    
    // Trim if necessary
    if (logs.length > config.maxLogs) {
      logs.shift();
    }
    
    // Update display if panel exists
    renderLogs();
    
    return logEntry;
  };
  
  // Render logs to panel
  function renderLogs() {
    if (!logContainer) return;
    
    // Clear container
    logContainer.innerHTML = '';
    
    // Add each log
    logs.forEach(log => {
      const { timestamp, level, message, category } = log;
      const levelConfig = config.logLevels[level] || config.logLevels.LOG;
      
      const logElement = document.createElement('div');
      logElement.style.cssText = `padding: 3px 0; border-bottom: 1px solid #333; color: ${levelConfig.color};`;
      
      const time = new Date(timestamp).toLocaleTimeString();
      logElement.innerHTML = `<span style="color: #888;">[${time}]</span> <span style="color: #aaa;">[${category}]</span> ${levelConfig.emoji} ${escapeHtml(message)}`;
      
      logContainer.appendChild(logElement);
    });
    
    // Scroll to bottom
    logContainer.scrollTop = logContainer.scrollHeight;
  }
  
  // Clear logs
  function clearLogs() {
    logs = [];
    renderLogs();
  }
  
  // Export logs
  function exportLogs() {
    const logText = logs.map(log => {
      const { timestamp, level, message, category } = log;
      return `[${timestamp}][${level}][${category}] ${message}`;
    }).join('\n');
    
    // Create download
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    // Create download link
    const a = document.createElement('a');
    a.href = url;
    a.download = `auto-job-apply-debug-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    a.style.display = 'none';
    
    document.body.appendChild(a);
    a.click();
    
    // Cleanup
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }
  
  // Toggle log panel visibility
  function toggleLogPanel() {
    if (logPanel.style.display === 'none') {
      logPanel.style.display = 'block';
    } else {
      logPanel.style.display = 'none';
    }
  }
  
  // Escape HTML entities
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // Initialize when DOM is ready
  function init() {
    if (config.showLogPanel && document.body) {
      createLogPanel();
      addDebugLogEntry('Debug logger initialized', 'INFO', 'LOGGER');
    } else {
      // Wait for body to be ready
      setTimeout(init, 100);
    }
  }
  
  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  // Connect to content script logging
  window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'EXTENSION_LOG') {
      addDebugLogEntry(event.data.message, event.data.level, event.data.category);
    }
  });
  
  // Export for console access
  window.debugLogger = {
    addLog: addDebugLogEntry,
    clearLogs,
    exportLogs,
    togglePanel: toggleLogPanel,
    getLogs: () => [...logs]
  };
})();