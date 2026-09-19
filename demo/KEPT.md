# The Works Portal viewer — kept here on purpose

This directory is the Keeping Works viewer Keemin asks for as "the graph dashboard for the nodes" / "click to
enter the Keeping Works": the town-centre map with THE WORKS PORTAL, then a node-edge graph of class-space with
three layouts (1 tree · 2 radial · 3 nested — the nested view draws the on-disk directory as dashed boxes) and the
lattice's edges, including where the Works reaches `logos/`.

Built by `jetto-works-portal` 2026-08-18/19 (world 4ccfcfd2; branch `jetto/works-portal-demo` @ f06b9a60). Deleted
from main at e383e992 (2026-09-01, the Think Tank commit) and lost twice afterwards. Restored 2026-09-19 at Keemin's
word ("save this such that we will never lose it again. put it in its own worktree in repo-clones") onto the branch
`wright/works-portal-demo`, checked out as the worktree `G:/Postmark/repo-clones/wright/works-portal-demo`.

    node demo/serve.mjs      →  http://localhost:4890

It reads THIS checkout's `WORLD/marks` on every request and writes nothing. To draw today's world, merge `main` into
this branch (`git merge origin/main`) — the eight demo files never conflict with anything on main. Never delete this
branch from the remote; never `git worktree remove` this path.
