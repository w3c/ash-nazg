/* global emit */

// IMPORTANT:
// when this is ran directly, set up the DB
// otherwise just be a library that handles all storage

// XXX
// this could use some DRY love

var cradle = require("cradle")
,   async = require("async")
,   log
;

// helpers
function couchNow (d) {
    if (!d) d = new Date();
    return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(),
            d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()];
}

function Store (config) {
    var dbName = config.couchDB || "ash-nazg"
    ,   couchConf = {}
    ;
    log = require("./log")(config);
    if (config.couchAuth) couchConf.auth = config.couchAuth;
    if (config.couchDbPort) couchConf.port = config.couchDbPort;
    this.client = new cradle.Connection(couchConf);
    this.db = this.client.database(dbName);
    this._config = config;
    log.info("Connected to CouchDB, db=" + dbName);
}
Store.prototype = {
    // SETUP - this runs when this file is run directly
    setup:  function (cb) {
        // create DB if it doesn't exist
        this.db.exists(function (err, exists) {
            if (err) return cb(err);
            if (exists) return this.setupDDocs(cb);
            this.db.create(function (err) {
                if (err) return cb(err);
                this.setupDDocs(cb);
            }.bind(this));
        }.bind(this));
    }
,   setupDDocs: function (cb) {
        var ddocs = [
            // users
            {
                id:         "_design/users"
            ,   views:  {
                    by_username: {
                        map:    function (doc) {
                                    if (!doc.type || doc.type !== "user") return;
                                    emit(doc.username, doc);
                                }.toString()
                    }
                    // query this with group=true to get a list of companies
                ,   by_affiliation: {
                        map:    function (doc) {
                                    if (!doc.type || doc.type !== "user") return;
                                    emit(doc.affiliation, doc);
                                }.toString()
                    ,   reduce: function (/*keys, values*/) {
                            return true;
                        }.toString()
                    }
                }
            }

            // groups
        ,   {
                id:         "_design/groups"
            ,   views:  {
                    by_w3cid: {
                        map:    function (doc) {
                                    if (!doc.type || doc.type !== "group") return;
                                    emit(doc.w3cid + "", doc);
                                }.toString()
                    }
                ,   by_grouptype: {
                        map:    function (doc) {
                                    if (!doc.type || doc.type !== "group") return;
                                    emit(doc.groupType, doc);
                                }.toString()
                    }
                }
            }

            // secrets
        ,   {
                id:         "_design/secrets"
            ,   views:  {
                    by_repo: {
                        map:    function (doc) {
                                    if (!doc.type || doc.type !== "secret") return;
                                    emit(doc.repo, doc);
                                }.toString()
                    }
                }
            }

            // access tokens
        ,   {
                id:         "_design/tokens"
            ,   views:  {
                    by_owner: {
                        map:    function (doc) {
                                    if (!doc.type || doc.type !== "token") return;
                                    emit(doc.owner, doc);
                                }.toString()
                    }
                }
            }

            // repos
        ,   {
                id:         "_design/repos"
            ,   views:  {
                    by_fullname: {
                        map:    function (doc) {
                                    if (!doc.type || doc.type !== "repo") return;
                                    emit(doc.fullName, doc);
                                }.toString()
                    }
                }
            }

            // PRs
        ,   {
                id:         "_design/prs"
            ,   views:  {
                    by_fullname_num: {
                        map:    function (doc) {
                                    if (!doc.type || doc.type !== "pr") return;
                                    emit([doc.fullName, doc.num + ""], doc);
                                }.toString()
                    }
                ,   by_fullname: {
                        map:    function (doc) {
                                    if (!doc.type || doc.type !== "pr") return;
                                    emit(doc.fullName, doc);
                                }.toString()
                }
                ,   by_date: {
                        map:    function (doc) {
                                    if (!doc.type || doc.type !== "pr") return;
                                    emit(doc.lastUpdated, doc);
                                }.toString()
                }
                ,   by_status: {
                        map:    function (doc) {
                                    if (!doc.type || doc.type !== "pr") return;
                                    emit(doc.status, doc);
                                }.toString()
                    }
                ,   by_group: {
                        map:    function (doc) {
                                    if (!doc.type || doc.type !== "pr" || !doc.groups) return;
                                    doc.groups.forEach(function (g) {
                                        emit(g, doc);
                                    });
                                }.toString()
                    }
                ,   by_unaffiliated_contributor: {
                        map:    function (doc) {
                                    if (!doc.type || doc.type !== "pr" || !doc.unaffiliatedUsers) return;
                                    doc.unaffiliatedUsers.forEach(function (u) {
                                        emit(u, doc);
                                    });
                                }.toString()
                    }
                ,   by_outside_contributor: {
                        map:    function (doc) {
                                    if (!doc.type || doc.type !== "pr" || !doc.outsideUsers) return;
                                    doc.outsideUsers.forEach(function (u) {
                                        emit(u, doc);
                                    });
                                }.toString()
                    }
                ,   by_affiliation: {
                        map:    function (doc) {
                                    if (!doc.type || doc.type !== "pr" || !doc.affiliations) return;
                                    for (var k in doc.affiliations) emit(k, doc);
                                }.toString()
                    }
                }
            }
        ];
        async.each(
            ddocs
        ,   function (ddoc, cb) {
                this.update(ddoc, cb);
            }.bind(this)
        ,   cb
        );
    }

    // USERS
    // look for a user, creating one if it's not there
    // this is to be used when the user logs in using GH
,   findOrCreateUser:   function (profile, cb) {
        var store = this;
        store.getUser(profile.username, function (err, user) {
            if ((err && err.error === "not_found") || !user) return store.addUser(profile, cb);
            if (err) return cb(err);
            for (var k in profile) user[k] = profile[k];
            store.add(user, cb);
        });
    }
    // get a user by username
,   getUser:   function (username, cb) {
        var store = this;
        log.info("Looking for user " + username);
        store.db.view("users/by_username", { key: username }, function (err, docs) {
            if (err) return cb(err);
            log.info("Returning user " + username + ": " + (docs.length ? "FOUND" : "NOT FOUND"));
            cb(null, docs.length ? docs[0].value : null);
        });
    }
,   users:   function (cb) {
        var store = this;
        log.info("Listing users");
        store.db.view("users/by_username", function (err, docs) {
            if (err) return cb(err);
            log.info("Returning " + docs.length + "users");
            docs = docs.toArray().sort(function (a, b) {
                return (a.displayName || "").localeCompare(b.displayName);
            });
            cb(null, docs);
        });
    }
,   addUser:    function (profile, cb) {
        profile.id = "user-" + profile.username;
        profile.type = "user";
        profile.groups = profile.groups || {};
        if (!profile.accessToken) profile.accessToken = "";
        if (!profile.admin) profile.admin = false;
        if (!profile.affiliation) profile.affiliation = "";
        if (!profile.affiliationName) profile.affiliationName = "";
        if (!profile.blanket) profile.blanket = false;
        if (!profile.blog) profile.blog = "";
        if (!profile.displayName) profile.displayName = profile.username;
        if (!profile.ghID) profile.ghID = "";
        if (!profile.emails) profile.emails = [];
        if (!profile.photos) profile.photos = [];
        if (!profile.profileUrl) profile.profileUrl = "";
        if (!profile.provider) profile.provider = "";
        if (!profile.w3capi) profile.w3capi = null;
        if (!profile.w3cid) profile.w3cid = null;
        delete profile._rev; // don't use this to update users
        log.info("Adding user " + profile.username);
        this.add(profile, cb);
    }
,   makeUserAdmin:  function (username, cb) {
        this.getUser(username, function (err, doc) {
            if (err) return cb(err);
            doc.admin = true;
            this.add(doc, cb);
        }.bind(this));
        // this worked here but since it failed for mergeOnUser() I'm playing it safe instead
        // this.db.merge("user-" + username, { admin: true }, cb);
    }
,   giveUserBlanket:  function (username, cb) {
        this.getUser(username, function (err, doc) {
            if (err) return cb(err);
            doc.blanket = true;
            this.add(doc, cb);
        }.bind(this));
    }
,   mergeOnUser:  function (username, data, cb) {
        this.getUser(username, function (err, doc) {
            if (err) return cb(err);
            for (var k in data) doc[k] = data[k];
            this.add(doc, cb);
            // not sure why this doesn't work
            // this.db.merge("user-" + username, doc._rev, data, cb);
        }.bind(this));
    }
,   deleteUser:    function (username, cb) {
        this.getUser(username, function (err, doc) {
            if (err) return cb(err);
            this.remove(doc, cb);
        }.bind(this));
    }
    // GROUPS
,   addGroup:    function (group, cb) {
        group.id = "group-" + group.w3cid;
        group.type = "group";
        group.w3cid = group.w3cid + "";
        delete group._rev; // don't use this to update groups
        log.info("Adding group " + group.name);
        this.add(group, cb);
    }
    // get a group by w3cid
,   getGroup:   function (w3cid, cb) {
        var store = this;
        log.info("Looking for group " + w3cid);
        store.db.view("groups/by_w3cid", { key: w3cid }, function (err, docs) {
            if (err) return cb(err);
            log.info("Returning group " + w3cid + ": " + (docs.length ? "FOUND" : "NOT FOUND"));
            cb(null, docs.length ? docs[0].value : null);
        });
    }
,   groups:   function (cb) {
        var store = this;
        log.info("Getting all groups");
        store.db.view("groups/by_w3cid", function (err, docs) {
            if (err) return cb(err);
            log.info("Found " + docs.length + " groups");
            // sort them by name
            docs = docs.toArray().sort(function (a, b) {
                return (a.name || "").localeCompare(b.name);
            });
            cb(null, docs);
        });
    }
,   deleteGroup:    function (w3cid, cb) {
        this.getGroup(w3cid, function (err, doc) {
            if (err) return cb(err);
            if (!doc) return cb(new Error("Store: Can not find group " + w3cid + " for deletion"));
            this.remove(doc, cb);
        }.bind(this));
    }


    // SECRETS
,   addSecret:    function (secret, cb) {
        secret.id = "secret-" + secret.repo;
        secret.type = "secret";
        delete secret._rev; // don't use this to update secrets
        log.info("Adding secret " + secret.repo);
        this.add(secret, cb);
    }
    // get a secret by repo
,   getSecret:   function (repo, cb) {
        var store = this;
        log.info("Looking for secret for " + repo);
        store.db.view("secrets/by_repo", { key: repo }, function (err, docs) {
            if (err) return cb(err);
            log.info("Returning secret for " + repo + ": " + (docs.length ? "FOUND" : "NOT FOUND"));
            cb(null, docs.length ? docs[0].value : null);
        });
    }
,   deleteSecret:    function (repo, cb) {
        this.getSecret(repo, function (err, doc) {
            if (err) return cb(err);
            if (!doc) return cb(new Error("Store: Can not find secret of " + repo + " for deletion"));
            this.remove(doc, cb);
        }.bind(this));
    }
,   updateSecret:    function (repo, data, cb) {
        var store = this;
        this.getSecret(repo, function (err, doc) {
            if (err) return cb(err);
            if (!doc) return cb(new Error("Store: Can not find secret of " + repo + " to update"));
            for (var k in data) doc[k] = data[k];
            doc.lastUpdated = couchNow();
            log.info("Updating secret " + doc.repo);
            store.add(doc, cb);
        });

    }


    // TOKENS
,   addToken:    function (token, cb) {
        // the configuration file can list tokens that override those in the DB, in which case the
        // latter don't get stored
        if (this._config.tokens && this._config.tokens[token.owner]) return cb(null, this._config.tokens[token.owner]);
        token.id = "token-" + token.owner;
        token.type = "token";
        delete token._rev; // don't use this to update token
        log.info("Adding token " + token.owner);
        this.add(token, cb);
    }
,   createOrUpdateToken:    function (token, cb) {
        if (this._config.tokens && this._config.tokens[token.owner]) return cb(null, this._config.tokens[token.owner]);
        var store = this;
        store.getToken(token.owner, function (err, doc) {
            if ((err && err.error === "not_found") || !doc) return store.addToken(token, cb);
            if (err) return cb(err);
            for (var k in token) doc[k] = token[k];
            store.add(doc, cb);
        });
    }
    // get a token by owner
,   getToken:   function (owner, cb) {
        var store = this;
        log.info("Looking for token for " + owner);
        if (this._config.tokens && this._config.tokens[owner]) return cb(null, { owner: owner, token: this._config.tokens[owner] });
        store.db.view("tokens/by_owner", { key: owner }, function (err, docs) {
            if (err) return cb(err);
            log.info("Returning token for " + owner + ": " + (docs.length ? "FOUND" : "NOT FOUND"));
            cb(null, docs.length ? docs[0].value : null);
        });
    }
,   deleteToken:    function (owner, cb) {
        this.getToken(owner, function (err, doc) {
            if (err) return cb(err);
            if (!doc) return cb(new Error("Store: Can not find token of " + owner + " for deletion"));
            this.remove(doc, cb);
        }.bind(this));
    }


    // REPOS
,   addRepo:    function (repo, cb) {
        repo.id = "repo-" + repo.fullName;
        repo.type = "repo";
        delete repo._rev; // don't use this to update repos
        log.info("Adding repo " + repo.fullName);
        this.add(repo, cb);
    }
,   updateRepo:    function (fullName, data, cb) {
        this.getRepo(fullName, function(err, doc) {
            if (err) return cb(err);
            for (var k in data) doc[k] = data[k];
            doc.lastUpdated = couchNow();
            log.info("Updating repo " + doc.fullName);
            this.add(doc, cb);
        }.bind(this));
    }
    // get a repo by fullName (username/reponame)
,   getRepo:   function (fullName, cb) {
        var store = this;
        log.info("Looking for repo for " + fullName);
        store.db.view("repos/by_fullname", { key: fullName }, function (err, docs) {
            if (err) return cb(err);
            log.info("Returning repo for " + fullName + ": " + (docs.length ? "FOUND" : "NOT FOUND"));
            cb(null, docs.length ? docs[0].value : null);
        });
    }
,   repos:   function (cb) {
        var store = this;
        log.info("Getting all repos");
        store.db.view("repos/by_fullname", function (err, docs) {
            if (err) return cb(err);
            log.info("Found " + docs.length + " repos");
            // sort them by fullName
            docs = docs.toArray().sort(function (a, b) {
                return (a.fullName || "").localeCompare(b.fullName);
            });
            cb(null, docs);
        });
    }
,   deleteRepo:    function (fullName, cb) {
        this.getRepo(fullName, function (err, doc) {
            if (err) return cb(err);
            if (!doc) return cb(new Error("Store: Can not find repo " + fullName + " for deletion"));
            this.remove(doc, function(err) {
                this.deleteSecret(fullName, cb);
            }.bind(this));
        }.bind(this));
    }


    // PRs
,   addPR:    function (pr, cb) {
        pr.id = "pr-" + pr.fullName + "-" + pr.num;
        pr.type = "pr";
        pr.num = pr.num + "";
        pr.lastUpdated = couchNow();
        if (!pr.affiliations) pr.affiliations = {};
        delete pr._rev; // don't use this to update PRs
        log.info("Adding PR " + pr.fullName + "-" + pr.num);
        this.add(pr, cb);
    }
    // get a PR by fullName (username/reponame) and number
,   getPR:   function (fullName, num, cb) {
        log.info("Looking for PR for " + fullName + "-" + num);
        this.db.view("prs/by_fullname_num", { key: [fullName, num + ""] }, function (err, docs) {
            if (err) return cb(err);
            log.info("Returning PR for " + fullName + "-" + num + ": " + (docs.length ? "FOUND" : "NOT FOUND"));
            cb(null, docs.length ? docs[0].value : null);
        });
    }
,   getPRsByRepo:   function (fullName, cb) {
        log.info("Looking for PRs for " + fullName);
        this.db.view("prs/by_fullname", { key: fullName }, function (err, docs) {
            log.info("Returning PRs for " + fullName + ": " + (docs.length ? "FOUND" : "NOT FOUND"));
            cb(null, docs.toArray());
        });
    }
,   updatePR:  function (fullName, num, pr, cb) {
        this.getPR(fullName, num, function (err, doc) {
            if (err) {
                if (err.error === "not_found") doc = {};
                else return cb(err);
            }
            for (var k in pr) doc[k] = pr[k];
            doc.lastUpdated = couchNow();
            this.add(doc, cb);
        }.bind(this));
    }
,   getOpenPRs: function (cb) {
        log.info("Looking for open PRs");
        this.db.view("prs/by_status", { key: "open" }, function (err, docs) {
            if (err) return cb(err);
            log.info("Returning open PRs: " + (docs.length ? "FOUND" : "NOT FOUND"));
            cb(null, docs.toArray());
        });
    }
,   getLastWeekPRs: function (cb) {
        log.info("Looking for PRs from last week");
        var lastWeek = couchNow(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
        this.db.view("prs/by_date", { endkey: couchNow(), startkey: lastWeek }, function (err, docs) {
            if (err) return cb(err);
            log.info("Returning PRs from the past week: " + (docs.length ? "FOUND" : "NOT FOUND"));
            cb(null, docs.toArray());
        });
    }
,   getUnaffiliatedUserPRs: function (username, cb) {
        log.info("Looking for PRs with unaffiliated contributor " + username);
        this.db.view("prs/by_unaffiliated_contributor", { key: username }, function (err, docs) {
            if (err) return cb(err);
            log.info("Returning PRs from unaffiliated contributor " + username + ": " + (docs.length ? docs.length + " FOUND" : "NOT FOUND"));
            cb(null, docs.toArray());
        });
    }
,   getOutsideUserPRs: function (username, cb) {
        log.info("Looking for PRs with outside contributor " + username);
        this.db.view("prs/by_outside_contributor", { key: username }, function (err, docs) {
            if (err) return cb(err);
            log.info("Returning PRs from outside contributor " + username + ": " + (docs.length ? docs.length + " FOUND" : "NOT FOUND"));
            cb(null, docs.toArray());
        });
    }
,   deletePR:    function (fullName, num, cb) {
        this.getPR(fullName, num, function (err, doc) {
            if (err) return cb(err);
            if (!doc) return cb(new Error("Store: Can not find PR " + fullName + "/" + num+ " for deletion"));
            this.remove(doc, cb);
        }.bind(this));
    }


    // CORE
,   add:    function (data, cb) {
        if (data._rev) this.db.save(data.id, data._rev, data, cb);
        else this.db.save(data.id, data, cb);
    }
,   get:    function (id, cb) {
        this.db.get(id, cb);
    }
,   update: function (data, cb) {
        var store = this;
        store.db.get(data.id, function (err, res) {
            // if we have a 404, just add
            // if we have a real error, cb(err)
            if (err) {
                if (err.error === "not_found") return store.add(data, cb);
                return cb(err);
            }
            // use the _rev automatically in add()
            data._rev = res._rev;
            store.add(data, cb);
        });
    }
,   remove:    function (data, cb) {
        this.db.remove(data.id, data._rev, cb)
    }
};

module.exports = Store;

if (require.main === module) {
    var configPath = process.argv[2] || './config.json';
    var store = new Store(require(configPath));

    store.setup(function (err) {
        if (err) return console.error(err);
        console.log("Ok!");
    });
}
