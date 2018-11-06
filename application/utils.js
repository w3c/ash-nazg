
import React from "react";
import MessageActions from "../actions/messages";

let pathPrefix;

module.exports = {
    jsonHandler:    (res) => { return res.json(); }
,   catchHandler:   (e) => {
        MessageActions.error(e);
    }
,   pathPrefix: () => {
        if (!pathPrefix)
            pathPrefix = PREFIX;
        return pathPrefix;
    }
,   val:    (ref) => {
        let el = ref
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
,   andify: (list, conjunction = "and") => {
    if (list.length === 1) return list[0];
    return list.slice(0, -1).join(", ") + " " + conjunction + " " + list.slice(-1);
    }
};
