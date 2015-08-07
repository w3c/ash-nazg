
var Octokat = require("octokat")
,   fs = require("fs")
,   jn = require("path").join
,   log = require("./log")
,   pg = require("password-generator")
,   config = require("./config.json")
;

// helpers
function template (src, data) {
    return fs.readFileSync(jn(__dirname, "templates", src), "utf8")
             .replace(/\{\{(\w+)\}\}/g, function (_, k) {
                 if (typeof data[k] === "undefined") {
                     log.error("No template data for key=" + k + ", file=" + src);
                     return "";
                 }
                 return data[k];
             });
}

function GH (user) {
    if (!user) throw new Error("The GH module requires a user.");
    this.user = user;
    this.octo = new Octokat({ token: user.accessToken });
}

function makeNewRepo (gh, target, owner, repoShortName, report) {
    return target
            .create({ name: repoShortName })
            .then(function (repo) {
                report.push("Repo '" + repoShortName + "' created.");
                return repo;
            })
    ;
}

function pickUserRepo (gh, target, owner, repoShortName, report) {
    var repo = gh.octo.repos(owner, repoShortName);
    report.push("Looking for repo " + owner + "/" + repoShortName + " to import.");
    return repo.fetch();
}

function newFile (gh, name, content, report) {
    return function () {
        return gh.currentRepo
                    .contents(name)
                    .add({
                        message:    "Adding baseline " + name
                    ,   content:    new Buffer(content).toString("base64")
                    })
                    .then(function () {
                        report.push("Added file " + name);
                    })
                    .catch(function () {
                        report.push("Skipped existing file " + name);
                    })
        ;
    };
}

function andify (groups, field) {
    var len = groups.length;
    if (len === 1) return groups[0][field];
    else if (len === 2) return groups.map(function (g) { return g[field]; }).join(" and ");
    else {
        var copy = [].concat(groups)
        ,   last = copy.pop()
        ;
        return copy.map(function (g) { return g[field] + ", "; }) + "and " + last[field];
    }
}

GH.prototype = {
    userOrgs:   function (cb) {
        this.octo.me.orgs.fetch(function (err, data) {
            if (err) return cb(err);
            cb(null, [this.user.username].concat(data.map(function (org) { return org.login; })));
        }.bind(this));
    }
,   createRepo: function (data, cb) {
        this.createOrImportRepo(data, makeNewRepo, newFile, cb);
    }
,   importRepo: function (data, cb) {
        this.createOrImportRepo(data, pickUserRepo, newFile, cb);
    }
    // data describes the repo to create
    // setupAction is a function returning a promise that is called to initiate the creation or
    // obtain a pointer to the repo, it must resolve with the octo repo object
    // action is a function returning a promise that creates or imports a file, and logs a message
,   createOrImportRepo: function (data, setupAction, action, cb) {
        // { org: ..., repo: ... }
        // we need to treat the current user and an org differently
        var report = []
        ,   target = (this.user.username === data.org) ?
                            this.octo.me.repos :
                            this.octo.orgs(data.org).repos
        ,   license
        ,   contributing
        ,   w3cJSON
        ,   index
        ,   simpleRepo
        ,   readme
        ,   hookURL = config.hookURL || (config.url + config.hookPath)
        ,   tmplData = {
                name:           andify(data.groups, "name")
            ,   username:       this.user.username
            ,   w3cid:          JSON.stringify(data.groups.map(function (g) { return g.w3cid; }))
            ,   repo:           data.repo
            ,   displayName:    this.user.displayName
            }
        ;
        // collaborations between groups of different types aren't really possible, they don't have
        // the same legal regimen, so we only look at the first one
        if (data.groups[0].groupType === "CG") {
            contributing = template("CG-contributing.md", tmplData);
            license = template("CG-license.md", tmplData);
        }
        else if (data.groups[0].groupType === "WG") {
            contributing = template("WG-contributing.md", tmplData);
            license = template("WG-license.md", tmplData);
        }
        else {
            var msg = "We currently don't support creating repos for group type: " + data.groups[0].groupType;
            return cb(msg);
        }
        w3cJSON = template("w3c.json", tmplData);
        index = template("index.html", tmplData);
        readme = template("README.md", tmplData);
        setupAction(this, target, data.org, data.repo, report)
            .then(function (repo) {
                this.currentRepo = repo;
                simpleRepo = {
                    name:       repo.name
                ,   fullName:   repo.fullName
                ,   owner:      repo.owner.login
                ,   groups:     data.groups.map(function (g) { return g.w3cid; })
                ,   secret:     pg(20)
                };
            }.bind(this))
            .then(action(this, "LICENSE.md", license, report))
            .then(action(this, "CONTRIBUTING.md", contributing, report))
            .then(action(this, "README.md", readme, report))
            .then(action(this, "index.html", index, report))
            .then(action(this, "w3c.json", w3cJSON, report))
            .then(function () {
                return this.currentRepo
                        .hooks
                        .fetch()
                        .then(function (hooks) {
                            if (!hooks || !hooks.length || !hooks.some(function (h) { return h.config.url === hookURL; })) {
                                return this.currentRepo.hooks.create({
                                                            name:   "web"
                                                        ,   config: {
                                                                url:            config.hookURL || (config.url + "api/hook")
                                                            ,   content_type:   "json"
                                                            ,   secret:         simpleRepo.secret
                                                            }
                                                        ,   events: ["pull_request", "issue_comment"]
                                                        ,   active: true
                                                        })
                                                        .then(function () { report.push("Hook installed."); })
                                ;
                            }
                            else {
                                report.push("Hook already present.");
                            }
                        }.bind(this))
                ;
            }.bind(this))
            .then(function () {
                cb(null, { actions: report, repo: simpleRepo });
            })
            .catch(cb)
        ;
    }
,   status: function (data, cb) {
        this.octo
            .repos(data.owner, data.shortName)
            .statuses(data.sha)
            .create(data.payload)
            .then(function () { cb(null); })
            .catch(cb)
        ;
    }
,   getUser:    function (username, cb) {
        this.octo
            .users(username)
            .fetch()
            .then(function (user) {
                var u = {
                        accessToken:        null
                    ,   admin:              false
                    ,   affiliation:        null
                    ,   affiliationName:    null
                    ,   blanket:            false
                    ,   blog:               user.blog || ""
                    ,   displayName:        user.name
                    ,   ghID:               user.id
                    ,   groups:             {}
                    ,   emails:             []
                    ,   photos:             []
                    ,   profileUrl:         user.html_url
                    ,   provider:           "github"
                    ,   username:           username
                    ,   w3capi:             null
                    ,   w3cid:              null
                };
                if (user.email) u.emails.push({ value: user.email });
                if (user.avatar_url) u.photos.push({ value: user.avatar_url });
                cb(null, u);
            })
            .catch(cb)
        ;
    }
};

module.exports = GH;
