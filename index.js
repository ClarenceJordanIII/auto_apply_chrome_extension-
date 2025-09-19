chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.greeting === "helloworld") {
    console.log("Message received in content script");
    sendResponse({ farewell: "goodbye" });
  }
  
  // Listen for status updates from background script
  if (request.greeting === "statusUpdate") {
    console.log("📢 STATUS UPDATE:", request.status);
    console.log("🕐 Time:", request.timestamp);
    
    // You can display this status in your UI here
    // For example, update a status element:
    const statusElement = document.getElementById('status');
    if (statusElement) {
      statusElement.textContent = request.status;
      statusElement.setAttribute('data-timestamp', request.timestamp);
    }
    
    sendResponse({ status: "received" });
  }
});




const statusIndicatorRed = document.getElementById('status-indicator-red');
const statusIndicatorGrey = document.getElementById('status-indicator-grey');
const statusElement = document.getElementById('status');

//  toggle live status indicator
const liveTogle = (flag) =>{
// turns on live status indicator
  if (flag) {
    statusIndicatorRed.style.display = 'inline-block';
    statusIndicatorGrey.style.display = 'none';
     statusElement.textContent = 'Currently applying .....';
  } 
  // turns off live status indicator
  else {
    statusIndicatorRed.style.display = 'none';
    statusIndicatorGrey.style.display = 'inline-block';
    statusElement.textContent = 'Ready for job applications...';
  }
}

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
    liveTogle(false);

    // Send stop message to content script
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "stopProcess"
      }, (response) => {
        if (response && response.status === "automation_stopped") {
          console.log("Automation has been stopped.");
          liveTogle(false);
        }
        if (chrome.runtime.lastError) {
          console.error("Error:", chrome.runtime.lastError.message);
        } else {
          console.log("✅ Automation stopped successfully");
        }
      });
    });
  }
});

// Listen for automation stopped status from content script

