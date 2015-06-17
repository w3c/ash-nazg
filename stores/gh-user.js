
import AshNazgDispatch from "../application/dispatcher";
import EventEmitter from "events";
import assign from "object-assign";
import GHUserActions from "../actions/gh-user-actions";

let _user = null
,   GHUserStore = module.exports = assign({}, EventEmitter.prototype, {
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
function save () {
    localStorage.setItem("ghUserStore", JSON.stringify(_user));
}
GHUserStore.dispatchToken = AshNazgDispatch.register((action) => {
    switch (action.type) {
        case "gh-login":
            // XXX
            // we don't actually login immediately, it only shows up later
            // this might cause surprises later so maybe we should attempt a safe but protected
            // operation at this point just to validate the login
            _user = {
                username:   action.username
            ,   password:   action.password
            ,   save:       action.save
            };
            if (action.save) save();
            GHUserStore.emitChange();
            break;
        case "gh-logout":
            _user = null;
            save();
            GHUserStore.emitChange();
            break;
    }
});
if (localStorage.getItem("ghUserStore")) {
    let data = JSON.parse(localStorage.getItem("ghUserStore"));
    if (data) GHUserActions.login(data.username, data.password, data.save);
}
