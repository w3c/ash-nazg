
// this is where the express app goes
// 3043
var express = require("express")
,   exwin = require("express-winston")
,   session = require("express-session")
,   FileStore = require("session-file-store")(session)
,   serveStatic = require("serve-static")
,   cookieParser = require("cookie-parser")
,   bp = require("body-parser")
,   async = require("async")
,   assign = require("object-assign")
,   passport = require("passport")
,   GitHubStrategy = require("passport-github2").Strategy
,   jn = require("path").join
,   dataDir = jn(__dirname, "data")
,   log = require("./log")
,   GH = require("./gh")
,   Store = require("./store")
,   store = new Store()
,   app = express()
,   config = require("./config.json")
,   version = require("./package.json").version
;

// HELPERS
// all errors
function error (res, err) {
    log.error(err);
    res.status(500).json({ error: err });
}
// the handler for everything that might error, or might send data
function makeRes (res) {
    return function (err, data) {
        if (err) return error(res, err);
        res.json(data);
    };
}
// a handler for when the response is just ok
function makeOK (res) {
    return function (err) {
        if (err) return error(res, err);
        res.json({ ok: true });
    };
}


// use this as middleware on any call that requires authentication
// this is for API use, not in the human URL space
// it passes if authentication has happened, otherwise it will return a 401
function ensureAPIAuth (req, res, next) {
    if (req.isAuthenticated()) return next();
    res.error(401).json({ error: "Authentication required." });
}

// same as above, but user has to be admin too
function ensureAdmin (req, res, next) {
    ensureAPIAuth(req, res, function () {
        if (!req.user.admin) res.error(403).json({ error: "Forbidden" });
        next();
    });
}

// passport uses this when a user is create to decide what we want to write into the session
// in our case we need nothing more than the username with which to retrieve it later
passport.serializeUser(function (profile, done) {
    done(null, profile.username);
});

// this is the reverse operation, our session contains the key we provided above and passport gives
// us that in order to have a user. We get it from the store of course.
passport.deserializeUser(function (id, done) {
    store.getUser(id, done);
});

passport.use(
    new GitHubStrategy({
        clientID:       config.ghClientID
    ,   clientSecret:   config.ghClientSecret
    ,   callbackURL:    config.url + "auth/github/callback"
    }
,   function (accessToken, refreshToken, profile, done) {
        log.info("Login attempt for user " + profile.username);
        // we have a user logging in, could be new, could be old, we add it to the store
        // but first we need to massage it a bit
        profile.ghID = profile.id;
        delete profile.id;
        delete profile._raw;
        var pics = profile.photos || []
        ,   json = profile._json
        ;
        if (json.avatar_url) pics.push({ value: json.avatar_url });
        profile.photos = pics;
        if (json.blog) profile.blog = json.blog;
        if (json.company) profile.company = json.company;
        delete profile._json;
        profile.accessToken = accessToken;
        profile.refreshToken = refreshToken;

        store.findOrCreateUser(profile, function (err) {
            if (err) return done(err);
            log.info("Login successful: " + profile.username);
            done(null, profile);
        });
    }
));

// Express configuration
app.use(cookieParser());
// sessions
app.use(session({
    store:              new FileStore({
                                path:   jn(dataDir, "sessions")
                            ,   ttl:    60 * 60 * 24 * 7
                        })
,   cookie:             { maxAge: 1000 * 60 * 60 * 24 * 365 }
,   name:               "ash-nazg"
,   resave:             false
,   rolling:            true
,   saveUninitialized:  false
,   secret:             config.sessionSecret
}));

// logging
app.use(exwin.logger({
    winstonInstance:    log
,   expressFormat:      true
}));

// GH auth init
app.use(passport.initialize());
app.use(passport.session());

// static resources
app.use(serveStatic("public"));

// GET this (not as an API), it will redirect the user to GitHub to authenticate
// use ?back=http://... for the URL to which to return later
app.get(
        "/auth/github"
    ,   function (req, res, next) {
            var redir = config.url + "auth/github/callback";
            if (req.query.back) redir += "?back=" + req.query.back;
            log.info("auth github, with redir=" + redir);
            passport.authenticate(
                                    "github"
                                ,   {
                                        // these are the permissions we request
                                        scope:  [
                                                "user:email"
                                            ,   "public_repo"
                                            ,   "write:repo_hook"
                                            ,   "read:org"
                                            ]
                                    ,   callbackURL:    redir
                                    }
            )(req, res, next);
        }
);

