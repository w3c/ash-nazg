
import React from "react";

// a very simple spinner
export default class Spinner extends React.Component {
    render () {
        let size = 52
        ,   prefix = "/";
        if (this.props.size === "small") size /= 2;
        if (this.props.prefix) prefix = this.props.prefix;
        return <div className="spinner"><img src={`${prefix}img/spinner.svg`} width={size} height={size} alt="loading..."/></div>;
    }
}
