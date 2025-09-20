// Extension Status Check - Run this in the browser console on Indeed.com

console.log("🔍 EXTENSION STATUS CHECK");
console.log("========================");

// 1. Basic Extension Checks
console.log("1. Extension Loaded:", !!window.indeedAutoApplyLoaded);
console.log("2. Context Valid:", typeof isExtensionContextValid === 'function' ? isExtensionContextValid() : 'Function not found');
console.log("3. Chrome Runtime:", !!chrome?.runtime?.id);

// 2. Automation State
console.log("\n📊 AUTOMATION STATE:");
console.log("- Automation Allowed:", window.automationAllowed);
console.log("- Manual Start Required:", window.manualStartRequired);
console.log("- Automation Running:", window.automationRunning);
console.log("- Extension Ready:", window.indeedExtensionReady);
console.log("- Emergency Stop:", window.emergencyStopFlag);

// 3. Storage State
try {
  const storedState = localStorage.getItem('extensionAutomationState');
  console.log("\n💾 STORED STATE:", storedState ? JSON.parse(storedState) : 'None');
} catch (e) {
  console.log("\n💾 STORED STATE: Error reading -", e.message);
}

// 4. Message Listener
console.log("\n📡 MESSAGE SYSTEM:");
console.log("- Listener Added:", !!window._indeedMessageListenerAdded);

// 5. Debug Functions Available
console.log("\n🛠️ DEBUG FUNCTIONS:");
console.log("- Debug Extension:", !!window.debugExtension);
console.log("- Trigger Emergency Stop:", typeof window.triggerEmergencyStop);

// 6. Current URL Check
console.log("\n🌐 PAGE INFO:");
console.log("- URL:", window.location.href);
console.log("- Is Indeed:", window.location.href.includes('indeed.com'));

// 7. Try Manual Start Test
console.log("\n🚀 MANUAL START TEST:");
if (typeof handleStartProcess === 'function') {
  console.log("✅ handleStartProcess function is available");
  console.log("💡 To start automation, run: handleStartProcess()");
} else {
  console.log("❌ handleStartProcess function not found");
}

// 8. Extension Errors
if (window.extensionErrors && window.extensionErrors.length > 0) {
  console.log("\n❌ EXTENSION ERRORS:", window.extensionErrors);
} else {
  console.log("\n✅ No stored extension errors");
}

console.log("\n========================");
console.log("🎯 DIAGNOSIS COMPLETE");
console.log("========================");

// Quick fix suggestions based on state
if (!window.indeedAutoApplyLoaded) {
  console.log("🔧 FIX: Extension not loaded - refresh page (Ctrl+F5)");
} else if (!window.indeedExtensionReady) {
  console.log("🔧 FIX: Extension not ready - wait a few seconds or run: window.debugExtension.restart()");
} else if (window.emergencyStopFlag) {
  console.log("🔧 FIX: Emergency stop active - run: window.emergencyStopFlag = false");
} else if (!window.automationAllowed && window.manualStartRequired) {
  console.log("✅ READY: Extension ready for manual start - click Start button or run: handleStartProcess()");
} else {
  console.log("🤔 State unclear - check console for errors or try: window.debugExtension.restart()");
}