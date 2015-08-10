
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

The repository actually contains two related but generally separate aspects: the server side and the
client side. They do not share code, but communicate over HTTP. This may seem like an off choice,
but it can prove useful if at some point it becomes required to use an
[isomorphic approach](http://nerds.airbnb.com/isomorphic-javascript-future-web-apps/) (which can
rather readily be supported).

The server side is written in Node, and uses Express. It is a pretty typical stack, serving static
content out of `public`, using the Express middleware for sessions, Winston for logging, etc.

The database system is CouchDB. It is also used in a straightforward manner, with no reliance on
CouchDB specificities. If needed, it could be ported to another system.

The client side is written using React, making lightweight use of the Flux architecture, and is
built using Browserify. React is its own way of thinking about Web applications that has its own
learning curve (and can require a little bit of retooling of one's editor for the JSX part) but once
you start using it it is hard to go back. It's the first framework I find to be worth the hype since
jQuery (and for completely different reasons).

No CSS framework is used; but the CSS does get built too using cleancss (for modularity and
minification).

## Setting Up

Installation is straightforward:

    git clone https://github.com/w3c/ash-nazg
    cd ash-nazg
    npm install -d

You now need to configure the system so that it can find various bits and pieces. For this create a
`config.json` at the root, with the following content:

```json
{
    // the root URL, this is what I use on my development machine
    "url":              "http://ash.bast/"
    // the full URL to the GitHub hook; locally I use ngrok to expose that to the world
    // (see below for details about ngrok). In production this can be inferred from url+hookPath
,   "hookURL":          "http://ashnazg.ngrok.io/api/hook"
    // the local path for the GitHub hook
,   "hookPath":         "api/hook"
    // if you aren't running ash-nazg at the root of a site, you can define a prefix so that it
    // knows where its actual root is. Otherwise /.
,   "urlPathPrefix":    "/"
    // pick a port to use
,   "serverPort":       3043
    // you need a secret to seed the sessions
,   "sessionSecret":    "Some secret phrase"
    // the client ID and secret you get from GitHub
,   "ghClientID":       "deadbeef"
,   "ghClientSecret":   "d3adb33f"
    // set to true if you want logging to the console (false in production)
,   "logToConsole":     true
    // username and password for Couch
,   "couchAuth": {
        "username": "robin"
    ,   "password": "some!cool@password"
    }
    // the database name in Couch
,   "couchDB":  "ashnazg"
}
```

Now, with CouchDB is already up and running, you want to run:

    node store.js
    node tools/add-admin.js yourGitHubUsername

This installs all the design documents that Couch needs. Whenever you change the design documents,
just run `store.js` again. You only need to create an admin user on a fresh database; after that
other admins can be minted through the UI.

Running the server is as simple as:

    npm run start

If you are going to develop however, that isn't the best way of running the server. If you are 
touching several aspects (CSS, client, server) you will want to have several terminals open.

When developing the server code, you want to run:

    npm run watch-server

This will start a nodemon instance that will monitor the changes you make to the *server* code, and
restart it for you.

When developing client code, you want to run:

    npm run watch

This will also use nodemon to monitor the CSS and JS/JSX to rebuild them as needed. Be warned that 
the JS build can take a second or two, so if nothing changes because you reload too fast that's why.
You can `watch-js` and `watch-css` separately if you want to.

One of the issues with developing on one's box is that it is not typically accessible over the Web
for outside services to interact with. If you are trying to get events from repositories on GitHub,
you will need to expose yourself to the Web. You may already have your preferred way of doing that,
but in case you don't you can use ngrok (which is what I do). In order to expose your service 
through ngrok, just run

    npm run expose

Note that you don't need that for regular development, you only need to be exposed if you want to
receive GitHub events.

## Production deployment

You will want a slightly different `config.json`; the one in hatchery is serviceable.

You don't want to use `npm run` in production; instead use pm2. A configuration is provided for it
in `pm2-production.json` (it's what's used on hatchery).

Make sure you create an admin user as described above.


## The CouchDB Design

A small set of design documents are used in CouchDB, and they are all very simple. They are basic
maps to index the data. You can find them all under `store.js` in `setupDDocs()`. There are:

* users, that can be queried by username or affiliation;
* groups, queried through their W3C ID or type (WG, etc.);
* secrets (each repository hook has a separate secret so that a rogue repository can be forgotten
  about without compromising the others), queried by repository name;
* tokens (that allow us to impersonate users), queried by username;
* repos, queried by name; and
* PRs, queried by any of: repository name and PR number, date, status (open or closed), group that
  they below to, or affiliation of contributors.

## Server Code Layout

The server makes use of several files.

### `server.js`

This is the primary entry point, and it does quite a few things. It could be factored out.

It makes use of Passport and its attendant GitHub login strategy in order to support GitHub logins.
This is basically an OAuth service. When a new user logs in, their user gets created in the DB based
on the information that GitHub provides through Passport.

There are also Express endpoints for when OAuth completes and we need to handle the actual login at
our end (`/auth/github` and `/auth/github/callback`). The code handles redirections so that the user
should always return to the page that they initially had to log into.

The server uses long-lived sessions, that are stored as files. This could be replaced with a DB, but
so long as the traffic is reasonable it should not be a problem.

There is a `logout` endpoint that simply kills the session, and a `logged-in` one that can tell
whether the current user is logged in (and an admin or not).

Many endpoints simply talk to the store in order to CRUD the data. Nothing fancy.

The complicated parts are those that handle the interaction with GitHub beyond just the login.

`makeCreateOrImportRepo()` will drive the `gh` component in order to (yes) create or import a
repository. It will create and store a secret unique to the hook attached to that repo, to make sure
that the secret can leak without enabling people to fake input from any monitored repo. It will also
store the GitHub token that is allowed to manipulate this repo so that we can interact with it even
in the user's absence. Once all works out it adds the repository to the DB.

The GitHub hooks handling is nasty, sadly because it has to be (see `prStatus()`). This needs to:

* Find the repository and bail if we're not monitoring it
* Find a token that allows us to set the status of PRs on that repo
* Set the status to pending
* Get existing contributors if the PR is already known about (since it can be updated)
* Look up all the contributors to see if they're allowed to contribute
* Set the status of the PR (and store it) based on the contributors' acceptability

The handling of the incoming hook is also amusing. Basically, hooks are signed so that we can be
sure they are really coming from GitHub. But since we have a different secret per repo we need to
look inside the payload to figure out which secret to use to validate the signature. Yet we can't
use the normal Express JSON middleware because that will get rid of the incoming bytes, making
signature validation impossible.

Once we have the repo, the secret, signature validation, and it's the right kind of event we pass
the data on.

A few endpoints also talk to the `w3capi` library in order to make it easier to use the W3C API.
Nothing fancy.

Finally, a number of endpoints just map to `showIndex()`. This is there because we use the History
API, which means we can get requests with those paths but they should all just serve the index page.


### `store.js`

This is a very straightforward access point to CouchDB, built atop the cradle library. When ran
directly it creates the DB and sets up the design documents; otherwise it's a library that can be
used to access the content of the DB.

Overall it could use some DRY love; a lot of its methods look very much like one another.

There is no specific handling of conflicts, they should just fail.

Object types are labelled with a `type` field, and the `id` field is used to know where to store
each object. The `type` field is what the design documents map on.


### `gh.js`

This library handles most of the interactions with GitHub, on top of the octokat library. Most of
these interactions are simple and linear.


### `log.js`

This is a simple wrapper that exposes an already-built instance of Winston, configured to log to the
console, file, or both. It's easy to add other logging targets if need be.


## Client Code Layout

CSS

## Suggested Improvements

use Flux more
expose more functionality without login (just be careful with affordances)
sharing code with Midgard

## How to deploy

pm2
create admin user

