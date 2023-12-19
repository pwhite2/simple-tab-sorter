'use strict';

// Default to "The Marvellous Suspender" as the de facto The Great Suspender replacement
const THE_MARVELLOUS_SUSPENDER_EXTENSION_ID = "noogafoofpebimajpfpamcfhoaifemoa";

var TAB_SUSPENDER_EXTENSION_ID = "";
var SUSPENDED_PREFIX = 'chrome-extension://' + TAB_SUSPENDER_EXTENSION_ID + '/suspended.html#';
var SUSPENDED_PREFIX_LEN = SUSPENDED_PREFIX.length;

// Extension icon onClick handler...
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.type == "click_event") {
        sortTabGroups();
        sendResponse({ message: 'success' });
    }
})

// Return whether tab is currently suspended
function isSuspended(tab) {
    return tab.url.startsWith(SUSPENDED_PREFIX);
}

// One-time installation and v0.4.0 upgrade handlers...
chrome.runtime.onInstalled.addListener(function (details) {

    var thisVersion = chrome.runtime.getManifest().version;
    if (details.reason == "install") {
        chrome.storage.sync.set({
            installedVersion: thisVersion,
            newInstall: true,
            newUpdate: false
        }, function () {
            // Prompt for (optional) uninstall feedback so I can see if there's room for improvement...
            if (chrome.runtime.setUninstallURL) {
                var uninstallGoogleFormLink = 'https://docs.google.com/forms/d/e/1FAIpQLSe-r_WFNry_KZCwOjdMjDjiS8sEIWmmwY-3hbSmIYV393RLCA/viewform';
                chrome.runtime.setUninstallURL(uninstallGoogleFormLink);
            }
        });
    } else if (details.reason == "update") {
        chrome.storage.sync.set({
            installedVersion: thisVersion,
            newInstall: false,
            newUpdate: true
        }, function () { });
    }
})

// Separate windows must be sorted separately - this is to prevent undesired accidental sorting in other windows...
async function sortTabGroups() {

    let settings = await chrome.storage.sync.get({
        sortBy: "url",
        groupFrom: "leftToRight",
        preserveOrderWithinGroups: false,
        groupSuspendedTabs: false,
        tabSuspenderExtensionId: THE_MARVELLOUS_SUSPENDER_EXTENSION_ID,
        sortPinnedTabs: false
    });

    let pinnedTabs = await chrome.tabs.query({
        pinned: true,
        currentWindow: true,
    })
    var groupOffset = pinnedTabs.length

    if (pinnedTabs.length > 0 && settings.sortPinnedTabs) {
        sortTabs(pinnedTabs, pinnedTabs[0].groupId, settings)
    }

    await chrome.tabGroups.query({ windowId: -1 }, function (tabGroups) {
        // You can prefix your tab group names with numeric values if you'd like to override the sort order...
        tabGroups.sort(function (a, b) {
            return b.title.localeCompare(a.title);
        });

        // Sort tab groups
        for (let i = 0; i < tabGroups.length; i++) {
            let groupId = tabGroups[i].id
            chrome.tabGroups.move(groupId, { index: groupOffset });
            chrome.tabs.query({
                groupId: groupId
            }, function(tabs) {
                groupOffset += tabs.length
                // Sort tabs tab group's tabs while we have a reference to them
                sortTabs(tabs, groupId, settings)
            })
        }
        // Sort ungrouped tabs
        chrome.tabs.query({
            pinned: false,
            groupId: -1
        }, function(tabs) {
            sortTabs(tabs, -1, settings)
        })
    })
}

