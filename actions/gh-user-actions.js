
import AshNazgDispatch from "../application/dispatcher";

module.exports = {
    login:  function (username, password, save) {
        AshNazgDispatch.dispatch({
            type:       "gh-login"
        ,   username:   username
        ,   password:   password
        ,   save:       !!save
        });
    }
,   logout:  function () {
        AshNazgDispatch.dispatch({
            type:       "gh-logout"
        });
    }
};
