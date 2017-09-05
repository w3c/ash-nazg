const fs = require("fs")
,     jn = require("path").join;

module.exports = function template (src, data) {
    return fs.readFileSync(jn(__dirname, "templates", src), "utf8")
        .replace(/\{\{(\w+)\}\}/g, function (_, k) {
            if (typeof data[k] === "undefined") {
                console.error("No template data for key=" + k + ", file=" + src);
                return "";
            }
            return data[k];
        });
}

