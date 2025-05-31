/**
 * Simple Tab Sorter Options Script
 * Handles the options page functionality
 */

// Constants
const STATUS_DISPLAY_TIME = 3000; // Time in milliseconds to show status messages
const DEFAULT_SETTINGS = {
    sortBy: "url",
    groupFrom: "leftToRight",
    preserveOrderWithinGroups: false,
    groupSuspendedTabs: false,
    sortPinnedTabs: false,
    reverseOrder: false,
    autoSort: false,
    tabSuspenderExtensionId: "noogafoofpebimajpfpamcfhoaifemoa"
};

// DOM Elements
const elements = {
    form: document.getElementById('settings-form'),
    sortBy: document.getElementById('sortBy'),
    groupFrom: document.getElementById('groupFrom'),
    preserveOrderWithinGroups: document.getElementById('preserveOrderWithinGroups'),
    groupSuspendedTabs: document.getElementById('groupSuspendedTabs'),
    sortPinnedTabs: document.getElementById('sortPinnedTabs'),
    tabSuspenderExtensionId: document.getElementById('tabSuspenderExtensionId'),
    saveButton: document.getElementById('save'),
    status: document.getElementById('status')
};

/**
 * UI Controller class to handle all UI-related operations
 */
class UIController {
    /**
     * Shows a status message to the user
     * @param {string} message - The message to display
     * @param {string} type - The type of message ('success' or 'error')
     */
    static showStatus(message, type) {
        elements.status.textContent = message;
        elements.status.className = `btn alert-${type}`;
        elements.status.classList.remove('invisible');
        
        setTimeout(() => {
            elements.status.classList.add('invisible');
        }, STATUS_DISPLAY_TIME);
    }

    /**
     * Updates the form with the current settings
     * @param {Object} settings - The current settings
     */
    static updateForm(settings) {
        elements.sortBy.value = settings.sortBy;
        elements.groupFrom.value = settings.groupFrom;
        elements.preserveOrderWithinGroups.checked = settings.preserveOrderWithinGroups;
        elements.groupSuspendedTabs.checked = settings.groupSuspendedTabs;
        elements.sortPinnedTabs.checked = settings.sortPinnedTabs;
        elements.tabSuspenderExtensionId.value = settings.tabSuspenderExtensionId;
        elements.saveButton.disabled = false;
    }
}

/**
 * Options Controller class to handle all options-related operations
 */
class OptionsController {
    /**
     * Loads the current settings
     */
    static async loadSettings() {
        try {
            const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
            UIController.updateForm(settings);
        } catch (error) {
            UIController.showStatus('Error loading settings', 'danger');
            console.error('Error loading settings:', error);
        }
    }

    /**
     * Saves the current settings
     * @param {Object} settings - The settings to save
     */
    static async saveSettings(settings) {
        try {
            await chrome.storage.sync.set(settings);
            UIController.showStatus('Settings saved successfully', 'success');
        } catch (error) {
            UIController.showStatus('Error saving settings', 'danger');
            console.error('Error saving settings:', error);
        }
    }
}

// Event Listeners
elements.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const settings = {
        sortBy: elements.sortBy.value,
        groupFrom: elements.groupFrom.value,
        preserveOrderWithinGroups: elements.preserveOrderWithinGroups.checked,
        groupSuspendedTabs: elements.groupSuspendedTabs.checked,
        sortPinnedTabs: elements.sortPinnedTabs.checked,
        tabSuspenderExtensionId: elements.tabSuspenderExtensionId.value
    };

    await OptionsController.saveSettings(settings);
});

// Initialize
OptionsController.loadSettings();