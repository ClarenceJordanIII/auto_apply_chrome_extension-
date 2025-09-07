chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "storeJobs") {
    console.log("Storing jobs:", message.jobs);
    // Here you can implement the logic to store the jobs data
    
  }
});
