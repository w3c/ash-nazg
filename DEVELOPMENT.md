
# How to develop Ash-Nazg

This document describes what one needs to know in order to hack on Ash-Nazg. If you are familiar
with Node, [CouchDB][CouchDB], and [React][React] you are already on sane territory but I recommend
you at least skim this document as the local specificities are laid out as well.

## IMPORTANT WARNING

If you are rebuilding the client-side code on a Mac, you are likely to get an incomprehensible error
from [Browserify][Browserify] of the type `Error: EMFILE, open '/some/path'`. That is because the
number of simultaneously open files is bizarrely low on OSX, and Browserify opens a bizarrely high
number of resources concurrently.

In order to do that, in the environment that runs the build, you will need to run:

    ulimit -n 2560

If you don't know that, you can waste quite some time.

## Overall Architecture

The repository actually contains two related but generally separate aspects: the server side and the
client side. They do not share code, but communicate over HTTP. This may seem like an off choice,
but it can prove useful if at some point it becomes required to use an
[isomorphic approach](http://nerds.airbnb.com/isomorphic-javascript-future-web-apps/) (which can
rather readily be supported).

The server side is written in Node, and uses [Express][Express]. It is a pretty typical stack,
serving static content out of `public`, using the Express middleware for sessions,
[Winston][Winston] for logging, etc.

The database system is CouchDB. It is also used in a straightforward manner, with no reliance on
CouchDB specificities. If needed, it could be ported to another system.

