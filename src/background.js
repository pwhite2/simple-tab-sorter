'use strict';

/**
 * Constants for tab sorting and extension configuration
 * These define the core behavior of the extension
 */
const THE_MARVELLOUS_SUSPENDER_EXTENSION_ID = "noogafoofpebimajpfpamcfhoaifemoa";
const URL_TYPES = {
    BRAVE_INTERNAL: 'brave://',
    CHROME_INTERNAL: 'chrome://',
    EXTENSION_PAGE: 'chrome-extension://',
    FILE: 'file://',
    HTTPS: 'https://',
    HTTP: 'http://'
};

/**
 * Global variables for tab suspension handling
 * These are used to track suspended tabs and their states
 */
var TAB_SUSPENDER_EXTENSION_ID = "";
var SUSPENDED_PREFIX = 'chrome-extension://' + TAB_SUSPENDER_EXTENSION_ID + '/suspended.html#';
var SUSPENDED_PREFIX_LEN = SUSPENDED_PREFIX.length;

// Store tab positions for undo functionality
let lastTabPositions = new Map();

// Store current settings
let currentSettings = {
    sortBy: "url",
    groupFrom: "leftToRight",
    preserveOrderWithinGroups: false,
    groupSuspendedTabs: false,
    sortPinnedTabs: false,
    reverseOrder: false,
    autoSort: false
};

/**
 * Message listener for extension icon clicks and other UI interactions
 * Handles both sorting and duplicate removal requests
 */
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.type === "click_event") {
        saveTabPositions().then(() => {
            sortTabGroups().catch(error => {
                console.error('Error sorting tabs:', error);
            });
        });
        sendResponse({ message: 'success' });
    } else if (request.type === "remove_duplicates") {
        removeDuplicateTabs().catch(error => {
            console.error('Error removing duplicates:', error);
        });
        sendResponse({ message: 'success' });
    } else if (request.type === "undo_sort") {
        undoLastSort().catch(error => {
            console.error('Error undoing sort:', error);
        });
        sendResponse({ message: 'success' });
    }
    return true; // Keep the message channel open for async response
});

/**
 * Saves current tab positions for undo functionality
 */
async function saveTabPositions() {
    const currentWindow = await chrome.windows.getLastFocused();
    if (!currentWindow) return;

    const tabs = await chrome.tabs.query({ windowId: currentWindow.id });
    lastTabPositions.clear();
    
    for (const tab of tabs) {
        lastTabPositions.set(tab.id, {
            index: tab.index,
            groupId: tab.groupId
        });
    }
}

/**
 * Undoes the last sort operation
 */
async function undoLastSort() {
    if (lastTabPositions.size === 0) return;

    const currentWindow = await chrome.windows.getLastFocused();
    if (!currentWindow) return;

    const tabs = await chrome.tabs.query({ windowId: currentWindow.id });
    const moves = [];

    for (const tab of tabs) {
        const originalPosition = lastTabPositions.get(tab.id);
        if (originalPosition) {
            moves.push({
                tabId: tab.id,
                index: originalPosition.index,
                groupId: originalPosition.groupId
            });
        }
    }

    // Sort moves by original index to maintain order
    moves.sort((a, b) => a.index - b.index);

    // Execute moves
    for (const move of moves) {
        await chrome.tabs.move(move.tabId, { index: move.index });
        if (move.groupId !== -1) {
            await chrome.tabs.group({
                groupId: move.groupId,
                tabIds: [move.tabId]
            });
        }
    }
}

/**
 * Handles new tab creation and updates
 */
chrome.tabs.onCreated.addListener(async (tab) => {
    const settings = await chrome.storage.sync.get({
        autoSort: false
    });

    if (settings.autoSort) {
        await sortTabGroups();
    }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.url) {
        const settings = await chrome.storage.sync.get({
            autoSort: false
        });

        if (settings.autoSort) {
            await sortTabGroups();
        }
    }
});

/**
 * Checks if a tab is currently suspended
 * @param {Object} tab - The tab object to check
 * @returns {boolean} - True if the tab is suspended
 */
function isSuspended(tab) {
    return tab.url && tab.url.startsWith(SUSPENDED_PREFIX);
}