async function sortTabs(tabs, groupId, settings) {
    if (tabs.length > 0) {
        TAB_SUSPENDER_EXTENSION_ID = settings.tabSuspenderExtensionId;
        SUSPENDED_PREFIX = 'chrome-extension://' + TAB_SUSPENDER_EXTENSION_ID + '/suspended.html#';
        SUSPENDED_PREFIX_LEN = SUSPENDED_PREFIX.length;
        let firstTabIndex = tabs[0].index
        switch (settings.sortBy) {
            case "url":
            case "title":
                sortByTitleOrUrl(tabs, settings.sortBy, settings.groupSuspendedTabs, settings.sortPinnedTabs);
                break;
            case "custom":
                sortByCustom(tabs, settings.groupFrom, settings.groupSuspendedTabs, settings.preserveOrderWithinGroups, settings.sortPinnedTabs);
                break;
        }

        const tabIds = tabs.map(function(tab){ return tab.id; })
        chrome.tabs.move(tabIds, { index: firstTabIndex });
        if (groupId > -1) {
            chrome.tabs.group({
                groupId: groupId,
                tabIds: tabIds
            })
        }
    }
}

// Returns the tab's suspended URL if 'groupSuspendedTabs' is set - otherwise, return's the current tab's URL or suspended tab's original URL
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

// Populate tab group ordering Map...
function updateTabGroupMap(tabGroupMap, tab, sortBy, groupSuspendedTabs) {
    if (sortBy == "title") {
        if (!tabGroupMap.has(tab.title)) tabGroupMap.set(tab.title, tabGroupMap.size);
    } else {
        // sortBy "url" and "custom" group tabs by URL().host...
        var urlParser = tabToUrl(tab, groupSuspendedTabs);
        var host = urlParser.host;

        if (!tabGroupMap.has(host)) {
            tabGroupMap.set(host, tabGroupMap.size)
        }
    }
}

// Sorting strictly by URL may seem simpler, but I want to exclude protocol and leading "www." from the sort criteria...
function compareByUrlComponents(urlA, urlB) {
    var keyA = urlA.hostname.replace(/^www\./i, "") + urlA.pathname + urlA.search + urlA.hash;
    var keyB = urlB.hostname.replace(/^www\./i, "") + urlB.pathname + urlB.search + urlB.hash;

    return keyA.localeCompare(keyB);
}

// Group suspended tabs to left side if 'groupSuspendedTabs' is checked in settings
function sortByTitleOrUrl(tabs, sortBy, groupSuspendedTabs, sortPinnedTabs) {
    // Group suspended tabs to the left, using comparator for unsuspended tabs.
    tabs.sort(function (a, b) {

        if (sortBy == "title") {
            return _titleComparator(a, b, groupSuspendedTabs, sortPinnedTabs);
        } else {
            return _urlComparator(a, b, groupSuspendedTabs, sortPinnedTabs);
        }
    });

    // Shift suspended tabs left (if groupSuspendedTabs == true). Otherwise, sort by title in the browser's current locale.
    function _titleComparator(a, b, groupSuspendedTabs, sortPinnedTabs) {

        // Fix for Issue #6 - Option to exclude pinned tabs in the sort action (excluded by default now)
        if (!sortPinnedTabs && (a.pinned || b.pinned)) {
            return 0;
        }

        if (groupSuspendedTabs) {
            if (isSuspended(a) && !isSuspended(b)) return -1;
            if (!isSuspended(a) && isSuspended(b)) return 1;
        }
        return a.title.localeCompare(b.title);
    }

    // Shift suspended tabs left (if groupSuspendedTabs == true). Otherwise, sort by URL in the browser's current locale.
    function _urlComparator(a, b, groupSuspendedTabs, sortPinnedTabs) {

        if (!sortPinnedTabs && (a.pinned || b.pinned)) {
            return 0;
        }

        // Shift suspended tabs left...
        if (groupSuspendedTabs) {
            if (isSuspended(a) && !isSuspended(b)) return -1;
            if (!isSuspended(a) && isSuspended(b)) return 1;
        }

        var urlA = tabToUrl(a, groupSuspendedTabs);
        var urlB = tabToUrl(b, groupSuspendedTabs);

        return compareByUrlComponents(urlA, urlB);
    }
}

