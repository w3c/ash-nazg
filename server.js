
// this is where the express app goes
// 3043
var express = require("express")
,   exwin = require("express-winston")
,   session = require("express-session")
,   FileStore = require("session-file-store")(session)
,   serveStatic = require("serve-static")
,   bp = require("body-parser")
,   async = require("async")
,   fs = require("fs")
,   assign = require("object-assign")
,   passport = require("passport")
,   GitHubStrategy = require("passport-github2").Strategy
,   bl = require("bl")
,   w3c = require("node-w3capi")
,   jn = require("path").join
,   dataDir = jn(__dirname, "data")
,   GH = require("./gh")
,   app = express()
,   version = require("./package.json").version
,   nodemailer = require('nodemailer')
,    w3ciprcheck = require('./w3c-ipr')
;

var config, log, Store, store, mailer;

// HELPERS
// OK
function ok (res) {
    res.json({ ok: true });
}
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
        ok(res);
    };
}


// use this as middleware on any call that requires authentication
// this is for API use, not in the human URL space
// it passes if authentication has happened, otherwise it will return a 401
function ensureAPIAuth (req, res, next) {
    if (req.isAuthenticated()) return next();
    res.status(401).json({ error: "Authentication required." });
}

// same as above, but user has to be admin too
function ensureAdmin (req, res, next) {
    ensureAPIAuth(req, res, function () {
        if (!req.user.admin) res.status(403).json({ error: "Forbidden" });
        next();
    });
}

