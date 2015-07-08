
import React from "react";
import { Link } from "react-router";

let utils = require("../../application/utils")
,   pp = utils.pathPrefix()
;

export default class PickUser extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            username:   null
        };
    }

    handleChange () {
        this.setState({ username: utils.val(this.refs.username) });
    }
    
    render () {
        let st = this.state
        ,   link = typeof st.username === "string" && st.username.length ?
                    <Link to={`${pp}admin/user/${st.username}/add`} className="button">Pick</Link>
                    :
                    null
        ;
        return <div className="primary-app">
                    <h2>Pick user name to add</h2>
                    <div className="formline">
                       <label for="username">user name</label>
                       <input type="text" value={st.username} ref="username" id="username" onChange={this.handleChange.bind(this)}/>
                       {link}
                   </div>
            </div>
        ;
    }
}