// Sort by URL as defined by the configured extension settings
function sortByCustom(tabs, groupFrom, groupSuspendedTabs, preserveOrderWithinGroups, sortPinnedTabs) {
    var tabGroupMap = new Map();
    var left = 0, suspendedTabCount = 0, right = tabs.length;

    // Group tabs from leftToRight or rightToLeft as configured in settings...
    if (groupFrom == "leftToRight") {
        // Ensures that suspended tabs will be shifted to the left side of browser if 'groupSuspendedTabs' is checked in settings
        if (groupSuspendedTabs) {
            tabGroupMap.set(TAB_SUSPENDER_EXTENSION_ID, 0);
        }
        while (left !== right) {
            if (isSuspended(tabs[left])) {
                suspendedTabCount += 1;
            }
            updateTabGroupMap(tabGroupMap, tabs[left], "custom", groupSuspendedTabs);
            left += 1;
        }
    } else {
        while (left !== right) {
            right -= 1;
            if (isSuspended(tabs[right])) {
                suspendedTabCount += 1;
            }
            updateTabGroupMap(tabGroupMap, tabs[right], "custom", groupSuspendedTabs);
        }
        // Ensures that suspended tabs will be shifted to the left side of browser if 'groupSuspendedTabs' is checked in settings
        if (groupSuspendedTabs) {
            tabGroupMap.set(TAB_SUSPENDER_EXTENSION_ID, tabGroupMap.size);
        }
    }

    tabs.sort(function (a, b) {
        return _customSortComparator(a, b, groupSuspendedTabs, sortPinnedTabs);
    });

    // Support independent subsorting of suspended tabs if 'groupSuspendedTabs' is checked in settings
    if (groupSuspendedTabs) {
        // Repopulate tabGroupMap, ignoring "groupSuspendedTabs" (so they're not all in the same bucket), to get the subsort right...
        tabGroupMap.clear();
        left = 0, right = suspendedTabCount;
        // Shift suspended tabs to far left of page if keeping them grouped...
        if (groupFrom == "leftToRight") {
            while (left !== right) {
                updateTabGroupMap(tabGroupMap, tabs[left], "custom", false);
                left += 1;
            }
        } else {
            while (left !== right) {
                right -= 1;
                updateTabGroupMap(tabGroupMap, tabs[right], "custom", false);
            }
        }

        var suspendedTabs = tabs.slice(0, suspendedTabCount).sort(function (a, b) { return _customSortComparator(a, b, false); });
        var postSorted = tabs.slice(suspendedTabCount);
        tabs.length = 0;
        tabs.push.apply(tabs, suspendedTabs.concat(postSorted));
    }

    function _customSortComparator(a, b, groupSuspendedTabs, sortPinnedTabs) {
        if (!sortPinnedTabs && (a.pinned || b.pinned)) {
            return 0;
        }

        // Shift suspended tabs left...
        if (groupSuspendedTabs) {
            if (isSuspended(a) && !isSuspended(b)) return -1;
            if (!isSuspended(a) && isSuspended(b)) return 1;
        }

        // Subsort by URL...
        let urlA = tabToUrl(a, groupSuspendedTabs);
        let urlB = tabToUrl(b, groupSuspendedTabs);

        var groupPosA = tabGroupMap.get(urlA.host);
        var groupPosB = tabGroupMap.get(urlB.host);

        if (groupFrom == "leftToRight") {
            if (groupPosA < groupPosB) return -1;
            if (groupPosA > groupPosB) return 1;
        } else {
            if (groupPosA < groupPosB) return 1;
            if (groupPosA > groupPosB) return -1;
        }

        // Subsort tabs within groups unless we're subsorting suspended tabs && 'preserveOrderWithinGroups' is specified in user options
        if (!groupSuspendedTabs && !preserveOrderWithinGroups) {
            return compareByUrlComponents(urlA, urlB);
        }
        return 0;
    }
}
