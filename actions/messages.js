
import AshNazgDispatch from "../application/dispatcher";

module.exports = {
    error:  function (msg) {
        console.error(msg);
        AshNazgDispatch.dispatch({ type: "error", message: msg });
    }
,   success:    function (msg) {
        console.log(msg);
        AshNazgDispatch.dispatch({ type: "success", message: msg });
    }
,   dismiss:    function (id) {
        AshNazgDispatch.dispatch({ type: "dismiss", id: id });
    }
};
