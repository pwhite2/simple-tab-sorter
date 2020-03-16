document.addEventListener('DOMContentLoaded', function() {
    $('#version').text(function(index) {
        return "v" + chrome.runtime.getManifest().version;
    });
});