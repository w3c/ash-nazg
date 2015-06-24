
import React from "react";
// import Link from "react-router";

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
        ,   makeAdmin = ""
        ,   tdStyle = { paddingRight: "20px" }
        ,   name
        ,   pic
        ;
        if (!st.admin) makeAdmin = <button onClick={this.makeAdmin.bind(this)} ref="admin">Make admin</button>;
        if (props.email) name = <a href={"mailto:" + props.email}>{props.displayName}</a>;
        else name = props.displayName;
        if (props.pic) pic = <img src={props.pic} alt={props.displayName} width="46"/>;
        return  <tr className={st.admin ? "admin" : ""}>
                    <td>{pic}</td>
                    <td style={tdStyle}>{name}</td>
                    <td style={tdStyle}><a href={"https://github.com/" + props.username} target="_blank">{"@" + props.username}</a></td>
                    <td style={tdStyle}>{props.groups ? props.groups.join(", ") : "none"}</td>
                    <td style={tdStyle}>{props.affiliation || "none"}</td>
                    <td style={tdStyle}>{props.w3cid || "none"}</td>
                    <td>
                        {makeAdmin}
                        <a href={"/admin/user/" + props.username}>Edit</a>
                    </td>
                </tr>
        ;
        // XXX the <a> above should be:
        // <Link to={"/admin/user/" + props.username}>Edit</Link>
        // but this blows up without explanation
    }
}
