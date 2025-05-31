/**
 * Simple Tab Sorter Popup Script
 * Handles the popup UI interactions and communicates with the background script
 */

// Constants
const STATUS_DISPLAY_TIME = 3000; // Time in milliseconds to show status messages

// DOM Elements
const elements = {
    sortTabsButton: document.getElementById('sortTabs'),
    removeDuplicatesButton: document.getElementById('removeDuplicates'),
    undoSortButton: document.getElementById('undoSort'),
    autoSortToggle: document.getElementById('autoSort'),
    statusDiv: document.getElementById('status')
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
        elements.statusDiv.textContent = message;
        elements.statusDiv.className = `status ${type}`;
        elements.statusDiv.style.display = 'block';
        
        setTimeout(() => {
            elements.statusDiv.style.display = 'none';
        }, STATUS_DISPLAY_TIME);
    }

    /**
     * Disables all buttons in the popup
     */
    static disableButtons() {
        elements.sortTabsButton.disabled = true;
        elements.removeDuplicatesButton.disabled = true;
        elements.undoSortButton.disabled = true;
    }

    /**
     * Enables all buttons in the popup
     */
    static enableButtons() {
        elements.sortTabsButton.disabled = false;
        elements.removeDuplicatesButton.disabled = false;
        elements.undoSortButton.disabled = false;
    }

    /**
     * Updates the auto-sort toggle state
     * @param {boolean} enabled - Whether auto-sort is enabled
     */
    static updateAutoSortToggle(enabled) {
        elements.autoSortToggle.checked = enabled;
    }
}

/**
 * Extension Controller class to handle all extension-related operations
 */
class ExtensionController {
    /**
     * Sends a message to the background script
     * @param {string} type - The type of message to send
     * @returns {Promise} - A promise that resolves when the operation is complete
     */
    static async sendMessage(type) {
        try {
            UIController.disableButtons();
            const response = await chrome.runtime.sendMessage({ type });
            if (response.message === 'success') {
                let message = '';
                switch (type) {
                    case 'click_event':
                        message = 'Tabs sorted successfully!';
                        break;
                    case 'remove_duplicates':
                        message = 'Duplicate tabs removed successfully!';
                        break;
                    case 'undo_sort':
                        message = 'Sort operation undone!';
                        break;
                }
                UIController.showStatus(message, 'success');
            } else {
                throw new Error('Operation failed');
            }
        } catch (error) {
            UIController.showStatus(`Error: ${error.message}`, 'error');
            throw error;
        } finally {
            UIController.enableButtons();
        }
    }

    /**
     * Handles the initial installation or update
     */
    static async handleInstallOrUpdate() {
        const config = await chrome.storage.sync.get({
            installedVersion: '',
            newInstall: false,
            newUpdate: false,
            autoSort: false
        });

        await this.clearInstallOrUpdate();
        UIController.updateAutoSortToggle(config.autoSort);

        if (config.newInstall) {
            this.showInstallMessage();
        } else if (config.newUpdate) {
            this.showUpdateMessage();
        } else {
            await this.sendMessage('click_event');
        }
    }

    /**
     * Shows the installation message
     */
    static showInstallMessage() {
        alert(`Welcome to Simple Tab Sorter!

Please review the "User Guide" before getting started.

You'll need to click the extension icon again to sort your tabs after dismissing this dialog, but you won't see this dialog again unless you reinstall this extension.

You can right-click on the extension icon and select "Options" at any time to configure extension settings and review the user guide.`);
        window.open(chrome.runtime.getURL('./userguide.html'));
    }

    /**
     * Shows the update message
     */
    static showUpdateMessage() {
        const version = chrome.runtime.getManifest().version;
        alert(`Simple Tab Sorter has been updated to v${version}.

This version includes new features:
- Reverse order sorting
- Automatic sorting with new tabs
- Undo sort functionality
- Last access time sorting
- Better handling of internal and extension pages

Please review the updated User Guide to learn more about the latest changes.

You'll need to click the extension icon again to sort your tabs after dismissing this dialog, but you won't see this dialog again until installing the next update.

You can right-click on the extension icon and select "Options" at any time to configure extension settings and review the user guide.`);
        window.open(chrome.runtime.getURL('./userguide.html'));
    }

    /**
     * Clears the installation or update flags
     */
    static async clearInstallOrUpdate() {
        await chrome.storage.sync.set({
            installedVersion: chrome.runtime.getManifest().version,
            newInstall: false,
            newUpdate: false
        });
    }

    /**
     * Toggles auto-sort functionality
     * @param {boolean} enabled - Whether to enable auto-sort
     */
    static async toggleAutoSort(enabled) {
        await chrome.storage.sync.set({ autoSort: enabled });
        UIController.showStatus(
            `Auto-sort ${enabled ? 'enabled' : 'disabled'}`,
            'success'
        );
    }
}

// Event Listeners
elements.sortTabsButton.addEventListener('click', () => {
    ExtensionController.sendMessage('click_event').catch(console.error);
});

elements.removeDuplicatesButton.addEventListener('click', () => {
    ExtensionController.sendMessage('remove_duplicates').catch(console.error);
});

elements.undoSortButton.addEventListener('click', () => {
    ExtensionController.sendMessage('undo_sort').catch(console.error);
});

elements.autoSortToggle.addEventListener('change', (e) => {
    ExtensionController.toggleAutoSort(e.target.checked).catch(console.error);
});

// Initialize
ExtensionController.handleInstallOrUpdate().catch(console.error);
