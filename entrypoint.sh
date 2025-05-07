#!/bin/sh

if [ "$#" -lt 1 ]; then
    exec node server.js
else
    if [ "$1" = "make_root" ]; then
        shift # Remove the first argument
        exec node make_root.js "$@"
    else
        exec node server.js
    fi
fi