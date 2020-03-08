// Save options to chrome.storage
function saveOptions() {
    var sortBy = document.getElementById('sortBy').value;
    var groupFrom = document.getElementById('groupFrom').value;
    var preserveOrderWithinGroups = document.getElementById('preserveOrderWithinGroups').checked;
    var groupSuspendedTabs = document.getElementById('groupSuspendedTabs').checked;
    chrome.storage.sync.set({
        sortBy: sortBy,
        groupFrom: groupFrom,
        preserveOrderWithinGroups: preserveOrderWithinGroups,
        groupSuspendedTabs: groupSuspendedTabs
    }, function () {
        document.getElementById('save').setAttribute("disabled", true);
        // Update status to let user know options were saved.
        $('#status').removeClass("invisible");
        $('#status').addClass("visible");
    });
}

// Restore options state from chrome.storage
function restoreOptions() {
    // Use default value and preserveOrderWithinGroups = false.
    chrome.storage.sync.get({
        sortBy: 'url',
        groupFrom: 'leftToRight',
        preserveOrderWithinGroups: true,
        groupSuspendedTabs: false
    }, function (items) {
        document.getElementById('sortBy').value = items.sortBy;
        document.getElementById('groupFrom').value = items.groupFrom;
        document.getElementById('preserveOrderWithinGroups').checked = items.preserveOrderWithinGroups;
        document.getElementById('groupSuspendedTabs').checked = items.groupSuspendedTabs;
    });
}

function toggleSaveButton() {
    $('#status').removeClass("visible");
    $('#status').addClass("invisible");
    chrome.storage.sync.get({
        sortBy: 'url',
        groupFrom: 'leftToRight',
        preserveOrderWithinGroups: true,
        groupSuspendedTabs: false
    }, function (items) {
        if (document.getElementById('sortBy').value != items.sortBy ||
            document.getElementById('groupFrom').value != items.groupFrom ||
            document.getElementById('preserveOrderWithinGroups').checked != items.preserveOrderWithinGroups ||
            document.getElementById('groupSuspendedTabs').checked != items.groupSuspendedTabs) {
            document.getElementById('save').removeAttribute("disabled");
        } else {
            document.getElementById('save').setAttribute("disabled", true);
        }
    });
}

function toggleTabGroupOptions() {
    if ($('#sortBy option:selected').val() == "title") {
        $('#groupFrom').prop('disabled', true);
        $('#preserveOrderWithinGroups').prop('disabled', true);
        $('#groupSuspendedTabs').prop('disabled', true);
    } else {
        $('#groupFrom').prop('disabled', false);
        $('#preserveOrderWithinGroups').prop('disabled', false);
        $('#groupSuspendedTabs').prop('disabled', false);
    }
    toggleSaveButton();
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('sortBy').addEventListener('change', toggleTabGroupOptions);
document.getElementById('groupFrom').addEventListener('change', toggleSaveButton);
document.getElementById('preserveOrderWithinGroups').addEventListener('change', toggleSaveButton);
document.getElementById('groupSuspendedTabs').addEventListener('change', toggleSaveButton);
document.getElementById('save').addEventListener('click', saveOptions);