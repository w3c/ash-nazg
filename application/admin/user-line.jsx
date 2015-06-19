
import React from "react";

require("isomorphic-fetch");
let utils = require("../../application/utils");


export default class UserLine extends React.Component {
    constructor (props) {
        super(props);
        this.state = { admin: props.admin };
    }
    makeAdmin () {
        React.findDOMNode(this.refs.admin).disabled = true;
        fetch(
            "/api/user/" + this.props.username + "/admin"
        ,   {
                method:     "put"
            ,   headers:    { "Content-Type": "application/json" }
            ,   body:       "{}"
            }
        )
        .then(utils.jsonHandler)
        .then((data) => {
            if (data.ok) return this.setState({ admin: true });
            React.findDOMNode(this.refs.admin).disabled = false;
            // XXX need proper flash messages
            alert("Failure to set admin flag on user: " + data.error);
        })
        .catch(utils.catchHandler)
        ;
    }
    render () {
        let props = this.props
        ,   st = this.state
        ,   makeAdmin = <td></td>
        ,   tdStyle = { paddingRight: "20px" }
        ,   email
        ,   pic
        ;
        if (!st.admin) makeAdmin = <td style={tdStyle}><button onClick={this.makeAdmin.bind(this)} ref="admin">Make admin</button></td>;
        if (props.email) email = <a href={"mailto:" + props.email}>{props.email}</a>;
        if (props.pic) pic = <img src={props.pic} alt={props.displayName} width="46"/>;
        return  <tr className={st.admin ? "admin" : ""}>
                    <td>{pic}</td>
                    <td style={tdStyle}>{props.displayName}</td>
                    <td style={tdStyle}><a href={"https://github.com/" + props.username} target="_blank">{"@" + props.username}</a></td>
                    <td style={tdStyle}>{email}</td>
                    {makeAdmin}
                </tr>
        ;
    }
}
