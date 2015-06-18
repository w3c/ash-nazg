
import React from "react";

export default class LoginWelcome extends React.Component {
    render () {
        let redir = document.location.href;
        return  <div className="primary-app">
                    <h2>Please login</h2>
                    <p>
                        This site is essentially an application built on top of GitHub. As such,
                        in order for it to work, you need to log into it using your GitHub
                        credentials.
                    </p>
                    <p>
                        Given that the actions we need to carry out are fairly extensive, the level
                        of permissions we require is relatively high. Worry not, we promise to
                        almost never use it for anything evil.
                    </p>
                    <p>
                        Go ahead and <a href={"/auth/github?back=" + redir}>log in using GitHub</a>.
                    </p>
                </div>
        ;
    }
}

