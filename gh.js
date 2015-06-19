
var Octokat = require("octokat");

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
        ;
        target
            .create({ name: data.repo })
            .then(function (repo) {
                actions.push("Repo '" + repo.fullName + "' created.");
                keepRepo = repo;
                return newFile(keepRepo, "LICENSE", "XXX");
            })
            .then(function () {
                actions.push("File 'LICENSE' added.");
                return newFile(keepRepo, "CONTRIBUTING.md", "XXX");
            })
            .then(function () {
                actions.push("File 'CONTRIBUTING.md' added.");
                return newFile(keepRepo, "index.html", "XXX");
            })
            .then(function () {
                actions.push("File 'index.html' added.");
                return newFile(keepRepo, "w3c.json", "XXX");
            })
            .then(function () {
                actions.push("File 'w3c.json' added.");
                // XXX add hook, returning a promise
                // the hook needs to have its own secret, which needs to be returned at the end
            })
            .then(function () {
                actions.push("Hook installed");
                cb(null, { actions: actions, repo: keepRepo });
            })
            .catch(cb)
        ;


        // create the repo
        // add the files one by one (or batch if possible?)
        // add the hook back to us, with one secret generated per repo
        // call cb with a description of the tasks that were carried out and a description of the
        // repo so that it can be stored (because the caller stores it itself)
        // or if it's an error, give an error that makes sense
    }
};

module.exports = GH;

// { id: 37714307,
//   name: 'create1',
//   fullName: 'darobin/create1',
//   owner:
//    { login: 'darobin',
//      id: 38491,
//      avatar: { [Function] url: 'https://avatars.githubusercontent.com/u/38491?v=3' },
//      gravatarId: '',
//      url: 'https://api.github.com/users/darobin',
//      html: { [Function] url: 'https://github.com/darobin' },
//      subscriptions: { [Function] url: 'https://api.github.com/users/darobin/subscriptions' },
//      organizations: { [Function] url: 'https://api.github.com/users/darobin/orgs' },
//      type: 'User',
//      fetch: [Function],
//      read: [Function],
//      readBinary: [Function],
//      remove: [Function],
//      create: [Function],
//      update: [Function],
//      add: [Function],
//      contains: [Function],
//      repos: [Getter],
//      orgs: [Getter],
//      gists: [Getter],
//      followers: [Getter],
//      following: [Getter],
//      keys: [Getter],
//      starred: [Getter],
//      receivedEvents: [Getter],
//      events: [Getter],
//      siteAdmin: [Getter],
//      suspended: [Getter] },
//   private: false,
//   html: { [Function] url: 'https://github.com/darobin/create1' },
//   description: null,
//   fork: false,
//   url: 'https://api.github.com/repos/darobin/create1',
//   keys:
//    { [Function]
//      url: 'https://api.github.com/repos/darobin/create1/keys{/key_id}' },
//   issueEvents:
//    { [Function]
//      url: 'https://api.github.com/repos/darobin/create1/issues/events{/number}' },
//   blobs:
//    { [Function]
//      url: 'https://api.github.com/repos/darobin/create1/git/blobs{/sha}' },
//   gitTags:
//    { [Function]
//      url: 'https://api.github.com/repos/darobin/create1/git/tags{/sha}' },
//   gitRefs:
//    { [Function]
//      url: 'https://api.github.com/repos/darobin/create1/git/refs{/sha}' },
//   trees:
//    { [Function]
//      url: 'https://api.github.com/repos/darobin/create1/git/trees{/sha}' },
//   gitCommits:
//    { [Function]
//      url: 'https://api.github.com/repos/darobin/create1/git/commits{/sha}' },
//   issueComment:
//    { [Function]
//      url: 'https://api.github.com/repos/darobin/create1/issues/comments{/number}' },
//   archive:
//    { [Function]
//      url: 'https://api.github.com/repos/darobin/create1/{archive_format}{/ref}' },
//   createdAt: Fri Jun 19 2015 11:45:46 GMT+0200 (CEST),
//   updatedAt: Fri Jun 19 2015 11:45:46 GMT+0200 (CEST),
//   pushedAt: Fri Jun 19 2015 11:45:46 GMT+0200 (CEST),
//   ssh: { [Function] url: 'git@github.com:darobin/create1.git' },
//   clone: { [Function] url: 'https://github.com/darobin/create1.git' },
//   svn: { [Function] url: 'https://github.com/darobin/create1' },
//   homepage: null,
//   size: 0,
//   stargazersCount: 0,
//   watchersCount: 0,
//   language: null,
//   hasIssues: true,
//   hasDownloads: true,
//   hasWiki: true,
//   hasPages: false,
//   forksCount: 0,
//   mirror: { [Function] url: null },
//   openIssuesCount: 0,
//   openIssues: 0,
//   watchers: 0,
//   defaultBranch: 'master',
//   permissions: { admin: true, push: true, pull: true },
//   networkCount: 0,
//   subscribersCount: 1,
//   fetch: [Function],
//   read: [Function],
//   readBinary: [Function],
//   remove: [Function],
//   create: [Function],
//   update: [Function],
//   add: [Function],
//   contains: [Function],
//   readme: [Getter],
//   tarball: [Getter],
//   zipball: [Getter],
//   compare: [Getter],
//   deployments: [Getter],
//   hooks: [Getter],
//   assignees: [Getter],
//   languages: [Getter],
//   teams: [Getter],
//   tags: [Getter],
//   branches: [Getter],
//   contributors: [Getter],
//   subscribers: [Getter],
//   subscription: [Getter],
//   stargazers: [Getter],
//   comments: [Getter],
//   downloads: [Getter],
//   forks: [Getter],
//   milestones: [Getter],
//   labels: [Getter],
//   releases: [Getter],
//   events: [Getter],
//   notifications: [Getter],
//   merges: [Getter],
//   statuses: [Getter],
//   pulls: [Getter],
//   pages: [Getter],
//   commits: [Getter],
//   contents: [Getter],
//   collaborators: [Getter],
//   issues: [Getter],
//   git: [Getter],
//   stats: [Getter] }

