// Settings page functionality for Auto Job Apply
console.log('Settings page loaded');

// Input type definitions with labels
const INPUT_TYPES = {
    'text': 'Text Input',
    'email': 'Email Input', 
    'url': 'URL Input',
    'tel': 'Phone Input',
    'number': 'Number Input',
    'textarea': 'Text Area',
    'select': 'Dropdown/Select',
    'radio': 'Radio Button',
    'checkbox': 'Checkbox'
};

// Default configuration structure
const defaultConfig = {
    personalInfo: [
        { key: "address", label: "Street Address", value: "123 Main Street", id: generateId() },
        { key: "city", label: "City", value: "Dallas", id: generateId() },
        { key: "state", label: "State", value: "TX", id: generateId() },
        { key: "zip", label: "ZIP Code", value: "75201", id: generateId() },
        { key: "phone", label: "Phone Number", value: "(555) 123-4567", id: generateId() },
        { key: "email", label: "Email Address", value: "john.doe.jobs@gmail.com", id: generateId() },
        { key: "emergencyContact", label: "Emergency Contact", value: "Jane Doe - (555) 987-6543", id: generateId() }
    ],
    professionalInfo: [
        { key: "linkedin", label: "LinkedIn URL", value: "https://www.linkedin.com/in/johndoe", id: generateId() },
        { key: "website", label: "Portfolio Website", value: "https://johndoe-portfolio.com", id: generateId() },
        { key: "github", label: "GitHub URL", value: "https://github.com/johndoe", id: generateId() },
        { key: "referralSource", label: "Referral Source", value: "Online job search", id: generateId() },
        { key: "salary", label: "Salary Expectation", value: "Competitive/Negotiable", id: generateId() },
        { key: "previousEmployer", label: "Previous Employer", value: "ABC Company", id: generateId() },
        { key: "supervisor", label: "Previous Supervisor", value: "John Smith", id: generateId() },
        { key: "experience", label: "Years of Experience", value: "3-5 years", id: generateId() },
        { key: "availability", label: "Availability", value: "Immediately", id: generateId() },
        { key: "motivation", label: "Motivation/Why Applying", value: "Interested in this opportunity and believe my skills align well with the role requirements.", id: generateId() }
    ],
    education: [
        { key: "school", label: "School/University", value: "State University", id: generateId() },
        { key: "major", label: "Major/Field of Study", value: "Business Administration", id: generateId() },
        { key: "gpa", label: "GPA", value: "3.5", id: generateId() }
    ],
    customPatterns: [
        {
            keywords: ["address", "street"],
            value: "123 Main Street",
            inputType: "text",
            description: "Street address pattern",
            id: generateId()
        },
        {
            keywords: ["visa", "sponsorship", "h-1b", "work authorization"],
            value: "no",
            inputType: "radio",
            description: "Work authorization question",
            id: generateId()
        }
    ],
    learnedData: {
        patterns: [],
        lastUpdated: null,
        version: "1.0"
    }
};

