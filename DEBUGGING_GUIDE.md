# Chrome Extension Debugging Guide

## How to Debug Extension Issues

This guide will help you troubleshoot any issues with the Auto Job Apply Chrome extension.

### 1. Using the Visual Debug Panel

The extension now includes a visual debug panel that shows logs in real-time:

- The panel appears in the bottom right corner of Indeed pages
- It displays logs with timestamps, categories, and levels
- You can clear logs, export them to a file, or hide the panel

### 2. Console Debugging Commands

You can use these commands in your browser's developer console to debug:

```javascript
// Check extension state
debugExtension.checkState();

// Export all debug logs
debugExtension.exportDebugLogs();

// Check if extension context is valid
debugExtension.isExtensionContextValid();

// Restart the extension
debugExtension.restart();
```

### 3. Common Issues and Solutions

#### Extension Not Working / Not Visible

**Possible causes:**
- Extension context invalidated (browser updated the extension)
- DOM events not properly attached
- Initialization function failed

**Solutions:**
1. Refresh the page
2. Check console for errors
3. Use `debugExtension.restart()` in console
4. Reinstall the extension if needed

#### Automation Not Starting

**Possible causes:**
- Missing DOM elements that the extension looks for
- Error in initialization
- Content script conflicts

**Solutions:**
1. Check logs for "INIT" category errors
2. Try refreshing the page
3. Make sure you're on a valid Indeed job page
4. Check if other extensions might be conflicting

#### Message Sending Errors

**Possible causes:**
- Extension context invalidated
- Background script not running
- Message channel closed

**Solutions:**
1. Look for "MESSAGING" category logs
2. Refresh the page to reconnect messaging
3. Check if extension needs to be restarted in Chrome

### 4. Reading Log Files

Debug logs are formatted as:
```
[TIMESTAMP][CATEGORY][LEVEL] Message
```

Important categories to check:
- `STARTUP`: Extension loading process
- `INIT`: Initialization of components
- `MESSAGING`: Communication with background script
- `CONTEXT`: Extension context validation
- `TIMEOUT`: Timeout creation and management

Error levels from least to most severe:
- `DEBUG`: Detailed information
- `INFO`: Normal operation information
- `WARN`: Potential issues that didn't stop execution
- `ERROR`: Errors that affected functionality

### 5. Getting Help

If you continue experiencing issues:

1. Export logs using the debug panel
2. Take screenshots of any error messages
3. Note which Indeed pages are causing problems
4. Describe the exact steps to reproduce the issue

### 6. Resolving Common Errors

#### "Extension context invalidated" Error
This happens when Chrome updates or reloads the extension.
- Solution: Refresh the page

#### "Message channel closed" Error
This happens when trying to communicate after navigation.
- Solution: This is normal during page changes, but if persistent, refresh the page

#### "Cannot read property of undefined" Errors
These are typically DOM-related issues.
- Solution: Check the visual debug panel for which element wasn't found

### 7. Enabling/Disabling Debug Mode

You can toggle debug mode in the console:
```javascript
// Enable debug mode
DEBUG_LOG.enabled = true;

// Disable debug mode
DEBUG_LOG.enabled = false;
```

## Extension Structure Overview

The extension consists of:
- `content.js`: Main content script that runs on Indeed pages
- `background.js`: Background script for cross-page communication
- `debug-logger.js`: Visual debugging panel
- Other support files

## Performance Considerations

Debugging adds overhead. If the extension seems slow:
1. Disable the visual debug panel
2. Reduce logging by setting `DEBUG_LOG.enabled = false`
3. Clear the debug log occasionally with the "Clear" button