document.addEventListener("click", () => {
    console.log("Content script clicked!");
    chrome.runtime.sendMessage({userInput:"clicked  !"})
});