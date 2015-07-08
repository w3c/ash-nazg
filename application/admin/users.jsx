
import React from "react";
import Spinner from "../../components/spinner.jsx";
import UserLine from "./user-line.jsx";

require("isomorphic-fetch");
let utils = require("../utils")
,   pp = utils.pathPrefix()
;

export default class AdminUsers extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            status: "loading"
        ,   users:   null
        };
    }
    componentDidMount () {
        fetch(pp + "api/users", { credentials: "include" })
            .then(utils.jsonHandler)
            .then((data) => {
                this.setState({ users: data, status: "ready" });
            })
            .catch(utils.catchHandler)
        ;
    }
    
    render () {
        let st = this.state
        ,   content
        ;
        if (st.status === "loading") {
            content = <Spinner prefix={pp}/>;
        }
        else if (st.status === "ready") {
            content =   <table className="users-list">
                            <thead>
                                <tr>
                                    <th>Pic</th>
                                    <th>Name</th>
                                    <th>Login</th>
                                    <th>Groups</th>
                                    <th>Affiliation</th>
                                    <th>W3C ID</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            {
                                st.users.map((u) => {
                                    let email = u.emails.length ? u.emails[0].value : ""
                                    ,   pic = u.photos.length ? u.photos[0].value : ""
                                    ;
                                    return <UserLine key={u.username} {...u} email={email} pic={pic}/>;
                                })
                            }
                        </table>
            ;
        }
        return  <div className="primary-app">
                    <h2>Users</h2>
                    <p>
                        Use this interface to grant administrative privileges to users and set their
                        affiliations (both to groups and to members). Be careful, admins are
                        considered to be reliable people, they can break things.
                    </p>
                    <p>
                        The “blanket” status is granted to users who are thereby considered to be
                        authorised for all pull requests, without needing to be part of a given
                        group. This is typically restricted to W3C Staff.
                    </p>
                    {content}
                </div>
        ;
    }
}
