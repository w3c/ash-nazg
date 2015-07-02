
import AshNazgDispatch from "../application/dispatcher";
import EventEmitter from "events";
import assign from "object-assign";

//  /!\  magically create a global fetch
require("isomorphic-fetch");

let utils = require("../application/utils")
,   pp = utils.pathPrefix()
,   _loggedIn = null
,   _admin = false
,   LoginStore = module.exports = assign({}, EventEmitter.prototype, {
        emitChange: function () { this.emit("change"); }
    ,   addChangeListener: function (cb) { this.on("change", cb); }
    ,   removeChangeListener: function (cb) { this.removeListener("change", cb); }

    ,   isLoggedIn: function () {
            return _loggedIn;
        }
    ,   isAdmin: function () {
            return _admin;
        }
    })
;

LoginStore.dispatchToken = AshNazgDispatch.register((action) => {
    switch (action.type) {
        case "login":
            fetch(pp + "api/logged-in", { credentials: "include" })
                .then(utils.jsonHandler)
                .then((data) => {
                    console.log("login", data);
                    _loggedIn = data.ok;
                    _admin = data.admin;
                    LoginStore.emitChange();
                })
                .catch(utils.catchHandler);
            break;
        case "logout":
            fetch(pp + "api/logout", { credentials: "include" })
                .then(utils.jsonHandler)
                .then((data) => {
                    if (!data.ok) throw "Logout failed";
                    _loggedIn = false;
                    _admin = false;
                    LoginStore.emitChange();
                })
                .catch(utils.catchHandler);
            break;
    }
});
