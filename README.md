
# Repository Manager (Ash-Nazg)

One interface to find all group contributors and in Intellectual Property Rights (IPR) bind them.

This tool was created to support contributions made to a group, under the form of pull requests, in
order to assess whether they are IPR-OK or not. It still has some rough edges but hopefully it can
be usable enough to get started, and perfected over time.

The tool is at currently in [my labs hatchery](https://labs.w3.org/hatchery/repo-manager/), but 
hopefully at some point some kind soul will place it at a more memorable URL.

When you get there, you will be asked to log in through GitHub. You can't do much without that, 
because most of the actions you can undertake through the tool (or that the tool can undertake on
your behalf when reacting to a GitHub event) require authorised access to GitHub. The permissions
it requires are rather broad; that is because it is difficult to be granular with GitHub 
permissions. The tool isn't doing anything unholy.

Once you log in your user will be created; if you need to be an admin just ask someone to give you
that flag from the "Edit User" page. *Note:* there are currently two distinct login flows. Some features
such as create and import repositories do not appear unless you sign in via the second link. 

If you need to deploy or to hack on this tool, you will want to read the
[Development Guide](https://github.com/w3c/ash-nazg/blob/master/DEVELOPMENT.md)

## Common Tool

### [New Repository](https://labs.w3.org/repo-manager/repo/new)

This is basically what people should use when they want to start a new specification with the WG/CG.
It gives you a choice of the organizations under which you are allowed to create a new repo
(including  your own user), and you can pick the name of the repo and the groups to which it 
belongs.

*Note*: the list of organizations depends on the user's GitHub organizations. If you are owner of an
organization and you don't see it in the list, you need to grant the repository manager access to that
organization. To do so, go in your
['Authorized OAuth Apps' settings`](https://github.com/settings/applications), click on 'W3C Repository
Manager' and grant access to the new organization.

Hitting "Create" can take a little while as the tool does all of the following, live:

* Creates the repo on GitHub
* Adds several files, notably the `LICENSE.md` and `CONTRIBUTE.md`, a `w3c.json` file which can be
  used by other tools, and an `index.html` that's a bare-bones ReSpec spec ready to be edited.
* Adds a hook to the repo such that pull requests and comments on them are sent to us, including one
  distinct cryptographic secret per repo.
* Saves all the relevant info on our side.

Most users should only ever have to use that. Once done they can go and play in their repo.

**Important**: [`w3cbot`](https://github.com/w3cbot) should be able to comment on the different pull
requests so you should consider adding @w3cbot as a member of the organization.

### [Import Repository](https://labs.w3.org/repo-manager/repo/import)

This is the same as "New" but for an existing repo. It will ***never*** overwrite something there so
it is the user's responsibility to check that the repo is okay once imported.

### Logout

This should be obvious. If it isn't, please don't use the application.

### How Pull Requests Get Handled

Whenever a pull request is made against a repo that is under the tool's management, we get notified. 
We use this information to assess if the PR is acceptable (i.e. has all its contributors in at least 
one of the groups that the repo belongs to).

Count as contributors not just the person making the pull request, but also anyone added either in 
the PR description or in any subsequent comment using "`+@username`" on a line on its own. If a 
contributor was added by mistake, she can be removed with "`-@username`" on a line on its own. This
includes the person making the PR. Thanks to that, you can issue a PR completely on behalf of 
someone else.

Every time a PR is created or has a comment with a username change, the status of the PR is changed. 
If it's acceptable it'll get changed to green with a note indicating that it's fine; if not it gets
changed to some ugly brown with a red cross (and a link that people can use to check the issue in 
more detail).


## Admin Tools

### Currently Open Pull Requests

This list all PRs that are now open, even old ones. It lists useful details such as which users are 
being problematic either because they are unknown (not in the system at all) or outside (known to 
the system but not in one of the right groups for that repo).

You can go to PR details by clicking "Details".

### PR Details

If the PR is not in an acceptable state, this will list problematic users with a link to fix them 
each. The fix can either be "Add to system" or "Edit" (details below).

The idea is that the vast majority of non-acceptable PRs in the first few weeks will come from 
people who are simply not known, but that relatively quickly it ought to become a less frequent 
occurrence.

If it so happens that all of the problematic users can be added to the system or to the right group, 
and that you have done so, then you can return to the PR details page and hit "Revalidate". We could 
revalidate every time a user is added or edited, but it's pretty costly so for the time being it is 
done this way. Revalidation will of course update both the local state and the PR's mergability 
indicator on GitHub.

### Add User to system

For users that are unknown to the system, they can be added by following on of those links and just
clicking that button. This is always an innocuous operation; it does not give the user any special 
rights nor can it make a PR OK (since the user needs to be in a group for that).

### Active Last Week PRs

This is a list of pull requests, in any state, that saw activity last week. They can be filtered 
according to the affiliation of the companies that made the contributions. This is essentially so 
that AC reps who have people in CGs who are only supposed to contribute to some specific work but 
not all of it can monitor what's been going on and avail themselves of their 45 days retraction 
window. Similar affordances are available as for the list of open PRs.

### Edit User

The interface to edit users is where the W3C data model and the GitHub data model get to meet. This 
alone is scary; I've tried to make it less scary.

A list of the groups known to the system is shown, the user can be added and removed from them 
there. If the user's affiliation is unset, once some groups have been added you can click "Set". 
This will load up a list that is the *intersection* of membership in the selected groups. The UI 
will also try to select the user with the name matching their GitHub profile (which may not always 
work, but often does). Hitting "OK" will associate the GH user with the W3C user, making it possible 
for us to use affiliation information. Don't forget to hit "Save".

This is a little convoluted but it's the best I could do with the current APIs from both GitHub and 
the W3C backend. Hopefully it can be simplified in the future.

### Admin > Users

This is a list of users. Things you can do there include making them admins and giving them blanket 
contribution rights. **USE EITHER WITH CARE**.

Admins should normally not be able to break the system, but they can enter all sorts of bogus 
information that would be really annoying. Only grant admin when you're sure; it's probably better 
to ask others first.

Blanket is a different type of superpower: users with blanket access are considered acceptable 
contributors to ALL repos, irrespective of their group memberships. This should normally be 
restricted to W3C team people.

### Admin > Groups

This is a list of all W3C groups. You will note that most have an "Add" button next to them: those 
are the ones that are in W3C but not in this system. Please do *not* start adding groups unless they 
explicitly want to be managed under this system. We only want people to create/import repos for 
groups that are actually using this system. Clicking "Add" makes that group one of those available 
for repos and users to belong to, adding too many will make those dialogs unwieldy.

Share & Enjoy!