The client side is written using React, making lightweight use of the [Flux][Flux] architecture, and
is built using Browserify. React is its own way of thinking about Web applications that has its own
learning curve (and can require a little bit of retooling of one's editor for the [JSX][JSX] part)
but once you start using it it is hard to go back. It's the first framework I find to be worth the
hype since jQuery (and for completely different reasons).

No CSS framework is used; but the CSS does get built too using [cleancss][cleancss] (for modularity
and minification).

## Setting Up

Installation is straightforward:

    git clone https://github.com/w3c/ash-nazg
    cd ash-nazg
    npm install -d

You now need to configure the system so that it can find various bits and pieces. For this create a
`config.json` at the root, with the following content:

```
{
    // the root URL, this is what I use on my development machine
    "url":              "http://ash.bast/"
    // the full URL to the GitHub hook; locally I use ngrok to expose that to the world
    // (see below for details about ngrok). In production this can be inferred from url+hookPath
,   "hookURL":          "http://ashnazg.ngrok.io/api/hook"
    // the local path for the GitHub hook
,   "hookPath":         "api/hook"
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
,   "couchDB": "ashnazg"
    // accessing the W3C API, which we do, requires a key and a matching origin
    // hopefully at some point the origin won't be needed anymore
,   "w3cAPIKey":    "deadbeef"
,   "w3cAPIOrigin": "http://foo.bar/"
    // address from which notifications are set
,   "notifyFrom": "foo@example.com"
    // w3cbot GitHub token with `public_repo` privileges to comment on the PR
,   "w3cBotGHToken": "1234"
}
```

Now, with CouchDB is already up and running, you want to run:

    node store.js
    node tools/add-admin.js yourGitHubUsername

This installs all the design documents that Couch needs. Whenever you change the design documents,
just run `store.js` again. You only need to create an admin user on a fresh database; after that
other admins can be minted through the UI.

To send notifications of failures, ash-nazg assumes sendmail is installed and properly configured on the server.

Running the server is as simple as:

    npm run start

If you are going to develop however, that isn't the best way of running the server. If you are
touching several aspects (CSS, client, server) you will want to have several terminals open.

When developing the server code, you want to run:

    npm run watch-server

This will start a [nodemon][nodemon] instance that will monitor the changes you make to the *server*
code, and restart it for you.

When developing client code, you want to run:

    npm run watch

This will also use nodemon to monitor the CSS and JS/JSX to rebuild them as needed. Be warned that
the JS build can take a second or two, so if nothing changes because you reload too fast that's why.
You can `watch-js` and `watch-css` separately if you want to.

One of the issues with developing on one's box is that it is not typically accessible over the Web
for outside services to interact with. If you are trying to get events from repositories on GitHub,
you will need to expose yourself to the Web. You may already have your preferred way of doing that,
but in case you don't you can use [ngrok][ngrok] (which is what I do). In order to expose your
service through ngrok, just run

```bash
npm run expose # Or, if you don't have an ngrok paid plan:
node_modules/ngrok/bin/ngrok http 3043
```

Note that you don't need that for regular development, you only need to be exposed if you want to
receive GitHub events.

## Production deployment

You will want a slightly different `config.json`; the one in hatchery is serviceable.

You don't want to use `npm run` in production; instead use [pm2][pm2]. A configuration is provided
for it in `pm2-production.json` (it's what's used on hatchery).

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

This is a very straightforward access point to CouchDB, built atop the [cradle][cradle] library.
When ran directly it creates the DB and sets up the design documents; otherwise it's a library that
can be used to access the content of the DB.

Overall it could use some DRY love; a lot of its methods look very much like one another.

There is no specific handling of conflicts, they should just fail.

Object types are labelled with a `type` field, and the `id` field is used to know where to store
each object. The `type` field is what the design documents map on.


### `gh.js`

This library handles most of the interactions with GitHub, on top of the [octokat][octokat] library.
Most of these interactions are simple and linear.


### `log.js`

This is a simple wrapper that exposes an already-built instance of Winston, configured to log to the
console, file, or both. It's easy to add other logging targets if need be.


## Client Code Layout

### `app.css` and `css/fonts.css`

These are very simple CSS files. They are merged together (along with imported dependencies) and
stored under `public/css`. Therefore that's what their paths are relative to.

There is no magic and no framework. The complete built CSS is ~5K.

### `app.jsx`

This is the entry point for the JS application. Most of what it does is to import things and get
them set up.

The whole client JS is written in ES6, JSX, React. This can be surprising at first, but it is a
powerful combo.

The root `AshNazg` component listens for changes to the login state of the user (through the Login
store) in order to change the navigation bar that it controls. All it renders is basically: the
application title, a simple layout grid (that uses the [ungrid][ungrid] CSS approach), the
navigation bar, and an empty space for the routed component. It also renders the "flash" area that
shows messages for successful operations or errors.

Finally, the router is set up with a number of paths mapping to imported components.

### `components/*.jsx`

The JSX files under `components/` are simple, reusable components. At some point they should probably be extracted into a shared library that can be reused across W3C applications.

Most of them are extremely simple and largely there to keep the JSX readable, without having to rely
excessively on `div`s and classes.

#### `application.jsx`

A simple layout wrapper, with a title, that just renders its children. Used to render routed
components into.

#### `col.jsx` and `row.jsx`

Very simple row and column items that use ungrid. Nothing fancy.

#### `nav-box.jsx` and `nav-item.jsx`

Made to be used as a navigation column or as drop down menus, the boxes have titles that label a
navigation section, the items are basically just navigation entries.

#### `spinner.jsx`

This is a simple loading/progress spinner (that uses `img/spinner.svg`). If Chrome drops SMIL
support this will need to be replaced by something else. It understands the `prefix` option in order
to still work when the application is not running at the site's root (an improvement would be to
just inline the SVG).

It also accepts a `size="small"` property which renders it at half size.

#### `flash-list.jsx`

This just renders the list of success/error messages that are stored in the message store.

### `stores/*.js` and `actions/*.js`

One architectural approach that works well with React is known as Flux. At its heart it is a simple
idea to handle events and data in an application, in such a manner that avoids tangled-up messes.

The application (typically driven by the user) can trigger an **action**, usually with attached
data. An example from the code are error messages that can be emitted pretty much anywhere in the
application (ditto success messages).

Actions are all sent towards the **dispatcher** (which we reuse from the basic Flux implementation).
The dispatcher makes these available to whoever wants to listen. This is similar to pub/sub, except that an event's full trip is taken into consideration, and it only ever travels in one direction.

Stores listen to actions, and keep any data that the application might need handy (either locally or
by accessing it when needed). For the error/success messages, the store just keeps them around until
they are dismissed, which means that navigation across components will still render the messages in
the store.

Finally, components can listen to changes in stores, and react to them so as to update thei
rendering.

