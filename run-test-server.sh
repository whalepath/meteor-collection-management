#!/bin/sh

# meteor help test-packages
cat<<EOM


Open the test dashboard in your browser to run the tests and see the results.

        http://localhost:54321

(This script will not end by itself.)
EOM

meteor -p 54321 test-packages ./
