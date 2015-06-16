
import React from "react";

import { Router, Route, Link } from "react-router";
import BrowserHistory from "react-router/lib/BrowserHistory";

import Application from "./components/application.jsx";
import Row from "./components/row.jsx";
import Col from "./components/col.jsx";
import NavBox from "./components/nav-box.jsx";
import NavItem from "./components/nav-item.jsx";

class Welcome extends React.Component {
    render () {
        return  <div className="primary-app">
                    <h2>Welcome!</h2>
                    <p>
                        Use this site to manage your usage of GitHub repositories for W3C
                        projects.
                    </p>
                </div>
        ;
    }
}

class AshNazg extends React.Component {
    render () {
        return <Application title="Repository Manager">
                  <Row>
                    <Col className="nav">
                      <NavBox title="Manage">
                        <NavItem><Link to="/repo/new">New Repository</Link></NavItem>
                        <NavItem><Link to="/repo/import">Import Repository</Link></NavItem>
                      </NavBox>
                    </Col>
                    <Col>{ this.props.children || <Welcome/> }</Col>
                  </Row>
                </Application>
        ;
    }
}

React.render(
    <Router history={BrowserHistory}>
        <Route path="/" component={AshNazg}></Route>
    </Router>
,   document.body
);
