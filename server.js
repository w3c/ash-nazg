
// this is where the express app goes

const doAsync = require("doasync");

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
,   PRChecker = require('./pr-check')
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
        if (!req.user.admin) return res.status(403).json({ error: "Forbidden" });
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
                                            ,   "read:org"
                                            ]
                                    ,   callbackURL:    redir
                                    }
            )(req, res, next);
        }
);

// Login page for admin (requires more permission to add webhooks)
router.get(
        "/admin/auth/github"
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
    res.json({ ok: req.isAuthenticated(), login: req.user ? req.user.username : null, admin: req.user ? req.user.admin : false });
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

// log the last repo a user added to the system (to simplify UI)
router.get("/api/my/last-added-repo", ensureAPIAuth, function (req, res) {
    store.getUser(req.user.username, (err, user) => {
        if (err) return error(res, err);
        return makeRes(res)(null, user.lastAddedRepo || {});
    });
});
router.post("/api/my/last-added-repo", ensureAPIAuth, bp.json(), function (req, res) {
    store.mergeOnUser(req.user.username, {
            lastAddedRepo:      req.body
        }
    ,   makeOK(res));
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
                                // We only set the token if the user is admin of the org
                                req.gh.isAdmin(req.user.username, repo.owner, function(err, isAdmin) {
                                    if (err) return cb(err);
                                    if (isAdmin) {
                                        return store.createOrUpdateToken({ owner: repo.owner, token: req.user.accessToken, from: req.user.username }, cb);
                                    } else {
                                      // If there is no token for this org
                                      // we send back an error
                                      store.getToken(repo.owner, (err, token) => {
                                        if ((err && err.error === "not_found") || !token) return cb({message: "This is the first repo imported in the " + repo.owner + " github account, it needs to be done by an owner of the organization"});
                                        if (err) return cb(err);
                                        cb(null);
                                      });
                                    }
                                });
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

// Endpoint of W3C Webhook
router.post("/api/revalidate", bp.json(), async (req, res) => {
  // Find pull requests with matching account
  log.info("Received hook payload on revalidate endpoint");
  log.info(JSON.stringify(req.body, null, 2));

  if (!req.body || !req.body.event) {
    return error(res, "Invalid request sent to revalidate endpoint");
  }

  let getPRs;
  if (req.body.event === "connected_account.created" && req.body.account && req.body.account.nickname) {  // new connected account
    if (!req.body.account.service === "github") {
      return res.json({msg: "Ignoring updates to accounts other than github"});
    }
    getPRs = new Promise((res, rej) => store.getUnaffiliatedUserPRs(req.body.account.nickname, (err, prs) => {
      if (err) return rej(err);
      log.info("Found unaffiliated contributors for PRs " + JSON.stringify(prs, null, 2));
      return res(prs);
    }));
  } else if (req.body.event === "group.participant_joined" && req.body.group && req.body.group.id) {  // new group participant
    let githubAccount = req.body.user  && req.body.user["connected-accounts"] ? req.body.user["connected-accounts"].find(a => a.service === "github") : undefined;
    if (!githubAccount || !githubAccount.nickname) {
      return res.json({msg: "Ignoring participations when there's no connected account"});
    }

    getPRs = new Promise((res, rej) => store.getOutsideUserPRs(req.body.user["connected-accounts"][0]["nickname"], (err, prs) => {
      if (err) return rej(err);
      const groupPRs = prs.filter(pr => pr.groups ? pr.groups.includes(req.body.group.id.toString()) : false);
      log.info("Found contributors for group PRs " + JSON.stringify(groupPRs, null, 2));
      return res(groupPRs);
    }));
  } else {
    return error(res, "Invalid request sent to revalidate endpoint");
  }

  try {
    const prs = await getPRs;
    // revalidate them
    const delta = parseMessage(""); // this gets us a valid delta object, even if it has nothing
    for (let pr of prs) {
      if (pr.acceptable === "no" && pr.status === "open") {
        log.info("Revalidating " + pr._id);
        await new Promise((res, rej) => prChecker.validate(pr, delta, (err) => {
          if (err) return rej(err);
          return res();
        }));
      }
    }
    res.json({msg: "OK"});
  } catch (e) {
    return error(res, e);
  }
});

// GITHUB APIs
router.post("/api/create-repo", ensureAPIAuth, bp.json(), loadGH, makeCreateOrImportRepo("create"));
router.post("/api/import-repo", ensureAPIAuth, bp.json(), loadGH, makeCreateOrImportRepo("import"));
router.post("/api/repos/:owner/:shortname/edit", ensureAdmin, bp.json(), function(req, res) {
    store.updateRepo(req.params.owner + "/" + req.params.shortname, {groups: req.body.groups}, function(err, data) {
        if (err) return makeRes(res)(err);
        data.actions = ["Moved repository to groups with id " + req.body.groups.join(", ")];
        makeRes(res)(null, data);
    });
});

// get the permissions granted by the user
router.get("/api/scope-granted", function (req, res) {
      if (req.user) {
          const gh = new GH(req.user);
          gh.getUser(req.user.username, function(err, user) {
              res.json(user ? { scopes: user.scopes } : {});
          });
      } else {
          res.json({ scopes: "" });
      }
});

// GITHUB HOOKS
function parseMessage (msg) {
    var ret = {
        add:    []
    ,   remove: []
    ,   total:  0
    };
    (msg || "").split(/[\n\r]+/)
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

function addGHHook(app, path) {
    app.post("/" + path, function (req, res) {
        // we can't use bp.json(), that'll wreck secret checking by consuming the buffer
        // first, req.pipe(bl(function (err, data))) to save the buffer
        req.pipe(bl(async function (err, buffer) {
            if (err) return error(res, err);
            // get us some JSON
            var event;
            try { event = JSON.parse(buffer.toString()); }
            catch (e) { return error(res, e); }

            // run checks before getting the secret to check the crypto
            var eventType = req.headers["x-github-event"];
            log.info("Hook got GH event " + eventType);
            // we only care about PRs, issue comments on PR and repository
            if (!["pull_request", "issue_comment", "repository"].includes(eventType)
                || (eventType === "issue_comment" && !event.issue.pull_request)) {
                return ok(res);
            }

            const owner = event.repository.owner.login
            ,     repo = event.repository.full_name
            ,     repoShortname = event.repository.name
            ,     repoId = event.repository.id
            ;

            // for repository, action is needed only for renames and transfers
            if (eventType === "repository") {
                let previousRepo;
                if (event.action === "renamed") {
                    previousRepo = `${owner}/${event.changes.repository.name.from}`;
                } else if (event.action === "transferred") {
                    previousRepo = `${event.changes.owner.from.user.login}/${repoShortname}`;
                } else {
                    return ok(res);
                }
                log.info(`Repository ${event.action} from ${previousRepo} to ${repo}`);

                // update secret, repository and all associated PRs
                await doAsync(store).updateSecret(previousRepo, {repo: repo});
                await doAsync(store).updateRepo(previousRepo, {name: repoShortname, fullName: repo, owner});
                store.getPRsByRepo(previousRepo, async function(err, prs) {
                    if (err) {
                        return error(res, `Error fetching PRs from the repository: ${previousRepo}`);
                    }
                    for (const pr of prs) {
                        await doAsync(store).updatePR(pr.fullName, pr.num, {fullName: repo, shortName: repoShortname, owner});
                    }
                    return ok(res);
                });
            } else {
                const statusData = {
                        owner,
                        shortName: repoShortname,
                        payload: {
                            state: "failure",
                            target_url: `${config.url}pr/id/${owner}/${repoShortname}/${event.number}`,
                            context: "ipr"
                        }
                    }
                ;
                if (event.pull_request && event.pull_request.head && event.pull_request.head.sha) {
                    statusData.sha = event.pull_request.head.sha;
                }
                store.getSecret(repo, async function (err, data) {
                    const { token } = await doAsync(store).getToken(owner)
                    ,     gh = new GH({ accessToken: token });
                    if (err || !data) {
                        try {
                            statusData.payload.description = `The repository manager doesn't know the following repository: ${repo}`;
                            gh.status(statusData, err => {
                                if (err) {
                                    console.log(err);
                                    log.error(err);
                                }
                            });
                        } catch (e) {
                            log.error(`Token not found for ${owner}`);
                        }
                        return error(res, "Secret for " + repo + " not found: " + (err || "simply not there."));
                    }

                    // we have the secret, crypto check becomes possible
                    if (!GH.checkPayloadSignature("sha256", data.secret, buffer, req.headers["x-hub-signature-256"])) {
                        statusData.payload.description = `GitHub signature does not match known secret for ${repo}.`;
                        gh.status(statusData, err => {
                            if (err) {
                                console.log(err);
                                log.error(err);
                            }
                        });
                        return error(res, `GitHub signature does not match known secret for ${repo}.`);
                    }

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
                                prChecker.validate(storedpr, parseMessage(""), makeOK(res));
                            });
                        } else if (event.action === "opened" || event.action === "reopened") {
                            var pr = {
                                    fullName:       repo
                                ,   repoId:         repoId
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
                                prChecker.validate(pr, delta, makeOK(res));
                            });
                        } else {
                            // we ignore other pull request events
                            return ok(res);
                        }
                    }
                    // issue comment events
                    else if (eventType === "issue_comment") {
                        var delta = parseMessage(event.comment.body);
                        if (!delta.total) return ok(res);
                        store.getPR(repo, prNum, function (err, pr) {
                            if (err || !pr) return error(res, (err || "PR not found: " + repo + "-" + prNum));
                            prChecker.validate(pr, delta, makeOK(res));
                        });
                    }
                });
            }
        }));
    });
}

