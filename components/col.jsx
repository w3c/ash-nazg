
import React from "react";

// this is basically ungrid in a box
export default class Col extends React.Component {
    render () {
        return <div {...this.props} className={"col " + (this.props.className || "")}>{this.props.children}</div>;
    }
}
