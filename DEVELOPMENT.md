
# How to develop Ash-Nazg

This document describes what one needs to know in order to hack on Ash-Nazg. If you are familiar
with Node, CouchDB, and React you are already on sane territory but I recommend you at least skim
this document as the local specificities are laid out as well.

## IMPORTANT WARNING

If you are rebuilding the client-side code on a Mac, you are likely to get an incomprehensible
error from Browserify of the type `Error: EMFILE, open '/some/path'`. That is because the number of
simultaneously open files is bizarrely low on OSX, and Browserify opens a bizarrely high number
of resources concurrently.

In order to do that, in the environment that runs the build, you will need to run:

    ulimit -n 2560

If you don't know that, you can waste quite some time.

## Overall Architecture

## Setting Up

installing
nodemon
npm run *
expose


## The CouchDB Design

running the store.js to update the design


## Server Code Layout


## Client Code Layout


## Suggested Improvements

use Flux more
expose more functionality without login (just be careful with affordances)

