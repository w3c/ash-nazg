
import AshNazgDispatch from "../application/dispatcher";
import EventEmitter from "events";
import assign from "object-assign";

let _user = null
,   GHUserStore = module.exports = assign({}, EventEmitter, {
        emitChange: function () { this.emit("change"); }
    ,   addChangeListener: function (cb) { this.on("change", cb); }
    ,   removeChangeListener: function (cb) { this.removeListener("change", cb); }

    ,   getUser: function () {
            return _user;
        }
    ,   isLoggedIn: function () {
            return !!_user;
        }
    }
);
GHUserStore.dispatchToken = AshNazgDispatch.register((action) => {
    switch (action.type) {
        case "gh-login":
            // XXX
            // carry out the login action (in the store?)
            GHUserStore.emitChange();
            break;
        case "gh-logout":
            _user = null;
            GHUserStore.emitChange();
            break;
    }
});
