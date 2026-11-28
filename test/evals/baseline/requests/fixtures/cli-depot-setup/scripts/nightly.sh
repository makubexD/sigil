#!/bin/sh
# Nightly stock report. Cron runs this on the warehouse machine and mails the two files.
set -e

depot warehouse show-all > /tmp/depot-warehouses.txt
depot item list > /tmp/depot-items.txt
