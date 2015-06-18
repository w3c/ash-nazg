
import AshNazgDispatch from "../application/dispatcher";

module.exports = {
    login:  function () {
        AshNazgDispatch.dispatch({ type: "login" });
    }
,   logout:  function () {
        AshNazgDispatch.dispatch({ type: "logout" });
    }
};
