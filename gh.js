var Octokat = require("octokat")
,   fs = require("fs")
,   async = require("async")
,   jn = require("path").join
,   log = require("./log")
,   pg = require("password-generator")
,   crypto = require("crypto")
;

// helpers
function template (src, data) {
    return fs.readFileSync(jn(__dirname, "templates", src), "utf8")
             .replace(/\{\{(\w+)\}\}/g, function (_, k) {
                 if (typeof data[k] === "undefined") {
                     console.error("No template data for key=" + k + ", file=" + src);
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
    userOrgs:       function(cb) {
        this.octo.me.orgs.fetch(function (err, data) {
            if (err) return cb(err);
            cb(null, [this.user.username].concat(data.map(function (org) { return org.login; })));
        }.bind(this));
    }
,   userOrgRepos:   function (cb) {
        this.octo.me.orgs.fetch(function (err, data) {
            if (err) return cb(err);
            async.map(
                [{login: this.user.username, type: 'user'}].concat(data.map(function (org) { return {login: org.login, type: 'org'}; })),
                function(account, accountCB) {
                    var accountRepo;
                    if (account.type === 'user') {
                        accountRepo = this.octo.users(account.login);
                    } else {
                        accountRepo = this.octo.orgs(account.login);
                    }
                    var repoPage =function(list) {
                        return function(err, repos) {
                            if (err) return accountCB(err);
                            var names = repos.map(function(r) { return r.name;});
                            if (repos.nextPage) {
                                repos.nextPage(repoPage(list.concat(names)));
                            } else {
                                accountCB(null, {login: account.login, repos: list.concat(names)});
                            }
                        };
                    };
                    accountRepo.repos.fetch(repoPage([]));
                }.bind(this),
                function(err, results) {
                    if (err) return cb(err);
                    cb(null, results.reduce(function(a,b) { a[b.login] = b.repos; return a;}, {}));
                });
        }.bind(this));
    }
,   commentOnPR: function(data, cb) {
        this.octo.repos(data.owner, data.shortName).issues(data.num).comments.create({body: data.comment}, function(err, comment) {
            if (err) return cb(err);
            cb(null, comment);
        });
    }
,   createRepo: function (data, config, cb) {
        this.createOrImportRepo(data, makeNewRepo, newFile, config, cb);
    }
,   importRepo: function (data, config, cb) {
        this.createOrImportRepo(data, pickUserRepo, newFile, config, cb);
    }
    // data describes the repo to create
    // setupAction is a function returning a promise that is called to initiate the creation or
    // obtain a pointer to the repo, it must resolve with the octo repo object
    // action is a function returning a promise that creates or imports a file, and logs a message
   // config is a configuration object with data about the server setup
,   createOrImportRepo: function (data, setupAction, action, config, cb) {
        // { org: ..., repo: ... }
        // we need to treat the current user and an org differently
        var report = []
        ,   target = (this.user.username === data.org) ?
                            this.octo.me.repos :
                            this.octo.orgs(data.org).repos
        ,   license
        ,   licensePath
        ,   contributing
        ,   contributingPath
        ,   w3cJSON
        ,   index
        ,   simpleRepo
        ,   readme
        ,   hookURL = config.hookURL || (config.url + config.hookPath)
        ,   tmplData = {
                name:           andify(data.groups, "name")
            ,   usernames:      data.w3cJsonContacts ? JSON.stringify(data.w3cJsonContacts) : null
            ,   w3cid:          JSON.stringify(data.groups.map(function (g) { return g.w3cid; }))
            ,   repo:           data.repo
            ,   displayName:    this.user.displayName
            }
        ;
        // collaborations between groups of different types aren't really possible, they don't have
        // the same legal regimen, so we only look at the first one
        if (data.groups[0].groupType === "CG") {
            contributingPath = "CG-contributing.md";
            licensePath = "CG-license.md";
        }
        else if (data.groups[0].groupType === "WG") {
            if (data.wgLicense === 'doc') {
                contributingPath = "WG-CONTRIBUTING.md";
                licensePath = "WG-LICENSE.md";
            } else {
                contributingPath = "WG-CONTRIBUTING-SW.md";
                licensePath = "WG-LICENSE-SW.md";
            }
        }
        else {
            var msg = "We currently don't support creating repos for group type: " + data.groups[0].groupType;
            return cb(msg);
        }
        if (data.includeContributing && contributingPath) {
            contributing = template(contributingPath, tmplData);
        }
        if (data.includeLicense && licensePath) {
            license = template(licensePath, tmplData);
        }
        w3cJSON = data.includeW3cJson ? template("w3c.json", tmplData) : null;
        index = data.includeSpec ? template("index.html", tmplData) : null;
        readme = data.includeReadme ? template("README.md", tmplData) : null;
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
            .then(license ? action(this, "LICENSE.md", license, report) : null)
            .then(contributing ? action(this, "CONTRIBUTING.md", contributing, report) : null)
            .then(readme ? action(this, "README.md", readme, report) : null)
            .then(index ? action(this, "index.html", index, report) : null)
            .then(w3cJSON ? action(this, "w3c.json", w3cJSON, report) : null)
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
,   getRepoContacts: function (repofullname, cb) {
    var self = this;
    self.octo
        .repos(repofullname.split('/')[0], repofullname.split('/')[1])
        .contents('w3c.json').fetch()
        .then(function(w3cinfodesc) {
            var w3cinfo = JSON.parse(new Buffer(w3cinfodesc.content, 'base64').toString('utf8'));
            return Promise.all(w3cinfo.contacts.map(function(username) {
                return self.octo.users(username).fetch()
                    .then(function(u) {
                        return u.email;
                    });
            }));
        }).then(function(emails) {
            cb(null, emails);
        })
        .catch(cb);
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

GH.signPayload = function (algo, secret, buffer) {
    return algo + "=" + crypto.createHmac(algo, secret).update(buffer).digest("hex");
};

module.exports = GH;
