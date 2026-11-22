# Magik Auto Arrange

A frontend-only ComfyUI extension that lays out nodes using their connections.

## Install

Extract the archive into `ComfyUI/custom_nodes/`, so that `custom_nodes/Magik_Auto_Arrange/__init__.py` exists. Restart ComfyUI and reload the browser, using a hard refresh if necessary. No Python dependencies are required.

## Use

Right-click empty canvas for **Magik Auto Arrange: entire workflow** or **selected nodes**. Right-click a node for upstream/downstream arrangement or to lock/unlock its position. Where supported by your frontend, the group context menu includes arranging nodes in that group. Layout operates inside the currently open graph or subgraph.

Choose spacing and whether to compact small source helpers. Click **Preview** to temporarily move nodes; **Cancel** or Escape restores positions; **Apply** commits the positions. Settings are remembered in the browser. Locked nodes and nodes outside the chosen scope are obstacles. Lock status is saved as a node property in the workflow.

The layout condenses cycles, orders connected nodes into left-to-right layers, and uses repeated crossing-reduction passes. Nodes with many connections (samplers, hubs) carry more simulated weight and inertia, so their neighbours gather around them while they resist being displaced; primitive nodes (no inputs) and output nodes (no outputs) are free to move and snap close to their single source or target. Overlaps are avoided by shifting the lighter node. The **Anchor heavy nodes** option toggles the weighting. It does not change node connections or execute the workflow. Applying calls the graph's before/after change hooks for undo on compatible frontends.

## Current limitations

Grouping is not yet preserved automatically when arranging an entire workflow: group boxes do not move or resize. Arrange nodes within each group separately and check the result. The layout does not yet explicitly pack disconnected components or optimize every connection. Balanced mode retains more of the original vertical spacing; Full reorganize packs the layers more tightly. Preview temporarily moves actual nodes; cancel before editing the workflow or closing the browser. Some ComfyUI frontend versions may implement context menus differently; if entries are missing, report your frontend version.
