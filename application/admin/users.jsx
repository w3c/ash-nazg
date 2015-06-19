
import React from "react";
import Spinner from "../../components/spinner.jsx";

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
        fetch("/api/users")
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
            content = <Spinner/>;
        }
        else if (st.status === "ready") {
            // XXX
            // list all users, with different styles depending on their power
            // and with an affordance to adminify non admins
            // use a component to show each user. When it's admined, it just changes style.
            content =   <table></table>
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
