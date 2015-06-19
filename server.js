
// this is where the express app goes
// 3043
var express = require("express")
,   exwin = require("express-winston")
,   session = require("express-session")
,   FileStore = require("session-file-store")(session)
,   serveStatic = require("serve-static")
,   cookieParser = require("cookie-parser")
,   bp = require("body-parser")
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


// use this as middleware on any call that requires authentication
// this is for API use, not in the human URL space
// it passes if authentication has happened, otherwise it will return a 401
function ensureAPIAuth (req, res, next) {
    if (req.isAuthenticated()) return next();
    res.error(401).json({ error: "Authentication required." });
}

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
    res.json({ ok: req.isAuthenticated() });
});

// GITHUB APIs
function loadGH (req, res, next) {
    req.gh = new GH(req.user);
    next();
}
app.get("/api/orgs", ensureAPIAuth, loadGH, function (req, res) {
    req.gh.userOrgs(function (err, data) {
        if (err) return res.status(500).json({ error: err });
        res.json(data);
    });
});
app.post("/api/create-repo", ensureAPIAuth, bp.json(), loadGH, function (req, res) {
    req.gh.createRepo(req.body, function (err, data) {
        if (err) return res.status(500).json({ error: err });
        // XXX if this is successful, we need to add the repo to the store
        // notify a list by email of the creation
        // how does a repo get associated with a group?
        res.json(data);
    });
});

// handler for client-side routing
function showIndex (req, res) {
    res.sendFile(jn(__dirname, "public/index.html"));
}
app.get("/repo/*", showIndex);


// run!
app.listen(config.serverPort, function (err) {
    if (err) return log.error(err);
    log.info("Ash-Nazg/" + version + " up and running.");
});

