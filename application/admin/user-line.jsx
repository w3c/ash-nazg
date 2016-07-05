
import React from "react";
import { Link } from "react-router";
import MessageActions from "../../actions/messages";

require("isomorphic-fetch");
let utils = require("../../application/utils")
,   pp = utils.pathPrefix()
;


export default class UserLine extends React.Component {
    constructor (props) {
        super(props);
        this.state = { admin: props.admin, blanket: props.blanket };
    }
    makeAdmin () {
        this.refs.admin.disabled = true;
        fetch(
            pp + "api/user/" + this.props.username + "/admin"
        ,   {
                method:     "put"
            ,   headers:    { "Content-Type": "application/json" }
            ,   body:       "{}"
            ,   credentials: "include"
            }
        )
        .then(utils.jsonHandler)
        .then((data) => {
            if (data.ok) {
                MessageActions.success("User turned into admin.");
                return this.setState({ admin: true });
            }
            this.refs.admin.disabled = false;
            MessageActions.error("Failure to set admin flag on user: " + data.error);
        })
        .catch(utils.catchHandler)
        ;
    }
    makeBlanket () {
        this.refs.blanket.disabled = true;
        fetch(
            pp + "api/user/" + this.props.username + "/blanket"
        ,   {
                method:     "put"
            ,   headers:    { "Content-Type": "application/json" }
            ,   body:       "{}"
            ,   credentials: "include"
            }
        )
        .then(utils.jsonHandler)
        .then((data) => {
            if (data.ok) {
                MessageActions.success("User given blanket contribution rights.");
                return this.setState({ blanket: true });
            }
            this.refs.blanket.disabled = false;
            MessageActions.error("Failure to set blanket flag on user: " + data.error);
        })
        .catch(utils.catchHandler)
        ;
    }
    render () {
        let props = this.props
        ,   st = this.state
        ,   makeAdmin = ""
        ,   makeBlanket = ""
        ,   tdStyle = { paddingRight: "20px" }
        ,   name
        ,   pic
        ;
        if (!st.admin) makeAdmin = <button onClick={this.makeAdmin.bind(this)} ref="admin">Make admin</button>;
        if (!st.blanket) makeBlanket = <button onClick={this.makeBlanket.bind(this)} ref="blanket">Blanket</button>;
        if (props.email) name = <a href={"mailto:" + props.email}>{props.displayName}</a>;
        else name = props.displayName;
        if (props.pic) pic = <img src={props.pic} alt={props.displayName} width="46"/>;
        return  <tr className={st.admin ? "admin" : ""}>
                    <td>{pic}</td>
                    <td style={tdStyle}>{name}</td>
                    <td style={tdStyle}><a href={"https://github.com/" + props.username} target="_blank">{"@" + props.username}</a></td>
                    <td style={tdStyle}>{props.groups ? Object.keys(props.groups).join(", ") : "none"}</td>
                    <td style={tdStyle}>{props.affiliation || "none"}</td>
                    <td style={tdStyle}>{props.w3cid || "none"}</td>
                    <td>
                        {makeAdmin}
                        {" "}
                        {makeBlanket}
                        {" "}
                        <Link to={`${pp}admin/user/${props.username}`} className="button">Edit</Link>
                    </td>
                </tr>
        ;
    }
}
