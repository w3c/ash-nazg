
import React from "react";

export default class Welcome extends React.Component {
    render () {
        return  <div className="primary-app">
                    <h2>Welcome!</h2>
                    <p>
                        Use this site to <a href="https://w3c.github.io/repo-management.html">manage IPR of contributions made to GitHub repositories for W3C specifications</a>
                        .
                    </p>
                </div>
        ;
    }
}

