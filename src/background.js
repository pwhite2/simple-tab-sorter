'use strict';

//  Preserve TGS ID in case the original TGS extension is currently installed...
const THE_GREAT_SUSPENDER_EXTENSION_ID = "klbibkeccnjlkjkiokjodocebajanakg";

var TAB_SUSPENDER_EXTENSION_ID = "";
var SUSPENDED_PREFIX = 'chrome-extension://' + TAB_SUSPENDER_EXTENSION_ID + '/suspended.html#';
var SUSPENDED_PREFIX_LEN = SUSPENDED_PREFIX.length;

// Return whether tab is currently suspended
function isSuspended(tab) {
    return tab.url.startsWith(SUSPENDED_PREFIX);
}

// One-time installation and v0.2.0 upgrade handlers...
chrome.runtime.onInstalled.addListener(function (details) {

    // TODO: Track removals, eventually do something like https://shivankaul.com/blog/feedback-form-for-chrome-extensions (add for both install and update)
    try {
        var thisVersion = chrome.runtime.getManifest().version;
        if (details.reason == "install") {
            alert(`Welcome to Simple Tab Sorter!

Please review the "User Guide" before getting started.`);
            window.open(chrome.runtime.getURL('userguide.html'));
            // Set uninstall URL to Google feedback form if browser supports it...
            if (chrome.runtime.setUninstallURL) {
                var uninstallGoogleFormLink = 'https://docs.google.com/forms/d/e/1FAIpQLSe-r_WFNry_KZCwOjdMjDjiS8sEIWmmwY-3hbSmIYV393RLCA/viewform';
                chrome.runtime.setUninstallURL(uninstallGoogleFormLink);
            }
        } else if (details.reason == "update" && thisVersion == "0.3.3") {
            chrome.storage.sync.get({
                sortBy: 'url',
            }, function (items) {
                if (items.sortBy == "url") {
                    alert(`Simple Tab Sorter has been updated to v0.3.3.

This is a small compatibility patch that adds support for Chrome's new
tab suspension feature.

Please review the updated User Guide to learn more about the latest changes.`);
                    chrome.storage.sync.set({
                        sortBy: "custom"
                    });
                    window.open(chrome.runtime.getURL('userguide.html'));
                }
            });
        }
    } catch(e) {
        alert("Please report to developer: OnInstall Error - " + e);
    }
});

// Extension icon onClick handler...
chrome.browserAction.onClicked.addListener(function (tab) {
    var tabs = chrome.tabs.query({
        // Separate windows must be sorted separately - this is to prevent undesired accidental sorting in other windows...
        currentWindow: true
    }, function (tabs) {
        if (tabs.length > 0) {
            // Fetch persisted settings and sort accordingly...
            chrome.storage.sync.get({
                sortBy: "url",
                groupFrom: "leftToRight",
                preserveOrderWithinGroups: false,
                groupSuspendedTabs: false,
                tabSuspenderExtensionId: THE_GREAT_SUSPENDER_EXTENSION_ID,
                sortPinnedTabs: false
            }, function (result) {
               TAB_SUSPENDER_EXTENSION_ID = result.tabSuspenderExtensionId;
               SUSPENDED_PREFIX = 'chrome-extension://' + TAB_SUSPENDER_EXTENSION_ID + '/suspended.html#';
               SUSPENDED_PREFIX_LEN = SUSPENDED_PREFIX.length;
               switch (result.sortBy) {
                   case "url":
                   case "title":
                       sortByTitleOrUrl(tabs, result.sortBy, result.groupSuspendedTabs, result.sortPinnedTabs);
                       break;
                   case "custom":
                       sortByCustom(tabs, result.groupFrom, result.groupSuspendedTabs, result.preserveOrderWithinGroups, result.sortPinnedTabs);
                       break;
                    default:
                        alert('Invalid sort-by condition encountered!');
               }
               moveTabs(tabs);
            });
        }
    })
})

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
        //  Don't sort grouped tabs until proper API support for tab groups is added to the chrome API...
        if (a.groupId != -1 || b.groupId != -1) {
            return 0;
        }

        // Fix for Issue #6 - Option to exclude pinned tabs in the sort action (excluded by default now)
        if (!sortPinnedTabs && (a.pinned || b.pinned)) {
            return 0;
        }

        // TODO: Verify whether this behavior was broken by the introduction of *Tab Groups*
        if (groupSuspendedTabs) {
            if (isSuspended(a) && !isSuspended(b)) return -1;
            if (!isSuspended(a) && isSuspended(b)) return 1;
        }
        return a.title.localeCompare(b.title);
    }

    // Shift suspended tabs left (if groupSuspendedTabs == true). Otherwise, sort by URL in the browser's current locale.
    function _urlComparator(a, b, groupSuspendedTabs, sortPinnedTabs) {

        //  Don't sort grouped tabs until proper API support for tab groups is added to the chrome API...
        if (a.groupId != -1 || b.groupId != -1) {
            return 0;
        }

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

        //  Don't sort grouped tabs until proper API support for tab groups is added to the chrome API...
        if (a.groupId != -1 || b.groupId != -1) {
            return 0;
        }

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

// Move tabs to their post-sort locations
function moveTabs(tabs) {
    for (let i = 0; i < tabs.length; i++) {
        chrome.tabs.move(tabs[i].id, { index: i });
    }
}
