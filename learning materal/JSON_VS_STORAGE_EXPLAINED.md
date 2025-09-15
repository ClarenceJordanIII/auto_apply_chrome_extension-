# 📊 JSON Data vs Storage: What Goes Where?

## 🎯 **Quick Answer**: 
**BOTH** the JSON data AND learned data are loaded, but they serve different purposes and go to different places.

---

## 📋 **What Gets Loaded & Where**

### **1. Static JSON Data (From questions_config.json)** 📄
**What**: Your pre-configured patterns and default values
**Where**: Loaded into memory (NOT stored in localStorage)
**Used for**: 
- `personalInfo` (address, phone, email, etc.)
- `textInputPatterns` (pre-configured answer patterns)
- `numberInputPatterns`, `selectPatterns`, etc.
- `defaultValues` (fallback answers)

### **2. Learned Data** 🧠
**What**: Patterns the AI learns from your job applications  
**Where**: Stored in localStorage AND backed up to JSON
**Used for**: Dynamic learning and improving over time

---

## 🔄 **How It Works**

### **Loading Process**:
1. **Extension loads** → Fetches `questions_config.json`
2. **Static data** → Kept in memory for immediate use
3. **Learned data** → Checked in localStorage first, then JSON backup
4. **During job applications** → Uses BOTH static + learned data

### **Storage Process**:
```javascript
// Static JSON data (stays in memory)
questionsConfig.personalInfo.email // "john.doe.jobs@gmail.com"
questionsConfig.textInputPatterns  // Your pre-configured patterns

// Learned data (goes to localStorage)
localStorage.setItem('questionsConfig_learnedData', learnedPatterns)
localStorage.setItem('questionLearningPatterns', dynamicLearning)
```

---

## 🔍 **What You Can View in Browser Storage**

### **In localStorage** (F12 → Application → Local Storage):
- ✅ `questionsConfig_learnedData` - Learned patterns
- ✅ `questionLearningPatterns` - AI learning data  
- ✅ `questionLearningPatterns_backup` - Backup data
- ❌ Your personal info (address, phone, etc.) - NOT stored here

### **In Memory Only** (Not in localStorage):
- ❌ `personalInfo` (address, phone, email)
- ❌ `textInputPatterns` (your pre-configured patterns)  
- ❌ `defaultValues` (fallback answers)

---

## 🧪 **Test This Right Now**

### **View Static JSON Data** (loaded from file):
```javascript
// In console on Indeed page:
console.log('Static Config Loaded:', questionsConfig?.personalInfo?.email);
console.log('Text Patterns Count:', questionsConfig?.textInputPatterns?.length);
```

### **View Learned Data** (stored in browser):
```javascript
// In console on Indeed page:
console.log('Learned Data:', localStorage.getItem('questionsConfig_learnedData'));
console.log('Learning Patterns:', localStorage.getItem('questionLearningPatterns'));
```

---

## 💡 **Why This Design?**

### **Static Data (Memory Only)**:
- **Faster access** - No localStorage lookup needed
- **Always fresh** - Reloaded from JSON each time
- **Your configuration** - Personal info, preferences

### **Learned Data (localStorage)**:
- **Persistent** - Survives browser restarts
- **Dynamic** - Changes as AI learns
- **Backed up** - Saved to JSON file occasionally

So to answer your question: **The entire JSON is loaded into memory, but only the learned data gets stored in localStorage.** Your personal info and pre-configured patterns stay in memory and are used directly from the JSON file! 🚀