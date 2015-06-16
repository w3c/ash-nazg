
import React from "react";

export default class NavItem extends React.Component {
    render () {
        return <li>{this.props.children}</li>;
    }
}
