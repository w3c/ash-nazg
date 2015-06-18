
import React from "react";

// a very simple spinner
export default class Spinner extends React.Component {
    render () {
        return <div className="spinner"><img src="/img/spinner.svg" width="52" height="52" alt="loading..."/></div>;
    }
}
