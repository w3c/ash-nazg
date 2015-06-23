
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

function newFile (repo, name, content) {
    return repo.contents(name)
                .add({
                    message:    "Adding baseline " + name
                ,   content:    new Buffer(content).toString("base64")
                })
    ;
}

GH.prototype = {
    userOrgs:   function (cb) {
        this.octo.me.orgs.fetch(function (err, data) {
            if (err) return cb(err);
            cb(null, [this.user.username].concat(data.map(function (org) { return org.login; })));
        }.bind(this));
    }
,   createRepo: function (data, cb) {
        // { org: ..., repo: ... }
        // we need to treat the current user and an org differently
        var actions = []
        ,   target = (this.user.username === data.org) ?
                            this.octo.me.repos :
                            this.octo.orgs(data.org).repos
        ,   keepRepo
        ,   license
        ,   contributing
        ,   w3cJSON
        ,   index
        ,   simpleRepo
        ,   readme
        ,   tmplData = {
                name:           data.group.name
            ,   username:       this.user.username
            ,   w3cid:          data.group.w3cid
            ,   repo:           data.repo
            ,   displayName:    this.user.displayName
            }
        ;
        if (data.group.groupType === "CG") {
            contributing = template("CG-contributing.md", tmplData);
            license = template("CG-license.md", tmplData);
        }
        else if (data.group.groupType === "WG") {
            contributing = template("WG-contributing.md", tmplData);
            license = template("WG-license.md", tmplData);
        }
        else {
            var msg = "We currently don't support creating repos for group type: " + data.group.groupType;
            return cb(msg);
        }
        w3cJSON = template("w3c.json", tmplData);
        index = template("index.html", tmplData);
        readme = template("README.md", tmplData);
        target
            .create({ name: data.repo })
            .then(function (repo) {
                actions.push("Repo '" + repo.fullName + "' created.");
                keepRepo = repo;
                simpleRepo = {
                    name:       repo.name
                ,   fullName:   repo.fullName
                ,   owner:      repo.owner.login
                ,   group:      data.group.w3cid
                ,   secret:     pg(20)
                };
                return newFile(keepRepo, "LICENSE", license);
            })
            .then(function () {
                actions.push("File 'LICENSE' added.");
                return newFile(keepRepo, "CONTRIBUTING.md", contributing);
            })
            .then(function () {
                actions.push("File 'CONTRIBUTING.md' added.");
                return newFile(keepRepo, "README.md", readme);
            })
            .then(function () {
                actions.push("File 'README.md' added.");
                return newFile(keepRepo, "index.html", index);
            })
            .then(function () {
                actions.push("File 'index.html' added.");
                return newFile(keepRepo, "w3c.json", w3cJSON);
            })
            .then(function () {
                actions.push("File 'w3c.json' added.");
                return keepRepo.hooks.create({
                                            name:   "web"
                                        ,   config: {
                                                url:            config.hookURL || (config.url + "api/hook")
                                            ,   content_type:   "json"
                                            ,   secret:         simpleRepo.secret
                                            }
                                        ,   events: ["pull_request", "issue_comment", "pull_request_review_comment"]
                                        ,   active: true
                                        })
                ;
            })
            .then(function () {
                actions.push("Hook installed");
                cb(null, { actions: actions, repo: simpleRepo });
            })
            .catch(cb)
        ;
    }
};

module.exports = GH;