// this is the callback that we get from GH
// if all worked according to plan, it has a ?back=http://... with the location we wish to redirect
// to. Given judicious usage of the History API this should return the client to a valid state
app.get(
        "/auth/github/callback"
    ,   function (req, res, next) {
            var redir = req.query.back;
            passport.authenticate("github", { failureRedirect: redir + "?failure" })(req, res, next);
        }
    ,   function (req, res) {
            log.info("GitHub auth success");
            res.redirect(req.query.back || "/");
        }
);

// This is the call to log the user out. Note that it is an *API* call.
app.get("/api/logout", function (req, res) {
    log.info("User logging out.");
    req.logout();
    res.json({ ok: true });
});

// check if the user is logged in
app.get("/api/logged-in", function (req, res) {
    res.json({ ok: req.isAuthenticated(), admin: req.user ? req.user.admin : false });
});

// list all the users known to the system
app.get("/api/users", function (req, res) {
    store.users(makeRes(res));
});
// make user an admin
app.put("/api/user/:username/admin", ensureAdmin, function (req, res) {
    store.makeUserAdmin(req.params.username, makeOK(res));
});
// give user blanket okay for contributions
app.put("/api/user/:username/blanket", ensureAdmin, function (req, res) {
    store.giveUserBlanket(req.params.username, makeOK(res));
});
// get user data
app.get("/api/user/:username", function (req, res) {
    store.getUser(req.params.username, makeRes(res));
});
// set affiliation on user
app.post("/api/user/:username/affiliate", ensureAdmin, bp.json(), function (req, res) {
    store.mergeOnUser(req.params.username, {
            affiliation:        req.body.affiliation
        ,   affiliationName:    req.body.affiliationName
        ,   w3cid:              req.body.w3cid
        ,   w3capi:             req.body.w3capi
        ,   groups:             req.body.groups
        }
    ,   makeOK(res));
});


// GROUPS
// list all the groups known to the system
app.get("/api/groups", function (req, res) {
    store.groups(makeRes(res));
});
// add a group to the list of those that the system knows about
app.post("/api/groups", ensureAPIAuth, bp.json(), function (req, res) {
    // group must specifiy: name, w3cid, groupType{cg, wg, ig}
    store.addGroup(req.body, makeOK(res));
});

// GITHUB APIs
function loadGH (req, res, next) {
    req.gh = new GH(req.user);
    next();
}
app.get("/api/orgs", ensureAPIAuth, loadGH, function (req, res) {
    req.gh.userOrgs(makeRes(res));
});
function makeCreateOrImportRepo (mode) {
    var ghFunc = mode === "create" ? "createRepo" : "importRepo";
    return function (req, res) {
        // need to user the req.body.group to fetch the group from the list we manage
        // so that we can fill it out for createRepo
        var data = req.body;
        async.map(
            data.groups
        ,   function (g, cb) {
                store.getGroup(g, function (err, doc) {
                    if (err) return cb(err);
                    cb(null, doc);
                });
            }
        ,   function (err, allDocs) {
                if (err) return error(res, err);
                data.groups = allDocs;
                req.gh[ghFunc](data, function (err, data) {
                    if (err) return error(res, err);
                    var repo = data.repo;
                    async.parallel(
                        [
                            function (cb) {
                                store.addSecret({ owner: repo.owner, secret: repo.secret }, cb);
                            }
                        ,   function (cb) {
                                var secretLess = assign({}, repo);
                                delete secretLess.secret;
                                store.addRepo(secretLess, cb);
                            }
                        ]
                    ,   function (err) {
                            if (err) return error(res, err);
                            res.json({ actions: data.actions, repo: repo.fullName });
                        }
                    );
                });
            }
        );
    };
}
app.post("/api/create-repo", ensureAPIAuth, bp.json(), loadGH, makeCreateOrImportRepo("create"));
app.post("/api/import-repo", ensureAPIAuth, bp.json(), loadGH, makeCreateOrImportRepo("import"));

// handler for client-side routing
function showIndex (req, res) {
    res.sendFile(jn(__dirname, "public/index.html"));
}
app.get("/repo/*", showIndex);
app.get("/admin/*", showIndex);


// run!
app.listen(config.serverPort, function (err) {
    if (err) return log.error(err);
    log.info("Ash-Nazg/" + version + " up and running.");
});

