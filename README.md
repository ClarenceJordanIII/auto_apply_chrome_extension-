# 🚀 Auto Apply Chrome Extension

A powerful Chrome extension that automates job applications on Indeed with real-time status tracking and comprehensive safety controls.

## ✨ Features

### 🤖 **Automated Job Applications**
- Automatically applies to jobs on Indeed
- Intelligent form filling and submission
- Comprehensive error handling and validation
- Emergency stop functionality with `Ctrl+Shift+X`

### 📊 **Real-Time Status Tracking**
- Live status updates in the popup interface
- Visual timeline showing application progress  
- Color-coded status indicators (red/grey dots)
- Timestamped activity logging

### 🛡️ **Safety & Control**
- **Tab Management**: Automatically stops when Indeed tab is closed
- **Emergency Stop**: Instant termination with keyboard shortcut
- **Validation Checks**: Ensures extension only runs on Indeed pages
- **Error Protection**: DOMException handling and graceful failures

### 🎨 **Modern UI Design**
- Clean, responsive Chrome extension popup (350px width)
- Professional timeline interface
- Status message system with color variants
- CSS variables for consistent theming

## 🛠️ Installation

### 1. **Clone the Repository**
```bash
git clone https://github.com/ClarenceJordanIII/auto_apply_chrome_extension-.git
cd auto_apply_chrome_extension-
```

### 2. **Load Extension in Chrome**
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the project folder containing `manifest.json`

### 3. **Verify Installation**
- Extension icon should appear in Chrome toolbar
- Click icon to open popup interface
- Verify status shows "Ready for job applications..."

## 🚦 Usage

### **Starting the Automation**
1. Navigate to Indeed job search results
2. Click the extension icon to open popup
3. Click **Start ✓** button to begin automation
4. Monitor progress via live status updates

### **Stopping the Automation**
- **Normal Stop**: Click **Stop ✗** button in popup
- **Emergency Stop**: Press `Ctrl+Shift+X` on any page
- **Auto Stop**: Automatically stops when Indeed tab is closed

### **Status Monitoring**
- **Grey Dot** 🔘 = Extension stopped/idle
- **Red Dot** 🔴 = Automation running
- **Timeline** = Shows application history and progress

## 📁 Project Structure

```
chrome-extension/
├── manifest.json          # Extension manifest (Manifest v3)
├── index.html            # Popup interface 
├── styles.css            # Styling with CSS variables
├── index.js              # Frontend logic & status display
├── content.js            # Main automation script
├── background.js         # Service worker & message routing
└── public/
    ├── manifest.json     # Additional manifest copy
    └── vite.svg          # Extension icon
```

## 🔧 Technical Architecture

### **Message Flow**
```
content.js → background.js → index.js
    ↓           ↓              ↓
Automation  Message Router  UI Updates
```

### **Key Components**

#### **Content Script** (`content.js`)
- Core automation logic
- Status message broadcasting via `sendStatusMessage()`
- Tab validation and safety checks
- Emergency stop handling

#### **Background Script** (`background.js`)  
- Service worker for message routing
- Tab lifecycle management
- Status message forwarding to popup

#### **Popup Interface** (`index.html` + `index.js`)
- Real-time status display
- Timeline visualization
- Start/stop controls

### **Safety Mechanisms**
- **Tab Close Detection**: Monitors Indeed tab state
- **Page Validation**: Ensures automation only runs on Indeed
- **Emergency Controls**: Multiple stop mechanisms
- **Error Boundaries**: Comprehensive exception handling

## 🎨 Styling System

### **CSS Variables Architecture**
```css
:root {
    /* Primary Colors */
    --color-primary-blue: #3b82f6;
    --color-primary-green: #10b981;
    --color-primary-red: #ef4444;
    
    /* Status Colors */
    --color-success: var(--color-primary-green);
    --color-error: var(--color-primary-red);
    --color-info: var(--color-primary-blue);
    --color-warning: #f59e0b;
}
```

