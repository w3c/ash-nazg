
import React from "react";
import Spinner from "../../components/spinner.jsx";

require("isomorphic-fetch");
let utils = require("../../application/utils");

export default class AdminGroups extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            status:     "loading"
        ,   groups:     null
        ,   ourGroups:  null
        };
    }
    componentDidMount () {
        var ourGroups;
        fetch("/api/groups")
            .then(utils.jsonHandler)
            .then((data) => { ourGroups = data; })
            .then(() => {
                return fetch("XXX") // XXX URL for W3C list of groupe
                        .then(utils.jsonHandler)
                        .then((data) => {
                            // XXX
                            // munge the data to be in a usable format
                            // remove groups that are already in ourGroups
                            this.setState({ ourGroups: ourGroups, groups: data, status: "ready" });
                        });
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
            // list all users, with different styles depending on whether they are already in the
            // system
            // and with an affordance to insert them
            // use a component to show each group. When it's included, it just changes style.
            content =   <table></table>
            ;
        }
        return  <div className="primary-app">
                    <h2>Groups</h2>
                    <p>
                        Use this interface to add W3C groups into the system such that they may be
                        managed for repositories and the such. Please don't add groups unless you 
                        need to as we'd like to keep various UI drop-downs within sane sizes.
                    </p>
                    {content}
                </div>
        ;
    }
}