// load up the GH object
function loadGH (req, res, next) {
    req.gh = new GH(req.user);
    next();
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

// Express configuration
// static resources
app.use(serveStatic("public"));

var router = express.Router();

// GET this (not as an API), it will redirect the user to GitHub to authenticate
// use ?back=http://... for the URL to which to return later
router.get(
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
router.get(
        "/auth/github/callback"
    ,   function (req, res, next) {
            var redir = req.query.back;
            passport.authenticate("github", { failureRedirect: redir + "?failure" })(req, res, next);
        }
    ,   function (req, res) {
            log.info("GitHub auth success, redirecting to " + (req.query.back || "/"));
            res.redirect(req.query.back || "/");
        }
);

// This is the call to log the user out. Note that it is an *API* call.
router.get("/api/logout", function (req, res) {
    log.info("User logging out.");
    req.logout();
    ok(res);
});

// check if the user is logged in
router.get("/api/logged-in", function (req, res) {
    console.log({ ok: req.isAuthenticated(), admin: req.user ? req.user.admin : false });
    res.json({ ok: req.isAuthenticated(), admin: req.user ? req.user.admin : false });
});

// list all the users known to the system
router.get("/api/users", ensureAPIAuth, function (req, res) {
    store.users(makeRes(res));
});
// make user an admin
router.put("/api/user/:username/admin", ensureAdmin, function (req, res) {
    store.makeUserAdmin(req.params.username, makeOK(res));
});
// give user blanket okay for contributions
router.put("/api/user/:username/blanket", ensureAdmin, function (req, res) {
    store.giveUserBlanket(req.params.username, makeOK(res));
});
// get user data
router.get("/api/user/:username", ensureAPIAuth, function (req, res) {
    store.getUser(req.params.username, makeRes(res));
});
// set affiliation on user
router.post("/api/user/:username/affiliate", ensureAdmin, bp.json(), function (req, res) {
    store.mergeOnUser(req.params.username, {
            affiliation:        req.body.affiliation
        ,   affiliationName:    req.body.affiliationName
        ,   w3cid:              req.body.w3cid
        ,   w3capi:             req.body.w3capi
        ,   groups:             req.body.groups
        }
    ,   makeOK(res));
});
// add a user to the system without the user logging in
router.post("/api/user/:username/add", ensureAdmin, bp.json(), loadGH, function (req, res) {
    var username = req.params.username;
    store.getUser(username, function (err, user) {
        if (err && err.error !== "not_found") return error(res, err);
        if (user) return error(res, "User " + username + " is already in the system");
        req.gh.getUser(username, function (err, user) {
            store.addUser(user, makeRes(res));
        });
    });
});

// GROUPS
// list all the groups known to the system
router.get("/api/groups", function (req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    store.groups(makeRes(res));
});
// add a group to the list of those that the system knows about
router.post("/api/groups", ensureAPIAuth, bp.json(), function (req, res) {
    // group must specifiy: name, w3cid, groupType{CG, WG, IG}
    store.addGroup(req.body, makeOK(res));
});

// GITHUB APIs
router.get("/api/orgs", ensureAPIAuth, loadGH, function (req, res) {
    req.gh.userOrgs(makeRes(res));
});
// GITHUB APIs
router.get("/api/org-repos", ensureAPIAuth, loadGH, function (req, res) {
    req.gh.userOrgRepos(makeRes(res));
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
                req.gh[ghFunc](data, config, function (err, data) {
                    if (err) return error(res, err);
                    var repo = data.repo;
                    async.parallel(
                        [
                            function (cb) {
                                store.addSecret({ repo: repo.fullName, secret: repo.secret }, cb);
                            }
                        ,   function (cb) {
                                store.createOrUpdateToken({ owner: repo.owner, token: req.user.accessToken }, cb);
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
router.post("/api/create-repo", ensureAPIAuth, bp.json(), loadGH, makeCreateOrImportRepo("create"));
router.post("/api/import-repo", ensureAPIAuth, bp.json(), loadGH, makeCreateOrImportRepo("import"));
router.post("/api/repos/:owner/:shortname/edit", ensureAdmin, bp.json(), function(req, res) {
    store.updateRepo(req.params.owner + "/" + req.params.shortname, {groups: req.body.groups}, function(err, data) {
        if (err) return makeRes(res)(err);
        data.actions = ["Moved repository to groups with id " + req.body.groups.join(", ")];
        makeRes(res)(null, data);
    });
});

// GITHUB HOOKS
function parseMessage (msg) {
    var ret = {
        add:    []
    ,   remove: []
    ,   total:  0
    };
    msg.split(/[\n\r]+/)
        .forEach(function (line) {
            if (/^\+@[\w-_]+$/.test(line)) {
                ret.add.push(line.replace(/^\+@/, ""));
                ret.total++;
            }
            else if (/^-@[\w-_]+$/.test(line)) {
                ret.remove.push(line.replace(/^-@/, ""));
                ret.total++;
            }
        })
    ;
    return ret;
}
function prStatus (pr, delta, cb) {
    var prString = pr.owner + "/" + pr.shortName + "/" + pr.num
    ,   statusData = {
            owner:      pr.owner
        ,   shortName:  pr.shortName
        ,   sha:        pr.sha
        ,   payload:    {
                state:          "pending"
            ,   target_url:     config.url + "pr/id/" + prString
            ,   description:    "PR is being assessed, results will come shortly."
            ,   context:        "ipr"
            }
        }
    ;
    log.info("Setting status for PR " + prString);
    store.getRepo(pr.fullName, function (err, repo) {
        if (err) return cb(err);
        if (!repo) return cb("Unknown repository: " + pr.fullName);
        var repoGroups = repo.groups;
        store.getToken(repo.owner, function (err, token) {
            if (err) return cb(err);
            if (!token) return cb("Token not found for: " + repo.owner);
            var gh = new GH({ accessToken: token.token });
            log.info("Setting pending status on " + prString);
            gh.status(
                statusData
            ,   function (err) {
                    if (err) return cb(err);
                    var contrib = {};
                    log.info("Finding deltas for " + prString);
                    pr.contributors.forEach(function (c) { contrib[c] = true; });
                    delta.add.forEach(function (c) { contrib[c] = true; });
                    delta.remove.forEach(function (c) { delete contrib[c]; });
                    pr.contributors = Object.keys(contrib);
                    pr.contribStatus = {};
                    pr.groups = repoGroups;
                    pr.affiliations = {};
                    if (pr.markedAsNonSubstantiveBy) {
                        pr.acceptable = "yes";
                        statusData.payload.state = "success";
                        statusData.payload.description = "PR deemed acceptable as non-substantive by @" + pr.markedAsNonSubstantiveBy + ".";
                        log.info("Setting status success for " + prString);
                        gh.status(
                            statusData
                            ,   function (err) {
                                if (err) return cb(err);
                                store.updatePR(pr.fullName, pr.num, pr, function (err) {
                                    cb(err, pr);
                                });
                            }
                        );
                        return;
                    }
                    log.info("Looking up users for " + prString);
                    async.map(
                        pr.contributors
                    ,   function (username, cb) {
                            store.getUser(username, function (err, user) {
                                if ((err && err.error === "not_found") || !user) {
                                    pr.contribStatus[username] = "unknown";
                                    return cb(null, "unknown");
                                }
                                if (err) return cb(err);
                                // TODO: check that this is appropriate
                                // and if so, replace by check of affiliation
                                // to staff
                                if (user.blanket) {
                                    pr.affiliations[user.affiliation] = user.affiliationName;
                                    pr.contribStatus[username] = "ok";
                                    return cb(null, "ok");
                                }
                                if (!user.w3capi) {
                                    pr.contribStatus[username] = "undetermined affiliation";
                                    return cb(null, "undetermined affiliation");
                                }
                                w3ciprcheck(w3c, user.w3capi, user.displayName, repoGroups, store, function(err, result) {
                                    if (err) return cb(err);
                                    var ok = result.ok;
                                    if (ok) {
                                        pr.affiliations[result.affiliation.id] = result.affiliation.name;
                                        pr.contribStatus[username] = "ok";
                                        return cb(null, "ok");
                                    } else {
                                        pr.contribStatus[username] = "not in group";
                                        return cb(null, "not in group");
                                    }
                                });
                            });
                        }
                    ,   function (err, results) {
                            if (err) return cb(err);
                            var good = results.every(function (st) { return st === "ok"; });
                            log.info("Got users for " + prString + " results good? " + good);
                            if (good) {
                                pr.acceptable = "yes";
                                pr.unknownUsers = [];
                                pr.outsideUsers = [];
                                statusData.payload.state = "success";
                                statusData.payload.description = "PR deemed acceptable.";
                                log.info("Setting status success for " + prString);
                                gh.status(
                                    statusData
                                ,   function (err) {
                                        if (err) return cb(err);
                                        store.updatePR(pr.fullName, pr.num, pr, function (err) {
                                            cb(err, pr);
                                        });
                                    }
                                );
                            }
                            else {
                                pr.acceptable = "no";
                                pr.unknownUsers = [];
                                pr.outsideUsers = [];
                                pr.unaffiliatedUsers = [];
                                for (var u in pr.contribStatus) {
                                    if (pr.contribStatus[u] === "unknown") pr.unknownUsers.push(u);
                                    if (pr.contribStatus[u] === "undetermined affiliation") pr.unaffiliatedUsers.push(u);
                                    if (pr.contribStatus[u] === "not in group") pr.outsideUsers.push(u);
                                }
                                var msg = "PR has contribution issues.";
                                if (pr.unknownUsers.length)
                                    msg += " The following users were unknown: " +
                                            pr.unknownUsers
                                                .map(function (u) { return "@" + u; })
                                                .join(", ") +
                                                ".";
                                if (pr.unaffiliatedUsers.length)
                                    msg += " The following users' affiliation could not be determined - please edit their profile to link it to their W3C account: " +
                                            pr.unaffiliatedUsers
                                                .map(function (u) { return "@" + u; })
                                                .join(", ") +
                                                ".";
                                if (pr.outsideUsers.length)
                                    msg += " The following users were not in the repository's groups: " +
                                            pr.outsideUsers
                                                .map(function (u) { return "@" + u; })
                                                .join(", ") +
                                                ".";
                                statusData.payload.state = "failure";
                                statusData.payload.description =  msg;
                                log.info("Setting status failure for " + prString + ", " + msg);
                                gh.status(
                                    statusData
                                ,   function (err) {
                                    if (err) return cb(err);
                                    notifyContacts(gh, pr, statusData, function(err) {
                                        if (err) return cb(err);
                                        store.updatePR(pr.fullName, pr.num, pr, function (err) {
                                            cb(err, pr);
                                        });
                                    });
                                }
                                );

                            }
                        }
                    );
                }
            );
        });
    });
}

function notifyContacts(gh, pr, status, cb) {
    var staff = gh.getRepoContacts(pr.fullName, function(err, emails) {
        if (err) return cb(err);
        var actualEmails = emails.filter(function(e) { return e !== null;});
        if (!actualEmails.length) {
            return cb(new Error("Could not retrieve email addresses from repos contacts"));
        }
        mailer.sendMail({
            from: config.notifyFrom,
            to: actualEmails.join(","),
            subject: "IPR check failed for PR #" + pr.num+ " on " + pr.fullName,
            text: status.payload.description + "\n\n See " + status.payload.target_url
        }, cb);
    });
}

function addGHHook(app, path) {
    app.post("/" + path, function (req, res) {
        // we can't use bp.json(), that'll wreck secret checking by consuming the buffer
        // first, req.pipe(bl(function (err, data))) to save the buffer
        req.pipe(bl(function (err, buffer) {
            if (err) return error(res, err);
            // get us some JSON
            var event;
            try { event = JSON.parse(buffer.toString()); }
            catch (e) { return error(res, e); }
        
            // run checks before getting the secret to check the crypto
            var eventType = req.headers["x-github-event"];
            log.info("Hook got GH event " + eventType);
            // we only care about these events, and for issue_comment we only care about those on PRs
            if (eventType !== "pull_request" && eventType !== "issue_comment") return ok(res);
            if (eventType === "issue_comment" && !event.issue.pull_request) return ok(res);

            var owner = event.repository.owner.login
            ,   repo = event.repository.full_name
            ;
            store.getSecret(repo, function (err, data) {
                // if there's an error, we can't set an error on the status because we have no secret, so bail
                if (err || !data) return error(res, "Secret not found: " + (err || "simply not there."));
            
                // we have the secret, crypto check becomes possible
                var ourSig = GH.signPayload("sha1", data.secret, buffer)
                ,   theirSig = req.headers["x-hub-signature"]
                ;
                if (ourSig !== theirSig) return error(res, "GitHub signature does not match known secret.");

                // for status we need: owner, repoShort, and sha
                var repoShort = event.repository.name
                ,   prNum = (eventType === "pull_request") ? event.number : event.issue.number
                ;
            
                // pull request events
                if (eventType === "pull_request") {
                    var sha = event.pull_request.head.sha;

                    //  if event.action === "closed" we have to store the new head SHA in
                    //  the DB, but other than that we can ignore it
                    if (event.action === "closed") {
                        return store.updatePR(
                                repo
                            ,   prNum
                            ,   {
                                    status:     "closed"
                                ,   sha:        sha
                                }
                            ,   makeOK(res)
                        );
                    //  if event.action === "synchronize" we have to store the new head SHA in
                    //  the DB, and re-send the pr status to github based on stored data
                    } else if (event.action === "synchronize") {
                        return store.getPR(repo, prNum, function (err, storedpr) {
                            if (err || !storedpr) return error(res, (err || "PR not found: " + repo + "-" + prNum));
                            storedpr.sha = sha;
                            prStatus(storedpr, parseMessage(""), makeOK(res));
                        });
                    }
                    var pr = {
                            fullName:       repo
                        ,   shortName:      repoShort
                        ,   owner:          owner
                        ,   num:            prNum
                        ,   sha:            sha
                        ,   status:         "open"
                        ,   acceptable:     "pending"
                        ,   unknownUsers:   []
                        ,   outsideUsers:   []
                        ,   contributors:   [event.pull_request.user.login]
                        ,   contribStatus:  {}
                        }
                    ,   delta = parseMessage(event.pull_request.body)
                    ;
                    store.addPR(pr, function (err) {
                        if (err) return error(res, err);
                        prStatus(pr, delta, makeOK(res));
                    });
                }
                // issue comment events
                else if (eventType === "issue_comment") {
                    var delta = parseMessage(event.comment.body);
                    if (!delta.total) return ok(res);
                    store.getPR(repo, prNum, function (err, pr) {
                        if (err || !pr) return error(res, (err || "PR not found: " + repo + "-" + prNum));
                        prStatus(pr, delta, makeOK(res));
                    });
                }
            });
        }));
    });
}

// get a given PR
router.get("/api/pr/:owner/:shortName/:num", bp.json(), function (req, res) {
    var prms = req.params;
    store.getPR(prms.owner + "/" + prms.shortName, prms.num, makeRes(res));
});
// revalidate a PR
router.get("/api/pr/:owner/:shortName/:num/revalidate", ensureAdmin, function (req, res) {
    var prms = req.params
    ,   delta = parseMessage("") // this gets us a valid delta object, even if it has nothing
    ;
    log.info("Revalidating " + prms.owner + "/" + prms.shortName + "/pulls/" + prms.num);
    store.getPR(prms.owner + "/" + prms.shortName, prms.num, function (err, pr) {
        if (err || !pr) return error(res, (err || "PR not found: " + prms.owner + "/" + prms.shortName + "/pulls/" + prms.num));
        prStatus(pr, delta, makeRes(res));
    });
});
// Mark a PR as non substantive
router.post("/api/pr/:owner/:shortName/:num/markAsNonSubstantive", ensureAPIAuth, loadGH, function (req, res) {
    var prms = req.params
    ,   delta = parseMessage("") // this gets us a valid delta object, even if it has nothing
    ;
    log.info("Marking " + prms.owner + "/" + prms.shortName + "/pulls/" + prms.num + " as non substantive");
    store.getPR(prms.owner + "/" + prms.shortName, prms.num, function (err, pr) {
        if (err || !pr) return error(res, (err || "PR not found: " + prms.owner + "/" + prms.shortName + "/pulls/" + prms.num));
        store.updatePR(pr.fullName, pr.num, {markedAsNonSubstantiveBy: req.user.username}, function (err) {
            if (err) return error(res, err);
            store.getPR(pr.fullName, pr.num, function(err, updatedPR) {
                if (err || !updatedPR) return error(res, (err || "PR not found: " + pr.fullName + "/pulls/" + pr.num));
                prStatus(updatedPR, delta, function(err, pr) {
                    pr.comment = "Marked as non-substantive for IPR from ash-nazg.";
                    req.gh.commentOnPR(pr, function(err, comment) {
                        makeRes(res)(err, pr);
                    });
                });
            });
        });
    });
});
// list open PRs
router.get("/api/pr/open", function (req, res) {
    store.getOpenPRs(makeRes(res));
});
// list PRs from last week
router.get("/api/pr/last-week", function (req, res) {
    store.getLastWeekPRs(makeRes(res));
});
// list repos
router.get("/api/repos", function (req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    var groups = {};
    store.repos(function (err, docs) {
        if (err) return error(res, err);
        docs.forEach(function (doc) {
            doc.groups.forEach(function (g) {
                groups[g] = true;
            });
        });
        async.each(
            Object.keys(groups)
        ,   function (g, cb) {
                store.getGroup(g, function (err, doc) {
                    if (err) return cb(err);
                    groups[g] = doc;
                    cb();
                });
            }
        ,   function (err) {
                if (err) return error(res, err);
                docs.forEach(function (doc) {
                    doc.groups.forEach(function (g, idx) {
                        doc.groups[idx] = groups[g];
                    });
                });
                res.json(docs);
            }
        );
    });
});
// router.del("/api/repo/:owner/:name", ensureAdmin, function (req, res) {
//     // delete repo
//     // remove hook
// });


// W3C APIs
// given the issues with paging and irregularities in the W3C API, it has been wrapped up in
// an easy to use library that is meant to be used on the server side
// therefore, the client never contacts the W3C API directly, but instead hits these endpoints
router.get("/api/w3c/groups", function (req, res) {
    // these require the embedded data
    w3c.groups().fetch({ embed: true }, makeRes(res));
});
router.get("/api/w3c/group/:group", function (req, res) {
    w3c.group(req.params.group).fetch(makeRes(res));
});
router.get("/api/w3c/group/:group/users", function (req, res) {
    w3c.group(req.params.group).users().fetch(makeRes(res));
});
router.get("/api/w3c/user/:user", function (req, res) {
    w3c.user(req.params.user).fetch(makeRes(res));
});
router.get("/api/w3c/user/:user/affiliations", function (req, res) {
    w3c.user(req.params.user).affiliations().fetch(makeRes(res));
});


function addClientSideRoutes(app, prefix) {
    // handler for client-side routing
    var indexHTML = fs.readFileSync(jn(__dirname, "templates/app.html"), "utf8")
                        .replace(/\{\{pathPrefix\}\}/g, prefix);
    function showIndex (req, res) {
        res.send(indexHTML);
    }
    app.get("/", showIndex);
    app.get("/repo/*", showIndex);
    app.get("/repos", showIndex);
    app.get("/admin/*", showIndex);
    app.get("/pr/*", showIndex);
}

// run!
function run(configuration, configuredmailer) {
    config = configuration;
    log = require("./log")(config);

    Store = require("./store");

    store = new Store(config);

    mailer = configuredmailer;

    // set up the W3C API so that it works
    w3c.apiKey = config.w3cAPIKey;

    // logging
    app.use(exwin.logger({
        winstonInstance:    log
    ,   expressFormat:      true
    }));


    // sessions
    app.use(session({
        store:              new FileStore({
                                    path:   jn(dataDir, "sessions")
                                ,   ttl:    60 * 60 * 24 * 7
                            })
    ,   cookie:             { maxAge: 1000 * 60 * 60 * 24 * 365 , sameSite: "lax"}
    ,   name:               "ash-nazg"
    ,   resave:             false
    ,   rolling:            true
    ,   saveUninitialized:  false
    ,   secret:             config.sessionSecret
    }));

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

    // GH auth init
    app.use(passport.initialize());
    app.use(passport.session());
    app.use(router);
    addGHHook(app, config.hookPath);
    addClientSideRoutes(app, config.urlPathPrefix);
    return app.listen(config.serverPort, function (err) {
        if (err) return log.error(err);
        log.info("Ash-Nazg/" + version + " up and running.");
    });
}

module.exports.run = run;
module.exports.app = app;

if (require.main === module) {
    var sendmailTransport = require('nodemailer-sendmail-transport');
    var transporter = nodemailer.createTransport(sendmailTransport())
    run(require("./config.json"), transporter);
}