/**
 * Installation and update handler
 * Sets up initial configuration and handles version updates
 */
chrome.runtime.onInstalled.addListener(function (details) {
    var thisVersion = chrome.runtime.getManifest().version;
    if (details.reason === "install") {
        chrome.storage.sync.set({
            installedVersion: thisVersion,
            newInstall: true,
            newUpdate: false
        }, function () {
            if (chrome.runtime.setUninstallURL) {
                var uninstallGoogleFormLink = 'https://docs.google.com/forms/d/e/1FAIpQLSe-r_WFNry_KZCwOjdMjDjiS8sEIWmmwY-3hbSmIYV393RLCA/viewform';
                chrome.runtime.setUninstallURL(uninstallGoogleFormLink);
            }
        });
    } else if (details.reason === "update") {
        chrome.storage.sync.set({
            installedVersion: thisVersion,
            newInstall: false,
            newUpdate: true
        }, function () { });
    }
});

/**
 * Gets the URL type priority for sorting
 * @param {string} url - The URL to check
 * @returns {number} - Priority number (lower is higher priority)
 */
function getUrlTypePriority(url) {
    // Handle internal browser pages first
    if (url.startsWith(URL_TYPES.BRAVE_INTERNAL)) return 0;
    if (url.startsWith(URL_TYPES.CHROME_INTERNAL)) return 1;
    
    // Handle extension pages
    if (url.startsWith(URL_TYPES.EXTENSION_PAGE)) {
        // Special handling for extension options pages
        if (url.includes('/options.html')) return 2;
        return 3;
    }
    
    // Handle local files
    if (url.startsWith(URL_TYPES.FILE)) return 4;
    
    // Handle web pages
    if (url.startsWith(URL_TYPES.HTTPS)) return 5;
    if (url.startsWith(URL_TYPES.HTTP)) return 6;
    
    // Default for unknown URL types
    return 7;
}

/**
 * Main function to sort tab groups
 * Handles the sorting of tabs in the current window
 */
async function sortTabGroups() {
    try {
        let settings = await chrome.storage.sync.get({
            sortBy: "url",
            groupFrom: "leftToRight",
            preserveOrderWithinGroups: false,
            groupSuspendedTabs: false,
            tabSuspenderExtensionId: THE_MARVELLOUS_SUSPENDER_EXTENSION_ID,
            sortPinnedTabs: false,
            reverseOrder: false  // New setting for reverse order
        });

        let currentWindow = await chrome.windows.getLastFocused();
        if (!currentWindow) {
            throw new Error('No focused window found');
        }

        // Handle pinned tabs first
        let pinnedTabs = await chrome.tabs.query({
            windowId: currentWindow.id,
            pinned: true,
            currentWindow: true,
        });
        
        var groupOffset = pinnedTabs.length;

        if (pinnedTabs.length > 0 && settings.sortPinnedTabs) {
            await sortTabs(pinnedTabs, pinnedTabs[0].groupId, settings);
        }

        // Handle tab groups
        const tabGroups = await chrome.tabGroups.query({ windowId: currentWindow.id });
        
        // Sort tab groups by title
        tabGroups.sort(function (a, b) {
            return settings.reverseOrder ? 
                a.title.localeCompare(b.title) : 
                b.title.localeCompare(a.title);
        });

        for (let i = 0; i < tabGroups.length; i++) {
            let groupId = tabGroups[i].id;
            await chrome.tabGroups.move(groupId, { index: groupOffset });
            
            const tabs = await chrome.tabs.query({
                windowId: currentWindow.id,
                groupId: groupId
            });
            
            groupOffset += tabs.length;
            await sortTabs(tabs, groupId, settings);
        }

        // Handle ungrouped tabs
        const ungroupedTabs = await chrome.tabs.query({
            windowId: currentWindow.id,
            pinned: false,
            groupId: -1
        });
        
        await sortTabs(ungroupedTabs, -1, settings);
    } catch (error) {
        console.error('Error in sortTabGroups:', error);
        throw error;
    }
}

