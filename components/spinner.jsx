
import React from "react";

// a very simple spinner
export default class Spinner extends React.Component {
    render () {
        var size = 52;
        if (this.props.size === "small") size /= 2;
        return <div className="spinner"><img src="/img/spinner.svg" width={size} height={size} alt="loading..."/></div>;
    }
}
