# Extension Startup Diagnostic Guide

## 🔍 **Troubleshooting Script Not Starting**

The extension is designed to work in **MANUAL START ONLY** mode. Here's how to diagnose and fix startup issues:

### **Step 1: Check Browser Console**
Open the browser console (F12) and look for:

1. **Extension Load Messages:**
```
🚀 Content script loaded on Indeed - preventing cache...
🚀 Indeed Auto Apply Extension Loaded!
✅ Extension successfully initialized
```

2. **Manual Start Message:**
```
🛑 MANUAL START MODE: Extension will ONLY start when you click the Start button
```

### **Step 2: Run Diagnostic Commands**
Paste these commands in the browser console:

```javascript
// 1. Check if extension is loaded
console.log("Extension loaded:", !!window.indeedAutoApplyLoaded);

// 2. Check context validity
console.log("Context valid:", isExtensionContextValid());

// 3. Check extension state
window.debugExtension.checkState();

// 4. Check if ready for manual start
console.log("Ready for manual start:", {
  automationAllowed: window.automationAllowed,
  manualStartRequired: window.manualStartRequired,
  extensionReady: window.indeedExtensionReady
});

// 5. Try manual restart if needed
window.debugExtension.restart();
```

### **Step 3: Common Issues & Solutions**

#### **Issue 1: Extension Context Invalidated**
**Symptoms:** Red error messages about "Extension context invalidated"
**Solution:**
```javascript
// Refresh the page
window.location.reload();
```

#### **Issue 2: Extension Not Loading**
**Symptoms:** No console messages at all
**Solution:**
1. Check if you're on Indeed.com
2. Refresh the page (Ctrl+F5)
3. Check extension is enabled in Chrome

#### **Issue 3: Manual Start Not Working**
**Symptoms:** Extension loaded but start button doesn't work
**Solution:**
```javascript
// Force enable automation state
window.automationAllowed = true;
window.manualStartRequired = false;
window.automationRunning = true;

// Test start process manually
handleStartProcess();
```

#### **Issue 4: Stuck in Loading State**
**Symptoms:** Extension loads but never becomes ready
**Solution:**
```javascript
// Clear all stored states
localStorage.removeItem('extensionAutomationState');
sessionStorage.removeItem('extensionAutomationState');

// Restart extension
window.debugExtension.restart();
```

### **Step 4: Manual Override Commands**

If the extension is stuck, you can force it to work:

```javascript
// 1. Force enable all flags
window.automationAllowed = true;
window.manualStartRequired = false;
window.automationRunning = true;
window.indeedExtensionReady = true;
window.emergencyStopFlag = false;

// 2. Clear any blocking states
if (window.stateRefreshInterval) clearInterval(window.stateRefreshInterval);

// 3. Re-initialize if needed
try {
  initializeExtensionSafely();
  console.log("✅ Extension force-restarted");
} catch(e) {
  console.error("❌ Force restart failed:", e);
}
```

### **Step 5: Expected Working Flow**

1. **Page loads** → Extension initializes
2. **Console shows** → "MANUAL START MODE" message
3. **User clicks Start** → Extension receives "startProcess" message  
4. **Automation begins** → Job processing starts

### **Step 6: Test Message Sending**

```javascript
// Test if message system is working
chrome.runtime.sendMessage({action: "ping"}, (response) => {
  if (chrome.runtime.lastError) {
    console.error("❌ Message system broken:", chrome.runtime.lastError.message);
  } else {
    console.log("✅ Message system working:", response);
  }
});
```

### **Common Console Outputs:**

#### ✅ **Good (Working):**
```
🚀 Content script loaded on Indeed
✅ Extension successfully initialized  
🛑 MANUAL START MODE: Extension will ONLY start when you click the Start button
```

#### ❌ **Bad (Broken):**
```
❌ Extension context invalidated
❌ Critical error in extension initialization  
❌ Message send failed
```

### **Quick Fix Commands:**
```javascript
// Nuclear option - reset everything
localStorage.clear();
sessionStorage.clear();
window.location.reload();
```

---
**If none of these work, the issue might be:**
1. Chrome extension permissions
2. Content Security Policy blocks
3. Indeed page changes
4. Extension needs to be reloaded in Chrome