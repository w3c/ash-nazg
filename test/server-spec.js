var proxyquire =  require('proxyquire');
require('es6-object-assign').polyfill();
// Remove randomness from the picture
function passwordGenerator(n) {
    return Array(n).join("_");
}
var GH = proxyquire('../gh', {'password-generator': passwordGenerator, '@global': true});

var expect = require('expect.js');
var request = require('supertest');
var nock = require('nock');
var config = require('./config-test.json');
var server = require('../server');
var Store = require('../store');
var async = require('async');
var curry = require('curry');
var nodemailer = require('nodemailer');
var mockTransport = require('nodemailer-mock-transport');
var transport = mockTransport();
var transporter = nodemailer.createTransport(transport);

var ghScope = "user:email,public_repo,write:repo_hook,read:org";

// simplify debugging of missed nock requests
nock.emitter.on('no match', function(req, options, requestBody) {
    if (!req || req.hostname !== '127.0.0.1') {
        console.error("No match for nock request on " + JSON.stringify(req, null, 2));
    }
});


// Test Data
var githubCode = 'abcd';
var testUser = {ghID: '111', emails: ["test@example.com"], username: "--ghtest"};
var testUser2 = {ghID: '112', emails: ["foobar@example.com"], username: "--foobar", w3cid: 123, affiliation: 456, affiliationName: "ACME Inc", w3capi: "aaaaa", emails:[]};
var testUser3 = {ghID: '115', emails: ["barfoo@example.com"], username: "--barfoo", w3cid: 124};
var testUser3_w3capi = "bbbbb";
var w3cGroup = {id: 42, type: "working group", shortType: "wg", shortname: "test", name: "Test Working Group"};
var w3cGroup2 = {id: 12, type: "working group", shortType: "wg", shortname: "othertest", name: "Other Test Working Group"};
var w3cGroup3 = {id: 15, type: "community group", shortType: "cg", shortname: "testcg", name: "Test Community Group"};
var testOrg = {login: "acme", id:12};
var w3cAff = {id: 456, name: "ACME Inc"};
var w3cApify = function(g, type) { return {href:`https://api.w3.org/${type ? `${type}/${g.id}` : `groups/${g.shortType}/${g.shortname}`}`, title: g.name};};

function RepoMock(_id, _name, _owner, _files, _hooks) {
    var id = _id;
    var name = _name;
    var owner = _owner;
    var full_name = owner + "/" + name;
    var files = _files;
    var hooks = _hooks;
    function addHook(h) { hooks.push(h);}
    function addFile(f) { if (files.indexOf(f) === -1) { files.push(f); return true} else { return false;}}
    function toGH() {
        return {
            id: id,
            name:name,
            full_name: full_name,
            owner: { login: owner},
            url: "https://api.github.com/repos/" + full_name,
            contents_url: "https://api.github.com/repos/" + full_name + "/contents/{+path}"
        };
    }
    function mockGH(username, nonAdmin = false, existinghook = false, advancedPrivs = true) {
        var contentRE = new RegExp('/repos/' + full_name + '/contents/.*');
        const hookId = 123;
        if (files.length === 0) {
            nock('https://api.github.com')
            .post('/orgs/' + owner + '/repos', {name: name})
            .reply(200, toGH());
        } else {
            nock('https://api.github.com')
            .get('/repos/' + full_name)
            .reply(200, toGH());
        }

        if (advancedPrivs) {
            nock('https://api.github.com')
            .get(`/orgs/${_owner}/memberships/${username}`)
            .reply(nonAdmin ? 404 : 200, {
                role: nonAdmin ? "none" : "admin"
            });
        }

        nock('https://api.github.com')
        .put(contentRE)
        .times(files.length === 0 ? expectedFilesInCreatedRepo.length : expectedFilesInImportedRepo.length)
        .reply(function(uri) {
            var filename = uri.split("/").slice(5).join("/");
            if (addFile(filename)) {
                return [201, {message:"OK"}];
            } else {
                return [422, {message:"File already exists"}];
            }
        });

        nock('https://api.github.com')
        .get('/repos/' + full_name + '/hooks')
        .reply(200, hooks);
        if (!existinghook) {
            if (advancedPrivs) {
                nock('https://api.github.com')
                .post('/repos/' + full_name + '/hooks', {name:"web", "config":{url: config.hookURL, content_type:'json', secret: /.*/}, events:["pull_request","issue_comment"], active: true})
                .reply(201, function(uri, body) {
                    const hook = JSON.parse(body);
                    hook.id = hookId;
                    addHook(hook);
                });
            } else {
                nock('https://api.github.com')
                .post('/repos/' + full_name + '/hooks', {name:"web", "config":{url: config.hookURL, content_type:'json', secret: /.*/}, events:["pull_request","issue_comment"], active: true})
                .reply(403, {message: "Forbidden"});
            }
        } else {
            nock('https://api.github.com')
                .patch(`/repos/${full_name}/hooks/${hookId}`, {"config":{url: config.hookURL, content_type:'json', secret: /.*/}})
                .reply(200, {message:"OK"});
        }
    }

    return {id: id, name: name, files: files, hooks: hooks, mockGH: mockGH, toGH: toGH, owner: owner, full_name: full_name};
}