// get a given PR
router.get("/api/pr/:owner/:shortName/:num", bp.json(), function (req, res) {
    var prms = req.params;
    store.getPR(prms.owner + "/" + prms.shortName, prms.num, function(err, pr) {
        if (err || !pr) return makeRes(res)(err  || "PR not found: " + prms.owner + "/" + prms.shortName + "-" + prms.num);
        async.map(pr.groups,
                  function(groupid, cb) {
                      store.getGroup(groupid, cb)
                  },
                  function (err, results) {
                      if (err) return makeRes(res)(err);
                      pr.groupDetails = results;
                      makeRes(res)(null, pr);
                  });
    });
});
// revalidate a PR
router.post("/api/pr/:owner/:shortName/:num/revalidate", ensureAPIAuth, function (req, res) {
    var prms = req.params
    ,   delta = parseMessage("") // this gets us a valid delta object, even if it has nothing
    ;
    log.info("Revalidating " + prms.owner + "/" + prms.shortName + "/pulls/" + prms.num);

    store.getPR(prms.owner + "/" + prms.shortName, prms.num, function (err, pr) {
        if (err || !pr) return error(res, (err || "PR not found: " + prms.owner + "/" + prms.shortName + "/pulls/" + prms.num));
        prChecker.validate(pr, delta, makeOK(res));
    });
});
// Mark a PR as non substantive
router.post("/api/pr/:owner/:shortName/:num/markAs(|Non)Substantive", ensureAPIAuth, loadGH, function (req, res) {
    var prms = req.params
    ,   delta = parseMessage("") // this gets us a valid delta object, even if it has nothing
    ,   qualifier = prms[0].toLowerCase() // "" or "non" depending on the path
    ;
    log.info("Marking " + prms.owner + "/" + prms.shortName + "/pulls/" + prms.num + " as " + qualifier + " substantive");
    store.getPR(prms.owner + "/" + prms.shortName, prms.num, function (err, pr) {
        if (err || !pr) return error(res, (err || "PR not found: " + prms.owner + "/" + prms.shortName + "/pulls/" + prms.num));
        store.updatePR(pr.fullName, pr.num, {markedAsNonSubstantiveBy: qualifier == "non" ? req.user.username : null}, function (err) {
            if (err) return error(res, err);
            store.getPR(pr.fullName, pr.num, function(err, updatedPR) {
                if (err || !updatedPR) return error(res, (err || "PR not found: " + pr.fullName + "/pulls/" + pr.num));
                prChecker.validate(updatedPR, delta, function(err, pr) {
                    if (err) return error(res, err);
                    pr.comment = `[${req.user.username}](https://github.com/${req.user.username}) marked as ${qualifier} substantive for IPR from ash-nazg.`;
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

// list the group the current user is team contact of
router.get("/api/team-contact-of", ensureAPIAuth, function (req, res) {
    let username = req.user.username;
    store.getUser(username, function (err, user) {
        if (err) {
            return makeRes(res)(err);
        }
        if (!user.w3capi) {
            return error(res, err);
        }
        w3c.user(user.w3capi).teamcontactofgroups().fetch(function(err, teamcontactof) {
            if (err || teamcontactof[0] === undefined) {
                return error(res, err);
            }
            return makeRes(res)(null, teamcontactof);
        });

    });
});

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


function addClientSideRoutes(app) {
    // handler for client-side routing
    var indexHTML = fs.readFileSync(jn(__dirname, "templates/app.html"), "utf8");
    function showIndex (req, res) {
        res.send(indexHTML);
    }
    app.get("/", showIndex);
    app.get("/login", showIndex);
    app.get("/repo/*", showIndex);
    app.get("/repos", showIndex);
    app.get("/admin/*", ensureAdmin, showIndex);
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

    prChecker = new PRChecker(config, log, store, GH, mailer);

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
    addClientSideRoutes(app);
    return app.listen(config.serverPort, function (err) {
        if (err) return log.error(err);
        log.info("Ash-Nazg/" + version + " up and running.");
    });
}

module.exports.run = run;
module.exports.app = app;

if (require.main === module) {
    // FIXME abstract into configuration the mailer parameters
    var transporter = nodemailer.createTransport({sendmail: true, path: '/usr/sbin/sendmail', tls: {rejectUnauthorized: false}});
    run(require("./config.json"), transporter);
}
