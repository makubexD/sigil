#!/bin/sh
set -e
node shipit.mjs users show-all -f json > users.json
node shipit.mjs deploy staging api "$VERSION" false