var testNewRepo = new RepoMock(123, "newrepo", "acme", [], []);
var testExistingRepo = new RepoMock(456, "existingrepo","acme", ["README.md"], []);
var testCGRepo = new RepoMock(789, "cgrepo","acme", ["README.md", "index.html"], []);
const renamedRepo = "existingrepo-bis";

var testPR = {
    repository: testExistingRepo.toGH(),
    number: 5,
    action: "opened",
    files: [{filename: "foo.bar"}],
    pull_request: {
        head: {
            sha: "fedcbafedcbafedcbafedcbafedcbafedcbafedc"
        },
        user: {
            login: testUser2.username
        },
        body: "+@" + testUser3.username
    }
};

var testPR2 = {
    repository: {
        id: 111,
        name: 'newrepo2',
        full_name: 'acme/newrepo2',
        owner: {
            login: 'acme'
        }
    },
    number: 5,
    action: "opened",
    files: [{filename: "foo.bar"}],
    pull_request: {
        head: {
            sha: "fedcbafedcbafedcbafedcbafedcbafedcbafedc"
        },
        user: {
            login: testUser2.username
        },
        body: "+@" + testUser3.username
    }
};

var testCGPR = {
    repository: testCGRepo.toGH(),
    number: 6,
    action: "opened",
    files: [{filename: "foo.bar"}],
    pull_request: {
        head: {
            sha: "fedcba1fedcba1fedcba1fedcba1fedcba1fedcb"
        },
        user: {
            login: testUser3.username
        },
        body: ""
    }
};

var testWGPR = {
    repository: testExistingRepo.toGH(),
    number: 7,
    action: "opened",
    files: [{filename: "foo.bar"}],
    pull_request: {
        head: {
            sha: "fedcba2fedcba2fedcba2fedcba2fedcba2fedcb"
        },
        user: {
            login: testUser3.username
        },
        body: null
    }
};

var testIPRFreePR = {
    repository: testExistingRepo.toGH(),
    number: 8,
  action: "opened",
  files: [{filename: "package.json", filename: "w3c.json"}],
    pull_request: {
        head: {
            sha: "fedcbafed3cbafedcbafedcbafedcbafedcbafedca"
        },
        user: {
            login: testUser3.username
        }
    }
};


var expectedFilesInCreatedRepo = ["LICENSE.md", "CONTRIBUTING.md", "README.md", "CODE_OF_CONDUCT.md", "index.html", "w3c.json"];
var expectedFilesInImportedRepo = ["LICENSE.md", "CONTRIBUTING.md", "README.md", "CODE_OF_CONDUCT.md", "w3c.json"];

nock('https://api.w3.org')
    .get('/groups')
    .query({embed:"true"})
    .reply(200, {page: 1, total:1, pages: 1, _embedded: {groups: [w3cGroup, w3cGroup2]}});

function emptyNock(cb) {
    return function(err) {
        expect(nock.pendingMocks()).to.be.empty();
        cb(err);
    }
}

function erroringroutes(httpmethod, routes, errorcode, cb) {
    var counter = 0;
    for (var i in routes) {
        httpmethod('/' + routes[i])
            .expect(401, function(err, res) {
                if (err) return cb("Unexpected response from route " + res.req.path + ": " + err);
                counter++
                if (counter === routes.length) {
                    cb();
                }
            });
    }
}

