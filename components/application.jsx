
import React from "react";

export default class Application extends React.Component {
    render () {
        return  <main>
                    <header><h1>{this.props.title}</h1></header>
                    <div className="app-body">{this.props.children}</div>
                    <footer></footer>
                </main>
        ;
    }
}
