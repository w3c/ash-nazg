const Octokit = require("@octokit/core").Octokit.plugin(require("@octokit/plugin-paginate-rest").paginateRest)
,   async = require("async")
,   pg = require("password-generator")
,   crypto = require("crypto")
,   template = require("./template")
,   config = require("./config.json")
;

// helpers

function GH (user) {
    if (!user) throw new Error("The GH module requires a user.");
    this.user = user;
    this.octo = new Octokit({ auth: user.accessToken });
}

function makeNewRepo (gh, target, owner, repoShortName, report) {
    return gh.octo.request("POST " + target, {
      org: owner,
      data: { name: repoShortName }
    }).then(function ({data: repo}) {
      report.push("Repo '" + repoShortName + "' created.");
      return repo;
    });
}

function pickUserRepo (gh, target, owner, repoShortName, report) {
    report.push("Looking for repo " + owner + "/" + repoShortName + " to import.");
    return gh.octo.request("GET /repos/:owner/:repoShortName", {owner, repoShortName}).then(({data: repo}) => repo);
}

function newFile (gh, name, content, report) {
    return function () {
        return gh.octo.request("PUT /repos/:owner/:reponame/contents/:name", {
          owner: gh.currentRepo.owner.login,
          reponame: gh.currentRepo.name,
          name,
          data:{
            message:    "Adding baseline " + name
            ,   content:    new Buffer(content).toString("base64")
          }})
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
        const self = this;
        self.octo.paginate("GET /user/orgs").then(data => {
            cb(null, [self.user.username].concat(data.map(function (org) { return org.login; })));
        }, cb);
    }
,   userOrgRepos:   function (cb) {
        const self = this;
        self.octo.paginate("GET /user/orgs").then(data => {
            Promise.all(
                [{login: self.user.username, type: 'user'}].concat(data.map(function (org) { return {login: org.login, type: 'org'}; }))
                .map(({type, login}) => {
                    const target = type === 'user' ? "users" : "orgs";
                    return self.octo.paginate("GET /:target/:login/repos", { login, target, per_page: 100}).then(repos => {return {login, repos: repos.map(r => r.name)};});
                })).then(results => {
                    cb(null, results.reduce(function(a,b) { a[b.login] = b.repos; return a;}, {}));
                }, cb);
        }, cb);
    }
,   commentOnPR: function({owner, shortName, num, comment}, cb) {
        const w3cBotOcto = new Octokit({ auth: config.w3cBotGHToken });
        w3cBotOcto.request("POST /repos/:owner/:shortName/issues/:num/comments", { owner, shortName, num, data: {body: comment}}).then(({data: comment}) => cb(null, comment), cb);
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
        const self = this;
        if (!data.groups.some(g => g)) return cb({json: {message: "No group selected to associate with repository"}});
        var report = []
        ,   targetPath = (this.user.username === data.org) ?
           // we need to treat the current user and an org differently
                            "/user/repos": "/orgs/:org/repos"
        ,   license
        ,   licensePath
        ,   contributing
        ,   contributingPath
        ,   w3cJSON
        ,   index
        ,   simpleRepo
        ,   readme
        ,   codeOfConduct
        ,   hookURL = config.hookURL || (config.url + config.hookPath)
        ,   tmplData = {
                name:           andify(data.groups, "name")
            ,   usernames:      data.w3cJsonContacts ? JSON.stringify(data.w3cJsonContacts) : null
            ,   w3cid:          JSON.stringify(data.groups.map(function (g) { return parseInt(g.w3cid, 10); }))
            ,   repo:           data.repo
            ,   displayName:    this.user.displayName
            ,   repotype:    data.groups[0].groupType === "WG" ? "rec-track" : "cg-report"
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
            return cb({json: {message: msg}});
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
        codeOfConduct = data.includeCodeOfConduct ? template("CODE_OF_CONDUCT.md", tmplData) : null;
        setupAction(self, targetPath, data.org, data.repo, report)
            .then(function (repo) {
                self.currentRepo = repo;
                simpleRepo = {
                    name:       repo.name
                ,   fullName:   repo.owner.login + "/" + repo.name
                ,   owner:      repo.owner.login
                ,   groups:     data.groups.map(function (g) { return g.w3cid; })
                ,   secret:     pg(20)
                };
            })
            .then(license ? action(self, "LICENSE.md", license, report) : null)
            .then(contributing ? action(self, "CONTRIBUTING.md", contributing, report) : null)
            .then(readme ? action(self, "README.md", readme, report) : null)
            .then(codeOfConduct ? action(self, "CODE_OF_CONDUCT.md", codeOfConduct, report) : null)
            .then(index ? action(self, "index.html", index, report) : null)
            .then(w3cJSON ? action(self, "w3c.json", w3cJSON, report) : null)
            .then(function () {
                return self.octo.request("GET /repos/:owner/:name/hooks",
                                         {
                                           owner: self.currentRepo.owner.login, name: self.currentRepo.name
                                         })
                        .then(function ({data: hooks}) {
                            const hook = (hooks || hooks.length) ? hooks.find(function(h) { return h && h.config && h.config.url === hookURL; }) : null;
                            
                            if (!hook) {
                                return self.octo.request("POST /repos/:owner/:name/hooks",
                                         {
                                           owner: self.currentRepo.owner.login, name: self.currentRepo.name, data: {
                                                            name:   "web"
                                                        ,   config: {
                                                                url:            config.hookURL || (config.url + "api/hook")
                                                            ,   content_type:   "json"
                                                            ,   secret:         simpleRepo.secret
                                                            }
                                                        ,   events: ["pull_request", "issue_comment", "repository"]
                                                        ,   active: true
                                           }})
                                                        .then(function () { report.push("Hook installed."); })
                                ;
                            }
                            else {
                                return self.octo.request("PATCH /repos/:owner/:name/hooks/:hook",
                                        {
                                            owner: self.currentRepo.owner.login,
                                            name: self.currentRepo.name,
                                            hook: hook.id,
                                            data: {
                                                config: {
                                                    url:          config.hookURL || (config.url + "api/hook"),
                                                    content_type: "json",
                                                    secret:       simpleRepo.secret
                                                }
                                            }
                                            
                                        })
                                        .then(function() { report.push("Hook already present. Secret updated"); })
                                ;
                                
                            }
                        })
                ;
            })
            .then(function () {
                cb(null, { actions: report, repo: simpleRepo });
            })
            .catch(function (e) {
                cb({code: e.status});
            })
        ;
    }
,   getRepoContacts: function (repofullname, cb) {
       var self = this;
       const ret = self.octo
             .request("GET /repos/:owner/:name/contents/:file", {
               owner: repofullname.split('/')[0],
               name: repofullname.split('/')[1],
               file: 'w3c.json'
             })
           .then(function({data: w3cinfodesc}) {
               var w3cinfo = JSON.parse(new Buffer(w3cinfodesc.content, 'base64').toString('utf8'));
               return Promise.all(w3cinfo.contacts.map(function(username) {
                   return self.octo.request("GET /users/:username", {username})
                       .then(({data: user}) => user.email);
               }));
           });
       if (!cb) return ret;
       ret.then(emails => cb(null, emails), cb);
}
,   status: function ({owner, shortName, sha, payload}, cb) {
        this.octo
        .request("POST /repos/:owner/:shortName/statuses/:sha", {
          owner, shortName, sha, data: payload
        }).then(function () { cb(null); }, cb);
    }
,   getPrFiles: function(owner, name, prnum, cb) {
        const ret = this.octo
            .request("GET /repos/:owner/:name/pulls/:prnum/files", {owner, name, prnum}).then(({data: files}) => files);
        if (!cb) return ret;
        ret.then(files => cb(null, files), cb);
    }
,   isAdmin:    function (username, orgOrUser, cb) {
        if (username === orgOrUser) {
           return cb(null, true);
        }
        const ret = this.octo.request("GET /orgs/:orgOrUser/memberships/:username", {username, orgOrUser})
              .then(function ({data: role}) {
                return role && role.role === "admin";
              }, (res) => {
                if (res.status === 404) return false;
                throw(res);
              });
        if (!cb) return ret;
        return ret.then(u => cb(null, u), cb);
    }
,   getUser:    function (username, cb) {
        const ret = this.octo.request("GET /users/:username", {username})
            .then(function ({data: user, headers: headers}) {
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
                    ,   scopes:             headers['x-oauth-scopes']
                };
                if (user.email) u.emails.push({ value: user.email });
                if (user.avatar_url) u.photos.push({ value: user.avatar_url });
                return u;
            });
        if (!cb) return ret;
        return ret.then(u => cb(null, u), cb);
    }
};

GH.signPayload = function (algo, secret, buffer) {
    return algo + "=" + crypto.createHmac(algo, secret).update(buffer).digest("hex");
};

GH.checkPayloadSignature = function (algo, secret, buffer, remotesig) {
    const sig = Buffer.from(remotesig, 'utf-8');
    const digest = Buffer.from(GH.signPayload(algo, secret, buffer), 'utf8')
    
    return (sig.length === digest.length && crypto.timingSafeEqual(digest, sig));
}

module.exports = GH;
