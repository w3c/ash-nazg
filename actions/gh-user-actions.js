
import AshNazgDispatch from "../application/dispatcher";

module.exports = {
    login:  function (username, password) {
        AshNazgDispatch.dispatch({
            type:       "gh-login"
        ,   username:   username
        ,   password:   password
        });
    }
,   logout:  function () {
        AshNazgDispatch.dispatch({
            type:       "gh-logout"
        });
    }
};
