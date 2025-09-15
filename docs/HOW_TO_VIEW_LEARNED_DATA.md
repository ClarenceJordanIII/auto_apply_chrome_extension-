# 📊 How to View Your Learned Job Data

## 🎯 **Quick Answer**: Your learned data is stored in browser localStorage

## 📍 **Storage Locations**

### **Primary Storage: Browser localStorage**
- `questionsConfig_learnedData` - Main learned patterns
- `questionLearningPatterns` - Question learning system data  
- `questionLearningPatterns_backup` - Backup patterns

### **Secondary Storage: questions_config.json**
- `learnedData.patterns[]` - Patterns saved to file (backup)

---

## 🔍 **How to View Your Data**

### **Method 1: Browser DevTools** ⭐ EASIEST
1. Go to Indeed in Chrome
2. Press **F12** 
3. Click **"Application"** tab
4. Click **"Local Storage"** → **"https://www.indeed.com"**
5. Look for keys starting with `question`

### **Method 2: Console Commands** ⚡ FASTEST  
1. Go to Indeed
2. Press **F12** → **"Console"** tab
3. Paste these commands:

```javascript
// 📋 VIEW ALL LEARNED DATA
console.log('=== LEARNED DATA ===');
console.log('Main Data:', JSON.parse(localStorage.getItem('questionsConfig_learnedData') || '{}'));
console.log('Learning Patterns:', JSON.parse(localStorage.getItem('questionLearningPatterns') || '{}'));
console.log('Backup Patterns:', JSON.parse(localStorage.getItem('questionLearningPatterns_backup') || '{}'));

// 📊 EXPORT TO FILE (copy from console)
console.log('EXPORT JSON:', JSON.stringify({
  learnedData: JSON.parse(localStorage.getItem('questionsConfig_learnedData') || '{}'),
  learningPatterns: JSON.parse(localStorage.getItem('questionLearningPatterns') || '{}'),
  backup: JSON.parse(localStorage.getItem('questionLearningPatterns_backup') || '{}')
}, null, 2));
```

### **Method 3: Extension Console Helper** 🛠️ ADVANCED
I can add a helper function to your extension. Type in console:
```javascript
// Check if learned data exists
if (window.questionLearningSystem) {
  console.log('Learning System Active:', window.questionLearningSystem);
  console.log('Learned Patterns Count:', window.questionLearningSystem.learnedPatterns?.size || 0);
}
```

---

## 📝 **What You'll See**

### **Learned Patterns Format**:
```json
{
  "patterns": [
    {
      "keywords": ["experience", "years"],
      "value": "5+ years",
      "confidence": 95,
      "usageCount": 12,
      "lastUsed": "2025-09-13T..."
    }
  ],
  "lastUpdated": "2025-09-13T...",
  "version": "1.0"
}
```

### **Learning System Format**:
```json
{
  "timestamp": 1726234567890,
  "patterns": [
    ["question_key", {
      "answer": "learned_answer",
      "confidence": 85,
      "count": 3
    }]
  ]
}
```

---

## 🚀 **Try This Right Now**:

1. **Open Chrome**
2. **Go to Indeed.com**  
3. **Press F12** → **Console**
4. **Paste this command**:
```javascript
Object.keys(localStorage).filter(k => k.includes('question')).forEach(key => {
  console.log(`${key}:`, localStorage.getItem(key));
});
```

This will show you ALL question-related data stored in your browser! 📊