# 🚀 Quick Test Guide - "Try Again"

## 🎯 What You Need to Test

Based on all the fixes we've implemented, here's what to verify:

### 1. **Load Extension & Check Console**
- Go to `chrome://extensions/` → Reload extension  
- Navigate to Indeed.com
- Open console (F12)
- **Look for**: Clean loading without error spam ✅

### 2. **Test Smart Form Detection**  
- Go to Indeed job search page
- Click "Start" button
- **Should see**: `"🚫 Blocking automation: You're on a job search/listing page"` ✅
- Browse jobs normally (no interference) ✅

### 3. **Test Form Activation**
- Click on a job → Click "Apply" → Reach application form  
- **Should see**: `"🎯 New application forms detected - starting automation"` ✅
- OR click "Start" on form page for immediate activation ✅

### 4. **Test Context Recovery**
- Start automation → Navigate away → Come back
- **Should see**: Clean recovery messages, no error loops ✅
- State should persist through navigation ✅

## 🔍 Key Things to Check

### ✅ **Good Signs** (What You Want to See):
```
🚀 Indeed Auto Apply Extension Loaded!
🔄 Form detection listener activated
🚫 Blocking automation: You're on a job search/listing page  
🎯 New application forms detected - starting automation
✅ Message sent successfully
📖 Page restored from BFCache - reinitializing extension
```

### ❌ **Bad Signs** (Should NOT Appear):
```
❌ Message send failed: Error: Extension context invalidated.
❌ Message send failed: Error: Extension context invalidated.
❌ Message send failed: Error: Extension context invalidated.
[Infinite repetition...]
```

## 🎛️ Quick Debug Commands

```javascript
// Check extension status
debugExtension.checkState()

// View recent automation logs  
debugExtension.viewDebugLogs('AUTOMATION', null, 10)

// Check if forms detected on current page
document.querySelector('form[action*="apply"]')
```

## 📞 What to Report

Just tell me:
1. **Does the extension load cleanly?** (no error spam in console)
2. **Does it block on search pages?** (when you click Start on job listings)  
3. **Does it activate on forms?** (when you reach application pages)
4. **Any error messages?** (copy exact text if you see any)

## 🎯 Expected Flow

**Search Page** → Click Start → "🚫 Blocked, browse normally"  
**Job Page** → Click Apply → **Form appears** → "🎯 Automation activated!" ✅  

---

**Go ahead and test it out!** The extension should now be much more stable and only activate when you actually need it (on application forms). 🎉