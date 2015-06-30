
var Store = require("../store")
,   username = process.argv[2]
,   die = function (msg) {
        console.error(msg);
        process.exit(1);
    }
;
if (!username) die("Usage: node tools/add-admin.js username");
new Store().makeUserAdmin(username, function (err) {
    if (err) die("ERROR: " + err);
    console.log("Ok!");
});
