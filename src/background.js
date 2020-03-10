'use strict';

const THE_GREAT_SUSPENDER_EXTENSION_ID = "klbibkeccnjlkjkiokjodocebajanakg";
const SUSPENDED_PREFIX = 'chrome-extension://' + THE_GREAT_SUSPENDER_EXTENSION_ID + '/suspended.html#';
const SUSPENDED_PREFIX_LEN = SUSPENDED_PREFIX.length;

chrome.browserAction.onClicked.addListener(function (tab) {
    var tabs = chrome.tabs.query({
        currentWindow: true
    }, function (tabs) {
        _gaq.push(['_trackEvent', 'Simple Tab Sorter extension', 'clicked']);
        if (tabs.length > 0) {
            // Fetch persisted settings and sort accordingly...
            chrome.storage.sync.get({
                sortBy: "url",
                groupFrom: "leftToRight",
                preserveOrderWithinGroups: false,
                groupSuspendedTabs: false
            }, function (result) {
                if (result.sortBy == "title") {
                    sortByTitle(tabs, result.groupFrom, result.preserveOrderWithinGroups, result.groupSuspendedTabs);
                } else {
                    sortByUrl(tabs, result.groupFrom, result.preserveOrderWithinGroups, result.groupSuspendedTabs);
                }
                moveTabs(tabs);
            });
        }
    })
})

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
        return new URL(tab.url);
    }
}

// Populate host ordering Map...
function updateHostMap(hostMap, tab, groupSuspendedTabs) {
    var urlParser = tabToUrl(tab, groupSuspendedTabs);
    var host = urlParser.host;
    if (!hostMap.has(host)) {
        hostMap.set(host, hostMap.size)
    }
}

// Sort by title in the browser's current locale...
function sortByTitle(tabs, groupFrom, preserveOrderWithinGroups, groupSuspendedTabs) {
    tabs.sort(function (a, b) {
        return a.title.localeCompare(b.title);
    });
}

// Sort by URL as defined by the configured extension settings...
function sortByUrl(tabs, groupFrom, preserveOrderWithinGroups, groupSuspendedTabs) {
    let hostMap = new Map();
    let left = 0, right = tabs.length;

    if (groupFrom == "leftToRight") {
        // Shift suspended tabs to far left of page if keeping them grouped...
        if (groupSuspendedTabs == true) {
            hostMap.set(THE_GREAT_SUSPENDER_EXTENSION_ID, 0);
        }
        while (left !== right) {
            updateHostMap(hostMap, tabs[left], groupSuspendedTabs);
            left += 1;
        }
    } else {
        while (left !== right) {
            right -= 1;
            updateHostMap(hostMap, tabs[right], groupSuspendedTabs);
        }
        // Shift suspended tabs to far left of page if keeping them grouped...
        if (groupSuspendedTabs == true) {
            hostMap.set(THE_GREAT_SUSPENDER_EXTENSION_ID, hostMap.size);
        }
    }

    tabs.sort(function (a, b) {
        let urlA = tabToUrl(a, groupSuspendedTabs);
        let urlB = tabToUrl(b, groupSuspendedTabs);

        var groupIndexA = hostMap.get(urlA.host);
        var groupIndexB = hostMap.get(urlB.host);

        if (groupFrom == "leftToRight") {
            if (groupIndexA < groupIndexB) return -1;
            if (groupIndexA > groupIndexB) return 1;
        } else {
            if (groupIndexA < groupIndexB) return 1;
            if (groupIndexA > groupIndexB) return -1;
        }
        // Don't sort tabs within groups unless specified in user options
        if (!preserveOrderWithinGroups === true) {
            if (urlA < urlB) return -1;
            if (urlA > urlB) return 1;
        }
        return 0;
    });
}

// Move tabs to their post-sort locations...
function moveTabs(tabs) {
    for (let i = 0; i < tabs.length; i++) {
        chrome.tabs.move(tabs[i].id, { index: i });
    }
}