# react-widget

The product search box that shops embed on their own pages. It ships as one small script, so React is
its only runtime dependency and it has no data-fetching library: adding one is not an option.

This checkout has no `node_modules`: CI installs the dependencies and runs `npm run build` and
`npm test`.
