var expect = require('expect.js');
var request = require('supertest');
var nock = require('nock');
var config = require('./config-test.json');
var server = require('../server');
var Store = require('../store');

var githubCode = 'abcd';
var ghScope = "user:email,public_repo,write:repo_hook,read:org";

// Test Data
var testUser = {ghID: '111', emails: ["test@example.com"], username: "--ghtest"};
var w3cGroup = {id: 42, type: "working group", name: "Test Working Group"};
var testOrg = {login: "acme", id:12};

var expectedFiles = ["LICENSE.md", "CONTRIBUTING.md", "README.md", "index.html", "w3c.json"];

var githubOrg = nock('https://api.github.com')
    .get('/user/orgs')
    .reply(200, [testOrg]);

var githubMakeRepo = nock('https://api.github.com')
    .post('/orgs/acme/repos', {name: "newrepo"})
    .reply(200, {
        name:"newrepo",
        fullName: testOrg.login + "/newrepo",
        owner: { login: testOrg.login},
        url: "https://api.github.com/repos/acme/newrepo",
        contents_url: "https://api.github.com/repos/acme/newrepo/contents/{+path}"});

var githubRepoEmptyContent = nock('https://api.github.com')
    .get(/repos\/acme\/newrepo\/contents\/.*/)
    .reply(404, {message: "Not Found"});

var githubRepoNewFile = nock('https://api.github.com')
    .put(/repos\/acme\/newrepo\/contents\/.*/, {message: /.*/, content:/.*/})
    .times(expectedFiles.length)
    .reply(201, function(uri) {
        var filename = uri.split("/").slice(5).join("/");
        expectedFiles = expectedFiles.filter(function(x) { return x !== filename;});
        return {message: "OK"};
    });

var githubRepoHooks = nock('https://api.github.com')
    .get('/repos/acme/newrepo/hooks')
    .reply(200, []);

var githubRepoNewHook = nock('https://api.github.com')
    .post('/repos/acme/newrepo/hooks', {name:"web", "config":{url: config.hookURL, content_type:'json', secret: /.*/}, events:["pull_request","issue_comment"], active: true})
    .reply(201, {});


var w3c = nock('https://api.w3.org')
    .get('/groups')
    .query({embed:"true",apikey:'foobar'})
    .reply(200, {page: 1, total:1, pages: 1, _embedded: {groups: [w3cGroup]}});

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
    .get('/login/oauth/authorize?response_type=code'
         + '&redirect_uri=' + encodeURIComponent(config.url + 'auth/github/callback')
         + '&scope=' + encodeURIComponent(ghScope)
         + '&client_id=' + config.ghClientID)
    .reply(302, {location: config.url + 'auth/github/callback' + '?code=' + githubCode});

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

    nock('https://api.github.com')
    .get('/user/emails')
    .reply(200, [{email:testUser.emails[0], primary: true}]);

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

function addgroup(agent, cb) {
    var wg = {name: "Test Working Group", w3cid: 42, groupType: "WG"};
    agent
        .post('/api/groups')
        .send(wg)
        .expect(200)
        .end(cb);

}

describe('Server starts and responds with no login', function () {
    var app, req, http;

    before(function () {
        http = server.run(config);
        app = server.app;
        req = request(app);
    });

    after(function (done) {
        http.close(done);
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
            .expect(200, [w3cGroup], done);
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
        http = server.run(config);
        app = server.app;
        req = request(app);
        authAgent = request.agent(app);
        store = new Store(config);
    });

    after(function (done) {
        http.close(function() {
            store.deleteUser(testUser.username, function() {
                store.deleteGroup("" + w3cGroup.id, done);
            });
        });
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
        authAgent
            .get('/api/orgs')
            .expect(200, [testUser.username, testOrg.login], done);

    });

    it('allows to add a new group', function testAddGroup(done) {
        addgroup(authAgent, function(err, res) {
            req
                .get('/api/groups')
                .expect(function(res) {
                    res.body = res.body.map(function(g) { return {name:g.name, id: "" + g.w3cid, type: g.groupType === "WG" ? "working group": "error"};});
                })
                .expect(200, [w3cGroup], done);
        });
    });

    it('responds with 403 to admin POST routes', function testAdminRoutes(done) {
        var protectedPOSTs = ["api/user/--ghtest/affiliate", "api/user/--ghtest/add"];
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
        http = server.run(config);
        app = server.app;
        req = request(app);
        authAgent = request.agent(app);
        store = new Store(config);
        login(authAgent, function(err) {
            if (err) return done(err);
            addgroup(authAgent, done);
        });
    });

    after(function (done) {
        http.close(function() {
            store.deleteUser(testUser.username, function() {
                store.deleteGroup("" + w3cGroup.id, function() {
                    store.deleteRepo("acme/newrepo", function() {
                        store.deleteToken("acme", done);
                    });
                });
            });
        });
    });

    it('allows to create a new GH repo', function testCreateRepo(done) {
        authAgent
            .post('/api/create-repo')
            .send({org:testOrg.login, repo: "newrepo", groups:["" + w3cGroup.id]})
            .expect(200, function(err, res) {
                if (err) return done(err);
                expect(expectedFiles).to.be.empty();
                done();
            });
    });


});
