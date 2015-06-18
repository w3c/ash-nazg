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
            log.info("Got user " + docs);
            cb(null, docs.length ? docs[0].value : null);
        });
    }
,   addUser:    function (profile, cb) {
        profile.id = "user-" + profile.username;
        profile.type = "user";
        delete profile._rev; // don't use this to update users
        log.info("Adding user " + profile.username);
        this.add(profile, cb);
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