function login(agent, admin, cb) {

    nock('https://github.com')
    .post('/login/oauth/access_token', {
        grant_type:'authorization_code',
        redirect_uri: config.url + 'auth/github/callback',
        client_id: config.ghClientID,
        client_secret: config.ghClientSecret,
        code: 'abcd'
    })
    .reply(302, {location: config.url, access_token: "bcdef", scope: encodeURIComponent(ghScope), token_type: "bearer"});


    nock('https://api.github.com')
    .get('/user')
    .reply(200, {login:testUser.username, id: testUser.ghID, email: testUser.emails[0]});

    agent
        .get(`${admin ? "/admin" : ""}/auth/github`)
        .expect(302)
        .end(function(err, res) {
            if (err) return cb(err);
            agent.get(res.header.location)
                .expect(302, { location: config.url + 'auth/github/callback?code=' + githubCode})
                .end(function(err, res) {
                    agent.get('/auth/github/callback?code=' + githubCode)
                        .expect(302)
                        .expect('location', '/')
                        .expect('set-cookie', /ash-nazg=.*; Path=\//, cb)
;
                });
        });
}

function addgroup(agent, group, cb) {
    var wg = {
        name: group.name,
        w3cid: group.id.toString(10),
        groupType: group.type == "working group" ? "WG" : "CG",
        shortType: group.shortType,
        shortname: group.shortname
    };
    agent
        .post('/api/groups')
        .send(wg)
        .expect(200)
        .end(cb);

}

function mockUserAffiliation(user, groups, blessByAffiliation) {
    nock('https://api.w3.org')
        .get('/users/' + user.w3capi + '/participations')
        .query({embed:"true"})
        .reply(200, {page: 1, total:1, pages: 1, _embedded: {participations:
            groups.map(function(g) { return {individual: false,
                                             _links: {
                                                 organization: w3cApify(w3cAff, "affiliations"),
                                                 group: w3cApify(g)
                                             }};})
                                                            }});
    if (blessByAffiliation) {
        const group = blessByAffiliation.group;
        nock('https://api.w3.org')
            .get(`/groups/${group.shortType}/${group.shortname}/participations`)
            .query({embed:"true"})
            .reply(200, {page: 1, total:1, pages: 1, _embedded: {participations: [{individual: false, _links: {organization: w3cApify(w3cAff, "affiliations")}}] }});
        nock('https://api.w3.org')
            .get('/users/' + user.w3capi + '/affiliations')
            .reply(200, {page: 1, total:1, pages: 1, _links: {affiliations: [w3cApify(w3cAff, "affiliations")] }});

    }
}

function mockGHUser(user) {
    nock('https://api.github.com')
        .get('/users/' + user.username)
        .reply(200, {login:user.username, id: user.ghID, email: user.emails[0] || null});
}

function mockPRStatus(pr, status, description) {
    nock('https://api.github.com')
        .post('/repos/' + pr.repository.full_name + '/statuses/' + pr.pull_request.head.sha,
              {state: status,
               target_url: config.url + "pr/id/" + pr.repository.full_name + '/' + pr.number,
               description: description,
               context: "ipr"
              })
        .reply(200);
}

describe('Server starts and responds with no login', function () {
    var app, req, http, store;

    before(function (done) {
        http = server.run(config, transporter);
        app = server.app;
        req = request(app);

        // database clean-up
        store = new Store(config);
        /* Delete non-design documents in a database. */
        store.db.all(function(err, doc) {
            /* Loop through all documents. */
            var total = doc.length;
            for(var i = 0; i < doc.length; i++) {
                /* Don't delete design documents. */
                if(doc[i].id.indexOf("_design") == -1) {
                    store.db.remove(doc[i].id, doc[i].value.rev, function(err, doc) {
                        total--;
                        if (!total) done();
                    });
                } else {
                    total--;
                    if (!total) done();
                }
            }
        });
    });

    after(function (done) {
        expect(JSON.stringify(transport.sentMail.map(x => x.message.content), null, 2)).to.be.equal("[]");
        http.close(emptyNock(done));
    });

    it('responds to /', function testSlash(done) {
        req
            .get('/')
            .expect(200, done);
    });

    it('responds to /api/groups', function testApiGroups(done) {
        req
            .get('/api/groups')
            .expect(200, [], done);
    });

    it('responds to /api/w3c/groups', function testW3cApi(done) {
        req
            .get('/api/w3c/groups')
            .expect(200, [w3cGroup, w3cGroup2], done);
    });

    it('responds to login query correctly when not logged in', function testLoggedIn(done) {
        req
            .get('/api/logged-in')
            .expect(200, {ok: false, login: null, admin: false}, done);
    });

    it('responds with 401 to protected GET routes', function testProtectedRoutes(done) {
        var protectedGETs = ["api/users", "api/user/foo", "api/orgs"];
        erroringroutes(req.get, protectedGETs, 401, done);
    });

    it('responds with 401 to protected POST routes', function testProtectedPOSTRoutes(done) {
        var protectedPOSTs = ["api/groups", "api/create-repo", "api/import-repo"];
        erroringroutes(req.post, protectedPOSTs, 401, done);
    });
});

describe('Server manages requests from regular logged-in users', function () {
    var app, req, http, authAgent, store;

    before(function () {
        http = server.run(config, transporter);
        app = server.app;
        req = request(app);
        authAgent = request.agent(app);
        store = new Store(config);
    });

    after(function (done) {
        expect(JSON.stringify(transport.sentMail.map(x => x.message.content), null, 2)).to.be.equal("[]");
        async.parallel([
            http.close.bind(http),
            function(cb) {
                store.deleteUser(testUser.username, cb);
            },
            function(cb) {
                store.deleteGroup("" + w3cGroup.id, cb);
            }], emptyNock(done));
    });

    it('manages Github auth', function testAuthCB(done) {
        login(authAgent, false, done);
    });

    it('responds to login query correctly when logged in', function testLoggedIn(done) {
        authAgent
            .get('/api/logged-in')
            .expect(200, {ok: true, login: testUser.username, admin: false}, done);
    });


    it('responds to user query', function testUserData(done) {
        authAgent
            .get('/api/user/' + testUser.username)
            .expect(function(res) {
                res.body = { ghID: res.body.ghID,
                             emails: res.body.emails.map(function(x) { return x.value;}),
                             username: res.body.username};
            })
            .expect(200, testUser, done);
    });

    it('responds to user list', function testUserList(done) {
        authAgent
            .get('/api/users')
            .expect(function(res) {
                res.body = res.body.map(function(u) {
                    return { ghID: u.ghID,
                             emails: u.emails.map(function(x) { return x.value;}),
                             username: u.username};
                });
            })
            .expect(200, [testUser], done);
    });

    it('responds to org list', function testOrgList(done) {
        nock('https://api.github.com')
            .get('/user/orgs')
            .reply(200, [testOrg]);
        authAgent
            .get('/api/orgs')
            .expect(200, [testUser.username, testOrg.login], done);

    });

    it('responds to org repos list', function testOrgList(done) {
        nock('https://api.github.com')
            .get('/user/orgs')
            .reply(200, [testOrg]);
        nock('https://api.github.com')
            .get('/users/' + testUser.username + '/repos?per_page=100')
            .reply(200, []);
        nock('https://api.github.com')
            .get('/orgs/' + testOrg.login + '/repos?per_page=100')
            .reply(200, [testExistingRepo]);

        var repos = {};
        repos[testUser.username]=[];
        repos[testOrg.login]=[testExistingRepo.name];
        authAgent
            .get('/api/org-repos')
            .expect(200, repos, done);

    });

    it('allows to add a new group', function testAddGroup(done) {
        addgroup(authAgent, w3cGroup, function(err, res) {
            addgroup(authAgent, w3cGroup2, function(err, res) {
                req
                    .get('/api/groups')
                    .expect(function(res) {
                        res.body = res.body.map(g => ({
                            name: g.name,
                            id: "" + g.w3cid,
                            type: g.groupType === "WG" ? "working group": "error",
                            shortType: g.shortType,
                            shortname: g.shortname
                        })).sort((a,b) => a.w3cid-b.w3cid);
                    })
                    .expect(200, [w3cGroup2, w3cGroup], done);
            });
        });
    });

    it('responds with 403 to admin POST routes', function testAdminRoutes(done) {
        var protectedPOSTs = ["api/user/--ghtest/affiliate", "api/user/--ghtest/add", "api/repos/acme/existingrepo/edit"];
        erroringroutes(req.post, protectedPOSTs, 403, done);
    });

    it('responds with 403 to admin PUT routes', function testAdminPUTRoutes(done) {
        var protectedPUTs = ["api/user/--ghtest/admin", "api/user/--ghtest/blanket"];
        erroringroutes(req.put, protectedPUTs, 403, done);
    });


    it('responds to login query correctly when logged out', function testLoggedOut(done) {
     authAgent
            .get('/api/logout')
            .expect(200)
            .end(function(err, res) {
                if (err) return done(err);
                authAgent
                    .get('/api/logged-in')
                    .expect(200, {ok: false, login: null, admin: false}, done);
            });
    });
});

describe('Server manages requests from advanced privileged users in a set up repo', function () {
    var app, req, http, authAgent, store;

    before(function (done) {
        http = server.run(config, transporter);
        app = server.app;
        req = request(app);
        authAgent = request.agent(app);
        store = new Store(config);
        login(authAgent, true, function(err) {
            if (err) return done(err);
            addgroup(authAgent, w3cGroup, function(err, res) {
                addgroup(authAgent, w3cGroup3, done);
            });
        });
    });

    after(function (done) {
        expect(JSON.stringify(transport.sentMail.map(x => x.message.content), null, 2)).to.be.equal("[]");
        function cleanStore(task) {
            return curry(store[task].bind(store));
        }

        // clean testNewRepo
        testNewRepo = new RepoMock(123, "newrepo", "acme", [], []);

        async.parallel([
            http.close.bind(http),
            cleanStore("deleteUser")(testUser.username),
            cleanStore("deleteGroup")("" + w3cGroup.id),
            cleanStore("deleteGroup")("" + w3cGroup3.id),
            cleanStore("deleteRepo")(testNewRepo.full_name),
            cleanStore("deleteRepo")(`${testExistingRepo.owner}/${renamedRepo}`),
            cleanStore("deleteRepo")(testCGRepo.full_name),
            cleanStore("deleteToken")(testOrg.login),
            cleanStore("deletePR")(`${testExistingRepo.owner}/${renamedRepo}`, 5),
            cleanStore("deletePR")(testCGRepo.full_name, 6),
            cleanStore("deletePR")(`${testExistingRepo.owner}/${renamedRepo}`, 7),
            cleanStore("deletePR")(`${testExistingRepo.owner}/${renamedRepo}`, 8),
            cleanStore("deleteUser")(testUser2.username),
            cleanStore("deleteUser")(testUser3.username)
        ], emptyNock(done));

    });

    it('prevents from importing an existing GH repo if the user doesn’t have admin on the hosting org and there is no known secret for it', function testImportRepo(done) {
      testExistingRepo.mockGH(testUser.username, true);
      authAgent
          .post('/api/import-repo')
          .send({org:testOrg.login, repo: testExistingRepo.name, groups:["" + w3cGroup.id], includeW3cJson: true, includeReadme: true, includeCodeOfConduct: true, includeLicense: true, includeContributing: true})
          .expect(500, function(err, res) {
            if (err) return done(err);
            expect(res.body.error.message.match(/ first /));
            done();
          });
    });

    it('allows to create a new GH repo', function testCreateRepo(done) {
        testNewRepo.mockGH(testUser.username);
        authAgent
            .post('/api/create-repo')
            .send({org:testOrg.login, repo: testNewRepo.name, groups:["" + w3cGroup.id], includeW3cJson: true, includeReadme: true, includeCodeOfConduct: true, includeLicense: true, includeContributing: true, includeSpec: true})
            .expect(200, function(err, res) {
                if (err) return done(err);
                expect(testNewRepo.files).to.have.length(expectedFilesInCreatedRepo.length);
                expect(testNewRepo.hooks).to.have.length(1);
                done();
            });
    });

    it('allows to import an existing GH repo', function testImportRepo(done) {
        testExistingRepo.mockGH(testUser.username, true, true);
        authAgent
            .post('/api/import-repo')
            .send({org:testOrg.login, repo: testExistingRepo.name, groups:["" + w3cGroup.id], includeW3cJson: true, includeReadme: true, includeCodeOfConduct: true, includeLicense: true, includeContributing: true})
            .expect(200, function(err, res) {
                if (err) return done(err);
                expect(testExistingRepo.files).to.have.length(expectedFilesInImportedRepo.length);
                expect(testExistingRepo.hooks).to.have.length(1);
                done();
            });
    });

    it('allows to import an existing GH repo for CG', function testImportCGRepo(done) {
        testCGRepo.mockGH(testUser.username, true);
        authAgent
            .post('/api/import-repo')
            .send({org:testOrg.login, repo: testCGRepo.name, groups:["" + w3cGroup3.id], includeContributing: true, includeReadme: true, includeCodeOfConduct: true, includeLicense: true, includeW3cJson: true})
            .expect(200, done);
    });

    it('recognizes an admin user', function testAdmin(done) {
        store.makeUserAdmin(testUser.username, function() {
            authAgent
                .get('/api/logged-in')
                .expect(200, {ok: true, login: testUser.username, admin: true}, done);
        });
    });

    it('allows admins to add a new user', function testAddUser(done) {
        nock('https://api.github.com')
            .get('/users/' + testUser2.username)
            .reply(200, {login:testUser2.username, id: testUser2.ghID, email: testUser2.emails[0]});

        authAgent
            .post('/api/user/' + testUser2.username + '/add')
            .expect(200, done);
    });

    it('reacts to pull requests notifications from unknown repository', function testUnknownRepo(done) {
        mockPRStatus(testPR2, 'failure', /The repository manager doesn't know the following repository:.*/);

        req.post('/' + config.hookPath)
            .send(testPR2)
            .set('X-Github-Event', 'pull_request')
            .set('X-Hub-Signature-256', GH.signPayload("sha256", passwordGenerator(20), new Buffer(JSON.stringify(testPR2))))
            .expect(500, done);
    });

    it('reacts to pull requests notifications with the wrong signature', function testWrongSignature(done) {
        mockPRStatus(testPR, 'failure', /GitHub signature does not match known secret for .*/);

        req.post('/' + config.hookPath)
            .send(testPR)
            .set('X-Github-Event', 'pull_request')
            .set('X-Hub-Signature-256', GH.signPayload("sha256", Array(20).join("@"), new Buffer(JSON.stringify(testPR))))
            .expect(500, done);
    });

    it('reacts to pull requests notifications from GH users without a known W3C account', function testPullRequestNotif(done) {
        mockPRStatus(testPR, 'pending', /.*/);
        nock('https://api.github.com')
            .get('/repos/' + testExistingRepo.full_name + '/pulls/' + testPR.number + '/files')
        .reply(200, testPR.files);
        nock('https://api.github.com')
            .get('/repos/' + testExistingRepo.full_name + '/contents/w3c.json')
            .reply(200, {content: new Buffer(JSON.stringify({contacts:[testUser.username, testUser2.username]})).toString('base64'), encoding: "base64"});

        mockGHUser(testUser);
        mockGHUser(testUser2);
        mockGHUser(testUser3);
        nock('https://api.w3.org')
            .get('/users/connected/github/' + testUser2.ghID)
            .reply(404);
        nock('https://api.w3.org')
            .get('/users/connected/github/' + testUser3.ghID)
            .reply(404);

        mockPRStatus(testPR, 'failure', new RegExp(testPR.pull_request.user.login));

        req.post('/' + config.hookPath)
            .send(testPR)
            .set('X-Github-Event', 'pull_request')
            .set('X-Hub-Signature-256', GH.signPayload("sha256", passwordGenerator(20), new Buffer(JSON.stringify(testPR))))
            .expect(200, function(err, res) {
                if (err) return done(err);
                expect(transport.sentMail.length).to.be.equal(2);
                expect(transport.sentMail[0].data.to).to.be(testUser.emails[0]);
                expect(transport.sentMail[0].message.content).to.match(new RegExp(testPR.pull_request.user.login));
                expect(transport.sentMail[0].message.content).to.match(new RegExp(testPR.pull_request.body.slice(1)));
                expect(transport.sentMail[0].message.content).to.match(new RegExp("affiliation could not be determined"));
                transport.sentMail.shift();

                expect(transport.sentMail[0].data.to).to.be(testUser3.emails[0]);
                expect(transport.sentMail[0].message.content).to.contain(testPR.pull_request.body.slice(2));
                expect(transport.sentMail[0].message.content).to.contain("Royalty-Free Patent Policy");
                expect(transport.sentMail[0].message.content).to.contain("https://www.w3.org/users/myprofile/connectedaccounts");
                transport.sentMail.shift();

                done();
            });
    });

    it('approves pull requests from unknown GH users that only touch IPR-free files', function testIPRFreePullRequestNotif(done) {
        mockPRStatus(testIPRFreePR, 'pending', /.*/);
        nock('https://api.github.com')
            .get('/repos/' + testExistingRepo.full_name + '/pulls/' + testIPRFreePR.number + '/files')
        .reply(200, testIPRFreePR.files);
        mockPRStatus(testIPRFreePR, 'success', /.*/);

        req.post('/' + config.hookPath)
            .send(testIPRFreePR)
            .set('X-Github-Event', 'pull_request')
            .set('X-Hub-Signature-256', GH.signPayload("sha256", passwordGenerator(20), new Buffer(JSON.stringify(testIPRFreePR))))
            .expect(200, done);
    });


    it('allows admins to revalidate a PR without re-notifying of failures', function testRevalidateNoNotif(done) {
        mockPRStatus(testPR, 'pending', /.*/);
        nock('https://api.github.com')
            .get('/repos/' + testExistingRepo.full_name + '/pulls/' + testPR.number + '/files')
        .reply(200, testPR.files);
        nock('https://api.w3.org')
            .get('/users/connected/github/' + testUser2.ghID)
            .reply(404);
        nock('https://api.w3.org')
            .get('/users/connected/github/' + testUser3.ghID)
            .reply(404);
        mockPRStatus(testPR, 'failure', new RegExp(testPR.pull_request.user.login));
        authAgent
            .post('/api/pr/' + testExistingRepo.full_name + '/' + testPR.number + '/revalidate')
            .expect(200, function(err, res) {
                if (err) return done(err);
                expect(transport.sentMail.length).to.be.equal(0);
                done();
            });
    });

    it('revalidates pull requests with unknown contributors when their github account has been connected to their W3C account', function testRevalidateUnknownContributor(done) {
      mockPRStatus(testPR, 'pending', /.*/);
      nock('https://api.github.com')
            .get('/repos/' + testExistingRepo.full_name + '/pulls/' + testPR.number + '/files')
        .reply(200, testPR.files);
      nock('https://api.w3.org')
            .get('/users/connected/github/' + testUser2.ghID)
            .reply(404);

      // testUser3 updates their github account, which would trigger
      // a post to the webhook api/revalidate
      nock('https://api.w3.org')
            .get('/users/connected/github/' + testUser3.ghID)
            .reply(200, {_links: {self: {href: 'https://api.w3.org/users/' + testUser3_w3capi}}});
      nock('https://api.w3.org')
            .get('/groups/' + w3cGroup.id)
            .reply(200, {id: w3cGroup.id, type: w3cGroup.type, shortname: w3cGroup.shortname});
      testUser3.w3capi = testUser3_w3capi;
      mockUserAffiliation(testUser3, []);
      nock('https://api.w3.org')
        .get(`/groups/${w3cGroup.shortType}/${w3cGroup.shortname}/participations`)
        .query({embed:"true"})
        .reply(200, {page: 1, total:1, pages: 1, _embedded: {participations: [] }});
      // Still no affiliation for testUser3
      nock('https://api.w3.org')
        .get('/users/' + testUser3.w3capi + '/affiliations')
        .reply(200, {page: 1, total:1, pages: 1, _links: {affiliations: [] }});
      nock('https://api.w3.org')
        .get('/nplcs/' + testExistingRepo.id + '/' + testPR.number)
        .reply(404);

      mockPRStatus(testPR, 'failure', new RegExp("The following users were not in"));


      // Message received in Webhook on connected account event
      req.post('/api/revalidate')
        .send({event: "connected_account.created", account: {"service": "github", "nickname": testUser3.username}})
        .expect(200, done);
    });

    it('revalidates pull requests with contributors joining the group', function testRevalidateContributorJoin(done) {
      mockPRStatus(testPR, 'pending', /.*/);
      nock('https://api.github.com')
            .get('/repos/' + testExistingRepo.full_name + '/pulls/' + testPR.number + '/files')
            .reply(200, testPR.files);
      nock('https://api.w3.org')
            .get('/users/connected/github/' + testUser2.ghID)
            .reply(200, {_links: {self: {href: 'https://api.w3.org/users/' + testUser2.w3capi}}});
      nock('https://api.w3.org')
            .get('/groups/' + w3cGroup.id)
            .reply(200, {id: w3cGroup.id, type: w3cGroup.type, shortname: w3cGroup.shortname});
      mockUserAffiliation(testUser2, [w3cGroup]);
      nock('https://api.w3.org')
            .get('/groups/' + w3cGroup.id)
            .reply(200, {id: w3cGroup.id, type: "working group", shortname: w3cGroup.shortname});
      mockUserAffiliation(testUser3, [w3cGroup]);

      mockPRStatus(testPR, 'success', /.*/);

      // Message received in Webhook on new group participation event
      req.post('/api/revalidate')
        .send({event: "group.participant_joined",
               user: {
                 "connected-accounts": [{"service": "github", "nickname": testUser3.username}]
               },
               group: {"id": w3cGroup.id}})
        .expect(200, done);
    });

    it('allows admins to affiliate a user', function testAffiliateUser(done) {
        var groups = {};
        groups[w3cGroup.id] = true;
        testUser2.groups = groups;
        authAgent
            .post('/api/user/' + testUser2.username + '/affiliate')
            .send({
                      affiliationName: testUser2.affiliationName,
                      affiliation: testUser2.affiliation,
                      w3cid: testUser2.w3cid,
                      w3capi: testUser2.w3capi,
                      groups:groups
                  })
            .expect(200)
            .end(function(err, res) {
                if (err) return done(err);
                authAgent
                    .get('/api/user/' + testUser2.username)
                    .expect(function(res) {
                        res.body = { ghID: res.body.ghID,
                                   emails: res.body.emails.map(function(x) { return x.value;}),
                                   username:res.body.username,
                                     w3cid: res.body.w3cid,
                                     affiliation: res.body.affiliation,
                                     affiliationName: res.body.affiliationName,
                                     w3capi: res.body.w3capi,
                                     groups: res.body.groups
                                   };
                    })
                    .expect(200, testUser2, done);

            });
    });

    it('allows admins to update the association of a repo to a group', function testReassociateRepo(done) {
        authAgent
            .post('/api/repos/' + testNewRepo.full_name + '/edit')
            .send({groups:[w3cGroup2.id]})
            .expect(200)
            .end(function(err, res) {
                req.get('/api/repos')
                    .expect(200, function(err, res) {
                        expect(res.body.filter(g => g.fullName === 'acme/newrepo')[0].groups[0].w3cid).to.be("" + w3cGroup2.id);
                        done();
                    });
            });
    });

    it('allows logged-in users to revalidate a PR', function testRevalidate(done) {
        mockPRStatus(testPR, 'pending', /.*/);
        nock('https://api.github.com')
            .get('/repos/' + testExistingRepo.full_name + '/pulls/' + testPR.number + '/files')
        .reply(200, testPR.files);

        nock('https://api.w3.org')
            .get('/groups/' + w3cGroup.id)
            .reply(200, {id: w3cGroup.id, type: w3cGroup.type, shortname: w3cGroup.shortname});
        mockUserAffiliation(testUser2, [w3cGroup]);

        // we assume that testUser3 has in the meantime linked his Github account
        nock('https://api.w3.org')
            .get('/groups/' + w3cGroup.id)
            .reply(200, {id: w3cGroup.id, type: w3cGroup.type, shortname: w3cGroup.shortname});
        mockUserAffiliation(testUser3, [], {group: w3cGroup});
        mockPRStatus(testPR, 'success', /.*/);
        authAgent
            .post('/api/pr/' + testExistingRepo.full_name + '/' + testPR.number + '/revalidate')
            .expect(200, done);
    });

    it('reacts to forced push in pull requests', function testPullRequestNotif(done) {
        var forcedPR = Object.assign({}, testPR);
        forcedPR.action = "synchronize";
        forcedPR.pull_request.head.sha = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";
        mockPRStatus(forcedPR, 'pending', /.*/);
        nock('https://api.github.com')
        .get('/repos/' + testExistingRepo.full_name + '/pulls/' + forcedPR.number + '/files')
        .reply(200, forcedPR.files);
        nock('https://api.w3.org')
            .get('/groups/' + w3cGroup.id)
            .reply(200, {id: w3cGroup.id, type: w3cGroup.type, shortname: w3cGroup.shortname});
        mockUserAffiliation(testUser2, [w3cGroup]);
        nock('https://api.w3.org')
            .get('/groups/' + w3cGroup.id)
            .reply(200, {id: w3cGroup.id, type: w3cGroup.type, shortname: w3cGroup.shortname});
        mockUserAffiliation(testUser3, [], {group: w3cGroup});
        mockPRStatus(forcedPR, 'success', /.*/);

        req.post('/' + config.hookPath)
            .send(forcedPR)
            .set('X-Github-Event', 'pull_request')
            .set('X-Hub-Signature-256', GH.signPayload("sha256", passwordGenerator(20), new Buffer(JSON.stringify(forcedPR))))
            .expect(200, done);
    });

    it('rejects pull requests notifications from representatives of organizations in a CG', function testCGPullRequestNotif(done) {
        mockPRStatus(testCGPR, 'pending', /.*/);
        nock('https://api.github.com')
            .get('/repos/' + testCGRepo.full_name + '/pulls/' + testCGPR.number + '/files')
        .reply(200, testCGPR.files);
        nock('https://api.w3.org')
            .get('/groups/' + w3cGroup3.id)
            .reply(200, {id: w3cGroup3.id, type: w3cGroup3.type, shortname: w3cGroup3.shortname});
        mockUserAffiliation(testUser3, []);
        nock('https://api.github.com')
            .get('/repos/' + testCGRepo.full_name + '/contents/w3c.json')
            .reply(200, {content: new Buffer(JSON.stringify({contacts:[testUser.username]})).toString('base64'), encoding: "base64"});
        nock('https://api.github.com')
            .get('/users/' + testUser.username)
            .reply(200, {login:testUser.username, id: testUser.ghID, email: testUser.emails[0]});

        mockPRStatus(testCGPR, 'failure', new RegExp(testCGPR.pull_request.user.login));
        req.post('/' + config.hookPath)
            .send(testCGPR)
            .set('X-Github-Event', 'pull_request')
            .set('X-Hub-Signature-256', GH.signPayload("sha256", passwordGenerator(20), new Buffer(JSON.stringify(testCGPR))))
            .expect(200, function(err) {
                if (err) return done(err);
                expect(transport.sentMail.length).to.be.equal(1);
                expect(transport.sentMail[0].data.to).to.be(testUser.emails[0]);
                expect(transport.sentMail[0].message.content).to.match(new RegExp(testCGPR.pull_request.user.login));
                expect(transport.sentMail[0].message.content).to.match(new RegExp("not in the repository's group"));
                transport.sentMail.shift();
                done();
            });
    });

    it('accepts pull requests notifications from representatives of organizations in a WG', function testWGPullRequestNotif(done) {
        mockPRStatus(testWGPR, 'pending', /.*/);
        nock('https://api.github.com')
            .get('/repos/' + testExistingRepo.full_name + '/pulls/' + testWGPR.number + '/files')
        .reply(200, testWGPR.files);
        nock('https://api.w3.org')
            .get('/groups/' + w3cGroup.id)
            .reply(200, {id: w3cGroup.id, type: w3cGroup.type, shortname: w3cGroup.shortname});
        mockUserAffiliation(testUser3, [], {group: w3cGroup});

        mockPRStatus(testWGPR, 'success', /.*/);
        req.post('/' + config.hookPath)
            .send(testWGPR)
            .set('X-Github-Event', 'pull_request')
            .set('X-Hub-Signature-256', GH.signPayload("sha256", passwordGenerator(20), new Buffer(JSON.stringify(testWGPR))))
            .expect(200, done);

    });

    it('revalidate a PR with non-member licensing commitments', function testRevalidate(done) {
        mockPRStatus(testWGPR, 'pending', /.*/);
        nock('https://api.github.com')
            .get('/repos/' + testExistingRepo.full_name + '/pulls/' + testWGPR.number + '/files')
        .reply(200, testWGPR.files);
        nock('https://api.w3.org')
            .get('/groups/' + w3cGroup.id)
            .reply(200, {id: w3cGroup.id, type: w3cGroup.type, shortname: w3cGroup.shortname});
        mockUserAffiliation(testUser3, []);
        nock('https://api.w3.org')
            .get(`/groups/${w3cGroup.shortType}/${w3cGroup.shortname}/participations`)
            .query({embed:"true"})
            .reply(200, {page: 1, total:1, pages: 1, _embedded: {participations: [] }});
        nock('https://api.w3.org')
            .get('/users/' + testUser3.w3capi + '/affiliations')
            .reply(200, {page: 1, total:1, pages: 1, _links: {affiliations: [] }});
        nock('https://api.w3.org')
            .get('/nplcs/' + testExistingRepo.id + '/' + testWGPR.number)
            .reply(200, {
                "pull-request": testWGPR.number,
                "repository-id": testExistingRepo.id,
                "commitments": [
                  {
                      "notification_date": "2019-10-01T00:00:00+00:00",
                      "commitment_date": "2019-10-02T00:00:00+00:00",
                      "user": {
                          "connected-accounts": [
                              {
                                  "nickname": testUser3.username
                              }
                          ]
                        }
                    }
                ]});
        mockPRStatus(testWGPR, 'success', /.*/);
        authAgent
            .post('/api/pr/' + testExistingRepo.full_name + '/' + testWGPR.number + '/revalidate')
            .expect(200, function(err, res) {
                if (err) return done(err);
                expect((res.body.acceptable === "yes"));
                done();
            });
    });

    it('reacts to repository renames', function testRepoRename(done) {
        const body = {
            "action": "renamed",
            "changes": {
              "repository": {
                "name": {
                  "from": testExistingRepo.name
                }
              }
            },
            "repository": {
              "name": renamedRepo,
              "full_name": `${testExistingRepo.owner}/${renamedRepo}`,
              "owner": {
                "login": testExistingRepo.owner
              }
            }
        };
        req.post('/' + config.hookPath)
            .send(body)
            .set('X-Github-Event', 'repository')
            .expect(200, done); // PRs from the renamed repository are deleted in the `after` function which will fail if the renaming didn't work
    });
});

describe('Server manages requests from regular users', function () {
  var app, req, http, authAgent, store;

  before(function (done) {
      http = server.run(config, transporter);
      app = server.app;
      req = request(app);
      authAgent = request.agent(app);
      store = new Store(config);

      login(authAgent, false, function(err) {
          if (err) return done(err);
          addgroup(authAgent, w3cGroup, function(err, res) {
              addgroup(authAgent, w3cGroup3, done);
          });
      });
  });

  after(function (done) {
      expect(JSON.stringify(transport.sentMail.map(x => x.message.content), null, 2)).to.be.equal("[]");
      function cleanStore(task) {
          return curry(store[task].bind(store));
      }

      async.parallel([
          http.close.bind(http),
          cleanStore("deleteGroup")("" + w3cGroup.id),
          cleanStore("deleteGroup")("" + w3cGroup3.id)
      ], emptyNock(done));
  });


  it('Does not allows to create a new GH repo if the user has not granted write access', function testCreateRepo(done) {
      testNewRepo.mockGH(testUser.username, false, false, false);
      authAgent
          .post('/api/create-repo')
          .send({org:testOrg.login, repo: testNewRepo.name, groups:["" + w3cGroup.id], includeW3cJson: true, includeReadme: true, includeCodeOfConduct: true, includeLicense: true, includeContributing: true, includeSpec: true})
          .expect(500, function(err, res) {
              if (err) return done(err);
              expect(res.body.error.code).to.be.equal(403);
              done();
          });
  });
});
