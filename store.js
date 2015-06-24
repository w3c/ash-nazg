/* global emit*/

// IMPORTANT:
// when this is ran directly, set up the DB
// otherwise just be a library that handles all storage


// XXX
// Note that for the status thing, we will need to get the access token for that repo based on a
// user that owns it
// this ought to be doable relatively easily when the repo has been created or imported through our
// interface. Wait... this implies that all the repos we manage need to be created/imported here.
// Ok, can live with that.
// We can create a special token for the w3c organisation

// XXX
// this could use some DRY love

var cradle = require("cradle")
// ,   isArray = require("util").isArray
,   async = require("async")
,   log = require("./log")
,   config = require("./config.json")
;

function Store () {
    var dbName = config.couchDB || "ash-nazg"
    ,   couchConf = {}
    ;
    if (config.couchAuth) couchConf.auth = config.couchAuth;
    this.client = new cradle.Connection(couchConf);
    this.db = this.client.database(dbName);
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
                    by_owner: {
                        map:    function (doc) {
                                    if (!doc.type || doc.type !== "secret") return;
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
            // XXX we should check if the user exists, and if so merge their properties in case they
            // have changed
            if (err) return cb(err);
            if (user) return cb(null, user);
            store.addUser(profile, cb);
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
                return a.fullName.localeCompare(b.fullName);
            });
            cb(null, docs);
        });
    }
,   addUser:    function (profile, cb) {
        profile.id = "user-" + profile.username;
        profile.type = "user";
        profile.groups = profile.groups || {};
        delete profile._rev; // don't use this to update users
        log.info("Adding user " + profile.username);
        this.add(profile, cb);
    }
,   makeUserAdmin:  function (username, cb) {
        this.getUser(username, function (err, doc) {
            doc.admin = true;
            this.add(doc, cb);
        }.bind(this));
        // this worked here but since it failed for mergeOnUser() I'm playing it safe instead
        // this.db.merge("user-" + username, { admin: true }, cb);
    }
,   mergeOnUser:  function (username, data, cb) {
        this.getUser(username, function (err, doc) {
            for (var k in data) doc[k] = data[k];
            this.add(doc, cb);
            // not sure why this doesn't work
            // this.db.merge("user-" + username, doc._rev, data, cb);
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
                return a.name.localeCompare(b.name);
            });
            cb(null, docs);
        });
    }


    // SECRETS
,   addSecret:    function (secret, cb) {
        // the configuration file can list secrets that override those in the DB, in which case the
        // latter don't get stored
        if (config.secrets && config.secrets[secret.owner]) return cb();
        secret.id = "secret-" + secret.owner;
        secret.type = "secret";
        delete secret._rev; // don't use this to update secrets
        log.info("Adding secret " + secret.owner);
        this.add(secret, cb);
    }
    // get a secret by owner
,   getSecret:   function (owner, cb) {
        var store = this;
        log.info("Looking for secret for " + owner);
        if (config.secrets && config.secrets[owner]) return cb(null, { owner: owner, secret: config.secrets[owner] });
        store.db.view("secrets/by_owner", { key: owner }, function (err, docs) {
            if (err) return cb(err);
            log.info("Returning secret for " + owner + ": " + (docs.length ? "FOUND" : "NOT FOUND"));
            cb(null, docs.length ? docs[0].value : null);
        });
    }


    // REPOS
,   addRepo:    function (repo, cb) {
        repo.id = "repo-" + repo.fullName;
        repo.type = "repo";
        delete repo._rev; // don't use this to update repos
        log.info("Adding repo " + repo.fullName);
        this.add(repo, cb);
    }
    // get a repo by fullName (username/reponame)
,   getRepo:   function (fullName, cb) {
        var store = this;
        log.info("Looking for repo for " + fullName);
        store.db.view("secrets/by_fullname", { key: fullName }, function (err, docs) {
            if (err) return cb(err);
            log.info("Returning repo for " + fullName + ": " + (docs.length ? "FOUND" : "NOT FOUND"));
            cb(null, docs.length ? docs[0].value : null);
        });
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


// ,   addUnlessExists:    function (data, cb) {
//         this.db.head(data.id, function (err, headers, status) {
//             if (err) return cb(err);
//             if (status == 200) return cb();
//             this.add(data, cb);
//         }.bind(this));
//     }
//     // takes the _rev into account so as to update
//     // name is the name of the filter
// ,   listEvents:   function (name, options, cb) {
//         if (!options) options = {};
//         // XXX we start with descending=true and limit=20
//         // when we add paging later, it will be very important to use endkey and not startkey as the
//         // starting point. Or better, don't anchor with a key but rather use skip = page * page_size
//         this.db.view("events/" + name, { descending: true, limit: 20 }, function (err, docs) {
//             if (err) return cb(err);
//             cb(null, docs.toArray());
//         });
//     }
};

module.exports = Store;

if (require.main === module) {
    var store = new Store();
    store.setup(function (err) {
        if (err) return console.error(err);
        console.log("Ok!");
    });
}