/**
 * Gets the last access time for a tab
 * @param {Object} tab - The tab object
 * @returns {number} - Last access timestamp
 */
function getLastAccessTime(tab) {
    return tab.lastAccessed || tab.lastModified || Date.now();
}

/**
 * Sorts tabs by last access time
 * @param {Array} tabs - Array of tabs to sort
 * @param {boolean} groupSuspendedTabs - Whether to group suspended tabs
 * @param {boolean} sortPinnedTabs - Whether to sort pinned tabs
 * @param {boolean} reverseOrder - Whether to sort in reverse order
 */
function sortByLastAccess(tabs, groupSuspendedTabs, sortPinnedTabs, reverseOrder) {
    tabs.sort(function (a, b) {
        // Handle pinned tabs
        if (!sortPinnedTabs && (a.pinned || b.pinned)) {
            return 0;
        }

        // Handle suspended tabs
        if (groupSuspendedTabs) {
            if (isSuspended(a) && !isSuspended(b)) return -1;
            if (!isSuspended(a) && isSuspended(b)) return 1;
        }

        // Handle blank tabs
        const isBlankA = !a.url || a.url === 'about:blank' || a.url === 'chrome://newtab/';
        const isBlankB = !b.url || b.url === 'about:blank' || b.url === 'chrome://newtab/';
        
        if (isBlankA && !isBlankB) return -1;
        if (!isBlankA && isBlankB) return 1;

        // Sort by last access time
        const timeA = getLastAccessTime(a);
        const timeB = getLastAccessTime(b);
        
        return reverseOrder ? timeA - timeB : timeB - timeA;
    });
}

/**
 * Loads the current settings
 */
async function loadSettings() {
    currentSettings = await chrome.storage.sync.get({
        sortBy: "url",
        groupFrom: "leftToRight",
        preserveOrderWithinGroups: false,
        groupSuspendedTabs: false,
        sortPinnedTabs: false,
        reverseOrder: false,
        autoSort: false,
        tabSuspenderExtensionId: THE_MARVELLOUS_SUSPENDER_EXTENSION_ID
    });
    
    // Update tab suspender extension ID
    TAB_SUSPENDER_EXTENSION_ID = currentSettings.tabSuspenderExtensionId;
    SUSPENDED_PREFIX = 'chrome-extension://' + TAB_SUSPENDER_EXTENSION_ID + '/suspended.html#';
    SUSPENDED_PREFIX_LEN = SUSPENDED_PREFIX.length;
}

/**
 * Sorts tabs within a group based on settings
 * @param {Array} tabs - Array of tab objects to sort
 * @param {number} groupId - The group ID (-1 for ungrouped)
 * @param {Object} settings - User settings for sorting
 */
async function sortTabs(tabs, groupId, settings) {
    if (tabs.length > 0) {
        TAB_SUSPENDER_EXTENSION_ID = settings.tabSuspenderExtensionId;
        SUSPENDED_PREFIX = 'chrome-extension://' + TAB_SUSPENDER_EXTENSION_ID + '/suspended.html#';
        SUSPENDED_PREFIX_LEN = SUSPENDED_PREFIX.length;
        
        let firstTabIndex = tabs[0].index;
        
        // Sort tabs based on the selected method
        switch (settings.sortBy) {
            case "url":
            case "title":
                sortByTitleOrUrl(tabs, settings.sortBy, settings.groupSuspendedTabs, settings.sortPinnedTabs);
                break;
            case "lastAccess":
                sortByLastAccess(tabs, settings.groupSuspendedTabs, settings.sortPinnedTabs, settings.reverseOrder);
                break;
            case "custom":
                sortByCustom(tabs, settings.groupFrom, settings.groupSuspendedTabs, settings.preserveOrderWithinGroups, settings.sortPinnedTabs);
                break;
        }

        // Move tabs to their new positions
        const tabIds = tabs.map(tab => tab.id);
        await chrome.tabs.move(tabIds, { index: firstTabIndex });
        
        // Regroup tabs if needed
        if (groupId > -1) {
            await chrome.tabs.group({
                groupId: groupId,
                tabIds: tabIds
            });
        }
    }
}

