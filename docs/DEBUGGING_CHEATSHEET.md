# 🚀 Quick Debugging Command Reference

## Essential Commands We Used Today

### **Syntax Checking**
```bash
# Check JavaScript syntax (what we used to fix your errors!)
node -c filename.js

# Check and show detailed error info
node --check --print-errors filename.js

# Check multiple files at once
for file in *.js; do echo "Checking $file:"; node -c "$file"; done
```

### **Finding Duplicates (Our Main Fix!)**
```bash
# Find duplicate function names (exactly what we did!)
grep -n "^function\|^async function" content.js | \
sed 's/^[0-9]*:function //' | sed 's/^[0-9]*:async function //' | \
sed 's/(.*$//' | sort | uniq -c | sort -nr

# Simpler version - just find duplicate lines
sort filename.js | uniq -c | sort -nr | head -10
```

### **Text Searching & Pattern Matching**
```bash
# Search for specific patterns (like we found your duplicates)
grep -n "pattern" filename.js

# Case-insensitive search
grep -in "pattern" filename.js

# Search recursively in directories
grep -r "pattern" src/

# Search multiple patterns at once
grep -E "function|const|let" filename.js
```

### **File Analysis**
```bash
# Count lines, words, characters
wc -l filename.js

# Count occurrences of a pattern
grep -c "function" filename.js

# Show file size
du -h filename.js

# List files by size
ls -lah *.js | sort -k5 -nr
```

---

## 🔧 Advanced Debugging One-Liners

### **Function Analysis**
```bash
# Count all functions in a file
grep -c "^function\|^async function" filename.js

# List all function names
grep -o "function [a-zA-Z_][a-zA-Z0-9_]*" filename.js | sed 's/function //'

# Find functions with parameters
grep -n "function.*(" filename.js
```

### **Error Hunting**
```bash
# Find console.log statements (should remove in production)
grep -n "console\.log" *.js

# Find TODO/FIXME comments
grep -rn "TODO\|FIXME\|BUG" src/

# Find potential syntax issues
grep -n "==" *.js  # Should use === in JavaScript
```

### **Code Quality Checks**
```bash
# Find long lines (> 80 characters)
awk 'length > 80' filename.js

# Find files with no comments
grep -L "//" *.js

# Count variable declarations
grep -c "let\|const\|var" filename.js
```

---

## � **Manual Start/Stop System Debugging**

### **Check Extension State**
```javascript
// In browser console on Indeed page:
window.indeedExtensionReady  // Should be true when ready
window.emergencyStopFlag     // Should be false when running
window.formInteractionCount  // Count of form interactions

// Debug extension status
debugExtension.checkState()  // Shows complete extension status
```

### **Message System Debugging**
```javascript
// Test if message listener is working
chrome.runtime.sendMessage({action: "ping"}, (response) => {
  console.log("Response:", response);  // Should show "alive"
});

// Test start process manually  
chrome.runtime.sendMessage({action: "startProcess"}, (response) => {
  console.log("Start response:", response);
});
```

### **Common Manual Start Issues**
```bash
# Issue: Extension auto-starts on page load
# Fix: Check for setTimeout calls to indeedMain or startIndeed
grep -n "setTimeout.*indeedMain\|setTimeout.*startIndeed" content.js

# Issue: Learning system auto-starts
# Fix: Check for startAutoDetection calls in initAsync
grep -n "startAutoDetection" content.js

# Issue: Message handler not receiving startProcess
# Fix: Check message listener registration
grep -A 10 "onMessage.addListener" content.js
```

---

## �🎯 VS Code Terminal Shortcuts

### **Navigation**
```bash
# Quick directory navigation
cd "$(dirname "$(find . -name "*.js" | head -1)")"

# Go back to previous directory
cd -

# List only JavaScript files
ls *.js

# Find files by name
find . -name "*content*" -type f
```

### **Multiple File Operations**
```bash
# Check syntax for all JS files
for f in *.js; do echo "=== $f ==="; node -c "$f"; done

# Search pattern in all JS files
find . -name "*.js" -exec grep -l "pattern" {} \;

# Count total lines in all JS files
find . -name "*.js" -exec wc -l {} + | tail -1
```

---

## 🐛 Common Debug Scenarios

### **"Function Already Declared" Error**
```bash
# What we did to fix your error!
# 1. Find duplicate functions:
grep -n "function functionName" filename.js

# 2. See which ones are duplicates:
grep -A 5 -B 5 "function functionName" filename.js

# 3. Remove duplicates manually or with sed (careful!)
sed -i '/^function duplicateName/,/^}/d' filename.js
```

### **"Cannot Find Module" Error**
```bash
# Check if file exists
ls -la filename.js

# Find where a function/variable is defined
grep -rn "functionName" src/

# Check import/export statements
grep -n "import\|export\|require" filename.js
```

### **Performance Issues**
```bash
# Find large files that might need refactoring
find . -name "*.js" -size +50k

# Count complexity indicators
grep -c "if\|for\|while" filename.js

# Find deeply nested code (many brackets)
grep -o "{" filename.js | wc -l
```

---

## 💡 Pro Debugging Tips

### **1. Always Start with Syntax**
```bash
# Before doing anything complex, check basics:
node -c yourfile.js
```

### **2. Use Pipes for Complex Analysis**
```bash
# Chain commands together for powerful analysis:
grep "function" file.js | sort | uniq -c | sort -nr
```

### **3. Create Aliases for Common Commands**
Add to your `.bashrc` or `.bash_profile`:
```bash
alias jscheck='node -c'
alias finddupe='grep -n "^function" | sort | uniq -c | sort -nr'
alias jslint='find . -name "*.js" -exec node -c {} \;'
```

### **4. Use History for Repeated Commands**
```bash
# Search command history
history | grep "node -c"

# Repeat last command
!!

# Repeat command with different file
!node:s/oldfile.js/newfile.js/
```

### **5. Combine with Git for Change Tracking**
```bash
# See what changed since last commit
git diff HEAD -- *.js

# Check syntax on changed files only
git diff --name-only | grep "\.js$" | xargs -I {} node -c {}
```

---

## 🔍 Debugging Workflow Checklist

```markdown
## My Debug Process (Step by Step)
1. [ ] **Syntax First**: `node -c filename.js`
2. [ ] **Find Patterns**: `grep -n "error_pattern" file`
3. [ ] **Check Duplicates**: Use grep + sort + uniq combo
4. [ ] **Analyze Structure**: Count functions, lines, complexity
5. [ ] **Test Changes**: Small fixes, frequent testing
6. [ ] **Version Control**: Commit working versions
7. [ ] **Document**: Keep notes on solutions
```

---

## 🎓 Next Steps for Learning

### **Practice These Commands Daily:**
1. `node -c` - Make it a habit before running any JS
2. `grep -n` - Master pattern searching
3. `sort | uniq -c` - Find duplicates in any file
4. `wc -l` - Quick file analysis

### **Build Your Own Debug Scripts:**
1. Start with the commands we used today
2. Combine them into reusable scripts
3. Add your own checks and patterns
4. Share and iterate

### **Learn by Debugging Real Projects:**
1. Download open-source JavaScript projects
2. Run these commands on their code
3. Understand patterns and structures
4. Apply to your own projects

**Remember**: The commands we used today to fix your Chrome extension are the foundation of professional debugging. Master these, and you'll debug like a pro! 🚀