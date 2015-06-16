
import React from "react";

// this is basically ungrid in a box
export default class Row extends React.Component {
    render () {
        return <div className="row" {...this.props}>{this.props.children}</div>;
    }
}
