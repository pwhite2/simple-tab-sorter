const thisVersion = chrome.runtime.getManifest().version;
var newInstallOrUpdate = false;

// Clear install & upgrade flags once they've been handled...
function clearInstallOrUpdate() {
    chrome.storage.sync.set({
        installedVersion: chrome.runtime.getManifest().version,
        newInstall: false,
        newUpdate: false
    }, function () {});
}

// Display modal dialog when first clicked after an install or update...
chrome.storage.sync.get({
    installedVersion: '',
    newInstall: false,
    newUpdate: false,
}, function (config) {
    clearInstallOrUpdate();
    if (config.newInstall) {
        alert(`Welcome to Simple Tab Sorter!

        Please review the "User Guide" before getting started.

        You'll need to click the extension icon, again, to sort your tabs after dismissing this dialog but you won't see this dialog again unless you reinstall this extension.

        You can right-click on the extension icon and select \"Options\" at any time to configure extension settings and review the user guide.`);
        window.open(chrome.runtime.getURL('./userguide.html'));
    } else if (config.newUpdate) {
        alert("Simple Tab Sorter has been updated to v" + thisVersion +
        ".\n\nThis version was updated to use the new Chrome manifest v3 API (major architectural change) and adds direct support for Chrome's tab groups feature." +
        "\n\nPlease review the updated User Guide to learn more about the latest changes and the newly released Super Tab Sorter." +
        "\n\nYou'll need to click the extension icon, again, to sort your tabs after dismissing this dialog but you won't see this dialog again until installing the next update." +
        "\n\nYou can right-click on the extension icon and select \"Options\" at any time to configure extension settings and review the user guide.");
        window.open(chrome.runtime.getURL('./userguide.html'));
    } else {
        // Send click event to background.js for processing...
        chrome.runtime.sendMessage({
            type: "click_event"
        }, response => {
            if (response.message === 'success') {
                window.close();
            }
            });
            }
});
