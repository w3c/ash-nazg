
import React from "react";
import Spinner from "../../components/spinner.jsx";
import GroupLine from "./group-line.jsx";

require("isomorphic-fetch");
let utils = require("../../application/utils")
,   groupTypes = {
        "community group":      "CG"
    ,   "working group":        "WG"
    ,   "business group":       "BG"
    ,   "coordination group":   "CO"
    ,   "interest group":       "IG"
    }
,   ourGroupMap = {}
;

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
            .then((data) => {
                ourGroups = data;
                ourGroups.forEach((g) => { ourGroupMap[g.w3cid] = true; });
            })
            .then(() => {
                return fetch("https://api-test.w3.org/groups?items=500&embed=true")
                        .then(utils.jsonHandler)
                        .then((data) => {
                            data = data._embedded
                                        .groups
                                        .map((g) => {
                                            return {
                                                w3cid:      g.id
                                            ,   name:       g.name
                                            ,   groupType:  groupTypes[g.type] || "XX"
                                            ,   managed:    !!ourGroupMap[g.id]
                                            };
                                        })
                            ;
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
            content =   <table className="groups-list">
                            <thead>
                                <tr>
                                    <th>Type</th>
                                    <th>Name</th>
                                    <th>ID</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            {
                                st.groups.map((g) => {
                                    return <GroupLine key={g.w3cid} w3cid={g.w3cid} managed={g.managed} 
                                                    name={g.name} groupType={g.groupType}
                                                    />;
                                })
                            }
                        </table>
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
