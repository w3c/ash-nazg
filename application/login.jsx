
import React from "react";

require("isomorphic-fetch");
let utils = require("./utils")
,   pp = utils.pathPrefix()
;


export default class LoginWelcome extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            login:      null
        };
    }

    componentWillMount () {
        let st = this.state;
        fetch(pp + "api/logged-in", { credentials: "include" })
            .then(utils.jsonHandler)
            .then((data) => {
                this.setState(Object.assign({}, st, {login: data.login}));
            })
            .catch(utils.catchHandler);
    }

    render () {
        let redir = document.location.href;
        return this.state.login ? <div className="primary-app"><h2>Logged in</h2><p>You are logged in as {this.state.login}.</p></div> :
            <div className="primary-app">
                    <h2>Please login</h2>
                    <p>
                        This site is essentially an application built on top of GitHub. As such,
                        in order for it to work, you need to log into it using your GitHub
                        credentials.
                    </p>
                    <p>
                        Pull requests contributors can <a href={`${pp}auth/github?back=${redir}`}>log in using GitHub</a>.
                    </p>
                    <p>
                        <em>Note</em>: People who wish to import repositories should use <a href={`${pp}admin/auth/github?back=${redir}`}>this link to log in</a> as we require more permissions.
                    </p>
                </div>
        ;
    }
}