// Generate unique ID
function generateId() {
    return Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// Local storage utilities
const StorageManager = {
    async saveConfig(config) {
        try {
            await chrome.storage.local.set({ 'jobAppConfig': config });
            console.log('Configuration saved to local storage');
            return true;
        } catch (error) {
            console.error('Error saving configuration:', error);
            return false;
        }
    },

    async loadConfig() {
        try {
            const result = await chrome.storage.local.get(['jobAppConfig']);
            if (result.jobAppConfig) {
                console.log('Configuration loaded from local storage');
                const config = result.jobAppConfig;
                
                // Migrate old format to new format if needed
                const migratedConfig = this.migrateConfig(config);
                
                // Save migrated config if it changed
                if (migratedConfig !== config) {
                    await this.saveConfig(migratedConfig);
                    return migratedConfig;
                }
                
                return config;
            } else {
                console.log('No configuration found, using defaults');
                await this.saveConfig(defaultConfig);
                return defaultConfig;
            }
        } catch (error) {
            console.error('Error loading configuration:', error);
            return defaultConfig;
        }
    },

    migrateConfig(config) {
        let hasChanged = false;
        const migratedConfig = { ...config };

        // Migrate personalInfo from object to array
        if (migratedConfig.personalInfo && !Array.isArray(migratedConfig.personalInfo)) {
            const oldPersonalInfo = migratedConfig.personalInfo;
            migratedConfig.personalInfo = [];
            
            Object.entries(oldPersonalInfo).forEach(([key, value]) => {
                if (typeof value === 'string') {
                    migratedConfig.personalInfo.push({
                        id: generateId(),
                        key: key,
                        label: this.formatLabel(key),
                        value: value,
                        inputType: 'text'
                    });
                }
            });
            hasChanged = true;
            console.log('Migrated personalInfo to array format');
        }

        // Migrate professionalInfo from object to array
        if (migratedConfig.professionalInfo && !Array.isArray(migratedConfig.professionalInfo)) {
            const oldProfessionalInfo = migratedConfig.professionalInfo;
            migratedConfig.professionalInfo = [];
            
            Object.entries(oldProfessionalInfo).forEach(([key, value]) => {
                if (typeof value === 'string') {
                    migratedConfig.professionalInfo.push({
                        id: generateId(),
                        key: key,
                        label: this.formatLabel(key),
                        value: value,
                        inputType: 'text'
                    });
                }
            });
            hasChanged = true;
            console.log('Migrated professionalInfo to array format');
        }

        // Migrate education from object to array
        if (migratedConfig.education && !Array.isArray(migratedConfig.education)) {
            const oldEducation = migratedConfig.education;
            migratedConfig.education = [];
            
            Object.entries(oldEducation).forEach(([key, value]) => {
                if (typeof value === 'string') {
                    migratedConfig.education.push({
                        id: generateId(),
                        key: key,
                        label: this.formatLabel(key),
                        value: value,
                        inputType: 'text'
                    });
                }
            });
            hasChanged = true;
            console.log('Migrated education to array format');
        }

        // Migrate old pattern structures to customPatterns
        if (!migratedConfig.customPatterns) {
            migratedConfig.customPatterns = [];
        }

        // Migrate textInputPatterns
        if (migratedConfig.textInputPatterns && migratedConfig.textInputPatterns.length > 0) {
            migratedConfig.textInputPatterns.forEach(pattern => {
                migratedConfig.customPatterns.push({
                    ...pattern,
                    inputType: 'text',
                    id: pattern.id || generateId()
                });
            });
            delete migratedConfig.textInputPatterns;
            hasChanged = true;
            console.log('Migrated textInputPatterns to customPatterns');
        }

        // Migrate numberInputPatterns  
        if (migratedConfig.numberInputPatterns && migratedConfig.numberInputPatterns.length > 0) {
            migratedConfig.numberInputPatterns.forEach(pattern => {
                migratedConfig.customPatterns.push({
                    ...pattern,
                    inputType: 'number',
                    id: pattern.id || generateId()
                });
            });
            delete migratedConfig.numberInputPatterns;
            hasChanged = true;
            console.log('Migrated numberInputPatterns to customPatterns');
        }

        // Migrate textareaPatterns
        if (migratedConfig.textareaPatterns && migratedConfig.textareaPatterns.length > 0) {
            migratedConfig.textareaPatterns.forEach(pattern => {
                migratedConfig.customPatterns.push({
                    ...pattern,
                    inputType: 'textarea',
                    id: pattern.id || generateId()
                });
            });
            delete migratedConfig.textareaPatterns;
            hasChanged = true;
            console.log('Migrated textareaPatterns to customPatterns');
        }

        // Ensure learnedData exists
        if (!migratedConfig.learnedData) {
            migratedConfig.learnedData = {
                patterns: [],
                lastUpdated: null,
                version: "1.0"
            };
            hasChanged = true;
        }

        // Add inputType to existing array items that don't have it
        ['personalInfo', 'professionalInfo', 'education'].forEach(section => {
            if (migratedConfig[section] && Array.isArray(migratedConfig[section])) {
                migratedConfig[section].forEach(item => {
                    if (!item.inputType) {
                        item.inputType = 'text';
                        hasChanged = true;
                    }
                });
            }
        });

        return hasChanged ? migratedConfig : config;
    },

    formatLabel(key) {
        // Convert camelCase to readable label
        return key
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();
    },

    async clearAllData() {
        try {
            await chrome.storage.local.clear();
            console.log('All data cleared');
            return true;
        } catch (error) {
            console.error('Error clearing data:', error);
            return false;
        }
    },

    async clearLearnedData() {
        try {
            const config = await this.loadConfig();
            config.learnedData.patterns = [];
            config.learnedData.lastUpdated = new Date().toISOString();
            await this.saveConfig(config);
            console.log('Learned data cleared');
            return true;
        } catch (error) {
            console.error('Error clearing learned data:', error);
            return false;
        }
    }
};

// UI Manager
const UIManager = {
    showStatus(message, type = 'info') {
        const statusEl = document.getElementById('settings-status');
        statusEl.textContent = message;
        statusEl.className = `settings-status ${type} show`;
        
        setTimeout(() => {
            statusEl.classList.remove('show');
        }, 3000);
    },

    renderPersonalInfo(config) {
        const container = document.getElementById('personal-info-container');
        container.innerHTML = '';
        
        if (config.personalInfo) {
            if (Array.isArray(config.personalInfo)) {
                config.personalInfo.forEach(item => {
                    this.createInfoItem('personalInfo', item, container);
                });
            } else if (typeof config.personalInfo === 'object') {
                // Handle old object format
                Object.entries(config.personalInfo).forEach(([key, value]) => {
                    const item = {
                        id: generateId(),
                        key: key,
                        label: key.charAt(0).toUpperCase() + key.slice(1),
                        value: value
                    };
                    this.createInfoItem('personalInfo', item, container);
                });
            }
        }
        
        if (container.children.length === 0) {
            container.innerHTML = '<div class="empty-state">No personal information items. Click "Add Personal Info Item" to get started.</div>';
        }
    },

    renderProfessionalInfo(config) {
        const container = document.getElementById('professional-info-container');
        container.innerHTML = '';
        
        if (config.professionalInfo) {
            if (Array.isArray(config.professionalInfo)) {
                config.professionalInfo.forEach(item => {
                    this.createInfoItem('professionalInfo', item, container);
                });
            } else if (typeof config.professionalInfo === 'object') {
                // Handle old object format
                Object.entries(config.professionalInfo).forEach(([key, value]) => {
                    const item = {
                        id: generateId(),
                        key: key,
                        label: key.charAt(0).toUpperCase() + key.slice(1),
                        value: value
                    };
                    this.createInfoItem('professionalInfo', item, container);
                });
            }
        }
        
        if (container.children.length === 0) {
            container.innerHTML = '<div class="empty-state">No professional information items. Click "Add Professional Info Item" to get started.</div>';
        }
    },

    renderEducation(config) {
        const container = document.getElementById('education-info-container');
        container.innerHTML = '';
        
        if (config.education) {
            if (Array.isArray(config.education)) {
                config.education.forEach(item => {
                    this.createInfoItem('education', item, container);
                });
            } else if (typeof config.education === 'object') {
                // Handle old object format
                Object.entries(config.education).forEach(([key, value]) => {
                    const item = {
                        id: generateId(),
                        key: key,
                        label: key.charAt(0).toUpperCase() + key.slice(1),
                        value: value
                    };
                    this.createInfoItem('education', item, container);
                });
            }
        }
        
        if (container.children.length === 0) {
            container.innerHTML = '<div class="empty-state">No education items. Click "Add Education Item" to get started.</div>';
        }
    },

    createInfoItem(section, item, container) {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'info-item';
        itemDiv.dataset.id = item.id || generateId();
        itemDiv.dataset.section = section;

        itemDiv.innerHTML = `
            <h4>
                <span>${item.label || 'New Item'}</span>
                <div class="pattern-actions">
                    <button class="save-info-btn" data-section="${section}" data-id="${item.id}">Save</button>
                    <button class="delete-info-btn" data-section="${section}" data-id="${item.id}">Delete</button>
                </div>
            </h4>
            <div class="info-item-fields">
                <div class="form-group">
                    <label>Field Name</label>
                    <input type="text" class="item-label" value="${item.label || ''}" placeholder="What is this field? (e.g., Phone, Email, Address)">
                </div>
                <div class="form-group">
                    <label>Your Information</label>
                    <input type="text" class="item-value" value="${item.value || ''}" placeholder="Enter your actual ${item.label ? item.label.toLowerCase() : 'information'}">
                </div>
                <div class="form-group">
                    <label>Input Type</label>
                    <select class="item-input-type">
                        ${Object.entries(INPUT_TYPES).map(([value, label]) => 
                            `<option value="${value}" ${item.inputType === value ? 'selected' : ''}>${label}</option>`
                        ).join('')}
                    </select>
                </div>
            </div>
        `;

        container.appendChild(itemDiv);
    },

    renderCustomPatterns(config) {
        const container = document.getElementById('custom-patterns-container');
        container.innerHTML = '';

        if (config.customPatterns && Array.isArray(config.customPatterns)) {
            config.customPatterns.forEach(pattern => {
                this.createPatternElement(pattern, container);
            });
        }
        
        if (container.children.length === 0) {
            container.innerHTML = '<div class="empty-state">No custom patterns yet. Click "Add Custom Pattern" to create one.</div>';
        }
    },

    createPatternElement(pattern, container) {
        const patternDiv = document.createElement('div');
        patternDiv.className = 'pattern-item';
        patternDiv.dataset.id = pattern.id || generateId();

        patternDiv.innerHTML = `
            <h4>Custom Pattern - ${INPUT_TYPES[pattern.inputType] || 'Unknown Type'}</h4>
            <div class="pattern-fields">
                <div class="form-group">
                    <label>Trigger Keywords</label>
                    <input type="text" class="pattern-keywords" value="${pattern.keywords ? pattern.keywords.join(', ') : ''}" placeholder="Words that trigger this answer (e.g., address, street, location)">
                </div>
                <div class="form-group">
                    <label>Your Answer</label>
                    ${pattern.inputType === 'textarea' ? 
                        `<textarea class="pattern-value" placeholder="Enter your response for these keywords">${pattern.value || ''}</textarea>` :
                        `<input type="text" class="pattern-value" value="${pattern.value || ''}" placeholder="Enter your response for these keywords">`
                    }
                </div>
                <div class="form-group">
                    <label>Input Type</label>
                    <select class="pattern-input-type">
                        ${Object.entries(INPUT_TYPES).map(([value, label]) => 
                            `<option value="${value}" ${pattern.inputType === value ? 'selected' : ''}>${label}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="form-group pattern-options-group" style="${['select', 'radio', 'checkbox'].includes(pattern.inputType) ? 'display: block' : 'display: none'}">
                    <label>Available Options</label>
                    <input type="text" class="pattern-options" value="${pattern.options ? pattern.options.join(', ') : ''}" placeholder="Comma-separated choices (e.g., Yes, No, Maybe)">
                </div>
            </div>
            <div class="pattern-actions">
                <button class="save-pattern-btn" data-id="${patternDiv.dataset.id}">Save</button>
                <button class="delete-pattern-btn" data-id="${patternDiv.dataset.id}">Delete</button>
            </div>
            ${pattern.description ? `<p style="color: var(--color-gray-600); font-size: 12px; margin-top: 5px;">${pattern.description}</p>` : ''}
        `;

        container.appendChild(patternDiv);
    },

    renderLearnedData(config) {
        const container = document.getElementById('learned-data-container');
        container.innerHTML = '';

        if (!config.learnedData || !config.learnedData.patterns || config.learnedData.patterns.length === 0) {
            container.innerHTML = '<div class="empty-state">No learned data yet. Start using the automation to see patterns appear here.</div>';
            return;
        }

        config.learnedData.patterns.forEach(item => {
            this.createLearnedDataElement(item, container);
        });
    },

    createLearnedDataElement(item, container) {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'learned-item';
        itemDiv.dataset.id = item.id || generateId();

        itemDiv.innerHTML = `
            <h4>Learned Pattern - ${INPUT_TYPES[item.inputType] || 'Unknown Type'}</h4>
            <div class="pattern-fields">
                <div class="form-group">
                    <label>Question/Keywords</label>
                    <input type="text" class="learned-question" value="${item.question || ''}" placeholder="Detected question or keywords">
                </div>
                <div class="form-group">
                    <label>Answer</label>
                    ${item.inputType === 'textarea' ? 
                        `<textarea class="learned-answer" placeholder="Your answer">${item.answer || ''}</textarea>` :
                        `<input type="text" class="learned-answer" value="${item.answer || ''}" placeholder="Your answer">`
                    }
                </div>
                <div class="form-group">
                    <label>Input Type</label>
                    <select class="learned-input-type">
                        ${Object.entries(INPUT_TYPES).map(([value, label]) => 
                            `<option value="${value}" ${item.inputType === value ? 'selected' : ''}>${label}</option>`
                        ).join('')}
                    </select>
                </div>
            </div>
            <div class="pattern-actions">
                <button class="save-learned-btn" data-id="${itemDiv.dataset.id}">Save</button>
                <button class="delete-learned-btn" data-id="${itemDiv.dataset.id}">Delete</button>
            </div>
            <p style="color: var(--color-gray-600); font-size: 12px; margin-top: 5px;">
                Learned: ${item.timestamp ? new Date(item.timestamp).toLocaleDateString() : 'Unknown'}
            </p>
        `;

        container.appendChild(itemDiv);
    }
};

// Info Manager for individual section items
const InfoManager = {
    async addInfoItem(section) {
        const config = await StorageManager.loadConfig();
        const newItem = {
            id: generateId(),
            key: '',
            label: 'New Item',
            value: '',
            inputType: 'text'
        };

        // Ensure the section exists and is an array
        if (!config[section]) {
            config[section] = [];
        } else if (!Array.isArray(config[section])) {
            // Convert old object format to array format
            const oldData = config[section];
            config[section] = [];
            
            // Convert old object properties to array items
            Object.entries(oldData).forEach(([key, value]) => {
                if (typeof value === 'string') {
                    config[section].push({
                        id: generateId(),
                        key: key,
                        label: key.charAt(0).toUpperCase() + key.slice(1),
                        value: value,
                        inputType: 'text'  // Default for migrated items
                    });
                }
            });
        }
        
        config[section].push(newItem);
        
        // Save config and re-render section
        await StorageManager.saveConfig(config);
        
        if (section === 'personalInfo') {
            UIManager.renderPersonalInfo(config);
        } else if (section === 'professionalInfo') {
            UIManager.renderProfessionalInfo(config);
        } else if (section === 'education') {
            UIManager.renderEducation(config);
        }
        
        UIManager.showStatus(`New ${section} item added!`, 'success');
    },

    async saveInfoItem(section, id) {
        try {
            const config = await StorageManager.loadConfig();
            const itemElement = document.querySelector(`[data-id="${id}"]`);
            
            if (!itemElement) {
                UIManager.showStatus('Item not found', 'error');
                return;
            }
            
            const label = itemElement.querySelector('.item-label').value;
            const value = itemElement.querySelector('.item-value').value;
            const inputType = itemElement.querySelector('.item-input-type').value;
            
            // Ensure section exists and is array
            if (!config[section] || !Array.isArray(config[section])) {
                config[section] = [];
            }
            
            const itemIndex = config[section].findIndex(p => p.id === id);
            if (itemIndex !== -1) {
                config[section][itemIndex].label = label;
                config[section][itemIndex].value = value;
                config[section][itemIndex].inputType = inputType;
                config[section][itemIndex].key = label.toLowerCase().replace(/\s+/g, '');
            }
            
            await StorageManager.saveConfig(config);
            UIManager.showStatus('Item saved successfully!', 'success');
        } catch (error) {
            console.error('Error saving item:', error);
            UIManager.showStatus('Error saving item', 'error');
        }
    },

    async deleteInfoItem(section, id) {
        if (!confirm('Are you sure you want to delete this item?')) return;
        
        try {
            const config = await StorageManager.loadConfig();
            
            // Ensure section exists and is array
            if (!config[section] || !Array.isArray(config[section])) {
                config[section] = [];
            }
            
            config[section] = config[section].filter(p => p.id !== id);
            await StorageManager.saveConfig(config);
            
            const itemElement = document.querySelector(`[data-id="${id}"]`);
            if (itemElement) {
                itemElement.remove();
            }
            
            UIManager.showStatus('Item deleted successfully!', 'success');
        } catch (error) {
            console.error('Error deleting item:', error);
            UIManager.showStatus('Error deleting item', 'error');
        }
    }
};

// Pattern Manager
const PatternManager = {
    async addPattern() {
        const config = await StorageManager.loadConfig();
        const newPattern = {
            id: generateId(),
            keywords: [],
            value: '',
            inputType: 'text',
            description: ''
        };

        if (!config.customPatterns) {
            config.customPatterns = [];
        }
        
        config.customPatterns.push(newPattern);
        
        // Re-render patterns
        UIManager.renderCustomPatterns(config);
        UIManager.showStatus('New custom pattern added. Don\'t forget to save your changes!', 'info');
    },

    async savePattern(id) {
        try {
            const config = await StorageManager.loadConfig();
            const patternElement = document.querySelector(`[data-id="${id}"]`);
            
            if (!patternElement) {
                UIManager.showStatus('Pattern not found', 'error');
                return;
            }
            
            const keywords = patternElement.querySelector('.pattern-keywords').value
                .split(',').map(k => k.trim()).filter(k => k);
            const value = patternElement.querySelector('.pattern-value').value;
            const inputType = patternElement.querySelector('.pattern-input-type').value;
            const optionsInput = patternElement.querySelector('.pattern-options');
            const options = optionsInput ? optionsInput.value.split(',').map(o => o.trim()).filter(o => o) : [];
            
            // Ensure customPatterns exists
            if (!config.customPatterns) {
                config.customPatterns = [];
            }
            
            const patternIndex = config.customPatterns.findIndex(p => p.id === id);
            if (patternIndex !== -1) {
                config.customPatterns[patternIndex].keywords = keywords;
                config.customPatterns[patternIndex].value = value;
                config.customPatterns[patternIndex].inputType = inputType;
                config.customPatterns[patternIndex].options = options;
            }
            
            await StorageManager.saveConfig(config);
            UIManager.showStatus('Pattern saved successfully!', 'success');
        } catch (error) {
            console.error('Error saving pattern:', error);
            UIManager.showStatus('Error saving pattern', 'error');
        }
    },

    async deletePattern(id) {
        if (!confirm('Are you sure you want to delete this pattern?')) return;
        
        try {
            const config = await StorageManager.loadConfig();
            
            // Ensure customPatterns exists
            if (!config.customPatterns) {
                config.customPatterns = [];
            }
            
            config.customPatterns = config.customPatterns.filter(p => p.id !== id);
            await StorageManager.saveConfig(config);
            
            const patternElement = document.querySelector(`[data-id="${id}"]`);
            if (patternElement) {
                patternElement.remove();
            }
            
            UIManager.showStatus('Pattern deleted successfully!', 'success');
        } catch (error) {
            console.error('Error deleting pattern:', error);
            UIManager.showStatus('Error deleting pattern', 'error');
        }
    }
};

// Learned Data Manager
const LearnedDataManager = {
    async saveLearnedData(id) {
        try {
            const config = await StorageManager.loadConfig();
            const itemElement = document.querySelector(`[data-id="${id}"]`);
            
            const question = itemElement.querySelector('.learned-question').value;
            const answer = itemElement.querySelector('.learned-answer').value;
            const inputType = itemElement.querySelector('.learned-input-type').value;
            
            const itemIndex = config.learnedData.patterns.findIndex(p => p.id === id);
            if (itemIndex !== -1) {
                config.learnedData.patterns[itemIndex].question = question;
                config.learnedData.patterns[itemIndex].answer = answer;
                config.learnedData.patterns[itemIndex].inputType = inputType;
            }
            
            await StorageManager.saveConfig(config);
            UIManager.showStatus('Learned data saved successfully!', 'success');
        } catch (error) {
            console.error('Error saving learned data:', error);
            UIManager.showStatus('Error saving learned data', 'error');
        }
    },

    async deleteLearnedData(id) {
        if (!confirm('Are you sure you want to delete this learned data?')) return;
        
        try {
            const config = await StorageManager.loadConfig();
            config.learnedData.patterns = config.learnedData.patterns.filter(p => p.id !== id);
            await StorageManager.saveConfig(config);
            
            const itemElement = document.querySelector(`[data-id="${id}"]`);
            itemElement.remove();
            
            UIManager.showStatus('Learned data deleted successfully!', 'success');
        } catch (error) {
            console.error('Error deleting learned data:', error);
            UIManager.showStatus('Error deleting learned data', 'error');
        }
    }
};

// Main initialization
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Settings page DOM loaded');
    
    // Load and populate all data
    const config = await StorageManager.loadConfig();
    UIManager.renderPersonalInfo(config);
    UIManager.renderProfessionalInfo(config);
    UIManager.renderEducation(config);
    UIManager.renderCustomPatterns(config);
    UIManager.renderLearnedData(config);

    // Event listeners for adding items
    document.getElementById('add-personal-item-btn').addEventListener('click', () => {
        InfoManager.addInfoItem('personalInfo');
    });

    document.getElementById('add-professional-item-btn').addEventListener('click', () => {
        InfoManager.addInfoItem('professionalInfo');
    });

    document.getElementById('add-education-item-btn').addEventListener('click', () => {
        InfoManager.addInfoItem('education');
    });

    document.getElementById('add-pattern-btn').addEventListener('click', () => {
        PatternManager.addPattern();
    });

    // Event listeners for main buttons
    document.getElementById('save-all-btn').addEventListener('click', async () => {
        try {
            // Configuration is automatically saved when individual items are saved
            // This button just provides feedback
            UIManager.showStatus('All current data is already saved! Individual items are saved when you click their Save buttons.', 'info');
        } catch (error) {
            console.error('Error with save all:', error);
            UIManager.showStatus('Error with save operation', 'error');
        }
    });

    document.getElementById('clear-all-btn').addEventListener('click', async () => {
        if (confirm('Are you sure you want to clear ALL data? This cannot be undone.')) {
            const success = await StorageManager.clearAllData();
            if (success) {
                window.location.reload();
            } else {
                UIManager.showStatus('Error clearing data', 'error');
            }
        }
    });

    document.getElementById('clear-learned-btn').addEventListener('click', async () => {
        if (confirm('Are you sure you want to clear all learned data?')) {
            const success = await StorageManager.clearLearnedData();
            if (success) {
                const config = await StorageManager.loadConfig();
                UIManager.renderLearnedData(config);
                UIManager.showStatus('Learned data cleared successfully!', 'success');
            } else {
                UIManager.showStatus('Error clearing learned data', 'error');
            }
        }
    });

    document.getElementById('reset-defaults-btn').addEventListener('click', async () => {
        if (confirm('Are you sure you want to reset all settings to defaults? This will keep learned data but reset all other configuration.')) {
            try {
                const config = await StorageManager.loadConfig();
                const learnedData = config.learnedData; // Preserve learned data
                
                const resetConfig = JSON.parse(JSON.stringify(defaultConfig));
                resetConfig.learnedData = learnedData;
                
                await StorageManager.saveConfig(resetConfig);
                window.location.reload();
            } catch (error) {
                console.error('Error resetting to defaults:', error);
                UIManager.showStatus('Error resetting to defaults', 'error');
            }
        }
    });

    // Set up event delegation for dynamically created buttons
    document.addEventListener('click', (e) => {
        // Info Manager buttons
        if (e.target.classList.contains('save-info-btn')) {
            const section = e.target.dataset.section;
            const id = e.target.dataset.id;
            InfoManager.saveInfoItem(section, id);
        } else if (e.target.classList.contains('delete-info-btn')) {
            const section = e.target.dataset.section;
            const id = e.target.dataset.id;
            InfoManager.deleteInfoItem(section, id);
        }
        
        // Pattern Manager buttons
        else if (e.target.classList.contains('save-pattern-btn')) {
            const id = e.target.dataset.id;
            PatternManager.savePattern(id);
        } else if (e.target.classList.contains('delete-pattern-btn')) {
            const id = e.target.dataset.id;
            PatternManager.deletePattern(id);
        }
        
        // Learned Data Manager buttons
        else if (e.target.classList.contains('save-learned-btn')) {
            const id = e.target.dataset.id;
            LearnedDataManager.saveLearnedData(id);
        } else if (e.target.classList.contains('delete-learned-btn')) {
            const id = e.target.dataset.id;
            LearnedDataManager.deleteLearnedData(id);
        }
    });
    
    // Set up event delegation for pattern input type changes
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('pattern-input-type')) {
            const patternDiv = e.target.closest('.pattern-item');
            const optionsGroup = patternDiv.querySelector('.pattern-options-group');
            const inputType = e.target.value;
            
            if (optionsGroup) {
                if (['select', 'radio', 'checkbox'].includes(inputType)) {
                    optionsGroup.style.display = 'block';
                } else {
                    optionsGroup.style.display = 'none';
                }
            }
        }
    });

    UIManager.showStatus('Settings loaded successfully!', 'success');
});

// Make managers globally available for debugging
window.InfoManager = InfoManager;
window.PatternManager = PatternManager;
window.LearnedDataManager = LearnedDataManager;