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

// Test Data
var githubCode = 'abcd';
var testUser = {ghID: '111', emails: ["test@example.com"], username: "--ghtest"};
var testUser2 = {ghID: '112', emails: ["foobar@example.com"], username: "--foobar", w3cid: 123, affiliation: 456, affiliationName: "ACME Inc", w3capi: "aaaaa"};
var testUser3 = {ghID: '115', emails: ["barfoo@example.com"], username: "--barfoo", w3cid: 124, w3capi: "bbbbb"};
var w3cGroup = {id: 42, type: "working group", name: "Test Working Group"};
var w3cGroup2 = {id: 12, type: "working group", name: "Other Test Working Group"};
var w3cGroup3 = {id: 15, type: "community group", name: "Test Community Group"};
var testOrg = {login: "acme", id:12};
var w3cAff = {id: 456, name: "ACME Inc"};
var w3cApify = function(g, type) { return {href:'https://api.w3.org/' + (type ? type : 'groups') + '/' + g.id, title: g.name};};

function RepoMock(_name, _owner, _files, _hooks) {
    var name = _name;
    var owner = _owner;
    var full_name = owner + "/" + name;
    var files = _files;
    var hooks = _hooks;
    function addHook(h) { hooks.push(h);}
    function addFile(f) { if (files.indexOf(f) === -1) { files.push(f); return true} else { return false;}}
    function toGH() {
        return {
            name:name,
            full_name: full_name,
            owner: { login: owner},
            url: "https://api.github.com/repos/" + full_name,
            contents_url: "https://api.github.com/repos/" + full_name + "/contents/{+path}"
        };
    }
    function mockGH() {
        var contentRE = new RegExp('/repos/' + full_name + '/contents/.*');
        if (files.length === 0) {
            nock('https://api.github.com')
                .post('/orgs/' + owner + '/repos', {name: name})
                .reply(200, toGH());
        } else {
            nock('https://api.github.com')
                .get('/repos/' + full_name)
                .reply(200, toGH());
        }
        nock('https://api.github.com')
            .put(contentRE)
            .times(expectedFiles.length)
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
        nock('https://api.github.com')
            .post('/repos/' + full_name + '/hooks', {name:"web", "config":{url: config.hookURL, content_type:'json', secret: /.*/}, events:["pull_request","issue_comment"], active: true})
            .reply(201, function(uri, body) {
                addHook(body);
            });
    }

    return {name: name, files: files, hooks: hooks, mockGH: mockGH, toGH: toGH, owner: owner, full_name: full_name};
}

var testNewRepo = new RepoMock("newrepo", "acme", [], []);
var testExistingRepo = new RepoMock("existingrepo","acme", ["README.md", "index.html"], []);
var testCGRepo = new RepoMock("cgrepo","acme", ["README.md", "index.html"], []);

var testPR = {
    repository: testExistingRepo.toGH(),
    number: 5,
    action: "opened",
    pull_request: {
        head: {
            sha: "fedcba"
        },
        user: {
            login: testUser2.username
        },
        body: ""
    }
};

var testCGPR = {
    repository: testCGRepo.toGH(),
    number: 6,
    action: "opened",
    pull_request: {
        head: {
            sha: "fedcba1"
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
    pull_request: {
        head: {
            sha: "fedcba2"
        },
        user: {
            login: testUser3.username
        },
        body: ""
    }
};

var expectedFiles = ["LICENSE.md", "CONTRIBUTING.md", "README.md", "index.html", "w3c.json"];

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

function login(agent, cb) {

    nock('https://github.com')
    .post('/login/oauth/access_token', {
        grant_type:'authorization_code',
        redirect_uri: config.url + 'auth/github/callback',
        client_id: config.ghClientID,
        client_secret: config.ghClientSecret,
        code: 'abcd'
    })
    .reply(302, {location: config.url + '?access_token=bcdef&scope='+ encodeURIComponent(ghScope) + '&token_type=bearer'});

    nock('https://api.github.com')
    .get('/user')
    .reply(200, {login:testUser.username, id: testUser.ghID, email: testUser.emails[0]});

    agent
        .get('/auth/github')
        .expect(302)
        .end(function(err, res) {
            if (err) return cb(err);
            request(res.header.location).get(res.header.location)
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
    var wg = {name: group.name, w3cid: group.id, groupType: group.type == "working group" ? "WG" : "CG"};
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
        var gid = blessByAffiliation.groupid;
        nock('https://api.w3.org')
            .get('/groups/' + gid + '/participations')
            .reply(200, {page: 1, total:1, pages: 1, _links: {participations: [w3cApify(w3cAff, "affiliations")] }});
        nock('https://api.w3.org')
            .get('/users/' + user.w3capi + '/affiliations')
            .reply(200, {page: 1, total:1, pages: 1, _links: {affiliations: [w3cApify(w3cAff, "affiliations")] }});

    }
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
            .expect(200, {ok: false, admin: false}, done);
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
        login(authAgent, done);
    });

    it('responds to login query correctly when logged in', function testLoggedIn(done) {
        authAgent
            .get('/api/logged-in')
            .expect(200, {ok: true, admin: false}, done);
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
            .get('/users/' + testUser.username + '/repos')
            .reply(200, []);
        nock('https://api.github.com')
            .get('/orgs/' + testOrg.login + '/repos')
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
                        res.body = res.body.map(function(g) { return {name:g.name, id: "" + g.w3cid, type: g.groupType === "WG" ? "working group": "error"};}).sort((a,b) => a.w3cid-b.w3cid);
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
                    .expect(200, {ok: false, admin: false}, done);
            });
    });
});

