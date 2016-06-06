
var Store = require("../store")
,   username = process.argv[2]
,   config   = process.argv[3] || "config.json"
,   die = function (msg) {
        console.error(msg);
        process.exit(1);
    }
;
if (!username) die("Usage: node tools/add-admin.js username [configfile]");
new Store(require("../" + config)).makeUserAdmin(username, function (err) {
    if (err) die("ERROR: " + err);
    console.log("Ok!");
});
