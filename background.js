let jobQueue = [];
// Add jobs: jobQueue.push(job);
// Remove jobs: jobQueue.shift();

function sleep(ms){
  return new Promise(resolve => setTimeout(resolve, ms));
}



chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "storeJobs") {
    console.log("Storing jobs:", message.jobs);
    // Here you can implement the logic to store the jobs data
    jobQueue.push(...message.jobs);
    console.log("Current job queue:", jobQueue);
( async ()=>{
      for (let job of jobQueue){
      console.log("Processing job:", job);

      await sleep(2000); // Simulate some processing time
      console.log("Job processed:", job);
      jobQueue.shift();
    }
})()
    sendResponse({ status: "Jobs stored successfully" });
  }
});

console.log("jobQueue in background.js:", jobQueue);





