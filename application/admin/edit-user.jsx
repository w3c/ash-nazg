
import React from "react";
import Spinner from "../../components/spinner.jsx";

require("isomorphic-fetch");
let utils = require("../../application/utils");

export default class EditUser extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            status:     "loading"
        ,   user:       null
        ,   groups:     null
        ,   username:   null
        ,   modified:   false
        };
    }
    componentWillMount () {
        this.setState({ username: this.props.params.username });
    }
    componentDidMount () {
        let user;
        fetch("/api/user/" + this.state.username)
            .then(utils.jsonHandler)
            .then((data) => {
                user = data;
                return fetch("/api/groups")
                        .then(utils.jsonHandler)
                        .then((data) => {
                            this.setState({ user: user, groups: data, status: "ready" });
                        })
                ;
            })
            .catch(utils.catchHandler)
        ;
    }
    
    removeGroup (w3cid) {
        var user = this.state.user;
        delete user.groups[w3cid];
        this.setState({ user: user, modified: true });
    }
    
    addGroup (w3cid) {
        var user = this.state.user;
        user.groups[w3cid] = true;
        this.setState({ user: user, modified: true });
    }
    
    saveUser () {
        // XXX
        //  get groups, w3cid, and affiliation
        //  send them to some specific endpoint
        //  use that to db.merge() on the user with that information
        //  make sure that nothing other than the expected fields is in the merge
        this.setState({ modified: false });
    }
    
    pickW3CID (ev) {
        // XXX
        //  replace button with spinner and cancel button
        //  cancel button just returns us to the previous state
        //  this really should be a component?
        //  get participants ALL groups that were listed
        //  produce intersection of them all
        //  offer the users in that intersection as options in a drop down
        //  try to find the right one by matching the name we know
        //  Ok button to set this
        //  we will want to set not just w3cid on the user but also w3capi
        //  when okayed, fetch the user's affiliation, write it as string
        //  keep the full member in memory
        //  on save, include the member object in what we save and put it in the DB
        //  this will help produce useful reports
    }
    
    render () {
        let st = this.state
        ,   u = st.user
        ,   content
        ;
        if (st.status === "loading") {
            content = <Spinner/>;
        }
        else if (st.status === "ready") {
            var groupTable =
                <table>
                    {
                        st.groups.map((g) => {
                            return <tr key={g.w3cid}>
                                    <td>{g.name}</td>
                                    <td>
                                        { u.groups[g.w3cid] ? <button onClick={function () { this.removeGroup(g.w3cid); }.bind(this)}>Remove</button>
                                                            : <button onClick={function () { this.addGroup(g.w3cid); }.bind(this)}>Add</button> }
                                    </td>
                                </tr>;
                        })
                    }
                </table>
            ;
            content =
                <table className="users-list">
                    <tr>
                        <th>Name</th>
                        <td>{u.displayName}{ u.admin ? " [admin]" : ""}</td>
                    </tr>
                    <tr>
                        <th>Login</th>
                        <td>{st.username}</td>
                    </tr>
                    <tr>
                        <th>Groups</th>
                        <td>{groupTable}</td>
                    </tr>
                    <tr>
                        <th>W3C ID</th>
                        <td>
                            {
                                u.w3cid ?
                                    u.w3cid :
                                    <button onClick={this.pickW3CID.bind(this)}>Set</button>
                            }
                        </td>
                    </tr>
                    {
                        u.affiliation ? 
                                <tr>
                                    <th>Affiliation</th>
                                    <td>{u.affiliation}</td>
                                </tr>
                                :
                                ""
                    }
                </table>
            ;
            // XXX
            //  show W3C ID or offer to find it
            //  if we have an affi
        }
        return  <div className="primary-app">
                    <h2>Edit user</h2>
                    <p>
                        Use this interface to set a the group and company affiliation for a user.
                        The process is a little baroque due to the nature of the APIs queried for
                        this purpose: a user needs to be associated with (at least) one group in
                        order for her W3C ID to be discoverable, and through that the matching
                        affiliation.
                    </p>
                    {content}
                    <div className="formline actions">
                        <button onClick={this.saveUser.bind(this)} disabled={!st.modified}>Save</button>
                    </div>
                </div>
        ;
    }
}
