
import React from "react";
import Spinner from "../../components/spinner.jsx";

require("isomorphic-fetch");
let utils = require("../../application/utils");

export default class PRViewer extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            status:     "loading"
        ,   pr:         null
        ,   owner:      null
        ,   shortName:  null
        ,   num:        null
        };
    }
    componentDidMount () {
        let owner = this.props.params.owner
        ,   shortName = this.props.params.shortName
        ,   num = this.props.params.num
        ;
        this.setState({ owner: owner, shortName: shortName, num: num });
        fetch("/api/pr/" + [owner, shortName, num].join("/"))
            .then(utils.jsonHandler)
            .then((data) => {
                this.setState({ pr: data, status: "ready" });
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
            content =   <p>ok...</p>;
            // XXX
            //  produce report, links to GH, ability to add user to system (which then enables adding
            //  user to group, etc)
        }
        return  <div className="primary-app">
                    <h2>Pull Request #{st.id}</h2>
                    {content}
                </div>
        ;
    }
}
