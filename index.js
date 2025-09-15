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

//  toggle live status indicator
const liveTogle = (flag) =>{
// turns on live status indicator
  if (flag) {
    statusIndicatorRed.style.display = 'inline-block';
    statusIndicatorGrey.style.display = 'none';
  } 
  // turns off live status indicator
  else {
    statusIndicatorRed.style.display = 'none';
    statusIndicatorGrey.style.display = 'inline-block';
  }
}

liveTogle(true)
