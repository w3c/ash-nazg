
// this is where the express app goes
// 3043
var express = require("express")
,   winston = require("winston")
,   exwin = require("express-winston")
,   session = require("express-session")
,   FileStore = require("session-file-store")(session)
,   serveStatic = require("serve-static")
,   cookieParser = require("cookie-parser")
,   passport = require("passport")
,   GitHubStrategy = require("passport-github2").Strategy
,   jn = require("path").join
,   dataDir = jn(__dirname, "data")
,   app = express()
,   transports = []
,   config = require("./config.json")
,   version = require("./package.json").version
;

// XXX
// make this configurable so that console logging can be optional
transports.push(
    new (winston.transports.Console)({
            handleExceptions:                   true
        ,   colorize:                           true
        ,   maxsize:                            200000000
        ,   humanReadableUnhandledException:    true
    })
);
var log = new (winston.Logger)({ transports: transports });


// GitHub auth handling
passport.serializeUser(function (user, done) {
    // XXX
    // here, store the user into a DB
    log.info("serializeUser");
    console.log("Serialising USER", user);
    done(null, user);
});

passport.deserializeUser(function (obj, done) {
    // XXX
    // here, get the user by ID
    log.info("deserializeUser");
    console.log("Deserialising OBJ", obj);
    done(null, obj);
});

passport.use(
    new GitHubStrategy({
        clientID:       config.ghClientID
    ,   clientSecret:   config.ghClientSecret
    ,   callbackURL:    config.url + "auth/github/callback"
    }
,   function (accessToken, refreshToken, profile, done) {
        // XXX
        // here find GH user in our database and return that as `profile`
        log.info("cb for GitHubStrategy");
        console.log("auth from GH Strategy", accessToken, refreshToken, profile);
        return done(null, profile);
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
// function ensureAPIAuth (req, res, next) {
//     if (req.isAuthenticated()) { return next(); }
//     res.error(401).json({ error: "Authentication required." });
// }

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
                                    ,   redirect_uri:   redir
                                    }
            )(req, res, next);
        }
);

// XXX how to redirect to the page the user was on?
// XXX where do I get the OAuth token in here so I can reuse it? it's `accessToken`

// this is the callback that we get from GH
// if all worked according to plan, it has a ?back=http://... with the location we wish to redirect
// to. Given judicious usage of the History API this should return the client to a valid state
app.get(
        "/auth/github/callback"
    ,   function (req, res, next) {
            var redir = req.query.back;
            log.info("auth callback with redir=" + redir);
            passport.authenticate("github", { failureRedirect: redir + "?failure" })(req, res, next);
        }
    ,   function (req, res) {
            log.info("auth success, redir=" + req.query.back);
            res.redirect(req.query.back || "/");
        }
);

// This is the call to log the user out. Note that it is an *API* call.
app.get("/api/logout", function (req, res) {
    log.info("User logging out.");
    req.logout();
    res.json({ ok: true });
});


// handler for client-side routing
function showIndex (req, res) {
    res.sendFile(jn(__dirname, "public/index.html"));
}
app.get("/repo/*", showIndex);
app.get("/welcome", showIndex);


// run!
app.listen(config.serverPort, function (err) {
    if (err) return log.error(err);
    log.info("Ash-Nazg/" + version + " up and running.");
});

