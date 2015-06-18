
var Octokat = require("octokat");

function GH (user) {
    if (!user) throw new Error("The GH module requires a user.");
    this.user = user;
    this.octo = new Octokat({ token: user.accessToken });
}
GH.prototype = {
    userOrgs:   function (cb) {
        this.octo.me.orgs.fetch(function (err, data) {
            if (err) return cb(err);
            cb(null, [this.user.username].concat(data.map(function (org) { return org.login; })));
        }.bind(this));
    }
,   createRepo: function (data, cb) {
        // create the repo
        // add the files one by one (or batch if possible?)
        // add the hook back to us
    }
};

module.exports = GH;

