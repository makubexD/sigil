# launch

Create a project and manage its deployment environments.

    launch project create demo --template api --git
    launch env add staging --region eu --tier pro
    launch env list --format json
    launch env delete staging --yes

New here? Run `launch init` and it sets everything up for you.
