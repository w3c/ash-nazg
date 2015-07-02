
import React from "react";
import Spinner from "../../components/spinner.jsx";
import MessageActions from "../../actions/messages";
import { Link } from "react-router";

require("isomorphic-fetch");
let utils = require("../../application/utils")
,   pp = utils.pathPrefix()
;

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
        fetch(pp + "api/user/" + this.state.username, { credentials: "include" })
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
        this.setState({ status: "loading" });
        fetch(
            pp + "api/user/" + this.state.username + "/add"
        ,   {
                method:     "post"
            ,   headers:    { "Content-Type": "application/json" }
            ,   body:       "{}"
            ,   credentials: "include"
            }
        )
        .then(utils.jsonHandler)
        .then((data) => {
            MessageActions.success("Successfully added user.");
            this.setState({ user: data, status: "user-exists" });
        })
        .catch((e) => {
            MessageActions.error("Failure to add user: " + e);
            this.setState({ status: "ready" });
            utils.catchHandler(e);
        })
        ;

    }
    
    render () {
        let st = this.state
        ,   content
        ;
        if (st.status === "loading") {
            content = <Spinner prefix={pp}/>;
        }
        else if (st.status === "user-exists") {
            content = <p>
                        User {st.username} is known to the system.
                        You can <Link to={`${pp}admin/user/${st.username}`}>edit that account</Link>.
                    </p>;
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
