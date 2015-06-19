
import React from "react";

export default class UserLine extends React.Component {
    render () {
        let props = this.props
        ,   makeAdmin = <td></td>
        ,   tdStyle = {paddingRight: "20px"}
        ,   email
        ,   pic
        ;
        if (!props.admin) makeAdmin = <td style={tdStyle}><button>Make admin</button></td>;
        if (props.email) email = <a href={"mailto:" + props.email}>{props.email}</a>;
        if (props.pic) pic = <img src={props.pic} alt={props.displayName} width="46"/>;
        console.log("user", props);
        return  <tr className={props.admin ? "admin" : ""}>
                    <td>{pic}</td>
                    <td style={tdStyle}>{props.displayName}</td>
                    <td style={tdStyle}>{"@" + props.username}</td>
                    <td style={tdStyle}>{email}</td>
                    {makeAdmin}
                </tr>
        ;
    }
}
