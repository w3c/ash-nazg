
import React from "react";

module.exports = {
    jsonHandler:    (res) => { return res.json(); }
,   catchHandler:   (e) => {
        // XXX it would be good to signal an error so as to flash it here
        console.error(e);
        throw e;
    }
,   val:    (ref) => {
        return React.findDOMNode(ref).value.trim();
    }
};