/**
 * Gets the URL for a tab, handling suspended tabs
 * @param {Object} tab - The tab object
 * @param {boolean} groupSuspendedTabs - Whether to group suspended tabs
 * @returns {URL} - The URL object
 */
function tabToUrl(tab, groupSuspendedTabs) {
    if (groupSuspendedTabs) {
        return new URL(tab.url);
    } else {
        const suspendedSuffix = tab.url.slice(SUSPENDED_PREFIX_LEN);
        if (suspendedSuffix) {
            var params = new URLSearchParams(suspendedSuffix);
            for (let [param, val] of params) {
                if (param === 'uri') {
                    return new URL(val);
                }
            }
        }
        return new URL(tab.pendingUrl || tab.url);
    }
}

/**
 * Updates the tab group map for custom sorting
 * @param {Map} tabGroupMap - The map to update
 * @param {Object} tab - The tab object
 * @param {string} sortBy - The sort method
 * @param {boolean} groupSuspendedTabs - Whether to group suspended tabs
 */
function updateTabGroupMap(tabGroupMap, tab, sortBy, groupSuspendedTabs) {
    if (sortBy === "title") {
        if (!tabGroupMap.has(tab.title)) {
            tabGroupMap.set(tab.title, tabGroupMap.size);
        }
    } else {
        const urlParser = tabToUrl(tab, groupSuspendedTabs);
        const host = urlParser.host;
        const urlType = getUrlTypePriority(tab.url);
        
        if (!tabGroupMap.has(host)) {
            tabGroupMap.set(host, urlType * 1000 + tabGroupMap.size);
        }
    }
}

/**
 * Compares URLs for sorting, ignoring protocol and www
 * @param {URL} urlA - First URL to compare
 * @param {URL} urlB - Second URL to compare
 * @returns {number} - Comparison result
 */
function compareByUrlComponents(urlA, urlB) {
    const keyA = urlA.hostname.replace(/^www\./i, "") + urlA.pathname + urlA.search + urlA.hash;
    const keyB = urlB.hostname.replace(/^www\./i, "") + urlB.pathname + urlB.search + urlB.hash;
    return keyA.localeCompare(keyB);
}

/**
 * Sorts tabs by title or URL
 * @param {Array} tabs - Array of tabs to sort
 * @param {string} sortBy - Sort method ('title' or 'url')
 * @param {boolean} groupSuspendedTabs - Whether to group suspended tabs
 * @param {boolean} sortPinnedTabs - Whether to sort pinned tabs
 */
function sortByTitleOrUrl(tabs, sortBy, groupSuspendedTabs, sortPinnedTabs) {
    tabs.sort(function (a, b) {
        // Handle pinned tabs
        if (!sortPinnedTabs && (a.pinned || b.pinned)) {
            return 0;
        }

        // Handle suspended tabs
        if (groupSuspendedTabs) {
            if (isSuspended(a) && !isSuspended(b)) return -1;
            if (!isSuspended(a) && isSuspended(b)) return 1;
        }

        // Get URL type priorities
        const priorityA = getUrlTypePriority(a.url);
        const priorityB = getUrlTypePriority(b.url);
        
        if (priorityA !== priorityB) {
            return currentSettings.reverseOrder ? priorityB - priorityA : priorityA - priorityB;
        }

        // Sort by title or URL within the same type
        if (sortBy === "title") {
            return currentSettings.reverseOrder ? 
                b.title.localeCompare(a.title) : 
                a.title.localeCompare(b.title);
        } else {
            const urlA = tabToUrl(a, groupSuspendedTabs);
            const urlB = tabToUrl(b, groupSuspendedTabs);
            return currentSettings.reverseOrder ? 
                compareByUrlComponents(urlB, urlA) : 
                compareByUrlComponents(urlA, urlB);
        }
    });
}

/**
 * Sorts tabs using custom sorting logic
 * @param {Array} tabs - Array of tabs to sort
 * @param {string} groupFrom - Group direction ('leftToRight' or 'rightToLeft')
 * @param {boolean} groupSuspendedTabs - Whether to group suspended tabs
 * @param {boolean} preserveOrderWithinGroups - Whether to preserve order within groups
 * @param {boolean} sortPinnedTabs - Whether to sort pinned tabs
 */