describe('Server manages requests in a set up repo', function () {
    var app, req, http, authAgent, store;

    before(function (done) {
        http = server.run(config, transporter);
        app = server.app;
        req = request(app);
        authAgent = request.agent(app);
        store = new Store(config);
        login(authAgent, function(err) {
            if (err) return done(err);
            addgroup(authAgent, w3cGroup, function(err, res) {
                addgroup(authAgent, w3cGroup3, done);
            });
        });
    });

    after(function (done) {
        function cleanStore(task) {
            return curry(store[task].bind(store));
        }

        async.parallel([
            http.close.bind(http),
            cleanStore("deleteUser")(testUser.username),
            cleanStore("deleteGroup")("" + w3cGroup.id),
            cleanStore("deleteGroup")("" + w3cGroup3.id),
            cleanStore("deleteRepo")(testNewRepo.full_name),
            cleanStore("deleteRepo")(testExistingRepo.full_name),
            cleanStore("deleteRepo")(testCGRepo.full_name),
            cleanStore("deleteToken")(testOrg.login),
            cleanStore("deletePR")(testExistingRepo.full_name, 5),
            cleanStore("deletePR")(testCGRepo.full_name, 6),
            cleanStore("deletePR")(testExistingRepo.full_name, 7),
            cleanStore("deleteUser")(testUser2.username),
            cleanStore("deleteUser")(testUser3.username)
        ], emptyNock(done));
    });

    it('allows to create a new GH repo', function testCreateRepo(done) {
        testNewRepo.mockGH();
        authAgent
            .post('/api/create-repo')
            .send({org:testOrg.login, repo: testNewRepo.name, groups:["" + w3cGroup.id]})
            .expect(200, function(err, res) {
                if (err) return done(err);
                expect(testNewRepo.files).to.have.length(expectedFiles.length);
                expect(testNewRepo.hooks).to.have.length(1);
                done();
            });
    });

    it('allows to import an existing GH repo', function testImportRepo(done) {
        testExistingRepo.mockGH();
        authAgent
            .post('/api/import-repo')
            .send({org:testOrg.login, repo: testExistingRepo.name, groups:["" + w3cGroup.id]})
            .expect(200, function(err, res) {
                if (err) return done(err);
                expect(testExistingRepo.files).to.have.length(expectedFiles.length);
                expect(testExistingRepo.hooks).to.have.length(1);
                done();
            });
    });

    it('allows to import an existing GH repo for CG', function testImportCGRepo(done) {
        testCGRepo.mockGH();
        authAgent
            .post('/api/import-repo')
            .send({org:testOrg.login, repo: testCGRepo.name, groups:["" + w3cGroup3.id]})
            .expect(200, done);
    });

    it('reacts to pull requests notifications', function testPullRequestNotif(done) {
        mockPRStatus(testPR, 'pending', /.*/);
        nock('https://api.github.com')
            .get('/repos/' + testExistingRepo.full_name + '/contents/w3c.json')
            .reply(200, {content: new Buffer(JSON.stringify({contacts:[testUser.username, testUser2.username]})).toString('base64'), encoding: "base64"});
        nock('https://api.github.com')
            .get('/users/' + testUser.username)
            .reply(200, {login:testUser.username, id: testUser.ghID, email: testUser.emails[0]});
        nock('https://api.github.com')
            .get('/users/' + testUser2.username)
            .reply(200, {login:testUser2.username, id: testUser2.ghID, email: null});

        mockPRStatus(testPR, 'failure', new RegExp(testPR.pull_request.user.login));

        req.post('/' + config.hookPath)
            .send(testPR)
            .set('X-Github-Event', 'pull_request')
            .set('X-Hub-Signature', GH.signPayload("sha1", passwordGenerator(20), new Buffer(JSON.stringify(testPR))))
            .expect(200, function(err, res) {
                if (err) return done(err);
                expect(transport.sentMail.length).to.be.equal(1);
                expect(transport.sentMail[0].data.to).to.be(testUser.emails[0]);
                expect(transport.sentMail[0].message.content).to.match(new RegExp(testPR.pull_request.user.login));
                done();
            });
    });

    it('recognizes an admin user', function testAdmin(done) {
        store.makeUserAdmin(testUser.username, function() {
            authAgent
                .get('/api/logged-in')
                .expect(200, {ok: true, admin: true}, done);
        });
    });

    it('allows admins to add a new user', function testAddUser(done) {
        nock('https://api.github.com')
            .get('/users/' + testUser2.username)
            .reply(200, {login:testUser2.username, id: testUser2.ghID, email: testUser2.emails[0]});

        nock('https://api.github.com')
            .get('/users/' + testUser3.username)
            .reply(200, {login:testUser3.username, id: testUser3.ghID, email: testUser3.emails[0]});

        authAgent
            .post('/api/user/' + testUser2.username + '/add')
            .expect(200, function(err, res) {
                if (err) return done(err);
                authAgent
                    .post('/api/user/' + testUser3.username + '/add')
                    .expect(200, done);
            });
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
                    .expect(200, testUser2, function(err, res) {
                        if (err) return done(err);
                        authAgent
                            .post('/api/user/' + testUser3.username + '/affiliate')
                            .send({
                                affiliationName: testUser3.affiliationName,
                                affiliation: testUser3.affiliation,
                                w3cid: testUser3.w3cid,
                                w3capi: testUser3.w3capi,
                                groups:[]
                            })
                            .expect(200, done);
                    });

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

    it('allows admins to revalidate a PR', function testRevalidate(done) {
        mockPRStatus(testPR, 'pending', /.*/);
        mockUserAffiliation(testUser2, [w3cGroup]);
        mockPRStatus(testPR, 'success', /.*/);
        authAgent
            .get('/api/pr/' + testExistingRepo.full_name + '/' + testPR.number + '/revalidate')
            .expect(200, done);
    });

    it('reacts to forced push in pull requests', function testPullRequestNotif(done) {
        var forcedPR = Object.assign({}, testPR);
        forcedPR.action = "synchronize";
        forcedPR.pull_request.head.sha = "abcdef";
        mockPRStatus(forcedPR, 'pending', /.*/);
        mockUserAffiliation(testUser2, [w3cGroup]);
        mockPRStatus(forcedPR, 'success', /.*/);

        req.post('/' + config.hookPath)
            .send(forcedPR)
            .set('X-Github-Event', 'pull_request')
            .set('X-Hub-Signature', GH.signPayload("sha1", passwordGenerator(20), new Buffer(JSON.stringify(forcedPR))))
            .expect(200, done);
    });

    it('rejects pull requests notifications from representatives of organizations in a CG', function testCGPullRequestNotif(done) {
        mockPRStatus(testCGPR, 'pending', /.*/);
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
            .set('X-Hub-Signature', GH.signPayload("sha1", passwordGenerator(20), new Buffer(JSON.stringify(testCGPR))))
            .expect(200, done);
    });

    it('accepts pull requests notifications from representatives of organizations in a WG', function testWGPullRequestNotif(done) {
        mockPRStatus(testWGPR, 'pending', /.*/);
        mockUserAffiliation(testUser3, [], {groupid: w3cGroup.id});

        mockPRStatus(testWGPR, 'success', /.*/);
        req.post('/' + config.hookPath)
            .send(testWGPR)
            .set('X-Github-Event', 'pull_request')
            .set('X-Hub-Signature', GH.signPayload("sha1", passwordGenerator(20), new Buffer(JSON.stringify(testWGPR))))
            .expect(200, done);

    });
});

