var request = require('supertest');
var nock = require('nock');
var config = require('./config-test.json');
var server = require('../server');
var Store = require('../store');

var githubCode = 'abcd';
var ghScope = "user:email,public_repo,write:repo_hook,read:org";

var testUser = {ghID: '111', emails: ["test@example.com"], username: "--ghtest"};

var githubAuth = nock('https://github.com')
    .defaultReplyHeaders({'Content-Type': 'application/json'})
    .get('/login/oauth/authorize?response_type=code'
         + '&redirect_uri=' + encodeURIComponent(config.url + 'auth/github/callback')
         + '&scope=' + encodeURIComponent(ghScope)
         + '&client_id=' + config.ghClientID)
    .reply(302, {location: config.url + 'auth/github/callback' + '?code=' + githubCode});


var githubToken = nock('https://github.com')
    .post('/login/oauth/access_token', {
        grant_type:'authorization_code',
        redirect_uri: config.url + 'auth/github/callback',
        client_id: config.ghClientID,
        client_secret: config.ghClientSecret,
        code: 'abcd'
    }).reply(302, {location: config.url + '?access_token=bcdef&scope='+ encodeURIComponent(ghScope) + '&token_type=bearer'});

var githubUser = nock('https://api.github.com')
    .get('/user')
    .reply(200, {login:testUser.username, id: testUser.ghID, email: testUser.emails[0]});

var githubUserEmail = nock('https://api.github.com')
    .get('/user/emails')
    .reply(200, [{email:testUser.emails[0], primary: true}]);

var w3cGroup = {id: 42, type: "working group", name: "Test Working Group"};

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

describe('Server starts and responds with no login', function () {
    var app, req, http;

    before(function () {
        http = server.run('./test/config-test.json');
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
        http = server.run('./test/config-test.json');
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
        authAgent
            .get('/auth/github')
            .expect(302)
            .end(function(err, res) {
                if (err) return done(err);

                request(res.header.location).get(res.header.location)
                    .expect(302, { location: config.url + 'auth/github/callback?code=' + githubCode})
                    .end(function(err, res) {
                        authAgent.get('/auth/github/callback?code=' + githubCode)
                            .expect(302)
                            .expect('location', '/')
                            .expect('set-cookie', /ash-nazg=.*; Path=\//, done)
;
                    });
            });
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

    it('allows to add a new group', function testAddGroup(done) {
        var wg = {name: "Test Working Group", w3cid: 42, groupType: "wg"};
        authAgent
            .post('/api/groups')
            .send(wg)
            .expect(200)
            .end(function(err, res) {
                req
                    .get('/api/groups')
                    .expect(function(res) {
                        res.body = res.body.map(function(g) { return {name:g.name, w3cid: g.w3cid, groupType: g.groupType};});
                    })
                    .expect(200, [wg], done);
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

