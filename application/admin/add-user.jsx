
import React from "react";
import Spinner from "../../components/spinner.jsx";
import MessageActions from "../../actions/messages";

require("isomorphic-fetch");
let utils = require("../../application/utils");

export default class AddUser extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            status:         "loading"
        ,   user:           null
        ,   username:       null
        };
    }
    componentWillMount () {
        this.setState({ username: this.props.params.username });
    }
    componentDidMount () {
        // XXX here the goal is to check that the user is *not* in the system
        // it's *good* if we get not found
        fetch("/api/user/" + this.state.username)
            .then(utils.jsonHandler)
            .then((data) => {
                if (data) {
                    MessageActions.error("User is already in the system, can't add *again*.");
                    this.setState({ user: data, status: "user-exists" });
                }
                else {
                    this.setState({ status: "ready" });
                }
            })
            .catch(utils.catchHandler)
        ;
    }
    
    addUser () {
        // XXX add user here
        // POST name to the API
        //  server-side gets data from GH and uses that to populate the user in the DB
        //  then responds
        // when response received, switch to user-exists with success message
    }
    
    render () {
        let st = this.state
        ,   content
        ;
        if (st.status === "loading") {
            content = <Spinner/>;
        }
        else if (st.status === "user-exists") {
            content = <p>User {st.username} is known to the system.</p>;
        }
        else if (st.status === "ready") {
            content = <p><button onClick={this.addUser.bind(this)} ref="add">Add {st.username} to the system</button></p>;
        }
        return  <div className="primary-app">
                    <h2>Add user</h2>
                    {content}
                </div>
        ;
    }
}
