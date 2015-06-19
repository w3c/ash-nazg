
import React from "react";

require("isomorphic-fetch");
let utils = require("../../application/utils");


export default class GroupLine extends React.Component {
    constructor (props) {
        super(props);
        this.state = { managed: props.managed };
    }
    makeManaged () {
        React.findDOMNode(this.refs.managed).disabled = true;
        var p = this.props;
        fetch(
            "/api/groups"
        ,   {
                method:     "post"
            ,   headers:    { "Content-Type": "application/json" }
            ,   body:   JSON.stringify({
                    w3cid:      p.w3cid
                ,   name:       p.name
                ,   groupType:  p.groupType
                })
            }
        )
        .then(utils.jsonHandler)
        .then((data) => {
            if (data.ok) return this.setState({ managed: true });
            React.findDOMNode(this.refs.managed).disabled = false;
            // XXX need proper flash messages
            alert("Failure to add group to those managed: " + data.error);
        })
        .catch(utils.catchHandler)
        ;
    }
    render () {
        let props = this.props
        ,   st = this.state
        ,   makeManaged = <td></td>
        ,   tdStyle = { paddingRight: "20px" }
        ;
        if (!st.managed) makeManaged = <td style={tdStyle}><button onClick={this.makeManaged.bind(this)} ref="managed">Add</button></td>;
        return  <tr className={st.managed ? "managed" : ""}>
                    <td style={tdStyle}>{props.groupType}</td>
                    <td style={tdStyle}>{props.name}</td>
                    <td style={tdStyle}>{props.w3cid}</td>
                    {makeManaged}
                </tr>
        ;
    }
}
