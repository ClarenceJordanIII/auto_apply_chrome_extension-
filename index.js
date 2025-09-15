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