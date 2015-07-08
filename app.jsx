
// this adds some missing ES6 bits, notably Promises
// require("babel/polyfill");

import React from "react";

import { Router, Route, Link } from "react-router";
import BrowserHistory from "react-router/lib/BrowserHistory";

import Application from "./components/application.jsx";
import Row from "./components/row.jsx";
import Col from "./components/col.jsx";
import NavBox from "./components/nav-box.jsx";
import NavItem from "./components/nav-item.jsx";
import Spinner from "./components/spinner.jsx";
import FlashList from "./components/flash-list.jsx";

import UserActions from "./actions/user";
import LoginStore from "./stores/login";

import MessageActions from "./actions/messages";
import MessageStore from "./stores/message";

import Welcome from "./application/welcome.jsx";
import LoginWelcome from "./application/login.jsx";
import LogoutButton from "./application/logout-button.jsx";
import RepoManager from "./application/repo-manager.jsx";
import AdminUsers from "./application/admin/users.jsx";
import AdminGroups from "./application/admin/groups.jsx";
import EditUser from "./application/admin/edit-user.jsx";
import PickUser from "./application/admin/pick-user.jsx";
import AddUser from "./application/admin/add-user.jsx";
import PRViewer from "./application/pr/viewer.jsx";
import PROpen from "./application/pr/open.jsx";
import PRLastWeek from "./application/pr/last-week.jsx";

let utils = require("./application/utils")
,   pp = utils.pathPrefix()
;

function getState () {
    return { loggedIn: LoginStore.isLoggedIn(), admin: LoginStore.isAdmin() };
}

class AshNazg extends React.Component {
    constructor (props) {
        super(props);
        this.state = getState();
    }
    componentDidMount () {
        LoginStore.addChangeListener(this._onChange.bind(this));
        UserActions.login();
    }
    componentWillUnmount () {
        LoginStore.removeChangeListener(this._onChange.bind(this));
    }
    _onChange () {
        this.setState(getState());
    }

    render () {
        let st = this.state
        ,   nav
        ,   body
        ,   admin
        ;
        // show admin links as well
        if (st.admin) {
            admin = <NavBox title="Admin">
                        <NavItem><Link to={`${pp}admin/users`}>Users</Link></NavItem>
                        <NavItem><Link to={`${pp}admin/add-user`}>Add User</Link></NavItem>
                        <NavItem><Link to={`${pp}admin/groups`}>Groups</Link></NavItem>
                    </NavBox>
            ;
        }
        // when logged in show an actual menu and content
        if (st.loggedIn === true) {
            nav = <Col className="nav">
                    <NavBox title="Manage">
                        <NavItem><Link to={`${pp}repo/new`}>New Repository</Link></NavItem>
                        <NavItem><Link to={`${pp}repo/import`}>Import Repository</Link></NavItem>
                    </NavBox>
                    <NavBox title="Pull Requests">
                        <NavItem><Link to={`${pp}pr/open`}>Currently Open</Link></NavItem>
                        <NavItem><Link to={`${pp}pr/last-week`}>Active Last Week</Link></NavItem>
                    </NavBox>
                    {admin}
                    <NavBox title="User">
                        <NavItem><LogoutButton/></NavItem>
                    </NavBox>
                </Col>;
            body = <Col>{ this.props.children || <Welcome/> }</Col>;
        }
        // when logged out off to log in
        else if (st.loggedIn === false) {
            nav = <Col className="nav"><NavBox title="Login"/></Col>;
            body = <Col><LoginWelcome/></Col>;
        }
        // while we don't know if we're logged in or out, spinner
        else {
            body = <Col><Spinner prefix={pp}/></Col>;
        }
        return <Application title="Repository Manager">
                  <FlashList store={MessageStore} actions={MessageActions}/>
                  <Row>
                    {nav}
                    {body}
                  </Row>
                </Application>
        ;
    }
}

React.render(
    <Router history={new BrowserHistory}>
        <Route path={pp} component={AshNazg}>
            <Route path="repo/:mode" component={RepoManager}/>
            <Route path="pr/id/:owner/:shortName/:num" component={PRViewer}/>
            <Route path="pr/open" component={PROpen}/>
            <Route path="pr/last-week" component={PRLastWeek}/>
            <Route path="admin/add-user" component={PickUser}/>
            <Route path="admin/users" component={AdminUsers}/>
            <Route path="admin/user/:username" component={EditUser}/>
            <Route path="admin/user/:username/add" component={AddUser}/>
            <Route path="admin/groups" component={AdminGroups}/>
        </Route>
    </Router>
,   document.body
);
