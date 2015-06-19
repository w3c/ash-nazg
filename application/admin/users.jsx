
import React from "react";
import Spinner from "../../components/spinner.jsx";
import UserLine from "./user-line.jsx";

require("isomorphic-fetch");
let utils = require("../../application/utils");

export default class AdminUsers extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            status: "loading"
        ,   users:   null
        };
    }
    componentDidMount () {
        console.log("componentDidMount");
        fetch("/api/users")
            .then(utils.jsonHandler)
            .then((data) => {
                console.log("got list of users", data);
                this.setState({ users: data, status: "ready" });
            })
            .catch(utils.catchHandler)
        ;
    }
    
    render () {
        let st = this.state
        ,   content
        ;
        console.log("rendering in status", st.status);
        if (st.status === "loading") {
            content = <Spinner/>;
        }
        else if (st.status === "ready") {
            console.log("ready", st.users);
            content =   <table className="users-list">
                            <thead>
                                <tr>
                                    <th>Pic</th>
                                    <th>Name</th>
                                    <th>Login</th>
                                    <th>Email</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            {
                                st.users.map((u) => {
                                    let email = u.emails.length ? u.emails[0].value : ""
                                    ,   pic = u.photos.length ? u.photos[0].value : ""
                                    ;
                                    return <UserLine key={u.username} admin={u.admin} 
                                                    displayName={u.displayName} username={u.username}
                                                    email={email} pic={pic}
                                                    />;
                                })
                            }
                        </table>
            ;
        }
        return  <div className="primary-app">
                    <h2>Users</h2>
                    <p>
                        Use this interface to grant administrative privileges to users. Be careful,
                        admins are considered to be reliable people, they can break things.
                    </p>
                    {content}
                </div>
        ;
    }
}