### **Responsive Design**
- Fixed 350px width for Chrome extension popup
- Flexbox timeline layout (horizontal, not column)
- Mobile-friendly touch targets
- Consistent spacing and typography

## ⚙️ Configuration

### **Extension Permissions** (`manifest.json`)
```json
{
    "permissions": [
        "activeTab",
        "tabs",
        "storage"
    ],
    "host_permissions": [
        "https://www.indeed.com/*"
    ]
}
```

### **Emergency Stop Shortcut**
- Default: `Ctrl+Shift+X`
- Works on any page when extension is active
- Instantly terminates all automation processes

## 🔍 Development

### **Local Development**
```bash
# Make changes to source files
# Reload extension in Chrome
1. Go to chrome://extensions/
2. Click reload button on extension card
3. Test changes in extension popup
```

### **Debugging**
- **Content Script**: Open Developer Tools on Indeed pages
- **Background Script**: Go to `chrome://extensions/` → Inspect service worker  
- **Popup**: Right-click extension icon → Inspect popup

### **Status Message System**
```javascript
// In content.js - Send status updates
sendStatusMessage("Applying to job: Frontend Developer", "info");

// In index.js - Receive status updates  
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'status') {
        updateStatus(message.text, message.level);
    }
});
```

## 🛡️ Security & Privacy

### **Data Handling**
- No personal data stored or transmitted
- All automation happens locally in browser
- No external API calls or data collection

### **Permissions**
- **activeTab**: Required for automation on current Indeed tab
- **tabs**: Needed for tab management and safety controls
- **storage**: Local storage for extension settings (optional)

## 🚨 Important Notes

### **Legal Compliance**
- Ensure compliance with Indeed's Terms of Service
- Use responsibly and within rate limits
- Consider adding delays between applications
- Review Indeed's automation policies

### **Rate Limiting**
- Built-in delays prevent overwhelming Indeed's servers
- Respectful automation practices implemented
- Manual oversight recommended

## 🐛 Troubleshooting

### **Common Issues**

#### **Extension Not Working**
1. Check if extension is enabled in `chrome://extensions/`
2. Verify you're on Indeed.com pages
3. Reload extension and refresh page

#### **Status Not Updating**
1. Check Developer Console for errors
2. Verify background service worker is active
3. Reload extension popup

#### **Emergency Stop Not Working**
1. Ensure `Ctrl+Shift+X` shortcut is not conflicting
2. Check if extension has necessary permissions
3. Reload extension and try again

### **Getting Help**
- Check browser Developer Console for error messages
- Inspect service worker in `chrome://extensions/`
- Review content script errors on Indeed pages

## 🤝 Contributing

### **Development Setup**
1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Make changes and test thoroughly
4. Commit changes: `git commit -m "Add new feature"`  
5. Push to branch: `git push origin feature/new-feature`
6. Create Pull Request

### **Code Style**
- Use consistent indentation (2 spaces)
- Comment complex automation logic
- Follow CSS variable naming conventions
- Maintain separation between content/background/popup scripts

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Clarence Jordan III**
- GitHub: [@ClarenceJordanIII](https://github.com/ClarenceJordanIII)
- Repository: [auto_apply_chrome_extension-](https://github.com/ClarenceJordanIII/auto_apply_chrome_extension-)

## 🙏 Support

If this extension helped you with your job search, consider:
- ⭐ Starring the repository
- 🐛 Reporting issues
- 💡 Suggesting improvements
- by me coffee coming soon
- ☕ [Buy me a coffee](https://buymeacoffee.com/tek_drift)

---

**⚠️ Disclaimer**: This extension is for educational and personal use. Please ensure compliance with Indeed's Terms of Service and use responsibly. The authors are not responsible for any consequences arising from the use of this extension.

**Subject to change**
![UI](image.png)