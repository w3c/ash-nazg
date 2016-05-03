var request = require('supertest');
var nock = require('nock');
var config = require('./config-test.json');
var w3cGroup = {};
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

var w3cGroup = {id: 1, type: "working group", name: "Test Working Group"};

var w3c = nock('https://api.w3.org')
    .get('/groups')
    .query({embed:"true",apikey:'foobar'})
    .reply(200, {page: 1, total:1, pages: 1, _embedded: {groups: [w3cGroup]}});


describe('Server starts and responds', function () {
    var app, req, http, authAgent, store;
/*    var recorder = record('ash-nazg');
    before(recorder.before);
    after(recorder.after);
*/
    before(function () {
        http = server.run('./test/config-test.json');
        app = server.app;
        req = request(app);
        authAgent = request.agent(app);
        store = new Store(config);
    });

    after(function (done) {
        http.close(function() {
            store.deleteUser(testUser.username, done);
        });
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


});

