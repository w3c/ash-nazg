
import AshNazgDispatch from "../application/dispatcher";
import EventEmitter from "events";
import assign from "object-assign";

//  /!\  magically create a global fetch
require("isomorphic-fetch");

let utils = require("../application/utils")
,   _loggedIn = null
,   LoginStore = module.exports = assign({}, EventEmitter.prototype, {
        emitChange: function () { this.emit("change"); }
    ,   addChangeListener: function (cb) { this.on("change", cb); }
    ,   removeChangeListener: function (cb) { this.removeListener("change", cb); }

    ,   isLoggedIn: function () {
            return _loggedIn;
        }
    })
;

LoginStore.dispatchToken = AshNazgDispatch.register((action) => {
    switch (action.type) {
        case "login":
            fetch("/api/logged-in")
                .then(utils.jsonHandler)
                .then((data) => {
                    _loggedIn = data.ok;
                    LoginStore.emitChange();
                })
                .catch(utils.catchHandler);
            break;
        case "logout":
            fetch("/api/logout")
                .then(utils.jsonHandler)
                .then((data) => {
                    if (!data.ok) throw "Logout failed";
                    _loggedIn = false;
                    LoginStore.emitChange();
                })
                .catch(utils.catchHandler);
            break;
    }
});
