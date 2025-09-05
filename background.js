chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Message from content script:", message);
  console.log(message.userInput)
});