Overall, this application should make use of actions and stores a lot more. Developing it further
will likely require refactoring along those lines. One of the great things with React is that the
components are isolated in such a manner that you can follow bad practices inside of a given
component without damaging the rest of the application. Not that this is recommended, but it does
allow one to experiment with what a given component should do before refactoring it. I would not say
that the components in this application follow bad practices, but they could be refactored to use
stores and actions in order to be cleaner and more testable.

#### `actions/messages.js` and `actions/user.js`

These are actions. These modules can just be imported by any component that wishes to carry out such
actions, without having to know anything about whether or how the result gets stored, or how it
might influence the rest of the application (it's completely fire-and-forget).

The `messages.js` action module supports `error()` and `success()` messages, and can `dismiss()` a
given message. The `user.js` action module supports `login()` and `logout()` actions corresponding
to what the user does.

#### `stores/login.js` and `stores/message.js`

The `login` store keeps information about whether the user is logged in (and an administrator), and
handles the logging out when requested. The `message` store keeps a list of error and success
messages that haven't been dismissed.

### The `application/*.jsx` components

These are non-reusable components that are specific to this applications.

#### `welcome.jsx`

Just a static component with the welcome text; this is only a component because it's the simplest
way of encapsulating anything that may be rendered in the application area.

#### `login.jsx`

A very simple component that explains the login process and links to the OAuth processor.

#### `logout-button.jsx`

A button that can be used (and reused) anywhere (in our case, it's part of the navigation). When
clicked it dispatches a `logout` action.

#### `repo-list.jsx`

A simple component that fetches the list of repositories that are managed and lists them.

#### `repo-manager.jsx`

A more elaborate component that handles both creation and importing of repositories into the system.
It handles the dialog for create/import, including listing the organisations that the user has
access to and which groups a repository can be managed by.

All of the useful repository-management logic is on the server side, but this reacts to the results.

#### `pr/last-week.jsx`

The list of pull requests that were processed one way or another during the last week. This
component can also filter them dynamically by affiliation.

#### `pr/open.jsx`

The list of currently open PRs.

#### `pr/view.jsx`

The detailed view of a single PR, with various affordances to manage it.

#### `admin/users.jsx` and `admin/user-line.jsx`

The list of users known to the system, with some details and links to edit them. The `user-line`
component just renders one line in the list of users.

#### `admin/add-user.jsx`

A very simple dialog that can be used to add users with.

#### `admin/edit-user.jsx`

One of the more intricate parts of the system. Brings in data from GitHub, the W3C API, and the
system in order to bridge together various bits of information about the user, such as the groups
they belong to, their real name, their affiliation, their W3C and GitHub IDs, etc.

#### `admin/groups.jsx` and `admin/group-line.jsx`

Lists all the groups known to the W3C API, and makes it possible to add those that are not already
in the system. Each line in the table is rendered by `group-line.jsx`.

#### `admin/pick-user.jsx`

A very simple interface that links to `add-user` in order to add a user.

## Test suite

The [test suite](./test/) only deals with the server-side of the app.

It uses mocha as its test runner, [supertest][supertest] to test the responses from the various routes, and [nock][nock] to mock the third-party APIs the app relies on (Github API, W3C API).

To run the test suite, you need to have a running instance of couchdb, and initialize it with `node store.js "./test/config-test.json"`; if your couchdb requires a login/password for admin, you should add it to the `config-test.json` file as an entry of the form of:
```json
"couchAuth": {
    "username": "foo"
,   "password": "bar"
}
```

[CouchDB]: http://couchdb.apache.org/
[Express]: http://expressjs.com/
[Midgard]: https://github.com/w3c/midgard
[React]: https://facebook.github.io/react/docs/getting-started.html
[Flux]: http://facebook.github.io/flux/
[Browserify]: http://browserify.org/
[JSX]: https://facebook.github.io/react/docs/displaying-data.html
[cleancss]: https://github.com/jakubpawlowicz/clean-css
[nodemon]: https://github.com/remy/nodemon
[ngrok]: https://ngrok.com/
[pm2]: https://github.com/Unitech/pm2
[cradle]: https://github.com/flatiron/cradle
[Winston]: http://github.com/flatiron/winston
[ungrid]: http://chrisnager.github.io/ungrid/
[octokat]: https://github.com/philschatz/octokat.js/
[supertest]: https://github.com/visionmedia/supertest
[nock]: https://github.com/node-nock/nock