function sortByCustom(tabs, groupFrom, groupSuspendedTabs, preserveOrderWithinGroups, sortPinnedTabs) {
    const tabGroupMap = new Map();
    let left = 0, suspendedTabCount = 0, right = tabs.length;

    // Build initial group map
    if (groupFrom === "leftToRight") {
        if (groupSuspendedTabs) {
            tabGroupMap.set(TAB_SUSPENDER_EXTENSION_ID, 0);
        }
        while (left !== right) {
            if (isSuspended(tabs[left])) {
                suspendedTabCount++;
            }
            updateTabGroupMap(tabGroupMap, tabs[left], "custom", groupSuspendedTabs);
            left++;
        }
    } else {
        while (left !== right) {
            right--;
            if (isSuspended(tabs[right])) {
                suspendedTabCount++;
            }
            updateTabGroupMap(tabGroupMap, tabs[right], "custom", groupSuspendedTabs);
        }
        if (groupSuspendedTabs) {
            tabGroupMap.set(TAB_SUSPENDER_EXTENSION_ID, tabGroupMap.size);
        }
    }

    // Sort tabs
    tabs.sort(function (a, b) {
        if (!sortPinnedTabs && (a.pinned || b.pinned)) {
            return 0;
        }

        if (groupSuspendedTabs) {
            if (isSuspended(a) && !isSuspended(b)) return -1;
            if (!isSuspended(a) && isSuspended(b)) return 1;
        }

        const urlA = tabToUrl(a, groupSuspendedTabs);
        const urlB = tabToUrl(b, groupSuspendedTabs);

        const groupPosA = tabGroupMap.get(urlA.host);
        const groupPosB = tabGroupMap.get(urlB.host);

        if (groupFrom === "leftToRight") {
            if (groupPosA !== groupPosB) {
                return groupPosA - groupPosB;
            }
        } else {
            if (groupPosA !== groupPosB) {
                return groupPosB - groupPosA;
            }
        }

        if (!groupSuspendedTabs && !preserveOrderWithinGroups) {
            return compareByUrlComponents(urlA, urlB);
        }
        return 0;
    });

    // Handle suspended tabs separately if needed
    if (groupSuspendedTabs) {
        tabGroupMap.clear();
        left = 0;
        right = suspendedTabCount;

        if (groupFrom === "leftToRight") {
            while (left !== right) {
                updateTabGroupMap(tabGroupMap, tabs[left], "custom", false);
                left++;
            }
        } else {
            while (left !== right) {
                right--;
                updateTabGroupMap(tabGroupMap, tabs[right], "custom", false);
            }
        }

        const suspendedTabs = tabs.slice(0, suspendedTabCount).sort((a, b) => {
            const urlA = tabToUrl(a, false);
            const urlB = tabToUrl(b, false);
            return compareByUrlComponents(urlA, urlB);
        });
        
        const postSorted = tabs.slice(suspendedTabCount);
        tabs.length = 0;
        tabs.push.apply(tabs, suspendedTabs.concat(postSorted));
    }
}

/**
 * Removes duplicate tabs from the current window
 * Keeps the first instance of each URL and closes duplicates
 */
async function removeDuplicateTabs() {
    try {
        const currentWindow = await chrome.windows.getLastFocused();
        if (!currentWindow) {
            throw new Error('No focused window found');
        }

        const tabs = await chrome.tabs.query({ windowId: currentWindow.id });
        const seenUrls = new Map();
        const tabsToClose = [];

        // First pass: identify duplicates
        for (const tab of tabs) {
            if (tab.pinned) continue; // Skip pinned tabs

            const url = tab.url;
            if (seenUrls.has(url)) {
                tabsToClose.push(tab.id);
            } else {
                seenUrls.set(url, tab.id);
            }
        }

        // Close duplicate tabs
        if (tabsToClose.length > 0) {
            await chrome.tabs.remove(tabsToClose);
        }

        return tabsToClose.length;
    } catch (error) {
        console.error('Error in removeDuplicateTabs:', error);
        throw error;
    }
}
