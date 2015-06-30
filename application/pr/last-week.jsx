
import React from "react";
import Spinner from "../../components/spinner.jsx";
// import { Link } from "react-router";
// import MessageActions from "../../actions/messages";

require("isomorphic-fetch");
let utils = require("../../application/utils");

export default class PRLastWeek extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            status:     "loading"
        ,   prs:        null
        };
    }
    componentDidMount () {
        fetch("/api/pr/last-week")
            .then(utils.jsonHandler)
            .then((data) => {
                // XXX
                //  need to munge them so as to get the affiliation information
                //  basically get all unique users and request them all
                //  then we can sort by company and the such
                this.setState({ prs: data, status: "ready" });
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
            content =   <table className="users-list">
                            <tr>
                                <th>Ok?</th>
                                <th>PR</th>
                                <th>Good</th>
                                <th>Unknown</th>
                                <th>Outside</th>
                                <th>Actions</th>
                            </tr>
                        </table>
            ;
        }
        return  <div className="primary-app">
                    <h2>Open Pull Requests</h2>
                    {content}
                </div>
        ;
    }
}
