
import React from "react";

export default class NavBox extends React.Component {
    render () {
        return <nav className="nav-box">
                <div className="nav-box-header">{this.props.title}</div>
                <ul>
                    {this.props.children}
                </ul>
               </nav>;
    }
}
