
import React from "react";

import { Router, Route, Link } from "react-router";
import BrowserHistory from "react-router/lib/BrowserHistory";

import Application from "./components/application.jsx";
import Row from "./components/row.jsx";
import Col from "./components/col.jsx";
import NavBox from "./components/nav-box.jsx";
import NavItem from "./components/nav-item.jsx";

import Welcome from "./application/welcome.jsx";
import RepoNew from "./application/repo/new.jsx";

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
        <Route path="/" component={AshNazg}>
            <Route path="repo/new" component={RepoNew}/>
        </Route>
    </Router>
,   document.body
);
