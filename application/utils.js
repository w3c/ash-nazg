
import React from "react";
import MessageActions from "../actions/messages";


module.exports = {
    jsonHandler:    (res) => { return res.json(); }
,   catchHandler:   (e) => {
        MessageActions.error(e);
    }
,   val:    (ref) => {
        let el = React.findDOMNode(ref)
        ,   value
        ;
        if (!el) return null;
        if (el.multiple) {
            value = [];
            for (var i = 0, n = el.selectedOptions.length; i < n; i++) {
                value.push(el.selectedOptions.item(i).value.trim());
            }
        }
        else value = el.value.trim();
        return value;
    }
};
