import React from "react";

import { Router, Route, Link } from "react-router";
import {browserHistory } from "react-router";
import ReactDOM from "react-dom";

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
import RepoList from "./application/repo-list.jsx";
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
    return { loggedIn: LoginStore.isLoggedIn(), admin: LoginStore.isAdmin(), importGranted: LoginStore.isImportGranted() };
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
        ,   repoNav
        ,   userNav
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
        if (st.importGranted) {
            repoNav = <div>
                <NavItem><Link to={`${pp}repo/new`}>New Repository</Link></NavItem>
                <NavItem><Link to={`${pp}repo/import`}>Import Repository</Link></NavItem>
                </div>
                ;
        }

        if (st.loggedIn) {
            userNav = <NavBox title="User">
                <NavItem><LogoutButton/></NavItem>
                </NavBox>
                ;
        } else {
            userNav = <NavBox title="User"><NavItem><Link to={`${pp}login`}>Login</Link></NavItem></NavBox>;
        }
        // when logged in show an actual menu and content
        const isRoutePublic = this.props.routes[this.props.routes.length - 1].public;
        if (st.loggedIn === true || isRoutePublic) {
            nav = <Col className="nav">
                    <NavBox title="Repositories">
                        <NavItem><Link to={`${pp}repos`}>List Repositories</Link></NavItem>
                        {repoNav}
                    </NavBox>
                    <NavBox title="Pull Requests">
                        <NavItem><Link to={`${pp}pr/open`}>Currently Open</Link></NavItem>
                        <NavItem><Link to={`${pp}pr/last-week`}>Active Last Week</Link></NavItem>
                    </NavBox>
                    {admin}
                    {userNav}
                </Col>;
            body = <Col>{ renderChildrenWithAdminProp(this.props.children, st.admin) || <Welcome/> }</Col>;
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

// Set the "isAdmin" property on children components
function renderChildrenWithAdminProp(children, admin) {
    return React.Children.map(children, child =>
                              React.cloneElement(child, {
                                  isAdmin: admin
                              })
                             );
}

ReactDOM.render(
    <Router history={browserHistory}>
        <Route path={pp} component={AshNazg} public="true">
            <Route path="login" component={LoginWelcome}/>
            <Route path="repo/:owner/:shortname/:mode" component={RepoManager}/>
            <Route path="repo/:mode" component={RepoManager}/>
            <Route path="repos" component={RepoList} public="true"/>
            <Route path="pr/id/:owner/:shortName/:num" component={PRViewer} public="true"/>
            <Route path="pr/open" component={PROpen} public="true"/>
            <Route path="pr/last-week" component={PRLastWeek} public="true"/>
            <Route path="admin/add-user" component={PickUser}/>
            <Route path="admin/users" component={AdminUsers}/>
            <Route path="admin/user/:username" component={EditUser}/>
            <Route path="admin/user/:username/add" component={AddUser}/>
            <Route path="admin/groups" component={AdminGroups}/>
        </Route>
    </Router>
,   document.getElementById("ashnazg")
);
