
import React from "react";

export default class Application extends React.Component {
    render () {
        return  <main>
                    <header><h1>{this.props.title}</h1></header>
                    <div className="app-body">{this.props.children}</div>
                    <footer>Questions or comments? Please let us know on the <a href="https://github.com/w3c/ash-nazg/">GitHub Repo for ash-nazg</a>.</footer>
                </main>
        ;
    }
}
