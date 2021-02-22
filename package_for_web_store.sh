#!/bin/sh

VERSION="0.3.1"

# Replace version number if not already done so...
gsed -i "s/\"version\": \".*\"/\"version\": \"$VERSION\"/g" src/manifest.json

# Replace Google Analytics Tracking id with value stored in local environment variable so folks don't unintentionally track forked extensions using my ID...
#gsed -i s/UA-XXXXXXXXX-X/$STS_GA_TRACKING_ID/g src/analytics.js

# Zip src dir for upload to the Chrome Web Store
zip -r simple-tab-sorter-v$VERSION.zip src

# Revert tracking id change to src/analytics.js to prevent it from being unintentionally committed to GitHub
#git checkout HEAD -- src/analytics.js

# TODO: Look into https://github.com/github-tools/github-release-notes
