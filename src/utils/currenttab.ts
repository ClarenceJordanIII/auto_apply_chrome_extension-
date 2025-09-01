export const get_current_tab = async (): Promise<string | undefined> => {
  // Get the active tab
  let [tab] = await chrome.tabs.query({ active: true });
  // Execute script in the tab and get the result
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      func: () => window.location.href, // Get the URL from the page context
    });
    // The result is an array of objects with a 'result' property
    return results[0]?.result;
  } catch (error) {
    return error as string;
  }
};
